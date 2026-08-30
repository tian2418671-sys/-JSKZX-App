<template>
    <van-popup
        :show="modelValue"
        position="center"
        round
        class="ddm-popup"
        @update:show="(v) => emit('update:modelValue', v)"
    >
        <div class="ddm-head">
            <span class="ddm-title">{{ mode === 'card' ? '角色卡查重' : '世界书查重' }}</span>
            <van-icon name="cross" size="18" @click="emit('update:modelValue', false)" />
        </div>

        <div class="ddm-body">
            <!-- 扫描中 -->
            <div v-if="scanning || pending" class="ddm-status">
                <van-loading size="24">{{ pending || '正在分析同名卡片…' }}</van-loading>
            </div>

            <!-- 无重复 -->
            <van-empty v-else-if="groups.length === 0" :description="emptyText" image-size="72" />

            <!-- 分组列表 -->
            <div v-for="(group, gi) in groups" :key="gi" class="ddm-group">
                <div class="ddm-group-title">
                    {{ group.name }}
                    <van-tag round type="danger">{{ group.cards.length }} 个版本</van-tag>
                </div>

                <div
                    v-for="(item, ii) in group.cards"
                    :key="item.path"
                    class="ddm-row"
                    :class="{ master: ii === 0 }"
                >
                    <div class="ddm-row-main">
                        <div class="ddm-row-name">
                            <span class="ddm-fname">{{ item.fileName || item.name }}</span>
                            <van-tag v-if="ii === 0" type="success" plain size="mini">推荐保留</van-tag>
                            <van-tag v-else size="mini" plain :type="'warning'">{{ item._diffInfo }}</van-tag>
                        </div>
                        <div class="ddm-row-meta">{{ item._dateStr }} · {{ metaText(item) }}</div>
                    </div>
                    <div v-if="ii > 0" class="ddm-row-ops">
                        <van-button size="mini" plain type="primary" @click="openDiff(gi, ii)">对比</van-button>
                        <van-button size="mini" type="danger" plain @click="trashOne(gi, ii)">清此版</van-button>
                    </div>
                </div>

                <div v-if="group.cards.length > 1" class="ddm-grp-ops">
                    <van-button size="small" type="danger" plain block @click="trashRest(gi)">
                        清理其余 {{ group.cards.length - 1 }} 个版本（移入回收站）
                    </van-button>
                </div>
            </div>
        </div>

        <!-- 版本差异比对弹窗 -->
        <DiffModal
            :show="showDiff"
            :master-name="diffMasterName"
            :compare-name="diffCompareName"
            :field-results="diffFieldResults"
            @close="showDiff = false"
        />
    </van-popup>
</template>

<script>
import { ref, watch } from 'vue';
import { showToast } from 'vant';
import { mobileLibrary } from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate';
import DiffModal from './DiffModal.vue';

