# 历史快照 BUG：关闭「自动快照」并清空后，重启仍自动生成快照 —— 修复方案

## 一、问题现象

在「设置」菜单中关闭「历史快照生成」开关，再清空所有历史快照后，关闭软件重新打开，`.bak_history` 里**又自动生成了一个历史快照**（开关明明已经关掉）。

## 二、根因分析

### 1. 主进程的快照开关不落盘，重启即回到默认「开启」

[main.js](file:///workspace/main.js) 里的 `snapshotConfig` 只是一个内存变量，默认 `enabled: true`，**从不写入磁盘**：

```js
// main.js 第 59~63 行
let snapshotConfig = {
  enabled: true,         // ← 重启后每次都是 true
  intervalMinutes: 5,
  maxSnapshots: 10
};
```

而 `settings:updateSnapshotConfig` 这个 IPC 只是更新内存，**没有持久化**：

```js
// main.js 第 1122~1131 行
ipcMain.handle('settings:updateSnapshotConfig', (event, config) => {
    if (config && typeof config === 'object') {
      if (typeof config.enabled === 'boolean') snapshotConfig.enabled = config.enabled;
      ...
    }
    return { success: true, config: snapshotConfig };  // ❌ 没落盘
});
```

所以每次重启，主进程一开始都认为「自动快照 = 开启」。

### 2. 渲染进程启动时的同步存在时序漏洞

[App.vue](file:///workspace/js/components/App.vue) 的 `snapshotConfig` 在启动时先从 `localStorage` 初始化（生产环境 `app://` 下 `localStorage` 不持久，会回落到默认 `true`），并通过 `immediate: true` 的 watch 以及 `onMounted` 里第 3062 行的 `await saveSnapshotSettings()` **过早**把默认值推给主进程：

```js
// App.vue 第 598 行 —— immediate 导致 setup 阶段就用 localStorage 默认值推送
watch(snapshotConfig, saveSnapshotSettings, { deep: true, immediate: true });
```

而真正权威的 `enabled: false` 存放在 `app_config.json` 的 `cfg.ui.snapshotConfig` 里，要等到 `onMounted` 中段（第 3114~3115 行）才被加载回 `snapshotConfig.value`：

```js
// App.vue 第 3062 行 —— 过早同步（此时用的还是 localStorage 默认值 true）
await saveSnapshotSettings();
...
// App.vue 第 3114~3115 行 —— 此时才加载到真正的 false
if (cfg.ui.snapshotConfig && typeof cfg.ui.snapshotConfig === 'object') {
    snapshotConfig.value = { ...snapshotConfig.value, ...cfg.ui.snapshotConfig };
}
```

### 3. 启动加载卡片时触发的「自动保存」会顺带生成快照

启动时 `loadConfig()` → `processElectronFiles()` → `parseAndAddCard()`，凡是有分组/有自动标签的卡片（`category ≠ 未分类`），都会触发一次 `saveCard`：

```js
// App.vue parseAndAddCard() 内
if (oldCategory !== cardInfo.category || oldTagsLen !== (cardInfo.customTags || []).length) {
    await window.electronAPI.saveCard(cardInfo.path, ...);  // 触发 processCardSnapshot
}
```

`saveCard` 内部会调用 `processCardSnapshot()`。由于此时主进程 `snapshotConfig.enabled` 仍是默认的 `true`，于是**自动生成快照**——这正是「清空后重启又出现快照」的根因。

## 三、修复代码块

### （1）主进程：快照配置落盘 + 启动加载（核心修复）

在 [main.js](file:///workspace/main.js) 中，`atomicWriteJson` 定义之后（约第 315 行后）新增：

```js
// ================= [ 📸 快照配置持久化：跨重启记住「是否启用自动快照」 ] =================
const SNAPSHOT_CONFIG_PATH = path.join(app.getPath('userData'), 'snapshot_config.json');

function loadSnapshotConfig() {
  try {
    if (fs.existsSync(SNAPSHOT_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(SNAPSHOT_CONFIG_PATH, 'utf-8'));
      if (saved && typeof saved === 'object') {
        if (typeof saved.enabled === 'boolean') snapshotConfig.enabled = saved.enabled;
        const interval = Number(saved.intervalMinutes);
        if (!Number.isNaN(interval) && interval >= 0) snapshotConfig.intervalMinutes = interval;
        const max = Number(saved.maxSnapshots);
        if (!Number.isNaN(max) && max >= 0) snapshotConfig.maxSnapshots = max;
      }
    }
  } catch (e) { /* 读取失败时保留默认值 */ }
}

function saveSnapshotConfig() {
  try {
    atomicWriteJson(SNAPSHOT_CONFIG_PATH, snapshotConfig);
  } catch (e) { /* 写盘失败忽略 */ }
}

// 启动即加载，确保主进程从第一刻起就记住用户「关闭自动快照」的选择
loadSnapshotConfig();
```

并把 [main.js](file:///workspace/main.js) 第 1122~1131 行的 `settings:updateSnapshotConfig` 补上落盘：

```js
ipcMain.handle('settings:updateSnapshotConfig', (event, config) => {
    if (config && typeof config === 'object') {
      if (typeof config.enabled === 'boolean') snapshotConfig.enabled = config.enabled;
      const interval = Number(config.intervalMinutes);
      if (!Number.isNaN(interval) && interval >= 0) snapshotConfig.intervalMinutes = interval;
      const max = Number(config.maxSnapshots);
      if (!Number.isNaN(max) && max >= 0) snapshotConfig.maxSnapshots = max;
    }
    saveSnapshotConfig(); // 🔧 持久化，避免重启后回到默认 true
    return { success: true, config: snapshotConfig };
});
```

### （2）渲染进程：先用权威配置，再同步主进程（防止默认值反向覆盖）

在 [App.vue](file:///workspace/js/components/App.vue) 中：

把第 598 行的 watch 去掉 `immediate: true`：

```js
// 修改前
watch(snapshotConfig, saveSnapshotSettings, { deep: true, immediate: true });

// 修改后：不再在 setup 阶段用 localStorage 默认值过早覆盖主进程
watch(snapshotConfig, saveSnapshotSettings, { deep: true });
```

并删除 `onMounted` 里第 3062 行的过早同步，改到「加载完 app_config.json（恢复权威 `enabled`）之后、加载卡片之前」再同步：

```js
onMounted(async () => {
    // ❌ 删除这一行（此处 localStorage 默认值不可靠）：
    // await saveSnapshotSettings();

    try {
        // ... 加载 app_config.json，恢复 cfg.ui.snapshotConfig 到 snapshotConfig.value ...
    } catch (e) { /* 忽略 */ }

    // ✅ 恢复权威配置后、加载卡片触发 saveCard 之前，同步一次正确配置到主进程
    await saveSnapshotSettings();

    // ... 后续注册点击/快捷键监听、loadConfig() 加载卡片 ...
});
```

## 四、修复效果

- 主进程启动即从 `snapshot_config.json` 读回 `enabled: false`，不再默认「开启」；
- 渲染进程改在 `app_config.json` 权威值恢复之后才同步，避免用默认值反向把主进程改回 `true`；
- 启动加载卡片时触发的自动 `saveCard` 会在 `enabled: false` 下被 `processCardSnapshot` 正确跳过（返回 `skipped`），**清空快照后重启不再自动生成快照**；
- 不影响手动快照（`isManual` 始终绕过开关）与「一键恢复」先备份的既有逻辑。

---

> 说明：本次仅定位问题并给出修复代码，未对任何源代码做改动。