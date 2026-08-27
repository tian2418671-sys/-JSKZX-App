# JSKZX App 完整迁移方案 v2

> 目标：将 Windows Electron 桌面版完整迁移为 Android App，同时保留桌面版全部能力、数据格式和安全机制。
>
> 基线：桌面版 v1.9.0｜方案版本：v2.1｜日期：2026-08-27
>
> **v2.1 更新**：P0-P4 全部完成，4 个"不支持"桩已替换为 Android 原生方案，待真机测试。详见第 13 节。
>
> 本方案的“完美迁移”定义为：**功能等价、数据等价、行为可解释、文件不损坏、桌面端不回归、Android 真机可验收**。不是简单把现有网页打包进 APK。

---

## 1. 总体结论

当前工程已经具备 Capacitor 壳、移动端页面、桥接层和 SAF 插件雏形，但距离完整迁移还有明显差距。v2 不采用“移动端另写一套简化功能”的路线，而采用：

```text
同一业务核心 + 平台能力适配器 + 响应式界面

桌面端 Vue UI ─┐
               ├─ 统一 API 契约 ─ Electron Adapter ─ Electron IPC / Node
Android UI  ───┘                  Android Adapter  ─ Capacitor Native Plugins
```

### 1.1 最重要的原则

1. **先锁定桌面版行为，再迁移，不以当前移动端 stub 为标准。**
2. **所有文件操作必须经过统一 `api`，业务层不得直接调用 Electron IPC 或 Capacitor Plugin。**
3. **PNG、WebP、JSON 必须按原格式安全保存，禁止把二进制卡片当文本覆盖。**
4. **桌面端和 Android 端使用同一套卡片/世界书规范化、校验、快照、导出逻辑。**
5. **每个桌面能力都必须有 Android 实现、明确降级策略或验收豁免，不能静默失败。**
6. **在 Debug APK、真机测试通过前，不进行 Release 宣称或正式发布。**

### 1.2 完成标准

只有同时满足以下条件，才称为 v2 完整迁移：

- 桌面版现有功能清单逐项有对应实现和测试记录。
- Android 可以读写 PNG/V3、PNG/V2、WebP、JSON 卡片，保存后酒馆仍能识别。
- 独立世界书和内嵌世界书可完整读取、编辑、导入、导出、恢复快照。
- 配置、标签、分类、正则、聊天、推送、查重、扫描、回收站均有明确行为。
- SAF 首次授权、持久授权、撤权、选错目录、目录重命名等场景可恢复。
- Android 原生插件、JS 桥接、Vue 页面、业务纯函数均有自动化或真机验收。
- 桌面端 `npm test`、`npm run build:web`、启动冒烟测试通过。
- Android `assembleDebug`、真机冒烟、Release 签名构建通过。

---

## 2. 功能对齐基线

以桌面端 `preload.js` 暴露的能力和 `js/composables/` 实际使用情况为完整基线，建立迁移矩阵：

