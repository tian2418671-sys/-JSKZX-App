<!--
  GlobalAssetModal 全局世界书与正则资产中心弹窗（子组件）
  纯展示组件：聚合数据由父级 computed 提供，仅切换页签需回传
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">

                <div class="px-6 py-4 bg-gray-900 text-white flex justify-between items-center shrink-0">
                    <div class="flex items-center gap-4">
                        <h3 class="font-bold text-base flex items-center gap-2">📚 全局世界书与正则资产中心</h3>
                        <div class="flex bg-gray-800 rounded p-0.5 border border-gray-700 text-xs">
                            <button @click="$emit('update:assetTab', 'worldbook')" :class="assetTab === 'worldbook' ? 'bg-blue-600 text-white' : 'text-gray-400'" class="px-3 py-1 rounded transition">世界书合集 ({{ allWorldbooks.length }})</button>
                            <button @click="$emit('update:assetTab', 'regex')" :class="assetTab === 'regex' ? 'bg-blue-600 text-white' : 'text-gray-400'" class="px-3 py-1 rounded transition">正则脚本合集 ({{ allRegexScripts.length }})</button>
                        </div>
                    </div>
                    <button @click="$emit('close')" class="px-4 py-1.5 bg-gray-800 hover:bg-red-600 rounded text-xs transition">关闭窗口</button>
                </div>

                <div class="flex-1 overflow-y-auto p-6 bg-gray-50 custom-scrollbar space-y-3">

                    <template v-if="assetTab === 'worldbook'">
                        <div v-if="allWorldbooks.length > 0" class="space-y-3">
                            <div v-for="(entry, idx) in allWorldbooks" :key="idx" class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm text-xs space-y-2">
                                <div class="flex justify-between items-center">
                                    <div class="font-bold text-gray-900 text-sm flex items-center gap-2">
                                        <span>{{ entry.displayName }}</span>
                                        <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">所属角色: {{ entry.ownerCardName }}</span>
                                    </div>
                                    <span class="text-gray-400">优先级: {{ entry.insertion_order ?? 50 }}</span>
                                </div>
                                <div class="flex flex-wrap gap-1" v-if="entry.keys && entry.keys.length">
                                    <span class="text-gray-400 font-bold mr-1">触发词:</span>
                                    <span v-for="k in entry.keys" class="text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200 text-[10px]">{{ k }}</span>
                                </div>
                                <div class="bg-gray-50 p-2.5 rounded border border-gray-100 text-gray-700 font-mono text-[11px] max-h-24 overflow-y-auto custom-scrollbar" v-html="renderHTML(entry.content)"></div>
                            </div>
                        </div>
                        <div v-else class="text-center text-gray-400 py-20">当前全库未收集到任何世界书条目</div>
                    </template>

                    <template v-if="assetTab === 'regex'">
                        <div v-if="allRegexScripts.length > 0" class="space-y-3">
                            <div v-for="(reg, idx) in allRegexScripts" :key="idx" class="bg-white p-4 rounded-lg border border-gray-200 shadow-sm text-xs space-y-2">
                                <div class="flex justify-between items-center">
                                    <div class="font-bold text-gray-900 text-sm flex items-center gap-2">
                                        <span>{{ reg.scriptName || reg.comment || '未命名正则' }}</span>
                                        <span class="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">所属角色: {{ reg.ownerCardName }}</span>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-2 font-mono text-[11px]">
                                    <div class="bg-gray-50 p-2 rounded border border-gray-200">
                                        <span class="text-gray-400 block mb-1">查找正则 (Find):</span>
                                        <code>{{ reg.findRegex || reg.find }}</code>
                                    </div>
                                    <div class="bg-gray-50 p-2 rounded border border-gray-200">
                                        <span class="text-gray-400 block mb-1">替换内容 (Replace):</span>
                                        <code>{{ reg.replaceString || reg.replace }}</code>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="text-center text-gray-400 py-20">当前全库未收集到任何正则脚本</div>
                    </template>

                </div>

            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'GlobalAssetModal',
    props: {
        show: { type: Boolean, default: false },
        assetTab: { type: String, default: 'worldbook' },
        allWorldbooks: { type: Array, default: () => [] },
        allRegexScripts: { type: Array, default: () => [] }
    },
    emits: ['close', 'update:assetTab'],
    methods: {
        // 安全转义 + 换行/空格转换（与 App.vue 中 renderHTML 同实现，纯函数本地副本）
        renderHTML(text) {
            if (!text) return '';
            let safeText = text.replace(/&/g, '&amp;')
                               .replace(/</g, '&lt;')
                               .replace(/>/g, '&gt;');
            return safeText.replace(/\n/g, '<br>')
                           .replace(/\s\s/g, '&nbsp;&nbsp;');
        }
    }
};
</script>
