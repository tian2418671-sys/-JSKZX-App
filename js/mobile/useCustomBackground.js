/**
 * 自定义背景图 — 设置页「自定义背景」的选图 / 持久化 / 全局应用
 *
 * 设计:
 *  - 图片持久化: IndexedDB(jskzx-bg-v1 → kv → custom-background) 存压缩后的 Blob;
 *    选图后 canvas 压缩到最长边 ≤ MAX_DIM、优先编码 WebP(保留透明通道),失败回退 JPEG。
 *  - 应用方式: .mobile-shell 多重背景(第 1 层主题色遮罩 + 第 2 层图片),见 theme-mobile-app.css;
 *    --stc-bg-image 为图片 url(无图时移除); --stc-bg-mask-alpha 为遮罩浓度;
 *    主题底色通过 --stc-bg-mask-rgb(theme.js 按当前主题写入)参与 rgba() 拼装。
 *  - 可见度: localStorage('jsmobile-bg-visibility') 持久化,换算遮罩浓度 = 1 - 可见度;
 *    可见度低 → 遮罩浓 → 图片更"融入"主题底色,保证文字可读性。
 *  - 环境兼容: Capacitor 原生走 api.pickImage(系统图片选择器);浏览器预览回落 <input type=file>。
 *
 * 注意: 本模块顶层不得访问 window/document/localStorage(全部在函数体内),
 *       以便 Node 测试直接 import 纯函数做单测。
 */

import { api } from '../bridge/api.js';

export const BG_VIS_KEY = 'jsmobile-bg-visibility';
export const BG_VIS_DEFAULT = 80;
export const BG_VIS_MIN = 20;
export const BG_VIS_MAX = 100;

const DB_NAME = 'jskzx-bg-v1';
const DB_STORE = 'kv';
const IMG_KEY = 'custom-background';
const MAX_DIM = 2560;   // 压缩后最长边(px):兼顾清晰度与解码开销
const QUALITY = 0.85;

// =========================================================
// 纯函数(可单测)
// =========================================================

/** 可见度收敛:缺失/非法值回默认,夹取到 [BG_VIS_MIN, BG_VIS_MAX] 整数 */
export function normalizeVisibility(v) {
    if (v === null || v === undefined || v === '') return BG_VIS_DEFAULT;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return BG_VIS_DEFAULT;
    return Math.min(BG_VIS_MAX, Math.max(BG_VIS_MIN, n));
}

/** 可见度 → 遮罩浓度(0~0.8):可见度 100 → 0(不遮), 20 → 0.8(重遮) */
export function visibilityToMaskOpacity(v) {
    return (100 - normalizeVisibility(v)) / 100;
}

// =========================================================
// IndexedDB 存取
// =========================================================

let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
        });
    }
    return dbPromise;
}

function idbDo(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const req = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB 事务失败'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务中止'));
    }));
}

const idbGet = (key) => idbDo('readonly', (s) => s.get(key));
const idbSet = (key, val) => idbDo('readwrite', (s) => s.put(val, key));
const idbDel = (key) => idbDo('readwrite', (s) => s.delete(key));

// =========================================================
// CSS 变量应用
// =========================================================

let currentUrl = '';

/** 替换 currentUrl(释放旧 objectURL),返回新值 */
function swapUrl(next) {
    if (currentUrl && currentUrl !== next) {
        try { URL.revokeObjectURL(currentUrl); } catch (e) { /* 忽略 */ }
    }
    currentUrl = next || '';
    return currentUrl;
}

/** 写入/移除背景图 url(--stc-bg-image) */
export function applyBackgroundImage(url) {
    const root = document.documentElement;
    if (url) root.style.setProperty('--stc-bg-image', `url("${url}")`);
    else root.style.removeProperty('--stc-bg-image');
}

/** 写入遮罩浓度(--stc-bg-mask-alpha),返回归一化后的可见度 */
export function applyVisibility(v) {
    const vis = normalizeVisibility(v);
    document.documentElement.style.setProperty('--stc-bg-mask-alpha', String(visibilityToMaskOpacity(vis)));
    return vis;
}

/** 读取已保存的可见度(非法/缺失回默认) */
export function currentVisibility() {
    try {
        return normalizeVisibility(localStorage.getItem(BG_VIS_KEY));
    } catch (e) {
        return BG_VIS_DEFAULT;
    }
}

