/**
 * 水合链路分步探针(真机):量化 readText 过桥 / 主线程 parse / Worker 往返(clone开销) / normalize / 全树遍历,
 * 定位「点开详情页慢」的真实热点。
 * 用法: node scripts/probe-detail-chain.mjs <ws> [卡片path]
 */
const WS = process.argv[2];
const PATH = process.argv[3] || '/library/importcards/HEAVY.json';

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
    const p = ${JSON.stringify(PATH)};
    const out = { path: p };
    const api = window.electronAPI;

    // ① readText 过桥
    let t0 = performance.now();
    const fr = await api.readText(p);
    out.readText_ms = Math.round(performance.now() - t0);
    const text = fr && fr.text;
    out.readText_bytes = text ? text.length : 0;
    if (!text) return JSON.stringify({ err: 'readText empty', out });

    // ② 主线程 JSON.parse(无 postMessage clone)
    t0 = performance.now();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return JSON.stringify({ err: 'parse fail ' + e.message, out }); }
    out.parseMain_ms = Math.round(performance.now() - t0);

    // 对象规模画像
    let nodeCount = 0, strLen = 0;
    const seen = new WeakSet(); const stack = [parsed];
    while (stack.length) {
        const x = stack.pop();
        if (x && typeof x === 'object') { if (seen.has(x)) continue; seen.add(x); nodeCount++; for (const k in x) stack.push(x[k]); }
        else if (typeof x === 'string') strLen += x.length;
    }
    out.json_nodes = nodeCount; out.json_strChars = strLen;

    // ③ Worker 往返(字符串进、对象出)量化 postMessage 结构化克隆双向开销
    const wsrc = "self.onmessage=function(e){var t=performance.now();var o=JSON.parse(e.data.s);self.postMessage({parseMs:Math.round(performance.now()-t),ok:o});};";
    const w = new Worker(URL.createObjectURL(new Blob([wsrc])));
    const rt = await new Promise((resolve) => {
        const s = performance.now();
        w.onmessage = (e) => resolve({ total: Math.round(performance.now() - s), parse: e.data.parseMs });
        w.postMessage({ s: text });
    });
    out.worker_total_ms = rt.total;
    out.worker_parse_ms = rt.parse;
    out.worker_clone_overhead_ms = rt.total - rt.parse;
    w.terminate();

    // ④ 无 proxy:全树遍历基线(渲染首次求值下界,normalize+Vue 遍历都以此为底再加 proxy trap)
    let acc = 0; t0 = performance.now();
    const seen2 = new WeakSet(); const stack2 = [parsed];
    while (stack2.length) { const x = stack2.pop(); if (x && typeof x === 'object') { if (seen2.has(x)) continue; seen2.add(x); for (const k in x) { acc++; stack2.push(x[k]); } } }
    out.fullwalk_ms = Math.round(performance.now() - t0); out.fullwalk_edges = acc;

    return JSON.stringify(out, null, 1);
})()`);
console.log(r.value || JSON.stringify(r));
