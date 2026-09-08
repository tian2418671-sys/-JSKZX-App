/**
 * sanitizeImportedTags 开关（设置菜单「导入时忽略卡片自带标签」）导入行为回归测试。
 * 直接调用生产代码 useCardCrud().processAutoTagsAndCategory（仅 mock 注入依赖）。
 * 覆盖的缺陷：
 *   1) 开关开启时自动打标规则仍把标签贴到新卡（用户体感「开关无效」）→ 只保留自动分类；
 *   2) subFolder/覆盖层/importedConfig/localCategoryMap 四条提前 return 绕过原生 tags 物理清洗。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useCardCrud } from '../js/composables/useCardCrud.js';
import { compileAutoTagRules } from '../js/utils/cardLoader.js';

const presetRules = compileAutoTagRules(null); // 系统预设 44 条规则（v2.1 默认全部生效）

function makeEnv({ sanitize, localCategoryMap = {}, importedConfig = {}, overlays = {} }) {
    const env = {
        library: { value: [] },
        cardData: { value: null },
        currentFolderPath: { value: '' },
        appConfig: { value: { cardOverlays: overlays } },
        customCategories: { value: [] },
        allCategories: { value: [
            { key: 'Fantasy', cn: 'Fantasy', en: 'Fantasy' },
            { key: 'Romance', cn: 'Romance', en: 'Romance' }
        ] },
        isCategoryKnown: () => false,
        importedConfig: { value: importedConfig },
        localCategoryMap: { value: localCategoryMap },
        sanitizeImportedTags: { value: sanitize },
        autoTagRules: { value: presetRules },
        isDragging: { value: false },
        dragCounter: { value: 0 },
        importFileInput: { value: null },
        nativeAlert: () => {},
        showToast: () => {},
        appPrompt: async () => null,
        safeData: {},
        syncConfigToDisk: () => {},
        syncConfigToDiskDebounced: () => {},
        cardImportTimes: { value: {} },
        reset: () => {},
        openFromLibrary: () => {},
        cleanupEmptyCategories: () => {}
    };
    const crud = useCardCrud(env);
    return { crud, env };
}

const FOREIGN = ['外来垃圾TagA', 'ForeignJunkA', '作者乱贴标签X'];
// 说明文本命中默认规则第一条 Fantasy (奇幻)：魔法|精灵|异世界|巨龙|魔王|骑士
const DESC = '她是一位来自异世界的傲娇魔法少女，随身带着精灵伙伴。';

function newCard(name, nativeTags, extra = {}) {
    return {
        id: 'card_test',
        path: 'C:/lib/' + name + '.png',
        fileName: name + '.png',
        name,
        data: { data: { name, description: DESC, personality: '', scenario: '', first_mes: '', tags: [...nativeTags] } },
        category: '未分类',
        customTags: [],
        subFolder: '',
        ...extra
    };
}

test('开关开启+全新卡：不再贴规则标签，仅保留自动分类，原生 tags 清空', () => {
    const { crud } = makeEnv({ sanitize: true });
    const card = newCard('全新角色卡', FOREIGN);
    crud.processAutoTagsAndCategory(card);
    assert.deepEqual(card.customTags, [], '规则标签不得写入新卡');
    assert.deepEqual(card.data.data.tags, [], '卡片自带原生 tags 物理清空');
    assert.equal(card.category, 'Fantasy', '自动分类结果保留（由规则决定）');
});

test('开关开启+localCategoryMap 命中（同名旧卡）：原生 tags 仍被物理清空', () => {
    const { crud } = makeEnv({ sanitize: true, localCategoryMap: { '傲娇少女': 'Fantasy' } });
    const card = newCard('傲娇少女', FOREIGN);
    crud.processAutoTagsAndCategory(card);
    assert.equal(card.category, 'Fantasy', '历史手动分类恢复');
    assert.deepEqual(card.customTags, []);
    assert.deepEqual(card.data.data.tags, [], '提前 return 不得绕过物理清洗');
});

test('开关开启+覆盖层命中：只恢复用户标签，外来原生 tags 被清掉', () => {
    const { crud } = makeEnv({ sanitize: true, overlays: { 'C:/lib/老卡.png': { category: 'Fantasy', tags: ['我的标签A'] } } });
    const card = newCard('老卡', FOREIGN, { path: 'C:/lib/老卡.png' });
    crud.processAutoTagsAndCategory(card);
    assert.deepEqual(card.customTags, ['我的标签A'], '覆盖层用户标签保留');
    assert.deepEqual(card.data.data.tags, ['我的标签A'], 'data.tags 只含用户标签，不含外来原生');
});

test('开关开启+importedConfig 命中：历史标签恢复但外来原生 tags 被清掉', () => {
    const { crud } = makeEnv({ sanitize: true, importedConfig: { '旧角色': { category: 'Romance', customTags: ['历史标签Q'] } } });
    const card = newCard('旧角色', FOREIGN);
    crud.processAutoTagsAndCategory(card);
    assert.equal(card.category, 'Romance');
    assert.deepEqual(card.customTags, ['历史标签Q'], '用户历史配置标签恢复');
    assert.deepEqual(card.data.data.tags, [], '外来原生 tags 不得残留');
});

test('开关开启+子文件夹卡：分类按物理文件夹，原生 tags 仍被清空', () => {
    const { crud } = makeEnv({ sanitize: true });
    const card = newCard('子目录卡', FOREIGN, { subFolder: '科幻' });
    crud.processAutoTagsAndCategory(card);
    assert.equal(card.category, '科幻');
    assert.deepEqual(card.data.data.tags, [], '子文件夹分支不得绕过物理清洗');
});

test('开关开启+V1 字符串型原生 tags 同样被清空', () => {
    const { crud } = makeEnv({ sanitize: true });
    const card = newCard('v1卡', []);
    card.data = { name: 'v1卡', description: '', tags: '外来X, 外来Y' }; // V1 形态：tags 在顶层且为字符串
    crud.processAutoTagsAndCategory(card);
    assert.equal(card.data.tags, '', '字符串型原生 tags 清空');
});

test('开关关闭：原生 tags 与规则标签照旧合并（原有行为不回退）', () => {
    const { crud } = makeEnv({ sanitize: false });
    const card = newCard('对照卡', FOREIGN);
    crud.processAutoTagsAndCategory(card);
    assert.deepEqual(card.data.data.tags, FOREIGN, '原生 tags 不动');
    assert.ok(card.customTags.includes('外来垃圾TagA'), '原生标签并入 customTags');
    assert.ok(card.customTags.includes('Fantasy (奇幻)'), '规则标签照旧生效');
});
