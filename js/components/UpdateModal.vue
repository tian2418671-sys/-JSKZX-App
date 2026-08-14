<!--
  UpdateModal 版本更新检测弹窗（子组件）
  info 为 updateInfo 对象（currentVersion/latestVersion/releaseNotes/downloadUrl）
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
                <button @click="$emit('close')" class="text-zinc-400 hover:text-white transition text-xl">✕</button>
            </div>

            <div class="p-5 flex-1 max-h-[40vh] overflow-y-auto custom-scrollbar bg-zinc-950/30">
                <h4 class="text-xs font-bold text-zinc-400 mb-2">📄 更新日志 (Release Notes):</h4>
                <div class="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {{ info.releaseNotes || '作者很懒，没有留下更新说明...' }}
                </div>
            </div>

            <div class="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between shrink-0">
                <span class="text-[10px] text-zinc-500">点击下载后，将打开浏览器前往 GitHub Releases 页面。</span>
                <div class="flex gap-2">
                    <button @click="$emit('close')" class="px-4 py-1.5 theme-element hover:bg-zinc-700 border border-zinc-700 rounded text-xs transition">
                        下次再说
                    </button>
                    <button @click="$emit('download')" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow transition flex items-center gap-1">
                        ⬇️ 前往下载更新
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
    emits: ['close', 'download']
};
</script>