| 功能域 | 桌面版基线 | Android v2 要求 | 当前状态 |
|---|---|---|---|
| 卡片扫描 | PNG/WebP/JSON/JPEG 解析、分类、排序、增量加载 | SAF 递归扫描、同等字段、分页/增量 | ✅ 完成 |
| 卡片查看 | 基础信息、Token、世界书、正则、状态栏 | 移动端页面等价呈现 | ✅ 完成 |
| 卡片保存 | JSON 保存、PNG 内嵌数据写回、快照 | 原格式写回、原子/安全保存 | ✅ 完成 |
| 卡片导入 | 文件选择、拖拽、批量、格式校验、去重 | ACTION_OPEN_DOCUMENT 多选、复制入 SAF 库 | ✅ 完成 |
| 卡片导出 | 单卡整合包、批量打包、系统保存/分享 | ZIP、系统分享/保存到指定目录 | ✅ 完成 |
| 换卡图 | sharp 转 PNG、保留卡数据、校验 | Android Bitmap/PNG 重编码、保留元数据 | ✅ 完成 |
| 世界书 | 独立书库、条目 IDE、导入导出、快照 | SAF 完整读写和同等字段 | ✅ 完成 |
| 内嵌世界书 | 增删改、排序、触发词、启用态 | 与桌面字段语义一致 | ✅ 完成 |
| 正则脚本 | 查看、编辑、状态栏预览 | 等价编辑和安全预览 | ✅ 完成 |
| 聊天测卡 | OpenAI/Anthropic、模型、渲染/代码模式 | 原生网络转发、超时、错误透传 | ✅ 完成 |
| API 配置 | 加密、统一持久化 | Android Keystore 加密 | ✅ 完成 |
| 标签/分组 | 物理分组、标签落盘、批量操作 | SAF 物理目录和统一配置 | ✅ 完成 |
| 查重 | 文件状态、差异、回收站清洗 | SAF 状态和软删除 | ✅ 完成 |
| 全盘扫描 | 盘符/路径扫描、真伪鉴定、收编 | SAF 目录选择、递归扫描、导入 | ✅ 完成 |
| 快照 | 自动/手动/恢复/清理/孤儿清理 | 库内 `.bak_history` 快照 | ✅ 完成 |
| 推送酒馆 | HTTP multipart、本地目录推送 | HTTP 推送 + SAF 本地推送 | ✅ 完成 |
| OTA | Electron updater 静默更新 | APK 下载、校验、系统安装器 | ✅ 完成 |
| 回收站 | 全局回收站、恢复/打开目录 | `.trash` 在文件管理器中打开 | ✅ 完成 |
| 主题/UI | 深浅主题、桌面响应式 | Vant + 移动手势 + 安全区 | ✅ 完成 |
| 文件定位 | 系统文件管理器定位卡片 | `Intent.ACTION_VIEW` 打开父目录 | ✅ v2.1 新增 |
| 文件打开 | 系统默认应用打开文件 | MIME 类型识别 + 目录浏览 | ✅ v2.1 新增 |
| 酒馆路径 | 智能嗅探 + 指纹验证 | 记住上次选择 + 持久化 URI | ✅ v2.1 新增 |

---

## 3. 目标架构

### 3.1 目录职责

```text
js/
├─ core/                       # 与平台无关的纯业务核心
│  ├─ card/                    # 卡片规范化、校验、PNG 元数据编解码
│  ├─ worldbook/               # 世界书规范化和 V2/V3 字段转换
│  ├─ snapshot/                # 哈希、快照命名、保留策略
│  ├─ export/                  # ZIP/整合包清单和序列化
│  └─ contracts/               # API、文件对象、错误码契约
├─ bridge/
│  ├─ api.js                   # 唯一运行时入口
│  ├─ contract.js              # 方法、参数、返回值约束
│  ├─ electron.js              # Electron 适配器
│  └─ android.js               # Android 适配器
├─ composables/                # 共享业务逻辑，优先复用
├─ components/                 # 桌面 UI
└─ mobile/                     # Android 信息架构和交互 UI

android/app/src/main/java/.../
├─ LibraryFsPlugin.java        # SAF 库树文件操作
├─ AppConfigPlugin.java        # 配置和安全存储
├─ PngCardPlugin.java          # PNG 元数据读写/原子替换
├─ ArchivePlugin.java          # ZIP 打包解包
├─ HttpPlugin.java             # OkHttp 网络转发
├─ UpdatePlugin.java           # APK 下载、校验和安装
└─ SharePlugin.java            # 系统分享/保存
```

### 3.2 业务层规则

- Vue 页面只能使用 `api` 或 composables。
- `androidImpl` 不复制桌面业务规则，只负责路径转换、参数转换和原生调用。
- PNG 解析/写回、世界书转换、快照命名等无平台依赖逻辑放入 `js/core/`，桌面和 Android 共用。
- 所有桥接方法返回统一结果，不抛出用户可见的未处理异常：

```js
{ success: true, data: ..., error: null, code: null }
{ success: false, data: null, error: '用户可读错误', code: 'PERMISSION_REVOKED' }
```

- 错误码至少包括：`CANCELLED`、`PERMISSION_REVOKED`、`NOT_FOUND`、`INVALID_CARD`、`INVALID_WORLD_BOOK`、`CONFLICT`、`UNSUPPORTED`、`IO_ERROR`、`NETWORK_ERROR`、`CHECKSUM_MISMATCH`。

