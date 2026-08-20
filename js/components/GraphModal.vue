<!--
  GraphModal 角色宇宙关系图谱弹窗（子组件）
  ⚠️ ECharts 渲染逻辑保留在父级（依赖大量父组件状态），容器固定 id="app-graph-container"
     父组件通过 document.getElementById('app-graph-container') 初始化图表
  v2：新增连线权重阈值选择 / 图谱统计徽标 / PNG 导出按钮；
      搜索输入改为仅更新状态（父级 useGraph 内置 300ms 防抖重建，不再每键全量重渲）
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-gray-900 flex flex-col">

            <div class="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex flex-wrap justify-between items-center text-white shrink-0 gap-3 text-xs">
                <div class="flex items-center gap-3 flex-wrap">
                    <h3 class="font-bold flex items-center gap-1.5 text-sm">🌌 角色宇宙图谱</h3>

                    <!-- 图谱统计徽标 -->
                    <div class="flex items-center gap-1.5 text-[10px] font-mono">
                        <span class="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300">节点 {{ graphStats.nodes }}</span>
                        <span class="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300">连线 {{ graphStats.links }}</span>
                        <span v-if="graphStats.hubs && graphStats.hubs.length" class="px-1.5 py-0.5 bg-amber-900/40 border border-amber-700 rounded text-amber-400" :title="'社交权重度 Top3: ' + graphStats.hubs.join('、')">👑 {{ graphStats.hubs.length }} 枢纽</span>
                        <span v-if="graphStats.trimmed > 0" class="px-1.5 py-0.5 bg-rose-900/40 border border-rose-700 rounded text-rose-400" :title="`连线超出预算，已按权重保留最重要的 ${graphStats.links} 条，裁剪 ${graphStats.trimmed} 条低权重连线（可调高权重阈值减少裁剪）`">✂️ 裁剪 {{ graphStats.trimmed }}</span>
                        <span v-if="graphStats.skippedGroups > 0" class="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-500" :title="`有 ${graphStats.skippedGroups} 个超大群体（同作者/同分组/同标签成员超过 300）未参与连线展开——泛化关系连线价值低且会卡死布局引擎`">🚫 超大群体 {{ graphStats.skippedGroups }}</span>
                    </div>

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

                    <!-- 连线权重阈值：过滤低权重连线，大库降噪提速 -->
                    <select :value="minLinkWeight" @change="$emit('update:minLinkWeight', Number($event.target.value)); $emit('render')" class="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-gray-300 text-xs outline-none focus:border-blue-500" title="仅保留权重不低于该值的连线（同作者=3 / 同分组=2 / 共享标签数）">
                        <option :value="1">≥1 全部连线</option>
                        <option :value="2">≥2 重要连线</option>
                        <option :value="3">≥3 强关联</option>
                        <option :value="5">≥5 超强关联</option>
                    </select>

                    <input :value="graphSearchKeyword" @input="$emit('update:graphSearchKeyword', $event.target.value)" type="text" placeholder="高亮搜索..." class="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-white outline-none focus:border-blue-500 w-28">

                    <button @click="$emit('export')" class="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition" title="导出当前图谱为 PNG 图片（2x 分辨率）">📷 导出</button>
                    <button @click="$emit('close')" class="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition">关闭</button>
                </div>
            </div>

            <div class="flex-1 w-full h-full relative">
                <div id="app-graph-container" class="w-full h-full"></div>
                <!-- 构建中遮罩：大库同步构建会阻塞主线程，先绘制弹窗再后台构建 -->
                <div v-if="building" class="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center gap-2 z-10">
                    <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span class="text-xs text-blue-400 font-mono">⚡ 图谱构建中，卡片较多时请稍候...</span>
                </div>
            </div>
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
        graphSearchKeyword: { type: String, default: '' },
        minLinkWeight: { type: Number, default: 1 },
        graphStats: { type: Object, default: () => ({ nodes: 0, links: 0, hubs: [], trimmed: 0, skippedGroups: 0 }) },
        building: { type: Boolean, default: false }
    },
    emits: ['update-graph-layout', 'update:isolateCurrentGroup', 'update:graphSearchKeyword', 'update:minLinkWeight', 'render', 'export', 'close']
};
</script>
