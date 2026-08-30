<template>
    <div class="view-page">
        <van-nav-bar title="设置" safe-area-inset-top />

        <div class="view-body">
            <!-- 卡片库 -->
            <van-cell-group inset title="卡片库">
                <van-cell
                    title="库目录"
                    :value="libraryState"
                    icon="location-o"
                    :is-link="!granted || true"
                    @click="handlePickFolder"
                />
                <van-cell
                    v-if="granted"
                    title="重新选择库目录"
                    label="授权位置变更后需重新扫描"
                    icon="exchange"
                    is-link
                    @click="handlePickFolder"
                />
                <van-cell
                    v-else-if="authLost"
                    title="库目录已失效 · 重新选择"
                    label="授权位置可能已被移动/删除或系统回收了授权"
                    icon="warning-o"
                    is-link
                    @click="handlePickFolder"
                />
                <van-cell v-else title="未授权 · 点击选择" label="首次使用请选择角色卡库存放的文件夹" icon="question-o" />
                <van-cell title="全部卡片" :value="granted ? scanInfo : '—'" />
            </van-cell-group>

            <!-- API 配置(与卡片详情页「测卡」Tab 共用) -->
            <van-cell-group inset title="聊天测卡 API">
                <van-field v-model="apiEndpoint" label="端点" placeholder="http://127.0.0.1:1234/v1/chat/completions" />
                <van-field v-model="apiKey" label="Key" placeholder="sk-... 或留空" />
                <van-field v-model="apiModel" label="模型" placeholder="local-model" />
                <van-cell title="协议">
                    <template #value>
                        <van-radio-group v-model="apiType" direction="horizontal">
                            <van-radio name="openai" :style="radioStyle">OpenAI</van-radio>
                            <van-radio name="anthropic" :style="radioStyle">Anthropic</van-radio>
                        </van-radio-group>
                    </template>
                </van-cell>
                <div class="save-row">
                    <van-button block size="small" type="primary" @click="saveApi">保存 API 配置</van-button>
                </div>
            </van-cell-group>

            <!-- 外观 -->
            <van-cell-group inset title="外观">
                <van-cell title="界面主题" label="白昼 / 暗夜 / 青灰三主题即时切换">
                    <template #value>
                        <van-radio-group :model-value="theme" direction="horizontal" @update:model-value="onThemePick">
                            <van-radio name="light" :style="radioStyle">白昼</van-radio>
                            <van-radio name="dark" :style="radioStyle">暗夜</van-radio>
                            <van-radio name="slate">青灰</van-radio>
                        </van-radio-group>
                    </template>
                </van-cell>
                <van-cell title="界面字号" label="全局界面文字缩放，对齐桌面字号系统">
                    <template #value>
                        <van-radio-group :model-value="uiFs" direction="horizontal" @update:model-value="onFsPick">
                            <van-radio :name="12" :style="radioStyle">小</van-radio>
                            <van-radio :name="14" :style="radioStyle">标准</van-radio>
                            <van-radio :name="16">大</van-radio>
                        </van-radio-group>
                    </template>
                </van-cell>
            </van-cell-group>

            <!-- 功能 -->
            <van-cell-group inset title="功能">
                <van-cell
                    title="磁盘扫描"
                    label="扫描任意文件夹中的角色卡并导入"
                    icon="scan"
                    is-link
                    @click="$router.push('/scan')"
                />
                <van-cell
                    title="⚙️ 预设管理"
                    label="管理酒馆 Presets 目录 JSON 预设（扫描/编辑/重命名/复制/删除）"
                    icon="apps-o"
                    is-link
                    @click="$router.push('/presets')"
                />
                <van-cell
                    title="回收站"
                    label="浏览并恢复已删除的卡片"
                    icon="delete-o"
                    is-link
                    @click="openTrash"
                />
                <van-cell title="更新源地址" label="GitHub Releases API 或 {version,url} JSON 地址">
                    <template #value>
                        <van-field
                            v-model="updateFeed"
                            placeholder="https://api.github.com/.../releases/latest"
                            class="feed-field"
                        />
                    </template>
                </van-cell>
                <van-cell title="检查更新" icon="upgrade" is-link :disabled="updating" @click="checkUpdate">
                    <template #value>
                        <van-loading v-if="updating" size="16" />
                    </template>
                </van-cell>
            </van-cell-group>

            <!-- 快照与备份 -->
            <van-cell-group inset title="快照与备份">
                <van-cell title="自动快照" label="覆盖保存前自动备份旧版本到 .bak_history">
                    <template #value>
                        <van-switch v-model="snapAuto" @change="saveSnapshotConfig" />
                    </template>
                </van-cell>
                <van-cell title="冷却间隔(秒)">
                    <template #value>
                        <van-stepper v-model="snapCooldown" min="0" max="3600" integer @change="saveSnapshotConfig" />
                    </template>
                </van-cell>
                <van-cell title="最大保留数">
                    <template #value>
                        <van-stepper v-model="snapMaxKeep" min="1" max="100" integer @change="saveSnapshotConfig" />
                    </template>
                </van-cell>
                <van-cell title="清理孤儿快照" label="删除不属于任何现存卡片的快照" icon="delete-o" is-link @click="cleanOrphan" />
                <van-cell title="清理全部快照" label="删除所有快照文件（不影响卡片本体）" icon="delete" is-link @click="cleanAll" />
            </van-cell-group>

            <!-- 导入行为 -->
            <van-cell-group inset title="导入行为">
                <van-cell title="忽略自带标签" label="导入卡片时不读取卡内预置标签">
                    <template #value>
                        <van-switch v-model="ignoreImportTags" @change="onIgnoreTagsChange" />
                    </template>
                </van-cell>
            </van-cell-group>

            <!-- 关于 -->
            <van-cell-group inset title="关于">
                <van-cell title="版本" value="v1.9.0 (移动端 M4)" />
                <van-cell title="数据存储" :label="rootUri || '使用系统文件夹(SAF 目录树授权)'" />
            </van-cell-group>
        </div>

        <!-- 回收站弹窗 -->
        <TrashModal
            :show="showTrash"
            :items="trashItems"
            :loading="trashLoading"
            @close="showTrash = false"
            @restore="restoreTrashItem"
            @empty="emptyTrash"
        />

        <!-- OTA 更新弹窗 -->
        <van-popup v-model:show="showUpdate" position="center" round class="ota-popup">
            <div class="ota-head">
                <span class="ota-title">发现新版本</span>
                <van-icon name="cross" size="18" @click="showUpdate = false" />
            </div>
            <div class="ota-body">
                <div class="ota-version">v{{ updateInfo && updateInfo.version }}</div>
                <div v-if="updateInfo && updateInfo.name && updateInfo.name !== updateInfo.version" class="ota-name">
                    {{ updateInfo.name }} · {{ fmtSize(updateInfo.size) }}
                </div>
                <div v-if="updateInfo && updateInfo.notes" class="ota-notes">{{ updateInfo.notes }}</div>

                <div v-if="downloading" class="ota-progress">
                    <van-progress :percentage="downloadPercent" :show-pivot="false" stroke-width="6" />
                    <div class="ota-progress-text">
                        {{ downloadPercent >= 0 ? `下载中 ${downloadPercent}%` : '下载中…' }}
                    </div>
                </div>
            </div>
            <div class="ota-ops">
                <van-button v-if="!downloading" block type="primary" @click="doDownload">下载并安装</van-button>
                <van-button v-else block disabled loading>下载中…</van-button>
            </div>
        </van-popup>
    </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import { api } from '../../bridge/api';
