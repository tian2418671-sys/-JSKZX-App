/**
 * ⚙️ 预设查重（移动版移植 · 2026-09-25）—— 源自桌面版 v2.3.0 三块纯函数：
 *   · `js/utils/dedupeCommon.js`（fnv1a32 / exactTextKey / MinHash-96 / 预设文本提取）
 *   · `js/utils/dedupeNames.js`（名字层：形状剥离 + 语料统计）
 *   · `js/utils/dedupePreset.js`（结构三维 + 五枚举判定 + 统计视图）
 * 合并为自包含纯函数模块（无 IO、零依赖），口径与桌面版一致。
 *
 * 📌 关键口径（改前必读）：
 *   · `prompts` **数组 / 字典双形态**都兼容（DF-24：字典形态曾产出 `[object Object]`）；
 *   · `prompt_order` 的 `character_id` 不写死（真实库 100000/100001 并存）——取**覆盖最多**的 order 组；
 *   · 内容相似度走 MinHash（4-gram + 哈希采样 + 96 种子，Jaccard 语义），不得用「累加共有块」口径；
 *   · 保守阈值（宁可漏报绝不误报——清理按钮是「保留此版，清理其余」）：
 *     STRUCT_HIGH=0.95 / CONTENT_HIGH=0.90 / CONTENT_LOW=0.70；
 *   · 单字主干不参与尾缀剥离（语料统计 K_tail=3）。
 */

// ═══════════════════════════════════════════════════════════════
// 一、哈希（与桌面 dedupeCommon.js 一致）
// ═══════════════════════════════════════════════════════════════

/** FNV-1a 32 位 */
export const fnv1a32 = (str, seed = 0x811c9dc5) => {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
};

/** 内容指纹键（L0「完全相同」直通；不是相似度）。双 32 位 FNV 流，碰撞概率 ≈ 2⁻⁶⁴ */
export const exactTextKey = (str) => {
    let a = 0x811c9dc5, b = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
};

// ═══════════════════════════════════════════════════════════════
// 二、MinHash-96（内容轨指纹；种子为硬编码常量——修改 = 变更口径）
// ═══════════════════════════════════════════════════════════════

export const MINHASH_SEEDS = new Uint32Array([
    0x22a25cd7, 0x21a25b44, 0x24a25ffd, 0x23a25e6a, 0x1ea2568b, 0x1da254f8, 0x20a259b1, 0x1fa2581e,
    0x1aa2503f, 0x19a24eac, 0x6695f79c, 0x6795f92f, 0x6895fac2, 0x6995fc55, 0x6295f150, 0x6395f2e3,
    0x6495f476, 0x6595f609, 0x6e960434, 0x6f9605c7, 0x789ccfb7, 0x779cce24, 0x7a9cd2dd, 0x799cd14a,
    0x749cc96b, 0x739cc7d8, 0x769ccc91, 0x759ccafe, 0x709cc31f, 0x6f9cc18c, 0x729a87ae, 0x739a8941,
    0x709a8488, 0x719a861b, 0x769a8dfa, 0x779a8f8d, 0x749a8ad4, 0x759a8c67, 0x6a9a7b16, 0x6b9a7ca9,
    0xf48e8861, 0xf38e86ce, 0xf28e853b, 0xf18e83a8, 0xf88e8ead, 0xf78e8d1a, 0xf68e8b87, 0xf58e89f4,
    0xec8e7bc9, 0xeb8e7a36, 0x6e8b76d8, 0x6f8b786b, 0x708b79fe, 0x718b7b91, 0x728b7d24, 0x738b7eb7,
    0x748b804a, 0x758b81dd, 0x668b6a40, 0x678b6bd3, 0xe092e613, 0xdf92e480, 0xe292e939, 0xe192e7a6,
    0xe492ec5f, 0xe392eacc, 0xe692ef85, 0xe592edf2, 0xe892f2ab, 0xe792f118, 0xfa90d06a, 0xfb90d1fd,
    0xf890cd44, 0xf990ced7, 0xf690ca1e, 0xf790cbb1, 0xf490c6f8, 0xf590c88b, 0xf290c3d2, 0xf390c565,
    0xfc84079d, 0xfb84060a, 0xfa840477, 0xf98402e4, 0xf8840151, 0xf783ffbe, 0xf683fe2b, 0xf583fc98,
    0xf483fb05, 0xf383f972, 0xf681bf94, 0xf781c127, 0xf881c2ba, 0xf981c44d, 0xf281b948, 0xf381badb,
]);

