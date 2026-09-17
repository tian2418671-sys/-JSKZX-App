/**
 * 轻量库缓存重建核心（v1.10.16 F3）
 * 纯函数模块:禁止引用 window/electronAPI/Vue —— 供 cacheRestoreWorker.js 与主线程共享(单一事实源)。
 * 职责:解析 .jskzx_cache.json 文本 → 重建轻量 items 数组(零 scan 零读文件的缓存先行路径)。
 * 附带 F6 负缓存条目判断(nc:1 → 该文件不可解析,restore 时 SKIP 不进列表)。
 */
import { lightFieldsFromCache, toMemorySearchText } from '../utils/cardLight.js';

export const CACHE_VERSION = 2; // v2=轻量字段(与 v1 全量 data 不兼容,旧缓存直接作废重建)

// 🚀 B1(两万卡专项):缓存分片。单文件 .jskzx_cache.json 在 2 万卡时 ~20MB,
// 每次保存整文件 JSON.stringify 全量写盘(6MB 实测写 9s)是高频税;
// 拆为 .jskzx_cache/ 目录下 16 片,单卡变更只重写所在分片(≤1.25MB),restore 并行读。
export const CACHE_SHARDS = 16;

/** 路径 → 分片桶(0..15):FNV-1a 风格哈希取模,中文路径分布均匀 */
export function shardOfPath(path) {
    const s = String(path || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % CACHE_SHARDS;
}

/** 缓存键(path|mtime|size) → 分片桶(基于 path 部分,与 shardOfPath 一致) */
export function shardOfKey(key) {
    const s = String(key || '');
    const parts = s.split('|');
    if (parts.length >= 3) return shardOfPath(parts.slice(0, -2).join('|'));
    return shardOfPath(s);
}

/** 分片文件名:00.json .. 0f.json */
export function shardFileName(i) {
    return (i < 10 ? '0' : '') + i.toString(16) + '.json';
}

/** path|mtime|size 指纹(文件变更即换键,旧条目自动失效) */
export function cacheFingerprint(file) {
    return `${file.path || ''}|${file.mtime || 0}|${file.size || 0}`;
}

/** F6: 负缓存标记(webp/非卡文件,解析失败只探测一次) */
export const NEG = { nc: 1 };

/** lightFieldsFromCache 包装:负缓存条目返回 'SKIP',正常条目透传卡轻量字段 */
export function lightFieldsFromCacheOrSkip(val, fallbackName) {
    if (!val || val.nc) return 'SKIP';
    const f = lightFieldsFromCache(val, fallbackName);
    return f || 'SKIP';
}

/** 轻量列表条目(无全量 data;详情页打开时经 loadCardFullData 按需加载) */
export function buildLightItem(file, fields) {
    return {
        id: file.path,
        path: file.path,
        fileName: file.name,
        name: fields.name || String(file.name || '').replace(/\.(png|webp|json)$/i, '') || '未命名',
        creator: fields.creator || '未知',
        avatar: null, // 封面懒加载(MobileCardCover)
        data: null, // 🚀 全量数据不常驻内存(详情页按需加载)
        category: file.category || (file.subFolder ? file.subFolder.split('/')[0] : '未分类'),
        customTags: [],
        subFolder: file.subFolder || '',
        _desc: fields.desc || '',
        // I13: 内存条目搜索文本与缓存同长截断（两万卡内存 ~60MB 封顶，替代 60K 全文留内存）
        _searchText: toMemorySearchText(fields.searchText),
        _tags: fields.tags || [],
        _tokens: fields.tokens || 0,
        _lb: !!fields.hasLorebook,
        _rx: !!fields.hasRegex,
        _mtime: file.mtime || 0,
        _ctime: file.birthtime || file.mtime || 0, // SAF 无 birthtime,回退 mtime
        _size: file.size || 0,
        _importTime: file.mtime || Date.now() // 移动端暂以 mtime 充当导入时间
    };
}

/**
 * v1.10.16: 输入缓存 JSON 文本 → 输出成品 items 数组(在 Worker 中执行,主线程只收成品)。
 * key 格式 path|mtime|size;split 切分避免文件名自身含 '|' 时截断。
 * @param {string} text .jskzx_cache.json 文本内容
 * @returns {{items:Array, categories:Array}|null} 解析失败/空缓存返回 null
 */
export function restoreItemsFromCacheText(text) {
    if (typeof text !== 'string' || !text) return null;
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return null; // 🐛 损坏缓存(写盘中断/升级残留):容错返回 null,走全量 scan 重建,不中断库加载
    }
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.items) return null;
    const keys = Object.keys(parsed.items);
    if (!keys.length) return null;
    const items = [];
    const categories = new Set();
    // 🐛 防增值:同一路径可能残留多条缓存指纹(每次保存 mtime/size 变化换键,旧键未清理),
    // 若全部还原会造成「一张卡出现多张」;按 path 去重,保留 mtime 最新的一条。
    const byPath = new Map(); // path → { idx, mtime }
    for (const key of keys) {
        const val = parsed.items[key];
        if (!val || val.nc) continue; // F6 负缓存条目:直接跳过
        const parts = key.split('|');
        if (parts.length < 3) continue;
        const path = parts.slice(0, -2).join('|');
        const mtime = Number(parts[parts.length - 2]) || 0;
        const size = Number(parts[parts.length - 1]) || 0;
        const prev = byPath.get(path);
        if (prev && prev.mtime >= mtime) continue; // 已有更新的条目,跳过旧指纹
        const rel = path.replace(/^\/library\//, '');
        const segs = rel.split('/');
        const fileName = segs.pop() || '';
        const subFolder = segs.join('/');
        const category = subFolder ? subFolder.split('/')[0] : '未分类';
        const fields = lightFieldsFromCacheOrSkip(val, fileName.replace(/\.(png|webp|json)$/i, '') || '未命名');
        if (!fields || fields === 'SKIP') continue;
        // mtime/size 必须带上:轻量条目的 _mtime/_size 是 readThumb 缩略图指纹来源
        const file = { name: fileName, path, subFolder, category, mtime, size };
        if (prev !== undefined) {
            // 同路径更旧条目被新条目替换
            items[prev.idx] = buildLightItem(file, fields);
            byPath.set(path, { idx: prev.idx, mtime });
        } else {
            const idx = items.length;
            items.push(buildLightItem(file, fields));
            byPath.set(path, { idx, mtime });
        }
        if (category !== '未分类') categories.add(category);
    }
    return items.length ? { items, categories: [...categories] } : null;
}

