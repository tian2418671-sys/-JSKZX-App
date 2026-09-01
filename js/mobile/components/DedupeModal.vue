<template>
    <van-popup
        :show="modelValue"
        position="center"
        round
        class="ddm-popup"
        @update:show="(v) => emit('update:modelValue', v)"
    >
        <div class="ddm-head">
            <span class="ddm-title">{{ mode === 'card' ? '角色卡查重' : mode === 'worldbook' ? '世界书查重' : '内容指纹查重（跨名称）' }}</span>
            <van-icon name="cross" size="18" @click="emit('update:modelValue', false)" />
        </div>

        <!-- 模式切换 Tab -->
        <div class="ddm-tabs">
            <div class="ddm-tab" :class="{ active: mode === 'card' }" @click="$emit('switch-mode', 'card')">同名查重</div>
            <div class="ddm-tab" :class="{ active: mode === 'content' }" @click="$emit('switch-mode', 'content')">内容指纹</div>
            <div class="ddm-tab" :class="{ active: mode === 'worldbook' }" @click="$emit('switch-mode', 'worldbook')">世界书</div>
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
                    <van-tag v-if="group.kind === 'content'" round type="warning" plain>内容指纹聚类</van-tag>
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
        mode: { type: String, default: 'card' } // 'card' | 'worldbook' | 'content'
    },
    emits: ['update:modelValue', 'cleaned', 'switch-mode'],
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

        // ================= 内容指纹查重（跨名称，对齐桌面 v2.1.0 MinHash+LSH 引擎） =================
        // 1) 提取可比对正文
        const extractContentText = (item) => {
            const d = (item.data && (item.data.data || item.data)) || {};
            return [d.description, d.personality, d.scenario, d.first_mes, d.mes_example]
                .filter(Boolean).join('\n');
        };
        // 2) 文本规范化（去空白/标点，转小写）
        const normalizeText = (t) => String(t || '')
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .toLowerCase()
            .trim();
        // 3) 字符 4-gram shingle 集合
        const getShingles = (text) => {
            const set = new Set();
            for (let i = 0; i + 4 <= text.length; i++) set.add(text.slice(i, i + 4));
            return set;
        };
        // 4) 确定性 MinHash 哈希族（固定种子，同一文本签名稳定）
        const MINHASH_HASHES = 96;
        const LSH_BANDS = 8;
        const LSH_ROWS = MINHASH_HASHES / LSH_BANDS; // 12
        const minhashSeeds = (() => {
            const seeds = [];
            let s = 0x9e3779b9;
            for (let i = 0; i < MINHASH_HASHES; i++) {
                s = (s * 1103515245 + 12345) & 0x7fffffff;
                seeds.push(s);
            }
            return seeds;
        })();
        const hashString = (str, seed) => {
            let h = seed >>> 0;
            for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
            return h;
        };
        const computeMinHash = (shingles) => {
            const sig = new Array(MINHASH_HASHES).fill(0x7fffffff);
            shingles.forEach((sh) => {
                for (let i = 0; i < MINHASH_HASHES; i++) {
                    const h = hashString(sh, minhashSeeds[i]);
                    if (h < sig[i]) sig[i] = h;
                }
            });
            return sig;
        };
        // 5) Jaccard 估计 = 签名相同分量比
        const estimateSimilarity = (a, b) => {
            let same = 0;
            for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
            return same / a.length;
        };
        // 6) LSH band 分桶 key
        const bandKey = (sig, band) => {
            let key = '';
            for (let r = 0; r < LSH_ROWS; r++) key += sig[band * LSH_ROWS + r].toString(16).padStart(8, '0');
            return key;
        };
        // 7) Union-Find 并查集
        const unionFind = (n) => {
            const parent = Array.from({ length: n }, (_, i) => i);
            const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
            const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
            return { find, union };
        };

        async function runContentScan() {
            const items = [...mobileLibrary.library];
            if (!items.length) { emptyText.value = '卡片库为空，无法进行版本查重'; return; }

            // 规范化文本，内容过短（<20 字符）无法可靠判定，跳过
            const valid = [];
            items.forEach((item, idx) => {
                const text = normalizeText(extractContentText(item));
                if (text.length < 20) return;
                valid.push({ item, idx, text });
            });
            if (valid.length < 2) {
                emptyText.value = '未发现可判定的内容重复项（内容过短的项已跳过）';
                return;
            }

            // MinHash 签名 + LSH 候选 + 精确相似度确认（阈值 85%）
            const sigs = valid.map((v) => computeMinHash(getShingles(v.text)));
            const buckets = new Map();
            valid.forEach((_, i) => {
                for (let b = 0; b < LSH_BANDS; b++) {
                    const k = bandKey(sigs[i], b);
                    if (!buckets.has(k)) buckets.set(k, []);
                    buckets.get(k).push(i);
                }
            });
            const THRESHOLD = 0.85;
            const uf = unionFind(valid.length);
            const seenPairs = new Set();
            buckets.forEach((list) => {
                if (list.length < 2) return;
                for (let x = 0; x < list.length; x++) {
                    for (let y = x + 1; y < list.length; y++) {
                        const a = list[x], b = list[y];
                        const pk = a < b ? a + ':' + b : b + ':' + a;
                        if (seenPairs.has(pk)) continue;
                        seenPairs.add(pk);
                        if (estimateSimilarity(sigs[a], sigs[b]) >= THRESHOLD) uf.union(a, b);
                    }
                }
            });

            // 聚类分组（单例忽略）
            const clusters = new Map();
            valid.forEach((_, i) => {
                const root = uf.find(i);
                if (!clusters.has(root)) clusters.set(root, []);
                clusters.get(root).push(i);
            });
            const rawGroups = [];
            clusters.forEach((members) => {
                if (members.length >= 2) rawGroups.push(members.map((i) => valid[i]));
            });
            if (!rawGroups.length) {
                emptyText.value = '未发现内容高度相似的重复项 🎉';
                return;
            }

            // 批量获取物理状态用于展示
            const flatPaths = rawGroups.flat().map((v) => v.item.path);
            let stats = {};
            try {
                const sr = await window.electronAPI.getFileStats(flatPaths);
                if (sr && sr.success) stats = sr.data || {};
            } catch (e) { /* 降级无物理状态 */ }

            groups.value = rawGroups.map((list) => {
                list.forEach((v) => {
                    const st = stats[v.item.path] || {};
                    v._sizeKb = st.size ? (st.size / 1024).toFixed(1) : '?';
                    v._mtime = st.mtimeMs || Date.now();
                    v._dateStr = new Date(v._mtime).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    });
                    v._tokens = estimateTokens(v.text);
                });
                // 内容最长者排最前（更可能是完整版）
                list.sort((a, b) => b.text.length - a.text.length);
                const master = list[0];
                list.forEach((v) => {
                    v._simPct = v === master ? 100 : Math.round(estimateSimilarity(v.sig, master.sig) * 100);
                    const d = (v.item.data && (v.item.data.data || v.item.data)) || {};
                    v._name = d.name || v.item.name || v.item.path.split(/[\/]/).pop();
                    v._diffInfo = v === master ? '👑 内容最完整（推荐保留）'
                        : (v._simPct >= 98 ? '🧬 内容几乎完全一致' : '⚠️ 高度相似，细节有差异');
                });
                return { name: master._name, cards: list, kind: 'content' };
            });
        }

        async function runScan() {
            scanning.value = true;
            groups.value = [];
            try {
                if (props.mode === 'content') { await runContentScan(); return; }
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

                // 2. 批量获取物理文件状态（内容模式已在 runContentScan 内处理,此处不会到达）
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
                showToast('查重失败: ' + (e.message || e));
            } finally {
                scanning.value = false;
            }
        }

        function metaText(item) {
            if (props.mode === 'content') {
                return `🧬 相似度 ${item._simPct}% · ${item._sizeKb} KB · ${item._tokens} tokens`;
            }
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
.ddm-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--van-gray-2, #f2f3f5);
}
.ddm-tab {
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--van-gray-6, #969799);
    background: var(--van-gray-1, #f7f8fa);
    cursor: pointer;
}
.ddm-tab.active {
    color: #fff;
    background: var(--van-primary-color, #1989fa);
    font-weight: 600;
}
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