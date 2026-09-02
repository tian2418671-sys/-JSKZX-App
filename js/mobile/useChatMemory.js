/**
 * 移动端长期记忆（MemoryChat 方案 B 融合）
 *  - 底层走原生 MemoryPlugin（Android 内置 SQLite），与桌面版无关
 *  - L1 原始消息 / L2 摘要 / L3 事实 统一为 type 字段存储
 *  - 测卡发送前检索相关记忆注入 system；发送后异步记录对话
 */
import { api } from '../bridge/api.js';

const LS_ENABLED = 'jsmobile-memory-enabled';
const LS_LIMIT = 'jsmobile-memory-limit';

export function isMemoryEnabled() {
    return localStorage.getItem(LS_ENABLED) !== '0';
}
export function setMemoryEnabled(v) {
    if (v) localStorage.setItem(LS_ENABLED, '1');
    else localStorage.setItem(LS_ENABLED, '0');
}
export function getMemoryLimit() {
    const n = parseInt(localStorage.getItem(LS_LIMIT) || '20', 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), 200) : 20;
}
export function setMemoryLimit(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return;
    localStorage.setItem(LS_LIMIT, String(Math.min(Math.max(Math.round(v), 1), 200)));
}

/** 记录一条记忆（不阻塞，失败静默） */
export async function recordMemory(type, content, cardName) {
    if (!isMemoryEnabled()) return null;
    try {
        return await api.memoryAdd({ type: type || 'message', content: content || '', cardName: cardName || '' });
    } catch (e) {
        return { success: false, error: (e && e.message) || '' };
    }
}

/** 记录对话消息（user / assistant） */
export function recordMessage(role, content, cardName) {
    return recordMemory('message', `${role === 'user' ? '用户' : 'AI'}: ${content || ''}`, cardName);
}

/** 记录事实（L3，用户关键信息） */
export function recordFact(content, cardName) {
    return recordMemory('fact', content, cardName);
}

/** 检索相关记忆 */
export async function searchMemory(query, limit) {
    try {
        const res = await api.memorySearch({ query: query || '', limit: limit || getMemoryLimit() });
        return (res && res.success && res.items) ? res.items : [];
    } catch (e) {
        return [];
    }
}

/** 列出记忆（供查看器） */
export async function listMemory(type, limit) {
    try {
        const res = await api.memoryList({ type: type || '', limit: limit || 100 });
        return (res && res.success && res.items) ? res.items : [];
    } catch (e) {
        return [];
    }
}

export async function removeMemory(id) {
    try { return await api.memoryRemove(id); } catch (e) { return { success: false }; }
}

export async function clearMemory(type) {
    try { return await api.memoryClear(type); } catch (e) { return { success: false }; }
}

/**
 * 根据用户输入检索相关记忆，拼成可注入 system 的文本片段。
 * 仅返回事实(fact)与摘要(summary)类记忆；空则返回 ''。
 */
export async function buildMemoryContext(query) {
    if (!isMemoryEnabled()) return '';
    try {
        const items = await searchMemory(query, getMemoryLimit());
        const useful = items.filter((it) => it && (it.type === 'fact' || it.type === 'summary') && it.content);
        if (!useful.length) return '';
        return '### 相关记忆(供参考，请自然融入对话，勿直接复述)\n' +
            useful.map((it) => '- ' + it.content).join('\n');
    } catch (e) {
        return '';
    }
}
