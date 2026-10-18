/**
 * 🏷️ 标签解析（自包含 · 移植桌面版 `js/utils/llmPromptRoles.js` 的解析内核）
 *
 * ═══════════════════════════════════════════════════════════════
 * 🔴 为什么要这个模块
 * ───────────────────────────────────────────────────────────────
 * 移动版旧实现：
 *   `rawReply.match(/\[[\s\S]*?\]/)` + `JSON.parse` —— 非贪婪取「第一个 [ 到 第一个 ]」，
 *   且失败后 `replace(/[\[\]"'`]/g,'').split(/[,，、\n]/)` 把整段回复暴力拆分。
 *
 * 问题（对齐桌面版 AI-19 / AI-09 实测结论）：
 *   · 思考型模型（GLM / DeepSeek / 商汤）先输出思维链，链里含 `[1]`、`["示例"]`
 *     ⇒ 取到的是**示例**或**推理碎片**；
 *   · 没有方括号的纯文本推理 ⇒ 被逗号切成一堆「看起来像标签」的句子，
 *     直接写进卡片 `tags`（用户可见的脏数据）。
 *
 * 本模块 = 桌面版解析内核的**零依赖副本**（不 import 任何东西，可 `node --test` 直接测）：
 *   · 剥思考块（`<thinking>` / `【思考】` / ` ```think ` 围栏）
 *   · 三层降级：① `<tags>…</tags>` 精确边界（取最后一个合法包裹）
 *              ② JSON 数组（从后往前找第一个能解析的；贪婪兜底嵌套）
 *              ③ 逐行候选 + 推理残留判据（宁缺毋滥）
 *   · `strict` 档：疑似推理候选占比 ≥ 30% ⇒ 整批判废
 *
 * 与桌面版的一致性：判据文本与阈值逐条对齐（`MAX_TAG_LEN = 40` / `strict 0.3`），
 * 差异仅在：本文件只保留解析相关函数，不含提示词组装。
 */

/** 🏷️ 结构化输出的标签名（与桌面版一致） */
export const TAG_WRAPPER = 'tags';
/** 解析时同时兼容的中文标签名 */
export const TAG_WRAPPER_ALT = '标签';
/** 预填充默认值（与桌面版一致） */
export const DEFAULT_PREFILL = `<${TAG_WRAPPER}>[`;
/** 🧠 项级长度上限（超长项基本是解释文字；正常标签 ≤ 20 字） */
export const MAX_TAG_LEN = 40;

/** 思考块的常见名字 */
export const THINK_BLOCK_NAMES = ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'cot', '思考', '推理', '分析', '思考过程', '推理过程'];

/** 代码围栏形态的推理块（```think / ```reasoning / ```思考） */
const THINK_FENCE_RE = /```[ \t]*(?:think|thinking|reasoning|thought|analysis|cot|思考|推理|分析)[^\n]*\n([\s\S]*?)```/gi;

/**
 * 剥掉模型输出的「思考块」（尖括号 / 中文方头括号 / 代码围栏三种形态）。
 * @param {string} text
 * @returns {string}
 */
export function stripThinkingBlocks(text) {
    let out = String(text == null ? '' : text);
    out = out.replace(THINK_FENCE_RE, '');
    for (const name of THINK_BLOCK_NAMES) {
        out = out.replace(new RegExp(`<\\s*${name}\\s*>[\\s\\S]*?<\\s*/\\s*${name}\\s*>`, 'gi'), '');
        out = out.replace(new RegExp(`【\\s*${name}\\s*】[\\s\\S]*?【\\s*/\\s*${name}\\s*】`, 'g'), '');
    }
    return out.trim();
}

/**
 * 🧠 推理 / 句子残留判据 —— 判断一个「准标签」是不是模型思维链或解释文字的碎片。
 *
 * 判据（任一命中即「疑似推理残留」）：
 *   A. 跨行；B. 多句标点（`。！？` > 1）；C. 推理特征开头且剩余 ≥ 2 字；
 *   D. 句特征 / 因果句；E. 超长（宽松档跳过此条）。
 *
 * @param {string} text
 * @param {{lenient?:boolean}} [opts] `lenient` = 宽松档（逐行判定时忽略超长）
 * @returns {string[]} 命中的判据名（空数组 = 通过）
 */
