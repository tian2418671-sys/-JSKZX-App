<!--
  UpdateModal 版本更新弹窗（OTA 自动更新：检测 → 下载进度 → 重启安装）
  info 来自主进程 update-available 事件（currentVersion/latestVersion/releaseNotes/downloadUrl）
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" @click.self="$emit('close')">
        <div class="theme-surface border border-emerald-500/50 rounded-xl max-w-lg w-full flex flex-col shadow-[0_0_40px_rgba(16,185,129,0.15)] overflow-hidden">

            <div class="px-5 py-4 bg-gradient-to-r from-emerald-900/40 to-transparent border-b border-zinc-800 flex items-start justify-between shrink-0">
                <div>
                    <h3 class="text-lg font-bold text-emerald-400 flex items-center gap-2 mb-1">
                        <span>🚀 发现新版本可用！</span>
                    </h3>
                    <div class="flex items-center gap-2 text-xs font-mono">
                        <span class="text-zinc-500 line-through">v{{ info.currentVersion }}</span>
                        <span class="text-emerald-500">➔</span>
                        <span class="text-white font-bold bg-emerald-600 px-1.5 py-0.5 rounded">v{{ info.latestVersion }}</span>
                    </div>
                </div>
                <button v-if="status !== 'downloading'" @click="$emit('close')" class="text-zinc-400 hover:text-white transition text-xl">✕</button>
            </div>

            <div class="p-5 flex-1 max-h-[40vh] overflow-y-auto custom-scrollbar bg-zinc-950/30">
                <h4 class="text-xs font-bold text-zinc-400 mb-2">📄 更新日志:</h4>
                <!-- 纯文本渲染 releaseNotes，避免 v-html 引入 XSS -->
                <div class="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {{ info.releaseNotes || '作者很懒，没有留下更新说明...' }}
                </div>
            </div>

            <!-- 下载中：进度条 -->
            <div v-if="status === 'downloading'" class="px-5 py-4 border-t border-zinc-800 bg-zinc-900/90">
                <div class="flex justify-between text-xs text-emerald-400 mb-2">
                    <span>正在下载更新包...</span>
                    <span>{{ Math.round(progress.percent || 0) }}%</span>
                </div>
                <div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                    <div class="bg-emerald-500 h-2.5 transition-all duration-300" :style="`width: ${progress.percent || 0}%`"></div>
                </div>
                <div class="text-[10px] text-zinc-500 mt-2 flex justify-between">
                    <span>已下载: {{ formatMB(progress.transferred) }} / {{ formatMB(progress.total) }}</span>
                    <span>速度: {{ formatSpeed(progress.bytesPerSecond) }}</span>
                </div>
            </div>

            <!-- 就绪/待下载 -->
            <div v-else class="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between shrink-0">
                <span class="text-[10px] text-zinc-500">
                    {{ status === 'ready' ? '下载完成，重启后即刻体验新版本。' : '一键自动下载并升级，无需跳转浏览器。' }}
                </span>
                <div class="flex gap-2">
                    <button v-if="status === 'available'" @click="$emit('close')" class="px-4 py-1.5 theme-element hover:bg-zinc-700 border border-zinc-700 rounded text-xs transition">
                        下次再说
                    </button>
                    <button v-if="status === 'available'" @click="startDownload" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow transition flex items-center gap-1">
                        ⬇️ 立即更新
                    </button>
                    <button v-if="status === 'ready'" @click="installNow" class="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded shadow transition flex items-center gap-1">
                        🔄 重启并安装
                    </button>
                </div>
            </div>

        </div>
    </div>
</template>

<script>
export default {
    name: 'UpdateModal',
    props: {
        show: { type: Boolean, default: false },
        info: { type: Object, default: () => ({}) }
    },
    emits: ['close'],
    data() {
        return {
            status: 'available', // available, downloading, ready
            progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
        };
    },
    mounted() {
        // 绑定预加载脚本传来的 OTA 事件
        if (window.electronAPI && typeof window.electronAPI.onUpdateProgress === 'function') {
            window.electronAPI.onUpdateProgress((progressObj) => {
                this.status = 'downloading';
                this.progress = progressObj || { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
            });
        }
        if (window.electronAPI && typeof window.electronAPI.onUpdateDownloaded === 'function') {
            window.electronAPI.onUpdateDownloaded(() => {
                this.status = 'ready';
            });
        }
        if (window.electronAPI && typeof window.electronAPI.onUpdateError === 'function') {
            window.electronAPI.onUpdateError((err) => {
                this.status = 'available';
                // 用原生提示避免重复弹窗
                if (window.electronAPI.showMessage) {
                    window.electronAPI.showMessage({
                        type: 'error',
                        title: '更新下载失败',
                        message: String(err || '未知错误'),
                        buttons: ['确定']
                    });
                } else {
                    alert('更新下载失败: ' + String(err || ''));
                }
            });
        }
    },
    methods: {
        startDownload() {
            this.status = 'downloading';
            if (window.electronAPI.downloadUpdate) window.electronAPI.downloadUpdate();
        },
        installNow() {
            if (window.electronAPI.installUpdate) window.electronAPI.installUpdate();
        },
        formatMB(bytes) {
            const mb = (Number(bytes) || 0) / 1024 / 1024;
            return mb >= 1 ? mb.toFixed(2) + ' MB' : (Number(bytes) || 0).toFixed(0) + ' KB';
        },
        formatSpeed(bps) {
            const mb = (Number(bps) || 0) / 1024 / 1024;
            return mb >= 1 ? mb.toFixed(2) + ' MB/s' : ((Number(bps) || 0) / 1024).toFixed(1) + ' KB/s';
        }
    }
};
</script>