/** 保存并立即应用可见度 */
export function setVisibility(v) {
    const vis = applyVisibility(v);
    try { localStorage.setItem(BG_VIS_KEY, String(vis)); } catch (e) { /* 忽略 */ }
    return vis;
}

// =========================================================
// 主流程
// =========================================================

let loaded = false;

/**
 * 从 IndexedDB 恢复背景(幂等;应用启动与设置页共用)。
 * @param {boolean} [force] 强制重读(如外部数据变更后)
 * @returns {Promise<{active: boolean, url: string}>}
 */
export async function ensureBackgroundLoaded(force) {
    if (loaded && !force) return { active: !!currentUrl, url: currentUrl };
    loaded = true;
    applyVisibility(currentVisibility());
    try {
        const rec = await idbGet(IMG_KEY);
        if (rec && rec.blob && rec.blob.size) {
            applyBackgroundImage(swapUrl(URL.createObjectURL(rec.blob)));
        } else {
            applyBackgroundImage(swapUrl(''));
        }
    } catch (e) {
        console.warn('[custom-bg] 背景读取失败:', e);
    }
    return { active: !!currentUrl, url: currentUrl };
}
export const initBackground = ensureBackgroundLoaded;

/** base64 → Blob */
function base64ToBlob(b64, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'image/jpeg' });
}

/** 解码图片:优先 createImageBitmap,回退 Image + objectURL */
function decodeImage(blob) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
        img.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((b) => resolve(b), type, quality);
        } catch (e) {
            resolve(null);
        }
    });
}

/** 压缩图片:最长边 ≤ MAX_DIM(已足够小则原样返回);编码失败兜底返回原图 */
async function compressImage(blob) {
    try {
        const bmp = await decodeImage(blob);
        const w0 = bmp.width || bmp.naturalWidth;
        const h0 = bmp.height || bmp.naturalHeight;
        if (!w0 || !h0) return blob;
        const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
        if (scale >= 1 && blob.size <= 3 * 1024 * 1024) return blob; // 尺寸与体积都够小,免二次编码
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
        if (typeof bmp.close === 'function') bmp.close();
        const out = (await canvasToBlob(canvas, 'image/webp', QUALITY))
            || (await canvasToBlob(canvas, 'image/jpeg', QUALITY));
        return (out && out.size) ? out : blob;
    } catch (e) {
        console.warn('[custom-bg] 图片压缩失败,使用原图:', e);
        return blob;
    }
}

/** 浏览器回退:隐藏 <input type=file> 选图(用户取消时 Promise 悬挂,仅调试环境走此路径) */
function pickFileViaInput() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const f = input.files && input.files[0];
            resolve(f ? { success: true, blob: f } : { success: false, cancelled: true });
        };
        input.click();
    });
}

/** 取得用户选择的图片 Blob(原生图片选择器 / 浏览器文件输入) */
async function pickImageBlob() {
    if (api && typeof api.pickImage === 'function') {
        const pick = await api.pickImage();
        if (!pick || !pick.success) return pick || { success: false, error: '选择图片失败' };
        return { success: true, blob: base64ToBlob(pick.base64, pick.mime) };
    }
    return pickFileViaInput();
}

/**
 * 弹出选择器选图 → 压缩 → 存 IndexedDB → 立即应用。
 * @returns {Promise<{success: boolean, cancelled?: boolean, error?: string, size?: number}>}
 */
export async function pickBackgroundImage() {
    const picked = await pickImageBlob();
    if (!picked || !picked.success) return picked || { success: false, error: '选择图片失败' };
    let blob = picked.blob;
    if (!blob || !blob.size) return { success: false, error: '图片内容为空' };
    blob = await compressImage(blob);
    await idbSet(IMG_KEY, { blob, mime: blob.type || picked.blob.type || 'image/jpeg', updatedAt: Date.now() });
    applyBackgroundImage(swapUrl(URL.createObjectURL(blob)));
    loaded = true;
    return { success: true, size: blob.size };
}

/** 移除背景图(IndexedDB 删除 + CSS 变量清除) */
export async function removeBackgroundImage() {
    try { await idbDel(IMG_KEY); } catch (e) { console.warn('[custom-bg] 背景删除失败:', e); }
    applyBackgroundImage(swapUrl(''));
    loaded = true;
    return { success: true };
}
