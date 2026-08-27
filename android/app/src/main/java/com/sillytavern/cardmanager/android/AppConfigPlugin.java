package com.sillytavern.cardmanager.android;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * 全局配置持久化
 * 存储 app_config.json 对应的全量配置对象,以 JSON 串存入 SharedPreferences(私有存储,无需 SAF 权限)
 */
@CapacitorPlugin(name = "AppConfigPlugin")
public class AppConfigPlugin extends Plugin {

    private static final String PREFS = "app_config";
    private static final String KEY_CONFIG = "config_json";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod()
    public void load(PluginCall call) {
        String raw = prefs().getString(KEY_CONFIG, "{}");
        try {
            JSONObject obj = new JSONObject(raw);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("config", obj);
            call.resolve(ret);
        } catch (JSONException e) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("config", new JSONObject());
            call.resolve(ret);
        }
    }

    @PluginMethod()
    public void save(PluginCall call) {
        Object config = call.getData().opt("config"); // opt:不抛 JSONException
        if (config == null) {
            call.reject("config 参数缺失");
            return;
        }
        String raw;
        if (config instanceof String) {
            raw = (String) config;
        } else if (config instanceof JSONObject) {
            raw = config.toString();
        } else {
            call.reject("config 类型无效,应为 JSON 对象");
            return;
        }
        prefs().edit().putString(KEY_CONFIG, raw).apply();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // region 酒馆路径持久化(用于 autoDetectTavernPath 替代方案)

    private static final String KEY_TAVERN_PATH = "tavern_path";
    private static final String KEY_TAVERN_TITLE = "tavern_title";

    @PluginMethod()
    public void saveTavernPath(PluginCall call) {
        String uri = call.getString("uri");
        String title = call.getString("title", "SillyTavern");
        if (uri == null || uri.isEmpty()) {
            call.reject("uri 参数缺失");
            return;
        }
        prefs().edit()
            .putString(KEY_TAVERN_PATH, uri)
            .putString(KEY_TAVERN_TITLE, title)
            .apply();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod()
    public void loadTavernPath(PluginCall call) {
        String uri = prefs().getString(KEY_TAVERN_PATH, "");
        String title = prefs().getString(KEY_TAVERN_TITLE, "");
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("path", uri);
        ret.put("title", title);
        ret.put("hasSaved", !uri.isEmpty());
        call.resolve(ret);
    }

    @PluginMethod()
    public void clearTavernPath(PluginCall call) {
        prefs().edit()
            .remove(KEY_TAVERN_PATH)
            .remove(KEY_TAVERN_TITLE)
            .apply();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // endregion
}