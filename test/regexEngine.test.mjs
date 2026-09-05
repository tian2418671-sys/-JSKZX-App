import { applyRegexScripts, normalizeRegexScript, extractRegexFromCard } from '../js/mobile/useChatRegex.js';
import assert from 'node:assert';

const macros = { '{{user}}': '小明', '{{char}}': '莉莉丝' };

// 1) 酒馆数字 placement:[2] 在 AI 阶段生效（旧引擎此处全跳过 = 本次主病灶）
const cardRegex = [
    { scriptName: '去think', findRegex: '<think>.*?</think>', replaceString: '', disabled: false, placement: [2] },
    { scriptName: '用户前缀', findRegex: '^', replaceString: '[{{user}}]: ', disabled: false, placement: [1] },
];
const r1 = applyRegexScripts('你好<think>推理</think>世界', cardRegex, 'AI', macros);
assert.equal(r1, '你好世界', 'AI阶段数字placement:[2]应生效');

// 2) placement:[1] 在 USER 阶段生效
const r2 = applyRegexScripts('你好', cardRegex, 'USER', macros);
assert.equal(r2, '[小明]: 你好', 'USER阶段placement:[1]应生效');

// 3) placement:[1] 的脚本在 AI 阶段不得生效
assert.ok(!r1.includes('[小明]'), 'AI阶段不应执行用户输入脚本');

// 4) 替换串宏替换
const r4 = applyRegexScripts('角色:@char@', [{ findRegex: '@char@', replaceString: '{{char}}', placement: [0] }], 'AI', macros);
assert.equal(r4, '角色:莉莉丝');

// 5) {{match}} 与 $2 捕获组
const r5 = applyRegexScripts('【隐藏】正文', [{ findRegex: '【(.*?)】(.*)', replaceString: '{{match}}!$2', placement: [2] }], 'AI', {});
assert.equal(r5, '【隐藏】正文!正文');

// 6) 旧字符串 placement 归一为数字
const legacy = normalizeRegexScript({ scriptName: '旧格式', findRegex: 'x', placement: ['AI', 'USER'] });
assert.deepEqual(legacy.placement, [2, 1]);

// 7) trimStrings 捕获组剔除（剔除后 $1 为空）
const r7 = applyRegexScripts('abXYcd', [{ findRegex: 'b(.*)c', replaceString: '$1', placement: [2], trimStrings: ['XY'] }], 'AI', {});
assert.equal(r7, 'ad');

// 8) findRegex 中的宏先替换再编译
const r8 = applyRegexScripts('我是小明', [{ findRegex: '{{user}}', replaceString: '我', placement: [1] }], 'USER', macros);
assert.equal(r8, '我是我');

// 9) substituteRegex=0 时匹配式不做宏替换（按字面编译）
const r9 = applyRegexScripts('我是{{user}}', [{ findRegex: '{{user}}', replaceString: 'X', placement: [1], substituteRegex: 0 }], 'USER', macros);
assert.equal(r9, '我是X');

// 10) 世界书(5)/思维链(6) 并入 AI 阶段；用户阶段不触发
const r10 = applyRegexScripts('<status>abc</status>', [{ findRegex: '<status>.*?</status>', replaceString: '', placement: [5] }], 'AI', {});
assert.equal(r10, '');
const r10b = applyRegexScripts('<status>abc</status>', [{ findRegex: '<status>.*?</status>', replaceString: '', placement: [5] }], 'USER', {});
assert.equal(r10b, '<status>abc</status>');

// 11) promptOnly 跳过显示层
const r11 = applyRegexScripts('abc', [{ findRegex: 'a', replaceString: 'z', placement: [2], promptOnly: true }], 'AI', {});
assert.equal(r11, 'abc');

// 12) 空 placement 全节点生效（兼容旧行为）
const r12 = applyRegexScripts('abc', [{ findRegex: 'a', replaceString: 'z', placement: [] }], 'USER', {});
assert.equal(r12, 'zbc');

// 13) 全形态卡片提取仍正常
const mk = (raw) => ({ data: raw });
const v2 = { spec: 'chara_card_v2', data: { name: 'A', extensions: { regex_scripts: [{ scriptName: 'S1', findRegex: 'x', placement: [2] }] } } };
assert.equal(extractRegexFromCard(mk(v2)).length, 1);
assert.deepEqual(extractRegexFromCard(mk(v2))[0].placement, [2]);

console.log('ALL 13 PASS');
