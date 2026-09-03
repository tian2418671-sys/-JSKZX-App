/**
 * 跑真实构建产物的「卡片不存在」链路验证
 * 桥 mock 按 @capacitor/core 打包产物的真实协议构造:
 *   - window.androidBridge 存在 → 平台判定 android
 *   - window.Capacitor.PluginHeaders = [{name, methods:[{name, rtype:'promise'}]}]
 *   - window.Capacitor.nativePromise(pluginName, method, args) → mock 实现
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WEB = path.resolve('web');
const PORT = 5627;
const CDP = 5628;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
    try {
        const url = String(req.url || '/').split('?')[0].split('#')[0];
        const fp = path.join(WEB, url === '/' ? 'index.html' : decodeURIComponent(url));
        const data = await readFile(fp);
        res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    } catch (e) { res.writeHead(404); res.end('not-found'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log('[verify] server up on', PORT);

const udd = mkdtempSync(path.join(os.tmpdir(), 'cdp-verify2-'));
const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP}`, `--user-data-dir=${udd}`, 'about:blank'
], { stdio: 'ignore' });

let version = null;
for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); break; }
    catch (e) { await sleep(250); }
}
if (!version) { console.error('[verify] Chrome CDP 未就绪'); process.exit(1); }

const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let msgId = 0;
const pending = new Map();
const runtimeErrors = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {};
        runtimeErrors.push('[exception] ' + String((d.exception && d.exception.description) || d.text || '').slice(0, 260));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        runtimeErrors.push('[console.error] ' + m.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 260));
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
const bodyText = async () => String(await evalJS('document.body ? document.body.innerText.slice(0, 300) : ""') || '');
await send('Page.enable');
await send('Runtime.enable');

// ---------- 库 mock 数据 ----------
const CARD_A = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '测试角色甲', description: '端到端验证卡片A描述', personality: '沉稳', first_mes: '你好，我是甲。', creator: 'e2e', tags: ['测试'], alternate_greetings: [] } };
const CARD_B = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '新导入卡', description: '模拟导入后新出现的卡片B', personality: '活泼', first_mes: '我是新导入的。', creator: 'e2e', tags: ['导入'] } };
const CARD_P = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '像素卡PNG', description: 'PNG内嵌卡片C', personality: '像素风', first_mes: '像素你好。', creator: 'e2e', tags: ['png'] } };
const MOCK_DB = {
    '/library/测试角色甲.json': { kind: 'json', name: '测试角色甲.json', data: CARD_A },
    '/library/分组A/新导入卡.json': { kind: 'json', name: '新导入卡.json', data: CARD_B },
    '/library/像素卡PNG.png': { kind: 'png', name: '像素卡PNG.png', data: CARD_P }
};

const mockSource = `(() => {
  const CARDS = ${JSON.stringify(MOCK_DB)};
  let scanVersion = 1;
  window.__mock = { setScanVersion: (v) => { scanVersion = v; } };
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
  const readText = (args) => {
    const p = args && args.path;
    const rel = String(p || '').replace(/^\\/library\\//, '');
    const key = '/library/' + rel;
    if (key === '/library/.jskzx_cache.json') return { success: false, error: 'no cache' };
    const c = CARDS[key];
    if (c && c.kind === 'json') return { success: true, value: JSON.stringify(c.data) };
    return { success: false, error: 'ENOENT ' + key };
  };
  const readTextBatch = (args) => {
    const results = ((args && args.paths) || []).map((p) => {
      const key = '/library/' + String(p).replace(/^\\/library\\//, '');
      const c = CARDS[key];
      return (c && c.kind === 'json')
        ? { path: p, success: true, value: JSON.stringify(c.data) }
        : { path: p, success: false, error: 'ENOENT' };
    });
    return { success: true, results };
  };
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const readBuffer = (args) => {
    const bin = atob(PNG_B64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return { success: true, buffer: arr.buffer };
  };
  const IMPL = {
    LibraryFsPlugin: {
      libraryInfo: () => ({ granted: true, hasUri: true, uri: 'content://mock/tree' }),
      scan: (a) => scan(),
      pickFolder: () => ({}),
      readText, readTextBatch, readBuffer,
      writeText: () => ({ success: true }),
      mkdir: () => ({ success: true }),
      move: () => ({ success: true }),
      rename: () => ({ success: true }),
      deleteFile: () => ({ success: true })
    },
    AppConfigPlugin: { get: () => ({}), set: () => ({ success: true }) },
    HttpPlugin: { request: () => ({ status: 200, data: {} }) },
    UpdatePlugin: {},
    KeystorePlugin: {
      set: () => ({ success: true }),
      get: () => ({ success: false, value: null }),
      remove: () => ({ success: true })
    },
    MemoryPlugin: {
      add: () => ({ success: true }),
      list: () => ({ items: [] }),
      facts: () => ({ items: [] }),
      search: () => ({ items: [] }),
      clear: () => ({ success: true })
    },
    SystemBars: { setStyle: () => ({}), setColor: () => ({}), getInsets: () => ({ top: 0, bottom: 0 }) }
  };
  // 关键:按打包后 @capacitor/core 的真实协议
  // 1) androidBridge 存在 → i(e) 判定 'android' → isNativePlatform() true
  window.androidBridge = { postMessage: () => {} };
  window.Capacitor = window.Capacitor || {};
  const cap = window.Capacitor;
  cap.CapacitorCustomPlatform = null;
  cap.PluginHeaders = Object.keys(IMPL).map((name) => ({
    name,
    methods: Object.keys(IMPL[name]).map((m) => ({ name: m, rtype: 'promise' }))
  }));
  cap.Plugins = cap.Plugins || {};
  // 2) nativePromise: registerPlugin 打包逻辑里 rtype==='promise' 时走 a.nativePromise(plugin, method, args)
  cap.nativePromise = (plugin, method, args) => {
    const impl = IMPL[plugin] && IMPL[plugin][method];
    if (typeof impl === 'function') return Promise.resolve(impl(args));
    return Promise.reject(new Error(plugin + '.' + method + ' mock 未实现'));
  };
  cap.nativeCallback = (plugin, method, args, cb) => {
    const impl = IMPL[plugin] && IMPL[plugin][method];
    if (typeof impl === 'function') { try { cb && cb(impl(args)); } catch (e) { /* 忽略 */ } return; }
  };
  cap.convertFileSrc = (p) => String(p);
  cap.handleError = (e) => console.error(e);
  cap.isPluginAvailable = (name) => !!IMPL[name];
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: mockSource });
console.log('[verify] Capacitor 协议级 mock 已注入(androidBridge + PluginHeaders + nativePromise)');

