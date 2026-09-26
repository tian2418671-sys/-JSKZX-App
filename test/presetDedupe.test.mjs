/**
 * ⚙️ 预设查重纯函数单元测试（移动版移植，对齐桌面 v2.3.0 口径）
 * 覆盖：MinHash-96 / 名字层剥离与语料统计 / 结构三维 / 五枚举判定 / 端到端扫描
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    exactTextKey, computeMinHash96, estimateMinHashSimilarity,
    promptsOf, extractPresetText,
    normName, extractNameStem, discoverTails, applyTails,
    stripCnReplicaTails, wbDedupeStem,
    buildPresetStructure, setJaccard, sameSampler, pickPresetSimType, presetViewStats, contentTier,
    scanPresetDuplicates
} from '../js/utils/presetDedupe.js';

const MK = (name, contents, extra = {}, ids = null) => ({
    path: '/presets/' + name + '.json',
    name,
    data: {
        prompts: contents.map((c, i) => ({ identifier: (ids && ids[i]) || ('id' + i), name: 'p' + i, content: c })),
        prompt_order: [{ character_id: 100000, order: contents.map((_, i) => ({ identifier: (ids && ids[i]) || ('id' + i), enabled: true })) }],
        ...extra
    }
});

test('MinHash-96：同文本=1 / 微改高相似 / 无关低相似 / 过短无效', () => {
    // 构造贴近真实的长文本（每句唯一，避免重复文本导致采样方差——桌面原版同特性）
    const para = (i) => `第${i}段提示词规则：当用户提及关键词${i}时，请按照编号${i * 13}的处理流程执行，并保持语气自然。`;
    const a = Array.from({ length: 16 }, (_, i) => para(i + 1)).join('\n');
    const b = a + '（额外追加的一小句修改）';
    const c = '完全不同的一段文本：角色扮演系统的正则表达式规则集合，与上面的内容毫无关系。'.repeat(3);
    const sa = computeMinHash96(a);
    const sb = computeMinHash96(b);
    const sc = computeMinHash96(c);
    assert.equal(estimateMinHashSimilarity(sa, sa), 1);
    assert.ok(estimateMinHashSimilarity(sa, sb) > 0.7, '微改文本相似度应 > 0.7');
    assert.ok(estimateMinHashSimilarity(sa, sc) < 0.5, '无关文本相似度应 < 0.5');
    assert.equal(estimateMinHashSimilarity(computeMinHash96(''), computeMinHash96('')), null, '过短文本签名无效 → null');
    assert.equal(estimateMinHashSimilarity(null, sb), null);
});

test('exactTextKey：稳定且区分', () => {
    assert.equal(exactTextKey('abc'), exactTextKey('abc'));
    assert.notEqual(exactTextKey('abc'), exactTextKey('abd'));
    assert.equal(exactTextKey('').length, 16);
});

test('名字层：版本号 / 副本 / 时间戳剥离 + 语料统计尾缀', () => {
    assert.equal(extractNameStem('测试预设 v1.0').stem0, '测试预设');
    assert.equal(extractNameStem('测试预设2.2版').stem0, extractNameStem('测试预设 2.2 版').stem0);
    assert.equal(extractNameStem('名字（2）').stem0, '名字');
    assert.equal(extractNameStem('名字_20250925').stem0, '名字');
    // 语料统计：3 个不同主干都带「版」尾缀 → 「版」登记为可剥
    const tails = discoverTails(['阿尔法设定版', '贝塔设定版', '伽马设定版']);
    assert.ok(tails.has('版'));
    assert.equal(applyTails('阿尔法设定版', tails).stemFinal, '阿尔法设定');
    assert.equal(applyTails('阿尔法设定版', new Set()).stemFinal, '阿尔法设定版', '未登记 → 原样');
});

test('结构：数组/字典双形态 + prompt_order 覆盖最多组 + enabledRatio + sampler', () => {
    const arr = buildPresetStructure(MK('x', ['a', 'b', 'c']).data);
    assert.equal(arr.identifierSeq, 'id0\u0001id1\u0001id2');
    assert.equal(arr.enabledRatio, 1);
    // 字典形态 prompts
    const dict = buildPresetStructure({ prompts: { k0: 'a', k1: 'b' } });
    assert.equal(dict.identifierSet.size, 2);
    // prompt_order 覆盖最多的组优先（短组被忽略）
    const multi = buildPresetStructure({
        prompts: [{ identifier: 'p1' }, { identifier: 'p2' }],
        prompt_order: [
            { character_id: 100000, order: [{ identifier: 'p1', enabled: false }] },
            { character_id: 100001, order: [{ identifier: 'p1', enabled: true }, { identifier: 'p2', enabled: true }] }
        ]
    });
    assert.equal(multi.enabledRatio, 1, '应取 2 成员的全启用组');
    // sampler 收集
    const s = buildPresetStructure({ prompts: [{ identifier: 'p' }], temperature: 0.8, top_p: 0.95 });
    assert.deepEqual(s.sampler, { temperature: 0.8, top_p: 0.95 });
});

test('五枚举判定：sampler / flipped / reorder / reskin / different', () => {
    const mk = (contents, extra = {}) => {
        const st = buildPresetStructure(MK('t', contents, extra).data);
        return { ...st, fullMinHash: computeMinHash96(contents.join('\n')) };
    };
    const base = mk(['a', 'b', 'c'], { temperature: 0.8 });
    // sampler：同结构但参数不同
    assert.equal(pickPresetSimType(base, mk(['a', 'b', 'c'], { temperature: 1.2 })), 'sampler');
    // flipped：同结构同参数，启用比例不同
    const flipped = (() => {
        const st = buildPresetStructure({
            prompts: [{ identifier: 'id0' }, { identifier: 'id1' }, { identifier: 'id2' }],
            temperature: 0.8,
            prompt_order: [{ character_id: 1, order: [
                { identifier: 'id0', enabled: true }, { identifier: 'id1', enabled: false }, { identifier: 'id2', enabled: true }
            ] }]
        });
        return { ...st, fullMinHash: null };
    })();
    assert.equal(pickPresetSimType({ ...base, fullMinHash: null }, flipped), 'flipped');
    // reorder：同集合不同顺序（无参数差异）
    const reorder = buildPresetStructure({
        prompts: [{ identifier: 'id2' }, { identifier: 'id1' }, { identifier: 'id0' }],
        prompt_order: [{ character_id: 1, order: [{ identifier: 'id2' }, { identifier: 'id1' }, { identifier: 'id0' }] }]
    });
    assert.equal(pickPresetSimType({ ...base, sampler: {}, enabledRatio: 1, fullMinHash: null }, { ...reorder, fullMinHash: null }), 'reorder');
    // reskin：顺序也相同
    assert.equal(pickPresetSimType({ ...base, sampler: {}, enabledRatio: 1, fullMinHash: null }, { ...base, sampler: {}, enabledRatio: 1, fullMinHash: null }), 'reskin');
    // different：集合差异大
    const diff = buildPresetStructure({ prompts: [{ identifier: 'x1' }, { identifier: 'x2' }] });
    assert.equal(pickPresetSimType({ ...base, sampler: {}, enabledRatio: 1, fullMinHash: null }, { ...diff, fullMinHash: null }), 'different');
});

test('统计与分层：三维百分比 + contentTier', () => {
    const contents = ['相同内容A', '相同内容B', '相同内容C'];
    const a = MK('a', contents).data;
    const b = MK('b', contents).data;
    const sa = buildPresetStructure(a); const sb = buildPresetStructure(b);
    const va = { ...sa, fullMinHash: computeMinHash96(extractPresetText(a)) };
    const vb = { ...sb, fullMinHash: computeMinHash96(extractPresetText(b)) };
    const stats = presetViewStats(va, vb);
    assert.equal(stats.structPct, 100);
    assert.equal(stats.contentPct, 100);
    assert.equal(stats.enabledPct, 100);
    assert.equal(contentTier(100), 'high');
    assert.equal(contentTier(75), 'mid');
    assert.equal(contentTier(30), 'low');
    assert.equal(contentTier(null), null);
});

test('世界书名称归一：中文副本/版本尾缀 + 拉丁副本词（修复"复制为副本查不到"）', () => {
    // 真实案例：应用「复制为副本」生成的 "_副本" 后缀
    assert.equal(wbDedupeStem('---温馨的翻斗花园1.0_副本.json'), wbDedupeStem('---温馨的翻斗花园1.0.json'));
    // 常见副本/版本形态
    assert.equal(wbDedupeStem('书A 备份.json'), wbDedupeStem('书A.json'));
    assert.equal(wbDedupeStem('书A（副本2）.json'), wbDedupeStem('书A.json'));
    assert.equal(wbDedupeStem('Book copy2.json'), wbDedupeStem('Book.json'));
    assert.equal(wbDedupeStem('书A 新版.json'), wbDedupeStem('书A.json'));
    // 不同名不误剥
    assert.notEqual(wbDedupeStem('书甲.json'), wbDedupeStem('书乙.json'));
    assert.equal(stripCnReplicaTails('测试书副本'), '测试书');
    assert.equal(stripCnReplicaTails('测试书（备份）'), '测试书');
});

test('端到端扫描：同名组 + 改名同源合并 + 无关单飞 + 跳过异常', () => {
    // 同源三本共享同一套 identifier（真实场景：main/style/format 等固定块名）
    const SAME_IDS = ['main', 'style', 'format'];
    const list = [
        MK('战报系统 v1.0', ['你是战报撰写助手。', '请严格按照格式输出核心内容。', '注意保持风格统一。'], {}, SAME_IDS),
        MK('战报系统 v2.0', ['你是战报撰写助手。', '请严格按照格式输出核心内容。', '注意保持风格统一。'], { temperature: 0.5 }, SAME_IDS),
        MK('Battlereport', ['你是战报撰写助手。', '请严格按照格式输出核心内容。', '注意保持风格统一。'], {}, SAME_IDS), // 与上同结构（改名同源）
        MK('无关预设', ['完全不同的内容：这是一个翻译助手提示词。', '翻译时保留语气。', '不要添加解释。'], {}, ['trans1', 'trans2', 'trans3']),
        { path: '/presets/坏.json', name: '坏预设', data: { prompts: [] } }
    ];
    const res = scanPresetDuplicates(list);
    assert.equal(res.skipped.length, 1);
    assert.equal(res.skipped[0].reason, 'NO_PROMPTS');
    assert.equal(res.groups.length, 1, '应只有 1 个重复组（3 成员），无关预设单飞不成组');
    const g = res.groups[0];
    assert.ok(g.list.length >= 2, '组内至少 2');
    // 无关预设不成组
    assert.ok(res.groups.every((grp) => !grp.list.some((p) => p.name === '无关预设')));
    // 组内含改名同源标记（Battlereport stem ≠ 组名 stem）
    const grp = res.groups.find((x) => x.list.some((p) => p.name === 'Battlereport'));
    assert.ok(grp, '改名同源成员应并入组');
    assert.ok(grp.renamedCount >= 1);
    // 成员附五枚举与三维
    const member = grp.list.find((p) => !p._isCenter);
    assert.ok(member && member._simLabel, '成员应有相似类型标签');
    assert.ok('_structPct' in member && '_contentPct' in member);
});
