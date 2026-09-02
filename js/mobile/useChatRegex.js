/**
 * 正则脚本引擎（对齐酒馆 SillyTavern regex_scripts 体系）
 * 在测卡中对用户输入和 AI 回复应用正则替换。
 *
 * 正则脚本格式（兼容酒馆）:
 *   { scriptName, findRegex, replaceString, disabled, placement, trimRange: [start,end] }
 *
 * placement 取值（酒馆标准）:
 *   - 'AI':  作用于 AI 回复（接收后）
 *   - 'USER': 作用于用户输入（发送前）
 *   - 'slash': 作用于斜杠命令（本移动端不支持，忽略）
 *   - 'world': 作用于世界书激活（本移动端简化为并入 AI）
 */

/** 酒馆 placement 常量 */
export const REGEX_PLACEMENT_AI = 'AI';
export const REGEX_PLACEMENT_USER = 'USER';
export const REGEX_PLACEMENT_SLASH = 'slash';
export const REGEX_PLACEMENT_WORLD = 'world';

/**
 * 安全编译正则表达式（兼容酒馆 findRegex 格式）
 * 酒馆正则可能是 /pattern/flags 格式或纯 pattern
 */
function compileRegex(pattern) {
    if (!pattern || typeof pattern !== 'string') return null;
    const trimmed = pattern.trim();
    // 匹配 /pattern/flags 格式
    const match = trimmed.match(/^\/(.+)\/([gimsuy]*)$/s);
    try {
        if (match) return new RegExp(match[1], match[2]);
        // 纯 pattern，默认全局+多行
        return new RegExp(trimmed, 'gm');
    } catch (e) {
        console.warn('[Regex] 正则编译失败:', pattern, e.message);
        return null;
    }
}

/**
 * 对单条文本应用一组正则脚本
 * @param {string} text - 原始文本
 * @param {Array} scripts - 正则脚本数组
 * @param {string} placement - 应用阶段 'AI' | 'USER'
 * @param {object} macros - 宏字典（用于替换 replaceString 中的宏）
 * @returns {string} 处理后的文本
 */
export function applyRegexScripts(text, scripts, placement, macros) {
    if (!text || !scripts || !Array.isArray(scripts) || scripts.length === 0) return text || '';
    let out = String(text);

    for (const s of scripts) {
        if (!s || s.disabled === true) continue;
        // 检查 placement 是否匹配
        const placements = Array.isArray(s.placement) ? s.placement : [];
        if (placements.length > 0 && !placements.includes(placement)) continue;

        const re = compileRegex(s.findRegex || s.find_regex);
        if (!re) continue;

        let replacement = String(s.replaceString || s.replace_string || '');
        // 替换 replaceString 中的宏
        if (macros) {
            for (const [macro, value] of Object.entries(macros)) {
                replacement = replacement.split(macro).join(value);
            }
        }
        // 酒馆兼容: $1 $2 等捕获组引用由 JS 原生 replace 支持
        try {
            out = out.replace(re, replacement);
        } catch (e) {
            console.warn('[Regex] 替换失败:', s.scriptName || s.findRegex, e.message);
        }
    }
    return out;
}

/**
 * 归一化正则脚本（兼容 enabled/disabled 双字段，placement 数组化）
 */
export function normalizeRegexScript(s) {
    if (!s) return null;
    const out = { ...s };
    // 兼容 find_regex / replace_string 蛇形命名
    if (!out.findRegex && s.find_regex) out.findRegex = s.find_regex;
    if (!out.replaceString && s.replace_string) out.replaceString = s.replace_string;
    if (!out.scriptName && s.script_name) out.scriptName = s.script_name;
    // 兼容 enabled/disabled
    if (out.enabled !== undefined && out.disabled === undefined) out.disabled = !out.enabled;
    if (!Array.isArray(out.placement)) {
        out.placement = out.placement ? [out.placement] : [];
    }
    return out;
}

/** 从卡片数据提取正则脚本列表 */
export function extractRegexFromCard(card) {
    const dd = (card && card.data && card.data.data) || {};
    const top = (card && card.data) || {};
    if (dd && dd.extensions && Array.isArray(dd.extensions.regex_scripts)) {
        return dd.extensions.regex_scripts.map(normalizeRegexScript).filter(Boolean);
    }
    if (top && top.extensions && Array.isArray(top.extensions.regex_scripts)) {
        return top.extensions.regex_scripts.map(normalizeRegexScript).filter(Boolean);
    }
    return [];
}
