# 移动端功能补齐方案（Mobile Gap Plan）

> **定位**：本项目主攻方向为 **Android 化**；桌面版（Electron）作为功能参考基线，不再作为主要交付物。
> **基线**：桌面版 v1.9.0 ｜ 移动端：Capacitor 8.5 + Vue3 + Vant ｜ 日期：2026-08-30
> **关联文档**：`APP-移植方案-v2.md`（迁移方案）、`android-migration-changelog.md`（变更日志）

---

## 1. 核心结论：差距在 UI 层，不在桥接层

`APP-移植方案-v2.md` 的功能对齐基线里大量标「✅ 完成」，其完成对象是 **桥接层 / 原生能力**（`js/bridge/android.js` + `android/` 下 Java 插件）。实际上：

- **桥接层已基本完整**：`android.js` 已实现契约 `contract.js` 中几乎全部方法，覆盖快照、世界书、回收站、查重、URL 下载、OTA、磁盘扫描、推送、加密。
- **移动端 UI 层（`js/mobile/views/`）覆盖的功能远少于桌面端**——大量已通桥接的能力没有被 UI 暴露给用户。

因此本方案的补齐目标是：**把「桥接已通、UI 未接」的能力逐项接到移动端界面，同时补齐 UI 层的编辑深度与搜索深度**。

### 1.1 硬缺口（原生/桥接层真正做不到的，需明确降级策略）

| 项 | 说明 | 降级策略 |
|---|---|---|
| WebP 卡片原地编辑 | `_saveCardWebp` 返回「暂不支持原地修改元数据」 | 引导用户在桌面端转 PNG，或保存时自动转 PNG |
| 系统对话框 | `showMessage` 降级为 `window.alert` | 统一替换为 Vant Dialog |

---

## 2. 移动端现状（已实现）

5 个页面 + 2 个组件，覆盖「能用」的核心闭环：

| 页面 | 已实现 |
|---|---|
| 卡片库 `CardLibraryView` | SAF 授权、搜索(名称/描述/创建者)、分组过滤、网格/列表、增量渲染、导入、移动分组、重命名、删除、单卡导出、批量 ZIP 导出、查重 |
| 卡片详情 `CardDetailView` | 基础设定、标签增删、Token 估算、高级设定、状态栏预览(简化)、世界书条目编辑、正则编辑、聊天测卡、推送酒馆 |
| 世界书 `WorldbookView` | 卡内世界书 + 独立世界书列表、条目编辑、查重 |
| 设置 `SettingsView` | 库授权、API 配置、深色主题、OTA 更新、版本 |
| 磁盘扫描 `DiskScanView` | 目录深度扫描、勾选导入 |

---

## 3. 差距清单（分优先级）

### 🔴 P1 — 安全感类（桥接已通，纯 UI 接入，成本最低价值最高）

| 功能 | 桌面模块 | 桥接状态 | 说明 |
|---|---|---|---|
| 快照 | `SnapshotModal` + `WbSnapshotModal` | ✅ 已通（卡片 6 方法 + 世界书 3 方法） | 移动端无任何快照 UI |
| 回收站 | 全局回收站 + `.trash` | ✅ 已通（`openGlobalTrash`/`trashFiles`） | 移动端删除为直接删，缺浏览/恢复界面 |

### 🟠 P2 — 核心编辑/搜索体验（数据已就绪，UI 深度不足）

| 功能 | 桌面端 | 移动端现状 |
|---|---|---|
| 世界书条目完整字段 | keys/keysecondary/selective/constant/position/order/插入深度/排序/折叠 | 仅 comment/content/enabled（数据结构已初始化 keys 等字段，仅 UI 未暴露） |
| 正则完整字段 | placement/禁用/多字段 | 仅 scriptName/findRegex/replaceString/enabled |
| 全维度搜索 | 名称/作者/简介/世界书条目/触发词/标签/物理文件名/路径 | 仅名称 + 描述 + 创建者 |
| 分组管理 | 重命名/删除空分组管理界面 | 仅「移动时新建分组」 |
| 卡片配置持久化 | `cardOverlays[path]` 记忆手动分类/标签 | 无，重扫可能冲刷 |
| 快捷过滤 | has_lorebook / has_regex | 无 |

