<!--
  DragOverlay 拖拽导入全屏遮罩（纯展示组件）
  拖文件到窗口任意处时提示松开导入
-->
<template>
    <transition name="fade">
        <div v-if="isDragging" class="fixed inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center border-8 border-blue-500 border-dashed pointer-events-none" style="z-index: 9999;">
            <div class="text-4xl font-bold text-white flex flex-col items-center gap-4" style="text-shadow: 0 0 15px rgba(59,130,246,0.8);">
                <span class="text-6xl">📥</span>
                <span>松开鼠标，立即导入角色卡！</span>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'DragOverlay',
    props: {
        isDragging: { type: Boolean, default: false }
    }
};
</script>
