/**
 * 🚀 轻量卡片字段提取（移动端大库内存优化核心，纯函数模块）
 * 背景：300+ 卡库闪退根因是「全量 card.data 常驻内存 + Vue 深响应式代理 + 单次桥接巨型载荷」。
 * 方案：列表只保留轻量元数据（名称/作者/标签/描述片段/搜索全文/Token 估算/特征标记），
 *       完整卡片 JSON 由详情页按需加载（loadCardFullData），2000 卡库内存从数百 MB 降至 ~10MB。
 * 本模块与响应式/桥接无关，可直接被 node --test 单测。
 */
import { estimateTokens } from './tokenEstimate.js';

// 搜索全文截断上限（单卡 60K 字符）：防个别超大卡（巨型世界书）撑爆轻量缓存与搜索索引
const MAX_SEARCH_TEXT = 60000;

// 🚀 两万卡专项（I13 不变量）：内存条目与缓存条目的搜索文本同源同长。
// 冷扫描路径曾保留 60K 全文在内存（2 万卡最坏 >1GB）；统一截断到 1.5K 后
// 与缓存先行路径（缓存本就只存 1.5K）一致，两万卡内存 ~60MB 封顶。
// 取舍：超长 description / 深层世界书内容的尾部无法命中全文搜索（详情页全文不受影响）。
export const MEMORY_SEARCH_TEXT = 1500;

/** 统一的内存/缓存搜索文本截断（与 lightFieldsToCache 的 s 字段同长） */
export function toMemorySearchText(s) {
    return (typeof s === 'string' && s.length > MEMORY_SEARCH_TEXT)
        ? s.slice(0, MEMORY_SEARCH_TEXT)
        : (typeof s === 'string' ? s : '');
}

function push(list, v) {
    if (v !== undefined && v !== null && v !== '') list.push(String(v));
}

/**
 * 从归一化卡片构建搜索全文（小写）。
 * 字段语义与 useSearch.extractCardSearchableText 对齐（物理信息 + 核心人设 + 扩展 + 内嵌世界书）。
 * @param {object} normalized normalizeCardData 后的卡片对象
 * @param {object} meta {fileName, path, subFolder, category} 物理文件信息
 */
export function buildCardSearchText(normalized, meta = {}) {
    const data = (normalized && normalized.data) || {};
    const segs = [];
    push(segs, meta.fileName);
    push(segs, meta.path);
    push(segs, meta.subFolder);
    push(segs, meta.category);
    push(segs, data.name);
    push(segs, data.creator || data.author);
    push(segs, data.description);
    push(segs, data.personality);
    push(segs, data.scenario);
    push(segs, data.first_mes);
    push(segs, data.mes_example);
    push(segs, data.creator_notes);
    if (Array.isArray(data.alternate_greetings)) {
        push(segs, data.alternate_greetings.map((g) => String(g)).join(' '));
    }
    const ext = data.extensions;
    if (ext && typeof ext === 'object') {
        if (ext.depth_prompt && ext.depth_prompt.prompt) push(segs, ext.depth_prompt.prompt);
        if (ext.system_prompt !== undefined && ext.system_prompt !== null) {
            push(segs, typeof ext.system_prompt === 'string' ? ext.system_prompt : JSON.stringify(ext.system_prompt));
        }
        if (Array.isArray(ext.regex_scripts)) {
            ext.regex_scripts.forEach((script) => {
                if (!script || typeof script !== 'object') return;
                if (script.scriptName) push(segs, script.scriptName);
                if (script.findRegex) push(segs, script.findRegex);
                if (script.replaceString) push(segs, script.replaceString);
            });
        }
    }
    const book = data.character_book;
    if (book && typeof book === 'object') {
        const entries = book.entries;
        const list = Array.isArray(entries)
            ? entries
            : (entries && typeof entries === 'object' ? Object.values(entries) : []);
        list.forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            if (entry.comment || entry.name) push(segs, entry.comment || entry.name);
            if (entry.content) push(segs, entry.content);
            if (Array.isArray(entry.keys)) push(segs, entry.keys.map((k) => String(k)).join(' '));
            if (Array.isArray(entry.secondary_keys)) push(segs, entry.secondary_keys.map((k) => String(k)).join(' '));
        });
    }
    let text = segs.join(' ').toLowerCase();
    if (text.length > MAX_SEARCH_TEXT) text = text.slice(0, MAX_SEARCH_TEXT);
    return text;
}

