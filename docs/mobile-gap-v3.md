# 移动端 vs 桌面端 v2.1.0 — 第三轮比对报告

> 日期：2026-08-30
> 桌面端：origin/master = 095b5d5（v2.1.0，force push，31组件/19组合式/47单测，已删除 js/mobile 与 android/ —— 移动端代码迁往 jskapp 仓库）
> 移动端：本地 master = fa38cf0（P0-P4 + S1-S9 + 第二轮 A-D/F 组全部完成，46 测全绿）
> ⚠️ jskapp 远程另有一条平行移动端实现（8b4a1bf "V3 方案阶段 0-5"），与本地已大幅分叉，见 §五。
>
> **✅ 第三轮迁移执行记录（2026-08-30 下午，第 1-5 项全部完成，构建过/46测全绿）**
> 1. ✅ 中文分词搜索：searchIndex.js（已修复方括号 bug 版）+ useSearch.js 桌面同款引擎接入 CardLibraryView（倒排索引 + 多词 AND + tag:/author:/file:/wb: 高级语法 + 9种排序内核）
> 2. ✅ AI 打标规则表：defaultAutoTagRules 38 条系统规则 + AutoTagRulesModal（系统规则开关/自定义规则/关键词候选，localStorage 持久化）+ 三层漏斗第一层免费先行（applyRuleTags 规则命中后 LLM 兜底）
> 3. ✅ PNG 快扫 + 写盘降噪：pngParser.js 前 1MB 策略版已迁移；移动端显式保存模式天然无重复写盘
> 4. ✅ 9 种排序：CardLibraryView sortBy 下拉（本地文件最新/导入/创建/修改/A-Z 正倒序/大小双序/Token），拼音+数字自然排序，稳定链兜底；Java 层补 size 字段，前端补 _ctime/_importTime 回退
> 5. ✅ readTextBatch + 内嵌缓存：Java 层新增 readTextBatch（单次 IPC 批量拉 json）；库目录 .jskzx_cache.json 缓存解析结果（path+mtime+size 指纹，上限 12000 条，扫描器跳过 .jskzx 前缀）→ 二次启动秒开
> 6. ✅ 预设管理引擎：桥接层 scanExternalPresets（复用 SAF scanWbTree，isValidPreset 校验排除角色卡/世界书）+ saveExternalPreset/renameExternalPreset/deleteExternalPreset/createExternalPreset + PresetsView（选目录/扫描/搜索/新建/JSON 编辑器/复制副本/删除，localStorage 记忆目录）+ 设置页入口
> 7. ✅ 内容指纹查重：DedupeModal 第三模式（MinHash 96 位签名 + LSH 8 band 候选 + 85% 阈值 + 并查集聚类，对齐桌面算法），Tab 切换 同名查重/内容指纹/世界书，相似度百分比展示，复用 trashFiles 清理与 Diff 对比
> 8. ⛔ 向量引擎（已定案：移动端不做，见 §三）
> 9. ✅ 推送目标模式：详情页推送弹窗二态（酒馆 API / 卡库目录），卡库目录多目标管理（命名保存/单选/删除，localStorage 持久化），复用 SAF copyToFolder 同名覆盖
> 10. ✅ 批量推送：卡片库批量模式新增「推送」按钮，批量复制选中卡到共享卡库目录目标
> 11. ✅ 字段级 Token 分析栏：详情页 Token 明细升级为带占比进度条的分析栏（6 字段彩色条 + 合计）
> 12. 🐞 滚动修复（真机反馈）：详情页 van-tabs 高度链不完整导致整页无法滑动——补齐 .van-tabs{flex:1;min-height:0;overflow:hidden} + .van-tabs__content/.van-tab__panel；世界书/设置/卡片库/磁盘扫描页 .view-body 统一补 min-height:0

---

## 一、桌面 v2.1.0 新增功能清单（相对本地 js/ 代码 +3442 行）

