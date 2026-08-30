/**
 * 移动端卡片库数据层
 * 独立于桌面 App.vue 组合链,仅复用 utils 解析函数与桥接 API:
 *  - loadLibrary():rescan → 逐卡解析(PNG 用 scan 的 embeddedData,json 用 readText,webp 回退 readBuffer)
 *  - 分组(selectedCategory)/搜索由组件层过滤
 *  - 移动分组 / 删除 / 重命名 :重建本地状态,不依赖桌面幽灵分组清理
 */
import { reactive } from 'vue';
import { normalizeCardData, isCharacterCardData } from '../utils/cardLoader.js';
import { parsePNGChunk, deepScanForJSON } from '../utils/pngParser.js';

export const LIBRARY_ROOT = '/library';

export const mobileLibrary = reactive({
    library: [],
    categories: [],
    worldbooks: [], // 独立世界书文件(库内 json,含 extensions.world_book)
    loading: false,
    error: '',
    ready: false,
    selectedCategory: '全部',
    progress: { done: 0, total: 0 } // 大库逐卡解析进度(done/total,UI 提示用)
});

let flavorCallback = null; // 用于在分组移动后刷新"分组管理"等 UI

export function onLibraryChanged(fn) { flavorCallback = fn; }

// ---------- 内嵌解析结果落盘缓存（万卡二次启动优化,对齐桌面 v2.1.0 PNG 内嵌缓存） ----------
// 键: 文件 path+mtime+size 指纹;值: 卡片数据 JSON。缓存文件存库目录 .jskzx_cache.json
const CACHE_FILE = '/library/.jskzx_cache.json';
const CACHE_VERSION = 1;
let embeddedCache = null; // { version, items: { [fingerprint]: cardDataJson } }

function cacheFingerprint(file) {
    return `${file.path}|${file.mtime || 0}|${file.size || 0}`;
}

async function loadEmbeddedCache() {
    if (embeddedCache) return embeddedCache;
    try {
        const r = await window.electronAPI.readText(CACHE_FILE);
        if (r && r.success && r.text) {
            const parsed = JSON.parse(r.text);
            if (parsed && parsed.version === CACHE_VERSION && parsed.items) {
                embeddedCache = parsed;
                return embeddedCache;
            }
        }
    } catch (e) { /* 首次无缓存 */ }
    embeddedCache = { version: CACHE_VERSION, items: {} };
    return embeddedCache;
}

let cacheFlushTimer = null;
function scheduleCacheFlush() {
    if (cacheFlushTimer) return;
    cacheFlushTimer = setTimeout(async () => {
        cacheFlushTimer = null;
        if (!embeddedCache) return;
        try {
            // 限制缓存体积:最多保留 12000 条(对齐桌面上限)
            const keys = Object.keys(embeddedCache.items);
            if (keys.length > 12000) {
                for (const k of keys.slice(0, keys.length - 12000)) delete embeddedCache.items[k];
            }
            await window.electronAPI.writeText(CACHE_FILE, JSON.stringify(embeddedCache));
        } catch (e) { /* 缓存写失败不影响主流程 */ }
    }, 2000);
}

export async function loadLibrary() {
    mobileLibrary.loading = true;
    mobileLibrary.error = '';
    mobileLibrary.ready = false;
    mobileLibrary.worldbooks = [];
    try {
        const res = await window.electronAPI.rescanLibrary(LIBRARY_ROOT);
        if (!res || res.error) {
            mobileLibrary.error = (res && res.error) || '尚未选择库目录';
            mobileLibrary.loading = false;
            return;
        }
        mobileLibrary.categories = (res.categories || []).filter(Boolean);
        const files = res.files || [];
        const staging = [];
        const CONCURRENCY = 6;
        mobileLibrary.progress = { done: 0, total: files.length };

        // 🚀 万卡优化:json 卡先批量拉文本(单次 IPC 一次拉一批),PNG/WebP 走内嵌缓存
        const cache = await loadEmbeddedCache();
        const jsonFiles = files.filter((f) => (f.name || '').toLowerCase().endsWith('.json') && f.path !== CACHE_FILE);
        const otherFiles = files.filter((f) => !jsonFiles.includes(f));

        // json 批量拉取:每批 40 个
        const jsonTextMap = new Map();
        for (let i = 0; i < jsonFiles.length; i += 40) {
            const batch = jsonFiles.slice(i, i + 40);
            const br = await window.electronAPI.readTextBatch(batch.map((f) => f.path));
            if (br && br.success && Array.isArray(br.results)) {
                br.results.forEach((item) => { if (item.success) jsonTextMap.set(item.path, item.value); });
            }
            mobileLibrary.progress.done = Math.min(i + 40, jsonFiles.length);
        }

        // json 卡解析(带缓存)
        const jsonResults = await Promise.all(jsonFiles.map((f) => parseCard(f, jsonTextMap.get(f.path), cache)));
        staging.push(...jsonResults.filter(Boolean));

        // PNG/WebP 逐批解析(带内嵌缓存)
        for (let i = 0; i < otherFiles.length; i += CONCURRENCY) {
            const batch = otherFiles.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map((f) => parseCard(f, null, cache)));
            staging.push(...results.filter(Boolean));
            mobileLibrary.progress.done = jsonFiles.length + Math.min(i + CONCURRENCY, otherFiles.length);
        }
        mobileLibrary.library = staging;
        mobileLibrary.ready = true;
        scheduleCacheFlush();
    } catch (e) {
        mobileLibrary.error = '加载失败: ' + (e.message || e);
    } finally {
        mobileLibrary.loading = false;
        if (flavorCallback) flavorCallback();
    }
}

