# 项目自检报告

生成时间：2026/9/1 15:33:52

## 汇总

| 严重级别 | 数量 |
| --- | --- |
| P0 | 0 |
| P1 | 31 |
| P2 | 125 |
| **总计** | **156** |

## 标签-双数据源

- **P1** `/js/composables/useTags.js`：customTags 与 data.tags 并存，易导致标签重启/重扫后丢失或复活  
  → 修复建议：统一以 data.tags 为唯一数据源

## 代码-调试输出

- **P2** `/js/utils/cardLoader.js:247`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/components/GraphModal.vue:260`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/components/DedupeModal.vue:353`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:104`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:101`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:92`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useWorldbooks.js:259`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useWorldbooks.js:250`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useWorldbooks.js:223`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useWorldbooks.js:152`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useTags.js:428`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useTags.js:336`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useTags.js:284`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useTags.js:233`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSnapshots.js:115`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSnapshots.js:37`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSearch.js:367`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSearch.js:291`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSearch.js:265`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useGraph.js:210`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDiskScan.js:133`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDiskScan.js:119`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDedupe.js:259`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDedupe.js:215`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDedupe.js:109`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useDedupe.js:64`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useChat.js:101`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useChat.js:40`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:508`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:421`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:357`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:348`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:283`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:264`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:258`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:232`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:226`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:216`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:93`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useAITools.js:451`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useAITools.js:381`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useAITools.js:285`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/DiskScanModal.vue:321`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/DiskScanModal.vue:272`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/DiskScanModal.vue:249`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/DiskScanModal.vue:208`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:3639`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:3407`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:2691`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:2030`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:2021`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:1776`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:1068`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:1018`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:1015`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:998`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:987`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:964`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:544`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:475`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/components/App.vue:472`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/bridge/electron.js:10`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/bridge/android.js:551`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/bridge/android.js:213`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件

## 代码-nativeAlert兜底

- **P2** `/js/bridge/android.js:563`：存在 window.alert 原生弹窗  
  → 修复建议：统一使用 nativeAlert/Toast

## 功能缺失-快照入口

- **P2** `/js/mobile/views/CardLibraryView.vue`：移动端卡片库无快照入口（桌面详情页有）  
  → 修复建议：在详情页或库页补快照按钮

## 配置-可能未持久化

- **P2** `/js/components/App.vue:1888`：配置字段被修改但该行未见持久化调用: snapshotConfig.value = { ...snapshotConfig.value, ...cfg.ui.snapshotConfig };  
  → 修复建议：确认是否有 watch 做持久化，否则立即同步

## 桥接-占位标记

- **P2** `/js/bridge/android.js:52`：存在 NOT_IMPLEMENTED / 尚未接入标记  
  → 修复建议：检查是否已可接入或已废弃

## 桥接-IPC差距

- **P1** `/js/bridge/android.js`：桌面 IPC "tavern:pushDir" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P1** `/js/bridge/android.js`：桌面 IPC "tavern:autoDetectPath" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P1** `/js/bridge/android.js`：桌面 IPC "tavern:push" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:exportBatchPackage" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:exportPackage" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:delete" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "models:fetch" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "chat:send" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:installUpdate" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:downloadUpdate" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:checkUpdate" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:openExternal" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:duplicateFile" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:showItemInFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:getFileStats" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:trashFiles" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:openGlobalTrash" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:exportBatch" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:deleteSnapshot" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:restoreSnapshot" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:listSnapshots" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:rename" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:create" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:downloadFromUrl" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:fetchUrl" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:save" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "wb:scan" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:saveCard" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "secret:decrypt" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "secret:encrypt" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:cleanOrphanSnapshots" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:cleanAllSnapshots" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:deleteSnapshot" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:restoreSnapshot" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:listSnapshots" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:createManualSnapshot" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "card:replaceImage" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "settings:updateSnapshotConfig" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:importExternalCards" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:copyToLibrary" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "dialog:showMessage" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "library:pushToFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "dialog:selectPushFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "dialog:selectGenericFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "system:openPath" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "scan-target-folder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "get-windows-drives" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:readText" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "file:readBuffer" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:saveConfig" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "sys:loadConfig" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "config:getUiSettings" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "config:getGlobalTags" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "fs:deleteEmptyGroupFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "fs:moveCardToGroup" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "fs:renameGroupFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "fs:createGroupFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "library:rescan" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "config:load" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用
- **P2** `/js/bridge/android.js`：桌面 IPC "dialog:openFolder" 在移动端 android.js 无实现  
  → 修复建议：确认是否需要移动端支持，若不需要则 UI 禁用

## 异步-错误被吞

- **P1** `/js/composables/useChat.js:75`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/composables/useCardCrud.js:89`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/composables/useAITools.js:198`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/DiskScanModal.vue:288`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/DiskScanModal.vue:269`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/DiskScanModal.vue:233`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/DiskScanModal.vue:204`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:3635`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:2026`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:2015`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:1064`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:998`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:987`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:952`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/components/App.vue:935`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层
- **P1** `/js/bridge/android.js:213`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：catch 里加 Toast/Alert 或 throw 给外层

## API-硬编码默认地址

- **P1** `/js/mobile/views/SettingsView.vue:290`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/mobile/views/SettingsView.vue:37`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/mobile/views/CardDetailView.vue:1389`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/mobile/views/CardDetailView.vue:1317`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/mobile/views/CardDetailView.vue:406`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/mobile/components/AiToolModal.vue:23`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/components/EditorPanel.vue:587`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/components/App.vue:1760`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/components/App.vue:1271`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/components/ApiSettingsModal.vue:23`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置
- **P1** `/js/components/AITagModal.vue:155`：硬编码本地 LM Studio 地址，不便切换第三方中转  
  → 修复建议：仅作为占位提示，不写入持久化配置

## 使用说明

运行 `node scripts/audit-full.mjs`，退出码非 0 表示存在 P0/P1 问题，建议在 CI / 打包前拦截。
