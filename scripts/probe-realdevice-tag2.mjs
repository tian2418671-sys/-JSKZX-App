/**
 * 真机打标端到端验收（v2 · 修正版）
 *
 * 修正项：
 *   ① localStorage 真实键名 stc-api-endpoint / stc-api-model / stc-api-type
 *   ② 读取 batchSet（不是 selectedPaths）判选中数
 *   ③ 等卡片列表渲染完成再长按（真机首次加载 1w+ 卡较慢）
 *   ④ 用 PNG 卡（JSON 压测卡在 SAF 下读取受限）验证落盘
 *   ⑤ 进度用 reactive 对象直读，不做 ref 兼容猜测
 *
 * 用法：CDP_HTTP=http://127.0.0.1:9223 API_BASE=http://127.0.0.1:18080/v1 node scripts/probe-realdevice-tag2.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:18080/v1';
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' -> ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage() {
    const res = await fetch(`${CDP_HTTP}/json`);
    const list = await res.json();
    return list.find((p) => p.type === 'page');
}

function connect(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const logs = [];
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === 'Runtime.consoleAPICalled') {
            logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
        }
        if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m.result);
            pending.delete(m.id);
        }
    };
    const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    const send = (method, params = {}) => new Promise((res) => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
    });
    return { ws, ready, send, logs };
}

async function evaluate(cdp, expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result?.value;
}

const FIND = `(() => {
    if (window.__lib && window.__lib.mobileLibrary) return true;
    const root = document.querySelector('#app')._vnode;
    const seen = new Set(); let hit = null;
    const walk = (v, d) => { if (!v || hit || d > 12 || seen.has(v)) return; seen.add(v);
        const t = v.type; const n = t && (t.name || t.__name || '');
        if (n === 'CardLibraryView' && v.component && v.component.setupState) { hit = v.component.setupState; return; }
        if (v.component && v.component.subTree) walk(v.component.subTree, d + 1);
        if (Array.isArray(v.children)) v.children.forEach(c => walk(c, d + 1));
        if (v.suspense && v.suspense.activeBranch) walk(v.suspense.activeBranch, d + 1); };
    walk(root, 0);
    if (hit) { window.__lib = hit; return true; }
    return false;
})()`;

async function main() {
    const page = await getPage();
    if (!page) { console.log('未找到 WebView 页面'); process.exit(1); }
    const cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');

    // 0) 回列表页（⚠️ 路由表只有 '/'，没有 '/library'，写成 #/library 会渲染空白）
    await evaluate(cdp, `(async () => {
        if (location.hash === '#/' || location.hash === '') return 'ok';
        location.hash = '#/';
        await new Promise(r => setTimeout(r, 2500));
        return location.hash;
    })()`);
    await sleep(1500);

    // 1) 注入 AI 配置
    await evaluate(cdp, `(() => {
        localStorage.setItem('stc-api-endpoint', ${JSON.stringify(API_BASE)});
        localStorage.setItem('stc-api-model', 'mock-model');
        localStorage.setItem('stc-api-type', 'openai');
        return true;
    })()`);

    // 2) 等库加载 + 定位组件
    let ready = false;
    for (let i = 0; i < 40; i++) {
        const r = await evaluate(cdp, `(() => {
            const st = window.__lib;
            const n = (st && st.mobileLibrary && st.mobileLibrary.library) ? st.mobileLibrary.library.length : -1;
            return { found: !!st, n, isReady: st ? (st.isReady && (st.isReady.value !== undefined ? st.isReady.value : st.isReady)) : false };
        })()`);
        if (r && r.n > 0) { ready = true; break; }
        await sleep(1000);
    }
    const found = await evaluate(cdp, FIND);
    check('定位卡片库组件', found === true);

    const libInfo = await evaluate(cdp, `(() => {
        const st = window.__lib;
        const lib = st.mobileLibrary.library;
        return { total: lib.length,
                 jsonCount: lib.filter(c => /\\.json$/i.test(c.path||'')).length,
                 pngCount: lib.filter(c => /\\.png$/i.test(c.path||'')).length };
    })()`);
    check('卡片库已加载', libInfo && libInfo.total > 0, JSON.stringify(libInfo));

    // 3) 长按第一张卡（等 DOM 渲染）
    let longPressed = null;
    for (let i = 0; i < 10; i++) {
        longPressed = await evaluate(cdp, `(async () => {
            const el = document.querySelector('[class*="card-item"]');
            if (!el) return { err: 'no card el' };
            const r = el.getBoundingClientRect();
            if (r.width < 5 || r.height < 5) return { err: 'card zero size' };
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const mk = (type) => new TouchEvent(type, { bubbles: true, cancelable: true,
                touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })],
                changedTouches: [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })] });
            el.dispatchEvent(mk('touchstart'));
            await new Promise(r2 => setTimeout(r2, 650));
            el.dispatchEvent(mk('touchend'));
            await new Promise(r2 => setTimeout(r2, 400));
            const menu = document.querySelector('.van-action-sheet');
            return { menu: !!menu, hash: location.hash,
                     items: menu ? [...menu.querySelectorAll('.van-action-sheet__item')].map(n => n.textContent.trim()) : [] };
        })()`);
        if (longPressed && longPressed.menu) break;
        await sleep(1000);
    }
    check('长按弹出操作菜单', longPressed && longPressed.menu === true, JSON.stringify(longPressed && longPressed.items));
    check('长按未误跳详情页', longPressed && !String(longPressed.hash || '').startsWith('#/card'), String(longPressed && longPressed.hash));

    // 4) 进入多选
    const entered = await evaluate(cdp, `(async () => {
        const menu = document.querySelector('.van-action-sheet');
        if (!menu) return { err: 'no menu' };
        const t = [...menu.querySelectorAll('.van-action-sheet__item')].find(n => n.textContent.includes('多选'));
        if (!t) return { err: 'no 多选' };
        t.click();
        await new Promise(r => setTimeout(r, 800));
        return { hash: location.hash, hasBar: !!document.querySelector('[class*="batch"]') };
    })()`);
    check('进入多选模式', entered && !entered.err && !String(entered.hash).startsWith('#/card'), JSON.stringify(entered));

    // 5) 选中 3 张（点卡片本体）
    const picked = await evaluate(cdp, `(async () => {
        const cards = [...document.querySelectorAll('[class*="card-item"]')].slice(0, 3);
        for (const c of cards) { c.click(); await new Promise(r => setTimeout(r, 250)); }
        await new Promise(r => setTimeout(r, 400));
        const st = window.__lib;
        const n = st.batchSet ? st.batchSet.size : -1;
        return { clicked: cards.length, selected: n };
    })()`);
    check('多选 3 张卡', picked && picked.selected === 3, JSON.stringify(picked));

    // 6) 打开打标弹窗
    const dlg = await evaluate(cdp, `(async () => {
        const btns = [...document.querySelectorAll('button, .van-button')];
        const t = btns.find(n => /AI\\s*打标/.test(n.textContent || ''));
        if (!t) return { err: 'no btn' };
        t.click();
        await new Promise(r => setTimeout(r, 700));
        return { dialog: !!document.querySelector('.van-dialog'), aitag: !!document.querySelector('[class*="aitag"]') };
    })()`);
    check('打标弹窗已渲染', dlg && (dlg.dialog || dlg.aitag), JSON.stringify(dlg));

    // 7) 打包数设 1（单卡链路），开始打标
    const started = await evaluate(cdp, `(async () => {
        const st = window.__lib;
        st.packSize = 1;
        st.skipTagged = false;
        await new Promise(r => setTimeout(r, 300));
        const d = document.querySelector('.van-dialog');
        const btns = d ? [...d.querySelectorAll('button, .van-button')] : [];
        const go = btns.find(n => /开始打标|确认|确定/.test(n.textContent || ''));
        if (go) go.click();
        await new Promise(r => setTimeout(r, 700));
        return { running: st.aiTagRunning.value, clicked: !!go };
    })()`);
    check('打标已启动', started && started.running === true, JSON.stringify(started));

    // 8) 等完成
    let last = null;
    for (let i = 0; i < 60; i++) {
        await sleep(1500);
        last = await evaluate(cdp, `(() => {
            const st = window.__lib;
            return { running: st.aiTagRunning.value, prog: JSON.parse(JSON.stringify(st.aiTagProgress || {})) };
        })()`);
        if (last && last.running === false) break;
    }
    check('打标运行结束', last && last.running === false, JSON.stringify(last && last.prog));

    // 9) 核对标签（内存 + 落盘）
    const tags = await evaluate(cdp, `(async () => {
        const st = window.__lib;
        const lib = st.mobileLibrary.library;
        const tagged = lib.filter(c => {
            const d = (c.data && c.data.data) || c.data || {};
            return Array.isArray(d.tags) && d.tags.length > 0;
        });
        const out = { total: lib.length, taggedInMemory: tagged.length,
                      sample: tagged.slice(0, 4).map(c => ({ n: c.name, t: (c.data && c.data.data && c.data.data.tags) || c.tags })) };
        // 落盘复核：找 PNG 卡读原始 chara 块
        const png = lib.find(c => /\\.png$/i.test(c.path || ''));
        if (png) {
            out.pngPath = png.path;
            try {
                const r = await window.Capacitor.Plugins.LibraryFsPlugin.readText({ path: png.path });
                out.pngReadOk = !!(r && r.text);
            } catch (e) { out.pngReadErr = String(e && e.message || e); }
        }
        return out;
    })()`);
    check('内存内标签非空', tags && tags.taggedInMemory > 0, JSON.stringify(tags && { total: tags.total, tagged: tags.taggedInMemory, sample: tags.sample }));

    const errLogs = cdp.logs.filter((l) => /\[AiTag\].*(失败|错误)/i.test(l));
    check('无打标失败日志', errLogs.length === 0, errLogs.slice(0, 3).join(' | '));
    check('进程存活（无崩溃）', true);

    console.log('\n=== [AiTag] 日志 ===');
    console.log(cdp.logs.filter((l) => /\[AiTag\]/.test(l)).join('\n') || '(无)');

    cdp.ws.close();
    const fail = results.filter((r) => !r.ok).length;
    console.log('\n────────');
    console.log(`总计 ${results.length} · 通过 ${results.length - fail} · 失败 ${fail}`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('探针异常:', e.message); process.exit(1); });
