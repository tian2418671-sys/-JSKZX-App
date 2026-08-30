<!--
  TrashModal 移动端回收站弹窗（Vant 底部弹层）
  展示库根 .trash 内的软删除文件，支持恢复 / 清空
  逻辑留在父级（SettingsView），本组件纯 UI + emits
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="trash-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="trash-head">
            <span class="trash-title">🗑️ 回收站</span>
            <span class="trash-count">{{ items.length }} 项</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="trash-actions">
            <van-button
                v-if="items.length"
                size="small"
                plain
                type="danger"
                icon="delete-o"
                @click="$emit('empty')"
            >清空回收站</van-button>
        </div>

        <div class="trash-list">
            <van-loading v-if="loading" class="trash-loading">加载中…</van-loading>

            <van-empty v-else-if="!items.length" description="回收站为空" image-size="70">
                <div class="trash-empty-tip">删除的卡片会暂存在这里，可随时恢复</div>
            </van-empty>

            <div v-for="(item, idx) in items" :key="item.path" class="trash-item">
                <div class="trash-item-main">
                    <div class="trash-name">{{ item.name }}</div>
                    <div class="trash-sub">{{ item.relPath }} · {{ formatSize(item.size) }} · {{ formatTime(item.mtimeMs) }}</div>
                </div>
                <van-button size="mini" type="primary" @click="$emit('restore', item)">恢复</van-button>
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'TrashModal',
    props: {
        show: { type: Boolean, default: false },
        items: { type: Array, default: () => [] },
        loading: { type: Boolean, default: false }
    },
    emits: ['close', 'restore', 'empty'],
    methods: {
        formatTime(ms) {
            if (!ms) return '未知时间';
            try {
                return new Date(ms).toLocaleString('zh-CN', {
                    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch (e) { return String(ms); }
        },
        formatSize(bytes) {
            if (!bytes && bytes !== 0) return '';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        }
    }
};
</script>

<style scoped>
.trash-popup {
    max-height: 76vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.trash-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px 10px;
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.trash-title { font-size: 16px; font-weight: 600; }
.trash-count { font-size: 12px; color: var(--van-gray-6, #969799); margin-right: auto; }
.trash-actions {
    display: flex;
    gap: 10px;
    padding: 10px 16px 4px;
}
.trash-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 16px 24px;
}
.trash-loading { display: block; padding: 30px 0; }
.trash-empty-tip {
    font-size: 12px;
    color: var(--van-gray-6, #969799);
    text-align: center;
    margin-top: -6px;
}
.trash-item {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 10px 12px;
    margin-top: 10px;
    background: var(--van-background-2, #fff);
}
.trash-item-main { flex: 1; min-width: 0; }
.trash-name { font-size: 13px; font-weight: 600; word-break: break-all; }
.trash-sub {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    margin-top: 2px;
    word-break: break-all;
}
</style>
