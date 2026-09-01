# 移动版修复方案（v1.10.x）

> 日期：2026-09-01
> 范围：**仅移动版**（Android / Capacitor 8.5 + Vant 4），跳过桌面版。
> 基线：分支 `main-v1.10` @ `22e4469`，v1.10.0 已发布 Latest。
> 信息源：全面审计（5 个子任务）+ 静态体检 `audit-report.md` + 移动端专项审计（子任务 f117aada）+ `docs/mobile-*.md` 三轮迁移文档 + 当前源码逐项复验。

---

## 一、结论速览

| 维度 | 状态 |
|---|---|
| 严重级问题（P0/P1） | **无**。审计共 143 项，全部 P2（非阻塞） |
| 移动端静态体检 `scripts/check-mobile.mjs` | ✅ 通过（18 个 .vue，0 命中） |
| 桥接层覆盖 | ✅ 基本完整（72 API 仅缺过 `writeText`，已补） |
| 上轮已修的核心移动端 bug | 见 §二（均已复验，勿重复） |
| 剩余待修项 | 1 项 P1（潜在健壮性）+ 4 项 P2（清理/一致性），见 §三 |

---

## 二、上一轮已修复（复验通过，勿重复）

以下问题在提交 `a2bda4f` / `9612232` / `017ddb9` / `22e4469` 中已修，当前源码已确认无残留：

| # | 原问题 | 修复位置/方式 | 复验结果 |
|---|---|---|---|
| 1 | `window.prompt` 在 WebView 静默返回 null，导致 8 个入口（重命名分组/新建分组/重命名卡/移动新建分组/URL 导入/推送目标命名/添加标签/新建复制预设）点击无效 | 统一替换为 `van-dialog` + `van-field` 的 Promise 式输入弹窗（`CardLibraryView` / `CardDetailView` / `PresetsView`） | `js/mobile` 内 `window.prompt/alert/confirm` 实际调用 = **0** |
| 2 | `writeText` 桥接缺失，`.jskzx_cache.json` 内嵌缓存写回静默失败，二次启动「秒开」从未生效 | `android.js` 补 `writeText(filePath, content)`（走 `LibraryFs.writeText`） | `android.js:366` 已实现，`useMobileLibrary.js:69` 已连通 |
| 3 | SettingsView API Key 明文读写，与详情页加密链路不一致（设置页会显示密文/覆盖为明文） | 改为统一走 `saveApiKey/loadApiKey`（Keystore 加密） | `SettingsView.vue:293/336` 已用加密 helper |
| 4 | WebP 卡片「保存/编辑」未提前拦截，保存才报错 | 编辑保存提前拦截 + 提示（`CardDetailView` +5 行） | commit `22e4469` 已落地 |
| 5 | 详情页缺 5 字段编辑 / 世界书条目排序 / Raw JSON 页签 | 补 5 字段高级设定 + 条目上移下移 + Raw JSON 只读页签 | commit `017ddb9` 已落地 |
| 6 | 下拉刷新与触底加载互斥 / OTA 默认地址 / 顶部导航收敛「更多」菜单 | 相关逻辑重写 | commit `9612232` |
| 7 | API 协议头 / 空 Key 拦截 / 标签精确匹配 | 逆向对齐 1.10.0 release | commit `a2bda4f` |

---

## 三、剩余待修项（当前仍存在）

### P1（健壮性，建议本轮修）

**3.1 `showMessage` 降级为 `window.alert`，WebView 中静默失败**
- 位置：`js/bridge/android.js:561-563`
- 现状：`showMessage(options)` 内部 `setTimeout(() => window.alert && window.alert(text), 0)`。Android WebView 未实现 `onJsAlert` 时 alert 不弹窗。
- 影响：当前移动端 UI 全部走 Vant（未直接调用 showMessage），故无现网 bug；但桌面 composable `useCardCrud.js:521/546` 依赖 `showMessage`，一旦迁移到移动端即静默失败——属「定时炸弹」。
- 修复方案（三选一，按成本递增）：
  1. （最小）`showMessage` 改为返回结构化结果，由调用方决定提示；移动端 composable 一律改走现有 Vant Toast / 自建确认弹窗（与坑 #2 对齐）。
  2. 在移动端自建 `confirmDialog/nativeAlert` 轻量弹窗封装（`PromptModal.vue` 模式），`showMessage` 内部派发。
  3. Java 侧 `HttpPlugin`/新增原生弹窗插件对接。
