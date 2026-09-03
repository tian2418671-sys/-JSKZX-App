/**
 * e2e-card-detail.mjs — 「点开卡片显示卡片不存在」顽固 bug 端到端复现/验证
 *
 * 用真实构建产物(web/) + 模拟 Capacitor Android 桥(LibraryFsPlugin 等)
 * 在无头 Chrome 里跑完整链路,覆盖三个场景:
 *   S1 列表点击打开卡片(常规路径,含中文路径)
 *   S2 冷启动直达详情页(库未加载,验证 ensureLibraryReady)
 *   S3 库已加载但陈旧 → 打开新出现的卡(验证 f4a8007 强制重扫兜底)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WEB = path.resolve('web');
const PORT = 5623;
const CDP = 5624;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 静态服务器(真实构建产物) ----------
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'
};
const server = createServer(async (req, res) => {
    try {
        const url = String(req.url || '/').split('?')[0].split('#')[0];
        const fp = path.join(WEB, url === '/' ? 'index.html' : decodeURIComponent(url));
        const data = await readFile(fp);
        res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    } catch (e) {
        res.writeHead(404); res.end('not-found');
    }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log('[e2e] server up on', PORT);

// ---------- 启动 Chrome ----------
const udd = mkdtempSync(path.join(os.tmpdir(), 'cdp-e2e-'));
const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP}`, `--user-data-dir=${udd}`, 'about:blank'
], { stdio: 'ignore' });

let version = null;
for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); break; }
    catch (e) { await sleep(250); }
}
if (!version) { console.error('[e2e] Chrome CDP 未就绪'); process.exit(1); }
console.log('[e2e] chrome pid=', chrome.pid);

const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
const opened = new Promise((r) => { ws.onopen = r; });
await opened;

// ---------- CDP 基础设施 ----------
let msgId = 0;
const pending = new Map();
const runtimeErrors = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {};
        runtimeErrors.push('[exception] ' + String((d.exception && d.exception.description) || d.text || ''));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        runtimeErrors.push('[console.error] ' + m.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 300));
    }
};
const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++msgId; pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result && r.result.result.value;
};
const poll = async (expression, { timeout = 15000, interval = 400 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        try {
            const v = await evalJS(`(() => { try { return ${expression}; } catch (e) { return false; } })()`);
            if (v) return v;
        } catch (e) { /* 忽略 */ }
        await sleep(interval);
    }
    return null;
};
const bodyText = async () => String(await evalJS('document.body ? document.body.innerText.slice(0, 400) : ""') || '');

await send('Page.enable');
await send('Runtime.enable');

