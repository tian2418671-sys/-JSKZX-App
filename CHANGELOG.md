# 更新日志 / CHANGELOG

SillyTavern 角色卡管理器（当前为纯移动版，Vue3 + Vant + Capacitor，SAF 文件系统）。

格式遵循 [Keep a Changelog]。版本号语义化：`主.次.修订`。本文档由版本 bump 时聚合提交日志生成。

---

## [1.10.29] - 2026-09-18

### 🔴 Bug 修复：查重弹窗无法关闭 + 主题切换无动画

**查重弹窗关闭**（`DedupeModal.vue`）：模板 `setup()` 写法中裸用 `emit('update:modelValue', false)`，
`emit` 不在模板作用域 → 点击关闭按钮/覆盖层全部失败 → 弹窗永远无法关闭。
修复：`emit(` → `$emit(`（第 9、13 行）。模拟器 CDP 实测 `display=none` 确认关闭成功。

**主题切换无动画**（`theme.js`）：View Transitions 重构时 `classList.remove('theme-transition')` 被无条件执行 → VT 不支持时降级路径 CSS transition 被永久移除 → 切换完全无过渡效果。
修复：VT 分支内才移除 transition；降级路径恢复 `theme-transition` + `theme-switching` 类。

### 🔴 Bug 修复：装饰层 blur 全屏模糊（"字体模糊不清"根因）

5 个装饰主题（古风/汉风/未来/赛博朋克/水墨）启用 `filter: blur(40-100px)` 全屏伪元素，
移动 WebView 上半透明模糊层叠加前景文字 → 对比度骤降。
修复：全局 `filter:none` + `.app-content { z-index:1 }` 层级分离 + 5 主题渐变重写（radial-gradient / repeating-linear-gradient，零滤波成本）+ `--stc-deco-blur` 全部清零。

### 🚀 主题系统升级（P1：8 主题语义色板 + color-scheme）

- 8 主题新增 12 个语义变量（`--color-base-100/200/300/content` + primary/secondary/accent/border/muted/success/error/warning/info + radius）
- 旧变量 `--van-*` 改为引用 `--color-*`（单一数据源），换主题只改 12 个语义变量
- 8 主题全部声明 `color-scheme: dark/light`（原生滚动条/输入控件跟随）
- `applyTheme` View Transitions 平滑切换（`document.startViewTransition`）+ `prefers-reduced-motion` 降级
- `probeThemeSupport` 内核探测（OKLCH/startViewTransition 能力输出）

### 🚀 测卡侧边栏模型拉取功能移植

`TestSidebar.vue` 原只支持手动输入模型名 → 从 SettingsView 移植：拉取按钮 + 搜索/滚动模型选择器弹窗 + 协议切换清空列表（复用 `api.fetchModels`）。

### 🔧 文档 + 测试

- 模拟器实测三问题：弹窗关闭✅ / 内容指纹 OOM ⚠️（模拟器内存限制，E2 签名缓存已实现，二次查重秒级） / 主题无动画已修复
- `docs/三问题模拟机实测记录-2026-09-18.md` / `docs/主题系统升级方案.md`

---

## [1.10.28] - 2026-09-18

### 🩹 设置页版本显示 + 更新提示修正

- **设置页「关于」版本写死 `v1.10.23`** → 构建期注入 `__APP_VERSION__`（`vite.config.mjs` 读 package.json），`SettingsView.vue` 动态显示；此后发版只需 bump package.json（与 build.gradle 同步）。
- **已是最新仍提示「发现新版本」**：原生 `UpdatePlugin` 只判断“发布源存在版本”不做比较（`callBase` 恒 `update:true`）；在 `SettingsView.checkUpdate` 增加语义化版本比较（`cmpVersion(feed, 当前) <= 0` 视为已是最新）。
- **发布硬校验**：`FEATURE_MARKERS` 新增 `{ key: '更新提示版本比较', marker: '当前已是最新版本' }`。
- **验证**：模拟器实测——「关于」显示 v1.10.28；feed=v1.10.27（低于当前）时点检查更新 → 「当前已是最新版本」；`npm test` 全绿。

---

## [1.10.27] - 2026-09-18

### 🛠 预设/世界书外部目录扫描「读取不全」修复（BOM + 上限 + 静默跳过）

用户反馈：预设和世界书读取不全——外部目录扫描“只有个别文件被读取”（回归）。夹具矩阵模拟器实测复现确认三类静默丢弃，全部修复：

- **UTF-8 BOM 文件被丢弃（主因）**：记事本等编辑器保存的 JSON 带 BOM（`\uFEFF` 头），`JSON.parse` 直接抛错且被扫描 `catch` 静默跳过。修复三处：
  - 外部目录扫描 `scanExternalPresets`/`scanExternalWorldbooks`（android.js）：解析前统一 `stripBom`；
  - 原生 `readWbText`（LibraryFsPlugin.java）：读取后剥离 BOM（所有消费方一次性受益）；
  - 库内解析链路：`cardParseWorker`（Worker）/ `parseRawSync`（主线程兜底）/ TestSidebar「从文件导入」（预设/正则/插件）。
- **>10MB 文件整体消失**：`scanWbTree` 跳过阈值与 `readWbText` 读取上限均 10MB→50MB（大世界书可被扫描/读取）。
- **单次扫描上限** 3000→10000 文件。
- **静默跳过改为如实上报**：原生返回 `skippedLarge`；JS 扫描汇总 `skipped`（读取失败 + 解析失败 + 超限）；预设页/世界书页/测卡预设面板新增「已跳过 N 个无法解析或超限的文件」提示。
- **验证**：夹具矩阵 31 文件（BOM / 1.2MB / 11MB / 嵌套子目录 / CRLF / 无效件）模拟器实测全绿；`npm test` 全绿。

