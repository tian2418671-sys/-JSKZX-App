<!--
  DiskScanModal 磁盘扫描进度弹窗（子组件，纯展示）
  扫描期间全屏提示进度状态
-->
<template>
    <transition name="fade">
        <div v-if="isScanning" class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm cursor-wait">
            <div class="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md border border-zinc-700 p-6 flex flex-col items-center text-center">
                <svg class="animate-spin h-12 w-12 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <h3 class="font-bold text-white text-lg mb-2">正在深度扫描本地磁盘</h3>
                <p class="text-sm text-zinc-400 mb-4">{{ status }}</p>

                <div class="w-full bg-zinc-800 rounded-full h-2 mb-2 overflow-hidden relative">
                    <div class="bg-blue-500 h-2 rounded-full absolute left-0 top-0 bottom-0 animate-pulse w-full"></div>
                </div>
                <p class="text-xs text-amber-500/80">⚠️ 扫描期间请勿关闭软件，这可能需要几分钟时间...</p>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'DiskScanModal',
    props: {
        isScanning: { type: Boolean, default: false },
        status: { type: String, default: '' }
    }
};
</script>