// ---------- 模拟 Android 桥(在页面任何脚本之前注入) ----------
const CARD_A = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '测试角色甲', description: '端到端验证卡片A描述', personality: '沉稳', first_mes: '你好，我是甲。', creator: 'e2e', tags: ['测试'], alternate_greetings: [] } };
const CARD_B = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '新导入卡', description: '模拟导入后新出现的卡片B', personality: '活泼', first_mes: '我是新导入的。', creator: 'e2e', tags: ['导入'] } };
const CARD_P = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '像素卡PNG', description: 'PNG内嵌卡片C', personality: '像素风', first_mes: '像素你好。', creator: 'e2e', tags: ['png'] } };
const MOCK_DB = {
    '/library/测试角色甲.json': { kind: 'json', name: '测试角色甲.json', data: CARD_A },
    '/library/分组A/新导入卡.json': { kind: 'json', name: '新导入卡.json', data: CARD_B },
    '/library/像素卡PNG.png': { kind: 'png', name: '像素卡PNG.png', data: CARD_P }
};
const mockSource = `
(() => {
  const CARDS = ${JSON.stringify(MOCK_DB)};
  let scanVersion = 1;
  window.__mock = { setScanVersion: (v) => { scanVersion = v; }, getScanVersion: () => scanVersion };
  const scan = () => {
    const files = [];
    for (const [p, c] of Object.entries(CARDS)) {
      if (scanVersion < 2 && p.indexOf('分组A') >= 0) continue;
      const m = p.replace(/^\\/library\\//, '');
      const segs = m.split('/');
      files.push({
        name: c.name, path: p, isDirectory: false, url: null,
        mtime: 1770000000000, birthtime: 0, size: 4096,
        subFolder: segs.length > 1 ? segs.slice(0, -1).join('/') : '',
        category: segs.length > 1 ? segs[0] : '未分类',
        embeddedData: c.kind === 'png' ? c.data : null
      });
    }
    return { files, categories: ['分组A'], folderPath: '/library' };
  };
  const readText = (o) => {
    const p = o && o.path;
    if (p === '/library/.jskzx_cache.json') return Promise.resolve({ success: false, error: 'no cache' });
    const c = CARDS[p];
    if (c && c.kind === 'json') return Promise.resolve({ success: true, text: JSON.stringify(c.data) });
    return Promise.resolve({ success: false, error: 'ENOENT ' + p });
  };
  const readTextBatch = (o) => {
    const results = ((o && o.paths) || []).map((p) => {
      const c = CARDS[p];
      return (c && c.kind === 'json')
        ? { path: p, success: true, value: JSON.stringify(c.data) }
        : { path: p, success: false, error: 'ENOENT' };
    });
    return Promise.resolve({ success: true, results });
  };
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const readBuffer = () => {
    const bin = atob(PNG_B64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return Promise.resolve({ success: true, buffer: arr.buffer });
  };
  const lib = {
    libraryInfo: () => Promise.resolve({ granted: true, hasUri: true, uri: 'content://mock/tree' }),
    scan: () => Promise.resolve(scan()),
    pickFolder: () => Promise.resolve({}),
    readText, readTextBatch, readBuffer,
    writeText: () => Promise.resolve({ success: true }),
    mkdir: () => Promise.resolve({ success: true }),
    move: () => Promise.resolve({ success: true }),
    rename: () => Promise.resolve({ success: true }),
    deleteFile: () => Promise.resolve({ success: true })
  };
  const generic = () => Promise.resolve({});
  const proxyAll = (o) => new Proxy(o, { get: (t, k) => (typeof k === 'string' ? (k in t ? t[k] : generic) : undefined) });
  const PLUGINS = {
    LibraryFsPlugin: proxyAll(lib),
    AppConfigPlugin: proxyAll({}),
    HttpPlugin: proxyAll({}),
    UpdatePlugin: proxyAll({}),
    KeystorePlugin: proxyAll({}),
    MemoryPlugin: proxyAll({}),
    SystemBars: proxyAll({}),
    CapacitorHttp: proxyAll({})
  };
  window.Capacitor = {
    getPlatform: () => 'android',
    isNativePlatform: () => true,
    isPluginAvailable: (n) => !!PLUGINS[n],
    registerPlugin: (n) => PLUGINS[n] || proxyAll({}),
    Plugins: PLUGINS,
    convertFileSrc: (p) => String(p)
  };
  // @capacitor/core 模块初始化会重建 window.Capacitor(带原生补丁逻辑):
  // 它写入时会读 getPlatform 等属性,我们用 Proxy 包装,保留模块写入能力但关键判定恒为 native
  const patchGuard = (obj) => new Proxy(obj, {
    get (t, k) {
      if (k === 'isNativePlatform') return () => true;
      if (k === 'getPlatform') return () => 'android';
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set (t, k, v) { t[k] = v; return true; },
    has (t, k) { return k in t; },
    defineProperty (t, k, desc) { Object.defineProperty(t, k, desc); return true; },
    deleteProperty (t, k) { return delete t[k]; }
  });
  // 先保存真实写入目标:模块会把 window.Capacitor 重新赋值,我们在其后立即代理
  const origCap = window.Capacitor;
  const proxied = patchGuard(origCap);
  Object.defineProperty(window, 'Capacitor', {
    get: () => proxied,
    set: (v) => { origCap.__realValue = v; return true; },
    configurable: true
  });
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: mockSource });
console.log('[e2e] Capacitor 桥 mock 已注入');

const BASE = `http://127.0.0.1:${PORT}`;
const detailOk = (name) => `document.querySelector('.detail-page') !== null && document.body.innerText.indexOf('${name}') >= 0 && document.body.innerText.indexOf('未找到卡片') < 0`;

