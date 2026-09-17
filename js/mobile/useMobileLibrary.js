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
import { extractCardLightFields, lightFieldsToCache, lightFieldsFromCache, toMemorySearchText } from '../utils/cardLight.js';
import { prefillCoverCache } from './components/MobileCardCover.vue';
// Worker 内联（?worker&inline）：Android WebView 加载外部 Worker 文件不可靠，内联为 data URL 后由 Vite 生成降级兜底
import cardParseWorker from './cardParseWorker.js?worker&inline';
import { restoreItemsFromCacheText, restoreItemsFromShardTexts, buildLightItem, NEG, cacheFingerprint as coreCacheFingerprint, shardOfKey, shardFileName, CACHE_SHARDS } from './libraryCacheCore.js';
import cacheRestoreWorker from './cacheRestoreWorker.js?worker&inline';
import { restoreFromMetaDb, persistMetas, removeMetaCards, syncMetas } from './sqliteMeta.js'; // 🚀 P2 B2:SQLite 元数据库数据层
// v4.1 D1a：换卡=换记忆（路径变更/删除时记忆跟随）
import { migrateMemoryCard, clearMemoryByCard } from './useChatMemory.js';

// ---------- 阶段打点（缺陷 #001 排查基建，永久保留） ----------
// plog 输出各阶段累计耗时:scan=SAF枚举 read=文件读取 parse=解析 publish=发布 cache=缓存落盘 total=总耗时
const perf = { scan: 0, read: 0, parse: 0, publish: 0, cacheWrite: 0, t0: 0 };
const pnow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function plog(tag) {
    console.info(`[Perf] ${tag} scan=${perf.scan | 0}ms read=${perf.read | 0}ms parse=${perf.parse | 0}ms publish=${perf.publish | 0}ms cache=${perf.cacheWrite | 0}ms total=${((pnow() - perf.t0) | 0)}ms`);
}

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
// 🚀 B1(两万卡专项):缓存从单文件 .jskzx_cache.json 拆为 .jskzx_cache/ 目录 16 个分片,
// 单卡变更只重写所在分片(≤1.25MB),两万卡总写盘仍为 ~20MB 但延迟变为增量;
// restore 传分片原文到 Worker 避免重复 stringify。
const CACHE_DIR = '/library/.jskzx_cache';
const CACHE_FILE_LEGACY = '/library/.jskzx_cache.json'; // 旧版单文件(用于迁移,存在时读取并转换)
const CACHE_VERSION = 2;
let embeddedCache = null; // { version, items: { [fingerprint]: cachedLight } }
let embeddedCacheTexts = null; // string[16] 分片原文(供 restoreViaWorker,避免重复 parse)
const dirtyShards = new Set(); // B1:待写分片索引(0..15),单卡变更只加对应分片

const cacheFingerprint = coreCacheFingerprint; // F3: 纯函数迁至 libraryCacheCore.js

/** B1:标记某个缓存键所在分片待写(替换旧 cacheDirty=true 单词) */
function markCacheDirty(keyOrPath) {
    dirtyShards.add(shardOfKey(keyOrPath));
}

/** 并行读 16 个分片文件,返回 string[16](null=不存在) */
async function readShardTexts() {
    const api = window.electronAPI;
    return Promise.all(Array.from({ length: CACHE_SHARDS }, (_, i) =>
        api.readText(`${CACHE_DIR}/${shardFileName(i)}`)
            .then(r => (r && r.success && typeof r.text === 'string') ? r.text : null)
            .catch(() => null)
    ));
}

/** 从分片原文构建 embeddedCache(主线程小 parse,与旧版单文件 20MB parse 成本等价) */
function mergeShardTextsIntoCache(texts) {
    const items = {};
    for (const text of texts) {
        if (!text) continue;
        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.version === CACHE_VERSION && parsed.items) {
                Object.assign(items, parsed.items); // 分片间键天然不冲突(shard 哈希)
            }
        } catch (e) { /* 单片损坏跳过 */ }
    }
    embeddedCache = { version: CACHE_VERSION, items };
}

async function loadEmbeddedCache() {
    if (embeddedCache) return embeddedCache;
    try {
        embeddedCacheTexts = await readShardTexts();
        const hasAny = embeddedCacheTexts.some(t => t != null);
        if (hasAny) {
            mergeShardTextsIntoCache(embeddedCacheTexts);
            // 迁移遗留:清理旧单文件(后台,非阻塞)
            if (embeddedCache && Object.keys(embeddedCache.items).length > 0) {
                window.electronAPI.deleteFile?.(CACHE_FILE_LEGACY).catch?.(() => {});
            }
            return embeddedCache;
        }
        // 分片全空:回退旧单文件(首迁移)
        const r = await window.electronAPI.readText(CACHE_FILE_LEGACY);
        if (r && r.success && r.text) {
            const parsed = JSON.parse(r.text);
            if (parsed && parsed.version === CACHE_VERSION && parsed.items) {
                embeddedCache = parsed;
                embeddedCacheTexts = null; // 分片尚空,稍后 flush 时写全量
                return embeddedCache;
            }
        }
    } catch (e) { /* 首次无缓存/版本不兼容 */ }
    embeddedCache = { version: CACHE_VERSION, items: {} };
    embeddedCacheTexts = Array(CACHE_SHARDS).fill(null);
    return embeddedCache;
}

