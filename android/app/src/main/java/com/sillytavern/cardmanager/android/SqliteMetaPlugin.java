package com.sillytavern.cardmanager.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * 🚀 P2 B2: SQLite 元数据库插件（两万卡专项）。
 *
 * 轻量元数据快照存应用私有库（不走 SAF、免授权），提供：
 *   - 启动秒开：queryCards 一次 SQL 拿全量轻量字段（免读/合并 16 个 JSON 分片）
 *   - 增量维护：reconcile 结束后 upsertCards 事务批量 upsert（path 主键覆盖）
 *   - 版本/迁移：SCHEMA_VERSION + user_version；meta 表存 root_uri 供库目录切换失效
 * JSON 分片缓存（.jskzx_cache/）保留为回退路径：本插件任何异常，JS 侧自动回退。
 *
 * 参考 Anki schema（rslib/storage/schema11.sql）：path 主键 + csum(内容指纹) + usn(变更版本号)
 * + 复合索引(mtime,size / category,name)，为未来 diff reconcile / 排序分页下推预留。
 */
@CapacitorPlugin(name = "SqliteMetaPlugin")
public class SqliteMetaPlugin extends Plugin {

    private static final int SCHEMA_VERSION = 1;
    private SQLiteDatabase db = null;

    private SQLiteDatabase db() {
        if (db != null && db.isOpen()) return db;
        db = getContext().openOrCreateDatabase("jskzx_meta.db", Context.MODE_PRIVATE, null);
        try { db.execSQL("PRAGMA journal_mode=WAL"); } catch (Exception e) { /* 忽略 */ }
        migrate(db);
        return db;
    }

