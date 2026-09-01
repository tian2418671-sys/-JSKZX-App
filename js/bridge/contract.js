/**
 * API 桥接契约 (Bridge Contract)
 * ──────────────────────────────────────────
 * 定义 window.electronAPI 的完整接口签名、参数类型、返回值结构与错误码。
 * 桌面端 (electron.js) 和移动端 (android.js) 必须遵守同一份契约。
 *
 * 版本: 2.1 (移动端全量对齐)
 * 最后更新: 2026-09
 */

// ============================================================
// 通用错误码 (所有方法 error 字段统一使用以下枚举)
// ============================================================
export const ErrorCode = {
    /** 用户取消操作 (如关闭 SAF 选择器) */
    CANCELLED: 'CANCELLED',
    /** SAF 目录树授权已失效 (用户撤销或系统回收) */
    PERMISSION_REVOKED: 'PERMISSION_REVOKED',
    /** 文件/目录不存在 */
    NOT_FOUND: 'NOT_FOUND',
    /** 卡片数据格式无效 (非 PNG/非 JSON/解析失败) */
    INVALID_CARD: 'INVALID_CARD',
    /** 路径不在库根范围内 */
    PATH_OUTSIDE_LIBRARY: 'PATH_OUTSIDE_LIBRARY',
    /** 功能尚未接入 (预留;当前移动端已全量实现,基本不再产生该码) */
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
    /** 网络请求失败 */
    NETWORK_ERROR: 'NETWORK_ERROR',
    /** 未知错误 */
    UNKNOWN: 'UNKNOWN'
};

// ============================================================
// 通用返回结构
// ============================================================

/**
 * @typedef {Object} Result
 * @property {boolean} success - 操作是否成功
 * @property {string} [error] - 错误描述 (含 ErrorCode 前缀)
 */

/**
 * @typedef {Object} FileEntry
 * @property {string} path - 库根相对路径 (如 "幻想组/星野.png")
 * @property {string} name - 文件名
 * @property {number} size - 文件大小 (字节)
 * @property {number} mtime - 最后修改时间 (Unix ms)
 * @property {string} [subFolder] - 所属子目录 (分组)
 * @property {string} [category] - 分组名
 * @property {Object} [embeddedData] - PNG 内嵌的卡片 JSON (scan 时由原生解析)
 */

// ============================================================
// 方法签名
// ============================================================

