<!--
  DiskScanModal 全盘深度检索引擎（Beta）——极客雷达风扫描面板
  读取盘符 → 选择磁盘/文件夹 → 主进程 V2 并发递归扫描 → 实时进度 → 收编入库
  依赖 preload API：getWindowsDrives / scanTargetFolder / onScanProgress / copyToLibrary / showMessage
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
        <div class="theme-surface border border-emerald-500/30 rounded-xl max-w-2xl w-full flex flex-col shadow-[0_0_50px_rgba(16,185,129,0.1)] overflow-hidden">

            <div class="px-5 py-4 bg-gradient-to-r from-emerald-900/40 to-transparent border-b border-zinc-800 flex items-start justify-between shrink-0">
                <div>
                    <h3 class="text-lg font-bold text-emerald-400 flex items-center gap-2 mb-1">
                        <span>🛰️ 全盘深度检索引擎 (Beta)</span>
                        <span v-if="isScanning" class="flex h-3 w-3 relative">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                    </h3>
                    <p class="text-xs text-zinc-400">穿透各种隐藏文件夹，把迷失在电脑各个角落的角色卡强行挖出来。</p>
                </div>
                <button v-if="!isScanning" @click="$emit('close')" class="text-zinc-500 hover:text-white transition text-xl">✕</button>
            </div>

            <div class="p-6 flex-1 bg-zinc-950/50">

                <!-- ① 选择扫描目标 -->
                <div v-if="!isScanning && !scanFinished" class="space-y-6">
                    <div>
                        <h4 class="text-sm font-bold text-zinc-300 mb-3">1. 选择要扫描的本地磁盘：</h4>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="drive in drives" :key="drive" @click="startScan(drive)"
                                    class="px-4 py-3 bg-zinc-800/80 hover:bg-emerald-600/20 border border-zinc-700 hover:border-emerald-500 rounded text-sm font-bold text-zinc-200 transition flex items-center gap-2">
                                💽 {{ drive }}
                            </button>
                            <button @click="startScan()"
                                    class="px-4 py-3 bg-zinc-800/80 hover:bg-emerald-600/20 border border-zinc-700 border-dashed hover:border-emerald-500 rounded text-sm text-zinc-400 hover:text-emerald-400 transition flex items-center gap-2">
                                📁 选择特定文件夹...
                            </button>
                        </div>
                        <p v-if="drives.length === 0" class="text-xs text-zinc-500 mt-2">
                            ⚠️ 未检测到磁盘（请在 Electron 桌面环境中使用此功能，或直接选择特定文件夹）
                        </p>
                    </div>

                    <div class="p-4 bg-zinc-900 rounded border border-zinc-800">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" v-model="useSizeFilter" class="w-4 h-4 text-emerald-500 rounded bg-zinc-800 border-zinc-700 focus:ring-emerald-500">
                            <span class="text-sm text-zinc-300">体积过滤引擎（拦截 &lt; 40KB 的废图/UI贴图，大幅提升准确率）</span>
                        </label>
                    </div>
                </div>

                <!-- ② 扫描中：雷达动画 + 实时进度 -->
                <div v-else-if="isScanning" class="flex flex-col items-center justify-center py-10 space-y-6">
                    <div class="relative w-32 h-32 rounded-full border-2 border-emerald-500/30 overflow-hidden flex items-center justify-center bg-emerald-900/10 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <div class="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.5)_360deg)] animate-[spin_2s_linear_infinite] rounded-full origin-center" style="clip-path: polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0)"></div>
                        <div class="absolute w-full h-[1px] bg-emerald-500/50 top-1/2"></div>
                        <div class="absolute h-full w-[1px] bg-emerald-500/50 left-1/2"></div>
                        <span class="text-3xl relative z-10 drop-shadow-md">🚀</span>
                    </div>

                    <div class="text-center w-full max-w-md">
                        <div class="text-emerald-400 font-bold text-lg mb-1">{{ foundFiles.length }} 张</div>
                        <div class="text-xs text-zinc-500 mb-3">已拦截可疑卡片 (有效率极高)</div>
                        <div class="w-full bg-zinc-800 rounded-full h-1.5 mb-2 overflow-hidden">
                            <div class="bg-emerald-500 h-1.5 w-full animate-pulse"></div>
                        </div>
                        <div class="text-[10px] font-mono text-zinc-400 truncate text-center w-full" :title="currentStatusText">
                            {{ currentStatusText || '正在初始化底层检索模块...' }}
                        </div>
                    </div>
                </div>

                <!-- ③ 扫描完成：结果 + 收编入库 -->
                <div v-else-if="scanFinished" class="flex flex-col items-center py-6 text-center">
                    <div class="text-5xl mb-4">🎉</div>
                    <h3 class="text-xl font-bold text-white mb-2">深度扫描完成！</h3>
                    <p class="text-sm text-zinc-400 mb-6">在 <span class="text-emerald-400 font-mono">{{ scannedPath }}</span> 中挖掘出 <span class="text-white font-bold">{{ foundFiles.length }}</span> 张角色卡。</p>

                    <div v-if="foundFiles.length > 0" class="flex gap-3">
                        <button @click="reset" class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition">放弃并重试</button>
                        <button @click="importCards" :disabled="isImporting"
                                class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow transition flex items-center gap-2 disabled:opacity-60">
                            📥 {{ isImporting ? '正在收编...' : '全部强行收编入库' }}
                        </button>
                    </div>
                    <div v-else>
                        <button @click="reset" class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition">返回重试</button>
                    </div>
                </div>

            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'DiskScanModal',
    props: {
        show: { type: Boolean, default: false },
        // 当前卡片库路径（收编时的拷贝目标）
        currentLibraryPath: { type: String, default: '' }
    },
    emits: ['close', 'imported'],
    data() {
        return {
            drives: [],
            useSizeFilter: true, // 默认开启体积过滤（跳过 <40KB 的贴图/图标）
            isScanning: false,
            scanFinished: false,
            isImporting: false,
            scannedPath: '',
            foundFiles: [],
            currentStatusText: ''
        };
    },
    watch: {
        // 每次打开：重置状态并拉取盘符列表
        show(newVal) {
            if (newVal) {
                this.reset();
                this.loadDrives();
            }
        }
    },
    mounted() {
        // 订阅主进程扫描进度心跳（preload 内部 removeAllListeners 防重复绑定）
        if (window.electronAPI && typeof window.electronAPI.onScanProgress === 'function') {
            window.electronAPI.onScanProgress((data) => {
                if (data && data.status) this.currentStatusText = data.status;
            });
        }
    },
    methods: {
        async loadDrives() {
            if (!window.electronAPI || typeof window.electronAPI.getWindowsDrives !== 'function') return;
            try {
                const drives = await window.electronAPI.getWindowsDrives();
                if (Array.isArray(drives)) this.drives = drives;
            } catch (e) {
                console.error('获取盘符失败:', e);
            }
        },
        reset() {
            this.isScanning = false;
            this.scanFinished = false;
            this.isImporting = false;
            this.foundFiles = [];
            this.currentStatusText = '';
            this.scannedPath = '';
        },
        async startScan(targetPath = null) {
            if (!window.electronAPI || typeof window.electronAPI.scanTargetFolder !== 'function') {
                this.alertMsg('该功能需要 Electron 桌面环境，请使用 npm start 启动应用。', 'warning');
                return;
            }
            this.isScanning = true;
            this.scanFinished = false;
            this.foundFiles = [];
            this.currentStatusText = '正在唤醒底层 I/O 线程...';
            try {
                // 呼叫主进程：targetPath 为 null 时主进程弹原生文件夹选择器；盘符走白名单授权校验
                const result = await window.electronAPI.scanTargetFolder(targetPath, this.useSizeFilter);
                if (result && result.path) {
                    this.scannedPath = result.path;
                    this.foundFiles = result.files || [];
                }
            } catch (err) {
                console.error('扫描异常:', err);
                this.alertMsg('扫描异常中断: ' + ((err && err.message) || err), 'error');
            } finally {
                this.isScanning = false;
                this.scanFinished = true;
            }
        },
        // 收编入库：把扫出的卡片物理复制到当前库目录（同名跳过），并通知父级追加入库
        async importCards() {
            if (!this.currentLibraryPath) {
                this.alertMsg('当前未加载任何卡片库目录，无法导入。请先打开一个卡片存放的文件夹！', 'warning');
                return;
            }
            if (this.foundFiles.length === 0) return;
            if (!window.electronAPI || typeof window.electronAPI.copyToLibrary !== 'function') {
                this.alertMsg('该功能需要 Electron 桌面环境。', 'warning');
                return;
            }

            this.isImporting = true;
            this.currentStatusText = '正在执行物理文件收编...';
            try {
                const copiedFiles = await window.electronAPI.copyToLibrary(this.foundFiles, this.currentLibraryPath);
                this.alertMsg(`成功将 ${copiedFiles.length} 张卡片收编到当前库！`, 'info');
                // 携带复制结果（目标路径数组）通知 App.vue 精准追加入库，无需全库重扫
                this.$emit('imported', copiedFiles);
                this.$emit('close');
            } catch (err) {
                console.error('导入失败:', err);
                this.alertMsg('导入失败: ' + ((err && err.message) || err), 'error');
            } finally {
                this.isImporting = false;
            }
        },
        // 原生提示封装：Electron 中 alert 静默失败，必须走 showMessage；纯浏览器环境回退 alert
        alertMsg(message, type = 'info') {
            if (window.electronAPI && typeof window.electronAPI.showMessage === 'function') {
                window.electronAPI.showMessage({ type, title: '全盘检索', message, buttons: ['确定'] });
            } else {
                alert(message);
            }
        }
    }
};
</script>
