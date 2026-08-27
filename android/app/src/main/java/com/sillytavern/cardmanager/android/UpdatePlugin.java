package com.sillytavern.cardmanager.android;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * JSKZX App - OTA 更新插件
 *
 * checkUpdate:请求发布源(GitHub Releases API 或自定义 JSON),返回最新版本信息(不做自动安装)
 * downloadUpdate:下载 APK 到应用缓存目录,实时上报 updateProgress 事件
 * installUpdate:经 FileProvider 授权,调用系统安装器升级
 */
@CapacitorPlugin(name = "UpdatePlugin")
public class UpdatePlugin extends Plugin {

    private static final String UPDATES_DIR = "updates";

    /** 检查更新:feed 支持 GitHub Releases API(api.github.com/...) 或自定义 {version,url,[notes],[size],[name]} JSON */
    @PluginMethod()
    public void checkUpdate(PluginCall call) {
        String feed = call.getString("feed");
        if (feed == null || feed.trim().isEmpty()) {
            call.reject("更新源地址为空");
            return;
        }
        new Thread(() -> {
            BufferedInputStream in = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(feed.trim()).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("Accept", "application/json");
                conn.setRequestProperty("User-Agent", "JSKZX-App/1.9 (update-check)");
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("更新源请求失败 HTTP " + code);
                    return;
                }
                // GitHub API 可能返回 gzip,Content-Encoding 处理
                InputStream raw = conn.getInputStream();
                if ("gzip".equalsIgnoreCase(conn.getContentEncoding())) {
                    raw = new java.util.zip.GZIPInputStream(raw);
                }
                in = new BufferedInputStream(raw);
                byte[] buf = new byte[64 * 1024];
                int n;
                StringBuilder sb = new StringBuilder();
                while ((n = in.read(buf)) != -1) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                String body = sb.toString();

                String feedLower = feed.toLowerCase();
                if (feedLower.contains("api.github.com")) {
                    // releases/latest 返回对象;releases 返回数组(取首个)
                    JSONObject tagInfo;
                    if (body.trim().startsWith("[")) {
                        JSONArray arr = new JSONArray(body);
                        if (arr.length() == 0) {
                            call.resolve(callSuccessNoUpdate());
                            return;
                        }
                        tagInfo = arr.getJSONObject(0);
                    } else {
                        tagInfo = new JSONObject(body);
                    }
                    if (!tagInfo.has("assets") || tagInfo.isNull("assets")) {
                        call.resolve(callSuccessNoUpdate());
                        return;
                    }
                    JSONArray assets = tagInfo.getJSONArray("assets");
                    String apkUrl = null;
                    String apkName = "";
                    long size = 0;
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject a = assets.getJSONObject(i);
                        String n2 = a.optString("name", "");
                        if (n2 != null && n2.toLowerCase().contains(".apk")) {
                            apkUrl = a.optString("browser_download_url", a.optString("url", ""));
                            apkName = n2;
                            size = a.optLong("size", 0);
                            break;
                        }
                    }
                    if (apkUrl == null || apkUrl.isEmpty()) {
                        call.resolve(callSuccessNoUpdate());
                        return;
                    }
                    JSObject ret = callBase();
                    ret.put("version", tagInfo.optString("tag_name", "").replaceFirst("^v", ""));
                    ret.put("name", tagInfo.optString("name", apkName));
                    ret.put("url", apkUrl);
                    ret.put("size", size);
                    ret.put("notes", tagInfo.optString("body", ""));
                    call.resolve(ret);
                } else {
                    // 自定义 JSON: {version, url[, notes][, size][, name]}
                    JSONObject o = new JSONObject(body);
                    String url = o.optString("url", "");
                    String version = o.optString("version", "");
                    if (url.isEmpty() || version.isEmpty()) {
                        call.resolve(callSuccessNoUpdate());
                        return;
                    }
                    JSObject ret = callBase();
                    ret.put("version", version);
                    ret.put("name", o.optString("name", version));
                    ret.put("url", url);
                    ret.put("size", o.optLong("size", 0));
                    ret.put("notes", o.optString("notes", ""));
                    call.resolve(ret);
                }
            } catch (Exception e) {
                call.reject("检查更新失败: " + e.getMessage());
            } finally {
                if (in != null) try { in.close(); } catch (Exception ignore) {}
            }
        }).start();
    }

    private JSObject callSuccessNoUpdate() {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("update", false);
        return ret;
    }

    private JSObject callBase() {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("update", true);
        return ret;
    }

    /** 下载 APK 到缓存目录;上报 updateProgress {received,total,percent} */
    @PluginMethod()
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "jszkx-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("下载地址为空");
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), UPDATES_DIR);
            if (!dir.exists()) dir.mkdirs();
            File target = new File(dir, safeFileName(fileName));
            BufferedInputStream in = null;
            BufferedOutputStream out = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("User-Agent", "JSKZX-App/1.9 (update-download)");
                conn.setInstanceFollowRedirects(true);
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("下载失败 HTTP " + code);
                    return;
                }
                long total = conn.getContentLengthLong();
                long received = 0;
                in = new BufferedInputStream(conn.getInputStream());
                out = new BufferedOutputStream(new FileOutputStream(target, false));
                byte[] buf = new byte[64 * 1024];
                int n;
                int percent = 0;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    received += n;
                    int p = (total > 0) ? (int) Math.min(100, Math.round(received * 100.0 / total)) : -1;
                    if (p != percent) {
                        percent = p;
                        JSObject ev = new JSObject();
                        ev.put("received", received);
                        ev.put("total", total);
                        ev.put("percent", p);
                        ev.put("phase", "download");
                        notifyListeners("updateProgress", ev);
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;

                // 完整性粗检:声明大小与实际大小一致
                if (total > 0 && target.length() != total) {
                    target.delete();
                    call.reject("下载不完整,已清理");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("filePath", target.getAbsolutePath());
                ret.put("fileName", target.getName());
                call.resolve(ret);
            } catch (Exception e) {
                if (target.exists()) target.delete();
                call.reject("下载失败: " + e.getMessage());
            } finally {
                if (in != null) try { in.close(); } catch (Exception ignore) {}
                if (out != null) try { out.close(); } catch (Exception ignore) {}
            }
        }).start();
    }

    /** 经 FileProvider 授权调用系统安装器(未知来源需用户在系统安装页确认) */
    @PluginMethod()
    public void installUpdate(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("安装包路径为空");
            return;
        }
        try {
            File apk = new File(filePath);
            if (!apk.exists()) {
                call.reject("安装包不存在");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("拉起安装器失败: " + e.getMessage());
        }
    }

    private String safeFileName(String name) {
        String n = name == null ? "jszkx-update.apk" : name.replaceAll("[^a-zA-Z0-9._-]", "_");
        return n.isEmpty() ? "jszkx-update.apk" : n;
    }
}