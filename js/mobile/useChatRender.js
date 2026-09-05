/**
 * 测卡消息分段渲染器（对齐「渲染方案.MD」第 3 节 Segmenter + 第 4 节安全 WebView）
 *
 * 方案按原生 Kotlin/Compose 编写（Markwon + WebView 池）。本项目在 Capacitor WebView 内，
 * 等价实现：
 *   - 文本段 → 现有 renderChatHtml（Markdown 子集 + DOMPurify 清洗）
 *   - HTML 段（```html 围栏 / <style>/<script> 完整模板）→ sandbox iframe（srcdoc，
 *     禁同源权限，对齐方案 configureSecure 的安全语义；项目已有 statusSrcdoc 先例）
 *   - 分段优先级：完整 HTML 文档模板 > ```html 围栏 > 普通文本
 *
 * 流式挂起检测（方案第 6 节 splitPending）：未闭合围栏/标签在流式期间不渲染，
 * 避免半截面板闪烁（本端非流式 API，保留该函数供后续接入）。
 */

/** ```html 围栏（语言标记可省略空白；大小写不敏感） */
const HTML_FENCE_RE = /```html\s*\n?([\s\S]*?)```/gi;

/** 段类型：text=文本段 html=面板段 */

/**
 * 判断 HTML 段是否需要 iframe（含 <style>/<script> 的完整模板 → CSS/JS 全量生效）
 * 与 CardDetailView.statusNeedsIframe 同语义
 */
export function htmlNeedsIframe(html) {
    const t = String(html || '');
    return /<style[\s>]/i.test(t) || /<script[\s>]/i.test(t) || /<html[\s>]/i.test(t);
}

/**
 * 消息文本 → 分段数组 [{type:'text'|'html', content}]
 * 空段自动剔除；全空返回单空文本段（模板渲染兜底）
 */
export function segmentMessage(text) {
    const src = String(text == null ? '' : text);
    if (!src.trim()) return [{ type: 'text', content: '' }];
    const out = [];
    let last = 0;
    HTML_FENCE_RE.lastIndex = 0;
    let m;
    while ((m = HTML_FENCE_RE.exec(src)) !== null) {
        const before = src.slice(last, m.index).trim();
        if (before) out.push({ type: 'text', content: before });
        const html = (m[1] || '').trim();
        if (html) out.push({ type: 'html', content: html });
        last = m.index + m[0].length;
    }
    const tail = src.slice(last).trim();
    if (tail) out.push({ type: 'text', content: tail });
    if (!out.length) out.push({ type: 'text', content: '' });
    return out;
}

/**
 * HTML 段 → iframe srcdoc 完整文档（对齐方案 ensureDocument：片段包壳，完整文档直用）
 * 注入变量桥（getVariables/getMessageVar stub）+ 高度上报桥（postMessage，
 * sandbox 无同源权限时的量高回写等价实现，方案第 4 节 onPageFinished 量高）
 * @param {string} html 面板 HTML（片段或完整文档）
 * @param {string} varsJson 变量树 JSON 字符串（注入 getVariables）
 * @param {string} panelId 面板唯一 id（高度上报配对用）
 */
export function buildHtmlSrcdoc(html, varsJson, panelId) {
    const body = String(html || '');
    const vars = varsJson || '{ "stat_data": {} }';
    const pid = String(panelId || '');
    const bridge = '<script>window.getVariables=function(){try{return JSON.parse(' +
        JSON.stringify(vars) + ');}catch(e){return {stat_data:{}};}};' +
        'window.getMessageVar=function(p){var v=window.getVariables();var c=v;' +
        'try{p.split(".").forEach(function(s){c=(c==null)?undefined:c[s];});}catch(e){c=undefined;}' +
        'return c;};' +
        // 高度上报：load 后量取文档高度 postMessage 给宿主（多次延迟重测，等字体/图片就位）
        'function __rh(){try{var h=Math.max(document.body?document.body.scrollHeight:0,' +
        'document.documentElement?document.documentElement.scrollHeight:0);' +
        'if(h>0)parent.postMessage({type:"jsx-panel-height",id:' + JSON.stringify(pid) + ',h:h},"*");}catch(e){}}' +
        'window.addEventListener("load",function(){__rh();setTimeout(__rh,200);setTimeout(__rh,800);});' +
        'setTimeout(__rh,100);<\/script>';
    if (/<html[\s>]/i.test(body)) {
        // 完整文档：在 </head> 或 <body> 后注入变量桥
        if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, bridge + '</head>');
        if (/<body[^>]*>/i.test(body)) return body.replace(/<body[^>]*>/i, (mm) => mm + bridge);
        return bridge + body;
    }
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>html,body{margin:0;padding:0;background:transparent;}</style>' +
        bridge + '</head><body>' + body + '</body></html>';
}

/**
 * 流式挂起检测（方案第 6 节 splitPending）：
 * 返回 [可渲染部分, 挂起部分]——未闭合 ```html 围栏进入挂起，等写完再渲染
 */
export function splitPending(buffer) {
    const src = String(buffer == null ? '' : buffer);
    const openFence = src.toLowerCase().lastIndexOf('```html');
    if (openFence === -1) return [src, ''];
    const after = src.slice(openFence + 7);
    if (/```/.test(after)) return [src, '']; // 已闭合
    return [src.slice(0, openFence), src.slice(openFence)];
}
