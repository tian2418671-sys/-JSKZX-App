# 🎴 SillyTavern 角色卡管理器

> SillyTavern（酒馆）角色卡高级解析与管理中心 —— 桌面版（Windows）与 Android APP 版双端复用，让几千张角色卡井井有条。
> 双端共享同一套 Vue 3 渲染层：桌面由 Electron 承载（完全离线可用、OTA 静默更新），Android 由 Capacitor 8 壳承载（SAF 文件授权、系统化交互）。

---

## 📥 下载

**🖥️ 推荐 · 桌面安装版**（双击安装，自动生成桌面/开始菜单快捷方式，免管理员权限，支持 OTA 自动更新）：

[⬇️ 下载安装包 `sillytavern-card-manager-1.9.0.exe`](https://github.com/tian2418671-sys/JSKZX/releases/latest)

**📦 桌面绿色免安装版**（解压即用，无需安装）：

[⬇️ 下载绿色版 `sillytavern-card-manager-1.9.0.zip`](https://github.com/tian2418671-sys/JSKZX/releases/latest)

> 💡 桌面两个版本功能完全相同，任选其一即可。支持 Windows 10/11（64 位）。
> 安装版内置 OTA 自动更新（检测 → 下载 → 静默安装 → 自动重启）；绿色版需手动下载新版覆盖。
> 程序完全本地运行、无任何联网上传；若杀毒软件误报，请选择「允许 / 信任」。（更多见 [常见问题排查](#-常见问题排查)）

**📱 Android APP 版**（signed APK，Android 10+ / 鸿蒙 7 卓易通模拟环境兼容）：

[⬇️ 下载 APK `sillytavern-card-manager-1.9.0.apk`](https://github.com/tian2418671-sys/JSKZX/releases/latest)

> 💡 APP 版与桌面版渲染逻辑对等：`卡片库 / 世界书 / 设置` 三 Tab 主界面 + 卡片详情页内「设定 / 世界书 / 正则 / 测卡」四大 Tab。
> 文件访问基于 Android SAF（Storage Access Framework）目录树授权：授权一次即可读写整个角色卡库，支持系统文件多选导入、批量导出 ZIP 到 `Download/JSKZX`、磁盘扫描收编、OTA 检查更新。
> 若 Release 未附带 APK 资产，可按 [Android APK 打包](#android-apk-打包) 章节本地构建。

---

## 📋 目录

- [下载](#-下载)
- [项目简介](#-项目简介)
- [功能特性](#-功能特性)
- [📱 Android APP 版](#-android-app-版)
- [技术栈](#-技术栈)
- [环境要求](#-环境要求)
- [快速开始](#-快速开始)
- [目录结构](#-目录结构)
- [架构说明](#-架构说明)
- [🎨 双端架构](#-双端架构)
- [核心模块与关键坑](#-核心模块与关键坑)
- [数据与安全机制](#-数据与安全机制)
- [打包与发布](#-打包与发布)
- [开发指南：如何新增功能](#-开发指南如何新增功能)
- [常见问题排查](#-常见问题排查)
- [开源与贡献](#-开源与贡献)

---

## 🚀 项目简介

本项目是一个面向 **SillyTavern（酒馆）** 玩家的角色卡管理工具（Windows 桌面版 + Android APP 版），用于解决「卡片一多就乱」的核心痛点：

- 批量导入 / 解析 **PNG / JSON / WebP / JPEG** 格式的角色卡（兼容 `chara_card_v1 / v2 / v3` 规范）
- 深度检索：名称、作者、简介、世界书条目、触发词、标签、**物理文件名/路径**全维度全文搜索
- 在线编辑卡片：基础设定、世界书（增删改 / 折叠 / 排序）、正则脚本、聊天测卡
- 标签与分组的**中英双语**管理、批量操作、关系图谱、Token 消耗预估
- 一键导出整合包、批量打包、历史快照备份、回收站等安全机制
- **千卡库性能优化**：异步分片扫描、分块加载、Token 缓存、I/O 风暴治理——上千张卡片也能秒开
- **OTA 自动更新**：新版本一键下载、静默安装、自动重启，全程无需手动操作

---

## 📸 界面预览

| 世界书管理（可折叠词条） | 正则脚本编辑 |
|:---:|:---:|
| ![世界书](docs/screenshots/worldbook.png) | ![正则脚本](docs/screenshots/regex.png) |

| 聊天测卡 · 渲染模式（HTML 卡片页） | 基础设定编辑 + 右键菜单 |
|:---:|:---:|
| ![聊天渲染](docs/screenshots/chat-render.png) | ![编辑与右键](docs/screenshots/editor-contextmenu.png) |

| Raw JSON 视图 | 聊天测卡 · 代码模式 |
|:---:|:---:|
| ![Raw JSON](docs/screenshots/raw-json.png) | ![聊天代码](docs/screenshots/chat-code.png) |

> 截图文件位于 `docs/screenshots/`（详见该目录内 README 的命名约定）。

---

## ✨ 功能特性

| 模块 | 说明 |
|------|------|
| 📂 卡片库 | 文件夹导入、自动分类、多选勾选、Ctrl/Shift 连选、右键快捷菜单、**列表/网格双视图 + 常规/紧凑双密度**、排序（名称/最新/Token） |
| 🔍 超级搜索 | 全字段穿透检索（含备选开场白、深度提示词、正则脚本、**世界书全部词条**、**物理文件名/路径**）、多关键词 AND、`tag:`/`author:`/`file:`/`wb:` 高级前缀语法、`-排除`、300ms 防抖 |
| 🔎 全库词条搜索 | 一次性检索**全部独立世界书 + 全部角色卡内嵌词条**（触发词/次级词/备注/正文），点击直达并高亮 |
| 🌍 世界书 | 独立世界书库（双引擎）+ 角色卡内嵌世界书；词条级 IDE（增删改/克隆/排序/启用/常驻/条件/插入位置/标签化触发词）、URL 直链导入、JSONL 批量导入、批量导出、内嵌提取为独立书、快照/一键恢复 |
| ⚙️ 正则脚本 | 查看 / 在线编辑、正则作用域可读化展示 |
| � 状态栏预览 | **所见即所得调试**：AI 输出的 `<status>` 文本块应用卡内渲染型正则脚本实时预览 HTML 效果、一键注入内置状态栏模板、脚本勾选隔离、渲染/源码双视图（DOMPurify 安全清洗）；内置 **15 套渲染模板** + **11 套世界书指令模板（三合一：初始值+显示格式+更新规则）**，模板库可折叠收起 |
| �💬 聊天测卡 | OpenAI 兼容 / Anthropic 双协议、渲染/代码双模式、API Key 可配置、系统提示词预设 |
| 🤖 AI 智能打标 | 候选标签池 + 自由提取开关、自定义提示词、**破限（Jailbreak）机制**、429 退避重试、批量打标限流 |
| ✨ AI 工具 | 一键汉化、格式升维（W++/JSON → 高密度 Markdown 降 Token） |
| 🏷️ 标签系统 | 单卡/批量标签、53 个中英预设、全局标签池、快捷添加、**全部操作物理落盘**（重启不丢） |
| 📁 分组系统 | **物理文件夹分组**（建文件夹 = 建分组、移动卡片 = 物理移动文件）、预设 + 自定义、中英双语、批量移分组、空分组自动清理 |
| 🌌 关系图谱 | 力引导/环形布局、分组隔离、三色连线图例过滤、枢纽高亮、双击穿梭、**千卡库卡顿修复（连线预算/构建缓存/位置种子/头像限流/过绘制治理）** |
| ⚡ Token 估算 | 实时预估卡片重量（分项 + 总计）、列表 Token 徽章、WeakMap 缓存 |
| 📚 全局资产中心 | 聚合全库所有卡片的世界书条目与正则脚本，统一检视 |
| 🛰️ 全盘打捞 | 全盘深度检索 + **真伪鉴定引擎**（PNG/JSON/WebP 结构级验证）、库内自动排除、无库收编引导、三路明细反馈 |
| 📦 打包导出 | 单卡整合包（主卡+世界书+正则）、批量打包、快捷单卡导出 |
| 🖼️ 换卡图 | 选择新立绘一键替换（PNG 原地替换 / WebP·JSON 自动转标准 PNG）、结构校验防废卡 |
| 📸 历史快照 | 保存前自动备份、一键恢复（恢复前自动备份当前版）、内容哈希去重、**一键清理全部/孤儿快照**、可配置（开关/冷却/保留数） |
| 🗑️ 回收站 | 删除移入全局回收站（可找回）、回收站内同名防互覆、打开全局回收站 |
| 🔄 OTA 自动更新 | electron-updater 检测新版本 → 应用内下载（进度条）→ **静默安装 + 自动重启** |
| 🛡️ 安全机制 | 主进程路径白名单、`app://` 协议 + CSP、DOMPurify XSS 清洗、符号链接环路防护、原子写入、崩溃兜底日志 |
| 🌐 离线可用 | 前端依赖经 Vite 构建全部打包进产物，无网络也能完整运行 |

---

## 📱 Android APP 版

基于 **Capacitor 8.5** 打包的 Android 原生壳（`compileSdk 36 / minSdk 24`），复用桌面版 Vue 3 渲染层与卡片解析逻辑，通过 `js/bridge/` 桥接层把 Electron API 语义等价映射到 Android 原生能力：

| 模块 | 说明 |
|------|------|
| 📂 三 Tab 主界面 | `卡片库 / 世界书 / 设置`（与桌面一致取消独立「聊天测试」主界面，聊天迁入详情页） |
| 🎴 卡片详情 | 四大 Tab：**设定**（名称/标签/Token 估算/详细设定/开场白/场景/示例/备用开场白 + 状态栏预览）、**世界书**（词条 IDE）、**正则**（脚本编辑）、**测卡**（内嵌聊天，OpenAI/Anthropic 双协议） |
| 🔐 SAF 文件授权 | Storage Access Framework 目录树授权，一次授权即可读写整个角色卡库；授权失效自动提示重新选择 |
| 📥 系统导入 | 调用系统文件选择器多选导入 PNG/JSON/WebP 角色卡，零知识库引导选择目录 |
| 📤 批量导出 | 单卡导出 / 多选批量打包 ZIP（发布到公共 `Download/JSKZX`，MIME `*/*` + 读授权，兼容鸿蒙 7 卓易通） |
| 🔍 磁盘扫描 | 扫描任意文件夹（SAF 临时授权）递归识别 PNG/WebP 角色卡并导入（[DiskScanView.vue](js/mobile/views/DiskScanView.vue)） |
| ♻️ 卡片查重 | 按内容哈希识别重复卡，保留最新版本、旧卡移入回收站（[DedupeModal.vue](js/mobile/components/DedupeModal.vue)） |
| 🚚 推送到酒馆 | 卡片详情页弹出设置酒馆地址 + API 密码，multipart/form-data 直传 `/api/characters/import` |
| 🔄 OTA 更新 | GitHub Releases（或自定义 JSON/version 地址）检查 → 下载 APK → 安装（FileProvider 授权） |
| 🗑️ 回收站 | 库内 `.trash` 软删除机制（删除即移动、可找回、walk 自动跳过） |
| 🖼️ 封面与性能 | 封面懒加载、失败徽标、列表增量渲染（24 首屏 + 滚动续载）、6 并发逐卡解析进度提示 |
| 🌗 主题 / 交互 | Vant 4 深浅双主题（跟随系统）、长按动作单（含 15ms 震动反馈）、键盘安全区适配 |

> 桌面版全部在线编辑核心（设定 / 世界书 / 正则 / 测卡）在 APP 版均可落地并**物理写回卡片文件**（PNG 原子写 chunk、JSON 重写），与桌面版功能对等、数据互通。

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Electron](https://www.electronjs.org/) `43.x` |
| 移动框架 | [Capacitor](https://capacitorjs.com/) `8.5`（Android 原生壳，`@capacitor/android` + `@capacitor/core`） |
| 移动 UI | [Vant](https://vant-ui.github.io/vant/) `4.10`（移动端组件库） |
| 移动路由 | [vue-router](https://router.vuejs.org/) `5.x`（Hash 模式，兼容 `file://` WebView） |
| 前端框架 | [Vue 3](https://vuejs.org/) `3.5`（Composition API + SFC，Vite 构建） |
| 构建工具 | [Vite](https://vitejs.dev/) `8.x` + `@vitejs/plugin-vue` |
| 样式 | [Tailwind CSS](https://tailwindcss.com/) `3.4`（PostCSS 编译） |
| 图表 | [Apache ECharts](https://echarts.apache.org/) `6.x` |
| 打包 | [electron-builder](https://www.electron.build/) `26.x`（NSIS 安装包 + zip 绿色版） |
| 自动更新 | [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater) `6.x`（OTA） |
| 图像处理 | [sharp](https://sharp.pixelplumbing.com/)（换卡图转 PNG） |
| 安全 | [DOMPurify](https://github.com/cure53/DOMPurify)（渲染层 XSS 清洗） |

---

## ⚙️ 环境要求

| 项目 | 桌面版要求 | Android 版要求 |
|------|------|------|
| 系统 | Windows 10/11（64 位） | Android 10+（API 24+，推荐 API 29+ 以获得 MediaStore 导出） |
| Node.js | `>= 18`（开发构建用；**最终用户无需安装** Node/Electron/任何运行时） | 同左 |
| npm | 随 Node.js 附带 | 同左 |
| JDK | — | **JDK 21**（编译 Android 必需，`JAVA_HOME` 指向它；JRE 1.8 / JDK 17 会导致 Capacitor 8 构建失败） |
| Android SDK | — | 含 platform android-36 + build-tools（`ANDROID_HOME` 配置） |
| Gradle | — | android/gradlew 自带 wrapper（首次构建自动下载） |
| 网络 | 首次 `npm install` 需联网（Electron 二进制可配置镜像加速） | 首次构建需联网下载依赖 |

> ✅ **桌面纯净环境兼容**：最终打包产物自带 Chromium + Node 运行时，用户端**不需要** .NET / VC++ / Python / WebView2。
> 📱 **Android 端**：APP 为原生壳 + WebView 渲染，无需额外运行时，鸿蒙 7 卓易通等安卓兼容环境中亦可运行。

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

> 国内网络加速（Electron 二进制走镜像）：
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm install
> ```

### 2. 开发模式运行

方式一：热更新开发（Vite Dev Server + Electron）

```bash
# 终端 1：启动 Vite Dev Server（改代码即时热更新，含 Vue DevTools 浮层，Alt+Shift+D 切换）
npm run dev

# 终端 2：启动 Electron 连接 Dev Server
npm run start:dev
```

方式二：直接运行（生产模式，自动构建 `web/` 后启动）

```bash
npm start
```

> 查看渲染进程日志（排查 UI 问题）：
> ```bash
> npx electron . --enable-logging
> ```

### 3. 打包

```bash
npm run build
```

（自动先执行 `vite build` 构建前端产物到 `web/`，再 electron-builder 打包 NSIS 安装包 + zip 绿色版）

> 本机访问 GitHub 慢时，可用**本地 Electron 离线打包**（复用 `node_modules` 里的 Electron，跳过网络下载）：
> ```powershell
> $env:ELECTRON_BUILDER_OFFLINE="true"
> npx electron-builder --win nsis --config.electronDist="$(Resolve-Path node_modules\electron\dist)"
> ```

产物输出到 `dist/`：
- `dist/win-unpacked/` —— 免安装绿色版（可压缩为 zip 分发）
- `dist/sillytavern-card-manager-1.9.0.exe` —— NSIS 安装包
- `dist/latest.yml` —— **OTA 更新必需**（与 exe 一起上传 GitHub Release）

### 4. Android APP 构建（APK）

```bash
# 一键：构建前端 → cap sync Android → 原生编译（产出 debug APK）
npm run build:android
```

分步执行（便于排查）：
```bash
npm run build:web            # ① Vite 构建前端产物到 web/
npx cap sync android         # ② 同步 web/ 到 android/app/src/main/assets
node scripts/post-cap-sync.mjs  # ③ 收尾（由 sync:android 自动触发）
cd android && gradlew.bat assembleDebug   # ④ 编译 debug APK
```

> 产出：`android/app/build/outputs/apk/debug/app-debug.apk`
> 正式发布签 release（见 [Android APK 打包](#android-apk-打包)）：
> `cd android && gradlew.bat assembleRelease` → `apk/release/app-release.apk`
> ⚠️ **每次改动前端代码后必须重新执行 `sync:android`**（`assembleRelease` 不会自动同步 web 目录，漏同步会导致 APK 还是旧界面）。

---

## 📁 目录结构

```
├── main.js                 # 主进程：窗口、app:// 协议、全部 IPC（58 通道）、PNG 写入、OTA、崩溃兜底
├── preload.js              # 预加载：contextBridge 安全暴露 electronAPI（~60 方法）
├── index.html              # 渲染进程挂载壳（<div id="app"> + 入口脚本，桌面/APP 共用）
├── package.json            # 项目配置 + electron-builder 打包配置 + publish（GitHub OTA）+ Capacitor 脚本
├── capacitor.config.json   # Capacitor 配置（appId / Android 壳）
├── vite.config.mjs         # Vite 构建配置（Vue 完整版别名、Tailwind、Vue DevTools）
├── tailwind.config.js      # Tailwind 内容扫描（index.html + js/**/*.{js,vue}）
├── css/
│   ├── tailwind.css        # Tailwind 指令入口（@tailwind base/…）
│   └── style.css           # 自定义样式（主题变量、过渡动画等）
├── scripts/
│   └── post-cap-sync.mjs   # cap sync 后收尾脚本（插件注册等）
├── js/
│   ├── entry.js            # ★ 渲染进程入口：createApp(App) + 全局错误兜底 + 环境分流
│   ├── components/         # ★ 桌面版 Vue SFC 组件（30 个）
│   │   ├── App.vue         #   根组件：状态/逻辑中枢 + provide/inject 上下文
│   │   ├── HeaderBar.vue   #   顶部菜单栏 + 紧凑工具栏
│   │   ├── SidebarPanel.vue#   左侧资源管理器（角色卡/世界书库）+ 拖拽把手
│   │   ├── EditorPanel.vue #   右侧编辑器（角色卡编辑 + 世界书 IDE + 日志控制台）
│   │   ├── AITagModal.vue  #   AI 智能批量打标弹窗
│   │   ├── GraphModal.vue  #   角色宇宙关系图谱（ECharts）
│   │   ├── … （其余 24 个弹窗/菜单组件：批量标签/查重/Diff/磁盘扫描/快照/更新/世界书系列等）
│   ├── bridge/             # ★ 双端桥接层：渲染层统一 api.[method]（Electron API 等价映射）
│   │   ├── api.js          #   入口：按运行环境注入 electronImpl / androidImpl
│   │   ├── contract.js     #   API 契约定义（双端对齐基准）
│   │   ├── electron.js     #   Electron preload 直通（window.electronAPI）
│   │   └── android.js      #   Capacitor 实现（SAF 文件系统 / 网络 / 推送 / OTA / 快照）
│   ├── mobile/             # ★ 移动端 Vue 视图层（Vant 4，与桌面渲染层同仓）
│   │   ├── MobileApp.vue   #   壳（3 Tab 导航：卡片库/世界书/设置）
│   │   ├── router.js       #   Hash 路由（卡片库/详情/世界书/设置/磁盘扫描）
│   │   ├── useMobileLibrary.js # 移动端数据层（逐卡解析/分组/移动/删除/保存）
│   │   ├── theme.js        #   深浅双主题切换（同步系统栏图标色）
│   │   ├── components/     #   MobileCardCover.vue 等
│   │   └── views/          #   CardLibraryView / CardDetailView（含测卡 Tab）/ WorldbookView / SettingsView / DiskScanView
│   ├── composables/        # ★ 桌面逻辑组合式函数（14 个：useAITools/useSearch/useGraph/useSnapshots…）
│   └── utils/
│       ├── cardLoader.js   # 卡片读取、数据规范化（V1/V2/V3 兼容）、extractBookEntries 安全提取
│       ├── pngParser.js    # PNG/WebP tEXt/iTXt 块解析、深度扫描提取 JSON
│       └── tokenEstimate.js# Token 估算工具（App 与 TextModal 共享）
├── android/                # ★ Capacitor Android 原生工程（compileSdk 36 / minSdk 24 / JDK 21）
│   ├── app/src/main/java/com/sillytavern/cardmanager/android/  # 5 个原生插件
│   │   ├── LibraryFsPlugin.java  # SAF 文件系统（扫描/读写/删除/复制/导入/打开/移动）
│   │   ├── AppConfigPlugin.java  # 配置持久化 + 酒馆路径存储
│   │   ├── HttpPlugin.java       # OkHttp 网络转发（GET/POST/multipart/downloadBytes）
│   │   ├── UpdatePlugin.java     # APK 下载/校验/安装（FileProvider）
│   │   └── KeystorePlugin.java   # AES-256-GCM 加密（TEE/StrongBox）
│   └── gradlew.bat         # Gradle wrapper（Windows）
├── test/                   # node:test 单元测试（33+ 用例，跨双端工具层）
├── build/                  # 打包资源（icon.ico、generate-icon.ps1）
├── web/                    # Vite 构建产物（gitignore，cap sync 时同步进 android/assets）
└── dist/                   # electron-builder 打包产物（gitignore）
```

---

## 🧩 架构说明

### 进程模型

```
┌─────────────────────────────────────────────────┐
│  主进程 main.js                                  │
│  ├─ app:// 协议（从项目根目录提供页面文件）       │
│  ├─ local-file:// 协议（展示本地立绘，查询参数传路径）│
│  ├─ 全部 IPC handler（58 通道：文件/对话框/API/OTA）│
│  └─ electron-updater（OTA 检测/下载/静默安装）    │
└───────────────┬─────────────────────────────────┘
                │ contextBridge（仅暴露受控方法）
┌───────────────▼─────────────────────────────────┐
│  预加载 preload.js → window.electronAPI          │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│  渲染进程 js/entry.js（Vue 3 SFC 组件化）          │
│  App.vue 根组件 + 29 个 SFC 子组件               │
│   ├─ HeaderBar / SidebarPanel / EditorPanel      │
│   ├─ 14 个 composables 承载业务逻辑              │
│  App.vue 通过 provide/inject 共享上下文（ctx）    │
│  仅能通过 window.electronAPI 访问主进程能力，      │
│  无法直接触碰 Node.js                             │
└─────────────────────────────────────────────────┘
```

### 渲染进程逻辑分层

```
App.vue (setup 状态中枢 + provide ctx)
  ├── useWorldbooks       世界书库与分组
  ├── useWorldbookEntries 世界书词条编辑器
  ├── useWorldbookExtras  世界书扩展（URL 导入/重命名/快照）
  ├── useSearch           全局深度搜索/超级搜索
  ├── useGlobalEntrySearch 全库词条搜索
  ├── useGraph            关系图谱（角色卡/世界书双引擎）
  ├── useTags             标签系统（单卡/批量/AI 打标）
  ├── useAITools          AI 汉化/格式升维
  ├── useChat             聊天测卡
  ├── useCardGroups       物理文件夹分组
  ├── useSnapshots        历史快照（删除/恢复/清理）
  ├── useDedupe           智能查重（角色卡/世界书）
  ├── useDiskScan         全盘打捞
  └── useBatch            批量操作
```

> **新增 IPC 的三步套路**：`main.js` 注册 `ipcMain.handle` → `preload.js` 暴露 → `js/components/App.vue`（渲染进程）调用。

---

## 🎨 双端架构

桌面版与 Android APP 版**共享同一套 Vue 3 渲染层源码**，通过「环境分流 + 桥接层抽象」实现一次开发、双端运行：

```
                    ┌──────────── 渲染层（Vue 3 SFC，同一份源码）────────────┐
                    │  桌面 UI：js/components/*（App/HeaderBar/Editor…）     │
                    │  APP UI： js/mobile/*（MobileApp + 5 个 views）        │
                    │  共享逻辑：js/utils/*（cardLoader/pngParser/token…）    │
                    │  入口分流：js/entry.js 检测 isNativePlatform 选择挂载根 │
                    └───────────────────────┬──────────────────────────────┘
                                            │ import { api } from '@/bridge'
                    ┌───────────────────────▼───────────────────────────────┐
                    │  js/bridge/api.js —— 按运行环境注入实现                 │
                    ├───────────────────────┬───────────────────────────────┤
   桌面（Electron）  │   electronImpl         │   androidImpl（Capacitor）     │  APP（Android）
   main.js ──IPC──► │   = preload 桥         │   = registerPlugin(5 插件)     │
   （文件/对话框/OTA）│   window.electronAPI   │   Capacitor Bridge ◄──回调────►│
                    └───────────────────────┴───────────────────────────────┘
                                                            │
                                          ┌─────────────────▼─────────────────┐
                                          │  Android 原生（java/…/android/）    │
                                          │  LibraryFs（SAF）AppConfig(Http)   │
                                          │  Update（OTA）Keystore（AES-256）  │
                                          └───────────────────────────────────┘
```

| 层 | 桌面版 | Android APP 版 |
|----|--------|----------------|
| 渲染入口 | `js/entry.js` → 挂载 `App.vue` | `js/entry.js` → 检测 `window.Capacitor` 挂载 `MobileApp.vue` |
| UI 组件 | Tailwind + 桌面组件（30 个） | Vant 4（`js/mobile/`，5 个视图 + 2 组件） |
| 桥接实现 | `js/bridge/electron.js`（直通 preload） | `js/bridge/android.js`（Capacitor 插件封装，1377 行） |
| 文件系统 | Node fs + 路径白名单 | SAF 目录树授权（`content://`），`.trash` 软删除 |
| 网络 | 主进程 IPC 转发（绕过 CORS） | `HttpPlugin`（OkHttp）转发，跳过 CORS |
| 持久化 | `userData/app_config.json` | 私有目录 `app_config.json`（`AppConfigPlugin`） |
| 自动更新 | electron-updater（静默安装） | `UpdatePlugin`（下载 APK + FileProvider 安装） |
| 安全 | app:// 协议 + CSP + 白名单 | Android Keystore **AES-256-GCM** + TEE/StrongBox 保护 |

> **桥接契约**：`js/bridge/contract.js` 定义了双端必须对齐的方法签名，新增能力时先在契约登记，两端实现必须语义等价（渲染层无环境判断，只面向 `api` 接口）。

---

## 💡 核心模块与关键坑

> 以下都是本项目开发中**踩过并验证**的关键点，新增功能前务必阅读。

### 1. Electron 33+ 移除了 `File.path`

拖拽文件的真实路径必须用 `webUtils.getPathForFile(file)`（经 preload 暴露），**禁止使用 `f.path`**。

### 2. `window.prompt()` 在 Electron 中不可用

Electron **不实现** `window.prompt()`，调用后静默返回 `null`（看起来「点击无反应」）。

✅ 统一使用项目自建的通用输入弹窗：

```js
const newName = await appPrompt('请输入名称：', '默认值'); // 返回 Promise<string|null>
```

### 3. `v-html` 渲染必须安全转义

卡片/世界书内容可能含 `<html>`、`<head>` 等代码，直接 `v-html` 会被浏览器当 DOM 吞掉。

✅ 使用 `js/components/App.vue` 中的 `renderHTML()`（先转义 `& < >`，再 `\n→<br>`）。

### 4. `cardData` 是 `shallowRef`（性能优化）

大卡片切换卡顿时引入的优化。意味着：
- **所有依赖 `cardData` 的计算属性**只能依赖**顶层替换**（`cardData.value = item.data`），不要依赖深层变异
- **世界书编辑**必须在 `worldbookEntries` computed 中返回 `reactive(entry)`（原始条目代理，**不要 `...entry` 拷贝**），否则 `v-model` 修改写不进原数据、保存会丢：

```js
// ✅ 正确：返回原始条目的响应式代理
return entries.map(entry => {
    if (!entry || typeof entry !== 'object') return entry;
    return reactive(entry);
});
```

### 5. 分类存放在 `libItem` 而非卡片文件

`category`/`customTags` 是**库项目**字段，不要写进 `cardData`（否则会污染保存到磁盘的卡片文件）。右侧分组选择器通过 computed getter/setter 映射到 `libItem.category`。

### 6. PNG 卡片保存与换图

- `main.js` 的 `writeTavernPNGChunk()` 负责把更新后的 JSON 写回 PNG 的 `chara`/`ccv3` 块（含 CRC32 重算、保留原图）。找不到卡片数据块时返回 `null`
- 含多个 chara/ccv3 块的卡片首块损坏时继续扫后续块（PNG 多块救援）
- 换卡图（`card:replaceImage`）用 sharp 转 PNG + 内嵌数据校准 + 往返校验，绝不出废卡

### 7. Windows 盘符与 `local-file://` 协议

盘符冒号会被 URL 规范化剥离，本地图片用查询参数传路径：
`local-file://img/?path=<encodeURIComponent(绝对路径)>`

### 8. 分组系统（物理文件夹）

- **分组 = 库目录下的一级子文件夹**：新建分组 = 建文件夹、移动卡片 = 物理移动文件、重命名分组 = 重命名文件夹（自动刷新全库）
- 预设分组 `defaultCategories` 是 **`ref`**（支持动态重命名），所有使用处必须 `.value`
- `has_lorebook` / `has_regex` 是特殊过滤 key（不在分组下拉中）
- 「全部」(all) 是视图模式，不可重命名

### 9. IPC 传参必须剥离 Vue 响应式 Proxy

`ipcRenderer.invoke` 无法 structured clone Vue 的响应式 Proxy（报 `An object could not be cloned`）。**任何把 `reactive`/`ref` 数据直接传 IPC 的代码都会在运行时崩溃**（静态检查测不出）。

✅ 传参前统一深拷贝剥离：

```js
const plainData = JSON.parse(JSON.stringify(cardData.value));
await window.electronAPI.saveCard(path, plainData);
```

### 10. 世界书脏形态安全提取

部分 JSON 角色卡的 `character_book`（内嵌世界书）是特殊形态——`entries` 为字典对象（`{ "0": {...} }`）、或 `character_book` 本身是数组（老 V1 格式，此时 `.entries` 命中数组原型方法）。旧写法会拿错值导致 `.forEach` TypeError → 角色栏消失/空屏。

✅ 统一使用 `cardLoader.js` 的 `extractBookEntries()`（数组优先识别 → entries 数组 → 字典 `Object.values`；任何形态永不抛错），已在全链路 9 处消费点接入。

### 11. 组合式函数 TDZ 陷阱

从 composables 解构的变量若被 setup 更早位置引用，会触发 `ReferenceError`（vite build 编译通过但运行时崩溃、白屏）。

✅ 被 setup 早期引用的状态（如 `snapshotConfig`）必须**状态提升到 App.vue 顶层**定义，再通过参数注入 composable。改动后必须 `npx electron . --disable-gpu --enable-logging` 真实启动验证。

### 12. 前端依赖统一走 npm + Vite

本项目已工程化升级：`vue` / `echarts` 等均通过 `npm install` 安装并由 Vite 打包（`vite build` 输出到 `web/`）。新增依赖：

```bash
npm install <包名>
```

⚠️ 依赖安装到 `node_modules` 会自动参与 Vite 打包；若需在渲染进程直接 `import`，请确认其可被 Vite 正确处理（或配置 `resolve.alias`）。

### 13. Capacitor/Android 跨平台关键坑

#### 13.1 环境与构建
- **JDK 21 是硬性要求**：Capacitor 8 编译 Android 需要 JDK 21（Gradle daemon 可能误选 32 位 JRE 1.8 / JDK 17 → 构建失败）。务必在环境变量/IDE 显式设置 `JAVA_HOME=D:\jdk21\jdk-21.0.2` 一类路径
- **`cap sync` 不自动同步前端**：每次 `vite build` 后必须 `npx cap sync android`，再 `assembleRelease`，否则 APK 还是旧界面
- **`capacitor.plugins.json` 可能被 `cap sync` 清空**（本地插件不在 node_modules）：必须在 `MainActivity.java` 显式 `registerPlugin(...)`，插件加载才可靠

#### 13.2 文件系统（SAF）
- Android 10+ scoped storage：**直接路径 IO 被禁**，必须 SAF 目录树授权（`ACTION_OPEN_DOCUMENT_TREE`）；授权 URI 持久化到私有目录 `app_config.json`，授权失效时提示重新选择
- PNG 卡片解析**禁止整读进内存**（卡库大时 OOM）：流式只读取 `tEXt/zTXt/iTXt` 字符块，跳过 `IDAT` 图像数据
- 删除 = 移入库根 `.trash`（保留相对子路径），丢弃系统回收站语义；遍历目录时跳过点开头目录

#### 13.3 分享 / 导出兼容（鸿蒙 7 卓易通）
- ZIP 等分享文件**必须先写入公共目录** `Download/JSKZX`（MediaStore，API 29+），私有 `content://` 在其他应用（鸿蒙模拟环境）无法访问
- 分享 Intent 必须：`type = */*`、`setClipData` + `FLAG_GRANT_READ_URI_PERMISSION`，否则 HarmonyOS 7 卓易通无法解析文件授权
- `WRITE_EXTERNAL_STORAGE` 仅对 API ≤ 28 声明：`android:maxSdkVersion="28"`，避免影响新系统

#### 13.4 路由与布局
- 卡片路径含 `/` 或中文 → **vue-router 用 `query` 传路径**（`/card?p=…`），`params` 会被编码/截断导致「卡片不存在」
- 移动端滚动容器**禁用 `height:100%`**：flex 布局下用 `flex:1; min-height:0`，否则滚动高度算错、列表无法滚动
- 自定义长按动作单需禁用系统原生复制菜单：`.mobile-shell { -webkit-touch-callout:none; user-select:none }`

#### 13.5 交互细节
- 长按卡片触发动作单：加 15ms 震动反馈（`navigator.vibrate(15)`）
- 列表性能：24 张首屏 + `IntersectionObserver` 增量渲染 16 张/批；封面懒加载 + 失败徽标
- 双主题切换需同步系统栏图标色（`theme.js` 在切换后调 SystemBars 样式），edge-to-edge 适配 `viewport-fit=cover`

---

## 🛡️ 数据与安全机制

| 机制 | 位置 | 说明 |
|------|------|------|
| 配置持久化 | `userData/app_config.json` | 统一权威配置中枢（分组/标签/API/UI 状态），原子写入（tmp + rename） |
| 保存快照 | 卡片同目录 `.bak_history/时间戳_文件名` | 每次覆盖保存前自动备份旧文件；内容哈希去重防膨胀 |
| 回收站 | `userData/jsTavern_Trash/` 全局回收站 | 删除=移动，可手动找回；同名加时间戳防互覆 |
| 崩溃兜底 | `userData/crash.log` | 主进程 `uncaughtException`/`unhandledRejection` 落盘 + 弹窗 |
| 渲染兜底 | 控制台 | `window.onerror` + Vue `app.config.errorHandler` |
| 路径白名单 | `main.js` | 全部文件类 IPC 校验「卡片库/世界书目录/酒馆根/扫描根/userData」白名单，越界读写拒绝 |
| 协议安全 | `main.js` | `app://` 路径穿越校验、`will-navigate` 拦截、`setWindowOpenHandler` deny、CSP 响应头 |
| XSS 防护 | 渲染层 | DOMPurify 清洗聊天渲染内容，禁脚本/事件/iframe/外联图片 |
| 环路防护 | `main.js` | 4 处递归扫描 realpath 去重，符号链接/junction 环路不再死循环 |
| 原子写入 | `main.js` | saveCard/世界书保存/PNG 升级统一 tmp 唯一命名 + rename，中断不产生半截文件 |
| 集成包导出 | 用户自选目录 `${角色名}_Package/` | 主卡 + worldbook.json + regex_scripts.json |
| Android 配置 | APP 私有目录 `app_config.json`（AppConfigPlugin） | SAF 授权 URI / 酒馆路径 / API 配置，不写入公共区 |
| Android 加密 | Android Keystore（KeystorePlugin） | 敏感配置 AES-256-GCM 加密，密钥存 TEE/StrongBox 硬件区 |
| Android 回收站 | 库根 `.trash/`（保留相对子路径） | 删除=移动（软删除），找回/一键清理由顶部菜单提供 |
| Android 分享导出 | 公共 `Download/JSKZX/`（MediaStore） | ZIP 导出写公共目录，Intent `*/*` + 读授权，兼容鸿蒙卓易通 |

---

## 📦 打包与发布

### 基础打包

```bash
npm run build
```

### 离线打包（GitHub 网络慢时）

electron-builder 打包前会下载 Electron 二进制（本机访问 GitHub 慢会长时间卡在 `downloaded label=electron`）。复用本地已安装的 Electron 可完全跳过下载：

```powershell
$env:ELECTRON_BUILDER_OFFLINE="true"
npx electron-builder --win nsis --config.electronDist="$(Resolve-Path node_modules\electron\dist)"
```

> ⚠️ 注意：electron-builder 卡住时**不要误杀 node 进程**（它本身是 node 进程，正在下载）。用 `electronDist` 后基本不会再卡。

### 自定义应用图标

`build/icon.ico` 已配置（`package.json` → `win.icon`）。想重新生成：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "build\generate-icon.ps1"
```

> ⚠️ 必须用 **pwsh**（PowerShell 7）运行，Windows PowerShell 5.1 会因 UTF-8 编码乱码报错。

### 代码签名（推荐公开发布前配置）

无证书时当前构建保持 `signAndEditExecutable: false`。拿到数字证书（`.pfx`）后：

```json
"win": {
  "signAndEditExecutable": true,
  "certificateFile": "path/to/your-cert.pfx",
  "certificatePassword": "证书密码"
}
```

或使用环境变量 `CSC_LINK` / `CSC_KEY_PASSWORD`（推荐，避免密码入库）。签名后可消除 SmartScreen 拦截、降低杀软误报。

### 版本发布（GitHub Releases + OTA）

**⚠️ 必须上传 `latest.yml`**——electron-updater 通过 `releases/download/<tag>/latest.yml` 获取更新信息，缺失则 OTA 静默更新失败（404）！

完整发布流程：

1. 修改 `package.json` 的 `version`（如 1.8.9 → 1.9.0）
2. `RELEASE_NOTES.md` 顶部加新版本节
3. README 下载链接/产物名同步版本号
4. `npm run build`（或上面的离线打包）
5. 创建 GitHub Release（tag 用 `vX.Y.Z`，必须与 package.json version 对应）：
   ```powershell
   gh release create vX.Y.Z --repo tian2418671-sys/JSKZX --notes-file notes.md
   ```
6. **上传资产（exe + latest.yml 必须同传）**：
   ```powershell
   gh release upload vX.Y.Z "dist\sillytavern-card-manager-X.Y.Z.exe" "dist\latest.yml" "dist\sillytavern-card-manager-X.Y.Z.exe.blockmap" "dist\SillyTavern.zip" --repo tian2418671-sys/JSKZX
   ```
7. 覆盖发布同版本时：先 `gh release delete-asset` 删同名旧资产，再 `gh release upload ... --clobber` 上传
8. 验证 OTA 链路：
   ```powershell
   Invoke-WebRequest "https://github.com/tian2418671-sys/JSKZX/releases/download/vX.Y.Z/latest.yml"
   # 应返回 200
   ```

> 🔴 **踩坑记录**：v1.8.5 曾因漏传 `latest.yml` 导致全部用户 OTA 静默更新失败（electron-updater 请求 404）。发布后务必验证 latest.yml 可访问。

### 静默升级机制

- `main.js` 使用 `electron-updater`：`autoDownload=false` + `autoInstallOnAppQuit=true`
- `sys:installUpdate` 调用 `autoUpdater.quitAndInstall(true, true)`（`isSilent=true` 静默安装不弹向导，`isForceRunAfter=true` 装完自动重启）
- **前提**：保持 per-user 安装（`perMachine` 勿设 true），否则无 UAC 提权静默写入会 EACCES

### Android APK 打包

**Debug 包**（日常自测）：
```powershell
npm run build:android          # 一键（build:web → cap sync → assembleDebug）
# 产物：android\app\build\outputs\apk\debug\app-debug.apk
```

**Release 签名包**（正式分发 / OTA 升级）：
1. 准备签名文件并把密码写入 `android/app/keystore.properties`（已 gitignore，缺失时自动回退 debug 签名）：
   ```properties
   storeFile=../jszkx-release.jks
   storePassword=***
   keyAlias=jszkx
   keyPassword=***
   ```
2. 编译并校验：
   ```powershell
   npm run build:android        # 或分开执行 build:web → cap sync android → gradlew assembleDebug
   cd android
   .\gradlew.bat assembleRelease    # 产物：app\build\outputs\apk\release\app-release.apk
   .\gradlew.bat app:verifyReleaseSigning
   ```
3. 校验证书指纹与线上一致（覆盖升级要求签名一致）：
   ```powershell
   keytool -list -printcert -jarfile app-release.apk | Select-String "SHA256"
   ```
   > ⚠️ 若用新 keystore 重新签名，指纹会变，**无法覆盖升级**已安装的旧签名 APK（需卸载重装）。

**发布到 GitHub Release**：与桌面版同 tag 上传 APK 资产，APP 内置 OTA 从 Releases（或自定义更新地址）检查新版本，下载后经 FileProvider 安装。

---

## 🔧 开发指南：如何新增功能

### 新增一个「前端按钮 → 主进程能力」的功能（标准流程）

1. **`main.js`** 注册 IPC：
   ```js
   ipcMain.handle('my:newFeature', async (event, arg) => {
       try { /* ... */ return { success: true, data }; }
       catch (e) { return { success: false, error: e.message }; }
   });
   ```
2. **`preload.js`** 暴露：
   ```js
   newFeature: (arg) => ipcRenderer.invoke('my:newFeature', arg),
   ```
3. **`js/components/App.vue`** 在 `setup()` 中定义方法并加入 `return { ... }`（同时加入 `provide('appCtx', ctx)` 供子组件共享）。
4. 绑定到模板 `@click` / `v-model`（或拆分为新的 SFC 子组件挂到 `App.vue` 模板）。

### 新增一个「纯前端状态」的功能

在 `js/components/App.vue` 的 `setup()` 中：
1. 定义 `ref` / `computed` / `reactive`
2. **务必加入 `return { ... }`**（模板只能访问暴露的成员）
3. 若需在 HeaderBar / SidebarPanel / EditorPanel 等子组件中使用，需一并加入 `provide('appCtx', ctx)` 的 `ctx` 对象
4. 若逻辑复杂（>100 行），抽到 `js/composables/` 作为组合式函数（注入依赖 + return 状态/方法），再在 App.vue 解构

### 新增 / 拆分一个弹窗组件（SFC 规范）

1. 在 `js/components/` 新建 `XxxModal.vue`，声明 `props`（父传子状态）+ `emits`（子传父事件）
2. 在 `App.vue` 模板中挂载 `<xxx-modal :show="..." @close="..." />` 并注册组件
3. ⚠️ **组件注册名陷阱**：模板 kebab 标签 `xxx-yyy-modal` 只能解析为 `XxxYyyModal`（首字母大写、连续大写字母会被折叠为单个大写）。若组件名含连续大写（如 `AITagModal`），必须用小写化注册名 `AiTagModal`，否则弹窗静默失效
4. ⚠️ 事件名大小写：子组件 emit camelCase（`update:newAICandidateTag`），父模板必须监听 camelCase `@update:newAICandidateTag`（**kebab-case 监听不会匹配 camelCase emit**）

### 需要输入的场景（禁止用 `prompt`）

```js
const value = await appPrompt('标题：', '默认值');
if (value && value.trim() !== '') { /* 处理 */ }
```

### 确认/提示（禁止用 `confirm`/`alert`）

```js
const ok = await confirmDialog('确定要删除吗？');  // Electron 中 window.confirm 静默返回 null
nativeAlert('保存成功', 'info');                   // type 仅支持 none/info/error/question/warning
```

### 新依赖 / 新前端库

1. `npm install <包名>`（Vite 自动打包进产物）
2. 在 `js/components/*.vue` 或 `js/utils/*.js` 中 `import` 使用
3. `package.json` `build.files` 已含 `web/**/*`（Vite 构建产物），无需额外配置

### 提交前自查清单

- [ ] `node --check` / `get_errors` 无语法错误
- [ ] `npm test` 单测全绿（33 个用例）
- [ ] 新增成员已加入 `setup()` 的 `return` 与 `ctx`
- [ ] IPC 传参已 `JSON.parse(JSON.stringify(...))` 剥离 Proxy
- [ ] 未引入外部 CDN / 未使用 `prompt`/`confirm`/`alert` / 未对 `cardData` 深层响应式
- [ ] 改动后真实启动验证（`npx electron . --disable-gpu --enable-logging`，vite build 不验证运行时）

---

## 🔍 常见问题排查

| 现象 | 原因 / 解决 |
|------|------------|
| 点击按钮无反应 | 大概率用了 `prompt()` → 改用 `appPrompt` |
| 页面空白 | 生产模式由 `app://` 加载 `web/` 构建产物——请先执行 `npm run build:web`；开发模式需先启动 `npm run dev` 再 `npm run start:dev`；或组合式函数 TDZ（见关键坑 11） |
| 世界书改完保存丢失 | `worldbookEntries` 必须返回 `reactive(entry)` 而非 `...entry` 拷贝 |
| 导入 JSON 卡后角色栏消失/空屏 | 内嵌世界书脏形态 → 已用 `extractBookEntries` 全链路修复；升级到 v1.8.4+ |
| 传 IPC 报「An object could not be cloned」 | 传了 Vue 响应式 Proxy → 先 `JSON.parse(JSON.stringify(...))` 剥离 |
| 大卡片切换卡顿 | 已用 `shallowRef` 优化；新增功能勿对 `cardData` 深层依赖响应式 |
| 千卡库启动慢/未响应 | 已做异步分片 + I/O 风暴治理；升级到 v1.8.5 |
| 检查更新报错/不弹更新 | 确认 GitHub Release 上传了 `latest.yml` 且 tag 为 `vX.Y.Z`；开发模式会提示「开发模式跳过更新检测」（正常） |
| 更新后弹「重装向导」 | 旧版 bug；升级到 v1.8.2+（`quitAndInstall(true, true)` 静默升级） |
| 打包报 EBUSY 锁文件 | 有应用实例在运行（含 win-unpacked 正式版）→ 按 `Path -like '*JSK管理*'` 杀进程后再打包 |
| electron-builder 卡住不动 | 正在下载 Electron（本机 GitHub 慢）→ 用 `electronDist` 离线打包，勿误杀进程 |
| 打包后无图标 | 确认 `build/icon.ico` 存在且 `package.json` `win.icon` 配置正确 |
| 安装包被杀软报毒 | 未签名 + Electron 特征；建议代码签名 |
| 打开卡片详情提示「卡片不存在」 | 路径含 `/`/中文走了 `params` → 用 `query`（`/card?p=…`）传路径 |
| APP 列表无法滚动 | 滚动容器用了 `height:100%` → 改 `flex:1; min-height:0` |
| 导入的卡片打开报错/卡顿 | PNG 解析整读内存导致 → 升级到含流式解析的版本（跳过 IDAT 只读文本块） |
| 导出 ZIP 无法分享/对方打不开 | 文件必须写公共 `Download/JSKZX` + Intent `*/*` + 读授权（鸿蒙卓易通必须） |
| 首页提示「库目录已失效」 | 授权目录被移动/删除或系统回收授权 → 重新选择库目录并重扫 |
| Android 构建失败 | JDK 非 21（Gradle 误选 32 位 JRE1.8/17）→ 设 `JAVA_HOME` 为 JDK 21 后重试 |
| APK 装的还是旧界面 | 忘记 `cap sync android` → 每次前端改动后重新 `npm run build:android` |
| release 包无法覆盖升级 | 签名指纹与已装版本不一致 → 恢复原 jks，或用 debug 签名卸载重装 |

---

## 🤝 开源与贡献

### 开源说明

- **许可证**：MIT（详见下方 `LICENSE` 章节）
- 本项目为**纯本地**工具：不上传任何用户数据、无遥测、无广告
- 所有第三方前端库已本地化，构建产物完全离线可用

### 如何贡献

1. `Fork` 本仓库并克隆到本地
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 本地运行 `npm start` 开发自测
4. 提交前自查（见[提交前自查清单](#提交前自查清单)）
5. 提交并创建 Pull Request，附上改动说明与测试步骤

### 建议的提交信息格式

```
feat: 新增关系图谱枢纽高亮
fix: 修复 Shift 连选在搜索后索引错位
perf: cardData 改用 shallowRef 优化切换卡顿
docs: 补充开发者文档
```

---

## 📄 License

本项目基于 **MIT License** 开源。使用时请遵守许可证条款。

---

*由开发者社区维护 · 本地优先 · 离线可用 · 数据只属于你自己*
