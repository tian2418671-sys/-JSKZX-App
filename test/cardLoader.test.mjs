/**
 * 卡片规范化边界单测（代码审查修复 10）
 * 运行：node --test test/
 * 依赖 Node ≥ 22（syntax detection 自动识别 ESM 源码）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeCardData, extractBookEntries } from '../js/utils/cardLoader.js';

test('V1 扁平结构包装为 V2', () => {
  const out = normalizeCardData({ name: 'A', tags: null });
  assert.equal(out.spec, 'chara_card_v2');
  assert.equal(out.spec_version, '2.0');
  assert.deepEqual(out.data.tags, []);
  assert.equal(out.data.name, 'A');
});

test('已含 data 层不重复嵌套', () => {
  const out = normalizeCardData({ data: { name: 'B' } });
  assert.equal(out.spec, 'chara_card_v2');
  assert.equal(out.data.name, 'B');
  assert.ok(Array.isArray(out.data.tags)); // 不抛异常、不套娃
});

test('空对象 / 非对象输入安全兜底', () => {
  const out = normalizeCardData({});
  assert.equal(out.spec, 'chara_card_v2');
  assert.deepEqual(out.data.tags, []);
  assert.deepEqual(out.data.alternate_greetings, []);
  assert.deepEqual(out.data.extensions, {});
});

test('V2 原生结构缺失数组字段兜底', () => {
  const out = normalizeCardData({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'C' } });
  assert.deepEqual(out.data.tags, []);
  assert.deepEqual(out.data.alternate_greetings, []);
  assert.deepEqual(out.data.extensions, {});
});

test('已存在数组不覆盖', () => {
  const out = normalizeCardData({ spec: 'chara_card_v2', data: { name: 'D', tags: ['x'], alternate_greetings: ['hi'], extensions: { a: 1 } } });
  assert.deepEqual(out.data.tags, ['x']);
  assert.deepEqual(out.data.alternate_greetings, ['hi']);
  assert.deepEqual(out.data.extensions, { a: 1 });
});

// ================= extractBookEntries：内嵌世界书全形态安全提取 =================
// 回归背景：JSON 角色卡的 character_book 特殊形态曾让 estimateCardTokens /
// filteredLibrary 等链路抛 TypeError → 侧边栏（角色栏）消失/白屏，且卡在库内每次重启复发。

test('entries 标准数组形态正常提取', () => {
  const book = { entries: [{ content: 'a' }, { content: 'b' }] };
  assert.equal(extractBookEntries(book).length, 2);
});

test('entries 字典形态（SillyTavern 世界书导出）提取为条目数组', () => {
  // 旧写法 book.entries || ... 拿到字典对象，后续 .forEach 直接 TypeError
  const book = { entries: { '0': { content: 'a' }, '1': { content: 'b' } } };
  const out = extractBookEntries(book);
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2);
});

test('character_book 本身为数组（老 V1 嵌入形态）正确识别', () => {
  // 陷阱：数组自带 Array.prototype.entries 原型方法（truthy 函数），
  // 旧写法会短路拿到函数 → .forEach 崩溃 / JSON.stringify 返回 undefined
  const book = [{ content: 'a', key: ['k'] }, null, '脏条目'];
  const out = extractBookEntries(book);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { content: 'a', key: ['k'] });
});

test('脏数据形态全部安全兜底（永不抛错）', () => {
  assert.deepEqual(extractBookEntries(null), []);
  assert.deepEqual(extractBookEntries(undefined), []);
  assert.deepEqual(extractBookEntries('string'), []);
  assert.deepEqual(extractBookEntries(42), []);
  assert.deepEqual(extractBookEntries({}), []);
  assert.deepEqual(extractBookEntries({ entries: null }), []);
  assert.deepEqual(extractBookEntries({ entries: 'not-array' }), []);
  assert.deepEqual(extractBookEntries({ entries: [null, 42, 'x', { content: 'ok' }] }).length, 1);
});

test('数组原型方法陷阱不误判：book.entries 函数不被当作条目集合', () => {
  const arr = [{ content: 'x' }];
  arr.entries = () => { throw new Error('若被调用说明陷阱未修复'); };
  const out = extractBookEntries(arr);
  assert.equal(out.length, 1);
});
