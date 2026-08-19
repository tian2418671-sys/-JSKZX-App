/**
 * Token 估算边界单测（代码审查修复 10）
 * 运行：node --test test/
 * 依赖 Node ≥ 22（syntax detection 自动识别 ESM 源码）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { estimateTokens } from '../js/utils/tokenEstimate.js';

test('估算 Token：边界输入', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens(123), 0); // 非字符串
  assert.equal(estimateTokens({}), 0); // 非字符串
});

test('估算 Token：纯中文', () => {
  assert.equal(estimateTokens('你好'), 3); // 2 * 1.5
  assert.equal(estimateTokens(''), 0);
});

test('估算 Token：纯英文', () => {
  assert.equal(estimateTokens('hello world'), 3); // 2 * 1.2 -> ceil(2.4)
  assert.equal(estimateTokens('a'), 2); // 1 * 1.2 -> ceil(1.2)
});

test('估算 Token：中英混合', () => {
  assert.equal(estimateTokens('你好 world'), 5); // 2*1.5 + 1*1.2 = 4.2 -> ceil 5
  assert.equal(estimateTokens('测试 text'), 5); // 2*1.5 + 1*1.2 = 4.2 -> ceil 5
});
