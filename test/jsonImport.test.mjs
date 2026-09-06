// 🧩 JSON 脚本导入测试（基于资料库真实样例）
// 验证「只支持 JSON 格式插件」阶段的导入归一化链路：
//   真实 JSON 文件 → isPluginJson 判定 → normalizeJsonPlugin 归一化 → plugin 模型
// ⚠️ 直接加载纯逻辑模块 js/utils/pluginScanner.js（无 Electron / DOM 依赖）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    isPluginJson,
    normalizeJsonPlugin,
    stripExt
} from '../js/utils/pluginScanner.js';

// 项目根目录（test/ 的上一级）
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 读取资料库真实样例
const summaryJson = JSON.parse(readFileSync(join(root, '资料库', '全自动总结.json'), 'utf-8'));
const chatJson = JSON.parse(readFileSync(join(root, '资料库', '更好的聊天记录管理 .json'), 'utf-8'));

test('真实样例①「全自动总结.json」被识别为酒馆助手 JSON 脚本', () => {
    assert.equal(isPluginJson(summaryJson), true);
    assert.equal(typeof summaryJson.content, 'string');
    assert.ok(summaryJson.content.includes('==UserScript=='));
});

test('真实样例②「更好的聊天记录管理 .json」（文件名带空格）被识别为酒馆助手 JSON 脚本', () => {
    assert.equal(isPluginJson(chatJson), true);
    assert.equal(typeof chatJson.content, 'string');
});

test('normalizeJsonPlugin 归一化「全自动总结.json」：userscript 头 → scriptKind B', () => {
    const p = normalizeJsonPlugin({
        type: 'json',
        path: join(root, '资料库', '全自动总结.json'),
        name: '全自动总结.json',
        data: summaryJson
    });
    assert.equal(p.kind, 'tavern-helper');
    assert.equal(p.scriptKind, 'B'); // userscript 头形态
    assert.equal(p.name, '全自动总结');
    assert.equal(p.id, '7237939c-7134-4c2f-88a4-4e36950a1f54');
    assert.equal(p.source.type, 'json');
    assert.equal(p.source.origin, join(root, '资料库', '全自动总结.json'));
    assert.equal(p.meta.buttons.length, 1);
    assert.equal(p.meta.buttons[0].name, '自动总结');
    assert.equal(p.scripts.length, 1);
    assert.equal(p.scripts[0].content, summaryJson.content); // 完整保留注入脚本
});

test('normalizeJsonPlugin 归一化「更好的聊天记录管理 .json」：jQuery 注入 → scriptKind A', () => {
    const p = normalizeJsonPlugin({
        type: 'json',
        path: join(root, '资料库', '更好的聊天记录管理 .json'),
        name: '更好的聊天记录管理 .json',
        data: chatJson
    });
    assert.equal(p.kind, 'tavern-helper');
    assert.equal(p.scriptKind, 'A'); // jQuery $() 注入形态
    assert.equal(p.name, '更好的聊天记录管理');
    assert.equal(p.id, 'dfe3c00c-58f6-49e4-a8c5-e2e54f83c625');
    assert.equal(p.meta.buttons.length, 0);
    assert.equal(p.scripts[0].content, chatJson.content);
});

test('stripExt 正确处理带空格文件名「更好的聊天记录管理 .json」', () => {
    assert.equal(stripExt('更好的聊天记录管理 .json'), '更好的聊天记录管理 ');
    assert.equal(stripExt('全自动总结.json'), '全自动总结');
});

test('JSON 脚本导入不误判：角色卡/世界书/预设/损坏 JSON 均被拒绝', () => {
    // 角色卡（spec 字段）
    assert.equal(isPluginJson({ spec: 'chara_card_v2', name: '卡', content: 'x' }), false);
    // 世界书（entries 字段）
    assert.equal(isPluginJson({ entries: {}, content: 'x' }), false);
    // 预设（prompts 字段）
    assert.equal(isPluginJson({ prompts: [], content: 'x' }), false);
    // 缺少 content JS 字符串
    assert.equal(isPluginJson({ name: '无内容' }), false);
    // content 非字符串
    assert.equal(isPluginJson({ name: '异常', content: 123 }), false);
    // 空对象 / null
    assert.equal(isPluginJson({}), false);
    assert.equal(isPluginJson(null), false);
});
