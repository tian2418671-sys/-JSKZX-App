// 快照文件名精确匹配逻辑测试（防回归）
// ⚠️ 与 main.js 的 isSnapshotOf / escapeRegExp 实现保持同步；
//    main.js 因 require('electron') 无法被 node --test 直接加载，故此处内联等价实现。
// 语义：快照文件名恒为 `${base}_${ISO时间戳}[_manual]${ext}`，时间戳以 YYYY-MM-DDT 开头。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ===== 与 main.js isSnapshotOf 等价的实现（修改 main.js 时须同步此处） =====
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isSnapshotOf(fileName, baseName) {
  return new RegExp('^' + escapeRegExp(baseName) + '_\\d{4}-\\d{2}-\\d{2}T').test(fileName);
}
// ====================================================================

test('精确匹配：本卡快照命中', () => {
  assert.equal(isSnapshotOf('A_2026-08-20T10-00-00.000Z.png', 'A'), true);
});

test('精确匹配：手动快照（_manual 后缀）命中', () => {
  assert.equal(isSnapshotOf('A_2026-08-20T10-00-00.000Z_manual.png', 'A'), true);
});

test('核心修复：卡 A 不会误匹配卡 A_1 的快照', () => {
  assert.equal(isSnapshotOf('A_1_2026-08-20T10-00-00.000Z.png', 'A'), false);
});

test('卡 A_1 自身的快照仍正常匹配', () => {
  assert.equal(isSnapshotOf('A_1_2026-08-20T10-00-00.000Z.png', 'A_1'), true);
});

test('前缀卡紧：卡 AB 不会匹配卡 A 的快照', () => {
  assert.equal(isSnapshotOf('AB_2026-08-20T10-00-00.000Z.png', 'A'), false);
});

test('无时间戳的同名前缀文件不匹配（锁死分隔符）', () => {
  assert.equal(isSnapshotOf('A_backup_old.png', 'A'), false);
  assert.equal(isSnapshotOf('A_foo.png', 'A'), false);
});

test('特殊字符卡名（点号/加号/括号）正确转义', () => {
  assert.equal(isSnapshotOf('my.card_2026-08-20T10-00-00.000Z.png', 'my.card'), true);
  assert.equal(isSnapshotOf('a+b_2026-08-20T10-00-00.000Z.png', 'a+b'), true);
  assert.equal(isSnapshotOf('a+b_2026-08-20T10-00-00.000Z.png', 'a'), false);
});

test('worldbook JSON 快照同样适用', () => {
  assert.equal(isSnapshotOf('lore_2026-08-20T10-00-00.000Z.json', 'lore'), true);
  assert.equal(isSnapshotOf('lore2_2026-08-20T10-00-00.000Z.json', 'lore'), false);
});

// 场景级：模拟 cleanupOldSnapshots 的过滤行为（A 与 A_1 同目录）
test('场景：清理 A 的超量快照不会波及 A_1 的快照', () => {
  const history = [
    'A_2026-08-20T08-00-00.000Z.png',
    'A_2026-08-20T09-00-00.000Z.png',
    'A_1_2026-08-20T08-00-00.000Z.png',
    'A_1_2026-08-20T09-00-00.000Z.png'
  ];
  // 只应选出 A 的 2 份（A_1 的快照必须被排除）
  const mine = history.filter(f => isSnapshotOf(f, 'A') && f.endsWith('.png'));
  assert.deepEqual(mine, [
    'A_2026-08-20T08-00-00.000Z.png',
    'A_2026-08-20T09-00-00.000Z.png'
  ]);
});
