<!--
  WbSnapshotModal 世界书快照历史与回滚弹窗（子组件）
  快照列表/回滚逻辑留在父级，本组件纯展示 + emits
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" @click.self="$emit('close')">
        <div class="bg-zinc-950 border border-zinc-700/80 rounded-xl max-w-2xl w-full h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-amber-500/10">
                <span class="text-base font-bold text-amber-500">🕒 世界书快照历史</span>
                <button @click="$emit('close')" class="text-zinc-400 hover:text-white text-lg">✕</button>
            </div>
            <div class="px-5 py-2 border-b border-zinc-800 text-xs text-zinc-400 shrink-0">
                目标：<span class="text-amber-400 font-bold">{{ targetName }}</span>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                <div v-if="snapshots.length === 0" class="text-center py-14 text-zinc-500 text-xs">暂无历史快照</div>
                <div v-for="s in snapshots" :key="s.path" class="bg-zinc-900/60 border border-zinc-700/70 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <div class="text-[11px] font-mono text-zinc-300 truncate">{{ s.file }}</div>
                        <div class="text-[10px] text-zinc-500 mt-0.5">{{ formatTime(s.mtime) }} · {{ formatSize(s.size) }}</div>
                    </div>
                    <button @click="$emit('restore', s)" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shrink-0 transition" title="把当前世界书恢复为该快照内容">回滚</button>
                    <button @click="$emit('delete', s)" class="px-2.5 py-1.5 bg-zinc-700 hover:bg-rose-600 hover:text-white text-zinc-400 text-xs rounded shrink-0 transition" title="删除这条快照（不可恢复）">🗑️</button>
                </div>
            </div>
            <div class="px-5 py-3 border-t border-zinc-800 text-[10px] text-zinc-500 shrink-0">回滚前自动备份当前版本（已留档内容自动跳过，超量快照自动清理）。</div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'WbSnapshotModal',
    props: {
        show: { type: Boolean, default: false },
        targetName: { type: String, default: '未命名' },
        snapshots: { type: Array, default: () => [] }
    },
    emits: ['close', 'restore', 'delete'],
    methods: {
        formatTime(ms) { try { return new Date(ms).toLocaleString('zh-CN', { hour12: false }); } catch (e) { return ''; } },
        formatSize(n) { if (!n && n !== 0) return ''; return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB'; }
    }
};
</script>