export default {
    name: 'DedupeModal',
    components: { DiffModal },
    props: {
        modelValue: { type: Boolean, default: false },
        mode: { type: String, default: 'card' } // 'card' | 'worldbook'
    },
    emits: ['update:modelValue', 'cleaned'],
    setup(props, { emit }) {
        const scanning = ref(false);
        const pending = ref('');
        const emptyText = ref('未发现重复');
        const groups = ref([]);
        const busyKey = ref('');

        function entriesArray(wb) {
            const e = (wb && wb.entries) || {};
            if (Array.isArray(e)) return e;
            return e && typeof e === 'object' ? Object.keys(e).map((k) => e[k]) : [];
        }
        function keysOf(entry) {
            if (!entry || typeof entry !== 'object') return [];
            const kArr = Array.isArray(entry.key) ? entry.key : (typeof entry.key === 'string' ? entry.key.split(/[,，]/) : []);
            return kArr.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
        }

        async function runScan() {
            scanning.value = true;
            groups.value = [];
            try {
                const list = props.mode === 'card'
                    ? [...mobileLibrary.library]
                    : mobileLibrary.worldbooks.map((w) => ({ ...w }));
                if (list.length === 0) {
                    emptyText.value = props.mode === 'card' ? '卡片库为空，无法查重' : '世界书库为空，无法查重';
                    return;
                }
                // 1. 按名称聚类
                const grouped = {};
                list.forEach((item) => {
                    let nm;
                    if (props.mode === 'card') nm = (item.name || '未命名').trim();
                    else nm = (item.wb && item.wb.name) || (item.name || '').replace(/\.json$/i, '') || '未命名世界书';
                    nm = String(nm).trim() || '未命名';
                    if (!grouped[nm]) grouped[nm] = [];
                    grouped[nm].push(item);
                });
                const potentials = Object.entries(grouped).filter(([, arr]) => arr.length > 1);
                if (potentials.length === 0) {
                    emptyText.value = props.mode === 'card' ? '未发现同名重复的角色卡' : '未发现同名的重复世界书';
                    return;
                }

                // 2. 批量获取物理文件状态
                const paths = potentials.flatMap(([, arr]) => arr.map((it) => it.path));
                let stats = {};
                try {
                    const sr = await window.electronAPI.getFileStats(paths);
                    if (sr && sr.success) stats = sr.data || {};
                } catch (e) { /* 降级 */ }

                // 3. 组装分组
                groups.value = potentials.map(([name, arr]) => {
                    arr.forEach((it) => {
                        const stat = stats[it.path] || {};
                        if (props.mode === 'card') {
                            const d = (it.data && (it.data.data || it.data)) || {};
                            it._tokens = estimateTokens(String(d.description || '') + String(d.personality || '') + String(d.first_mes || ''));
                            it._desc = d.description || '';
                        } else {
                            const es = entriesArray(it.wb || {});
                            it._entryCount = es.length;
                            it._keys = new Set(es.flatMap(keysOf));
                        }
                        const fallback = (it.data && it.data.create_date) ? new Date(it.data.create_date).getTime() : 0;
                        it._mtime = stat.mtimeMs || fallback || Date.now();
                        it._dateStr = new Date(it._mtime).toLocaleString('zh-CN', {
                            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        });
                        it._size = stat.size || ((it.wb && it.size) || 0);
                    });

                    arr.sort((a, b) => {
                        if (props.mode === 'card') {
                            const td = b._tokens - a._tokens;
                            if (Math.abs(td) / Math.max(a._tokens, b._tokens, 1) > 0.05) return td;
                        } else if (a._entryCount !== b._entryCount) {
                            return b._entryCount - a._entryCount;
                        }
                        return b._mtime - a._mtime;
                    });

                    arr.forEach((it, idx) => {
                        if (idx === 0) return;
                        if (props.mode === 'card') {
                            const dl = (it._desc || '').length - (arr[0]._desc || '').length;
                            it._diffInfo = dl > 100 ? '设定更全' : (dl < -100 ? '设定有缺' : (it._desc !== arr[0]._desc ? '细节不同' : '完全一致'));
                        } else {
                            const master = arr[0]._keys || new Set();
                            const mine = it._keys || new Set();
                            let overlap = 0;
                            mine.forEach((k) => { if (master.has(k)) overlap++; });
                            const ratio = mine.size ? Math.round((overlap / mine.size) * 100) : 0;
                            it._diffInfo = (it._entryCount === arr[0]._entryCount && ratio === 100)
                                ? '内容重合' : `重合 ${ratio}%`;
                        }
                        it._diffInfo = it._diffInfo || '不同版本';
                    });
                    return { name, cards: arr };
                });
            } catch (e) {
                console.error('查重失败:', e);
                emptyText.value = '查重失败: ' + (e.message || e);
            } finally {
                scanning.value = false;
            }
        }

        function metaText(item) {
            return props.mode === 'card'
                ? `${item._tokens} tokens`
                : `${item._entryCount} 条` + (item._size ? ' · ' + fmtSize(item._size) : '');
        }
        function fmtSize(n) {
            if (!n) return '';
            return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : (n / 1024).toFixed(0) + 'KB';
        }

        // ---------- 版本差异比对(复用桌面 useDedupe 的 diff 算法) ----------
        const showDiff = ref(false);
        const diffMasterName = ref('');
        const diffCompareName = ref('');
        const diffFieldResults = ref([]);

        const chunkTextForDiff = (text) => {
            if (!text) return [];
            try {
                return text.split(/(?<=[。！？.!?\n]+)/).map((s) => s.trim()).filter(Boolean);
            } catch (e) {
                return text.split('\n').map((s) => s.trim()).filter(Boolean);
            }
        };
        const computeTextDiffLines = (str1 = '', str2 = '') => {
            const chunks1 = chunkTextForDiff(str1);
            const chunks2 = chunkTextForDiff(str2);
            const set1 = new Set(chunks1);
            const set2 = new Set(chunks2);
            const res1 = chunks1.map((chunk) => ({ text: chunk, type: set2.has(chunk) ? 'same' : 'removed' }));
            const res2 = chunks2.map((chunk) => ({ text: chunk, type: set1.has(chunk) ? 'same' : 'added' }));
            return { masterLines: res1, compareLines: res2 };
        };

        function openDiff(gi, ii) {
            const group = groups.value[gi];
            if (!group) return;
            const master = group.cards[0];
            const compare = group.cards[ii];
            if (!master || !compare) return;

            diffMasterName.value = master.name || master.fileName || '未知';
            diffCompareName.value = compare.name || compare.fileName || '未知';
            diffFieldResults.value = [];

            const mData = (master.data && (master.data.data || master.data)) || {};
            const cData = (compare.data && (compare.data.data || compare.data)) || {};

            if (props.mode === 'worldbook') {
                const e1 = (master.wb && master.wb.entries) ? (Array.isArray(master.wb.entries) ? master.wb.entries : Object.values(master.wb.entries)) : [];
                const e2 = (compare.wb && compare.wb.entries) ? (Array.isArray(compare.wb.entries) ? compare.wb.entries : Object.values(compare.wb.entries)) : [];
                diffFieldResults.value.push({
                    label: '📚 词条总数',
                    isSame: e1.length === e2.length,
                    len1: `${e1.length} 条`, len2: `${e2.length} 条`
                });
                const getKeys = (entries) => entries.map((e) => (Array.isArray(e.key) ? e.key.join(', ') : e.key)).filter(Boolean);
                const k1 = new Set(getKeys(e1));
                const k2 = new Set(getKeys(e2));
                diffFieldResults.value.push({
                    label: '🔑 触发词池覆盖差异',
                    isSame: k1.size === k2.size && [...k1].every((k) => k2.has(k)),
                    isTags: true,
                    onlyMasterTags: [...k1].filter((k) => !k2.has(k)),
                    onlyCompareTags: [...k2].filter((k) => !k1.has(k))
                });
                const t1 = e1.map((e) => (e && typeof e === 'object') ? String(e.content || '') : '').join('\n');
                const t2 = e2.map((e) => (e && typeof e === 'object') ? String(e.content || '') : '').join('\n');
                const same = t1 === t2;
                diffFieldResults.value.push({
                    label: '📝 词条正文总集比对',
                    isSame: same, len1: `${t1.length} 字`, len2: `${t2.length} 字`,
                    diffText: same ? null : computeTextDiffLines(t1, t2)
                });
            } else {
                const fields = [
                    { key: 'description', label: '📝 角色描述' },
                    { key: 'personality', label: '🎭 性格设定' },
                    { key: 'scenario', label: '🎬 当前场景' },
                    { key: 'first_mes', label: '💬 开场首句' },
                    { key: 'mes_example', label: '🗣️ 示例对话' }
                ];
                diffFieldResults.value = fields.map((f) => {
                    const v1 = String(mData[f.key] || master[f.key] || '');
                    const v2 = String(cData[f.key] || compare[f.key] || '');
                    const same = v1.trim() === v2.trim();
                    return {
                        label: f.label, isSame: same,
                        len1: `${v1.length} 字`, len2: `${v2.length} 字`,
                        diffText: same ? null : computeTextDiffLines(v1, v2)
                    };
                });
                const t1 = new Set([...(master.customTags || []), ...((mData && mData.tags) || [])]);
                const t2 = new Set([...(compare.customTags || []), ...((cData && cData.tags) || [])]);
                diffFieldResults.value.push({
                    label: '🏷️ 标签',
                    isSame: t1.size === t2.size && [...t1].every((t) => t2.has(t)),
                    isTags: true,
                    onlyMasterTags: [...t1].filter((t) => !t2.has(t)),
                    onlyCompareTags: [...t2].filter((t) => !t1.has(t))
                });
            }
            showDiff.value = true;
        }

        async function doTrash(paths, keepCount) {
            const res = await window.electronAPI.trashFiles(paths);
            if (!res || !res.success) {
                showToast((res && res.error) || '清理失败');
                return false;
            }
            const failedSet = new Set((res.failed || []).map((f) => f.path));
            const okPaths = paths.filter((p) => !failedSet.has(p));
            if (props.mode === 'card') {
                mobileLibrary.library = mobileLibrary.library.filter((c) => !okPaths.includes(c.path));
            } else {
                mobileLibrary.worldbooks = mobileLibrary.worldbooks.filter((w) => !okPaths.includes(w.path));
            }
            const msg = `已清理 ${res.count} 个版本` + (failedSet.size ? `；${failedSet.size} 个失败` : '');
            showToast(msg);
            emit('cleaned', { count: res.count, failed: failedSet.size });
            return true;
        }

        /** 清理单个冗余版本 */
        async function trashOne(gi, ii) {
            const group = groups.value[gi];
            if (!group || busyKey.value) return;
            busyKey.value = group.cards[ii].path;
            const ok = await doTrash([group.cards[ii].path], 1);
            if (ok) {
                group.cards.splice(ii, 1);
                if (group.cards.length < 2) groups.value.splice(gi, 1);
            }
            busyKey.value = '';
        }

        /** 一键清理:保留推荐版,其余全部移入回收站 */
        async function trashRest(gi) {
            const group = groups.value[gi];
            if (!group || busyKey.value) return;
            if (group.cards.length < 2) return;
            const paths = group.cards.slice(1).map((c) => c.path);
            busyKey.value = group.name;
            const ok = await doTrash(paths, group.cards.length - 1);
            if (ok) groups.value.splice(gi, 1);
            busyKey.value = '';
        }

        watch(() => props.modelValue, (v) => { if (v) runScan(); });
        watch(() => props.mode, () => { if (props.modelValue) runScan(); });

        return {
            scanning, pending, emptyText, groups, busyKey,
            metaText, trashOne, trashRest,
            showDiff, diffMasterName, diffCompareName, diffFieldResults, openDiff
        };
    }
};
</script>

<style scoped>
.ddm-popup {
    width: 90vw;
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.ddm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.ddm-title { font-size: 16px; font-weight: 600; }
.ddm-body { flex: 1; overflow-y: auto; padding: 10px 12px 18px; }
.ddm-status { padding: 48px 0; text-align: center; }
.ddm-group {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 10px;
    margin-bottom: 12px;
    background: var(--van-background-2, #fff);
}
.ddm-group-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 600; margin-bottom: 6px;
}
.ddm-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px dashed var(--van-gray-4, #ebedf0);
}
.ddm-row:last-of-type { border-bottom: none; }
.ddm-row-main { flex: 1; min-width: 0; }
.ddm-row-name {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px;
}
.ddm-fname {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 9em;
}
.ddm-row-meta { margin-top: 2px; font-size: 11px; color: var(--van-gray-6, #969799); }
.ddm-row-ops { flex-shrink: 0; }
.ddm-grp-ops { margin-top: 8px; }
</style>