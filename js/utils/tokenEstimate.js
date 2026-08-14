/**
 * 文本 Token 估算工具（中文字符按 1.5、英文单词按 1.2 权重近似估算）
 * 供 App.vue（Token 统计）与 TextModal.vue（大文本弹窗 Token 徽章）共享
 * @param {string} text - 待估算文本
 * @returns {number} 估算 Token 数
 */
export function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
    const nonChinese = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return Math.ceil(chinese.length * 1.5 + nonChinese.length * 1.2);
}
