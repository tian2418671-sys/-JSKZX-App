<!--
  PushModal 推送目标对话框（子组件）
  选择推送目标（SillyTavern 酒馆 / 自定义卡库）+ 管理多卡库目标 + 一键推送勾选卡片
  ⚠️ 状态/操作经 provide/inject 从 App.vue 共享（pushToTavern / addCustomPushTarget /
      useSillyTavernPushTarget 等），本组件纯 UI 编排
-->
<template>
    <transition name="fade">
        <div v-if="show" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="$emit('close')">
            <div class="w-[520px] max-w-[92vw] max-h-[85vh] flex flex-col theme-surface border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden">

                <!-- 头部 -->
                <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60 bg-zinc-900/80">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-base">🚀</span>
                        <div class="min-w-0">
                            <h3 class="text-sm font-bold text-emerald-400 truncate">推送到当前目标</h3>
                            <p class="text-[10px] text-zinc-500 truncate">
                                <template v-if="selectedCount > 0">已勾选 <span class="text-emerald-400 font-bold">{{ selectedCount }}</span> 张角色卡</template>
                                <template v-else-if="currentCardName">将推送当前打开的卡片：<span class="text-emerald-400 font-bold truncate">{{ currentCardName }}</span></template>
                                <template v-else>未勾选卡片，也未打开任何卡片</template>
                            </p>
                        </div>
                    </div>
                    <button @click="$emit('close')" class="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition text-sm">✕</button>
                </div>

                <!-- 主体 -->
                <div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">

                    <!-- 当前目标 -->
                    <div class="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2.5">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-[11px] font-bold text-zinc-400">🎯 当前推送目标</span>
                            <span class="text-[11px] px-2 py-0.5 rounded border whitespace-nowrap"
                                  :class="appSettings.pushTargetMode === 'custom' ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-amber-500/40 text-amber-300 bg-amber-500/10'">
                                {{ currentPushTargetName }}
                            </span>
                        </div>
                        <div class="text-[11px] text-zinc-500 truncate mt-1 font-mono" :title="currentPushTargetHint">
                            {{ currentPushTargetHint }}
                        </div>
                    </div>

                    <!-- 模式切换 -->
                    <div class="flex items-center gap-2">
                        <button @click="useSillyTavernPushTarget"
                                class="flex-1 h-9 rounded-lg text-xs font-bold transition border"
                                :class="appSettings.pushTargetMode === 'sillytavern' ? 'bg-amber-600 text-white border-amber-500 shadow' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'">
                            🍻 SillyTavern 酒馆
                        </button>
                        <button @click="useCustomPushTarget"
                                class="flex-1 h-9 rounded-lg text-xs font-bold transition border"
                                :class="appSettings.pushTargetMode === 'custom' ? 'bg-emerald-600 text-white border-emerald-500 shadow' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'">
                            🗂️ 自定义卡库
                        </button>
                    </div>

                    <!-- 卡库目标列表（custom 模式） -->
                    <div v-if="appSettings.pushTargetMode === 'custom'" class="rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2.5 space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-bold text-zinc-400">🗂️ 卡库目标列表</span>
                            <span v-if="customPushTargets.length === 0" class="text-[10px] text-amber-400/80">还没有卡库目标，点 ＋ 新增</span>
                        </div>
                        <div v-if="customPushTargets.length > 0" class="flex items-center gap-1.5">
                            <select :value="appSettings.currentPushTargetId"
                                    @change="setCurrentCustomPushTarget($event.target.value)"
                                    class="flex-1 h-8 bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/80 truncate">
                                <option v-for="target in customPushTargets" :key="target.id" :value="target.id">
                                    🗂️ {{ target.name }}
                                </option>
                            </select>
                            <button @click="renameCurrentCustomPushTarget"
                                    class="h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition"
                                    title="重命名当前卡库目标">
                                ✏️
                            </button>
                            <button @click="removeCurrentCustomPushTarget"
                                    class="h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-rose-600 hover:text-white transition"
                                    title="删除当前卡库目标（仅移除快捷目标，不删真实文件夹）">
                                🗑️
                            </button>
                            <button @click="addCustomPushTarget"
                                    class="h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-emerald-600 hover:text-white transition"
                                    title="新增一个自定义卡库目标">
                                ＋
                            </button>
                        </div>
                        <button v-else @click="addCustomPushTarget"
                                class="w-full h-8 rounded-lg bg-zinc-800 text-zinc-300 border border-dashed border-zinc-600 hover:bg-emerald-600/20 hover:border-emerald-500 hover:text-emerald-300 transition text-xs">
                            ＋ 添加第一个卡库目标
                        </button>
                    </div>

                    <!-- 说明 -->
                    <div class="text-[10px] text-zinc-500 leading-relaxed bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2">
                        💡 推送采用<b class="text-zinc-400">本地物理拷贝</b>：直接把勾选的卡片 PNG/JSON 复制到目标目录；
                        目标存在同名卡片时会先备份到回收站再覆盖，绝不物理删除原件。
                    </div>
                </div>

                <!-- 底部 -->
                <div class="flex items-center justify-between px-4 py-3 border-t border-zinc-700/60 bg-zinc-900/80">
                    <button @click="$emit('close')" class="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[11px] text-zinc-200 transition">
                        取消
                    </button>
                    <button @click="confirmPush"
                            class="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded transition flex items-center gap-1.5"
                            :disabled="selectedCount === 0 && !currentCardName">
                        🚀 开始推送 <span v-if="selectedCount > 0">({{ selectedCount }})</span><span v-else-if="currentCardName">当前卡</span>
                    </button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
import { inject } from 'vue';

export default {
    name: 'PushModal',
    props: {
        show: { type: Boolean, default: false },
        selectedCount: { type: Number, default: 0 },
        currentCardName: { type: String, default: '' }
    },
    emits: ['close'],
    setup(props, { emit }) {
        const ctx = inject('appCtx');

        // 执行推送：结果由 nativeAlert/Toast 呈现，完成后收起对话框
        const confirmPush = async () => {
            await ctx.pushToTavern();
            emit('close');
        };

        return {
            appSettings: ctx.appSettings,
            currentPushTargetName: ctx.currentPushTargetName,
            currentPushTargetHint: ctx.currentPushTargetHint,
            customPushTargets: ctx.customPushTargets,
            useSillyTavernPushTarget: ctx.useSillyTavernPushTarget,
            useCustomPushTarget: ctx.useCustomPushTarget,
            setCurrentCustomPushTarget: ctx.setCurrentCustomPushTarget,
            addCustomPushTarget: ctx.addCustomPushTarget,
            renameCurrentCustomPushTarget: ctx.renameCurrentCustomPushTarget,
            removeCurrentCustomPushTarget: ctx.removeCurrentCustomPushTarget,
            confirmPush
        };
    }
};
</script>
