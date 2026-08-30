# 移动端 vs 桌面端 — 第二轮差距盘点与替代方案

> 日期：2026-08-30
> 背景：前几轮已完成 P1~P4 + S1~S9（快照/回收站/世界书库管理/卡片操作/批量系统/设置补全/图谱/AI工具/标签库），APK 已打包。
> 本文为**第二轮全量对比**：逐一核对桌面端 `js/components/`(31个) + `js/composables/`(18个) 与移动端 `js/mobile/`(5 views + 10 components)，列出剩余缺口，
> 并对「依赖 Electron 桌面特性、无法直接迁移」的功能给出移动端替代方案。
>
> **执行状态（2026-08-30）：A/B/C/D 四组已全部实施完成，构建过/46测全绿，APK 已重新打包。**
> - A组：WorldbookView 词条工具栏（搜索/筛选/排序下拉 + 体检 + 展开/折叠 + 批量），条目行上移/下移/复制图标，批量操作栏（全选/删除/停用/退出）
> - B组：多本智能合并弹窗（指纹去重 Key+Content）、从卡提取世界书（字段转换 keys→key）、JSONL/Rentry 导入（parseEntriesFlexible 逐行解析）、库统计弹窗
> - C组：模型列表拉取（fetchAvailableModels + 模型选择器弹窗 + 搜索过滤）、协议切换自动填端点（onApiTypeChange）、API Key 加密落盘（KeystorePlugin AES-256-GCM，兼容旧明文读取）
> - D组：自定义标签库（localStorage 持久化，＋自定义/管理入口，Promise 式输入弹窗）

---

## 一、已实现（无需重复）

| 桌面模块 | 移动端落地 |
|---|---|
| 快照 SnapshotModal / WbSnapshotModal | `SnapshotModal.vue`（复用卡片+世界书） |
| 回收站（.trash 软删除） | `TrashModal.vue` + `deleteFile`/`trashFiles` 对齐软删除语义 |
| 世界书库管理（扫描/新建/重命名/复制/删除/分组） | `WorldbookView` 全套 |
| 世界书 URL/文件导入 + 条目级合并 | `fetchWbUrl` + `WbImportModal.vue` |
| 世界书批量导出 | `exportWorldbooksBatch` |
| 卡片物理副本/换卡图/URL导入/文件定位 | `duplicateFile` / `pickImage`(Java新增)+`replaceCardImage` / `downloadCardFromUrl` / `showItemInFolder` |
| 批量选择/批量标签/批量分组/批量删除 | `CardLibraryView` 批量模式 |
| 快照自动备份配置/清理 | `SettingsView` + `updateSnapshotConfig`/`cleanAllSnapshots`/`cleanOrphanSnapshots` |
| 关系图谱（卡片） | `GraphModal.vue`（ECharts 自包含） |
| AI 打标/汉化/重构（单卡） | `AiToolModal.vue` |
| 状态栏模板库 / 全局词条搜索 / 资产中心 / Diff | 均已落地 |
| 查重 / 磁盘扫描 / OTA 更新 / 测卡 / 推送(单目标) | 均已落地 |

---

## 二、剩余缺口（桌面有、移动缺）

### A. 世界书条目级功能（`useWorldbookEntries.js`，移动端 WorldbookView 编辑器缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| 词条排序 | order / name / contentLen 三种 | 纯前端，易 |
| 词条状态筛选 | 全部/启用/禁用/常驻/条件触发 | 纯前端，易 |
| 词条实时搜索 | 按触发词/正文/备注过滤 | 纯前端，易 |
| 词条上移/下移 | `moveEntry(entry, dir)` | 纯前端，易 |
| 词条复制 | `duplicateWorldbookEntry` | 纯前端，易 |
| 词条批量模式 | 批量删除 / 批量启用禁用 | 纯前端，易 |
| 词条体检 | 重复词条 / 空词条 / 孤儿触发词 `runEntryHealthCheck` | 纯前端，易 |
| 全部展开/折叠 | `expandAllWorldbook` / `collapseAllWorldbook` | 纯前端，易 |

### B. 世界书库级功能（`useWorldbookExtras.js` + WbMergeModal/WbGraphModal，移动端缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| 从卡内世界书提取为独立世界书 | `extractWorldbookFromCard`（keys→key 字段转换） | 纯前端，中 |
| JSONL / Rentry 导入 | `importWbFromJsonl` + `parseEntriesFlexible` | 纯前端，中 |
| 多本世界书智能合并（去重） | `WbMergeModal` | 纯前端，中 |
| 世界书词条逻辑关联图谱 | `WbGraphModal`（复用 GraphModal 的 ECharts 经验） | 中（ECharts） |
| 导出过滤词条为独立世界书 | `exportFilteredWorldbook` | 纯前端，中 |
| 世界书库统计 | `wbStats`（书数/词条数/token/常驻数/触发覆盖率） | 纯前端，易 |

### C. 聊天测卡增强（`useChat.js`，移动端 CardDetailView 缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| 模型列表拉取 | `fetchAvailableModels` → `fetchModels`（主进程绕过 CORS） | **不能直接迁移**，见 §三-2 |
| 切换协议自动填默认端点 | `handleApiTypeChange` | 纯前端，易 |
| 聊天渲染模式 | `isChatRenderMode`（HTML 渲染 vs 代码） | **不能直接迁移**，见 §三-3 |
| API Key 加密 | `encryptSecret`（Electron safeStorage） | **不能直接迁移**，见 §三-1 |

