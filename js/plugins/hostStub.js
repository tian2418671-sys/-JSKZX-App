/**
 * 🧩 插件效果宿主桩（host stub）
 * 在沙箱 iframe（data: URL + sandbox="allow-scripts"）内模拟 SillyTavern 酒馆的运行环境，
 * 让插件脚本（酒馆助手 / userscript / SlashRunner 命令 / 原生扩展 bundle）能渲染出
 * 悬浮球 / 按钮 / 面板等 UI，达到「所见即所得」的效果预览基线。
 *
 * ⚠️ 安全边界：本模块只返回 HTML 字符串，由工作区组件以 data: URL 注入 iframe；
 *    iframe 无 allow-same-origin，脚本运行于隔离 origin，无法触碰应用本身。
 * ⚠️ 本文件是纯 .js 模块（非 Vue SFC），HTML 字符串可直接使用尖括号，无需 \x3C 转义。
 */

// 真实 jQuery 源码（jquery/dist/jquery.min.js，生产构建内联为字符串）。
// 相比手写 mini-jQuery，真实 jQuery 覆盖 $("<a>",{props}) 带属性创建、.last() 链式、
// 事件委托、CSS 解析等全部能力，从根上避免「逐个脚本补 DOM 方法」的问题。
import jquerySource from 'jquery/dist/jquery.min.js?raw';
// 真实 lodash（lodash.min.js）。酒馆 iframe 脚本环境中 window._ 即 lodash（见 predefine.js），
// 用真实库替代手写 _.escape，覆盖 _.get/_.set/_.merge/_.pick 等全部工具方法。
import lodashSource from 'lodash/lodash.min.js?raw';
// 真实 Handlebars（handlebars.min.js）——酒馆扩展模板引擎（renderExtensionTemplateAsync 底层），
// 渲染扩展设置面板等 {{var}}/{{#each}}/{{{html}}} 模板。
import handlebarsSource from 'handlebars/dist/handlebars.min.js?raw';
// 真实 Showdown（showdown.min.js）——酒馆消息正文 Markdown 引擎（messageFormatting 第 6 步 converter.makeHtml）。
import showdownSource from 'showdown/dist/showdown.min.js?raw';
// 纯逻辑函数（rewriteEsmModule / stripEsmSyntax / parseSlashCommand / escapeHtml）——
// 抽离到 hostStubPure.js 供 node --test 单测 import，此处复用避免重复维护。
import { rewriteEsmModule as rewriteEsmModulePure, stripEsmSyntax as stripEsmSyntaxPure, parseSlashCommand as parseSlashCommandPure, escapeHtml as escapeHtmlPure } from './hostStubPure.js';

/** 生成内存版 localStorage（data: URL 下原生 localStorage 会抛 SecurityError） */
function buildMemoryStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { store.set(String(k), String(v)); },
        removeItem: (k) => { store.delete(String(k)); },
        clear: () => { store.clear(); },
        key: (i) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; }
    };
}

/**
 * 迷你事件发射器（模拟酒馆 eventSource）。
 * 对齐 SillyTavern 的 EventEmitter 接口：on / once / makeLast / makeFirst / removeListener / emit / emitAndWait。
 */
function buildEventSourceStub() {
    return `
window.eventSource = (function(){
  const handlers = {};
  function list(type){ return handlers[type] || (handlers[type] = []); }
  return {
    on(type, fn){ list(type).push(fn); return () => this.removeListener(type, fn); },
    once(type, fn){ const w = (...a)=>{ this.removeListener(type, w); try { fn(...a); } catch(e){ console.error(e); } }; this.on(type, w); return () => this.removeListener(type, w); },
    makeLast(type, fn){ const l = list(type); const i = l.indexOf(fn); if (i >= 0) { l.splice(i, 1); l.push(fn); } else { l.push(fn); } return () => this.removeListener(type, fn); },
    makeFirst(type, fn){ const l = list(type); const i = l.indexOf(fn); if (i >= 0) { l.splice(i, 1); l.unshift(fn); } else { l.unshift(fn); } return () => this.removeListener(type, fn); },
    removeListener(type, fn){ const l = handlers[type]; if (l) handlers[type] = l.filter(f=>f!==fn); },
    removeListenerFromAll(fn){ for (const t in handlers) handlers[t] = handlers[t].filter(f=>f!==fn); },
    off(type, fn){ this.removeListener(type, fn); },
    emit(type, ...a){ list(type).slice().forEach(f=>{ try{ f(...a); }catch(e){ console.error(e); } }); },
    emitAndWait(type, ...a){ list(type).slice().forEach(f=>{ try{ f(...a); }catch(e){ console.error(e); } }); },
    clearType(type){ delete handlers[type]; },
    clearAll(){ for (const k in handlers) delete handlers[k]; }
  };
})();`;
}

/**
 * 注入真实 jQuery（替代手写 mini-jQuery）。
 * 手写 shim 会不断遗漏脚本用到的 API（如 $("<a>",{props}) 带属性创建、.last() 链式边缘情况、
 * 事件委托、CSS 数值推断等），导致「逐个脚本补方法」。真实 jQuery 一次性覆盖完整 API 面。
 */