let cacheFlushTimer = null;
function scheduleCacheFlush() {
    if (!dirtyShards.size) return;
    if (cacheFlushTimer) return;
    cacheFlushTimer = setTimeout(async () => {
        cacheFlushTimer = null;
        if (!embeddedCache) return;
        try {
            // 限制缓存体积:最多保留 20000 条轻量条目
            const keys = Object.keys(embeddedCache.items);
            let needFullFlush = false;
            if (keys.length > 20000) {
                for (const k of keys.slice(0, keys.length - 20000)) delete embeddedCache.items[k];
                // 裁剪会删任意分片的键 → 全量重写所有分片
                for (let i = 0; i < CACHE_SHARDS; i++) dirtyShards.add(i);
                needFullFlush = true;
            }
            // B1:增量分片写——只重写 dirtyShards 内的分片
            const toFlush = [...dirtyShards];
            dirtyShards.clear();
            const flushStart = pnow();
            const api = window.electronAPI;
            // 确保分片目录存在(SAF 首次写入需 mkdir)
            try { await api.mkdir?.(CACHE_DIR); } catch (e) { /* 已存在忽略 */ }
            for (const i of toFlush) {
                const shardItems = {};
                for (const [k, v] of Object.entries(embeddedCache.items)) {
                    if (shardOfKey(k) === i) shardItems[k] = v;
                }
                const json = JSON.stringify({ version: CACHE_VERSION, items: shardItems });
                await api.writeText(`${CACHE_DIR}/${shardFileName(i)}`, json);
            }
            perf.cacheWrite += pnow() - flushStart;
        } catch (e) { /* 缓存写失败不影响主流程 */ }
    }, 2000);
}

