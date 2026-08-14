<!--
  WbGraphModal 世界书词条逻辑关联图谱弹窗（子组件）
  ⚠️ ECharts 渲染逻辑保留在父级，容器固定 id="wb-graph-container"
     父组件通过 document.getElementById('wb-graph-container') 初始化图表
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" @click.self="$emit('close')">
        <div class="bg-zinc-950 border border-zinc-700/80 rounded-xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-amber-500/10">
                <div class="flex items-center gap-2">
                    <span class="text-base font-bold text-amber-500">🌐 世界书词条逻辑关联图谱</span>
                    <span class="text-xs text-zinc-400 font-mono">（紫节点: 常驻词条 | 橙节点: 触发词条 | 点击节点跳转）</span>
                </div>
                <button @click="$emit('close')" class="text-zinc-400 hover:text-white text-lg">✕</button>
            </div>

            <div class="flex-1 w-full relative">
                <div id="wb-graph-container" class="w-full h-full"></div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'WbGraphModal',
    props: {
        show: { type: Boolean, default: false }
    },
    emits: ['close']
};
</script>
