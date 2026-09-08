/**
 * presetScan 通用扫描单测
 * 覆盖:脚本字段识别(任意嵌套位置)、正则字段排除、扩展树枚举(含未知插件键)、
 *      prompts 跳过、大对象安全。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { scanPresetData, looksLikeScript } from '../js/utils/presetScan.js';

test('looksLikeScript 识别 JS 代码字符串', () => {
    assert.equal(looksLikeScript('<script>\nvar x = 1;\ndocument.body.append(x);\n</script>'), true);
    // 纯 JS 片段(无 script 标签,如酒馆助手加载器)
    const loader = "var V='v2.8.1';fetch('https://cdn.example.com/x.js').then(r=>r.text()).then(c=>{document.querySelectorAll('script[data-uaf]').forEach(s=>s.remove());});";
    assert.equal(looksLikeScript(loader), true);
    assert.equal(looksLikeScript('这是一段很长的普通中文文本'.padEnd(120, '啊')), false);
    assert.equal(looksLikeScript('短'), false);
    assert.equal(looksLikeScript(null), false);
});

test('scanPresetData 发现任意嵌套位置的脚本', () => {
    const code = '<script>var APP_ID="x";document.querySelector(".a");</script>';
    const data = {
        extensions: {
            SPreset: {
                CustomPlugin: { code, enabled: true },
                RegexBinding: { regexes: [] }
            },
            regex_scripts: [{ scriptName: 'x', findRegex: '/a/g', replaceString: code + code }],
            tavern_helper: { scripts: [], variables: {} }
        },
        prompts: [{ name: 'p', content: code }]
    };
    const { scripts, extEntries } = scanPresetData(data);
    const paths = scripts.map((s) => s.path);
    // 自定义插件键下的脚本被发现
    assert.ok(paths.includes('extensions.SPreset.CustomPlugin.code'), '任意位置脚本应被发现');
    // regex_scripts 与 prompts 里的脚本不重复扫描
    assert.ok(!paths.some((p) => p.includes('regex_scripts')), '正则字段不重复扫描');
    assert.ok(!paths.some((p) => p.includes('prompts')), '提示词不重复扫描');
    // 扩展树含未知插件键
    const extPaths = extEntries.map((e) => e.path);
    assert.ok(extPaths.includes('extensions.SPreset.CustomPlugin'), '未知插件键应出现在扩展树');
    assert.ok(extPaths.includes('extensions.SPreset.CustomPlugin.code'), '脚本字符串也应出现在扩展树');
});

test('scanPresetData 兼容无 extensions 的预设', () => {
    const r = scanPresetData({ temperature: 1, prompts: [] });
    assert.deepEqual(r.scripts, []);
    assert.deepEqual(r.extEntries, []);
    const r2 = scanPresetData(null);
    assert.deepEqual(r2.scripts, []);
});

test('scanPresetData 空数组脚本容器不误判', () => {
    const data = {
        extensions: {
            tavern_helper: { scripts: [], variables: {} },
            SPreset: { ChatSquash: { enabled: false, stop_string: 'User: ' }, MacroNest: false, ToolBindings: {} }
        },
        prompts: []
    };
    const { scripts, extEntries } = scanPresetData(data);
    assert.deepEqual(scripts, [], '空脚本容器不产生脚本');
    const extPaths = extEntries.map((e) => e.path);
    assert.ok(extPaths.includes('extensions.SPreset.ChatSquash.enabled'), '配置叶子枚举到');
    assert.ok(extPaths.includes('extensions.tavern_helper.variables'), '空对象键也枚举');
});
