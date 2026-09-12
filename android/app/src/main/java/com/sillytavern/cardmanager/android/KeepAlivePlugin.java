package com.sillytavern.cardmanager.android;

import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 后台保活插件（Bug 反馈#2：切换后台进程即被杀）
 *  - start():应用处于前台时启动保活前台服务(Android 12+ 禁止后台直接启动 FGS,
 *    因此由渲染层在 App 启动/设置页开启时调用,此时必为前台)
 *  - stop():停止保活服务并释放 WakeLock
 *  - isRunning():查询保活当前状态(供设置页开关回显)
 * 保活开关持久化在 AppConfig(JS 侧),插件层只负责服务生命周期。
 */
@CapacitorPlugin(name = "KeepAlivePlugin")
public class KeepAlivePlugin extends Plugin {

    public static final String ACTION_START = "com.sillytavern.cardmanager.android.KEEPALIVE_START";

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent it = new Intent(ctx, KeepAliveService.class);
            it.setAction(ACTION_START);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                ctx.startForegroundService(it);
            } else {
                ctx.startService(it);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("running", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("启动保活失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.stopService(new Intent(ctx, KeepAliveService.class));
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("running", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("停止保活失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("running", KeepAliveService.isRunning());
        call.resolve(ret);
    }
}