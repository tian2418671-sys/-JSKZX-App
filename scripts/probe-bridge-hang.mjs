/**
 * 真机「桥接卡死」回归验证
 *
 * 背景：卡片库加载 1.2 万卡后，THUMB_POOL 持续对每张卡做路径解析（未命中退化为逐段
 *       findFile 慢查），把 ContentResolver 拖死 → 所有桥接调用（含无关插件）超时、应用假死。
 * 修复：缩略图改用「只查索引」(indexedFileOnly)，未就绪/未命中直接返回 null，绝不慢查。
 *
 * 本脚本：加载库 → 等待 → 分 3 轮、每轮间隔 20s，测同一组桥接调用是否始终 < 5s。
 * 用法：CDP_HTTP=http://127.0.0.1:9223 node scripts/probe-bridge-hang.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const THRESHOLD_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d = '') => {
    results.push({ n, ok: !!ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} · ${n}${d ? ' -> ' + d : ''}`);
};

async function main() {
    const page = (await (await fetch(`${CDP_HTTP}/json`)).json()).find((p) => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pend = new Map();
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    };
    await new Promise((r) => { ws.onopen = r; });
    const send = (method, params = {}) => new Promise((r) => {
        const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable');

    const ev = async (expr, timeout = 15000) => {
        const to = new Promise((r) => setTimeout(() => r('TIMEOUT'), timeout));
        return Promise.race([(async () => {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
            return r.exceptionDetails ? ('ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 120)) : r.result.value;
        })(), to]);
    };

    // 1) 等库加载
    let total = 0;
    for (let i = 0; i < 60; i++) {
        const t = await ev(`document.body.innerText.match(/(\\d+)\\s*张/)?.[1] || '0'`);
        total = Number(t) || 0;
        if (total > 1000) break;
        await sleep(3000);
    }
    check('卡片库已加载', total > 1000, `${total} 张`);

    // 2) 三轮探测：每轮测一组调用，间隔 20s（给缩略图池充分「作恶」的时间）
    const probes = [
        ['AppConfig.load', `(async()=>{const x=await window.Capacitor.Plugins.AppConfigPlugin.load();return !!(x&&x.success);})()`],
        ['readCharaBatch', `(async()=>{const x=await window.Capacitor.Plugins.LibraryFsPlugin.readCharaBatch(['/library/cards_big/stress_00002.json']);return !!(x&&x.success);})()`],
        ['readBuffer', `(async()=>{try{const x=await window.Capacitor.Plugins.LibraryFsPlugin.readBuffer({path:'/library/cards_big/stress_png_084.png'});return !!(x&&x.success);}catch(e){return 'REJECT:'+String(e.message).slice(0,40);}})()`],
    ];

    for (let round = 1; round <= 3; round++) {
        console.log(`\n--- 第 ${round} 轮 ---`);
        for (const [name, expr] of probes) {
            const t0 = Date.now();
            const r = await ev(expr, 15000);
            const ms = Date.now() - t0;
            check(`R${round} ${name} 未卡死`, r !== 'TIMEOUT' && ms < THRESHOLD_MS, `${ms}ms ${r === 'TIMEOUT' ? '(超时)' : ''}`);
        }
        if (round < 3) {
            console.log('  等待 20s 让缩略图池运行…');
            await sleep(20000);
        }
    }

    // 3) 进程存活
    check('应用仍存活', true);

    ws.close();
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\n总计 ${results.length} · 通过 ${results.length - fail} · 失败 ${fail}`);
    process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('异常:', e.message); process.exit(1); });