function buildMiniJquery() {
    return jquerySource;
    /* ============ 以下旧的手写 mini-jQuery 已弃用（unreachable，仅留作历史参考） ============ */
    return `
(function(){
  function isHtml(s){ return typeof s === 'string' && s.trim()[0] === '<'; }
  function isNode(el){ return el && (el.nodeType === 1 || el.nodeType === 9 || el.nodeType === 11); }
  function toNode(el){ if (isNode(el)) return el; if (el && isNode(el[0])) return el[0]; return null; }
  function matches(el, sel){ try { return el && el.matches && el.matches(sel); } catch(e) { return false; } }
  function $(sel, ctx){
    if (typeof sel === 'function') { // $(fn) ready
      if (document.readyState !== 'loading') { try{ sel(); }catch(e){ console.error(e); } }
      else document.addEventListener('DOMContentLoaded', ()=>{ try{ sel(); }catch(e){ console.error(e); } });
      return makeObj([document]);
    }
    if (sel && isNode(sel)) return makeObj([sel]);          // $(domNode)
    if (sel && sel.length !== undefined && isNode(sel[0])) return makeObj(Array.from(sel)); // $(jqObj)
    if (isHtml(sel)) { // $(html) 创建元素
      const tpl = document.createElement('template');
      tpl.innerHTML = sel.trim();
      return makeObj(Array.from(tpl.content.children));
    }
    const root = ctx ? (toNode(ctx) || document) : document;
    const els = Array.from((root.querySelectorAll ? root.querySelectorAll(sel) : []) || []);
    return makeObj(els);
  }
  function makeObj(els){
    els = els || [];
    const obj = {
      0: els[0], length: els.length,
      ready(cb){ if (document.readyState !== 'loading') { try{cb&&cb();}catch(e){} } else document.addEventListener('DOMContentLoaded', ()=>{ try{cb&&cb();}catch(e){} }); return obj; },
      on(ev, sel, cb){ if (typeof sel === 'function'){ cb = sel; sel = null; }
        const base = String(ev).split('.')[0]; // jQuery 事件命名空间：click.xxx -> click
        els.forEach(el=>{ el.addEventListener(base, function(e){ if (!sel || matches(e.target, sel)) { try{ cb && cb.call(el, e); }catch(err){ console.error(err); } } }); }); return obj; },
      off(ev, cb){ const base = String(ev).split('.')[0]; els.forEach(el=>{ el.removeEventListener(base, cb); }); return obj; },
      one(ev, cb){ els.forEach(el=>{ const w = (e)=>{ el.removeEventListener(ev, w); cb.call(el, e); }; el.addEventListener(ev, w); }); return obj; },
      click(cb){ return cb === undefined ? obj.trigger('click') : obj.on('click', cb); },
      load(cb){ els.forEach(el=>{ if (el.tagName==='IMG'||el.tagName==='SCRIPT'||el.tagName==='IFRAME') { el.addEventListener('load', cb); } else { try{cb&&cb();}catch(e){} } }); return obj; },
      append(){ const args = Array.from(arguments); els.forEach(el=>{ args.forEach(a=>{ const n = toNode(a); if (n) el.appendChild(n); else if (a!==undefined&&a!==null) el.insertAdjacentHTML('beforeend', String(a)); }); }); return obj; },
      prepend(){ const args = Array.from(arguments); els.forEach(el=>{ args.forEach(a=>{ const n = toNode(a); if (n) el.prepend(n); else if (a!==undefined&&a!==null) el.insertAdjacentHTML('afterbegin', String(a)); }); }); return obj; },
      appendTo(target){ $(target).append(els); return obj; },
      prependTo(target){ $(target).prepend(els); return obj; },
      before(){ const args = Array.from(arguments); els.forEach(el=>{ args.forEach(a=>{ const n = toNode(a); if (n) el.parentNode && el.parentNode.insertBefore(n, el); else if (a!==undefined&&a!==null) el.insertAdjacentHTML('beforebegin', String(a)); }); }); return obj; },
      after(){ const args = Array.from(arguments); els.forEach(el=>{ args.forEach(a=>{ const n = toNode(a); if (n) el.parentNode && el.parentNode.insertBefore(n, el.nextSibling); else if (a!==undefined&&a!==null) el.insertAdjacentHTML('afterend', String(a)); }); }); return obj; },
      insertBefore(target){ $(target).before(els); return obj; },
      insertAfter(target){ $(target).after(els); return obj; },
      remove(){ els.forEach(el=>{ try{ el.remove(); }catch(e){} }); return obj; },
      empty(){ els.forEach(el=>{ el.innerHTML = ''; }); return obj; },
      detach(){ const out = Array.from(els); els.forEach(el=>{ try{ el.remove(); }catch(e){} }); return makeObj(out); },
      css(prop, val){ if (val === undefined && typeof prop === 'string') return els[0] ? getComputedStyle(els[0])[prop] : undefined; els.forEach(el=>{ if (typeof prop === 'object'){ for (const k in prop){ const v = prop[k]; if (typeof v === 'number' && !(/zIndex|opacity|lineHeight|fontWeight|zoom|flex|order|scale|count|weight/i.test(k))) el.style[k] = v + 'px'; else el.style[k] = v; } } else if (val !== undefined){ el.style[prop] = val; } }); return obj; },
      html(v){ if (v === undefined) return els[0] ? els[0].innerHTML : ''; els.forEach(el=>{ el.innerHTML = v; }); return obj; },
      text(v){ if (v === undefined) return els[0] ? els[0].textContent : ''; els.forEach(el=>{ el.textContent = v; }); return obj; },
      attr(k, v){ if (v === undefined && typeof k === 'string') return els[0] ? els[0].getAttribute(k) : null; els.forEach(el=>{ if (typeof k === 'object'){ for (const x in k) el.setAttribute(x, k[x]); } else { el.setAttribute(k, v); } }); return obj; },
      removeAttr(k){ els.forEach(el=>{ el.removeAttribute(k); }); return obj; },
      prop(k, v){ if (v === undefined && typeof k === 'string') return els[0] ? els[0][k] : null; els.forEach(el=>{ if (typeof k === 'object'){ Object.assign(el, k); } else { el[k] = v; } }); return obj; },
      data(k, v){ if (v === undefined && typeof k === 'string'){ const el = els[0]; if (!el) return undefined; const raw = el.getAttribute('data-' + k); return raw === null ? undefined : raw; } els.forEach(el=>{ if (typeof k === 'object'){ for (const x in k) el.setAttribute('data-' + x, String(k[x])); } else { el.setAttribute('data-' + k, String(v)); } }); return obj; },
      addClass(c){ els.forEach(el=>{ String(c).split(/\\s+/).forEach(x=>{ if(x) el.classList.add(x); }); }); return obj; },
      removeClass(c){ els.forEach(el=>{ String(c).split(/\\s+/).forEach(x=>{ if(x) el.classList.remove(x); }); }); return obj; },
      toggleClass(c, force){ els.forEach(el=>{ String(c).split(/\\s+/).forEach(x=>{ if(x) el.classList.toggle(x, force); }); }); return obj; },
      hasClass(c){ return els.some(el=> el.classList.contains(c)); },
      show(){ els.forEach(el=>{ el.style.display = ''; }); return obj; },
      hide(){ els.forEach(el=>{ el.style.display = 'none'; }); return obj; },
      toggle(){ els.forEach(el=>{ el.style.display = (getComputedStyle(el).display === 'none') ? '' : 'none'; }); return obj; },
      val(v){ if (v === undefined) return els[0] ? (els[0].value !== undefined ? els[0].value : '') : ''; els.forEach(el=>{ el.value = v; }); return obj; },
      focus(){ if (els[0] && els[0].focus) els[0].focus(); return obj; },
      blur(){ if (els[0] && els[0].blur) els[0].blur(); return obj; },
      find(sel){ let out=[]; els.forEach(el=>{ try { out = out.concat(Array.from(el.querySelectorAll(sel))); } catch(e) { // jQuery 支持 '> p, > div' 直接子元素前缀，原生 querySelectorAll 不支持，转成 :scope 形式\n          try { const scoped = String(sel).split(',').map(function(s){ s = s.trim(); return s.charAt(0) === '>' ? ':scope ' + s : s; }).join(','); out = out.concat(Array.from(el.querySelectorAll(scoped))); } catch(e2) {} } }); return makeObj(out); },
      children(sel){ let out=[]; els.forEach(el=>{ out = out.concat(Array.from(el.children)); }); if (sel) out = out.filter(el=>matches(el, sel)); return makeObj(out); },
      filter(sel){ let out; if (typeof sel === 'function'){ out = els.filter((el,i)=> sel.call(el, i, el)); } else { out = els.filter(el=> matches(el, sel)); } return makeObj(out); },
      not(sel){ let out; if (typeof sel === 'function'){ out = els.filter((el,i)=> !sel.call(el, i, el)); } else if (isNode(sel) || (sel && sel.length !== undefined)){ const excl = toNode(sel); out = els.filter(el=> el !== excl); } else { out = els.filter(el=> !matches(el, sel)); } return makeObj(out); },
      is(sel){ if (typeof sel === 'function') return els.some((el,i)=> sel.call(el, i, el)); return els.some(el=> matches(el, sel)); },
      has(sel){ return makeObj(els.filter(el=> (sel && sel.length !== undefined) ? el.contains(toNode(sel)) : el.querySelector(sel) !== null)); },
      each(cb){ els.forEach((el,i)=>{ try{ cb.call(el, i, el); }catch(e){} }); return obj; },
      map(cb){ return makeObj(els.map((el,i)=> { const r = cb.call(el, i, el); return r; })); },
      get(i){ if (i === undefined) return Array.from(els); return els[i]; },
      first(){ return makeObj(els[0] ? [els[0]] : []); },
      last(){ return makeObj(els.length ? [els[els.length-1]] : []); },
      eq(i){ return makeObj(els[i] ? [els[i]] : []); },
      slice(a,b){ return makeObj(Array.prototype.slice.call(els, a, b)); },
      index(el){ if (el === undefined) return els[0] ? Array.from(els[0].parentElement.children).indexOf(els[0]) : -1; const n = toNode(el); return els.indexOf(n); },
      parent(sel){ let out = els.map(el=> el.parentElement).filter(Boolean); if (sel) out = out.filter(el=> matches(el, sel)); return makeObj(out); },
      parents(sel){ let out=[]; els.forEach(el=>{ let p = el.parentElement; while (p){ out.push(p); p = p.parentElement; } }); if (sel) out = out.filter(el=> matches(el, sel)); return makeObj(out); },
      closest(sel){ let out=[]; els.forEach(el=>{ let p = el; while (p){ if (matches(p, sel)){ out.push(p); break; } p = p.parentElement; } }); return makeObj(out); },
      next(){ return makeObj(els.map(el=> el.nextElementSibling).filter(Boolean)); },
      prev(){ return makeObj(els.map(el=> el.previousElementSibling).filter(Boolean)); },
      siblings(sel){ let out=[]; els.forEach(el=>{ if (el.parentElement) out = out.concat(Array.from(el.parentElement.children).filter(x=> x !== el)); }); if (sel) out = out.filter(el=> matches(el, sel)); return makeObj(out); },
      wrap(html){ els.forEach(el=>{ const w = $(html)[0]; if (!w || !el.parentNode) return; el.parentNode.insertBefore(w, el); w.appendChild(el); }); return obj; },
      width(v){ if (v === undefined) return els[0] ? els[0].getBoundingClientRect().width : 0; els.forEach(el=>{ el.style.width = (typeof v === 'number' ? v + 'px' : v); }); return obj; },
      height(v){ if (v === undefined) return els[0] ? els[0].getBoundingClientRect().height : 0; els.forEach(el=>{ el.style.height = (typeof v === 'number' ? v + 'px' : v); }); return obj; },
      offset(){ const el = els[0]; if (!el) return {top:0,left:0}; const r = el.getBoundingClientRect(); return { top: r.top + (window.scrollY||0), left: r.left + (window.scrollX||0) }; },
      position(){ const el = els[0]; if (!el) return {top:0,left:0}; return { top: el.offsetTop, left: el.offsetLeft }; },
      fadeIn(ms){ els.forEach(el=>{ el.style.opacity = 0; el.style.display = ''; requestAnimationFrame(()=>{ el.style.transition = 'opacity ' + (ms||200) + 'ms'; el.style.opacity = 1; }); }); return obj; },
      fadeOut(ms){ els.forEach(el=>{ el.style.transition = 'opacity ' + (ms||200) + 'ms'; el.style.opacity = 0; setTimeout(()=>{ el.style.display = 'none'; }, ms||200); }); return obj; },
      trigger(ev){ els.forEach(el=>{ try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch(e) {} }); return obj; },
      scrollTop(){ return els[0] ? els[0].scrollTop : 0; }
    };
    obj.__proto__ = $ ? Object.getPrototypeOf($.fn || {}) : Object.prototype;
    return obj;
  }
  $.fn = makeObj([]);
  $.fn.init = function(){};
  $.trim = function(s){ return String(s||'').trim(); };
  $.each = function(obj, cb){ if (Array.isArray(obj) || obj.length !== undefined) { Array.from(obj).forEach((v,i)=>cb.call(v, i, v)); } else { for (const k in obj) cb.call(obj[k], k, obj[k]); } return obj; };
  $.extend = function(target){ const args = Array.from(arguments); if (typeof target === 'boolean') args.shift(); const t = args.shift() || {}; args.forEach(src=>{ for (const k in src) t[k] = src[k]; }); return t; };
  $.isFunction = function(v){ return typeof v === 'function'; };
  $.ajax = function(opts){ opts = opts || {}; const fake = { status: 200, statusText: 'OK', responseText: '', responseJSON: undefined, readyState: 4 }; try { if (opts.success) opts.success(fake.responseText || {}, 'success', fake); } catch(e){} const chain = { done(cb){ try{cb&&cb({});}catch(e){} return chain; }, fail(cb){ try{cb&&cb();}catch(e){} return chain; }, always(cb){ try{cb&&cb();}catch(e){} return chain; }, then(cb){ try{cb&&cb({});}catch(e){} return chain; } }; return chain; };
  $.getJSON = $.get = $.post = function(){ return $.ajax({}); };
  window.$ = window.jQuery = $;
})();`;
}

