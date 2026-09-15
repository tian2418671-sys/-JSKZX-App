package com.sillytavern.cardmanager.android;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.Inflater;

/**
 * JSKZX App - 库文件系统桥接（SAF 目录树授权）
 *
 * 语义与桌面 Electron 一致:
 *   - 通过系统文件夹选择器授予"目录树"访问权限,并持久化授权 URI(仅此一棵目录树,无需全盘权限)
 *   - 渲染层以「库根相对路径」寻址(如 `幻想组/星野.png`),本插件负责 SAF 寻址与读写
 */
@CapacitorPlugin(name = "LibraryFsPlugin")
public class LibraryFsPlugin extends Plugin {

    private static final String PREFS = "library_store";
    private static final String KEY_ROOT_URI = "root_uri";
    private static final int REQ_PICK_ROOT = 41001;

    // 与桌面 main.js skipFolders 对齐的黑名单
    private static final Set<String> SKIP_FOLDERS = new LinkedHashSet<>(List.of(
            ".git", "node_modules", "windows", "program files", "program files (x86)",
            "appdata", "system volume information", "$recycle.bin", "programdata",
            "temp", "cache", "caches", "logs", "steamapps", "tencent files"));

    // region 工具

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private DocumentFile rootFile() {
        String s = prefs().getString(KEY_ROOT_URI, null);
        if (s == null) return null;
        return DocumentFile.fromTreeUri(getContext(), Uri.parse(s));
    }

    private void setRootUri(Uri uri) {
        prefs().edit().putString(KEY_ROOT_URI, uri.toString()).apply();
    }