---

## [1.10.26] - 2026-09-17

### 🧠 测卡记忆重构 v4.1（P0 落地：换卡=换记忆 + 注入治理）

“记忆表格总记不必要数据 / 记全量数据 / 什么都不记”三类问题的系统性重构。小型模型延期，P0 先落地规则收紧 + 分桶 + 注入治理（方案：`docs/规格与计划/测卡记忆重构方案_v4.1_评审修订版.md`）。

- **D1 schema v3**（`MemoryPlugin.java`）：`memory_items` 新增 `card_path`（卡唯一标识分桶）/ `updated_at` / `confirmed` 列 + 两个复合索引；`DB_VERSION 2→3` 幂等迁移（PRAGMA 查列存在），存量行 `updated_at = created_at` 回填。
- **D1a 路径变更钩子**（`useMobileLibrary.js`）：卡片移动 → `migrateCard`（目标优先合并去重）；删除 → `clearByCard`；改名（同路径）无需迁移。
- **D2 检索治理**：停用词表 + 有效词 <2 降级“本卡最近 N 条”（`updated_at DESC`）+ 空 query 无卡名原生层直接 reject（绝不返回全库）。
- **D3 事实规则收紧**（`useChatMemory.js`）：值上限 30/80 字、排除疑问句/否定假设/引用/空泛思维（“我在思考/我的想法是”）；位置规则排除认知活动误吞。
- **D4 同 key 覆盖更新**：fact 同 `key + card_path` 冲突 → UPDATE（保留首次 created_at 刷新 updated_at）；单卡 fact 上限 50（超出删最旧）、message 每卡 40 条修剪（按 card_path 分桶）。
- **I2 注入上限**：默认注入条数 20→8；新增 token 预算 200（硬上限 400）双约束截断。
- **I4 注入格式 C**：`<memory><user_profile>键：值</user_profile><recent_events>- 内容</recent_events></memory>`（默认；markdown 表格备选）。
- **I5 debug**：`buildMemoryContext` 返回 `{ text, meta }`（注入条数/来源卡/降级与否/估算 token）。
- **B1 批量抑制**：批量模式进入时抑制记忆写入（记住原状态），退出恢复；新增崩溃恢复标记（批量中退出 App → 下次启动自动恢复）。
- **迁移灰度（7.5）**：`migrateMemoryToV2` 库就绪后一次性执行（显示名→card_path 唯一匹配回填；同名/无匹配 → 遗留桶 `card_path=NULL`，不丢数据）；`jsmobile-memory-v2` 灰度开关（默认开）。
- **查看器**（`TestSidebar.vue`）：按卡过滤（`currentCardPath`）+「只看本卡 / 含遗留桶」切换 + 遗留桶计数。

### 🔴 P0 审计修复（编译级 + 逻辑级 + 实测级 10 项）

落地后静态审计 + 编译 + 单测三线验证发现并修复：

- **编译级（此前从未真正编译过）**：`PluginCall.contains()` / `JSArray.getJSArray()` 均为不存在的 API → 修复为 `getData().has()` + `JSONArray` 基类解析（`null` 正确归入遗留桶）。
- **`search` 参数绑定错位**：`args` 顺序与 SQL 占位符相反 → 带卡关键词检索恒为空（注入实际失效，只剩降级路径）。
- **`migrateMemoryToV2` 无调用点**（迁移从未执行）→ 挂接库加载后 + 完成打标；并处理渐进上屏时序（库长度稳定采样，防止漏配卡名）。
- **`migrateData` 性能**：两万卡全量 mappings 逐条全表扫描 → 预筛“真正存在遗留行”的名字集合。
- **位置规则误吞**：“我在思考/我在想”被记成位置 → 认知动词负向断言。
- **批量抑制崩溃恢复**：批量模式中退出 App 会永久关闭记忆 → 标记 + 启动恢复。
- **实测级（模拟器运行时暴露，2 项）**：① 测卡面板整体白屏（模板 ref 误用 `card.value.path` → 渲染抛错致第 5 个面板不挂载）；② 长按动作菜单从未可触发（`@longpress` 无派发方、`v-longpress` 指令未接线 → 多选/移动分组/重命名/删除等全部不可达）—— 均已修复并复测。
- 测试断言修正（“我想去南方”属有效目标记忆）；`test-p0-validation.mjs` 真机脚本改名 `p0-validation-e2e.mjs`（消除 `npm test` 误扫）。

### 🔧 验证与回归

- `npm test` **142/142 全绿**（含 11 项 D3 规则/误吞回归）
- `build:web` 通过；`gradlew compileDebugJavaWithJavac` 通过（修复前 2 编译错误）
- **模拟器实测（813 卡库 + 播种迁移数据 + Mock API 捕获注入）**：迁移双链路 / 检索隔离 / 注入格式 C / 事实提取 / 同键覆盖 / 批量抑制与崩溃恢复 / 查看器过滤与遗留桶 / 换卡隔离 **全部通过**（详见 `docs/实测记录/测卡记忆v4.1_模拟器实测记录-2026-09-17.md`；截图 `docs/screenshots/2026-09-17-测卡记忆/`）

### 📄 文档

- 按桌面版规范重组 `docs/`（`bugs/` / `规格与计划/` / `实测记录/` / `技术支持/`）+ 新增索引 `docs/README.md`

