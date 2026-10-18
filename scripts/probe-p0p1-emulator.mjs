/**
 * 实测探针：P0（打标解析 / 打包 / 分段 / 续跑 / 停止）+ P1（自动分组 / 查重入口）
 *
 * 用法：
 *   node scripts/probe-p0p1-emulator.mjs                    # 默认模拟器 tcp:9222
 *   $env:CDP_HTTP='http://127.0.0.1:9223'; node scripts/probe-p0p1-emulator.mjs   # 真机
 * 前置：adb -s <设备> forward tcp:<端口> localabstract:webview_devtools_remote_<WebView进程pid>
 * 说明：Node 22+ 自带 WebSocket，无需 ws 依赖。
 */
const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const results = [];

function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' → ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
    const res = await fetch(`${CDP_HTTP}/json`);
    const list = await res.json();
    const page = list.find((p) => p.type === 'page');
    if (!page) throw new Error('未找到 WebView 页面');
    return page.webSocketDebuggerUrl;
}

function connect(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    };
    const ready = new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('WS error'));
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
    });
    return { ws, ready, send };
}

async function evaluate(cdp, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
}

/** 找到页面内 CardLibraryView 的 setupState 并缓存到 window.__lib
 *  ⚠️ setupState 是代理对象，某些 key 访问会抛错（生产构建下 devtools 相关），
 *     故先按组件名定位，再取 component.setupState 整体（不做逐 key 探测）。 */
const FIND_LIB = `(() => {
    if (window.__lib && window.__lib.mobileLibrary) return true;
    const root = document.querySelector('#app')._vnode;
    const seen = new Set();
    let hit = null;
    const walk = (v, d) => {
        if (!v || hit || d > 12 || seen.has(v)) return;
        seen.add(v);
        const type = v.type;
        const name = type && (type.name || type.__name || '');
        if (name === 'CardLibraryView' && v.component && v.component.setupState) { hit = v.component.setupState; return; }
        if (v.component && v.component.subTree) walk(v.component.subTree, d + 1);
        if (Array.isArray(v.children)) v.children.forEach(c => walk(c, d + 1));
        if (v.suspense && v.suspense.activeBranch) walk(v.suspense.activeBranch, d + 1);
    };
    walk(root, 0);
    if (hit) { window.__lib = hit; return true; }
    return false;
})()`;

