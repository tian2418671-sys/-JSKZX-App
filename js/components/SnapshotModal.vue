<!--
  SnapshotModal 历史快照弹窗（子组件）
  展示指定卡片 .bak_history 内的历史快照列表，支持一键恢复/打开文件夹
  逻辑留在父级（restoreSnapshot/openSnapshotFolder），本组件纯 UI + emits
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="$emit('close')">
            <div class="w-[620px] max-w-[92vw] max-h-[80vh] flex flex-col theme-surface border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden">

                <!-- 头部 -->
                <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60 bg-zinc-900/80">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-base">📸</span>
                        <div class="min-w-0">
                            <h3 class="text-sm font-bold text-amber-400 truncate">历史快照</h3>
                            <p class="text-[10px] text-zinc-500 truncate font-mono" :title="cardPath">{{ cardName }} · {{ snapshots.length }} 份</p>
                        </div>
                    </div>
                    <button @click="$emit('close')" class="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition text-sm">✕</button>
                </div>

                <!-- 快照列表 -->
                <div class="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    <div v-if="snapshots.length === 0" class="text-center py-12 text-zinc-500 flex flex-col items-center gap-2">
                        <span class="text-4xl opacity-30">🗂️</span>
                        <p class="text-xs">该卡片还没有任何历史快照</p>
                        <p class="text-[10px] opacity-70">每次「覆盖保存」前会自动备份旧版本到 .bak_history</p>
                    </div>

                    <div v-for="(snap, idx) in snapshots" :key="snap.path" class="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/60 rounded-lg hover:border-amber-500/40 transition group">
                        <span class="text-zinc-500 text-sm shrink-0">{{ idx + 1 }}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-zinc-200 font-mono truncate" :title="snap.fileName">{{ formatTime(snap.mtimeMs) }}</span>
                                <span v-if="snap.isManual" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">手动</span>
                            </div>
                            <div class="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">{{ snap.fileName }}</div>
                        </div>
                        <span class="text-[10px] text-zinc-500 font-mono shrink-0">{{ formatSize(snap.size) }}</span>
                        <button @click="$emit('restore', snap)" class="shrink-0 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded transition" title="把当前卡片恢复为该快照内容">↩️ 恢复</button>
                        <button @click="$emit('delete', snap)" class="shrink-0 px-2.5 py-1 bg-zinc-700 hover:bg-rose-600 hover:text-white text-[11px] text-zinc-400 rounded transition" title="删除这条快照（不可恢复）">🗑️</button>
                    </div>
                </div>

                <!-- 底部 -->
                <div class="flex items-center justify-between px-4 py-3 border-t border-zinc-700/60 bg-zinc-900/80">
                    <button @click="$emit('open-folder')" class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[11px] text-zinc-300 transition flex items-center gap-1.5">
                        📂 打开快照文件夹
                    </button>
                    <button @click="$emit('close')" class="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[11px] text-zinc-200 transition">
                        关闭
                    </button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'SnapshotModal',
    props: {
        show: { type: Boolean, default: false },
        snapshots: { type: Array, default: () => [] },
        cardName: { type: String, default: '' },
        cardPath: { type: String, default: '' }
    },
    emits: ['close', 'restore', 'delete', 'open-folder'],
    methods: {
        formatTime(ms) {
            if (!ms) return '未知时间';
            try {
                return new Date(ms).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch (e) { return String(ms); }
        },
        formatSize(bytes) {
            if (!bytes && bytes !== 0) return '';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        }
    }
};
</script>
