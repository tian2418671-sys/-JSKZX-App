/**
 * 移动端长期记忆（MemoryChat 方案 B 融合）
 *  - 底层走原生 MemoryPlugin（Android 内置 SQLite），与桌面版无关
 *  - L1 原始消息 / L2 摘要 / L3 事实 统一为 type 字段存储
 *  - 测卡发送前检索相关记忆注入 system；发送后异步记录对话
 * v4.1：card_path 分桶（换卡=换记忆）；I2/I4/I5 注入治理；migrateMemoryToV2 一次性迁移
 */
import { api } from '../bridge/api.js';
import { estimateTokens } from '../utils/tokenEstimate.js';

const LS_ENABLED = 'jsmobile-memory-enabled';
const LS_LIMIT = 'jsmobile-memory-limit';
const LS_INJECT_TOKENS = 'jsmobile-memory-inject-tokens';
const LS_FORMAT = 'jsmobile-memory-format';
const LS_V2 = 'jsmobile-memory-v2';        // 灰度 flag：v4.1 新分桶/新格式/新条数
const LS_FACT_KEEP = 'jsmobile-memory-fact-keep';

const DEFAULT_LIMIT = 8;                    // I2：默认注入条数 20 → 8
const MAX_LIMIT = 200;
const DEFAULT_INJECT_TOKENS = 200;          // I2：默认注入 token 预算
const MAX_INJECT_TOKENS = 400;              // I2：硬上限（防中文 token 估算误差）
const DEFAULT_FACT_KEEP = 50;               // D4：单卡 fact 上限（与原生层 FACT_KEEP 对齐）

const LS_BATCH_SUPPRESS = 'jsmobile-memory-batch-suppress'; // B1：批量抑制标记（崩溃恢复依据）

// v4.1 审计修复·B1 崩溃恢复：进入批量模式时记忆被临时抑制（本地开关置 0）；
// 若 App 在批量模式中退出/被杀，下次启动检测到标记 → 自动恢复记忆开关（避免长期静默不记忆）
try {
    if (localStorage.getItem(LS_BATCH_SUPPRESS) === '1') {
        localStorage.removeItem(LS_BATCH_SUPPRESS);
        localStorage.setItem(LS_ENABLED, '1');
    }
} catch (e) { /* 非浏览器/隐私模式忽略 */ }

/** D2：停用词表（集中常量，可配置；命中后有效词 <2 降级为最近 N 条） */
const STOP_WORDS = new Set([
    '我', '你', '您', '他', '她', '它', '我们', '你们', '他们', '她们', '它们',
    '的', '了', '是', '在', '吗', '呢', '吧', '啊', '呀', '哦', '嗯', '唔',
    '继续', '好', '好的', '可以', '嗯嗯', '然后', '但是', '所以', '因为',
    '这个', '那个', '什么', '怎么', '为什么', '这样', '那样', '一下', '一个',
    '不要', '没有', '不是', '真的', '感觉', '觉得', '知道', '想', '要', '说',
    '喂', '嗨', '哈喽', 'hello', 'hi', 'ok', 'okay', 'yes', 'no', '谢谢', '不客气'
]);

/** I4：注入格式 flag（C = XML 格式 / markdown = 表格） */
const LS_FORMAT_C = 'C';

