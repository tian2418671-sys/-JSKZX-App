/**
 * 🏷️ 世界书标签纯函数单元测试（S1 迁移，对齐桌面版 wbGroupsTags.js 语义）
 * 覆盖：单标签规范化 / 数组去重保序 / 切换存在性 / 频次统计排序 / AND 复合筛选
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWbTag, normalizeWbTags, toggleWbTag, countWbTags, matchWbFilter, WB_TAG_MAX_LEN } from '../js/utils/wbTags.js';

test('normalizeWbTag：trim / 折叠空白 / 截断 / 非法输入', () => {
    assert.equal(normalizeWbTag('  修仙  '), '修仙');
    assert.equal(normalizeWbTag('高   武    世界'), '高 武 世界');
    assert.equal(normalizeWbTag(''), '');
    assert.equal(normalizeWbTag(null), '');
    assert.equal(normalizeWbTag(undefined), '');
    assert.equal(normalizeWbTag('   '), '');
    assert.equal(normalizeWbTag(123), '123');
    const long = 'x'.repeat(WB_TAG_MAX_LEN + 20);
    assert.equal(normalizeWbTag(long).length, WB_TAG_MAX_LEN);
});

test('normalizeWbTags：去空 / 去重 / 保序', () => {
    assert.deepEqual(normalizeWbTags(['a', 'b', 'a', '  b ', '', null, 'c']), ['a', 'b', 'c']);
    assert.deepEqual(normalizeWbTags([]), []);
    assert.deepEqual(normalizeWbTags(null), []);
    assert.deepEqual(normalizeWbTags('not-array'), []);
    // 规范化后相等也算重复（'修仙 ' 与 '修仙'）
    assert.deepEqual(normalizeWbTags(['修仙 ', '修仙', '修 仙']), ['修仙', '修 仙']);
});

test('toggleWbTag：有则删 / 无则加 / 空标签无效', () => {
    assert.deepEqual(toggleWbTag(['a', 'b'], 'c'), ['a', 'b', 'c']);
    assert.deepEqual(toggleWbTag(['a', 'b'], 'a'), ['b']);
    assert.deepEqual(toggleWbTag([], 'a'), ['a']);
    assert.deepEqual(toggleWbTag(['a'], ''), ['a']);
    assert.deepEqual(toggleWbTag(['a'], '  '), ['a']);
    // 不规范输入被规范化后参与判定
    assert.deepEqual(toggleWbTag(['A'], ' A '), []);
});

test('countWbTags：频次降序 + 同频按中文名升序', () => {
    const lists = [['修仙', '日常'], ['修仙'], ['日常', '跑团'], ['修仙', '跑团']];
    const got = countWbTags(lists);
    // 同频 2 的两项按 zh-CN 拼音排序：跑团(pao) < 日常(ri)
    assert.deepEqual(got, [
        { tag: '修仙', count: 3 },
        { tag: '跑团', count: 2 },
        { tag: '日常', count: 2 }
    ]);
    assert.deepEqual(countWbTags([]), []);
    assert.deepEqual(countWbTags(null), []);
});

test('matchWbFilter：标签 AND / 分组命中 / 调用方布尔短路', () => {
    const book = { bookCategory: '修仙库', bookTags: ['修仙', '战斗'] };
    // 无筛选 → 通过
    assert.equal(matchWbFilter({ ...book }), true);
    // 标签 AND：全命中才过
    assert.equal(matchWbFilter({ ...book, filterTags: ['修仙'] }), true);
    assert.equal(matchWbFilter({ ...book, filterTags: ['修仙', '战斗'] }), true);
    assert.equal(matchWbFilter({ ...book, filterTags: ['修仙', '日常'] }), false);
    // 分组过滤（『全部』= 不过滤）
    assert.equal(matchWbFilter({ ...book, filterCategory: '修仙库' }), true);
    assert.equal(matchWbFilter({ ...book, filterCategory: '恋爱库' }), false);
    assert.equal(matchWbFilter({ ...book, filterCategory: '全部' }), true);
    // 调用方布尔（搜索/词条数）短路
    assert.equal(matchWbFilter({ ...book, matchesSearch: false }), false);
    assert.equal(matchWbFilter({ ...book, matchesCount: false }), false);
    assert.equal(matchWbFilter({ ...book, matchesSearch: true, matchesCount: true }), true);
});