| # | 功能 | 桌面实现 | 移动端可迁移性 |
|---|---|---|---|
| 1 | **AI 打标规则可配置化**（38条预设规则 + 自定义规则 + 自定义关键词库） | `AutoTagRulesModal.vue` + `App.vue`(autoTagRules/compiledAutoTagRules/addCustomKeyword) + `cardLoader.compileAutoTagRules` | ✅ 纯前端，逻辑全在 JS，直接移植（持久化走 localStorage/app_config） |
| 2 | **本地向量引擎**（MiniLM-L12 三层漏斗第二层，免费离线语义匹配） | `main/vectorManager.js` + `vectorWorker.js`（Node Worker 线程推理）+ `models/Xenova` + main.js `vector:*` IPC + preload `vectorEngine` | ❌ 依赖 Node/Electron + 113MB 本地模型；移动端替代见 §三 |
| 3 | **智能查重升级**（同名版本清理 + 跨名称内容指纹查重 + 预设查重） | `ContentDedupeModal.vue` + `PresetDedupeModal.vue` + `useDedupe.js`(+518行) | ✅ 内容指纹查重纯 JS 可移植（对应移动端 DedupeModal 扩展）；预设查重依赖预设管理（见 #4） |
| 4 | **预设管理引擎**（酒馆 Presets 目录扫描 + 深度编辑 + 沙箱渲染预览） | `usePresets.js` + SidebarPanel 预设视图 + EditorPanel(+564行 prompts/scripts 分区/iframe 预览/拖拽) + main.js `preset:scan` IPC | ⚠️ 前端 UI 可移植；扫描/文件接口需移动端桥接替代（见 §三） |
| 5 | **9 种排序**（拼音/自然排序 + 修改/创建/导入时间 + 大小 + Token + 终极稳定排序链） | `useSearch.js`(+185行 Intl.Collator zh-Hans-CN numeric + 稳定键链) + `App.vue`(cardImportTimes 落盘) + `useWorldbooks`(世界书排序) | ✅ 纯前端可移植；_mtime/_size/_ctime 需 android.js scanFiles 补字段（部分已有） |
| 6 | **中文搜索修复**（分词索引 bug，中文误返回全库） | `searchIndex.js`（新文件，倒排索引+分词）+ useSearch 接入 | ✅ 纯 JS 文件直接复制接入移动端全维度搜索 |
| 7 | **万卡性能优化**（Web Worker 解析 + 批量 IPC + PNG 内嵌缓存 12000 + staging + 写盘降噪） | `cardParseWorker.js` + `useCardCrud.js`(+258行 16并发/256批/预取流水线) + `tokenCache.js` + main.js `files:readTextBatch/readEmbeddedBatch` | ⚠️ Worker 在 Android WebView 可用；批量 IPC 需桥接补 readTextBatch；写盘降噪(仅新增标签落盘)纯前端可直接移植 |
| 8 | **状态栏模板库折叠 + 渲染脚本识别** | `EditorPanel.vue`(statusLibCollapsed + isRenderScript iframe 沙箱) | ✅ 模板折叠已在移动端(P3)；iframe 沙箱渲染预览可移植（WebView 支持） |
| 9 | **PNG 解析提速**（前 1MB 快扫定位 tEXt 块，防整图暴力匹配） | `pngParser.js`/`cardLoader.js` | ✅ 纯 JS 直接覆盖同步 |
| 10 | **配置持久化扩展**（autoTagRules/customKeywords/cardImportTimes 落盘） | `useConfigPersistence.js` | ✅ 语义一致，可移植 |

## 二、桌面端删除确认

origin/master 已整体删除 `js/mobile/`、`js/bridge/`、`android/` —— 桌面仓库不再承载移动端，双仓库策略成立：
- `origin`(JSKZX) = 桌面版主仓
- `jskapp`(-JSKZX-App) = 移动端仓库（但远程 HEAD 是另一条 V3 实现）

## 三、不能直接迁移的功能 → 移动端替代方案