---

## 4. 文件和数据迁移方案

### 4.1 SAF 路径模型

Android 不暴露真实绝对路径，统一使用库根相对路径：

```text
逻辑路径：/library/幻想组/星野.png
SAF 路径：幻想组/星野.png
授权根：content://...
```

要求：

- 所有路径先经过 `toRelativePath()`。
- 禁止 `..`、空段、库根外路径和 URI 拼接越权。
- 配置中持久化树 URI；启动时验证授权仍有效。
- 选错目录时显示目录内容预览，并允许重新选择。
- 撤销权限时返回 `PERMISSION_REVOKED`，不能显示空库掩盖问题。

### 4.2 卡片格式

必须完整支持：

- PNG：`tEXt`、`zTXt`、`iTXt` 中的 `chara` / `ccv3`。
- JSON：V1 扁平、V2、V3，兼容脏数据和对象字典 entries。
- WebP：读取现有元数据；保存时保留 WebP 或明确转换为 PNG。
- JPEG：按现有桌面行为读取/导入；若不能保留卡片元数据必须明确提示。

统一流程：

```text
读取原文件
  → 格式识别
  → 提取卡片 JSON
  → normalizeCardData
  → 编辑内存副本
  → validateCardData
  → 按原格式 encode
  → 写临时文件
  → 校验临时文件
  → 替换原文件
  → 写入快照/配置
```

### 4.3 PNG 安全写回

这是 v2 的 P0 阻断项，必须单独实现 `PngCardPlugin` 或等价纯 JS + 原生文件写入能力：

1. 读取 PNG 签名和 chunk 结构。
2. 删除旧的 `chara`/`ccv3` 文本块，保留图像及其他合法 chunk。
3. 生成 UTF-8 JSON，按酒馆兼容格式 Base64 编码。
4. 写入新的 `tEXt` 或 `iTXt` chunk，并正确计算 CRC32。
5. 先写同目录临时文件。
6. 重新读取临时文件，验证 PNG 签名、chunk 边界和卡片 JSON 可解析。
7. 使用 SAF 可行的替换策略完成覆盖；无法原子替换时保留备份并提示。
8. 保存失败不得删除或覆盖原文件。

禁止：

- 对 `.png` 调用 `writeText()`。
- 只更新内存中的 `card.data`。
- 未校验就直接覆盖原卡。

### 4.4 配置和密钥

- 普通配置：App 私有目录 JSON，采用临时文件 + 校验 + 替换。
- API Key：Android Keystore 加密后保存，不进入普通 `localStorage`。
- 迁移旧明文 Key 时只在首次启动转换一次，转换成功后删除旧值。
- 配置写入必须带版本号和迁移器：`schemaVersion: 1/2/...`。
- 主题、标签、分类、卡片 overlay、API 配置统一由 `app_config.json` 管理。

### 4.5 快照和回收站

推荐使用 App 私有目录保存快照和索引，避免污染用户卡库：

```text
App 私有目录/
├─ backups/cards/<hash>/<timestamp>.bak
├─ backups/worldbooks/<hash>/<timestamp>.bak
├─ trash/<uuid>/原文件名
└─ app_config.json
```

每个快照记录：

- 原逻辑路径
- 原文件格式
- 文件大小
- SHA-256
- 创建时间
- 触发原因
- 应用版本

恢复规则：恢复前先备份当前文件；恢复后重新解析并验证；失败自动回滚。

---

## 5. 桥接 API v2

### 5.1 文件能力

统一收口以下方法，并让 Electron/Android 均实现：

- `libraryInfo()`
- `selectFolder()`
- `rescanLibrary()`
- `readBuffer()`
- `readText()`
- `writeBuffer()`
- `writeText()`
- `saveCard()`
- `replaceCardImage()`
- `deleteFile()`
- `moveCardToGroup()`
- `createGroupFolder()`
- `renameGroupFolder()`
- `importExternalCards()`
- `exportPackage()`
- `exportBatchPackage()`
- `shareFile()`

`saveCard()` 不再只接收 JSON，而应至少携带：