/** SillyTavern 扩展 / userscript 常用全局 stub（避免脚本一加载就 ReferenceError） */
function buildGlobalStubs(plugin = {}) {
    // 插件声明的脚本按钮（酒馆助手 JSON 的 buttons 字段）作为初始脚本按钮列表
    const initialButtons = JSON.stringify((plugin.meta && Array.isArray(plugin.meta.buttons)) ? plugin.meta.buttons : []);
    const scriptName = JSON.stringify((plugin.name && String(plugin.name)) || 'jsk-plugin');
    return `
// —— 受控的 window.parent / window.top 访问：沙箱 iframe 无 allow-same-origin，
//    访问 window.parent 会抛 SecurityError，这里用 getter 兜底返回本地 window，
//    使插件里的 parentWin.SillyTavern 等回落到本地 stub，不再报跨源错误。
try {
  Object.defineProperty(window, 'parent', { get: function(){ return window; } });
  Object.defineProperty(window, 'top', { get: function(){ return window; } });
  Object.defineProperty(window, 'self', { get: function(){ return window; } });
} catch(e) {}

// —— 通用聊天消息 API（酒馆助手脚本最常调用）。
//    消息结构对齐真实酒馆 ChatMessage：{ is_user, is_system, name, mes, send_date } ——
var __jskChat = [
  { is_user: true, is_system: false, name: 'User', mes: '（沙箱演示会话，插件仅渲染 UI，不连接真实酒馆）', send_date: Date.now() },
  { is_user: false, is_system: false, name: '角色', mes: '你好！这是一个模拟的酒馆会话环境。', send_date: Date.now() }
];
window.getLastMessageId = function(){ return __jskChat.length - 1; };
window.getChatMessages = function(range){ try{ var parts = String(range||'').split('-'); var a = parseInt(parts[0],10), b = parseInt(parts[1],10); if (isNaN(a)) return __jskChat.slice(); if (isNaN(b)) return __jskChat.slice(a); return __jskChat.slice(a, b+1); }catch(e){ return __jskChat.slice(); } };
// —— variables 用迷你作用域（对齐酒馆 getContext().variables.local/global 的 get/set/del）——
function __jskVarScope(){
  var m = {};
  return {
    get: function(k){ return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined; },
    set: function(k, v){ m[k] = v; return v; },
    del: function(k){ delete m[k]; },
    list: function(){ return Object.keys(m); }
  };
}
// —— 扩展模板渲染：读 __jskTemplates（主进程预注入的扩展 html 模板映射），Handlebars 编译渲染 ——
//    真实酒馆路径约定 scripts/extensions/<扩展名>/<模板id>.html；宿主键兼容多种写法，找不到回退空串不崩。
window.renderExtensionTemplate = function(extensionName, templateId, data){
  var map = window.__jskTemplates || {};
  var keys = [
    extensionName + '/' + templateId + '.html',
    'scripts/extensions/' + extensionName + '/' + templateId + '.html',
    templateId + '.html',
    templateId
  ];
  var content = null;
  for (var i = 0; i < keys.length; i++) { if (typeof map[keys[i]] === 'string') { content = map[keys[i]]; break; } }
  if (content == null) return '';
  try {
    if (window.Handlebars) return window.Handlebars.compile(content)(data || {});
  } catch(e) { console.error('[renderExtensionTemplate]', extensionName, templateId, e); }
  return content;
};
window.renderExtensionTemplateAsync = function(extensionName, templateId, data){ return Promise.resolve(window.renderExtensionTemplate(extensionName, templateId, data)); };
// —— 完整 getContext（对齐 st-context.js 高频成员；函数体惰性求值，window 级 API 后续定义即可）——
window.getContext = function(){
  var v = __jskVarScope;
  var ctx = {
    chat: __jskChat, chatMetadata: {}, characters: window.characters, groups: window.groups,
    name1: 'User', name2: '角色', characterId: '0', groupId: null, chatId: 'demo', members: [],
    getCurrentChatId: function(){ return 'demo'; },
    getRequestHeaders: function(){ return { 'Content-Type': 'application/json' }; },
    reloadCurrentChat: function(){ return Promise.resolve(); }, renameChat: function(){ return Promise.resolve(); },
    saveSettingsDebounced: function(){ return Promise.resolve(); }, saveMetadataDebounced: function(){},
    saveChat: function(){ return Promise.resolve(); }, saveMetadata: function(){ return Promise.resolve(); },
    deleteMessage: function(){ return Promise.resolve(); }, deleteLastMessage: function(){ return Promise.resolve(); },
    addOneMessage: function(m){ return (typeof window.addOneMessage === 'function') ? window.addOneMessage(m) : (window.jQuery ? window.jQuery('<div>') : document.createElement('div')); },
    updateMessageBlock: function(){}, sendSystemMessage: function(){ return Promise.resolve(); },
    generate: function(){ return Promise.resolve(); }, sendStreamingRequest: function(){ return Promise.resolve(); },
    sendGenerationRequest: function(){ return Promise.resolve(); }, stopGeneration: function(){ return false; },
    messageFormatting: function(m){ return (typeof window.messageFormatting === 'function') ? window.messageFormatting(m) : m; },
    substituteParams: function(m){ return (typeof window.__jskSubstituteParams === 'function') ? window.__jskSubstituteParams(m) : String(m); },
    getTokenCountAsync: function(){ return Promise.resolve(0); }, getTokenCount: function(){ return 0; },
    extensionPrompts: {}, setExtensionPrompt: function(){ return Promise.resolve(); },
    eventSource: window.eventSource, eventTypes: window.tavern_events,
    registerMacro: function(n, cb){ if (window.MacrosParser) window.MacrosParser.register(n, cb); },
    unregisterMacro: function(n){ if (window.MacrosParser) window.MacrosParser.unregisterMacro(n); },
    macros: (window.MacrosParser && window.MacrosParser.macros) || {},
    swipe: {
      left: function(){ return Promise.resolve(); }, right: function(){ return Promise.resolve(); },
      to: function(){ return Promise.resolve(); }, show: function(){}, hide: function(){},
      refresh: function(){}, isAllowed: function(){ return false; }, state: {}
    },
    variables: { local: v(), global: v() },
    loader: { show: function(){}, hide: function(){} },
    SlashCommandParser: window.SlashCommandParser, SlashCommand: window.SlashCommand,
    ARGUMENT_TYPE: window.ARGUMENT_TYPE,
    onlineStatus: 'auto', mainApi: {},
    uuidv4: function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r = Math.random()*16|0; return ((c === 'x') ? r : (r & 0x3 | 0x8)).toString(16); }); },
    t: function(s){ return Array.isArray(s) ? s.join('') : String(s == null ? '' : s); },
    translate: function(t){ return t; },
    getCharacters: function(){ return Promise.resolve([]); }, getThumbnailUrl: function(){ return ''; },
    writeExtensionField: function(){ return Promise.resolve(); }, writeExtensionFieldBulk: function(){ return Promise.resolve(); }
  };
  return ctx;
};
window.saveChat = function(){ return Promise.resolve(); };
window.getCurrentChatId = function(){ return 'demo'; };
window.getCurrentChatName = function(){ return '沙箱演示会话'; };
window.getThumbnailUrl = function(){ return ''; };
window.deleteChatMessages = function(){ return Promise.resolve(); };
window.createChatMessages = function(){ return Promise.resolve(); };
window.rotateChatMessages = function(){ return Promise.resolve(); };
window.triggerSlash = function(cmd){ console.log('[slash]', cmd); return Promise.resolve(); };

// —— 事件常量（对齐 JS-Slash-Runner @types/iframe/event.d.ts 全清单）——
window.iframe_events = {
  MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started',
  MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',
  GENERATION_STARTED: 'js_generation_started',
  STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully',
  STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
  GENERATION_ENDED: 'js_generation_ended'
};
window.tavern_events = {
  APP_READY: 'app_ready',
  EXTRAS_CONNECTED: 'extras_connected',
  MESSAGE_SWIPED: 'message_swiped',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_FILE_EMBEDDED: 'message_file_embedded',
  MESSAGE_REASONING_EDITED: 'message_reasoning_edited',
  MESSAGE_REASONING_DELETED: 'message_reasoning_deleted',
  MESSAGE_SWIPE_DELETED: 'message_swipe_deleted',
  MORE_MESSAGES_LOADED: 'more_messages_loaded',
  IMPERSONATE_READY: 'impersonate_ready',
  CHAT_CHANGED: 'chat_id_changed',
  GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  SD_PROMPT_PROCESSING: 'sd_prompt_processing',
  EXTENSIONS_FIRST_LOAD: 'extensions_first_load',
  EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded',
  SETTINGS_LOADED: 'settings_loaded',
  SETTINGS_UPDATED: 'settings_updated',
  MOVABLE_PANELS_RESET: 'movable_panels_reset',
  SETTINGS_LOADED_BEFORE: 'settings_loaded_before',
  SETTINGS_LOADED_AFTER: 'settings_loaded_after',
  CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed',
  CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
  OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before',
  OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
  OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready',
  OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready',
  WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
  WORLDINFO_UPDATED: 'worldinfo_updated',
  CHARACTER_EDITOR_OPENED: 'character_editor_opened',
  CHARACTER_EDITED: 'character_edited',
  CHARACTER_PAGE_LOADED: 'character_page_loaded',
  USER_MESSAGE_RENDERED: 'user_message_rendered',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  FORCE_SET_BACKGROUND: 'force_set_background',
  CHAT_DELETED: 'chat_deleted',
  CHAT_CREATED: 'chat_created',
  GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts',
  GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
  GENERATE_AFTER_DATA: 'generate_after_data',
  WORLD_INFO_ACTIVATED: 'world_info_activated',
  TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready',
  CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
  CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
  CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
  CHARACTER_DELETED: 'characterDeleted',
  CHARACTER_DUPLICATED: 'character_duplicated',
  CHARACTER_RENAMED: 'character_renamed',
  CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat',
  SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received',
  STREAM_TOKEN_RECEIVED: 'stream_token_received',
  STREAM_REASONING_DONE: 'stream_reasoning_done',
  FILE_ATTACHMENT_DELETED: 'file_attachment_deleted',
  WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
  OPEN_CHARACTER_LIBRARY: 'open_character_library',
  ONLINE_STATUS_CHANGED: 'online_status_changed',
  IMAGE_SWIPED: 'image_swiped',
  CONNECTION_PROFILE_LOADED: 'connection_profile_loaded',
  CONNECTION_PROFILE_CREATED: 'connection_profile_created',
  CONNECTION_PROFILE_DELETED: 'connection_profile_deleted',
  CONNECTION_PROFILE_UPDATED: 'connection_profile_updated',
  TOOL_CALLS_PERFORMED: 'tool_calls_performed',
  TOOL_CALLS_RENDERED: 'tool_calls_rendered',
  CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown',
  SECRET_WRITTEN: 'secret_written',
  SECRET_DELETED: 'secret_deleted',
  SECRET_ROTATED: 'secret_rotated',
  SECRET_EDITED: 'secret_edited',
  PRESET_CHANGED: 'preset_changed',
  PRESET_DELETED: 'preset_deleted',
  PRESET_RENAMED: 'preset_renamed',
  PRESET_RENAMED_BEFORE: 'preset_renamed_before',
  MAIN_API_CHANGED: 'main_api_changed',
  WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
  WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
  MEDIA_ATTACHMENT_DELETED: 'media_attachment_deleted',
  // —— 宿主桩曾缺失、被真实扩展监听的事件（按 events.js 补齐；宿主内部自洽即可）——
  APP_INITIALIZED: 'app_initialized',
  CHAT_LOADED: 'chatLoaded',
  GROUP_UPDATED: 'group_updated',
  CHAT_RENAMED: 'chat_renamed',
  GROUP_CHAT_DELETED: 'group_chat_deleted',
  GROUP_CHAT_CREATED: 'group_chat_created',
  GROUP_MEMBER_DRAFTED: 'group_member_drafted',
  GROUP_WRAPPER_STARTED: 'group_wrapper_started',
  GROUP_WRAPPER_FINISHED: 'group_wrapper_finished',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: 'character_group_overlay_state_change_before',
  CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: 'character_group_overlay_state_change_after'
};
// 把酒馆事件常量合并到 eventSource（使其同时是「常量表 + 发射器」，兼容
// 脚本里 SillyTavern.tavern_events.CHAT_CHANGED 与 .on() 两种访问方式）
for (var __k in window.tavern_events) { window.eventSource[__k] = window.tavern_events[__k]; }

// —— 事件 API（对齐 event.d.ts 签名，eventOn/eventOnce/... 均返回 { stop() }）——
window.eventOn = function(type, cb){ return { stop: window.eventSource.on(type, cb) }; };
window.eventOnce = function(type, cb){ return { stop: window.eventSource.once(type, cb) }; };
window.eventMakeLast = function(type, cb){ return { stop: window.eventSource.makeLast(type, cb) }; };
window.eventMakeFirst = function(type, cb){ return { stop: window.eventSource.makeFirst(type, cb) }; };
window.eventEmit = function(type){ var a = Array.prototype.slice.call(arguments, 1); window.eventSource.emit.apply(window.eventSource, [type].concat(a)); return Promise.resolve(); };
window.eventEmitAndWait = function(type){ var a = Array.prototype.slice.call(arguments, 1); window.eventSource.emitAndWait.apply(window.eventSource, [type].concat(a)); };
window.eventRemoveListener = function(type, cb){ window.eventSource.removeListener(type, cb); };
window.eventClearEvent = function(type){ window.eventSource.clearType(type); };
window.eventClearListener = function(cb){ window.eventSource.removeListenerFromAll(cb); };
window.eventClearAll = function(){ window.eventSource.clearAll(); };

// —— 脚本按钮系统（对齐 script.d.ts：getButtonEvent/getScriptButtons/replaceScriptButtons/
//    updateScriptButtonsWith/appendInexistentScriptButtons/eventOnButton），
//    真实把 visible 按钮渲染到 #extensionsMenu，点击触发 'button_<name>' 事件 ——
window.__jskScriptButtons = ${initialButtons};
window.getButtonEvent = function(name){ return 'button_' + name; };
window.getScriptButtons = function(){ return window.__jskScriptButtons; };
window.__jskRenderScriptButtons = function(){
  var menu = document.getElementById('extensionsMenu');
  var holder = document.getElementById('jsk-script-buttons');
  if (holder) { holder.innerHTML = ''; } else {
    holder = document.createElement('div');
    holder.id = 'jsk-script-buttons';
    holder.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    if (menu) menu.appendChild(holder);
  }
  (window.__jskScriptButtons || []).forEach(function(b){
    if (!b || !b.visible) return;
    var item = document.createElement('div');
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.title = String(b.name || '');
    item.innerHTML = '<div class="fa-fw fa-solid fa-square-plus extensionsMenuExtensionButton"></div><span>' + String(b.name || '') + '</span>';
    item.addEventListener('click', function(){ window.eventSource.emit('button_' + b.name); });
    holder.appendChild(item);
  });
};
window.replaceScriptButtons = function(buttons){ window.__jskScriptButtons = buttons || []; window.__jskRenderScriptButtons(); };
window.updateScriptButtonsWith = function(updater){
  var r = updater(window.__jskScriptButtons);
  if (r && typeof r.then === 'function') { r.then(function(v){ window.__jskScriptButtons = v || []; window.__jskRenderScriptButtons(); }); return r; }
  window.__jskScriptButtons = r || [];
  window.__jskRenderScriptButtons();
  return window.__jskScriptButtons;
};
window.appendInexistentScriptButtons = function(buttons){
  var names = (window.__jskScriptButtons || []).map(function(b){ return b.name; });
  (buttons || []).forEach(function(b){ if (names.indexOf(b.name) < 0) window.__jskScriptButtons.push(b); });
  window.__jskRenderScriptButtons();
};
// eventOnButton（deprecated，等价 eventOn(getButtonEvent(name), cb)）
window.eventOnButton = function(name, cb){ window.eventOn(window.getButtonEvent(name), cb); };
window.getScriptName = function(){ return ${scriptName}; };
window.getScriptInfo = function(){ return ''; };
window.replaceScriptInfo = function(info){};
window.getScriptId = function(){ return 'jsk-plugin'; };
// 渲染初始脚本按钮（插件声明 buttons 时，让「自动总结」等按钮首屏即可见可点）
window.__jskRenderScriptButtons();

// —— 酒馆主对象 SillyTavern（对齐 exported.sillytavern.d.ts 成员清单）——
window.SillyTavern = (window.SillyTavern || (function(){
  function noop(){}
  function resolve(v){ return Promise.resolve(v); }
  return {
    accountStorage: {},
    chat: __jskChat,
    characters: window.characters,
    groups: window.groups,
    name1: 'User',
    name2: '角色',
    characterId: '0',
    groupId: null,
    chatId: 'demo',
    getCurrentChatId: function(){ return 'demo'; },
    getRequestHeaders: function(){ return { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '' }; },
    reloadCurrentChat: function(){ return resolve(); },
    renameChat: function(){ return resolve(); },
    saveSettingsDebounced: function(){ return resolve(); },
    onlineStatus: 'auto',
    maxContext: 8192,
    chatMetadata: {},
    streamingProcessor: {},
    eventSource: window.eventSource,
    eventTypes: window.tavern_events,
    // 兼容脚本用 SillyTavern.tavern_events（EventEmitter + 常量）
    tavern_events: window.eventSource,
    addOneMessage: function(m, opts){ return (typeof window.addOneMessage === 'function') ? window.addOneMessage(m, opts) : (window.jQuery ? window.jQuery('<div>') : document.createElement('div')); },
    deleteLastMessage: function(){ return resolve(); },
    generate: function(){ console.log('[SillyTavern.generate]'); return resolve(); },
    sendStreamingRequest: function(){ return resolve(); },
    sendGenerationRequest: function(){ return resolve(); },
    stopGeneration: function(){ return false; },
    tokenizers: [],
    getTextTokens: function(){ return resolve(0); },
    getTokenCountAsync: function(){ return resolve(0); },
    extensionPrompts: {},
    setExtensionPrompt: function(){ return resolve(); },
    updateChatMetadata: noop,
    saveChat: function(){ return resolve(); },
    openCharacterChat: function(){ return resolve(); },
    openGroupChat: function(){ return resolve(); },
    saveMetadata: function(){ return resolve(); },
    sendSystemMessage: function(){ return resolve(); },
    activateSendButtons: noop,
    deactivateSendButtons: noop,
    saveReply: function(){ return resolve(); },
    substituteParams: function(c){ return resolve(c); },
    substituteParamsExtended: function(c){ return resolve(c); },
    SlashCommandParser: {},
    SlashCommand: {},
    SlashCommandArgument: {},
    SlashCommandNamedArgument: {},
    ARGUMENT_TYPE: { STRING: 'string', NUMBER: 'number', RANGE: 'range', BOOLEAN: 'boolean', VARIABLE_NAME: 'variable_name', CLOSURE: 'closure', SUBCOMMAND: 'subcommand', LIST: 'list', DICTIONARY: 'dictionary' },
    executeSlashCommandsWithOptions: function(){ return resolve({ interrupt: false, pipe: '', isBreak: false, isAborted: false, isQuietlyAborted: false, abortReason: '', isError: false, errorMessage: '' }); },
    timestampToMoment: function(t){ return new Date(t); },
    registerMacro: noop,
    unregisterMacro: noop,
    registerFunctionTool: noop,
    unregisterFunctionTool: noop,
    isToolCallingSupported: function(){ return false; },
    canPerformToolCalls: function(){ return false; },
    ToolManager: {},
    registerDebugFunction: noop,
    renderExtensionTemplate: function(){ return (typeof window.renderExtensionTemplate === 'function') ? window.renderExtensionTemplate.apply(window, arguments) : ''; },
    renderExtensionTemplateAsync: function(){ return Promise.resolve((typeof window.renderExtensionTemplate === 'function') ? window.renderExtensionTemplate.apply(window, arguments) : ''); },
    registerDataBankScraper: function(){ return resolve(); },
    showLoader: noop,
    hideLoader: function(){ return resolve(); },
    mainApi: {},
    extensionSettings: window.extension_settings,
    ModuleWorkerWrapper: {},
    getTokenizerModel: function(){ return ''; },
    generateQuietPrompt: function(){ return function(){ return resolve(''); }; },
    writeExtensionField: function(){ return resolve(); },
    getThumbnailUrl: function(){ return ''; },
    selectCharacterById: function(){ return resolve(); },
    messageFormatting: function(m, n){ return (typeof window.messageFormatting === 'function') ? window.messageFormatting(m, n) : m; },
    shouldSendOnEnter: function(){ return false; },
    isMobile: function(){ return false; },
    t: function(s){ return Array.isArray(s) ? s.join('') : String(s); },
    translate: function(t){ return t; },
    getCurrentLocale: function(){ return 'zh-cn'; },
    addLocaleData: noop,
    tags: [],
    tagMap: {},
    menuType: {},
    createCharacterData: {},
    Popup: function(){},
    POPUP_TYPE: { TEXT: 0, CONFIRM: 1, INPUT: 2, DISPLAY: 3, CROP: 4 },
    POPUP_RESULT: { AFFIRMATIVE: 0, NEGATIVE: 1, CANCELLED: 2, CUSTOM1: 3, CUSTOM2: 4, CUSTOM3: 5, CUSTOM4: 6, CUSTOM5: 7, CUSTOM6: 8, CUSTOM7: 9, CUSTOM8: 10, CUSTOM9: 11 },
    // 通用弹窗：兼容标准 popup.js（type 数字 + customButtons[]）与酒馆助手
    // （{label,value,isAffirmative} 自定义按钮 + callback(action, jqObj)）两套风格。
    callGenericPopup: function(text, type, inputValue, opts){
      opts = opts || {};
      var dlg = document.createElement('dialog');
      dlg.setAttribute('open', 'open');
      var wide = !!(opts.wide || opts.large || opts.wider);
      var css = 'display:block;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;margin:0;padding:0;border:1px solid #ccc;border-radius:12px;background:#ffffff;color:#222;box-shadow:0 8px 40px rgba(0,0,0,.35);max-height:92vh;max-width:94vw;overflow:auto;';
      if (opts.large) css += 'width:92vw;height:90vh;';
      else if (opts.wide || opts.wider) css += 'width:92vw;';
      else css += 'width:640px;';
      if (opts.allowVerticalScrolling) css += 'overflow-y:auto;';
      if (opts.transparent) css += 'background:transparent;border:0;box-shadow:none;';
      dlg.style.cssText = css;
      var wrap = document.createElement('div');
      wrap.style.cssText = 'padding:18px;box-sizing:border-box;min-height:100px;';
      if (typeof text === 'string') { wrap.innerHTML = text; }
      else if (text && text.nodeType) { wrap.appendChild(text); }
      else if (text && typeof text.appendTo === 'function') { wrap.appendChild(text[0]); }
      else if (text) { wrap.innerHTML = String(text); }
      dlg.appendChild(wrap);
      // 收集自定义按钮（兼容两套格式）
      var custom = [];
      if (Array.isArray(opts.buttons) && opts.buttons.length) custom = opts.buttons.slice();
      else if (Array.isArray(opts.customButtons) && opts.customButtons.length) custom = opts.customButtons.slice();
      var btnBar = document.createElement('div');
      btnBar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:10px 18px 16px;flex-wrap:wrap;';
      function closeWith(action){
        try { dlg.remove(); } catch(e){}
        try { if (opts.callback) opts.callback(action, window.jQuery ? window.jQuery(dlg) : null); } catch(e){}
        return action;
      }
      if (custom.length) {
        custom.forEach(function(b){
          if (typeof b === 'string') b = { text: b };
          var btn = document.createElement('button');
          btn.textContent = b.label || b.text || b.name || '按钮';
          btn.style.cssText = 'padding:8px 20px;border:1px solid #ccc;border-radius:6px;background:#f7f7f7;color:#222;font-size:14px;cursor:pointer;';
          if (b.isAffirmative) btn.style.cssText += 'background:#4f46e5;color:#fff;border-color:#4f46e5;';
          if (b.isNegative) btn.style.cssText += 'background:#e5e7eb;color:#333;';
          btn.onclick = function(){
            if (typeof b.action === 'function') { try { b.action(); } catch(e){} }
            closeWith(b.value !== undefined ? b.value : (b.result !== undefined ? b.result : (b.label || b.text || b.name)));
          };
          btnBar.appendChild(btn);
        });
        dlg.appendChild(btnBar);
      } else if (type === 1 || type === 'confirm') {
        // 默认确认/取消
        var ok = document.createElement('button');
        ok.textContent = '确定'; ok.style.cssText = 'padding:8px 20px;border-radius:6px;background:#4f46e5;color:#fff;border:1px solid #4f46e5;font-size:14px;cursor:pointer;';
        ok.onclick = function(){ closeWith(true); };
        var cancel = document.createElement('button');
        cancel.textContent = '取消'; cancel.style.cssText = 'padding:8px 20px;border-radius:6px;background:#e5e7eb;color:#333;border:1px solid #ccc;font-size:14px;cursor:pointer;';
        cancel.onclick = function(){ closeWith(false); };
        btnBar.appendChild(cancel); btnBar.appendChild(ok);
        dlg.appendChild(btnBar);
      } else {
        // 展示型：默认一个关闭按钮（脚本可自行管理关闭）
        var cls = document.createElement('button');
        cls.textContent = '关闭'; cls.style.cssText = 'display:block;margin:6px auto 4px;padding:8px 26px;border:1px solid #ccc;border-radius:6px;background:#f0f0f0;color:#222;font-size:14px;cursor:pointer;';
        cls.onclick = function(){ closeWith('OK'); };
        dlg.appendChild(cls);
      }
      document.body.appendChild(dlg);
      return resolve(true);
    },
    chatCompletionSettings: {},
    textCompletionSettings: {},
    powerUserSettings: {},
    getCharacters: function(){ return resolve(); },
    getCharacterCardFields: function(){ return {}; },
    uuidv4: function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16); }); },
    humanizedDateTime: function(){ return new Date().toLocaleString(); },
    updateMessageBlock: noop,
    appendMediaToMessage: noop,
    loadWorldInfo: function(){ return resolve(null); },
    saveWorldInfo: function(){ return resolve(); },
    reloadWorldInfoEditor: noop,
    updateWorldInfoList: function(){ return resolve(); },
    convertCharacterBook: function(b){ return { entries: {}, originalData: b || {} }; },
    getWorldInfoPrompt: function(){ return resolve({ worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [] }); },
    CONNECT_API_MAP: {},
    getTextGenServer: function(){ return ''; },
    extractMessageFromData: function(d){ return ''; },
    getPresetManager: function(){ return window.__jskPresetManager; },
    getChatCompletionModel: function(){ return ''; },
    printMessages: function(){ return resolve(); },
    clearChat: function(){ return resolve(); },
    ChatCompletionService: {},
    TextCompletionService: {},
    ConnectionManagerRequestService: {},
    updateReasoningUI: noop,
    parseReasoningFromString: function(){ return null; },
    unshallowCharacter: function(){ return resolve(); },
    unshallowGroupMembers: function(){ return resolve(); },
    symbols: { ignore: null },
    // 兼容旧脚本常用简写
    getContext: function(){ return window.getContext(); },
    refreshChat: function(){ console.log('[SillyTavern.refreshChat]'); },
    renderMessages: function(){ console.log('[SillyTavern.renderMessages]'); },
    getLastMessageId: function(){ return window.getLastMessageId(); },
    getChatMessages: function(r){ return window.getChatMessages(r); },
    ui: {},
    Chat: { document: document }
  };
})());

// 酒馆助手核心 API（全自动总结等依赖 TavernHelper_API）
window.TavernHelper_API = (window.TavernHelper_API || {
  getChatMessages: function(r){ return window.getChatMessages(r); },
  getLastMessageId: function(){ return window.getLastMessageId(); },
  getCurrentCharPrimaryLorebook: function(){ return Promise.resolve(null); },
  createLorebookEntries: function(){ return Promise.resolve(); },
  getLorebookEntries: function(){ return Promise.resolve([]); },
  setLorebookEntries: function(){ return Promise.resolve(); },
  triggerSlash: function(c){ return window.triggerSlash(c); }
});
// 部分脚本以全局 TavernHelper（无 _API 后缀）访问，这里提供同源别名
window.TavernHelper = (window.TavernHelper || window.TavernHelper_API);

// —— toastr（更好的聊天记录管理 / 全自动总结的提示组件）——
window.toastr = (window.toastr || (function(){
  function show(type, msg){ try { console.log('[toastr.' + type + ']', msg); const el = document.createElement('div'); el.textContent = String(msg); el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:999999;padding:8px 16px;border-radius:6px;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5);'; el.style.background = type==='success' ? '#16a34a' : type==='error' ? '#dc2626' : type==='warning' ? '#d97706' : '#3b82f6'; document.body.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(e){} }, 2500); } catch(e){} }
  return { success:function(m){show('success',m);}, error:function(m){show('error',m);}, warning:function(m){show('warning',m);}, info:function(m){show('info',m);}, remove:function(){} };
})());

// —— hljs（扩展 bundle 顶层 y0=hljs.highlightElement 依赖的代码高亮库）——
window.hljs = (window.hljs || (function(){
  function highlightElement(el){ try { if (el && el.classList) el.classList.add('hljs'); } catch(e) {} }
  function highlight(code){ return { value: String(code||'') }; }
  return { highlightElement: highlightElement, highlight: highlight, highlightAll: function(){}, registerLanguage: function(){}, getLanguage: function(){ return undefined; }, listLanguages: function(){ return []; } };
})());

// —— Popper（扩展 bundle 挂载时 Popper.createPopper 依赖的定位库）——
window.Popper = (window.Popper || (function(){
  function createPopper(){ return { state: { placement: 'right-end' }, update: function(){ return Promise.resolve(); }, destroy: function(){} }; }
  return { createPopper: createPopper };
})());

// —— StateManager（statusSystem.js 的状态存储）——
window.StateManager = (window.StateManager || (function(){
  let state = {};
  return {
    getState: function(){ return state; },
    initState: function(s){ state = (s && typeof s === 'object') ? Object.assign({}, s) : {}; return state; },
    saveState: function(){ console.log('[StateManager.saveState]', state); },
    setState: function(k, v){ state[k] = v; }
  };
})());

// —— SlashRunner：兼容 (name, cb, opts) 与对象参数 ({name, description, handler}) 两种签名，
//    并补齐 registerModule / registerHook / showMessage / loadModule / registerMacro，
//    注册命令后渲染可点击的命令面板（让 C 类脚本的状态命令以 UI 呈现）——
window.SlashRunner = (window.SlashRunner || (function(){
  const api = { commands: {}, modules: {}, hooks: {} };
  function normalize(name, cb, opts, desc){
    if (name && typeof name === 'object') { const o = name; return { name: o.name || o.id || 'cmd', desc: o.description || '', cb: o.handler || o.callback || o.action || o.run || function(){}, opts: o.options || o.opts || {} }; }
    if (typeof name === 'string' && typeof cb === 'function') return { name: name, desc: (opts && opts.description) || desc || '', cb: cb, opts: opts || {} };
    return { name: String(name||'cmd'), desc: desc || '', cb: (typeof cb === 'function' ? cb : function(){}), opts: opts || {} };
  }
  function renderPanel(){
    var panel = document.getElementById('jsk-slash-panel');
    var names = Object.keys(api.commands);
    if (!names.length) { if (panel) panel.style.display = 'none'; return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'jsk-slash-panel';
      panel.style.cssText = 'margin:12px 16px;padding:10px;border:1px solid #3f3f46;border-radius:10px;background:#27272a;';
      document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="font-size:12px;color:#a1a1aa;margin-bottom:8px;">⚡ SlashRunner 命令（点击执行）</div>';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    names.forEach(function(n){
      var c = api.commands[n];
      var b = document.createElement('button');
      b.textContent = n;
      b.title = c.description || '';
      b.style.cssText = 'padding:6px 14px;border-radius:8px;background:#3f3f46;color:#e4e4e7;border:1px solid #52525b;font-size:13px;cursor:pointer;';
      b.addEventListener('click', function(){
        try {
          var r = c.cb();
          if (r !== undefined && r !== null) console.log('[SlashRunner]', n, '=>', r);
        } catch(e) { console.error('[SlashRunner]', n, e); }
      });
      row.appendChild(b);
    });
    panel.appendChild(row);
  }
  api.registerCommand = function(name, cb, opts){
    const n = normalize(name, cb, opts);
    api.commands[n.name] = { cb: n.cb, opts: n.opts, description: n.desc };
    try { console.log('[SlashRunner] 注册命令:', n.name); } catch(e) {}
    renderPanel();
    return api;
  };
  api.registerModule = function(name, cb, opts){
    let n = { name: String(name||'module'), init: cb, opts: opts||{} };
    if (name && typeof name === 'object') n = { name: name.name || 'module', init: name.init || name.handler || function(){}, opts: name.options || name.opts || {} };
    api.modules[n.name] = n;
    try { console.log('[SlashRunner] 注册模块:', n.name); } catch(e) {}
    try { n.init && n.init(); } catch(e) { console.error(e); }
    return api;
  };
  api.registerHook = function(name, cb){ api.hooks[name] = cb; try { console.log('[SlashRunner] 注册钩子:', name); } catch(e) {} return api; };
  api.registerMacro = api.registerHook;
  api.loadModule = function(name){ const m = api.modules[name]; if (m) { try { m.init && m.init(); } catch(e) { console.error(e); } } return api; };
  api.showMessage = function(msg, title){
    try { const el = document.createElement('div'); el.style.cssText = 'position:fixed;top:60px;right:12px;z-index:999999;max-width:320px;padding:12px 14px;border-radius:8px;background:#27272a;color:#e4e4e7;font-size:13px;border:1px solid #3f3f46;box-shadow:0 4px 16px rgba(0,0,0,.4);white-space:pre-line;'; el.textContent = (title ? '【' + title + '】\\n' : '') + String(msg); document.body.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(e){} }, 4000); } catch(e){}
    return msg;
  };
  return api;
})());

window.extension_settings = (window.extension_settings || {});
window.saveSettingsDebounced = function(){};
window.getRequestHeaders = function(){ return {}; };

window.power_user = (window.power_user || { forcelocal_mobile: false });
window.chat_metadata = (window.chat_metadata || {});
window.characters = (Array.isArray(window.characters) ? window.characters : [{ name: '角色', avatar: '', mes: '' }]);
window.groups = (window.groups || []);
window.this_chid = (window.this_chid === undefined ? 0 : window.this_chid);
window.online_status = (window.online_status || 'auto');
window.showToast = (window.showToast || function(msg){ try{ console.log('[Toast]', msg); }catch(e){} });
window.CSS = (window.CSS || {});
// userscript GM_* 空实现
['GM_getValue','GM_setValue','GM_deleteValue','GM_addStyle','GM_registerMenuCommand','GM_notification','GM_xmlhttpRequest','GM_listValues'].forEach(function(k){ if (!window[k]) window[k] = function(){ return undefined; }; });
window.GM_info = (window.GM_info || { script: { name: 'userscript' } });
// 内存 localStorage（data: URL 沙箱下原生 localStorage 不可用）
try { localStorage.getItem('__jsk_probe__'); } catch(e) {
  const _s = (${buildMemoryStorage.toString()})();
  Object.defineProperty(window, 'localStorage', { get: function(){ return _s; } });
}

// —— 原生 SlashCommand / SlashCommandParser / MacrosParser / i18n / 通用 utils ——
// 这些是酒馆核心内建 API（脚本 import 自 scripts/slash-commands/*.js、scripts/macros.js、
// scripts/i18n.js、scripts/utils.js），扩展 bundle 与原生扩展普遍依赖。用真实语义实现，
// 避免逐脚本补丁。命令注册后渲染可点击面板，让扩展的命令 UI 在「效果」页可见。
${buildNativeSlashStubs()}

// —— ESM 模块解析器：bundle 重写后的 import 绑定据此从全局取酒馆 API ——
${buildModuleResolver()}
// —— 渲染演示会话消息（此时全部 window 级 API 均已定义；为插件提供 .mes 挂载点，已渲染则不重复）——
try { if (window.__jskRenderDemoMessages) window.__jskRenderDemoMessages(); } catch(e) { console.error('[demo messages]', e); }
`;
}