export function isMemoryEnabled() {
    return localStorage.getItem(LS_ENABLED) !== '0';
}
export function setMemoryEnabled(v) {
    if (v) localStorage.setItem(LS_ENABLED, '1');
    else localStorage.setItem(LS_ENABLED, '0');
}
/** B1：批量模式抑制标记（进入批量时打标；正常退出时清除；两者之间被杀 → 下次启动恢复） */
export function markMemoryBatchSuppress() {
    try { localStorage.setItem(LS_BATCH_SUPPRESS, '1'); } catch (e) { /* 忽略 */ }
}
export function clearMemoryBatchSuppress() {
    try { localStorage.removeItem(LS_BATCH_SUPPRESS); } catch (e) { /* 忽略 */ }
}
export function getMemoryLimit() {
    const n = parseInt(localStorage.getItem(LS_LIMIT) || String(DEFAULT_LIMIT), 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}
export function setMemoryLimit(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return;
    localStorage.setItem(LS_LIMIT, String(Math.min(Math.max(Math.round(v), 1), MAX_LIMIT)));
}
/** I2：注入 token 预算 */
export function getMemoryInjectTokens() {
    const n = parseInt(localStorage.getItem(LS_INJECT_TOKENS) || String(DEFAULT_INJECT_TOKENS), 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_INJECT_TOKENS) : DEFAULT_INJECT_TOKENS;
}
export function setMemoryInjectTokens(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return;
    localStorage.setItem(LS_INJECT_TOKENS, String(Math.min(Math.max(Math.round(v), 1), MAX_INJECT_TOKENS)));
}
/** I4：注入格式（C / markdown） */
export function getMemoryFormat() {
    const v = localStorage.getItem(LS_FORMAT);
    return v === 'markdown' ? 'markdown' : LS_FORMAT_C;
}
export function setMemoryFormat(f) {
    localStorage.setItem(LS_FORMAT, f === 'markdown' ? 'markdown' : LS_FORMAT_C);
}
/** 灰度 flag：v4.1 新路径 */
export function isMemoryV2() {
    return localStorage.getItem(LS_V2) !== '0';
}
export function setMemoryV2(v) {
    if (v) localStorage.setItem(LS_V2, '1');
    else localStorage.setItem(LS_V2, '0');
}
/** D4：单卡 fact 上限（JS 侧兜底提示；原生层 FACT_KEEP 强制） */
export function getMemoryFactKeep() {
    const n = parseInt(localStorage.getItem(LS_FACT_KEEP) || String(DEFAULT_FACT_KEEP), 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 1), 500) : DEFAULT_FACT_KEEP;
}

/** 归一化卡参数：接受 string（旧）或 object { path, name }（新） */
function normalizeCard(card) {
    if (typeof card === 'object' && card !== null) {
        return { path: String(card.path || ''), name: String(card.name || '') };
    }
    const s = String(card == null ? '' : card);
    return { path: s, name: s };
}

/** 记录一条记忆（不阻塞，失败静默）；card 支持 string|object */
export async function recordMemory(type, content, key, card) {
    if (!isMemoryEnabled()) return null;
    const { path, name } = normalizeCard(card);
    try {
        return await api.memoryAdd({ type: type || 'message', content: content || '', key: key || '', cardName: name, cardPath: path });
    } catch (e) {
        return { success: false, error: (e && e.message) || '' };
    }
}

/**
 * 记录对话消息（user / assistant）
 * 治理：错误占位（⚠ 开头）与空内容不进记忆；去重与 L1 修剪由原生层完成
 * card: string（旧调用，兼容）或 object { path, name }（R1/R2）
 */
export function recordMessage(role, content, card) {
    const text = String(content || '').trim();
    if (!text) return null;
    if (text.startsWith('⚠')) return null; // 请求失败占位文本不是记忆
    const { path, name } = normalizeCard(card);
    return recordMemory('message', `${role === 'user' ? '用户' : 'AI'}: ${text}`, '', { path, name });
}

/** 记录事实（L3，记忆表格行：键=值） */
export function recordFact(key, value, card) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return null;
    const { path, name } = normalizeCard(card);
    return recordMemory('fact', v, String(key || '备忘').trim(), { path, name });
}

/** 更新记忆表格行（改键/改值/确认状态） */
export async function updateMemory(id, patch) {
    try {
        return await api.memoryUpdate(id, patch || {});
    } catch (e) {
        return { success: false, error: (e && e.message) || '' };
    }
}

/** 确认/拒绝：confirmed=1 确认 / -1 软删（可恢复） */
export async function confirmMemory(id, confirmed) {
    try {
        return await api.memoryConfirm(id, confirmed);
    } catch (e) {
        return { success: false, error: (e && e.message) || '' };
    }
}

// ---------- L3 事实提取（用户交代的关键信息 → 记忆表格行） ----------
// v4.1 D3 规则收紧：显式陈述优先；排除疑问句/否定假设/引用；值上限
// key 枚举提为单一常量源 FACT_KEYS（D3 提取与 I4 分类共用）
export const FACT_KEYS = ['名字', '年龄', '喜欢', '讨厌', '备忘', '位置', '目标'];

