<!--
  DedupeModal 智能版本查重中心弹窗（子组件）
  查重扫描/清理逻辑留在父级，本组件展示聚类结果 + emits 操作
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" @click.self="$emit('close')">
        <div class="bg-zinc-950 border border-zinc-700 rounded-xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl">

            <!-- 弹窗头部 -->
            <div class="px-5 py-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shrink-0 rounded-t-xl">
                <h3 class="text-lg font-bold text-amber-400 flex items-center gap-2">
                    <span>🔍 智能版本查重中心</span>
                    <span class="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                        发现 {{ groups.length }} 组多胞胎
                    </span>
                </h3>
                <button @click="$emit('close')" class="text-zinc-400 hover:text-white transition text-xl">✕</button>
            </div>

            <!-- 查重聚类列表 (滚动区) -->
            <div class="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6">
                <div v-for="(group, gIndex) in groups" :key="gIndex" class="bg-zinc-900/50 border border-zinc-700/80 rounded-xl p-4">

                    <!-- 组标题 -->
                    <div class="mb-3 flex items-center justify-between">
                        <div class="text-sm font-bold text-white flex items-center gap-2">
                            🎎 角色名: <span class="text-amber-400 text-lg">『{{ group.name }}』</span>
                        </div>
                        <span class="text-xs text-zinc-500">检测到 {{ group.cards.length }} 个重名/历史版本</span>
                    </div>

                    <!-- 组内卡片横向对比视图 -->
                    <div class="flex gap-4 overflow-x-auto custom-scrollbar pt-3 pb-2">
                        <div v-for="(c, cIndex) in group.cards" :key="cIndex"
                             class="flex-shrink-0 w-72 bg-zinc-800/80 border rounded-lg p-3 flex flex-col transition relative"
                             :class="cIndex === 0 ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-zinc-700'">

                            <div v-if="cIndex === 0" class="absolute -top-3 left-1.5 flex items-center gap-1 bg-emerald-900/80 px-2 py-0.5 rounded-full border border-emerald-500 shadow-md z-10">
                                <span class="text-lg leading-none">👑</span>
                                <span class="text-[10px] text-emerald-400 font-bold">综合最优推荐</span>
                            </div>

                            <div class="flex gap-3 mb-2">
                                <img v-if="c.avatar" :src="c.avatar" class="w-14 h-14 rounded object-cover border border-zinc-700 bg-zinc-900 shrink-0">
                                <div v-else class="w-14 h-14 rounded border border-zinc-700 bg-zinc-900 flex items-center justify-center text-lg shrink-0">🎎</div>
                                <div class="flex flex-col justify-center min-w-0 overflow-hidden">
                                    <span class="text-[10px] text-zinc-400 font-mono truncate" :title="c.path">{{ c.path.split(/[\\/]/).pop() }}</span>
                                    <span class="text-xs font-bold" :class="cIndex === 0 ? 'text-emerald-400' : 'text-zinc-300'">
                                        📝 约 {{ c._tokens }} Tokens
                                    </span>
                                    <span class="text-[10px] text-amber-400/80 truncate">
                                        🕒 {{ c._dateStr || '时间未知' }}
                                    </span>
                                </div>
                            </div>

                            <div class="mb-2 px-2 py-1 rounded text-[10px] text-center font-bold"
                                 :class="{
                                    'bg-zinc-900 text-zinc-500': c._diffType === '推荐版',
                                    'bg-emerald-900/50 text-emerald-400': c._diffType === '可能包含更多设定',
                                    'bg-rose-900/50 text-rose-400': c._diffType === '设定可能有缺失',
                                    'bg-amber-900/50 text-amber-400': c._diffType === '设定细节不同',
                                    'bg-blue-900/50 text-blue-400': c._diffType === '设定完全一致'
                                 }">
                                {{ c._diffType }}
                            </div>

                            <div class="flex-1 mt-1 mb-3">
                                <div class="text-[10px] text-zinc-500 mb-1">系统/自定义标签:</div>
                                <div class="flex flex-wrap gap-1">
                                    <span v-for="tag in (c.customTags || []).slice(0, 4)" :key="tag" class="text-[9px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700">
                                        {{ tag }}
                                    </span>
                                    <span v-if="(c.customTags || []).length > 4" class="text-[9px] text-zinc-500">...</span>
                                    <span v-if="!(c.customTags || []).length" class="text-[9px] text-rose-400/50">无标签</span>
                                </div>
                            </div>

                            <div class="flex gap-1.5 mt-2">
                                <button v-if="cIndex !== 0"
                                        @click="$emit('open-diff', group.cards[0], c)"
                                        class="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 text-xs font-bold rounded shadow transition shrink-0">
                                    🔍 对比差异
                                </button>
                                <button @click="$emit('resolve-group', gIndex, c.path)"
                                        :class="cIndex === 0 ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-zinc-700 hover:bg-zinc-600'"
                                        class="flex-1 py-1.5 text-white text-xs font-bold rounded shadow transition truncate">
                                    <span v-if="cIndex === 0">✅ 保留此版，清理其余</span>
                                    <span v-else>⚠️ 保留旧版，清理其余</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="groups.length === 0" class="h-full flex flex-col items-center justify-center text-zinc-500">
                    <span class="text-5xl opacity-30 mb-4">✨</span>
                    <p>所有冗余卡片已清理完毕！库内非常干净。</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'DedupeModal',
    props: {
        show: { type: Boolean, default: false },
        groups: { type: Array, default: () => [] }
    },
    emits: ['close', 'open-diff', 'resolve-group']
};
</script>
