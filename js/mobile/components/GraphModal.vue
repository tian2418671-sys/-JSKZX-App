<!--
  GraphModal 移动端角色宇宙关系图谱（全屏覆盖层 + ECharts）
  自包含构建：三路倒排索引(同作者/同分组/共享标签) + pair 聚合 + 权重降序连线
  适配移动端数据源：卡片标签取自 data.data.tags（customTags 移动端未维护）
  节点双击 → emit('jump', path) 跳卡片详情；节点为纯圆点(不加载头像,移动端性能考量)
-->
<template>
    <div v-if="show" class="gm-overlay">
        <div class="gm-toolbar">
            <div class="gm-title-row">
                <span class="gm-title">🌌 角色宇宙图谱</span>
                <van-icon name="cross" size="20" color="#fff" @click="$emit('close')" />
            </div>
            <div class="gm-stats">
                <span class="gm-badge">节点 {{ stats.nodes }}</span>
                <span class="gm-badge">连线 {{ stats.links }}</span>
                <span v-if="stats.hubs.length" class="gm-badge gm-badge-hub">👑 {{ stats.hubs.length }} 枢纽</span>
            </div>
            <div class="gm-controls">
                <div class="gm-layout">
                    <van-button size="mini" :type="layout === 'force' ? 'primary' : 'default'" @click="setLayout('force')">网状</van-button>
                    <van-button size="mini" :type="layout === 'circular' ? 'primary' : 'default'" @click="setLayout('circular')">环形</van-button>
                </div>
                <van-field
                    v-model="keyword"
                    placeholder="高亮搜索"
                    size="small"
                    class="gm-search"
                    clearable
                />
            </div>
            <div class="gm-legend">
                <van-checkbox v-model="filters.creator" icon-size="14px" @change="render">同作者</van-checkbox>
                <van-checkbox v-model="filters.category" icon-size="14px" @change="render">同分组</van-checkbox>
                <van-checkbox v-model="filters.tags" icon-size="14px" @change="render">共享标签</van-checkbox>
            </div>
        </div>
        <div class="gm-body">
            <div id="mobile-graph-container" class="gm-chart"></div>
            <div v-if="building" class="gm-building">
                <van-loading size="24" color="#06b6d4">图谱构建中…</van-loading>
            </div>
            <div class="gm-tip">双击节点打开卡片 · 单指拖拽 · 双指缩放</div>
        </div>
    </div>
</template>

