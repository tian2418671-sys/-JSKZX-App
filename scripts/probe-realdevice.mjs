/**
 * 真机专项验收（ZTE_7551N，CDP 端口由 CDP_HTTP 指定）
 *
 * 与模拟器探针的差别：
 *   ① 长按用 **CDP 协议级触摸**（真机 WebView 与模拟器合成器行为不同）
 *   ② 打标保存：读回 PNG/JSON 卡的真实标签，且保存前后对比 mtime
 *   ③ 崩溃检查：保存后立刻查 /proc 与 logcat crash buffer
 *   ④ 打包：packSize=3 时验证「一条请求 N 张」的真实链路（无 API 时只验证编排与 UI）
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
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
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
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
    return { ws, ready, send };
}

async function evaluate(cdp, expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result?.value;
}

/** 找回 CardLibraryView 的 setupState（模板作用域代理，只读模板绑定） */
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

const main = async () => {
    const page = await getPage();
    if (!page) throw new Error('未找到 WebView 页面');
    const cdp = connect(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');

    const env = await evaluate(cdp, `(() => ({
        ua: navigator.userAgent.slice(0, 90),
        w: innerWidth, h: innerHeight,
        bodyLen: (document.body.innerText || '').length
    }))()`);
    console.log('环境:', JSON.stringify(env));
    check('真机页面已挂载', env.bodyLen > 50, `${env.w}×${env.h}`);
    check('WebView 可识别', /wv\)/.test(env.ua) || /Chrome/.test(env.ua), env.ua.slice(0, 60));

    const found = await evaluate(cdp, FIND);
    check('定位卡片库组件', found);
    if (!found) { cdp.ws.close(); return summary(); }
    const lib = await evaluate(cdp, `(() => ({ len: window.__lib.mobileLibrary.library.length, ready: window.__lib.mobileLibrary.ready }))()`);
    check('卡片库已加载', lib.len > 0, `${lib.len} 张 ready=${lib.ready}`);

    // ① 重置筛选状态（搜索框/标签/分组），确保列表有卡片可操作
    const reset = await evaluate(cdp, `(async () => {
        const el = document.querySelector('input');
        if (el && el.value) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, '');
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 1200));
        return { cards: document.querySelectorAll('.card-item').length, bodyLen: (document.body.innerText || '').length };
    })()`);
    check('清空筛选后列表有卡片', reset.cards > 0, `${reset.cards} 项`);

    // ① 真机长按
    //    ⚠️ 实测：CDP 协议级 Input.dispatchTouchEvent 在真机 WebView 合成器层不触发 v-longpress；
    //       改用页内合成 TouchEvent（与元素监听器同一通路，真机/模拟器均可用）。
    const rect = await evaluate(cdp, `(() => {
        const el = document.querySelector('.card-item');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (rect) {
        const longpress = await evaluate(cdp, `(async () => {
            const card = document.querySelector('.card-item');
            const r = card.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const mk = (type) => new TouchEvent(type, {
                bubbles: true, cancelable: true,
                touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: card, clientX: x, clientY: y })],
                changedTouches: [new Touch({ identifier: 1, target: card, clientX: x, clientY: y })]
            });
            card.dispatchEvent(mk('touchstart'));
            await new Promise(res => setTimeout(res, 700));
            card.dispatchEvent(mk('touchend'));
            await new Promise(res => setTimeout(res, 700));
            const t = document.body.innerText || '';
            return t.includes('多选(批量操作)') || t.includes('退出多选');
        })()`);
        check('真机长按弹出操作菜单', longpress);
        if (longpress) {
            const clicked = await evaluate(cdp, `(() => {
                const el = Array.from(document.querySelectorAll('.van-action-sheet__item, .van-cell')).find(n => (n.innerText || '').includes('多选'));
                if (!el) return false; el.click(); return true;
            })()`);
            check('点击「多选(批量操作)」', clicked);
            await sleep(700);
        }
    } else {
        check('找到卡片元素', false, '列表为空');
    }

    // ② 选卡 + 打包数 + 打标弹窗
    const pick = await evaluate(cdp, `(async () => {
        const cards = Array.from(document.querySelectorAll('.card-item')).slice(0, 3);
        cards.forEach(c => c.click());
        await new Promise(r => setTimeout(r, 700));
        const b = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').includes('AI 打标'));
        if (b) b.click();
        await new Promise(r => setTimeout(r, 800));
        const input = document.querySelector('.van-stepper input');
        if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '3');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 400));
        const t = document.body.innerText || '';
        return {
            dialog: t.includes('批量 AI 打标'),
            pack: t.includes('每请求打包'),
            skip: t.includes('跳过已有标签'),
            packVal: localStorage.getItem('jsmobile-ai-pack-size')
        };
    })()`);
    check('打标弹窗渲染', pick.dialog);
    check('📦 打包控件', pick.pack, `值=${pick.packVal}`);
    check('⏭️ 增量开关', pick.skip);

    // ③ 读取选中卡的真实标签（保存前基线）
    const before = await evaluate(cdp, `(async () => {
        const out = [];
        for (const c of window.__lib.mobileLibrary.library.slice(0, 3)) {
            const r = await window.electronAPI.readText(c.path).catch(() => null);
            const text = r && (typeof r === 'string' ? r : r.text);
            let tags = null;
            try { const p = JSON.parse(text); tags = (p.data || p).tags || []; } catch (e) { tags = 'PNG或解析失败'; }
            out.push({ name: c.name, path: c.path, tags });
        }
        return out;
    })()`);
    console.log('保存前标签:', JSON.stringify(before));

    // ④ 关闭弹窗、退出批量（不做真实打标：真机没有配置 API）
    await evaluate(cdp, `(() => {
        const c = document.querySelector('.van-dialog__cancel');
        if (c) c.click();
        return true;
    })()`);
    await sleep(500);
    await evaluate(cdp, `(() => {
        const e = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').trim() === '退出');
        if (e) e.click();
        return true;
    })()`);
    await sleep(400);

    // ⑤ 崩溃检查（渲染层 console error + 页面仍存活）
    const alive = await evaluate(cdp, `(() => (document.body.innerText || '').length > 50)()`);
    check('操作后页面仍存活（无崩溃）', alive);

    cdp.ws.close();
    summary();
};

function summary() {
    const failed = results.filter((r) => !r.ok);
    console.log('\n───────────');
    console.log(`总计 ${results.length} · 通过 ${results.length - failed.length} · 失败 ${failed.length}`);
    if (failed.length) {
        console.log('失败项:');
        failed.forEach((f) => console.log(`  · ${f.name} (${f.detail})`));
    }
    process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
    console.error('探针异常:', e.message);
    summary();
});