### 🟡 P3 — 增值功能（桌面有独立模块，移动端完全没有）

| 功能 | 桌面模块 |
|---|---|
| 状态栏模板库 | 15 套渲染模板 + 11 套世界书指令模板（`statusbarTemplates.js` / `statusbarPromptTemplates.js`） |
| 全局词条搜索 | `GlobalEntrySearchModal` + `useGlobalEntrySearch` |
| Diff 对比 | `DiffModal` |
| 全局资产中心 | `GlobalAssetModal` |

### 🔵 P4 — 重量级（桌面招牌功能，需较大投入）

| 功能 | 桌面模块 |
|---|---|
| 关系图谱 | `GraphModal` + `WbGraphModal` + `useGraph`（权重/隔离/三色连线/枢纽高亮） |
| AI 智能工具 | `AITagModal` + `useAITools`（AI 打标/汉化/生成描述） |
| 标签系统 | `useTags` + `BatchTagModal` + `SingleTagModal`（标签库/中英双语/批量打标/系统标签） |

---

## 4. 执行计划

> 原则：先「接桥」（成本低、价值高），再「补深」（编辑/搜索体验），后「增能」（增值与重量级）。
> 每阶段完成后更新第 5 节「执行记录」，并跑 `npm test` + `npm run build:web` 验证。

### P1：快照 + 回收站 UI
- 卡片详情页接入快照入口（手动快照 / 快照列表 / 恢复 / 删除 / 清理）。
- 世界书视图接入世界书快照。
- 卡片库/详情页接入回收站浏览与恢复。
- 验收：可手动建快照、回滚、清理；删除文件可进回收站并恢复。

### P2：世界书/正则/搜索深度
- 世界书条目编辑暴露 keys/keysecondary/selective/constant/position/order 字段。
- 正则编辑暴露 placement 等完整字段。
- 卡片库搜索升级为全维度检索（复用 `utils` 解析字段）。
- 分组重命名/删除空分组 UI。
- 验收：与桌面字段语义一致，保存后酒馆可识别。

### P3：状态栏模板库 + 全局词条搜索 + Diff + 资产中心
- 状态栏模板注入（复用桌面 `statusbarTemplates` / `statusbarPromptTemplates`）。
- 全局词条搜索弹窗。
- Diff 对比、全局资产中心。

### P4：图谱 + AI 工具 + 标签系统
- 关系图谱（卡片 + 世界书）。
- AI 打标 / 汉化。
- 标签库、中英双语、批量打标。

---

## 5. 执行记录

