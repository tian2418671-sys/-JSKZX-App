import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getPath, setPath, mergeDeep, extractMvu, parseMvuBlock, coalesceOps,
    applyRfc6902, createVariableEngine, applyOpTo, countVars
} from '../js/mobile/useChatVariables.js';
import { renderEjs, looksLikeEjs, buildTemplateContext, renderEjsItems } from '../js/mobile/useChatEjs.js';
import { segmentMessage, htmlNeedsIframe, buildHtmlSrcdoc, splitPending } from '../js/mobile/useChatRender.js';

// ============ 路径寻址 ============
test('getPath/setPath 点分寻址（对象+数组索引）', () => {
    const root = {};
    setPath(root, 'stat_data.世界.地点', '风崖城');
    assert.equal(getPath(root, 'stat_data.世界.地点'), '风崖城');
    setPath(root, 'stat_data.队伍.0.name', '艾瑞塔');
    assert.equal(getPath(root, 'stat_data.队伍.0.name'), '艾瑞塔');
    assert.ok(Array.isArray(root.stat_data.队伍));
    assert.equal(getPath(root, '不存在.路径'), undefined);
});

test('mergeDeep init 语义：递归并入不整树替换', () => {
    const t = { a: { x: 1, y: 2 } };
    mergeDeep(t, { a: { y: 99, z: 3 } });
    assert.deepEqual(t, { a: { x: 1, y: 99, z: 3 } });
});

// ============ MVU 解析：三种格式 ============
test('格式A：JSON 数组指令', () => {
    const text = '正文<UpdateVariable>[{"type":"set","path":"a.b","value":"V"},{"type":"add","path":"n","value":5}]</UpdateVariable>尾巴';
    const { ops, display } = extractMvu(text);
    assert.equal(ops.length, 2);
    assert.equal(ops[0].type, 'set');
    assert.equal(display, '正文尾巴');
});

test('格式B：简写行语法', () => {
    const ops = parseMvuBlock('_.$set stat_data.世界.地点 = 风崖城\n_.$add stat_data.资金 = 100\n_.$insert 队伍 = 新成员\n_.$del 临时标记 = x');
    assert.equal(ops.length, 4);
    assert.deepEqual(ops[0], { type: 'set', path: 'stat_data.世界.地点', value: '风崖城' });
    assert.equal(ops[1].type, 'add');
    assert.equal(ops[1].value, 100);
    assert.equal(ops[2].type, 'insert');
    assert.equal(ops[3].type, 'delete');
});

test('格式C：RFC6902 JSON Patch 自动识别', () => {
    const ops = parseMvuBlock('[{"op":"replace","path":"/stat_data/世界/地点","value":"海港"}]');
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, 'patch');
    const root = {};
    applyRfc6902(root, ops[0].ops);
    assert.equal(getPath(root, 'stat_data.世界.地点'), '海港');
});

test('RFC6902 test 失败抛错', () => {
    const root = { a: 1 };
    assert.throws(() => applyRfc6902(root, [{ op: 'test', path: '/a', value: 2 }]), /test failed/);
    assert.doesNotThrow(() => applyRfc6902(root, [{ op: 'test', path: '/a', value: 1 }]));
});

test('toTypedValue 类型化：数字/bool/null/JSON', () => {
    const ops = parseMvuBlock('_.$set a = 42\n_.$set b = true\n_.$set c = null\n_.$set d = {"x":1}');
    assert.equal(ops[0].value, 42);
    assert.equal(ops[1].value, true);
    assert.equal(ops[2].value, null);
    assert.deepEqual(ops[3].value, { x: 1 });
});

// ============ 同楼合并 ============
test('coalesceOps：同路径 Set 覆盖 + Add 折叠 + Init 重置', () => {
    const merged = coalesceOps([
        { type: 'set', path: 'p', value: 'A' },
        { type: 'set', path: 'p', value: 'B' },
        { type: 'add', path: 'n', value: 3 },
        { type: 'add', path: 'n', value: 4 }
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((o) => o.path === 'p').value, 'B');
    assert.equal(merged.find((o) => o.path === 'n').value, 7);

    const withInit = coalesceOps([
        { type: 'set', path: 'x', value: 1 },
        { type: 'init', data: { fresh: true } },
        { type: 'set', path: 'y', value: 2 }
    ]);
    assert.equal(withInit[0].type, 'init');
    assert.equal(withInit.length, 2);
});

// ============ 引擎：应用/快照/深度回看/持久化 ============
function memStorage() {
    const m = new Map();
    return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), _m: m };
}

test('onAiMessage：应用指令 + 剔除块 + OpLog 记录', () => {
    const eng = createVariableEngine({ storageKey: 'k1', storage: memStorage() });
    const display = eng.onAiMessage('她笑了。<UpdateVariable>_.$set stat_data.好感.老板娘 = 70</UpdateVariable>');
    assert.equal(display, '她笑了。');
    assert.equal(getPath(eng.root, 'stat_data.好感.老板娘'), 70);
    assert.equal(eng.log.length, 1);
    assert.equal(eng.aiCount, 1);
});