    private static boolean allDigits(String s) {
        if (s == null || s.isEmpty()) return false;
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) return false;
        }
        return true;
    }

    /** PNG/JSON 安全写入（tmp 替换）残留的临时文件过滤:buildRelIndex / walkDir 跳过这些孤儿文件,
     *  防止扫描将其视为正常卡片/世界书 →「假卡多张」。
     *  模式:① .jszkx-tmp 后缀(_saveCardPng);② .tmp_+数字后缀(replaceCardImage);
     *        ③ <卡名>.png.<pid>.<tid>.tmp / .webp.<pid>.<tid>.tmp / .json.<pid>.<tid>.tmp(外部工具残留,实测 Blind Wife.png.26912.76.tmp 含 chara 被当卡)。 */
    private static boolean isTransientFile(String name) {
        if (name == null) return false;
        String lc = name.toLowerCase(Locale.ROOT);
        if (lc.endsWith(".jszkx-tmp")) return true;
        int tmpIdx = lc.lastIndexOf(".tmp_");
        if (tmpIdx > 0) {
            // .tmp_ 后面必须全是数字（时间戳），才算临时文件，避免误伤合法文件
            boolean allDigits = true;
            for (int i = tmpIdx + 5; i < lc.length(); i++) {
                if (!Character.isDigit(lc.charAt(i))) { allDigits = false; break; }
            }
            if (allDigits) return true;
        }
        // 模式③: 外部工具/中断的写入残留 <卡名>.<pid>.<tid>.tmp，如 Blind Wife.png.26912.76.tmp
        // 限制:卡扩展名(png/webp/json) + 数字.数字 + .tmp，避免误伤 v1.2.3.tmp 等合法文件
        if (lc.endsWith(".tmp")) {
            String core = lc.substring(0, lc.length() - 4); // 去掉 .tmp
            int lastDot = core.lastIndexOf('.');
            if (lastDot > 0) {
                String tidTail = core.substring(lastDot + 1);
                String pre = core.substring(0, lastDot);
                int preDot = pre.lastIndexOf('.');
                if (preDot > 0 && allDigits(tidTail) && allDigits(pre.substring(preDot + 1))) {
                    String head = pre.substring(0, preDot);
                    if (head.endsWith(".png") || head.endsWith(".webp") || head.endsWith(".json")) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ---------- F1: rescan 一次深度遍历建索引,此后路径解析 O(1) ----------
    // 千卡基线实测 read=344s(占83%)根因是每次路径解析逐 seg findFile 树查找;建表后 O(1) 命中
    private final java.util.Map<String, DocumentFile> relIndex = new java.util.concurrent.ConcurrentHashMap<>();
    private volatile boolean relIndexReady = false;
    /** buildRelIndex 一次遍历收集的文件/目录列表,供根扫描内存化输出(免二次 SAF 遍历) */
    private volatile java.util.List<Object[]> scanFilesList = new java.util.ArrayList<>();
    private volatile java.util.List<Object[]> scanDirsList = new java.util.ArrayList<>();

    private void buildRelIndex() {
        java.util.Map<String, DocumentFile> m = new java.util.HashMap<>();
        java.util.List<Object[]> fileList = new java.util.ArrayList<>(); // {rel, DocumentFile}
        java.util.List<Object[]> dirList = new java.util.ArrayList<>();
        DocumentFile root = rootFile();
        if (root == null) { relIndexReady = false; return; }
        java.util.ArrayDeque<DocumentFile> stack = new java.util.ArrayDeque<>();
        java.util.ArrayDeque<String> rels = new java.util.ArrayDeque<>();
        stack.push(root); rels.push("");
        while (!stack.isEmpty()) {
            DocumentFile dir = stack.pop();
            String dirRel = rels.pop();
            for (DocumentFile f : dir.listFiles()) {
                String name = f.getName();
                if (name == null) continue;
                if (f.isDirectory()) {
                    if (name.startsWith(".")) continue; // 对齐 SCAN skipHidden:跳过隐藏目录
                    String lower = name.toLowerCase(Locale.ROOT);
                    if (SKIP_FOLDERS.contains(lower)) continue; // 对齐 walkDir 黑名单
                    stack.push(f);
                    String rel = dirRel.isEmpty() ? name : dirRel + "/" + name;
                    rels.push(rel);
                    dirList.add(new Object[]{ rel, f });
                } else {
                    // 🐛 过滤 tmp 替换残留(.jszkx-tmp / .tmp_<时间戳>),避免残留被当卡片扫描入库
                    if (isTransientFile(name)) continue;
                    String rel = dirRel.isEmpty() ? name : dirRel + "/" + name;
                    m.put(rel, f);
                    fileList.add(new Object[]{ rel, f });
                }
            }
        }
        synchronized (relIndex) { relIndex.clear(); relIndex.putAll(m); }
        relIndexReady = true;
        scanFilesList = fileList;
        scanDirsList = dirList;
        android.util.Log.i("Perf", "relIndex built: " + m.size() + " files, " + dirList.size() + " dirs");
    }

    /** 根扫描快速路径:用 buildRelIndex 已收集的内存列表生成 scan 输出(不再二次 SAF 遍历) */
    private void buildScanOutputFromIndex(List<JSObject> files, Set<String> categories, List<Object[]> pendingMtime) {
        for (Object[] dr : scanDirsList) {
            String drel = (String) dr[0];
            DocumentFile df = (DocumentFile) dr[1];
            String name = drel.contains("/") ? drel.substring(drel.lastIndexOf('/') + 1) : drel;
            if (!drel.contains("/")) categories.add(name); // 一级目录=分组
            JSObject d = new JSObject();
            d.put("name", name);
            d.put("path", "/library/" + drel);
            d.put("isDirectory", true);
            d.put("mtime", queryLastModified(df)); // 目录数量少,即时查询
            files.add(d);
        }
        for (Object[] fr : scanFilesList) {
            String rel = (String) fr[0];
            DocumentFile cf = (DocumentFile) fr[1];
            String name = rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
            String subFolder = rel.contains("/") ? rel.substring(0, rel.lastIndexOf('/')) : "";
            JSObject o = new JSObject();
            o.put("name", name);
            o.put("path", "/library/" + rel);
            o.put("isDirectory", false);
            o.put("url", JSObject.NULL);
            o.put("mtime", 0); // 延后 fillMtimesParallel 并行补齐
            o.put("birthtime", 0);
            o.put("size", cf.length());
            o.put("subFolder", subFolder);
            o.put("category", subFolder.isEmpty() ? "未分类" : subFolder.split("/")[0]);
            o.put("embeddedData", JSObject.NULL);
            files.add(o);
            pendingMtime.add(new Object[]{ o, cf });
        }
    }

    /** O(1) 命中;未命中(导入新增)退化为一次慢查并回填 */
    private DocumentFile fileByRelPath(String rel) {
        String r = rel == null ? "" : rel.replace('\\', '/').replaceAll("^/+", "");
        if (relIndexReady) {
            if (r.isEmpty()) return rootFile();
            DocumentFile hit = relIndex.get(r);
            if (hit != null) return hit;
            DocumentFile slow = fileByRelPathSlow(r);
            if (slow != null) relIndex.put(r, slow);
            return slow;
        }
        return fileByRelPathSlow(r);
    }

    // 原 fileByRelPath 实现整体改名 fileByRelPathSlow,逻辑不动
    private DocumentFile fileByRelPathSlow(String rel) {
        DocumentFile root = rootFile();
        if (root == null || rel == null) return null;
        String relNorm = rel.replace('\\', '/').replaceAll("^/+", "");
        if (relNorm.isEmpty()) return root;
        String[] segs = relNorm.split("/");
        DocumentFile cur = root;
        for (String seg : segs) {
            if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
            DocumentFile next = cur.findFile(seg);
            if (next == null) return null;
            cur = next;
        }
        return cur;
    }

    private long queryLastModified(DocumentFile f) {
        try {
            final long[] out = {0};
            android.database.Cursor c = getContext().getContentResolver().query(
                    f.getUri(),
                    new String[]{DocumentsContract.Document.COLUMN_LAST_MODIFIED},
                    null, null, null);
            if (c != null) {
                try {
                    if (c.moveToFirst()) out[0] = c.getLong(0);
                } finally {
                    c.close();
                }
            }
            return out[0];
        } catch (Exception e) {
            return 0;
        }
    }

    private String readStream(Uri uri, boolean asBase64, int maxBytes) {
        try {
            InputStream in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            try {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                int total = 0;
                while ((n = in.read(buf)) != -1) {
                    total += n;
                    if (maxBytes > 0 && total > maxBytes) return null;
                    out.write(buf, 0, n);
                }
                byte[] data = out.toByteArray();
                return asBase64 ? Base64.encodeToString(data, Base64.NO_WRAP)
                        : new String(data, java.nio.charset.StandardCharsets.UTF_8);
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return null;
        }
    }

    private boolean writeStream(Uri uri, String content) {
        try {
            OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (out == null) return false;
            try {
                out.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                return true;
            } finally {
                out.close();
            }
        } catch (IOException e) {
            return false;
        }
    }

    // endregion

    // region 库目录授权

    /**
     * 弹出系统目录选择器,授予库根目录树访问权限,并持久化授权 URI
     */
    @PluginMethod()
    public void pickFolder(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        putInitialDownloadsUri(intent);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    /**
     * 目录选择器默认定位到「下载」目录。
     * 部分 ROM(尤其国产定制系统)的 SAF 根列表不显示 Download 或将其灰显导致无法选择,
     * 设置 EXTRA_INITIAL_URI 后选择器直接打开在 Download,点「使用此文件夹」即可选定。
     * 该 URI 仅为初始定位,用户仍可导航到任意其他目录。
     */
    private void putInitialDownloadsUri(Intent intent) {
        try {
            Uri initial = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                initial = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            } else {
                File dl = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (dl != null) initial = Uri.fromFile(dl);
            }
            if (initial != null) {
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initial);
            }
        } catch (Throwable t) {
            // 某些设备不支持初始目录,回退默认选择器
        }
    }

    /**
     * M4.5 弹出系统图片选择器(单选,返回 base64 + MIME 类型)。
     * 用于「换卡图」:选中新封面后,JS 侧把 base64 传给 replaceCardImage。
     */
    @PluginMethod()
    public void pickImage(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        startActivityForResult(call, intent, "pickImageResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void pickImageResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消选择");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未获取到图片");
            return;
        }
        String b64 = readStream(uri, true, 20 * 1024 * 1024);
        if (b64 == null) {
            call.reject("读取图片失败或文件过大(>20MB)");
            return;
        }
        String mime = getContext().getContentResolver().getType(uri);
        if (mime == null || mime.isEmpty()) mime = "image/png";
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("base64", b64);
        ret.put("mime", mime);
        call.resolve(ret);
    }

    /** pickFolder 回调;call 由 Capacitor 在 @ActivityCallback 返回后自动 resolve/reject */
    @com.getcapacitor.annotation.ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消选择");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未获取到目录");
            return;
        }
        // 持久化授权(重启后仍可访问)
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            // 部分文件管理器不返回可持久化授权,忽略即可(本次会话仍可用)
        }
        setRootUri(uri);
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    /** 是否已授权库目录 / 当前库根 URI / 是否曾授权过(权限可能已失效) */
    @PluginMethod()
    public void libraryInfo(PluginCall call) {
        String uriStr = prefs().getString(KEY_ROOT_URI, null);
        DocumentFile root = (uriStr != null) ? DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr)) : null;
        JSObject ret = new JSObject();
        ret.put("granted", root != null && root.exists());
        ret.put("hasUri", uriStr != null);
        ret.put("uri", uriStr);
        call.resolve(ret);
    }

    /**
     * M4 弹出目录选择器但不持久化为库根(用于推送目标选择等场景)。
     * 返回 {success, uri, title} 供后续 copyToFolder 使用。
     */
    @PluginMethod()
    public void pickPushFolder(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        putInitialDownloadsUri(intent);
        startActivityForResult(call, intent, "pickPushFolderResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void pickPushFolderResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消选择");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未获取到目录");
            return;
        }
        // 临时授权(不持久化,不覆盖库根)
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            // 忽略
        }
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), uri);
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", uri.toString());
        ret.put("title", root != null ? root.getName() : "");
        call.resolve(ret);
    }

    // endregion

    // region 扫描

    // 🚀 BUG-14: 全树扫描专用线程。Capacitor 的全部插件方法在同一桥线程("CapacitorPlugins")
    // 上串行排队;800 卡的一次 scan() 占线 5~8 秒(实测),期间用户点开任意卡片详情,
    // 其 readCharaBatch/readText/readThumb 只能干等(实测排队 5.5s)→「列表秒开但点详情极慢」。
    // 与 readThumbBatch 的 BATCH_ORCH 同模式:重活移交本线程,桥线程立即让出,详情读取不再排队。
    private static final java.util.concurrent.ExecutorService SCAN_EXEC =
            java.util.concurrent.Executors.newSingleThreadExecutor(r -> new Thread(r, "jsx-scan"));

    // 🚀 BUG-14: 批量读取编排线程(单线程,批内仍开 8 路并行 worker)——把「整批 join」从
    // 桥线程挪走;readTextBatch / readCharaBatch / getFileStats 共用,天然串行互不竞争 SAF。
    private static final java.util.concurrent.ExecutorService BATCH_EXEC =
            java.util.concurrent.Executors.newSingleThreadExecutor(r -> new Thread(r, "jsx-batch"));

    // 🚀 BUG-14 快速通道:单文件读取(详情页水合 readText([1])/readCharaBatch([1卡])/readBuffer)
    // 不走 BATCH_EXEC 队列——否则用户点开卡片会排在 reconcile 的几十批后台读之后(实测仍要等数秒)。
    // 2 线程足够(水合一次仅 1~2 个并发读),与批读并发由 SAF 侧自然调度。
    private static final java.util.concurrent.ExecutorService FAST_EXEC =
            java.util.concurrent.Executors.newFixedThreadPool(2, r -> new Thread(r, "jsx-fast"));

    /**
     * 递归扫描库目录树,返回与桌面 scanAndSaveFolder 结构一致的 files/categories
     */
    @PluginMethod()
    public void scan(final PluginCall call) {
        // 参数在桥线程读取后转入扫描线程(PluginCall 数据取出即用,跨线程只传不可变值)
        final String rel = call.getString("path", "");
        SCAN_EXEC.execute(() -> {
            try {
                scanOnWorker(call, rel);
            } catch (Exception e) {
                call.reject("扫描失败: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        });
    }

    /** scan 的实际实现,运行于 SCAN_EXEC 线程(relIndex 为 ConcurrentHashMap,relIndexReady/列表为 volatile) */
    private void scanOnWorker(final PluginCall call, final String rel) {
        DocumentFile root = rootFile();
        if (root == null || !root.exists()) {
            JSObject err = new JSObject();
            err.put("error", "尚未选择库目录,请先授权角色卡库文件夹");
            call.resolve(err);
            return;
        }
        // M4 支持子目录扫描(如 .bak_history 快照目录)
        // F1:先全树建索引供 readCharaBatch/readTextBatch O(1);walkDir 顺带填充用于子目录 miss 回填
        buildRelIndex(); // 内部已 clear + putAll + relIndexReady=true
        DocumentFile startDir = root;
        String prefix = "";
        if (rel != null && !rel.isEmpty()) {
            String norm = rel.replace('\\', '/').replaceAll("^/+", "").replaceAll("/+$", "");
            String[] segs = norm.split("/");
            DocumentFile cur = root;
            for (String seg : segs) {
                if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) {
                    JSObject err = new JSObject();
                    err.put("error", "无效路径");
                    call.resolve(err);
                    return;
                }
                cur = cur.findFile(seg);
                if (cur == null || !cur.isDirectory()) {
                    JSObject err = new JSObject();
                    err.put("error", "目录不存在");
                    call.resolve(err);
                    return;
                }
            }
            startDir = cur;
            prefix = norm + "/";
        }
        List<JSObject> files = new ArrayList<>();
        Set<String> categories = new LinkedHashSet<>();
        // 🚀 v1.10.4 加载提速:文件 mtime 延后并行查询(SAF 逐文件 query 是万卡库扫描最大耗时点)
        final List<Object[]> pendingMtime = new ArrayList<>(); // {JSObject, DocumentFile}
        // F1:索引已由 buildRelIndex() 一次全树遍历建立;根扫描用内存列表生成输出,免二次 SAF 遍历。
        // 子目录扫描(快照等)保留 walkDir 子树遍历(目录少,成本可忽略)。
        if (rel == null || rel.isEmpty()) {
            buildScanOutputFromIndex(files, categories, pendingMtime);
        } else {
            walkDir(startDir, prefix, false, files, categories, pendingMtime, relIndex);
        }
        relIndexReady = true;
        fillMtimesParallel(pendingMtime);
        // 分组 = 库根下所有一级文件夹(含空分组)。不做“幽灵分组过滤”:
        // 空分组(新建后尚未放卡片)也必须显示,否则新建分组在列表/分组管理里不可见,分组功能看似失效。
        JSObject ret = new JSObject();
        JSArray arr = new JSArray(files);
        ret.put("files", arr);
        ret.put("categories", new JSArray(new ArrayList<>(categories)));
        ret.put("folderPath", "/library");
        call.resolve(ret);
    }

    /**
     * 🚀 v1.10.4 并行补齐文件 mtime:SAF 的 lastModified 每次都是一次 ContentResolver query,
     * 千卡库串行查询要数秒;并行(8 线程)后降到几百毫秒。失败条目保持 0(排序兜底)。
     */
    private void fillMtimesParallel(List<Object[]> pending) {
        if (pending.isEmpty()) return;
        final int threads = Math.min(8, pending.size());
        final java.util.concurrent.atomic.AtomicInteger idx = new java.util.concurrent.atomic.AtomicInteger(0);
        Thread[] pool = new Thread[threads];
        for (int t = 0; t < threads; t++) {
            pool[t] = new Thread(() -> {
                while (true) {
                    int i = idx.getAndIncrement();
                    if (i >= pending.size()) return;
                    try {
                        Object[] pair = pending.get(i);
                        ((JSObject) pair[0]).put("mtime", queryLastModified((DocumentFile) pair[1]));
                    } catch (Exception e) { /* 单文件失败保持 0 */ }
                }
            }, "jsx-mtime-" + t);
            pool[t].start();
        }
        for (Thread t : pool) { try { t.join(); } catch (InterruptedException e) { /* 忽略 */ } }
    }

    /** 递归遍历目录,收集文件和文件夹信息 + 顺建路径→DocumentFile索引(一次遍历替代两次) */
    private void walkDir(DocumentFile dir, String relDir, boolean skipHidden, List<JSObject> files, Set<String> categories, List<Object[]> pendingMtime, java.util.Map<String, DocumentFile> indexMap) {
        for (DocumentFile child : dir.listFiles()) {
            if (child.isDirectory()) {
                String name = child.getName();
                if (name == null) continue;
                if (skipHidden && name.startsWith(".")) continue;
                String lower = name.toLowerCase(Locale.ROOT);
                if (skipHidden && SKIP_FOLDERS.contains(lower)) continue;
                if (relDir.isEmpty() || relDir.endsWith("/")) {
                    // 仅根层级记录分组
                }
                if (relDir.isEmpty()) categories.add(name);
                // 添加目录条目(供快照扫描等)
                JSObject d = new JSObject();
                d.put("name", name);
                d.put("path", "/library/" + relDir + name);
                d.put("isDirectory", true);
                d.put("mtime", queryLastModified(child)); // 目录数量少,即时查询
                files.add(d);
                walkDir(child, relDir + name + "/", skipHidden, files, categories, pendingMtime, indexMap);
            } else if (child.isFile()) {
                String name = child.getName();
                if (name == null) continue;
                String ext = name.contains(".")
                        ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                        : "";
                if (!ext.equals("png") && !ext.equals("webp") && !ext.equals("json")) continue;
                // 跳过应用自身缓存文件(避免被当成卡片/世界书扫描)
                if (name.startsWith(".jskzx")) continue;
                // 🐛 过滤 tmp 替换残留(.jszkx-tmp / .tmp_<时间戳>),与 buildRelIndex 保持一致
                if (isTransientFile(name)) continue;
                JSObject o = new JSObject();
                o.put("name", name);
                o.put("path", "/library/" + relDir + name);
                o.put("isDirectory", false);
                o.put("url", JSObject.NULL);
                o.put("mtime", 0); // 🚀 v1.10.4:延后到 fillMtimesParallel 并行补齐
                o.put("birthtime", 0);
                o.put("size", child.length()); // 文件字节数(排序用,对齐桌面 _size)
                o.put("subFolder", relDir.replaceAll("/+$", ""));
                o.put("category", relDir.isEmpty() ? "未分类" : relDir.split("/")[0]);
                // 🚀 v1.10.2 轻量化:scan 不再回填 embeddedData(300+ 卡时单次桥接响应可达数十 MB
                //    → WebView OOM 闪退)。渲染层按批调用 readCharaBatch 提取文本块,载荷有界。
                o.put("embeddedData", JSObject.NULL);
                files.add(o);
                pendingMtime.add(new Object[]{ o, child });
                // F1 合并:一次遍历顺建 path→DocumentFile 索引,省去独立 buildRelIndex 遍历
                if (indexMap != null) indexMap.put(relDir.isEmpty() ? name : relDir + "/" + name, child);
            }
        }
    }

    // -------- PNG 内嵌卡数据(chara)提取 --------

    private String extractChara(DocumentFile f) {
        InputStream in = null;
        try {
            in = getContext().getContentResolver().openInputStream(f.getUri());
            if (in == null) return null;
            // 读取并校验 PNG 8 字节签名(89 50 4E 47 0D 0A 1A 0A)
            byte[] sig = new byte[8];
            if (readFully(in, sig) != 8) return null;
            if ((sig[0] & 0xff) != 0x89 || sig[1] != 'P' || sig[2] != 'N' || sig[3] != 'G'
                    || (sig[4] & 0xff) != 0x0D || (sig[5] & 0xff) != 0x0A
                    || (sig[6] & 0xff) != 0x1A || (sig[7] & 0xff) != 0x0A) return null;
            // 流式遍历 chunk:仅 tEXt/zTXt/iTXt(chara)读入内存,其余(尤其 IDAT 图像数据)直接跳过
            byte[] head = new byte[8];
            long chunks = 0;
            while (true) {
                if (readFully(in, head) != 8) return null;
                long len = ((head[0] & 0xffL) << 24) | ((head[1] & 0xffL) << 16)
                        | ((head[2] & 0xffL) << 8) | (head[3] & 0xffL);
                String type = new String(head, 4, 4, StandardCharsets.US_ASCII);
                if (len < 0 || len > 64 * 1024 * 1024) return null;
                if (type.equals("tEXt") || type.equals("zTXt") || type.equals("iTXt")) {
                    if (len > 16 * 1024 * 1024) return null; // chara 数据块通常几十 KB,防御异常大块
                    byte[] data = new byte[(int) len];
                    if (readFully(in, data) != len) return null;
                    skipFully(in, 4); // 跳过 CRC
                    String v = parseTextChunk(type, data);
                    if (v != null) return v;
                    continue;
                }
                if (type.equals("IEND")) break;
                skipFully(in, len + 4); // 数据 + CRC
                if (++chunks > 1000000) return null;
            }
            return null;
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (Exception ignored) { } }
        }
    }

    private String parseTextChunk(String type, byte[] data) {
        try {
            int nul = -1;
            for (int i = 0; i < data.length; i++) {
                if (data[i] == 0) { nul = i; break; }
            }
            if (nul <= 0) return null;
            String key = new String(data, 0, nul, StandardCharsets.US_ASCII);
            if (!key.equals("chara")) return null;
            byte[] value;
            if (type.equals("tEXt")) {
                value = Arrays.copyOfRange(data, nul + 1, data.length);
            } else if (type.equals("zTXt")) {
                if (nul + 2 > data.length || data[nul + 1] != 0) return null;
                value = inflate(Arrays.copyOfRange(data, nul + 2, data.length));
            } else { // iTXt
                if (nul + 3 > data.length) return null;
                boolean compressed = data[nul + 1] != 0;
                int p = nul + 3;
                int nul2 = -1;
                for (int i = p; i < data.length; i++) { if (data[i] == 0) { nul2 = i; break; } }
                if (nul2 < 0) return null;
                int nul3 = -1;
                for (int i = nul2 + 1; i < data.length; i++) { if (data[i] == 0) { nul3 = i; break; } }
                if (nul3 < 0) return null;
                value = Arrays.copyOfRange(data, nul3 + 1, data.length);
                if (compressed) value = inflate(value);
            }
            if (value == null) return null;
            String b64 = new String(value, StandardCharsets.US_ASCII).trim();
            byte[] decoded = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            return new String(decoded, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private byte[] inflate(byte[] in) {
        try {
            Inflater inf = new Inflater();
            inf.setInput(in);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(64, in.length * 3));
            byte[] buf = new byte[8192];
            int n;
            while (!inf.finished()) {
                n = inf.inflate(buf);
                if (n == 0) break;
                out.write(buf, 0, n);
            }
            inf.end();
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    private int readFully(InputStream in, byte[] buf) throws IOException {
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n < 0) break;
            off += n;
        }
        return off;
    }

    /** 跳过指定字节数;skip 可能返回 0(SAF 特殊流),退化为读 1 字节推进 */
    private void skipFully(InputStream in, long n) throws IOException {
        while (n > 0) {
            long s = in.skip(n);
            if (s > 0) { n -= s; continue; }
            if (in.read() < 0) break;
            n--;
        }
    }

    // endregion

    // region 目录/文件操作

    @PluginMethod()
    public void mkdir(PluginCall call) {
        String path = call.getString("path");
        DocumentFile parent = (path == null || !path.contains("/"))
                ? rootFile()
                : fileByRelPath(path.substring(0, path.lastIndexOf('/')));
        String name = (path == null || !path.contains("/")) ? path : path.substring(path.lastIndexOf('/') + 1);
        if (parent == null || name == null || name.isEmpty() || !parent.canWrite()) {
            call.reject("创建失败:目录不可写");
            return;
        }
        DocumentFile dir = parent.findFile(name);
        if (dir == null) dir = parent.createDirectory(name);
        JSObject ret = new JSObject();
        ret.put("success", dir != null);
        call.resolve(ret);
    }

    @PluginMethod()
    public void rename(PluginCall call) {
        String path = call.getString("path");
        String newPath = call.getString("newPath");
        DocumentFile src = fileByRelPath(path);
        if (src == null) {
            call.reject("源文件不存在");
            return;
        }
        // 新名字(取 newPath 最后一段)
        String newName = newPath == null ? null : newPath.replace('\\', '/').replaceAll("^.*/", "");
        if (newName == null || newName.isEmpty()) {
            call.reject("目标名无效");
            return;
        }
        // 同目录下重命名(分组重命名 / 卡片重命名通用)
        DocumentFile parent = src.getParentFile();
        DocumentFile target = (parent != null) ? parent.findFile(newName) : null;
        if (target != null && !target.getUri().equals(src.getUri())) {
            call.reject("目标同名文件已存在");
            return;
        }
        boolean ok = src.renameTo(newName);
        // F1 一致性:重命名成功后索引同步(旧路径移除,新路径写入)
        if (ok) {
            String oldRel = path.replace('\\', '/').replaceAll("^/+", "");
            String newRel = newPath.replace('\\', '/').replaceAll("^/+", "");
            if (!oldRel.isEmpty()) relIndex.remove(oldRel);
            if (!newRel.isEmpty()) relIndex.put(newRel, src);
        }
        JSObject ret = new JSObject();
        ret.put("success", ok);
        ret.put("error", ok ? JSObject.NULL : "重命名失败");
        call.resolve(ret);
    }

    @PluginMethod()
    public void move(PluginCall call) {
        String path = call.getString("path");
        String newPath = call.getString("newPath");
        DocumentFile src = fileByRelPath(path);
        if (src == null) {
            call.reject("源文件不存在");
            return;
        }
        // 目标目录:newPath 去掉最后一段后的路径;文件名保留源文件名
        String newRel = newPath == null ? null : newPath.replace('\\', '/');
        if (newRel == null) {
            call.reject("目标路径无效");
            return;
        }
        String targetDirRel = newRel.contains("/") ? newRel.substring(0, newRel.lastIndexOf('/')) : "";
        String wantName = newRel.contains("/") ? newRel.substring(newRel.lastIndexOf('/') + 1) : newRel;
        DocumentFile targetDir = targetDirRel.isEmpty() ? rootFile() : fileByRelPath(targetDirRel);
        if (targetDir == null) {
            call.reject("目标目录不可写");
            return;
        }
        String name = src.getName();
        String destName = (wantName != null && !wantName.isEmpty()) ? wantName : name;
        DocumentFile conflict = targetDir.findFile(destName);
        if (conflict != null) {
            // 同名冲突:追加时间戳后缀,绝不覆盖
            String ext = "";
            if (destName.contains(".")) {
                ext = destName.substring(destName.lastIndexOf('.') + 1);
            }
            String base = destName.contains(".")
                    ? destName.substring(0, destName.lastIndexOf('.'))
                    : destName;
            String dedup = base + "_移动_" + System.currentTimeMillis() + (ext.isEmpty() ? "" : "." + ext);
            boolean ok = doMove(src, targetDir, dedup);
            JSObject ret = new JSObject();
            ret.put("success", ok);
            ret.put("error", ok ? JSObject.NULL : "移动失败");
            ret.put("newPath", targetDirRel.isEmpty() ? dedup : targetDirRel + "/" + dedup);
            call.resolve(ret);
            return;
        }
        boolean mv = doMove(src, targetDir, destName);
        JSObject ret = new JSObject();
        ret.put("success", mv);
        ret.put("error", mv ? JSObject.NULL : "移动失败");
        ret.put("newPath", targetDirRel.isEmpty() ? destName : targetDirRel + "/" + destName);
        call.resolve(ret);
    }

    /**
     * 跨目录移动(SAF 无 DocumentFile.moveTo):
     * 先 DocumentsContract.moveDocument 换父目录,必要时再 renameTo 改名(重命名式移动)
     */
    private boolean doMove(DocumentFile src, DocumentFile parent, String newName) {
        try {
            android.content.ContentResolver cr = getContext().getContentResolver();
            Uri srcUri = src.getUri();
            Uri srcParentUri = src.getParentFile().getUri();
            Uri dstParentUri = parent.getUri();
            boolean sameParent = srcParentUri.equals(dstParentUri);
            Uri target = srcUri;
            String srcName = src.getName();
            boolean needRename = newName != null && !newName.isEmpty() && !newName.equals(srcName);
            if (!sameParent) {
                target = DocumentsContract.moveDocument(cr, srcUri, srcParentUri, dstParentUri);
                if (target == null) return false;
            }
            if (needRename) {
                DocumentFile moved = sameParent ? src : DocumentFile.fromSingleUri(getContext(), target);
                return moved.renameTo(newName);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod()
    public void delete(PluginCall call) {
        String path = call.getString("path");
        boolean recursive = call.getBoolean("recursive", false);
        DocumentFile f = fileByRelPath(path);
        if (f == null) {
            call.reject("文件不存在");
            return;
        }
        if (f.isDirectory()) {
            if (recursive) {
                boolean ok = deleteRecursive(f);
                JSObject ret = new JSObject();
                ret.put("success", ok);
                call.resolve(ret);
                return;
            }
            DocumentFile[] children = f.listFiles();
            if (children != null && children.length > 0) {
                call.reject("文件夹非空,无法删除");
                return;
            }
        }
        boolean ok = f.delete();
        // F1 一致性:删除成功后清除索引中该路径的旧引用(旧 DocumentFile URI 已失效,
        // 残留会导致后续 writeBuffer/readThumb 用失效引用操作失败 → 保存链路文件丢失)
        if (ok) {
            String r = path.replace('\\', '/').replaceAll("^/+", "");
            relIndex.remove(r);
            // 清理该目录下所有子路径(目录递归删除场景)
            for (java.util.Iterator<String> it = relIndex.keySet().iterator(); it.hasNext(); ) {
                if (it.next().startsWith(r + "/")) it.remove();
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    /** 递归删除目录(用于 .bak_history 等) */
    private boolean deleteRecursive(DocumentFile dir) {
        DocumentFile[] children = dir.listFiles();
        if (children != null) {
            for (DocumentFile child : children) {
                if (child.isDirectory()) {
                    if (!deleteRecursive(child)) return false;
                } else {
                    if (!child.delete()) return false;
                }
            }
        }
        return dir.delete();
    }

    /** 分组专用:删除空目录(非空报错,与桌面语义一致) */
    @PluginMethod()
    public void deleteEmpty(PluginCall call) {
        delete(call);
    }

    // endregion

    // region 读写

    @PluginMethod()
    public void readText(PluginCall call) {
        String path = call.getString("path");
        // 🚀 BUG-14:单文件读走快速通道,不占桥线程、也不排 reconcile 批读队
        final String rel = path == null ? "" : path;
        FAST_EXEC.execute(() -> {
            DocumentFile f;
            try { f = fileByRelPath(rel); } catch (Exception e) { f = null; }
            if (f == null || !f.canRead()) {
                call.reject("文件不存在或不可读");
                return;
            }
            String text = readStream(f.getUri(), false, 0);
            if (text == null) {
                call.reject("读取失败");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("value", text);
            call.resolve(ret);
        });
    }

    /**
     * 批量读文本（万卡优化：单次 IPC 拉取多个 json 文件，减少桥接往返）。
     * 🚀 v1.10.4:批内并行读取(8 线程)——SAF 流式读取是加载耗时大头,串行时每批 ~1s。
     * 🚀 BUG-14:整批 join 移交 jsx-batch 编排线程(同 readThumbBatch 模式)——
     * 桥线程立即返回,后台 reconcile 的批读期间,详情页单文件读取不再排在批后。
     * 入参 paths: ["/library/a.json", ...]；返回 results: [{path, success, value|error}]
     */
    @PluginMethod()
    public void readTextBatch(PluginCall call) {
        com.getcapacitor.JSArray paths = call.getArray("paths");
        if (paths == null || paths.length() == 0) {
            call.resolve(new JSObject());
            return;
        }
        BATCH_EXEC.execute(() -> {
            try {
                readTextBatchOnWorker(call);
            } catch (Exception e) {
                call.reject("批量读取失败: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        });
    }

    private void readTextBatchOnWorker(PluginCall call) {
        com.getcapacitor.JSArray paths = call.getArray("paths");
        final int n = paths.length();
        final JSObject[] collected = new JSObject[n];
        final java.util.concurrent.atomic.AtomicInteger idx = new java.util.concurrent.atomic.AtomicInteger(0);
        final int threads = Math.min(8, n);
        Thread[] pool = new Thread[threads];
        for (int t = 0; t < threads; t++) {
            pool[t] = new Thread(() -> {
                while (true) {
                    int i = idx.getAndIncrement();
                    if (i >= n) return;
                    JSObject item = new JSObject();
                    String p;
                    try { p = paths.getString(i); } catch (org.json.JSONException e) { p = null; }
                    if (p == null) { item.put("success", false); item.put("error", "路径无效"); }
                    else {
                        item.put("path", p);
                        DocumentFile f = fileByRelPath(p);
                        if (f == null || !f.canRead()) {
                            item.put("success", false);
                            item.put("error", "文件不存在或不可读");
                        } else {
                            String text = readStream(f.getUri(), false, 0);
                            if (text == null) { item.put("success", false); item.put("error", "读取失败"); }
                            else { item.put("success", true); item.put("value", text); }
                        }
                    }
                    collected[i] = item;
                }
            }, "jsx-readtext-" + t);
            pool[t].start();
        }
        for (Thread t : pool) { try { t.join(); } catch (InterruptedException e) { /* 忽略 */ } }
        // 串行回填(JSONArray 非线程安全,并行只写各自数组槽)
        com.getcapacitor.JSArray results = new com.getcapacitor.JSArray();
        for (int i = 0; i < n; i++) {
            if (collected[i] != null) results.put(collected[i]);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("results", results);
        call.resolve(ret);
    }

    /**
     * 🚀 v1.10.2 轻量化:批量提取 PNG 内嵌 chara 文本块。
     * 与 readTextBatch 同构:单次 IPC 提取多个 PNG 的文本块(不传输图像二进制),
     * 使 300+/2000 卡库加载时的桥接载荷有界(每批 24 个 × 每卡几十 KB)。
     * 🚀 BUG-14:整批 join 移交 jsx-batch 编排线程(同 readTextBatch)——桥线程立即返回,
     * reconcile 批读期间详情页 PNG 读取(readCharaBatch([单卡])/readThumb)不再排队 5s+。
     * 入参 paths: ["/library/a.png", ...];返回 results: [{path, success, value|error}]
     */
    @PluginMethod()
    public void readCharaBatch(PluginCall call) {
        com.getcapacitor.JSArray paths = call.getArray("paths");
        if (paths == null || paths.length() == 0) {
            call.resolve(new JSObject());
            return;
        }
        // 🚀 BUG-14 快速通道:≤2 卡的批读即「前台水合」(详情页 loadCardFullData 走
        // readCharaBatch([单卡])),直接进 FAST 队列,不排在 reconcile 几十批后台读之后;
        // 大批(加载期 24 卡/批)仍走 BATCH_EXEC 串行编排,互不干扰。
        final boolean foreground = paths.length() <= 2;
        (foreground ? FAST_EXEC : BATCH_EXEC).execute(() -> {
            try {
                readCharaBatchOnWorker(call);
            } catch (Exception e) {
                call.reject("批量提取失败: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
            }
        });
    }

    private void readCharaBatchOnWorker(PluginCall call) {
        com.getcapacitor.JSArray paths = call.getArray("paths");
        final int n = paths.length();
        final JSObject[] collected = new JSObject[n];
        final java.util.concurrent.atomic.AtomicInteger idx = new java.util.concurrent.atomic.AtomicInteger(0);
        final int threads = Math.min(8, n);
        Thread[] pool = new Thread[threads];
        for (int t = 0; t < threads; t++) {
            pool[t] = new Thread(() -> {
                while (true) {
                    int i = idx.getAndIncrement();
                    if (i >= n) return;
                    JSObject item = new JSObject();
                    String p;
                    try { p = paths.getString(i); } catch (org.json.JSONException e) { p = null; }
                    if (p == null) { item.put("success", false); item.put("error", "路径无效"); }
                    else {
                        item.put("path", p);
                        DocumentFile f = fileByRelPath(p);
                        if (f == null || !f.canRead()) {
                            item.put("success", false);
                            item.put("error", "文件不存在或不可读");
                        } else {
                            String embedded = extractChara(f);
                            if (embedded == null) {
                                item.put("success", false);
                                item.put("error", "无内嵌角色卡数据");
                            } else {
                                item.put("success", true);
                                item.put("value", embedded);
                            }
                        }
                    }
                    collected[i] = item;
                }
            }, "jsx-chara-" + t);
            pool[t].start();
        }
        for (Thread t : pool) { try { t.join(); } catch (InterruptedException e) { /* 忽略 */ } }
        com.getcapacitor.JSArray results = new com.getcapacitor.JSArray();
        for (int i = 0; i < n; i++) {
            if (collected[i] != null) results.put(collected[i]);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("results", results);
        call.resolve(ret);
    }

    @PluginMethod()
    public void readBuffer(PluginCall call) {
        String path = call.getString("path");
        DocumentFile f = fileByRelPath(path);
        if (f == null || !f.canRead()) {
            call.reject("文件不存在或不可读");
            return;
        }
        // 卡片 PNG 通常 < 20MB,超限视为异常
        String b64 = readStream(f.getUri(), true, 40 * 1024 * 1024);
        if (b64 == null) {
            call.reject("读取失败或文件过大");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("value", b64);
        call.resolve(ret);
    }

    @PluginMethod()
    public void writeText(PluginCall call) {
        String path = call.getString("path");
        String content = call.getString("content");
        if (content == null) {
            call.reject("内容为空");
            return;
        }
        DocumentFile f = fileByRelPath(path);
        if (f == null) {
            // 文件不存在:若父目录存在则尝试创建(支持库根 .jskzx_cache.json 首次写入)
            String rel = path.replace('\\', '/').replaceAll("^/+", "");
            String dirRel, name;
            DocumentFile parent;
            if (rel.contains("/")) {
                dirRel = rel.substring(0, rel.lastIndexOf('/'));
                name = rel.substring(rel.lastIndexOf('/') + 1);
                parent = fileByRelPath(dirRel);
            } else {
                dirRel = "";
                name = rel;
                parent = rootFile();
            }
            if (parent == null || !parent.canWrite()) {
                call.reject("目标目录不可用(未授权)");
                return;
            }
            f = parent.createFile("application/json", name);
            if (f == null) {
                call.reject("创建文件失败");
                return;
            }
        }
        boolean ok = writeStream(f.getUri(), content);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        ret.put("error", ok ? JSObject.NULL : "写入失败");
        call.resolve(ret);
    }

    // endregion

    // region 导入 / 导出(M2)

    /**
     * 系统文件选择器多选 .png/.webp/.json → 复制入库目标目录
     * 同名文件跳过(绝不覆盖);库未授权时直接报错
     */
    @PluginMethod()
    public void importCardFiles(final PluginCall call) {
        DocumentFile destDir = destDirByRel(call.getString("destPath", ""));
        if (destDir == null || !destDir.canWrite()) {
            call.reject("目标目录不可用(未授权卡片库)");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"image/png", "image/webp", "application/json", "text/plain"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.putExtra("__dest", call.getString("destPath", ""));
        startActivityForResult(call, intent, "importCardFilesResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void importCardFilesResult(PluginCall call, ActivityResult result) {
        DocumentFile destDir = destDirByRel(call.getString("destPath", ""));
        if (destDir == null || !destDir.canWrite()) {
            call.reject("目标目录不可用(未授权卡片库)");
            return;
        }
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.reject("用户取消选择");
            return;
        }
        List<String> copied = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                Uri u = data.getClipData().getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        android.content.ContentResolver cr = getContext().getContentResolver();
        for (Uri uri : uris) {
            String name = queryDisplayName(uri);
            if (name == null || name.isEmpty()) name = "card_" + System.currentTimeMillis() + ".png";
            String lower = name.toLowerCase(Locale.ROOT);
            if (!lower.endsWith(".png") && !lower.endsWith(".webp") && !lower.endsWith(".json")) {
                failed.add(name);
                continue;
            }
            try {
                InputStream in = cr.openInputStream(uri);
                if (in == null) {
                    failed.add(name);
                    continue;
                }
                try {
                    if (destDir.findFile(name) != null) {
                        skipped.add(name);
                        continue;
                    }
                    DocumentFile nf = destDir.createFile(mimeForName(name), name);
                    if (nf == null) {
                        failed.add(name);
                        continue;
                    }
                    boolean ok = writeUriFromStream(nf.getUri(), in);
                    if (ok) {
                        copied.add(call.getString("destPath", "") + "/" + name);
                        // F1 回填:新导入文件立即进索引,后续批次 O(1) 命中
                        String destRel = call.getString("destPath", "").replace("\\", "/")
                                .replaceAll("^/library/", "").replaceAll("^/+", "");
                        relIndex.put(destRel.isEmpty() ? name : destRel + "/" + name, nf);
                    } else failed.add(name);
                } finally {
                    in.close();
                }
            } catch (IOException e) {
                failed.add(name);
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("copied", new JSArray(copied));
        ret.put("skipped", new JSArray(skipped));
        ret.put("failed", new JSArray(failed));
        call.resolve(ret);
    }

    /**
     * 单卡导出:系统「创建文档」对话框,写原始卡片文件(png/webp/json)
     */
    @PluginMethod()
    public void exportCardFile(final PluginCall call) {
        String rel = call.getString("path");
        DocumentFile f = fileByRelPath(rel);
        if (f == null || !f.canRead()) {
            call.reject("源文件不存在或不可读");
            return;
        }
        String name = f.getName() != null ? f.getName() : "character.png";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeForName(name));
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "exportCardFileResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void exportCardFileResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消导出");
            return;
        }
        Uri target = result.getData().getData();
        if (target == null) {
            call.reject("未获取到导出位置");
            return;
        }
        DocumentFile f = fileByRelPath(call.getString("path"));
        if (f == null || !f.canRead()) {
            call.reject("源文件不存在或不可读");
            return;
        }
        try {
            InputStream in = getContext().getContentResolver().openInputStream(f.getUri());
            if (in == null) {
                call.reject("读取源文件失败");
                return;
            }
            try {
                boolean ok = writeUriFromStream(target, in);
                if (!ok) {
                    call.reject("写入导出文件失败");
                    return;
                }
            } finally {
                in.close();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("导出失败: " + e.getMessage());
        }
    }

    /**
     * 批量导出:库内多文件打包为 ZIP → 写入公共下载目录(MediaStore) → 系统分享
     * 兼容 HarmonyOS/卓易通等兼容层:application/zip 无 APP 响应时,文件已落盘下载目录,
     * 用户可经文件管理器访问/二次分享;分享类型放宽到 * / * 并显式 ClipData 授权。
     */
    @PluginMethod()
    public void exportBatchZip(final PluginCall call) {
        JSArray rels = call.getArray("paths");
        if (rels == null || rels.length() == 0) {
            call.reject("未选择任何卡片");
            return;
        }
        try {
            // 1) 应用缓存目录生成 ZIP(原生压缩,避免 WebView 内存峰值)
            java.io.File zipFile = buildBatchZip(rels);
            if (zipFile == null) {
                call.reject("没有可导出的卡片");
                return;
            }
            int count = zipCount;
            // 2) 落盘公共下载目录 → 文件管理器可见可分享
            Uri publicUri = persistToDownloads(zipFile);
            if (publicUri == null) {
                call.reject("写入下载目录失败");
                return;
            }
            // 3) 系统分享(优先 MediaStore Uri;无可用分享目标时静默降级为仅保存)
            boolean shared;
            try {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("*/*");
                share.putExtra(Intent.EXTRA_STREAM, publicUri);
                share.putExtra(Intent.EXTRA_TEXT, "角色卡合集 ZIP(" + count + " 张)");
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                share.setClipData(android.content.ClipData.newRawUri("zip", publicUri));
                getContext().startActivity(Intent.createChooser(share, "分享导出的卡片包"));
                shared = true;
            } catch (Exception e) {
                shared = false;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", count);
            ret.put("savedPath", "下载/JSKZX/" + zipFile.getName());
            ret.put("shared", shared);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("批量导出失败: " + e.getMessage());
        }
    }

    /** 生成 ZIP;成功返回文件,失败返回 null(zipCount 记录张数) */
    private int zipCount = 0;

    private java.io.File buildBatchZip(JSArray rels) throws IOException {
        java.io.File zipFile = new java.io.File(getContext().getCacheDir(),
                "ZK_Export_" + System.currentTimeMillis() + ".zip");
        int count = 0;
        try (java.util.zip.ZipOutputStream zos =
                     new java.util.zip.ZipOutputStream(new java.io.FileOutputStream(zipFile))) {
            for (int i = 0; i < rels.length(); i++) {
                String rel = rels.optString(i, "");
                DocumentFile f = fileByRelPath(rel);
                if (f == null || !f.canRead()) continue;
                String entryName = f.getName() != null ? f.getName() : ("file_" + i);
                zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
                InputStream in = getContext().getContentResolver().openInputStream(f.getUri());
                if (in != null) {
                    try {
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) != -1) zos.write(buf, 0, n);
                    } finally {
                        in.close();
                    }
                }
                zos.closeEntry();
                count++;
            }
        }
        if (count == 0) {
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();
            return null;
        }
        zipCount = count;
        return zipFile;
    }

    /**
     * 把 ZIP 写入公共下载目录(API 29+ 走 MediaStore,无需存储权限;低版本回退公共 Downloads)
     */
    private Uri persistToDownloads(java.io.File zipFile) {
        String folder = "JSKZX";
        try {
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, zipFile.getName());
                cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/zip");
                cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH,
                        android.os.Environment.DIRECTORY_DOWNLOADS + "/" + folder);
                Uri uri = getContext().getContentResolver()
                        .insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return null;
                try (InputStream in = new java.io.FileInputStream(zipFile);
                     OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                    if (out == null) return null;
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
                return uri;
            } else {
                // API < 29:写公共下载目录,并用 FileProvider 分享
                java.io.File dir = new java.io.File(
                        android.os.Environment.getExternalStoragePublicDirectory(
                                android.os.Environment.DIRECTORY_DOWNLOADS), folder);
                if (!dir.exists()) dir.mkdirs();
                java.io.File dest = new java.io.File(dir, zipFile.getName());
                try (InputStream in = new java.io.FileInputStream(zipFile);
                     OutputStream out = new java.io.FileOutputStream(dest)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
                return androidx.core.content.FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", dest);
            }
        } catch (Exception e) {
            return null;
        }
    }

    // region 导入/导出工具

    private DocumentFile destDirByRel(String rel) {
        if (rel == null || rel.isEmpty()) return rootFile();
        return fileByRelPath(rel);
    }

    private String queryDisplayName(Uri uri) {
        try {
            android.database.Cursor c = getContext().getContentResolver().query(uri, null, null, null, null);
            if (c != null) {
                try {
                    int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0 && c.moveToFirst()) return c.getString(idx);
                } finally {
                    c.close();
                }
            }
        } catch (Exception e) { /* 忽略 */ }
        String last = uri.getLastPathSegment();
        if (last != null && last.contains("/")) last = last.substring(last.lastIndexOf('/') + 1);
        return last;
    }

    private String mimeForName(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        return "application/json";
    }

    /** 通用「写目标 document」:从 InputStream 拷贝到 content uri,返回是否成功 */
    private boolean writeUriFromStream(Uri target, InputStream in) {
        try {
            OutputStream out = getContext().getContentResolver().openOutputStream(target);
            if (out == null) return false;
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                return true;
            } finally {
                out.close();
            }
        } catch (IOException e) {
            return false;
        }
    }

    // endregion

    // region M4:文件统计 / 磁盘扫描

    /** 批量获取库内文件物理状态(修改时间/大小),供查重等按物理文件判定的功能使用 */
    @PluginMethod()
    public void getFileStats(PluginCall call) {
        // 🚀 BUG-14:每文件 2 次 SAF query,大列表下同样占线;移交编排线程,桥线程立即返回
        BATCH_EXEC.execute(() -> {
            JSArray paths = call.getArray("paths");
            JSObject out = new JSObject();
            if (paths == null) {
                call.resolve(out);
                return;
            }
            java.util.List<String> rels = new ArrayList<>(paths.length());
            try {
                for (int i = 0; i < paths.length(); i++) rels.add(paths.optString(i, ""));
            } catch (Exception e) { /* 截断在已收集处 */ }
            for (String rel : rels) {
                if (rel.isEmpty()) continue;
                DocumentFile f = fileByRelPath(rel);
                if (f == null || !f.canRead()) continue;
                JSObject st = new JSObject();
                st.put("mtimeMs", f.lastModified());
                st.put("size", f.length());
                out.put(rel, st);
            }
            call.resolve(out);
        });
    }

    /**
     * M4 磁盘扫描:SAF 临时授权任意目录(不持久化),遍历收集候选卡片文件(png/webp),
     * 每 100 个通过 scanProgress 事件上报进度;返回相对所选目录的相对路径。
     */
    @PluginMethod()
    public void scanFolder(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        putInitialDownloadsUri(intent);
        intent.putExtra("__ext", call.getString("ext", ".png"));
        intent.putExtra("__skipLarge", call.getBoolean("skipLarge", true));
        startActivityForResult(call, intent, "scanFolderResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void scanFolderResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消选择目录");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("未获取到目录授权");
            return;
        }
        String ext = call.getString("ext", ".png").toLowerCase(Locale.ROOT);
        boolean skipLarge = call.getBoolean("skipLarge", true);
        final long MAX_FILE_BYTES = skipLarge ? 50L * 1024 * 1024 : Long.MAX_VALUE;
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.isDirectory()) {
            call.reject("选择的目录不可读");
            return;
        }
        JSArray files = new JSArray();
        java.util.ArrayDeque<DocumentFile> stack = new java.util.ArrayDeque<>();
        stack.push(root);
        long count = 0;
        long collected = 0;
        while (!stack.isEmpty()) {
            DocumentFile dir = stack.pop();
            DocumentFile[] children = dir.listFiles();
            if (children == null) continue;
            for (DocumentFile c : children) {
                if (c.isDirectory()) {
                    stack.push(c);
                    continue;
                }
                if (collected >= 3000) break; // 单次扫描上限,避免超大目录 CPU 峰值
                String n = c.getName();
                if (n == null) continue;
                String lower = n.toLowerCase(Locale.ROOT);
                boolean hit = lower.endsWith(ext)
                        || lower.endsWith(".png") || lower.endsWith(".webp");
                if (!hit) continue;
                if (c.length() > MAX_FILE_BYTES) continue;
                String rel = relPathWithin(root, c);
                if (rel == null) continue;
                JSObject o = new JSObject();
                o.put("path", rel);
                o.put("name", n);
                o.put("size", c.length());
                files.put(o);
                collected++;
            }
            count++;
            if (count % 100 == 0) {
                JSObject ev = new JSObject();
                ev.put("count", count);
                ev.put("found", collected);
                ev.put("phase", "walk");
                notifyListeners("scanProgress", ev);
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("treeUri", treeUri.toString());
        ret.put("files", files);
        ret.put("title", root.getName());
        call.resolve(ret);
    }

    /** 计算 target 相对 root 树的路径(如 子目录/a.png;不含根目录名);无法定位返回 null */
    private String relPathWithin(DocumentFile root, DocumentFile target) {
        java.util.List<String> segs = new ArrayList<>();
        DocumentFile cur = target;
        String rootUri = root.getUri() == null ? "" : root.getUri().toString();
        while (cur != null) {
            String curUri = cur.getUri() == null ? "" : cur.getUri().toString();
            if (curUri.equals(rootUri)) break;
            String n = cur.getName();
            if (n == null) break;
            segs.add(0, n);
            cur = cur.getParentFile();
        }
        if (segs.isEmpty()) return null;
        return String.join("/", segs);
    }

    /**
     * M4 扫描结果收编:把「扫描目录树(treeUri)下相对路径」的文件复制入库根(dest 相对路径),
     * 同名跳过不覆盖(与桌面 sys:importExternalCards 语义一致);返回 copied/skipped/failed 相对库根的路径。
     */
    @PluginMethod()
    public void importScanned(PluginCall call) {
        String treeUri = call.getString("treeUri");
        JSArray paths = call.getArray("paths");
        String dest = call.getString("dest", "");
        if (treeUri == null || treeUri.isEmpty() || paths == null) {
            call.reject("treeUri / paths 缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            DocumentFile destDir = destDirByRel(dest);
            if (root == null || destDir == null || !destDir.canWrite()) {
                call.reject("目录不可用(请确认库目录已授权)");
                return;
            }
            List<String> copied = new ArrayList<>();
            List<String> skipped = new ArrayList<>();
            List<String> failed = new ArrayList<>();
            for (int i = 0; i < paths.length(); i++) {
                String rel = paths.optString(i, "").replace('\\', '/').replaceAll("^/+", "");
                if (rel.isEmpty()) continue;
                String name = rel.contains("/") ? rel.substring(rel.lastIndexOf('/') + 1) : rel;
                DocumentFile src = resolveInTree(root, rel);
                if (src == null || !src.canRead() || !src.isFile()) {
                    failed.add(name);
                    continue;
                }
                try {
                    if (destDir.findFile(name) != null) {
                        skipped.add(name);
                        continue;
                    }
                    DocumentFile nf = destDir.createFile(mimeForName(name), name);
                    if (nf == null) {
                        failed.add(name);
                        continue;
                    }
                    InputStream in = getContext().getContentResolver().openInputStream(src.getUri());
                    if (in == null) {
                        failed.add(name);
                        continue;
                    }
                    boolean ok;
                    try {
                        ok = writeUriFromStream(nf.getUri(), in);
                    } finally {
                        in.close();
                    }
                    if (ok) copied.add((dest.isEmpty() ? "" : dest + "/") + name);
                    else failed.add(name);
                } catch (IOException e) {
                    failed.add(name);
                }
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("copied", new JSArray(copied));
            ret.put("skipped", new JSArray(skipped));
            ret.put("failed", new JSArray(failed));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("导入失败: " + e.getMessage());
        }
    }

    /** 在指定树的根下按相对路径定位文件(拒绝越权) */
    private DocumentFile resolveInTree(DocumentFile root, String rel) {
        String[] segs = rel.split("/");
        DocumentFile cur = root;
        for (String seg : segs) {
            if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
            DocumentFile next = cur.findFile(seg);
            if (next == null) return null;
            cur = next;
        }
        return cur;
    }

    /**
     * M4 本地推送:把库内文件复制到目标 SAF 树目录(treeUri),同名覆盖。
     * 参数:treeUri(目标目录授权URI), paths(库内相对路径数组,多个则批量复制)
     * 返回:{success, copied:[], failed:[{path,error}]}
     */
    @PluginMethod()
    public void copyToFolder(PluginCall call) {
        String treeUri = call.getString("treeUri");
        JSArray paths = call.getArray("paths");
        if (treeUri == null || treeUri.isEmpty() || paths == null || paths.length() == 0) {
            call.reject("treeUri / paths 缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            if (root == null || !root.canWrite()) {
                call.reject("目标目录不可写(权限可能已失效)");
                return;
            }
            List<String> copied = new ArrayList<>();
            JSArray failed = new JSArray();
            for (int i = 0; i < paths.length(); i++) {
                String rel = paths.optString(i, "").replace('\\', '/').replaceAll("^/+", "");
                if (rel.isEmpty()) continue;
                DocumentFile src = fileByRelPath(rel);
                if (src == null || !src.canRead()) {
                    JSObject fe = new JSObject();
                    fe.put("path", rel);
                    fe.put("error", "源文件不存在或不可读");
                    failed.put(fe);
                    continue;
                }
                String name = src.getName() != null ? src.getName() : "card.png";
                try {
                    // 同名覆盖:先删再建
                    DocumentFile existing = root.findFile(name);
                    if (existing != null) existing.delete();
                    DocumentFile nf = root.createFile(mimeForName(name), name);
                    if (nf == null) {
                        JSObject fe = new JSObject();
                        fe.put("path", rel);
                        fe.put("error", "创建目标文件失败");
                        failed.put(fe);
                        continue;
                    }
                    InputStream in = getContext().getContentResolver().openInputStream(src.getUri());
                    if (in == null) {
                        JSObject fe = new JSObject();
                        fe.put("path", rel);
                        fe.put("error", "读取源文件失败");
                        failed.put(fe);
                        continue;
                    }
                    boolean ok;
                    try {
                        ok = writeUriFromStream(nf.getUri(), in);
                    } finally {
                        in.close();
                    }
                    if (ok) copied.add(rel);
                    else {
                        JSObject fe = new JSObject();
                        fe.put("path", rel);
                        fe.put("error", "写入目标文件失败");
                        failed.put(fe);
                    }
                } catch (IOException e) {
                    JSObject fe = new JSObject();
                    fe.put("path", rel);
                    fe.put("error", e.getMessage());
                    failed.put(fe);
                }
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("copied", new JSArray(copied));
            ret.put("failed", failed);
            ret.put("count", copied.size());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("复制到目标目录失败: " + e.getMessage());
        }
    }

    // endregion

    // region M4: 文件打开/定位/回收站管理

    /**
     * 在系统文件管理器中定位文件:打开文件所在父目录的 SAF 视图。
     * Android 无原生"show in folder"API,通过 ACTION_VIEW 打开父目录 document 实现。
     */
    @PluginMethod()
    public void openFileInFolder(PluginCall call) {
        String rel = call.getString("path");
        DocumentFile f = fileByRelPath(rel);
        if (f == null || !f.exists()) {
            call.reject("文件不存在");
            return;
        }
        try {
            // 获取父目录 URI
            Uri parentUri;
            DocumentFile parent = f.getParentFile();
            if (parent != null) {
                parentUri = parent.getUri();
            } else {
                // 根目录文件:直接用库根 URI
                parentUri = Uri.parse(prefs().getString(KEY_ROOT_URI, ""));
            }
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(parentUri, DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开文件管理器: " + e.getMessage());
        }
    }

    /**
     * 用系统默认应用打开文件/目录:文件按 MIME 类型选择应用,目录用文件管理器浏览。
     */
    /**
     * 系统文件选择器选单个 JSON/文本文件并直接读内容(不复制入库)。
     * 用于测卡侧边栏预设/正则/插件的「从文件导入」。
     */
    @PluginMethod()
    public void pickJsonFile(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"application/json", "text/plain", "application/octet-stream"});
        startActivityForResult(call, intent, "pickJsonFileResult");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void pickJsonFileResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK
                || result.getData() == null) {
            call.reject("用户取消选择");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未获取到文件");
            return;
        }
        String name = queryDisplayName(uri);
        if (name == null || name.isEmpty()) name = "import.json";
        String text = readStream(uri, false, 20 * 1024 * 1024);
        if (text == null) {
            call.reject("读取失败或文件过大(>20MB)");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("name", name);
        ret.put("text", text);
        call.resolve(ret);
    }

    @PluginMethod()
    public void openFile(PluginCall call) {
        String rel = call.getString("path");
        DocumentFile f = fileByRelPath(rel);
        if (f == null || !f.canRead()) {
            call.reject("文件不存在或不可读");
            return;
        }
        try {
            Intent intent;
            if (f.isDirectory()) {
                intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(f.getUri(), DocumentsContract.Document.MIME_TYPE_DIR);
            } else {
                String name = f.getName() != null ? f.getName() : "file";
                String mime = mimeForName(name);
                intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(f.getUri(), mime);
            }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开文件: " + e.getMessage());
        }
    }

    /**
     * 打开库内 .trash 回收站目录:在系统文件管理器中查看已删除的卡片。
     */
    @PluginMethod()
    public void openTrash(PluginCall call) {
        DocumentFile root = rootFile();
        if (root == null) {
            call.reject("库目录未授权");
            return;
        }
        try {
            DocumentFile trash = root.findFile(".trash");
            if (trash == null || !trash.isDirectory()) {
                // 回收站不存在,创建它
                trash = root.createDirectory(".trash");
                if (trash == null) {
                    call.reject("无法创建回收站目录");
                    return;
                }
            }
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(trash.getUri(), DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开回收站: " + e.getMessage());
        }
    }

    // endregion

    // region 外部世界书目录(独立 SAF 树:扫描/读/写/重命名/删除)

    /** 外部 SAF 树内按相对路径定位文件(越权一律 null) */
    private DocumentFile resolveWithin(DocumentFile root, String rel) {
        if (root == null || rel == null) return null;
        String norm = rel.replace('\\', '/').replaceAll("^/+", "");
        if (norm.isEmpty()) return root;
        DocumentFile cur = root;
        for (String seg : norm.split("/")) {
            if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
            cur = cur.findFile(seg);
            if (cur == null) return null;
        }
        return cur;
    }

    /**
     * 递归扫描外部目录树的 .json 文件(世界书候选),返回相对路径列表。
     * 跳过隐藏目录与 >10MB 大文件,单次上限 3000 个文件。
     */
    @PluginMethod()
    public void scanWbTree(PluginCall call) {
        String treeUri = call.getString("treeUri");
        if (treeUri == null || treeUri.isEmpty()) {
            call.reject("缺少目录授权");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            if (root == null || !root.isDirectory() || !root.canRead()) {
                JSObject err = new JSObject();
                err.put("success", false);
                err.put("error", "目录不可读(授权可能已失效)");
                call.resolve(err);
                return;
            }
            JSArray files = new JSArray();
            java.util.ArrayDeque<DocumentFile> stack = new java.util.ArrayDeque<>();
            stack.push(root);
            long collected = 0;
            while (!stack.isEmpty()) {
                DocumentFile dir = stack.pop();
                DocumentFile[] children = dir.listFiles();
                if (children == null) continue;
                for (DocumentFile c : children) {
                    if (c.isDirectory()) {
                        String nm = c.getName();
                        if (nm != null && !nm.startsWith(".")) stack.push(c);
                        continue;
                    }
                    if (collected >= 3000) break;
                    String n = c.getName();
                    if (n == null) continue;
                    if (!n.toLowerCase(Locale.ROOT).endsWith(".json")) continue;
                    if (c.length() > 10L * 1024 * 1024) continue;
                    String rel = relPathWithin(root, c);
                    if (rel == null) continue;
                    JSObject o = new JSObject();
                    o.put("path", rel);
                    o.put("name", n);
                    o.put("size", c.length());
                    o.put("mtime", queryLastModified(c));
                    files.put(o);
                    collected++;
                }
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("title", root.getName());
            ret.put("count", collected);
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("扫描失败: " + e.getMessage());
        }
    }

    /** 读取外部树内指定相对路径文件的文本内容 */
    @PluginMethod()
    public void readWbText(PluginCall call) {
        String treeUri = call.getString("treeUri");
        String rel = call.getString("path");
        if (treeUri == null || rel == null) {
            call.reject("参数缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            DocumentFile f = resolveWithin(root, rel);
            if (f == null || !f.isFile() || !f.canRead()) {
                call.reject("文件不存在或不可读");
                return;
            }
            String text = readStream(f.getUri(), false, 10 * 1024 * 1024);
            if (text == null) {
                call.reject("读取失败或文件过大");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("value", text);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("读取失败: " + e.getMessage());
        }
    }

    /** 写入外部树内指定相对路径文件(不存在则创建,父目录必须存在) */
    @PluginMethod()
    public void writeWbText(PluginCall call) {
        String treeUri = call.getString("treeUri");
        String rel = call.getString("path");
        String content = call.getString("content");
        if (treeUri == null || rel == null || content == null) {
            call.reject("参数缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            if (root == null || !root.canWrite()) {
                call.reject("目录不可写(授权可能已失效)");
                return;
            }
            DocumentFile f = resolveWithin(root, rel);
            if (f == null) {
                String norm = rel.replace('\\', '/').replaceAll("^/+", "");
                int idx = norm.lastIndexOf('/');
                DocumentFile parent = idx > 0 ? resolveWithin(root, norm.substring(0, idx)) : root;
                String name = idx > 0 ? norm.substring(idx + 1) : norm;
                if (parent == null || !parent.isDirectory() || name.isEmpty()) {
                    call.reject("父目录不存在或文件名无效");
                    return;
                }
                f = parent.createFile("application/json", name);
                if (f == null) {
                    call.reject("创建文件失败");
                    return;
                }
            }
            boolean ok = writeStream(f.getUri(), content);
            JSObject ret = new JSObject();
            ret.put("success", ok);
            ret.put("error", ok ? JSObject.NULL : "写入失败");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("写入失败: " + e.getMessage());
        }
    }

    /** 重命名外部树内文件 */
    @PluginMethod()
    public void renameWbFile(PluginCall call) {
        String treeUri = call.getString("treeUri");
        String rel = call.getString("path");
        String newName = call.getString("newName");
        if (treeUri == null || rel == null || newName == null || newName.isEmpty()) {
            call.reject("参数缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            DocumentFile f = resolveWithin(root, rel);
            if (f == null || !f.isFile()) {
                call.reject("文件不存在");
                return;
            }
            boolean ok = f.renameTo(newName);
            JSObject ret = new JSObject();
            ret.put("success", ok);
            ret.put("error", ok ? JSObject.NULL : "重命名失败");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("重命名失败: " + e.getMessage());
        }
    }

    /** 删除外部树内文件(物理删除,由调用方先做确认) */
    @PluginMethod()
    public void deleteWbFile(PluginCall call) {
        String treeUri = call.getString("treeUri");
        String rel = call.getString("path");
        if (treeUri == null || rel == null) {
            call.reject("参数缺失");
            return;
        }
        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(treeUri));
            DocumentFile f = resolveWithin(root, rel);
            if (f == null || !f.isFile()) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("notExist", true);
                call.resolve(ret);
                return;
            }
            boolean ok = f.delete();
            JSObject ret = new JSObject();
            ret.put("success", ok);
            ret.put("error", ok ? JSObject.NULL : "删除失败");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("删除失败: " + e.getMessage());
        }
    }

    // endregion

    // region 封面缩略图 + 二进制写入 (Quick Win: 缩略图磁盘缓存 ≈ Glide 分层)

    private static final String THUMB_DIR = "thumbs";
    private static final int THUMB_MAX_DIM = 300;
    /** 缓存上限(单文件 ~12KB;1500 张 ≈ 18MB,超过按最旧淘汰一半) */
    private static final int THUMB_MAX_CACHE = 1500;
    private static volatile boolean thumbGcDone = false;

    /** path|mtime|size → MD5 hex(卡片图变更 → 指纹变化 → 旧缓存自动失效,无需副作用) */
    private String thumbCacheKey(String path, long mtime, long size) {
        String raw = path + "|" + mtime + "|" + size;
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] d = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(32);
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.format(Locale.ROOT, "%x", raw.hashCode());
        }
    }

    private File thumbDir() {
        return new File(getContext().getFilesDir(), THUMB_DIR);
    }

    /**
     * 读取 call 中的 long 参数:org.json 会按数值范围把 JSON 数字解析为 Integer/Long/Double
     * 三种类型,Capacitor 的 getLong/getDouble 各有盲区(互不覆盖),这里直接取原值统一处理。
     */
    private long callLong(PluginCall call, String key, long def) {
        try {
            Object v = call.getData().opt(key);
            if (v instanceof Number) return ((Number) v).longValue();
        } catch (Exception e) { /* 忽略 */ }
        return def;
    }

    /** 进程内首次调用:缩略图数超限 → 按最后修改时间淘汰旧的一半 */
    private void gcThumbsIfNeeded() {
        if (thumbGcDone) return;
        thumbGcDone = true;
        try {
            File[] files = thumbDir().listFiles();
            if (files == null || files.length <= THUMB_MAX_CACHE) return;
            java.util.Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            int toDelete = files.length - THUMB_MAX_CACHE / 2;
            for (int i = 0; i < toDelete && i < files.length; i++) files[i].delete();
        } catch (Exception e) { /* 清理失败不影响主流程 */ }
    }

    /**
     * SAF 图片 → maxDim 最长边缩略图:
     * 1) inJustDecodeBounds 只读边界 2) 逐步 inSampleSize 降到 ≤ maxDim 解码
     * (BitmapFactory 按 inSampleSize 行解码,内存安全) 3) createScaledBitmap 等比精调。
     * ARGB_8888:角色立绘透明背景常见,RGB_565 会把透明像素变黑底(缺陷 #001 B 包显式禁止)。
     */
    private Bitmap decodeThumbBitmap(Uri uri, int maxDim) {
        InputStream in = null;
        try {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            BitmapFactory.decodeStream(in, null, opts);
            in.close(); in = null;
            int w = opts.outWidth, h = opts.outHeight;
            if (w <= 0 || h <= 0) return null;
            int sample = 1;
            while (w / (sample * 2) >= maxDim || h / (sample * 2) >= maxDim) sample *= 2;
            opts.inJustDecodeBounds = false;
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            Bitmap bmp = BitmapFactory.decodeStream(in, null, opts);
            if (bmp == null) return null;
            // 精调:createScaledBitmap 只在实际超出时调用,避免单像素小图重复创建
            if (bmp.getWidth() > maxDim || bmp.getHeight() > maxDim) {
                float ratio = Math.min((float) maxDim / bmp.getWidth(), (float) maxDim / bmp.getHeight());
                int nw = Math.max(1, Math.round(bmp.getWidth() * ratio));
                int nh = Math.max(1, Math.round(bmp.getHeight() * ratio));
                Bitmap scaled = Bitmap.createScaledBitmap(bmp, nw, nh, true);
                if (scaled != bmp) { bmp.recycle(); bmp = scaled; }
            }
            return bmp;
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) { try { in.close(); } catch (IOException e) { /* 忽略 */ } }
        }
    }

    /**
     * 单卡缩略图 base64:命中缓存直接读磁盘,未命中读 SAF 原图降采样生成 WebP 并写缓存。
     * 供 readThumb 与 readThumbBatch 复用;失败返回 null。
     */
    private String thumbBase64(String path, long mtime, long size, int maxDim) {
        File thumb = new File(thumbDir(), thumbCacheKey(path, mtime, size) + ".webp");
        // 缓存命中:读本地 → 返回
        if (thumb.exists() && thumb.length() > 0) {
            try (FileInputStream fin = new FileInputStream(thumb)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = fin.read(buf)) != -1) out.write(buf, 0, n);
                return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) { /* 缓存读失败 → 落重建分支 */ }
        }
        // 缓存未命中:读 SAF 原图 → 降采样 → WebP q75 → 写缓存 → 返回
        DocumentFile f = fileByRelPath(path);
        if (f == null || !f.canRead()) return null;
        Bitmap bmp = decodeThumbBitmap(f.getUri(), maxDim);
        if (bmp == null) return null;
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.WEBP, 75, out);
            byte[] bytes = out.toByteArray();
            thumbDir().mkdirs();
            try (FileOutputStream fos = new FileOutputStream(thumb)) { fos.write(bytes); }
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        } finally {
            bmp.recycle();
        }
    }

    // ---------- F2/F5: 共享缩略图线程池 + 批量编排线程,桥线程零等待 ----------
    // 千卡基线:readThumbBatch 原实现手动 8 线程 + join 阻塞桥线程,chara 批读 IPC 排队;
    // 改为共享池(4线程,低优先级)执行 + 单线程编排,桥线程立即返回(I8)
    private static final java.util.concurrent.ExecutorService THUMB_POOL =
        java.util.concurrent.Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "jsx-thumb");
            t.setPriority(Thread.NORM_PRIORITY - 1);
            return t;
        });
    private static final java.util.concurrent.ExecutorService BATCH_ORCH =
        java.util.concurrent.Executors.newSingleThreadExecutor(r -> new Thread(r, "jsx-thumb-orch"));

    /**
     * 封面缩略图读取(Glide 分层的磁盘层)。
     * 缓存键 = MD5(path|mtime|size):卡片图更换后 mtime/size 变化 → 生成新缩略图,
     * 旧缓存按 fingerprint 过期,无需额外副作用清理。
     * 写入 app 私有目录(filesDir/thumbs/):不污染用户卡片库,SCAN 不可见(跳过 .jskzx 开头目录)。
     * 返回结构 { success, value: base64 } 与 readBuffer 同构。
     * 重活提交共享线程池,不阻塞 Capacitor 桥接线程。
     */
    @PluginMethod()
    public void readThumb(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("参数缺失"); return; }
        long mtime = callLong(call, "mtime", 0L);
        long size = callLong(call, "size", 0L);
        final int maxDim = call.getInt("maxDim", THUMB_MAX_DIM) > 0
                ? call.getInt("maxDim", THUMB_MAX_DIM) : THUMB_MAX_DIM;
        gcThumbsIfNeeded();
        // F5: 共享池执行,不再每次 new Thread
        THUMB_POOL.execute(() -> {
            String b64 = thumbBase64(path, mtime, size, maxDim);
            if (b64 == null) { call.reject("缩略图失败"); return; }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("value", b64);
            call.resolve(ret);
        });
    }

    /**
     * 批量缩略图读取/生成(单次 IPC,共享池并行):
     * 首屏预热专用——第一批可见卡缩略图一次过桥,避免逐卡 IPC 往返。
     * 入参 paths: [rel,...], mtimes: [long,...], sizes: [long,...], maxDim
     * 返回 results: [{path, success, value: base64|error}]
     */
    @PluginMethod()
    public void readThumbBatch(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null || paths.length() == 0) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("results", new JSArray());
            call.resolve(ret);
            return;
        }
        final int n = paths.length();
        final JSArray mtimes = call.getArray("mtimes");
        final JSArray sizes = call.getArray("sizes");
        final int maxDim = call.getInt("maxDim", THUMB_MAX_DIM) > 0
                ? call.getInt("maxDim", THUMB_MAX_DIM) : THUMB_MAX_DIM;
        // F2: 参数解析留在桥线程(微秒级);批量执行整体移交编排线程——
        // 桥线程立即返回,chara 批读 IPC 不再被 join 阻塞排队(I8)
        BATCH_ORCH.execute(() -> runThumbBatch(call, paths, mtimes, sizes, maxDim, n));
    }

    private void runThumbBatch(PluginCall call, JSArray paths, JSArray mtimes,
                               JSArray sizes, int maxDim, int n) {
        gcThumbsIfNeeded();
        final JSObject[] collected = new JSObject[n];
        // 🚀 性能修复:原实现 CountDownLatch 等整批完成(坏卡/超大图可能拖满 20s),
        // 首屏封面被一批卡死全部延迟;改为每项 Future.get 独立超时(1.5s),单卡卡住
        // 只丢这一张(标记失败),其余结果按时返回,不再整批等待。
        final java.util.List<java.util.concurrent.Future<?>> futures = new java.util.ArrayList<>(n);
        for (int t = 0; t < n; t++) {
            final int i = t;
            futures.add(THUMB_POOL.submit(() -> {
                try {
                    JSObject item = new JSObject();
                    String p = null; long mtime = 0L, size = 0L;
                    try { p = paths.getString(i); } catch (Exception ignore) { /* 忽略 */ }
                    try {
                        Object mv = (mtimes != null && i < mtimes.length()) ? mtimes.get(i) : null;
                        if (mv instanceof Number) mtime = ((Number) mv).longValue();
                    } catch (Exception ignore) { /* 保持 0 */ }
                    try {
                        Object sv = (sizes != null && i < sizes.length()) ? sizes.get(i) : null;
                        if (sv instanceof Number) size = ((Number) sv).longValue();
                    } catch (Exception ignore) { /* 保持 0 */ }
                    String b64 = (p != null) ? thumbBase64(p, mtime, size, maxDim) : null;
                    item.put("success", b64 != null);
                    if (b64 != null) item.put("value", b64);
                    else item.put("error", "生成失败");
                    collected[i] = item;
                } catch (Exception e) {
                    JSObject item = new JSObject();
                    item.put("success", false);
                    item.put("error", "生成异常");
                    collected[i] = item;
                }
            }));
        }
        final long perItemTimeoutMs = 1500L; // 单卡缩略图生成上限:超时视为失败,不阻塞整批
        final long deadline = System.currentTimeMillis() + 8000L; // 整批兜底上限(原 20s → 8s)
        for (int i = 0; i < n && System.currentTimeMillis() < deadline; i++) {
            try {
                futures.get(i).get(perItemTimeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (Exception ignore) { /* 超时/中断/执行异常:该项视为失败,继续下一项 */ }
        }
        JSArray results = new JSArray();
        for (int i = 0; i < n; i++) { if (collected[i] != null) results.put(collected[i]); }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("results", results);
        call.resolve(ret);
    }

    /**
     * 删除指定卡片的缩略图缓存(换卡图后调用,强制下次 readThumb 从新文件重新生成)。
     * 入参 { path, mtime, size } → {} (幂等,始终成功)
     */
    @PluginMethod()
    public void deleteThumb(PluginCall call) {
        String path = call.getString("path");
        if (path != null) {
            long mtime = callLong(call, "mtime", 0L);
            long size = callLong(call, "size", 0L);
            try {
                File thumb = new File(thumbDir(), thumbCacheKey(path, mtime, size) + ".webp");
                if (thumb.exists()) thumb.delete();
            } catch (Exception e) { /* 删除失败不影响主流程 */ }
        }
        call.resolve(new JSObject());
    }

    /**
     * 🚀 性能修复:库内 SAF 流式复制(快照创建/恢复专用,免 base64 过桥)。
     * 原 JS 快照链路 readBuffer 整图 base64 + writeBuffer 回写,20MB PNG 一次快照
     * 要过桥 54MB+ base64 载荷;原生流式复制只做字节流拷贝,载荷零过桥,快照/恢复秒级。
     * 入参 { srcPath, destPath }(库内相对路径);dest 目标目录(如 .bak_history)不存在
     * 时逐级创建,dest 已存在先删再建(SAF 无法原地覆写 document)。返回 { success }
     */
    @PluginMethod()
    public void copyWithin(PluginCall call) {
        String srcPath = call.getString("srcPath");
        String destPath = call.getString("destPath");
        if (srcPath == null || destPath == null) { call.reject("参数缺失"); return; }
        try {
            DocumentFile src = fileByRelPath(srcPath);
            if (src == null || !src.canRead()) { call.reject("源文件不存在或不可读"); return; }
            String drel = destPath.replace('\\', '/').replaceAll("^/+", "");
            String dirRel = drel.contains("/") ? drel.substring(0, drel.lastIndexOf('/')) : "";
            String name = drel.contains("/") ? drel.substring(drel.lastIndexOf('/') + 1) : drel;
            DocumentFile parent;
            if (!dirRel.isEmpty()) {
                // 目标目录可能不存在(.bak_history/分组):逐级 find/create,不能依赖 relIndex
                String acc = "";
                boolean ok = true;
                for (String seg : dirRel.split("/")) {
                    acc = acc.isEmpty() ? seg : acc + "/" + seg;
                    DocumentFile d = fileByRelPath(acc);
                    if (d == null || !d.isDirectory()) {
                        DocumentFile p = acc.contains("/")
                                ? fileByRelPath(acc.substring(0, acc.lastIndexOf('/')))
                                : rootFile();
                        if (p == null || !p.canWrite()) { ok = false; break; }
                        DocumentFile created = p.createDirectory(seg);
                        if (created == null) { ok = false; break; }
                    }
                }
                if (!ok) { call.reject("创建目标目录失败"); return; }
                parent = fileByRelPath(dirRel);
            } else {
                parent = rootFile();
            }
            if (parent == null || !parent.canWrite()) { call.reject("目标目录不可写"); return; }
            DocumentFile existing = parent.findFile(name);
            if (existing != null) existing.delete();
            DocumentFile nf = parent.createFile(mimeForName(name), name);
            if (nf == null) { call.reject("创建目标文件失败"); return; }
            InputStream in = getContext().getContentResolver().openInputStream(src.getUri());
            if (in == null) { call.reject("读取源文件失败"); return; }
            boolean ok;
            try {
                ok = writeUriFromStream(nf.getUri(), in);
            } finally {
                try { in.close(); } catch (IOException ignore) { /* 忽略 */ }
            }
            if (!ok) { call.reject("复制失败"); return; }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("复制失败: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
        }
    }

    private String inferMime(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    /**
     * 二进制写入(base64 载荷,对齐桌面 writeBuffer 语义)。
     * PNG/WebP 卡片保存、换卡图、快照创建/恢复均依赖此方法;
     * 此前原生缺失(仅 writeText)导致这些操作在 Android 端静默失败。
     * 入参 { path, value: base64 } → { success }
     */
    @PluginMethod()
    public void writeBuffer(PluginCall call) {
        String path = call.getString("path");
        String value = call.getString("value");
        if (path == null || value == null) { call.reject("参数缺失"); return; }
        DocumentFile f = fileByRelPath(path);
        if (f == null) {
            // 文件不存在:在目标目录创建(SAF createFile + 按扩展名推断 MIME)。
            // 支持库根(rel 无斜杠)场景:PNG 安全写回的 .jszkx-tmp 临时文件位于库根时也必须可创建
            String rel = path.replace('\\', '/').replaceAll("^/+", "");
            String dirRel, name;
            DocumentFile parent;
            if (rel.contains("/")) {
                dirRel = rel.substring(0, rel.lastIndexOf('/'));
                name = rel.substring(rel.lastIndexOf('/') + 1);
                parent = fileByRelPath(dirRel);
            } else {
                dirRel = "";
                name = rel;
                parent = rootFile();
            }
            if (parent == null || !parent.canWrite()) { call.reject("目标目录不可用(未授权)"); return; }
            f = parent.createFile(inferMime(name), name);
            if (f == null) { call.reject("创建文件失败"); return; }
        }
        try {
            byte[] bytes = Base64.decode(value, Base64.NO_WRAP);
            // F1 一致性:先尝试当前引用;若 relIndex 缓存的是失效旧引用(delete+rename 后),
            // openOutputStream 会失败 → 慢路径重新解析路径(绕过索引)重试一次,防保存链路丢文件
            OutputStream out = null;
            try {
                out = getContext().getContentResolver().openOutputStream(f.getUri(), "wt");
            } catch (Exception openErr) { /* 引用失效,落慢路径重试 */ }
            if (out == null) {
                DocumentFile fresh = fileByRelPathSlow(path.replace('\\', '/').replaceAll("^/+", ""));
                if (fresh != null) {
                    f = fresh;
                    try {
                        out = getContext().getContentResolver().openOutputStream(fresh.getUri(), "wt");
                    } catch (Exception openErr2) { out = null; }
                }
            }
            if (out == null) { call.reject("打开文件失败"); return; }
            try { out.write(bytes); } finally { out.close(); }
            // 成功后回填索引(fresh 引用)
            String r = path.replace('\\', '/').replaceAll("^/+", "");
            if (!r.isEmpty()) relIndex.put(r, f);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("写入失败: " + e.getMessage());
        }
    }

    // endregion
}