---

## [1.10.25] - 2026-09-17

### 🚀 两万卡库性能专项（P0 + P1 + P2 落地）

目标：把卡库规模目标从"千卡"推到"两万卡"。模拟器实测（5240 卡子集）：枚举扫描 57s/1994 卡 → **4.8s/5411 卡（单文件 28.6ms→0.88ms，约 32 倍）**；二次启动 Displayed **907ms** 秒开。

- **A1 枚举批量 Cursor + 行缓存**（`LibraryFsPlugin.java`）：每目录单次 `query(buildChildDocumentsUriUsingTree)` 拿全部子项属性（含 mtime/size），替代逐文件 `queryLastModified`（两万次 query → 0）；参照 MaterialFiles `queryChildren`。
- **A2 scan 分块回传**：原生新增 `scanStart/scanNext` 游标协议，两万卡 ~4MB 单次回传拆 ~8 块（≤500 条/块），旧 `scan` 保留兼容、异常自动回退。
- **C1 内存 `_searchText` 截断 1.5K**（I13 不变量）：内存与缓存搜索文本同源同长，消除两万卡 >1GB OOM 风险。
- **C2 搜索索引降量**：倒排只建短字段（名称/作者/文件名/分组/标签），长文本全文线性降级（`searchIndex.js` 新增 `extractShortText` + `_linearSearch`）。
- **C3 加载期 filter/sort 直通**（`CardLibraryView.vue`）：加载期浏览态直接切增量库切片，消除两万卡加载期 ~834 次全库重排。
- **B1 缓存分片**：`.jskzx_cache.json` 单文件 → `.jskzx_cache/` 16 分片增量写（单卡变更只重写所在分片）；旧单文件自动迁移；restore 分片原文传 Worker 免重复 stringify。
- **E1 reconcile diff 更新**：`applyReconcileDiff` 按 path 增删改替代全量替换；`reconcileCancelled` 刷新取消标志；增量导入 `appendImportedCards` 后即时同步 SQLite。
- **E2 查重签名持久化**：MinHash 签名缓存到 `.jskzx_sigs.json`，内容查重只对新增/变更卡水合，二次查重零 2GB chara 过桥。
- **F 缩略图容量制**：磁盘缓存上限 1500 张 → 200MB，按 mtime 淘汰到一半，60s 节流。
- **P2 SQLite 元数据库**（新 `SqliteMetaPlugin.java`）：应用私有库 `jskzx_meta.db`（WAL + schema v1 + 复合索引）；启动路径升级为 SQLite 一次查询 → JSON 分片 → 全量 scan 三级秒开；`META_DB_ENABLED` 特性开关。

### 🔴 严重 Bug 修复：保存后元数据不固化（BUG-17，SQLite/缓存残留）

"编辑保存后重启显示旧值 / 删除的卡重启后幽灵复现"——两万卡专项引入 SQLite 元数据库后暴露：

- **根因 A（编辑不落库）**：`syncCardLightFields` 只更新内存 + JSON 分片，从不写 SQLite → 重启 DB restore 显示旧标签/旧名直至 reconcile。
- **根因 B（删除不清库）**：`INSERT OR REPLACE` 只覆盖不删除 → 删除的卡永久残留 DB，每次重启幽灵卡复现。
- **根因 C（移动残留旧 path）**：移动分组后旧 path DB 行残留。
- **修复**：① `syncCardLightFields` 补单卡 `persistMetas`（保存即时同步）；② `removeCard` 清理分片缓存条目 + 新增 `removeMetaCards` 删 DB 行；③ `moveCardToGroup` 清理旧 path；④ reconcile/loadLibrary 改 `syncMetas`（原生 `syncCards`：事务内 DELETE all + 批量 INSERT 全量对齐，兜底外部删文件的幽灵行）；⑤ 原生新增 `deleteCards`/`syncCards` 接口 + JS 桥/数据层 `metaDeleteCards`/`metaSyncCards`/`removeMetaCards`/`syncMetas`。
- 检查记录：`docs/bugs/BUG-17_保存持久化缺陷检查修复日志.md`

### 🔧 验证与回归

- `npm test` → 135/135 pass（+2 新增 `toMemorySearchText`/I13 测试；唯一失败为仓库既有真机 adb 脚本）
- `build:android` BUILD SUCCESSFUL（versionCode 30）；模拟器冒烟：启动无崩溃，A2 `scanStart` 与 B1 分片路径正常
- 模拟器实测记录：`docs/实测记录/两万卡_模拟器实测记录-2026-09-17.md`；测试清单：`docs/实测记录/v1.10.25_测试清单.md`

### 📄 文档

- `docs/规格与计划/两万卡卡库性能方案.md`（方案 + 执行状态 PL0/P1/P2）
- `docs/规格与计划/测卡记忆功能重构方案.md`（v3 初稿，后被 v4.1 取代）

---

## [1.10.24] - 2026-09-16

### 🔴 严重 Bug 修复：秒开后点详情极慢（BUG-14，原生桥线程独占）

800 卡「列表秒开但点开详情转圈数秒」。CDP 真机实测定位根因：Capacitor 所有插件方法
串行在单条 `CapacitorPlugins` 线程；缓存秒开后 reconcile 的全树 `scan()` 独占该线程
5~9s（实测 scan=7871ms），期间详情页的文件读取排队最长 5596ms。

