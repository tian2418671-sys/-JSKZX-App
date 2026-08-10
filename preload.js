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
    // 聊天测试接口（OpenAI 兼容格式，经主进程转发以绕过 CORS）
    sendChatMessage: (endpoint, payload, apiKey) => ipcRenderer.invoke('chat:send', endpoint, payload, apiKey),
    // 彻底删除本地文件（高危操作，需前端确认后调用）
    deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
    // 一键导出角色卡完整整合包（主卡 + 独立世界书 + 正则脚本）
    exportPackage: (filePath, cardData) => ipcRenderer.invoke('file:exportPackage', filePath, cardData),
    // 批量打包导出多张卡片
    exportBatchPackage: (filePaths) => ipcRenderer.invoke('file:exportBatchPackage', filePaths)
});
