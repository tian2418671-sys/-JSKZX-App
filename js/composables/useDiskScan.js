/**
 * 磁盘卡片扫描组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：全盘/指定目录深度扫描、扫描进度、扫描路径导入、
 * 收编回调、固定目录选择与一键刷新当前库。
 * 共享创库基础设施（parseAndAddCard / processElectronFiles）与共享状态（library / currentFolderPath /
 * cardData / customCategories / appMode）及工具（nativeAlert / showToast / isCategoryKnown / openFromLibrary）
 * 保留在 App.vue 顶层并注入，其余磁盘扫描状态与方法在此定义。
 */
import { ref } from 'vue';

export function useDiskScan({
    library,
    currentFolderPath,
    cardData,
    customCategories,
    appMode,
    nativeAlert,
    showToast,
    isCategoryKnown,
    openFromLibrary,
    parseAndAddCard,
    processElectronFiles
}) {
    const isScanningDisk = ref(false);
    const diskScanProgress = ref({ status: '准备就绪', count: 0 });
    const useSizeFilter = ref(true); // 默认开启体积过滤（跳过 <40KB 的贴图/图标）
    // 🛰️ 全盘深度检索引擎弹窗开关（新的独立 UI，替代旧 runDiskScan 进度蒙版）
    const showDiskScanModal = ref(false);

    // 将扫描到的绝对路径列表导入到库中（追加模式，不清空现有库；并发受限批处理）
    const importScanPaths = async (paths) => {
        let added = 0;
        const CONCURRENCY = 8;
        for (let i = 0; i < paths.length; i += CONCURRENCY) {
            const batch = paths.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(async (absPath) => {
                const name = absPath.split(/[\\/]/).pop() || absPath;
                const isImage = /\.(png|webp)$/i.test(name);
                const file = {
                    name,
                    path: absPath,
                    url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null
                };
                return await parseAndAddCard(file);
            }));
            added += results.filter(Boolean).length;
        }
        return added;
    };

    // 核心扫描执行器
    const runDiskScan = async (mode) => {
        if (!window.electronAPI) {
            return nativeAlert('该功能需要 Electron 桌面环境，请使用 npm start 启动应用。', 'warning');
        }
        isScanningDisk.value = true;
        diskScanProgress.value = { status: '正在初始化扫描引擎...', count: 0 };

        let foundFiles = [];

        // 监听底层发来的扫描进度心跳
        window.electronAPI.onScanProgress((data) => {
            diskScanProgress.value = data;
        });

        try {
            if (mode === 'specific') {
                // 1. 指定盘符/文件夹扫描（主进程弹出原生目录选择器），传递体积过滤开关
                const result = await window.electronAPI.scanTargetFolder(null, useSizeFilter.value);
                if (result && result.files) foundFiles = result.files;

            } else if (mode === 'all') {
                // 2. 暴力全盘扫描
                const drives = await window.electronAPI.getWindowsDrives();
                diskScanProgress.value.status = `共检测到 ${drives.length} 个本地磁盘，准备遍历...`;

                for (const drive of drives) {
                    diskScanProgress.value.status = `正在深度扫描磁盘: ${drive}`;
                    const result = await window.electronAPI.scanTargetFolder(drive, useSizeFilter.value);
                    if (result && result.files) {
                        foundFiles = foundFiles.concat(result.files);
                    }
                }
            }

            if (foundFiles.length === 0) {
                nativeAlert('扫描结束，未在指定区域发现新的 PNG 角色卡文件。', 'info');
            } else {
                diskScanProgress.value.status = `✅ 扫描完成！共发现 ${foundFiles.length} 张卡片，准备导入...`;

                // 将扫描到的卡片路径逐个解析并追加进库（未识别的文件自动跳过）
                const addedCount = await importScanPaths(foundFiles);
                diskScanProgress.value.status = `✅ 已成功导入 ${addedCount} 张角色卡！`;

                nativeAlert(`全盘/指定扫描完成！\n共提取 ${foundFiles.length} 个角色卡文件，成功导入 ${addedCount} 张。\n（无法识别的文件已自动跳过）`, 'info');
            }
        } catch (err) {
            console.error("扫描失败:", err);
            nativeAlert('扫描过程中发生异常，详情请查看控制台。', 'error');
        } finally {
            isScanningDisk.value = false;
        }
    };

    // 🛰️ 全盘检索收编回调：把复制到当前库的卡片精准追加入库（不清空现有库），并 Toast 反馈
    const handleScanImported = async (copiedFiles) => {
        if (!copiedFiles || copiedFiles.length === 0) return;
        try {
            const added = await importScanPaths(copiedFiles);
            showToast(`🛰️ 已收编 ${added} 张卡片到当前库！`, 'success', 4000);
        } catch (err) {
            console.error('收编入库失败:', err);
            nativeAlert('收编入库失败: ' + (err && err.message || err), 'error');
        }
    };

    // 按钮绑定的点击事件：通过主进程弹出原生文件夹选择框
    const selectFixedDirectory = async () => {
        if (!window.electronAPI) {
            return nativeAlert("该功能需要 Electron 桌面环境，请使用 npm start 启动应用。", 'warning');
        }
        const result = await window.electronAPI.selectFolder();
        if (result) {
            // 【修复】打开角色库目录后自动切换到角色卡模式，界面立即显示角色卡列表
            appMode.value = 'characters';
            await processElectronFiles(result);
        }
    };

    // 🔄 重新扫描当前库目录（不弹目录选择框），解决"手动放入文件夹里的新卡不读取"问题
    const refreshLibrary = async () => {
        if (!window.electronAPI) {
            return nativeAlert("该功能需要 Electron 桌面环境，请使用 npm start 启动应用。", 'warning');
        }
        if (!currentFolderPath.value) {
            return nativeAlert("尚未打开角色库目录，请先点击「📂 打开本地库」。", 'warning');
        }
        if (typeof window.electronAPI.rescanLibrary !== 'function') {
            return nativeAlert("当前版本不支持一键刷新目录，请更新到最新版。", 'warning');
        }
        const prevCardPath = cardData.value ? (library.value.find(i => i.data === cardData.value)?.path || null) : null;
        const result = await window.electronAPI.rescanLibrary(currentFolderPath.value);
        if (result && result.files) {
            appMode.value = 'characters';
            // 🚀 增量刷新（方案 B）：按 path+mtime 差分，复用未变化卡片对象（不重新读盘解析），
            // 只对新增/修改的卡片走完整解析——千卡库刷新从全量重载降为增量，保留用户自定义标签/分类
            const oldMap = new Map(library.value.map(c => [c.path, c]));
            const toParse = [];
            const next = [];
            for (const f of result.files) {
                const old = oldMap.get(f.path);
                if (old && Number(old._mtime) === Number(f.mtime)) {
                    next.push(old); // 未变化：直接复用内存对象（含用户自定义状态）
                } else {
                    toParse.push(f); // 新增 / mtime 变化：走完整解析
                }
            }
            // 释放被物理删除卡片的 blob URL（不在 result.files 里 → 旧 blob 无人引用）
            const keptPaths = new Set(next.map(c => c.path));
            library.value.forEach(c => {
                if (!keptPaths.has(c.path) && c.avatar && typeof c.avatar === 'string' && c.avatar.startsWith('blob:')) {
                    try { URL.revokeObjectURL(c.avatar); } catch (e) { /* 忽略 */ }
                }
            });
            library.value = next;
            // 📁 物理子文件夹 = 分组：合并新增分组
            if (Array.isArray(result.categories)) {
                result.categories.forEach(cat => {
                    if (cat && cat.trim() !== '' && !customCategories.value.includes(cat) && !isCategoryKnown(cat)) {
                        customCategories.value.push(cat);
                    }
                });
            }
            // 并发受限批处理解析新增/变化文件
            const CONCURRENCY = 8;
            for (let i = 0; i < toParse.length; i += CONCURRENCY) {
                const batch = toParse.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(file => parseAndAddCard(file)));
            }
            // 刷新后尽量保持当前打开卡片的编辑状态（按路径重新绑定新解析出的对象）
            if (prevCardPath && cardData.value) {
                const reopen = library.value.find(i => i.path === prevCardPath);
                if (reopen) openFromLibrary(reopen);
            }
            showToast(`目录已刷新，共加载 ${library.value.length} 张卡片。`, 'success');
        } else if (result && result.error) {
            nativeAlert(result.error, 'error');
        }
    };

    return {
        isScanningDisk, diskScanProgress, useSizeFilter, showDiskScanModal,
        runDiskScan, handleScanImported, selectFixedDirectory, refreshLibrary
    };
}