<!--
  SnapshotModal 移动端历史快照弹窗（Vant 底部弹层）
  展示指定卡片 .bak_history 内的历史快照，支持手动创建 / 恢复 / 删除 / 清理
  逻辑留在父级（CardDetailView），本组件纯 UI + emits，与桌面端 SnapshotModal 对齐
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="snap-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="snap-head">
            <span class="snap-title">📸 历史快照</span>
            <span class="snap-count">{{ snapshots.length }} 份</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div v-if="canCreate || canClean" class="snap-actions">
            <van-button v-if="canCreate" size="small" type="primary" plain icon="plus" @click="$emit('create')">手动快照</van-button>
            <van-button
                v-if="canClean && snapshots.length"
                size="small"
                plain
                icon="delete-o"
                @click="$emit('clean')"
            >清理全部</van-button>
        </div>

        <div class="snap-list">
            <van-empty
                v-if="!snapshots.length"
                description="暂无快照"
                image-size="70"
            >
                <div class="snap-empty-tip">每次「覆盖保存」前会自动备份旧版本到 .bak_history</div>
            </van-empty>

            <div v-for="(snap, idx) in snapshots" :key="snap.path" class="snap-item">
                <div class="snap-meta">
                    <span class="snap-time">{{ formatTime(snap.mtimeMs) }}</span>
                    <van-tag v-if="snap.isManual" type="primary" plain size="mini">手动</van-tag>
                </div>
                <div class="snap-sub">{{ snap.fileName }} · {{ formatSize(snap.size) }}</div>
                <div class="snap-ops">
                    <van-button size="mini" type="warning" @click="$emit('restore', snap)">恢复</van-button>
                    <van-button size="mini" plain type="danger" @click="$emit('delete', snap)">删除</van-button>
                </div>
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'SnapshotModal',
    props: {
        show: { type: Boolean, default: false },
        snapshots: { type: Array, default: () => [] },
        cardName: { type: String, default: '' },
        canCreate: { type: Boolean, default: true },
        canClean: { type: Boolean, default: true }
    },
    emits: ['close', 'create', 'restore', 'delete', 'clean'],
    methods: {
        formatTime(ms) {
            if (!ms) return '未知时间';
            try {
                return new Date(ms).toLocaleString('zh-CN', {
                    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
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
.snap-popup {
    max-height: 76vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.snap-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px 10px;
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.snap-title { font-size: 16px; font-weight: 600; }
.snap-count { font-size: 12px; color: var(--van-gray-6, #969799); margin-right: auto; }
.snap-actions {
    display: flex;
    gap: 10px;
    padding: 10px 16px 4px;
}
.snap-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 16px 24px;
}
.snap-empty-tip {
    font-size: 12px;
    color: var(--van-gray-6, #969799);
    text-align: center;
    margin-top: -6px;
}
.snap-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 10px 12px;
    margin-top: 10px;
    background: var(--van-background-2, #fff);
}
.snap-meta {
    display: flex;
    align-items: center;
    gap: 6px;
}
.snap-time { font-size: 13px; font-weight: 600; }
.snap-sub {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    margin: 4px 0 8px;
    word-break: break-all;
    font-family: monospace;
}
.snap-ops {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}
</style>
