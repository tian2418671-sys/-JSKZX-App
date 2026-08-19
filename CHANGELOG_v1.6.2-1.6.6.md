# SillyTavern 角色卡管理器 · v1.6.2 → v1.8.2 更新汇总

> 更新周期：2026-08-15 ~ 2026-08-19
> 技术栈：Electron + Vue3 + Tailwind + ECharts

---

## ✨ v1.8.2 —— 换卡图 + 链接下载导入 + 下拉菜单 + 静默升级 + 安全加固 + 8 项 BUG 修复 + 代码审查整改

> 内部详细版（对外精简版见 RELEASE_NOTES.md v1.8.2）

### 🖼️ 换卡图（新功能）
- 工具栏 ⚙ 菜单 / 右键菜单「🖼️ 换卡图」：选择新立绘一键替换
- PNG 卡**原地替换**（内嵌 chara/ccv3 数据完整保留）；WebP / JSON 卡自动转标准 PNG 卡
- 主进程新增 `card:replaceImage` IPC + 7 个 PNG 工具函数（buildPngChunk / isCharaChunk / isPNGBuffer / embedCardJSONIntoPNG / calibrateCardData / getCardName / validateCardPNG）
- sharp 可选依赖（N-API 走 ABI 兼容，Electron 下验证通过）

### 🌐 从链接下载导入角色卡（新功能）
- 顶部「🌐 链接导入」+ 文件菜单入口
- 主进程 `card:downloadFromUrl` IPC：`net.fetch` 走系统代理下载 → PNG/JSON 校验 → 落盘卡片库（同名跳过不覆盖）
- 支持 PNG 卡（内嵌 chara/ccv3 块）与 JSON 卡；20MB 上限；非角色卡文件明确报错
- 进度提示用非阻塞 toast（避免模态框阻塞导致「下载中」卡死）

### ⚙️ 编辑器工具栏下拉菜单
- 7 个操作按钮（汉化/升维/快照/换卡图/保存/导出/删除）收进 ⚙
- `<Teleport to="body">` + fixed 定位 + 全屏透明遮罩：彻底解决遮挡 / 裁剪 / 层级问题

### � 更新后静默升级（新功能）
- **根因定位**：真正导致「更新 = 重装向导」的不是 oneClick，而是 `sys:installUpdate` 里**无参 `quitAndInstall()`**——`isSilent` / `isForceRunAfter` 默认均 false → 以非静默方式运行安装器（assisted installer 弹界面）、装完不自动重启
- **最小修复 1 行**：`autoUpdater.quitAndInstall(true, true)`（`isSilent=true` 静默升级；`isForceRunAfter=true` 装完自动重启）
- 首次安装自定义目录已支持：`oneClick:false` + `allowToChangeInstallationDirectory:true`（assisted 向导可自选 D/E 盘），无需改动
- ⚠️ 关键前提：保持 per-user（package.json **勿设 `perMachine:true`**）——否则装到 C:\Program Files，静默更新因无 UAC 提权写入失败（EACCES）

### �🐛 Bug 修复（8 项，含根因）

1. **卡片导入空分组**：清理历史遗留的幽灵分组数据（`123`/`555`）并把卡片回退「未分类」
2. **编辑器内容区右侧大面积空白**：移除 basic / advanced / worldbook / regex 4 处 `max-w-5xl` 宽度限制，内容随窗口铺满
3. **历史快照配置重启丢失**：快照开关 / 冷却 / 保留数持久化到 app_config + snapshot_config.json 双源
4. **「最新」排序错乱**：根因=全库 mtime 被批量 touch 统一成同一时刻导致排序退化；改以物理**创建时间 birthtime** 为第一基准（稳定反映入库时刻）
5. **关闭自动快照仍生成快照**：根因=`saveSnapshotSettings` 把 Vue reactive Proxy 直接传 IPC 报 `An object could not be cloned`，主进程始终默认 `enabled=true`；改为 `JSON.parse(JSON.stringify())` 剥离后同步
6. **保存成功弹窗报错**：`showMessage` 收到非标准 type `success` 抛 `Invalid message box type`；主进程做类型归一（→ info）
7. **导入卡片出现无名/陌生分组**：根因=自动分类 `tag.split(' ')[0]` 把 `Monster (魔物娘)`→`Monster` 等英文规则名当分组创建；改为分类只落预设分组，未知组名保持「未分类」且不自动建组
8. **空物理文件夹显示为空分组**：`walkLibraryDir` 无条件把一级文件夹当分组；改为扫描后仅保留**确实包含卡片文件**的文件夹作为物理分组

