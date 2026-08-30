<!--
  WbImportModal 移动端世界书条目级导入合并弹窗（Vant 底部弹层）
  从其他世界书(库内 + 外部)勾选词条，合并进当前编辑中的世界书。
  逻辑留在父级(WorldbookView)，本组件纯 UI + emits。
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="wb-import-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="wbim-head">
            <span class="wbim-title">📥 从其他世界书导入词条</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="wbim-body">
            <!-- ① 选择源世界书 -->
            <div class="wbim-step">① 选择源世界书</div>
            <div class="wbim-sources">
                <div
                    v-for="src in sources"
                    :key="src.key"
                    class="wbim-src"
                    :class="{ active: selectedKey === src.key }"
                    @click="$emit('pick-source', src.key)"
                >
                    {{ src.label }} <span class="wbim-src-count">({{ src.count }})</span>
                </div>
                <van-empty v-if="!sources.length" description="没有可用的源世界书" image-size="50" />
            </div>

            <!-- ② 勾选词条 -->
            <div class="wbim-step" style="margin-top: 14px">② 勾选要导入的词条</div>
            <div v-if="!selectedKey" class="wbim-hint">请先选择源世界书</div>
            <template v-else>
                <div v-if="!entries.length" class="wbim-hint">该世界书没有词条</div>
                <div v-for="(e, i) in entries" :key="i" class="wbim-entry" @click="$emit('toggle', i)">
                    <van-checkbox :model-value="checked.includes(i)" @click.stop="$emit('toggle', i)" />
                    <div class="wbim-entry-main">
                        <div class="wbim-entry-name">{{ e.comment || e.name || ('词条 ' + (i + 1)) }}</div>
                        <div class="wbim-entry-content">{{ String(e.content || '').slice(0, 60) }}</div>
                    </div>
                </div>
            </template>
        </div>

        <div class="wbim-footer">
            <van-button block type="primary" :disabled="!selectedKey || !checked.length" @click="$emit('import')">
                导入选中词条 ({{ checked.length }})
            </van-button>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'WbImportModal',
    props: {
        show: { type: Boolean, default: false },
        sources: { type: Array, default: () => [] }, // [{key, label, count}]
        selectedKey: { type: String, default: '' },
        entries: { type: Array, default: () => [] },
        checked: { type: Array, default: () => [] }
    },
    emits: ['close', 'pick-source', 'toggle', 'import']
};
</script>

<style scoped>
.wb-import-popup { max-height: 80vh; display: flex; flex-direction: column; }
.wbim-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 8px; flex-shrink: 0;
}
.wbim-title { font-size: 15px; font-weight: 600; color: var(--van-text-color, #323233); }
.wbim-body { flex: 1; overflow-y: auto; padding: 0 16px; }
.wbim-step { font-size: 12px; color: var(--van-gray-6, #969799); margin: 6px 0; }
.wbim-sources { display: flex; flex-wrap: wrap; gap: 6px; }
.wbim-src {
    padding: 6px 10px; border-radius: 6px; font-size: 13px;
    border: 1px solid var(--van-gray-3, #ebedf0); cursor: pointer;
    background: var(--van-background-2, #fff);
}
.wbim-src.active { border-color: #06b6d4; color: #06b6d4; background: #eef7fb; }
.wbim-src-count { opacity: 0.6; font-size: 11px; }
.wbim-hint { font-size: 12px; color: var(--van-gray-5, #c8c9cc); padding: 12px 0; }
.wbim-entry {
    display: flex; align-items: center; gap: 8px; padding: 8px 0;
    border-bottom: 1px dashed var(--van-gray-4, #ebedf0);
}
.wbim-entry-main { flex: 1; min-width: 0; }
.wbim-entry-name { font-size: 13px; color: var(--van-text-color, #323233); }
.wbim-entry-content {
    font-size: 11px; color: var(--van-gray-6, #969799);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wbim-footer { flex-shrink: 0; padding: 10px 16px 20px; }
</style>
