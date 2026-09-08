/**
 * 移动端卡片库数据层（🚀 v1.10.2 轻量化重构）
 * 独立于桌面 App.vue 组合链,仅复用 utils 解析函数与桥接 API:
 *  - loadLibrary():rescan → 分批拉取(JSON 批量读文本 / PNG 批量提取 chara 文本块)→ 逐卡解析
 *  - 列表条目只保留轻量字段(名称/作者/标签/描述片段/搜索全文/Token/特征标记),
 *    完整卡片 JSON 由 loadCardFullData 按需加载 —— 2000 卡库内存从数百 MB 降至 ~10MB,
 *    根治 300+ 卡导入闪退(全量 data 常驻 + 深响应式代理 + 单次桥接巨型载荷)
 *  - 轻量缓存 v2(.jskzx_cache.json 只存轻量字段,文件体积较 v1 全量缓存缩小一个数量级)
 *  - 分组(selectedCategory)/搜索由组件层过滤
 *  - 移动分组 / 删除 / 重命名 :重建本地状态,不依赖桌面幽灵分组清理
 */
import { reactive } from 'vue';
import { normalizeCardData, isCharacterCardData, getCardRejectReason } from '../utils/cardLoader.js';
import { parsePNGChunk, deepScanForJSON } from '../utils/pngParser.js';
import { extractCardLightFields, lightFieldsToCache, lightFieldsFromCache } from '../utils/cardLight.js';
// Worker 内联（?worker&inline）：Android WebView 加载外部 Worker 文件不可靠，内联为 data URL 后由 Vite 生成降级兜底
import cardParseWorker from './cardParseWorker.js?worker&inline';

export const LIBRARY_ROOT = '/library';

export const mobileLibrary = reactive({
    library: [],
    categories: [],
    worldbooks: [], // 独立世界书文件(库内 json,含 extensions.world_book)
    loading: false,
    error: '',
    ready: false,
    selectedCategory: '全部',
    progress: { done: 0, total: 0 }, // 大库逐卡解析进度(done/total,UI 提示用)
    revision: 0 // 🚀 轻量字段同步修订号:详情页保存后 +1,列表据此重建搜索索引
});

let flavorCallback = null; // 用于在分组移动后刷新"分组管理"等 UI

export function onLibraryChanged(fn) { flavorCallback = fn; }

// 最后点开的卡片路径：详情页在 route.query.p 因编码/URL 丢失时,用内存值兜底定位
let lastOpenedPath = '';
export function setLastOpenedPath(p) { lastOpenedPath = String(p || ''); }
export function getLastOpenedPath() { return lastOpenedPath; }

// ---------- 轻量内嵌缓存（二次启动秒开:v2 只存轻量字段,免读文件免解析） ----------
// 键: 文件 path+mtime+size 指纹;值: lightFieldsToCache 紧凑对象。缓存文件存库目录 .jskzx_cache.json
const CACHE_FILE = '/library/.jskzx_cache.json';
const CACHE_VERSION = 2; // v2=轻量字段(与 v1 全量 data 不兼容,旧缓存直接作废重建)
let embeddedCache = null; // { version, items: { [fingerprint]: cachedLight } }
let cacheDirty = false;

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
    } catch (e) { /* 首次无缓存/版本不兼容 */ }
    embeddedCache = { version: CACHE_VERSION, items: {} };
    return embeddedCache;
}

let cacheFlushTimer = null;
function scheduleCacheFlush() {
    if (!cacheDirty) return;
    if (cacheFlushTimer) return;
    cacheFlushTimer = setTimeout(async () => {
        cacheFlushTimer = null;
        cacheDirty = false;
        if (!embeddedCache) return;
        try {
            // 限制缓存体积:最多保留 20000 条轻量条目(每条 <1KB,总量 ~20MB 上限)
            const keys = Object.keys(embeddedCache.items);
            if (keys.length > 20000) {
                for (const k of keys.slice(0, keys.length - 20000)) delete embeddedCache.items[k];
            }
            await window.electronAPI.writeText(CACHE_FILE, JSON.stringify(embeddedCache));
        } catch (e) { /* 缓存写失败不影响主流程 */ }
    }, 2000);
}

// ---------- 卡片解析 Worker(大库加载加速:原始解析移出主线程) ----------
// 关键容错:Worker 创建失败/加载失败/超时,一律回退主线程同步解析(与旧逻辑等价)
let parseWorker = null;
let parseWorkerFailed = false;
let parseReqId = 0;
const parsePending = new Map();