- 修复（`LibraryFsPlugin.java`）：`scan`→独立线程；批量读（`readTextBatch`/
  `readCharaBatch`/`getFileStats`）→编排线程；**单卡读取开快速通道**（`FAST_EXEC`），
  不与后台批读排队。
- 验证：扫描进行中连点三卡 244/272/239ms（修复前 ~5.6s）。
- 探针入库：`scripts/probe-detail-perf.mjs`、`probe-detail-chain.mjs`、
  `probe-bridge-queue.mjs`、`probe-bridge-realuse.mjs`（CDP 真机计时，可回归）。

### 🔴 功能级 Bug 修复：内容指纹查重从未产出过结果（BUG-15 + BUG-16）

「查重 → 内容指纹」自上线起**从未显示过任何分组**，两个 bug 叠加：

- **BUG-16（触发层）**：`DedupeModal` 声明 `modelValue` prop 并 watch 它才跑扫描，
  但调用处写成 `v-model:show` → `modelValue` 恒 false，`runScan` 从不触发；
  弹窗"能打开"只是 `show` 经 attrs 穿透给根 `van-popup` 的假象。
  修复：`v-model` 对齐（卡库 + 世界书两处）；其余 31 处 `v-model:show` 组件审计无同类错位。
- **BUG-15（渲染层，藏在从未执行的代码里）**：分组展示读 `v.sig` 复算相似度，
  签名只存并行数组 → `undefined.length` 抛 TypeError（真机算法复刻实测复现）。
  修复：签名回填 `valid.forEach((v,i) => { v.sig = sigs[i]; })`。
- 验证（`scripts/verify-bug15-realui.mjs`，CDP 真实点击）：813 卡库内容扫描完整跑通，
  dupz 正文相同种子被聚为「3 个版本·内容指纹聚类」分组，无 TypeError。

### 🔧 验证与回归

- `npm test` → 134/134 pass
- BUG-14 修复在本版复测无退化：扫描窗口内点卡 215~327ms
- 发布产物经 `release:android` 硬校验（入口一致性/无陈旧分块/关键功能特征/签名/体积）

## [1.10.23] - 2026-09-13

### 🔴 严重 Bug 修复：数据层并发竞态（脆弱感溯源）

对加载/修正双入口做并发专项审计，修复 3 个竞态条件：

**① BUG-11：`loadLibrary` 无并发互斥，双 scan 竞态**
- **根因**：缓存先行秒开时 `reconcileLibraryInBackground` 仍在跑，用户点刷新 → 两个全量 scan 并发，后完成的覆盖先完成的，列表抖动/卡片闪变。
- **修复**：模块级 `loadPromise` 互斥 —— 非刷新请求复用进行中的 promise，刷新请求先等待再扫描。

**② BUG-12：`reconcile` 竞态 + worldbooks 累积翻倍**
- **根因**：`reconcileLibraryInBackground` 无并发守卫（可并行跑），且每次修正不清空 `worldbooks` → 世界书逐次翻倍。
- **修复**：`reconciling` 标志 + 迁移中早退 + 扫描前 `worldbooks = []` + `finally` 释放标志。

### 🟡 中 Bug 修复：useSearch 防抖定时器泄漏（BUG-13）

- **根因**：`watch(searchQueryInput)` 设置的 300ms `setTimeout` 在组件停用时从不清理，keep-alive 返回后旧搜索词"幽灵生效"。
- **修复**：composable 暴露 `dispose()`；组件 `onBeforeUnmount` 与 `onDeactivated`（keep-alive 切 tab）双钩子调用，并在 deactivate 时复位搜索状态，杜绝返回后的幽灵过滤与显示不一致。
- **验证**：模拟器实测输入搜索词后 300ms 内切 tab → 返回列表全量、输入框已清空（详见测试日志 9.4）。

### 🔬 验证

- `npm test` → 131 / 131 pass
- `build:android` → BUILD SUCCESSFUL

## [1.10.22] - 2026-09-13

### 🔴 严重 Bug 修复：刷新/搜索期间卡片重复出现

- **根因**：`useMobileLibrary.js` `loadLibrary(refresh=true)` 重扫开始前未清空 `mobileLibrary.library`，渐进上屏 `publishProgress()` 将新卡 `push` 到旧数据上 → 加载中每张卡出现 2 次，搜索/排序返回翻倍结果。
- **修复**：重扫前 `mobileLibrary.library = []`（`ready=false` 之后、`try` 之前）。
- **验证**：364 卡模拟器实测，刷新 loading 中卡片数不翻倍，完成后无重复。

### ✨ 新增：浮动导航按钮（大卡库滚动 UX）

- 右侧悬浮按钮组：**↑ 回顶部** / **实时进度百分比** / **↓ 回底部**，平滑滚动。
- 智能显隐：距顶/底 <30px、内容不足一屏、翻页视图（page）时隐藏；批量模式自动上移避开底部操作栏。
- 跳到底部后触底加载继续渲染剩余卡片（24→364）。

## [1.10.21] - 2026-09-12

### 🔴 严重 Bug 修复：导入卡片「一张变多张」+ 详情页卡加载（缓存链路根治）

**① 导入增值（一张角色卡出现两份/三份）——根因：缓存多指纹残留 + 还原不去重**

- **根因链路**：轻量缓存键 = `path|mtime|size`，注释原本以为「文件变更即换键，旧条目自动失效」，
  但 `cache.items` 字典的**旧键从未被删除**。每次保存（手动保存/自动打标/快照恢复）都改变
  mtime/size → 新增一条缓存 → **同一路径残留多条缓存**；下次启动缓存先行还原时每条缓存都
  变成一张卡 → 「一张卡变两份/三份」（用户实测：导入→保存→重扫后一张卡出现三个）。