### 🔐 安全与稳定性加固（代码审查 37 项整改）

- **依赖 CVE**：`npm audit` 检出 15 项漏洞（全在构建工具链）→ 升级 electron-builder 26.15.3 + electron 43.4.1，**0 漏洞**
- **API Key 明文落盘 → safeStorage 加密**：内存明文、磁盘密文，兼容旧明文自动回退；main.js `secret:encrypt/decrypt` IPC + preload + App.vue / useChat.js 读写改造
- **JSON 卡原子写入**：file:saveCard 改 tmp + rename 替换，中途崩溃不再损坏原卡
- **文件句柄防泄漏**：walkLibraryDir `openSync` 套 try/finally
- **关键落盘补日志**：saveSnapshotConfig 写盘失败不再静默吞掉（console.error）
- **渲染层统一错误兜底**：entry.js `errorHandler` 加用户提示 + 全局 `error` / `unhandledrejection` 监听
- **废弃 escape() 移除**：pngParser 改 TextDecoder 标准 UTF-8 解码（无非 ASCII 越界隐患）
- **网络请求重试**：`fetchWithRetry`（5xx / 网络错误退避重试）接入 chat:send / models:fetch / tavern:push
- **魔法数字常量化**：`MAX_URL_DOWNLOAD_BYTES` / `MAX_WB_FETCH_BYTES` / `SCAN_FILE_BATCH` / `SCAN_PROGRESS_STEP` / `CHAT_DEFAULT_MAX_TOKENS`
- **运行时依赖精确版本**：dompurify / electron-updater / sharp 去掉 caret（^）

### 🧪 单元测试（node:test，19 用例全过）

- `test/tokenEstimate.test.mjs`：Token 估算边界（空 / 非字符串 / 中英混合）
- `test/cardLoader.test.mjs`：normalizeCardData V1 / V2 / V3 结构兜底
- `test/pngParser.test.mjs`：PNG tEXt / ccv3 / 截断 / 损坏解析
- `test/businessData.test.mjs`：典型业务数据回归（V2/V3 卡、Token 业务口径）
- `npm test` 一键运行

### ⬆️ 依赖升级

- Electron 33 → **43.4.1**（主进程 API 全部兼容验证通过，国内镜像安装）
- electron-builder 25 → **26.15.3**
- `npm audit` **0 已知漏洞**

---

## ✨ v1.6.2 —— 深度修复 8 项 + UI 全面瘦身 + 安全加固

### 🔧 底层修复（8 项）

- 📋 **克隆世界书 UID 冲突修复**：复制副本时重新生成全部词条唯一标识，杜绝 Vue 渲染错乱（Duplicate keys）
- 🔀 **世界书折叠状态错位修复**：从数组索引改为稳定唯一标识，删除/排序词条后折叠状态不再错乱
- 🔌 **API 引擎切换模型回退**：切 Claude 时自动清空 `local-model`/`gpt-*` 不兼容模型名，杜绝 HTTP 400
- 🧮 **正则作用域 0 值误判修复**：`placement: 0` 不再被误判为"默认"，补全"全局/未定义"映射
- 🖼️ **PNG 重组 IEND 兜底**：保存时确保 IEND 块收尾，杜绝残缺 PNG
- 🎴 **卡片规范化 3 项**：V2 字段缺失不再白屏（tags/alternate_greetings/extensions 兜底）；缺 spec 半残卡不再双重嵌套；Blob URL 改用本地路径协议防内存泄漏
- 🏷️ **自动打标落盘**：新卡导入时自动标签/分类立即物理保存，重启不丢失
- 🧹 **V1 判定排他**：酒馆 config.json 等标准配置文件不再被误当角色卡入库

### 🎨 UI/UX 全面瘦身

- 🗜️ **列表双模式**：常规（大头像+描述+Token/标签三行信息）/ 紧凑（极致单行，一屏翻倍卡片）
- 📁 **排序下拉**：名称 / 最新 / Token 三种排序，偏好持久化
- 🎛️ **高级筛选折叠**：分类/快捷标签/过滤 chips 收进漏斗面板，侧边栏顶部只留搜索+漏斗
- 📌 **批量操作底部悬浮台**：多选时页面正下方弹出毛玻璃控制台，不再挤占侧边栏
- 🌍 **世界书侧边栏折叠式**：URL 导入/打开目录/分组/筛选收进 ▼ 面板，与角色卡模式同款交互
- 📖 **世界书词条紧凑化**：启用圆点可点击切换、字数/位置徽章、hover 操作、列表可整体收起
- ✅ 修复重复分类下拉（"All (全部)" 只保留一个）

