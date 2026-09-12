/**
 * 导入增值(重复卡片)修复单测
 * 根因:缓存键 = path|mtime|size,每次保存 mtime/size 变化换键而旧键不清 →
 *      同路径多条缓存 → 缓存先行还原时同一张卡出现多张。
 * 修复:① restore 按 path 去重(保留最新 mtime);② 写入时驱逐同路径旧键。
 * 覆盖:多指纹还原去重 / 负缓存跳过 / 最新 mtime 优先。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { restoreItemsFromCacheText, CACHE_VERSION } from '../js/mobile/libraryCacheCore.js';

function makeCacheEntry(path, mtime, size, overrides = {}) {
    return {
        key: `${path}|${mtime}|${size}`,
        val: {
            n: '星野',
            c: '测试角色',
            d: '这是描述文本',
            s: '这是搜索全文',
            t: ['测试'],
            k: 42,
            lb: 0,
            rx: 0,
            ...overrides
        }
    };
}

function buildCache(entries, withNeg = []) {
    const items = {};
    for (const e of entries) items[e.key] = e.val;
    for (const n of withNeg) items[n.key] = { nc: 1 };
    return { version: CACHE_VERSION, items };
}

test('同路径多指纹缓存还原后只保留一张卡', () => {
    const path = '/library/星野.png';
    const cache = buildCache([
        makeCacheEntry(path, 1000, 500),    // 旧指纹(首次导入)
        makeCacheEntry(path, 2000, 600),    // 保存后新指纹
        makeCacheEntry(path, 3000, 700)     // 再次保存后最新指纹
    ]);
    const r = restoreItemsFromCacheText(JSON.stringify(cache));
    assert.ok(r && r.items, '应成功还原');
    const cards = r.items.filter((c) => c.path === path);
    assert.strictEqual(cards.length, 1, '同一路径只允许一张卡');
    assert.strictEqual(cards[0]._mtime, 3000, '应保留最新 mtime 的条目');
    assert.strictEqual(cards[0]._size, 700, '应保留最新 size 的条目');
});

test('不同路径不受影响,各自保留', () => {
    const cache = buildCache([
        makeCacheEntry('/library/A.json', 1000, 100),
        makeCacheEntry('/library/A.json', 2000, 150),
        makeCacheEntry('/library/子目录/B.json', 1000, 200)
    ]);
    const r = restoreItemsFromCacheText(JSON.stringify(cache));
    assert.ok(r && r.items);
    assert.strictEqual(r.items.filter((c) => c.path === '/library/A.json').length, 1);
    assert.strictEqual(r.items.filter((c) => c.path === '/library/子目录/B.json').length, 1);
});

test('负缓存条目不参与还原,且不影响去重', () => {
    const path = '/library/坏卡.png';
    const cache = buildCache(
        [makeCacheEntry(path, 1000, 500), makeCacheEntry(path, 2000, 600)],
        [{ key: '/library/普通.json|999|10' }] // 一个无关负缓存
    );
    const r = restoreItemsFromCacheText(JSON.stringify(cache));
    assert.ok(r && r.items);
    assert.strictEqual(r.items.filter((c) => c.path === path).length, 1, '坏卡负缓存被跳过,正缓存仍去重');
});

test('空缓存/无有效条目返回 null', () => {
    assert.strictEqual(restoreItemsFromCacheText(JSON.stringify({ version: CACHE_VERSION, items: {} })), null);
    assert.strictEqual(restoreItemsFromCacheText('not json'), null);
    assert.strictEqual(restoreItemsFromCacheText(''), null);
});
