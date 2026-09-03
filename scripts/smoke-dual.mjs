// 双通道冒烟：① 桌面路径 ② 移动端路径(?mobile=1 强制) — 验证 MobileApp 是否正常挂载
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:/TkDmGzq/JSKZX - app/JSKZX - app/web';
const PORT = 5617;
const CDP = 9223;
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
    } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(PORT, r));

const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP}`,
    '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '/chrome-smoke2-' + Date.now(),
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
        errors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 500));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('[console.error] ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 500));
    }
};
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.enable');

async function testPass(name, url, inject) {
    errors.length = 0;
    if (inject) {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.Capacitor = { isNativePlatform: () => true, Plugins: {} };` });
    }
    await send('Page.navigate', { url });
    await sleep(5000);
    const r = await send('Runtime.evaluate', { expression: `JSON.stringify({
        mounted: !!(document.querySelector('#app') && document.querySelector('#app').children.length),
        hasTabbar: !!document.querySelector('.van-tabbar'),
        hasNavBar: !!document.querySelector('.van-nav-bar'),
        hasMobileUI: !!document.querySelector('.van-cell, .van-tabbar, .van-nav-bar, .van-tabs'),
        capacitor: typeof window.Capacitor !== 'undefined' && String(window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
        electronAPI: typeof window.electronAPI,
        bodyText: (document.body.innerText || '').slice(0, 120)
    })`, returnByValue: true });
    const result = JSON.parse(r.result.value);
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(result, null, 2));
    console.log('错误:', errors.length ? '\n' + errors.slice(0, 8).join('\n') : '无');
    return result;
}

// 通道1: 注入 Capacitor 环境模拟真机（不带 ?mobile 参数）
const pass1 = await testPass('通道1: Capacitor 注入（模拟真机）', `http://127.0.0.1:${PORT}/`, true);

// 通道2: ?mobile=1 强制移动端
const pass2 = await testPass('通道2: ?mobile=1 强制移动端', `http://127.0.0.1:${PORT}/?mobile=1`, false);

ws.close(); chrome.kill(); server.close();

const mobileOk1 = pass1.hasMobileUI;
const mobileOk2 = pass2.hasMobileUI;
console.log('\n===== 结论 =====');
console.log('通道1(Capacitor注入) 走移动端:', mobileOk1 ? '✅' : '❌ 走了桌面版');
console.log('通道2(强制mobile)   走移动端:', mobileOk2 ? '✅' : '❌ 走了桌面版');