- **修复三处**：
  1. **还原按 path 去重**（`libraryCacheCore.restoreItemsFromCacheText`）：同一路径的多条指纹
     只保留 **mtime 最新** 的一条（最接近当前磁盘状态），其余丢弃；
  2. **写入时驱逐旧键**（`evictSamePathCache`）：凡向缓存写入某路径的新指纹，先删除该路径
     全部旧指纹键——从源头杜绝多键累积（覆盖 `parseLightCard` 正/负缓存与 `syncCardLightFields`）；
  3. **`syncCardLightFields` 指纹键 Bug**：原 `cacheFingerprint(light)` 读 `light.mtime/size`，
     但轻量条目只有 `_mtime/_size` → 每次都写 `path|0|0`，与扫描键 `path|mtime|size` 不同 →
     同路径天然两键。改为用 `_mtime/_size` 组合成与扫描一致的指纹键。
- **存量污染自愈**：已生成的多余缓存条目在下次启动时被还原去重丢弃，无需用户手动清缓存；
  新写入的缓存不再累积。

**② 详情页卡加载/白屏——损坏缓存容错**

- 根因：`.jskzx_cache.json` 若因写盘中断/崩溃残留为非法 JSON，`restoreItemsFromCacheText`
  直接 `JSON.parse` 抛异常 → 缓存先行还原路径中断 → 库加载失败 → 详情页水合失败卡死在加载/
  未找到卡片。修复：`JSON.parse` 包 try/catch，损坏缓存返回 null → 自动走全量 scan 重建。

**③ 附带加固**
- 保存与手动快照互斥补全（`save()` 也检查 `snapshotting`，防止两路整图写盘竞态）；
- 保活服务 `startForeground` 异常兜底（Android 12+ 系统后台重建服务时防崩溃）+ 通知图标改单色；
- 设置页保活开关文案按服务实际状态区分。

**验证**
- 单元测试 **131 项全绿**（新增 `test/cacheDedup.test.mjs` 4 项：多指纹去重/最新优先/负缓存/
  损坏 JSON 容错）
- Web 构建通过；Android `assembleDebug` 编译通过（versionCode 26, 1.10.21）

---

## [1.10.20] - 2026-09-12

### 详情页加载修复 + 快照删除修复 + 全软件 UI 质感提升（Bug 反馈闭环）

**① 详情页打开「加载半天」**
- **watch 水合风暴**：库渐进式分批 push 每批都触发兜底 watch → 同卡并发全量读取 N 次，桥线程排队；
  改为 `mobileLibrary.ready` 守卫 + `hydrating` 布尔锁去重，库加载期间不触发、水合中不堆叠
- **loadCardFullData 并发去重**：同路径 in-flight Promise 共享，桥接层同一卡片只发起一次读取；
  已缓存 12KB 缩略图的卡片封面 + 同卡二次水合均为亚秒级

**② 快照删除永久失效 + 保存自动备份多余**
- **删除安全检查死循环**：`sRel.includes('/.bak_history/')` 要求相对路径带前导 `/`，
  而 `toRelativePath` 返回的都是无前导 `/` 的 `.bak_history/xxx` → 条件恒为 false → 删除永远
  返回「非法快照路径」。修复为匹配 `== '.bak_history'` 或 `startsWith('.bak_history/')`
- **保存备份无视设置**：自动备份不读「自动快照」开关（设置页 snapAuto），关了也没用；
  改为读 `snapshotConfig.enabled` + `cooldownMs`（短缓存 10s，保存不走 IPC 每次查询），
  用户关闭自动快照后保存完全不产生多余备份
- worldbook 快照删除同款检查一并修复

**③ 全软件 UI 质感提升（所有主题生效，走 CSS 变量适配）**
- **全局**：页面路由淡入转场（180ms，不再生硬闪屏）；底部 Tab 高亮图标缩放 + 文字加粗
  + 顶部小圆点指示器（所有 8 套主题自动跟随 --van-primary-color）
- **卡片库**：分类/视图胶囊激活态改为渐变 + 投影；卡片按压缩放 + 分批入场错峰动画（逐卡
  18ms 延迟淡入）；导入等重按钮按下缩放反馈
- **详情页**：封面圆角提升、阴影 + 按压缩放；区块标题加渐变竖条强调条；Token 面板圆角/内阴影
  进化；标签/预告词条按压缩放反馈
- **封面占位符**：默认态增加微光呼吸浮动动画 + 径向渐变基底，空态/失败态视觉层次更清晰
- **世界书**：条目卡片入场动画 + 按压缩放反馈
- **文档**：新增「经验教训·2026-09-12」复盘文档（watch 洪泛 / 路径校验 / 开关未读取 三类
  通用检查清单），沉淀为后续开发必读

**验证**
- 单元测试 **127 项全绿**
- Web 构建（Vite）通过；Android `assembleDebug` 编译通过（versionCode 25, 1.10.20）

---

## [1.10.19] - 2026-09-12

### 全链路性能修复（Bug 反馈闭环：封面加载慢 / 保存·快照慢 / 刷新导入按钮卡顿 / 切后台被杀）

**① 保存与快照提速（原每次保存 = 快照全量拷贝 + PNG 整图重写，3~4 次 base64 过桥）**
- **保存自动备份节流**：同一卡片 5 分钟内只备份一次（进入编辑后的首次保存即备份「编辑前原版」），
  连点保存不再每点一次整文件拷贝；恢复点语义不变