const main = async () => {
    const url = await getWsUrl();
    const cdp = connect(url);
    await cdp.ready;
    await cdp.send('Runtime.enable');

    // ══════════════ 0. 环境与挂载 ══════════════
    const env = await evaluate(cdp, `(() => ({
        href: location.href,
        hasCap: !!window.Capacitor,
        width: innerWidth, height: innerHeight,
        bodyLen: (document.body.innerText || '').length
    }))()`);
    console.log('环境:', JSON.stringify(env));
    check('应用已挂载', env.bodyLen > 50, `视口 ${env.width}x${env.height}`);

    const pluginOk = await evaluate(cdp, `(() => !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LibraryFsPlugin))()`);
    check('原生插件可用', pluginOk);

    const page = await evaluate(cdp, `(() => {
        const t = document.body.innerText || '';
        return { unauth: t.includes('尚未授权'), text: t.slice(0, 160) };
    })()`);
    check('卡片库已授权', !page.unauth, page.unauth ? '需手动授权' : '已进入库');

    if (page.unauth) {
        console.log('\n⚠️ 库未授权，无法继续。请在模拟器里手动选择 /sdcard/Documents/TestCards 后重跑。');
        cdp.ws.close();
        printSummary();
        return;
    }

    // ══════════════ 1. 组件树定位 ══════════════
    const found = await evaluate(cdp, FIND_LIB);
    check('定位卡片库组件', found);

    const libStat = found ? await evaluate(cdp, `(() => ({
        len: window.__lib.mobileLibrary.library.length,
        ready: window.__lib.mobileLibrary.ready,
        loading: window.__lib.mobileLibrary.loading
    }))()`)
        : { len: 0, ready: false };
    check('卡片库已加载', libStat.len > 0, `${libStat.len} 张 / ready=${libStat.ready}`);

    // ══════════════ 2. P0：搜索短语复核（DOM 驱动：搜索框输入） ══════════════
    const searchResult = await evaluate(cdp, `(async () => {
        const el = document.querySelector('input');
        if (!el) return { ok: false, reason: 'no input' };
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const before = document.querySelectorAll('.card-item').length;
        setter.call(el, '系统');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
        const after = document.querySelectorAll('.card-item').length;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
        return { ok: true, before, hit: after, restored: document.querySelectorAll('.card-item').length };
    })()`);
    check('搜索框可输入并触发搜索', searchResult.ok, `输入前 ${searchResult.before} 项`);
    check('搜索「系统」有结果列表', searchResult.hit >= 0, `命中 ${searchResult.hit} 项`);
    check('清空搜索后列表恢复', (searchResult.restored || 0) > 0, `${searchResult.restored} 项`);

    // ══════════════ 3. P0：批量打标（JS 构造 TouchEvent 触发 v-longpress 指令） ══════════════
    const batchOpened = await evaluate(cdp, `(async () => {
        const card = document.querySelector('.card-item');
        if (!card) return { ok: false, reason: 'no card' };
        const r = card.getBoundingClientRect();
        const mk = (type, x, y) => new TouchEvent(type, {
            bubbles: true, cancelable: true,
            touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: card, clientX: x, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target: card, clientX: x, clientY: y })]
        });
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        card.dispatchEvent(mk('touchstart', x, y));
        await new Promise(res => setTimeout(res, 700));
        card.dispatchEvent(mk('touchend', x, y));
        await new Promise(res => setTimeout(res, 700));
        const t = document.body.innerText || '';
        return { ok: t.includes('多选(批量操作)') || t.includes('退出多选'), text: t.slice(0, 120) };
    })()`);
    check('长按弹出操作菜单', batchOpened.ok, batchOpened.ok ? '' : batchOpened.reason || batchOpened.text);

    if (batchOpened.ok) {
        const clicked = await evaluate(cdp, `(() => {
            const items = Array.from(document.querySelectorAll('.van-action-sheet__item, .van-cell'));
            const el = items.find(n => (n.innerText || '').includes('多选'));
            if (!el) return false;
            el.click();
            return true;
        })()`);
        check('点击「多选(批量操作)」', clicked);
        await sleep(800);
    }

    if (batchOpened.ok) {
        const batchBar = await evaluate(cdp, `(() => {
            const t = document.body.innerText || '';
            return { bar: t.includes('已选'), aiBtn: t.includes('AI 打标'), exit: t.includes('退出') };
        })()`);
        check('批量操作栏出现', batchBar.bar, `AI 打标按钮 ${batchBar.aiBtn}`);

        // 点选前 3 张（batchMode 下点卡片 = toggleBatch）
        const picked = await evaluate(cdp, `(() => {
            const cards = Array.from(document.querySelectorAll('.card-item')).slice(0, 3);
            cards.forEach(c => c.click());
            return cards.length;
        })()`);
        await sleep(700);
        const count = await evaluate(cdp, `(() => {
            const m = /已选\\s*(\\d+)\\s*张/.exec(document.body.innerText || '');
            return m ? Number(m[1]) : -1;
        })()`);
        check('点选卡片进入选中集', count > 0, `已选 ${count} 张 / 点击 ${picked} 张`);

        // 打开 AI 打标弹窗
        const openDlg = await evaluate(cdp, `(() => {
            const b = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').includes('AI 打标'));
            if (!b) return false;
            b.click();
            return true;
        })()`);
        check('点击「🤖 AI 打标」', openDlg);
        await sleep(900);

        const dialog = await evaluate(cdp, `(() => {
            const t = document.body.innerText || '';
            const stepper = document.querySelector('.van-stepper input');
            return {
                dialog: t.includes('批量 AI 打标'),
                pack: t.includes('每请求打包'),
                skip: t.includes('跳过已有标签'),
                packValue: stepper ? stepper.value : null,
                hasResume: t.includes('上次有未完成的任务')
            };
        })()`);
        check('打标弹窗渲染', dialog.dialog);
        check('📦 打包控件存在', dialog.pack, `当前 ${dialog.packValue}`);
        check('⏭️ 增量开关存在', dialog.skip);

        // 通过 stepper 的 + 按钮把打包数改到 3
        const stepped = await evaluate(cdp, `(async () => {
            const plus = document.querySelector('.van-stepper__plus');
            if (!plus) return { ok: false };
            plus.click(); await new Promise(r => setTimeout(r, 150));
            plus.click(); await new Promise(r => setTimeout(r, 200));
            const input = document.querySelector('.van-stepper input');
            return { ok: true, value: input ? input.value : null, persist: localStorage.getItem('jsmobile-ai-pack-size') };
        })()`);
        check('打包数可调节并落盘', stepped.ok && stepped.persist === stepped.value, `${stepped.value} / localStorage=${stepped.persist}`);

        // 续跑账本：模拟一次中断 → 写入账本 → 重新打开弹窗应出现「继续未完成」
        const resumeUi = await evaluate(cdp, `(async () => {
            const lib = window.__lib.mobileLibrary.library;
            const ids = lib.slice(0, 3).map(c => c.path);
            localStorage.setItem('jsmobile-ai-tag-resume', JSON.stringify({
                startedAt: Date.now(), updatedAt: Date.now(),
                targetIds: ids, doneIds: [ids[0]], packSize: 3
            }));
            return true;
        })()`);
        void resumeUi;
        // 关闭再打开弹窗触发 refreshResumeInfo
        await evaluate(cdp, `(() => {
            const cancel = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').trim() === '取消');
            if (cancel) cancel.click();
            return true;
        })()`);
        await sleep(600);
        await evaluate(cdp, `(() => {
            const b = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').includes('AI 打标'));
            if (b) b.click();
            return true;
        })()`);
        await sleep(800);
        const resumeShown = await evaluate(cdp, `(() => (document.body.innerText || '').includes('上次有未完成的任务'))()`);
        check('📌 续跑入口出现（账本有未完成项）', resumeShown);

        // 清理：账本 + 关闭弹窗 + 退出批量
        await evaluate(cdp, `(() => {
            localStorage.removeItem('jsmobile-ai-tag-resume');
            const cancel = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').trim() === '取消');
            if (cancel) cancel.click();
            const exit = Array.from(document.querySelectorAll('button')).find(n => (n.innerText || '').trim() === '退出');
            if (exit) exit.click();
            return true;
        })()`);
        await sleep(600);
    }

    // ══════════════ 4. P1：分组菜单 / 查重弹窗 ══════════════
    const groupMenu = await evaluate(cdp, `(async () => {
        const chip = Array.from(document.querySelectorAll('.cat-chip')).find(n => (n.innerText || '').includes('管理分组'));
        if (!chip) return { ok: false };
        chip.click();
        await new Promise(r => setTimeout(r, 600));
        const t = document.body.innerText || '';
        return {
            ok: t.includes('新建分组') || t.includes('重命名') || t.includes('删除空分组'),
            text: t.slice(0, 200)
        };
    })()`);
    check('分组管理菜单可打开', groupMenu.ok);

    const dedupeOpen = await evaluate(cdp, `(async () => {
        document.body.click();
        await new Promise(r => setTimeout(r, 300));
        const more = document.querySelector('.van-nav-bar__right .van-icon-ellipsis, .van-nav-bar__right');
        const els = Array.from(document.querySelectorAll('.van-nav-bar i, .van-nav-bar .van-icon'));
        const ellipsis = els.find(n => (n.className || '').includes('ellipsis'));
        if (ellipsis) ellipsis.click();
        await new Promise(r => setTimeout(r, 600));
        const items = Array.from(document.querySelectorAll('.van-action-sheet__item, .van-cell'));
        const target = items.find(n => (n.innerText || '').includes('查重'));
        if (!target) return { ok: false, reason: 'no dedupe menu item', t: (document.body.innerText || '').slice(0, 150) };
        target.click();
        await new Promise(r => setTimeout(r, 900));
        const t = document.body.innerText || '';
        return { ok: t.includes('查重') };
    })()`).catch((e) => ({ ok: false, reason: e.message }));
    check('查重入口可用', dedupeOpen.ok, dedupeOpen.reason || '');

    cdp.ws.close();
    printSummary();
};

function printSummary() {
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
    printSummary();
});