### D. 标签系统增强（`useTags.js`，移动端缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| 系统标签池（全局标签库）编辑 | `addTagToGlobalPool` / `clearAllTagsFromPool` | 纯前端 + 配置持久化 |
| 全局标签库聚合 | `SingleTagModal`（点击常用标签快速添加） | 纯前端，中 |
| 批量删除标签 | `isBatchDeleteTags`（跨卡批量删除某标签） | 纯前端 + 批量落盘，中 |
| 清理无效全局标签 | `cleanGlobalTagsPrompt` | 纯前端，中 |

### E. 卡片库 / 配置增强（移动端缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| AI 批量打标（多卡） | 移动端仅单卡，缺 `openAITagModal` 批量 | 中（复用 AiToolModal 逻辑循环） |
| 全选所有卡片 | `selectAllCards` | 纯前端，易 |
| 推送多目标管理 | `PushModal`（移动端仅单 URL） | 中 |
| 配置备份/恢复 | `exportLibraryDB`（导出 app_config.json） | **不能直接迁移**，见 §三-4 |

### F. UI / 主题（移动端缺）

| 功能 | 说明 | 迁移难度 |
|---|---|---|
| 三套主题 | 暗夜/青灰/白昼（移动端仅深浅色） | 纯前端，中 |
| 界面外观/字号设置 | `resetPersonalizationSettings` | 低价值，可后置 |

---

## 三、不能直接迁移的功能 → 替代方案

> 这些功能依赖 Electron 桌面特性（safeStorage / 主进程转发 / 任意路径文件系统 / 系统文件管理器），在 Android SAF 白名单 + WebView 环境下无法原样迁移，需换方案。

### 1. API Key 加密（`encryptSecret`）
- **桌面**：`electron.safeStorage.encryptString()`，密文落盘到 `app_config.json`。
- **移动端现状**：明文存 `localStorage['stc-api-key']`。
- **替代方案**：移动端已有 `KeystorePlugin`（Android Keystore）。在 `android.js` 暴露 `encryptSecret(plain)` / `decryptSecret(cipher)`，内部走 KeystorePlugin 的 AES-GCM；保存 API Key 时加密、发送前解密。签名对齐桌面，零前端改动。

### 2. 模型列表拉取（`fetchModels`，主进程绕过 CORS）
- **桌面**：Electron 主进程发起 `GET {endpoint}/v1/models`，绕过浏览器 CORS 限制。
- **替代方案**：`HttpPlugin` 已有 `downloadBytes`。新增 `HttpPlugin.httpGet(url, headers)` 转发（或复用 downloadBytes 拿 JSON），`android.js` 暴露 `fetchModels(endpoint, apiKey, apiType)` 走 HttpPlugin，返回 `{ data: [...] }`。LM Studio 本地端点无 CORS 本可直连，但云端点（OpenAI/Claude 兼容服务）必须走原生转发——统一走 HttpPlugin 最稳。

### 3. 聊天渲染模式（`isChatRenderMode`，iframe 渲染 HTML 卡片页）
- **桌面**：iframe `srcdoc` 渲染角色卡 HTML（头像/气泡/面板），与"代码模式"纯文本切换。
- **替代方案**：移动端 WebView 理论可渲染，但①XSS 风险高（角色卡是外部内容）②价值低（测卡主要看文案）。**降级为「纯文本 + 保留原文」**，不做 HTML 渲染；如确需富文本，用 DOMPurify 白名单清洗后渲染（与状态栏预览同款 `sanitizeStatusHtml`）。**建议：本轮不做，记为 backlog。**

### 4. 配置备份/恢复（`exportLibraryDB`，导出 app_config.json）
- **桌面**：导出 JSON 到任意用户路径 + 从任意路径导入。
- **替代方案**：移动端 SAF 白名单不能写任意路径，但可用「系统分享/创建文档」Intent（`exportCardFile` 同款机制）把配置 JSON 导出到下载目录/第三方 App；恢复走「系统文件选择器 + readText」。**低优先级，可后置。**

### 5. 已完成的替代（回顾，无需再动）
| 桌面原功能 | 移动端替代 |
|---|---|
| 拖拽导入（DragOverlay） | 系统文件选择器 `importExternalCards` |
| 打开系统文件夹（openBakFolder/openTrashFolder） | 应用内弹窗浏览（TrashModal/SnapshotModal） |
| 全局回收站（跨库 jsTavern_Trash） | 库内 `.trash` 软删除 |
| 在资源管理器打开 | `showItemInFolder`（ACTION_VIEW Intent） |
| Ctrl+S/Ctrl+O 快捷键 | 显式保存按钮 / SAF 选择器 |

---

## 四、建议执行顺序

1. **A 组（世界书条目级）**：排序/筛选/搜索/移动/复制/批量/体检/全部展开折叠 —— 全部纯前端，价值高，成本低，一次性补齐。
2. **C-2（切换协议自动填默认端点）** + **C-1（API Key 加密，接 KeystorePlugin）** + **C-4（模型列表拉取，接 HttpPlugin）** —— 测卡体验闭环。
3. **B 组（世界书库级）**：JSONL 导入 / 提取独立世界书 / 库统计 / 词条图谱 / 多书合并 —— 复用 GraphModal 经验。
4. **D 组（标签增强）**：系统标签池 / 全局标签库 / 批量删除标签。
5. **E/F 组**：AI 批量打标 / 推送多目标 / 三套主题 / 配置备份 —— 按需后置。

---

## 五、验证方式

- `npm test`（46 单测全绿）
- `npm run build:web`
- `npm run sync:android`（cap sync + post-cap-sync 注册本地插件）
- `cd android && gradlew.bat assembleDebug`
