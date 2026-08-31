<template>
    <div class="view-page">
        <van-nav-bar title="世界书" safe-area-inset-top>
            <template #right>
                <van-icon name="plus" size="20" @click="onNewWorldbook" />
                <van-icon name="replay" size="20" style="margin-left: 16px" @click="reload" />
                <van-icon name="ellipsis" size="22" style="margin-left: 16px" @click="showMore = true" />
            </template>
        </van-nav-bar>

        <div class="view-body">
            <div v-if="library.loading"><div class="status-wrap"><van-loading>加载库…</van-loading></div></div>

            <!-- 打开编辑器 -->
            <template v-if="editing">
                <van-nav-bar
                    :title="editing.name"
                    left-arrow
                    @click-left="closeEditor"
                    class="sub-nav"
                >
                    <template #right>
                        <van-icon
                            name="down"
                            size="20"
                            style="margin-right: 14px"
                            @click="openWbImport"
                        />
                        <van-icon
                            v-if="editing.file && !editing.external"
                            name="clock-o"
                            size="20"
                            style="margin-right: 14px"
                            @click="openWbSnapshots"
                        />
                        <van-icon name="success" size="20" :color="'#06b6d4'" @click="saveAll" />
                    </template>
                </van-nav-bar>
                <van-button block icon="plus" type="primary" plain style="margin: 10px 12px" @click="addEntry">添加条目</van-button>

                <!-- 词条工具栏：搜索 / 筛选 / 排序 / 体检 / 展开折叠 / 批量 -->
                <div class="wb-toolbar">
                    <van-search v-model="entrySearchQuery" placeholder="搜索触发词 / 正文 / 条目名" shape="round" />
                    <div class="wb-toolbar-row">
                        <van-dropdown-menu active-color="#06b6d4">
                            <van-dropdown-item v-model="entryFilterState" :options="ENTRY_FILTER_OPTIONS" />
                            <van-dropdown-item v-model="entrySortBy" :options="ENTRY_SORT_OPTIONS" />
                        </van-dropdown-menu>
                        <van-button size="small" plain icon="medal-o" @click="runEntryHealthCheck">体检</van-button>
                        <van-button size="small" plain @click="expandAllEntries">展开</van-button>
                        <van-button size="small" plain @click="collapseAllEntries">折叠</van-button>
                        <van-button size="small" plain :type="entryBatchMode ? 'warning' : 'default'" @click="toggleEntryBatch">批量</van-button>
                    </div>
                </div>

                <div v-for="item in entryList" :key="item.key" class="wb-item">
                    <div class="wb-head">
                        <van-checkbox
                            v-if="entryBatchMode"
                            :model-value="entryBatchSet.has(item.key)"
                            size="18px"
                            @click.stop="toggleEntryBatchSelect(item.key)"
                        />
                        <van-switch v-model="item.e.enabled" size="20px" />
                        <van-field v-model="item.e.comment" :placeholder="entryDisplayName(item.e)" class="wb-name" />
                        <van-icon name="arrow-up" size="16" color="#969799" @click="moveEntryByKey(item.key, -1)" />
                        <van-icon name="arrow-down" size="16" color="#969799" @click="moveEntryByKey(item.key, 1)" />
                        <van-icon name="plus" size="16" color="#969799" @click="duplicateEntry(item.key)" />
                        <van-icon name="arrow" :class="['wb-arrow', { 'wb-arrow-open': wbExpanded[item.key] }]" size="14" @click="toggleWbExpand(item.key)" />
                        <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeEntry(item.key)" />
                    </div>
                    <div v-if="wbExpanded[item.key]" class="wb-detail">
                        <van-field v-model="item.e._keysText" label="触发词" placeholder="逗号分隔，多个用英文逗号" @blur="syncWbKeys(item.e)" />
                        <van-field v-model="item.e._secKeysText" label="次级触发词" placeholder="逗号分隔，可选" @blur="syncWbSecKeys(item.e)" />
                        <div class="wb-num-row">
                            <van-field v-model.number="item.e.insertion_order" type="number" label="优先级" placeholder="50" />
                            <van-field v-model.number="item.e.order" type="number" label="权重" placeholder="100" />
                        </div>
                        <van-cell title="常驻显示" center>
                            <template #right-icon><van-switch v-model="item.e.constant" size="20px" /></template>
                        </van-cell>
                        <van-cell title="条件触发" center>
                            <template #right-icon><van-switch v-model="item.e.selective" size="20px" /></template>
                        </van-cell>
                        <van-cell-group inset title="插入位置">
                            <van-radio-group v-model="item.e.position">
                                <van-cell v-for="opt in WB_POSITIONS" :key="opt.value" :title="opt.label" clickable @click="item.e.position = opt.value">
                                    <template #right-icon><van-radio :name="opt.value" :checked="item.e.position === opt.value" @click.stop /></template>
                                </van-cell>
                            </van-radio-group>
                        </van-cell-group>
                        <van-field v-model="item.e.content" type="textarea" rows="3" autosize placeholder="条目内容" />
                    </div>
                </div>
                <van-empty v-if="!entryList.length && !entrySearchQuery && entryFilterState === 'all'" description="无条目" image-size="60" />
                <van-empty v-else-if="!entryList.length" description="无匹配词条" image-size="60" />

                <!-- 词条批量操作栏 -->
                <div v-if="entryBatchMode" class="wb-batch-bar">
                    <span class="wb-batch-count">已选 {{ entryBatchSet.size }}</span>
                    <van-button size="small" plain @click="selectAllEntries">全选</van-button>
                    <van-button size="small" plain type="danger" :disabled="!entryBatchSet.size" @click="batchDeleteEntries">批量删除</van-button>
                    <van-button size="small" plain type="warning" :disabled="!entryBatchSet.size" @click="batchDisableEntries">批量停用</van-button>
                    <van-button size="small" @click="toggleEntryBatch">退出</van-button>
                </div>
            </template>

            <!-- 文件列表 -->
            <template v-else>
                <van-cell-group inset>
                    <van-cell title="世界书工具" icon="setting-o" is-link :arrow-direction="wbToolsOpen ? 'up' : 'down'" @click="wbToolsOpen = !wbToolsOpen" />
                    <template v-if="wbToolsOpen">
                        <van-cell title="多本智能合并" icon="warning-o" is-link @click="openWbMerge" />
                        <van-cell title="从网址导入世界书" icon="link-o" is-link @click="openWbUrlImport" />
                        <van-cell title="从本地文件导入" icon="down" is-link @click="importWbFiles" />
                        <van-cell title="导入 JSONL/Rentry 世界书" icon="description-o" is-link @click="importWbJsonl" />
                        <van-cell title="批量导出库内世界书" icon="share-o" is-link @click="batchExportWb" />
                        <van-cell title="世界书库统计" icon="chart-trending-o" is-link @click="showWbStats" />
                    </template>
                </van-cell-group>

                <van-cell-group inset title="独立世界书文件">
                    <van-cell
                        v-for="wb in library.worldbooks"
                        :key="wb.path"
                        :title="wb.name"
                        :label="`${Object.keys(wb.wb.entries || {}).length} 条条目 · ${wbCategoryOf(wb)}`"
                        @click="openFileWb(wb)"
                    >
                        <template #right-icon>
                            <van-icon name="ellipsis" size="20" @click.stop="openWbOps(wb)" />
                        </template>
                    </van-cell>
                    <van-empty v-if="!library.worldbooks.length" description="暂无独立世界书文件" image-size="60" />
                </van-cell-group>

                <van-cell-group inset title="外部世界书目录">
                    <van-cell
                        v-if="extWbDirTitle"
                        title="已选目录 · 点击更换"
                        :label="extWbDirTitle"
                        icon="location-o"
                        is-link
                        @click="pickExternalWbDir"
                    />
                    <van-cell v-else title="选择世界书目录" label="扫描任意文件夹中的世界书 JSON" icon="folder-o" is-link @click="pickExternalWbDir" />
                    <div v-if="extWbLoading" class="status-wrap"><van-loading>扫描世界书中…</van-loading></div>
                    <template v-else>
                        <van-cell
                            v-for="wb in extWorldbooks"
                            :key="wb.path"
                            :title="wb.name"
                            :label="`${Object.keys(wb.wb.entries || {}).length} 条条目 · 外部 · ${wbCategoryOf(wb)}`"
                            @click="openExternalWb(wb)"
                        >
                            <template #right-icon>
                                <van-icon name="ellipsis" size="20" @click.stop="openWbOps(wb)" />
                            </template>
                        </van-cell>
                        <van-empty
                            v-if="extWbDirTitle && !extWorldbooks.length"
                            description="该目录下没有可识别的世界书"
                            image-size="60"
                        />
                    </template>
                </van-cell-group>
            </template>
        </div>

        <!-- 世界书快照弹窗 -->
        <SnapshotModal
            :show="showSnapshots"
            :snapshots="snapshots"
            :card-name="editing ? editing.name : ''"
            :can-create="false"
            :can-clean="false"
            @close="showSnapshots = false"
            @restore="restoreWbSnapshot"
            @delete="deleteWbSnapshot"
        />

        <!-- 查重弹窗(独立世界书) -->
        <DedupeModal
            v-model:show="showDedupe"
            mode="worldbook"
            @cleaned="reload"
        />

        <!-- 全库词条搜索弹窗 -->
        <GlobalEntrySearchModal
            :show="showGlobalEntrySearch"
            :query="globalEntryQuery"
            :results="globalEntryResults"
            :index-count="globalEntryIndex.length"
            @close="showGlobalEntrySearch = false"
            @update:query="globalEntryQuery = $event"
            @jump="jumpToEntrySource"
        />

        <!-- 全局资产中心弹窗 -->
        <GlobalAssetModal
            :show="showGlobalAsset"
            :worldbooks="globalAllWorldbooks"
            :regex-scripts="globalAllRegexScripts"
            @close="showGlobalAsset = false"
        />

        <!-- 世界书操作菜单 -->
        <van-action-sheet
            v-model:show="showWbOps"
            :actions="wbOpsActions"
            :description="wbOpsDesc"
            cancel-text="取消"
            @select="onWbOpsSelect"
            @cancel="showWbOps = false"
        />

        <!-- 顶部「更多」操作菜单 -->
        <van-action-sheet
            v-model:show="showMore"
            :actions="moreActions"
            cancel-text="取消"
            description="更多操作"
            @select="onMoreSelect"
            @cancel="showMore = false"
        />

        <!-- 输入弹窗(重命名/新建/分组/URL导入) -->
        <van-dialog
            v-model:show="showWbInput"
            :title="wbInputTitle"
            show-cancel-button
            @confirm="onWbInputConfirm"
            @cancel="onWbInputCancel"
        >
            <van-field v-model="wbInputValue" :placeholder="wbInputPlaceholder" />
        </van-dialog>

        <!-- 条目级导入合并弹窗 -->
        <WbImportModal
            :show="showWbImport"
            :sources="wbImportSources"
            :selected-key="wbImportSelected"
            :entries="wbImportEntries"
            :checked="wbImportChecked"
            @close="showWbImport = false"
            @pick-source="wbImportSelected = $event"
            @toggle="toggleWbImportEntry"
            @import="doWbImport"
        />

        <!-- 多书智能合并弹窗 -->
        <van-popup v-model:show="showWbMerge" position="bottom" round style="max-height: 70%">
            <van-nav-bar title="多本世界书智能合并">
                <template #right><van-icon name="cross" @click="showWbMerge = false" /></template>
            </van-nav-bar>
            <div style="padding: 4px 0 8px">
                <div style="padding: 8px 16px; font-size: 12px; color: var(--van-gray-6, #969799)">
                    勾选需要合并的世界书（自动剔除触发词+正文完全一致的重复词条）
                </div>
                <van-checkbox-group v-model="wbMergeChecked">
                    <van-cell
                        v-for="wb in mergeCandidates"
                        :key="wb.key"
                        clickable
                        @click="toggleMergeCheck(wb.key)"
                    >
                        <template #title>{{ wb.label }}</template>
                        <template #label>{{ wb.count }} 个词条</template>
                        <template #right-icon>
                            <van-checkbox :name="wb.key" @click.stop />
                        </template>
                    </van-cell>
                </van-checkbox-group>
            </div>
            <div style="padding: 12px 16px calc(12px + env(safe-area-inset-bottom))">
                <van-button block type="warning" round :disabled="wbMergeChecked.length < 2" @click="executeWbMerge">
                    合并已选 {{ wbMergeChecked.length }} 本
                </van-button>
            </div>
        </van-popup>
    </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showSuccessToast, showToast, showConfirmDialog } from 'vant';
