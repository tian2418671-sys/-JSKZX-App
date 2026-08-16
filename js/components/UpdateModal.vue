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
                <!-- 安全富文本渲染：DOMPurify 白名单清洗官方发布说明（GitHub Release body 为 HTML）后再 v-html，纯文本自动回退转义，杜绝 XSS -->
                <div v-if="releaseNotesHtml" class="release-notes text-xs text-zinc-300 leading-relaxed">
                    <div v-html="releaseNotesHtml"></div>
                </div>
                <div v-else class="text-xs text-zinc-500 py-1">作者很懒，没有留下更新说明...</div>
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
import DOMPurify from 'dompurify'; // 发布说明富文本安全清洗（本地依赖，随 Vite 打包，离线可用）

export default {
    name: 'UpdateModal',
    props: {
        show: { type: Boolean, default: false },
        info: { type: Object, default: () => ({}) },
        // 更新错误信号（由 App 层统一收口转发；非空时若正在下载则回退到可重试状态）
        errorMsg: { type: String, default: '' }
    },
    emits: ['close'],
    data() {
        return {
            status: 'available', // available, downloading, ready
            progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
        };
    },
    watch: {
        // 错误信号到达：下载中失败则回退到可重试状态（错误提示由 App 层 nativeAlert 统一展示）
        errorMsg(val) {
            if (val) this.status = 'available';
        }
    },
    computed: {
        // 安全渲染发布说明：官方说明可能是 HTML（GitHub Release body）或纯文本；
        // 含 HTML 标签时经 DOMPurify 白名单清洗后再 v-html；纯文本则转义 + 换行转 <br>，杜绝 XSS
        releaseNotesHtml() {
            const text = this.info?.releaseNotes;
            if (!text) return '';
            const hasHtml = /<[a-z][\s\S]*>/i.test(text);
            if (!hasHtml) {
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                           .replace(/\n/g, '<br>');
            }
            return DOMPurify.sanitize(text, {
                ALLOWED_TAGS: [
                    'b', 'i', 'em', 'strong', 'u', 's', 'br', 'p', 'div', 'span',
                    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
                ],
                ALLOWED_ATTR: [],
                ALLOW_DATA_ATTR: false,
                // 事件属性黑名单兜底（主防线仍是 ALLOWED_ATTR 白名单 = 空，即剥离全部属性）
                FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'oninput', 'onanimationstart', 'onanimationend', 'onpointerdown', 'onpointerup', 'onpointermove', 'ondragstart', 'ondrop']
            });
        }
    },
    mounted() {
        // 绑定预加载脚本传来的 OTA 事件（进度/下载完成；错误事件由 App 层统一收口，避免监听器互相清除）
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
    },
    methods: {
        startDownload() {
            this.status = 'downloading';
            window.electronAPI?.downloadUpdate?.();
        },
        installNow() {
            window.electronAPI?.installUpdate?.();
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

<style scoped>
/* 发布说明富文本排版（DOMPurify 清洗后的 HTML） */
.release-notes :deep(h1),
.release-notes :deep(h2) {
    font-size: 13px;
    font-weight: 700;
    color: #fbbf24;
    margin: 10px 0 6px;
}
.release-notes :deep(h3) {
    font-size: 12px;
    font-weight: 700;
    color: #34d399;
    margin: 8px 0 4px;
}
.release-notes :deep(h4),
.release-notes :deep(h5),
.release-notes :deep(h6) {
    font-size: 11.5px;
    font-weight: 700;
    color: #a5b4fc;
    margin: 6px 0 3px;
}
.release-notes :deep(p) {
    margin: 4px 0;
}
.release-notes :deep(ul),
.release-notes :deep(ol) {
    margin: 4px 0 4px 16px;
    padding: 0;
}
.release-notes :deep(li) {
    margin: 2px 0;
    line-height: 1.6;
}
.release-notes :deep(li)::marker {
    color: #34d399;
}
.release-notes :deep(code) {
    background: rgba(255, 255, 255, 0.08);
    padding: 0 3px;
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    color: #f0abfc;
}
.release-notes :deep(pre) {
    background: rgba(0, 0, 0, 0.4);
    padding: 6px 8px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 6px 0;
    font-size: 11px;
}
.release-notes :deep(blockquote) {
    border-left: 3px solid #f59e0b;
    padding-left: 8px;
    margin: 6px 0;
    color: #d6d3d1;
}
.release-notes :deep(strong) {
    color: #e4e4e7;
    font-weight: 700;
}
.release-notes :deep(hr) {
    border-color: rgba(255, 255, 255, 0.1);
    margin: 8px 0;
}
</style>