### 🖥️ 世界书编辑器重构（IDE 化布局）

- 📚 **左列表 + 右详情**：从卡片内联展开改为「左侧可收起词条列表 + 右侧详情编辑」双栏 IDE 布局
- 🎯 **竖直长条折叠按钮**：浮在栏边缘垂直居中，一键收起为窄条（📖 + 竖排词条数），点击 📖 可快速展开
- 🔍 **侧栏内搜索 + 新建**：搜索框与 ➕ 新建移入左侧栏，触发词/备注/正文全字段匹配
- 🗜️ **极致压缩列表**：`formatKeys` 展示触发词（空 key 显示「无触发词」）+ 启用圆点 + hover 复制/删除（毛玻璃背景）
- ✍️ **详情区全字段编辑**：主触发词/备注 → 次要触发词/权重 → 插入位置（0-4 五档）→ 内容 textarea 撑满 + 实时字数
- 🔗 **原生字段映射**：`key` / `keysecondary` 逗号分隔双向绑定（computed），严格遵循酒馆官方字段，绝不污染 JSON
- 🛡️ **修复底部遮挡**：底部终端控制台不再遮挡词条列表最后一个条目（动态底部留白联动）

### 🔐 安全加固（纵深防御）

- 🛡️ **渲染模式 XSS 清洗**：引入 DOMPurify（本地依赖、离线可用），聊天渲染模式剥离脚本/事件/iframe/`javascript:` 等危险内容，禁止外联图片（防追踪像素/内网探测）
- 🧱 **主进程路径白名单**：全部文件类 IPC 统一校验「卡片库/世界书目录/酒馆根/扫描根/userData」白名单，越界读写/删除/导出一律拒绝；`local-file://` 协议越界返回 403
- 🔒 **CSP 响应头**：生产模式注入完整 Content-Security-Policy（限制内联脚本与外部连接），纵深防御兜底
- 🛑 **`openExternal` 协议白名单**：仅放行 http/https，防恶意 URL scheme 触发
- ⚡ **单文件 IO 异步化**：读图/读卡/保存全链路改 `fs.promises`，几十 MB 大图不再卡主进程
- 🐛 **修复配置覆盖 bug**：选择/扫描文件夹时改为合并写入配置，不再冲掉已保存的全局标签库
- 🔓 **堵死白名单自扩权后门**：`scan-target-folder` 直接传路径严格限定为纯盘符；`tavern:pushDir` 不再无条件扩权（需已在白名单或通过酒馆指纹验证）；`FORBID_ATTR` 改为真正生效的字符串列表

---

## ✨ v1.6.3 —— 安装版持久化修复（过渡版本）

> ⚠️ 说明：v1.6.2.1 → v1.6.3（electron-builder 不支持四段版本号 1.6.2.1）

- 🔧 **修复安装版分组/语言/分类重启丢失**（根因：`app://` 协议 localStorage 不落盘）
- 📁 **预设分组删除/重命名持久化**：重启不再重新生成或「改名新分组 + 原预设」重复并存
- 🏷️ **分组操作卡片分类物理持久化**：分组重命名/删除/移动后分类跨重启保留
- 🌐 **语言设置持久化**：标签语言模式（纯中文/纯英文/中英双语）重启保持上次选择
- 🚫 **特殊分组按钮隐藏**：「全部」「未分类」等系统视图不显示改名/删除按钮

---

## ✨ v1.6.4 —— OTA 自动更新 + 全盘检索 + 血统鉴定

- 🔧 **持久化真正落盘修复（关键）**：`saveUiSettingsToDisk` 此前把 Vue 响应式 Proxy 直接传给 IPC，触发 Electron `An object could not be cloned` → 分组/语言/卡片分类**从未真正写入磁盘**（静默失败）；已统一用 JSON 序列化剥离 Proxy，实测语言切换 + 卡片分类修改均能物理落盘、重启恢复
- 🚀 **OTA 自动更新**：升级为 electron-updater 自动下载安装——检测到新版本后应用内一键下载（实时进度条/速度），下载完成自动重启安装，无需跳转浏览器手动下载
- 🛰️ **全盘深度检索引擎 (Beta)**：实验菜单「全盘打捞卡片」极客雷达风弹窗——自动枚举全部本地磁盘、体积过滤引擎（拦截 <40KB 废图/贴图）、穿透隐藏文件夹的 V2 并发递归扫描、实时进度心跳，扫描完成后一键「全部强行收编入库」精准追加入库（同名跳过，不清空现有库）
- 🕵️ **角色卡血统严格鉴定**：入库前指纹级校验——新增拦截伪装成卡片的**聊天记录**（messages/chat_metadata）、**独立世界书**（孤立 entries）、**UI 主题配置**（colors/user_settings），连同原有的 config.json 排他与 V1/V2/V3 规范校验，杜绝脏数据污染卡片库（实测 4 类伪装文件全拦截、含无 description 的 V1 真卡不误杀）
- 📁 分组删除/重命名持久化、卡片分类持久化、语言设置持久化（延续 v1.6.3 成果，配置以文件为权威载体）

