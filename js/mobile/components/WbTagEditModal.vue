<!--
  WbTagEditModal 世界书标签编辑面板（移动版 S1 · 2026-09-25，对齐桌面版同名组件）
  ─────────────────────────────────────────────────────────────
  纯 UI + emits：增删一律回传父级（WorldbookView 负责写 wbTagMap 并持久化），
  本组件不直接读写数据层（与移动版弹窗范式一致）。
  入口：世界书列表项 ⋯ 菜单「🏷️ 编辑标签」
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        close-on-click-overlay
        class="wbt-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="wbt-head">
            <span class="wbt-title">🏷️ 编辑标签</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="wbt-body">
            <div class="wbt-target">
                <span class="wbt-name" :title="wbPath || wbName">{{ wbName || '未命名世界书' }}</span>
                <span class="wbt-hint">标签存在配置层，不写入世界书文件</span>
            </div>

            <!-- 现有标签（✕ 移除） -->
            <div class="wbt-tags">
                <van-tag
                    v-for="t in tags"
                    :key="t"
                    closeable
                    size="medium"
                    color="#eef7fb"
                    text-color="#06b6d4"
                    class="wbt-tag"
                    @close="$emit('remove', t)"
                >#{{ t }}</van-tag>
                <span v-if="!tags.length" class="wbt-empty">（暂无标签）</span>
            </div>

            <!-- 输入（回车添加；逗号/顿号分隔可一次加多个） -->
            <div class="wbt-input-row">
                <van-field
                    v-model="input"
                    placeholder="输入新标签，回车添加（逗号可加多个）"
                    class="wbt-input"
                    @keyup.enter="submit"
                />
                <van-button size="small" type="primary" :disabled="!input.trim()" @click="submit">添加</van-button>
            </div>

            <!-- 全库已有标签建议（点击即加） -->
            <div v-if="suggestions.length" class="wbt-sugg">
                <div class="wbt-sugg-title">全库已有标签（点击添加，数字 = 使用本数）：</div>
                <div class="wbt-sugg-list">
                    <van-tag
                        v-for="s in suggestions"
                        :key="s.tag"
                        size="medium"
                        :color="tags.includes(s.tag) ? '#f2f3f5' : '#f7f8fa'"
                        :text-color="tags.includes(s.tag) ? '#c8c9cc' : '#646566'"
                        class="wbt-sugg-tag"
                        @click="add(s.tag)"
                    >{{ s.tag }}<span class="wbt-sugg-count">{{ s.count }}</span></van-tag>
                </div>
            </div>

            <div class="wbt-footer">
                <van-button block round size="small" plain type="primary" @click="$emit('close')">完成</van-button>
            </div>
        </div>
    </van-popup>
</template>

<script>
import { ref } from 'vue';

export default {
    name: 'WbTagEditModal',
    props: {
        show: { type: Boolean, default: false },
        /** 目标世界书显示名 */
        wbName: { type: String, default: '' },
        /** 目标世界书路径（仅显示/兜底；不用于读写） */
        wbPath: { type: String, default: '' },
        /** 该书当前标签（string[]） */
        tags: { type: Array, default: () => [] },
        /** 全库标签建议（[{tag, count}]，来自 wbAllTags） */
        suggestions: { type: Array, default: () => [] }
    },
    emits: ['add', 'remove', 'close'],
    setup(props, { emit }) {
        const input = ref('');

        function submit() {
            const v = input.value.trim();
            if (!v) return;
            // 逗号 / 顿号分隔可一次加多个（规范化去空由父级 addWbTagOn 负责）
            const parts = v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
            for (const p of parts) emit('add', p);
            input.value = '';
        }

        function add(tag) {
            if (props.tags.includes(tag)) return;
            emit('add', tag);
        }

        return { input, submit, add };
    }
};
</script>

<style scoped>
.wbt-popup { max-height: 72%; display: flex; flex-direction: column; }
.wbt-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 8px; font-size: 15px; font-weight: 600;
}
.wbt-body {
    padding: 0 16px calc(14px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
}
.wbt-target { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.wbt-name { font-size: 13px; font-weight: 600; color: var(--van-text-color, #323233); word-break: break-all; }
.wbt-hint { font-size: 11px; color: var(--van-text-color-3, #969799); }

.wbt-tags {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    min-height: 34px; padding: 8px 10px; margin-bottom: 10px;
    background: #f7f8fa; border-radius: 10px;
}
.wbt-tag { cursor: pointer; }
.wbt-empty { font-size: 12px; color: var(--van-text-color-3, #969799); }

.wbt-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.wbt-input {
    flex: 1; border-radius: 8px; background: #f7f8fa; padding: 2px 4px;
}
.wbt-input :deep(.van-field__control) { font-size: 13px; }

.wbt-sugg { margin-bottom: 12px; }
.wbt-sugg-title { font-size: 11px; color: var(--van-text-color-3, #969799); margin-bottom: 6px; }
.wbt-sugg-list { display: flex; flex-wrap: wrap; gap: 6px; max-height: 150px; overflow-y: auto; }
.wbt-sugg-tag { cursor: pointer; }
.wbt-sugg-count { opacity: 0.6; margin-left: 3px; font-size: 10px; }

.wbt-footer { padding-top: 2px; }
</style>
