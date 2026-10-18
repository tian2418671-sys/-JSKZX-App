/**
 * 真机打标结果核对（读取真实落盘标签 + 诊断日志）
 * 用法：CDP_HTTP=http://127.0.0.1:9223 node scripts/probe-realdevice-verify.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? 'ERR:' + r.exceptionDetails.text : r.result.value; };

    // 读库内真实标签（前 8 张）
    const lib = await ev(`(() => {
        const st = window.__lib;
        const l = (st.mobileLibrary && st.mobileLibrary.library) ? st.mobileLibrary.library : [];
        return l.slice(0, 8).map(c => ({ name: c.name, path: c.path, tags: (c.data && c.data.data && c.data.data.tags) || c.tags || [] }));
    })()`);
    console.log('=== 库内前 8 张卡标签 ===');
    console.log(JSON.stringify(lib, null, 1));

    // 读落盘真实值：从 SAF 读一张卡的 JSON 原文（用应用自身的桥）
    const disk = await ev(`(async () => {
        const st = window.__lib;
        const l = (st.mobileLibrary && st.mobileLibrary.library) ? st.mobileLibrary.library : [];
        const out = [];
        for (const c of l.slice(0, 4)) {
            if (!c.path) continue;
            try {
                const r = await window.Capacitor.Plugins.LibraryFs.readText({ path: c.path });
                const txt = (r && r.text) || '';
                let tags = null;
                try { const j = JSON.parse(txt); tags = (j.data && j.data.tags) || j.tags || null; } catch (e) { tags = 'JSON解析失败:' + txt.slice(0, 40); }
                out.push({ name: c.name, tags, mtime: r && r.mtime });
            } catch (e) { out.push({ name: c.name, err: String(e && e.message || e) }); }
        }
        return out;
    })()`);
    console.log('=== 落盘（SAF 读回）标签 ===');
    console.log(JSON.stringify(disk, null, 1));

    console.log('=== [AiTag] 日志（最近 30 条）===');
    const aiLogs = logs.filter(l => /\[AiTag\]/.test(l));
    console.log(aiLogs.slice(-30).join('\n') || '(无)');

    ws.close();
}
main().catch(e => { console.error('异常:', e.message); process.exit(1); });
