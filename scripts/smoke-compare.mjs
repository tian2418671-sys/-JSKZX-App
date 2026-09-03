// 对照冒烟：用用户上传的(能正常运行的)1.10.0 APK 的 web 产物跑同样的移动端强制测试
// 对比 1.10.1 是否新引入 TDZ 崩溃
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2]; // 传入不同产物目录
const LABEL = process.argv[3] || 'unknown';
const PORT = 5618;
const CDP = 9224;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let p = url === '/' ? '/index.html' : url;
    const fp = join(ROOT, p);
    if (existsSync(fp)) {
        const ext = p.split('.').pop();
        const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(fp));
    } else { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise(r => server.listen(PORT, r));

const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP}`,
    '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '/chrome-smoke3-' + Date.now(),
    'about:blank'
], { stdio: 'ignore' });
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
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 25000);
    });
}
const errors = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
        errors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 600));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('[console.error] ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 600));
    }
};
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.enable');

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?mobile=1` });
await sleep(6000);

const r = await send('Runtime.evaluate', { expression: `JSON.stringify({
    mounted: !!(document.querySelector('#app') && document.querySelector('#app').children.length),
    hasMobileUI: !!document.querySelector('.van-cell, .van-tabbar, .van-nav-bar, .van-tabs'),
    tdzError: typeof window.__tdzSeen !== 'undefined',
    bodyText: (document.body.innerText || '').slice(0, 100)
})`, returnByValue: true });

const result = JSON.parse(r.result.value);
console.log(`\n===== ${LABEL} =====`);
console.log('挂载:', result.mounted, '| 移动端UI:', result.hasMobileUI);
console.log('运行时错误数:', errors.length);
for (const e of errors) { console.log(' ', e.slice(0, 250)); }

ws.close(); chrome.kill(); server.close();
