/**
 * 卡片规范化边界单测（代码审查修复 10）
 * 运行：node --test test/
 * 依赖 Node ≥ 22（syntax detection 自动识别 ESM 源码）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeCardData } from '../js/utils/cardLoader.js';

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
