/**
 * 典型业务数据对比测试（代码审查 37 项自检第 2 项）
 * 用真实业务形态的卡片样本回归验证 normalizeCardData / estimateTokens 输出与人工预期一致
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeCardData } from '../js/utils/cardLoader.js';
import { estimateTokens } from '../js/utils/tokenEstimate.js';

// ================= 典型 V3 卡（SillyTavern 官方 chara_card_v3 形态） =================
const typicalV3Card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  name: '测试角色',
  description: '性格设定描述文字',
  personality: '傲娇',
  scenario: '现代都市',
  first_mes: '你好，我是测试角色。',
  mes_example: '',
  creator_notes: '作者备注',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: ['第二条问候'],
  tags: ['测试', '日常'],
  creator: 'tester',
  character_version: '1.0',
  extensions: { depth_prompt: { prompt: '深层设定', depth: 4 } },
  data: {
    name: '测试角色',
    description: '性格设定描述文字',
    personality: '傲娇',
    scenario: '现代都市',
    first_mes: '你好，我是测试角色。',
    mes_example: '',
    creator_notes: '作者备注',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: ['第二条问候'],
    tags: ['测试', '日常'],
    creator: 'tester',
    character_version: '1.0',
    extensions: { depth_prompt: { prompt: '深层设定', depth: 4 } }
  }
};

test('典型 V3 卡：完整结构保持不变', () => {
  const out = normalizeCardData(JSON.parse(JSON.stringify(typicalV3Card)));
  assert.equal(out.spec, 'chara_card_v3');
  assert.equal(out.spec_version, '3.0');
  assert.equal(out.data.name, '测试角色');
  assert.deepEqual(out.data.tags, ['测试', '日常']);
  assert.deepEqual(out.data.alternate_greetings, ['第二条问候']);
  assert.deepEqual(out.data.extensions.depth_prompt, { prompt: '深层设定', depth: 4 });
  // 关键业务字段不被破坏
  assert.equal(out.data.first_mes, '你好，我是测试角色。');
  assert.equal(out.data.personality, '傲娇');
  assert.equal(out.data.scenario, '现代都市');
});

test('典型 V2 卡：spec/data 结构 + 缺失数组兜底', () => {
  const v2 = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: { name: '旧格式角色', description: '描述', tags: undefined }
  };
  const out = normalizeCardData(JSON.parse(JSON.stringify(v2)));
  assert.equal(out.spec, 'chara_card_v2');
  assert.deepEqual(out.data.tags, []); // undefined → 空数组兜底
  assert.equal(out.data.name, '旧格式角色');
});

test('典型 V1 扁平卡：包装为 V2 且字段完整', () => {
  const v1 = { name: '扁平角色', description: '无 data 层', tags: ['老卡'] };
  const out = normalizeCardData(JSON.parse(JSON.stringify(v1)));
  assert.equal(out.spec, 'chara_card_v2');
  assert.equal(out.data.name, '扁平角色');
  assert.equal(out.data.description, '无 data 层');
  assert.deepEqual(out.data.tags, ['老卡']);
});

// ================= Token 估算典型值（与业务口径一致） =================
test('典型 Token 估算：常规卡描述文本', () => {
  // 中文按 1.5、英文单词按 1.2
  assert.equal(estimateTokens('这是一个测试描述'), Math.ceil(8 * 1.5)); // 8 个汉字 → 12
  assert.equal(estimateTokens('Hello World from Test'), Math.ceil(4 * 1.2)); // 4 词 → ceil(4.8) = 5
  assert.equal(estimateTokens('你好 world 混合文本 test'), Math.ceil(6 * 1.5 + 2 * 1.2)); // 6 汉字 + 2 词 = 9+2.4=11.4 → 12
});

test('典型 Token 估算：长文与空', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(' '.repeat(10)), 0); // 纯空白无词
  assert.ok(estimateTokens('角色设定'.repeat(100)) > 100); // 长文合理递增
});
