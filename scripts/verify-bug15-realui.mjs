/**
 * BUG-15/16 真机端到端验证(依赖「冷重启后的干净 document」,故使用前请先 force-stop+start 应用)。
 * 流程:卡库 → 更多 → 查重 → 内容指纹 Tab → 轮询 DOM 终态。
 * 判定:
 *   PASS  = 扫描产出分组(.ddm-group ≥1,组内行 ≥2)且无 undefined TypeError
 *   FAIL1 = 从未出现「读取卡片 x/y」进度  → runScan 没触发(BUG-16)
 *   FAIL2 = errCapture 命中 undefined     → v.sig 未回填(BUG-15)
 * 用法: node scripts/verify-bug15-realui.mjs <ws>
 */
const WS = process.argv[2];
const ADB = process.env.ADB || 'E:\\AndroidSDK\\platform-tools\\adb.exe';

let seq = 0;
const pend = new Map();
let ws;

async function connect() {
    ws = new WebSocket(WS);
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pend.has(m.id)) {
            const cb = pend.get(m.id); pend.delete(m.id); clearTimeout(cb.timer);
            if (m.error) cb.res({ ERR: m.error.message });
            else if (m.result && m.result.exceptionDetails) cb.res({ EXC: (m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description) || 'exc' });
            else cb.res(m.result && m.result.result ? m.result.result.value : null);
        }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
}
function run(expr, to = 25000) {
    return new Promise((res) => {
        const id = ++seq;
        const timer = setTimeout(() => { pend.delete(id); res({ ERR: 'timeout' }); }, to + 4000);
        pend.set(id, { res, timer });
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, timeout: to } }));
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickWhere(findJs, label) {
    const r = await run(`(() => { const el = (${findJs}); if (!el) return 'NF'; el.click(); return 'OK'; })()`);
    const v = r && r.result && r.result.value !== undefined ? r.result.value : r;
    console.log(`  [click] ${label}: ${v}`);
    return v === 'OK';
}

function snap() {
    return run(`(() => {
        const st = document.querySelector('.ddm-status');
        const em = document.querySelector('.ddm-body .van-empty__description');
        const groups = document.querySelectorAll('.ddm-group').length;
        const rows = (groups ? document.querySelector('.ddm-group') : 0) ? document.querySelectorAll('.ddm-group')[0].querySelectorAll('.ddm-row').length : 0;
        const title = groups ? (document.querySelectorAll('.ddm-group')[0].querySelector('.ddm-group-title') || {}).textContent : '';
        return JSON.stringify({
            prog: st ? ((st.textContent || '').match(/读取卡片\\s*\\d+\\/\\d+/) || [''])[0] : '',
            empty: em ? (em.textContent || '').trim().slice(0, 50) : '',
            groups, rows,
            title: String(title || '').replace(/\\s+/g, ' ').trim().slice(0, 70),
            tyErr: (window.__errCap || []).some(e => /undefined/.test(e)),
            errs0: (window.__errCap || [])[0] || ''
        });
    })()`).then((v) => { const x = typeof v === 'string' ? v : '{}'; try { return JSON.parse(x); } catch (e) { return { raw: x }; } });
}

async function main() {
    await connect();
    await run(`(() => { if (!window.__errCap) { const o = console.error.bind(console); console.error = (...a) => { (window.__errCap = window.__errCap || []).push(a.map(x => String((x && x.message) || x)).join(' ').slice(0, 240)); return o(...a); }; } window.__errCap = []; return 1; })()`);
    console.log('冷启动页面 + 错误捕获就绪 ✓');

    if (!(await clickWhere(`document.querySelector('.nav-actions .van-icon-ellipsis')`, '更多'))) { console.log('FAIL: 首页未就绪'); ws.close(); process.exit(1); }
    await sleep(900);
    if (!(await clickWhere(`[...document.querySelectorAll('.van-action-sheet__item')].find(e => (e.textContent || '').includes('查重'))`, '查重'))) { console.log('FAIL: 查重入口未找到'); ws.close(); process.exit(1); }
    await sleep(1000);
    if (!(await clickWhere(`[...document.querySelectorAll('.ddm-tab')].find(e => (e.textContent || '').includes('内容指纹'))`, '内容指纹Tab'))) { console.log('FAIL: 弹窗未打开/Tab 缺失'); ws.close(); process.exit(1); }

    const deadline = Date.now() + 300000;
    let sawProg = false; let out = null; let lastLine = '';
    while (Date.now() < deadline) {
        await sleep(3000);
        const o = await snap();
        const line = JSON.stringify(o);
        if (line.includes('读取卡片') && !sawProg) { sawProg = true; console.log('  进度信号出现 ✓ 扫描触发'); }
        if (line !== lastLine) { console.log('[poll]', line.slice(0, 230)); lastLine = line; }
        if (o.groups > 0 && o.rows >= 2) { out = o; break; }
        if (sawProg && !o.prog && o.empty) { out = o; break; }
        if (o.tyErr) { out = o; break; }
    }

    console.log('\n=== 最终状态 ===');
    console.log(JSON.stringify(out, null, 1));
    const pass = out && out.groups > 0 && out.rows >= 2 && !out.tyErr;
    if (pass) console.log(`\nPASS: 内容查重产出真实分组「${out.title}」 ${out.rows} 行;相似度计算正常`);
    else if (!sawProg) console.log('\nFAIL(BUG-16): runScan 未触发');
    else if (out && out.tyErr) console.log(`\nFAIL(BUG-15): TypeError(${out.errs0})`);
    else console.log('\nFAIL: 扫描结束但未产出分组(out=' + JSON.stringify(out) + ')');
    ws.close();
    process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('ERR', (e && e.message) || e); process.exit(1); });
