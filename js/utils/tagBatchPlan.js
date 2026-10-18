/**
 * 📦 批量打标编排（纯函数）—— 对齐桌面 `useAITools.js` 的打包 / 分段 / 续跑账本
 *
 * 为什么单独抽出来：
 *   UI（CardLibraryView）只负责取值与渲染，编排规则（短卡成组、长卡单发、
 *   账本跳过已完成、失败拆单）必须可单测 —— 这些规则出错的表现是「重复烧 Token」
 *   或「整包失败丢卡」，在真机上很难复现。
 *
 * 零依赖，可 `node --test` 直接测。
 */
import { estimateTokens } from './tokenEstimate.js';
import { SEGMENT_DEFAULT_MAX_CHARS } from './parseTagReply.js';

/** 短卡准入：材料 token 估算 ≤ 该值才参与打包（超过 → 单独成单元） */
export const PACK_SHORT_CARD_MAX_TOKENS = 1200;
/** 打包上限（滑块 1~10，默认 1 = 与旧行为一致） */
export const PACK_SIZE_MAX = 10;

/**
 * 构造卡片材料文本（描述 / 性格 / 首句）。
 * @param {object} data 卡片 data 层（`card.data.data` 或 `card.data`）
 * @returns {string}
 */
export function buildCardMaterialText(data) {
    const d = data || {};
    return [d.description, d.personality, d.first_mes]
        .map((v) => String(v == null ? '' : v).trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * 卡片是否「超长」—— 超过分段阈值时应走分段链路，不参与打包。
 * @param {string} material 材料全文
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function isLongCardMaterial(material, threshold = SEGMENT_DEFAULT_MAX_CHARS) {
    return String(material || '').length > threshold;
}

/**
 * 按「只已知材料长度」判定是否可打包（短卡）——
 * 用于批量打标时避免为规划阶段构造整卡全文造成内存翻倍（真机 OOM 防护）。
 * 长度 ≤ 分段阈值即视为可打包（不估 token，偏保守地多打包，由打包失败回退单发兑现）。
 * @param {number} len 材料字符数
 * @returns {boolean}
 */
export function isPackableByLength(len) {
    const n = Number(len) || 0;
    if (n <= 0) return true;
    return n <= SEGMENT_DEFAULT_MAX_CHARS;
}

/**
 * 卡片是否可参与打包（短卡判定；估算失败时**宽松放行** = 按短卡处理）。
 * @param {string} material
 * @returns {boolean}
 */
export function isPackableCard(material) {
    const text = String(material || '');
    if (!text) return true;
    if (isLongCardMaterial(text)) return false;
    let est = 0;
    try {
        est = estimateTokens(text);
    } catch (e) {
        return true;
    }
    return (Number(est) || 0) <= PACK_SHORT_CARD_MAX_TOKENS;
}

/**
 * 切分请求单元：**连续短卡**按 packSize 成组；长卡单独成单元（保持原顺序）。
 *
 * ⚠️ 只合并「连续」的短卡 —— 顺序不能乱（用户看到的处理顺序 = 库顺序）。
 *
 * @param {Array<{id:string, material?:string, materialLen?:number}>} cards 按目标顺序排列
 * @param {number} packSize 1~10
 * @returns {Array<{ids:string[], packed:boolean}>}
 */
export function buildTagUnits(cards, packSize) {
    const size = Math.max(1, Math.min(PACK_SIZE_MAX, Number(packSize) || 1));
    const list = Array.isArray(cards) ? cards : [];
    const units = [];
    let buf = [];
    const flush = () => {
        if (buf.length) {
            units.push({ ids: buf.map((c) => c.id), packed: buf.length > 1 });
            buf = [];
        }
    };
    for (const card of list) {
        if (!card || !card.id) continue;
        // 优先用 materialLen（只存长度，零文本驻留）；无则退回 material 全文判定
        const packable = (card.materialLen !== undefined && card.materialLen !== null)
            ? isPackableByLength(card.materialLen)
            : isPackableCard(card.material);
        if (size <= 1 || !packable) {
            flush();
            units.push({ ids: [card.id], packed: false });
            continue;
        }
        buf.push(card);
        if (buf.length >= size) flush();
    }
    flush();
    return units;
}

/**
 * 新建续跑账本。
 * @param {string[]} targetIds 本次目标
 * @param {number} packSize
 * @returns {{startedAt:number, updatedAt:number, targetIds:string[], doneIds:string[], packSize:number}}
 */
export function createResumeLedger(targetIds, packSize) {
    const ids = (Array.isArray(targetIds) ? targetIds : []).filter(Boolean);
    return {
        startedAt: Date.now(),
        updatedAt: Date.now(),
        targetIds: [...new Set(ids)],
        doneIds: [],
        packSize: Math.max(1, Math.min(PACK_SIZE_MAX, Number(packSize) || 1))
    };
}

/**
 * 账本记完成（幂等；就地修改并刷新 updatedAt）。
 * @param {object} ledger
 * @param {string} id
 * @returns {object} 同一个 ledger
 */
export function markLedgerDone(ledger, id) {
    if (!ledger || !id) return ledger;
    if (!Array.isArray(ledger.targetIds)) ledger.targetIds = [];
    if (!Array.isArray(ledger.doneIds)) ledger.doneIds = [];
    if (ledger.targetIds.includes(id) && !ledger.doneIds.includes(id)) ledger.doneIds.push(id);
    ledger.updatedAt = Date.now();
    return ledger;
}

/**
 * 账本是否已全部完成（用于决定是否清空账本）。
 * @param {object} ledger
 * @returns {boolean}
 */
export function isLedgerComplete(ledger) {
    if (!ledger || !Array.isArray(ledger.targetIds) || !ledger.targetIds.length) return true;
    const done = new Set(Array.isArray(ledger.doneIds) ? ledger.doneIds : []);
    return ledger.targetIds.every((id) => done.has(id));
}

/**
 * 计算续跑待处理清单。
 *
 * @param {object} ledger
 * @param {Set<string>|string[]} knownIds 当前仍存在的卡片 id
 * @returns {{pending:string[], missingCount:number, complete:boolean}}
 */
export function resolveResumeTargets(ledger, knownIds) {
    const known = knownIds instanceof Set ? knownIds : new Set(Array.isArray(knownIds) ? knownIds : []);
    const targets = (ledger && Array.isArray(ledger.targetIds)) ? ledger.targetIds : [];
    const done = new Set((ledger && Array.isArray(ledger.doneIds)) ? ledger.doneIds : []);
    const notDone = targets.filter((id) => id && !done.has(id));
    const pending = notDone.filter((id) => known.has(id));
    return {
        pending,
        missingCount: notDone.length - pending.length,
        complete: notDone.length === 0
    };
}

/**
 * 汇总分段的逐段标签：**出现次数多者排前**，同次数按首次出现顺序。
 * @param {string[][]} perSegment
 * @returns {string[]}
 */
export function mergeSegmentTags(perSegment) {
    const counts = new Map();
    const order = [];
    for (const seg of (Array.isArray(perSegment) ? perSegment : [])) {
        for (const raw of (Array.isArray(seg) ? seg : [])) {
            const t = String(raw == null ? '' : raw).trim();
            if (!t) continue;
            if (!counts.has(t)) { counts.set(t, 0); order.push(t); }
            counts.set(t, counts.get(t) + 1);
        }
    }
    return order.slice().sort((a, b) => (counts.get(b) - counts.get(a)) || (order.indexOf(a) - order.indexOf(b)));
}

/**
 * 只保留「当前没有标签」的卡片（增量模式）。
 * @param {string[]} ids
 * @param {Map<string, object>|object} cardIndex id → 卡片
 * @param {(card:object)=>boolean} hasTags
 * @returns {{kept:string[], skipped:string[]}}
 */
export function filterUntagged(ids, cardIndex, hasTags) {
    const get = cardIndex instanceof Map ? (id) => cardIndex.get(id) : (id) => (cardIndex || {})[id];
    const kept = [];
    const skipped = [];
    for (const id of (Array.isArray(ids) ? ids : [])) {
        const card = get(id);
        if (card && typeof hasTags === 'function' && hasTags(card)) skipped.push(id);
        else kept.push(id);
    }
    return { kept, skipped };
}
