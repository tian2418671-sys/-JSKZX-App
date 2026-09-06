// 🧩 插件归一与形态识别逻辑测试
// ⚠️ 直接加载纯逻辑模块 js/utils/pluginScanner.js（无 Electron / DOM 依赖，可被 node --test 加载）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    detectScriptKind,
    isPluginJson,
    isExtensionManifest,
    normalizeJsonPlugin,
    normalizeScriptPlugin,
    normalizeExtensionPlugin,
    resolveManifestEntries,
    resolvePreviewAssets,
    stripExt,
    stableId
} from '../js/utils/pluginScanner.js';

test('detectScriptKind：识别三种内容形态', () => {
    assert.equal(detectScriptKind('// ==UserScript==\n(function(){})()'), 'B');
    assert.equal(detectScriptKind('SlashRunner.registerCommand("foo", ()=>{})'), 'C');
    assert.equal(detectScriptKind('$(()=>{ $("#chat").append("<div>") })'), 'A');
    assert.equal(detectScriptKind(''), 'unknown');
});

test('isPluginJson：酒馆助手脚本 vs 角色卡/世界书/预设', () => {
    assert.equal(isPluginJson({ id: 'x', name: '助手', content: '$(()=>{})', buttons: [] }), true);
    assert.equal(isPluginJson({ name: '助手', content: 'var a=1;' }), true);
    assert.equal(isPluginJson({ spec: 'chara_card_v2', content: 'x' }), false); // 角色卡
    assert.equal(isPluginJson({ entries: {}, content: 'x' }), false);            // 世界书
    assert.equal(isPluginJson({ prompts: [], content: 'x' }), false);            // 预设
    assert.equal(isPluginJson(null), false);
});

test('isExtensionManifest：识别 manifest.json', () => {
    assert.equal(isExtensionManifest({ manifest_version: '1.0', name: 'ext' }), true);
    assert.equal(isExtensionManifest({ name: 'ext', extensions: [{ name: 'a' }] }), true);
    // 独立扩展格式（st-yuzi-phone）：display_name + js/css 入口
    assert.equal(isExtensionManifest({ display_name: 'Yuzi Phone', js: 'dist/a.js', css: 'dist/a.css' }), true);
    assert.equal(isExtensionManifest({ display_name: 'CSS only', css: 'dist/a.css' }), true);
    assert.equal(isExtensionManifest({ display_name: 'No entry' }), false);
    assert.equal(isExtensionManifest({ name: 'just a json' }), false);
    assert.equal(isExtensionManifest(null), false);
});

test('normalizeJsonPlugin：归一化为 plugin 模型', () => {
    const p = normalizeJsonPlugin({ type: 'json', path: 'C:/p/helper.json', name: 'helper.json', data: { id: 'th-1', name: '助手', info: '悬浮球', buttons: [{ name: 'a' }], content: '$(()=>{})' } });
    assert.equal(p.kind, 'tavern-helper');
    assert.equal(p.scriptKind, 'A');
    assert.equal(p.name, '助手');
    assert.equal(p.source.type, 'json');
    assert.equal(p.source.origin, 'C:/p/helper.json');
    assert.equal(p.meta.buttons.length, 1);
    assert.equal(p.scripts[0].content, '$(()=>{})');
});

test('normalizeScriptPlugin：SlashRunner 脚本识别为命令类', () => {
    const p = normalizeScriptPlugin({ type: 'script', path: 'C:/s/status.js', name: 'statusSystem.js', content: 'SlashRunner.registerCommand("st", ()=>{})' });
    assert.equal(p.kind, 'slash');
    assert.equal(p.scriptKind, 'C');
});

test('normalizeExtensionPlugin：manifest 入口解析', () => {
    const manifest = { manifest_version: '1.0', name: 'phone', extensions: [{ name: 'a', entry: 'dist/index.js' }] };
    const p = normalizeExtensionPlugin({ type: 'extension', root: 'C:/ext/phone', name: 'phone', manifest, files: ['C:/ext/phone/dist/index.js', 'C:/ext/phone/dist/style.css'] });
    assert.equal(p.kind, 'extension');
    assert.equal(p.scriptKind, 'bundle');
    assert.equal(p.scripts[0].bundlePath, 'C:/ext/phone/dist/index.js');
});

test('resolveManifestEntries：兼容 entry/main/js/index/css 多种字段', () => {
    assert.deepEqual(resolveManifestEntries({ extensions: [{ entry: 'dist/a.js' }, { css: 'dist/a.css' }] }), ['dist/a.js', 'dist/a.css']);
    assert.deepEqual(resolveManifestEntries({ main: 'dist/b.js' }), ['dist/b.js']);
    assert.deepEqual(resolveManifestEntries({}), ['dist/index.js']); // 兜底
    // 独立扩展格式（st-yuzi-phone）：js/css 顶层字段
    assert.deepEqual(resolveManifestEntries({ js: 'dist/yuzi-phone.bundle.js', css: 'dist/yuzi-phone.bundle.css' }), ['dist/yuzi-phone.bundle.js', 'dist/yuzi-phone.bundle.css']);
});

test('resolvePreviewAssets：只挑出 manifest 声明的入口 js/css（不兜底 files，避免误注入工程配置文件）', () => {
    const plugin = {
        scripts: [
            { lang: 'js', bundlePath: 'dist/a.js' },
            { lang: 'css', bundlePath: 'dist/a.css' }
        ],
        files: ['dist/a.js', 'dist/a.css', 'eslint.config.mjs', 'img/icon.png']
    };
    const assets = resolvePreviewAssets(plugin);
    assert.deepEqual(assets.js, ['dist/a.js']);
    assert.deepEqual(assets.css, ['dist/a.css']);
});

test('resolvePreviewAssets：不把 files 里的 mjs 配置当 bundle 注入', () => {
    const plugin = {
        scripts: [{ lang: 'js', bundlePath: 'dist/index.js' }],
        files: ['dist/index.js', 'eslint.config.mjs', 'postcss.config.js', 'build.mjs']
    };
    const assets = resolvePreviewAssets(plugin);
    assert.deepEqual(assets.js, ['dist/index.js']);
    assert.deepEqual(assets.css, []);
});

test('stripExt / stableId：去除扩展名 + 稳定哈希', () => {
    assert.equal(stripExt('statusSystem.js'), 'statusSystem');
    assert.equal(stripExt('helper.json'), 'helper');
    assert.equal(stableId('abc'), stableId('abc'));
    assert.notEqual(stableId('abc'), stableId('abd'));
});
