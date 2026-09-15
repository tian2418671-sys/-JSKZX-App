/**
 * 端到端验证(BUG-14):后台全库校验(rescan)进行中「连续点开卡片」的真实就绪耗时。
 * 修复前实测:扫描期间点卡读取排队 ~5.6s。修复后目标:亚秒级、扫描不再被拖慢。
 * 用法: node scripts/probe-bridge-realuse.mjs <ws>
 */
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
    const out = {};
    // 确保回到列表
    const toList = async () => { if (location.hash.includes('/card')) { history.back(); } for (let i=0;i<60;i++){ if (document.querySelector('.card-item') && !location.hash.includes('/card')) return true; await new Promise(r=>setTimeout(r,50)); } return false; };

    const clickToReady = async (idx) => {
        await toList();
        const cards = document.querySelectorAll('.card-item');
        const card = cards[Math.min(idx, cards.length-1)];
        if (!card) return { err: 'no-card-' + idx };
        const t = performance.now();
        card.click();
        for (let i=0;i<1600;i++){
            await new Promise(r=>setTimeout(r,25));
            if (location.hash.includes('/card') && document.querySelector('.basic-wrap') && !document.querySelector('.detail-loading'))
                return { open_ms: Math.round(performance.now()-t) };
        }
        return { open_ms: -1, note: 'never-ready' };
    };

    // 基线:无后台扫描时点开第 0 张
    out.baseline = await clickToReady(0);

    // 启动后台真实全库 scan(与 reconcile 同一条原生 scan 通道),扫描期间连续点卡
    const T0 = performance.now();
    window.electronAPI.rescanLibrary('/library').then(() => { out.scan_total_ms = Math.round(performance.now()-T0); });
    await new Promise(r=>setTimeout(r,250));
    out.early = await clickToReady(1);
    out.mid = await clickToReady(3);
    out.late = await clickToReady(7);
    return JSON.stringify(out, null, 1);
})()`);
console.log(r.value || JSON.stringify(r));
