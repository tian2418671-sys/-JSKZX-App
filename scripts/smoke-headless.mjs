// 无头 Chrome 启动冒烟（APK 前端运行时验证）
// 静态服务器 + CDP 驱动系统 Chrome，加载 APK 同款 web 产物，注入 Capacitor 环境
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/TkDmGzq/JSKZX - app/JSKZX - app/web';
const PORT = 5617;
const CDP = 9222;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 1. 静态服务器（服务 APK 同款产物）
const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let p = url === '/' ? '/index.html' : url;
    const fp = join(ROOT, p);
    if (existsSync(fp)) {
        const ext = p.split('.').pop();
        const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(fp));
    } else {
        res.writeHead(404); res.end('not found: ' + p);
    }
});
await new Promise(r => server.listen(PORT, r));
console.log('[smoke] server up on', PORT);

// 2. headless Chrome
const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP}`,
    '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '/chrome-smoke-' + Date.now(),
    'about:blank'
], { stdio: 'ignore' });
console.log('[smoke] chrome pid=' + chrome.pid);
await sleep(2000);

const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const page = list.find(t => t.type === 'page');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let n = 0;
const pending = new Map();
function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++n;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
    });
}
const runtimeErrors = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 400));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        runtimeErrors.push('[console.error] ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 400));
    }
};
await new Promise(r => ws.onopen = r);
console.log('[smoke] CDP connected');

// 3. 注入 Capacitor 原生环境 + 加载页面
await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
` });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(5000);

// 4. 挂载结果检查
const evalRes = await send('Runtime.evaluate', { expression: `JSON.stringify({
    mounted: !!(document.querySelector('#app') && document.querySelector('#app').children.length),
    childCount: document.querySelector('#app') ? document.querySelector('#app').children.length : 0,
    hasTabbar: !!document.querySelector('.van-tabbar'),
    hasMobileUI: !!document.querySelector('.van-nav-bar, .van-cell, .van-tabbar'),
    bodyText: (document.body.innerText || '').slice(0, 150)
})`, returnByValue: true });
const result = JSON.parse(evalRes.result.value);
console.log('[smoke] 挂载结果:', JSON.stringify(result, null, 2));
console.log('[smoke] 运行时错误:', runtimeErrors.length ? '\n' + runtimeErrors.slice(0, 10).join('\n') : '无');

ws.close();
chrome.kill();
server.close();

const ok = result.mounted && runtimeErrors.length === 0;
console.log(ok ? '[smoke] ✅ 冒烟通过' : '[smoke] ❌ 冒烟失败');
process.exit(ok ? 0 : 1);