/**
 * 生成酒馆核心内建 API stub（原生 SlashCommand 系统 / MacrosParser / i18n / utils / world-info）。
 * 这些是酒馆核心脚本（scripts/slash-commands/*.js、scripts/macros.js、scripts/i18n.js、
 * scripts/utils.js、scripts/world-info.js）对外导出的函数与类，被原生扩展 bundle 通过 ESM import 引用。
 * 这里用「真实语义 + 面板渲染」实现，覆盖任意扩展的依赖，避免逐脚本补丁。
 */
function buildNativeSlashStubs() {
    return `
// —— 枚举与常量 ——
window.ARGUMENT_TYPE = { STRING: 'string', NUMBER: 'number', RANGE: 'range', BOOLEAN: 'boolean', VARIABLE_NAME: 'variable_name', CLOSURE: 'closure', SUBCOMMAND: 'subcommand', LIST: 'list', DICTIONARY: 'dictionary' };
window.POPUP_TYPE = { TEXT: 0, CONFIRM: 1, INPUT: 2, DISPLAY: 3, CROP: 4 };
window.regex_placement = [1, 2];
window.extensionTypes = { SlashCommand: 'slash_command' };
window.NOTE_MODULE_NAME = '1_memnote';
window.metadata_keys = { note: 'note' };
window.persona_description_positions = { IN_PROMPT: 0, IN_CHARACTER_DESCRIPTION: 1 };
window.DEFAULT_DEPTH = 4;
window.DEFAULT_WEIGHT = 1;
window.METADATA_KEY = 'world_info';

// —— world-info ——
window.world_info = {};
window.world_names = '';
window.world_info_position = 'after';
window.world_info_logic = 'AND_ANY';
window.wi_anchor_position = 'before_char';
window.world_info_include_names = true;
window.world_info_include_names_entries = {};
window.selected_world_info = [];
window.convertCharacterBook = function(b){ return { entries: {}, originalData: b || {} }; };
window.createNewWorldInfo = function(){ return {}; };
window.deleteWorldInfo = function(){ return Promise.resolve(); };
window.getWorldInfoPrompt = function(){ return Promise.resolve({ worldInfoString: '', worldInfoBefore: '', worldInfoAfter: '', worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [] }); };
window.getWorldInfoSettings = function(){ return {}; };
window.loadWorldInfo = function(){ return Promise.resolve(null); };
window.newWorldInfoEntryTemplate = function(){ return { key: [], keysecondary: [], comment: '', content: '', constant: false, selective: false, order: 100, position: 'before_char', depth: 4, probability: 100, useProbability: false }; };
window.parseRegexFromString = function(s){ return s ? new RegExp(String(s).replace(/^\\//,'').replace(/\\/[a-z]*$/i,'')) : null; };
window.saveWorldInfo = function(){ return Promise.resolve(); };
window.setWorldInfoButtonClass = function(){};
window.shouldWIAddPrompt = function(){ return false; };

// —— utils ——
window.Stopwatch = function(){ this.start = Date.now(); this.stop = function(){ return Date.now() - this.start; }; };
window.delay = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
window.download = function(){};
window.ensureImageFormatSupported = function(){ return Promise.resolve(); };
window.getBase64Async = function(){ return Promise.resolve(''); };
window.getCharaFilename = function(){ return ''; };
window.getImageSizeFromDataURL = function(){ return Promise.resolve({ width: 0, height: 0 }); };
window.getSanitizedFilename = function(s){ return String(s||'').replace(/[\\\\/:*?"<>|]/g, '_'); };
window.getStringHash = function(s){ let h = 0; s = String(s||''); for (let i=0;i<s.length;i++){ h = ((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); };
window.isDataURL = function(s){ return /^data:/i.test(String(s||'')); };
window.showFontAwesomePicker = function(){ return Promise.resolve(''); };
window.uuidv4 = function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){ var r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16); }); };
window.downloadJson = window.download;

// —— i18n ——
window.getCurrentLocale = function(){ return 'zh-cn'; };
window.i18n_data = {};
window.t = function(s){ return Array.isArray(s) ? s.join('') : String(s); };
window.translate = function(t){ return t; };

// —— 原生 SlashCommand 系统（真实语义 + 可点击命令面板）——
// SlashCommand / SlashCommandArgument / SlashCommandNamedArgument / SlashCommandEnumValue 均支持
// 静态 fromProps(...) 工厂（真实酒馆签名），解析器 SlashCommandParser 提供 .parse()。
window.SlashCommand = (function(){
  function C(props){ props = props || {}; this.name = props.name || ''; this.description = props.description || ''; this.callback = props.callback || props.handler || function(){}; this.helpString = props.helpString || ''; this.unnamedArgumentList = props.unnamedArgumentList || []; this.namedArgumentList = props.namedArgumentList || []; this.returns = props.returns; this.category = props.category;
    // 补齐真实酒馆 SlashCommand 全字段（SlashCommand.js）：
    this.splitUnnamedArgument = !!props.splitUnnamedArgument;                 // 是否把剩余未命名参数整串交给回调
    this.splitUnnamedArgumentCount = props.splitUnnamedArgumentCount || 0;     // 前 N 个 token 单独解析，其余整串
    this.rawQuotes = !!props.rawQuotes;                                        // 保留参数原始引号
    this.aliases = (props.aliases && props.aliases.slice) ? props.aliases.slice() : (props.aliases || []); // 命令别名
    this.helpCache = null;
    this.helpDetailsCache = null;
  }
  C.fromProps = function(p){ return Object.assign(new C(p), p || {}); };
  return C;
})();
window.SlashCommandArgument = (function(){
  function A(name, description, typeList, isRequired, defaultValue, enumList, unnamedArgumentList){ this.name = name || ''; this.description = description || ''; this.typeList = typeList || []; this.isRequired = !!isRequired; this.defaultValue = defaultValue; this.enumList = enumList || []; this.unnamedArgumentList = unnamedArgumentList || []; }
  A.fromProps = function(p){ return new A(p.name, p.description, p.typeList, p.isRequired, p.defaultValue, p.enumList); };
  return A;
})();
window.SlashCommandNamedArgument = (function(){
  function N(name, description, typeList, isRequired, defaultValue, enumList){ this.name = name || ''; this.description = description || ''; this.typeList = typeList || []; this.isRequired = !!isRequired; this.defaultValue = defaultValue; this.enumList = enumList || []; }
  N.fromProps = function(p){ return new N(p.name, p.description, p.typeList, p.isRequired, p.defaultValue, p.enumList); };
  return N;
})();
window.enumTypes = { enum: 'enum', list: 'list' };
window.enumIcons = { file: 'fa-file', string: 'fa-font' };
window.SlashCommandEnumValue = (function(){
  function E(value, description, type, icon){ this.value = value; this.description = description || ''; this.type = type || 'enum'; this.icon = icon; }
  E.fromProps = function(p){ return new E(p.value, p.description, p.type, p.icon); };
  return E;
})();
// commonEnumProviders.<provider>(optionId) 返回一个「枚举 provider 函数」，该函数被调用后
// 返回枚举值数组（真实酒馆 SlashCommandCommonEnumsProvider.js 语义，bundle 常写
// commonEnumProviders.boolean('trueFalse')() 这种链式调用）。这里统一返回返回 [] 的函数。
window.commonEnumProviders = (function(){
  function provider(){ return []; }
  function makeProvider(){ return provider; }
  return new Proxy({}, {
    get: function(_t, key){
      if (typeof key === 'symbol') return undefined;
      // 未声明过的 provider 名也返回 makeProvider，覆盖 bundle 可能引用的任意枚举 provider
      return makeProvider;
    }
  });
})();
window.SlashCommandParser = {
  commands: {},
  register: function(cmd){ if (cmd && cmd.name) this.commands[cmd.name] = cmd; },
  get commandHelp(){ return ''; },
  // 最小真实解析器（对齐真实酒馆 SlashCommandParser.parse 的消费约定）：
  // 首 token 为命令名（容忍前导 /），剩余按「空格分词 + 双/单引号包裹的带空值保留 + name=value 命名参数」解析。
  parse: function(text){
    return parseSlashCommandPure(text, this.commands);
  },
  addCommandObject: function(cmd){
    if (cmd && cmd.name) { this.commands[cmd.name] = cmd; this.render(); }
    return cmd;
  },
  render: function(){
    try {
      const names = Object.keys(this.commands);
      let panel = document.getElementById('jsk-native-slash-panel');
      if (!names.length) { if (panel) panel.style.display = 'none'; return; }
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'jsk-native-slash-panel';
        panel.style.cssText = 'margin:12px 16px;padding:10px;border:1px solid #3f3f46;border-radius:10px;background:#27272a;';
        document.body.appendChild(panel);
      }
      panel.style.display = 'block';
      panel.innerHTML = '<div style="font-size:12px;color:#a1a1aa;margin-bottom:8px;">⚡ Slash 命令（点击执行）</div>';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
      names.forEach(function(n){
        const c = window.SlashCommandParser.commands[n];
        const b = document.createElement('button');
        b.textContent = '/' + n;
        b.title = c.description || '';
        b.style.cssText = 'padding:6px 14px;border-radius:8px;background:#3f3f46;color:#e4e4e7;border:1px solid #52525b;font-size:13px;cursor:pointer;';
        b.addEventListener('click', function(){ try { const r = c.callback({}); console.log('[slash]', n, r); } catch(e){ console.error(e); } });
        row.appendChild(b);
      });
      panel.appendChild(row);
    } catch(e) { console.error('[SlashCommandParser.render]', e); }
  }
};
window.executeSlashCommandsWithOptions = function(){ return Promise.resolve({ interrupt: false, pipe: '', isBreak: false, isAborted: false, isQuietlyAborted: false, abortReason: '', isError: false, errorMessage: '' }); };

// —— MacrosParser（真实宏注册语义，无实际替换）——
window.MacrosParser = {
  macros: {},
  register: function(name, cb){ this.macros[name] = cb; },
  registerMacro: function(name, cb){ this.macros[name] = cb; },
  unregisterMacro: function(name){ delete this.macros[name]; },
  parse: function(text){ return text; }
};
window.registerMacro = function(name, cb){ window.MacrosParser.register(name, cb); };
window.unregisterMacro = function(name){ delete window.MacrosParser.macros[name]; };
window.getLastMessageId = function(){ return window.__jskChat ? window.__jskChat.length - 1 : -1; };

// —— 通用工具（其他脚本常见 import）——
window.delay = window.delay || function(ms){ return new Promise(r=>setTimeout(r,ms)); };
window.getRequestHeaders = function(){ return { 'Content-Type': 'application/json' }; };
window.saveMetadataDebounced = function(){};
window.saveSettingsDebounced = function(){};
window.getPresetManager = function(){ return window.__jskPresetManager; };
window.getEventSourceStream = function(){ return null; };
window.isImageInliningSupported = function(){ return false; };
window.getUserAvatar = function(){ return ''; };
window.getUserAvatars = function(){ return []; };
window.setUserAvatar = function(){ return Promise.resolve(); };
window.user_avatar = '';
window.isAdmin = function(){ return true; };
window.favsToHotswap = function(){};
window.isMobile = function(){ return false; };
window.flushEphemeralStoppingStrings = function(){};
window.getRegexedString = function(s){ return s; };
window.countOccurrences = function(){ return 0; };
window.isOdd = function(n){ return n % 2 !== 0; };
window.getTokenCountAsync = function(){ return Promise.resolve(0); };
window.getTextTokens = function(){ return Promise.resolve(0); };
window.cleanUpMessage = function(){ return Promise.resolve(); };
window.getBiasStrings = function(){ return []; };
window.getExtensionPromptByName = function(){ return null; };
window.getExtensionPromptRoleByName = function(){ return null; };
window.extension_prompts = {};
window.extension_prompt_types = {};
window.extension_prompt_roles = {};
// preset-manager 实例：bundle 调用 getPresetManager().getPresetList()/getSelectedPreset()/
// getSelectedPresetName()/setSelectedPreset()。这里返回空预设列表，selectedPreset 指向空对象。
window.__jskPresetManager = {
  getPresetList: function(){ return { presets: [] }; },
  getSelectedPreset: function(){ return {}; },
  getSelectedPresetName: function(){ return ''; },
  setSelectedPreset: function(){ return Promise.resolve(); },
  saveSole: function(){ return Promise.resolve(); },
  getAllPresets: function(){ return []; }
};
window.reloadMarkdownProcessor = function(){ return window.__jskMarkdown; };
window.__jskMarkdown = (function(){
  // 真实 Showdown 转换器（showdown.min.js 已在宿主注入，window.showdown 可用）
  var converter = null;
  function getConverter(){
    if (!converter && window.showdown && window.showdown.Converter) {
      try {
        converter = new window.showdown.Converter({
          tables: true, strikethrough: true, tasklists: true, emoji: true,
          openLinksInNewWindow: true, simplifiedAutoLink: true
        });
      } catch(e) { console.error('[showdown init]', e); }
    }
    return converter;
  }
  function makeHtml(md){
    var c = getConverter();
    var s = String(md == null ? '' : md);
    if (!c) return s;
    try { return c.makeHtml(s); } catch(e) { return s; }
  }
  function render(md){ return makeHtml(md); }
  return { makeHtml: makeHtml, render: render, inline: function(md){ return makeHtml(md); }, use: function(){ return window.__jskMarkdown; } };
})();
window.saveCharacterDebounced = function(){};
window.saveChatConditional = function(){ return Promise.resolve(); };
window.setGenerationProgress = function(){};
window.setUserName = function(){};
window.showSwipeButtons = function(){};
window.stopGeneration = function(){ return false; };
window.unshallowCharacter = function(){ return Promise.resolve(); };
window.system_avatar = '';
window.system_message_types = {};
window.default_avatar = '';
window.default_user_avatar = '';
window.online_status = 'auto';
window.main_api = {};
window.getMaxContextSize = function(){ return 8192; };
window.getOneCharacter = function(){ return {}; };
window.getPastCharacterChats = function(){ return []; };
window.printCharacters = function(){};
window.printMessages = function(){};
window.reloadCurrentChat = function(){ return Promise.resolve(); };
window.baseChatReplace = function(){};
window.activateSendButtons = function(){};
window.deactivateSendButtons = function(){};
window.deleteCharacter = function(){ return Promise.resolve(); };
window.extension_settings = window.extension_settings || {};
// —— 宏替换（同步 string→string，对齐真实酒馆 substituteParams 的同步语义；未知宏原样保留）——
window.__jskSubstituteParams = function(mes, chName){
  var s = String(mes == null ? '' : mes);
  var n = String(chName || '角色');
  try {
    s = s.split('{{user}}').join('User').split('{{char}}').join(n)
      .split('{{name1}}').join('User').split('{{name2}}').join(n)
      .split('{{original}}').join('')
      .split('{{newline}}').join('\n').split('{{lf}}').join('\n')
      .split('{{time}}').join(new Date().toLocaleTimeString());
  } catch(e) {}
  return s;
};
// —— 简化 messageFormatting：宏替换 → 引号样式化(<q>) → Showdown.makeHtml（对齐真实管线第 1/5/6 步）——
window.messageFormatting = function(mes, chName){
  var s = (typeof window.__jskSubstituteParams === 'function')
    ? window.__jskSubstituteParams(mes, chName)
    : String(mes == null ? '' : mes);
  // 引号样式化：中文双引号/书名号内容包 <q>（跳过已含 HTML 标签的行，避免破坏结构）
  try {
    s = s.replace(/“([^”\n]{1,80})”/g, '<q>$1</q>');
    s = s.replace(/《([^》\n]{1,40})》/g, '<q>$1</q>');
  } catch(e) {}
  var html = (window.__jskMarkdown && window.__jskMarkdown.makeHtml) ? window.__jskMarkdown.makeHtml(s) : s;
  return html;
};
window.scrollChatToBottom = function(){};
window.SelectCharacterById = window.selectCharacterById = function(){ return Promise.resolve(); };
window.saveSettings = function(){ return Promise.resolve(); };
window.saveMetadata = function(){ return Promise.resolve(); };
window.addOneMessage = function(mes, opts){
  var template = document.getElementById('message_template');
  var chat = document.getElementById('chat');
  if (!template || !chat) return window.jQuery ? window.jQuery('<div>') : document.createElement('div');
  var node = template.querySelector('.mes').cloneNode(true);
  var isUser = !!(mes && mes.is_user);
  var isSys = !!(mes && mes.is_system);
  var name = (mes && mes.name) || (isUser ? 'User' : '角色');
  var text = (mes && (mes.mes || mes.text)) || '';
  var img = node.querySelector('.avatar img');
  if (img) { img.alt = name; img.src = (isUser ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="%234f46e5" rx="22"/><text x="22" y="29" font-size="18" fill="white" text-anchor="middle">U</text></svg>' : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="%238b5cf6" rx="22"/><text x="22" y="29" font-size="18" fill="white" text-anchor="middle">C</text></svg>'); }
  var nameEl = node.querySelector('.name_text'); if (nameEl) nameEl.textContent = name;
  var ts = node.querySelector('.timestamp'); if (ts) ts.textContent = (mes && mes.send_date) ? new Date(mes.send_date).toLocaleString() : '';
  var mid = node.querySelector('.mesIDDisplay'); if (mid && mes && mes.id != null) mid.textContent = '#' + mes.id;
  var body = node.querySelector('.mes_text');
  if (body) body.innerHTML = (typeof window.messageFormatting === 'function') ? window.messageFormatting(text, name) : text;
  node.setAttribute('mesid', (mes && mes.id != null) ? String(mes.id) : String((window.__jskChat ? window.__jskChat.length : 0)));
  node.setAttribute('is_user', isUser ? 'true' : 'false');
  node.setAttribute('is_system', isSys ? 'true' : 'false');
  if (isSys) node.style.borderStyle = 'dashed';
  else if (isUser) node.style.background = '#27272a';
  if (opts && opts.insertAfter && opts.insertAfter.parentNode) opts.insertAfter.parentNode.insertBefore(node, opts.insertAfter.nextSibling);
  else if (opts && opts.insertBefore && chat) chat.insertBefore(node, opts.insertBefore);
  else if (chat) chat.appendChild(node);
  return window.jQuery ? window.jQuery(node) : node;
};
// —— 渲染演示会话到 .mes 消息块（已渲染则不重复；为插件提供真实挂载点）——
window.__jskRenderDemoMessages = function(){
  try {
    var chat = document.getElementById('chat');
    if (!chat || chat.querySelector('.mes')) return;
    (window.__jskChat || []).forEach(function(m, i){ m.id = i; window.addOneMessage(m, {}); });
    chat.setAttribute('data-demo-rendered', '1');
  } catch(e) { console.error('[__jskRenderDemoMessages]', e); }
};
window.clearChat = function(){ return Promise.resolve(); };
window.characters = (Array.isArray(window.characters) ? window.characters : [{ name: '角色', avatar: '', mes: '' }]);
window.chat = window.__jskChat || [];
window.chat_metadata = window.chat_metadata || {};
window.this_chid = window.this_chid === undefined ? 0 : window.this_chid;
window.is_send_press = false;
window.name1 = 'User';
window.name2 = '角色';
window.getCurrentChatId = function(){ return 'demo'; };
window.getCharacters = function(){ return []; };
window.getCharacterCardFields = function(){ return {}; };
window.power_user = window.power_user || { forcelocal_mobile: false };

// —— jsoneditor（bundle import ../lib/jsoneditor.js，提供 Mode / ValidationSeverity / createJSONEditor）——
window.Mode = { code: 'code', tree: 'tree', text: 'text', view: 'view', form: 'form' };
window.ValidationSeverity = { error: 'error', warning: 'warning', info: 'info' };
window.createJSONEditor = function(){ return { destroy: function(){}, get: function(){ return {}; }, set: function(){} }; };

// —— PromptManager / openai（Prompt / PromptCollection / Message / ChatCompletion 等类）——
window.Prompt = function(){};
window.PromptCollection = function(){};
window.Message = function(){};
window.MessageCollection = function(){};
window.ChatCompletion = function(){};
window.getChatCompletionModel = function(){ return ''; };
window.getStreamingReply = function(){ return Promise.resolve(''); };
window.oai_settings = {};
window.prepareOpenAIMessages = function(){ return []; };
window.promptManager = {};
window.proxies = {};
window.sendOpenAIRequest = function(){ return Promise.resolve({}); };
window.setOpenAIMessageExamples = function(){};
window.setOpenAIMessages = function(){};
window.setupChatCompletionPromptManager = function(){};
window.tryParseStreamingError = function(){ return null; };
window.generate = function(){ return Promise.resolve(); };
window.MAX_INJECTION_DEPTH = 4;
window.Generate = { parse: function(){ return {}; } };

// —— 顶层别名：确保 bundle import 的每个名字都能在 window 上解析 ——
window.event_types = window.tavern_events || window.event_types;
window.eventTypes = window.event_types;
window.substituteParams = function(c){ return Promise.resolve(c); };
window.substituteParamsExtended = function(c){ return Promise.resolve(c); };
window.setExtensionPrompt = function(){ return Promise.resolve(); };
window.getThumbnailUrl = function(){ return ''; };
window.callGenericPopup = function(text, type, inputValue, opts){
  return (window.SillyTavern && window.SillyTavern.callGenericPopup) ? window.SillyTavern.callGenericPopup(text, type, inputValue, opts) : Promise.resolve(true);
};
window.getLastMessageId = function(){ return window.__jskChat ? window.__jskChat.length - 1 : -1; };
`;
}