```js
{
  path,
  originalFormat: 'png' | 'webp' | 'json',
  cardData,
  expectedHash,
  createSnapshot: true
}
```

### 5.2 世界书能力

Android 必须实现：

- 扫描合法独立世界书。
- 读取对象字典和数组两种 entries。
- 保存 `comment/name`、`key/keysecondary`、`order/insertion_order` 等字段。
- 创建、重命名、删除、导入、批量导出。
- 条目快照、恢复和孤儿清理。
- JSONL 导入和 URL 导入；网络失败返回可读错误。

### 5.3 网络能力

`HttpPlugin` 必须支持：

- GET、POST、multipart。
- OpenAI 和 Anthropic 请求头差异。
- 连接超时、读取超时、取消请求。
- 非 2xx 状态码原样透传状态和安全截断的响应片段。
- 不在日志中记录 API Key、Authorization 和完整请求正文。

### 5.4 OTA 能力

流程必须是：

```text
检查更新 → 解析版本/下载地址
→ HTTPS 下载 → SHA-256/文件大小校验
→ 下载到 App 缓存 → FileProvider 授权
→ 系统安装器 → 安装失败可恢复
```

- `checkUpdate()` 必须保存并返回完整 `updateInfo`。
- `downloadUpdate(url)` 显式接收 URL，不依赖隐式 `_updateInfo` 状态。
- 只允许 HTTPS，调试环境才允许用户明确配置 HTTP。
- APK 包名、签名证书和版本号必须校验。
- Android 8+ 处理“允许安装未知来源”权限引导。

---

## 6. UI 与交互迁移

### 6.1 信息架构

采用**三 Tab + 详情内测卡**，与当前实现一致，避免重复入口：

1. 卡片库：搜索、筛选、分组、网格/列表、批量操作。
2. 世界书：独立世界书列表、条目 IDE、导入导出。
3. 设置：库授权、API、安全、主题、更新、关于。
4. 卡片详情：设定、世界书、正则、测卡四段 Tab。

如后续产品要求独立聊天入口，再新增第四 Tab，不在 v2 中同时保留两个入口。

### 6.2 交互等价规则

| 桌面交互 | Android 交互 |
|---|---|
| 右键菜单 | 长按 BottomSheet |
| Hover 提示 | 点击说明/帮助图标 |
| 拖拽导入 | 系统文件选择器多选 |
| 拖拽分组 | 长按后选择目标分组 |
| 多选 Ctrl/Shift | 复选框 + 全选 + 批量工具栏 |
| 全屏编辑器 | 页面式编辑 + 自动保存 |
| 确认弹窗 | Vant Dialog，禁止使用系统 prompt 作为唯一方案 |
| 文件夹打开 | 系统文件管理器或分享面板 |

### 6.3 移动端质量要求

- 所有点击目标不小于 48dp。
- 适配刘海屏、导航栏和键盘顶起。
- 列表必须虚拟化或分段渲染，避免千卡 DOM 一次性创建。
- 编辑字段支持未保存提示、自动保存状态、冲突提示。
- 长文本、HTML、状态栏预览必须继续使用安全转义和 DOMPurify。
- 深浅主题、字体缩放、横竖屏至少完成竖屏验收。

---

## 7. 实施阶段和出口条件

### P0：基线冻结与契约化

工作：

- 固定桌面版 v1.9.0 行为基线。
- 列出 `preload.js` 全部 API 和实际调用点。
- 建立 `bridge/contract.js`、错误码、文件对象模型。
- 将共享解析/校验逻辑移入 `js/core/`。

出口：

- API 清单无遗漏。
- Electron 适配器行为不变。
- 单元测试覆盖正常、空值、脏数据和错误返回。

### P1：文件安全层

工作：

- 实现 Android Buffer/Text 读写。
- 实现 PNG 元数据安全写回。
- 实现 WebP/JSON 保存策略。
- 加入 hash、冲突检测、备份和恢复。

出口：

- PNG 编辑前后图片可显示。
- 酒馆可重新识别 V2/V3 数据。
- 保存失败原文件不变。
- 连续保存、断电模拟、撤权场景有测试。