import { mobileLibrary, loadLibrary, LIBRARY_ROOT, getCardEmbeddedWb, serializeCardEmbeddedWb } from '../useMobileLibrary';
import DedupeModal from '../components/DedupeModal.vue';
import SnapshotModal from '../components/SnapshotModal.vue';
import GlobalEntrySearchModal from '../components/GlobalEntrySearchModal.vue';
import GlobalAssetModal from '../components/GlobalAssetModal.vue';
import WbImportModal from '../components/WbImportModal.vue';
import { extractBookEntries } from '../../utils/cardLoader.js';
import { api } from '../../bridge/api';

export default {
    name: 'WorldbookView',
    components: { DedupeModal, SnapshotModal, GlobalEntrySearchModal, GlobalAssetModal, WbImportModal },
    setup() {
        const router = useRouter();
        const editing = ref(null); // { path, name, entries, payload, wrapped, external?, treeUri?, rel? }
        const library = mobileLibrary;
        const showDedupe = ref(false);

        // ---------- 外部世界书目录(独立 SAF 树) ----------
        const LS_EXT_WB = 'jsmobile-ext-wb-dir'; // { uri, title } 持久化
        const extWbDirUri = ref('');
        const extWbDirTitle = ref('');
        const extWorldbooks = ref([]);
        const extWbLoading = ref(false);

        function loadExtWbDirMemory() {
            try {
                const s = JSON.parse(localStorage.getItem(LS_EXT_WB) || '{}');
                extWbDirUri.value = s.uri || '';
                extWbDirTitle.value = s.title || '';
            } catch (e) { /* 忽略 */ }
        }
        function saveExtWbDirMemory() {
            try {
                localStorage.setItem(LS_EXT_WB, JSON.stringify({ uri: extWbDirUri.value, title: extWbDirTitle.value }));
            } catch (e) { /* 忽略 */ }
        }

        async function pickExternalWbDir() {
            const res = await api.pickExternalWbDir();
            if (res && res.success && res.uri) {
                extWbDirUri.value = res.uri;
                extWbDirTitle.value = res.title || '';
                saveExtWbDirMemory();
                await scanExternalWbDir();
            } else if (res && res.error) {
                showToast(res.error);
            }
        }

        async function scanExternalWbDir() {
            if (!extWbDirUri.value) return;
            extWbLoading.value = true;
            try {
                const res = await api.scanExternalWorldbooks(extWbDirUri.value);
                if (res && res.error) {
                    showToast(res.error);
                    extWorldbooks.value = [];
                } else {
                    extWorldbooks.value = res.worldbooks || [];
                    if (res.title) {
                        extWbDirTitle.value = res.title;
                        saveExtWbDirMemory();
                    }
                }
            } catch (e) {
                showToast('扫描失败: ' + (e.message || e));
                extWorldbooks.value = [];
            } finally {
                extWbLoading.value = false;
            }
        }

        function openExternalWb(wb) {
            const entries = wb.wb.entries || {};
            Object.values(entries).forEach(normalizeEntry);
            editing.value = {
                path: wb.path,
                name: wb.name,
                entries,
                wrapped: wb.wrapped,
                external: true,
                treeUri: wb.treeUri,
                rel: wb.rel,
                file: wb,
                payload: wb.wb
            };
        }

        // ---------- 世界书分组(内存映射 + localStorage 持久化,对齐桌面 wbCategoryMap) ----------
        const LS_WB_CAT = 'jsmobile-wb-category-map';
        const wbCategoryMap = reactive(loadWbCatMap());
        function loadWbCatMap() {
            try { return JSON.parse(localStorage.getItem(LS_WB_CAT) || '{}'); } catch (e) { return {}; }
        }
        function saveWbCatMap() {
            try { localStorage.setItem(LS_WB_CAT, JSON.stringify(wbCategoryMap)); } catch (e) { /* 忽略 */ }
        }
        function wbCategoryOf(wb) {
            if (!wb) return '默认';
            const key = wb.path || wb.name || '';
            if (key && wbCategoryMap[key] && wbCategoryMap[key].trim()) return wbCategoryMap[key].trim();
            return '默认';
        }

        // ---------- 顶部「更多」菜单 ----------
        const showMore = ref(false);
        const moreActions = [
            { name: '全局词条搜索', value: 'search', icon: 'search' },
            { name: '资产中心', value: 'assets', icon: 'apps-o' },
            { name: '查重', value: 'dedupe', icon: 'cluster-o' }
        ];
        function onMoreSelect(action) {
            showMore.value = false;
            if (action.value === 'search') openGlobalEntrySearch();
            else if (action.value === 'assets') showGlobalAsset.value = true;
            else if (action.value === 'dedupe') onDedupe();
        }

        // ---------- 世界书增删改(库内 + 外部) ----------
        const showWbOps = ref(false);
        const wbOpsTarget = ref(null);
        const wbOpsDesc = ref('');
        const wbOpsActions = computed(() => [
            { name: '重命名', value: 'rename' },
            { name: '复制为副本', value: 'duplicate' },
            { name: '移动到分组', value: 'group' },
            { name: '删除', value: 'delete', color: '#ee0a24' }
        ]);

        function openWbOps(wb) {
            wbOpsTarget.value = wb;
            wbOpsDesc.value = wb.name || '世界书';
            showWbOps.value = true;
        }

        async function onWbOpsSelect(action) {
            const wb = wbOpsTarget.value;
            showWbOps.value = false;
            if (!wb) return;
            const v = action.value;
            if (v === 'rename') {
                const name = await promptWbInput('重命名世界书', wb.name.replace(/\.json$/i, ''), '新名称');
                if (!name) return;
                await renameWorldbook(wb, name);
            } else if (v === 'duplicate') {
                await duplicateWorldbook(wb);
            } else if (v === 'group') {
                const cat = await promptWbInput('移动到分组', wbCategoryOf(wb), '目标分组名(新名字自动建组)');
                if (!cat) return;
                const key = wb.path || wb.name || '';
                if (key) { wbCategoryMap[key] = cat; saveWbCatMap(); }
                showSuccessToast(`已移动到「${cat}」`);
            } else if (v === 'delete') {
                try {
                    await showConfirmDialog({ title: '删除世界书', message: `确定删除「${wb.name}」吗？\n库内世界书将移入回收站，外部世界书将物理删除。`, confirmButtonText: '删除', confirmButtonColor: '#ee0a24' });
                } catch (e) { return; }
                await deleteWorldbook(wb);
            }
        }

        // 输入弹窗(基于 van-dialog + van-field,Promise 式:confirm→resolve(值),cancel→resolve(null))
        const showWbInput = ref(false);
        const wbInputTitle = ref('');
        const wbInputPlaceholder = ref('');
        const wbInputValue = ref('');
        let wbInputResolver = null;
        function promptWbInput(title, value, placeholder) {
            wbInputTitle.value = title;
            wbInputValue.value = value || '';
            wbInputPlaceholder.value = placeholder || '';
            showWbInput.value = true;
            return new Promise((resolve) => { wbInputResolver = resolve; });
        }
        function onWbInputConfirm() {
            showWbInput.value = false;
            if (wbInputResolver) { wbInputResolver(wbInputValue.value.trim()); wbInputResolver = null; }
        }
        function onWbInputCancel() {
            showWbInput.value = false;
            if (wbInputResolver) { wbInputResolver(null); wbInputResolver = null; }
        }

        function defaultWbJson(name) {
            return { name: name || '未命名世界书', entries: {} };
        }

        function safeWbName(name) {
            return String(name || '未命名世界书').replace(/[\\/:*?"<>|]/g, '_') + '.json';
        }

        async function onNewWorldbook() {
            const name = await promptWbInput('新建世界书', '', '世界书名称');
            if (!name) return;
            if (extWbDirUri.value) {
                const rel = safeWbName(name);
                const res = await api.createExternalWorldbook({ treeUri: extWbDirUri.value, rel, wb: defaultWbJson(name) });
                res && res.success ? showSuccessToast('已创建') : showToast((res && res.error) || '创建失败');
                if (res && res.success) await scanExternalWbDir();
            } else {
                // 库内新建(写入库根)
                const rel = safeWbName(name);
                const res = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + rel, name, wb: defaultWbJson(name) });
                res && res.success ? showSuccessToast('已创建') : showToast((res && res.error) || '创建失败');
                if (res && res.success) await loadLibrary();
            }
        }

        async function renameWorldbook(wb, newBaseName) {
            if (wb.external) {
                const newName = safeWbName(newBaseName);
                const res = await api.renameExternalWbFile({ treeUri: wb.treeUri, rel: wb.rel, newName });
                res && res.success ? showSuccessToast('已重命名') : showToast((res && res.error) || '重命名失败');
                if (res && res.success) { await scanExternalWbDir(); }
            } else {
                // 库内:renameWorldbookFile + 同步内部 name
                const dir = (wb.path && wb.path.includes('/')) ? wb.path.slice(0, wb.path.lastIndexOf('/')) : LIBRARY_ROOT;
                const newPath = dir + '/' + safeWbName(newBaseName);
                const res = await api.renameWorldbookFile({ path: wb.path, newPath });
                res && res.success ? showSuccessToast('已重命名') : showToast((res && res.error) || '重命名失败');
                if (res && res.success) await loadLibrary();
            }
        }

        async function duplicateWorldbook(wb) {
            const clone = JSON.parse(JSON.stringify(wb.wb || {}));
            // 重新生成 uid(第三方词条可能无 uid;uid 为前端临时字段,保存时剔除)
            Object.values(clone.entries || {}).forEach((e) => { if (e && typeof e === 'object') e.uid = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6); });
            const base = (wb.name || '').replace(/\.json$/i, '') + '_副本';
            if (wb.external) {
                const rel = safeWbName(base);
                const res = await api.createExternalWorldbook({ treeUri: wb.treeUri, rel, wb: clone });
                res && res.success ? showSuccessToast('已复制') : showToast((res && res.error) || '复制失败');
                if (res && res.success) await scanExternalWbDir();
            } else {
                const rel = safeWbName(base);
                const res = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + rel, name: base, wb: clone });
                res && res.success ? showSuccessToast('已复制') : showToast((res && res.error) || '复制失败');
                if (res && res.success) await loadLibrary();
            }
        }

        async function deleteWorldbook(wb) {
            if (wb.external) {
                const res = await api.deleteExternalWbFile({ treeUri: wb.treeUri, rel: wb.rel });
                res && res.success ? showSuccessToast('已删除') : showToast((res && res.error) || '删除失败');
                if (res && res.success) {
                    const key = wb.path || wb.name || '';
                    if (key && wbCategoryMap[key] !== undefined) { delete wbCategoryMap[key]; saveWbCatMap(); }
                    await scanExternalWbDir();
                }
            } else {
                const res = await api.trashFiles([wb.path]);
                res && res.success ? showSuccessToast('已移入回收站') : showToast((res && res.error) || '删除失败');
                if (res && res.success) {
                    const key = wb.path || wb.name || '';
                    if (key && wbCategoryMap[key] !== undefined) { delete wbCategoryMap[key]; saveWbCatMap(); }
                    await loadLibrary();
                }
            }
        }

        // ---------- 世界书导入(URL / 本地文件 / 条目级合并 / 批量导出) ----------
        function isRoleCardJson(json) {
            return json && typeof json === 'object' &&
                (json.spec === 'chara_card_v2' || json.spec === 'chara_card_v3' ||
                 json.char_name || (json.data && (json.data.description !== undefined || json.data.first_mes !== undefined)));
        }
        function hasEntries(json) {
            return json && typeof json === 'object' &&
                (Array.isArray(json.entries) || (json.entries && typeof json.entries === 'object')) ||
                (json && json.extensions && json.extensions.world_book &&
                 (Array.isArray(json.extensions.world_book.entries) ||
                  (json.extensions.world_book.entries && typeof json.extensions.world_book.entries === 'object')));
        }
        function normalizeWbEntries(json) {
            // 归一化词条:兼容 V1/V2 数组与对象字典格式
            let wb = (json && json.extensions && json.extensions.world_book) || json;
            if (!wb) return {};
            let entries = wb.entries;
            if (Array.isArray(entries)) {
                const d = {};
                entries.forEach((e, i) => { if (e && typeof e === 'object') d['imp_' + i] = e; });
                return d;
            }
            if (entries && typeof entries === 'object') return entries;
            return {};
        }

        async function openWbUrlImport() {
            const url = await promptWbInput('从网址导入世界书', '', 'https://... 世界书 JSON 直链');
            if (!url) return;
            if (!/^https?:\/\//i.test(url)) { showToast('仅支持 http/https 直链'); return; }
            showToast('拉取中…');
            const res = await api.fetchWbUrl(url);
            if (!res || !res.success) { showToast((res && res.error) || '拉取失败'); return; }
            let json;
            try { json = JSON.parse(res.data.replace(/^\uFEFF/, '')); } catch (e) { showToast('返回内容不是合法 JSON'); return; }
            if (isRoleCardJson(json)) { showToast('拒绝导入:这是角色卡 JSON'); return; }
            if (!hasEntries(json)) { showToast('拒绝导入:不含世界书 entries'); return; }
            const entries = normalizeWbEntries(json);
            const baseName = (json.name || '导入世界书').replace(/[\\/:*?"<>|]/g, '_');
            const name = baseName + '.json';
            if (extWbDirUri.value) {
                const wb = { name: json.name || baseName, entries };
                const rel = name;
                const wr = await api.createExternalWorldbook({ treeUri: extWbDirUri.value, rel, wb });
                wr && wr.success ? showSuccessToast('已导入到外部目录') : showToast((wr && wr.error) || '导入失败');
                if (wr && wr.success) await scanExternalWbDir();
            } else {
                const wb = { name: json.name || baseName, entries };
                const wr = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + name, name: baseName, wb });
                wr && wr.success ? showSuccessToast('已导入') : showToast((wr && wr.error) || '导入失败');
                if (wr && wr.success) await loadLibrary();
            }
        }

        async function importWbFiles() {
            // 系统文件选择器导入 JSON(复用 importExternalCards,原生 MIME 含 application/json)
            const res = await api.importExternalCards([], LIBRARY_ROOT);
            if (res && res.success) {
                const m = [`导入 ${(res.copied || []).length} 个文件`];
                if (res.skipped && res.skipped.length) m.push(`跳过 ${res.skipped.length}`);
                if (res.failed && res.failed.length) m.push(`失败 ${res.failed.length}`);
                showSuccessToast(m.join(' · '));
                await loadLibrary();
            } else {
                showToast((res && res.error) || '导入失败');
            }
        }

        async function batchExportWb() {
            const paths = library.worldbooks.map((w) => w.path);
            if (!paths.length) { showToast('库内没有世界书可导出'); return; }
            const res = await api.exportWorldbooksBatch(paths);
            if (res && res.success) {
                showSuccessToast(`已导出 ${res.count || paths.length} 本世界书`);
            } else {
                showToast((res && res.error) || '导出失败');
            }
        }

        // ---------- 多本世界书智能合并(对齐桌面 Worldbook Merger:指纹去重 Key+Content) ----------
        const showWbMerge = ref(false);
        const wbMergeChecked = ref([]);

        const mergeCandidates = computed(() => {
            const list = [];
            library.worldbooks.forEach((w) => {
                list.push({ key: 'lib:' + w.path, label: (w.wb && w.wb.name) || w.name.replace(/\.json$/i, ''), count: extractBookEntries(w.wb || {}).length, wb: w.wb });
            });
            extWorldbooks.value.forEach((w) => {
                list.push({ key: 'ext:' + w.path, label: w.name.replace(/\.json$/i, '') + ' (外部)', count: extractBookEntries(w.wb || {}).length, wb: w.wb });
            });
            return list;
        });

        function toggleMergeCheck(key) {
            const i = wbMergeChecked.value.indexOf(key);
            if (i >= 0) wbMergeChecked.value.splice(i, 1);
            else wbMergeChecked.value.push(key);
        }

        function openWbMerge() {
            if (mergeCandidates.value.length < 2) { showToast('可合并的世界书少于 2 本'); return; }
            wbMergeChecked.value = [];
            showWbMerge.value = true;
        }

        async function executeWbMerge() {
            if (wbMergeChecked.value.length < 2) { showToast('请至少勾选 2 本世界书'); return; }
            const targets = mergeCandidates.value.filter((c) => wbMergeChecked.value.includes(c.key));
            const seen = new Set();
            const mergedEntries = {};
            let n = 0;
            targets.forEach((t) => {
                extractBookEntries(t.wb || {}).forEach((e) => {
                    if (!e || typeof e !== 'object') return;
                    const keysStr = String(Array.isArray(e.keys) ? e.keys.map(String).join(',') : (e.keys || (Array.isArray(e.key) ? e.key.map(String).join(',') : (e.key || '')))).trim().toLowerCase();
                    const contentStr = String(e.content || '').trim().toLowerCase();
                    const sig = keysStr + ':::' + contentStr;
                    if (seen.has(sig)) return;
                    seen.add(sig);
                    const clean = JSON.parse(JSON.stringify(e, (k, v) => (k.startsWith('_') ? undefined : v)));
                    clean.uid = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
                    mergedEntries['m_' + (n++)] = clean;
                });
            });
            const mergeName = '合并世界书_' + targets.length + '本';
            const wb = { name: mergeName, entries: mergedEntries };
            if (extWbDirUri.value) {
                const res = await api.createExternalWorldbook({ treeUri: extWbDirUri.value, rel: safeWbName(mergeName), wb });
                if (res && res.success) { showSuccessToast(`已合并 ${targets.length} 本 · ${n} 个去重词条`); await scanExternalWbDir(); }
                else showToast((res && res.error) || '合并失败');
            } else {
                const res = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + safeWbName(mergeName), name: mergeName, wb });
                if (res && res.success) { showSuccessToast(`已合并 ${targets.length} 本 · ${n} 个去重词条`); await loadLibrary(); }
                else showToast((res && res.error) || '合并失败');
            }
            showWbMerge.value = false;
        }

        // ---------- 从角色卡提取世界书(卡内 keys/secondary_keys → 库 key/keysecondary 字段转换) ----------
        async function extractFromCard(card) {
            const d = (card.data && card.data.data) || card.data || {};
            const book = d.character_book || (card.data && card.data.character_book) || {};
            const entries = extractBookEntries(book);
            if (!entries.length) { showToast('该角色卡没有内嵌世界书词条'); return; }
            const baseName = d.name || card.name || '未命名角色';
            const wbName = baseName + ' - 世界书';
            const cleanEntries = {};
            entries.forEach((e, i) => {
                if (!e || typeof e !== 'object') return;
                const c = JSON.parse(JSON.stringify(e));
                c.key = Array.isArray(e.keys) ? [...e.keys] : (e.keys || []);
                c.keysecondary = Array.isArray(e.secondary_keys) ? [...e.secondary_keys] : (e.secondary_keys || []);
                delete c.keys; delete c.secondary_keys; delete c._collapsed; delete c._keysText; delete c._secKeysText;
                c.comment = String(c.comment || c.name || '');
                c.order = c.order ?? c.insertion_order ?? 100;
                c.uid = Date.now().toString(36) + '_' + i;
                cleanEntries['ex_' + i] = c;
            });
            const wb = { name: wbName, entries: cleanEntries };
            if (extWbDirUri.value) {
                const res = await api.createExternalWorldbook({ treeUri: extWbDirUri.value, rel: safeWbName(wbName), wb });
                if (res && res.success) { showSuccessToast(`已提取《${wbName}》(${entries.length} 词条)`); await scanExternalWbDir(); }
                else showToast((res && res.error) || '提取失败');
            } else {
                const res = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + safeWbName(wbName), name: wbName, wb });
                if (res && res.success) { showSuccessToast(`已提取《${wbName}》(${entries.length} 词条)`); await loadLibrary(); }
                else showToast((res && res.error) || '提取失败');
            }
        }

        // ---------- JSONL / Rentry 世界书导入(整体 JSON 或逐行解析) ----------
        function parseEntriesFlexible(text) {
            const trim = String(text || '').replace(/^\uFEFF/, '').trim();
            let name = '';
            let entries = [];
            try {
                const obj = JSON.parse(trim);
                if (Array.isArray(obj)) entries = obj;
                else if (obj && typeof obj === 'object') {
                    name = obj.name || '';
                    entries = obj.entries || (obj.data && Array.isArray(obj.data.entries) ? obj.data.entries : []);
                }
            } catch (e) {
                const lines = trim.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                entries = lines.map((l) => { try { return JSON.parse(l); } catch (e2) { return null; } }).filter(Boolean);
            }
            const normalized = (Array.isArray(entries) ? entries : Object.values(entries || {}))
                .filter((e) => e && typeof e === 'object').map((e) => ({
                    uid: Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6),
                    key: Array.isArray(e.key) ? e.key : (Array.isArray(e.keys) ? e.keys : (e.key ? [e.key] : (e.keys ? [e.keys] : []))),
                    keysecondary: Array.isArray(e.keysecondary) ? e.keysecondary : (Array.isArray(e.secondary_keys) ? e.secondary_keys : (e.keysecondary ? [e.keysecondary] : [])),
                    content: e.content || '',
                    comment: e.comment || e.name || '',
                    constant: !!e.constant,
                    selective: !!e.selective,
                    insertion_order: e.insertion_order ?? 50,
                    order: e.order ?? e.insertion_order ?? 100,
                    position: e.position ?? 1,
                    enabled: e.enabled !== false
                }));
            return { name, entries: normalized };
        }

        async function importWbJsonl() {
            const res = await api.importExternalCards([], LIBRARY_ROOT);
            if (!res || !res.success) { showToast((res && res.error) || '选择文件失败'); return; }
            if (!res.copied || !res.copied.length) { showToast('未选择文件'); return; }
            // 逐个读取已复制的 .jsonl/.txt 文件并解析为世界书
            let okCount = 0;
            for (const p of res.copied) {
                if (!/\.(jsonl|txt)$/i.test(p)) continue;
                try {
                    const r = await window.electronAPI.readText(p);
                    if (!r || !r.success || typeof r.text !== 'string') continue;
                    const parsed = parseEntriesFlexible(r.text);
                    if (!parsed.entries.length) continue;
                    const bookName = (parsed.name || p.split(/[\\/]/).pop().replace(/\.(jsonl|txt)$/i, '')).trim();
                    const wb = { name: bookName, entries: {} };
                    parsed.entries.forEach((e, i) => { wb.entries['jl_' + i] = e; });
                    const wr = await api.createWorldbook({ path: LIBRARY_ROOT + '/' + safeWbName(bookName), name: bookName, wb });
                    if (wr && wr.success) okCount++;
                } catch (e) { /* 单文件失败不中断 */ }
            }
            if (okCount) {
                showSuccessToast(`已从 JSONL 导入 ${okCount} 本世界书`);
                await loadLibrary();
            } else {
                showToast('未解析到可导入的 JSONL 世界书');
            }
        }

        // ---------- 世界书库统计 ----------
        function showWbStats() {
            const wbList = [
                ...library.worldbooks.map((w) => ({ name: (w.wb && w.wb.name) || w.name, entries: extractBookEntries(w.wb || {}) })),
                ...extWorldbooks.value.map((w) => ({ name: w.name, entries: extractBookEntries(w.wb || {}) }))
            ];
            if (!wbList.length) { showToast('世界书库为空'); return; }
            const totalBooks = wbList.length;
            const totalEntries = wbList.reduce((s, w) => s + w.entries.length, 0);
            const totalChars = wbList.reduce((s, w) => s + w.entries.reduce((t, e) => t + String(e.content || '').length, 0), 0);
            const totalConst = wbList.reduce((s, w) => s + w.entries.filter((e) => e && e.constant).length, 0);
            const emptyCount = wbList.reduce((s, w) => s + w.entries.filter((e) => !e || (!String(e.content || '').trim() && !(Array.isArray(e.keys) ? e.keys.length : (e.keys ? 1 : 0)))), 0);
            const top = [...wbList].sort((a, b) => b.entries.length - a.entries.length).slice(0, 3).map((w) => `${w.name}(${w.entries.length})`).join('、');
            showConfirmDialog({
                title: '世界书库统计',
                message: `共 ${totalBooks} 本世界书 / ${totalEntries} 个词条\n正文总字符：${totalChars}\n常驻词条：${totalConst} · 空词条：${emptyCount}\n词条最多：${top}`,
                showCancelButton: false,
                confirmButtonText: '知道了'
            });
        }

        // ---------- 条目级导入合并 ----------
        const showWbImport = ref(false);
        const wbImportSelected = ref('');
        const wbImportChecked = ref([]);
        const wbImportSources = computed(() => {
            const list = [];
            library.worldbooks.forEach((w) => {
                list.push({ key: 'lib:' + w.path, label: (w.wb && w.wb.name) || w.name.replace(/\.json$/i, ''), count: Object.keys(w.wb.entries || {}).length });
            });
            extWorldbooks.value.forEach((w) => {
                list.push({ key: 'ext:' + w.path, label: (w.wb && w.wb.name) || w.name.replace(/\.json$/i, ''), count: Object.keys(w.wb.entries || {}).length });
            });
            return list;
        });
        const wbImportEntries = computed(() => {
            const key = wbImportSelected.value;
            if (!key) return [];
            let wb = null;
            if (key.startsWith('lib:')) {
                wb = library.worldbooks.find((w) => ('lib:' + w.path) === key);
            } else {
                wb = extWorldbooks.value.find((w) => ('ext:' + w.path) === key);
            }
            if (!wb) return [];
            const raw = wb.wb.entries || {};
            if (Array.isArray(raw)) return raw.filter((e) => e && typeof e === 'object');
            return Object.values(raw).filter((e) => e && typeof e === 'object');
        });

        function openWbImport() {
            if (!editing.value) return;
            wbImportSelected.value = '';
            wbImportChecked.value = [];
            showWbImport.value = true;
        }
        function toggleWbImportEntry(i) {
            const idx = wbImportChecked.value.indexOf(i);
            if (idx >= 0) wbImportChecked.value.splice(idx, 1);
            else wbImportChecked.value.push(i);
        }
        async function doWbImport() {
            const ed = editing.value;
            if (!ed) return;
            const picked = wbImportChecked.value.map((i) => wbImportEntries.value[i]).filter(Boolean);
            if (!picked.length) { showToast('未选择词条'); return; }
            picked.forEach((e) => {
                const clone = JSON.parse(JSON.stringify(e));
                delete clone._keysText;
                delete clone._secKeysText;
                clone.uid = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
                const key = 'imp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
                ed.entries[key] = clone;
                normalizeEntry(clone);
            });
            showWbImport.value = false;
            showSuccessToast(`已导入 ${picked.length} 条词条`);
        }

        /** 查重入口(独立世界书) */
        function onDedupe() {
            if (!library.worldbooks.length) {
                showToast('世界书库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }

        const cardWithWb = computed(() =>
            library.library.filter((c) => {
                // 对齐桌面:内嵌世界书在 data.character_book(V2/V3),兼容 V1 顶层;extractBookEntries 全形态安全提取
                const data = c.data || {};
                const book = (data.data && data.data.character_book) || data.character_book;
                return extractBookEntries(book).length > 0;
            })
        );

        function entryName(e) {
            if (!e || typeof e !== 'object') return '';
            return e.comment || e.name || (Array.isArray(e.keys) && e.keys[0] ? e.keys[0] : String(e.keys || '')) || '';
        }
        function entryDisplayName(e) { return entryName(e) || '未命名条目'; }

        function entryCount(card) {
            const data = card.data || {};
            const book = (data.data && data.data.character_book) || data.character_book;
            return extractBookEntries(book).length;
        }

        function reload() { loadLibrary(); }

        async function openCardWb(card) {
            const { entries } = getCardEmbeddedWb(card);
            Object.values(entries).forEach(normalizeEntry);
            editing.value = {
                path: card.path,
                name: card.name + '（卡内）',
                entries,
                wrapped: false,
                card
            };
        }

        async function openFileWb(wb) {
            const entries = wb.wb.entries || (typeof wb.wb.entries === 'object' ? wb.wb.entries : {});
            Object.values(entries).forEach(normalizeEntry);
            editing.value = {
                path: wb.path,
                name: wb.name,
                entries,
                wrapped: wb.wrapped,
                file: wb,
                payload: wb.wb
            };
        }

        function closeEditor() { editing.value = null; }

        // 条目完整字段(临时文本字段 _keysText/_secKeysText 供 v-model,保存时剥离)
        const WB_POSITIONS = [
            { value: 0, label: '顶部（定义前）' },
            { value: 1, label: '底部（定义后）' },
            { value: 2, label: '聊天记录前' },
            { value: 3, label: '@D 深度提示内' }
        ];
        const wbExpanded = reactive({});
        function toggleWbExpand(key) { wbExpanded[key] = !wbExpanded[key]; }
        function syncWbKeys(e) {
            e.keys = String(e._keysText || '').split(',').map((s) => s.trim()).filter(Boolean);
        }
        function syncWbSecKeys(e) {
            const keys = String(e._secKeysText || '').split(',').map((s) => s.trim()).filter(Boolean);
            e.keysecondary = keys;
            if (e.secondary_keys) delete e.secondary_keys;
        }
        function normalizeEntry(e) {
            if (!e || typeof e !== 'object') return;
            if (!('_keysText' in e)) e._keysText = Array.isArray(e.keys) ? e.keys.join(', ') : String(e.keys || '');
            if (!('_secKeysText' in e)) {
                const sec = Array.isArray(e.keysecondary) ? e.keysecondary : (Array.isArray(e.secondary_keys) ? e.secondary_keys : []);
                e._secKeysText = sec.join(', ');
            }
            if (e.position === undefined) e.position = 1;
            if (e.insertion_order === undefined) e.insertion_order = 50;
            if (e.order === undefined) e.order = 100;
        }

        function addEntry() {
            if (!editing.value) return;
            const key = 'wb_' + Date.now().toString(36);
            editing.value.entries[key] = {
                comment: '', content: '', enabled: true, keys: [], keysecondary: [],
                selective: false, constant: false, position: 1, insertion_order: 50, order: 100,
                _keysText: '', _secKeysText: ''
            };
            wbExpanded[key] = true;
        }

        function removeEntry(key) {
            if (!editing.value) return;
            delete editing.value.entries[key];
        }

        // ---------- 词条深度编辑：搜索/筛选/排序/上移下移/复制/体检/批量 ----------
        const ENTRY_FILTER_OPTIONS = [
            { text: '全部状态', value: 'all' },
            { text: '启用', value: 'enabled' },
            { text: '停用', value: 'disabled' },
            { text: '常驻', value: 'constant' },
            { text: '条件触发', value: 'selective' }
        ];
        const ENTRY_SORT_OPTIONS = [
            { text: '默认顺序', value: 'default' },
            { text: '权重升序', value: 'orderAsc' },
            { text: '权重降序', value: 'orderDesc' },
            { text: '按名称', value: 'name' },
            { text: '按内容长度', value: 'contentLen' }
        ];
        const entrySearchQuery = ref('');
        const wbToolsOpen = ref(false);
        const entryFilterState = ref('all');
        const entrySortBy = ref('default');

        // 有序词条列表（仅展示层，不改底层字典顺序；moveEntry 才是真实调序）
        const entryList = computed(() => {
            if (!editing.value) return [];
            const entries = editing.value.entries || {};
            let list = Object.entries(entries).map(([key, e]) => ({ key, e }));
            list = list.filter(({ e }) => e && typeof e === 'object');

            const q = entrySearchQuery.value.trim().toLowerCase();
            if (q) {
                list = list.filter(({ e }) => {
                    const keys = Array.isArray(e.keys) ? e.keys.join(' ') : String(e.keys || '');
                    const sec = Array.isArray(e.keysecondary) ? e.keysecondary.join(' ') : '';
                    return (keys + ' ' + sec + ' ' + (e.content || '') + ' ' + (e.comment || '')).toLowerCase().includes(q);
                });
            }

            const st = entryFilterState.value;
            if (st === 'enabled') list = list.filter(({ e }) => e.enabled !== false);
            else if (st === 'disabled') list = list.filter(({ e }) => e.enabled === false);
            else if (st === 'constant') list = list.filter(({ e }) => !!e.constant);
            else if (st === 'selective') list = list.filter(({ e }) => !!e.selective);

            const sort = entrySortBy.value;
            if (sort === 'orderAsc') list = [...list].sort((a, b) => (a.e.order ?? 100) - (b.e.order ?? 100));
            else if (sort === 'orderDesc') list = [...list].sort((a, b) => (b.e.order ?? 100) - (a.e.order ?? 100));
            else if (sort === 'name') list = [...list].sort((a, b) => String(entryName(a.e) || '').localeCompare(String(entryName(b.e) || ''), 'zh'));
            else if (sort === 'contentLen') list = [...list].sort((a, b) => (b.e.content?.length || 0) - (a.e.content?.length || 0));

            return list;
        });

        // 上移 / 下移：真实调序（对象字典重建，保持插入顺序）
        function moveEntryByKey(key, dir) {
            if (!editing.value) return;
            const entries = editing.value.entries || {};
            const keys = Object.keys(entries);
            const from = keys.indexOf(key);
            if (from === -1) return;
            const to = from + dir;
            if (to < 0 || to >= keys.length) return;
            keys.splice(to, 0, keys.splice(from, 1)[0]);
            const rebuilt = {};
            keys.forEach((k) => { rebuilt[k] = entries[k]; });
            editing.value.entries = rebuilt;
        }

        function duplicateEntry(key) {
            if (!editing.value) return;
            const entries = editing.value.entries || {};
            const src = entries[key];
            if (!src) return;
            const clone = JSON.parse(JSON.stringify(src));
            delete clone._keysText;
            delete clone._secKeysText;
            clone.comment = (clone.comment || '词条') + ' (副本)';
            const newKey = 'wb_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            entries[newKey] = clone;
            normalizeEntry(clone);
            wbExpanded[newKey] = true;
        }

        function expandAllEntries() {
            if (!editing.value) return;
            Object.keys(editing.value.entries || {}).forEach((k) => { wbExpanded[k] = true; });
        }
        function collapseAllEntries() {
            if (!editing.value) return;
            Object.keys(editing.value.entries || {}).forEach((k) => { wbExpanded[k] = false; });
        }

        // 体检：空词条 / 孤儿触发词 / 同书内重复
        const entryHealthReport = computed(() => {
            const entries = Object.values((editing.value && editing.value.entries) || {}).filter((e) => e && typeof e === 'object');
            const empty = [];
            const orphan = [];
            const sigMap = new Map();
            const dupGroups = [];
            entries.forEach((e) => {
                const keyLen = Array.isArray(e.keys) ? e.keys.length : (e.keys ? 1 : 0);
                const content = String(e.content || '').trim();
                if (!content && keyLen === 0) { empty.push(e); return; }
                if (content && keyLen === 0) { orphan.push(e); return; }
                const keys = Array.isArray(e.keys) ? e.keys.map(String).sort().join(',') : String(e.keys || '').trim();
                const sig = `${keys}::${content}`;
                if (!sig) return;
                if (sigMap.has(sig)) {
                    const first = sigMap.get(sig);
                    let group = dupGroups.find((g) => g.includes(first));
                    if (!group) { group = [first]; dupGroups.push(group); }
                    group.push(e);
                } else {
                    sigMap.set(sig, e);
                }
            });
            const duplicateCount = dupGroups.reduce((s, g) => s + g.length, 0);
            return { emptyCount: empty.length, orphanCount: orphan.length, duplicateCount, groupCount: dupGroups.length };
        });
        function runEntryHealthCheck() {
            const r = entryHealthReport.value;
            showConfirmDialog({
                title: '世界书体检报告',
                message: `空词条（无正文且无触发词）：${r.emptyCount} 条\n孤儿触发词（有正文无触发词）：${r.orphanCount} 条\n重复词条（触发词+正文一致）：${r.groupCount} 组 / ${r.duplicateCount} 条`,
                showCancelButton: false,
                confirmButtonText: '知道了'
            });
        }

        // 批量操作
        const entryBatchMode = ref(false);
        const entryBatchSet = ref(new Set());
        function toggleEntryBatch() {
            entryBatchMode.value = !entryBatchMode.value;
            if (!entryBatchMode.value) entryBatchSet.value = new Set();
        }
        function toggleEntryBatchSelect(key) {
            const s = new Set(entryBatchSet.value);
            s.has(key) ? s.delete(key) : s.add(key);
            entryBatchSet.value = s;
        }
        function selectAllEntries() {
            entryBatchSet.value = new Set(entryList.value.map((it) => it.key));
        }
        async function batchDeleteEntries() {
            if (!editing.value) return;
            const n = entryBatchSet.value.size;
            if (!n) return;
            try {
                await showConfirmDialog({
                    title: '批量删除词条',
                    message: `确定删除选中的 ${n} 个词条吗？操作不可逆！`,
                    confirmButtonText: '删除',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const entries = editing.value.entries || {};
            entryBatchSet.value.forEach((k) => { delete entries[k]; });
            entryBatchMode.value = false;
            entryBatchSet.value = new Set();
            showSuccessToast(`已删除 ${n} 个词条`);
        }
        function batchDisableEntries() {
            if (!editing.value) return;
            const entries = editing.value.entries || {};
            let n = 0;
            entryBatchSet.value.forEach((k) => { if (entries[k]) { entries[k].enabled = false; n++; } });
            entryBatchMode.value = false;
            entryBatchSet.value = new Set();
            showSuccessToast(`已停用 ${n} 个词条`);
        }

        /** 保存前剥离移动端临时编辑字段 */
        function stripTempFields(entries) {
            Object.values(entries || {}).forEach((e) => {
                if (e && typeof e === 'object') {
                    delete e._keysText;
                    delete e._secKeysText;
                }
            });
        }

        async function saveAll() {
            const ed = editing.value;
            if (!ed) return;
            stripTempFields(ed.entries);
            let payload;
            if (ed.card) {
                // 卡内世界书:保存整卡(entries 字典→数组对齐桌面 character_book.entries 标准)
                serializeCardEmbeddedWb(ed.card);
                const res = await window.electronAPI.saveCard(ed.path, JSON.parse(JSON.stringify(ed.card.data)));
                res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
            } else if (ed.external) {
                // 外部世界书目录:写回原 SAF 树
                const res = await api.saveExternalWorldbook({ treeUri: ed.treeUri, rel: ed.rel, wb: ed.payload, wrapped: ed.wrapped });
                res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
            } else {
                // 独立世界书文件:按原结构回写
                const body = ed.wrapped ? { extensions: { world_book: ed.payload } } : ed.payload;
                const res = await window.electronAPI.saveCard(ed.path, JSON.stringify(body, null, 2));
                res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
            }
        }

        onMounted(() => {
            if (!library.ready) loadLibrary();
        });

        // ---------- 世界书快照(独立世界书文件) ----------
        const showSnapshots = ref(false);
        const snapshots = ref([]);

        async function openWbSnapshots() {
            const ed = editing.value;
            if (!ed || !ed.file) return;
            showSnapshots.value = true;
            try {
                snapshots.value = (await api.listWorldbookSnapshots(ed.path)) || [];
            } catch (e) {
                snapshots.value = [];
            }
        }

        async function restoreWbSnapshot(snap) {
            const ed = editing.value;
            if (!ed || !ed.file) return;
            try {
                await showConfirmDialog({
                    title: '恢复世界书快照',
                    message: `将当前世界书恢复为该快照内容。\n${snap.fileName || ''}`,
                    confirmButtonText: '恢复',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.restoreWorldbookSnapshot({ filePath: ed.path, snapshotPath: snap.path });
            if (res && res.success) {
                showSuccessToast('已恢复');
                await loadLibrary();
                const path = ed.path;
                const newWb = library.worldbooks.find((w) => w.path === path);
                if (newWb) {
                    openFileWb(newWb);
                } else {
                    closeEditor();
                }
                showSnapshots.value = false;
            } else {
                showToast((res && res.error) || '恢复失败');
            }
        }

        async function deleteWbSnapshot(snap) {
            try {
                await showConfirmDialog({
                    title: '删除快照',
                    message: `删除后不可恢复：\n${snap.fileName || ''}`,
                    confirmButtonText: '删除',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.deleteWorldbookSnapshot(snap.path);
            if (res && res.success) {
                showSuccessToast('已删除');
                const ed = editing.value;
                if (ed && ed.file) {
                    try {
                        snapshots.value = (await api.listWorldbookSnapshots(ed.path)) || [];
                    } catch (e) {
                        snapshots.value = [];
                    }
                } else {
                    snapshots.value = [];
                }
            } else {
                showToast((res && res.error) || '删除失败');
            }
        }

        // ---------- 全库词条搜索 ----------
        const showGlobalEntrySearch = ref(false);
        const globalEntryQuery = ref('');

        function toArray(v) {
            if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
            if (v === undefined || v === null) return [];
            return String(v).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        }
        function normalizeEntry(entry, sourceType, sourceName, sourcePath) {
            if (!entry || typeof entry !== 'object') return null;
            const isWb = sourceType === 'worldbook';
            const keys = toArray(isWb ? entry.key : entry.keys);
            const secondary = toArray(isWb ? entry.keysecondary : entry.secondary_keys);
            return {
                keys, secondary,
                content: String(entry.content || ''),
                comment: entry.comment || entry.name || '',
                enabled: entry.enabled !== false,
                sourceType, sourceName, sourcePath
            };
        }

        const globalEntryIndex = computed(() => {
            const list = [];
            (library.worldbooks || []).forEach((wb) => {
                const name = (wb.wb && wb.wb.name) || (wb.name || '').replace(/\.json$/i, '') || '未命名世界书';
                const entries = extractBookEntries(wb.wb || {});
                entries.forEach((e) => {
                    const n = normalizeEntry(e, 'worldbook', name, wb.path || '');
                    if (n) list.push(n);
                });
            });
            (extWorldbooks.value || []).forEach((wb) => {
                const name = (wb.wb && wb.wb.name) || (wb.name || '').replace(/\.json$/i, '') || '未命名世界书';
                const entries = extractBookEntries(wb.wb || {});
                entries.forEach((e) => {
                    const n = normalizeEntry(e, 'worldbook', name, wb.path || '');
                    if (n) list.push(n);
                });
            });
            (library.library || []).forEach((item) => {
                const d = (item.data && item.data.data) || item.data || {};
                const book = d.character_book || (item.data && item.data.character_book) || {};
                const entries = extractBookEntries(book);
                const name = d.name || item.name || '未知角色';
                entries.forEach((e) => {
                    const n = normalizeEntry(e, 'card', name, item.path || '');
                    if (n) list.push(n);
                });
            });
            return list;
        });

        const globalEntryResults = computed(() => {
            const q = globalEntryQuery.value.trim().toLowerCase();
            if (!q) return [];
            return globalEntryIndex.value.filter((en) => {
                const hay = [en.keys.join(' '), en.secondary.join(' '), en.content, en.comment, en.sourceName].join(' ').toLowerCase();
                return hay.includes(q);
            });
        });

        function openGlobalEntrySearch() {
            globalEntryQuery.value = '';
            showGlobalEntrySearch.value = true;
        }

        // 点击结果跳转到来源(世界书打开编辑器 / 角色卡打开详情)
        function jumpToEntrySource(result) {
            if (!result) return;
            if (result.sourceType === 'worldbook') {
                const wb = library.worldbooks.find((w) =>
                    (result.sourcePath && w.path === result.sourcePath) ||
                    (!result.sourcePath && ((w.wb && w.wb.name) || w.name) === result.sourceName)
                );
                if (wb) {
                    openFileWb(wb);
                } else {
                    const ext = extWorldbooks.value.find((w) => w.path === result.sourcePath);
                    if (ext) openExternalWb(ext);
                }
            } else {
                const item = library.library.find((i) =>
                    (result.sourcePath && i.path === result.sourcePath) ||
                    (!result.sourcePath && (((i.data && i.data.data) || i.data || {}).name || i.name) === result.sourceName)
                );
                if (item) router.push({ path: '/card', query: { id: item.path } });
            }
            showGlobalEntrySearch.value = false;
        }

        // ---------- 全局资产中心 ----------
        const showGlobalAsset = ref(false);
        const globalAllWorldbooks = computed(() => {
            const list = [];
            (library.library || []).forEach((item) => {
                const d = (item.data && item.data.data) || item.data || {};
                const book = d.character_book || (item.data && item.data.character_book) || {};
                const entries = extractBookEntries(book);
                entries.forEach((e) => {
                    list.push({
                        ...e,
                        displayName: e.name || e.comment || '未命名条目',
                        ownerCardName: d.name || item.name || '未知角色'
                    });
                });
            });
            return list;
        });
        const globalAllRegexScripts = computed(() => {
            const list = [];
            (library.library || []).forEach((item) => {
                const d = (item.data && item.data.data) || item.data || {};
                const regex = (d.extensions && d.extensions.regex_scripts) || d.regex_scripts || [];
                (Array.isArray(regex) ? regex : []).forEach((r) => {
                    list.push({ ...r, ownerCardName: d.name || item.name || '未知角色' });
                });
            });
            return list;
        });

        return {
            library, cardWithWb, editing, entryCount, reload, showDedupe, onDedupe,
            showMore, moreActions, onMoreSelect,
            openCardWb, openFileWb, closeEditor, addEntry, removeEntry, saveAll,
            WB_POSITIONS, wbExpanded, toggleWbExpand, syncWbKeys, syncWbSecKeys,
            ENTRY_FILTER_OPTIONS, ENTRY_SORT_OPTIONS, entrySearchQuery, entryFilterState, entrySortBy, entryList,
            entryName, entryDisplayName, wbToolsOpen,
            moveEntryByKey, duplicateEntry, expandAllEntries, collapseAllEntries, runEntryHealthCheck,
            entryBatchMode, entryBatchSet, toggleEntryBatch, toggleEntryBatchSelect, selectAllEntries, batchDeleteEntries, batchDisableEntries,
            showSnapshots, snapshots, openWbSnapshots, restoreWbSnapshot, deleteWbSnapshot,
            showGlobalEntrySearch, globalEntryQuery, globalEntryIndex, globalEntryResults,
            openGlobalEntrySearch, jumpToEntrySource,
            showGlobalAsset, globalAllWorldbooks, globalAllRegexScripts,
            extWbDirTitle, extWorldbooks, extWbLoading, pickExternalWbDir, openExternalWb,
            wbCategoryOf, showWbOps, wbOpsTarget, wbOpsDesc, wbOpsActions, openWbOps, onWbOpsSelect,
            showWbInput, wbInputTitle, wbInputPlaceholder, wbInputValue, onWbInputConfirm, onWbInputCancel,
            onNewWorldbook,
            openWbUrlImport, importWbFiles, batchExportWb,
            showWbMerge, wbMergeChecked, mergeCandidates, toggleMergeCheck, openWbMerge, executeWbMerge,
            extractFromCard, importWbJsonl, showWbStats,
            showWbImport, wbImportSources, wbImportSelected, wbImportEntries, wbImportChecked,
            openWbImport, toggleWbImportEntry, doWbImport
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.view-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0 24px; }
.sub-nav { box-shadow: 0 1px 4px rgba(0,0,0,.05); margin-bottom: 4px; }
.status-wrap { padding: 40px 0; text-align: center; }
.wb-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 8px 10px 4px;
    margin: 10px 12px 0;
    background: var(--van-background-2, #fff);
}
.wb-head { display: flex; align-items: center; gap: 8px; }
.wb-name { flex: 1; }
.wb-arrow { color: var(--van-gray-5, #c8c9cc); transition: transform .2s; cursor: pointer; flex-shrink: 0; }
.wb-arrow-open { transform: rotate(90deg); }
.wb-detail { padding-top: 6px; }
.wb-detail :deep(.van-cell-group--inset) { margin: 10px 0; }
.wb-num-row { display: flex; gap: 10px; }
.wb-num-row .van-field { flex: 1; }
.wb-toolbar { position: sticky; top: 0; z-index: 5; background: var(--van-background, #f7f8fa); border-bottom: 1px solid var(--van-gray-3, #ebedf0); }
.wb-toolbar-row { display: flex; align-items: center; gap: 6px; padding: 0 12px 8px; overflow-x: auto; }
.wb-toolbar-row :deep(.van-dropdown-menu) { flex: 1; min-width: 140px; }
.wb-toolbar-row :deep(.van-dropdown-menu__bar) { box-shadow: none; background: transparent; height: auto; }
.wb-batch-bar {
    position: sticky; bottom: 0; z-index: 5;
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    background: var(--van-background-2, #fff);
    box-shadow: 0 -2px 12px rgba(0,0,0,.10);
    overflow-x: auto;
}
.wb-batch-count { font-size: 12px; color: var(--van-gray-6, #969799); flex-shrink: 0; }
</style>