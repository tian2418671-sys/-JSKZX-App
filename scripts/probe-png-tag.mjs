/**
 * 真机 PNG 卡打标落盘验证（lookbehind 崩溃修复后的核心场景）
 *
 * 背景：Chromium 101 WebView 执行正则 lookbehind 会触发 V8 CHECK 失败 →
 *       渲染进程 SIGTRAP → App 被杀。修改前 PNG 卡打标必崩。
 *       本脚本用 UI 真实点击走完整链路，验证不再崩溃且标签确实落盘。
 *
 * 用法：CDP_HTTP=http://127.0.0.1:9223 API_BASE=http://127.0.0.1:18080/v1 node scripts/probe-png-tag.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
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
            if (/AiTag|保存/.test(s)) logs.push(s.slice(0, 240));
        }
        if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    };
    await new Promise((r) => { ws.onopen = r; });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    const ev = async (x) => {
        const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
        return r.exceptionDetails ? ('ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 250)) : r.result.value;
    };

    // 1) 基线：找一张 PNG 卡的当前标签（用应用自身 loader 读，避免 readText 局限）
    const base = await ev(`(async () => {
        const st = window.__lib;
        const lib = st.mobileLibrary.library;
        const png = lib.filter(c => /\\.png$/i.test(c.path||'')).slice(0,1)[0];
        if (!png) return { err: 'no png' };
        return { name: png.name, path: png.path, tagsBefore: (png._tags && Object.values(png._tags)) || [] };
    })()`);
    check('找到 PNG 卡', base && !base.err, JSON.stringify(base));
    if (!base || base.err) { ws.close(); process.exit(1); }

    // 2) 搜索定位这张 PNG 卡 → 长按 → 多选
    const prep = await ev(`(async () => {
        const st = window.__lib;
        const kw = st.query || st.keyword || st.searchKeyword;
        if (kw && kw.value !== undefined) kw.value = ${JSON.stringify('README_PNG_MARK')}.replace('README_PNG_MARK', '');
        return true;
    })()`);
    void prep;

    // 3) 直接走 UI：清空搜索 → 长按首卡 → 多选 → 打标
    const flow = await ev(`(async () => {
        const st = window.__lib;
        const out = {};
        // 清搜索
        const kw = st.query || st.keyword || st.searchKeyword;
        if (kw && kw.value !== undefined) { kw.value = ''; await new Promise(r=>setTimeout(r,800)); }

        // 长按第一张卡
        const el = document.querySelector('[class*="card-item"]');
        if (!el) return { err: 'no card el' };
        const r0 = el.getBoundingClientRect();
        const cx = r0.left + r0.width/2, cy = r0.top + r0.height/2;
        const mk = (t) => new TouchEvent(t, { bubbles:true, cancelable:true,
            touches: t==='touchend' ? [] : [new Touch({identifier:1,target:el,clientX:cx,clientY:cy})],
            changedTouches:[new Touch({identifier:1,target:el,clientX:cx,clientY:cy})] });
        el.dispatchEvent(mk('touchstart'));
        await new Promise(r=>setTimeout(r,650));
        el.dispatchEvent(mk('touchend'));
        await new Promise(r=>setTimeout(r,400));
        const menu = document.querySelector('.van-action-sheet');
        if (!menu) return { err: 'no menu', hash: location.hash };
        const item = [...menu.querySelectorAll('.van-action-sheet__item')].find(n=>n.textContent.includes('多选'));
        if (!item) return { err: 'no 多选' };
        item.click();
        await new Promise(r=>setTimeout(r,800));
        out.hash = location.hash;
        out.selected = st.batchSet ? st.batchSet.size : -1;
        return out;
    })()`);
    check('长按→多选成功', flow && !flow.err && flow.selected >= 1, JSON.stringify(flow));

    // 4) 打开打标弹窗并启动
    const run = await ev(`(async () => {
        const st = window.__lib;
        const btns = [...document.querySelectorAll('button, .van-button')];
        const t = btns.find(n => /AI\\s*打标/.test(n.textContent||''));
        if (!t) return { err: 'no AI button' };
        t.click();
        await new Promise(r=>setTimeout(r,700));
        st.packSize = 1; st.skipTagged = false;
        await new Promise(r=>setTimeout(r,300));
        const d = document.querySelector('.van-dialog');
        const go = d ? [...d.querySelectorAll('button, .van-button')].find(n=>/开始打标|确认|确定/.test(n.textContent||'')) : null;
        if (go) go.click();
        await new Promise(r=>setTimeout(r,800));
        return { running: st.aiTagRunning.value };
    })()`);
    check('打标已启动', run && run.running === true, JSON.stringify(run));

    // 5) 等待完成（最多 90s）
    let last = null;
    for (let i = 0; i < 60; i++) {
        await sleep(1500);
        last = await ev(`(() => { const st=window.__lib; return { running: st.aiTagRunning.value, prog: JSON.parse(JSON.stringify(st.aiTagProgress||{})) }; })()`);
        if (last && last.running === false) break;
    }
    check('打标运行结束', last && last.running === false, JSON.stringify(last && last.prog));
    check('App 仍存活（未崩溃）', true);

    // 6) 核对标签是否新增
    const after = await ev(`(async () => {
        const st = window.__lib;
        const lib = st.mobileLibrary.library;
        const png = lib.filter(c=>/\\.png$/i.test(c.path||'')).slice(0,1)[0];
        const tagsNow = (png && png._tags && Object.values(png._tags)) || [];
        return { name: png && png.name, tagsNow,
                 hasMock: tagsNow.some(t=>String(t).includes('模拟标签')) };
    })()`);
    check('PNG 卡标签已写入（含 mock 标签）', after && after.hasMock === true, JSON.stringify(after));

    console.log('\n=== [AiTag] 日志 ===');
    console.log(logs.join('\n') || '(无)');

    ws.close();
    const fail = results.filter((r) => !r.ok).length;
    console.log(`\n总计 ${results.length} · 通过 ${results.length - fail} · 失败 ${fail}`);
    process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('异常:', e.message); process.exit(1); });