const MINHASH_DIM = 96;
const SHINGLE_N = 4;
const SAMPLE_STEP = 4;

/** 归一化（保字符序）：NFC → lower → 空白标点折叠为空格 */
const normForMinHash = (text) => String(text).normalize('NFC').toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();

/**
 * 96 维 MinHash 签名（内容轨）。
 * 口径：4-gram shingle → 确定性哈希采样（仅保留 hash%4===0）→ 96 种子取 min（异或 + 雪崩混洗）。
 * ⚠️ 采样只取决于 shingle 自身哈希（与集合顺序/规模无关，估计无偏）——曾用「排序等距抽样」实测
 *    同源微改文本 J≈0.04（序列错位），已修正。
 * @returns {Uint32Array} 96 维签名；空/过短文本返回全 0xffffffff（由 estimateMinHashSimilarity 视为无效）
 */
export function computeMinHash96(text) {
    const sig = new Uint32Array(MINHASH_DIM).fill(0xffffffff);
    if (!text || typeof text !== 'string') return sig;
    const clean = normForMinHash(text);
    if (clean.length < SHINGLE_N) return sig;

    const samples = new Set();
    for (let i = 0; i + SHINGLE_N <= clean.length; i++) {
        const h = fnv1a32(clean.slice(i, i + SHINGLE_N));
        if (h % SAMPLE_STEP === 0) samples.add(h);
    }
    if (samples.size === 0) {
        // 兜底：极短文本无采样命中 → 全量（避免签名全 FF 被误判为无效）
        for (let i = 0; i + SHINGLE_N <= clean.length; i++) samples.add(fnv1a32(clean.slice(i, i + SHINGLE_N)));
    }

    for (const baseH of samples) {
        for (let s = 0; s < MINHASH_DIM; s++) {
            let h = (baseH ^ MINHASH_SEEDS[s]) >>> 0;
            h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
            h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
            h = (h ^ (h >>> 16)) >>> 0;
            if (h < sig[s]) sig[s] = h;
        }
    }
    return sig;
}

const isAllFF = (sig) => {
    if (!sig || sig.length !== MINHASH_DIM) return true;
    for (let i = 0; i < MINHASH_DIM; i++) if (sig[i] !== 0xffffffff) return false;
    return true;
};

/** MinHash 相似度（96 维匹配率）。@returns {number|null} null = 任一方无有效签名（不得静默当 0） */
export const estimateMinHashSimilarity = (a, b) => {
    if (!a || !b || a.length !== MINHASH_DIM || b.length !== MINHASH_DIM) return null;
    if (isAllFF(a) || isAllFF(b)) return null;
    let m = 0;
    for (let i = 0; i < MINHASH_DIM; i++) if (a[i] === b[i]) m++;
    return m / MINHASH_DIM;
};

// ═══════════════════════════════════════════════════════════════
// 三、预设文本提取
// ═══════════════════════════════════════════════════════════════

/** 预设 prompts（数组 / 字典双形态） */
export const promptsOf = (data) => {
    const p = data && data.prompts;
    if (!p) return [];
    return Array.isArray(p) ? p : (typeof p === 'object' ? Object.values(p) : []);
};
export const countPrompts = (data) => promptsOf(data).length;
/** 内容文本 = 所有 prompt content 拼接（MinHash 输入口径，与桌面一致） */
export const extractPresetText = (data) => promptsOf(data)
    .map((p) => (p && typeof p.content === 'string' ? p.content : '')).filter(Boolean).join('\n');