/**
 * 🚀 B1:分片缓存版本——输入分片文本数组(每项为单个分片的 JSON 文本),逐片 parse 后按 path 去重
 * 合并为统一 items 数组(与 restoreItemsFromCacheText 逻辑同源,跨分片去重保留 mtime 最新)。
 * 在 cacheRestoreWorker 中执行(Worker 线程,主线程只收成品)。
 */
export function restoreItemsFromShardTexts(texts) {
    if (!Array.isArray(texts) || !texts.length) return null;
    const items = [];
    const categories = new Set();
    const byPath = new Map();
    for (const text of texts) {
        if (typeof text !== 'string' || !text) continue;
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { continue; }
        if (!parsed || parsed.version !== CACHE_VERSION || !parsed.items) continue;
        for (const key of Object.keys(parsed.items)) {
            const val = parsed.items[key];
            if (!val || val.nc) continue;
            const parts = key.split('|');
            if (parts.length < 3) continue;
            const path = parts.slice(0, -2).join('|');
            const mtime = Number(parts[parts.length - 2]) || 0;
            const size = Number(parts[parts.length - 1]) || 0;
            const prev = byPath.get(path);
            if (prev && prev.mtime >= mtime) continue;
            const rel = path.replace(/^\/library\//, '');
            const segs = rel.split('/');
            const fileName = segs.pop() || '';
            const subFolder = segs.join('/');
            const category = subFolder ? subFolder.split('/')[0] : '未分类';
            const fields = lightFieldsFromCacheOrSkip(val, fileName.replace(/\.(png|webp|json)$/i, '') || '未命名');
            if (!fields || fields === 'SKIP') continue;
            const file = { name: fileName, path, subFolder, category, mtime, size };
            if (prev !== undefined) {
                items[prev.idx] = buildLightItem(file, fields);
                byPath.set(path, { idx: prev.idx, mtime });
            } else {
                const idx = items.length;
                items.push(buildLightItem(file, fields));
                byPath.set(path, { idx, mtime });
            }
            if (category !== '未分类') categories.add(category);
        }
    }
    return items.length ? { items, categories: [...categories] } : null;
}