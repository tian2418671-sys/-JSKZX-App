/**
 * 📦 批量打标编排单测（tagBatchPlan）
 * 覆盖：短卡成组 / 长卡单发 / packSize 边界 / 续跑账本 / 分段标签合并 / 增量过滤
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTagUnits,
    createResumeLedger,
    markLedgerDone,
    isLedgerComplete,
    resolveResumeTargets,
    mergeSegmentTags,
    filterUntagged,
    isPackableCard,
    isLongCardMaterial,
    isPackableByLength,
    PACK_SIZE_MAX
} from '../js/utils/tagBatchPlan.js';

const short = (id) => ({ id, material: '短材料' });
const long = (id) => ({ id, material: '长'.repeat(5000) });

test('①·b materialLen 路径与 material 路径判定一致（真机 OOM 防护）', () => {
    // 只传长度：应得到与传全文完全相同的单元切分
    const byText = buildTagUnits([short('a'), long('B'), short('c'), short('d')], 3);
    const byLen = buildTagUnits([
        { id: 'a', materialLen: 3 },
        { id: 'B', materialLen: 5000 },
        { id: 'c', materialLen: 3 },
        { id: 'd', materialLen: 3 }
    ], 3);
    assert.deepEqual(byLen.map((u) => u.ids), byText.map((u) => u.ids));
    assert.deepEqual(byLen.map((u) => u.ids), [['a'], ['B'], ['c', 'd']]);
});

test('①·c isPackableByLength 边界：0 视为可打包，超阈值不可打包', () => {
    assert.equal(isPackableByLength(0), true);
    assert.equal(isPackableByLength(undefined), true);
    assert.equal(isPackableByLength(100), true);
    assert.equal(isPackableByLength(4000), true);   // 恰在阈值上
    assert.equal(isPackableByLength(4001), false);
});

test('① 连续短卡按 packSize 成组', () => {
    const units = buildTagUnits([short('a'), short('b'), short('c'), short('d'), short('e')], 2);
    assert.deepEqual(units.map((u) => u.ids), [['a', 'b'], ['c', 'd'], ['e']]);
    assert.deepEqual(units.map((u) => u.packed), [true, true, false]);
});

test('② packSize = 1 时全部单发（与旧行为一致）', () => {
    const units = buildTagUnits([short('a'), short('b')], 1);
    assert.deepEqual(units.map((u) => u.ids), [['a'], ['b']]);
    assert.ok(units.every((u) => !u.packed));
});

test('③ 长卡单独成单元，且打断短卡的连续性', () => {
    const units = buildTagUnits([short('a'), long('B'), short('c'), short('d')], 3);
    assert.deepEqual(units.map((u) => u.ids), [['a'], ['B'], ['c', 'd']]);
});

test('④ packSize 越界被夹到 1~10', () => {
    const many = Array.from({ length: 12 }, (_, i) => short('c' + i));
    const units = buildTagUnits(many, 999);
    assert.equal(units[0].ids.length, PACK_SIZE_MAX);
    assert.equal(buildTagUnits(many, 0)[0].ids.length, 1);
});

test('⑤ 空/非法输入不崩溃', () => {
    assert.deepEqual(buildTagUnits([], 3), []);
    assert.deepEqual(buildTagUnits(null, 3), []);
    assert.deepEqual(buildTagUnits([null, undefined, { noId: 1 }], 3), []);
});

test('⑥ 续跑账本：记完成幂等 + 完成判定', () => {
    const lg = createResumeLedger(['a', 'b', 'a'], 3);
    assert.deepEqual(lg.targetIds, ['a', 'b'], 'targetIds 去重保序');
    markLedgerDone(lg, 'a');
    markLedgerDone(lg, 'a');
    assert.deepEqual(lg.doneIds, ['a']);
    assert.equal(isLedgerComplete(lg), false);
    markLedgerDone(lg, 'b');
    assert.equal(isLedgerComplete(lg), true);
});

test('⑦ 续跑目标解析：跳过已完成 + 统计已删除', () => {
    const lg = { targetIds: ['a', 'b', 'c'], doneIds: ['a'] };
    const r = resolveResumeTargets(lg, ['a', 'b']); // c 已被删除
    assert.deepEqual(r.pending, ['b']);
    assert.equal(r.missingCount, 1);
    assert.equal(r.complete, false);
});

test('⑧ 续跑：全部已完成', () => {
    const r = resolveResumeTargets({ targetIds: ['a'], doneIds: ['a'] }, ['a']);
    assert.equal(r.complete, true);
    assert.deepEqual(r.pending, []);
});

test('⑨ 分段标签合并：出现次数多者在前，同次数按首次顺序', () => {
    const merged = mergeSegmentTags([['奇幻', '骑士'], ['骑士', '冒险'], ['骑士', '奇幻']]);
    assert.deepEqual(merged, ['骑士', '奇幻', '冒险']);
});

test('⑩ 增量过滤：有标签的卡被跳过', () => {
    const index = new Map([['a', { tags: ['x'] }], ['b', { tags: [] }]]);
    const r = filterUntagged(['a', 'b', 'c'], index, (card) => Array.isArray(card.tags) && card.tags.length > 0);
    assert.deepEqual(r.kept, ['b', 'c']);
    assert.deepEqual(r.skipped, ['a']);
});

test('⑪ 短卡/长卡判定', () => {
    assert.equal(isLongCardMaterial('短'), false);
    assert.equal(isLongCardMaterial('长'.repeat(4001)), true);
    assert.equal(isPackableCard('短材料'), true);
    assert.equal(isPackableCard(''), true);
    assert.equal(isPackableCard('长'.repeat(5000)), false, '超过分段阈值不算可打包');
    // 3 万汉字 ≈ 4.5 万 token > 1200，即使未超分段阈值也不应打包
    assert.equal(isPackableCard('字'.repeat(3900)), false);
});
