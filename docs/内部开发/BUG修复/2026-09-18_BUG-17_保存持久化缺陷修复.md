# BUG-17 保存/标签/持久化缺陷检查与修复日志

> 日期：2026-09-17 · 分支：main-v1.10（v1.10.24 + 两万卡专项改动）
> 触发：保存功能 / 标签功能 / 固化与落盘 专项检查
> 结论前置：**卡片文件保存与标签赋予功能均未失效**（真实写盘正常）；确认并修复了 **3 个"不固化/不落盘"级别缺陷**，均与两万卡专项的 SQLite 元数据库 / JSON 分片缓存有关。

---

## 一、检查范围与方法

| 项 | 方法 |
|---|---|
| 保存链路 | 代码走查：详情页 `save()` → `doSave()` → `saveCardData()` → `window.electronAPI.saveCard` → 原生 `_saveCardPng`/writeText 真实写盘 |
| 标签四路 | `addTag/removeTag`（详情页）、`onBatchTagClose`（批量）、`onBatchAiTag`（AI 打标）、`autoTagImportedCards`（导入打标） |
| 固化/落盘 | JSON 分片缓存（B1）、SQLite 元数据库（P2）与"编辑/删除/移动/导入"四条变更路径的同步关系 |

---

## 二、检查结论

### 1）卡片保存功能：未失效 ✅
- 详情页保存 → `saveCardData` → `saveCard` 桥 → 原生写盘（`_saveCardPng` tmp 替换 / `_saveCardWebp` 显式拒绝并提示）
- 失败路径有 toast 反馈（`showToast(res.error || '保存失败')`）
- WebP 卡截图提示"请先在桌面端转为 PNG"（拦截在前，不破坏数据）

### 2）标签赋予功能：未失效 ✅
- 详情页增删改标签：修改编辑副本 `data.tags` → 保存时整体序列化写盘 ✅
- 批量标签 / AI 打标 / 导入自动打标：`loadCardFullData` 加载全量 → 改 `dd.tags` → `saveCard` 写盘 → `syncCardLightFields` 回写内存+缓存 ✅
- 三条批量标签路径都真实落盘卡片文件（非仅内存）

### 3）确认的缺陷（不固化/不落盘）🔴

| # | 缺陷 | 等级 | 表现 |
|---|---|---|---|
| BUG-17a | 编辑保存后 **SQLite 元数据不更新** | 高 | 改名/改标签/改描述并保存后，`persistMetas` 从未在保存路径调用（只在 reconcile/loadLibrary 调）。重启走 DB restore（新架构优先路径）→ **显示旧标签/旧名称数秒~数十秒**，直至后台 reconcile 完成 |
| BUG-17b | **删除卡后缓存与 DB 不清理** | 高 | `removeCard` 只 splice 内存数组，不删 JSON 分片缓存条目、不删 SQLite 行。`INSERT OR REPLACE` 只覆盖不删除 → 已删卡**永久残留 DB** → 每次重启 DB restore 出现**幽灵卡**，reconcile 移除后又因 `persistMetas`(增量 upsert) 不清残行 → **循环复现** |
| BUG-17c | 移动分组后旧 path 残留 DB | 中 | `moveCardToGroup` 只改内存 path，SQLite 旧 path 行不删 → 重启可能同时出现新旧两条（幽灵旧条目） |

---

## 三、修复方案（已落地）

| 缺陷 | 修复 | 文件 |
|---|---|---|
| 17a | `syncCardLightFields` 末尾补 `persistMetas([light])`（单卡即时同步 SQLite，fire-and-forget） | useMobileLibrary.js |
| 17b | `removeCard` 补 ① evictSamePathCache 清理分片缓存条目 + markCacheDirty ② `removeMetaCards([path])` 删 DB 行 | useMobileLibrary.js |
| 17c | `moveCardToGroup` 成功后 `removeMetaCards([oldPath])` | useMobileLibrary.js |
| 17a/b 兜底 | reconcile/loadLibrary 完成后 `persistMetas(staging)` → **`syncMetas(staging)`**（原生 `syncCards`：事务内 DELETE all + 批量 INSERT，全量对齐，顺带清理外部工具删文件导致的幽灵行） | useMobileLibrary.js / sqliteMeta.js |
| 17b 补强 | 导入新卡 `appendImportedCards` 成功后 `persistMetas(newItems)`（免等下次 reconcile） | useMobileLibrary.js |

**新增接口**：
- `SqliteMetaPlugin.deleteCards(paths)`：分批 DELETE（每批 500，规避 SQLite 变量上限；`SQLiteStatement.executeUpdateDelete` 统计删除数）
- `SqliteMetaPlugin.syncCards(cards)`：事务内 DELETE all + 批量 INSERT（全量重建）
- JS 桥：`metaDeleteCards` / `metaSyncCards`；数据层：`removeMetaCards` / `syncMetas`

---

## 四、验证

- `npm test`：135/135 通过（唯一失败项为仓库既有真机 adb 脚本 `test-p0-validation.mjs`，与本轮无关）
- `gradlew :app:compileDebugJavaWithJavac`：BUILD SUCCESSFUL（修复过程中排除了 2 个编译问题：queryCards 误删闭合大括号、SQLiteDatabase.changes() 在较新 SDK 不可用）
- `gradlew :app:packageDebug` + `npm run build:android`：BUILD SUCCESSFUL，APK 含新 `SqliteMetaPlugin.class`
- 模拟器行为验证：待真机/模拟器重跑（清数据 → 建库 → 改标签/改名 → 杀进程重启 → 验证 DB restore 显示新值；删除卡 → 重启 → 验证无幽灵卡）

---

## 五、检查中排除/记录的低风险项（不修，供参考）

| 项 | 说明 | 判定 |
|---|---|---|
| 缓存 2s 防抖窗口 | `scheduleCacheFlush` 2 秒防抖内强杀进程 → 轻量缓存/签名文件可能未写全 | 卡片文件已真实落盘，仅缓存刷新延迟；重启 reconcile 自愈。保持 |
| 签名节流 1.5s | `.jskzx_sigs.json` 节流写，强杀丢签名 → 下次查重重算 | 功能不丢，仅多算一次。保持 |
| persistMetas 20K 单卡失败整批回滚 | upsert/sync 事务内一张坏卡回滚整批 → DB 陈旧，reconcile 自愈 | SQLite WAL 保证不损坏；降级回退 JSON 缓存。保持 |
| 保存后 `_mtime/_size` 不刷新 | 编辑保存后轻量条目 mtime 为旧值直至 reconcile，缓存指纹沿用旧 mtime | 短窗口一致性妥协；reconcile 自愈。保持 |

---

## 六、文件变更清单

| 文件 | 变更 |
|---|---|
| `SqliteMetaPlugin.java` | +`deleteCards` / +`syncCards`；修复 queryCards 闭合大括号 |
| `android.js` | +`metaDeleteCards` / +`metaSyncCards` |
| `sqliteMeta.js` | +`removeMetaCards` / +`syncMetas` |
| `useMobileLibrary.js` | `syncCardLightFields` 补 persistMetas；`removeCard` 补缓存+DB清理；`moveCardToGroup` 补 DB清理；`appendImportedCards` 补 persistMetas；reconcile/loadLibrary 改 syncMetas |

> 以上改动尚未提交（工作区）。真机复验通过后可随 v1.10.25 一起合入。