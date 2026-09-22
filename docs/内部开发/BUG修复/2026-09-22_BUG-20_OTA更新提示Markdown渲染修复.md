# BUG-20 OTA「发现新版本」弹窗更新说明 Markdown 格式符号漏出修复

> 日期：2026-09-22 · 分支：main-v1.10（v1.10.30 发布后用户反馈）
> 触发：用户升级提示弹窗中更新说明直接显示 `##`、`**`、`-` 等 Markdown 符号（非渲染文本）
> 结论前置：**根因 = 弹窗模板对 `updateInfo.notes` 使用纯文本插值（`{{ }}` + `white-space: pre-line`）。已改为 Markdown 渲染（Showdown + DOMPurify，与聊天渲染同策略）并模拟器实测通过。**

---

## 一、现象与根因

| 步骤 | 内容 |
|---|---|
| 现象 | 「发现新版本」弹窗正文原样显示发布正文源文本：`## SillyTavern 角色卡管理器 v1.10.30`、`### ✨…`、`**重点修复**：…` 等符号全部漏出 |
| 根因 | `SettingsView.vue` OTA 弹窗：`<div class="ota-notes">{{ updateInfo.notes }}</div>` —— 纯文本插值 + `white-space: pre-line`，Markdown 源文本直出 |
| 数据源 | 正文来自 GitHub Release body（由 `RELEASE_NOTES.md` 抽取，本身就是 Markdown） |

---

## 二、修复

| 层 | 变更 |
|---|---|
| 新增模块 | `js/utils/mdMini.js`：`markdownToHtml()` —— Showdown（配置对齐 CardDetailView 聊天渲染：tables/strikethrough/headerLevelStart=1）+ 轻量降级；**纯 JS，可 Node 单测**（输出为未清洗 HTML，安全过滤由消费方负责） |
| 组件接线 | `SettingsView.vue`：`otaNotesHtml` computed = `sanitizeStatusHtml(markdownToHtml(notes))`（DOMPurify 白名单复用 `useStatusbarPreview`，h1-h6/hr/ul/ol/li/strong 等全量放行）；渲染异常时兜底转义纯文本 |
| 模板 | `{{ updateInfo.notes }}` → `v-html="otaNotesHtml"` |
| 排版 | `.ota-notes` 移除 `white-space: pre-line`；新增 `:deep()` 排版：标题紧凑化（h1-h6 → 13px 加粗，弹窗空间有限）、列表缩进、分隔线、行内/块级代码、引用、链接色 |

---

## 三、验证

| 项 | 结果 |
|---|---|
| 单元测试 | 新增 `test/mdMini.test.mjs`（5 组：标题/粗体、列表/分隔线、代码块转义、空值安全、**真实 RELEASE_NOTES 结构**转换）；`npm test` **152/152** |
| 模拟器实测 | 用真实 v1.10.30 发布正文（1163 字节抽取段）注入弹窗：标题加粗、列表缩进、「✨ 新增/🔴 修复/升级说明」小标题、正文可滚动 —— **无任何格式符号漏出**（截图归档） |
| OTA 链路回归 | 检查更新请求/版本比较正常（当前包版本 1.10.30 == feed 版本 → 正确提示「当前已是最新版本」不弹窗） |

⚠️ **生效条件**：弹窗渲染由 App 内代码决定，本修复需随新版本发布后，用户端后续的更新提示才会以渲染形式展示。

**截图归档**：`docs/内部开发/截图记录/2026-09-22-OTA更新提示渲染修复/`（修复前对比 + 渲染后上/下半部）。
