/** 决定性实验:后台 rescan(全树扫描)进行中,详情页读取要排多久的队 */
const WS = process.argv[2];

async function evalJs(expr) {
    const ws = new WebSocket(WS);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const out = await new Promise((resolve) => {
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id === 1) {
                const r = msg.result || {};
                if (r.exceptionDetails) resolve({ EXC: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails) });
                else resolve({ value: r.result && r.result.value });
            }
        };
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, timeout: 120000 } }));
    });
    ws.close();
    return out;
}

const r = await evalJs(`(async () => {
    const api = window.electronAPI;
    const out = {};
    const t = performance.now();
    const now = () => Math.round(performance.now() - t);

    // 1) 后台发起全树 rescan(804 卡 ~8s,独占桥线程)
    const scanP = api.rescanLibrary('/library').then(() => { out.scanDoneAt = now(); });

    // 2) 扫描进行中,模拟用户点开 PNG 卡的水合读取
    await new Promise(r0 => setTimeout(r0, 150));
    let t1 = performance.now();
    await api.readCharaBatch(['/library/card_png_demo.png']);
    out.pngReadWait_ms = Math.round(performance.now() - t1);

    // 3) 再测 JSON 小卡读取
    t1 = performance.now();
    await api.readText('/library/importcards/card_0000.json');
    out.smallJsonReadWait_ms = Math.round(performance.now() - t1);

    // 4) 详情封面缩略图读取(同样排桥)
    t1 = performance.now();
    await api.readThumb('/library/card_png_demo.png', Date.now(), 9969);
    out.thumbReadWait_ms = Math.round(performance.now() - t1);

    await scanP;
    return JSON.stringify(out, null, 1);
})()`);
console.log(r.value || JSON.stringify(r));