function getParseWorker() {
    if (parseWorkerFailed) return null;
    if (parseWorker) return parseWorker;
    try {
        // ?worker&inline 内联 Worker(解决 Android WebView 加载外部 Worker 不可靠)，
        // 外层 try/catch 兜底:低版本 WebView 不支持 module worker 时回退经典 Worker
        try {
            parseWorker = new cardParseWorker({ type: 'module' });
        } catch (e2) {
            const workerUrl = new URL('./cardParseWorker.js', import.meta.url);
            parseWorker = new Worker(workerUrl);
        }
        parseWorker.onmessage = (e) => {
            const { id, ok, parsed } = e.data || {};
            const p = parsePending.get(id);
            if (p) { parsePending.delete(id); p(ok ? parsed : null); }
        };
        parseWorker.onerror = () => {
            parseWorkerFailed = true;
            try { parseWorker.terminate(); } catch (e) { /* 忽略 */ }
            parseWorker = null;
            parsePending.forEach((resolve) => resolve(null));
            parsePending.clear();
        };
    } catch (e) {
        parseWorkerFailed = true;
        return null;
    }
    return parseWorker;
}

/** 主线程同步回退解析(Worker 不可用时) */
function parseRawSync(kind, raw) {
    try {
        return kind === 'json' ? JSON.parse(raw) : (parsePNGChunk(raw) || deepScanForJSON(raw));
    } catch (e) {
        return null;
    }
}

/** 经 Worker 解析原始数据,失败/超时回退主线程 */
function parseViaWorker(kind, raw) {
    const w = getParseWorker();
    if (!w) return Promise.resolve(parseRawSync(kind, raw));
    return new Promise((resolve) => {
        const id = ++parseReqId;
        parsePending.set(id, resolve);
        // 超时保护:5s 未响应则回退主线程(避免个别卡拖死整体加载)
        const timer = setTimeout(() => {
            if (parsePending.has(id)) {
                parsePending.delete(id);
                resolve(parseRawSync(kind, raw));
            }
        }, 5000);
        w.postMessage({ id, kind, raw });
    });
}

/** 有界并发 map:list 顺序无关,峰值并发 ≤ limit(防止全库同时解析的内存尖峰) */
async function mapLimit(list, limit, fn) {
    const out = new Array(list.length);
    let idx = 0;
    const n = Math.min(limit, list.length);
    const workers = [];
    for (let w = 0; w < n; w++) {
        workers.push((async () => {
            while (idx < list.length) {
                const cur = idx++;
                try { out[cur] = await fn(list[cur], cur); } catch (e) { out[cur] = null; }
            }
        })());
    }
    await Promise.all(workers);
    return out;
}

/** 让出主线程(批间渲染进度条/避免 UI 冻结) */
function yieldFrame() {
    return new Promise((resolve) => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 50 });
        else setTimeout(resolve, 0);
    });
}

// 桥接能力探测:readCharaBatch(PNG 文本块批量提取,新增);低版本桥接自动回退 readBuffer
const bridgeHasCharaBatch = typeof window !== 'undefined'
    && window.electronAPI && typeof window.electronAPI.readCharaBatch === 'function';