- 工作量：约 0.5~1 小时（方案 1/2）。

### P2（清理 / 一致性，低风险）

**3.2 `isStubError` 死代码 + `NOT_IMPLEMENTED` 从未使用**
- 位置：`js/bridge/android.js:51-53`
- 现状：`isStubError(name)` 定义后从未被调用；`ErrorCode.NOT_IMPLEMENTED` 无任何方法真正返回。
- 修复：删除死代码，或在未来「暂不支持」分支统一接入该辅助函数，保持语义一致。

**3.3 `contract.js` 注释/清单与实现脱节**
- 位置：`js/bridge/contract.js`（多处 JSDoc 仍标「移动端暂不支持」，如 :106/:109/:142/:152/:170/:178-190/:212/:251-271 等）
- 现状：这些方法在 `android.js` 已全部实现（快照/查重/URL 下载/推送/加密/导入导出等），文档过时；`validateContract` 的 required 列表也漏掉 `writeText/readTextBatch/duplicateFile/fetchModels` 等已实现方法。
- 修复：批量清理 JSDoc 标注，补全 required 列表。纯文档，0.5 小时。

**3.4 `console.error` 兜底提示完整性**
- 位置：`js/mobile/components/DedupeModal.vue:353`、`js/mobile/components/GraphModal.vue:260`
- 现状：均为 catch 块内 `console.error`。GraphModal 已有 `showToast('图谱构建失败…')` 兜底（好）；DedupeModal 需确认查重失败时是否给用户 Toast（否则用户无感知）。
- 修复：DedupeModal 补用户级 Toast 提示。

**3.5 LM Studio 本地默认 API 地址（可选）**
- 位置：`SettingsView.vue:290`、`CardDetailView.vue:1317/1389`
- 现状：默认 `http://127.0.0.1:1234/v1/chat/completions`，用户可在输入框改 endpoint，非阻塞。
- 修复（可选）：如需支持第三方中转默认，增加可配置默认地址项。

---

## 四、确认无需处理（误报澄清）

审计报告 `audit-report.md` 中以下条目经源码复验为**误报/口径差异**，不纳入修复：

| 报告条目 | 澄清 |
|---|---|
| 「桥接-IPC差距」约 50 项（`file:saveCard`/`sys:*`/`dialog:*`/`get-windows-drives` 等「android.js 无实现」） | 命名口径差异：移动端用 `api.*` 语义映射（如 `saveCard`/`openExternal` 已实现），或桌面专属能力（系统文件管理器/Windows 盘符）移动端天然不需要。专项审计确认桥接层 72 API 基本完整。 |
| 「功能缺失-快照入口」（移动端卡片库无快照入口） | 移动端 `CardDetailView.vue:389` 与 `WorldbookView.vue:171` 均已接入 `SnapshotModal`，功能不缺。 |
| 「桥接-占位标记 android.js:52」 | 即 §3.2 的 `isStubError` 死代码，归入 P2 清理。 |

---

## 五、验证与发布（执行顺序）

1. 按 §三 逐项修复（P1 → P2）。
2. 静态体检：`node scripts/check-mobile.mjs`（当前 ✅）。
3. 构建：`npx vite build`（产出 `web/`）+ Android 打包。
4. 真机冒烟：重点验证 输入弹窗（重命名/新建分组/新建预设）、API Key 加密保存、WebP 拦截、缓存二次启动。
5. 版本号升 **1.10.1**，同步 `README.md` / `RELEASE_NOTES.md` / `CHANGELOG.md`。
6. OTA 发布（移动端走 GitHub Releases `releases/latest`）。

### ⚠️ 发布卡点（需用户提供，非代码问题）
- **keystore 丢失**：`keystore.properties` / `.jks` / `.keystore` 全盘未找到，签名版 APK 与老用户 OTA 覆盖受影响。
- **无上传凭据**：本机无 `gh`、无 `GH_TOKEN`/`GITHUB_TOKEN`，发 Release 需用户提供 PAT 或安装 gh。

---

## 六、附：当前 Git 状态

```
分支 main-v1.10，HEAD 22e4469，领先远端 jskapp/main-v1.10 4 个提交，工作区干净。
待办：① keystore ② 上传凭据 ③ 临时文件 scripts/_tmp_audit.mjs（建议清理）。
```
