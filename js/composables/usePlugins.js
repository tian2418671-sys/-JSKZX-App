/**
 * 🧩 插件管理组合式函数（Composable）
 * 管理 SillyTavern 插件：酒馆助手 JSON 脚本 / 散落 JS 脚本 / 扩展工程（manifest.json）。
 * 状态（plugins/activePlugin/lastPluginDirPath 等）保留在 App.vue 并注入。
 */
import { ref, computed } from 'vue';
import {
    normalizeJsonPlugin,
    normalizeScriptPlugin,
    normalizeExtensionPlugin
} from '../utils/pluginScanner.js';

export function usePlugins({
    // 共享状态
    plugins, activePlugin, lastPluginDirPath,
    // 工具方法
    nativeAlert, confirmDialog, addLog, appPrompt,
    contextMenu, closeContextMenu,
    // 视图模式
    appMode
}) {
    // =========================================================
    // 插件扫描与加载
    // =========================================================

    const pluginSearchQuery = ref('');   // 插件搜索关键字

    // 归一化主进程扫描返回的原始条目 → 统一 plugin 模型
    const normalizePlugins = (rawList) => (rawList || []).map(item => {
        if (item.type === 'json') return normalizeJsonPlugin(item);
        if (item.type === 'extension') return normalizeExtensionPlugin(item);
        return normalizeScriptPlugin(item);
    });

    // 打开插件目录（弹目录选择；扫描后归一化）
    const loadPlugins = async () => {
        const dirPath = await window.electronAPI.selectGenericFolder();
        if (!dirPath) return;
        await scanPluginDir(dirPath);
        appMode.value = 'plugins';
    };

    // 扫描指定插件目录（供手动选择与启动自动恢复共用；自动持久化记忆路径）
    const scanPluginDir = async (dirPath) => {
        if (!dirPath) return;
        lastPluginDirPath.value = dirPath;
        try { localStorage.setItem('jsTavern_lastPluginDir', dirPath); } catch (e) { /* 忽略 */ }

        addLog(`开始扫描插件目录: ${dirPath}`);
        const res = await window.electronAPI.scanPlugins(dirPath);
        if (res.success) {
            plugins.value = normalizePlugins(res.data);
            // 重扫后按来源重绑当前编辑对象，找不到则清空
            if (activePlugin.value) {
                const prevOrigin = activePlugin.value.source?.origin;
                activePlugin.value = plugins.value.find(p => p.source?.origin === prevOrigin) || null;
            }
            addLog(`扫描完成，共识别 ${plugins.value.length} 个插件`, 'success');
        } else {
            addLog(`扫描失败: ${res.error}`, 'error');
            nativeAlert(`插件扫描失败: ${res.error}`, 'error');
        }
    };

    // =========================================================
    // 插件筛选
    // =========================================================

    const filteredPlugins = computed(() => {
        const q = pluginSearchQuery.value.trim().toLowerCase();
        if (!q) return plugins.value;
        return plugins.value.filter(p => {
            const name = (p.name || '').toLowerCase();
            const info = (p.meta?.info || '').toLowerCase();
            const kind = (p.kind || '').toLowerCase();
            return name.includes(q) || info.includes(q) || kind.includes(q);
        });
    });

    // =========================================================
    // 插件删除（移入回收站；扩展工程删除整个目录）
    // =========================================================

    const deletePlugin = async (p) => {
        if (!p) return;
        const name = p.name || '未命名插件';
        const ok = await confirmDialog(
            `🗑️ 确认删除插件？`,
            `即将删除插件「${name}」。\n${p.source?.type === 'extension' ? '扩展工程整个目录' : '文件'}将移入回收站，可恢复。\n\n确认删除？`
        );
        if (!ok) return;
        try {
            const target = p.source?.origin || p.files?.[0];
            if (target) {
                const res = await window.electronAPI.trashFiles([target]);
                if (!res || !res.success) {
                    nativeAlert(`删除失败: ${(res && res.error) || '未知错误'}`, 'error');
                    return;
                }
            }
            const idx = plugins.value.indexOf(p);
            if (idx >= 0) plugins.value.splice(idx, 1);
            if (activePlugin.value === p) activePlugin.value = null;
            addLog(`🗑️ 已删除插件: ${name}`, 'success');
            nativeAlert(`✅ 已删除插件: ${name}`, 'info');
        } catch (err) {
            nativeAlert(`删除失败: ${err.message}`, 'error');
        }
    };

    // =========================================================
    // 插件右键菜单
    // =========================================================

    const openPluginContextMenu = (event, p) => {
        contextMenu.value = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            items: [
                { label: '📂 在资源管理器中定位', action: () => openPluginInFolder(p) },
                { type: 'separator' },
                { label: '🗑️ 删除（移入回收站）', action: () => deletePlugin(p), danger: true }
            ]
        };
    };

    const openPluginInFolder = (p) => {
        const target = p?.source?.origin || p?.files?.[0];
        if (!target) {
            nativeAlert('该插件尚未落盘，无法在资源管理器中定位。', 'warning');
            return;
        }
        window.electronAPI.showItemInFolder(target);
    };

    // =========================================================
    // 工作区「代码」页：读取扩展工程源码文件
    // =========================================================

    const readPluginSource = async (filePath) => {
        try {
            const res = await window.electronAPI.readPluginFile(filePath);
            if (res && res.success) return res.data;
            throw new Error((res && res.error) || '读取失败');
        } catch (err) {
            nativeAlert(`读取源码失败: ${err.message}`, 'error');
            return '';
        }
    };

    return {
        // 状态
        pluginSearchQuery,
        // 扫描
        loadPlugins,
        scanPluginDir,
        normalizePlugins,
        // 筛选
        filteredPlugins,
        // 删除 / 右键
        deletePlugin,
        openPluginContextMenu,
        openPluginInFolder,
        // 源码读取
        readPluginSource
    };
}