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

console.log('MEMORY FACTS ALL PASS');
