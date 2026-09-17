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

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/**
 * 长期记忆插件（MemoryChat 方案 B 融合，移动端专属）
 *  - 用 Android 内置 SQLite 存储分层记忆（fact 事实 / summary 摘要 / message 原始消息）
 *  - fact 为「记忆表格」行：key(键) + content(值)，注入时以 Markdown 表格呈现
 *  - 检索采用关键词匹配（MVP；后续可升级 sqlite-vec 向量检索）
 *  - 与桌面版无关，仅移动端原生层实现
 * 表：memory_items(id, type, content, key, card_name, created_at, card_path, updated_at, confirmed)
 * 治理：同卡同内容 10 分钟内去重（防失败重试/重复发送导致重复记忆）；message 型每卡仅保留最近 40 条
 * v3 分桶：card_path = 卡唯一标识（库内相对路径），记录/注入/查看按它；card_name 降级为纯展示
 */
@CapacitorPlugin(name = "MemoryPlugin")
public class MemoryPlugin extends Plugin {

    private static final String DB_NAME = "memory.db";
    private static final int DB_VERSION = 3;

    private static final int MESSAGE_KEEP = 40;          // 每卡保留的 message 型记忆条数
    private static final int FACT_KEEP = 50;             // 每卡保留的 fact 型记忆条数（D4 兜底，防极端膨胀）
    private static final long DUP_WINDOW_MS = 10 * 60 * 1000L; // 去重窗口：10 分钟

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
                "key TEXT," +
                "card_name TEXT," +
                "created_at INTEGER NOT NULL," +
                "card_path TEXT," +
                "updated_at INTEGER," +
                "confirmed INTEGER DEFAULT 1)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_type ON memory_items(type)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_card_path ON memory_items(card_path, type)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_card_upd ON memory_items(card_path, updated_at)");
        }
        @Override
        public void onUpgrade(SQLiteDatabase db, int oldV, int newV) {
            // v1 → v2：新增 key 列（记忆表格键值），保留既有数据
            if (oldV < 2) {
                db.execSQL("ALTER TABLE memory_items ADD COLUMN key TEXT");
            }
            // v2 → v3：新增 card_path（卡唯一标识分桶）/ updated_at（D4 覆盖+降级排序）/ confirmed（确认状态）
            // 幂等：ADD COLUMN 前查列存在（迁移可重跑）
            if (oldV < 3) {
                if (!hasColumn(db, "memory_items", "card_path")) {
                    db.execSQL("ALTER TABLE memory_items ADD COLUMN card_path TEXT");
                }
                if (!hasColumn(db, "memory_items", "updated_at")) {
                    db.execSQL("ALTER TABLE memory_items ADD COLUMN updated_at INTEGER");
                }
                if (!hasColumn(db, "memory_items", "confirmed")) {
                    db.execSQL("ALTER TABLE memory_items ADD COLUMN confirmed INTEGER DEFAULT 1");
                }
                // 存量行补 updated_at = created_at（历史数据按创建时间排序）
                db.execSQL("UPDATE memory_items SET updated_at = created_at WHERE updated_at IS NULL");
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_card_path ON memory_items(card_path, type)");
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_mem_card_upd ON memory_items(card_path, updated_at)");
            }
        }
        private static boolean hasColumn(SQLiteDatabase db, String table, String col) {
            Cursor c = db.rawQuery("PRAGMA table_info(" + table + ")", null);
            try {
                int nameIdx = c.getColumnIndex("name");
                while (c.moveToNext()) {
                    if (col.equals(c.getString(nameIdx))) return true;
                }
                return false;
            } finally {
                c.close();
            }
        }
    }

    private DBHelper helper;

    private synchronized SQLiteDatabase db() {
        if (helper == null) helper = new DBHelper(getContext());
        return helper.getWritableDatabase();
    }

    /** 新增记忆：{ type: fact|summary|message, content, key?, cardName?, cardPath? }；去重+D4 同 key 覆盖+message 修剪 */
    @PluginMethod
    public void add(PluginCall call) {
        String type = call.getString("type", "message");
        String content = call.getString("content", "").trim();
        String key = call.getString("key", "");
        String cardName = call.getString("cardName", "");
        String cardPath = call.getString("cardPath", "");
        if (content.isEmpty()) {
            call.reject("content 缺失");
            return;
        }
        try {
            SQLiteDatabase db = db();
            long now = System.currentTimeMillis();
            // D4：fact 型且 key 非空时，检查同 key+card_path 冲突 → UPDATE（保留首次 created_at，刷新 updated_at）
            if ("fact".equals(type) && key != null && !key.isEmpty() && cardPath != null && !cardPath.isEmpty()) {
                Cursor dup = db.rawQuery(
                    "SELECT id FROM memory_items WHERE type='fact' AND key=? AND card_path=? LIMIT 1",
                    new String[]{ key, cardPath });
                long existingId = -1L;
                try {
                    if (dup.moveToFirst()) existingId = dup.getLong(0);
                } finally { dup.close(); }
                if (existingId > 0) {
                    ContentValues cv = new ContentValues();
                    cv.put("content", content);
                    cv.put("updated_at", now);
                    // D4 冲突时同步更新 card_name（防止改名后旧值残留）
                    if (cardName != null && !cardName.isEmpty()) cv.put("card_name", cardName);
                    db.update("memory_items", cv, "id = ?", new String[]{ String.valueOf(existingId) });
                    // D4 兜底：单卡 fact 上限 50 条，超出按 updated_at ASC 删最旧
                    factCapCheck(db, cardPath);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("id", existingId);
                    ret.put("skipped", false);
                    ret.put("updated", true);
                    call.resolve(ret);
                    return;
                }
            }
            // 去重：同卡同类型同内容在去重窗口内已存在 → 幂等跳过（防失败重试/连发重复记录）
            // 去重逻辑按 cardPath（有则按 cardPath），否则降级按 cardName
            String dupCardCol = (cardPath != null && !cardPath.isEmpty()) ? "card_path" : "card_name";
            String dupCardVal = (cardPath != null && !cardPath.isEmpty()) ? cardPath : (cardName == null ? "" : cardName);
            Cursor dup = db.rawQuery(
                "SELECT id FROM memory_items WHERE type = ? AND content = ? AND " + dupCardCol + " = ? AND created_at >= ? LIMIT 1",
                new String[]{ type, content, dupCardVal, String.valueOf(now - DUP_WINDOW_MS) });
            boolean dupHit = false;
            long dupId = -1L;
            try {
                if (dup.moveToFirst()) { dupHit = true; dupId = dup.getLong(0); }
            } finally { dup.close(); }
            if (dupHit) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("id", dupId);
                ret.put("skipped", true);
                call.resolve(ret);
                return;
            }
            ContentValues cv = new ContentValues();
            cv.put("type", type);
            cv.put("content", content);
            if (key != null && !key.isEmpty()) cv.put("key", key);
            cv.put("card_name", cardName);
            if (cardPath != null && !cardPath.isEmpty()) cv.put("card_path", cardPath);
            cv.put("created_at", now);
            cv.put("updated_at", now);  // v3：覆盖刷新用
            cv.put("confirmed", 1);     // P0 恒为 1（照常注入）
            long id = db.insertOrThrow("memory_items", null, cv);
            // message 型修剪：每卡仅保留最近 MESSAGE_KEEP 条（L1 原始消息是短期上下文，防库无限膨胀）
            if ("message".equals(type)) {
                if (cardPath != null && !cardPath.isEmpty()) {
                    // v3：按 card_path 分桶修剪
                    db.execSQL(
                        "DELETE FROM memory_items WHERE type = 'message' AND card_path = ? AND id NOT IN " +
                        "(SELECT id FROM memory_items WHERE type = 'message' AND card_path = ? ORDER BY id DESC LIMIT " + MESSAGE_KEEP + ")",
                        new String[]{ cardPath, cardPath });
                } else {
                    // 兼容 v2 数据：按 card_name 修剪（迁移前存量数据无 card_path）
                    String card = cardName == null ? "" : cardName;
                    db.execSQL(
                        "DELETE FROM memory_items WHERE type = 'message' AND card_name = ? AND id NOT IN " +
                        "(SELECT id FROM memory_items WHERE type = 'message' AND card_name = ? ORDER BY id DESC LIMIT " + MESSAGE_KEEP + ")",
                        new String[]{ card, card });
                }
            }
            // D4 兜底：fact 型插入后检查单卡上限
            if ("fact".equals(type) && cardPath != null && !cardPath.isEmpty()) {
                factCapCheck(db, cardPath);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("id", id);
            ret.put("skipped", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** D4 兜底：单卡 fact 上限 FACT_KEEP 条，超出按 updated_at ASC 删最旧 */
    private void factCapCheck(SQLiteDatabase db, String cardPath) {
        Cursor c = db.rawQuery("SELECT COUNT(*) FROM memory_items WHERE type='fact' AND card_path=?", new String[]{ cardPath });
        int count = 0;
        try {
            if (c.moveToFirst()) count = c.getInt(0);
        } finally { c.close(); }
        if (count > FACT_KEEP) {
            db.execSQL(
                "DELETE FROM memory_items WHERE type='fact' AND card_path=? AND id NOT IN " +
                "(SELECT id FROM memory_items WHERE type='fact' AND card_path=? ORDER BY updated_at DESC LIMIT " + FACT_KEEP + ")",
                new String[]{ cardPath, cardPath });
        }
    }

    /** 更新单条：{ id, key?, content?, confirmed? }（记忆表格行编辑：改键/改值/确认状态） */
    @PluginMethod
    public void update(PluginCall call) {
        long id = call.getLong("id", -1L);
        if (id < 0) {
            call.reject("id 缺失");
            return;
        }
        try {
            ContentValues cv = new ContentValues();
            if (call.getString("key") != null) cv.put("key", call.getString("key", ""));
            if (call.getString("content") != null) cv.put("content", call.getString("content", "").trim());
            if (call.getData() != null && call.getData().has("confirmed")) cv.put("confirmed", call.getInt("confirmed", 1));
            if (cv.size() == 0) {
                call.reject("无可更新字段");
                return;
            }
            cv.put("updated_at", System.currentTimeMillis());  // v3：刷新 updated_at
            int n = db().update("memory_items", cv, "id = ?", new String[]{ String.valueOf(id) });
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("updated", n);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /**
     * 关键词检索：{ query, limit?, cardName? } → { success, items }
     * cardName = card_path 值（卡唯一标识）。非空时强制 AND card_path = ?（F1 修复：跨卡隔离）
     * 只检索 fact/summary（长期记忆）；message 原始消息是短期上下文，不进检索注入
     * 空 query：仅当 cardName 非空时走"本卡最近 N 条"降级（F3 修复：绝不返回全库）
     */
    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query", "").trim();
        String cardPath = call.getString("cardName", "");
        int limit = Math.max(1, Math.min(call.getInt("limit", 20), 200));
        Cursor c = null;
        try {
            SQLiteDatabase db = db();
            String sel;
            List<String> args = new ArrayList<>();
            String scope = "type IN ('fact','summary')";
            if (query.isEmpty()) {
                // F3 修复：空 query 必带 cardName 才允许"最近 N 条"，否则 reject
                if (cardPath == null || cardPath.isEmpty()) {
                    call.reject("空 query 需提供 cardName");
                    return;
                }
                sel = "SELECT * FROM memory_items WHERE " + scope + " AND card_path = ? ORDER BY updated_at DESC LIMIT ?";
                args.add(cardPath);
                args.add(String.valueOf(limit));
            } else {
                String[] words = query.split("[\\s,，。.!！?？;；:：、]+");
                StringBuilder kw = new StringBuilder();
                List<String> wordArgs = new ArrayList<>();
                for (String w : words) {
                    if (w.isEmpty()) continue;
                    if (kw.length() > 0) kw.append(" OR ");
                    kw.append("content LIKE ?");
                    wordArgs.add("%" + w + "%");
                }
                if (kw.length() == 0) {
                    // 全是分隔符 → 视为空 query：必带 cardName 才降级
                    if (cardPath == null || cardPath.isEmpty()) {
                        call.reject("空 query 需提供 cardName");
                        return;
                    }
                    sel = "SELECT * FROM memory_items WHERE " + scope + " AND card_path = ? ORDER BY updated_at DESC LIMIT ?";
                    args.add(cardPath);
                    args.add(String.valueOf(limit));
                } else {
                    sel = "SELECT * FROM memory_items WHERE " + scope;
                    // ⚠️ 参数顺序必须与 SQL 占位符出现顺序一致：card_path 占位符在前，LIKE 词在后
                    // （v4.1 审计修复：原实现先 addAll(wordArgs) 再 add(cardPath)，导致绑定错位、带卡检索恒为空）
                    if (cardPath != null && !cardPath.isEmpty()) {
                        sel += " AND card_path = ?";
                        args.add(cardPath);
                    }
                    args.addAll(wordArgs);
                    sel += " AND (" + kw + ") ORDER BY updated_at DESC LIMIT " + limit;
                }
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

    /** 列出记忆：{ type?, limit?, cardName? } → { success, items }；cardName（card_path）非空时按卡过滤 */
    @PluginMethod
    public void list(PluginCall call) {
        String type = call.getString("type", "");
        String cardPath = call.getString("cardName", "");
        int limit = Math.max(1, Math.min(call.getInt("limit", 100), 500));
        Cursor c = null;
        try {
            SQLiteDatabase db = db();
            String sel;
            List<String> args = new ArrayList<>();
            StringBuilder where = new StringBuilder();
            if (type != null && !type.isEmpty()) {
                where.append("type = ?");
                args.add(type);
            }
            if (cardPath != null && !cardPath.isEmpty()) {
                if (where.length() > 0) where.append(" AND ");
                // v4.1 特殊值：遗留桶 = card_path IS NULL OR card_path = ''
                if ("__legacy__".equals(cardPath)) {
                    where.append("(card_path IS NULL OR card_path = '')");
                } else {
                    where.append("card_path = ?");
                    args.add(cardPath);
                }
            }
            if (where.length() > 0) {
                sel = "SELECT * FROM memory_items WHERE " + where + " ORDER BY updated_at DESC LIMIT ?";
            } else {
                sel = "SELECT * FROM memory_items ORDER BY updated_at DESC LIMIT ?";
            }
            args.add(String.valueOf(limit));
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
        o.put("key", c.getString(c.getColumnIndexOrThrow("key")));
        o.put("cardName", c.getString(c.getColumnIndexOrThrow("card_name")));
        o.put("cardPath", c.getString(c.getColumnIndexOrThrow("card_path")));
        o.put("createdAt", c.getLong(c.getColumnIndexOrThrow("created_at")));
        o.put("updatedAt", c.getLong(c.getColumnIndexOrThrow("updated_at")));
        o.put("confirmed", c.getInt(c.getColumnIndexOrThrow("confirmed")));
        return o;
    }

    // ============ v3 新增桥接方法 ============

    /** 卡重命名/移动：将 from path 下所有记忆的 card_path 改为 to（目标优先，同 key+type 跳过源） */
    @PluginMethod
    public void migrateCard(PluginCall call) {
        String from = call.getString("from", "");
        String to = call.getString("to", "");
        if (from.isEmpty() || to.isEmpty()) {
            call.reject("from/to 参数缺失");
            return;
        }
        try {
            SQLiteDatabase db = db();
            long now = System.currentTimeMillis();
            int migrated = 0;
            int skipped = 0;
            db.beginTransaction();
            try {
                // 查询源路径所有记忆
                Cursor cur = db.rawQuery("SELECT id, type, key, content, card_name, created_at, confirmed FROM memory_items WHERE card_path = ?", new String[]{ from });
                try {
                    while (cur.moveToNext()) {
                        long srcId = cur.getLong(0);
                        String type = cur.getString(1);
                        String key = cur.getString(2);
                        String content = cur.getString(3);
                        String cardName = cur.getString(4);
                        long createdAt = cur.getLong(5);
                        int confirmed = cur.getInt(6);
                        // 检查目标是否有同 key+type（目标优先）
                        if (key != null && !key.isEmpty()) {
                            Cursor dup = db.rawQuery(
                                "SELECT id FROM memory_items WHERE type=? AND key=? AND card_path=? LIMIT 1",
                                new String[]{ type, key, to });
                            boolean has = false;
                            try {
                                if (dup.moveToFirst()) has = true;
                            } finally { dup.close(); }
                            if (has) { skipped++; continue; }
                        }
                        // INSERT 到目标路径（保留原始 created_at，更新 card_path 和 updated_at）
                        ContentValues cv = new ContentValues();
                        cv.put("type", type);
                        cv.put("content", content);
                        if (key != null && !key.isEmpty()) cv.put("key", key);
                        cv.put("card_name", cardName);
                        cv.put("card_path", to);
                        cv.put("created_at", createdAt);
                        cv.put("updated_at", now);
                        cv.put("confirmed", confirmed);
                        db.insertOrThrow("memory_items", null, cv);
                        migrated++;
                    }
                } finally { cur.close(); }
                // 全部写入后删除源路径全部记忆
                int deleted = db.delete("memory_items", "card_path = ?", new String[]{ from });
                db.setTransactionSuccessful();
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("migrated", migrated);
                ret.put("skipped", skipped);
                ret.put("deleted", deleted);
                call.resolve(ret);
            } finally {
                db.endTransaction();
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** 按卡清空记忆：{ cardPath } */
    @PluginMethod
    public void clearByCard(PluginCall call) {
        String cardPath = call.getString("cardPath", "");
        if (cardPath.isEmpty()) {
            call.reject("cardPath 缺失");
            return;
        }
        try {
            int n = db().delete("memory_items", "card_path = ?", new String[]{ cardPath });
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("cleared", n);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** 确认/拒绝：{ id, confirmed }；confirmed=1 确认 / -1 软删（可恢复）/ 1 恢复 */
    @PluginMethod
    public void confirm(PluginCall call) {
        long id = call.getLong("id", -1L);
        int confirmed = call.getInt("confirmed", 1);
        if (id < 0) {
            call.reject("id 缺失");
            return;
        }
        try {
            ContentValues cv = new ContentValues();
            cv.put("confirmed", confirmed);
            cv.put("updated_at", System.currentTimeMillis());
            int n = db().update("memory_items", cv, "id = ?", new String[]{ String.valueOf(id) });
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("updated", n);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /**
     * JS 层迁移入口（供 useChatMemory.migrateMemoryToV2 调用）：
     * 接收二维数组 [ [card_name, card_path], ... ]，执行显示名→card_path 映射
     * @param call { mappings: [[cardName, cardPath], ...] }
     */
    @PluginMethod
    public void migrateData(PluginCall call) {
        JSArray mappings = call.getArray("mappings", new JSArray());
        try {
            SQLiteDatabase db = db();
            int updated = 0;
            int bucketed = 0;
            // v4.1 审计优化：先取出"真正存在遗留行（card_path 为空）"的显示名集合；
            // 两万卡全量 mappings 时只对命中集合的名字执行 UPDATE（否则 N 次全表扫描空更新）
            HashSet<String> pendingNames = new HashSet<>();
            Cursor legacyCur = db.rawQuery(
                "SELECT DISTINCT card_name FROM memory_items WHERE (card_path IS NULL OR card_path = '') AND card_name IS NOT NULL AND card_name != ''", null);
            try {
                while (legacyCur.moveToNext()) pendingNames.add(legacyCur.getString(0));
            } finally { legacyCur.close(); }
            if (pendingNames.isEmpty()) {
                JSObject ret0 = new JSObject();
                ret0.put("success", true);
                ret0.put("updated", 0);
                ret0.put("bucketed", 0);
                call.resolve(ret0);
                return;
            }
            db.beginTransaction();
            try {
                for (int i = 0; i < mappings.length(); i++) {
                    Object el = mappings.opt(i);
                    if (!(el instanceof JSONArray)) continue; // 防御：非数组对跳过
                    JSONArray pair = (JSONArray) el;
                    String cardName = pair.optString(0, "");
                    // 第二项可为 null（同名/无匹配 → 遗留桶），org.json 的 NULL 需先用 isNull 区分
                    String cardPath = pair.isNull(1) ? null : pair.optString(1, "");
                    if (cardName == null || cardName.trim().isEmpty()) continue;
                    if (!pendingNames.contains(cardName)) continue; // 无遗留行 → 跳过（免空更新）
                    String pathVal = (cardPath != null && !cardPath.isEmpty()) ? cardPath : null;
                    ContentValues cv = new ContentValues();
                    cv.put("card_path", pathVal);
                    cv.put("updated_at", System.currentTimeMillis());
                    int n = db.update("memory_items", cv,
                        "card_name = ? AND (card_path IS NULL OR card_path = '')",
                        new String[]{ cardName });
                    updated += n;
                    if (pathVal == null) bucketed += n;
                }
                db.setTransactionSuccessful();
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("updated", updated);
                ret.put("bucketed", bucketed);
                call.resolve(ret);
            } finally {
                db.endTransaction();
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
