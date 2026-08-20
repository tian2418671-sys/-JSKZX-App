/**
 * 批量操作组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：卡片多选逻辑（点击/Ctrl/Shift/清除选择）、批量操作悬浮控制台拖拽、
 * 批量导出/批量移入回收站/批量添加标签。
 * 共享状态（selectedIds / lastSelectedIndex / library / cardData）与工具方法
 * （openFromLibrary / paginatedLibrary / reset / cleanupEmptyCategories / persistCardUpdate /
 * nativeAlert / confirmDialog / appPrompt / clearSelection）保留在 App.vue 顶层并注入，
 * 其余选择与批量逻辑在此定义。
 */
import { ref, computed } from 'vue';

export function useBatch({
    selectedIds,
    lastSelectedIndex,
    library,
    cardData,
    openFromLibrary,
    paginatedLibrary,
    reset,
    cleanupEmptyCategories,
    persistCardUpdate,
    deleteCardOverlays,
    nativeAlert,
    confirmDialog,
    appPrompt,
    clearSelection
}) {
    // ================= [ 方法：选择逻辑 ] =================
    const handleCardClick = (e, item, index) => {
        // 按住 Ctrl / Cmd 键多选
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleSelection(item.id);
            lastSelectedIndex.value = index;
        }
        // 按住 Shift 键连续多选
        else if (e.shiftKey && lastSelectedIndex.value !== -1) {
            e.preventDefault();
            const start = Math.min(lastSelectedIndex.value, index);
            const end = Math.max(lastSelectedIndex.value, index);

            // 🔴 修复 BUG：列表渲染用 paginatedLibrary（分页切片，index 为页内 0~N），
            // 原先这里索引 filteredLibrary（全局过滤数组），导致第 2 页起 Shift 连选会
            // 错选到第 1 页的卡片。必须改为与页面视图一致的 paginatedLibrary。
            for (let i = start; i <= end; i++) {
                const currentItem = paginatedLibrary.value[i];
                if (currentItem && !selectedIds.value.includes(currentItem.id)) {
                    selectedIds.value.push(currentItem.id);
                }
            }
            lastSelectedIndex.value = index;
        }
        // 普通点击：已处于选中模式则切换选择，否则打开卡片
        else {
            if (selectedIds.value.length > 0) {
                toggleSelection(item.id);
                lastSelectedIndex.value = index;
            } else {
                openFromLibrary(item);
            }
        }
    };

    const toggleSelection = (id) => {
        const idx = selectedIds.value.indexOf(id);
        if (idx > -1) selectedIds.value.splice(idx, 1);
        else selectedIds.value.push(id);
    };

    // ================= [ 批量操作悬浮控制台：可拖动定位（默认底部居中，拖动标题栏移动，双击复位） ] =================
    const batchBarPos = ref(null); // { x, y } 拖动后的视口像素坐标；null = 默认底部居中
    const batchBarStyle = computed(() => {
        if (!batchBarPos.value) {
            return { minWidth: '420px', maxWidth: '92vw', bottom: '1rem', left: '50%', transform: 'translateX(-50%)' };
        }
        return { minWidth: '420px', maxWidth: '92vw', left: batchBarPos.value.x + 'px', top: batchBarPos.value.y + 'px' };
    });
    let batchBarDrag = null; // 拖拽中的快照
    const startBatchBarDrag = (e) => {
        if (e.button !== 0) return; // 仅响应左键
        if (e.target.closest('button')) return; // 不拦截按钮点击（取消选择等）
        const panel = e.currentTarget.closest('.fixed');
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        batchBarDrag = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top,
            width: rect.width,
            height: rect.height,
        };
        document.body.classList.add('select-none'); // 拖拽期间禁用文本选中
        document.addEventListener('mousemove', onBatchBarDragMove);
        document.addEventListener('mouseup', endBatchBarDrag);
        e.preventDefault();
    };
    const onBatchBarDragMove = (e) => {
        if (!batchBarDrag) return;
        const nx = batchBarDrag.origLeft + (e.clientX - batchBarDrag.startX);
        const ny = batchBarDrag.origTop + (e.clientY - batchBarDrag.startY);
        // 边界限制：不允许拖出视口
        batchBarPos.value = {
            x: Math.max(0, Math.min(nx, window.innerWidth - batchBarDrag.width)),
            y: Math.max(0, Math.min(ny, window.innerHeight - batchBarDrag.height)),
        };
    };
    const endBatchBarDrag = () => {
        batchBarDrag = null;
        document.body.classList.remove('select-none');
        document.removeEventListener('mousemove', onBatchBarDragMove);
        document.removeEventListener('mouseup', endBatchBarDrag);
    };
    const resetBatchBarPos = () => { batchBarPos.value = null; };

    // ================= [ 方法：批量操作 ] =================
    // 批量打包导出已选卡片
    const batchExportSelected = async () => {
        if (selectedIds.value.length === 0) return;
        try {
            // selectedIds 现在存的是前端唯一随机 ID，需映射回真实文件路径再交给主进程
            const exportPaths = library.value
                .filter(item => selectedIds.value.includes(item.id))
                .map(item => item.path);
            const res = await window.electronAPI.exportBatchPackage(exportPaths);
            if (res.success) {
                nativeAlert(`批量导出成功！\n共导出 ${res.count} 张卡片至:\n${res.exportDir}`, 'info');
                clearSelection();
            } else if (res.error !== "用户取消操作") {
                nativeAlert(`导出失败: ${res.error}`, 'error');
            }
        } catch (e) {
            nativeAlert(`发生错误: ${e.message}`, 'error');
        }
    };

    // 🗑️ 批量删除：将选中的卡片批量移入全局回收站（安全可找回，与 Delete 键逻辑一致）
    const batchDeleteSelected = async () => {
        if (selectedIds.value.length === 0) return;
        const ok = await confirmDialog(
            `确定要将选中的 ${selectedIds.value.length} 张卡片移入回收站吗？\n` +
            `(文件将放入全局回收站 jsTavern_Trash，支持手动找回)`
        );
        if (!ok) return;
        const items = library.value.filter(i => selectedIds.value.includes(i.id));
        const paths = items.map(i => i.path);
        if (paths.length === 0) return;
        // （删除原 openCardInList 预计算——部分成功场景下需按实际删除项重算）
        if (!window.electronAPI || typeof window.electronAPI.trashFiles !== 'function') {
            return nativeAlert('当前环境不支持批量删除，请使用 Electron 版。', 'warning');
        }
        const res = await window.electronAPI.trashFiles(paths);
        if (res && res.success) {
            // 🔧 按实际删除结果过滤内存与选中列表（失败项保留，与磁盘一致）
            const failedPaths = new Set((res.failed || []).map(f => f.path));
            const deletedItems = items.filter(i => !failedPaths.has(i.path));
            if (deletedItems.length === 0) {
                return nativeAlert('全部卡片移入回收站失败（可能被其他程序占用），未做任何更改。', 'error');
            }
            const deletedIds = new Set(deletedItems.map(i => i.id));
            library.value = library.value.filter(i => !deletedIds.has(i.id));
            selectedIds.value = selectedIds.value.filter(id => !deletedIds.has(id));
            // 当前打开的卡片仅在「确实被删除」时才关闭编辑面板
            if (cardData.value && deletedItems.some(i => i.data === cardData.value)) reset();
            deleteCardOverlays(deletedItems.map(i => i.path)); // 🔧 清理覆盖层，防配置膨胀
            await cleanupEmptyCategories(); // 🧹 自动清理空分组
            if (failedPaths.size > 0) {
                const names = [...failedPaths].map(p => p.split(/[\\/]/).pop()).join('、');
                nativeAlert(`✅ 已将 ${deletedItems.length} 张卡片移入回收站；${failedPaths.size} 张失败（可能被占用）：\n${names}`, 'warning');
            } else {
                nativeAlert(`✅ 已将 ${deletedItems.length} 张卡片移入回收站！`, 'info');
            }
        } else {
            nativeAlert(`批量删除失败: ${(res && res.error) || '未知错误'}`, 'error');
        }
    };

    // 批量添加标签（多张卡片：内存 customTags + 原生 data.tags 双写，并逐张物理落盘）
    const batchAddTag = async () => {
        if (selectedIds.value.length === 0) return;

        const newTag = await appPrompt(`为选中的 ${selectedIds.value.length} 张卡片批量添加标签:\n(多个标签用逗号分隔)`, '');

        if (newTag && newTag.trim() !== '') {
            const tagsToAdd = newTag.split(',').map(t => t.trim()).filter(t => t);
            let savedCount = 0;

            for (const item of library.value) {
                if (!selectedIds.value.includes(item.id)) continue;
                let isModified = false;

                // 1. 内存 customTags
                const newCustom = Array.from(new Set([...(item.customTags || []), ...tagsToAdd]));
                if (newCustom.length !== item.customTags?.length) {
                    item.customTags = newCustom;
                    isModified = true;
                }

                // 2. 原生 data.tags
                const dataLayer = item.data?.data || item.data || {};
                if (!Array.isArray(dataLayer.tags)) dataLayer.tags = [];
                const newDataTags = Array.from(new Set([...dataLayer.tags, ...tagsToAdd]));
                if (newDataTags.length !== dataLayer.tags.length) {
                    dataLayer.tags = newDataTags;
                    isModified = true;
                }

                // 3. 统一持久化中枢：写覆盖层 + 物理落盘
                if (isModified) {
                    await persistCardUpdate(item, { tags: item.customTags, category: item.category });
                    savedCount++;
                }
            }

            await nativeAlert(`批量打标签成功！并成功物理保存了 ${savedCount} 张`, 'info');
            clearSelection();
        }
    };

    return {
        handleCardClick, toggleSelection,
        batchBarStyle, startBatchBarDrag, resetBatchBarPos,
        batchExportSelected, batchDeleteSelected, batchAddTag
    };
}