// ═══════════════════════════════════════════════════════════════
// 四、名字层（形状剥离 + 语料统计；来源 dedupeNames.js）
// ═══════════════════════════════════════════════════════════════

/** 比较 / 展示用规范化：NFKC → lower → 去空白标点符号 */
export const normName = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

/** 尾部副本形状：`(1)` / `（2）` / `_20250925` / `_2025092501` / ` copy2` / `_old` / `-bak` */
const REPLICA_SHAPES_TAIL = /(?:[_\- ]?(?:copy|backup|bak|old|new)(?:[_\-\d]+)?|\(\d+\)|（\d+）|[_\- ]?\d{4}[-_]?\d{2}[-_]?\d{2}(?:[t_\-]\d{1,6}z?)?|[_\-]\d{6,})$/i;

/**
 * 数字版本形状（token 边界，兼容 CJK 邻接）：`v1.0b` / `2.2` / `3.0-1`（数字前后可直接接中文，如 `2.2版`）
 *
 * ⚠️ 原写法用后行断言 `(?<=^|[\s\-_\u3400-\u9fff])` 做「前边界」，但**部分真机 WebView
 * （实测 Chromium 101）执行 lookbehind 会触发 V8 内部 CHECK 失败 → 渲染进程 SIGTRAP
 * 崩溃、App 被连带杀掉**。故改为「把前边界捕进 m[1]」的写法：
 * 替换时 `stripVersionShape()` 会把 m[1] 原样保留、只把版本号换成空格（语义等价）。
 */
const VERSION_SHAPE_G = /(^|[\s\-_\u3400-\u9fff])(v?\d+(?:[.\-]\d+)*[a-z]?)(?=$|[\s\-_\u3400-\u9fff])/gi;

/**
 * 把版本形状匹配替换为「保留前边界 + 空格」，并把被剥掉的版本号 push 进 stripped。
 * @param {string} _match 整体匹配
 * @param {string} lead 前边界字符（可能为空串=行首）
 * @param {string} ver 版本号实体
 * @param {string[]} stripped 收集器
 * @returns {string}
 */
const stripVersionShape = (_match, lead, ver, stripped) => {
    stripped.push(ver);
    return `${lead} `;
};

/** 分隔符（形状剥离后的折叠用） */
const SEPARATORS_G = /[\s\-_.,/\\()[\]{}，（）「」【】『』—–]+/g;

/**
 * 形状剥离：得 `stem0`（未过语料检验）与被剥片段列表。
 * 仅做形状识别——语义修饰词（各类"XX版"后缀）一律留给 discoverTails 语料统计决定。
 */
export const extractNameStem = (rawName) => {
    let s = String(rawName == null ? '' : rawName).normalize('NFKC').trim();
    const stripped = [];
    if (!s) return { stem0: '', stripped };

    // 形状①：尾部副本/时间戳/长数字（迭代，最多 3 轮，防 `_2024-01-02-copy` 类叠加）
    for (let round = 0; round < 3; round++) {
        const before = s;
        s = s.replace(REPLICA_SHAPES_TAIL, (m) => { stripped.push(m); return ' '; });
        if (s === before) break;
    }
    // 形状②：数字版本（任意位置，token 边界）
    s = s.replace(VERSION_SHAPE_G, (match, lead, ver) => stripVersionShape(match, lead, ver, stripped));

    const stem0 = s.replace(SEPARATORS_G, '').toLowerCase();
    return { stem0, stripped };
};