/** 值上限：普通 30 字；显式指示词（记住/我叫/我今年）80 字（D3：统一截断先于转义） */
const VALUE_LIMIT_NORMAL = 30;
const VALUE_LIMIT_EXPLICIT = 80;

/** D3：空泛键排除 —— "我的想法是…/我在思考…"类不产生 fact（想法/思考/感觉/心情/猜测/疑问/问题/打算/计划/意见/观点/建议） */
const VAGUE_KEYS = /^(想法|思考|感觉|心情|猜测|疑问|问题|打算|计划|意见|观点|建议)$/;

/** D3：排除条件 —— 疑问句/否定假设/引用 */
function isExcluded(text) {
    if (!text) return true;
    // 疑问句（以问号结尾或含"？"）
    if (/[?？]/.test(text)) return true;
    // 否定假设（如果/要是/假如/万一）
    if (/(如果|要是|假如|万一|假设)/.test(text)) return true;
    // 引用（他说…/她说…/他们说…）
    if (/(他|她|他们|她们|别人|人家)说/.test(text)) return true;
    return false;
}

/** D3：截断（先于转义） */
function clampValue(v, limit) {
    return String(v == null ? '' : v).trim().slice(0, limit);
}

/** D3：启发式规则 —— 显式陈述优先（键 值）。值为句末截止（。！？!? 或行尾）。 */
const FACT_RULES = [
    // 显式指示词：记住/牢记/记下 → 80 字上限
    { re: /(?:记住|牢记|记下)\s*[:：]?\s*(.+?)(?:[。！？!?]|$)/, key: '备忘', limit: VALUE_LIMIT_EXPLICIT },
    { re: /(?:你|您|老板娘|老板|管家|夫君|主人|哥哥|姐姐)(?:要)?(?:记住|记得|牢记)\s*[:：]?\s*(.+?)(?:[。！？!?]|$)/, key: '备忘', limit: VALUE_LIMIT_EXPLICIT },
    // 名字
    { re: /(?:我叫|我的名字(?:叫|是)?|名字是|本名是)\s*[:：]?\s*(.+?)(?:[。！？!?，,]|$)/, key: '名字', limit: VALUE_LIMIT_EXPLICIT },
    // 年龄
    { re: /我?(?:今年|现在)\s*(\d+)\s*岁/, key: '年龄', valueFrom: (m) => m[1] + '岁', limit: VALUE_LIMIT_NORMAL },
    // 喜欢
    { re: /我(?:最喜欢|超喜欢|特别喜欢|喜欢)\s*[:：]?\s*(.+?)(?:[。！？!?，,]|$)/, key: '喜欢', limit: VALUE_LIMIT_NORMAL },
    // 讨厌：允许逗号后省略「我」的口语写法（「我喜欢X，讨厌Y。」）
    { re: /(?<=^|[，,；;：:\s])我?(?:最讨厌|特别讨厌|讨厌|不喜欢)\s*[:：]?\s*(.+?)(?:[。！？!?，,]|$)/, key: '讨厌', limit: VALUE_LIMIT_NORMAL },
    // 位置（D3：排除「我在思考/我在想…」等认知活动——它们是心理活动，不是位置）
    { re: /我?(?:现在|正在|身处)?(?:在|身处)\s*[:：]?\s*(?!(?:思考|想|考虑|琢磨|回忆|怀疑|纠结|担心|盘算|寻思))(.+?)(?:[。！？!?，,]|$)/, key: '位置', limit: VALUE_LIMIT_NORMAL },
    // 目标
    { re: /我?(?:想去|要去|打算去|计划去)\s*[:：]?\s*(.+?)(?:[。！？!?，,]|$)/, key: '目标', limit: VALUE_LIMIT_NORMAL },
    // 泛化：我的X是Y → X 为键（D3 排除"我的想法是…/我在思考…"类）
    { re: /我的(.+?)(?:是|为)\s*[:：]?\s*(.+?)(?:[。！？!?，,]|$)/, key: (m) => String(m[1] || '备忘').trim(), limit: VALUE_LIMIT_NORMAL },
];

