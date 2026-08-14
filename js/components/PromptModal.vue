<!--
  PromptModal 通用输入弹窗（替代 window.prompt，子组件）
  状态经 props 传入、变更经 emits 回传（v-model 风格）
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" @click.self="$emit('cancel')">
            <div class="bg-white rounded-lg shadow-xl w-96 max-w-full p-5 border border-gray-200">
                <h3 class="text-sm font-bold text-gray-800 mb-3 whitespace-pre-line">📝 {{ title }}</h3>
                <input id="app-prompt-input" :value="modelValue"
                       @input="$emit('update:modelValue', $event.target.value)"
                       @keyup.enter="$emit('confirm')" @keyup.esc="$emit('cancel')"
                       type="text"
                       class="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-blue-500 text-sm mb-4">
                <div class="flex justify-end gap-2">
                    <button @click="$emit('cancel')" class="px-4 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded border border-gray-300 transition">取消</button>
                    <button @click="$emit('confirm')" class="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm transition">确定</button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'PromptModal',
    props: {
        show: { type: Boolean, default: false },
        title: { type: String, default: '' },
        modelValue: { type: String, default: '' }
    },
    emits: ['update:modelValue', 'confirm', 'cancel']
};
</script>