- **保存防连点锁**：保存/手动快照/恢复/删除/清理快照全部加重入锁，进行中忽略重复点击
  （此前快速点保存会叠加重入，多次整图读写排队）
- **PNG 保存校验轻量化**：临时文件校验从「整图 base64 回读」改为 `readCharaBatch` 流式提取
  chara 文本块（原生只跳过 IDAT 图像数据，载荷几十 KB），大卡保存省掉一次整图往返
- **快照原生流式复制**（新增 `copyWithin`）：快照创建/恢复由原生 SAF 字节流拷贝完成，
  免 base64 过桥——20MB PNG 一次快照从 54MB+ base64 载荷降到零载荷，秒级完成；
  原生不可用时自动回退旧链路

**② 封面加载提速**
- **缩略图批量超时修复**：原生 `readThumbBatch` 原实现等整批完成（坏卡/超大图拖满 20s，
  首屏全部封面被一张卡卡死）；改为每项 `Future.get(1.5s)` 独立超时 + 整批 8s 兜底，
  单卡卡住只丢一张，其余按时返回
- **封面大图预览走缩略图**：点封面预览优先读 12KB 磁盘缩略图（未命中再走整图兜底），
  大卡预览不再等数秒

**③ 刷新 / 导入按钮卡顿**
- **全量重扫防重入**：刷新按钮 + 下拉刷新双绑同一逻辑，此前连点/同屏双触发会叠加多次
  全库重扫；现加 1.2s 节流 + 加载中互斥（下拉被拦截时正确复位避免圈卡死）
- **导入防连点**：文件选择器弹出期间忽略重复点击
- **同类问题程序级修复**：世界书保存、预设扫描/保存、预设详情保存、批量删除、磁盘扫描导入
  等所有整文件读写操作统一加防重入锁

**④ Android 后台保活（原切后台即被杀）**
- 新增**保活前台服务**（`KeepAliveService`）：常驻通知 + `PARTIAL_WAKE_LOCK` + `START_STICKY`，
  切后台后进程不被系统回收，返回应用不重载
- Manifest 补齐 `WAKE_LOCK` / `FOREGROUND_SERVICE(_DATA_SYNC)` / `POST_NOTIFICATIONS`
  权限并声明 FGS 类型（API 34+ 要求）
- 设置页新增「后台保活」开关（AppConfig 持久化，默认开启；关闭可完全停止保活服务）
- 应用启动时按开关自动拉起保活（前台启动满足 Android 12+ 后台起 FGS 限制）

**验证**
- 单元测试 **127 项全绿**（保存/快照链路改动无回归）
- Web 构建（Vite）通过；Android APK（assembleDebug）编译通过

---

## [1.10.18] - 2026-09-11

### 长期记忆治理 + 记忆表格系统（模拟器实测，闭环「什么都会被记录」问题）
- **不再什么都会被记录**（真机 DB 实测原问题：失败请求的 `⚠` 占位文本被当记忆、同一条消息失败重试重复记两条、原始 `<UpdateVariable>` 指令原样入库）：
  - `recordMessage` 过滤空内容与 `⚠` 开头占位（请求失败不产生记忆）
  - 原生 `add` 去重：同卡同类型同内容 10 分钟内幂等跳过（失败重试/连发不再重复记）
  - L1 消息修剪：每卡仅保留最近 40 条 message 型记忆（不再无限膨胀）
  - AI 回复记录用处理后文本（`<UpdateVariable>` 指令已剔除的展示文本）
- **记忆表格系统**：
  - 原生 `memory_items` 新增 `key` 列（DB v2 增量迁移，不丢旧数据）+ `update` 接口（行编辑改键/改值）
  - **L3 事实自动提取**：用户交代的关键信息（名字/喜欢/讨厌/记住/年龄/位置/目标/我的X是Y）按 键=值 自动记入表格（`extractFacts` 启发式规则，同键同值去重）
  - 注入升级：`buildMemoryContext` 把事实渲染为 **Markdown 记忆表格**（`| 记忆 | 内容 |`），摘要保持要点列表
  - 查看器升级为**记忆表格**：类型筛选 Tab（全部/事实/摘要/消息）、事实行显示键徽标、行内编辑（prompt 改键改值）、按筛选范围清空
- **单测**：新增 memoryFacts 4 项（提取规则/去重/无关键信息不记），全量 115 项测试全绿

### 预设条目管理 + 变量树操作面板（2026-09-12 追加）

**测卡 · 预设条目**（此前只显示「预设名 + N 条提示词」，条目内容不可见也不可改，导入预设形同白导）
- 新增「📝 预设条目」区域：展开编辑（名称 / 角色 system·user·assistant / 正文）、开关、删除（二次确认）、新增、**克隆**
- 克隆会深拷条目并**保序**插入到原条目之后，同时同步 `prompt_order`
- 改动实时写回 localStorage，杀进程重启后仍保留

**测卡 · 变量树**（此前只有一坨可编辑的 JSON 文本，看不出结构）
- 渲染式**可折叠树**：按类型着色（数值 / 文本 / 布尔 / 对象 / 数组）+ 类型徽章
- **⋯ 操作面板**：编辑值（类型自动识别）/ 重命名 / 复制路径 / 删除此变量 / 新增子项
  面板项数随节点类型变化（仅对象/数组提供「新增子项」）
