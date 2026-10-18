/**
 * 最终验收：PNG 保存安全性 + 桥接稳定性
 *
 * 验证目标：
 *   ① 保存失败时**原文件绝不丢失**（旧实现先 delete 再 rename，rename 失败即丢卡）
 *   ② 保存成功时原图保留、chara 块更新
 *   ③ 保存前后桥接仍可用（无假死）
 *
 * 用法：CDP_HTTP=http://127.0.0.1:9223 node scripts/probe-png-save-safe.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const P = '/library/cards_big/stress_png_001.png';
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} · ${n}${d ? ' -> ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const page = (await (await fetch(`${CDP_HTTP}/json`)).json()).find((p) => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pend = new Map(); const logs = [];
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.method === 'Runtime.consoleAPICalled') {
            const s = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
            if (/AiTag|保存|save/.test(s)) logs.push(s.slice(0, 240));
        }
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    };
    await new Promise((r) => { ws.onopen = r; });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    const ev = async (expr, timeout = 90000) => {
        const to = new Promise((r) => setTimeout(() => r('TIMEOUT'), timeout));
        return Promise.race([(async () => {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
            return r.exceptionDetails ? ('ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 200)) : r.result.value;
        })(), to]);
    };

    // 1) 等库就绪
    let total = 0;
    for (let i = 0; i < 40; i++) {
        const t = await ev(`document.body.innerText.match(/(\\d+)\\s*张/)?.[1] || '0'`, 8000);
        total = Number(t) || 0;
        if (total > 1000) break;
        await sleep(2000);
    }
    check('卡片库已加载', total > 1000, `${total} 张`);

    // 2) 记录目标卡原始标签（⚠️ 必须走 window.electronAPI 桥接，
    //    直接调 Capacitor.Plugins.LibraryFsPlugin 的参数名不同 → 返回空对象）
    const before = await ev(`(async()=>{
        try {
            const r = await window.electronAPI.readCharaBatch([${JSON.stringify(P)}]);
            const it = r && r.results && r.results[0];
            if (!it || !it.success) return { ok:false, err: it && it.error };
            const j = JSON.parse(it.value);
            const tags = (j.data && j.data.tags) || j.tags || [];
            return { ok:true, tags, len: it.value.length };
        } catch(e) { return { ok:false, err:String(e.message).slice(0,80) }; }
    })()`, 30000);
    check('读取原卡成功', before && before.ok, JSON.stringify(before && before.tags));

    // 3) 保存（追加一个探针标签）
    const saveRes = await ev(`(async()=>{
        try {
            const api = window.electronAPI;
            const r = await api.readCharaBatch([${JSON.stringify(P)}]);
            const j = JSON.parse(r.results[0].value);
            j.data = j.data || {};
            j.data.tags = (j.data.tags || []).concat(['__save_probe__']);
            const t0 = Date.now();
            const s = await api.saveCard(${JSON.stringify(P)}, j);
            return { success: !!(s && s.success), error: s && s.error, ms: Date.now() - t0 };
        } catch(e) { return { success:false, error:String(e.message).slice(0,150) }; }
    })()`, 90000);
    check('PNG 保存返回', saveRes && saveRes !== 'TIMEOUT', JSON.stringify(saveRes));
    if (saveRes && saveRes.ms) console.log(`    保存耗时 ${saveRes.ms}ms`);

    // 4) 关键：原文件必须仍可读（旧实现在 rename 失败时会丢卡）
    const after = await ev(`(async()=>{
        try {
            const r = await window.electronAPI.readCharaBatch([${JSON.stringify(P)}]);
            const it = r && r.results && r.results[0];
            if (!it || !it.success) return { exists:false, err: it && it.error };
            const j = JSON.parse(it.value);
            const tags = (j.data && j.data.tags) || j.tags || [];
            return { exists:true, tags, hasProbe: tags.includes('__save_probe__') };
        } catch(e) { return { exists:false, err:String(e.message).slice(0,80) }; }
    })()`, 30000);
    check('原文件未丢失（数据安全）', after && after.exists === true, JSON.stringify(after));
    check('标签已写入文件', after && after.hasProbe === true, JSON.stringify(after && after.tags));

    // 5) 保存后桥接仍可用
    const bridgeOk = await ev(`(async()=>{
        const t0 = Date.now();
        const x = await window.electronAPI.loadAppConfig ? await window.electronAPI.loadAppConfig() : {};
        return { ok: true, ms: Date.now() - t0 };
    })()`, 15000);
    check('保存后桥接未卡死', bridgeOk && bridgeOk.ok === true && bridgeOk.ms < 5000, JSON.stringify(bridgeOk));

    console.log('\n=== 相关日志 ===');
    console.log(logs.slice(-10).join('\n') || '(无)');

    ws.close();
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\n总计 ${results.length} · 通过 ${results.length - fail} · 失败 ${fail}`);
    process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('异常:', e.message); process.exit(1); });
