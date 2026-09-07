import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    rewriteEsmModule,
    stripEsmSyntax,
    parseSlashCommand,
    escapeHtml
} from '../js/plugins/hostStubPure.js';

// 插件预览宿主桩纯逻辑单测（node --test 直接 import，无 DOM 依赖）

// —— rewriteEsmModule：扩展 bundle ESM 源码重写 ——

test('rewriteEsmModule：import.meta → window.__jskMeta', () => {
    assert.equal(rewriteEsmModule('const u = import.meta.url;'), 'const u = window.__jskMeta.url;');
});

test('rewriteEsmModule：named import（含 as 别名）→ var 解构', () => {
    const out = rewriteEsmModule('import{a as b, c}from"x";');
    assert.equal(out, 'var{a:b,c}=window.__jskModuleExports;');
});

test('rewriteEsmModule：minified 无空格 named import', () => {
    const out = rewriteEsmModule('import{foo,bar}from"dep";');
    assert.equal(out, 'var{foo,bar}=window.__jskModuleExports;');
});

test('rewriteEsmModule：default import → var x = 命名空间', () => {
    const out = rewriteEsmModule('import d from "mod";');
    assert.equal(out, 'var d=window.__jskModuleExports;');
});

test('rewriteEsmModule：star import → var ns = 命名空间', () => {
    const out = rewriteEsmModule('import * as ns from "mod";');
    assert.equal(out, 'var ns=window.__jskModuleExports;');
});

test('rewriteEsmModule：副作用 import 被移除', () => {
    const out = rewriteEsmModule('import "side-effect";doSomething();');
    assert.equal(out, 'doSomething();');
});

test('rewriteEsmModule：动态 import() → __jskResolveModule()', () => {
    const out = rewriteEsmModule("await import('./x.js').catch(()=>{});");
    assert.equal(out, "await __jskResolveModule('./x.js').catch(()=>{});");
});

test('rewriteEsmModule：export {x} / export {x as y} 被移除', () => {
    assert.equal(rewriteEsmModule('export {x};'), '');
    assert.equal(rewriteEsmModule('export {x as y};'), '');
});

test('rewriteEsmModule：export default <expr> → window.__jskPluginDefault = <expr>', () => {
    const out = rewriteEsmModule('export default {install(){}};');
    assert.equal(out, 'window.__jskPluginDefault = {install(){}};');
});

test('rewriteEsmModule：export const/function 去 export 关键字', () => {
    assert.equal(rewriteEsmModule('export const a = 1;'), 'const a = 1;');
    assert.equal(rewriteEsmModule('export function f(){}'), 'function f(){}');
    assert.equal(rewriteEsmModule('export async function g(){}'), 'async function g(){}');
});

// —— stripEsmSyntax：普通脚本 ESM 剥离（仅整行匹配） ——

test('stripEsmSyntax：整行 import/export 剥离', () => {
    const src = "import x from 'pkg';\nexport default {a:1};\nconst b = 2;\n";
    const out = stripEsmSyntax(src);
    assert.ok(!out.includes('import x'), 'import 行应被剥离');
    assert.ok(out.includes('window.__jskPluginDefault = {a:1};'), 'export default 应改写');
    assert.ok(out.includes('const b = 2;'), '普通代码应保留');
});

test('stripEsmSyntax：字符串字面量内的 import 字样不被误删', () => {
    const src = "const s = 'import x from y';\n";
    assert.equal(stripEsmSyntax(src), src);
});

test('stripEsmSyntax：export const 去关键字', () => {
    assert.equal(stripEsmSyntax('export const a = 1;'), 'const a = 1;');
});

// —— parseSlashCommand：Slash 命令解析 ——

test('parseSlashCommand：前导 / 容忍、命名参数、引号分词', () => {
    const r = parseSlashCommand('/mycmd "hello world" foo=bar plain');
    assert.equal(r.name, 'mycmd');
    assert.deepEqual(r.args, ['hello world', 'plain']);
    assert.deepEqual(r.namedArguments, { foo: 'bar' });
    assert.equal(r.raw, 'mycmd "hello world" foo=bar plain');
});

test('parseSlashCommand：空输入返回默认结构', () => {
    const r = parseSlashCommand('');
    assert.equal(r.name, '');
    assert.deepEqual(r.args, []);
    assert.equal(r.command, null);
});

test('parseSlashCommand：单引号包裹值保留空格', () => {
    const r = parseSlashCommand("cmd 'a b'");
    assert.deepEqual(r.args, ['a b']);
});

test('parseSlashCommand：registry 命中回填 command', () => {
    const cmdObj = { name: 'hi' };
    const r = parseSlashCommand('/hi', { hi: cmdObj });
    assert.equal(r.command, cmdObj);
});

// —— escapeHtml ——

test('escapeHtml：转义 & < > "', () => {
    assert.equal(escapeHtml('<a b="c">&'), '&lt;a b=&quot;c&quot;&gt;&amp;');
});

test('escapeHtml：空值安全', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});
