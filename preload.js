/**
 * 预加载脚本：通过 contextBridge 安全地把主进程能力暴露给渲染进程
 * 渲染进程只能通过 window.electronAPI 访问这些受控方法，无法直接触碰 Node.js
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 触发选择文件夹（返回扫描结果）
    selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    // 加载上次的配置（返回扫描结果）
    loadConfig: () => ipcRenderer.invoke('config:load'),
    // 读取全局标签库（主进程配置文件，跨 dev/生产统一持久化）
    getGlobalTags: () => ipcRenderer.invoke('config:getGlobalTags'),
    // 保存全局标签库到主进程配置文件
    saveGlobalTags: (tags) => ipcRenderer.invoke('config:saveGlobalTags', tags),
    // 读取通用 UI 状态（分组/语言/卡片分类等；主进程配置文件，跨 dev/生产统一持久化）
    getUiSettings: () => ipcRenderer.invoke('config:getUiSettings'),
    // 合并保存通用 UI 状态到主进程配置文件
    saveUiSettings: (settings) => ipcRenderer.invoke('config:saveUiSettings', settings),
    // 读取图片二进制数据（用于解析内置 JSON）
    readBuffer: (filePath) => ipcRenderer.invoke('file:readBuffer', filePath),
    // 读取文本（用于 JSON 卡片）
    readText: (filePath) => ipcRenderer.invoke('file:readText', filePath),
    // 保存卡片 JSON 到本地文件
    saveCard: (filePath, updatedJson) => ipcRenderer.invoke('file:saveCard', filePath, updatedJson),
    // 原生消息对话框（替代 alert）
    showMessage: (options) => ipcRenderer.invoke('dialog:showMessage', options),
    // 系统级拖拽复制文件到卡片库
    copyToLibrary: (sourcePaths, targetFolder) => ipcRenderer.invoke('file:copyToLibrary', sourcePaths, targetFolder),
    // 获取拖拽文件的真实路径（Electron 33 起 File.path 已废弃，改用 webUtils）
    getPathForFile: (file) => webUtils.getPathForFile(file),
    // 聊天测试接口（OpenAI 兼容 / Anthropic 双协议，经主进程转发以绕过 CORS；apiType: 'openai' | 'anthropic'）
    sendChatMessage: (endpoint, payload, apiKey, apiType) => ipcRenderer.invoke('chat:send', endpoint, payload, apiKey, apiType),
    // 拉取服务端可用模型列表（GET /v1/models，经主进程转发以绕过 CORS）
    fetchModels: (endpoint, apiKey, apiType) => ipcRenderer.invoke('models:fetch', endpoint, apiKey, apiType),
    // 彻底删除本地文件（高危操作，需前端确认后调用）
    deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
    // 一键导出角色卡完整整合包（主卡 + 独立世界书 + 正则脚本）
    exportPackage: (filePath, cardData) => ipcRenderer.invoke('file:exportPackage', filePath, cardData),
    // 批量打包导出多张卡片
    exportBatchPackage: (filePaths) => ipcRenderer.invoke('file:exportBatchPackage', filePaths),
    // 磁盘扫描：获取所有存在的盘符
    getWindowsDrives: () => ipcRenderer.invoke('get-windows-drives'),
    // 磁盘扫描：扫描指定盘符/文件夹（无参时主进程弹出原生目录选择器；useFilter 控制体积过滤）
    scanTargetFolder: (targetPath, useFilter) => ipcRenderer.invoke('scan-target-folder', targetPath, useFilter),
    // 磁盘扫描：接收主进程扫描进度心跳
    onScanProgress: (callback) => {
        ipcRenderer.removeAllListeners('scan-progress'); // 防止重复绑定
        ipcRenderer.on('scan-progress', (event, data) => callback(data));
    },
    // 用系统资源管理器打开指定文件夹（查看快照/回收站等；相对路径自动解析）
    openPath: (targetPath) => ipcRenderer.invoke('system:openPath', targetPath),
    // 推送角色卡到酒馆（经主进程以 multipart 上传，绕过 CORS）
    pushToTavern: (params) => ipcRenderer.invoke('tavern:push', params),
    // 通用选择文件夹对话框（绑定酒馆本地根目录）
    selectGenericFolder: () => ipcRenderer.invoke('dialog:selectGenericFolder'),
    // 智能嗅探酒馆本地根目录（遍历常见路径 + 指纹验证）
    autoDetectTavernPath: () => ipcRenderer.invoke('tavern:autoDetectPath'),
    // 物理拷贝卡片到酒馆 characters 目录（本地直推）
    pushToSillyTavernDir: (paths, rootPath) => ipcRenderer.invoke('tavern:pushDir', paths, rootPath),
    // 🌍 世界书专属通道：扫描目录下的 .json 世界书（返回含 entries 字段的合法世界书列表）
    scanWorldbooks: (dirPath) => ipcRenderer.invoke('wb:scan', dirPath),
    // 🌍 世界书专属通道：物理覆写世界书文件（保存前自动 .bak_history 快照备份）
    saveWorldbook: (params) => ipcRenderer.invoke('wb:save', params),
    // 🌍 世界书专属通道：从网络拉取世界书 JSON（主进程转发，绕开渲染层 CORS）
    fetchWbUrl: (url) => ipcRenderer.invoke('wb:fetchUrl', url),
    // 🌍 世界书专属通道：新建世界书文件（网址导入落盘）
    createWorldbook: (params) => ipcRenderer.invoke('wb:create', params),
    // 🌍 世界书专属通道：重命名世界书物理文件
    renameWorldbookFile: (params) => ipcRenderer.invoke('wb:rename', params),
    // 🗑️ 智能查重清洗：将冗余文件移动到 userData 下的全局回收站（绝不物理删除）
    trashFiles: (paths) => ipcRenderer.invoke('sys:trashFiles', paths),
    // 🗑️ 打开全局回收站（世界书删除/查重清洗的 userData/jsTavern_Trash）
    openGlobalTrash: () => ipcRenderer.invoke('sys:openGlobalTrash'),
    // 🕒 智能查重：批量获取文件物理状态（修改时间/创建时间/大小）
    getFileStats: (paths) => ipcRenderer.invoke('sys:getFileStats', paths),
    // 🖱️ 右键菜单：在系统资源管理器中打开并定位文件
    showItemInFolder: (filePath) => ipcRenderer.invoke('sys:showItemInFolder', filePath),
    // 🖱️ 右键菜单：物理复制文件（创建带时间戳的副本）
    duplicateFile: (filePath) => ipcRenderer.invoke('sys:duplicateFile', filePath),
    // 🚀 版本更新检测：用系统默认浏览器打开外部链接
    openExternal: (url) => ipcRenderer.invoke('sys:openExternal', url),
    // 🚀 版本更新检测：探测 GitHub 最新 Release 版本
    checkUpdate: () => ipcRenderer.invoke('sys:checkUpdate')
});