const isCJK = (ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
const isLatinNum = (ch) => /[a-z0-9]/i.test(ch);

/**
 * 尾缀候选：从 `stem0` 末尾切「中文 1~4 字」或「末尾拉丁/数字连续段（≥2）」。
 * 仅返回**主干长度 ≥ 2**（单字主干保护）的候选。
 * @returns {Array<[head:string, tail:string]>}
 */
export const tailCandidates = (stem0) => {
    const out = [];
    const s = String(stem0 || '');
    if (s.length < 3) return out; // 主干至少 2 + 尾缀至少 1

    // 拉丁/数字 run
    let i = s.length - 1;
    while (i >= 0 && isLatinNum(s[i])) i--;
    const tailLat = s.slice(i + 1);
    if (tailLat.length >= 2 && tailLat.length <= 12 && i + 1 >= 2) {
        out.push([s.slice(0, i + 1), tailLat]);
    }

    // 中文后缀（长度 1~4）
    const maxK = Math.min(4, s.length - 2);
    for (let k = 1; k <= maxK; k++) {
        const tail = s.slice(s.length - k);
        if (![...tail].every(isCJK)) break;
        out.push([s.slice(0, s.length - k), tail]);
    }
    return out;
};

/**
 * 语料统计：对全库名字统计「尾缀 → 不同主干集合」。
 * 某尾缀的跨主干频次 ≥ K_tail ⇒ 判为**本库可剥离修饰词**（运行时从当前库发现，不落盘、不写死）。
 * @param {string[]} names
 * @param {{K_tail?:number}} [opts]
 * @returns {Set<string>}
 */
export const discoverTails = (names, { K_tail = 3 } = {}) => {
    const vote = new Map();
    for (const name of names || []) {
        const { stem0 } = extractNameStem(name);
        if (!stem0) continue;
        for (const [head, tail] of tailCandidates(stem0)) {
            if (!head || head.length < 2) continue; // 单字主干保护
            let set = vote.get(tail);
            if (!set) { set = new Set(); vote.set(tail, set); }
            set.add(head);
        }
    }
    const out = new Set();
    for (const [tail, heads] of vote) {
        if (heads.size >= K_tail) out.add(tail);
    }
    return out;
};

/** 应用语料结论：stem0 → stemFinal（剥**最长**的已登记尾缀；无则原样） */
export const applyTails = (stem0, tails) => {
    const s = String(stem0 || '');
    if (!s || !tails || tails.size === 0) return { stemFinal: s, tail: null };
    for (const [head, tail] of tailCandidates(s)) {
        if (tails.has(tail)) return { stemFinal: head, tail };
    }
    return { stemFinal: s, tail: null };
};

/**
 * 补充剥离**中文副本/备份类尾缀**（`副本` / `备份` / `版本` 变体）。
 * 为什么需要：`extractNameStem` 的副本形状只覆盖拉丁 `copy/bak/old…`；而「复制为副本」功能
 * 生成的是中文 `_副本` 后缀；语料统计 discoverTails 的 K_tail=3 阈值对「只有一对」的场景天然失效。
 * @param {string} stem
 * @returns {string}
 */
export const stripCnReplicaTails = (stem) => {
    let s = String(stem || '');
    for (let i = 0; i < 2; i++) {
        const before = s;
        s = s.replace(/[_\-\s]*[（(]?(?:副本|备份|复刻|重置|重制版|新版|旧版|改版)[)）]?\s?\d*$/, '').trim();
        if (s === before) break;
    }
    return s;
};

/**
 * 世界书查重专用名称归一：文件名 → 去扩展名 → 形状剥离（版本号/时间戳/拉丁副本词）→ 中文副本尾缀剥离。
 * 例：`---温馨的翻斗花园1.0_副本.json` 与 `---温馨的翻斗花园1.0.json` 归一为同一 stem。
 * @param {string} fileNameOrName
 * @returns {string}
 */
export const wbDedupeStem = (fileNameOrName) => {
    const base = String(fileNameOrName || '').replace(/\.json$/i, '');
    const { stem0 } = extractNameStem(base);
    return stripCnReplicaTails(stem0);
};

// ═══════════════════════════════════════════════════════════════
// 五、预设结构层（来源 dedupePreset.js）
// ═══════════════════════════════════════════════════════════════

export const STRUCT_HIGH = 0.95;
export const CONTENT_HIGH = 0.90;
export const CONTENT_LOW = 0.70;

/** 采样参数字段（与差异展示字段表同源——唯一定义处） */
export const PRESET_PARAM_FIELDS = [
    { key: 'temperature', label: '🌡️ 温度' },
    { key: 'max_tokens', label: '📏 最大输出' },
    { key: 'max_context', label: '🧠 上下文' },
    { key: 'rep_pen', label: '🚫 重复惩罚' },
    { key: 'top_p', label: '🎯 Top P' },
    { key: 'top_k', label: '🔝 Top K' },
    { key: 'min_p', label: '📉 Min P' },
    { key: 'openai_model', label: '🧩 模型' },
];

/** `_simType` → 展示元数据（白名单五枚举全覆盖） */
export const PRESET_TYPE_META = Object.freeze({
    sampler: { label: '参数变体', tone: 'amber', advice: '建议对比采样参数后清理' },
    reorder: { label: '顺序变体', tone: 'amber', advice: '建议对比条目顺序后清理' },
    flipped: { label: '启用状态不同', tone: 'rose', advice: '请先人工核对（勿直接清理）' },
    reskin: { label: '骨架相同（换皮）', tone: 'amber', advice: '建议对比内容后清理' },
    different: { label: '内容差异', tone: 'rose', advice: '请先人工核对（勿直接清理）' },
});

/** prompts（数组 / 字典）→ 块列表（字典形态每键视为一块） */
const blockList = (prompts) => {
    if (Array.isArray(prompts)) return prompts;
    if (prompts && typeof prompts === 'object') return Object.keys(prompts).map((k) => ({ identifier: k, content: prompts[k] }));
    return [];
};

/** 取「覆盖最多」的 prompt_order 组（不写死 character_id —— DF-24） */
const bestOrderGroup = (promptOrder) => {
    if (!Array.isArray(promptOrder) || promptOrder.length === 0) return null;
    let best = null;
    for (const group of promptOrder) {
        const list = group && Array.isArray(group.order) ? group.order
            : (Array.isArray(group) ? group : null);
        if (list && (!best || list.length > best.length)) best = list;
    }
    return best;
};

/**
 * 预设结构统计 → 派生字段。
 * @returns {{identifierSeq:string, identifierSet:Set<string>, enabledRatio:number|null, sampler:object}}
 */
export const buildPresetStructure = (data) => {
    const d = (data && typeof data === 'object') ? data : {};
    const prompts = blockList(d.prompts);
    const seq = prompts.map((p, i) => (p && typeof p === 'object' && typeof p.identifier === 'string' && p.identifier)
        ? p.identifier : `#${i}`);
    const identifierSet = new Set(seq);

    // 启用比例：prompt_order（覆盖最多的组）优先；缺失时回退 prompts[].enabled
    let enabledRatio = null;
    const best = bestOrderGroup(d.prompt_order);
    if (best && best.length > 0) {
        const enabled = best.filter((e) => e && e.enabled !== false).length;
        enabledRatio = enabled / best.length;
    } else {
        const flagged = prompts.filter((p) => p && typeof p === 'object' && 'enabled' in p);
        if (flagged.length > 0) enabledRatio = flagged.filter((p) => p.enabled !== false).length / flagged.length;
    }

    const sampler = {};
    for (const f of PRESET_PARAM_FIELDS) if (d[f.key] !== undefined) sampler[f.key] = d[f.key];

    return { identifierSeq: seq.join('\u0001'), identifierSet, enabledRatio, sampler };
};

/** 集合 Jaccard（空集 → null，不静默当 0） */
export const setJaccard = (a, b) => {
    if (!a || !b || a.size === 0 || b.size === 0) return null;
    let inter = 0;
    for (const v of a) if (b.has(v)) inter++;
    return inter / (a.size + b.size - inter);
};

/** 采样参数向量相等（键集合与值都一致） */
export const sameSampler = (a, b) => {
    const ka = Object.keys(a || {});
    const kb = Object.keys(b || {});
    if (ka.length !== kb.length) return false;
    return ka.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
};

/**
 * 五枚举判定（优先级：参数 → 启用 → 顺序 → 骨架；其余为内容差异）。
 * @returns {'sampler'|'reorder'|'flipped'|'reskin'|'different'}
 */
export const pickPresetSimType = (center, member) => {
    if (!sameSampler(center.sampler, member.sampler)) return 'sampler';
    if (center.enabledRatio !== null && member.enabledRatio !== null && center.enabledRatio !== member.enabledRatio) return 'flipped';
    const j = setJaccard(center.identifierSet, member.identifierSet);
    if (j !== null && j >= STRUCT_HIGH) {
        return (center.identifierSeq === member.identifierSeq) ? 'reskin' : 'reorder';
    }
    return 'different';
};

/** 三维百分比（0~100；缺数据 → null） */
export const presetViewStats = (center, member) => {
    const js = setJaccard(center && center.identifierSet, member && member.identifierSet);
    const mh = estimateMinHashSimilarity(center && center.fullMinHash, member && member.fullMinHash);
    const en = (center && member && center.enabledRatio !== null && member.enabledRatio !== null)
        ? (1 - Math.abs(center.enabledRatio - member.enabledRatio)) : null;
    return {
        structPct: js === null ? null : Math.round(js * 100),
        contentPct: mh === null ? null : Math.round(mh * 100),
        enabledPct: en === null ? null : Math.round(en * 100),
    };
};

/** 内容分层（保守档）：'high' | 'mid' | 'low' | null */
export const contentTier = (contentPct) => {
    if (contentPct === null || contentPct === undefined) return null;
    const v = contentPct / 100;
    if (v >= CONTENT_HIGH) return 'high';
    if (v >= CONTENT_LOW) return 'mid';
    return 'low';
};

// ═══════════════════════════════════════════════════════════════
// 六、扫描编排（移动版）：预设定价输入 → 聚类分组输出
// ═══════════════════════════════════════════════════════════════

/** 采样参数摘要（用于卡片展示） */
const samplerDigest = (sampler) => {
    const parts = [];
    for (const f of PRESET_PARAM_FIELDS) {
        if (sampler[f.key] !== undefined && parts.length < 4) {
            parts.push(`${f.label.replace(/^\S+\s/, '')}:${String(sampler[f.key]).slice(0, 10)}`);
        }
    }
    return parts.join(' · ') || '（无采样参数记录）';
};

/**
 * 扫描预设重复（同步纯函数；预设数据小，全量在内存里跑）。
 * @param {Array<{path:string,name:string,data:object,sizeKb?:number,dateStr?:string}>} presets
 * @returns {{ groups:Array, pairCount:number, skipped:Array<{name:string,reason:string}> }}
 */
export function scanPresetDuplicates(presets) {
    const skipped = [];
    const items = [];
    for (const p of presets || []) {
        const data = p && p.data;
        if (!data || typeof data !== 'object') { skipped.push({ name: (p && p.name) || '?', reason: 'EMPTY_DATA' }); continue; }
        const prompts = promptsOf(data);
        if (prompts.length === 0) { skipped.push({ name: (p && p.name) || '?', reason: 'NO_PROMPTS' }); continue; }
        const struct = buildPresetStructure(data);
        const text = extractPresetText(data);
        items.push({
            path: p.path || p.name,
            name: String(p.name || data.name || '未命名'),
            promptCount: countPrompts(data),
            structure: struct,
            identifierSeq: struct.identifierSeq,
            identifierSet: struct.identifierSet,
            enabledRatio: struct.enabledRatio,
            sampler: struct.sampler,
            exactKey: exactTextKey(JSON.stringify(data)),
            fullMinHash: text.length >= 20 ? computeMinHash96(text) : null,
            textLen: text.length,
            sizeKb: p.sizeKb || 0,
            dateStr: p.dateStr || '',
            stemFinal: '',
        });
    }
    if (items.length < 2) return { groups: [], pairCount: 0, skipped };

    // 名字层：语料统计尾缀 → stemFinal
    const tails = discoverTails(items.map((it) => it.name));
    for (const it of items) {
        const { stem0 } = extractNameStem(it.name);
        it.stemFinal = applyTails(stem0, tails).stemFinal || stem0;
    }

    // 候选：① stemFinal 同名  ② 跨名结构指纹（identifierSet Jaccard ≥ STRUCT_HIGH）
    const uf = (n) => {
        const parent = Array.from({ length: n }, (_, i) => i);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
        return { find, union };
    };
    const dsu = uf(items.length);
    let pairCount = 0;
    const structPairs = new Set(); // 记录「跨名结构」配对（i:j），用于 byStructure 标记

    // ① 同名
    const byStem = new Map();
    items.forEach((it, i) => {
        if (!it.stemFinal) return;
        if (!byStem.has(it.stemFinal)) byStem.set(it.stemFinal, []);
        byStem.get(it.stemFinal).push(i);
    });
    for (const [, list] of byStem) {
        for (let k = 1; k < list.length; k++) { dsu.union(list[0], list[k]); pairCount++; }
    }

    // ② 结构指纹（跨名换皮/改名同源）——O(n²)，仅比较「尚未同组」的对
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (items[i].stemFinal && items[i].stemFinal === items[j].stemFinal) continue; // 已在①同组
            const js = setJaccard(items[i].identifierSet, items[j].identifierSet);
            if (js !== null && js >= STRUCT_HIGH) {
                dsu.union(i, j);
                pairCount++;
                structPairs.add(i + ':' + j);
            }
        }
    }

    // 聚类成组（≥2）
    const clusters = new Map();
    items.forEach((_, i) => {
        const root = dsu.find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(i);
    });
    const groups = [];
    for (const [, members] of clusters) {
        if (members.length < 2) continue;
        const list = members.map((i) => items[i]);
        // 组名：取出现最多的 stemFinal 原文（回退第一名）
        const stemCount = new Map();
        for (const it of list) stemCount.set(it.stemFinal, (stemCount.get(it.stemFinal) || 0) + 1);
        let groupStem = '', groupCount = 0;
        for (const [s, c] of stemCount) if (c > groupCount) { groupStem = s; groupCount = c; }
        const center = list[0];
        const byStructure = list.some((it) => it.stemFinal !== groupStem);
        const renamedCount = list.filter((it) => it.stemFinal !== groupStem).length;

        const view = list.map((it, k) => {
            if (k === 0) {
                return {
                    path: it.path, name: it.name, _isCenter: true,
                    _promptCount: it.promptCount, _settings: samplerDigest(it.sampler),
                    _sizeKb: it.sizeKb, _dateStr: it.dateStr,
                    _simType: '', _simLabel: '✅ 推荐保留', _simTone: 'emerald',
                    _simAdvice: '', _diffInfo: '默认保留此版本',
                    _structPct: null, _contentPct: null, _enabledPct: null, _pctAdvice: ''
                };
            }
            const simType = pickPresetSimType(center, it);
            const meta = PRESET_TYPE_META[simType];
            const stats = presetViewStats(center, it);
            const tier = contentTier(stats.contentPct);
            return {
                path: it.path, name: it.name, _isCenter: false,
                _promptCount: it.promptCount, _settings: samplerDigest(it.sampler),
                _sizeKb: it.sizeKb, _dateStr: it.dateStr,
                _simType: simType, _simLabel: meta.label, _simTone: meta.tone, _simAdvice: meta.advice,
                _diffInfo: `与保留版：${meta.label}`,
                _structPct: stats.structPct, _contentPct: stats.contentPct, _enabledPct: stats.enabledPct,
                _pctAdvice: tier === 'high' ? '内容高度一致，可对比后清理'
                    : tier === 'mid' ? '内容中等相似，建议先对比' : '内容差异较大，勿直接清理'
            };
        });
        groups.push({ name: groupStem || center.name, byStructure, renamedCount, list: view });
    }

    // 排序：先按「结构指纹聚类」优先，再按成员数降序（同名组在后）
    groups.sort((a, b) => (a.byStructure === b.byStructure ? b.list.length - a.list.length : (a.byStructure ? -1 : 1)));
    return { groups, pairCount, skipped };
}
