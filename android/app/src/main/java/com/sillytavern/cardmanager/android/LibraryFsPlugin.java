package com.sillytavern.cardmanager.android;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
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

    /** 相对路径(用 / 分隔) → 根下的 DocumentFile;越权(..)一律 null */
    private DocumentFile fileByRelPath(String rel) {
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
                return asBase64 ? Base64.getEncoder().encodeToString(data)
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
        startActivityForResult(call, intent, "pickFolderResult");
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

    /**
     * 递归扫描库目录树,返回与桌面 scanAndSaveFolder 结构一致的 files/categories
     */
    @PluginMethod()
    public void scan(final PluginCall call) {
        String rel = call.getString("path", "");
        DocumentFile root = rootFile();
        if (root == null || !root.exists()) {
            JSObject err = new JSObject();
            err.put("error", "尚未选择库目录,请先授权角色卡库文件夹");
            call.resolve(err);
            return;
        }
        // M4 支持子目录扫描(如 .bak_history 快照目录)
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
        walkDir(startDir, prefix, rel == null || rel.isEmpty(), files, categories);
        // 幽灵分组过滤:仅保留确实包含卡片的一级文件夹
        if (rel == null || rel.isEmpty()) {
            Set<String> cardFolders = new LinkedHashSet<>();
            for (JSObject f : files) {
                String sub = f.optString("subFolder");
                if (sub != null && !sub.isEmpty()) cardFolders.add(sub.split("/")[0]);
            }
            categories.removeIf(c -> !cardFolders.contains(c));
        }
        JSObject ret = new JSObject();
        JSArray arr = new JSArray(files);
        ret.put("files", arr);
        ret.put("categories", new JSArray(new ArrayList<>(categories)));
        ret.put("folderPath", "/library");
        call.resolve(ret);
    }

    /** 递归遍历目录,收集文件和文件夹信息 */
    private void walkDir(DocumentFile dir, String relDir, boolean skipHidden, List<JSObject> files, Set<String> categories) {
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
                d.put("mtime", queryLastModified(child));
                files.add(d);
                walkDir(child, relDir + name + "/", skipHidden, files, categories);
            } else if (child.isFile()) {
                String name = child.getName();
                if (name == null) continue;
                String ext = name.contains(".")
                        ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                        : "";
                if (!ext.equals("png") && !ext.equals("webp") && !ext.equals("json")) continue;
                JSObject o = new JSObject();
                o.put("name", name);
                o.put("path", "/library/" + relDir + name);
                o.put("isDirectory", false);
                o.put("url", JSObject.NULL);
                o.put("mtime", queryLastModified(child));
                o.put("birthtime", 0);
                o.put("subFolder", relDir.replaceAll("/+$", ""));
                o.put("category", relDir.isEmpty() ? "未分类" : relDir.split("/")[0]);
                if (ext.equals("png")) {
                    String embedded = extractChara(child);
                    if (embedded != null) {
                        try {
                            o.put("embeddedData", new org.json.JSONObject(embedded));
                        } catch (org.json.JSONException e) {
                            o.put("embeddedData", JSObject.NULL);
                        }
                    } else {
                        o.put("embeddedData", JSObject.NULL);
                    }
                } else {
                    o.put("embeddedData", JSObject.NULL);
                }
                files.add(o);
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
        DocumentFile f = fileByRelPath(path);
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
            // 文件不存在:若父目录存在则尝试创建
            String rel = path.replace('\\', '/').replaceAll("^/+", "");
            if (!rel.contains("/")) {
                call.reject("目标目录不可用(未授权)");
                return;
            }
            String dirRel = rel.substring(0, rel.lastIndexOf('/'));
            String name = rel.substring(rel.lastIndexOf('/') + 1);
            DocumentFile parent = fileByRelPath(dirRel);
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
                    if (ok) copied.add(call.getString("destPath", "") + "/" + name);
                    else failed.add(name);
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
        JSArray paths = call.getArray("paths");
        JSObject out = new JSObject();
        if (paths == null) {
            call.resolve(out);
            return;
        }
        try {
            for (int i = 0; i < paths.length(); i++) {
                String rel = paths.optString(i, "");
                if (rel.isEmpty()) continue;
                DocumentFile f = fileByRelPath(rel);
                if (f == null || !f.canRead()) continue;
                JSObject st = new JSObject();
                st.put("mtimeMs", f.lastModified());
                st.put("size", f.length());
                out.put(rel, st);
            }
        } catch (Exception e) { /* 单个失败不影响整体 */ }
        call.resolve(out);
    }

    /**
     * M4 磁盘扫描:SAF 临时授权任意目录(不持久化),遍历收集候选卡片文件(png/webp),
     * 每 100 个通过 scanProgress 事件上报进度;返回相对所选目录的相对路径。
     */
    @PluginMethod()
    public void scanFolder(final PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
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
}