/** 从用户消息提取事实列表：[{ key, value }]（纯函数，供单测）；同键同值去重 */
export function extractFacts(text) {
    const src = String(text || '');
    if (isExcluded(src)) return [];
    const facts = [];
    const seen = new Set();
    for (const rule of FACT_RULES) {
        const m = rule.re.exec(src);
        if (!m) continue;
        const key = typeof rule.key === 'function' ? rule.key(m) : rule.key;
        const value = rule.valueFrom ? rule.valueFrom(m) : String(m[m.length - 1] || '').trim();
        if (!key || !value) continue;
        // D3：排除"我的想法是/我在思考"类空泛键值（泛化键直接跳过，不做值长度判断）
        if (VAGUE_KEYS.test(String(key))) continue;
        const clamped = clampValue(value, rule.limit || VALUE_LIMIT_NORMAL);
        if (!clamped) continue;
        const sig = key + '\u0000' + clamped;
        if (seen.has(sig)) continue; // 「记住X」与「你记住X」等重叠规则只记一次
        seen.add(sig);
        facts.push({ key, value: clamped });
    }
    return facts;
}

/** 检索相关记忆（v3：cardPath 强制隔离）；cardName = card_path */
export async function searchMemory(query, limit, cardPath) {
    try {
        const res = await api.memorySearch({ query: query || '', limit: limit || getMemoryLimit(), cardName: cardPath || '' });
        return (res && res.success && res.items) ? res.items : [];
    } catch (e) {
        return [];
    }
}

