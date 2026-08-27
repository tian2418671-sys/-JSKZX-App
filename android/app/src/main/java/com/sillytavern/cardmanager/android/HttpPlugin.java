package com.sillytavern.cardmanager.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

import androidx.documentfile.provider.DocumentFile;

/**
 * 网络转发桥接:渲染层 fetch 会被 WebView CORS 拦截,统一走本插件(OkHttp 语义,HttpsURLConnection 实现)
 *  - post:JSON POST(聊天补全 / 任意转发)
 *  - get:GET 请求(模型列表 / URL 抓取)
 * 支持 http 明文(manifest 已开 usesCleartextTraffic)与 https;8s 连接超时、120s 读超时
 */
@CapacitorPlugin(name = "HttpPlugin")
public class HttpPlugin extends Plugin {

    @PluginMethod()
    public void post(PluginCall call) {
        String url = call.getString("url");
        String body = call.getString("body", "");
        if (url == null || url.isEmpty()) {
            call.reject("url 缺失");
            return;
        }
        JSONObject headers = call.getData().optJSONObject("headers");
        run(call, "POST", url, body, headers, "postResult");
    }

    @PluginMethod()
    public void get(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url 缺失");
            return;
        }
        JSONObject headers = call.getData().optJSONObject("headers");
        run(call, "GET", url, null, headers, "getResult");
    }

    /**
     * M4 二进制下载:GET 请求返回 base64 编码的响应体(用于下载角色卡 PNG/世界书等二进制文件)。
     * 支持 20MB 上限;返回 {success, status, body(文本), data(base64)} 
     */
    @PluginMethod()
    public void downloadBytes(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url 缺失");
            return;
        }
        JSONObject headers = call.getData().optJSONObject("headers");
        final int timeout = call.getInt("timeout", 120 * 1000);
        final int maxBytes = call.getInt("maxBytes", 20 * 1024 * 1024);
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(Math.max(5000, timeout));
                conn.setRequestProperty("Accept", "*/*");
                conn.setRequestProperty("User-Agent", "JSKZX-App/1.9 (download)");
                if (headers != null) {
                    Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        conn.setRequestProperty(k, String.valueOf(headers.opt(k)));
                    }
                }
                conn.setDoOutput(false);
                // 体积上限前置检查
                int contentLen = conn.getContentLength();
                if (contentLen > maxBytes) {
                    call.reject("文件过大(超过 " + (maxBytes / 1024 / 1024) + "MB)，已中止下载");
                    return;
                }
                int code = conn.getResponseCode();
                InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                if (is == null) {
                    call.reject("HTTP " + code + ": 响应体为空");
                    return;
                }
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int total = 0;
                int n;
                while ((n = is.read(buf)) != -1) {
                    total += n;
                    if (total > maxBytes) {
                        is.close();
                        call.reject("文件过大(超过 " + (maxBytes / 1024 / 1024) + "MB)，已中止下载");
                        return;
                    }
                    bos.write(buf, 0, n);
                }
                is.close();
                byte[] raw = bos.toByteArray();
                if (raw.length == 0) {
                    call.reject("下载内容为空");
                    return;
                }
                String b64 = android.util.Base64.encodeToString(raw, android.util.Base64.NO_WRAP);
                JSObject ret = new JSObject();
                ret.put("success", code >= 200 && code < 300);
                ret.put("status", code);
                ret.put("data", b64);
                ret.put("size", raw.length);
                call.resolve(ret);
            } catch (java.net.SocketTimeoutException e) {
                call.reject("下载超时: " + url);
            } catch (Exception e) {
                String hint = e.getMessage() == null ? "未知网络错误" : e.getMessage();
                if (hint.contains("Failed to connect") || hint.contains("Connection refused")) {
                    hint = "无法连接到服务器(连接被拒绝)";
                } else if (hint.contains("UnknownHost")) {
                    hint = "无法解析主机名";
                }
                call.reject("下载失败: " + hint);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void run(final PluginCall call, final String method, final String url,
                     final String body, final JSONObject headers, final String callbackName) {
        final int readTimeout = call.getInt("timeout", 120 * 1000);
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod(method);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(Math.max(5000, readTimeout));
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                conn.setRequestProperty("User-Agent", "JSKZX-App/1.9 (" + CallBackName(callbackName) + ")");
                if (headers != null) {
                    Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        conn.setRequestProperty(k, String.valueOf(headers.opt(k)));
                    }
                }
                if ("POST".equals(method)) {
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write((body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8));
                    }
                } else {
                    conn.setDoOutput(false);
                }
                int code = conn.getResponseCode();
                InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                String resp = is == null ? "" : readAllForNetwork(is);
                JSObject ret = new JSObject();
                ret.put("success", code >= 200 && code < 300);
                ret.put("status", code);
                ret.put("body", resp);
                call.resolve(ret);
            } catch (java.net.SocketTimeoutException e) {
                call.reject((method.equals("POST") ? "POST " : "GET ") + url + " 请求超时: 未在限定时间内得到响应(连接 8s / 读取 " + (readTimeout / 1000) + "s)");
            } catch (Exception e) {
                String msg = e.getMessage();
                String hint = msg == null ? "未知网络错误" : msg;
                // 关键网络场景下给出可读的失败原因
                if (hint.contains("Failed to connect") || hint.contains("Connection refused")) {
                    hint = "无法连接到服务端(连接被拒绝,请检查端点地址与服务状态)";
                } else if (hint.contains("UnknownHost") || hint.contains("CLEARTEXT")) {
                    hint = "无法解析主机或明文请求被拦截,请检查端点地址(https 或已放行明文)";
                }
                call.reject((method.equals("POST") ? "POST " : "GET ") + url + " 请求失败: " + hint);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private String CallBackName(final String n) {
        return n == null ? "x" : n;
    }

    /**
     * M4 推送酒馆:multipart/form-data 上传库内文件到指定端点(协议对齐桌面 tavern:push)。
     * 读取库根相对路径下的文件 → 组装 multipart(字段 avatar) → POST;失败返回可读 HTTP 错误。 
     */
    @PluginMethod()
    public void pushCard(PluginCall call) {
        String url = call.getString("url");
        String fieldName = call.getString("fieldName", "avatar");
        String fileName = call.getString("fileName", "card.png");
        String relPath = call.getString("relPath");
        String apiKey = call.getString("apiKey", "");
        JSONObject headers = call.getData().optJSONObject("headers");
        final int timeout = call.getInt("timeout", 60 * 1000);
        if (url == null || url.isEmpty() || relPath == null || relPath.isEmpty()) {
            call.reject("url / relPath 缺失");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                byte[] fileBytes = readLibFile(relPath);
                if (fileBytes == null) {
                    call.reject("读取卡片文件失败(请确认已在设置中授权卡片库目录)");
                    return;
                }
                String boundary = "----JSKZX" + System.currentTimeMillis();
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(Math.max(5000, timeout));
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                conn.setRequestProperty("User-Agent", "JSKZX-App/1.9 (push-card)");
                if (apiKey != null && !apiKey.trim().isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + apiKey.trim());
                }
                if (headers != null) {
                    Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        conn.setRequestProperty(k, String.valueOf(headers.opt(k)));
                    }
                }
                try (OutputStream os = conn.getOutputStream()) {
                    writeMultipart(os, boundary, fieldName, fileName, fileBytes);
                }
                int code = conn.getResponseCode();
                InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                String resp = is == null ? "" : readAllForNetwork(is);
                if (code >= 200 && code < 300) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("status", code);
                    ret.put("body", resp);
                    call.resolve(ret);
                } else if (code == 403) {
                    call.reject("HTTP 403 Forbidden：请确认酒馆已开启 API 扩展（设置 → Extensions → API），并检查 API 密码是否正确。");
                } else {
                    call.reject("HTTP " + code + ": " + String.valueOf(resp).replaceAll("\\s+", " ").trim().substring(0, Math.min(200, String.valueOf(resp).length())));
                }
            } catch (java.net.SocketTimeoutException e) {
                call.reject("推送超时: 未在限定时间内得到响应(连接 8s / 读取 " + (timeout / 1000) + "s)");
            } catch (Exception e) {
                String hint = e.getMessage() == null ? "未知网络错误" : e.getMessage();
                if (hint.contains("Failed to connect") || hint.contains("Connection refused")) {
                    hint = "无法连接到酒馆(连接被拒绝,请检查地址与酒馆服务是否启动)";
                } else if (hint.contains("UnknownHost")) {
                    hint = "无法解析酒馆地址(请检查 IP/域名是否正确)";
                }
                call.reject("推送失败: " + hint);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /** 读取库根相对路径文件字节(共享 same logic as LibraryFsPlugin 的 fileByRelPath) */
    private byte[] readLibFile(String relPath) {
        try {
            android.content.SharedPreferences prefs = getContext().getSharedPreferences(
                    "library_store", android.content.Context.MODE_PRIVATE);
            String s = prefs.getString("root_uri", null);
            if (s == null) return null;
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), android.net.Uri.parse(s));
            if (root == null) return null;
            String relNorm = relPath.replace('\\', '/').replaceAll("^/+", "");
            String[] segs = relNorm.split("/");
            DocumentFile cur = root;
            for (String seg : segs) {
                if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
                DocumentFile next = cur.findFile(seg);
                if (next == null) return null;
                cur = next;
            }
            if (!cur.canRead()) return null;
            if (cur.length() > 100L * 1024 * 1024) return null; // 超 100MB 拒绝,避免 OOM
            InputStream in = getContext().getContentResolver().openInputStream(cur.getUri());
            if (in == null) return null;
            try {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                return out.toByteArray();
            } finally {
                in.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    private void writeMultipart(OutputStream os, String boundary, String fieldName,
                                String fileName, byte[] fileBytes) throws IOException {
        String mime = "application/octet-stream";
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".png")) mime = "image/png";
        else if (lower.endsWith(".webp")) mime = "image/webp";
        else if (lower.endsWith(".json")) mime = "application/json";
        os.write(("\r\n--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        os.write(("Content-Disposition: form-data; name=\"" + fieldName
                + "\"; filename=\"" + fileName + "\"\r\n").getBytes(StandardCharsets.UTF_8));
        os.write(("Content-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        os.write(fileBytes);
        os.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
    }

    private String readAllForNetwork(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        int total = 0;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > 64 * 1024 * 1024) return "";
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}