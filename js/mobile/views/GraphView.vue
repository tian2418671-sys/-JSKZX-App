<!--
  GraphView 移动端关系图谱（阶段 4.3）
  复用桌面 useGraph.js 核心算法：三路倒排索引(作者/分组/标签) → pair 聚合 → 连线权重降序
  ECharts 力导向渲染，点节点跳详情。大库性能优化：节点尺寸分档、头像限流、标签预算。
-->
<template>
    <div class="graph-page">
        <van-nav-bar title="关系图谱" left-arrow @click-left="$router.back()" safe-area-inset-top>
            <template #right>
                <van-icon name="expand-o" size="20" @click="exportPng" />
            </template>
        </van-nav-bar>

        <div class="graph-controls">
            <van-search v-model="keyword" placeholder="搜索节点…" shape="round" class="graph-search" />
            <div class="filter-row">
                <van-tag :type="edgeFilters.creator ? 'primary' : 'default'" round size="medium" @click="edgeFilters.creator = !edgeFilters.creator">同作者</van-tag>
                <van-tag :type="edgeFilters.category ? 'primary' : 'default'" round size="medium" @click="edgeFilters.category = !edgeFilters.category">同分组</van-tag>
                <van-tag :type="edgeFilters.tags ? 'primary' : 'default'" round size="medium" @click="edgeFilters.tags = !edgeFilters.tags">共享标签</van-tag>
                <van-tag round size="medium" plain @click="toggleLayout">{{ layoutMode === 'force' ? '🔁 环形' : '💥 力导向' }}</van-tag>
            </div>
            <div class="stats-bar" v-if="stats.nodes > 0">
                <span>{{ stats.nodes }} 节点</span>
                <span>{{ stats.links }} 连线</span>
                <span v-if="stats.hubs.length" class="hub-info">👑 {{ stats.hubs.join(' · ') }}</span>
            </div>
        </div>

        <div class="graph-canvas-wrap">
            <van-loading v-if="building" size="28" class="graph-loading" vertical>构建图谱中…</van-loading>
            <div ref="canvasEl" class="graph-canvas"></div>
        </div>
    </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { mobileLibrary } from '../useMobileLibrary';

// 规模分档阈值（与桌面 useGraph.js 对齐）
const LARGE_SCALE = 400;
const HUGE_SCALE = 800;
const MAX_GROUP_SIZE = 300;
const MAX_LINKS = 3000;
const IMAGE_NODE_LIMIT = 120;
const IMAGE_HUB_COUNT = 60;
const LABEL_BUDGET = 60;

