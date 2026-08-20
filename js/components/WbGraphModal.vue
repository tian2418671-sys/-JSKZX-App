<!--
  WbGraphModal 世界书词条逻辑关联图谱弹窗（子组件）
  ⚠️ ECharts 渲染逻辑保留在父级，容器固定 id="wb-graph-container"
     父组件通过 document.getElementById('wb-graph-container') 初始化图表
  v2：新增布局切换 / 词条类型过滤(常驻/触发/禁用) / 搜索高亮(父级防抖) /
      连线权重阈值 / 统计徽标(词条/连线/孤立) / PNG 导出 / 构建中 loading 遮罩
-->
<template>
    <div v-if="show" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" @click.self="$emit('close')">
        <div class="bg-zinc-950 border border-zinc-700/80 rounded-xl max-w-6xl w-full h-[88vh] flex flex-col shadow-2xl overflow-hidden">

            <!-- 顶栏：标题 + 统计徽标 + 工具组 -->
            <div class="px-5 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0 bg-amber-500/10 flex-wrap">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-base font-bold text-amber-500">🌐 世界书词条逻辑关联图谱</span>
                    <span class="text-[10px] text-zinc-400 font-mono">（紫: 常驻 | 橙: 触发 | 灰: 禁用 | 点击节点跳转词条）</span>

                    <!-- 统计徽标 -->
                    <div class="flex items-center gap-1.5 text-[10px] font-mono">
                        <span class="px-1.5 py-0.5 bg-zinc-800/80 border border-zinc-700 rounded text-zinc-300">词条 {{ stats.nodes }}</span>
                        <span class="px-1.5 py-0.5 bg-zinc-800/80 border border-zinc-700 rounded text-zinc-300">连线 {{ stats.links }}</span>
                        <span class="px-1.5 py-0.5 bg-zinc-800/80 border border-zinc-700 rounded text-amber-400" title="无任何连线的词条（可能是死词条或触发词过偏）">孤立 {{ stats.orphans }}</span>
                    </div>
                </div>

                <div class="flex items-center gap-2 flex-wrap text-xs">
                    <!-- 布局切换 -->
                    <div class="flex bg-zinc-800 rounded p-0.5 border border-zinc-700">
                        <button @click="$emit('update-layout', 'force')" :class="layout === 'force' ? 'bg-amber-600 text-white' : 'text-zinc-400'" class="px-2 py-0.5 rounded transition">🌐 网状</button>
                        <button @click="$emit('update-layout', 'circular')" :class="layout === 'circular' ? 'bg-amber-600 text-white' : 'text-zinc-400'" class="px-2 py-0.5 rounded transition">🎯 环形</button>
                    </div>

                    <!-- 词条类型过滤 -->
                    <label class="flex items-center gap-1 text-indigo-400 cursor-pointer bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700" title="常驻词条 (constant)"><input type="checkbox" :checked="filters.constant" @change="filters.constant = $event.target.checked; $emit('render')" class="accent-indigo-500"> 常驻</label>
                    <label class="flex items-center gap-1 text-amber-500 cursor-pointer bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700" title="关键词触发词条"><input type="checkbox" :checked="filters.triggered" @change="filters.triggered = $event.target.checked; $emit('render')" class="accent-amber-500"> 触发</label>
                    <label class="flex items-center gap-1 text-zinc-500 cursor-pointer bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700" title="已禁用词条 (enabled=false)"><input type="checkbox" :checked="filters.disabled" @change="filters.disabled = $event.target.checked; $emit('render')" class="accent-zinc-500"> 禁用</label>

                    <!-- 连线权重阈值 -->
                    <select :value="minWeight" @change="$emit('update:minWeight', Number($event.target.value)); $emit('render')" class="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 text-xs outline-none focus:border-amber-500" title="仅保留命中触发词数不低于该值的连线">
                        <option :value="1">≥1 全部连线</option>
                        <option :value="2">≥2 强关联</option>
                        <option :value="3">≥3 紧密关联</option>
                    </select>

                    <!-- 搜索（父级 300ms 防抖重渲） -->
                    <input :value="search" @input="$emit('update:search', $event.target.value)" type="text" placeholder="高亮搜索..." class="bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1 text-zinc-200 outline-none focus:border-amber-500 w-28 text-xs">

                    <button @click="$emit('export')" class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition" title="导出当前图谱为 PNG 图片（2x 分辨率）">📷 导出</button>
                    <button @click="$emit('close')" class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition">关闭</button>
                </div>
            </div>

            <div class="flex-1 w-full relative">
                <div id="wb-graph-container" class="w-full h-full"></div>
                <!-- 构建中遮罩：大书（数百词条）同步构建会阻塞主线程，先绘制弹窗再后台构建 -->
                <div v-if="building" class="absolute inset-0 bg-zinc-950/70 flex flex-col items-center justify-center gap-2 z-10">
                    <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <span class="text-xs text-amber-400 font-mono">⚡ 图谱构建中，词条较多时请稍候...</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'WbGraphModal',
    props: {
        show: { type: Boolean, default: false },
        layout: { type: String, default: 'force' },
        search: { type: String, default: '' },
        filters: { type: Object, default: () => ({ constant: true, triggered: true, disabled: false }) },
        minWeight: { type: Number, default: 1 },
        stats: { type: Object, default: () => ({ nodes: 0, links: 0, orphans: 0 }) },
        building: { type: Boolean, default: false }
    },
    emits: ['update-layout', 'update:search', 'update:minWeight', 'render', 'export', 'close']
};
</script>