<script>
import { ref, reactive, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

const MAX_GROUP_SIZE = 300;   // 超大群体跳过(防连线爆炸)
const MAX_LINKS = 1500;       // 移动端连线预算(性能上限)

export default {
    name: 'GraphModal',
    props: {
        show: { type: Boolean, default: false },
        library: { type: Array, default: () => [] }
    },
    emits: ['close', 'jump'],
    setup(props, { emit }) {
        const layout = ref('force');
        const keyword = ref('');
        const building = ref(false);
        const filters = reactive({ creator: true, category: true, tags: true });
        const stats = reactive({ nodes: 0, links: 0, hubs: [] });
        let chart = null;
        let nodeCache = [];
        let linkCache = [];
        let debounceTimer = null;

        // 标签提取:移动端卡片标签在 data.data.tags(数组)
        const cardTags = (item) => {
            const dd = (item.data && item.data.data) || {};
            const t = dd.tags;
            return Array.isArray(t) ? t.map(x => String(x).trim()).filter(Boolean) : [];
        };
        const cardCreator = (item) => item.creator && item.creator !== '未知' ? item.creator : null;
        const cardCategory = (item) => item.category && item.category !== '未分类' ? item.category : null;

        // 构建:节点缓存 + 三路倒排索引 + pair 聚合 + 权重降序连线
        function buildGraphData() {
            const lib = props.library || [];
            nodeCache = lib.map((item) => ({
                id: item.path,
                name: item.name || '未命名',
                tags: cardTags(item),
                creator: cardCreator(item),
                category: cardCategory(item)
            }));

            const creatorIndex = new Map();
            const categoryIndex = new Map();
            const tagIndex = new Map();
            nodeCache.forEach((c, i) => {
                if (c.creator) {
                    if (!creatorIndex.has(c.creator)) creatorIndex.set(c.creator, []);
                    creatorIndex.get(c.creator).push(i);
                }
                if (c.category) {
                    if (!categoryIndex.has(c.category)) categoryIndex.set(c.category, []);
                    categoryIndex.get(c.category).push(i);
                }
                c.tags.forEach((t) => {
                    if (!tagIndex.has(t)) tagIndex.set(t, []);
                    tagIndex.get(t).push(i);
                });
            });

            const pairAgg = new Map();
            const aggregate = (group, field) => {
                if (group.length < 2) return;
                if (group.length > MAX_GROUP_SIZE) return; // 超大群体跳过
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        const a = group[i], b = group[j];
                        const key = a < b ? a + '|' + b : b + '|' + a;
                        let agg = pairAgg.get(key);
                        if (!agg) { agg = { a, b, creator: 0, category: 0, tagCount: 0 }; pairAgg.set(key, agg); }
                        agg[field]++;
                    }
                }
            };
            creatorIndex.forEach((g) => aggregate(g, 'creator'));
            categoryIndex.forEach((g) => aggregate(g, 'category'));
            tagIndex.forEach((g) => aggregate(g, 'tagCount'));

            const raw = [];
            pairAgg.forEach((agg) => {
                if (agg.creator > 0) raw.push({ a: agg.a, b: agg.b, value: 3, cat: '同作者', color: '#60a5fa', width: 3, opacity: 0.6 });
                if (agg.category > 0) raw.push({ a: agg.a, b: agg.b, value: 2, cat: '同分组', color: '#c084fc', width: 2, opacity: 0.5 });
                if (agg.tagCount > 0) raw.push({ a: agg.a, b: agg.b, value: agg.tagCount, cat: '共享标签', color: '#34d399', width: Math.min(agg.tagCount, 3), opacity: 0.4 });
            });
            raw.sort((x, y) => y.value - x.value);
            linkCache = raw.slice(0, 20000);
        }

        function render() {
            if (!chart) return;
            const kw = keyword.value.trim().toLowerCase();
            const nodes = [];
            const nodeMap = new Map();
            const nodeDegree = new Map();

            nodeCache.forEach((c) => {
                const match = !kw || c.name.toLowerCase().includes(kw) || c.tags.some((t) => t.toLowerCase().includes(kw));
                const node = {
                    id: c.id,
                    name: c.name,
                    symbolSize: 22,
                    itemStyle: { color: '#3b82f6', borderColor: '#60a5fa', borderWidth: 2, opacity: match ? 1 : 0.2 },
                    label: { show: false, position: 'bottom', color: '#e5e7eb', fontSize: 10 }
                };
                nodes.push(node);
                nodeMap.set(c.id, node);
                nodeDegree.set(c.id, 0);
            });

            const eligible = [];
            for (const l of linkCache) {
                if (!nodeMap.has(nodeCache[l.a]?.id) || !nodeMap.has(nodeCache[l.b]?.id)) continue;
                if (l.cat === '同作者' && !filters.creator) continue;
                if (l.cat === '同分组' && !filters.category) continue;
                if (l.cat === '共享标签' && !filters.tags) continue;
                eligible.push(l);
            }
            const picked = eligible.slice(0, MAX_LINKS);
            const links = picked.map((l) => ({
                source: nodeCache[l.a].id,
                target: nodeCache[l.b].id,
                value: l.value,
                categoryName: l.cat,
                lineStyle: { color: l.color, width: l.width, opacity: l.opacity }
            }));
            links.forEach((l) => {
                nodeDegree.set(l.source, (nodeDegree.get(l.source) || 0) + (l.categoryName === '共享标签' ? l.value : 1));
                nodeDegree.set(l.target, (nodeDegree.get(l.target) || 0) + (l.categoryName === '共享标签' ? l.value : 1));
            });

            // 度数加成尺寸 + 标签显示
            nodes.forEach((n) => { n.symbolSize = 22 + Math.min(18, nodeDegree.get(n.id) || 0); });
            const total = nodes.length;
            if (total <= 120) {
                nodes.forEach((n) => { n.label.show = true; });
            } else {
                const ranked = [...nodes].sort((a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0)).slice(0, 60);
                const showSet = new Set(ranked.map((n) => n.id));
                nodes.forEach((n) => { n.label.show = showSet.has(n.id); });
            }

            // 枢纽高亮
            const hubNames = [];
            const topHubs = [...nodes].filter((n) => (nodeDegree.get(n.id) || 0) > 0).sort((a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0)).slice(0, 3);
            topHubs.forEach((h) => {
                const n = nodeMap.get(h.id);
                if (n) {
                    n.symbolSize = 46;
                    n.itemStyle.borderColor = '#f59e0b';
                    n.itemStyle.borderWidth = 4;
                    n.label.show = true;
                    n.label.color = '#fde047';
                    n.name = `👑 ${n.name.replace('👑 ', '')}`;
                    hubNames.push(n.name);
                }
            });

            stats.nodes = nodes.length;
            stats.links = links.length;
            stats.hubs = hubNames;

            const force = total > 400
                ? { repulsion: 420, edgeLength: [60, 170], gravity: 0.2, friction: 0.75 }
                : { repulsion: 700, edgeLength: [90, 260], gravity: 0.15, friction: 0.6 };

            chart.setOption({
                backgroundColor: 'transparent',
                tooltip: { formatter: (p) => p.dataType === 'node' ? `<b>${p.data.name}</b><br>关联权重: ${nodeDegree.get(p.data.id) || 0}` : `关联: ${p.data.categoryName}` },
                series: [{
                    type: 'graph',
                    layout: layout.value,
                    data: nodes,
                    links,
                    roam: true,
                    animation: false,
                    emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
                    force,
                    circular: { rotateLabel: true },
                    lineStyle: { curveness: 0.2 }
                }]
            }, true);
        }

        function setLayout(mode) {
            layout.value = mode;
            render();
        }

        function initChart() {
            const el = document.getElementById('mobile-graph-container');
            if (!el) return;
            if (!chart) chart = echarts.init(el);
            chart.off('dblclick');
            chart.on('dblclick', (p) => {
                if (p.dataType === 'node' && p.data && p.data.id) {
                    emit('jump', p.data.id);
                    emit('close');
                }
            });
            buildGraphData();
            render();
        }

        watch(() => props.show, (v) => {
            if (v) {
                building.value = true;
                nextTick(() => {
                    setTimeout(() => {
                        try { initChart(); } catch (e) { console.error('图谱构建失败:', e); } finally { building.value = false; }
                    }, 50);
                });
            } else {
                building.value = false;
                if (chart) { const c = chart; chart = null; setTimeout(() => { if (c && !c.isDisposed()) c.dispose(); }, 300); }
            }
        });

        watch(keyword, () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => render(), 300);
        });

        return { layout, keyword, building, filters, stats, render, setLayout };
    }
};
</script>

