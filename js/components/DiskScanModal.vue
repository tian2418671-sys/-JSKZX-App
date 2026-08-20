<!--
  DiskScanModal 全盘深度打捞引擎 V3——真伪鉴定版
  读取盘符 → 选择磁盘/文件夹 → 主进程并发递归遍历 → 🔬 真伪鉴定（内嵌数据块黄金标准）
  → 实时进度 → 确认真卡列表预览 → 收编入库（成功/跳过/失败明细反馈）
  依赖 preload API：getWindowsDrives / scanTargetFolder / onScanProgress / importExternalCards / showMessage

  V3 与旧版差异：
  - 主进程验证阶段只返回「内嵌合法 chara/ccv3 数据块」的真卡（壁纸/截图/UI贴图被剔除）；
  - 扫描完成页展示真卡列表（角色名 + 体积 + 格式徽标），收编前可肉眼复核；
  - 导入反馈带 skipped / failed 分项明细（旧版只有成功数）。
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
        <div class="theme-surface border border-emerald-500/30 rounded-xl max-w-2xl w-full flex flex-col shadow-[0_0_50px_rgba(16,185,129,0.1)] overflow-hidden max-h-[90vh]">

            <div class="px-5 py-4 bg-gradient-to-r from-emerald-900/40 to-transparent border-b border-zinc-800 flex items-start justify-between shrink-0">
                <div>
                    <h3 class="text-lg font-bold text-emerald-400 flex items-center gap-2 mb-1">
                        <span>🛰️ 全盘深度打捞引擎</span>
                        <span v-if="isScanning" class="flex h-3 w-3 relative">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                    </h3>
                    <p class="text-xs text-zinc-400">穿透全盘角落挖出角色卡，并逐张鉴定真伪（只收真卡，壁纸贴图一律剔除）。</p>
                </div>
                <button v-if="!isScanning && !isImporting" @click="$emit('close')" class="text-zinc-500 hover:text-white transition text-xl">✕</button>
            </div>

            <div class="p-6 flex-1 bg-zinc-950/50 overflow-y-auto custom-scrollbar">

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

                    <div class="p-4 bg-zinc-900 rounded border border-zinc-800 space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" v-model="useSizeFilter" class="w-4 h-4 text-emerald-500 rounded bg-zinc-800 border border-zinc-700 focus:ring-emerald-500">
                            <span class="text-sm text-zinc-300">体积预过滤（拦截 &lt; 40KB 的图标/碎图，加速鉴定）</span>
                        </label>
                        <p class="text-[11px] text-zinc-500 leading-relaxed">
                            🔬 <span class="text-emerald-400 font-medium">真伪鉴定引擎</span>：无论是否勾选体积过滤，所有候选都会经过「内嵌数据块」黄金标准验证——
                            PNG 必须含合法 chara/ccv3 块、JSON 必须是角色卡结构，壁纸/截图/游戏贴图不会被误捞。
                        </p>
                        <p class="text-[11px] text-zinc-500 leading-relaxed">
                            📂 <span class="text-sky-400 font-medium">库内排除</span>：当前库目录内的卡片及与库内同名的副本会自动跳过，
                            只打捞<span class="text-white font-medium">库外的新卡</span>。
                            <span v-if="!currentLibraryPath" class="text-amber-400">当前未打开角色库——扫描可正常进行，收编时会引导你先选择一个角色库文件夹。</span>
                        </p>
                    </div>
                </div>

                <!-- ② 扫描/鉴定中：雷达动画 + 实时进度 -->
                <div v-else-if="isScanning" class="flex flex-col items-center justify-center py-10 space-y-6">
                    <div class="relative w-32 h-32 rounded-full border-2 border-emerald-500/30 overflow-hidden flex items-center justify-center bg-emerald-900/10 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <div class="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.5)_360deg)] animate-[spin_2s_linear_infinite] rounded-full origin-center" style="clip-path: polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0)"></div>
                        <div class="absolute w-full h-[1px] bg-emerald-500/50 top-1/2"></div>
                        <div class="absolute h-full w-[1px] bg-emerald-500/50 left-1/2"></div>
                        <span class="text-3xl relative z-10 drop-shadow-md">🚀</span>
                    </div>

                    <div class="text-center w-full max-w-md">
                        <div class="text-emerald-400 font-bold text-lg mb-1">{{ confirmedCount }} 张真卡</div>
                        <div class="text-xs text-zinc-500 mb-3">已通过真伪鉴定</div>
                        <div class="w-full bg-zinc-800 rounded-full h-1.5 mb-2 overflow-hidden">
                            <div class="bg-emerald-500 h-1.5 w-full animate-pulse"></div>
                        </div>
                        <div class="text-[10px] font-mono text-zinc-400 truncate text-center w-full" :title="currentStatusText">
                            {{ currentStatusText || '正在初始化底层检索模块...' }}
                        </div>
                    </div>
                </div>

                <!-- ③ 扫描完成：验证统计 + 真卡列表 + 收编入库 -->
                <div v-else-if="scanFinished" class="flex flex-col items-center text-center">
                    <div class="text-5xl mb-3">{{ foundFiles.length > 0 ? '🎉' : '🤷' }}</div>
                    <h3 class="text-xl font-bold text-white mb-2">{{ foundFiles.length > 0 ? '打捞完成！' : '未发现角色卡' }}</h3>
                    <p class="text-sm text-zinc-400 mb-4">
                        在 <span class="text-emerald-400 font-mono">{{ scannedPath }}</span> 中
                        <span v-if="scannedCount > 0">检查了 {{ scannedCount }} 个候选文件，</span>
                        <span class="text-white font-bold">发现 {{ foundFiles.length }} 张库外新真卡</span>
                        <span v-if="inLibraryCount > 0" class="text-sky-400">（自动跳过 {{ inLibraryCount }} 张已在当前库/同名副本）</span>
                        <span v-if="rejectedCount > 0" class="text-zinc-500">，剔除 {{ rejectedCount }} 个伪卡/无关图片</span>
                    </p>

                    <!-- 真卡列表（可肉眼复核后再收编） -->
                    <div v-if="foundFiles.length > 0" class="w-full text-left mb-5">
                        <div class="text-xs font-bold text-zinc-400 mb-2 flex items-center justify-between">
                            <span>📋 确认为真卡的库外新卡（{{ foundFiles.length }}）：</span>
                            <span class="text-[10px] text-zinc-500 font-normal">已剔除壁纸/截图/贴图与库内已有卡</span>
                        </div>
                        <div class="max-h-56 overflow-y-auto custom-scrollbar bg-zinc-900/80 rounded border border-zinc-800 divide-y divide-zinc-800/60">
                            <div v-for="card in displayFiles" :key="card.path" class="px-3 py-2 flex items-center gap-2.5 text-xs hover:bg-zinc-800/50 transition">
                                <span class="shrink-0" :title="card.kind">{{ kindIcon(card.kind) }}</span>
                                <span class="font-bold text-zinc-200 truncate flex-1 min-w-0" :title="card.name">{{ card.name }}</span>
                                <span class="text-zinc-500 font-mono shrink-0">{{ formatSize(card.size) }}</span>
                                <span class="text-zinc-600 truncate max-w-[30%] shrink-0 hidden sm:block" :title="card.fileName">📁 {{ card.fileName }}</span>
                            </div>
                            <div v-if="foundFiles.length > displayFiles.length" class="px-3 py-2 text-center text-[11px] text-zinc-500">
                                ... 以及另外 {{ foundFiles.length - displayFiles.length }} 张（收编时全部包含）
                            </div>
                        </div>
                    </div>

                    <div v-if="foundFiles.length > 0" class="flex gap-3">
                        <button @click="reset" class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition">放弃并重扫</button>
                        <button @click="importCards" :disabled="isImporting"
                                class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow transition flex items-center gap-2 disabled:opacity-60">
                            📥 {{ isImporting ? '正在收编...' : `全部收编入库（${foundFiles.length} 张）` }}
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
        // 当前卡片库路径（收编时的拷贝目标 + 扫描时的排除目录）
        currentLibraryPath: { type: String, default: '' },
        // 打开/切换角色库目录的流程函数（无库点收编时引导用户选库后自动继续）
        openLibrary: { type: Function, default: null }
    },
    emits: ['close', 'imported'],
    data() {
        return {
            drives: [],
            useSizeFilter: true, // 默认开启体积预过滤（跳过 <40KB 的贴图/图标，加速鉴定）
            isScanning: false,
            scanFinished: false,
            isImporting: false,
            scannedPath: '',
            foundFiles: [],      // V3：主进程验证后的真卡对象数组 [{path,fileName,name,kind,size}]
            scannedCount: 0,     // 候选总数（验证前）
            rejectedCount: 0,    // 被剔除的伪卡数
            inLibraryCount: 0,   // 已在当前库中被排除的文件数（库内卡 + 同名副本）
            confirmedCount: 0,   // 扫描中实时累计的真卡数（进度展示）
            currentStatusText: '',
            PREVIEW_LIMIT: 200   // 列表预览上限（渲染保护，收编不受限）
        };
    },
    computed: {
        displayFiles() {
            return this.foundFiles.slice(0, this.PREVIEW_LIMIT);
        }
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
                // 验证阶段心跳携带 count=已确认真卡数，实时刷新数字
                if (data && typeof data.count === 'number' && data.count > this.confirmedCount) {
                    this.confirmedCount = data.count;
                }
            });
        }
    },
    methods: {
        kindIcon(kind) {
            if (kind === 'json') return '📄';
            if (kind === 'webp') return '🖼️';
            return '🎴';
        },
        formatSize(bytes) {
            if (!bytes && bytes !== 0) return '';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
            return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        },
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
            this.scannedCount = 0;
            this.rejectedCount = 0;
            this.inLibraryCount = 0;
            this.confirmedCount = 0;
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
            this.confirmedCount = 0;
            this.currentStatusText = '正在唤醒底层 I/O 线程...';
            try {
                // 呼叫主进程：targetPath 为 null 时主进程弹原生文件夹选择器；盘符走白名单授权校验
                // V3.1：第 3 参传当前库路径——库内卡与同名副本在扫描阶段即被排除（不再"扫出一堆自家卡"）
                // V3：返回 { path, files:[{path,fileName,name,kind,size}], scanned, rejected, inLibrary }
                const result = await window.electronAPI.scanTargetFolder(targetPath, this.useSizeFilter, this.currentLibraryPath || null);
                if (result && result.path) {
                    this.scannedPath = result.path;
                    this.foundFiles = Array.isArray(result.files) ? result.files : [];
                    this.scannedCount = result.scanned || 0;
                    this.rejectedCount = result.rejected || 0;
                    this.inLibraryCount = result.inLibrary || 0;
                    this.confirmedCount = this.foundFiles.length;
                } else if (result && result.error) {
                    this.alertMsg('扫描失败: ' + result.error, 'error');
                }
            } catch (err) {
                console.error('扫描异常:', err);
                this.alertMsg('扫描异常中断: ' + ((err && err.message) || err), 'error');
            } finally {
                this.isScanning = false;
                this.scanFinished = true;
            }
        },
        // 收编入库：把鉴定后的真卡物理复制到当前库目录（同名跳过、单文件失败不中断），并通知父级追加入库
        // 🚀 走 sys:importExternalCards 专属收编通道——源路径为全盘检索结果不校验白名单，
        //    解决"外部磁盘角落的卡片因路径越界被 readBuffer 拒绝导致无法导入"的问题。
        async importCards() {
            // 🔧 无库引导：扫描不需要库，但收编必须有目标——先引导选择角色库再自动继续
            // （旧版直接弹"无法导入"失败框，正是"一点导入就失败"的主要来源）
            if (!this.currentLibraryPath && typeof this.openLibrary === 'function') {
                const pick = await this.confirmMsg(
                    '尚未打开角色库目录，打捞到的卡片需要收编到一个目标文件夹。\n\n是否现在选择一个文件夹作为你的角色库？\n（选择后将自动继续收编流程）',
                    'question'
                );
                if (pick) {
                    this.currentStatusText = '正在加载角色库目录...';
                    try {
                        await this.openLibrary(); // 完整的选库+扫描+入库流程，完成后 currentLibraryPath 即更新
                    } catch (e) {
                        console.warn('打开角色库流程异常:', e);
                    }
                }
            }
            if (!this.currentLibraryPath) {
                this.alertMsg('当前仍未打开角色库目录，无法导入。\n请先通过顶部「📂 打开本地库」选择一个文件夹，再回到本窗口点击收编。', 'warning');
                return;
            }
            if (this.foundFiles.length === 0) return;
            if (!window.electronAPI || typeof window.electronAPI.importExternalCards !== 'function') {
                this.alertMsg('该功能需要 Electron 桌面环境（请升级到含收编通道的新版本）。', 'warning');
                return;
            }

            this.isImporting = true;
            this.currentStatusText = '正在执行物理文件收编 (突破路径限制)...';
            try {
                // 🔧 剥离 Vue 响应式 Proxy：data 里的 foundFiles 是 reactive 数组，
                // 直接传 IPC 会报 "An object could not be cloned"（Electron structured clone 无法克隆 Proxy）
                const plainFiles = JSON.parse(JSON.stringify(this.foundFiles || []));
                // 调用专属收编通道（目标必须是当前卡片库；源为验证后的真卡对象数组）
                const result = await window.electronAPI.importExternalCards(plainFiles, this.currentLibraryPath);

                if (result && result.success) {
                    const copiedCount = (result.copied || []).length;
                    const skippedCount = (result.skipped || []).length;
                    const failedCount = (result.failed || []).length;

                    let msg = copiedCount > 0
                        ? `🎉 成功将 ${copiedCount} 张真卡收编到当前库！`
                        : '没有新卡片被收编。';
                    if (skippedCount > 0) {
                        const names = result.skipped.slice(0, 5).join('、');
                        msg += `\n📦 ${skippedCount} 张与库内同名已跳过（绝不覆盖）${skippedCount > 5 ? `：${names} 等` : `：${names}`}`;
                    }
                    if (failedCount > 0) {
                        msg += `\n⚠️ ${failedCount} 张复制失败（文件被占用或源已移除）。`;
                    }
                    this.alertMsg(msg, failedCount > 0 ? 'warning' : 'info');

                    if (copiedCount > 0) {
                        // 携带复制结果（目标路径数组）通知 App.vue 精准追加入库，无需全库重扫
                        this.$emit('imported', result.copied || []);
                        this.$emit('close');
                    }
                } else {
                    throw new Error((result && result.error) || '收编失败');
                }
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
                window.electronAPI.showMessage({ type, title: '全盘打捞', message, buttons: ['确定'] });
            } else {
                alert(message);
            }
        },
        // 原生确认封装（Electron 中 confirm 静默返回 null，必须走 showMessage 双按钮）
        confirmMsg(message, type = 'question') {
            if (window.electronAPI && typeof window.electronAPI.showMessage === 'function') {
                return window.electronAPI.showMessage({ type, title: '全盘打捞', message, buttons: ['确定', '取消'], cancelId: 1 })
                    .then(r => !!(r && r.response === 0));
            }
            return Promise.resolve(confirm(message));
        }
    }
};
</script>
