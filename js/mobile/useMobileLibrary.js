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
        for (let i = 0; i < files.length; i += CONCURRENCY) {
            const batch = files.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(parseCard));
            staging.push(...results.filter(Boolean));
            mobileLibrary.progress.done = Math.min(i + CONCURRENCY, files.length);
        }
        mobileLibrary.library = staging;
        mobileLibrary.ready = true;
    } catch (e) {
        mobileLibrary.error = '加载失败: ' + (e.message || e);
    } finally {
        mobileLibrary.loading = false;
        if (flavorCallback) flavorCallback();
    }
}

async function parseCard(file) {
    const name = (file.name || '').toLowerCase();
    try {
        let parsedData = null;
        if (name.endsWith('.json')) {
            const r = await window.electronAPI.readText(file.path);
            if (r && r.success && typeof r.text === 'string') {
                const parsed = JSON.parse(r.text);
                if (!isCharacterCardData(parsed)) {
                    // 非角色卡:识别独立世界书文件(含 extensions.world_book 或顶层 entries 的世界书容器)
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
            } else return null;
        } else if (file.embeddedData && typeof file.embeddedData === 'object') {
            parsedData = file.embeddedData;
        } else {
            const r = await window.electronAPI.readBuffer(file.path);
            if (r && r.success && r.buffer) {
                const buf = r.buffer;
                parsedData = parsePNGChunk(buf) || deepScanForJSON(buf);
            } else return null;
        }
        if (!parsedData) return null;
        const normalized = normalizeCardData(parsedData);
        return {
            id: file.path,
            path: file.path,
            fileName: file.name,
            name: (normalized.data && normalized.data.name) || parsedData.name || '未命名',
            creator: (normalized.data && normalized.data.creator) || '未知',
            avatar: null, // 封面懒加载(MobileCardCover)
            data: normalized,
            category: file.category || (file.subFolder ? file.subFolder.split('/')[0] : '未分类'),
            customTags: [],
            subFolder: file.subFolder || '',
            _mtime: file.mtime || 0
        };
    } catch (e) {
        return null;
    }
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