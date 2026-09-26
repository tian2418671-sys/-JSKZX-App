<template>
    <van-popup
        :show="modelValue"
        position="center"
        round
        close-on-click-overlay
        class="ddm-popup"
        @update:show="(v) => $emit('update:modelValue', v)"
    >
        <div class="ddm-head">
            <span class="ddm-title">{{ mode === 'card' ? '角色卡查重' : mode === 'worldbook' ? '世界书查重' : '内容指纹查重（跨名称）' }}</span>
            <van-icon name="cross" size="18" @click="$emit('update:modelValue', false)" />
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
                <!-- 🚀 大库内容指纹/世界书扫描可取消:中止水合,已算签名保留(下次续扫) -->
                <div v-if="scanning && (mode === 'content' || mode === 'worldbook')" class="ddm-cancel-row">
                    <van-button size="small" plain type="primary" @click="cancelScan()">取消扫描</van-button>
                </div>
            </div>

            <!-- 已取消 -->
            <van-empty v-else-if="scanCancelled" description="已取消扫描（已计算的签名已保存，下次可续扫）" image-size="72" />

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
import { mobileLibrary, loadCardFullData, loadContentTextsStream, loadContentSigs, getContentSig, setContentSig } from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate';
import { wbDedupeStem, stripCnReplicaTails, computeMinHash96, estimateMinHashSimilarity } from '../../utils/presetDedupe.js';
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
        // 🚀 内容指纹大库扫描:取消令牌(用户点取消 → 中止水合,已算签名保留)
        const scanCancelFlag = ref(false);
        const scanCancelled = ref(false);

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

            // 🚀 E2:先载入持久化签名缓存;已算过签名的卡零水合零解析直接复用,
            // 只对新增/未算卡发起流式水合(二次查重从 2GB chara 过桥降到 0)
            await loadContentSigs();
            const needCompute = items.filter((item) => !getContentSig(item.path));

            // 🚀 内存优化:流式水合(loadContentTextsStream)——每批解析完立即算签名并丢弃对象,
            // 全库内存峰值 ≈ 1 批(24 卡),而非 loadCardsFullDataBatch 的全量 Map(4989 卡 OOM 主源)。
            // PNG 无内嵌角色卡数据的卡直接跳过(不回退 readBuffer 整图 base64,防 2GB 过桥)。
            scanCancelFlag.value = false;
            scanCancelled.value = false;
            const valid = [];
            // path → 条目/索引预建 Map(5000 卡下避免每卡 O(n) find/indexOf)
            const itemByPath = new Map();
            const idxByPath = new Map();
            items.forEach((it, i) => { itemByPath.set(it.path, it); idxByPath.set(it.path, i); });
            // 已算签名卡直接复用(零水合零解析)
            items.forEach((item, idx) => {
                const cachedSig = getContentSig(item.path);
                if (cachedSig) valid.push({ item, idx, sig: cachedSig, text: '' });
            });
            let skippedNoData = 0;
            await loadContentTextsStream(needCompute, (batch, done, total, skipped) => {
                pending.value = `读取卡片 ${done}/${total}…（跳过 ${skippedNoData} 张无内嵌数据）`;
                batch.forEach(({ path, parsed }) => {
                    const item = itemByPath.get(path);
                    if (!item) return;
                    const text = normalizeText(extractContentText({ data: parsed }));
                    if (text.length < 20) return; // 内容过短无法可靠判定
                    const sig = computeMinHash(getShingles(text));
                    setContentSig(path, sig); // E2:增量持久化,二次查重免水合
                    valid.push({ item, idx: idxByPath.get(path), sig, text });
                });
                skippedNoData += skipped;
            }, {
                onProgress: (done, total) => { pending.value = `读取卡片 ${done}/${total}…（跳过 ${skippedNoData} 张无内嵌数据）`; },
                shouldCancel: () => scanCancelFlag.value
            });

            if (scanCancelFlag.value) {
                scanCancelled.value = true;
                pending.value = ''; // 置空 → 显示"已取消"空状态而非 loading
                return;
            }
            pending.value = '';
            if (valid.length < 2) {
                emptyText.value = '未发现可判定的内容重复项（内容过短的项已跳过）';
                return;
            }

            // MinHash 签名 + LSH 候选 + 精确相似度确认（阈值 85%）
            // v.sig 已直接回填(含缓存复用),供分组展示按 master 复算相似度;
            // BUG-15 教训:签名必须挂到条目自身,不能只存并行数组。
            const buckets = new Map();
            valid.forEach((_, i) => {
                for (let b = 0; b < LSH_BANDS; b++) {
                    const k = bandKey(valid[i].sig, b);
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
                        if (estimateSimilarity(valid[a].sig, valid[b].sig) >= THRESHOLD) uf.union(a, b);
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
                    v._name = v.item.name || v.item.path.split(/[\/]/).pop();
                    v._diffInfo = v === master ? '👑 内容最完整（推荐保留）'
                        : (v._simPct >= 98 ? '🧬 内容几乎完全一致' : '⚠️ 高度相似，细节有差异');
                });
                return { name: master._name, cards: list, kind: 'content' };
            });
        }

        async function runScan() {
            scanning.value = true;
            groups.value = [];
            scanCancelFlag.value = false;
            scanCancelled.value = false;
            // 🚀 先显示扫描反馈（消除「点了没反应」观感）；worldbook 走独立管线（名称归一 + 内容指纹）
            pending.value = props.mode === 'worldbook'
                ? '正在比对世界书（名称归一 + 内容指纹）…'
                : props.mode === 'content' ? '正在分析内容指纹…' : '正在分析同名卡片…';
            await new Promise((r) => setTimeout(r, 50));
            try {
                if (props.mode === 'content') { await runContentScan(); return; }
                if (props.mode === 'worldbook') { await runWorldbookScan(); return; }
                const list = [...mobileLibrary.library];
                if (list.length === 0) {
                    emptyText.value = '卡片库为空，无法查重';
                    return;
                }
                // 1. 按名称聚类
                const grouped = {};
                list.forEach((item) => {
                    const nm = String(item.name || '未命名').trim() || '未命名';
                    if (!grouped[nm]) grouped[nm] = [];
                    grouped[nm].push(item);
                });
                const potentials = Object.entries(grouped).filter(([, arr]) => arr.length > 1);
                if (potentials.length === 0) {
                    emptyText.value = '未发现同名重复的角色卡';
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
                        // 🚀 轻量化:Token/描述片段已在加载时预提取(_tokens/_desc),不再触碰全量 data
                        it._tokens = it._tokens || 0;
                        it._desc = it._desc || '';
                        // SAF 无 birthtime,_ctime 已回退 mtime(ms)
                        const fallback = Number(it._ctime) || 0;
                        it._mtime = stat.mtimeMs || fallback || Date.now();
                        it._dateStr = new Date(it._mtime).toLocaleString('zh-CN', {
                            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                        });
                        it._size = stat.size || ((it.wb && it.size) || 0);
                    });

                    arr.sort((a, b) => {
                        const td = b._tokens - a._tokens;
                        if (Math.abs(td) / Math.max(a._tokens, b._tokens, 1) > 0.05) return td;
                        return b._mtime - a._mtime;
                    });

                    arr.forEach((it, idx) => {
                        if (idx === 0) return;
                        const dl = (it._desc || '').length - (arr[0]._desc || '').length;
                        it._diffInfo = dl > 100 ? '设定更全' : (dl < -100 ? '设定有缺' : (it._desc !== arr[0]._desc ? '细节不同' : '完全一致'));
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

        // ================= 世界书查重（名称归一[含副本/版本剥离] + 内容指纹跨名比对） =================
        // 📌 2026-09-25 修复三问：①只查严格同名漏掉「_副本」→ 名称归一（wbDedupeStem）；
        //    ②改名同源抓不到 → 内容签名（entries 触发词+正文 MinHash ≥85%）；③无反馈/卡顿 → 先渲染 loading + 分批让出主线程 + 可取消。
        async function runWorldbookScan() {
            const list = mobileLibrary.worldbooks.map((w) => ({ ...w }));
            if (list.length === 0) { emptyText.value = '世界书库为空，无法查重'; return; }

            // 1) 名称归一 + 内容签名（分批让出主线程；可取消）
            const items = [];
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                if (scanCancelFlag.value) { scanCancelled.value = true; return; }
                const wbData = it.wb || {};
                const name = String(wbData.name || it.name || '').replace(/\.json$/i, '') || '未命名世界书';
                it._wbName = name;
                it._wbStem = wbDedupeStem(it.name || name);
                const es = entriesArray(wbData);
                it._entryCount = es.length;
                let text = '';
                try {
                    text = es.map((e) => {
                        const k = Array.isArray(e && e.key) ? e.key.join(' ') : (e && e.key ? String(e.key) : '');
                        const c = (e && typeof e.content === 'string') ? e.content : '';
                        return (k + '\n' + c).trim();
                    }).filter(Boolean).join('\n');
                } catch (e) { /* 单本异常不中断整批 */ }
                it._sig = text.length >= 20 ? computeMinHash96(text) : null;
                items.push(it);
                if (i % 15 === 14) {
                    pending.value = `读取世界书 ${i + 1}/${list.length}…`;
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
            pending.value = '正在聚类比对…';
            await new Promise((r) => setTimeout(r, 0));

            // 2) 聚类：名称归一相同 ∪ 内容相似（≥ 85%，保守阈值）
            const parent = Array.from({ length: items.length }, (_, i) => i);
            const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
            const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
            const CONTENT_THRESHOLD = 0.85;
            const byStem = new Map();
            items.forEach((it, i) => {
                if (!it._wbStem) return;
                if (!byStem.has(it._wbStem)) byStem.set(it._wbStem, []);
                byStem.get(it._wbStem).push(i);
            });
            for (const [, arr] of byStem) for (let k = 1; k < arr.length; k++) union(arr[0], arr[k]);
            for (let i = 0; i < items.length; i++) {
                if (scanCancelFlag.value) { scanCancelled.value = true; return; }
                for (let j = i + 1; j < items.length; j++) {
                    if (items[i]._wbStem && items[i]._wbStem === items[j]._wbStem) continue; // 已同组
                    if (!items[i]._sig || !items[j]._sig) continue;
                    const sim = estimateMinHashSimilarity(items[i]._sig, items[j]._sig);
                    if (sim !== null && sim >= CONTENT_THRESHOLD) union(i, j);
                }
                if (i % 30 === 29) await new Promise((r) => setTimeout(r, 0));
            }

            // 3) 组装分组
            const clusters = new Map();
            items.forEach((_, i) => {
                const root = find(i);
                if (!clusters.has(root)) clusters.set(root, []);
                clusters.get(root).push(i);
            });
            const rawGroups = [];
            clusters.forEach((members) => { if (members.length >= 2) rawGroups.push(members.map((i) => items[i])); });
            if (!rawGroups.length) {
                emptyText.value = '未发现重复世界书（已比对：名称归一 + 内容指纹 🎉）';
                return;
            }
            const paths = rawGroups.flat().map((it) => it.path);
            let stats = {};
            try {
                const sr = await window.electronAPI.getFileStats(paths);
                if (sr && sr.success) stats = sr.data || {};
            } catch (e) { /* 降级无物理状态 */ }

            groups.value = rawGroups.map((arr) => {
                arr.forEach((it) => {
                    const es = entriesArray(it.wb || {});
                    it._keys = new Set(es.flatMap(keysOf));
                    const stat = stats[it.path] || {};
                    const fallback = Number(it._ctime) || 0;
                    it._mtime = stat.mtimeMs || fallback || Date.now();
                    it._dateStr = new Date(it._mtime).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    });
                    it._size = stat.size || ((it.wb && it.wb.size) || 0);
                });

                // 主版本选择(稳定)：本体(文件名无副本/备份尾缀)优先 → 词条多优先 → 修改时间新优先。
                // 🐛 修复:此前仅按词条数+mtime 排序,「完全一致」的副本若 mtime 更新会被选为主版本,组名跟着变成「_副本」
                const baseRank = (it) => {
                    const fn = String(it.fileName || it.name || '').replace(/\.json$/i, '');
                    return (fn && stripCnReplicaTails(fn) === fn) ? 0 : 1;
                };
                arr.sort((a, b) => {
                    const ra = baseRank(a);
                    const rb = baseRank(b);
                    if (ra !== rb) return ra - rb;
                    if (a._entryCount !== b._entryCount) return b._entryCount - a._entryCount;
                    return b._mtime - a._mtime;
                });

                arr.forEach((it, idx) => {
                    if (idx === 0) return;
                    const master = arr[0];
                    const sameStem = !!(master._wbStem && master._wbStem === it._wbStem);
                    const sim = (master._sig && it._sig) ? estimateMinHashSimilarity(master._sig, it._sig) : null;
                    const masterKeys = master._keys || new Set();
                    let overlap = 0;
                    (it._keys || new Set()).forEach((k) => { if (masterKeys.has(k)) overlap++; });
                    const ratio = it._keys && it._keys.size ? Math.round((overlap / it._keys.size) * 100) : 0;
                    it._simPct = sim === null ? null : Math.round(sim * 100);
                    if (sameStem && it._entryCount === master._entryCount && ratio === 100) it._diffInfo = '完全一致';
                    else if (sameStem) it._diffInfo = `同源版本 · 重合 ${ratio}%`;
                    else it._diffInfo = `内容相似 ${it._simPct}%`;
                });
                return { name: arr[0]._wbName, cards: arr };
            });
            pending.value = '';
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

        async function openDiff(gi, ii) {
            const group = groups.value[gi];
            if (!group) return;
            const master = group.cards[0];
            const compare = group.cards[ii];
            if (!master || !compare) return;

            diffMasterName.value = master.name || master.fileName || '未知';
            diffCompareName.value = compare.name || compare.fileName || '未知';
            diffFieldResults.value = [];

            // 🚀 轻量化:比对需要全量数据 → 点击时按需加载(两张卡,用后即弃)
            let mData = {};
            let cData = {};
            if (props.mode !== 'worldbook') {
                const [md, cd] = await Promise.all([loadCardFullData(master), loadCardFullData(compare)]);
                mData = (md && (md.data || md)) || {};
                cData = (cd && (cd.data || cd)) || {};
            }

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

        /**
         * 移入回收站(通用)。返回成功清理的路径数组；全部失败返回 null。
         * 🐛 修复:此前部分/全部失败也返回 ok → 组被误移除但文件还在(假成功)。
         */
        async function doTrash(paths) {
            let res;
            try {
                res = await window.electronAPI.trashFiles(paths);
            } catch (e) {
                res = { success: false, failed: [], error: (e && e.message) || '清理失败' };
            }
            const failedArr = (res && res.failed) || [];
            const failedSet = new Set(failedArr.map((f) => f.path));
            // 优先用桥返回的 okPaths(完整路径,已与入参对齐);兜底按 failed 补集计算
            const okPaths = (res && Array.isArray(res.okPaths) && res.okPaths.length)
                ? res.okPaths.filter((p) => paths.includes(p))
                : paths.filter((p) => !failedSet.has(p));
            if (okPaths.length === 0) {
                const reason = (res && res.error) || (failedArr[0] && failedArr[0].error) || '未知错误';
                showToast(`清理失败：${reason}`);
                return null;
            }
            if (props.mode === 'card') {
                mobileLibrary.library = mobileLibrary.library.filter((c) => !okPaths.includes(c.path));
            } else {
                mobileLibrary.worldbooks = mobileLibrary.worldbooks.filter((w) => !okPaths.includes(w.path));
            }
            const msg = `已清理 ${okPaths.length} 个版本` + (failedSet.size ? `；${failedSet.size} 个失败` : '');
            showToast(msg);
            emit('cleaned', { count: okPaths.length, failed: failedSet.size });
            return okPaths;
        }

        /** 清理单个冗余版本 */
        async function trashOne(gi, ii) {
            const group = groups.value[gi];
            if (!group || busyKey.value) return;
            const target = group.cards[ii];
            if (!target) return;
            busyKey.value = target.path;
            try {
                const okPaths = await doTrash([target.path]);
                if (okPaths && okPaths.length) {
                    const idx = group.cards.findIndex((c) => c.path === target.path);
                    if (idx >= 0) group.cards.splice(idx, 1);
                    if (group.cards.length < 2) groups.value.splice(gi, 1);
                }
            } finally {
                busyKey.value = '';
            }
        }

        /** 一键清理:保留推荐版,其余全部移入回收站(成功哪些移除哪些,失败保留) */
        async function trashRest(gi) {
            const group = groups.value[gi];
            if (!group || busyKey.value) return;
            if (group.cards.length < 2) return;
            const paths = group.cards.slice(1).map((c) => c.path);
            busyKey.value = group.name;
            try {
                const okPaths = await doTrash(paths);
                if (okPaths && okPaths.length) {
                    const okSet = new Set(okPaths);
                    const remaining = group.cards.filter((c) => !okSet.has(c.path));
                    group.cards.splice(0, group.cards.length, ...remaining);
                    if (group.cards.length < 2) groups.value.splice(gi, 1);
                }
            } finally {
                busyKey.value = '';
            }
        }

        watch(() => props.modelValue, (v) => { if (v) runScan(); });
        watch(() => props.mode, () => { if (props.modelValue) runScan(); });
        // 🚀 关闭清理:残留扫描状态/结果/嵌套比对弹窗,重开必得干净状态
        watch(() => props.modelValue, (v) => {
            if (!v) {
                showDiff.value = false;
                busyKey.value = '';
                pending.value = '';
                scanCancelFlag.value = false;
                scanCancelled.value = false;
            }
        });

        /** 取消大库内容指纹扫描(流式水合批间中止,已算签名持久化保留) */
        function cancelScan() {
            scanCancelFlag.value = true;
        }

        return {
            scanning, pending, emptyText, groups, busyKey,
            metaText, trashOne, trashRest, cancelScan, scanCancelled,
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