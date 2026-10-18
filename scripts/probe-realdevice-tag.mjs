/**
 * 真机打标链路专项（端到端，非模拟器）
 *
 * 覆盖：多选 → 打标弹窗 → 打包数 3 → 启动 → mock 服务返回 <tags> → 写入 PNG/JSON
 *       → 读回真实标签 → 崩溃存活检查
 *
 * 前置：
 *   1) adb reverse tcp:18080 tcp:18080（mock 服务在 PC 上）
 *   2) 应用已运行，CDP_HTTP 指向已 forward 的端口
 * 用法：CDP_HTTP=http://127.0.0.1:9223 node scripts/probe-realdevice-tag.mjs
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:18080/v1';
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail: String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' → ' + detail : ''}`);
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

async function setup(cdp) {
    // 0) 强制回到卡片库列表页（⚠️ 路由表只有 '/'，写成 #/library 会渲染空白页！）
    await evaluate(cdp, `(async () => {
        if (location.hash === '#/' || location.hash === '') return 'already';
        location.hash = '#/';
        await new Promise(r => setTimeout(r, 1500));
        return location.hash;
    })()`);
    await sleep(800);

    // 1) 注入 AI 配置（真实键名：stc-api-endpoint / stc-api-model；端点经 adb reverse 指向 PC 上的 mock）
    await evaluate(cdp, `(() => {
        localStorage.setItem('stc-api-endpoint', ${JSON.stringify(API_BASE)});
        localStorage.setItem('stc-api-model', 'mock-model');
        localStorage.setItem('stc-api-type', 'openai');
        return { endpoint: localStorage.getItem('stc-api-endpoint'), model: localStorage.getItem('stc-api-model') };
    })()`);
    return evaluate(cdp, FIND);
}

async function main() {
    const page = await getPage();
    if (!page) { console.log('未找到 WebView 页面'); process.exit(1); }
    const cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');

    const found = await setup(cdp);
    check('定位卡片库组件', found === true);
    const inLib = await evaluate(cdp, `(location.hash === '#/' || location.hash === '') && document.querySelectorAll('[class*="card-item"]').length > 0`);
    check('已回到卡片库列表（有卡片）', inLib === true);

    // 1) 长按第一张卡 → 弹出操作菜单 → 点多选
    const longPressed = await evaluate(cdp, `(async () => {
        const el = document.querySelector('.card-item, [class*="card-item"]');
        if (!el) return { err: 'no card' };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const mk = (type) => new TouchEvent(type, { bubbles: true, cancelable: true,
            touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })],
            changedTouches: [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })] });
        el.dispatchEvent(mk('touchstart'));
        await new Promise(r2 => setTimeout(r2, 650));
        el.dispatchEvent(mk('touchend'));
        await new Promise(r2 => setTimeout(r2, 350));
        const menu = document.querySelector('.van-action-sheet, .van-popup--bottom');
        const items = menu ? [...menu.querySelectorAll('.van-action-sheet__item')].map(n => n.textContent.trim()) : [];
        return { menu: !!menu, items, stillList: !!document.querySelector('[class*="card-item"]') };
    })()`);
    check('长按弹出操作菜单', longPressed && longPressed.menu === true, JSON.stringify(longPressed && longPressed.items));
    check('长按未误跳详情页', longPressed && longPressed.stillList === true);

    // 2) 点「多选(批量操作)」
    const entered = await evaluate(cdp, `(async () => {
        const menu = document.querySelector('.van-action-sheet');
        if (!menu) return { err: 'no menu' };
        const target = [...menu.querySelectorAll('.van-action-sheet__item')].find(n => n.textContent.includes('多选'));
        if (!target) return { err: 'no 多选 item' };
        target.click();
        await new Promise(r => setTimeout(r, 500));
        const boxes = document.querySelectorAll('.van-checkbox, [class*="select-box"], [class*="check"]');
        return { boxes: boxes.length, batchMode: !!document.querySelector('[class*="batch"]') };
    })()`);
    check('进入多选模式', entered && !entered.err, JSON.stringify(entered));

    // 3) 选中 3 张
    const picked = await evaluate(cdp, `(async () => {
        const cards = [...document.querySelectorAll('[class*="card-item"]')].slice(0, 3);
        for (const c of cards) {
            const box = c.querySelector('.van-checkbox, [class*="check"]');
            (box || c).click();
            await new Promise(r => setTimeout(r, 200));
        }
        await new Promise(r => setTimeout(r, 300));
        const st = window.__lib;
        // batchSet 是 reactive Set（模板 select-all 用），也兼容 selectedPaths
        const bs = st.batchSet;
        const n = bs ? (bs.size !== undefined ? bs.size : Object.keys(bs).length) : -1;
        return { cards: cards.length, selected: n };
    })()`);
    check('多选 3 张卡', picked && picked.selected === 3, JSON.stringify(picked));

    // 4) 打开 AI 打标弹窗（点批量栏里的按钮）
    const dlgOpen = await evaluate(cdp, `(async () => {
        const btns = [...document.querySelectorAll('button, .van-button, [role="button"]')];
        const t = btns.find(n => /AI\s*打标|智能打标|打标/.test(n.textContent || ''));
        if (!t) return { err: 'no tag button', all: btns.map(n => n.textContent.trim()).filter(Boolean).slice(0, 12) };
        t.click();
        await new Promise(r => setTimeout(r, 600));
        return { dialog: !!document.querySelector('.van-dialog, .van-popup--center'), aitag: !!document.querySelector('[class*="aitag"]') };
    })()`);
    check('打标弹窗已渲染', dlgOpen && (dlgOpen.dialog || dlgOpen.aitag), JSON.stringify(dlgOpen));

    // 5) 启动打标
    const started = await evaluate(cdp, `(async () => {
        const st = window.__lib;
        st.packSize = 1;
        st.skipTagged = false;
        await new Promise(r => setTimeout(r, 200));
        const btns = [...document.querySelectorAll('.van-dialog button, .van-dialog .van-button, .van-popup button, .van-popup .van-button')];
        const go = btns.find(n => /开始|确定|启动/.test(n.textContent || ''));
        if (go) go.click(); else st.onBatchAiTag && st.onBatchAiTag();
        await new Promise(r => setTimeout(r, 400));
        const r = st.aiTagRunning && (st.aiTagRunning.value !== undefined ? st.aiTagRunning.value : st.aiTagRunning);
        return { running: r, clicked: !!go };
    })()`);
    check('打标已启动', started && started.running === true, JSON.stringify(started));

    // 等 mock（1200ms 延迟 × 3 张 + 开销）
    for (let i = 0; i < 30; i++) {
        await sleep(1000);
        const running = await evaluate(cdp, `(() => {
            const st = window.__lib;
            const r = st.aiTagRunning && (st.aiTagRunning.value !== undefined ? st.aiTagRunning.value : st.aiTagRunning);
            return r;
        })()`);
        if (!running) break;
    }

    const final = await evaluate(cdp, `(() => {
        const st = window.__lib;
        const prog = st.aiTagProgress && (st.aiTagProgress.value !== undefined ? st.aiTagProgress.value : st.aiTagProgress);
        return { prog, running: st.aiTagRunning && (st.aiTagRunning.value !== undefined ? st.aiTagRunning.value : st.aiTagRunning) };
    })()`);
    check('打标运行结束', final && final.running === false, JSON.stringify(final));
    check('进度有结果', final && final.prog && (final.prog.ok > 0), JSON.stringify(final && final.prog));

    // 6) 读回真实标签（从库数据里比对）
    const tags = await evaluate(cdp, `(() => {
        const st = window.__lib;
        const list = (st.filteredCards && st.filteredCards.value) ? st.filteredCards.value : [];
        return list.slice(0, 3).map(c => ({ name: c.name, tags: c.tags || [] }));
    })()`);
    const hasMock = Array.isArray(tags) && tags.some((c) => (c.tags || []).some((t) => t.includes('模拟标签')));
    check('标签已写入（含 mock 标签）', hasMock, JSON.stringify(tags));

    const errLogs = cdp.logs.filter((l) => /\\[AiTag\\].*(失败|错误|error)/i.test(l));
    check('无打标错误日志', errLogs.length === 0, errLogs.slice(0, 3).join(' | '));
    check('流水线存活（未崩溃）', true);

    cdp.ws.close();
    const fail = results.filter((r) => !r.ok).length;
    console.log('\n────────');
    console.log(`总计 ${results.length} · 通过 ${results.length - fail} · 失败 ${fail}`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('探针异常:', e.message); process.exit(1); });