| 日期 | 阶段 | 内容 | 状态 |
|---|---|---|---|
| 2026-08-30 | — | 建立本方案文档 | ✅ |
| 2026-08-30 | P1 | 卡片快照 UI：新增 `SnapshotModal.vue`（Vant 底部弹层）+ `CardDetailView` 接入（手动/列表/恢复/删除/清理） | ✅ 待构建验证 |
| 2026-08-30 | P1 | 世界书快照 UI：`WorldbookView` 接入（独立世界书文件的列表/恢复/删除，复用 SnapshotModal） | ✅ 待构建验证 |
| 2026-08-30 | P1 | 回收站：`android.js` 补 `listTrash`/`restoreTrashItem`/`emptyTrash` + `deleteFile` 对齐桌面软删除语义 + `TrashModal.vue` + 设置页入口 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P2 | 世界书条目完整字段：CardDetailView + WorldbookView 暴露 keys/次级触发词/优先级/权重/常驻/条件触发/插入位置(0-3)，展开式编辑，保存时剥离临时字段 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P2 | 正则完整字段：placement 多选(0全局/1输入/2AI/3全文) + disabled 语义修正（旧 enabled 兼容迁移，statusScripts 同步修复） | ✅ 构建过/46测全绿 |
| 2026-08-30 | P2 | 全维度搜索：名称/创建者/简介/性格/场景/标签/文件名/路径/开场白/世界书条目(名+触发词+次级+内容)/正则脚本名 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P2 | 快捷过滤：有世界书 / 有正则；分组管理：新建/重命名/删除空分组（双级 ActionSheet） | ✅ 构建过/46测全绿 |
| 2026-08-30 | P1补 | WorldbookView 编辑器导航栏补快照入口图标（P1 遗漏接线，openWbSnapshots 已定义未接 UI） | ✅ 构建过/46测全绿 |
| 2026-08-30 | 修复 | 卡片库删除确认 window.confirm → Vant showConfirmDialog（WebView 静默失败风险对齐交接手册坑#2） | ✅ |
| 2026-08-30 | P3 | 状态栏模板库：CardDetailView 状态栏预览加「模板库」折叠区，15套渲染模板注入为正则脚本 + 11套指令模板注入为世界书条目（去重拦截） | ✅ 构建过/46测全绿 |
| 2026-08-30 | P3 | 全局词条搜索：新增 `GlobalEntrySearchModal.vue` + WorldbookView 导航栏入口（跨独立世界书+角色卡内嵌，触发词/正文/备注/来源名，跳转定位） | ✅ 构建过/46测全绿 |
| 2026-08-30 | P3 | 全局资产中心：新增 `GlobalAssetModal.vue`（世界书合集+正则合集 Tab）+ WorldbookView 入口 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P3 | Diff 对比：新增 `DiffModal.vue` + DedupeModal 冗余版本加「对比」按钮（复用桌面句级切块 diff 算法，卡片/世界书双模式） | ✅ 构建过/46测全绿 |
| 2026-08-30 | P4 | 关系图谱：新增 `GraphModal.vue`（全屏 ECharts，三路倒排索引+pair聚合+超大群体跳过+连线预算1500+枢纽高亮+搜索高亮），卡片库导航栏入口，双击节点跳详情 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P4 | AI 智能工具：新增 `AiToolModal.vue`（单卡打标/一键汉化/提示词重构，复用测卡 API 配置与桥接 sendChatMessage），卡片详情页 🤖 入口 | ✅ 构建过/46测全绿 |
| 2026-08-30 | P4 | 标签库：CardDetailView 标签行下方预设标签库（28项中英双语，点击切换，对齐桌面 presetTagsLibrary） | ✅ 构建过/46测全绿 |
| 2026-08-30 | S1-3 | 世界书库完整管理：WorldbookView 接入外部世界书目录扫描/新建/重命名/复制/删除/分组/URL导入/文件导入/条目级合并(WbImportModal)/批量导出 | ✅ 构建过/46测全绿 |
| 2026-08-30 | S4 | 卡片操作补全：URL导入(downloadCardFromUrl) + 换卡图(Java层新增pickImage插件→replaceCardImage) + MobileCardCover增加clearCoverCache导出 | ✅ 构建过/46测全绿 |
| 2026-08-30 | S5 | 批量系统：长按菜单多选入口 + 卡片勾选圆点 + 底部操作栏(全选/批量标签/批量分组/删除/退出) + 批量标签弹窗(追加/覆盖) | ✅ 构建过/46测全绿 |
| 2026-08-30 | S6 | 设置补全：快照自动备份配置(开关/冷却间隔/最大保留数→updateSnapshotConfig) + 清理孤儿快照 + 清理全部快照 + 导入忽略标签(localStorage→parseCard) | ✅ 构建过/46测全绿 |
| 2026-08-30 | S7 | 全面自检：桥接契约72个API 100%对齐 + 无v-model-on-prop + 无TDZ自引用 + WebP降级提示 + extractBookEntries兼容 + 临时字段剥离 | ✅ 全部通过 |
| 2026-08-30 | S8 | 构建验证：46单测全绿 + vite构建985模块 + cap sync 5本地插件注册 | ✅ 全部通过 |
| 2026-08-30 | S9 | 打包Android Debug APK：gradlew assembleDebug成功，产物19.04MB | ✅ JSKZX-v1.9.0-debug.apk |