---

## ✨ v1.6.5 —— 统一持久化中枢 + 导入修复 + 全盘强行收编

- 🛡️ **统一持久化中枢（app_config.json 最高权威）**：全软件全局状态（分组/语言/全局标签池/API Key）统一收口到 `app_config.json` 物理文件（原子写入：临时文件 + rename，绝不丢数据）——生产模式下即便 localStorage 不持久也不丢配置
- 🎴 **卡片覆盖层防冲刷（核心）**：手动改过的卡片分组/标签写入物理覆盖层（key=卡片路径），重新扫描/重启后**绝不**被自动分类覆盖（实测重扫后"恋活"分组完整保留）
- 💾 **卡片变更三保险落盘**：新增 `persistCardUpdate` 统一入口（内存 + 覆盖层 + 物理重写 PNG），8 个标签/分类操作全部接入——即使 PNG 重写失败，配置库也能记住数据
- 🔑 **API 配置物理持久化**：Endpoint / Key / Model 此前只存 localStorage（生产模式重启丢失），现已写入 app_config.json，重启自动恢复
- 📥 **导入功能修复（Win10 等导入不了卡片）**：文件菜单导入改用浏览器 File API 直接读取内存内容，彻底绕过 IPC 路径白名单——从桌面/下载等任意位置导入卡片不再被拒（修复"未识别到有效的角色卡文件"）
- 🚀 **全盘扫描强行收编通道**：新增 `sys:importExternalCards` 专属接口——全盘检索出的卡片可绕过源路径白名单强行复制入库（只校验目标库；同名跳过绝不覆盖；兼容字符串/对象两种格式）
- 🔄 **旧配置自动迁移**：首次启动自动把旧 `tavern_manager_config.json` 的 globalTags/uiSettings 合并迁移到 app_config.json，历史数据零丢失
- 🖼️ **修复破碎图标**：文件菜单导入复制到库目录 + 用 `local-file://` 永久路径替代 blob URL
- 🖼️ **导入格式增强**：jpg/jpeg 卡片格式支持 + 去重/未识别区分提示 + 诊断日志

---

## ✨ v1.6.6 —— 修复：世界书与角色卡目录彻底分离

- 🔀 **打开世界书目录后自动切换到世界书模式**：此前从文件夹打开世界书目录，界面仍停留在角色卡列表页，误认为"没分开"
- 🔀 **打开角色库目录后自动切回角色卡模式**：两个入口现在在上完全独立
- 🛡️ **带 name 字段的世界书 JSON 不再混入角色卡**：此前部分世界书文件（含 name 字段）会被误判为 v1 角色卡导入，现已严格拦截所有顶层 `entries` 数组（角色卡内嵌世界书在 `data.character_book`，不受影响）
- 📦 版本号升级 1.6.6 + 忽略 dist2 构建目录

---

## 📊 版本迭代脉络

| 版本 | 主题 | 核心价值 |
|------|------|---------|
| **v1.6.2** | 修复 + 瘦身 + 安全 | 8 项深度修复、UI 精简、世界书 IDE 化、XSS/白名单防护 |
| **v1.6.3** | 持久化修复 | 安装版设置重启丢失根因修复（过渡版） |
| **v1.6.4** | OTA + 检索 + 鉴定 | 自动更新、全盘打捞、血统鉴定、落盘 bug 修复 |
| **v1.6.5** | 持久化中枢 | `app_config.json` 统一收口、覆盖层防冲刷、导入修复 |
| **v1.6.6** | 目录分离 | 世界书与角色卡目录彻底分离、模式自动切换、世界书 JSON 不再混入 |

**整体主线**：v1.6.2 打牢基础（修复 + 安全）→ v1.6.3 / 1.6.4 攻克持久化（重启丢配置）→ v1.6.5 统一持久化架构 → v1.6.6 资产分离收尾。
