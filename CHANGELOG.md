# 更新日志 / CHANGELOG

SillyTavern 角色卡管理器（当前为纯移动版，Vue3 + Vant + Capacitor，SAF 文件系统）。

格式遵循 [Keep a Changelog]。版本号语义化：`主.次.修订`。本文档由版本 bump 时聚合提交日志生成。

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