export function tagResidueReasons(text, opts = {}) {
    const t = String(text == null ? '' : text);
    if (!t) return [];
    const reasons = [];
    if (/[\r\n]/.test(t)) reasons.push('跨行');
    const endMarks = (t.match(/[。！？!?]/g) || []).length;
    if (endMarks > 1) reasons.push('多句标点');
    else if (endMarks === 1 && t.length <= 2) reasons.push('纯标点');
    const head = t.match(/^(?:让我|让我先|我先|首先|其次|再次|然后|接下来|最后|因此|所以|综上|总结|需要|可以看|可以看到|能看出|这段|这张|该卡|这本|此卡|材料|编号|answer|step\s*\d|\d+\s*[.、)）])/i);
    if (head && t.slice(head[0].length).trim().length >= 2) reasons.push('推理特征开头');
    if (/^属于/.test(t) && t.length >= 4) reasons.push('推理特征开头');
    if ((t.match(/[，,；;]/g) || []).length >= 2) reasons.push('多分隔标点');
    if (/(?:这张卡|这张卡片|这段描述|这段文字|该卡|上述|上下文|前文|材料中|原文中)/.test(t)) reasons.push('句特征');
    if (/因此.*所以|因为.*所以/.test(t)) reasons.push('因果句');
    if (!opts.lenient && t.length > MAX_TAG_LEN) reasons.push('超长');
    return reasons;
}

/**
 * 🧽 去掉相邻两个 CJK 字符之间的空格/制表符（如「安达 与岛村」→「安达与岛村」）。
 *
 * ⚠️ 兼容性说明：等价正则是 `/(?<=[\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g`，
 * 但**部分真机 WebView（实测 Chromium 101）执行 lookbehind 会触发 V8 内部 CHECK 失败，
 * 导致渲染进程 SIGTRAP 崩溃、App 被连带杀掉**。故改为逐字符扫描，零正则依赖。
 *
 * @param {string} input
 * @returns {string}
 */
function squeezeCjkSpaces(input) {
    const s = String(input == null ? '' : input);
    if (!s) return '';
    const isCjk = (ch) => ch >= '\u4e00' && ch <= '\u9fff';
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === ' ' || ch === '\t') {
            // 只有「前一个输出字符是 CJK」且「后一个字符也是 CJK」时才丢弃
            const prev = out ? out[out.length - 1] : '';
            const next = s[i + 1] || '';
            if (prev && isCjk(prev) && isCjk(next)) continue;
        }
        out += ch;
    }
    return out;
}

/**
 * 🧽 标签清洗：字符级清理 → 项级门槛 → 去重（保序）。
 *
 * @param {Iterable<string>} list 准标签列表（可为任意脏值）
 * @param {{strict?:boolean}} [opts] `strict` = 调用方声明「这批候选最脏」⇒ 推理残留占比 ≥ 30% 整批清空
 * @returns {string[]}
 */
export function sanitizeTagList(list, opts = {}) {
    const out = [];
    const seen = new Set();
    const MARK_RE = /<\s*\/?\s*(?:tags?|标签)\s*>/gi;
    let droppedResidue = 0;
    let total = 0;
    for (const raw of Array.isArray(list) ? list : []) {
        const src = String(raw == null ? '' : raw);
        if (!src.trim()) continue;
        total++;
        let t = src
            .replace(/[\u00a0\u3000]/g, ' ')
            .replace(/[\u200b-\u200d\ufeff]/g, '')
            .replace(/\t/g, ' ')
            .trim();
        if (!t) continue;
        t = t.replace(MARK_RE, '');
        t = t.replace(/[\[\]"'`“”‘’「」『』]/g, '');
        t = t.replace(/[*_]+/g, '');
        t = t.replace(/^[-•·]+\s+/, '');
        t = t.replace(/^\d+[.、)）]\s*/, '');
        t = t.replace(/^[、，,；;：:。]+/, '');
        t = t.replace(/[、，,；;：:。]+$/, '');
        t = t.replace(/\s*\/\s*/g, '/');
        // 🐛 真机崩溃修复（2026-10-18）：原先用后行断言 `(?<=[\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])`
        //    去掉中文之间的空白。但部分真机 WebView（实测 ZTE 7551N 上的 Chromium 101）
        //    对 lookbehind 的实现有缺陷，执行时触发 V8 内部 CHECK 失败 →
        //    **CrRendererMain SIGTRAP，整个 WebView 渲染进程被杀，App 连带崩溃**
        //    （logcat: Render process's crash wasn't handled by all associated webviews）。
        //    改为「先切片再拼回」的等价写法：没有任何 lookbehind/前瞻。
        t = squeezeCjkSpaces(t);
        t = t.trim();
        if (!t) continue;
        if (/^\d+$/.test(t)) continue;
        if (t.length > MAX_TAG_LEN) { droppedResidue++; continue; }
        if (tagResidueReasons(t, opts).length) { droppedResidue++; continue; }
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    if (opts.strict && total > 0 && droppedResidue / total >= 0.3) return [];
    return out;
}

/** 严格解析 JSON 数组（含嵌套展平 / JSON 字符串 / 非法 JSON 返回 []） */
function parseJsonArray(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) {
            return parsed.flat(Infinity).map(x => String(x == null ? '' : x).trim()).filter(Boolean);
        }
        if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
    } catch (e) { /* 非合法 JSON */ }
    return [];
}

