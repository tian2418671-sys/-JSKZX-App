<template>
    <div class="view-page">
        <van-nav-bar title="世界书" safe-area-inset-top>
            <template #right>
                <van-icon name="cluster-o" size="20" style="margin-right: 14px" @click="onDedupe" />
                <van-icon name="replay" size="20" @click="reload" />
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
                        <van-icon name="clock-o" size="20" style="margin-right: 14px" @click="showWbSnapshots = true" />
                        <van-icon name="success" size="20" :color="'#06b6d4'" @click="saveAll" />
                    </template>
                </van-nav-bar>
                <van-button block icon="plus" type="primary" plain style="margin: 10px 12px" @click="addEntry">添加条目</van-button>
                <!-- BUG 0.3:统一数组视图(extractBookEntries 归一化,支持数组/字典/脏形态) -->
                <div v-for="(e, i) in editEntries" :key="i" class="wb-item">
                    <div class="wb-head">
                        <van-switch v-model="e.enabled" size="20px" @click.stop />
                        <van-field v-model="e.comment" placeholder="条目名(comment)" class="wb-name" @click.stop />
                        <van-icon name="arrow-up" size="14" @click.stop="moveEntry(i, -1)" :style="{ opacity: i > 0 ? 1 : 0.3 }" />
                        <van-icon name="arrow-down" size="14" @click.stop="moveEntry(i, 1)" :style="{ opacity: i < editEntries.length - 1 ? 1 : 0.3 }" />
                        <van-icon name="copy-o" size="16" @click.stop="cloneEntry(i)" />
                        <van-icon name="delete-o" color="#ee0a24" size="18" @click.stop="removeEntry(i)" />
                    </div>
                    <van-field
                        v-model="e.content" type="textarea" rows="3" autosize
                        placeholder="条目内容"
                        @click.stop
                    />
                    <!-- 阶段 5.1: 词条增强编辑 -->
                    <div class="wb-advanced">
                        <van-field v-model="e._keysStr" placeholder="触发词(逗号分隔)" label="触发词" @blur="syncKeys(e)" @click.stop />
                        <div class="wb-advanced-row">
                            <div class="wb-advanced-col">
                                <span class="wb-advanced-label">selective</span>
                                <van-switch v-model="e.selective" size="16px" />
                            </div>
                            <div class="wb-advanced-col">
                                <span class="wb-advanced-label">constant</span>
                                <van-switch v-model="e.constant" size="16px" />
                            </div>
                            <div class="wb-advanced-col wb-pos-col">
                                <span class="wb-advanced-label">position</span>
                                <select v-model.number="e.position" class="wb-pos-select" @click.stop>
                                    <option v-for="po in POSITION_OPTIONS" :key="po.value" :value="po.value">{{ po.label }}</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <van-empty v-if="!editEntries.length" description="无条目" image-size="60" />
            </template>

            <!-- 世界书库文件列表(BUG 0.4:只显示独立世界书,卡内世界书在角色卡详情页编辑) -->
            <template v-else>
                <!-- 工具栏:文件夹扫描/JSONL/直链导入/批量导出(BUG 0.4) -->
                <div class="wb-toolbar">
                    <van-button size="small" plain icon="scan" @click="scanFolderWb" :loading="scanning">文件夹</van-button>
                    <van-button size="small" plain icon="plus" @click="triggerJsonlInput">JSONL</van-button>
                    <van-button size="small" plain icon="link-o" @click="showUrlImport = true">直链</van-button>
                    <van-button size="small" plain icon="down" @click="onBatchExport" :disabled="!selectedWbPaths.length">导出({{ selectedWbPaths.length }})</van-button>
                    <input
                        ref="jsonlInputEl"
                        type="file"
                        accept=".jsonl,.json"
                        multiple
                        style="display:none"
                        @change="onJsonlFiles"
                    />
                </div>

                <!-- 直链导入弹窗 -->
                <van-popup v-model:show="showUrlImport" position="center" round class="url-import-popup">
                    <div class="url-import-head">直链导入世界书</div>
                    <van-field v-model="wbUrl" placeholder="https://...worldbook.json" class="url-field" />
                    <div class="url-import-ops">
                        <van-button size="small" @click="showUrlImport = false">取消</van-button>
                        <van-button size="small" type="primary" :loading="urlImporting" @click="onUrlImport">导入</van-button>
                    </div>
                </van-popup>

                <van-cell-group inset title="独立世界书">
                    <van-cell
                        v-for="wb in library.worldbooks"
                        :key="wb.path"
                        :title="wb.name"
                        :label="`${editEntriesOf(wb).length} 条条目`"
                        is-link
                        @click="openFileWb(wb)"
                    >
                        <template #title>
                            <van-checkbox :model-value="selectedWbPaths.includes(wb.path)" @click.stop="toggleWbSelect(wb.path)" :style="{ marginRight: '8px' }" />
                            {{ wb.name }}
                        </template>
                        <template #right-icon>
                            <van-icon name="down" size="16" @click.stop="exportSingleWb(wb)" style="margin-right:4px" />
                        </template>
                    </van-cell>
                    <van-empty v-if="!library.worldbooks.length" description="暂无独立世界书文件" image-size="60" />
                </van-cell-group>
            </template>
        </div>

        <!-- 查重弹窗(独立世界书) -->
        <DedupeModal
            v-model:show="showDedupe"
            mode="worldbook"
            @cleaned="reload"
        />
        <!-- 阶段 2.2: 世界书快照 -->
        <SnapshotModal v-model:show="showWbSnapshots" :target-path="editing ? editing.path : ''" :target-name="editing ? editing.name : ''" mode="worldbook" @restored="onWbSnapshotRestored" />
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { showSuccessToast, showToast } from 'vant';
import { mobileLibrary, loadLibrary } from '../useMobileLibrary';
import { extractBookEntries } from '../../utils/cardLoader.js';
import DedupeModal from '../components/DedupeModal.vue';
import SnapshotModal from '../components/SnapshotModal.vue';
import { api } from '../../bridge/api';

