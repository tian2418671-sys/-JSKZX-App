/**
 * 预设提示词条目单测（测卡侧边栏「预设条目」开关/编辑生效性）
 * 运行：node --test test/
 *
 * 背景：酒馆预设的 prompt_order 有「扁平」和「嵌套(character_id)」两种形态，
 * 且条目开关可能只改一处；这里锁定归一化 + 双位置启停的行为，防止回归。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { normalizePromptOrder, getOrderedPrompts, setPromptEnabled } from '../js/mobile/useChatPresets.js';

/** 造一个含扁平 prompt_order 的预设 */
function flatPreset() {
  return {
    name: 'flat',
    prompts: [
      { identifier: 'main', name: 'Main', role: 'system', content: 'A', enabled: true },
      { identifier: 'chatHistory', name: 'Chat History', role: 'system', content: '', enabled: true },
      { identifier: 'jailbreak', name: 'Jailbreak', role: 'system', content: 'C', enabled: true },
    ],
    prompt_order: [
      { identifier: 'main', enabled: true },
      { identifier: 'chatHistory', enabled: true },
      { identifier: 'jailbreak', enabled: false },
    ],
  };
}

/** 造一个含嵌套 prompt_order 的预设（酒馆新版格式） */
function nestedPreset() {
  return {
    name: 'nested',
    prompts: [
      { identifier: 'main', name: 'Main', role: 'system', content: 'A', enabled: true },
      { identifier: 'nsfw', name: 'NSFW', role: 'system', content: 'N', enabled: false },
    ],
    prompt_order: [
      {
        character_id: 100000,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'nsfw', enabled: false },
        ],
      },
    ],
  };
}

test('normalizePromptOrder: 非数组/空值安全', () => {
  assert.deepEqual(normalizePromptOrder(undefined), []);
  assert.deepEqual(normalizePromptOrder(null), []);
  assert.deepEqual(normalizePromptOrder({}), []);
});

test('normalizePromptOrder: 扁平格式原样保留（过滤无 identifier 项）', () => {
  const out = normalizePromptOrder([
    { identifier: 'a', enabled: true },
    { enabled: true },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].identifier, 'a');
});

test('normalizePromptOrder: 嵌套格式取各分组并集', () => {
  const out = normalizePromptOrder([
    { character_id: 1, order: [{ identifier: 'a', enabled: true }] },
    { character_id: 2, order: [{ identifier: 'a', enabled: false }, { identifier: 'b', enabled: true }] },
  ]);
  const map = new Map(out.map((i) => [i.identifier, i]));
  assert.equal(map.size, 2);
  assert.equal(map.get('a').enabled, false); // 后者覆盖前者
  assert.equal(map.get('b').enabled, true);
});

test('getOrderedPrompts: 扁平 order 跳过 enabled=false 的条目', () => {
  const out = getOrderedPrompts(flatPreset());
  assert.deepEqual(out.map((p) => p.identifier), ['main', 'chatHistory']);
});

test('getOrderedPrompts: 嵌套 order 同样能生效（修复前会退化成全量）', () => {
  const out = getOrderedPrompts(nestedPreset());
  assert.deepEqual(out.map((p) => p.identifier), ['main']);
});

test('getOrderedPrompts: 条目自身 enabled=false 也跳过', () => {
  const preset = flatPreset();
  preset.prompts[0].enabled = false; // main 关闭（order 里仍是 true）
  const out = getOrderedPrompts(preset);
  assert.deepEqual(out.map((p) => p.identifier), ['chatHistory']);
});

test('getOrderedPrompts: 无 prompt_order 时回退到 prompts（排除 chatHistory）', () => {
  const preset = {
    prompts: [
      { identifier: 'main', content: 'A', enabled: true },
      { identifier: 'chatHistory', content: '', enabled: true },
      { identifier: 'off', content: 'O', enabled: false },
    ],
  };
  assert.deepEqual(getOrderedPrompts(preset).map((p) => p.identifier), ['main']);
});

test('getOrderedPrompts: 空/异常输入返回空数组', () => {
  assert.deepEqual(getOrderedPrompts(null), []);
  assert.deepEqual(getOrderedPrompts({}), []);
});

test('getOrderedPrompts: 同一 identifier 重复出现时只保留一次', () => {
  const preset = {
    prompts: [{ identifier: 'main', content: 'A', enabled: true }],
    prompt_order: [
      { identifier: 'main', enabled: true },
      { identifier: 'main', enabled: true },
    ],
  };
  assert.equal(getOrderedPrompts(preset).length, 1);
});

test('setPromptEnabled: 同时改 prompt 自身与扁平 order', () => {
  const preset = flatPreset();
  setPromptEnabled(preset, preset.prompts[2], true); // jailbreak 打开
  assert.equal(preset.prompts[2].enabled, true);
  assert.equal(preset.prompt_order[2].enabled, true);
  assert.deepEqual(getOrderedPrompts(preset).map((p) => p.identifier), ['main', 'chatHistory', 'jailbreak']);
});

test('setPromptEnabled: 同时改嵌套 order 内的同名条目', () => {
  const preset = nestedPreset();
  setPromptEnabled(preset, preset.prompts[1], true); // nsfw 打开
  assert.equal(preset.prompt_order[0].order[1].enabled, true);
  assert.deepEqual(getOrderedPrompts(preset).map((p) => p.identifier), ['main', 'nsfw']);
});

test('setPromptEnabled: 缺失参数不抛异常', () => {
  assert.doesNotThrow(() => setPromptEnabled(null, null, true));
  assert.doesNotThrow(() => setPromptEnabled({ prompts: [] }, { identifier: 'x' }, false));
});