/** 列出记忆（供查看器）；cardName = card_path 按卡过滤 */
export async function listMemory(type, limit, cardPath) {
    try {
        const res = await api.memoryList({ type: type || '', limit: limit || 100, cardName: cardPath || '' });
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

export async function clearMemoryByCard(cardPath) {
    try { return await api.memoryClearByCard(cardPath); } catch (e) { return { success: false }; }
}

/** 卡路径迁移（D1a）：rename/move 后记忆跟随 */
export async function migrateMemoryCard(from, to) {
    try { return await api.memoryMigrateCard({ from: from || '', to: to || '' }); } catch (e) { return { success: false }; }
}

/** D2：query 切词 → 有效词列表（去停用词） */
export function tokenizeQuery(query) {
    const src = String(query || '');
    const words = src.split(/[\s,，。.!！?？;；:：、]+/).filter((w) => w && !STOP_WORDS.has(w));
    return words;
}

/**
 * 根据用户输入检索相关记忆，拼成可注入 system 的文本片段（I4 格式 C）：
 *   - 有效词 <2 → 降级为本卡最近 N 条（updated_at DESC）
 *   - fact 事实 → <user_profile>；summary 摘要 → <recent_events>
 * 返回 { text, meta }（I5：meta 供 debug，灰度关闭时 meta=null）
 */
export async function buildMemoryContext(query, cardPath) {
    if (!isMemoryEnabled()) return { text: '', meta: null };
    const v2 = isMemoryV2();
    const limit = getMemoryLimit();
    const budget = getMemoryInjectTokens();
    const format = getMemoryFormat();
    try {
        let items = [];
        let degraded = false;
        const words = tokenizeQuery(query || '');
        if (words.length < 2) {
            // D2：有效词 <2 降级 → 本卡最近 N 条
            degraded = true;
            items = await searchMemory('', limit, cardPath);
        } else {
            items = await searchMemory(words.join(' '), limit, cardPath);
            // 命中不足时也可降级补充（可选，保守起见不自动降级补）
        }
        // 只取确认的记忆（P0 恒 1，P1 收紧后生效）
        const confirmedItems = items.filter((it) => it && it.confirmed !== -1);
        const facts = confirmedItems.filter((it) => it && it.type === 'fact' && it.content);
        const summaries = confirmedItems.filter((it) => it && it.type === 'summary' && it.content);

        // I2：按"条数 + 估算 token"双约束截断
        const takeByCount = (arr, n) => arr.slice(0, n);
        let factsTake = takeByCount(facts, limit);
        let summariesTake = takeByCount(summaries, Math.max(1, Math.floor(limit / 2)));
        // token 预算：逐步收窄直到满足
        while (factsTake.length + summariesTake.length > 0) {
            const text = buildInjectionText(factsTake, summariesTake, format);
            if (estimateTokens(text) <= budget) break;
            if (factsTake.length > 0) factsTake = factsTake.slice(0, factsTake.length - 1);
            else summariesTake = summariesTake.slice(0, summariesTake.length - 1);
        }

        const text = buildInjectionText(factsTake, summariesTake, format);
        if (!text) return { text: '', meta: v2 ? { injectedCount: 0, cardPath, isDegraded: degraded, estimatedTokens: 0 } : null };
        const meta = v2 ? {
            injectedCount: factsTake.length + summariesTake.length,
            cardPath: cardPath || '',
            isDegraded: degraded,
            estimatedTokens: estimateTokens(text)
        } : null;
        return { text, meta };
    } catch (e) {
        return { text: '', meta: v2 ? { injectedCount: 0, cardPath, isDegraded: true, estimatedTokens: 0, error: (e && e.message) || '' } : null };
    }
}

/** I4：按格式拼装注入文本（C = XML / markdown = 表格） */
function buildInjectionText(facts, summaries, format) {
    const parts = [];
    const isC = format === LS_FORMAT_C;
    if (isC) {
        if (facts.length) {
            const lines = facts.map((f) => `${escXml(f.key || '备忘')}：${escXml(f.content)}`);
            parts.push('<memory>');
            parts.push('<user_profile>');
            parts.push(lines.join('\n'));
            parts.push('</user_profile>');
            if (summaries.length) {
                parts.push('<recent_events>');
                parts.push(summaries.map((s) => '- ' + escXml(s.content)).join('\n'));
                parts.push('</recent_events>');
            }
            parts.push('</memory>');
        } else if (summaries.length) {
            parts.push('<memory>');
            parts.push('<recent_events>');
            parts.push(summaries.map((s) => '- ' + escXml(s.content)).join('\n'));
            parts.push('</recent_events>');
            parts.push('</memory>');
        }
    } else {
        if (facts.length) {
            parts.push('### 记忆表格（角色已记住的信息，请在对话中自然运用，不要逐条复述）');
            parts.push('| 记忆 | 内容 |');
            parts.push('| --- | --- |');
            for (const f of facts) {
                parts.push('| ' + escTable(f.key || '备忘') + ' | ' + escTable(f.content) + ' |');
            }
        }
        if (summaries.length) {
            parts.push('### 对话摘要（近期发生的事）');
            parts.push(summaries.map((s) => '- ' + s.content).join('\n'));
        }
    }
    return parts.join('\n\n');
}

/**
 * 一次性迁移：显示名 → card_path（7.5 定案，JS 层执行）
 * @param {Array} cardList - mobileLibrary.library（[{ name, path }, ...]）
 * 唯一匹配：某显示名只对应一个 path → 该显示名的记忆 card_path = 该 path
 * 多卡同名/无匹配/空名 → card_path = NULL（遗留桶，不丢数据）
 */
export async function migrateMemoryToV2(cardList) {
    if (!Array.isArray(cardList) || !cardList.length) return { success: false, error: '卡列表为空' };
    // 按 name 分组计数（7.5：唯一匹配定义）
    const nameCount = new Map();
    const nameToPath = new Map();
    for (const c of cardList) {
        const name = c && c.name ? String(c.name).trim() : '';
        const path = c && c.path ? String(c.path) : '';
        if (!name || !path) continue; // 空名/空 path 防御
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
        nameToPath.set(name, path);
    }
    const mappings = [];
    for (const [name, count] of nameCount) {
        if (count === 1) {
            mappings.push([name, nameToPath.get(name)]);
        } else {
            // 同名多卡 → 遗留桶（card_path = null）
            mappings.push([name, null]);
        }
    }
    try {
        return await api.memoryMigrateData(mappings);
    } catch (e) {
        return { success: false, error: (e && e.message) || '' };
    }
}

/** Markdown 表格单元格转义：| → \|、换行 → 空格（防表格破行） */
function escTable(s) {
    return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** XML 转义（I4 格式 C）：& < > 等（截断已先于转义） */
function escXml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/\r?\n/g, ' ');
}