| 桌面功能 | 桌面依赖 | 移动端替代方案 |
|---|---|---|
| **本地向量引擎（三层漏斗第二层）** | Node `@xenova/transformers` + Worker 线程 + 113MB 本地模型 + vector:* IPC | ⛔ **已定案：移动端不做**。理由：① MiniLM-L12 加载进 WebView WASM 堆后峰值内存 300–500MB+，中低端机 OOM 杀进程；② onnxruntime-web 多线程后端需 `SharedArrayBuffer`+`crossOriginIsolated`，Capacitor file:// 加载产物默认开不了；③ 113MB 模型打包进 assets 后 file:// 下 fetch 有 MIME/跨域问题；④ 桌面向量层为万卡批量预计算设计，移动端单卡打标无此场景。**替代（低成本免费离线）**：复用已实现的 MinHash+LSH 做「标签↔卡片」近似匹配 + 规则关键词同义词表扩展；三层漏斗降为两层（规则 + LLM）。
| **预设管理扫描/文件接口** | main.js `preset:scan` + isValidPreset 主进程校验 + 缓存 | SAF 目录树授权已可读任意目录 → LibraryFsPlugin.listFiles 已有递归列举，android.js 增加 `scanPresets`（JSON 过滤 + isValidPreset 前端校验 + mtime 增量缓存到 localStorage）；预设 UI（列表/编辑/重命名/复制/入回收站）直接复用移动端现有模式 |
| **files:readTextBatch / readEmbeddedBatch** | 主进程批量 IPC（128 分批） | ✅ 已做：android.js 新增 readTextBatch（单次 IPC 批量拉 json），JS 层 256 一批 |
| **PNG 内嵌缓存落盘（12000 上限）** | 主进程扫描缓存文件 | ✅ 已做：库目录 `.jskzx_cache.json`（path+mtime+size 指纹，上限 12000，扫描器跳过 .jskzx 前缀） |
| **Web Worker 并行解析（cardParseWorker）** | 主进程 Worker 线程 + 拉取/解析流水线 | ⏳ **移动端加载加速项（建议做，不依赖万卡规模）**：移动端 loadLibrary 现为渲染线程逐卡解析（CONCURRENCY=6），大库会卡 UI。可将 PNG/JSON 解析移入 Web Worker（Capacitor WebView 支持 Worker），6→并行提升、配合已落地的 readTextBatch+内嵌缓存，普通千卡库二次启动秒开、首扫不冻结 |

## 四、建议落地顺序（第三轮迁移）

1. **搜索修复**（#6）：searchIndex.js 直接复制 + 移动端 useMobileLibrary 接入 —— 中文搜索是实际 bug，优先
2. **AI 打标规则可配置化**（#1）：AutoTagRules 逻辑移植 + AiToolModal 加规则表入口（配合 #3 两层漏斗）
3. **写盘降噪 + PNG 快扫**（#7部分/#9）：小改动大收益
4. **9 种排序**（#5）：CardLibraryView 排序下拉扩展 + android.js 补 _mtime/_size 字段
5. **readTextBatch + 内嵌缓存**（#7/#替代）：万卡场景优化
6. **预设管理**（#4）：桥接 scanPresets + 新增 PresetView（工作量大，单独立项）
7. **内容指纹查重**（#3）：DedupeModal 加"跨名称内容查重"Tab

## 五、jskapp 远程平行实现（V3 方案）分歧说明

`jskapp/master`(8b4a1bf, 08-28) 是另一条移动端路线，与本地差异 -3846/+3051 行：
- **V3 有而本地无**：theme.css（深浅变量完备）、AssetsView/GraphView 独立页面、AITagPanel/TagPanel 面板化、CardDetailView 大改版
- **本地有而 V3 无**：DiffModal、GlobalAssetModal、GlobalEntrySearchModal、GraphModal、TrashModal、WbImportModal、AiToolModal（快照/回收站/图谱/AI工具/批量/全局搜索/资产中心/Diff 全集）
- **结论**：本地功能覆盖明显更全（含第二轮 A-F 组），建议本地为权威主线；V3 的增量点（theme.css 变量、独立 AssetsView/GraphView 页面形态、TagPanel 面板化）可按需 cherry-pick，不建议直接 merge（冲突面太大）。

## 六、本轮已完成

- F组：三主题（白昼/暗夜/青灰，对齐桌面 data-theme 语义）+ `van-theme-dark` 修复（此前深色下 Vant 组件仍白底）+ 界面字号（12/14/16 → `--ui-fs`，对齐桌面字号系统）+ slate 主题 Vant 变量覆盖
- 本地工作已提交 fa38cf0；构建过/46测全绿
