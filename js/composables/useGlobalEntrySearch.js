/**
 * 全库词条搜索与反向引用组合式函数（Composable）
 * 把「独立世界书 worldbooks」与「角色卡内嵌世界书 library.character_book」两类词条归一化后
 * 建成统一索引，支持跨库按触发词/正文/备注/来源名检索并定位来源（跳转）。
 * 共享状态（worldbooks / library / appMode / activeWorldbook / openFromLibrary）保留在 App.vue 并注入。
 */
import { ref, computed } from 'vue';
import { extractBookEntries } from '../utils/cardLoader.js';

// 把触发词字段归一化为字符串数组（兼容数组 / 逗号分隔字符串 / 空）
function toArray(v) {
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (v === undefined || v === null) return [];
    return String(v).split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

// 把一条词条归一化为统一结构（独立世界书用 key/keysecondary；角色卡内嵌世界书用 keys/secondary_keys）
function normalizeEntry(entry, sourceType, sourceName, sourcePath) {
    if (!entry || typeof entry !== 'object') return null;
    const isWb = sourceType === 'worldbook';
    const keys = toArray(isWb ? entry.key : entry.keys);
    const secondary = toArray(isWb ? entry.keysecondary : entry.secondary_keys);
    return {
        keys,
        secondary,
        content: String(entry.content || ''),
        comment: entry.comment || entry.name || '',
        enabled: entry.enabled !== false,
        constant: !!entry.constant,
        selective: !!entry.selective,
        insertion_order: entry.insertion_order ?? 50,
        order: entry.order ?? 100,
        sourceType, sourceName, sourcePath
    };
}

export function useGlobalEntrySearch({ worldbooks, library, appMode, activeWorldbook, openFromLibrary }) {
    // 全库词条索引（惰性计算，仅在打开弹窗/搜索时触发）
    const globalEntryIndex = computed(() => {
        const list = [];
        // 独立世界书
        (worldbooks.value || []).forEach(wb => {
            const name = (wb.data && wb.data.name) || wb.name || '未命名世界书';
            const entries = (wb.data && Array.isArray(wb.data.entries)) ? wb.data.entries : [];
            entries.forEach(e => {
                const n = normalizeEntry(e, 'worldbook', name, wb.path || '');
                if (n) list.push(n);
            });
        });
        // 角色卡内嵌世界书（🛡️ extractBookEntries 兼容 entries 数组/字典/数组 book 全形态，
        //    旧版漏索引字典形态 entries 的卡片，其内嵌词条在全库搜索中永远搜不到）
        (library.value || []).forEach(item => {
            const d = (item.data && item.data.data) || item.data || {};
            const book = d.character_book || (item.data && item.data.character_book) || {};
            const entries = extractBookEntries(book);
            const name = d.name || item.name || '未知角色';
            entries.forEach(e => {
                const n = normalizeEntry(e, 'card', name, item.path || '');
                if (n) list.push(n);
            });
        });
        return list;
    });

    const globalEntrySearchQuery = ref('');
    const globalEntrySearchResults = computed(() => {
        const q = globalEntrySearchQuery.value.trim().toLowerCase();
        if (!q) return [];
        return globalEntryIndex.value.filter(en => {
            const hay = [en.keys.join(' '), en.secondary.join(' '), en.content, en.comment, en.sourceName].join(' ').toLowerCase();
            return hay.includes(q);
        });
    });

    const showGlobalEntrySearchModal = ref(false);
    const openGlobalEntrySearch = () => {
        globalEntrySearchQuery.value = '';
        showGlobalEntrySearchModal.value = true;
    };
    const closeGlobalEntrySearch = () => { showGlobalEntrySearchModal.value = false; };

    // 点击结果项跳转到来源（世界书 / 角色卡）
    const jumpToEntrySource = (result) => {
        if (!result) return;
        if (result.sourceType === 'worldbook') {
            const wb = worldbooks.value.find(w =>
                (result.sourcePath && w.path === result.sourcePath) ||
                (!result.sourcePath && ((w.data && w.data.name) || w.name) === result.sourceName)
            );
            if (wb) activeWorldbook.value = wb;
            appMode.value = 'worldbooks';
        } else {
            const item = library.value.find(i =>
                (result.sourcePath && i.path === result.sourcePath) ||
                (!result.sourcePath && (((i.data && i.data.data) || i.data || {}).name || i.name) === result.sourceName)
            );
            if (item) openFromLibrary(item);
            appMode.value = 'characters';
        }
        showGlobalEntrySearchModal.value = false;
    };

    return {
        globalEntryIndex, globalEntrySearchQuery, globalEntrySearchResults,
        showGlobalEntrySearchModal, openGlobalEntrySearch, closeGlobalEntrySearch, jumpToEntrySource
    };
}