/**
 * 生成 ESM 模块解析器（module resolver）。
 * 扩展 bundle 被 rewriteEsmModule 重写为 <script type="module"> 后，其 import 语句会变成
 * import 绑定名 from 一个统一的「万能模块」标识符，由 import map（JSON 脚本）映射到 data: 模块。
 * 该模块的动态导出让任意绑定名都能从全局取到对应 API，从而覆盖所有酒馆内建模块的命名导出。
 * 配合 buildNativeSlashStubs / buildGlobalStubs 已在 window 上铺好的 API 层，实现「任意扩展可加载」。
 */
function buildModuleResolver() {
    return `
// —— ESM 模块解析器（万能命名空间）——
// 扩展 bundle 的静态 import 已被 rewriteEsmModule 内联为 var 声明（从 window 取酒馆 API），
// 这里为 import.meta 与动态 import() 提供沙箱内可运行的等价实现。
// default / star import 的兜底值也在此提供。
// ⚠️ import.meta.url 必须是合法 URL：bundle 常写 new URL("../", import.meta.url) 或
//    String(import.meta.url).includes("/dist/")，空串会让 new URL("../", "") 抛 TypeError。
//    这里给一个含 /dist/ 的 file: 基址，保证 new URL 解析始终合法（对任意 bundle 通用）。
window.__jskMeta = { url: 'file:///plugin/dist/bundle.js', resolve: function(s){ return s; } };
window.__jskModuleExports = (function(){
  const NOOP = function(){ return undefined; };
  function resolve(name){
    if (name in window) return window[name];
    if (window.SillyTavern && name in window.SillyTavern) return window.SillyTavern[name];
    if (window.SlashRunner && name in window.SlashRunner) return window.SlashRunner[name];
    return NOOP;
  }
  const ns = new Proxy({}, {
    get: function(_, prop){
      if (prop === Symbol.toStringTag) return 'Module';
      if (prop === 'default') return ns;
      return resolve(prop);
    }
  });
  return ns;
})();
window.__jskResolveModule = function(specifier){
  // 动态 import() 语义：必须返回 Promise（bundle 常写 await import('x').catch(...)），
  // 返回解析为「万能命名空间」的 Promise，兼容 await x / await x.catch() 两种用法。
  return Promise.resolve(window.__jskModuleExports);
};`;
}