export default {
    name: 'WorldbookView',
    components: { DedupeModal, SnapshotModal },
    setup() {
        const editing = ref(null); // { path, name, book, wrapped }
        const jsonlInputEl = ref(null);
        const library = mobileLibrary;
        const showDedupe = ref(false);
        // 阶段 2.2: 世界书快照
        const showWbSnapshots = ref(false);

        // 阶段 5.1: 世界书词条 position 选项
        const POSITION_OPTIONS = [
            { value: 0, label: 'before_char' },
            { value: 1, label: 'after_char' },
            { value: 2, label: 'before_user' },
            { value: 3, label: 'after_user' },
            { value: 4, label: 'chat_depth' },
        ];

        /** 快照恢复后重新打开当前世界书编辑器 */
        function onWbSnapshotRestored() {
            const ed = editing.value;
            if (ed) {
                openFileWb({ path: ed.path, name: ed.name });
            }
        }

        /** 查重入口(独立世界书) */
        function onDedupe() {
            if (!library.worldbooks.length) {
                showToast('世界书库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }

        // ---------- 工具栏:批量多选 ----------
        const selectedWbPaths = ref([]);
        function toggleWbSelect(path) {
            const idx = selectedWbPaths.value.indexOf(path);
            if (idx >= 0) {
                selectedWbPaths.value.splice(idx, 1);
            } else {
                selectedWbPaths.value.push(path);
            }
        }

        // ---------- 工具栏:文件夹扫描导入 ----------
        const scanning = ref(false);
        async function scanFolderWb() {
            scanning.value = true;
            try {
                const res = await api.scanTargetFolderJson();
                if (!res || res.error) {
                    showToast(res.error || '扫描失败');
                    return;
                }
                let imported = 0;
                for (const f of (res.files || [])) {
                    try {
                        const r = await api.readText(f.path);
                        if (!r || !r.success || !r.text) continue;
                        const parsed = JSON.parse(r.text);
                        if (!parsed.entries || typeof parsed.entries !== 'object') continue;
                        if (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') continue;
                        if (parsed.data && (parsed.data.description !== undefined || parsed.data.first_mes !== undefined)) continue;
                        const destName = f.name || 'imported.json';
                        await api.createWorldbook({ path: '/library/' + destName, name: destName, wb: parsed });
                        imported++;
                    } catch (e) { /* 跳过损坏 */ }
                }
                if (imported > 0) {
                    showSuccessToast(`已导入 ${imported} 本世界书`);
                    reload();
                } else {
                    showToast('未发现可导入的世界书文件');
                }
            } catch (e) {
                showToast('扫描失败: ' + (e.message || e));
            } finally {
                scanning.value = false;
            }
        }

        // ---------- 工具栏:JSONL 批量导入 ----------
        function triggerJsonlInput() {
            if (jsonlInputEl.value) jsonlInputEl.value.click();
        }
        async function onJsonlFiles(e) {
            const files = e.target.files;
            if (!files || !files.length) return;
            let imported = 0;
            for (const file of files) {
                try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    if (!parsed.entries || typeof parsed.entries !== 'object') continue;
                    const destName = file.name || 'imported.json';
                    await api.createWorldbook({ path: '/library/' + destName, name: destName, wb: parsed });
                    imported++;
                } catch (e) { /* 跳过损坏 */ }
            }
            if (imported > 0) {
                showSuccessToast(`已导入 ${imported} 本世界书`);
                reload();
            } else {
                showToast('未发现可导入的世界书文件');
            }
            if (jsonlInputEl.value) jsonlInputEl.value.value = '';
        }

        // ---------- 工具栏:直链导入 ----------
        const showUrlImport = ref(false);
        const wbUrl = ref('');
        const urlImporting = ref(false);
        async function onUrlImport() {
            const url = wbUrl.value.trim();
            if (!url || !/^https?:\/\//i.test(url)) { showToast('请输入有效的 HTTP/HTTPS 地址'); return; }
            urlImporting.value = true;
            try {
                const res = await api.fetchWbUrl(url);
                if (!res || !res.success) { showToast(res.error || '拉取失败'); return; }
                const parsed = JSON.parse(res.data);
                if (!parsed.entries || typeof parsed.entries !== 'object') { showToast('响应不是有效的世界书 JSON'); return; }
                const fileName = url.split('/').pop().split('?')[0].replace(/\.json$/i, '') || 'imported';
                const destName = fileName + '.json';
                await api.createWorldbook({ path: '/library/' + destName, name: destName, wb: parsed });
                showSuccessToast('已导入世界书');
                showUrlImport.value = false;
                wbUrl.value = '';
                reload();
            } catch (e) {
                showToast('导入失败: ' + (e.message || e));
            } finally {
                urlImporting.value = false;
            }
        }

        // ---------- 工具栏:批量导出 ----------
        async function onBatchExport() {
            if (!selectedWbPaths.value.length) { showToast('请先勾选要导出的世界书'); return; }
            const res = await api.exportWorldbooksBatch(selectedWbPaths.value);
            if (res && res.success) {
                showSuccessToast('已导出 ' + (res.count || selectedWbPaths.value.length) + ' 本世界书');
                selectedWbPaths.value = [];
            } else {
                showToast(res.error || '导出失败');
            }
        }

        // 编辑器视图:一律数组归一化(BUG 0.3)
        const editEntries = computed(() => (editing.value ? extractBookEntries(editing.value.book) : []));
        // 列表条目计数(任意独立世界书容器)
        function editEntriesOf(wb) {
            const book = wb && wb.wb ? wb.wb : {};
            return extractBookEntries(book).length;
        }

        function reload() { loadLibrary(); }

        async function openFileWb(wb) {
            const book = (wb.wb && typeof wb.wb === 'object') ? wb.wb : { entries: {} };
            editing.value = {
                path: wb.path,
                name: wb.name,
                book,
                wrapped: wb.wrapped
            };
        }

        function closeEditor() { editing.value = null; }

        function addEntry() {
            const ed = editing.value;
            if (!ed) return;
            const key = 'wb_' + Date.now().toString(36);
            const entry = { comment: '', content: '', enabled: true, keys: [], _keysStr: '', selective: false, constant: false, position: 0 };
            const book = ed.book;
            if (!book.entries || typeof book.entries !== 'object') book.entries = {};
            if (Array.isArray(book.entries)) {
                entry.key = key;
                book.entries.push(entry);
            } else {
                book.entries[key] = entry;
            }
        }

        function removeEntry(index) {
            const ed = editing.value;
            if (!ed) return;
            const book = ed.book;
            const arr = extractBookEntries(book);
            const target = arr[index];
            if (!target) return;
            if (Array.isArray(book.entries)) {
                book.entries.splice(index, 1);
            } else {
                const hit = Object.keys(book.entries).find((k) => book.entries[k] === target);
                if (hit) delete book.entries[hit];
            }
        }

        // 阶段 5.1: 词条排序(上移/下移)
        function moveEntry(index, delta) {
            const ed = editing.value;
            if (!ed) return;
            const book = ed.book;
            const arr = extractBookEntries(book);
            const newIndex = index + delta;
            if (newIndex < 0 || newIndex >= arr.length) return;
            if (Array.isArray(book.entries)) {
                const tmp = book.entries[index];
                book.entries[index] = book.entries[newIndex];
                book.entries[newIndex] = tmp;
            } else {
                const keys = Object.keys(book.entries);
                const tmp = book.entries[keys[index]];
                book.entries[keys[index]] = book.entries[keys[newIndex]];
                book.entries[keys[newIndex]] = tmp;
            }
        }
        // 阶段 5.1: 克隆词条
        function cloneEntry(index) {
            const ed = editing.value;
            if (!ed) return;
            const book = ed.book;
            const arr = extractBookEntries(book);
            const src = arr[index];
            if (!src) return;
            const clone = JSON.parse(JSON.stringify(src));
            clone.comment = (clone.comment || '') + ' (副本)';
            clone._keysStr = Array.isArray(clone.keys) ? clone.keys.join(',') : '';
            if (Array.isArray(book.entries)) {
                book.entries.splice(index + 1, 0, clone);
            } else {
                const newKey = 'wb_' + Date.now().toString(36);
                clone.key = newKey;
                const keys = Object.keys(book.entries);
                const newEntries = {};
                for (let i = 0; i <= index; i++) newEntries[keys[i]] = book.entries[keys[i]];
                newEntries[newKey] = clone;
                for (let i = index + 1; i < keys.length; i++) newEntries[keys[i]] = book.entries[keys[i]];
                book.entries = newEntries;
            }
        }
        // 阶段 5.1: 触发词同步
        function syncKeys(entry) {
            if (!entry) return;
            const str = (entry._keysStr || '').trim();
            entry.keys = str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
        }
        // 阶段 5.2: 单本导出世界书
        async function exportSingleWb(wb) {
            if (!wb || !wb.path) { showToast('该世界书尚未落盘，无法导出'); return; }
            const res = await api.exportWorldbooksBatch([wb.path]);
            if (res && res.success) {
                showSuccessToast('已导出「' + (wb.name || '未命名') + '」');
            } else {
                showToast((res && res.error) || '导出失败');
            }
        }

        async function saveAll() {
            const ed = editing.value;
            if (!ed) return;
            // 独立世界书文件:按原结构回写(保持 wrapped 容器)
            const body = ed.wrapped ? { extensions: { world_book: ed.book } } : ed.book;
            const res = await window.electronAPI.saveCard(ed.path, JSON.stringify(body, null, 2));
            res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
        }

        onMounted(() => {
            if (!library.ready) loadLibrary();
        });

        return {
            library, editing, jsonlInputEl, editEntries, editEntriesOf, reload, showDedupe, onDedupe,
            showWbSnapshots, onWbSnapshotRestored,
            selectedWbPaths, toggleWbSelect,
            scanning, scanFolderWb,
            triggerJsonlInput, onJsonlFiles,
            showUrlImport, wbUrl, urlImporting, onUrlImport, onBatchExport,
            openFileWb, closeEditor, addEntry, removeEntry, moveEntry, cloneEntry, syncKeys, POSITION_OPTIONS, saveAll,
            exportSingleWb
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.view-body { flex: 1; overflow-y: auto; padding: 4px 0 24px; }
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
/* 阶段 5.1: 词条增强编辑 */
.wb-advanced { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--van-gray-3, #ebedf0); }
.wb-advanced :deep(.van-field) { padding: 4px 0; }
.wb-advanced :deep(.van-field__label) { font-size: 12px; color: var(--van-gray-6, #969799); width: 56px; }
.wb-advanced-row { display: flex; align-items: center; gap: 12px; padding: 6px 0 2px; flex-wrap: wrap; }
.wb-advanced-col { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.wb-advanced-label { font-size: 11px; color: var(--van-gray-6, #969799); white-space: nowrap; }
.wb-pos-col { flex: 1.5; }
.wb-pos-select { font-size: 12px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--van-gray-3, #ebedf0); background: var(--van-background-2, #fff); color: var(--van-text-color, #323233); max-width: 100%; }
/* 工具栏 */
.wb-toolbar {
    display: flex; gap: 6px; padding: 8px 12px 4px;
    flex-wrap: wrap;
}
.wb-toolbar .van-button { flex: 1; min-width: 0; }
/* 直链导入弹窗 */
.url-import-popup {
    width: 84vw;
    padding: 16px;
}
.url-import-head {
    font-size: 16px; font-weight: 600; margin-bottom: 12px;
    text-align: center;
}
.url-field { margin-bottom: 12px; }
.url-import-ops {
    display: flex; gap: 10px; justify-content: flex-end;
}
</style>