async function parseCard(file, prefetchedText, cache) {
    const name = (file.name || '').toLowerCase();
    const fp = cache ? cacheFingerprint(file) : null;
    // 🚀 内嵌缓存命中:直接从缓存重建卡片对象,免读文件免解析
    if (cache && fp && cache.items[fp]) {
        try {
            const cached = cache.items[fp];
            // 缓存命中也必须校验角色卡合法性:防止历史版本误存入的世界书/非卡 JSON 被重建为卡片
            if (!isCharacterCardData(cached)) {
                delete cache.items[fp];
                scheduleCacheFlush();
            } else {
                const normalized = normalizeCardData(cached, true);
                if (typeof localStorage !== 'undefined' && localStorage.getItem('jsmobile-ignore-import-tags') === '1') {
                    if (normalized.data) normalized.data.tags = [];
                }
                return buildCardInfo(file, normalized, (cached.data && cached.data.name) || cached.name);
            }
        } catch (e) { /* 缓存损坏落重新解析 */ }
    }
    try {
        let parsedData = null;
        let rawForCache = null;
        if (name.endsWith('.json')) {
            let text = prefetchedText;
            if (typeof text !== 'string') {
                const r = await window.electronAPI.readText(file.path);
                text = (r && r.success && typeof r.text === 'string') ? r.text : null;
            }
            if (text == null) return null;
            let parsed;
            try { parsed = JSON.parse(text); } catch (e) { return null; }
            if (!isCharacterCardData(parsed)) {
                // 非角色卡:识别独立世界书文件
                const wb = (parsed.extensions && parsed.extensions.world_book) || parsed;
                if (wb && typeof wb.entries === 'object' && wb.entries) {
                    mobileLibrary.worldbooks.push({
                        path: file.path,
                        name: file.name,
                        wb,
                        wrapped: !!(parsed.extensions && parsed.extensions.world_book)
                    });
                }
                return null;
            }
            parsedData = parsed;
            rawForCache = parsed;
        } else if (file.embeddedData && typeof file.embeddedData === 'object') {
            parsedData = file.embeddedData;
            rawForCache = file.embeddedData;
        } else {
            const r = await window.electronAPI.readBuffer(file.path);
            if (r && r.success && r.buffer) {
                const buf = r.buffer;
                parsedData = parsePNGChunk(buf) || deepScanForJSON(buf);
                rawForCache = parsedData;
            } else return null;
        }
        if (!parsedData) return null;
        // 🚀 写入内嵌缓存(下次启动直接命中)
        if (cache && fp && rawForCache) {
            try {
                cache.items[fp] = JSON.parse(JSON.stringify(rawForCache));
                scheduleCacheFlush();
            } catch (e) { /* 缓存写入失败不影响主流程 */ }
        }
        const normalized = normalizeCardData(parsedData);
        if (typeof localStorage !== 'undefined' && localStorage.getItem('jsmobile-ignore-import-tags') === '1') {
            if (normalized.data) normalized.data.tags = [];
        }
        return buildCardInfo(file, normalized, (parsedData.data && parsedData.data.name) || parsedData.name);
    } catch (e) {
        return null;
    }
}

function buildCardInfo(file, normalized, displayName) {
    return {
        id: file.path,
        path: file.path,
        fileName: file.name,
        name: displayName || (normalized.data && normalized.data.name) || '未命名',
        creator: (normalized.data && normalized.data.creator) || '未知',
        avatar: null, // 封面懒加载(MobileCardCover)
        data: normalized,
        category: file.category || (file.subFolder ? file.subFolder.split('/')[0] : '未分类'),
        customTags: [],
        subFolder: file.subFolder || '',
        _mtime: file.mtime || 0,
        _ctime: file.birthtime || file.mtime || 0, // SAF 无 birthtime,回退 mtime
        _size: file.size || 0,
        _importTime: file.mtime || Date.now() // 移动端暂以 mtime 充当导入时间
    };
}

// 按 path 取卡片
export function findCard(path) {
    return mobileLibrary.library.find((c) => c.path === path);
}

/**
 * 移动分组(物理移动文件 + 本地状态重建)
 * targetGroup 为 '' 表示移动到库根(未分类)
 */
export async function moveCardToGroup(card, targetGroup) {
    const res = await window.electronAPI.moveCardToGroup({
        libraryPath: LIBRARY_ROOT,
        cardPath: card.path,
        targetGroup
    });
    if (res && res.success) {
        card.category = targetGroup || '未分类';
        card.subFolder = targetGroup || '';
        card.path = res.newFilePath || card.path;
        if (res.newSubFolder !== undefined) card.subFolder = res.newSubFolder;
        // 若处于某个分组视图且卡片离开了该分组,列表过滤自动隐藏
        return { success: true };
    }
    return { success: false, error: (res && res.error) || '移动失败' };
}

export async function renameCardTo(card, newName) {
    if (!card || !newName || !card.data) return { success: false, error: '参数缺失' };
    if (card.data.data) card.data.data.name = newName;
    else card.data.name = newName;
    card.name = newName;
    const res = await window.electronAPI.saveCard(card.path, JSON.parse(JSON.stringify(card.data)));
    return { success: res && res.success, error: res && res.error };
}

export async function removeCard(card) {
    const res = await window.electronAPI.deleteFile(card.path);
    if (res && res.success) {
        const idx = mobileLibrary.library.findIndex((c) => c.path === card.path);
        if (idx >= 0) mobileLibrary.library.splice(idx, 1);
        return { success: true };
    }
    return { success: false, error: (res && res.error) || '删除失败' };
}

/** 保存卡片数据到物理文件(整体覆盖) */
export async function saveCardData(card) {
    const res = await window.electronAPI.saveCard(card.path, JSON.parse(JSON.stringify(card.data)));
    return { success: res && res.success, error: res && res.error };
}