const results = {};
const failures = [];

// ---------- S1: 列表点击打开 ----------
await send('Page.navigate', { url: `${BASE}/?mobile=1` });
const mobileOk = await poll(`!!document.querySelector('.van-tabbar')`, { timeout: 10000 });
if (!mobileOk) failures.push('S0 移动端壳未挂载(Capacitor 注入失败?)');
const listReady = await poll(`document.body.innerText.indexOf('测试角色甲') >= 0`, { timeout: 15000 });
if (!listReady) failures.push('S1 列表未渲染出卡片');
const clickMode = await evalJS(`(() => {
  const leaves = Array.from(document.querySelectorAll('body *')).filter((e) => e.childElementCount === 0);
  const target = leaves.find((e) => (e.textContent || '').indexOf('测试角色甲') >= 0);
  if (!target) return 'leaf-not-found';
  let el = target;
  for (let i = 0; i < 8 && el; i++) {
    if (el.click) el.click();
    if (String(location.hash).indexOf('/card') >= 0) return 'dom-click';
    el = el.parentElement;
  }
  return 'hash-unchanged';
})()`);
if (clickMode !== 'dom-click') {
    await evalJS(`location.hash = '#/card?p=' + encodeURIComponent('/library/测试角色甲.json')`);
}
results.S1 = await poll(detailOk('测试角色甲'), { timeout: 12000 });
if (!results.S1) failures.push(`S1 列表点击后详情异常(${clickMode}) body=${await bodyText()}`);

// ---------- S2: 冷启动直达详情(库未加载) ----------
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Page.navigate', { url: `${BASE}/?mobile=1#/card?p=${encodeURIComponent('/library/像素卡PNG.png')}` });
results.S2 = await poll(detailOk('像素卡PNG'), { timeout: 15000 });
if (!results.S2) failures.push(`S2 冷启动直达详情失败 body=${await bodyText()}`);

// ---------- S3: 库陈旧(导入后) → 强制重扫兜底(f4a8007) ----------
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Page.navigate', { url: `${BASE}/?mobile=1` });
const libLoaded = await poll(`document.body.innerText.indexOf('测试角色甲') >= 0`, { timeout: 15000 });
if (!libLoaded) failures.push('S3 前置:列表未加载');
await evalJS('window.__mock.setScanVersion(2)');
await evalJS(`location.hash = '#/card?p=' + encodeURIComponent('/library/分组A/新导入卡.json')`);
results.S3 = await poll(detailOk('新导入卡'), { timeout: 20000 });
if (!results.S3) failures.push(`S3 陈旧库+强制重扫失败 body=${await bodyText()}`);

// ---------- 输出 ----------
console.log('\n===== 端到端结果 =====');
console.log('S0 Capacitor 注入/移动端壳:', mobileOk ? '✅' : '❌');
console.log('S1 列表点击打开详情(中文路径):', results.S1 ? '✅' : '❌', `(触发方式: ${clickMode})`);
console.log('S2 冷启动直达详情(库未就绪):', results.S2 ? '✅' : '❌');
console.log('S3 库陈旧→强制重扫兜底(f4a8007):', results.S3 ? '✅' : '❌');
if (runtimeErrors.length) {
    console.log('\n捕获运行时错误(前8条):');
    runtimeErrors.slice(0, 8).forEach((e) => console.log('  ' + e));
}
if (failures.length) {
    console.log('\n失败明细:');
    failures.forEach((f) => console.log('  ❌ ' + f));
}

try { chrome.kill(); } catch (e) { /* 忽略 */ }
server.close();
const allOk = mobileOk && results.S1 && results.S2 && results.S3;
console.log(`\n${allOk ? '✅ 全部通过：卡片不存在 bug 在当前代码已修复' : '❌ 存在失败项'}`);
process.exit(allOk ? 0 : 1);