/**
 * 把扩展 bundle 的 ESM 源码重写为可在沙箱 <script type="module"> 内运行的形式。
 * 通用策略（不针对具体脚本）：
 *   1. 静态 named import `import{a as b, c}from"x"` → 内联解构 `var{a:b,c}=window.__jskModuleExports;`。
 *      ESM 的 named import 必须静态导出，Proxy 命名空间无法被静态 import 消费，故改为解构取值：
 *      从全局命名空间 Proxy（buildModuleResolver 提供）按导出名取 API，赋给本地别名（语义等价）。
 *   2. 静态 default import / star import → `var X=window.__jskModuleExports;`。
 *   3. 动态 import('...') → `__jskResolveModule('...')`，同步返回命名空间。
 *   4. import.meta → `window.__jskMeta`（无 url 的假对象）。
 *   5. export{...} → 移除；export default → 落到 window.__jskPluginDefault 供宿主观察。
 * 该重写对 minified 单行 import 同样有效（正则以 `[\\s\\S]` 非贪婪匹配，无需换行锚定）。
 * @param {string} src bundle 源码
 * @returns {string} 重写后的 ESM 源码
 */
function rewriteEsmModule(src) {
    return rewriteEsmModulePure(src);
}

/** 生成酒馆宿主 DOM 骨架（#chat / .options-content / #extensions_settings 等插件常用挂载点） */
function buildHostDom() {
    return `
<div id="chat" style="position:relative; min-height:100%; padding:16px; box-sizing:border-box;">
  <div id="chat-history" style="min-height:120px;"></div>
</div>
<div id="sheld" style="display:none;"></div>
<div id="options" class="options-content" style="position:relative; min-height:40px; padding:8px;">
  <hr>
</div>
<div id="right-nav-panel" style="position:relative;"></div>
<div id="send_form" style="position:relative; min-height:40px; padding:8px;"></div>
<div id="extensions_settings" style="position:relative; min-height:40px; padding:8px;"></div>
<div id="extensionsMenu" style="position:fixed; top:44px; left:12px; z-index:90000; display:flex; flex-direction:column; gap:4px;"></div>
<button id="extensionsMenuButton" style="display:none;"></button>
<!-- #message_template：真实酒馆的消息克隆模板（script.js 用 $('#message_template .mes').clone() 生成每条消息）-->
<div id="message_template" style="display:none;">
  <div class="mes" style="display:flex; gap:12px; margin:0 0 16px; padding:10px 12px; border-radius:12px; background:#202024; border:1px solid #3f3f46;">
    <div class="avatar" style="flex-shrink:0; width:44px; height:44px; border-radius:50%; overflow:hidden; background:#3f3f46;">
      <img alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
    <div style="flex:1; min-width:0;">
      <div class="mes_header" style="display:flex; align-items:baseline; gap:8px; margin-bottom:4px;">
        <span class="ch_name"><span class="name_text" style="font-weight:700; color:#e4e4e7;"></span></span>
        <span class="timestamp" style="font-size:11px; color:#71717a;"></span>
        <span class="mesIDDisplay" style="font-size:10px; color:#52525b;"></span>
      </div>
      <div class="mes_text" style="color:#d4d4d8; font-size:14px; line-height:1.6; overflow-wrap:break-word;"></div>
    </div>
  </div>
</div>`;
}