// ---------- 🚀 渐进上屏(缓存/DB 一次性重建后的安全展示) ----------
// 重型库(592+卡)一次性赋值会阻塞主线程 ~4s;分 60 张/批 push,首屏即时可见。
function progressivePublish(items) {
    const FIRST_BATCH = 60;
    mobileLibrary.library = items.slice(0, FIRST_BATCH);
    reportFullyDrawnOnce();
    if (items.length > FIRST_BATCH) {
        let idx = FIRST_BATCH;
        const tick = () => {
            if (idx >= items.length) return;
            mobileLibrary.library.push(...items.slice(idx, idx + FIRST_BATCH));
            idx += FIRST_BATCH;
            setTimeout(tick, 0);
        };
        setTimeout(tick, 0);
    }
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
    if (!w) return Promise.resolve(parseRawSync(kind, raw)); // Worker 完全不可用才主线程兜底(一次性)
    return new Promise((resolve) => {
        const id = ++parseReqId;
        parsePending.set(id, resolve);
        // F4:超时→null(禁止回退主线程),后续由二次机会队列后台补解析(I11)
        const timer = setTimeout(() => {
            if (parsePending.has(id)) {
                parsePending.delete(id);
                resolve(null);
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

// ---------- 首屏缩略图预热(阶段2:分层缓存的内存 + 磁盘双预热) ----------
let prefetchedThumbPaths = new Set();
let fullyDrawnReported = false;
const THUMB_PREFETCH_CAP = 60; // 首两屏上限,其余靠懒加载按需生成

/** 已解析卡片首屏预热:批量生成缩略图(原生磁盘缓存) + 填充内存缓存,
 *  首屏封面免逐卡 readThumb 原生往返;失败静默走懒加载兜底。
 *  F2:预热推迟到空闲期(requestIdleCallback/1.5s timeout)——scan/reconcile期间绝不抢占桥线程(I8) */
function prefetchCoverThumbs(cards) {
    const api = window.electronAPI;
    if (!api || typeof api.readThumbBatch !== 'function') return;
    const run = () => {
        if (prefetchedThumbPaths.size >= THUMB_PREFETCH_CAP) return;
        const pending = (cards || []).filter((c) => c && c.path && !prefetchedThumbPaths.has(c.path));
        if (!pending.length) return;
        const batch = pending.slice(0, THUMB_PREFETCH_CAP - prefetchedThumbPaths.size);
        batch.forEach((c) => prefetchedThumbPaths.add(c.path));
        api.readThumbBatch(batch).then((res) => {
            if (!res || !res.success || !Array.isArray(res.results)) return;
            for (const it of res.results) {
                if (it && it.success && it.buffer && it.path) prefillCoverCache(it.path, it.buffer);
            }
        }).catch(() => { /* 预热失败静默,封面走懒加载 */ });
    };
    // 空闲期执行:scan/reconcile 期间不抢占桥线程
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 400);
}

/** 冷启动 KPI:首帧内容可见后上报一次(reportFullyDrawn 计时) */
function reportFullyDrawnOnce() {
    if (fullyDrawnReported) return;
    const api = window.electronAPI;
    if (!api || typeof api.reportFullyDrawn !== 'function') return;
    fullyDrawnReported = true;
    setTimeout(() => { try { api.reportFullyDrawn(); } catch (e) { /* 忽略 */ } }, 250);
}

// ---------- F4: 解析超时二次机会队列(I11:主线程零重活) ----------
const parseRetryQueue = [];
const parseRetryPaths = new Set();

// 桥接能力探测:readCharaBatch(PNG 文本块批量提取,新增);低版本桥接自动回退 readBuffer。
// ⚠️ 必须调用时探测:本模块在 entry.js 注入 window.electronAPI 之前就可能被 import 求值。
function hasCharaBatch() {
    return typeof window !== 'undefined'
        && window.electronAPI && typeof window.electronAPI.readCharaBatch === 'function';
}

// ---------- F3: restore 缓存重建 Worker 化(特性开关,失败回退主线程) ----------
// 千卡基线:缓存 6MB JSON.parse + 1818 条重建在主线程 ~秒级;移入 Worker 后主线程只收成品数组(I10)
const RESTORE_VIA_WORKER = true; // F3 特性开关:出问题改 false 即回退 v1.10.15 行为
let restoreWorker = null, restoreReqId = 0;

function restoreViaWorker(textOrTexts) {
    return new Promise((resolve) => {
        try {
            if (!restoreWorker) restoreWorker = new cacheRestoreWorker();
            const id = ++restoreReqId;
            const timer = setTimeout(() => resolve(null), 3000); // Worker 异常时回退主线程路径
            restoreWorker.onmessage = (e) => {
                if (!e.data || e.data.id !== id) return;
                clearTimeout(timer);
                resolve(e.data.ok ? e.data : null);
            };
            // B1:分片文本数组(免二次 stringify)或单文件文本(旧版兼容)
            if (Array.isArray(textOrTexts)) restoreWorker.postMessage({ id, texts: textOrTexts });
            else restoreWorker.postMessage({ id, text: textOrTexts });
        } catch (_) { resolve(null); }
    });
}

/**
 * 🚀 二次启动秒开:从缓存直接重建轻量库(零 scan 零读文件)。
 * B1:优先走分片原文(embeddedCacheTexts,免重复 stringify);旧单文件缓存兼容回退。
 * 上屏后由 reconcileLibraryInBackground 后台 scan 增量校验(新增/删除/修改)。
 * @returns {boolean} 是否成功走缓存先行
 */
async function restoreLibraryFromCache(cache) {
    if (!cache || !cache.items) return false;
    const keys = Object.keys(cache.items);
    if (!keys.length) return false;
    let items = [];
    let categories = [];
    const shardTexts = embeddedCacheTexts && embeddedCacheTexts.some((t) => t != null) ? embeddedCacheTexts : null;
    if (shardTexts) {
        if (RESTORE_VIA_WORKER) {
            // 🚀 F3: 分片原文 → Worker 内逐片 parse+合并重建,主线程零重活(I10/B1)
            const built = await restoreViaWorker(shardTexts);
            if (built && built.items) { items = built.items; categories = built.categories || []; }
        }
        if (!items.length) {
            const r = restoreItemsFromShardTexts(shardTexts);
            if (r && r.items) { items = r.items; categories = r.categories || []; }
        }
    } else {
        if (RESTORE_VIA_WORKER) {
            const built = await restoreViaWorker(JSON.stringify(cache));
            if (built && built.items) { items = built.items; categories = built.categories || []; }
        }
        if (!items.length) {
            const r = restoreItemsFromCacheText(JSON.stringify(cache));
            if (r && r.items) { items = r.items; categories = r.categories || []; }
        }
    }
    if (!items.length) return false;
    mobileLibrary.categories = categories.length ? categories : mobileLibrary.categories;
    mobileLibrary.ready = true;
    mobileLibrary.loading = false;
    mobileLibrary.error = '';
    progressivePublish(items);
    reconcileLibraryInBackground();
    return true;
}

/** 缓存先行后的后台校验:scan 全树 → 增量解析(缓存命中免读文件) → 覆盖式更新 */
// 🛡️ BUG-12:加 loading 守卫——缓存先行秒开后用户立刻点刷新(loadLibrary 进行中)时,
// reconcile 的 staging 全量覆盖会把正在渐进上屏的新库闪回旧缓存视图;且 worldbooks 未清空,
// 每次 reconcile 都会把全库世界书重复 push 到 worldbooks 累积翻倍。
let reconciling = false;
let reconcileCancelled = false; // 🚀 E1:用户触发 refresh/loadLibrary(refresh=true) 时置 true,终止当前 reconcile
// 🛡️ BUG-11:加载重入守卫。防止缓存先行(s)与用户触发的 refresh(t)双 scan 并发,
// 后完成的覆盖先完成的→列表闪变/世界书累积翻倍
let loadPromise = null;

/** 🚀 E1:增量更新——对比 staging(扫描结果)与现有库,按 path 增删改,不全量替换数组,
 * 避免两万卡每次 reconcile 都触发一次全库 filter+sort (一次 ≈ 数百 ms 卡顿)。
 * 实现:构建 path→index 一次,替换赋值(不改长度),删除倒序 splice,追加放末尾(扫描顺序)。 */
function applyReconcileDiff(staging) {
    // 1. 路径索引(一次 O(N) 构建,供替换 O(1) 查找)
    const oldPathMap = new Map();
    mobileLibrary.library.forEach((c, i) => oldPathMap.set(c.path, i));
    const newPathSet = new Set(staging.map((c) => c.path));
    // 2. 替换内容变更的卡(赋值触发 Vue 单条响应式;不改数组长度,oldPathMap 索引始终有效)
    for (const card of staging) {
        const existIdx = oldPathMap.get(card.path);
        if (existIdx !== undefined && mobileLibrary.library[existIdx] !== card) {
            mobileLibrary.library[existIdx] = card;
        }
    }
    // 3. 删除磁盘上已不存在的卡(倒序 splice,不影响前面未处理位置的索引)
    for (let i = mobileLibrary.library.length - 1; i >= 0; i--) {
        if (!newPathSet.has(mobileLibrary.library[i].path)) mobileLibrary.library.splice(i, 1);
    }
    // 4. 追加新增卡(按 staging 扫描顺序,追加到末尾)
    const stillInLib = new Set(mobileLibrary.library.map((c) => c.path));
    for (const card of staging) {
        if (!stillInLib.has(card.path)) mobileLibrary.library.push(card);
    }
}

async function reconcileLibraryInBackground() {
    if (reconciling || mobileLibrary.loading) return;
    reconciling = true;
    try {
        const res = await window.electronAPI.rescanLibrary(LIBRARY_ROOT);
        if (!res || res.error) return;
        const files = (res.files || []).filter((f) => f && !f.isDirectory);
        mobileLibrary.categories = (res.categories || []).filter(Boolean);
        // 清空世界书再重建:防止多次 reconcile 累积重复条目
        mobileLibrary.worldbooks = [];
        const cache = await loadEmbeddedCache();
        const jsonFiles = files.filter((f) => (f.name || '').toLowerCase().endsWith('.json') && f.path !== CACHE_FILE_LEGACY);
        const imgFiles = files.filter((f) => !jsonFiles.includes(f));
        const staging = [];
        const append = (arr) => { for (const x of arr) if (x) staging.push(x); };
        const JSON_BATCH = 24, PNG_BATCH = 24, CONCURRENCY = 6;
        const cacheHit = (f, ignoreNegative = false) => {
            if (!cache) return false;
            const v = cache.items[cacheFingerprint(f)];
            if (!v) return false;
            if (v.nc && !ignoreNegative) return false; // F6: refresh=true 时负缓存视为 miss 重新探测
            return true;
        };
        for (let i = 0; i < jsonFiles.length; i += JSON_BATCH) {
            if (reconcileCancelled) break; // 🚀 E1:用户刷新时终止旧 reconcile
            const batch = jsonFiles.slice(i, i + JSON_BATCH);
            const missBatch = batch.filter((f) => !cacheHit(f));
            const textMap = new Map();
            if (missBatch.length) {
                try {
                    const br = await window.electronAPI.readTextBatch(missBatch.map((f) => f.path));
                    if (br && br.success && Array.isArray(br.results)) {
                        br.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
                    }
                } catch (e) { /* 忽略 */ }
            }
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            append(items);
            await yieldFrame();
        }
        for (let i = 0; i < imgFiles.length; i += PNG_BATCH) {
            if (reconcileCancelled) break; // 🚀 E1
            const batch = imgFiles.slice(i, i + PNG_BATCH);
            const missBatch = batch.filter((f) => !cacheHit(f));
            const textMap = new Map();
            if (hasCharaBatch() && missBatch.length) {
                try {
                    const cr = await window.electronAPI.readCharaBatch(missBatch.map((f) => f.path));
                    if (cr && cr.success && Array.isArray(cr.results)) {
                        cr.results.forEach((item) => {
                            if (item && item.success && typeof item.value === 'string') textMap.set(item.path, item.value);
                        });
                    }
                } catch (e) { /* 忽略 */ }
            }
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            append(items);
            await yieldFrame();
        }
        // 🚀 E1:增量 diff 更新——替换全量赋值,避免两万卡每次 reconcile 触发全库重排
        if (!reconcileCancelled) {
            applyReconcileDiff(staging);
            syncMetas(staging); // 🚀 BUG-17 fix-3:全量对齐 SQLite(清幽灵卡+变更一次落盘)
        }
        mobileLibrary.revision++;
        scheduleCacheFlush();
    } catch (e) { /* 后台修正失败:保留缓存先行视图 */ }
    finally { reconciling = false; reconcileCancelled = false; }
}

export async function loadLibrary(refresh = false) {
    // 🚀 E1:下拉刷新时终止正在跑的后台 reconcile(避免双 scan 并发,用户动作优先)
    if (refresh) reconcileCancelled = true;
    // 🛡️ BUG-11:加载重入守卫。loadLibrary 是重操作(全量 scan+解析,秒级),视图层虽有 loading 节流,
    // 但 reconcileLibraryInBackground 与 loadLibrary 是两个独立入口,可并发触发(缓存先行秒开时
    // reconcile 仍在跑,用户点刷新 → 双 scan 并发,后完成的覆盖先完成的,期间列表抖动/卡片闪变)。
    // 用模块级 Promise 互斥:新请求等待进行中的加载结束,避免叠加第二个 scan。
    if (loadPromise) {
        if (!refresh) return loadPromise; // 非刷新请求直接复用
        try { await loadPromise; } catch (e) { /* 旧请求失败不阻塞新请求 */ }
    }
    // 已加载完成且库非空时跳过重复扫描（返回页面/组件重复挂载不重扫；下拉刷新等传 true 强制重扫）
    if (!refresh && mobileLibrary.ready && mobileLibrary.library.length > 0) return;
    // 🚀 二次启动秒开(两万卡):SQLite 元数据库优先(一次 SQL 拿全量轻量字段,免读/合并 16 分片),
    // 失败自动回退 JSON 分片缓存先行;两者都只上屏,scan 后台增量校验。
    if (!refresh) {
        // 🚀 P2 B2:SQLite 元数据库路径
        const dbItems = await restoreFromMetaDb();
        if (dbItems && dbItems.length) {
            const cats = new Set();
            for (const c of dbItems) if (c.category && c.category !== '未分类') cats.add(c.category);
            mobileLibrary.categories = [...cats];
            mobileLibrary.ready = true;
            mobileLibrary.loading = false;
            mobileLibrary.error = '';
            progressivePublish(dbItems);
            reconcileLibraryInBackground();
            return;
        }
        // 回退:JSON 分片缓存先行
        const cache = await loadEmbeddedCache();
        if (await restoreLibraryFromCache(cache)) return;
    }
    loadPromise = (async () => {
    mobileLibrary.loading = true;
    mobileLibrary.error = '';
    mobileLibrary.ready = false;
    mobileLibrary.worldbooks = [];
    // 🐛 修复:重扫前先清空库,防止渐进上屏 publishProgress() 将新卡 push 到旧数据上→同卡重复出现
    mobileLibrary.library = [];
    try {
        // 阶段打点:重置计时器
        perf.t0 = pnow(); perf.scan = perf.read = perf.parse = perf.publish = perf.cacheWrite = 0;
        let s0 = pnow();
        const res = await window.electronAPI.rescanLibrary(LIBRARY_ROOT);
        perf.scan += pnow() - s0;
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
        const jsonFiles = files.filter((f) => (f.name || '').toLowerCase().endsWith('.json') && f.path !== CACHE_FILE_LEGACY);
        const imgFiles = files.filter((f) => !jsonFiles.includes(f));

        const append = (arr) => { for (const x of arr) if (x) staging.push(x); };

        // 🚀 渐进渲染:每批解析完立即把已解析卡片挂上库(列表秒级可见,不必等全库解析完)。
        // 千卡级优化:全量 staging.slice() 赋值会让 Vue 每次 diff 整个库(1994 卡 × 80 批 = 16 万次
        // 响应式操作,主线程长时间阻塞);改为记录已发布游标,只 push 新增批次(Vue 只 diff 增量)。
        let publishedCursor = 0;
        function publishProgress() {
            const b0 = pnow();
            const added = staging.slice(publishedCursor);
            publishedCursor = staging.length;
            if (added.length) {
                mobileLibrary.library.push(...added);
            }
            // 🚀 E1:空批次不再全量兜底赋值(原 staging.slice() 是 O(N) 且无新增时多余)
            prefetchCoverThumbs(added);   // 阶段2:只预热新增卡缩略图(避免每批全量重算)
            reportFullyDrawnOnce();       // 冷启动 KPI 埋点
            perf.publish += pnow() - b0;
        }

        // 🚀 二次启动秒开:批量读取前先筛出轻量缓存命中项(mtime/size 指纹一致),
        // 命中卡零文件读取直接重建条目;只对未命中卡发起 readTextBatch/readCharaBatch。
        // 冷启动瓶颈实测:scan 205ms + 全卡批量读取 ~340ms → 命中后仅剩 scan。
        const cacheHit = (f, ignoreNegative = false) => {
            if (!cache) return false;
            const v = cache.items[cacheFingerprint(f)];
            if (!v) return false;
            if (v.nc && !ignoreNegative) return false; // F6: refresh=true 时负缓存视为 miss 重新探测
            return true;
        };

        // ① JSON 卡:分批读文本 → 有界并发解析 → 只留轻量字段(文本/全量 data 逐批释放)
        for (let i = 0; i < jsonFiles.length; i += JSON_BATCH) {
            const batch = jsonFiles.slice(i, i + JSON_BATCH);
            const missBatch = batch.filter((f) => !cacheHit(f, refresh));
            const textMap = new Map();
            if (missBatch.length) {
                try {
                    const r0 = pnow();
                    const br = await window.electronAPI.readTextBatch(missBatch.map((f) => f.path));
                    perf.read += pnow() - r0;
                    if (br && br.success && Array.isArray(br.results)) {
                        br.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
                    }
                } catch (e) { /* 批量读失败降级:单卡逐个读 */ }
            }
            const p0 = pnow();
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            perf.parse += pnow() - p0;
            append(items);
            mobileLibrary.progress.done = Math.min(i + JSON_BATCH, jsonFiles.length);
            publishProgress();
            await yieldFrame();
        }

        // ② PNG/WebP:批量提取 chara 文本块(只读文本,不过桥整图 base64) → 有界并发解析
        //    webp 无 chara 文本块,回退 readBuffer 整图解析(数量少,可接受)
        for (let i = 0; i < imgFiles.length; i += PNG_BATCH) {
            const batch = imgFiles.slice(i, i + PNG_BATCH);
            const missBatch = batch.filter((f) => !cacheHit(f, refresh));
            const textMap = new Map();
            if (hasCharaBatch() && missBatch.length) {
                try {
                    const r0 = pnow();
                    const cr = await window.electronAPI.readCharaBatch(missBatch.map((f) => f.path));
                    perf.read += pnow() - r0;
                    if (cr && cr.success && Array.isArray(cr.results)) {
                        cr.results.forEach((item) => {
                            if (item && item.success && typeof item.value === 'string') textMap.set(item.path, item.value);
                        });
                    }
                } catch (e) { /* 降级 readBuffer */ }
            }
            const p0 = pnow();
            const items = await mapLimit(batch, CONCURRENCY, (f) => parseLightCard(f, textMap.get(f.path), cache));
            perf.parse += pnow() - p0;
            append(items);
            mobileLibrary.progress.done = jsonFiles.length + Math.min(i + PNG_BATCH, imgFiles.length);
            publishProgress();
            await yieldFrame();
        }

        // 🚀 E1:加载完成时 diff 对齐(渐进渲染已 push 过大部分,这里处理删除/替换/追加)
        applyReconcileDiff(staging);
        syncMetas(staging); // 🚀 BUG-17 fix-3:全量对齐 SQLite(清幽灵卡+变更一次落盘)
        mobileLibrary.ready = true;
        mobileLibrary.revision++;
        scheduleCacheFlush();
    } catch (e) {
        mobileLibrary.error = '加载失败: ' + (e.message || e);
    } finally {
        mobileLibrary.loading = false;
        let tag;
        if (refresh) tag = 'refresh';
        else if (perf.read > 0) tag = 'coldscan';
        else tag = 'cacherestore';
        plog(tag);
        await drainParseRetries();
        if (flavorCallback) flavorCallback();
    }
    })();
    loadPromise.finally(() => { loadPromise = null; });
    return loadPromise;
}

/**
 * 增量导入(修复缺陷 #001:导入后不再全库重扫)。
 * 只解析新增卡 → 追加内存库 → 补全新分组 → 修订号 + 缓存落盘(搜索索引由 revision watch 重建)。
 * 3MB 卡导入耗时:全库重扫(数十秒~分钟级) → 仅新卡解析(亚秒级)。
 * @param {string[]} copiedPaths 原生导入返回的新卡路径(库内绝对路径 /library/...)
 * @returns {Promise<{added:number, failed:number}>}
 */
export async function appendImportedCards(copiedPaths) {
    const paths = (Array.isArray(copiedPaths) ? copiedPaths : []).filter(Boolean);
    if (!paths.length) return { added: 0, failed: 0 };
    const cache = await loadEmbeddedCache();
    // 1) 批量取新卡元数据(mtime/size,单次 IPC)——绝不全库重扫
    const stats = await window.electronAPI.getFileStats(paths);
    const statMap = (stats && stats.data) || {};
    // 2) 组装 file 元信息(与 loadLibrary 的 scan 条目同构)
    const fileObjs = paths.map((p) => {
        const rel = String(p).replace(/^\/library\//, '');
        const segs = rel.split('/');
        const name = segs.pop() || '';
        const subFolder = segs.join('/');
        const st = statMap[p] || {};
        return {
            name,
            path: p,
            isDirectory: false,
            mtime: st.mtimeMs || 0,
            birthtime: 0,
            size: st.size || 0,
            subFolder,
            category: subFolder ? subFolder.split('/')[0] : '未分类'
        };
    });
    // 3) 按类型批量预取解析文本(JSON 读文本 / PNG 提取 chara 文本块,均不过桥整图)
    const textMap = new Map();
    const jsonFiles = fileObjs.filter((f) => f.name.toLowerCase().endsWith('.json'));
    const imgFiles = fileObjs.filter((f) => !jsonFiles.includes(f));
    if (jsonFiles.length) {
        try {
            const br = await window.electronAPI.readTextBatch(jsonFiles.map((f) => f.path));
            if (br && br.success && Array.isArray(br.results)) {
                br.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
            }
        } catch (e) { /* 降级单卡读 */ }
    }
    if (imgFiles.length && hasCharaBatch()) {
        try {
            const cr = await window.electronAPI.readCharaBatch(imgFiles.map((f) => f.path));
            if (cr && cr.success && Array.isArray(cr.results)) {
                cr.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
            }
        } catch (e) { /* 降级整图解析 */ }
    }
    // 4) 有界并发解析(新卡数量少,2 路足够且不争抢 UI)
    const items = await mapLimit(fileObjs, 2, (f) => parseLightCard(f, textMap.get(f.path), cache));
    let added = 0, failed = 0;
    for (const it of items) {
        if (it) { mobileLibrary.library.push(it); added++; }
        else failed++;
    }
    // 5) 补全新出现的一级分组(导入到新建分组时列表分组可见)
    for (const f of fileObjs) {
        if (f.category && f.category !== '未分类' && !mobileLibrary.categories.includes(f.category)) {
            mobileLibrary.categories.push(f.category);
        }
    }
    if (added > 0) {
        mobileLibrary.revision++; // 触发搜索索引重建(CardLibraryView watch)
        scheduleCacheFlush();
        // 🚀 BUG-17 fix-4:新增卡即时写入 SQLite(免等下次 reconcile 才更新元数据)
        try { persistMetas(items.filter(Boolean)); } catch (e) { /* DB 写入失败下次 reconcile 覆盖 */ }
    }
    return { added, failed };
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
        // F6: 负缓存条目(nc)不算命中,走下方真实解析
        const cachedVal = cache.items[fp];
        const cached = (cachedVal && cachedVal.nc) ? null : lightFieldsFromCache(cachedVal, file.name);
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
                    // F6: 混入库的普通 json(非角色卡非世界书)写负缓存,只探测一次
                    if (cache && fp) {
                        evictSamePathCache(cache, fp);
                        cache.items[fp] = { ...NEG, m: file.mtime || 0, s: file.size || 0 };
                        markCacheDirty(fp);
                        scheduleCacheFlush();
                    }
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
        if (!parsedData) {
            // F4:解析失败进二次机会队列(后台补解析,不阻塞主线程)
            if (typeof prefetchedText === 'string' && !parseRetryPaths.has(file.path)) {
                parseRetryPaths.add(file.path);
                parseRetryQueue.push(file);
            }
            // F6: 不可解析文件写负缓存,后续 scan/reconcile 零成本跳过
            if (cache && fp) {
                evictSamePathCache(cache, fp);
                cache.items[fp] = { ...NEG, m: file.mtime || 0, s: file.size || 0 };
                markCacheDirty(fp);
                scheduleCacheFlush();
            }
            return null;
        }
        const normalized = normalizeCardData(parsedData);
        const fields = extractCardLightFields(normalized, {
            fileName: file.name,
            path: file.path,
            subFolder: file.subFolder || '',
            category: file.category || '未分类'
        });
        if (cache && fp) {
            try {
                evictSamePathCache(cache, fp);
                cache.items[fp] = lightFieldsToCache(fields);
                markCacheDirty(fp);
                scheduleCacheFlush();
            } catch (e) { /* 缓存写入失败不影响主流程 */ }
        }
        return buildLightItem(file, fields);
    } catch (e) {
        if (typeof prefetchedText === 'string' && !parseRetryPaths.has(file.path)) {
            parseRetryPaths.add(file.path);
            parseRetryQueue.push(file);
        }
        return null;
    }
}

// buildLightItem 已迁至 libraryCacheCore.js(import 使用),单一事实源

/** F4: 二次机会队列消费——解析失败的卡在后台逐卡补解析并增量上屏 */
async function drainParseRetries() {
    let n = 0;
    while (parseRetryQueue.length) {
        const file = parseRetryQueue.shift();
        await yieldFrame();
        const cache = await loadEmbeddedCache();
        const it = await parseLightCard(file, undefined, cache); // 不带预取文本→重读重析
        if (it) {
            mobileLibrary.library.push(it);
            n++; // 缓存写入已在 parseLightCard 内 markCacheDirty + scheduleCacheFlush
        } else {
            parseRetryPaths.delete(file.path); // 彻底失败:允许下轮 scan 再试
        }
    }
    if (n) { mobileLibrary.revision++; }
    if (n) console.info(`[Perf] retryParsed=${n}`);
}

// ---------- E2: 内容查重签名缓存(path→96 路 MinHash 签名) ----------
// 持久化到库根 .jskzx_sigs.json(原生 scan 已按 .jskzx 前缀跳过该文件)。
// 收益:二次查重不再全文水合 2GB chara——只对新卡算签名,其余直接复用内存/磁盘缓存。
const SIGS_FILE = '/library/.jskzx_sigs.json';
const contentSigs = new Map();
let sigsLoaded = false;
let sigFlushTimer = null;

/** 加载签名缓存(首次调用时读盘),返回 Map<path, sig> */
export async function loadContentSigs() {
    if (sigsLoaded) return contentSigs;
    sigsLoaded = true;
    try {
        const r = await window.electronAPI.readText(SIGS_FILE);
        if (r && r.success && r.text) {
            const parsed = JSON.parse(r.text);
            if (parsed && parsed.version === 1 && parsed.sigs) {
                for (const [k, v] of Object.entries(parsed.sigs)) {
                    if (Array.isArray(v) && v.length === 96) contentSigs.set(k, v);
                }
            }
        }
    } catch (e) { /* 无签名缓存 */ }
    return contentSigs;
}

/** 取卡签名(未计算返回 null) */
export function getContentSig(path) { return contentSigs.get(path) || null; }

/** 写入卡签名(节流 1.5s 持久化) */
export function setContentSig(path, sig) {
    if (!path || !Array.isArray(sig) || !sig.length) return;
    contentSigs.set(path, sig);
    if (sigFlushTimer) return;
    sigFlushTimer = setTimeout(() => {
        sigFlushTimer = null;
        try {
            window.electronAPI.writeText(SIGS_FILE, JSON.stringify({ version: 1, sigs: Object.fromEntries(contentSigs) })).catch?.((_) => {});
        } catch (e) { /* 签名写失败不影响查重 */ }
    }, 1500);
}

/**
 * 🚀 批量按需加载全量数据(内容查重等全库扫描场景):分批桥接 + 有界并发,
 * 避免逐卡单次 IPC(2000 卡 = 2000 次桥接,数分钟)。
 * @param {Array} cards 轻量条目数组(只需 path/fileName)
 * @param {(done:number, total:number)=>void} [onProgress] 每批完成回调(UI 进度)
 * @returns {Promise<Map<string, object>>} path → normalized 完整卡片(解析失败不包含)
 */
export async function loadCardsFullDataBatch(cards, onProgress) {
    const out = new Map();
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return out;
    const BATCH = 24;
    const CONCURRENCY = 8;
    const jsonCards = list.filter((c) => (c.fileName || c.path || '').toLowerCase().endsWith('.json'));
    const imgCards = list.filter((c) => !jsonCards.includes(c));
    let done = 0;
    const total = list.length;
    const tick = () => { if (onProgress) { try { onProgress(done, total); } catch (e) { /* 忽略 */ } } };

    // ① JSON 卡:批量读文本 → 并发解析
    for (let i = 0; i < jsonCards.length; i += BATCH) {
        const batch = jsonCards.slice(i, i + BATCH);
        const textMap = new Map();
        try {
            const br = await window.electronAPI.readTextBatch(batch.map((c) => c.path));
            if (br && br.success && Array.isArray(br.results)) {
                br.results.forEach((item) => { if (item && item.success) textMap.set(item.path, item.value); });
            }
        } catch (e) { /* 降级单卡读 */ }
        const results = await mapLimit(batch, CONCURRENCY, async (c) => {
            let text = textMap.get(c.path);
            if (typeof text !== 'string') {
                const r = await window.electronAPI.readText(c.path);
                text = (r && r.success && typeof r.text === 'string') ? r.text : null;
            }
            if (text == null) return [c.path, null];
            const parsed = await parseViaWorker('json', text);
            return [c.path, (parsed && typeof parsed === 'object') ? normalizeCardData(parsed) : null];
        });
        results.forEach(([p, data]) => { if (data) out.set(p, data); });
        done += batch.length; tick();
        await yieldFrame();
    }

    // ② PNG/WebP:批量提取 chara 文本块 → 并发解析(webp/失败回退整图)
    for (let i = 0; i < imgCards.length; i += BATCH) {
        const batch = imgCards.slice(i, i + BATCH);
        const textMap = new Map();
        if (hasCharaBatch()) {
            try {
                const cr = await window.electronAPI.readCharaBatch(batch.map((c) => c.path));
                if (cr && cr.success && Array.isArray(cr.results)) {
                    cr.results.forEach((item) => {
                        if (item && item.success && typeof item.value === 'string') textMap.set(item.path, item.value);
                    });
                }
            } catch (e) { /* 降级 */ }
        }
        const results = await mapLimit(batch, CONCURRENCY, async (c) => {
            const prefetched = textMap.get(c.path);
            let parsed = null;
            if (typeof prefetched === 'string') {
                parsed = await parseViaWorker('json', prefetched);
            }
            if (!parsed || typeof parsed !== 'object') {
                const r = await window.electronAPI.readBuffer(c.path);
                if (r && r.success && r.buffer) parsed = await parseViaWorker('png', r.buffer);
            }
            return [c.path, (parsed && typeof parsed === 'object') ? normalizeCardData(parsed) : null];
        });
        results.forEach(([p, data]) => { if (data) out.set(p, data); });
        done += batch.length; tick();
        await yieldFrame();
    }
    return out;
}

/** 按 path 取卡片 */
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
/** 🐛 缓存条目覆写:同一路径的旧指纹条目一并清除(指纹=path|mtime|size,保存后换键;
 *  不清旧键会导致缓存里同路径多条目 → 缓存先行还原时同一张卡出现多张)。 */
function evictSamePathCache(cache, key) {
    if (!cache || !cache.items || !key) return;
    const path = key.split('|').slice(0, -2).join('|');
    if (!path) return;
    const prefix = path + '|';
    for (const k of Object.keys(cache.items)) {
        if (k !== key && k.startsWith(prefix)) delete cache.items[k];
    }
}

// 全量数据读取短期去重缓存:同一路径的并发 loadCardFullData 共享同一次读取,
// 完成后立即失效(避免陈旧数据);防详情页水合 + 兜底 watch 并发整卡读桥
const fullDataInflight = new Map(); // path → Promise<data|null>

export async function loadCardFullData(card) {
    const key = card && card.path;
    if (key) {
        const inflight = fullDataInflight.get(key);
        if (inflight) return inflight;
    }
    const promise = loadCardFullDataInner(card);
    if (key) {
        fullDataInflight.set(key, promise);
        promise.finally(() => fullDataInflight.delete(key));
    }
    return promise;
}

async function loadCardFullDataInner(card) {
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
        if (name.endsWith('.png') && hasCharaBatch()) {
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
        light._searchText = toMemorySearchText(fields.searchText);
        light._tags = fields.tags;
        light._tokens = fields.tokens;
        light._lb = fields.hasLorebook;
        light._rx = fields.hasRegex;
        mobileLibrary.revision++;
        if (embeddedCache) {
            try {
                // 🐛 修复:原 cacheFingerprint(light) 读 light.mtime/light.size 但轻量条目只有
                // _mtime/_size → 始终写入 path|0|0,与扫描键 path|mtime|size 不同 → 同路径两键
                // → 缓存还原时一张卡出现两份(3×保存→3键→3份,用户报"一张卡变三张")。
                // 改为用 _mtime/_size 组合指纹(与 parseLightCard 写入的键相同)。
                const fp = `${light.path}|${light._mtime || 0}|${light._size || 0}`;
                evictSamePathCache(embeddedCache, fp);
                embeddedCache.items[fp] = lightFieldsToCache(fields);
                markCacheDirty(fp);
                scheduleCacheFlush();
            } catch (e) { /* 忽略 */ }
        }
        // 🚀 BUG-17 fix-1:编辑保存后即时同步 SQLite 元数据库
        // 防止重启 DB restore 路径显示旧标签/旧名称(直到 reconcile 才修正)。
        // persistMetas 是 fire-and-forget(内部 .catch 静默)，无性能影响。
        try { persistMetas([light]); } catch (e) { /* 失败走下次 reconcile 自愈 */ }
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
        // 🚀 BUG-17 fix-3:移动后清理旧 path 的 SQLite 行(旧 DB 行不删→幽灵卡永久残留)
        try { removeMetaCards([oldPath]); } catch (e) { /* DB 清理失败下次 reconcile 覆盖 */ }
        // v4.1 D1a：路径变更→记忆跟随（fire-and-forget，失败不影响主流程）
        if (oldPath && card.path && oldPath !== card.path) {
            migrateMemoryCard(oldPath, card.path).catch(() => { /* 记忆迁移失败静默 */ });
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
        // 🚀 BUG-17 fix-2:删除后同步清理 JSON 分片缓存条目 + SQLite 行,防重启幽灵卡
        // (旧实现只 splice 内存数组——分片缓存与 DB 里该卡的行永久残留,INSERT OR REPLACE 不删行)
        if (embeddedCache) {
            try {
                const fp = `${card.path}|0|0`; // evictSamePathCache 只取 path 前缀,key 数值任意
                evictSamePathCache(embeddedCache, fp);
                markCacheDirty(fp);
                scheduleCacheFlush();
            } catch (e) { /* 缓存清理失败不改主流程 */ }
        }
        try { removeMetaCards([card.path]); } catch (e) { /* DB 清理失败下次 reconcile 覆盖 */ }
        // v4.1 D1a：卡删除→记忆清除（fire-and-forget，避免残留跨卡泄漏）
        try { clearMemoryByCard(card.path); } catch (e) { /* 记忆清除失败静默 */ }
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
