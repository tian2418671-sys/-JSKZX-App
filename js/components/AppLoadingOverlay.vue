<!--
  AppLoadingOverlay 启动过渡蒙版（纯展示组件）
  数据就绪后淡出
-->
<template>
    <transition name="fade">
        <div v-if="isLoading" class="fixed inset-0 z-[999] bg-zinc-950 flex flex-col items-center justify-center select-none">
            <div class="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <div class="text-sm font-bold text-zinc-300 tracking-widest">SillyTavern Manager</div>
            <div class="text-xs text-zinc-500 mt-1">正在载入资源与分类配置...</div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'AppLoadingOverlay',
    props: {
        isLoading: { type: Boolean, default: false }
    }
};
</script>
