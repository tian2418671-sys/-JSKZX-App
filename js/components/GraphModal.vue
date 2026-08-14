<!--
  GraphModal 角色宇宙关系图谱弹窗（子组件）
  ⚠️ ECharts 渲染逻辑保留在父级（依赖大量父组件状态），容器固定 id="app-graph-container"
     父组件通过 document.getElementById('app-graph-container') 初始化图表
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-gray-900 flex flex-col">

            <div class="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex flex-wrap justify-between items-center text-white shrink-0 gap-3 text-xs">
                <div class="flex items-center gap-3 flex-wrap">
                    <h3 class="font-bold flex items-center gap-1.5 text-sm">🌌 角色宇宙图谱</h3>

                    <div class="flex bg-gray-800 rounded p-0.5 border border-gray-700">
                        <button @click="$emit('update-graph-layout', 'force')" :class="graphLayoutMode === 'force' ? 'bg-blue-600 text-white' : 'text-gray-400'" class="px-2 py-1 rounded transition">🌐 网状</button>
                        <button @click="$emit('update-graph-layout', 'circular')" :class="graphLayoutMode === 'circular' ? 'bg-blue-600 text-white' : 'text-gray-400'" class="px-2 py-1 rounded transition">🎯 环形</button>
                    </div>

                    <label class="flex items-center gap-1.5 bg-gray-800 px-2.5 py-1 rounded border border-gray-700 cursor-pointer hover:border-blue-500">
                        <input type="checkbox" :checked="isolateCurrentGroup" @change="$emit('update:isolateCurrentGroup', $event.target.checked); $emit('render')" class="accent-blue-500">
                        <span class="text-gray-300">仅显示当前分组 (Isolate)</span>
                    </label>
                </div>

                <div class="flex items-center gap-3 flex-wrap">
                    <div class="flex items-center gap-2 bg-gray-800 px-2.5 py-1 rounded border border-gray-700">
                        <span class="text-gray-400">连线图例:</span>
                        <label class="flex items-center gap-1 text-blue-400 cursor-pointer"><input type="checkbox" :checked="edgeFilters.creator" @change="edgeFilters.creator = $event.target.checked; $emit('render')" class="accent-blue-500"> 同作者</label>
                        <label class="flex items-center gap-1 text-purple-400 cursor-pointer"><input type="checkbox" :checked="edgeFilters.category" @change="edgeFilters.category = $event.target.checked; $emit('render')" class="accent-purple-500"> 同分组</label>
                        <label class="flex items-center gap-1 text-emerald-400 cursor-pointer"><input type="checkbox" :checked="edgeFilters.tags" @change="edgeFilters.tags = $event.target.checked; $emit('render')" class="accent-emerald-500"> 共享标签</label>
                    </div>

                    <input :value="graphSearchKeyword" @input="$emit('update:graphSearchKeyword', $event.target.value); $emit('render')" type="text" placeholder="高亮搜索..." class="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-white outline-none focus:border-blue-500 w-28">

                    <button @click="$emit('close')" class="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition">关闭</button>
                </div>
            </div>

            <div id="app-graph-container" class="flex-1 w-full h-full relative"></div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'GraphModal',
    props: {
        show: { type: Boolean, default: false },
        graphLayoutMode: { type: String, default: 'force' },
        isolateCurrentGroup: { type: Boolean, default: false },
        edgeFilters: { type: Object, default: () => ({ creator: true, category: true, tags: true }) },
        graphSearchKeyword: { type: String, default: '' }
    },
    emits: ['update-graph-layout', 'update:isolateCurrentGroup', 'update:graphSearchKeyword', 'render', 'close']
};
</script>
