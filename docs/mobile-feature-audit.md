# 移动端 vs 桌面端 v2.1.0 — 全面功能核对与缺口清单

> 日期：2026-08-30 晚（第三轮迁移完成后）
> 方法：以桌面 origin/master (095b5d5) 的 README / RELEASE_NOTES / EditorPanel / App.vue / PushModal 为基准，逐项 grep 移动端源码核对。
> 已确认移动端功能面：卡片库（搜索/9排序/分组/批量/快照/回收站/图谱/查重×3/导入导出/URL导入）、世界书库（条目级编辑/合并/体检/JSONL/Rentry/外部目录/库统计）、卡片详情（设定/世界书/正则/测卡/状态栏15模板+11指令/快照/换图/AI工具/规则表）、预设管理、磁盘扫描、设置（OTA/API加密/主题字号）。

## 一、确认缺失（桌面有 → 移动端无）

| # | 缺口 | 桌面实现位置 | 影响面 | 建议 |
|---|---|---|---|---|
| 1 | **卡片详情编辑缺 5 字段**：system_prompt / post_history_instructions / depth_prompt / creator_notes / character_version | EditorPanel advanced tab（safeData.system_prompt 等直接 v-model） | 编辑保存时这些字段**保留不动**（移动端 saveCard 走整包覆写，字段在 normalized data 里未丢），但移动端无法查看/修改 | 补进「高级设定」折叠区，5 个 van-field，半天工作量 ✅**建议本轮做** |
| 2 | **卡内世界书条目排序**（上移/下移） | EditorPanel worldbook（条目行箭头 + insertion_order 调整） | 移动端详情页世界书 Tab 无条目移动，仅有 insertion_order 手填 | 补上移/下移图标，改 insertion_order 与顺序双写，1-2 小时 ✅**建议本轮做** |
| 3 | **推送目标模式**（SillyTavern 酒馆 ↔ 自定义卡库目录，多目标管理） | App.vue pushTargetMode/customPushTargets + PushModal + main.js pushToCustomDir | 移动端只有单卡推送到酒馆单一地址 | 移动端 SAF 环境做「自定义卡库目录」需要另一棵 SAF 树（pickPushFolder 已有），可移植但涉及文件复制桥接 ⚠️**下轮** |
| 4 | **批量推送**（勾选多卡→目标） | App.vue pushToTavern（selectedIds 优先，未勾选回退当前卡） | 移动端批量模式已有（删除/打标/分组），无推送分支 | 依赖 #3 ⚠️**下轮** |
| 5 | **Raw JSON 页签** | EditorPanel raw（safeData 原始 JSON 查看） | 移动端无原始 JSON 查看入口 | 移动端调试价值高，做一个只读展示页签很轻 ✅**建议本轮做** |
| 6 | **Token 字段级分析栏**（描述/性格/场景分项统计） | App.vue tokenStats + EditorPanel 分析条 | 移动端只有整卡 Token 估算 | 锦上添花 ⚠️可选 |
| 7 | **立绘预览独立面板**（avatarPreview 悬浮） | App.vue viewOptions.showAvatarPreview | 移动端封面在列表/详情已显示，无独立大图面板 | 锦上添花 ⚠️可选 |

## 二、已确认不丢（之前担心、实际已有）

- 状态栏模板 15 套 + 世界书指令模板（STATUSBAR_TEMPLATES + STATUSBAR_PROMPT 三合一）✅
- 卡内世界书增删改/常驻/位置/触发词同步 ✅（缺排序，见 #2）
- AI 工具单卡打标/汉化/重构 + 规则表三层漏斗第一层 ✅
- 快照/回收站/换封面/WebP 降级 ✅
- 三个查重（同名/内容指纹/世界书）✅
- 9 种排序 + 中文分词搜索 + 高级语法 ✅
- 预设管理 + 磁盘扫描收编 + OTA ✅
- API Key 加密 + 模型列表拉取 + 协议自动填端点 ✅

## 三、决策记录

- **向量引擎：⛔ 移动端不做**（OOM 风险 + SharedArrayBuffer/file:// 不可用 + 113MB 包体 + 单卡场景收益低）。替代：MinHash+LSH 近似匹配（已落地于内容指纹查重，可扩展到标签匹配）+ 规则同义词表。三层漏斗降为两层。
- **万卡规模性能：不做**（移动端无此场景），但**加载加速要做**：已落地 readTextBatch + .jskzx_cache.json 内嵌缓存（千卡二次启动秒开）；下轮可加 Web Worker 并行解析（首扫不冻结 UI）。

## 四、本轮执行（#1 #2 #5）

- [ ] 高级设定补 5 字段编辑
- [ ] 卡内世界书条目上移/下移
- [ ] Raw JSON 只读页签