/** 是否含内嵌世界书（快捷过滤 has_lorebook） */
export function cardHasLorebook(normalized) {
    const data = (normalized && normalized.data) || {};
    const book = data.character_book;
    if (!book || typeof book !== 'object') return false;
    const entries = book.entries;
    if (Array.isArray(entries)) return entries.length > 0;
    return !!(entries && typeof entries === 'object' && Object.keys(entries).length > 0);
}

/** 是否含正则脚本（快捷过滤 has_regex，对齐 useChatRegex 双位置读取） */
export function cardHasRegex(normalized) {
    const dd = (normalized && normalized.data) || {};
    const ddScripts = (dd.extensions && Array.isArray(dd.extensions.regex_scripts)) ? dd.extensions.regex_scripts
        : (Array.isArray(dd.regex_scripts) ? dd.regex_scripts : null);
    const topScripts = (normalized && normalized.extensions && Array.isArray(normalized.extensions.regex_scripts)) ? normalized.extensions.regex_scripts
        : (normalized && Array.isArray(normalized.regex_scripts) ? normalized.regex_scripts : null);
    return !!((ddScripts && ddScripts.length) || (topScripts && topScripts.length));
}

/**
 * 从归一化卡片提取全部轻量字段（调用后完整 data 即可丢弃）。
 * @returns {{name, creator, tags, desc, searchText, tokens, hasLorebook, hasRegex}}
 */
export function extractCardLightFields(normalized, meta = {}) {
    const data = (normalized && normalized.data) || {};
    const name = data.name || meta.name || '';
    const creator = data.creator || data.author || '';
    const tags = (Array.isArray(data.tags) ? data.tags : [])
        .map((t) => String(t).trim()).filter(Boolean);
    const desc = typeof data.description === 'string' ? data.description : '';
    const searchText = buildCardSearchText(normalized, { ...meta, name, creator });
    return {
        name,
        creator,
        tags,
        // 列表摘要只留前 200 字（完整描述在详情页按需加载）
        desc: desc.length > 200 ? desc.slice(0, 200) + '…' : desc,
        searchText,
        tokens: estimateTokens(searchText),
        hasLorebook: cardHasLorebook(normalized),
        hasRegex: cardHasRegex(normalized)
    };
}

/** 轻量字段 → 缓存紧凑形态（键名缩写，缩小 .jskzx_cache.json 体积） */
export function lightFieldsToCache(f) {
    return {
        n: f.name || '',
        c: f.creator || '',
        t: f.tags || [],
        d: f.desc || '',
        // searchText 截断到 1.5K:4K/卡 × 千卡级 = 11MB+ 缓存,二次启动读+parse 秒级阻塞。
        // 前 1.5K 已覆盖 name/creator/tags/description/personality 等核心搜索字段,
        // 深层世界书内容搜索召回略降,换千卡库冷启动提速数倍。
        s: toMemorySearchText(f.searchText),
        k: f.tokens || 0,
        b: f.hasLorebook ? 1 : 0,
        x: f.hasRegex ? 1 : 0
    };
}

/** 缓存紧凑形态 → 轻量字段（损坏/缺字段时返回 null 走重解析） */
export function lightFieldsFromCache(c, fallbackName = '未命名') {
    if (!c || typeof c !== 'object') return null;
    return {
        name: typeof c.n === 'string' ? c.n : fallbackName,
        creator: typeof c.c === 'string' ? c.c : '未知',
        tags: Array.isArray(c.t) ? c.t : [],
        desc: typeof c.d === 'string' ? c.d : '',
        searchText: typeof c.s === 'string' ? c.s : '',
        tokens: Number(c.k) || 0,
        hasLorebook: c.b === 1,
        hasRegex: c.x === 1
    };
}
