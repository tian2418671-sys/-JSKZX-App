/**
 * 🚀 P2 B2: SQLite 元数据库数据层封装（两万卡专项）
 *
 * 在 JSON 分片缓存之上增加一层 SQLite 元数据快照（应用私有库，免 SAF）：
 *   - 启动秒开：queryCards 一次 SQL 拿全量轻量字段（免读/合并 16 个 JSON 分片）
 *   - 增量维护：reconcile 完成后 persistMetas 事务批量 upsert（path 主键覆盖）
 * 特性开关 META_DB_ENABLED，任何异常/降级自动回退 JSON 分片缓存路径。
 * 依赖桥接：window.electronAPI.meta* 方法（SqliteMetaPlugin 注册于 MainActivity）。
 */
import { buildLightItem } from './libraryCacheCore.js';
import { toMemorySearchText } from '../utils/cardLight.js';

export const META_DB_ENABLED = true; // 特性开关:出问题改 false 即完全回退分片 JSON

/**
 * 🐛 v1.10.30 OOM 修复:单条桥消息的元数据行数上限。
 * 全库(万卡)一次性上桥会生成 ~45MB 桥消息——Capacitor Bridge 在 Java 侧处理
 * (verbose 日志 toString + JSON 解析)会把 Android Java 堆打爆直接崩溃。
 * 分批后单条消息 ≤ ~3MB,彻底规避。
 */
const META_CHUNK = 800;

/** 分批发送(fire-and-forget 串行;单块失败静默,下次 reconcile 自愈) */
function sendMetaChunks(rows, sender) {
    (async () => {
        for (let i = 0; i < rows.length; i += META_CHUNK) {
            try { await sender(rows.slice(i, i + META_CHUNK), i === 0); } catch (e) { /* 单块失败静默 */ }
        }
    })();
}

/** flags 位:1=hasLorebook 2=hasRegex(与 lightFieldsToCache 的 b/x 语义一致) */
function flagsOf(light) {
    return (light._lb ? 1 : 0) | (light._rx ? 2 : 0);
}

/** 轻量条目 → DB 行 */
export function lightToDbRow(light) {
    if (!light || !light.path) return null;
    return {
        path: light.path,
        name: light.name || '',
        creator: light.creator || '',
        desc: light._desc || '',
        search_text: toMemorySearchText(light._searchText),
        tags: JSON.stringify(light._tags || []),
        subfolder: light.subFolder || '',
        category: light.category || '未分类',
        tokens: light._tokens || 0,
        flags: flagsOf(light),
        mtime: light._mtime || 0,
        size: light._size || 0,
        csum: 0,
        usn: 0
    };
}

