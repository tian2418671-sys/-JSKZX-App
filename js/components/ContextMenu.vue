<!--
  ContextMenu 角色卡右键快捷菜单（子组件）
  操作逻辑留在父级（handleContextMenuAction/openFromLibrary 等），本组件纯 UI + emits
-->
<template>
    <transition name="fade">
        <div v-if="visible"
             class="fixed z-[100] min-w-[210px] theme-surface border border-zinc-700/80 rounded-lg shadow-2xl py-1.5 text-xs flex flex-col"
             :style="{ top: y + 'px', left: x + 'px' }"
             @click.stop>

            <!-- 卡片信息头 -->
            <div class="px-3 py-1.5 border-b border-zinc-700/50 mb-1 flex flex-col">
                <span class="font-bold text-amber-400 truncate">{{ item?.name || '未知角色' }}</span>
                <span class="text-[9px] opacity-50 truncate font-mono mt-0.5" :title="item?.path">
                    {{ item?.path?.split(/[\\/]/).pop() }}
                </span>
            </div>

            <button @click="$emit('view')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">👁️</span> 查看 / 编辑卡片
            </button>
            <button @click.stop="$emit('open-folder')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">📁</span> 在资源管理器中打开
            </button>
            <button @click.stop="$emit('duplicate')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">📋</span> 创建卡片物理副本
            </button>

            <div class="h-px bg-zinc-700/50 my-1 mx-2"></div>

            <button @click.stop="$emit('move-group')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">📂</span> 移动到指定分组...
            </button>
            <button @click.stop="$emit('snapshots')" class="w-full text-left px-3 py-2 hover:bg-amber-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">📸</span> 历史快照 / 一键恢复...
            </button>
            <button @click.stop="$emit('replace-image')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">🖼️</span> 换卡图
            </button>
            <button @click="$emit('export')" class="w-full text-left px-3 py-2 hover:bg-indigo-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">💾</span> 导出单张卡片 (PNG)
            </button>
            <button @click.stop="$emit('ai-tag')" class="w-full text-left px-3 py-2 hover:bg-amber-600 hover:text-white flex items-center gap-2 transition-colors">
                <span class="text-sm">🤖</span> 单卡快捷 AI 打标...
            </button>

            <div class="h-px bg-zinc-700/50 my-1 mx-2"></div>

            <button @click.stop="$emit('trash')" class="w-full text-left px-3 py-2 hover:bg-rose-600 hover:text-white flex items-center gap-2 transition-colors text-rose-400">
                <span class="text-sm">🗑️</span> 移入安全回收站
            </button>
        </div>
    </transition>
</template>

<script>
export default {
    name: 'ContextMenu',
    props: {
        visible: { type: Boolean, default: false },
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
        item: { type: Object, default: null }
    },
    emits: ['view', 'open-folder', 'duplicate', 'move-group', 'snapshots', 'replace-image', 'export', 'ai-tag', 'trash']
};
</script>
