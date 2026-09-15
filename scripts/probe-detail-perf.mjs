/** 详情页打开耗时 CDP 探针:安装监控 → 点卡 → 收集主线程停顿/长任务 */
const WS = process.argv[2];

async function evalJs(expr) {
    const ws = new WebSocket(WS);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const out = await new Promise((resolve) => {
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id === 1) {
                const r = msg.result || {};
                if (r.exceptionDetails) resolve({ EXC: r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails) });
                else resolve({ value: r.result && r.result.value });
            }
        };
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, timeout: 30000 } }));
    });
    ws.close();
    return out;
}

// 1) 安装监控
const inst = await evalJs(`(() => {
    window.__longtasks = [];
    try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longtasks.push({ dur: Math.round(e.duration), at: Math.round(e.startTime) }); })
            .observe({ entryTypes: ['longtask','long-animation-frame'] });
    } catch (e) { try { new PerformanceObserver((l)=>{for(const e of l.getEntries()) window.__longtasks.push({dur:Math.round(e.duration),at:Math.round(e.startTime)})}).observe({entryTypes:['longtask']}) } catch(e2){} }
    window.__heartbeats = [];
    clearInterval(window.__hbTimer);
    window.__hbTimer = setInterval(() => window.__heartbeats.push(Date.now()), 100);
    'installed'
})()`);
console.log('install:', JSON.stringify(inst));

// 2) 返回卡库,找目标卡并计时点击(argv[3]=目标卡名称片段,默认 HEAVY)
const TARGET = process.argv[3] || '重卡HEAVY';
const res = await evalJs(`(async () => {
    history.back();
    await new Promise(r => setTimeout(r, 800));
    let idx = -1; let items = [];
    // 目标卡可能不在前 24 张已渲染卡片里:向上滚不回,直接在已渲染卡片中找;找不到用第 3 张兜底
    items = [...document.querySelectorAll('.card-item')];
    idx = items.findIndex(el => el.textContent.includes(${JSON.stringify(TARGET)}));
    let label = ${JSON.stringify(TARGET)} + '@' + idx;
    if (idx === -1) {
        idx = Math.min(3, items.length - 1);
        label = 'fallback#' + idx + '(' + (items[idx] ? items[idx].textContent.replace(/\\s+/g,' ').slice(0, 18) : '?') + ')';
    }
    const card = items[idx];
    if (!card) return JSON.stringify({ err: 'no card item' });
    window.__heartbeats = [];
    window.__longtasks = [];
    const start = Date.now();
    card.click();
    let readyAt = null;
    for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (location.hash.includes('/card') && document.querySelector('.basic-wrap') && !document.querySelector('.detail-loading')) {
            readyAt = Date.now() - start;
            break;
        }
    }
    // 就绪后再观察 3 秒主线程(渲染余波/iframe/高亮等)
    const settleStart = Date.now();
    await new Promise(r => setTimeout(r, 3000));
    const beat = window.__heartbeats.slice().sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < beat.length; i++) {
        const gap = beat[i] - beat[i - 1];
        if (gap > 250) gaps.push({ gap, at: beat[i] - start });
    }
    return JSON.stringify({
        target: label,
        clickToReadyMs: readyAt,
        bigGapsOver3s: gaps.slice(0, 30),
        longtasks: window.__longtasks.slice(0, 30),
        stillLoading: !!document.querySelector('.detail-loading')
    }, null, 1);
})()`);
console.log(res.value || JSON.stringify(res));