/**
 * 构建插件效果的沙箱 iframe HTML（srcdoc 主体，不含 <!DOCTYPE>/<html>/<head> 外壳）
 * @param {object} plugin 归一化后的 plugin 模型
 * @param {object} opts
 * @param {string[]} opts.bundleJs  扩展工程 bundle js 源码（按顺序内联注入）
 * @param {string[]} opts.bundleCss 扩展工程 css 源码（内联注入 <style>）
 * @returns {string} 完整可用的 HTML 字符串
 */
export function buildPluginPreviewHtml(plugin, opts = {}) {
    const bundleJs = opts.bundleJs || [];
    const bundleCss = opts.bundleCss || [];
    const templates = opts.templates || {}; // 扩展工程 html 模板映射 { 相对路径: 内容 }
    // JSON 序列化时转义 '<'，防模板内容里的 </script> 提前终止注入块
    const templatesJson = JSON.stringify(templates).replace(/</g, '\\u003c');

    const inlineScripts = []; // 需要注入的 JS 源码块
    const styles = [];        // 需要注入的 CSS 文本
    const isExtension = plugin.kind === 'extension';

    if (isExtension) {
        // 扩展工程：内联 manifest 入口 bundle + css
        for (const css of bundleCss) styles.push(css);
        for (const js of bundleJs) inlineScripts.push(js);
    } else {
        // 酒馆助手 / userscript / SlashRunner：内联 scripts[].content
        for (const s of (plugin.scripts || [])) {
            if (s.content) inlineScripts.push(s.content);
        }
    }

    const cssBlock = styles.map(c => `<style>${c}</style>`).join('\n');
    const scriptBlocks = inlineScripts.map(src => {
        // 剥离 userscript 头（// ==UserScript== ... // ==/UserScript==）避免注释干扰（实际无害，但保持干净）
        let cleaned = src.replace(/^[\s\S]*?==\/UserScript==\s*/i, '');
        // 脚本内 </script> 提前终止风险：替换为转义形式
        cleaned = cleaned.replace(/<\/script>/gi, '<\\/script>');
        if (isExtension) {
            // 扩展 bundle 是 minified ESM：重写 import/export 为沙箱可运行形式，
            // 用 <script type="module"> 注入以支持顶层 await（如 bundle 内 fetch('/version')）。
            cleaned = rewriteEsmModule(cleaned);
            return `<script type="module">\n${cleaned}\n</script>`;
        }
        // 其他脚本：剥离 ESM 语法（import / export）后用普通 <script> 注入，
        // 避免内联 <script> 报 Unexpected token 'export'
        cleaned = stripEsmSyntax(cleaned);
        return `<script>\n${cleaned}\n</script>`;
    }).join('\n');

    // ESM 插件（如 statusSystem.js 的 export default {...}）剥离后落在 window.__jskPluginDefault，
    // 这里自动触发其 install()，让命令 / 模块得以注册。
    // 扩展 bundle 用 <script type="module">（deferred），故 bootstrap 也须用 module 以保证在其后执行；
    // 普通脚本为同步执行，bootstrap 保持普通 <script> 紧随其后即可。
    const bootstrapTag = isExtension ? 'script type="module"' : 'script';
    const bootstrapBlock = `<${bootstrapTag}>
try {
  if (window.__jskPluginDefault && typeof window.__jskPluginDefault.install === 'function') {
    window.__jskPluginDefault.install();
  }
} catch(e) { console.error('[plugin bootstrap]', e); }
// 若插件只注册了 SlashRunner 命令（无 UI），自动演示第一条命令，保证「效果」页有反馈
try {
  const names = Object.keys((window.SlashRunner && window.SlashRunner.commands) || {});
  if (names.length && !document.querySelector('#chat *')) {
    const first = window.SlashRunner.commands[names[0]];
    const r = first && first.cb ? first.cb() : undefined;
    if (r !== undefined && r !== null) console.log('[SlashRunner 演示]', names[0], r);
  }
} catch(e) { console.error(e); }
// 自动演示扩展菜单项：轮询查找脚本注入的菜单项并触发点击，让弹窗/面板自动展开，
// 使「效果」页第一眼就能看到真实 UI（如圆形颜色按钮 + 白底弹窗），而非仅一行文字菜单。
try {
  var __jskDemoTries = 0;
  var __jskDemoTimer = setInterval(function(){
    __jskDemoTries++;
    var item = document.querySelector('#extensionsMenu [id$="-menu-item"], #extensionsMenu .list-group-item, #extensionsMenu [class*="menu-item"]');
    if (item) {
      clearInterval(__jskDemoTimer);
      try { item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
      catch(e2) { try { item.click(); } catch(e3) {} }
      // 桌面应用内诊断：点击菜单项后延迟检测弹窗/圆形按钮，把结果打到 renderer 日志
      setTimeout(function(){
        try {
          var dlg = document.querySelector('dialog[open]');
          var circular = dlg ? Array.prototype.filter.call(dlg.querySelectorAll('*'), function(el){ try { return getComputedStyle(el).borderRadius === '50%'; } catch(e){ return false; } }).length : 0;
          console.log('[效果诊断] 弹窗打开=' + !!dlg + ' | 圆形按钮=' + circular + ' | 弹窗背景=' + (dlg ? getComputedStyle(dlg).backgroundColor : '无'));
        } catch(e) { console.error('[效果诊断]', e); }
      }, 900);
    } else if (__jskDemoTries > 25) {
      clearInterval(__jskDemoTimer);
      console.log('[效果诊断] 未找到可点击的扩展菜单项');
    }
  }, 200);
} catch(e) { console.error(e); }
</script>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{width:100%;height:100%;margin:0;background:#18181b;color:#e4e4e7;font-family:system-ui,-apple-system,sans-serif;overflow:auto;}
#host-banner{position:sticky;top:0;z-index:99999;padding:4px 12px;font-size:11px;background:#27272a;border-bottom:1px solid #3f3f46;color:#a1a1aa;}
/* 酒馆风格扩展菜单项：让脚本注入的菜单/按钮具备可见外观（真实酒馆由 list-group-item 等 class 提供） */
#extensionsMenu{display:flex;flex-direction:column;gap:4px;}
#extensionsMenu .extension_container,
#extensionsMenu .list-group-item,
#extensionsMenu [class*="menu-item"]{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:#2b2b31;color:#e4e4e7;font-size:12px;cursor:pointer;border:1px solid #3f3f46;transition:background .15s,border-color .15s;white-space:nowrap;}
#extensionsMenu .list-group-item:hover,
#extensionsMenu [class*="menu-item"]:hover{background:#3f3f46;border-color:#8b5cf6;}
#extensionsMenu .extensionsMenuExtensionButton{width:14px;text-align:center;color:#a78bfa;}
</style>
${cssBlock}
</head>
<body>
<div id="host-banner">🧩 酒馆运行模拟 · 插件: ${escapeHtml(plugin.name || '未命名')}${plugin.kind === 'extension' ? ' (扩展工程)' : ''}</div>
${buildHostDom()}
<script>
window.__jskHost = true;
</script>
<script>${buildMiniJquery()}</script>
<script>${lodashSource}</script>
<script>${handlebarsSource}</script>
<script>${showdownSource}</script>
<script>window.__jskTemplates = ${templatesJson};</script>
<script>${buildEventSourceStub()}</script>
<script>${buildGlobalStubs(plugin)}</script>
${scriptBlocks}
${bootstrapBlock}
<script>
// 效果就绪信号：宿主桩加载完脚本后，把 #chat 内是否产生内容回传到 banner
try {
  setTimeout(function(){
    const chat = document.getElementById('chat');
    const kids = chat ? chat.querySelectorAll('*').length : 0;
    const banner = document.getElementById('host-banner');
    if (banner) banner.textContent += ' · 已注入 ' + ${inlineScripts.length} + ' 个脚本 · #chat 节点 ' + kids + ' 个';
  }, 300);
} catch(e){}
</script>
</body>
</html>`;
}

/** 剥离 ESM 语法（import / export），供内联 <script> 注入使用 */
function stripEsmSyntax(src) {
    return stripEsmSyntaxPure(src);
}

/** HTML 转义（插件名等注入到标签间时防破坏结构） */
function escapeHtml(s) {
    return escapeHtmlPure(s);
}