/**
 * @namespace ElectronAPI
 *
 * === 库目录与扫描 ===
 *
 * @method libraryInfo() → {granted:boolean, hasUri:boolean, uri:string}
 *   获取当前 SAF 授权状态与根 URI
 *
 * @method selectFolder() → {folderPath:string|null, files:FileEntry[], error?:string}
 *   打开系统文件夹选择器,授权 SAF 目录树
 *
 * @method rescanLibrary(folderPath:string) → {folderPath:string, files:FileEntry[], categories?:string[], error?:string}
 *   重新扫描库目录,返回文件列表与分组
 *
 * @method loadConfig() → {folderPath:string, files:FileEntry[], categories?:string[]}
 *   桌面端:加载上次库路径配置;移动端:等同 rescanLibrary
 *
 * === 分组管理 ===
 *
 * @method createGroupFolder({libraryPath:string, groupName:string}) → {success:boolean, folderName?:string, path?:string, error?:string}
 *   在库目录下创建分组子目录
 *
 * @method renameGroupFolder({libraryPath:string, oldName:string, newName:string}) → {success:boolean, newName?:string, error?:string}
 *   重命名分组子目录
 *
 * @method moveCardToGroup({libraryPath:string, cardPath:string, targetGroup:string}) → {success:boolean, newFilePath?:string, newSubFolder?:string, error?:string}
 *   移动卡片文件到目标分组 (targetGroup='' 表示移到库根)
 *
 * @method deleteEmptyGroupFolder({libraryPath:string, groupName:string}) → {success:boolean, deleted?:string, notExist?:boolean, error?:string}
 *   删除空分组目录
 *
 * === 文件读写 ===
 *
 * @method readBuffer(filePath:string) → {success:boolean, buffer?:ArrayBuffer, error?:string}
 *   读取文件二进制内容 (用于 PNG 解析)
 *
 * @method readText(filePath:string) → {success:boolean, text?:string, error?:string}
 *   读取文件文本内容 (用于 JSON 卡片)
 *
 * @method saveCard(filePath:string, updatedJson:Object|string) → {success:boolean, error?:string}
 *   保存卡片数据到物理文件。
 *   - PNG/WebP: 必须二进制安全写回 (替换 chara 文本块),禁止 writeText
 *   - JSON: 直接文本写入
 *
 * @method deleteFile(filePath:string) → {success:boolean, error?:string}
 *   删除文件
 *
 * @method duplicateFile(filePath:string) → {success:boolean, newPath?:string, error?:string}
 *   复制文件
 *
 * @method replaceCardImage({filePath:string, imageBase64:string, imageType:string}) → {success:boolean, error?:string}
 *   替换卡片封面图片
 *
 * === 配置持久化 ===
 *
 * @method loadAppConfig() → Object
 *   加载应用全局配置 (JSON 对象)
 *
 * @method saveAppConfig(configData:Object) → {success:boolean, error?:string}
 *   保存应用全局配置
 *
 * @method getUiSettings() → Object
 *   获取 UI 设置子集
 *
 * === 对话框 ===
 *
 * @method showMessage({message:string, title?:string, type?:string}) → {success:boolean}
 *   显示消息提示
 *
 * @method showItemInFolder(filePath:string) → {success:boolean, error?:string}
 *   在系统文件管理器中定位文件 (移动端经 SAF 打开所在目录)
 *
 * @method openPath(filePath:string) → {success:boolean, error?:string}
 *   用系统默认应用打开文件
 *
 * @method openExternal(url:string) → {success:boolean}
 *   用系统浏览器打开外部链接
 *
 * === 聊天测卡 (AI) ===
 *
 * @method sendChatMessage(endpoint:string, payload:Object, apiKey:string, apiType:string) → {success:boolean, status?:number, data?:Object, error?:string}
 *   发送聊天补全请求 (OpenAI/Anthropic 兼容)
 *
 * @method fetchModels(endpoint:string, apiKey:string, apiType:string) → {success:boolean, models?:string[], error?:string}
 *   获取模型列表
 *
 * === 酒馆推送 ===
 *
 * @method pushToTavern({filePath:string, targetUrl:string, apiKey:string, cardName:string, fieldName?:string}) → {success:boolean, status?:number, body?:string, error?:string}
 *   推送角色卡到 SillyTavern 酒馆
 *
 * @method autoDetectTavernPath() → {success:boolean, path?:string, error?:string}
 *   自动检测酒馆目录 (移动端读取已保存路径)
 *
 * @method pushToSillyTavernDir({filePath:string, tavernPath:string}) → {success:boolean, error?:string}
 *   推送到酒馆本地目录
 *
 * === 世界书 ===
 *
 * @method scanWorldbooks() → {worldbooks:Array<{path:string, name:string, wb:Object}>, error?:string}
 *   扫描库内独立世界书文件
 *
 * @method saveWorldbook({path:string, wb:Object}) → {success:boolean, error?:string}
 *   保存世界书到文件
 *
 * @method createWorldbook({path:string, name:string, wb:Object}) → {success:boolean, error?:string}
 *   创建新世界书文件
 *
 * @method renameWorldbookFile({path:string, newPath:string}) → {success:boolean, error?:string}
 *   重命名世界书文件
 *
 * @method exportWorldbooksBatch({paths:string[], destFolder:string}) → {success:boolean, error?:string}
 *   批量导出世界书
 *
 * === 快照 ===
 *
 * @method listCardSnapshots(cardPath:string) → Array<{id:string, time:number, label?:string}>
 *   列出卡片的所有快照
 *
 * @method createManualSnapshot(cardPath:string, label?:string) → {success:boolean, error?:string}
 *   创建手动快照
 *
 * @method restoreCardSnapshot(cardPath:string, snapshotId:string) → {success:boolean, error?:string}
 *   恢复快照
 *
 * @method deleteCardSnapshot(cardPath:string, snapshotId:string) → {success:boolean, error?:string}
 *   删除单个快照
 *
 * @method cleanAllSnapshots() → {success:boolean, error?:string}
 *   清理所有快照
 *
 * @method cleanOrphanSnapshots() → {success:boolean, error?:string}
 *   清理孤儿快照
 *
 * === 磁盘扫描 ===
 *
 * @method scanTargetFolder() → {files:Array<{path:string, name:string, size:number}>, treeUri?:string, title?:string, error?:string}
 *   打开 SAF 目录选择器扫描 PNG/WebP 卡片
 *
 * @method onScanProgress(cb:Function) → void
 *   注册扫描进度回调 (cb 接收 {phase:'scanning'|'finish', done?:number, total?:number})
 *
 * @method importScanned({treeUri:string, scanPaths:string[], destFolder:string}) → {success:boolean, copied:string[], skipped:string[], failed:string[], error?:string}
 *   将扫描结果中的文件导入库目录
 *
 * === 查重清理 ===
 *
 * @method getFileStats(paths:string[]) → {success:boolean, data:Object<string,{mtimeMs:number, size:number}>, error?:string}
 *   批量获取文件修改时间与大小
 *
 * @method trashFiles(filePaths:string[]) → {success:boolean, count:number, failed:Array<{path:string, error:string}>, error?:string}
 *   移入回收站 (.trash 目录)
 *
 * @method openGlobalTrash() → {success:boolean, error?:string}
 *   打开全局回收站
 *
 * === OTA 更新 ===
 *
 * @method checkUpdate(feed:string) → {success:boolean, update:boolean, info?:{version:string, name:string, url:string, size:number, notes:string}, version?:string, url?:string, error?:string}
 *   检查更新 (feed 为 GitHub Releases API 或 {version,url} JSON 地址)
 *
 * @method downloadUpdate(url?:string, fileName?:string) → {success:boolean, filePath?:string, error?:string}
 *   下载更新包 (url 缺省时复用 checkUpdate 结果)
 *
 * @method installUpdate(filePath:string) → {success:boolean, error?:string}
 *   拉起系统安装器安装 APK
 *
 * @method onUpdateAvailable(cb:Function) → void
 *   注册更新可用回调
 *
 * @method onUpdateNotAvailable(cb:Function) → void
 *   注册无更新回调
 *
 * @method onUpdateProgress(cb:Function) → void
 *   注册下载进度回调 (cb 接收 {phase:'download', percent:number})
 *
 * @method onUpdateDownloaded(cb:Function) → void
 *   注册下载完成回调
 *
 * @method onUpdateError(cb:Function) → void
 *   注册更新错误回调
 *
 * === 安全存储 ===
 *
 * @method encryptSecret(plain:string) → {success:boolean, value:string, error?:string}
 *   加密敏感数据 (移动端 Android Keystore / 桌面 electron safeStorage)
 *
 * @method decryptSecret(cipher:string) → {success:boolean, value:string, error?:string}
 *   解密敏感数据 (移动端 Android Keystore / 桌面 electron safeStorage)
 *
 * === 导入导出 ===
 *
 * @method importExternalCards(paths:string[], destFolder:string) → {success:boolean, copied:string[], skipped:string[], failed:string[], error?:string}
 *   导入外部卡片 (桌面端:文件选择器;移动端:SAF 目录导入)
 *
 * @method downloadCardFromUrl(url:string) → {success:boolean, error?:string}
 *   从 URL 下载角色卡
 *
 * @method fetchWbUrl(url:string) → {success:boolean, error?:string}
 *   从 URL 获取世界书
 *
 * === 杂项 ===
 *
 * @method getPathForFile(filePath:string) → string|null
 *   获取文件系统绝对路径 (移动端返回 null)
 *
 * @method getWindowsDrives() → string[]
 *   获取 Windows 驱动器列表 (移动端返回 [])
 *
 * @method selectGenericFolder() → {success:boolean, path?:string, error?:string}
 *   选择通用文件夹
 *
 * @method selectPushFolder() → {success:boolean, path?:string, error?:string}
 *   选择推送目标文件夹
 */