const BASE = `http://127.0.0.1:${PORT}`;
const detailOk = (name) => `document.querySelector('.detail-page') !== null && document.body.innerText.indexOf('${name}') >= 0 && document.body.innerText.indexOf('未找到卡片') < 0`;

const results = {};
const failures = [];

// S1: 列表点击打开(中文路径) — 真实 Capacitor native 判定,不加 ?mobile=1
await send('Page.navigate', { url: `${BASE}/` });
const mobileOk = await poll(`!!document.querySelector('.van-tabbar')`, { timeout: 10000 });
if (!mobileOk) failures.push('S0 移动端壳未挂载');
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
results.S1 = await poll(detailOk('测试角色甲'), { timeout: 12000 });
if (!results.S1) failures.push(`S1 详情异常(${clickMode}) body=${await bodyText()}`);

// S2: 冷启动直达详情(库未就绪)
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Page.navigate', { url: `${BASE}/#/card?p=${encodeURIComponent('/library/像素卡PNG.png')}` });
results.S2 = await poll(detailOk('像素卡PNG'), { timeout: 15000 });
if (!results.S2) failures.push(`S2 冷启动直达详情失败 body=${await bodyText()}`);

// S3: 库陈旧 → 强制重扫兜底
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Page.navigate', { url: `${BASE}/` });
const libLoaded = await poll(`document.body.innerText.indexOf('测试角色甲') >= 0`, { timeout: 15000 });
if (!libLoaded) failures.push('S3 前置:列表未加载');
await evalJS('window.__mock.setScanVersion(2)');
await evalJS(`location.hash = '#/card?p=' + encodeURIComponent('/library/分组A/新导入卡.json')`);
results.S3 = await poll(detailOk('新导入卡'), { timeout: 20000 });
if (!results.S3) failures.push(`S3 陈旧库+强制重扫失败 body=${await bodyText()}`);

console.log('\n===== 端到端结果 =====');
console.log('S0 移动端壳(真实 Capacitor native 判定):', mobileOk ? '✅' : '❌');
console.log('S1 列表点击打开详情(中文路径):', results.S1 ? '✅' : '❌', `(触发: ${clickMode})`);
console.log('S2 冷启动直达详情(库未就绪):', results.S2 ? '✅' : '❌');
console.log('S3 库陈旧→强制重扫兜底(f4a8007):', results.S3 ? '✅' : '❌');
const relevantErrors = runtimeErrors.filter((e) => !e.includes('SystemBars'));
if (relevantErrors.length) {
    console.log('\n相关运行时错误:');
    relevantErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
} else {
    console.log('\n无相关运行时错误');
}
if (failures.length) {
    console.log('\n失败明细:');
    failures.forEach((f) => console.log('  ❌ ' + f));
}

try { chrome.kill(); } catch (e) { /* 忽略 */ }
server.close();
const allOk = mobileOk && results.S1 && results.S2 && results.S3;
console.log(`\n${allOk ? '✅ 全部通过:「卡片不存在」bug 修复验证成功' : '❌ 存在失败项'}`);
process.exit(allOk ? 0 : 1);