/** 类数组文本 → 字符串数组（容错 JSON 与纯文本列表） */
function parseArrayLike(text) {
    const t = String(text || '').trim();
    if (!t) return [];
    try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return sanitizeTagList(parsed.flat(Infinity));
        if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
    } catch (e) { /* 不是 JSON */ }
    return sanitizeTagList(t.split(/[,，、\n]/), { strict: true });
}

/** 把一行（已剥列表符）拆成候选：有分隔符按分隔符拆，单段整段 1 个候选 */
function splitCandidateLine(line) {
    const L = String(line == null ? '' : line).trim();
    if (!L) return [];
    if (/[,，、；;]/.test(L)) return L.split(/[,，、；;]/).map(s => s.trim()).filter(Boolean);
    return [L];
}

/** 从「已剥思考块」的文本里解析标签（三层降级） */
function parseFromCleanText(raw) {
    let text = String(raw == null ? '' : raw).trim();
    if (!text) return { tags: [], layer: 3, ok: false, reason: '回复为空' };
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // ── 层①：<tags>…</tags> / <标签>…</标签>（取最后一个有效包裹）──
    const wrapperRe = new RegExp(
        `<\\s*(?:${TAG_WRAPPER}|${TAG_WRAPPER_ALT})\\s*>([\\s\\S]*?)<\\s*/\\s*(?:${TAG_WRAPPER}|${TAG_WRAPPER_ALT})\\s*>`,
        'gi'
    );
    const wraps = Array.from(text.matchAll(wrapperRe));
    for (let i = wraps.length - 1; i >= 0; i--) {
        const arr = parseJsonArray(wraps[i][1]);
        if (arr.length) return { tags: sanitizeTagList(arr), layer: 1, ok: true };
    }
    for (let i = wraps.length - 1; i >= 0; i--) {
        const arr = parseArrayLike(wraps[i][1]);
        if (arr.length) return { tags: arr, layer: 1, ok: true };
    }

    // ── 层②：JSON 数组（从后往前找第一个能解析成数组的）──
    const brackets = Array.from(text.matchAll(/\[[\s\S]*?\]/g));
    for (let i = brackets.length - 1; i >= 0; i--) {
        const arr = parseJsonArray(brackets[i][0]);
        if (arr.length) return { tags: sanitizeTagList(arr), layer: 2, ok: true };
    }
    const greedy = text.match(/\[[\s\S]*\]/);
    if (greedy) {
        const arr = parseJsonArray(greedy[0]);
        if (arr.length) return { tags: sanitizeTagList(arr), layer: 2, ok: true };
    }
    if (/^[[{]/.test(text)) {
        const arr = parseJsonArray(text);
        if (arr.length) return { tags: sanitizeTagList(arr), layer: 2, ok: true };
    }

    // ── 层③：逐行候选 + 推理残留判据（宁缺毋滥）──
    const rawCandidates = [];
    for (const line of text.split(/\r?\n/)) {
        const L = line.trim();
        if (!L) continue;
        if (tagResidueReasons(L, { lenient: true }).length) { rawCandidates.push(L); continue; }
        const bare = L.replace(/^[-•·*]+\s+/, '').replace(/^\d+\s*[.、)）]\s*/, '').trim();
        rawCandidates.push(...splitCandidateLine(bare));
    }
    const brute = sanitizeTagList(rawCandidates, { strict: true });
    if (brute.length) return { tags: brute, layer: 3, ok: true };
    if (rawCandidates.length) {
        return { tags: [], layer: 3, ok: false, reason: '疑似思维链被当作标签（已拒绝写入）' };
    }
    return { tags: [], layer: 3, ok: false, reason: '三层解析均未取到标签' };
}

/**
 * **解析 AI 标签回复**（对外唯一入口）。
 *
 * @param {string} rawReply 模型原始回复
 * @param {{prefill?:string}} [opts] `prefill` = 本次请求使用的预填充（回复可能只是续写部分）
 * @returns {{tags:string[], layer:1|2|3, ok:boolean, reason?:string}}
 */
export function parseStructuredTags(rawReply, opts = {}) {
    const original = String(rawReply == null ? '' : rawReply).trim();
    if (!original) return { tags: [], layer: 3, ok: false, reason: '回复为空' };

    const tryParse = (text) => {
        const stripped = stripThinkingBlocks(text);
        if (stripped && stripped !== text) {
            const r = parseFromCleanText(stripped);
            if (r.ok) return r;
        }
        return parseFromCleanText(text);
    };

    const pf = String(opts.prefill == null ? '' : opts.prefill).replace(/\s+$/, '');
    const hasWrapper = /<\s*(?:tags?|标签)\s*>[\s\S]*?<\s*\/\s*(?:tags?|标签)\s*>/i.test(original);
    if (pf && !hasWrapper) {
        const r = tryParse(pf + original);
        if (r.ok) return r;
    }
    return tryParse(original);
}

/** 从模型的原始响应体里取正文（OpenAI 兼容 / Anthropic 两种形态） */
export function extractAiReplyText(res, type) {
    if (!res || !res.data) return '';
    const dd = res.data;
    if (type === 'anthropic') {
        if (Array.isArray(dd.content)) {
            return dd.content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('');
        }
        return '';
    }
    return (dd.choices && dd.choices[0] && dd.choices[0].message && dd.choices[0].message.content) || '';
}

/** 结构化输出的格式要求（与桌面版 `outputFormatRule(true)` 对齐措辞） */
export const STRUCTURED_FORMAT_RULE = `【输出强制规则】：只输出一个包在 <tags> 与 </tags> 之间的 JSON 字符串数组，例如 <tags>["标签1", "标签2"]</tags>。不要输出解释，不要输出推理过程。`;

/** 非结构化兜底格式要求（保持向后兼容的措辞） */
export const PLAIN_FORMAT_RULE = '【输出强制规则】：必须只返回形如 ["标签1", "标签2"] 的纯 JSON 数组，不要任何解释文字。';

// ═══════════════════════════════════════════════════════════════
// 📦 打包（一次请求 N 张卡）—— 对齐桌面 `packedOutputRule` / `parsePackedTags`
// ═══════════════════════════════════════════════════════════════

/**
 * 多卡输出格式要求（与 `parsePackedTags` 的解析契约绑定）。
 * @param {number} count 本次请求的卡片数
 * @returns {string}
 */
export function packedOutputRule(count) {
    const n = Math.max(1, Number(count) || 1);
    return `【多卡输出格式】：本次共 ${n} 张卡片（编号 1~${n}）。必须且只能返回一个 JSON 对象，并用 <${TAG_WRAPPER}> 标签包裹，格式严格为：\n`
        + `<${TAG_WRAPPER}>{"1": ["标签1", "标签2"], "2": ["标签1"], ...}</${TAG_WRAPPER}>\n`
        + '键 = 卡片编号（从 1 开始，每张卡都要有一项），值 = 该卡片的标签数组。绝对不要包含 markdown 代码标记、前后解释文字或任何其他内容。';
}

/** 把一段候选文本解析成「编号 → 标签数组」映射 */
function parsePackedBody(body) {
    const b = String(body || '').trim();
    if (!b) return null;
    let parsed;
    try {
        parsed = JSON.parse(b);
    } catch (e) {
        return null;
    }
    const toTags = (v) => {
        if (Array.isArray(v)) return v.flat(Infinity).map(x => String(x == null ? '' : x).trim()).filter(Boolean);
        if (typeof v === 'string') return [v.trim()].filter(Boolean);
        return [];
    };
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const map = {};
        let any = false;
        for (const [k, v] of Object.entries(parsed)) {
            const tags = toTags(v);
            if (tags.length) { map[String(k)] = tags; any = true; }
        }
        return any ? map : null;
    }
    if (Array.isArray(parsed) && parsed.length && parsed.every(x => Array.isArray(x))) {
        const map = {};
        let any = false;
        parsed.forEach((arr, i) => {
            const tags = toTags(arr);
            if (tags.length) { map[String(i + 1)] = tags; any = true; }
        });
        return any ? map : null;
    }
    return null;
}