// ============================================================
// 契约校验工具 (开发/测试用)
// ============================================================

/**
 * 校验实现对象是否满足契约 (检查必需方法是否存在)
 * @param {Object} impl - 桥接实现对象 (androidImpl / electronImpl)
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateContract(impl) {
    const required = [
        // 库目录与扫描
        'libraryInfo', 'selectFolder', 'rescanLibrary', 'loadConfig',
        // 分组管理
        'createGroupFolder', 'renameGroupFolder', 'moveCardToGroup', 'deleteEmptyGroupFolder',
        // 文件读写
        'readBuffer', 'readText', 'writeText', 'readTextBatch', 'saveCard', 'deleteFile', 'duplicateFile', 'replaceCardImage',
        // 配置
        'loadAppConfig', 'saveAppConfig', 'getUiSettings',
        // 对话框
        'showMessage', 'showItemInFolder', 'openPath', 'openExternal',
        // 聊天测卡
        'sendChatMessage', 'fetchModels',
        // 推送
        'pushToTavern', 'pushToCustomDir', 'pushToSillyTavernDir',
        // 世界书
        'scanWorldbooks', 'saveWorldbook', 'createWorldbook', 'renameWorldbookFile', 'exportWorldbooksBatch',
        // 快照
        'listCardSnapshots', 'createManualSnapshot', 'restoreCardSnapshot', 'deleteCardSnapshot', 'cleanAllSnapshots', 'cleanOrphanSnapshots',
        // 磁盘扫描
        'scanTargetFolder', 'onScanProgress', 'importScanned',
        // 查重
        'getFileStats', 'trashFiles', 'openGlobalTrash',
        // OTA
        'checkUpdate', 'downloadUpdate', 'installUpdate',
        'onUpdateAvailable', 'onUpdateNotAvailable', 'onUpdateProgress', 'onUpdateDownloaded', 'onUpdateError',
        // 安全
        'encryptSecret', 'decryptSecret',
        // 导入导出
        'importExternalCards', 'downloadCardFromUrl', 'fetchWbUrl',
        // 目录选择
        'selectGenericFolder', 'selectPushFolder',
        // 杂项
        'getWindowsDrives'
    ];

    const missing = required.filter((name) => typeof impl[name] !== 'function');
    return { valid: missing.length === 0, missing };
}