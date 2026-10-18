/**
 * 🏷️ 标签解析单测（parseTagReply）
 *
 * 覆盖桌面版 AI-19 / AI-09 的六类真实回复形态 + 边界：
 *   ① 正常 <tags> JSON  ② 裸 JSON 数组  ③ 带思维链后跟 JSON
 *   ④ ```think 围栏  ⑤ 纯推理无标签（必须失败）  ⑥ 嵌套数组 / JSON 字符串
 *   ⑦ 预填充续写  ⑧ 中文 <标签> 包裹  ⑨ 纯文本列表  ⑩ 清洗细节
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseStructuredTags,
    stripThinkingBlocks,
    sanitizeTagList,
    tagResidueReasons,
    extractAiReplyText,
    MAX_TAG_LEN
} from '../js/utils/parseTagReply.js';

test('① 正常 <tags> JSON 包裹', () => {
    const r = parseStructuredTags('<tags>["奇幻", "骑士"]</tags>');
    assert.equal(r.ok, true);
    assert.equal(r.layer, 1);
    assert.deepEqual(r.tags, ['奇幻', '骑士']);
});

test('② 裸 JSON 数组整串', () => {
    const r = parseStructuredTags('["仙侠/修真","女性","傲娇"]');
    assert.equal(r.ok, true);
    assert.equal(r.layer, 2);
    assert.deepEqual(r.tags, ['仙侠/修真', '女性', '傲娇']);
});

test('③ 思维链在前、答案在后（取最后一个有效数组）', () => {
    const reply = [
        '让我先分析这张卡。',
        '首先看描述：这是一个剑与魔法世界。',
        '示例：["示例A","示例B"]',
        '因此可以归纳出以下标签。',
        '<tags>["奇幻","剑与魔法","冒险"]</tags>'
    ].join('\n');
    const r = parseStructuredTags(reply);
    assert.equal(r.ok, true);
    assert.deepEqual(r.tags, ['奇幻', '剑与魔法', '冒险']);
});

test('④ ```think 围栏推理块被剥除', () => {
    const reply = '```think\n这里是一大段推理 ["噪声1"]\n```\n<tags>["校园","日常"]</tags>';
    assert.ok(!stripThinkingBlocks(reply).includes('噪声1'));
    const r = parseStructuredTags(reply);
    assert.deepEqual(r.tags, ['校园', '日常']);
});

test('⑤ 只有推理、没有标签 ⇒ 必须判失败（不得把推理写进标签）', () => {
    const reply = [
        '让我先分析这张卡。',
        '首先看描述，这是一个剑与魔法世界。',
        '其次看性格，角色比较傲娇。',
        '因此可以归纳出一些标签。'
    ].join('\n');
    const r = parseStructuredTags(reply);
    assert.equal(r.ok, false, '纯推理必须失败：' + JSON.stringify(r));
    assert.deepEqual(r.tags, []);
});

test('⑤-b <thinking> 包裹的推理 + 真实标签', () => {
    const reply = '<thinking>\n分析中……示例 ["噪声"]\n</thinking>\n<tags>["机械","近未来"]</tags>';
    const r = parseStructuredTags(reply);
    assert.deepEqual(r.tags, ['机械', '近未来']);
});

test('⑥ 嵌套数组展平 / JSON 字符串', () => {
    assert.deepEqual(parseStructuredTags('["a",["b",["c"]]]').tags, ['a', 'b', 'c']);
    assert.deepEqual(parseStructuredTags('"单独标签"').tags, ['单独标签']);
});

test('⑦ 预填充续写：回复 + prefill 拼回', () => {
    const r = parseStructuredTags('"古风","宫廷"]</tags>', { prefill: '<tags>["' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.tags, ['古风', '宫廷']);
});

test('⑧ 中文 <标签> 包裹 + 纯文本列表', () => {
    assert.deepEqual(parseStructuredTags('<标签>奇幻, 骑士</标签>').tags, ['奇幻', '骑士']);
});

test('⑨ 纯文本逐行列表（层③）', () => {
    const r = parseStructuredTags('- 奇幻\n- 骑士\n- 冒险');
    assert.equal(r.ok, true);
    assert.equal(r.layer, 3);
    assert.deepEqual(r.tags, ['奇幻', '骑士', '冒险']);
});

test('⑩ 字符级清洗：引号 / 方括号 / Markdown / 编号 / 标点', () => {
    const tags = sanitizeTagList(['"**奇幻**"', '1. 骑士', '「冒险」', '，校园，', `长${'字'.repeat(MAX_TAG_LEN)}`]);
    assert.deepEqual(tags, ['奇幻', '骑士', '冒险', '校园']);
});

test('⑩-b strict 档：推理残留占比 ≥ 30% 整批判废', () => {
    const dirty = ['让我先分析', '首先看描述', '奇幻'];
    assert.deepEqual(sanitizeTagList(dirty, { strict: true }), []);
    assert.deepEqual(sanitizeTagList(['奇幻', '骑士'], { strict: true }), ['奇幻', '骑士']);
});

test('⑩-c tagResidueReasons 边界', () => {
    assert.deepEqual(tagResidueReasons('复仇。重生'), [], '单句号顿挫式标签应保留');
    assert.ok(tagResidueReasons('这张卡是一个奇幻故事').includes('句特征'));
    assert.ok(tagResidueReasons('a\nb').includes('跨行'));
    assert.deepEqual(tagResidueReasons('奇幻'), []);
});

test('⑪ 空值安全', () => {
    for (const v of ['', null, undefined, '   ']) {
        const r = parseStructuredTags(v);
        assert.equal(r.ok, false);
        assert.deepEqual(r.tags, []);
    }
});

test('⑫ extractAiReplyText 两种协议', () => {
    assert.equal(extractAiReplyText({ data: { choices: [{ message: { content: 'abc' } }] } }, 'openai'), 'abc');
    assert.equal(extractAiReplyText({ data: { content: [{ text: 'ab' }, { text: 'cd' }] } }, 'anthropic'), 'abcd');
    assert.equal(extractAiReplyText(null, 'openai'), '');
});

test('⑬ 回归：旧的贪婪正则会误取示例，新解析不会', () => {
    const reply = '编号 [1] 是示例，真正结果：<tags>["真实标签"]</tags>';
    const legacy = (reply.match(/\[[\s\S]*?\]/) || [''])[0];
    assert.equal(legacy, '[1]', '旧实现确实取到编号噪声（说明本用例有效）');
    assert.deepEqual(parseStructuredTags(reply).tags, ['真实标签']);
});
