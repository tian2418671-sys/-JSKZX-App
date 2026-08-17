<!--
  TextModal 全屏大文本阅读/编辑弹窗（子组件）
  modelValue 为正文内容，fontSize 控制编辑字号；
  保存写回逻辑留在父级（需访问原对象引用 textModalTargetRef），故 emits save 由父级处理
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">

                <div class="px-5 py-3.5 bg-gray-900 text-white flex justify-between items-center shrink-0">
                    <div class="flex items-center gap-3">
                        <h3 class="font-bold text-base flex items-center gap-2">🔍 {{ title }}</h3>
                        <span class="text-xs text-amber-400 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                            ⚡ 约 {{ estimateTokens(modelValue) }} Tokens
                        </span>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                            <span>字号:</span>
                            <button @click="$emit('update:fontSize', Math.max(12, fontSize - 2))" class="px-1.5 hover:bg-gray-700 rounded font-bold">-</button>
                            <span class="font-mono text-white">{{ fontSize }}px</span>
                            <button @click="$emit('update:fontSize', Math.min(24, fontSize + 2))" class="px-1.5 hover:bg-gray-700 rounded font-bold">+</button>
                        </div>
                        <button @click="$emit('save')" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition">保存并完成</button>
                        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-base">✕</button>
                    </div>
                </div>

                <div class="flex-1 p-4 bg-gray-50 flex flex-col overflow-hidden">
                    <textarea :value="modelValue"
                              @input="$emit('update:modelValue', $event.target.value)"
                              :style="{ fontSize: fontSize + 'px' }"
                              class="w-full h-full p-4 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white resize-none leading-relaxed font-mono font-medium custom-scrollbar shadow-inner text-gray-900"
                              placeholder="在此进行清爽的大窗阅读或修改..."></textarea>
                </div>

                <div class="px-5 py-2.5 bg-gray-100 border-t border-gray-200 text-xs text-gray-500 flex justify-between items-center shrink-0">
                    <span>💡 提示：在此弹窗中编辑内容会实时同步回卡片，点击“保存并完成”后关闭。</span>
                    <span class="font-mono">字符数: {{ modelValue.length }}</span>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
import { estimateTokens } from '../utils/tokenEstimate.js';

export default {
    name: 'TextModal',
    props: {
        show: { type: Boolean, default: false },
        title: { type: String, default: '' },
        modelValue: { type: String, default: '' },
        fontSize: { type: Number, default: 14 }
    },
    emits: ['update:modelValue', 'update:fontSize', 'save', 'close'],
    methods: {
        // Options API 下 import 的模块函数不会自动暴露到模板作用域，需挂到 methods
        // （否则模板中 {{ estimateTokens(modelValue) }} 渲染时报 "_ctx.estimateTokens is not a function"，弹窗无法打开）
        estimateTokens
    }
};
</script>