<style scoped>
.gm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #0f172a;
    display: flex;
    flex-direction: column;
}
.gm-toolbar {
    flex-shrink: 0;
    padding: 10px 12px;
    background: #0b1220;
    border-bottom: 1px solid #1e293b;
}
.gm-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.gm-title { font-size: 16px; font-weight: bold; color: #fff; }
.gm-stats { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.gm-badge {
    font-size: 11px;
    color: #cbd5e1;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 2px 8px;
}
.gm-badge-hub { color: #fbbf24; border-color: #92400e; background: #451a03; }
.gm-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.gm-layout { display: flex; gap: 6px; }
.gm-search { flex: 1; min-width: 0; padding: 0; }
.gm-search :deep(.van-field__control) { color: #fff; }
.gm-legend { display: flex; gap: 12px; font-size: 12px; color: #cbd5e1; }
.gm-legend :deep(.van-checkbox__label) { color: #cbd5e1; font-size: 12px; }
.gm-body { flex: 1; min-height: 0; position: relative; }
.gm-chart { width: 100%; height: 100%; }
.gm-building {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(15, 23, 42, 0.8);
}
.gm-tip {
    position: absolute; bottom: 8px; left: 0; right: 0;
    text-align: center; font-size: 10px; color: #64748b;
    pointer-events: none;
}
</style>
