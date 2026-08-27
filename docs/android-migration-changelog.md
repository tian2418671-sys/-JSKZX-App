# Android 迁移变更日志

> 基线：桌面版 v1.9.0 → Android (Capacitor 8.5)
> 日期：2026-08-27

---

## P4：桩替换（2026-08-27）

### 新增 Java 插件方法

**LibraryFsPlugin.java**
- `openFileInFolder` — 在系统文件管理器中定位文件，通过 `Intent.ACTION_VIEW` 打开父目录
- `openFile` — 用系统默认应用打开文件/目录，自动识别 MIME 类型和目录
- `openTrash` — 打开库内 `.trash` 回收站（不存在则自动创建）

**AppConfigPlugin.java**
- `saveTavernPath` — 持久化用户选择的酒馆目录 URI + 标题
- `loadTavernPath` — 读取已保存的酒馆路径（含 `hasSaved` 标志）
- `clearTavernPath` — 清除已保存路径

### 替换的桩方法

| 方法 | 旧行为 | 新实现 |
|------|--------|--------|
| `showItemInFolder` | 返回 `[移动端] 不支持` | `LibraryFs.openFileInFolder` 在文件管理器中定位 |
| `openPath` | 返回 `[移动端] 不支持` | `LibraryFs.openFile` MIME 识别 + 目录浏览 |
| `openGlobalTrash` | 返回 `手动管理 _trash` | `LibraryFs.openTrash` 打开 .trash |
| `autoDetectTavernPath` | 返回 `酒馆目录推送未接入` | 记住机制：selectGenericFolder 后自动保存，下次返回 |

### 附带修复

- `pushToSillyTavernDir` 签名修正：`({filePath, tavernPath})` → `(paths, rootPath)`，与桌面 preload 一致
- `selectGenericFolder` 返回值修正：对象 → 纯字符串（与桌面 `return filePaths[0]` 对齐）

---

## P3：快照（2026-08-27）

### 卡片快照（6 方法）
- `updateSnapshotConfig` — AppConfig 持久化
- `createManualSnapshot` — readBuffer → writeBuffer 到 .bak_history
- `listCardSnapshots` — scan + isSnapshotOf 过滤
- `restoreCardSnapshot` — 备份当前 → 覆盖
- `deleteCardSnapshot` — 安全检查后删除
- `cleanAllSnapshots` — 递归遍历 + 删除
- `cleanOrphanSnapshots` — 收集卡片基础名 → 找孤儿快照

### 世界书快照（3 方法）
- `listWorldbookSnapshots` — 扫描 + 过滤
- `restoreWorldbookSnapshot` — 备份当前 → 覆盖
- `deleteWorldbookSnapshot` — 安全检查后删除

### LibraryFsPlugin 增强
- `scan` 重构：`walk` → `walkDir`，支持子目录扫描 + `isDirectory` 标志
- `delete` 新增 `recursive` 参数：`deleteRecursive` 深度优先遍历删除

---

## P2：网络与推送（2026-08-27）

### HttpPlugin 增强
- `downloadBytes` — GET 二进制下载，base64 编码返回，20MB maxBytes，8s 连接/120s 读取超时

### 网络方法（android.js）
- `fetchModels` — 智能构建 OpenAI/Anthropic URL，Http.get
- `fetchWbUrl` — Http.get + 50MB 大小检查
- `downloadCardFromUrl` — Http.downloadBytes → 解析 PNG/JSON → LibraryFs.writeBuffer

### 推送方法
- `selectGenericFolder` — pickPushFolder（临时 SAF 授权，不覆盖库根）
- `selectPushFolder` — 同上
- `pushToSillyTavernDir` — 委托给 pushToCustomDir
- `pushToCustomDir` — LibraryFs.copyToFolder 批量复制

### 其他
- `replaceCardImage` — 读取卡 → 提取 JSON → 解码新图 → replacePNGTextChunk → 原子写入
- `duplicateFile` — readBuffer + writeBuffer，`_copy_{timestamp}` 命名
- `exportWorldbooksBatch` — 委托给 exportBatchPackage

---

## P1：OTA 与安全（2026-08-27）

- OTA `checkUpdate` 修复：`downloadUpdate(url)` 显式接收 URL
- 世界书 SAF CRUD：scan/readText/writeText/create/delete/rename/duplicate
- Android Keystore：AES-256-GCM + TEE/StrongBox 硬件保护

---

## P0：基础工程（2026-08-27）

- Gradle 构建：compileSdk 36 / minSdk 24 / JDK 21
- PNG saveCard：原子写入（tmp + rename）
- contract.js：API 契约定义
- 路由修复：Vue Router 模式修正

---

## 构建验证

```
npm test              → 46/46 通过
npm run build:web     → 成功 (2.0s)
npm run sync:android  → 成功
npm run build:android → BUILD SUCCESSFUL (4s)
```

## 5 个 Java 插件

| 插件 | 功能 |
|------|------|
| LibraryFsPlugin | SAF 文件系统（扫描/读写/删除/复制/导入/打开） |
| AppConfigPlugin | 配置持久化 + 酒馆路径存储 |
| HttpPlugin | OkHttp 网络转发（GET/POST/downloadBytes） |
| UpdatePlugin | APK 下载/校验/安装 |
| KeystorePlugin | AES-256-GCM 加密 |

## 待完成

- P5：OTA 安全加固、Release 签名、崩溃日志
- P6：双端回归、真机测试