function parsePackedFromText(raw) {
    let text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, map: {} };
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const wrapperRe = new RegExp(
        `<\\s*(?:${TAG_WRAPPER}|${TAG_WRAPPER_ALT})\\s*>([\\s\\S]*?)<\\s*/\\s*(?:${TAG_WRAPPER}|${TAG_WRAPPER_ALT})\\s*>`,
        'gi'
    );
    const wraps = Array.from(text.matchAll(wrapperRe));
    for (let i = wraps.length - 1; i >= 0; i--) {
        const map = parsePackedBody(wraps[i][1]);
        if (map) return { ok: true, map };
    }
    const bodyCandidates = [];
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) bodyCandidates.push(objMatch[0]);
    bodyCandidates.push(text);
    for (const body of bodyCandidates) {
        const map = parsePackedBody(body);
        if (map) return { ok: true, map };
    }
    return { ok: false, map: {} };
}

/**
 * 解析打包请求的回复 → `{ ok, map }`；`map` 键为卡片编号字符串。
 * ⚠️ 调用方必须**逐卡校验**（某编号缺失 = 该卡拆回单发重试）。
 * @param {string} rawReply
 * @returns {{ok:boolean, map:Object<string,string[]>, reason?:string}}
 */
export function parsePackedTags(rawReply) {
    const original = String(rawReply == null ? '' : rawReply).trim();
    if (!original) return { ok: false, map: {}, reason: '回复为空' };
    const stripped = stripThinkingBlocks(original);
    const texts = (stripped && stripped !== original) ? [stripped, original] : [original];
    for (const text of texts) {
        const r = parsePackedFromText(text);
        if (r.ok) return r;
    }
    return { ok: false, map: {}, reason: '未解析出多卡结果' };
}

