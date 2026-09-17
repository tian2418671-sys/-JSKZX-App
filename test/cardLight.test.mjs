/**
 * cardLight 轻量字段提取单测（移动端大库内存优化核心）
 * 验证:搜索全文构建(含内嵌世界书/正则/扩展字段)、特征标记(_lb/_rx)、
 *      轻量缓存序列化往返、Token 估算、字段截断保护。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import {
    buildCardSearchText,
    cardHasLorebook,
    cardHasRegex,
    extractCardLightFields,
    lightFieldsToCache,
    lightFieldsFromCache,
    toMemorySearchText,
    MEMORY_SEARCH_TEXT
} from '../js/utils/cardLight.js';

const META = {
    fileName: '星野.png',
    path: '/library/星野.png',
    subFolder: '奇幻组',
    category: '奇幻组'
};

function makeCard(overrides = {}) {
    const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: '星野',
            creator: '某作者',
            description: '一个温柔又傲娇的狐耳少女，喜欢在下雨天看小说。',
            personality: '温柔、傲娇',
            scenario: '校园日常',
            first_mes: '你好呀，今天也一起回家吗？',
            mes_example: '<START>\n{{char}}: 嗯。\n{{user}}: 走吧。',
            creator_notes: '无',
            alternate_greetings: ['早安呀～', '今天天气不错呢'],
            tags: ['狐娘', '温柔', '校园'],
            extensions: {
                depth_prompt: { prompt: '保持角色语气' },
                system_prompt: '你是一个助手',
                regex_scripts: [{ scriptName: '去括号', findRegex: '\\(.*\\)', replaceString: '' }]
            },
            character_book: {
                entries: [
                    { comment: '雨天', content: '星野在下雨天会变得粘人。', keys: ['雨', '下雨'] },
                    { name: '家规', content: '每天回家要先抱一下。', keys: ['回家'] }
                ]
            }
        },
        ...overrides
    };
    return card;
}

test('buildCardSearchText 覆盖核心人设/扩展/内嵌世界书(小写)', () => {
    const text = buildCardSearchText(makeCard(), META);
    assert.ok(text.includes('星野.png'.toLowerCase()));
    assert.ok(text.includes('狐耳少女'));
    assert.ok(text.includes('保持角色语气'));
    assert.ok(text.includes('去括号'));
    assert.ok(text.includes('变得粘人'));
    assert.ok(text.includes('每天回家要先抱一下'));
    assert.ok(text.includes('回家'));
    assert.ok(text === text.toLowerCase(), '搜索全文应为小写');
});

test('cardHasLorebook 识别数组/字典形态世界书', () => {
    assert.equal(cardHasLorebook(makeCard()), true);
    assert.equal(cardHasLorebook(makeCard({ data: { name: 'X' } })), false);
    const dict = makeCard();
    dict.data.character_book.entries = { wb_0: { content: 'x' } };
    assert.equal(cardHasLorebook(dict), true);
    assert.equal(cardHasLorebook(dict.data.character_book.entries = {}), false);
});

test('cardHasRegex 识别双位置正则脚本', () => {
    assert.equal(cardHasRegex(makeCard()), true);
    assert.equal(cardHasRegex(makeCard({ data: { name: 'X' } })), false);
    // 顶层 regex_scripts(归一化 V1)
    const top = makeCard();
    top.data.extensions = {};
    top.data.regex_scripts = [{ scriptName: 'x' }];
    assert.equal(cardHasRegex(top), true);
});

test('extractCardLightFields 提取轻量字段并截断描述', () => {
    const f = extractCardLightFields(makeCard(), META);
    assert.equal(f.name, '星野');
    assert.equal(f.creator, '某作者');
    assert.deepEqual(f.tags, ['狐娘', '温柔', '校园']);
    assert.ok(f.desc.includes('狐耳少女'));
    assert.ok(f.desc.length <= 203);
    assert.ok(f.searchText.length > 0);
    assert.ok(f.tokens > 0);
    assert.equal(f.hasLorebook, true);
    assert.equal(f.hasRegex, true);

    const long = makeCard();
    long.data.description = '长'.repeat(5000);
    const f2 = extractCardLightFields(long, META);
    assert.ok(f2.desc.length <= 203, '描述片段必须截断');
    assert.ok(f2.searchText.length <= 60000, '搜索全文必须截断');
});

test('lightFieldsToCache/FromCache 紧凑序列化往返', () => {
    const f = extractCardLightFields(makeCard(), META);
    const cached = lightFieldsToCache(f);
    // 紧凑键名
    assert.ok('n' in cached && 's' in cached && 'k' in cached && 'b' in cached && 'x' in cached);
    const back = lightFieldsFromCache(cached);
    assert.equal(back.name, f.name);
    assert.equal(back.creator, f.creator);
    assert.deepEqual(back.tags, f.tags);
    assert.equal(back.desc, f.desc);
    assert.equal(back.searchText, f.searchText);
    assert.equal(back.tokens, f.tokens);
    assert.equal(back.hasLorebook, f.hasLorebook);
    assert.equal(back.hasRegex, f.hasRegex);
    // 损坏缓存返回 null → 触发重解析
    assert.equal(lightFieldsFromCache(null), null);
    assert.equal(lightFieldsFromCache('bad'), null);
});

test('长描述卡 Token 估算 >0 且字段截断后仍可重建条目', () => {
    const f = extractCardLightFields(makeCard(), META);
    const cached = lightFieldsToCache(f);
    const back = lightFieldsFromCache(cached, '兜底名');
    assert.ok(back.tokens > 0);
    assert.ok(back.searchText.length > 0);
});

// 🚀 两万卡专项（I13）：内存条目与缓存条目的搜索文本同源同长截断
test('toMemorySearchText 截断到 MEMORY_SEARCH_TEXT（两万卡内存封顶）', () => {
    const long = '世'.repeat(3000);
    assert.equal(toMemorySearchText(long).length, MEMORY_SEARCH_TEXT);
    const short = '短文本';
    assert.equal(toMemorySearchText(short), short);
    assert.equal(toMemorySearchText(''), '');
    assert.equal(toMemorySearchText(undefined), '');
    assert.equal(toMemorySearchText(null), '');
});

test('I13: 缓存 s 字段与内存截断同长（同源同长）', () => {
    const long = '长'.repeat(8000);
    const f = { ...extractCardLightFields(makeCard(), META), searchText: long };
    const cached = lightFieldsToCache(f);
    assert.equal(cached.s.length, MEMORY_SEARCH_TEXT, '缓存 searchText 必须与内存一致截断');
    assert.equal(cached.s, toMemorySearchText(long));
});
