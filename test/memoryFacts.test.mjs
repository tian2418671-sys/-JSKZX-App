import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFacts } from '../js/mobile/useChatMemory.js';

// ============ L3 事实提取（记忆表格行来源） ============
test('extractFacts：姓名/喜好/年龄/位置/目标 等关键信息', () => {
    const f1 = extractFacts('我叫小明，今年25岁，现在在风崖城，想去雪原找老板娘。');
    assert.deepEqual(f1, [
        { key: '名字', value: '小明' },
        { key: '年龄', value: '25岁' },
        { key: '位置', value: '风崖城' },
        { key: '目标', value: '雪原找老板娘' },
    ]);
});

test('extractFacts：记住/牢记 指令 → 备忘', () => {
    assert.deepEqual(extractFacts('请记住：老板娘喜欢半夜找我。'), [
        { key: '备忘', value: '老板娘喜欢半夜找我' },
    ]);
    assert.deepEqual(extractFacts('你记住我很怕黑。'), [{ key: '备忘', value: '我很怕黑' }]);
});

test('extractFacts：喜欢/讨厌 与 我的X是Y 通用规则', () => {
    assert.deepEqual(extractFacts('我喜欢吃火锅，讨厌下雨天。'), [
        { key: '喜欢', value: '吃火锅' },
        { key: '讨厌', value: '下雨天' },
    ]);
    assert.deepEqual(extractFacts('我的职业是猎魔人。'), [{ key: '职业', value: '猎魔人' }]);
});

test('extractFacts：无关键信息 → 空数组（不什么都会记）', () => {
    assert.deepEqual(extractFacts('老板娘，晚上好，我想打听一下风崖城的事情。'), []);
    assert.deepEqual(extractFacts(''), []);
    assert.deepEqual(extractFacts(null), []);
});

// ============ D3 误吞回归（v4.1 评审拦截的空泛内容） ============
test('extractFacts：「我在思考…」→ 不提取（空泛思维类排除）', () => {
    assert.deepEqual(extractFacts('我在思考接下来该怎么办。'), []);
    assert.deepEqual(extractFacts('我在想一个问题。'), []);
});

test('extractFacts：「我的想法是…」→ 不提取（想法/打算类排除）', () => {
    assert.deepEqual(extractFacts('我的想法是先去风崖城。'), []);
    assert.deepEqual(extractFacts('我的打算是明天出发。'), []);
});

test('extractFacts：「我想去南方」→ 目标提取（有意义记忆）；「我想吃火锅」不提取', () => {
    assert.deepEqual(extractFacts('我想吃火锅。'), []);
    assert.deepEqual(extractFacts('我想去南方。'), [{ key: '目标', value: '南方' }]);
});

test('extractFacts：疑问句不提取', () => {
    assert.deepEqual(extractFacts('我叫什么名字？'), []);
    assert.deepEqual(extractFacts('你叫什么名字？'), []);
    assert.deepEqual(extractFacts('风崖城在哪里？'), []);
});

test('extractFacts：否定假设不提取', () => {
    assert.deepEqual(extractFacts('如果我叫小明就好了。'), []);
    assert.deepEqual(extractFacts('要是我住在风崖城。'), []);
});

test('extractFacts：引用不提取', () => {
    assert.deepEqual(extractFacts('他说他叫小明。'), []);
    assert.deepEqual(extractFacts('她说她喜欢下雨。'), []);
});

test('extractFacts：值截断（普通30字，显式80字）', () => {
    // 普通规则：30字截断
    const longVal = '风崖城的那个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常大的酒馆';
    const f1 = extractFacts(`我在${longVal}`);
    assert.ok(f1.length === 1);
    assert.ok(f1[0].value.length <= 30);
    // 显式指示词：80字截断
    const longMemo = '老板娘'.repeat(20);
    const f2 = extractFacts(`记住：${longMemo}`);
    assert.ok(f2.length === 1);
    assert.ok(f2[0].value.length <= 80);
});

console.log('MEMORY FACTS ALL PASS');
