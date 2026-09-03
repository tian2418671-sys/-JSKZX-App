# 项目自检报告

生成时间：2026/9/3 15:53:32

## 汇总

| 严重级别 | 数量 |
| --- | --- |
| P0 | 0 |
| P1 | 0 |
| P2 | 150 |
| **总计** | **150** |

## 标签-双数据源

- **P2** `/js/composables/useTags.js`：customTags（内存显示层）与 data.tags（PNG 元数据持久层）双写，属有意的分层设计，已做双写同步  
  → 修复建议：如需重构可统一数据源，但需同步改造 persistCardUpdate 链路

## 代码-调试输出

- **P2** `/js/utils/cardLoader.js:247`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/views/CardDetailView.vue:2149`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/views/CardDetailView.vue:2138`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/useChatRegex.js:72`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/useChatRegex.js:35`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/components/GraphModal.vue:260`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/mobile/components/DedupeModal.vue:353`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:108`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:105`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/entry.js:96`：存在 console 调试输出  
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
- **P2** `/js/composables/useSearch.js:368`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSearch.js:292`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useSearch.js:266`：存在 console 调试输出  
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
- **P2** `/js/composables/useCardCrud.js:509`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:422`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:358`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:349`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:284`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:265`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:259`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:233`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:227`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/composables/useCardCrud.js:217`：存在 console 调试输出  
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
- **P2** `/js/bridge/android.js:588`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/bridge/android.js:574`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件
- **P2** `/js/bridge/android.js:235`：存在 console 调试输出  
  → 修复建议：上线前清理或改为日志组件

## 功能缺失-快照入口

- **P2** `/js/mobile/views/CardLibraryView.vue`：移动端卡片库无快照入口（桌面详情页有）  
  → 修复建议：在详情页或库页补快照按钮

## 配置-可能未持久化

- **P2** `/js/components/App.vue:1888`：配置字段被修改但该行未见持久化调用: snapshotConfig.value = { ...snapshotConfig.value, ...cfg.ui.snapshotConfig };  
  → 修复建议：确认是否有 watch 做持久化，否则立即同步

## 桥接-IPC差距

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

- **P2** `/js/mobile/views/CardDetailView.vue:2128`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/mobile/useChatRegex.js:69`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/mobile/useChatRegex.js:30`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/DiskScanModal.vue:288`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/DiskScanModal.vue:269`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/DiskScanModal.vue:233`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/DiskScanModal.vue:204`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:3635`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:2026`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:2015`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:1064`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:998`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:987`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:952`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示
- **P2** `/js/components/App.vue:935`：try/catch 内仅 console 输出，用户感知不到错误  
  → 修复建议：（桌面端）catch 加失败明细提示

## API-本地默认地址

- **P2** `/js/mobile/views/SettingsView.vue:439`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项
- **P2** `/js/mobile/views/SettingsView.vue:368`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项
- **P2** `/js/mobile/views/CardDetailView.vue:1387`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项
- **P2** `/js/mobile/views/CardDetailView.vue:1377`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项
- **P2** `/js/components/App.vue:1760`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项
- **P2** `/js/components/App.vue:1271`：本地 LM Studio 默认地址（DEFAULT_API_ENDPOINT/重置/协议回填），用户可随时在输入框改 endpoint，非阻塞  
  → 修复建议：如需支持第三方中转默认，可增加默认地址设置项

## 使用说明

运行 `node scripts/audit-full.mjs`，退出码非 0 表示存在 P0/P1 问题，建议在 CI / 打包前拦截。
