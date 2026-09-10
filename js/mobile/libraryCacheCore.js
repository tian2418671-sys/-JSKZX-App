/**
 * 轻量库缓存重建核心（v1.10.16 F3）
 * 纯函数模块:禁止引用 window/electronAPI/Vue —— 供 cacheRestoreWorker.js 与主线程共享(单一事实源)。
 * 职责:解析 .jskzx_cache.json 文本 → 重建轻量 items 数组(零 scan 零读文件的缓存先行路径)。
 * 附带 F6 负缓存条目判断(nc:1 → 该文件不可解析,restore 时 SKIP 不进列表)。
 */
import { lightFieldsFromCache } from '../utils/cardLight.js';

export const CACHE_VERSION = 2; // v2=轻量字段(与 v1 全量 data 不兼容,旧缓存直接作废重建)

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
        _searchText: fields.searchText || '',
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
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.items) return null;
    const keys = Object.keys(parsed.items);
    if (!keys.length) return null;
    const items = [];
    const categories = new Set();
    for (const key of keys) {
        const val = parsed.items[key];
        if (!val || val.nc) continue; // F6 负缓存条目:直接跳过
        const parts = key.split('|');
        if (parts.length < 3) continue;
        const path = parts.slice(0, -2).join('|');
        const mtime = Number(parts[parts.length - 2]) || 0;
        const size = Number(parts[parts.length - 1]) || 0;
        const rel = path.replace(/^\/library\//, '');
        const segs = rel.split('/');
        const fileName = segs.pop() || '';
        const subFolder = segs.join('/');
        const category = subFolder ? subFolder.split('/')[0] : '未分类';
        const fields = lightFieldsFromCacheOrSkip(val, fileName.replace(/\.(png|webp|json)$/i, '') || '未命名');
        if (!fields || fields === 'SKIP') continue;
        // mtime/size 必须带上:轻量条目的 _mtime/_size 是 readThumb 缩略图指纹来源
        const file = { name: fileName, path, subFolder, category, mtime, size };
        items.push(buildLightItem(file, fields));
        if (category !== '未分类') categories.add(category);
    }
    return items.length ? { items, categories: [...categories] } : null;
}