/**
 * 测卡分段渲染单测（useChatRender）
 * 覆盖:分段切分、裸 HTML 模板段升级(正则输出无围栏面板)、变量桥注入
 *      (getVariables 必须返回对象而非字符串——双重序列化回归)、</script 防破出、
 *      流式挂起检测。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
    segmentMessage,
    htmlNeedsIframe,
    promoteHtmlSegments,
    buildHtmlSrcdoc,
    splitPending
} from '../js/mobile/useChatRender.js';

test('segmentMessage 切分 ```html 围栏与普通文本', () => {
    const segs = segmentMessage('前面文字\n```html\n<div class="p">x</div>\n```\n后面文字');
    assert.deepEqual(segs.map((s) => s.type), ['text', 'html', 'text']);
    assert.ok(segs[1].content.includes('class="p"'));
    assert.equal(segs[0].content, '前面文字');
    assert.equal(segs[2].content, '后面文字');
});

test('segmentMessage 空文本返回单空段', () => {
    const segs = segmentMessage('   \n ');
    assert.deepEqual(segs, [{ type: 'text', content: '' }]);
});

test('htmlNeedsIframe 识别 style/script/html 结构', () => {
    assert.equal(htmlNeedsIframe('<style>.x{color:red}</style><div>x</div>'), true);
    assert.equal(htmlNeedsIframe('<script>a()</script>'), true);
    assert.equal(htmlNeedsIframe('<html><body>x</body></html>'), true);
    assert.equal(htmlNeedsIframe('<div class="p">普通面板</div>'), false);
    assert.equal(htmlNeedsIframe('纯文本无标签'), false);
});

test('promoteHtmlSegments 把裸完整模板段升级为 html 段(正则输出无围栏面板)', () => {
    // 模拟:酒馆正则把 <S1>x</S1> 替换为 <style>+<div> 完整面板,不带 ```html 围栏
    const segs = segmentMessage('<style>.panel{border:1px solid gold}</style><div class="panel">内容</div>');
    assert.equal(segs[0].type, 'text'); // 切分阶段仍是文本段
    const promoted = promoteHtmlSegments(segs);
    assert.equal(promoted[0].type, 'html'); // 升级后走 sandbox iframe
    assert.ok(promoted[0].content.includes('.panel'));
    // 纯文本不误升级
    assert.equal(promoteHtmlSegments([{ type: 'text', content: '普通文本' }])[0].type, 'text');
    // 简单 div 不升级(白名单可安全清洗)
    assert.equal(promoteHtmlSegments([{ type: 'text', content: '<div class="a">b</div>' }])[0].type, 'text');
});

test('buildHtmlSrcdoc getVariables 返回对象(双重序列化回归)', () => {
    const vars = '{"stat_data":{"hp":10,"name":"星野"}}';
    const srcdoc = buildHtmlSrcdoc('<div class="p">x</div>', vars, 'p1');
    // 注入的 getVariables 直接内联 JSON 文本(不是 JSON.parse 二次解析的字符串)
    assert.ok(srcdoc.includes('return {"stat_data":{"hp":10,"name":"星野"}};'));
    assert.ok(!srcdoc.includes('JSON.parse("'), '不得二次序列化');
    // 片段被包壳为完整文档
    assert.ok(srcdoc.includes('<!DOCTYPE html>'));
    assert.ok(srcdoc.includes('jsx-panel-height'));
    assert.ok(srcdoc.includes('"p1"'));
});

test('buildHtmlSrcdoc 变量含 </script 时防破出', () => {
    const vars = '{"stat_data":{"x":"</script><script>alert(1)"}}';
    const srcdoc = buildHtmlSrcdoc('<div>x</div>', vars, 'p2');
    // 注入的桥接脚本内不得出现闭合 script 标签(会被转义)
    const bridgePart = srcdoc.slice(0, srcdoc.indexOf('</head>'));
    assert.ok(!/<\/script><script>alert/.test(bridgePart));
    assert.ok(srcdoc.includes('<\\/script>') || srcdoc.includes('<\\/SCRIPT>'));
});

test('buildHtmlSrcdoc 完整文档模板注入变量桥', () => {
    const doc = '<html><head><title>t</title></head><body><div id="a">1</div></body></html>';
    const srcdoc = buildHtmlSrcdoc(doc, '{"stat_data":{}}', 'p3');
    assert.ok(srcdoc.startsWith('<html>'));
    assert.ok(srcdoc.includes('window.getVariables'));
});

test('splitPending 流式挂起检测未闭合围栏', () => {
    const [done1, pend1] = splitPending('完成文本\n```html\n<div>未完');
    assert.equal(done1, '完成文本\n');
    assert.ok(pend1.startsWith('```html'));
    // 已闭合 → 全部可渲染
    const [done2, pend2] = splitPending('a\n```html\n<b>x</b>\n```\nb');
    assert.equal(done2, 'a\n```html\n<b>x</b>\n```\nb');
    assert.equal(pend2, '');
    // 无围栏
    assert.deepEqual(splitPending('普通文本'), ['普通文本', '']);
});

// ============ v1.10.4 准完整文档包壳(JS-Slash-Runner 状态栏 webpack SPA 模板) ============
test('buildHtmlSrcdoc 准完整文档(head+body 无 html 包裹)正确入壳不嵌套', () => {
    const tpl = '<head><script type="module">var a=1;</script><style>.x{}</style></head><body><div id="app"></div></body>';
    const srcdoc = buildHtmlSrcdoc(tpl, '{"stat_data":{}}', 'p9');
    // module script 必须在 head 内,不得被塞进 body
    const headIdx = srcdoc.indexOf('<head>');
    const bodyIdx = srcdoc.indexOf('<body>');
    const scriptIdx = srcdoc.indexOf('type="module"');
    assert.ok(headIdx >= 0 && bodyIdx > headIdx, 'head 应在 body 之前');
    assert.ok(scriptIdx > headIdx && scriptIdx < bodyIdx, 'module script 应位于 head 内');
    // 不得出现嵌套 body
    assert.equal((srcdoc.match(/<body[^>]*>/gi) || []).length, 1, '只允许一个 body');
    // 变量桥注入
    assert.ok(srcdoc.includes('window.getVariables'));
    assert.ok(srcdoc.includes('<!DOCTYPE html>'));
});

test('segmentMessage 裸围栏内 <head> 模板升级为 html 段(示例卡复现)', () => {
    const text = '开场白\n```\n<head><script type="module">x</script></head><body><div id="app"></div></body>\n```\n结尾';
    const segs = segmentMessage(text);
    assert.deepEqual(segs.map((s) => s.type), ['text', 'html', 'text']);
    assert.ok(segs[1].content.startsWith('<head>'));
});

test('segmentMessage 裸围栏普通代码块保持文本段(由 Markdown 渲染)', () => {
    const text = '说明\n```\nconst a = 1;\nconsole.log(a);\n```\n结束';
    const segs = segmentMessage(text);
    assert.deepEqual(segs.map((s) => s.type), ['text', 'text', 'text']);
    assert.ok(segs[1].content.includes('```'));
});