### P2：卡片核心闭环

工作：

- 扫描、解析、导入、详情、编辑、删除、分组、标签、导出。
- 完成网格/列表、批量选择、搜索和 Token 展示。

出口：

- PNG/WebP/JSON 混合库完整跑通。
- 重启后路径、标签、分类和编辑内容不丢失。

### P3：世界书和正则闭环

工作：

- 独立世界书完整 CRUD。
- 内嵌世界书字段兼容。
- 正则编辑、预览、导入导出。
- 世界书快照和批量导出。

出口：

- 桌面导出的世界书 Android 可读写。
- Android 导出的文件桌面和酒馆可读取。

### P4：聊天、推送、查重和扫描

工作：

- OpenAI/Anthropic 双协议。
- 模型列表、网络错误和取消。
- HTTP 推送、本地 SAF 推送。
- 查重、差异、扫描、收编和软回收站。

出口：

- 无 CORS、无明文密钥日志、无超时假死。
- 大库扫描可观察进度，可取消，可恢复。

### P5：OTA、安全和发布

工作：

- Keystore、安全配置迁移。
- APK 下载校验和安装。
- Release 签名、版本 code、更新策略。
- 崩溃日志和用户可读错误。

出口：

- Release APK 可安装、升级、回退策略明确。
- 无调试地址、测试密钥和调试日志进入发布包。

### P6：双端回归与验收

工作：

- 桌面端全量回归。
- Android 多设备、权限和文件管理器测试。
- 形成测试报告和已知限制清单。

出口：

- 全部 P0/P1 缺陷关闭。
- P2 缺陷有明确不影响发布的说明。

---

## 8. 测试方案

### 8.1 自动化测试

新增测试类别：

- `test/bridgeContract.test.mjs`：Electron/Android 返回结构一致。
- `test/cardRoundtrip.test.mjs`：V1/V2/V3、PNG/WebP/JSON 往返。
- `test/pngWriter.test.mjs`：chunk、CRC、压缩文本和图像保留。
- `test/worldbookRoundtrip.test.mjs`：数组/字典 entries 和字段映射。
- `test/snapshotPolicy.test.mjs`：哈希、恢复、孤儿和保留策略。
- `test/pathSecurity.test.mjs`：越权、特殊字符和 URI 路径。
- `test/updateFlow.test.mjs`：版本、地址、校验和错误链路。

### 8.2 Android 真机矩阵

至少覆盖：

- Android 10、12、14、15/16。
- 低内存设备和大屏设备。
- Google 文件选择器、国产文件管理器。
- 首次授权、重启、撤权、目录改名、只读目录。
- 100 张、1000 张、5000 张卡片库。
- PNG、WebP、JSON 混合文件和异常文件。

### 8.3 发布前冒烟清单

1. 安装并首次启动。
2. 选择库目录并扫描。
3. 导入 PNG、WebP、JSON。
4. 打开详情并编辑名称、描述、世界书和正则。
5. 保存 PNG，验证图片和卡片数据仍有效。
6. 重启 App，验证数据、主题和授权。
7. 删除、恢复回收站文件。
8. 创建、编辑、导出独立世界书。
9. 聊天请求成功、超时、错误和取消。
10. 扫描外部目录并收编卡片。
11. 查重和快照恢复。
12. 检查更新、下载校验、拉起安装器。
13. 桌面端启动、扫描、编辑、导出回归。

---

## 9. 当前工程需要立即调整的事项

按阻断级别排列：

### P0 阻断

- 修复 `js/bridge/android.js` 的 PNG `saveCard()`，禁止 `writeText()` 覆盖 PNG。
- 完成 Android PNG 写回和往返校验。
- 处理 Gradle 分发包锁定，确保 `assembleDebug` 能成功执行。
- 建立桌面/Android API 契约，消除静默 stub。

### P1 高优先级

- 独立世界书完整 SAF CRUD。
- Android Keystore 安全保存 API Key。
- OTA 检查结果通过显式参数传给下载流程。
- 卡片详情路由统一，避免 `/card/:id` 与 query `p` 混用。
- 实现快照、冲突检测和恢复前备份。