// ═══════════════════════════════════════════════════════════════
// ✂️ 超长材料分段 —— 对齐桌面 `splitTextSegments`
// ═══════════════════════════════════════════════════════════════

/** 默认分段阈值（超出 → 按段落边界切段逐段打标） */
export const SEGMENT_DEFAULT_MAX_CHARS = 4000;
/** 单段目标上限 */
export const SEGMENT_DEFAULT_CHUNK_CHARS = 3500;

/**
 * 按段落边界切分长文本（找不到空行按行；仍超长则硬切）。
 * @param {string} text
 * @param {number} [maxLen] 单段目标上限（默认 3500）
 * @returns {string[]}
 */
export function splitTextSegments(text, maxLen) {
    const limit = Math.max(200, Number(maxLen) || SEGMENT_DEFAULT_CHUNK_CHARS);
    const segs = [];
    let buf = '';
    const push = () => { if (buf.trim()) { segs.push(buf.trim()); buf = ''; } };
    for (const para of String(text == null ? '' : text).split(/\n{2,}/)) {
        if (buf && (buf.length + para.length + 2) > limit) push();
        let p = para;
        while (p.length > limit) { segs.push(p.slice(0, limit).trim()); p = p.slice(limit); }
        buf = buf ? `${buf}\n\n${p}` : p;
    }
    push();
    return segs;
}

// ═══════════════════════════════════════════════════════════════
// 🧩 标签归一化去重（对齐桌面 applyAutoTags 的近义去重）
// ═══════════════════════════════════════════════════════════════

/**
 * 标签归一化键：去掉分隔符/空白后按字符排序 —— 「都市/现代」与「现代都市」视为同一个。
 * @param {string} s
 * @returns {string}
 */
export function normalizeTagKey(s) {
    return String(s || '').replace(/[\s/\\·、,，\-_|（）()【】[\]]+/g, '').split('').sort().join('').toLowerCase();
}

/**
 * 把新标签合并进已有标签数组（近义去重 + 保序），返回真正新增的标签。
 * @param {string[]} existing 已有标签（就地不修改）
 * @param {string[]} incoming 新标签
 * @returns {string[]} 实际新增的标签
 */
export function mergeTagList(existing, incoming) {
    const base = Array.isArray(existing) ? existing : [];
    const seen = new Set();
    for (const t of base) seen.add(normalizeTagKey(t));
    const added = [];
    for (const raw of (Array.isArray(incoming) ? incoming : [])) {
        const clean = String(raw == null ? '' : raw).trim();
        if (!clean) continue;
        const key = normalizeTagKey(clean);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        added.push(clean);
    }
    return added;
}
