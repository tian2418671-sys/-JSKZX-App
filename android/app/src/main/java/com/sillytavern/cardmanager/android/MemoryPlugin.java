package com.sillytavern.cardmanager.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * 长期记忆插件（MemoryChat 方案 B 融合，移动端专属）
 *  - 用 Android 内置 SQLite 存储分层记忆（fact 事实 / summary 摘要 / message 原始消息）
 *  - 检索采用关键词匹配（MVP；后续可升级 sqlite-vec 向量检索）
 *  - 与桌面版无关，仅移动端原生层实现
 * 表：memory_items(id, type, content, card_name, created_at)
 */
@CapacitorPlugin(name = "MemoryPlugin")
public class MemoryPlugin extends Plugin {

    private static final String DB_NAME = "memory.db";
    private static final int DB_VERSION = 1;

    private static class DBHelper extends SQLiteOpenHelper {
        DBHelper(Context ctx) {
            super(ctx, DB_NAME, null, DB_VERSION);
        }
        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS memory_items (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "type TEXT NOT NULL," +
                "content TEXT NOT NULL," +
                "card_name TEXT," +
                "created_at INTEGER NOT NULL)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_type ON memory_items(type)");
        }
        @Override
        public void onUpgrade(SQLiteDatabase db, int oldV, int newV) {
            db.execSQL("DROP TABLE IF EXISTS memory_items");
            onCreate(db);
        }
    }

    private DBHelper helper;

    private synchronized SQLiteDatabase db() {
        if (helper == null) helper = new DBHelper(getContext());
        return helper.getWritableDatabase();
    }

    /** 新增记忆：{ type: fact|summary|message, content, cardName? } */
    @PluginMethod
    public void add(PluginCall call) {
        String type = call.getString("type", "message");
        String content = call.getString("content", "").trim();
        String cardName = call.getString("cardName", "");
        if (content.isEmpty()) {
            call.reject("content 缺失");
            return;
        }
        try {
            ContentValues cv = new ContentValues();
            cv.put("type", type);
            cv.put("content", content);
            cv.put("card_name", cardName);
            cv.put("created_at", System.currentTimeMillis());
            long id = db().insertOrThrow("memory_items", null, cv);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("id", id);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** 关键词检索：{ query, limit? } → { success, items } */
    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query", "").trim();
        int limit = Math.max(1, Math.min(call.getInt("limit", 20), 200));
        Cursor c = null;
        try {
            SQLiteDatabase db = db();
            String sel;
            List<String> args = new ArrayList<>();
            if (query.isEmpty()) {
                sel = "SELECT * FROM memory_items ORDER BY created_at DESC LIMIT ?";
                args.add(String.valueOf(limit));
            } else {
                String[] words = query.split("[\\s,，。.!！?？;；:：、]+");
                StringBuilder where = new StringBuilder();
                for (String w : words) {
                    if (w.isEmpty()) continue;
                    if (where.length() > 0) where.append(" OR ");
                    where.append("content LIKE ?");
                    args.add("%" + w + "%");
                }
                if (where.length() == 0) {
                    where.append("content LIKE ?");
                    args.add("%" + query + "%");
                }
                sel = "SELECT * FROM memory_items WHERE " + where.toString() +
                    " ORDER BY created_at DESC LIMIT " + limit;
            }
            c = db.rawQuery(sel, args.toArray(new String[0]));
            JSArray items = new JSArray();
            while (c.moveToNext()) {
                items.put(rowToObject(c));
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("items", items);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        } finally {
            if (c != null) c.close();
        }
    }

    /** 列出记忆：{ type?, limit? } → { success, items } */
    @PluginMethod
    public void list(PluginCall call) {
        String type = call.getString("type", "");
        int limit = Math.max(1, Math.min(call.getInt("limit", 100), 500));
        Cursor c = null;
        try {
            SQLiteDatabase db = db();
            String sel;
            List<String> args = new ArrayList<>();
            if (type == null || type.isEmpty()) {
                sel = "SELECT * FROM memory_items ORDER BY created_at DESC LIMIT ?";
                args.add(String.valueOf(limit));
            } else {
                sel = "SELECT * FROM memory_items WHERE type = ? ORDER BY created_at DESC LIMIT ?";
                args.add(type);
                args.add(String.valueOf(limit));
            }
            c = db.rawQuery(sel, args.toArray(new String[0]));
            JSArray items = new JSArray();
            while (c.moveToNext()) {
                items.put(rowToObject(c));
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("items", items);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        } finally {
            if (c != null) c.close();
        }
    }

    /** 删除单条：{ id } */
    @PluginMethod
    public void remove(PluginCall call) {
        long id = call.getLong("id", -1L);
        if (id < 0) {
            call.reject("id 缺失");
            return;
        }
        try {
            int n = db().delete("memory_items", "id = ?", new String[]{ String.valueOf(id) });
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("removed", n);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** 清空：{ type? } 缺省全清 */
    @PluginMethod
    public void clear(PluginCall call) {
        String type = call.getString("type", "");
        try {
            int n;
            if (type == null || type.isEmpty()) {
                n = db().delete("memory_items", null, null);
            } else {
                n = db().delete("memory_items", "type = ?", new String[]{ type });
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("cleared", n);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private JSObject rowToObject(Cursor c) {
        JSObject o = new JSObject();
        o.put("id", c.getLong(c.getColumnIndexOrThrow("id")));
        o.put("type", c.getString(c.getColumnIndexOrThrow("type")));
        o.put("content", c.getString(c.getColumnIndexOrThrow("content")));
        o.put("cardName", c.getString(c.getColumnIndexOrThrow("card_name")));
        o.put("createdAt", c.getLong(c.getColumnIndexOrThrow("created_at")));
        return o;
    }
}
