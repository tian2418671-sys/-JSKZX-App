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

ws.onopen = async () => {
    try {
        if (process.argv[4] === 'shot') {
            const r = await send('Page.captureScreenshot', { format: 'png' });
            require('fs').writeFileSync(process.argv[5] || 'shot.png', Buffer.from(r.data, 'base64'));
            console.log('screenshot saved');
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
