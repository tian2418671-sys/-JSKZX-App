/**
 * 📝 轻量 Markdown 渲染单测（mdMini）
 * 覆盖：标题 / 粗体 / 列表 / 分隔线 / 代码块 / 引用 / 空值安全
 * 说明：输出为未清洗 HTML（安全过滤由消费方 DOMPurify 负责），此处只测结构转换。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../js/utils/mdMini.js';

test('标题与粗体渲染', () => {
    const html = markdownToHtml('## 版本标题\n\n### 小标题\n\n- **重点修复**：说明文字');
    assert.ok(html.includes('<h2'), '应生成 h2：' + html);
    assert.ok(html.includes('<h3'), '应生成 h3：' + html);
    assert.ok(html.includes('<strong>重点修复</strong>'), '应保留粗体：' + html);
});

test('列表与分隔线渲染', () => {
    const html = markdownToHtml('- 第一条\n- 第二条\n\n---\n\n**升级说明：**');
    assert.ok(html.includes('<ul>') && html.includes('<li>第一条</li>'), '应生成列表：' + html);
    assert.ok(html.includes('<hr'), '应生成分隔线：' + html);
});

test('代码块与行内代码', () => {
    const html = markdownToHtml('```\nconst a = 1 < 2;\n```\n\n行内 `code` 片段');
    assert.ok(html.includes('<pre>') && html.includes('<code>'), '应生成代码块：' + html);
    assert.ok(html.includes('&lt;'), '代码内尖括号应被转义：' + html);
});

test('空值安全', () => {
    assert.equal(markdownToHtml(''), '');
    assert.equal(markdownToHtml(null), '');
    assert.equal(markdownToHtml(undefined), '');
});

test('RELEASE_NOTES 实际段落结构可完整转换', () => {
    const md = [
        '## SillyTavern 角色卡管理器 v1.10.30',
        '',
        '本地优先、完全离线可用的角色卡管理工具。',
        '',
        '### ✨ v1.10.30 更新 —— 自定义背景图 + 页面底部遮挡修复',
        '',
        '#### ✨ 新增',
        '',
        '- **自定义背景图**：设置页新增「自定义背景」。',
        '',
        '**升级说明：**',
        '',
        '- 已安装的手机版点「检查更新」按提示升级。'
    ].join('\n');
    const html = markdownToHtml(md);
    assert.ok(!html.includes('##'), '不应残留 Markdown 标题符号：' + html);
    assert.ok(!html.includes('**'), '不应残留 Markdown 粗体符号：' + html);
    assert.ok(html.includes('<h4'), '四级标题应转换：' + html);
});