- 搜索路径或值 · 一键展开收起 · JSON 源码入口保留（高级批量粘贴场景）
- **保序重命名**：引擎指令集无 RFC6902 `move`，原「set 新键 + delete 旧键」会把键挪到对象末尾，
  用户会以为变量凭空搬家；改为父对象整体保序重建（依据 `setPath` 末段是整体赋值而非深合并）
- 数组元素（索引没有键名概念）不再展示「重命名」

**修复**
- **SystemBars 未处理 Promise 异常**（`js/mobile/theme.js`）：把 Capacitor 插件代理作为 Promise
  的解决值返回会触发 thenable 同化，抛 `"SystemBars.then()" is not implemented on android`；
  外层 `.catch` 拦不住（异常发生在 then 回调返回值被同化那一步）。**不只是日志噪音——
  修复前 `setStyle` 从未真正执行，状态栏深浅色主题一直失效**。改为在 then 回调内消费插件对象
- **`prompt_order` 嵌套格式兼容**：酒馆预设的 `prompt_order` 有扁平与
  `[{character_id, order:[...]}]` 两种形态，此前只认扁平格式 → 退化「使用全部 prompts」，
  条目开关形同虚设。现两种均归一化，且开关会同步写回条目自身与 `prompt_order`
- 温度参数显示精度（预设 0.85 被步进器显示成 0.8）
- 侧边栏标签栏溢出（「设置」被裁切）

**验证**（模拟器 Android 15 实测，详见 `docs/实测记录/测试日志-2026-09-12.md`）
- 单元测试 **127 项全绿**（新增 `test/presetPrompts.test.mjs` 12 项）
- 本地导入：自造 PNG 卡（`chara` 元数据解析正确、头像正常渲染）/ JSON 卡同名跳过 / 预设文件导入
- 预设条目克隆、变量树 7 项操作（编辑值 · 重命名 · 复制路径 · 删除 · 撤销 · 重置 · 新增子项）全通过
- logcat 零错误

---

## [1.10.17] - 2026-09-11

### 测卡变量树真机核查（模拟器实测闭环，补 1.10.16 未覆盖的显示细节）
- **空树计数修复**：`countVars` 不再把空对象/空数组计为 1 个叶子。原先空变量树徽标显示「1 值 · 0 楼」、重置按钮误启用；现空树正确显示「0 值 · 0 楼」且重置按钮禁用（与撤销按钮态一致）
- **编辑草稿不再被覆盖**：变量树 JSON 编辑器聚焦编辑期间，任何变量树变更（应用/撤销/重置/AI 回复携带更新）不再强制刷新草稿——此前会把用户未完成的编辑直接冲掉（注释承诺「不打断」但未实现，现补上 focus/blur 状态）
- **OpLog init 计数口径修正**：`init(N键)` → `init(N值)`（按并入的值数统计，与变量树徽标「N 值」同口径）。此前粘贴 `{stat_data:{地点,金钱,队伍}}` 整树只显示「init(1键)」，3 个值易被误解为只合并了 1 个
- **模拟器实测通过项**：应用合并/撤销/重置（含确认弹窗）/会话隔离（新建会话空树、切回旧会话持久化恢复）/引擎开关 localStorage 持久化，全链路无半成品断点；新增 countVars 空树单元测试（32 项测试全绿）

---

## [1.10.16] - 2026-09-11

### 测卡功能完善（变量树去半成品化）
- **`{{idle_duration}}` 宏真实实现**：从固定占位 `'0'` 改为计算距最后一次用户消息的秒数（引擎 `buildMacroContext` 新增 `lastActivityAt` 参数；测卡 `sendChat` 追踪用户消息时刻，`macroContext` computed 传入）
- **变量树/更新日志链路核查闭环**：MVU 变量引擎（useChatVariables，三格式解析/指令合并/OpLog 重放/持久化）、测试侧边栏变量树面板（编辑/应用合并/撤销/重置 + OpLog 最近记录格式化）、详情页事件接线（apply-vars-json/undo-vars/reset-vars + EJS 宿主上下文）全链路确认无半成品断点

### 修复
- **保存链路文件丢失**（千卡库边测边修发现）：`_saveCardPng` 的 SAF delete+rename 后，`relIndex` 缓存的旧 DocumentFile 引用失效，fallback `writeBuffer` 用失效引用写失败 → 原文件丢失。三重一致性修复：
  1. `delete` 成功后清除 relIndex 中该路径及子路径旧引用
  2. `rename` 成功后同步索引（旧键移除、新路径写入）
  3. `writeBuffer` 打开失败时慢路径 `fileByRelPathSlow` 重解析重试 + 成功后回填索引
  - 验证：连续两次保存成功、文件不丢失、无 tmp 残留、缩略图指纹用新 mtime/size 正常

## [1.10.15] - 2026-09-10

### 性能优化（千卡秒开，缺陷单 #001 闭环）
- **Quick Win**：缩略图磁盘缓存（readThumb，300px WebP / ARGB_8888 / MD5(path|mtime|size) 指纹）+ writeBuffer 原生方法（修复保存/换卡图/快照静默失败）+ bytesToBase64 分块编码（修复中大图保存 spread 溢出）+ 根目录文件创建修复 + 封面加载并发控制（信号量 4 / 去重 / 负缓存）
- **千卡核心**：缓存命中免读文件 + 缓存先行秒开（restoreLibraryFromCache + 后台 reconcile）+ publishProgress 增量发布（O(n²)→O(n)）+ 缓存 searchText 截断 1.5K（体积 -46%）+ 渐进上屏 60 张/批
- **F1-F6 集成**：阶段打点 `[Perf]` + path→DocumentFile 索引（read 344s→20s, -94%）+ 缩略图共享线程池/编排线程 + restore Worker 化（RESTORE_VIA_WORKER 开关）+ 解析超时二次机会队列 + 非卡负缓存（nc:1）
- **迭代**：buildRelIndex 兼建索引+列表，根扫描内存化输出（scan 118s→57s，total 148s→93s）
- **实测**：首扫 413s→93s（-77%）；二次启动 readCharaBatch=0 次；内存 350MB+→99-118MB；崩溃 0