export async function loadLibrary(refresh = false) {
    // 已加载完成且库非空时跳过重复扫描（返回页面/组件重复挂载不重扫；下拉刷新等传 true 强制重扫）
    if (!refresh && mobileLibrary.ready && mobileLibrary.library.length > 0) return;
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
        const files = (res.files || []).filter((f) => f && !f.isDirectory);
        const staging = [];
        const JSON_BATCH = 24; // 单次桥接批量读文本上限(控制单批载荷)
        const PNG_BATCH = 24;  // 单次桥接批量提取 chara 上限
        const CONCURRENCY = 6; // 解析并发上限
        mobileLibrary.progress = { done: 0, total: files.length };

        const cache = await loadEmbeddedCache();
        const jsonFiles = files.filter((f) => (f.name || '').toLowerCase().endsWith('.json') && f.path !== CACHE_FILE);
        const imgFiles = files.filter((f) => !jsonFiles.includes(f));

        const append = (arr) => { for (const x of arr) if (x) staging.push(x); };

        // ① JSON 卡:分批读文本 → 有界并发解析 → 只留轻量字段(文本/全量 data 逐批释放)
        for (let i = 0; i < jsonFiles.length; i += JSON_BATCH) {
            const batch = jsonFiles.slice(i, i + JSON_BATCH);
            const textMap = new Map();
            try {
                const br = await window.electronAPI.readTextBatch(batch.map((f) => f.path));
                if (br && br.success && Array.isArray(br.results)) {
                    br.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
                }
            } catch (e) { /* 批量读失败降级:单卡逐个读 */ }
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            append(items);
            mobileLibrary.progress.done = Math.min(i + JSON_BATCH, jsonFiles.length);
            await yieldFrame();
        }

        // ② PNG/WebP:批量提取 chara 文本块(只读文本,不过桥整图 base64) → 有界并发解析
        //    webp 无 chara 文本块,回退 readBuffer 整图解析(数量少,可接受)
        for (let i = 0; i < imgFiles.length; i += PNG_BATCH) {
            const batch = imgFiles.slice(i, i + PNG_BATCH);
            const textMap = new Map();
            if (bridgeHasCharaBatch) {
                try {
                    const cr = await window.electronAPI.readCharaBatch(batch.map((f) => f.path));
                    if (cr && cr.success && Array.isArray(cr.results)) {
                        cr.results.forEach((item) => {
                            if (item && item.success && typeof item.value === 'string') textMap.set(item.path, item.value);
                        });
                    }
                } catch (e) { /* 降级 readBuffer */ }
            }
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            append(items);
            mobileLibrary.progress.done = jsonFiles.length + Math.min(i + PNG_BATCH, imgFiles.length);
            await yieldFrame();
        }

        mobileLibrary.library = staging;
        mobileLibrary.ready = true;
        mobileLibrary.revision++;
        scheduleCacheFlush();
    } catch (e) {
        mobileLibrary.error = '加载失败: ' + (e.message || e);
    } finally {
        mobileLibrary.loading = false;
        if (flavorCallback) flavorCallback();
    }
}

/**
 * 解析单卡 → 轻量列表条目（全量 data 立即丢弃,不进入响应式库）
 * @param {object} file 扫描文件元信息
 * @param {string|undefined} prefetchedText 已批量拉取的文本(json 卡=文件文本,PNG=chara 文本块)
 */
async function parseLightCard(file, prefetchedText, cache) {
    const name = (file.name || '').toLowerCase();
    const fp = cache ? cacheFingerprint(file) : null;
    // 🚀 轻量缓存命中:免读文件免解析,直接重建条目
    if (cache && fp) {
        const cached = lightFieldsFromCache(cache.items[fp], file.name);
        if (cached) return buildLightItem(file, cached);
    }
    try {
        let parsedData = null;
        if (name.endsWith('.json')) {
            let text = prefetchedText;
            if (typeof text !== 'string') {
                const r = await window.electronAPI.readText(file.path);
                text = (r && r.success && typeof r.text === 'string') ? r.text : null;
            }
            if (text == null) return null;
            const parsed = await parseViaWorker('json', text);
            if (!parsed) return null;
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
                } else {
                    console.warn(`[库] 跳过非角色卡 JSON [${getCardRejectReason(parsed)}]: ${file.name}`);
                }
                return null;
            }
            parsedData = parsed;
        } else if (typeof prefetchedText === 'string') {
            // PNG chara 文本块已批量提取(纯 JSON 文本,无需整图 base64 过桥)
            const parsed = await parseViaWorker('json', prefetchedText);
            if (parsed && typeof parsed === 'object') {
                parsedData = parsed;
            } else {
                // chara 块非合法 JSON → 回退整图解析(deepScanForJSON 兼容损坏/非标 PNG)
                const r = await window.electronAPI.readBuffer(file.path);
                if (r && r.success && r.buffer) {
                    parsedData = await parseViaWorker('png', r.buffer);
                    if (!parsedData) return null;
                } else return null;
            }
        } else if (file.embeddedData && typeof file.embeddedData === 'object') {
            // 兼容:桥接仍返回 embeddedData 时直接使用
            parsedData = file.embeddedData;
        } else {
            // 兜底:readBuffer 整图解析(webp / chara 提取失败 / 旧桥接)
            const r = await window.electronAPI.readBuffer(file.path);
            if (r && r.success && r.buffer) {
                parsedData = await parseViaWorker('png', r.buffer);
                if (!parsedData || !isCharacterCardData(parsedData)) return null;
            } else return null;
        }
        if (!parsedData) return null;
        const normalized = normalizeCardData(parsedData);
        const fields = extractCardLightFields(normalized, {
            fileName: file.name,
            path: file.path,
            subFolder: file.subFolder || '',
            category: file.category || '未分类'
        });
        if (cache && fp) {
            try {
                cache.items[fp] = lightFieldsToCache(fields);
                cacheDirty = true;
                scheduleCacheFlush();
            } catch (e) { /* 缓存写入失败不影响主流程 */ }
        }
        return buildLightItem(file, fields);
    } catch (e) {
        return null;
    }
}

