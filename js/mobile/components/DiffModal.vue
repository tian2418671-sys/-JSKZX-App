<!--
  DiffModal 移动端数据版本差异比对弹窗（Vant 底部弹层）
  纯展示：左右两侧对比渲染 fieldResults（由父级计算）
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="diff-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="diff-head">
            <span class="diff-title">⚖️ 版本差异比对</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="diff-vs">
            <div class="diff-vs-item master">
                <span class="diff-vs-tag">👑 推荐版</span>
                <span class="diff-vs-name">{{ masterName }}</span>
            </div>
            <div class="diff-vs-item compare">
                <span class="diff-vs-tag">🔍 对比版</span>
                <span class="diff-vs-name">{{ compareName }}</span>
            </div>
        </div>

        <div class="diff-list">
            <van-empty v-if="!fieldResults.length" description="暂无对比数据" image-size="70" />

            <div v-for="(f, i) in fieldResults" :key="i" class="diff-field">
                <div class="diff-field-head">
                    <span class="diff-field-label">{{ f.label }}</span>
                    <van-tag :type="f.isSame ? 'default' : 'warning'" size="mini">
                        {{ f.isSame ? '✅ 一致' : `⚠️ 差异 (${f.len1} vs ${f.len2})` }}
                    </van-tag>
                </div>

                <!-- 标签类对比（独有标签） -->
                <template v-if="f.isTags">
                    <div class="diff-tags">
                        <div class="diff-tag-col">
                            <div class="diff-tag-col-label">左版独有</div>
                            <div class="diff-tag-wrap">
                                <van-tag v-for="t in f.onlyMasterTags" :key="t" type="success" size="mini">+ {{ t }}</van-tag>
                                <span v-if="!f.onlyMasterTags.length" class="diff-none">无</span>
                            </div>
                        </div>
                        <div class="diff-tag-col">
                            <div class="diff-tag-col-label">右版独有</div>
                            <div class="diff-tag-wrap">
                                <van-tag v-for="t in f.onlyCompareTags" :key="t" type="warning" size="mini">+ {{ t }}</van-tag>
                                <span v-if="!f.onlyCompareTags.length" class="diff-none">无</span>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- 文本类对比 -->
                <template v-else>
                    <div v-if="f.isSame" class="diff-same">两版内容完全一致。</div>
                    <div v-else class="diff-text-grid">
                        <div class="diff-text-col">
                            <div class="diff-col-label">左版</div>
                            <div class="diff-text-box">
                                <div v-for="(line, li) in (f.diffText && f.diffText.masterLines) || []" :key="li"
                                     :class="line.type === 'removed' ? 'diff-removed' : 'diff-dim'">{{ line.text || ' ' }}</div>
                            </div>
                        </div>
                        <div class="diff-text-col">
                            <div class="diff-col-label">右版</div>
                            <div class="diff-text-box">
                                <div v-for="(line, li) in (f.diffText && f.diffText.compareLines) || []" :key="li"
                                     :class="line.type === 'added' ? 'diff-added' : 'diff-dim'">{{ line.text || ' ' }}</div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'DiffModal',
    props: {
        show: { type: Boolean, default: false },
        masterName: { type: String, default: '未知' },
        compareName: { type: String, default: '未知' },
        fieldResults: { type: Array, default: () => [] }
    },
    emits: ['close']
};
</script>

<style scoped>
.diff-popup {
    width: 100%;
    height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.diff-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 4px;
}
.diff-title { font-size: 16px; font-weight: 600; }
.diff-vs { display: flex; gap: 10px; padding: 8px 14px; }
.diff-vs-item {
    flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px;
    display: flex; flex-direction: column; gap: 2px;
}
.diff-vs-item.master { background: rgba(7, 193, 96, 0.08); border: 1px solid rgba(7, 193, 96, 0.3); }
.diff-vs-item.compare { background: rgba(255, 153, 0, 0.08); border: 1px solid rgba(255, 153, 0, 0.3); }
.diff-vs-tag { font-size: 11px; font-weight: 600; }
.diff-vs-item.master .diff-vs-tag { color: #07c160; }
.diff-vs-item.compare .diff-vs-tag { color: #ff9900; }
.diff-vs-name {
    font-size: 12px; color: var(--van-text-color, #323233);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.diff-list { flex: 1; overflow-y: auto; padding: 0 14px 24px; }
.diff-field {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px; padding: 10px; margin-bottom: 10px;
    background: var(--van-background-2, #fff);
}
.diff-field-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.diff-field-label { font-size: 13px; font-weight: 600; color: var(--van-text-color, #323233); }
.diff-same { font-size: 12px; color: var(--van-gray-6, #969799); font-style: italic; }
.diff-tags { display: flex; gap: 10px; }
.diff-tag-col { flex: 1; min-width: 0; }
.diff-tag-col-label { font-size: 11px; color: var(--van-gray-6, #969799); margin-bottom: 4px; }
.diff-tag-wrap { display: flex; flex-wrap: wrap; gap: 4px; }
.diff-none { font-size: 11px; color: var(--van-gray-5, #c8c9cc); }
.diff-text-grid { display: flex; gap: 10px; }
.diff-text-col { flex: 1; min-width: 0; }
.diff-col-label { font-size: 11px; color: var(--van-gray-6, #969799); margin-bottom: 4px; }
.diff-text-box {
    background: var(--van-gray-1, #f7f8fa);
    border-radius: 6px; padding: 6px;
    max-height: 180px; overflow-y: auto;
    font-family: monospace; font-size: 11px;
    word-break: break-all;
}
.diff-removed { background: rgba(238, 10, 36, 0.1); color: #ee0a24; border-left: 2px solid #ee0a24; padding: 1px 4px; margin: 2px 0; }
.diff-added { background: rgba(7, 193, 96, 0.1); color: #07c160; border-left: 2px solid #07c160; padding: 1px 4px; margin: 2px 0; }
.diff-dim { color: var(--van-gray-5, #c8c9cc); opacity: 0.6; padding: 1px 4px; margin: 2px 0; }
</style>
