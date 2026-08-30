<template>
    <div class="view-page">
        <van-nav-bar title="磁盘扫描" left-arrow @click-left="$router.back()" safe-area-inset-top />

        <div class="view-body">
            <!-- 操作区 -->
            <van-cell-group inset>
                <van-cell title="扫描目录" :label="statusText" :value="scanTitle || '未扫描'">
                    <template #right-icon>
                        <van-button size="small" type="primary" :loading="scanning" @click="startScan">选择目录</van-button>
                    </template>
                </van-cell>
            </van-cell-group>

            <div class="scan-tip">
                选择任意目录后，应用将深度扫描其中的 PNG / WebP 图片（跳过 50MB 以上的大图），
                勾选想要的角色卡后一键导入当前库。库内同名文件会自动跳过、不覆盖。
            </div>

            <!-- 扫描进度 -->
            <div v-if="scanning" class="status-wrap">
                <van-loading size="28" vertical>{{ progressText }}</van-loading>
            </div>

            <!-- 结果列表 -->
            <template v-else-if="files.length">
                <div class="result-bar">
                    <van-checkbox v-model="allChecked" @change="toggleAll">全选</van-checkbox>
                    <span class="result-count">共 {{ files.length }} 个文件 · 已选 {{ checkedCount }} 个</span>
                </div>
                <div class="scan-list">
                    <div v-for="(f, i) in files" :key="i" class="scan-item" @click="toggleItem(i)">
                        <van-checkbox :model-value="selected.includes(i)" @click.stop="toggleItem(i)" />
                        <div class="scan-item-main">
                            <div class="scan-item-name">{{ f.name }}</div>
                            <div class="scan-item-path">{{ f.path }}</div>
                        </div>
                        <span class="scan-item-size">{{ fmtSize(f.size) }}</span>
                    </div>
                </div>
                <div class="bottom-ops">
                    <van-button block type="primary" :disabled="checkedCount === 0" :loading="importing" @click="doImport">
                        导入勾选的 {{ checkedCount }} 个文件
                    </van-button>
                </div>
            </template>

            <van-empty v-else-if="!scanning" description="尚未扫描" image-size="80" />
            <div class="bottom-pad" />
        </div>
    </div>
</template>

<script>
import { ref, computed, onUnmounted } from 'vue';
import { showSuccessToast, showToast } from 'vant';
import { loadLibrary, LIBRARY_ROOT } from '../useMobileLibrary';

export default {
    name: 'DiskScanView',
    setup() {
        const scanning = ref(false);
        const importing = ref(false);
        const files = ref([]);
        const selected = ref([]);
        const scanTitle = ref('');
        const progressText = ref('正在扫描…');
        const treeUri = ref('');
        const allChecked = ref(false);

        const checkedCount = computed(() => selected.value.length);

        const statusText = computed(() => {
            if (scanning.value) return '扫描中…';
            return files.value.length ? `发现 ${files.value.length} 个文件` : '可选择任意文件夹开始扫描';
        });

        function fmtSize(n) {
            return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
        }

        /** 选择目录并深度扫描(原生 SAF 目录授权,不持久化) */
        async function startScan() {
            if (scanning.value) return;
            scanning.value = true;
            files.value = [];
            selected.value = [];
            allChecked.value = false;
            window.electronAPI.onScanProgress((data) => {
                if (data && (data.found !== undefined || data.title)) {
                    progressText.value = `已遍历 ${data.count || 0} 个目录 · 发现 ${data.found || 0} 个文件`;
                }
            });
            try {
                const res = await window.electronAPI.scanTargetFolder();
                if (res && res.files) {
                    files.value = res.files;
                    treeUri.value = res.treeUri || '';
                    scanTitle.value = res.title || '扫描完成';
                } else {
                    const err = (res && res.error) || '';
                    if (!/取消/i.test(err)) showToast(err || '扫描失败');
                }
            } catch (e) {
                showToast((e && e.message) || '扫描失败');
            } finally {
                scanning.value = false;
                if (!files.value.length) scanTitle.value = '';
            }
        }

        function toggleItem(i) {
            const idx = selected.value.indexOf(i);
            if (idx >= 0) selected.value.splice(idx, 1);
            else selected.value.push(i);
            allChecked.value = selected.value.length === files.value.length && files.value.length > 0;
        }
        function toggleAll() {
            if (allChecked.value) {
                selected.value = files.value.map((_, i) => i);
            } else {
                selected.value = [];
            }
        }

        /** 导入勾选文件到库根(同名跳过不覆盖) */
        async function doImport() {
            if (!treeUri.value || !selected.value.length) return;
            importing.value = true;
            try {
                const paths = selected.value.map((i) => files.value[i].path);
                const res = await window.electronAPI.importScanned({
                    treeUri: treeUri.value,
                    scanPaths: paths,
                    destFolder: LIBRARY_ROOT
                });
                if (res && res.success) {
                    const msg = [`成功导入 ${(res.copied || []).length} 个`];
                    if (res.skipped && res.skipped.length) msg.push(`同名跳过 ${res.skipped.length} 个`);
                    if (res.failed && res.failed.length) msg.push(`失败 ${res.failed.length} 个`);
                    showSuccessToast(msg.join(' · '));
                    // 重新加载库,新卡即刻可见
                    try { await loadLibrary(); } catch (e) { /* 忽略 */ }
                    // 清空本次扫描结果
                    files.value = [];
                    selected.value = [];
                    allChecked.value = false;
                    scanTitle.value = '';
                } else {
                    showToast((res && res.error) || '导入失败');
                }
            } catch (e) {
                showToast((e && e.message) || '导入失败');
            } finally {
                importing.value = false;
            }
        }

        onUnmounted(() => {
            // 离开页面时释放掉引用,避免下一轮 onScanProgress 仍指向本页
            window.electronAPI.onScanProgress(null);
        });

        return {
            scanning, importing, files, selected, scanTitle, progressText, allChecked,
            checkedCount, statusText, fmtSize,
            startScan, toggleItem, toggleAll, doImport
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.view-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 0 24px; }
.scan-tip {
    margin: 10px 16px 4px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--van-gray-6, #969799);
}
.status-wrap { padding: 44px 0; text-align: center; }
.result-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px 4px;
}
.result-count { font-size: 12px; color: var(--van-gray-6, #969799); }
.scan-list { padding: 0 12px; }
.scan-item {
    display: flex; align-items: center; gap: 10px;
    background: var(--van-background-2, #fff);
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 8px;
}
.scan-item-main { flex: 1; min-width: 0; }
.scan-item-name {
    font-size: 14px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.scan-item-path {
    margin-top: 2px;
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.scan-item-size { font-size: 12px; color: var(--van-gray-6, #969799); flex-shrink: 0; }
.bottom-ops { padding: 14px 16px 8px; }
.bottom-pad { height: 16px; }
</style>