test('add 累加 + insert 数组 push', () => {
    const eng = createVariableEngine({ storageKey: 'k2', storage: memStorage() });
    eng.applyOps([{ type: 'set', path: '金币', value: 100 }]);
    eng.applyOps([{ type: 'add', path: '金币', value: 50 }]);
    assert.equal(getPath(eng.root, '金币'), 150);
    eng.applyOps([{ type: 'insert', path: '队伍', value: 'A' }, { type: 'insert', path: '队伍', value: 'B' }]);
    assert.deepEqual(getPath(eng.root, '队伍'), ['A', 'B']);
});

test('深度回看：getMessageVar(path, depth) 时间旅行', () => {
    const eng = createVariableEngine({ storageKey: 'k3', storage: memStorage() });
    eng.applyOps([{ type: 'set', path: 'hp', value: 100 }]);   // ai 0
    eng.applyOps([{ type: 'add', path: 'hp', value: -30 }]);    // ai 1 → 70
    eng.applyOps([{ type: 'add', path: 'hp', value: -20 }]);    // ai 2 → 50
    assert.equal(getPath(eng.root, 'hp'), 50);
    assert.equal(eng.getMessageVar('hp', 0), 50);   // 当前
    assert.equal(eng.getMessageVar('hp', 1), 70);   // 往回 1 楼
    assert.equal(eng.getMessageVar('hp', 2), 100);  // 往回 2 楼
    assert.equal(eng.getMessageVar('hp', 3), undefined); // 树空
});

test('持久化：restore 恢复完整状态', () => {
    const st = memStorage();
    const e1 = createVariableEngine({ storageKey: 'kp', storage: st });
    e1.applyOps([{ type: 'set', path: 'a.b', value: 'V' }, { type: 'insert', path: 'arr', value: 1 }]);
    const e2 = createVariableEngine({ storageKey: 'kp', storage: st });
    assert.equal(getPath(e2.root, 'a.b'), 'V');
    assert.deepEqual(getPath(e2.root, 'arr'), [1]);
    assert.equal(e2.log.length, 1); // 同楼合并成一条记录
});

test('损坏数据容错：restore 返回 false 不抛错', () => {
    const st = memStorage();
    st.set('bad', '{broken json');
    const eng = createVariableEngine({ storageKey: 'bad', storage: st });
    assert.deepEqual(eng.root, {});
});

test('reset 清空树+日志+存储', () => {
    const st = memStorage();
    const eng = createVariableEngine({ storageKey: 'kr', storage: st });
    eng.applyOps([{ type: 'set', path: 'x', value: 1 }]);
    eng.reset();
    assert.deepEqual(eng.root, {});
    assert.equal(eng.log.length, 0);
    assert.equal(st.get('kr'), null);
});

test('applyPatchDirect：EJS 宿主写入路径', () => {
    const eng = createVariableEngine({ storageKey: 'kpd', storage: memStorage() });
    eng.applyPatchDirect('[{"op":"add","path":"/stat_data/标记","value":"已获得"}]');
    assert.equal(getPath(eng.root, 'stat_data.标记'), '已获得');
    eng.applyPatchDirect({ op: 'replace', path: '/stat_data/标记', value: '已失去' });
    assert.equal(getPath(eng.root, 'stat_data.标记'), '已失去');
});

// ============ EJS 引擎 ============
test('looksLikeEjs 识别', () => {
    assert.equal(looksLikeEjs('<%= a %>'), true);
    assert.equal(looksLikeEjs('纯文本'), false);
    assert.equal(looksLikeEjs('<%% 转义 %>'), false);
});

test('<%= 转义输出 / <%- 原样输出', () => {
    assert.equal(renderEjs('<%= v %>', { v: '<b>x</b>' }), '&lt;b&gt;x&lt;/b&gt;');
    assert.equal(renderEjs('<%- v %>', { v: '<b>x</b>' }), '<b>x</b>');
});

test('<%% 字面量转义', () => {
    assert.equal(renderEjs('<%% code %>', {}), '<% code %>');
});

test('<% 逻辑语句：条件/循环', () => {
    const tpl = '<% if (n > 5) { %>大<% } else { %>小<% } %>';
    assert.equal(renderEjs(tpl, { n: 10 }), '大');
    assert.equal(renderEjs(tpl, { n: 1 }), '小');
    const loop = '<% for (const x of arr) { %>[<%= x %>]<% } %>';
    assert.equal(renderEjs(loop, { arr: [1, 2, 3] }), '[1][2][3]');
});

test('<%_ _%> 空白修剪（标准 EJS：<%_ 吃标签前空白，_%> 吃标签后空白）', () => {
    const tpl = 'A\n<%_\n  let v = 1;\n_%>\nB<%= v %>';
    assert.equal(renderEjs(tpl, {}), 'AB1');
    // 对照：普通 <% %> 不修剪，保留换行
    const plain = 'A\n<%\n  let v = 1;\n%>\nB<%= v %>';
    assert.equal(renderEjs(plain, {}), 'A\n\nB1');
});

