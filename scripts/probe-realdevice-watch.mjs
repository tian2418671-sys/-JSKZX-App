/**
 * 真机打标进度轮询（reactive 对象正确读取 + 分段进度）
 * 用法：CDP_HTTP=http://127.0.0.1:9223 node scripts/probe-realdevice-watch.mjs [秒数]
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const DURATION = Number(process.argv[2] || 90);

async function getPage() {
    const res = await fetch(`${CDP_HTTP}/json`);
    const list = await res.json();
    return list.find((p) => p.type === 'page');
}

async function main() {
    const page = await getPage();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pend = new Map(); const logs = [];
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.method === 'Runtime.consoleAPICalled') logs.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    };
    await new Promise(r => { ws.onopen = r; });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? 'ERR:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };

    const t0 = Date.now();
    while (Date.now() - t0 < DURATION * 1000) {
        await new Promise(r => setTimeout(r, 5000));
        const st = await ev(`(() => {
            const s = window.__lib;
            const running = s.aiTagRunning && (s.aiTagRunning.value !== undefined ? s.aiTagRunning.value : s.aiTagRunning);
            const p = s.aiTagProgress || {};
            return { running, prog: JSON.parse(JSON.stringify(p)) };
        })()`);
        console.log(`[${Math.round((Date.now() - t0) / 1000)}s] running=${st.running} prog=${JSON.stringify(st.prog)}`);
        if (st.running === false) { console.log('>>> 运行结束'); break; }
    }

    console.log('\n=== [AiTag] 全部日志 ===');
    console.log(logs.filter(l => /\[AiTag\]/.test(l)).join('\n') || '(无)');

    ws.close();
}
main().catch(e => { console.error('异常:', e.message); process.exit(1); });