import { loadLibrary } from '../useMobileLibrary';
import { applyTheme, currentTheme, currentFs, applyFs } from '../theme';
import TrashModal from '../components/TrashModal.vue';

// 与卡片详情页「测卡」Tab 共用的 API 配置存储键
const LS_ENDPOINT = 'stc-api-endpoint';
const LS_KEY = 'stc-api-key';
const LS_MODEL = 'stc-api-model';
const LS_TYPE = 'stc-api-type';
// OTA 更新源
const LS_FEED = 'jsmobile-update-feed';

export default {
    name: 'SettingsView',
    components: { TrashModal },
    setup() {
        const granted = ref(false);
        const authLost = ref(false);
        const rootUri = ref('');
        const scanInfo = ref('');
        const darkTheme = ref(currentTheme() !== 'light');
        const theme = ref(currentTheme());
        const uiFs = ref(currentFs());
        const radioStyle = { marginRight: '12px' };
        function onThemePick(v) {
            theme.value = v;
            darkTheme.value = v !== 'light';
            applyTheme(v);
        }
        function onFsPick(v) {
            uiFs.value = applyFs(v);
            showSuccessToast('字号已调整');
        }

        // ---------- OTA ----------
        const updateFeed = ref(localStorage.getItem(LS_FEED) || '');
        const updating = ref(false);
        const showUpdate = ref(false);
        const updateInfo = ref(null);
        const downloading = ref(false);
        const downloadPercent = ref(0);

        function fmtSize(n) {
            if (!n) return '';
            return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB';
        }

        api.onUpdateProgress((d) => {
            if (d && d.phase === 'download') {
                downloadPercent.value = d.percent >= 0 ? d.percent : 0;
            }
        });

        async function checkUpdate() {
            if (!updateFeed.value.trim()) {
                showToast('请先填写更新源地址');
                return;
            }
            localStorage.setItem(LS_FEED, updateFeed.value.trim());
            updating.value = true;
            try {
                const res = await api.checkUpdate(updateFeed.value.trim());
                if (!res.success) {
                    showToast(res.error || '检查更新失败');
                    return;
                }
                if (!res.update || !res.info) {
                    showToast('当前已是最新版本');
                    return;
                }
                updateInfo.value = res.info;
                downloadPercent.value = 0;
                showUpdate.value = true;
            } finally {
                updating.value = false;
            }
        }

        async function doDownload() {
            if (!updateInfo.value) return;
            downloading.value = true;
            downloadPercent.value = 0;
            try {
                const res = await api.downloadUpdate();
                if (!res.success || !res.filePath) {
                    showToast((res && res.error) || '下载失败');
                    return;
                }
                showToast('下载完成，正在拉起安装…');
                // 系统安装器结束后短暂停留再关闭弹窗,避免用户在系统界面操作时被遮挡
                const inst = await api.installUpdate(res.filePath);
                if (!inst.success) {
                    showToast((inst && inst.error) || '拉起安装器失败');
                } else {
                    setTimeout(() => { showUpdate.value = false; }, 600);
                }
            } catch (e) {
                showToast((e && e.message) || '下载失败');
            } finally {
                downloading.value = false;
            }
        }

        const apiEndpoint = ref(localStorage.getItem(LS_ENDPOINT) || 'http://127.0.0.1:1234/v1/chat/completions');
        const apiKey = ref(localStorage.getItem(LS_KEY) || '');
        const apiModel = ref(localStorage.getItem(LS_MODEL) || 'local-model');
        const apiType = ref(localStorage.getItem(LS_TYPE) === 'anthropic' ? 'anthropic' : 'openai');

        const libraryState = () => (granted.value ? '已授权 ✓' : (authLost.value ? '已失效' : '未授权'));

        async function refreshInfo() {
            const info = await api.libraryInfo();
            granted.value = !!(info && info.granted);
            authLost.value = !!(info && info.hasUri) && !info.granted;
            rootUri.value = (info && info.uri) || '';
        }

        async function refreshStats() {
            const res = await api.rescanLibrary('/library');
            if (res && !res.error) {
                const n = (res.files || []).length;
                const cats = (res.categories || []).length;
                scanInfo.value = `${n} 张${n ? ' · ' + cats + ' 个分组' : ''}`;
            } else {
                scanInfo.value = '—';
            }
        }

        async function handlePickFolder() {
            try {
                const res = await api.selectFolder();
                await refreshInfo();
                if (res && res.error) {
                    showToast(res.error);
                    return;
                }
                const n = (res.files || []).length;
                scanInfo.value = `${n} 张`;
                loadLibrary();
                showSuccessToast(`已授权库目录 · 扫描到 ${n} 张`);
            } catch (e) {
                showToast('已取消或失败');
            }
        }

        function saveApi() {
            localStorage.setItem(LS_ENDPOINT, apiEndpoint.value.trim());
            localStorage.setItem(LS_KEY, apiKey.value.trim());
            localStorage.setItem(LS_MODEL, apiModel.value.trim());
            localStorage.setItem(LS_TYPE, apiType.value);
            showSuccessToast('已保存 API 配置');
        }

        function onThemeChange(v) {
            onThemePick(v ? 'dark' : 'light');
        }

        onMounted(() => {
            refreshInfo();
            refreshStats();
        });

        // ---------- 回收站 ----------
        const showTrash = ref(false);
        const trashItems = ref([]);
        const trashLoading = ref(false);

        async function openTrash() {
            showTrash.value = true;
            await loadTrash();
        }

        async function loadTrash() {
            trashLoading.value = true;
            try {
                const res = await api.listTrash();
                trashItems.value = (res && res.success && res.items) || [];
            } catch (e) {
                trashItems.value = [];
            } finally {
                trashLoading.value = false;
            }
        }

        async function restoreTrashItem(item) {
            try {
                await showConfirmDialog({
                    title: '恢复文件',
                    message: `将「${item.name}」恢复到原位置。\n${item.relPath || ''}`,
                    confirmButtonText: '恢复',
                    confirmButtonColor: '#06b6d4'
                });
            } catch (e) { return; }
            const res = await api.restoreTrashItem(item.path);
            if (res && res.success) {
                showSuccessToast('已恢复');
                await loadTrash();
                await refreshStats();
                loadLibrary();
            } else {
                showToast((res && res.error) || '恢复失败');
            }
        }

        async function emptyTrash() {
            try {
                await showConfirmDialog({
                    title: '清空回收站',
                    message: '将永久删除回收站内所有文件，不可恢复。',
                    confirmButtonText: '清空',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.emptyTrash();
            if (res && res.success) {
                showSuccessToast('已清空');
                trashItems.value = [];
            } else {
                showToast((res && res.error) || '清空失败');
            }
        }

        // ---------- 快照配置与清理 ----------
        const snapAuto = ref(true);
        const snapCooldown = ref(30);
        const snapMaxKeep = ref(10);

        onMounted(async () => {
            try {
                const cfg = await api.loadAppConfig();
                const sc = (cfg && cfg.snapshotConfig) || {};
                if (typeof sc.enabled === 'boolean') snapAuto.value = sc.enabled;
                if (typeof sc.cooldownMs === 'number') snapCooldown.value = Math.round(sc.cooldownMs / 1000);
                if (typeof sc.maxKeep === 'number') snapMaxKeep.value = sc.maxKeep;
            } catch (e) { /* 使用默认值 */ }
        });

        async function saveSnapshotConfig() {
            const res = await api.updateSnapshotConfig({
                enabled: snapAuto.value,
                cooldownMs: Math.max(0, snapCooldown.value) * 1000,
                maxKeep: snapMaxKeep.value
            });
            if (res && res.success) showSuccessToast('快照配置已保存');
            else showToast((res && res.error) || '保存失败');
        }

        async function cleanOrphan() {
            try {
                await showConfirmDialog({ title: '清理孤儿快照', message: '将删除不属于任何现存卡片的快照文件。', confirmButtonText: '清理' });
            } catch (e) { return; }
            const res = await api.cleanOrphanSnapshots();
            if (res && res.success) showSuccessToast(`已清理 ${res.count || 0} 个孤儿快照`);
            else showToast((res && res.error) || '清理失败');
        }

        async function cleanAll() {
            try {
                await showConfirmDialog({
                    title: '清理全部快照',
                    message: '将删除所有快照文件（不影响卡片本体），不可恢复。',
                    confirmButtonText: '清理',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.cleanAllSnapshots();
            if (res && res.success) showSuccessToast(`已清理 ${res.count || 0} 个快照`);
            else showToast((res && res.error) || '清理失败');
        }

        // ---------- 导入行为:忽略自带标签 ----------
        const LS_IGNORE_TAGS = 'jsmobile-ignore-import-tags';
        const ignoreImportTags = ref(localStorage.getItem(LS_IGNORE_TAGS) === '1');

        function onIgnoreTagsChange(v) {
            localStorage.setItem(LS_IGNORE_TAGS, v ? '1' : '0');
            showSuccessToast(v ? '导入时将忽略自带标签' : '导入时保留自带标签');
        }

        return {
            granted, authLost, rootUri, scanInfo, darkTheme, theme, uiFs, onThemePick, onFsPick,
            apiEndpoint, apiKey, apiModel, apiType, radioStyle,
            libraryState, handlePickFolder, saveApi, onThemeChange,
            updateFeed, updating, showUpdate, updateInfo, downloading, downloadPercent,
            fmtSize, checkUpdate, doDownload,
            showTrash, trashItems, trashLoading, openTrash, restoreTrashItem, emptyTrash,
            snapAuto, snapCooldown, snapMaxKeep, saveSnapshotConfig, cleanOrphan, cleanAll,
            ignoreImportTags, onIgnoreTagsChange
        };
    }
};
</script>

<style scoped>
.view-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}
.view-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 0 24px;
}
.save-row {
    padding: 10px 16px 4px;
}
.feed-field :deep(.van-field__control) {
    text-align: right;
    font-size: 12px;
}
.ota-popup {
    width: 84vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.ota-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.ota-title { font-size: 16px; font-weight: 600; }
.ota-body { padding: 14px 16px 8px; }
.ota-version { font-size: 18px; font-weight: 700; color: #06b6d4; }
.ota-name { margin-top: 4px; font-size: 12px; color: var(--van-gray-6, #969799); }
.ota-notes {
    margin-top: 10px;
    max-height: 30vh;
    overflow-y: auto;
    white-space: pre-line;
    font-size: 12px;
    line-height: 1.7;
    color: var(--van-text-color, #323233);
}
.ota-progress { margin-top: 14px; }
.ota-progress-text { margin-top: 6px; font-size: 12px; color: var(--van-gray-6, #969799); text-align: center; }
.ota-ops { padding: 6px 16px 16px; }
</style>