export default {
    name: 'GraphView',
    setup() {
        const router = useRouter();
        const canvasEl = ref(null);
        const building = ref(true);
        const keyword = ref('');
        const layoutMode = ref('force');
        const edgeFilters = reactive({ creator: true, category: true, tags: true });
        const stats = reactive({ nodes: 0, links: 0, hubs: [] });

        let echartsInstance = null;
        let nodeCache = [];
        let linkCache = [];
        let searchTimer = null;

        function buildData() {
            const lib = mobileLibrary.library;
            nodeCache = lib.map(item => ({
                id: item.id || item.path,
                name: item.name || '未知',
                avatar: item.avatar || null,
                tags: item.customTags || item.data?.data?.tags || [],
                category: item.category || item.subFolder || '未分类',
                creator: item.creator || (item.data?.data?.creator) || '未知',
                path: item.path
            }));

            // 三路倒排索引
            const creatorIndex = new Map();
            const categoryIndex = new Map();
            const tagIndex = new Map();
            nodeCache.forEach(item => {
                if (item.creator && item.creator !== '未知') {
                    if (!creatorIndex.has(item.creator)) creatorIndex.set(item.creator, []);
                    creatorIndex.get(item.creator).push(item);
                }
                if (item.category && item.category !== '未分类') {
                    if (!categoryIndex.has(item.category)) categoryIndex.set(item.category, []);
                    categoryIndex.get(item.category).push(item);
                }
                (item.tags || []).forEach(t => {
                    if (!tagIndex.has(t)) tagIndex.set(t, []);
                    tagIndex.get(t).push(item);
                });
            });

            // pair 聚合
            const pairAgg = new Map();
            const aggregatePairs = (group, field) => {
                if (group.length < 2) return;
                if (group.length > MAX_GROUP_SIZE) return;
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        const a = group[i], b = group[j];
                        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
                        let agg = pairAgg.get(key);
                        if (!agg) { agg = { a, b, creator: 0, category: 0, tagCount: 0 }; pairAgg.set(key, agg); }
                        agg[field]++;
                    }
                }
            };
            creatorIndex.forEach(g => aggregatePairs(g, 'creator'));
            categoryIndex.forEach(g => aggregatePairs(g, 'category'));
            tagIndex.forEach(g => aggregatePairs(g, 'tagCount'));

            const raw = [];
            pairAgg.forEach(agg => {
                if (agg.creator > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: 3, cat: '同作者', color: '#60a5fa', width: 3, opacity: 0.6 });
                if (agg.category > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: 2, cat: '同分组', color: '#c084fc', width: 2, opacity: 0.5 });
                if (agg.tagCount > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: agg.tagCount, cat: '共享标签', color: '#34d399', width: Math.min(agg.tagCount, 4), opacity: 0.4 });
            });
            raw.sort((x, y) => y.value - x.value);
            linkCache = raw;
        }

        function renderGraph() {
            if (!echartsInstance) return;
            const kw = keyword.value.trim().toLowerCase();
            const nodes = [];
            const nodeMap = new Map();
            const nodeDegree = new Map();

            nodeCache.forEach(c => {
                const matchSearch = !kw || c.name.toLowerCase().includes(kw) || (c.tags || []).some(t => t.toLowerCase().includes(kw));
                const node = {
                    id: c.id,
                    name: c.name,
                    symbolSize: 32,
                    symbol: c.avatar ? `image://${c.avatar}` : 'circle',
                    itemStyle: { color: '#374151', borderColor: '#4b5563', borderWidth: 1, opacity: matchSearch ? 1 : 0.15 },
                    label: { show: false, position: 'bottom', color: '#9ca3af', fontSize: 10, textBorderColor: '#000', textBorderWidth: 2 },
                    path: c.path
                };
                nodes.push(node);
                nodeMap.set(c.id, node);
                nodeDegree.set(c.id, 0);
            });

            // 连线装配
            const eligible = [];
            for (const l of linkCache) {
                if (!nodeMap.has(l.src) || !nodeMap.has(l.tgt)) continue;
                if (l.cat === '同作者' && !edgeFilters.creator) continue;
                if (l.cat === '同分组' && !edgeFilters.category) continue;
                if (l.cat === '共享标签' && !edgeFilters.tags) continue;
                eligible.push(l);
            }
            let picked = eligible;
            if (eligible.length > MAX_LINKS) picked = eligible.slice(0, MAX_LINKS);
            const links = picked.map(l => ({
                source: l.src, target: l.tgt, value: l.value, categoryName: l.cat,
                lineStyle: { color: l.color, width: l.width, opacity: l.opacity }
            }));

            links.forEach(l => {
                const w = l.categoryName === '共享标签' ? l.value : 1;
                nodeDegree.set(l.source, (nodeDegree.get(l.source) || 0) + w);
                nodeDegree.set(l.target, (nodeDegree.get(l.target) || 0) + w);
            });

            // 规模分档
            const total = nodes.length;
            const byDegreeDesc = (a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0);
            if (total <= IMAGE_NODE_LIMIT) {
                nodes.forEach(n => { n.symbolSize = 30 + Math.min(20, nodeDegree.get(n.id) || 0); });
            } else {
                const ranked = [...nodes].sort(byDegreeDesc).slice(0, IMAGE_HUB_COUNT);
                const keepImage = new Set(ranked.map(n => n.id));
                const base = total <= LARGE_SCALE ? 18 : 11;
                nodes.forEach(n => {
                    if (!keepImage.has(n.id)) n.symbol = 'circle';
                    n.symbolSize = (keepImage.has(n.id) ? 26 : base) + Math.min(12, nodeDegree.get(n.id) || 0);
                });
            }

            // 标签预算
            if (total <= 150) {
                nodes.forEach(n => { n.label.show = true; });
            } else {
                let cands = kw ? nodes.filter(n => n.itemStyle.opacity === 1) : [];
                cands.sort(byDegreeDesc);
                const showSet = new Set(cands.slice(0, LABEL_BUDGET).map(n => n.id));
                nodes.forEach(n => { n.label.show = showSet.has(n.id); });
            }

            // 枢纽高亮
            const hubSize = total <= 150 ? 55 : (total <= LARGE_SCALE ? 44 : 34);
            const hubNames = [];
            const topHubs = [...nodes].sort(byDegreeDesc).filter(n => (nodeDegree.get(n.id) || 0) > 0).slice(0, 3);
            topHubs.forEach(hub => {
                const n = nodeMap.get(hub.id);
                if (n) {
                    n.symbolSize = hubSize;
                    n.itemStyle.borderColor = '#f59e0b';
                    n.itemStyle.borderWidth = 4;
                    n.label.color = '#fde047';
                    n.label.show = true;
                    n.name = `👑 ${n.name.replace('👑 ', '')}`;
                    hubNames.push(n.name.replace('👑 ', ''));
                }
            });

            stats.nodes = nodes.length;
            stats.links = links.length;
            stats.hubs = hubNames;

            let force;
            if (total > HUGE_SCALE) force = { repulsion: 260, edgeLength: [40, 120], gravity: 0.25, friction: 0.85 };
            else if (total > LARGE_SCALE) force = { repulsion: 420, edgeLength: [60, 170], gravity: 0.2, friction: 0.75 };
            else force = { repulsion: 700, edgeLength: [90, 260], gravity: 0.15, friction: 0.6 };

            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    formatter: (p) => p.dataType === 'node'
                        ? `<b>${p.data.name}</b><br>社交权重: ${nodeDegree.get(p.data.id) || 0}`
                        : `关联: ${p.data.categoryName}`
                },
                series: [{
                    type: 'graph',
                    layout: layoutMode.value,
                    data: nodes,
                    links: links,
                    roam: true,
                    animation: false,
                    emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
                    force: force,
                    circular: { rotateLabel: true },
                    lineStyle: { curveness: 0.2 }
                }]
            };
            echartsInstance.setOption(option, true);

            // 节点点击 → 跳转详情
            echartsInstance.off('click');
            echartsInstance.on('click', (params) => {
                if (params.dataType === 'node' && params.data.path) {
                    const targetItem = mobileLibrary.library.find(i => i.path === params.data.path);
                    if (targetItem) {
                        router.push({ path: '/card', query: { id: targetItem.id || targetItem.path } });
                    }
                }
            });
        }

        function toggleLayout() {
            layoutMode.value = layoutMode.value === 'force' ? 'circular' : 'force';
            renderGraph();
        }

        function exportPng() {
            if (!echartsInstance) return;
            try {
                const url = echartsInstance.getDataURL({ pixelRatio: 2, backgroundColor: '#09090b' });
                const a = document.createElement('a');
                a.href = url;
                a.download = `角色关系图谱_${new Date().toISOString().slice(0, 10)}.png`;
                a.click();
            } catch (e) { /* 静默 */ }
        }

        function handleResize() { if (echartsInstance) echartsInstance.resize(); }

        // 搜索防抖
        watch(keyword, () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => renderGraph(), 300);
        });
        watch(edgeFilters, () => renderGraph(), { deep: true });

        onMounted(() => {
            if (mobileLibrary.library.length < 2) {
                building.value = false;
                return;
            }
            nextTick(() => {
                if (!canvasEl.value) { building.value = false; return; }
                echartsInstance = echarts.init(canvasEl.value);
                try {
                    buildData();
                    renderGraph();
                } catch (e) {
                    console.error('图谱构建失败:', e);
                } finally {
                    building.value = false;
                }
            });
            window.addEventListener('resize', handleResize);
        });

        onUnmounted(() => {
            window.removeEventListener('resize', handleResize);
            if (echartsInstance) {
                echartsInstance.dispose();
                echartsInstance = null;
            }
        });

        return {
            canvasEl, building, keyword, layoutMode, edgeFilters, stats,
            toggleLayout, exportPng
        };
    }
};
</script>

<style scoped>
.graph-page { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.graph-controls { padding: 4px 12px 6px; flex-shrink: 0; }
.graph-search { padding: 0; }
.filter-row { display: flex; gap: 6px; padding: 6px 0 4px; overflow-x: auto; flex-wrap: wrap; }
.filter-row .van-tag { cursor: pointer; flex-shrink: 0; }
.stats-bar { display: flex; gap: 12px; font-size: 11px; color: var(--van-text-color-2); padding: 2px 0; flex-wrap: wrap; }
.hub-info { color: #f59e0b; }
.graph-canvas-wrap { flex: 1; min-height: 0; position: relative; }
.graph-canvas { width: 100%; height: 100%; }
.graph-loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
</style>
