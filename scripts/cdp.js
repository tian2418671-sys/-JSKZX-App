// CDP 辅助:连接 WebView 调试端口执行 JS / 截图
const url = process.argv[2] || 'ws://127.0.0.1:9222/devtools/page/E7E8C8F308C7F44E20276EA2855E4EB1';
const expr = process.argv[3] || 'document.title';
const ws = new WebSocket(url);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
    });
}

ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
    }
};

ws.onerror = (e) => { console.error('WS error', e.message || e); process.exit(1); };

// touch 模式:protocol 级触摸。用法:
//   node scripts/cdp.js <ws> touch <x> <y> [holdMs]
// 发送 touchStart(点按) → 等待 holdMs(默认 500) → touchEnd(抬起)。
// 模拟真实长按(能触发 entry.js 的 v-longpress 指令 500ms 定时器)。
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

ws.onopen = async () => {
    try {
        if (process.argv[3] === 'touch') {
            const x = parseFloat(process.argv[4]);
            const y = parseFloat(process.argv[5]);
            const hold = parseInt(process.argv[6] || '500', 10);
            const base = { x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 };
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [base] });
            await sleep(hold);
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            console.log(`touched (${x},${y}) hold ${hold}ms`);
        } else if (process.argv[4] === 'shot') {
            const r = await send('Page.captureScreenshot', { format: 'png' });
            require('fs').writeFileSync(process.argv[5] || 'shot.png', Buffer.from(r.data, 'base64'));
            console.log('screenshot saved');
        } else if (process.argv[4] === 'touch') {
            const x = parseFloat(process.argv[5]);
            const y = parseFloat(process.argv[6]);
            const hold = parseInt(process.argv[7] || '500', 10);
            const base = { x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 };
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [base] });
            await sleep(hold);
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            console.log(`touched (${x},${y}) hold ${hold}ms`);
        } else {
            const r = await send('Runtime.evaluate', {
                expression: expr,
                returnByValue: true,
                awaitPromise: true
            });
            if (r.exceptionDetails) {
                console.error('EXC:', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
            } else {
                const v = r.result && r.result.value;
                console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
            }
        }
    } catch (e) {
        console.error('ERR', e.message);
    }
    ws.close();
    process.exit(0);
};