test('宿主 API：getVariables / getvar / setvar / getChatMessage', () => {
    const eng = createVariableEngine({ storageKey: 'kejs', storage: memStorage() });
    eng.applyOps([{ type: 'set', path: 'stat_data.地点', value: '风崖城' }]);
    const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', swipes: ['S1|地点=海港|END'], index: 0 }
    ];
    const ctx = buildTemplateContext({ engine: eng, messages, messageTextOf: (m) => m.content || (m.swipes && m.swipes[m.index || 0]) || '' });
    // 变量树顶层展开 → 模板内裸写 stat_data
    assert.equal(renderEjs('<%= stat_data.地点 %>', ctx), '风崖城');
    assert.equal(renderEjs('<%= getvar("stat_data.地点") %>', ctx), '风崖城');
    // getChatMessage(-1, assistant) 回溯最新 AI 消息（方案条目51 场景）
    const tpl51 = `<%_
      let vLoc = '未知';
      for (let i = 1; i <= 12; i++) {
        const m = getChatMessage(-i, 'assistant');
        if (!m) continue;
        const seg = m.message.split('|');
        if (seg[1] && seg[1].includes('地点=')) { vLoc = seg[1].split('=')[1]; break; }
      }
    _%>地点是<%= vLoc %>`;
    assert.equal(renderEjs(tpl51, ctx), '地点是海港');
    // setvar 写回变量树
    renderEjs('<% setvar("stat_data.标记", "done") %>', ctx);
    assert.equal(getPath(eng.root, 'stat_data.标记'), 'done');
});

test('执行失败降级：fallback raw 返回原文', () => {
    const broken = '<%= 未定义变量.deep.prop %>';
    assert.equal(renderEjs(broken, {}, { fallback: 'raw' }), broken);
    assert.equal(renderEjs(broken, {}, { fallback: 'empty' }), '');
    assert.throws(() => renderEjs(broken, {}, { fallback: 'throw' }));
});

test('死循环守卫：步数预算截断', () => {
    const loop = '<% while(true){ } %>';
    const out = renderEjs(loop, {}, { fallback: 'raw' });
    assert.equal(out, loop); // 超预算 → 降级原文，不挂死
});

test('renderEjsItems 批量：只处理模板条目，开关关闭直通', () => {
    const items = [{ content: '纯文本' }, { content: '<%= 1+1 %>' }];
    const on = renderEjsItems(items, {}, true);
    assert.equal(on[0].content, '纯文本');
    assert.equal(on[1].content, '2');
    const off = renderEjsItems(items, {}, false);
    assert.equal(off[1].content, '<%= 1+1 %>');
});

test('countVars 统计叶子数', () => {
    assert.equal(countVars({ a: 1, b: { c: 2, d: [3, 4] } }), 4);
});

// ============ 分段渲染器 ============
test('segmentMessage：```html 围栏切分文本段/面板段', () => {
    const text = '前文\n```html\n<div class="panel">面板</div>\n```\n后文';
    const segs = segmentMessage(text);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].type, 'text');
    assert.equal(segs[0].content, '前文');
    assert.equal(segs[1].type, 'html');
    assert.ok(segs[1].content.includes('class="panel"'));
    assert.equal(segs[2].type, 'text');
    assert.equal(segs[2].content, '后文');
});

test('segmentMessage：无围栏 → 单文本段；空文本兜底', () => {
    assert.deepEqual(segmentMessage('纯文本'), [{ type: 'text', content: '纯文本' }]);
    assert.deepEqual(segmentMessage(''), [{ type: 'text', content: '' }]);
});

test('htmlNeedsIframe：style/script/html 文档判定', () => {
    assert.equal(htmlNeedsIframe('<style>.a{}</style><div>x</div>'), true);
    assert.equal(htmlNeedsIframe('<script>alert(1)</script>'), true);
    assert.equal(htmlNeedsIframe('<div>简单片段</div>'), false);
});

test('buildHtmlSrcdoc：片段包壳 + 变量桥 + 高度上报桥', () => {
    const doc = buildHtmlSrcdoc('<div>面板</div>', '{"stat_data":{"地点":"风崖城"}}', 'seg1_0');
    assert.ok(doc.startsWith('<!DOCTYPE html>'));
    assert.ok(doc.includes('getVariables'));
    assert.ok(doc.includes('jsx-panel-height'));
    assert.ok(doc.includes('"seg1_0"'));
    assert.ok(doc.includes('风崖城'));
});

test('splitPending：未闭合围栏挂起，已闭合直通', () => {
    const [ok1, pend1] = splitPending('前文\n```html\n<div>半截');
    assert.equal(pend1.startsWith('```html'), true);
    assert.equal(ok1.trim(), '前文');
    const [ok2, pend2] = splitPending('前文\n```html\n<div></div>\n```\n后文');
    assert.equal(pend2, '');
    assert.ok(ok2.includes('后文'));
});

console.log('MVU+EJS ALL PASS');