    private void migrate(SQLiteDatabase d) {
        if (d.getVersion() >= SCHEMA_VERSION) return;
        d.execSQL("CREATE TABLE IF NOT EXISTS cards (" +
                "path TEXT PRIMARY KEY, " +
                "name TEXT, creator TEXT, " +
                "desc TEXT, search_text TEXT, tags TEXT, " +
                "subfolder TEXT, category TEXT, " +
                "tokens INTEGER DEFAULT 0, flags INTEGER DEFAULT 0, " +
                "mtime INTEGER DEFAULT 0, size INTEGER DEFAULT 0, " +
                "csum INTEGER DEFAULT 0, usn INTEGER DEFAULT 0, " +
                "indexed_at INTEGER DEFAULT 0)");
        d.execSQL("CREATE INDEX IF NOT EXISTS ix_cards_mtime ON cards(mtime, size)");
        d.execSQL("CREATE INDEX IF NOT EXISTS ix_cards_cat ON cards(category, name)");
        d.execSQL("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
        d.setVersion(SCHEMA_VERSION);
    }

    @PluginMethod()
    public void init(PluginCall call) {
        try {
            // 注意:execSQL 禁止执行 SELECT("Queries can be performed using query or rawQuery methods only"),
            // 用 rawQuery 探活(顺带触发 db() 建表/迁移)
            try (Cursor c = db().rawQuery("SELECT 1", null)) { c.moveToFirst(); }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("version", SCHEMA_VERSION);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("meta init failed: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void setMeta(PluginCall call) {
        String k = call.getString("k");
        String v = call.getString("v");
        db().execSQL("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)", new Object[]{k, v});
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod()
    public void getMeta(PluginCall call) {
        String k = call.getString("k");
        JSObject ret = new JSObject();
        try (Cursor c = db().rawQuery("SELECT v FROM meta WHERE k=?", new String[]{k})) {
            ret.put("success", true);
            ret.put("value", c.moveToFirst() ? c.getString(0) : null);
        }
        call.resolve(ret);
    }

    @PluginMethod()
    public void upsertCards(PluginCall call) {
        JSArray cards = call.getArray("cards");
        if (cards == null || cards.length() == 0) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", 0);
            call.resolve(ret);
            return;
        }
        SQLiteDatabase d = db();
        d.beginTransaction();
        try {
            for (int i = 0; i < cards.length(); i++) {
                JSONObject o = cards.getJSONObject(i);
                d.execSQL("INSERT OR REPLACE INTO cards(path,name,creator,`desc`,search_text,tags," +
                                "subfolder,category,tokens,flags,mtime,size,csum,usn,indexed_at) " +
                                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        new Object[]{
                                o.optString("path"), o.optString("name"), o.optString("creator"),
                                o.optString("desc"), o.optString("search_text"), o.optString("tags"),
                                o.optString("subfolder"), o.optString("category"),
                                o.optLong("tokens"), o.optLong("flags"),
                                o.optLong("mtime"), o.optLong("size"),
                                o.optLong("csum"), o.optLong("usn"), System.currentTimeMillis()
                        });
            }
            d.setTransactionSuccessful();
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", cards.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("upsert failed: " + e.getMessage());
        } finally {
            d.endTransaction();
        }
    }

    /**
     * 🚀 BUG-17 fix-3:全量替换 DB(先 DELETE all 再 batch INSERT)。
     * 用于 reconcile/loadLibrary 完成后——清理外部工具直接删文件导致的 DB 幽灵卡，
     * 同时把所有变更一次落盘(比增量 upsert 更简单可靠)。
     */
    @PluginMethod()
    public void syncCards(PluginCall call) {
        JSArray cards = call.getArray("cards");
        if (cards == null) cards = new JSArray();
        SQLiteDatabase d = db();
        d.beginTransaction();
        try {
            d.delete("cards", null, null);
            String sql = "INSERT INTO cards(path,name,creator,`desc`,search_text,tags," +
                    "subfolder,category,tokens,flags,mtime,size,csum,usn,indexed_at) " +
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
            for (int i = 0; i < cards.length(); i++) {
                JSONObject o = cards.getJSONObject(i);
                d.execSQL(sql, new Object[]{
                        o.optString("path"), o.optString("name"), o.optString("creator"),
                        o.optString("desc"), o.optString("search_text"), o.optString("tags"),
                        o.optString("subfolder"), o.optString("category"),
                        o.optLong("tokens"), o.optLong("flags"),
                        o.optLong("mtime"), o.optLong("size"),
                        o.optLong("csum"), o.optLong("usn"), System.currentTimeMillis()
                });
            }
            d.setTransactionSuccessful();
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", cards.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("syncCards failed: " + e.getMessage());
        } finally {
            d.endTransaction();
        }
    }

    @PluginMethod()
    public void queryCards(PluginCall call) {
        JSArray rows = new JSArray();
        try (Cursor c = db().rawQuery(
                "SELECT path,name,creator,`desc`,search_text,tags,subfolder,category," +
                        "tokens,flags,mtime,size,csum,usn FROM cards", null)) {
            while (c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("path", c.getString(0));
                o.put("name", c.getString(1));
                o.put("creator", c.getString(2));
                o.put("desc", c.getString(3));
                o.put("search_text", c.getString(4));
                o.put("tags", c.getString(5));
                o.put("subfolder", c.getString(6));
                o.put("category", c.getString(7));
                o.put("tokens", c.getLong(8));
                o.put("flags", c.getLong(9));
                o.put("mtime", c.getLong(10));
                o.put("size", c.getLong(11));
                o.put("csum", c.getLong(12));
                o.put("usn", c.getLong(13));
                rows.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("cards", rows);
        call.resolve(ret);
    }

    @PluginMethod()
    public void countCards(PluginCall call) {
        JSObject ret = new JSObject();
        try (Cursor c = db().rawQuery("SELECT COUNT(*) FROM cards", null)) {
            c.moveToFirst();
            ret.put("success", true);
            ret.put("count", c.getLong(0));
        }
        call.resolve(ret);
    }

    /**
     * 🚀 BUG-17 修复:删除/移动后清理 SQLite 元数据行。
     * INSERT OR REPLACE 只覆盖不删除,删除的卡会永久残留 DB → 每次重启 DB restore
     * 都出现幽灵卡(reconcile 移除后 persistMetas 又不清残行,循环复现)。
     * 分批 DELETE(每批 500,规避 SQLite 变量上限),path 为 /library/ 前缀绝对路径。
     */
    @PluginMethod()
    public void deleteCards(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null || paths.length() == 0) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", 0);
            call.resolve(ret);
            return;
        }
        SQLiteDatabase d = db();
        d.beginTransaction();
        int deleted = 0;
        try {
            StringBuilder sb = new StringBuilder("DELETE FROM cards WHERE path IN (?");
            for (int i = 1; i < Math.min(paths.length(), 500); i++) sb.append(",?");
            sb.append(")");
            String sql = sb.toString();
            try (android.database.sqlite.SQLiteStatement stmt = d.compileStatement(sql)) {
                for (int start = 0; start < paths.length(); start += 500) {
                    int end = Math.min(start + 500, paths.length());
                    for (int i = start; i < end; i++) stmt.bindString(i - start + 1, paths.getString(i));
                    deleted += stmt.executeUpdateDelete();
                    stmt.clearBindings();
                }
            }
            d.setTransactionSuccessful();
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", deleted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("deleteCards failed: " + e.getMessage());
        } finally {
            d.endTransaction();
        }
    }

    @PluginMethod()
    public void clearCards(PluginCall call) {
        db().delete("cards", null, null);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
