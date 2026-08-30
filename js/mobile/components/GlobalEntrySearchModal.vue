<!--
  GlobalEntrySearchModal 移动端全库词条搜索弹窗（Vant 底部弹层）
  索引/搜索/跳转逻辑留在父级（本组件纯展示 + emits）
  跨「独立世界书 + 角色卡内嵌世界书」按触发词/正文/备注/来源名检索
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="ges-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="ges-head">
            <span class="ges-title">🔎 全库词条搜索</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="ges-search">
            <van-search
                :model-value="query"
                shape="round"
                placeholder="搜索触发词 / 正文 / 备注 / 来源名"
                autofocus
                @update:model-value="$emit('update:query', $event)"
            />
            <div class="ges-count">
                共索引 {{ indexCount }} 条词条
                <template v-if="query.trim()">，命中 <b>{{ results.length }}</b> 条</template>
            </div>
        </div>

        <div class="ges-list">
            <van-empty v-if="!query.trim()" description="输入关键词开始全库搜索" image-size="70" />
            <van-empty v-else-if="!results.length" description="未找到匹配词条" image-size="70" />

            <div v-else v-for="(r, i) in results" :key="i" class="ges-item" @click="$emit('jump', r)">
                <div class="ges-item-head">
                    <van-tag :type="r.sourceType === 'worldbook' ? 'warning' : 'primary'" size="mini">
                        {{ r.sourceType === 'worldbook' ? '🌍 世界书' : '🎴 角色卡' }}
                    </van-tag>
                    <span class="ges-source">{{ r.sourceName }}</span>
                    <span v-if="!r.enabled" class="ges-disabled">停用</span>
                </div>
                <div v-if="r.keys.length" class="ges-keys">
                    <van-tag
                        v-for="k in r.keys.slice(0, 6)"
                        :key="k"
                        plain
                        type="success"
                        size="mini"
                    >{{ k }}</van-tag>
                    <span v-if="r.keys.length > 6" class="ges-more">+{{ r.keys.length - 6 }}</span>
                </div>
                <div class="ges-content">{{ r.content || '（无正文）' }}</div>
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'GlobalEntrySearchModal',
    props: {
        show: { type: Boolean, default: false },
        query: { type: String, default: '' },
        results: { type: Array, default: () => [] },
        indexCount: { type: Number, default: 0 }
    },
    emits: ['close', 'update:query', 'jump']
};
</script>

<style scoped>
.ges-popup {
    width: 100%;
    height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.ges-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 4px;
}
.ges-title { font-size: 16px; font-weight: 600; }
.ges-search { padding: 0 4px; }
.ges-count { padding: 0 16px 6px; font-size: 12px; color: var(--van-gray-6, #969799); }
.ges-count b { color: var(--van-primary-color, #1989fa); }
.ges-list { flex: 1; overflow-y: auto; padding: 0 14px 20px; }
.ges-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 10px;
    margin-bottom: 10px;
    background: var(--van-background-2, #fff);
}
.ges-item-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ges-source {
    font-size: 13px; font-weight: 600; color: var(--van-text-color, #323233);
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ges-disabled { font-size: 11px; color: var(--van-gray-6, #969799); }
.ges-keys { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.ges-more { font-size: 11px; color: var(--van-gray-6, #969799); }
.ges-content {
    font-size: 12px; color: var(--van-gray-7, #646566);
    font-family: monospace;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
}
</style>
