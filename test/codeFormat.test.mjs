/**
 * codeFormat 纯函数单测(JS 高亮 + 极简格式化)
 * 覆盖:HTML 转义安全、字符串/注释/正则字面量识别、格式化不改变语义、
 *      压缩代码可读化、关键字/字面量/内置着色。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { highlightJs, formatJs } from '../js/utils/codeFormat.js';

test('highlightJs 转义 HTML 防注入', () => {
    const out = highlightJs('<script>alert(1)</script>');
    assert.ok(!out.includes('<script>'), '原始标签必须被转义');
    assert.ok(out.includes('&lt;script&gt;'));
});

test('highlightJs 识别关键字/字符串/注释/数字', () => {
    const out = highlightJs('const x = "str"; // note\nvar n = 42;');
    assert.ok(out.includes('class="kw"'), '有关键字着色');
    assert.ok(out.includes('class="str"'), '有字符串着色');
    assert.ok(out.includes('class="num"'), '有数字着色');
    assert.ok(out.includes('class="cmt"'), '有注释着色');
    assert.ok(out.includes('const'), '关键字文本保留');
});

test('highlightJs 字符串内含注释标记不误判', () => {
    const out = highlightJs('var s = "http://x.com";');
    assert.ok(out.includes('class="str"'), 'URL 字符串整体按字符串处理');
});

test('highlightJs 正则字面量识别', () => {
    const out = highlightJs('var re = /abc\\/d/gi;');
    assert.ok(out.includes('class="re"'), '正则按 re 着色');
});

test('formatJs 压缩代码可读化且语义等价', () => {
    const src = 'function f(a,b){if(a){return b+1;}return 0;}';
    const out = formatJs(src);
    assert.ok(out.includes('\n'), '有换行');
    assert.ok(out.includes('  '), '有缩进');
    // 语义等价:剥离全部空白后相同
    const strip = (s) => s.replace(/\s+/g, '');
    assert.equal(strip(out), strip(src));
});

test('formatJs 不破坏字符串/模板串/注释内部', () => {
    const src = 'var s="a;b{c}";/* x;{ */var t=`t;{u}`; // {c}\nvar done=true;';
    const out = formatJs(src);
    const strip = (s) => s.replace(/\s+/g, '');
    assert.equal(strip(out), strip(src));
});

test('formatJs 空输入与纯文本', () => {
    assert.equal(formatJs(''), '');
    assert.equal(formatJs(null), '');
    assert.equal(formatJs('   '), '');
    const out = formatJs('const a=1;const b=2;');
    assert.ok(out.split('\n').length >= 2);
});
