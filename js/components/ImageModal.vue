<!--
  ImageModal 高清立绘大图预览弹窗（子组件）
  url 为预览图片地址；纯展示组件，仅 emits close
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md" @click.self="$emit('close')">
            <div class="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
                <img :src="url" class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/20">
                <button @click="$emit('close')" class="mt-3 px-6 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-bold backdrop-blur-sm transition">
                    关闭大图 ✕
                </button>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'ImageModal',
    props: {
        show: { type: Boolean, default: false },
        url: { type: String, default: '' }
    },
    emits: ['close']
};
</script>
