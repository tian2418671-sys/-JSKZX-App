/**
 * 历史快照功能组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：快照配置持久化、手动快照、快照列表查看与一键恢复、快照清理。
 * 依赖通过参数注入（来自 App.vue 的共享状态/工具方法），保持原有行为不变。
 */
import { ref, watch } from 'vue';
import { parsePNGChunk, deepScanForJSON } from '../utils/pngParser.js';
import { normalizeCardData } from '../utils/cardLoader.js';

export function useSnapshots({
    snapshotConfig, // ⚠️ 由 App.vue 顶层注入（syncConfigToDisk / 集中 watch 需早期引用 snapshotConfig，不能在此尾部才定义，否则 TDZ）
    library,
    cardData,
    currentFolderPath,
    nativeAlert,
    confirmDialog,
    addLog,
    showToast,
    refreshCardData
}) {
    // ================= [ 📸 历史快照配置（设置面板可调，自动同步主进程） ] =================
    // snapshotConfig ref 由 App.vue 注入，此处仅保留持久化与同步逻辑
    // 持久化到 localStorage + 同步主进程（开关/冷却/最大保留数变化即时生效）
    const saveSnapshotSettings = async () => {
        try {
            localStorage.setItem('snapshot_enabled', JSON.stringify(snapshotConfig.value.enabled));
            localStorage.setItem('snapshot_interval', String(snapshotConfig.value.intervalMinutes));
            localStorage.setItem('snapshot_max_count', String(snapshotConfig.value.maxSnapshots));
        } catch (e) { /* 忽略 */ }
        if (window.electronAPI && typeof window.electronAPI.updateSnapshotConfig === 'function') {
            try {
                // ⚠️ 必须 JSON 序列化剥离 Vue reactive Proxy：
                //   snapshotConfig.value 是响应式代理，直接传 IPC 会报 "An object could not be cloned"，
                //   导致开关永远同步不到主进程 → 关闭自动快照后仍生成快照（历史 BUG 根因）
                const plain = JSON.parse(JSON.stringify(snapshotConfig.value));
                await window.electronAPI.updateSnapshotConfig(plain);
            } catch (e) { console.warn('快照配置同步主进程失败:', e); }
        }
    };
    watch(snapshotConfig, saveSnapshotSettings, { deep: true });

    // 📸 手动创建当前卡片快照（绕过冷却，立即备份当前状态到 .bak_history）
    const triggerManualSnapshot = async () => {
        if (!cardData.value) return nativeAlert('请先打开一张卡片。', 'warning');
        const libItem = library.value.find(item => item.data === cardData.value);
        const cardPath = libItem ? libItem.path : null;
        if (!cardPath) return nativeAlert('无法创建快照：当前卡片未找到物理文件路径', 'warning');
        if (!window.electronAPI || typeof window.electronAPI.createManualSnapshot !== 'function') {
            return nativeAlert('当前版本不支持手动创建快照，请更新应用。', 'warning');
        }
        const res = await window.electronAPI.createManualSnapshot(cardPath);
        if (res && res.success) {
            nativeAlert(`🎉 已为 [${libItem.name}] 创建物理备份快照！`, 'info');
        } else {
            nativeAlert(`快照创建失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    // ================= [ 📸 历史快照：查看与一键恢复（第 10 节） ] =================
    const showSnapshotModal = ref(false);
    const snapshotList = ref([]);
    const snapshotCardName = ref('');
    const snapshotCardPath = ref('');

    // 打开历史快照弹窗（列出 .bak_history 内该卡的全部快照，按时间倒序）
    const openSnapshotModal = async (item) => {
        if (!item) return;
        if (!window.electronAPI || typeof window.electronAPI.listCardSnapshots !== 'function') {
            return nativeAlert('当前版本不支持查看历史快照，请更新应用。', 'warning');
        }
        snapshotCardName.value = item.name || '未知角色';
        snapshotCardPath.value = item.path || '';
        const res = await window.electronAPI.listCardSnapshots(item.path);
        snapshotList.value = (res && res.success && Array.isArray(res.snapshots)) ? res.snapshots : [];
        showSnapshotModal.value = true;
        if (!res || !res.success) {
            nativeAlert(`读取历史快照失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    // 从指定快照恢复当前卡片（先备份当前版本，再把快照覆盖回原路径）
    const restoreSnapshot = async (snap) => {
        if (!snap || !snapshotCardPath.value) return;
        const ok = await confirmDialog(`确定要将卡片 [${snapshotCardName.value}] 恢复为该快照吗？\n（当前版本会先自动备份为新快照，恢复后可再次回退）`);
        if (!ok) return;
        if (!window.electronAPI || typeof window.electronAPI.restoreCardSnapshot !== 'function') {
            return nativeAlert('当前版本不支持快照恢复，请更新应用。', 'warning');
        }
        const res = await window.electronAPI.restoreCardSnapshot({
            filePath: snapshotCardPath.value,
            snapshotPath: snap.path
        });
        if (res && res.success) {
            nativeAlert(`✅ 已从快照恢复卡片 [${snapshotCardName.value}]！\n恢复前的版本已自动备份，可在列表中回退。`, 'info');
            // 🔄 若恢复的正是当前打开的卡片，重新从文件解析刷新界面（内存 cardData 还是旧数据）
            const curItem = library.value.find(i => i.path === snapshotCardPath.value);
            if (curItem && cardData.value && curItem.data === cardData.value) {
                try {
                    let buffer = null;
                    if (window.electronAPI && typeof window.electronAPI.readBuffer === 'function') {
                        const rb = await window.electronAPI.readBuffer(curItem.path);
                        if (rb && typeof rb === 'object' && rb.buffer) buffer = rb.buffer;
                    }
                    if (buffer) {
                        const parsed = parsePNGChunk(buffer) || deepScanForJSON(buffer);
                        if (parsed) {
                            const normalized = normalizeCardData(parsed);
                            curItem.data = normalized;
                            curItem.name = normalized.data?.name || parsed.name || curItem.name;
                            cardData.value = normalized; // 重新绑定当前编辑面板
                            refreshCardData();
                            showToast('🔄 已从快照恢复并刷新当前卡片', 'success');
                        }
                    }
                } catch (e) { console.warn('恢复后刷新当前卡片失败', e); }
            }
            // 刷新列表（恢复操作会生成新的"当前版本"快照）
            const listRes = await window.electronAPI.listCardSnapshots(snapshotCardPath.value);
            snapshotList.value = (listRes && listRes.success && Array.isArray(listRes.snapshots)) ? listRes.snapshots : snapshotList.value;
        } else {
            nativeAlert(`恢复失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    // 打开该卡片的快照文件夹（系统资源管理器）
    const openSnapshotFolder = async () => {
        if (!snapshotCardPath.value) return;
        const historyDir = snapshotCardPath.value.replace(/[\\/][^\\/]*$/, '') + '\\.bak_history';
        const res = await window.electronAPI.openPath(historyDir);
        if (!res.success) nativeAlert(res.error || '打开失败', 'error');
    };

    const closeSnapshotModal = () => { showSnapshotModal.value = false; };

    // 🧹 一键清理全部历史快照垃圾（递归删除库目录下所有 .bak_history，释放硬盘空间；之后保存会自动重新生成）
    const cleanAllSnapshots = async () => {
        if (!currentFolderPath.value) return nativeAlert('请先打开角色库目录。', 'warning');
        if (!window.electronAPI || typeof window.electronAPI.cleanAllSnapshots !== 'function') {
            return nativeAlert('当前版本不支持清理历史快照，请更新应用。', 'warning');
        }
        const ok = await confirmDialog('确定要清理角色库中的【全部历史快照】吗？\n（将删除库目录下所有 .bak_history 快照文件夹，释放硬盘空间；之后保存卡片时会自动重新生成）');
        if (!ok) return;
        const res = await window.electronAPI.cleanAllSnapshots(currentFolderPath.value);
        if (res && res.success) {
            const mb = ((res.freedBytes || 0) / 1024 / 1024).toFixed(1);
            nativeAlert(`✅ 已清理 ${res.removedCount || 0} 个快照文件夹，释放约 ${mb} MB！\n之后保存卡片时将自动重新生成新快照。`, 'info');
            addLog(`🧹 已清理 ${res.removedCount || 0} 个快照文件夹（释放 ${mb} MB）`, 'success');
        } else {
            nativeAlert(`清理失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    // 🧹 清理孤儿快照目录（卡片已删除但 .bak_history 残留，只删「无对应卡片」的目录，保留仍有卡片存活的快照）
    const cleanOrphanSnapshots = async () => {
        if (!currentFolderPath.value) return nativeAlert('请先打开角色库目录。', 'warning');
        if (!window.electronAPI || typeof window.electronAPI.cleanOrphanSnapshots !== 'function') {
            return nativeAlert('当前版本不支持清理孤儿快照，请更新应用。', 'warning');
        }
        const ok = await confirmDialog('确定要清理【孤儿快照】吗？\n（仅删除「对应卡片已被删除」的 .bak_history 快照目录，仍有卡片存活的快照会保留）');
        if (!ok) return;
        const res = await window.electronAPI.cleanOrphanSnapshots(currentFolderPath.value);
        if (res && res.success) {
            const mb = ((res.freedBytes || 0) / 1024 / 1024).toFixed(1);
            nativeAlert(`✅ 已清理 ${res.removedCount || 0} 个孤儿快照目录，释放约 ${mb} MB！`, 'info');
            addLog(`🧹 已清理 ${res.removedCount || 0} 个孤儿快照目录（释放 ${mb} MB）`, 'success');
        } else {
            nativeAlert(`清理失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    return {
        saveSnapshotSettings, // snapshotConfig 由 App.vue 持有，不返回（避免重复声明）
        triggerManualSnapshot,
        showSnapshotModal, snapshotList, snapshotCardName, snapshotCardPath,
        openSnapshotModal, restoreSnapshot, openSnapshotFolder, closeSnapshotModal,
        cleanAllSnapshots, cleanOrphanSnapshots
    };
}