/** DB 行 → 轻量条目(与 buildLightItem 同构) */
export function dbRowToLight(row) {
    if (!row || !row.path) return null;
    const rel = String(row.path).replace(/^\/library\//, '');
    const segs = rel.split('/');
    const fileName = segs.pop() || '';
    const subFolder = segs.join('/');
    const category = row.category || (subFolder ? subFolder.split('/')[0] : '未分类');
    const flags = Number(row.flags) || 0;
    let tags = [];
    if (typeof row.tags === 'string' && row.tags) {
        try { tags = JSON.parse(row.tags); } catch (e) { /* 脏数据忽略 */ }
    }
    const file = {
        name: fileName,
        path: row.path,
        category,
        subFolder,
        mtime: Number(row.mtime) || 0,
        size: Number(row.size) || 0
    };
    const fields = {
        name: row.name || '',
        creator: row.creator || '未知',
        tags,
        desc: row.desc || '',
        searchText: toMemorySearchText(row.search_text),
        tokens: Number(row.tokens) || 0,
        hasLorebook: (flags & 1) === 1,
        hasRegex: (flags & 2) === 2
    };
    return buildLightItem(file, fields);
}

/**
 * 🚀 启动优先路径:从 SQLite 元数据库恢复轻量库。
 * @returns {Promise<Array|null>} 轻量条目数组;DB 不可用/为空/异常返回 null(走分片缓存)
 */
export async function restoreFromMetaDb() {
    if (!META_DB_ENABLED || typeof window === 'undefined' || !window.electronAPI) return null;
    try {
        if (typeof window.electronAPI.metaQueryCards !== 'function') return null;
        const inited = await window.electronAPI.metaInit();
        if (!inited) return null;
        const rows = await window.electronAPI.metaQueryCards();
        if (!Array.isArray(rows) || !rows.length) return null;
        const items = [];
        for (const row of rows) {
            const it = dbRowToLight(row);
            if (it) items.push(it);
        }
        return items.length ? items : null;
    } catch (e) {
        return null; // 任何异常回退分片缓存
    }
}

/**
 * 🚀 reconcile/加载完成后批量 upsert 到元数据库(事务写入,path 覆盖)。
 * fires-and-forget:调用方不等待;失败静默(下次 reconcile 自愈)。
 */
export function persistMetas(cards) {
    if (!META_DB_ENABLED || typeof window === 'undefined' || !window.electronAPI) return;
    try {
        if (typeof window.electronAPI.metaUpsertCards !== 'function') return;
        const rows = [];
        for (const c of cards || []) {
            const r = lightToDbRow(c);
            if (r) rows.push(r);
        }
        if (rows.length) {
            // 🐛 v1.10.30:分批上桥(全库一次性发送曾导致 Android Java 堆 OOM 崩溃)
            sendMetaChunks(rows, (chunk) => window.electronAPI.metaUpsertCards(chunk));
        }
    } catch (e) { /* 静默 */ }
}

/** 授权切换后清空元数据库(避免旧库目录快照误导) */
export function resetMetaDb() {
    try { window.electronAPI?.metaClear?.().catch(() => {}); } catch (e) { /* 忽略 */ }
}

/**
 * 🚀 BUG-17 fix-3:全量替换 SQLite 元数据库(reconcile/loadLibrary 完成后调用)。
 * 清理外部工具直接删文件导致的 DB 幽灵卡 + 所有变更一次落盘。
 * 注意:与增量 persistMetas 互补——reconcile 用本函数(全量对齐),编辑保存用 persistMetas(单卡即时)。
 */
export function syncMetas(cards) {
    if (!META_DB_ENABLED || typeof window === 'undefined' || !window.electronAPI) return;
    try {
        const api = window.electronAPI;
        if (typeof api.metaSyncCards !== 'function') return;
        const rows = [];
        for (const c of cards || []) {
            const r = lightToDbRow(c);
            if (r) rows.push(r);
        }
        if (rows.length) {
            // 🐛 v1.10.30:分批上桥(首块 replaceAll=true 清幽灵卡,后续仅 INSERT)。
            // 全库单条 ~45MB 桥消息曾被 Capacitor Bridge 序列化时撑爆 Java 堆崩溃。
            sendMetaChunks(rows, (chunk, first) => api.metaSyncCards(chunk, first));
        }
    } catch (e) { /* 静默 */ }
}

/**
 * 🚀 BUG-17:删除/移动后清理 SQLite 元数据行(防幽灵卡)。
 * 与 persistMetas 一致：fire-and-forget + 失败静默。
 * paths 为绝对路径数组(如 ['/library/xxx.json', '/library/yyy.png'])
 */
export function removeMetaCards(paths) {
    if (!META_DB_ENABLED || typeof window === 'undefined' || !window.electronAPI) return;
    try {
        const api = window.electronAPI;
        if (typeof api.metaDeleteCards !== 'function') return;
        const arr = (Array.isArray(paths) ? paths : []).filter(Boolean);
        if (arr.length) {
            // 🐛 v1.10.30:同口径分批(删库等大场景也防单条大消息)
            sendMetaChunks(arr, (chunk) => api.metaDeleteCards(chunk));
        }
    } catch (e) { /* 静默 */ }
}