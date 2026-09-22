/**
 * 轻量 Markdown → HTML（对外文案渲染：OTA 更新说明等）
 *
 * 引擎与聊天渲染统一（Showdown，配置对齐 CardDetailView.renderChatHtml）：
 * 标题 / 列表 / 表格 / 引用 / 链接 / 代码块全量支持；Showdown 加载异常时走轻量降级
 * （粗体 / 斜体 / 行内代码 / 围栏代码 / 换行）。
 *
 * ⚠️ 输出为「未清洗 HTML」，消费方必须再经 DOMPurify（sanitizeStatusHtml）白名单
 *    清洗后才能上屏（v-html）；本模块自身不做安全过滤。
 * Showdown 为纯 JS 实现，本模块可在 Node 下直接单测转换逻辑。
 */
import Showdown from 'showdown';

let converter = null;
try {
    converter = new Showdown.Converter({
        tables: true, strikethrough: true, simplifiedAutoLink: false,
        openLinksInNewWindow: false, emoji: false, headerLevelStart: 1
    });
} catch (e) {
    converter = null; // 引擎加载失败 → 走轻量降级
}

/** 轻量降级渲染（与 CardDetailView 降级路径一致；原文 HTML 依赖消费方清洗） */
function fallbackRender(s) {
    let out = String(s);
    out = out.replace(/```([\s\S]*?)```/g, (m, code) => {
        const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<pre>' + esc + '</pre>';
    });
    out = out.replace(/`([^`]+)`/g, (m, code) => {
        const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<code>' + esc + '</code>';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/\n/g, '<br/>');
    return out;
}

/**
 * Markdown → HTML（未清洗）。
 * @param {string} md 原始 Markdown 文本
 * @returns {string} HTML（须经 DOMPurify 清洗后使用）
 */
export function markdownToHtml(md) {
    const s = String(md == null ? '' : md);
    if (!s) return '';
    if (converter) {
        try {
            return converter.makeHtml(s);
        } catch (e) {
            // 转轻量降级
        }
    }
    return fallbackRender(s);
}