/** 轻量列表条目(无全量 data;详情页打开时经 loadCardFullData 按需加载) */
function buildLightItem(file, fields) {
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

// 按 path 取卡片
export function findCard(path) {
    return mobileLibrary.library.find((c) => c.path === path);
}

/**
 * 🚀 按需加载单卡完整数据(详情页/查重/批量编辑用)。
 * 读取顺序:JSON=读文本;PNG=chara 文本块批量提取(避免整图 base64)→ readBuffer 兜底。
 * 返回归一化后的完整卡片 JSON,不挂载到轻量条目(调用方决定生命周期,用后即弃)。
 * @param {object} card 轻量条目(只需 path/fileName)
 * @returns {Promise<object|null>} normalized 完整卡片
 */
export async function loadCardFullData(card) {
    if (!card || !card.path) return null;
    const name = (card.fileName || card.path || '').toLowerCase();
    try {
        if (name.endsWith('.json')) {
            const r = await window.electronAPI.readText(card.path);
            const text = (r && r.success && typeof r.text === 'string') ? r.text : null;
            if (text == null) return null;
            const parsed = await parseViaWorker('json', text);
            if (!parsed || !isCharacterCardData(parsed)) return null;
            return normalizeCardData(parsed);
        }
        if (name.endsWith('.png') && bridgeHasCharaBatch) {
            const cr = await window.electronAPI.readCharaBatch([card.path]);
            const item = cr && cr.success && Array.isArray(cr.results) && cr.results[0];
            if (item && item.success && typeof item.value === 'string') {
                const parsed = await parseViaWorker('json', item.value);
                // 对齐旧行为:PNG 内嵌数据不强制角色卡校验(脏卡由 normalizeCardData 兜底)
                if (parsed && typeof parsed === 'object') return normalizeCardData(parsed);
            }
        }
        const r = await window.electronAPI.readBuffer(card.path);
        if (r && r.success && r.buffer) {
            const parsed = await parseViaWorker('png', r.buffer);
            if (parsed && typeof parsed === 'object') return normalizeCardData(parsed);
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * 详情页打开入口:轻量条目 + 全量数据 → 深响应式编辑副本。
 * 单卡深代理开销可忽略;编辑/保存只作用于副本,保存后经 syncCardLightFields 回写轻量条目。
 * @param {string|object} pathOrCard 卡片路径或轻量条目
 */
export async function hydrateCardForEdit(pathOrCard) {
    const light = (typeof pathOrCard === 'string') ? findCard(pathOrCard) : pathOrCard;
    if (!light) return null;
    const data = await loadCardFullData(light);
    if (!data) return null;
    return reactive({ ...light, data });
}

/**
 * 🚀 保存/编辑后同步轻量字段(名称/标签/描述/搜索全文/Token/特征标记)并递增 revision。
 * 列表与搜索索引据此保持新鲜;同步失败静默忽略(下次重扫自愈)。
 * @param {{path:string, data:object}} cardLike 携带全量 data 的卡片对象
 */
export function syncCardLightFields(cardLike) {
    const light = findCard(cardLike && cardLike.path);
    const data = cardLike && cardLike.data;
    if (!light || !data) return false;
    try {
        const normalized = (data && data.data) ? data : { data };
        const fields = extractCardLightFields(normalized, {
            fileName: light.fileName,
            path: light.path,
            subFolder: light.subFolder,
            category: light.category,
            name: light.name,
            creator: light.creator
        });
        light.name = fields.name || light.name;
        light.creator = fields.creator || light.creator;
        light._desc = fields.desc;
        light._searchText = fields.searchText;
        light._tags = fields.tags;
        light._tokens = fields.tokens;
        light._lb = fields.hasLorebook;
        light._rx = fields.hasRegex;
        mobileLibrary.revision++;
        if (embeddedCache) {
            try {
                embeddedCache.items[cacheFingerprint(light)] = lightFieldsToCache(fields);
                cacheDirty = true;
                scheduleCacheFlush();
            } catch (e) { /* 忽略 */ }
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 移动分组(物理移动文件 + 本地状态重建)
 * targetGroup 为 '' 表示移动到库根(未分类)
 */
export async function moveCardToGroup(card, targetGroup) {
    const oldPath = card.path;
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
        // 🚀 轻量条目同步(详情页编辑副本与库条目已分离,需手动回写)
        const light = findCard(oldPath);
        if (light && light !== card) {
            light.category = card.category;
            light.subFolder = card.subFolder;
            light.path = card.path;
            light.id = card.path;
            mobileLibrary.revision++;
        }
        return { success: true };
    }
    return { success: false, error: (res && res.error) || '移动失败' };
}

export async function renameCardTo(card, newName) {
    if (!card || !newName) return { success: false, error: '参数缺失' };
    // 🚀 轻量条目无 data:按需加载全量数据后再改名写盘
    const data = card.data || await loadCardFullData(card);
    if (!data) return { success: false, error: '读取卡片失败' };
    if (data.data) data.data.name = newName;
    else data.name = newName;
    const res = await window.electronAPI.saveCard(card.path, JSON.parse(JSON.stringify(data)));
    if (res && res.success) {
        if (card.data) card.name = newName; // 详情页编辑副本
        else { const light = findCard(card.path); if (light) light.name = newName; }
        syncCardLightFields({ path: card.path, data });
        return { success: true };
    }
    return { success: false, error: (res && res.error) || '保存失败' };
}

export async function removeCard(card) {
    const res = await window.electronAPI.deleteFile(card.path);
    if (res && res.success) {
        const idx = mobileLibrary.library.findIndex((c) => c.path === card.path);
        if (idx >= 0) mobileLibrary.library.splice(idx, 1);
        mobileLibrary.revision++;
        return { success: true };
    }
    return { success: false, error: (res && res.error) || '删除失败' };
}

/** 保存卡片数据到物理文件(整体覆盖)+ 轻量字段回写 */
export async function saveCardData(card) {
    const res = await window.electronAPI.saveCard(card.path, JSON.parse(JSON.stringify(card.data)));
    if (res && res.success) syncCardLightFields(card);
    return { success: res && res.success, error: res && res.error };
}

/**
 * 读取卡内嵌世界书并归一化为「字典形态」供移动端编辑器使用。
 * 对齐桌面:内嵌世界书标准字段为 data.character_book(V2/V3),兼容 V1 顶层 card.data.character_book;
 * entries 可能为数组(桌面标准)或字典,统一转为字典 { key: entry } 便于现有编辑器操作。
 * @returns {{book: object, entries: object}} book=character_book 对象(保存时写回), entries=字典
 */
export function getCardEmbeddedWb(card) {
    const data = card && card.data;
    const d = (data && data.data) || data || {};
    let book = d.character_book;
    if (!book || typeof book !== 'object') {
        // V1 兼容:书位于归一化后的 card.data.character_book(无 data.data 层级)
        book = (data && data.character_book) || {};
        if (book && typeof book === 'object' && Object.keys(book).length) d.character_book = book;
    }
    if (!book || typeof book !== 'object') {
        book = {};
        d.character_book = book;
    }
    let entries = book.entries;
    if (Array.isArray(entries)) {
        // 桌面标准数组 → 编辑器字典形态(键 wb_i,保持顺序)
        const dict = {};
        entries.forEach((e, i) => { if (e && typeof e === 'object') dict['wb_' + i] = e; });
        entries = dict;
        book.entries = dict;
    }
    if (!entries || typeof entries !== 'object') {
        entries = {};
        book.entries = entries;
    }
    return { book, entries };
}

/** 保存前:把卡内嵌世界书 entries 从字典转回数组(对齐桌面 character_book.entries 数组标准) */
export function serializeCardEmbeddedWb(card) {
    try {
        const data = card && card.data;
        const d = (data && data.data) || data || {};
        const book = d.character_book;
        if (book && typeof book === 'object' && book.entries && !Array.isArray(book.entries)) {
            book.entries = Object.values(book.entries).filter((e) => e && typeof e === 'object');
        }
    } catch (e) { /* 忽略序列化异常 */ }
}