### P2 普通优先级

- 完成换卡图、ZIP、系统分享。
- 完成本地目录推送的 SAF 授权流程。
- 大库虚拟列表和扫描取消。
- 更新交接文档、README 和迁移方案的版本/数量描述。

---

## 10. 构建和验收命令

在 `JSKZX - app` 目录执行：

```powershell
npm test
npm run build:web
npm run sync:android
npm run build:android
```

Android 构建通过后，再执行：

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat assembleDebug
.\gradlew.bat assembleRelease
```

桌面端回归：

```powershell
npm start
```

发布前禁止仅以 `vite build` 作为验收依据；必须启动 Electron，并安装 APK 在真实设备上完成冒烟测试。

---

## 11. 最终交付物

- `app-debug.apk`：内部测试包。
- `app-release.apk`：签名发布包。
- Android 原生插件源码和注册清单。
- Bridge API 契约文档。
- 卡片/世界书往返兼容性测试报告。
- 真机测试报告和已知限制清单。
- 更新说明、安装说明、权限说明和数据备份说明。
- 桌面端回归测试记录。

---

## 12. v2 验收签字标准

以下任何一项不满足，都只能称为“迁移开发版”：

- PNG 保存后文件损坏或酒馆无法读取。
- Android 端核心功能依赖未提示的 stub。
- 用户撤销 SAF 权限后 App 误显示空库。
- API Key 明文写入普通配置或日志。
- OTA 下载未经校验即可安装。
- 世界书字段在桌面、Android、酒馆之间发生丢失。
- 桌面端原有功能因共享代码改造发生回归。
- 没有成功生成并安装真实 Android APK。

**结论：v2 的目标不是“能打开 App”，而是“Android 成为桌面版的另一种运行壳，核心数据和功能可以双向无损流转”。**



---

## 13. v2.1 当前进度（2026-08-27）

### 13.1 已完成阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | Gradle 构建、PNG saveCard、contract.js、路由修复 | 完成 |
| P1 | OTA checkUpdate 修复、世界书 SAF CRUD（4 方法）、Android Keystore 加密 | 完成 |
| P2 | 网络、推送、replaceCardImage、duplicateFile、exportWorldbooksBatch | 完成 |
| P3 | 卡片快照（6 方法）、世界书快照（3 方法） | 完成 |
| P4 | 4 个不支持桩替换为 Android 原生方案 | 本次完成 |

### 13.2 P4 详情：桩替换

| 方法 | 旧行为 | 新实现 |
|------|--------|--------|
| showItemInFolder | [移动端] 不支持 | LibraryFs.openFileInFolder -> Intent.ACTION_VIEW 打开父目录 |
| openPath | [移动端] 不支持 | LibraryFs.openFile -> MIME 类型识别 + 目录浏览 |
| openGlobalTrash | 手动管理 _trash | LibraryFs.openTrash -> 在文件管理器中打开 .trash |
| autoDetectTavernPath | 酒馆目录推送未接入 | 记住机制：selectGenericFolder 后持久化 URI |

**Java 插件新增方法：**
- LibraryFsPlugin.openFileInFolder - 定位文件所在目录
- LibraryFsPlugin.openFile - 系统默认应用打开(文件/目录自动识别)
- LibraryFsPlugin.openTrash - 打开库内 .trash 回收站
- AppConfigPlugin.saveTavernPath/loadTavernPath/clearTavernPath - 酒馆路径持久化

**附带修复：**
- pushToSillyTavernDir 签名修正为 (paths, rootPath)，与桌面 preload 一致
- selectGenericFolder 返回值从对象改为纯字符串

### 13.3 待完成阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P5 | OTA 安全加固、Release 签名、崩溃日志 | 待完成 |
| P6 | 双端回归、真机测试 | 待完成 |

### 13.4 构建验证

```
npm test          -> 46/46 通过
npm run build:web -> 成功
npm run build:android -> BUILD SUCCESSFUL
```

### 13.5 下一步

1. 打包 Debug APK 安装到真机
2. 逐项跑发布前冒烟清单
3. P5：Release 签名 + OTA 安全
4. P6：桌面端回归 + 真机测试报告
