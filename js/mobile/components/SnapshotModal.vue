<!--
  阶段 2.1/2.2: 快照管理弹窗
  卡片快照与世界书快照共用此组件,通过 mode 区分调用不同桥接方法
  桥接 API(卡片):
    createManualSnapshot(filePath) → { success, snapshotPath }
    listCardSnapshots(filePath) → [{ fileName, path, mtimeMs, size, isManual }]
    restoreCardSnapshot({ filePath, snapshotPath }) → { success }
    deleteCardSnapshot(snapshotPath) → { success }
  桥接 API(世界书):
    createManualSnapshot(filePath) → { success, snapshotPath }  (通用 buffer 复制)
    listWorldbookSnapshots(filePath) → [{ fileName, path, mtimeMs, size, isManual }]
    restoreWorldbookSnapshot({ filePath, snapshotPath }) → { success }
    deleteWorldbookSnapshot(snapshotPath) → { success }
-->
<template>
    <van-popup v-model:show="visible" position="bottom" round style="height: 70%">
        <van-nav-bar :title="`快照 · ${targetName || ''}`" @click-left="close">
            <template #left><van-icon name="arrow-left" /></template>
            <template #right>
                <van-icon name="plus" size="20" @click="onCreate" />
            </template>
        </van-nav-bar>

        <div class="snap-body">
            <div v-if="loading" class="status-wrap"><van-loading>加载快照…</van-loading></div>

            <template v-else>
                <van-empty v-if="!snapshots.length" description="暂无快照，点击右上角 ＋ 创建" image-size="60" />

                <van-swipe-cell v-for="snap in snapshots" :key="snap.path">
                    <div class="snap-item">
                        <div class="snap-head">
                            <div class="snap-info">
                                <div class="snap-title">{{ snap.fileName }}</div>
                                <div class="snap-meta">
                                    {{ formatTime(snap.mtimeMs) }}
                                    <span v-if="snap.isManual" class="snap-badge">手动</span>
                                    <span class="snap-size">· {{ formatSize(snap.size) }}</span>
                                </div>
                            </div>
                            <van-icon name="back-top" size="18" color="#06b6d4" @click="onRestore(snap)" />
                        </div>
                    </div>
                    <template #right>
                        <van-button square type="danger" text="删除" style="height: 100%" @click="onDelete(snap)" />
                    </template>
                </van-swipe-cell>
            </template>
        </div>
    </van-popup>
</template>

<script>
import { ref, watch } from 'vue';
import { showSuccessToast, showToast } from 'vant';

export default {
    name: 'SnapshotModal',
    props: {
        show: Boolean,
        targetPath: { type: String, default: '' },
        targetName: { type: String, default: '' },
        mode: { type: String, default: 'card' } // 'card' | 'worldbook'
    },
    emits: ['update:show', 'restored'],
    setup(props, { emit }) {
        const visible = ref(false);
        const snapshots = ref([]);
        const loading = ref(false);

        watch(() => props.show, (v) => {
            visible.value = v;
            if (v && props.targetPath) loadSnapshots();
        });
        watch(visible, (v) => { if (!v) emit('update:show', false); });

        function close() { visible.value = false; }

        async function loadSnapshots() {
            loading.value = true;
            try {
                const api = window.electronAPI;
                if (props.mode === 'worldbook') {
                    snapshots.value = await api.listWorldbookSnapshots(props.targetPath);
                } else {
                    snapshots.value = await api.listCardSnapshots(props.targetPath);
                }
            } catch (e) {
                snapshots.value = [];
            } finally {
                loading.value = false;
            }
        }

        function formatTime(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            if (isNaN(d.getTime())) return String(ts);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }

        function formatSize(bytes) {
            if (!bytes) return '—';
            if (bytes < 1024) return bytes + 'B';
            if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
            return (bytes/1024/1024).toFixed(1) + 'MB';
        }

        async function onCreate() {
            if (!props.targetPath) return;
            try {
                const res = await window.electronAPI.createManualSnapshot(props.targetPath);
                if (res && res.success) {
                    showSuccessToast('快照已创建');
                    await loadSnapshots();
                } else {
                    showToast(res.error || '创建快照失败');
                }
            } catch (e) {
                showToast('创建失败: ' + (e.message || e));
            }
        }

        async function onRestore(snap) {
            if (!window.confirm(`确定恢复到快照「${snap.fileName}」吗？\n当前内容将被覆盖（自动备份）。`)) return;
            try {
                const api = window.electronAPI;
                let res;
                if (props.mode === 'worldbook') {
                    res = await api.restoreWorldbookSnapshot({ filePath: props.targetPath, snapshotPath: snap.path });
                } else {
                    res = await api.restoreCardSnapshot({ filePath: props.targetPath, snapshotPath: snap.path });
                }
                if (res && res.success) {
                    showSuccessToast('已恢复');
                    emit('restored');
                    close();
                } else {
                    showToast(res.error || '恢复失败');
                }
            } catch (e) {
                showToast('恢复失败: ' + (e.message || e));
            }
        }

        async function onDelete(snap) {
            if (!window.confirm(`确定删除快照「${snap.fileName}」吗？`)) return;
            try {
                const api = window.electronAPI;
                let res;
                if (props.mode === 'worldbook') {
                    res = await api.deleteWorldbookSnapshot(snap.path);
                } else {
                    res = await api.deleteCardSnapshot(snap.path);
                }
                if (res && res.success) {
                    showSuccessToast('已删除');
                    await loadSnapshots();
                } else {
                    showToast(res.error || '删除失败');
                }
            } catch (e) {
                showToast('删除失败: ' + (e.message || e));
            }
        }

        return {
            visible, snapshots, loading,
            close, formatTime, formatSize,
            onCreate, onRestore, onDelete
        };
    }
};
</script>

<style scoped>
.snap-body {
    overflow-y: auto;
    padding: 8px 0 24px;
    max-height: calc(70vh - 46px);
}
.snap-item {
    margin: 6px 12px;
    border: 1px solid var(--van-border-color, #eee);
    border-radius: 8px;
    overflow: hidden;
    background: var(--van-cell-background, #fff);
}
.snap-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
}
.snap-info { flex: 1; min-width: 0; }
.snap-title { font-weight: 500; font-size: 13px; word-break: break-all; }
.snap-meta { font-size: 12px; color: var(--van-text-color-2, #999); margin-top: 2px; }
.snap-badge {
    display: inline-block;
    font-size: 10px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(6,182,212,0.16);
    color: #06b6d4;
    margin-left: 4px;
}
.snap-size { margin-left: 4px; }
</style>