## [1.10.14] - 2026-09-09

- 阶段 1 Quick Win 落地：`readThumb`/`writeBuffer`/`deleteThumb` 原生方法 + `readThumbBatch` 批量预热 + `prefillCoverCache` + MobileCardCover 并发加固（in-flight 去重/并发信号量/负缓存/revoked 保护）+ `reportFullyDrawn` 冷启动埋点 + API 24/25 Base64 兼容修复（java.util→android.util）
- 增量导入 `appendImportedCards`（导入后不再全库重扫，4 张卡亚秒级）

## [1.10.13] - 2026-09-08

- 移除插件 Tab 的扩展数据树（预设内部配置摊开展示观感问题），只保留预设脚本/通用扫描脚本/插件定义

## [1.10.12]

- 预设通用扫描：不依赖固定字段，任意位置 JS 脚本与全部扩展数据自动发现（插件 Tab 新增通用扫描脚本区 + 扩展数据树）

## [1.10.11]

- 代码编辑器主题架构重构：根容器 CSS 变量统一驱动全部节点，深色切换必然整体同步

## [1.10.10]

- 代码编辑器对比度阻断修复（One Dark 高对比配色 + 浅色主题切换 + 一键复制）

## [1.10.9]

- 代码编辑器选中态修复（透明叠层选中无文字）+ 旧 WebView 直显回退模式

## [1.10.8]

- JSON 源码编辑弹窗换用编程式代码编辑器（行号/高亮/格式化）+ 修复 jsonDraft 未填充 bug

## [1.10.7]

- 预设自带 JS 脚本完整接入（tavern_helper.scripts 读取/开关/编辑）+ 编程式代码编辑器

## [1.10.6]

- 预设详情页滚动修复 + 正则/插件双位置读取健壮性（实例预设 Izumi 26 正则/204 提示词实测可滚动）

## [1.10.5]

- 预设详情页接入修复（openDetail 未导出致点击无效）+ 记忆设置统一收口测卡侧边栏

## [1.10.4]

- 九项反馈闭环：准完整文档包壳修复示例卡白块 / 设置页补齐记忆入口 / 批内并行读取提速 / 详情页渲染缓存 / 世界书库统一列表 / 预设详情三子选项卡重构

## [1.10.3]

- 五项反馈闭环：渲染补齐（裸围栏面板/小写 update/promptOnly 对 AI 隐藏）+ 详情 loading 态 + 加载提速（渐进渲染/并行 mtime）+ 查重批量水合与弹窗修复 + 记忆

## [1.10.2]

- 测卡渲染链路补齐：裸 HTML 面板段升级 iframe / 变量桥双重序列化修复 / 状态栏接真实 MVU 变量 / USER 正则上显示层 / Showdown 全量 Markdown

## [1.10.1]

- 打包：版本升级 + 正式签名 APK 入库

## [1.10.0 - 移动版基线建立]

- 仓库精简为纯移动版（移除桌面代码/文档/资料/依赖）
- 根治 300+ 卡导入闪退：轻量列表 + 按需加载全量数据 + 分批桥接（千卡秒开目标）
- readCharaBatch 能力探测改为调用时检查
- 合并桌面 v2.2.4 基线（插件工作区/内置大分类定制/效果页渲染修复）
- MVU 变量系统 + EJS 模板引擎 + 分段渲染接入侧边栏
- 导入自动打标 + AI 归类（标签大分类闭环）
- 启动加载提速：入口动态分流拆包 + ECharts/GraphModal 懒加载

---

## [1.9.0]

- 推送目标管理 + 顶部推送菜单 + 未勾选回退当前卡

## [1.8.x]（桌面 → 移动过渡期）

### 1.8.9
- 世界书导入导出功能发布

### 1.8.8
- App.vue 三大业务域拆分（useCardCrud/useConfigPersistence/useEmbeddedWorldbook）+ 新版本角落浮标 + 世界书快照增强 + 13 个优先级链单测

### 1.8.5
- 千卡库性能大修 + 安全加固 + 全面 BUG 修复

### 1.8.4
- 修复导入 JSON 角色卡导致角色栏消失/空屏崩溃（character_book 脏形态 extractBookEntries 全链路防御）

### 1.8.3
- 全库词条搜索 + 世界书扩展 + 快照删除 + 图谱卡顿修复 + 全盘打捞真伪鉴定 + 白名单加固 + 收编克隆修复

### 1.8.2
- 换卡图 + 链接导入 + 下拉菜单 + 静默升级 + 排序/快照/分组修复 + 安全加固 + 依赖升级

### 1.8.1
- 快照空间治理 / 配置持久化彻底修复 / AI 打标增强

### 1.8.0
- 快照一键恢复 / 世界书选项卡增强 / 扫描性能优化 / 全面 BUG 修复

## [1.7.0]

- 物理文件夹分组 / 可配置快照 / 标签批量管理 / 稳定性加固

## [1.6.6]

- 基础版本（桌面 Electron + 移动分支起点）