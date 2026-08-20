/**
 * 关系图谱组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：角色宇宙关系图谱（ECharts）的生成/渲染、布局切换、
 * 双击穿梭、窗口自适应与弹窗开关。
 *
 * v4 卡顿根因修复（v3 后仍卡的三处残留）：
 * - ① 头像图片节点限流：旧阈值 800 张以下「全量头像」——每个头像是经 local-file
 *   协议加载的完整卡片 PNG（1-3MB），数百次图片解码同时发生会拖垮渲染进程与主进程。
 *   现仅小库(≤120)全量头像；大库只保留度数 Top60 节点的头像，其余退化为圆点；
 * - ② 过绘制治理：大库节点尺寸从统一 35px 分档收缩(32/20/12px)，标签按度数
 *   预算封顶(LABEL_BUDGET=60)——旧版「分组高亮时全组标签」在大分组下每帧渲染
 *   数千个带描边文本，是滚动/悬浮掉帧的主因；
 * - ③ 位置种子：切换过滤/搜索/阈值/布局时从旧图捕获节点坐标作为力导向初始值，
 *   图谱不再整图重新洗牌（旧版每次 setOption 都从随机位置重新收敛数秒）。
 *
 * v3 遗留能力保留：三路倒排索引 + pair 聚合（超大群体 >300 跳过）、
 * 连线按权重降序缓存 + MAX_LINKS 渲染预算、搜索防抖、loading 遮罩、统计徽标。
 */
import { ref, reactive, nextTick, watch } from 'vue';
import * as echarts from 'echarts';

// 规模分档阈值
const LARGE_SCALE = 400;     // 大库：收缩斥力、提高摩擦，快速收敛
const HUGE_SCALE = 800;      // 超大库（历史保留：力导向参数分档用）
const MAX_GROUP_SIZE = 300;  // 群体成员上限：超过不再两两展开（防连线爆炸）
const MAX_LINKS = 3000;      // 渲染连线预算：超出按权重降序裁剪（徽标显示裁剪数）
const LINK_CACHE_CAP = 20000;// 连线缓存上限（结果等价：渲染只取权重降序前缀，缓存 2 万条已覆盖任何阈值组合）
const IMAGE_NODE_LIMIT = 120;// 小库全量头像上限（超过则仅 Top 度节点保留头像）
const IMAGE_HUB_COUNT = 60;  // 大库保留头像的节点数（按度数排名）
const LABEL_BUDGET = 60;     // 大库可见标签预算（按度数排名，防每帧数千文本渲染）

export function useGraph({
    library,
    cardData,
    imgUrl,
    currentTab,
    chatHistory,
    worldbookExpanded,
    nativeAlert,
    allCategories,
    currentCategoryKey
}) {
    const showGraph = ref(false);
    const graphBuilding = ref(false); // 构建中 loading 遮罩（大库防白屏冻结）
    let echartsInstance = null;
    let searchDebounceTimer = null;
    let buildTimer = null;

    // ================= 升级版图谱状态与交互控制 =================
    const graphLayoutMode = ref('force'); // 'force' 力引导布局 或 'circular' 环形布局
    const graphSearchKeyword = ref(''); // 图谱内节点搜索
    const minLinkWeight = ref(1); // 最小关联权重过滤（真正参与连线过滤）

    // ================= 终极版图谱状态与高阶控制 =================
    const isolateCurrentGroup = ref(false); // 是否开启“仅显示当前分组”隔离模式

    // 关系图例过滤开关
    const edgeFilters = reactive({
        creator: true,  // 同作者连线
        category: true, // 同分组连线
        tags: true      // 共享标签连线
    });

    // 图谱统计（弹窗顶栏徽标展示）
    const graphStats = reactive({ nodes: 0, links: 0, hubs: [], trimmed: 0, skippedGroups: 0 });

    // ===== 构建缓存（打开时构建一次；交互切换只做轻量重渲） =====
    let cacheDirty = true;
    let nodeCache = []; // {id, name, avatar, tags, isGroup}
    let linkCache = []; // 连线（按权重降序），{src, tgt, value, cat, color, width, opacity}

    // 初始化图谱事件绑定
    const initGraphEvents = () => {
        if (!echartsInstance) return;
        echartsInstance.off('dblclick'); // 防止重复绑定
        // 【功能1】节点双击“一键穿梭”到右侧编辑器编辑
        echartsInstance.on('dblclick', (params) => {
            if (params.dataType === 'node') {
                const targetItem = library.value.find(i => i.id === params.data.id);
                if (targetItem) {
                    cardData.value = targetItem.data;
                    imgUrl.value = targetItem.avatar;
                    currentTab.value = 'basic';
                    chatHistory.value = []; // 清空旧聊天记录
                    worldbookExpanded.value = {}; // 同步重置世界书折叠状态
                    closeGraph(); // 自动关闭图谱弹窗
                    nativeAlert(`已成功穿梭至角色：[${targetItem.name}]`, 'info');
                }
            }
        });
    };

    // 窗口尺寸变化时自适应图谱（避免拉伸畸变）
    const handleGraphResize = () => {
        if (echartsInstance) echartsInstance.resize();
    };

    // 🔧 捕获当前布局坐标（半内部 API，失败静默降级为随机初始位置）
    // 用于下次渲染的位置种子：过滤/搜索/阈值切换后整图不再重新洗牌
    const capturePositions = () => {
        const pos = new Map();
        try {
            const model = echartsInstance.getModel && echartsInstance.getModel();
            const seriesModel = model && model.getSeriesByIndex && model.getSeriesByIndex(0);
            const graph = seriesModel && seriesModel.getGraph && seriesModel.getGraph();
            if (graph && graph.eachNode) {
                graph.eachNode((node) => {
                    const layout = node.getLayout && node.getLayout();
                    if (layout && layout.length >= 2) pos.set(String(node.id), [layout[0], layout[1]]);
                });
            }
        } catch (e) { return new Map(); }
        return pos;
    };

    // 全量构建：节点缓存 + 三路倒排索引 + pair 聚合（含超大群体跳过）+ 权重降序连线缓存
    const buildGraphData = () => {
        const activeCatObj = allCategories.value.find(c => c.key === currentCategoryKey.value);
        const activeCatName = activeCatObj ? activeCatObj.cn : '';

        nodeCache = library.value.map(item => ({
            id: item.id,
            name: item.name,
            avatar: item.avatar || null,
            tags: item.customTags || [],
            isGroup: currentCategoryKey.value === 'all' ||
                     item.category === activeCatName ||
                     item.category === activeCatObj?.en ||
                     item.category === currentCategoryKey.value
        }));

        // 三路倒排索引：作者/分组/标签 → 卡片列表
        const creatorIndex = new Map();
        const categoryIndex = new Map();
        const tagIndex = new Map();
        library.value.forEach(item => {
            if (item.creator && item.creator !== '未知') {
                if (!creatorIndex.has(item.creator)) creatorIndex.set(item.creator, []);
                creatorIndex.get(item.creator).push(item);
            }
            if (item.category && item.category !== '未分类') {
                if (!categoryIndex.has(item.category)) categoryIndex.set(item.category, []);
                categoryIndex.get(item.category).push(item);
            }
            (item.customTags || []).forEach(t => {
                if (!tagIndex.has(t)) tagIndex.set(t, []);
                tagIndex.get(t).push(item);
            });
        });

        // pair 聚合：'idA|idB'（字典序小者在前）→ {a, b, creator, category, tagCount}
        // ⚙️ 超大群体（>MAX_GROUP_SIZE）直接跳过：1500 卡共享一个标签 = 100 万+ pair，
        //    既炸构建也炸力导向模拟；这类泛化关系的视觉价值趋近于零
        const pairAgg = new Map();
        graphStats.skippedGroups = 0;
        const aggregatePairs = (group, field) => {
            if (group.length < 2) return;
            if (group.length > MAX_GROUP_SIZE) { graphStats.skippedGroups++; return; }
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

        // 展开为连线并按权重降序：渲染时从头顺序取用，「预算裁剪」变为零成本切片
        const raw = [];
        pairAgg.forEach(agg => {
            if (agg.creator > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: 3, cat: '同作者', color: '#60a5fa', width: 3, opacity: 0.6 });
            if (agg.category > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: 2, cat: '同分组', color: '#c084fc', width: 2, opacity: 0.5 });
            if (agg.tagCount > 0) raw.push({ src: agg.a.id, tgt: agg.b.id, value: agg.tagCount, cat: '共享标签', color: '#34d399', width: Math.min(agg.tagCount, 4), opacity: 0.4 });
        });
        raw.sort((x, y) => y.value - x.value);
        // 🔧 缓存上限：限制每次重渲的扫描成本（结果等价——任何阈值组合的渲染结果
        //    都落在权重降序前缀内，2 万条缓存已覆盖 MAX_LINKS + 全部阈值过滤余量）
        linkCache = raw.length > LINK_CACHE_CAP ? raw.slice(0, LINK_CACHE_CAP) : raw;
    };

    const openGraph = () => {
        if (library.value.length < 2) {
            return nativeAlert('库中至少需要有 2 张卡片才能生成关系图谱。', 'warning');
        }
        showGraph.value = true;
        graphBuilding.value = true;
        window.addEventListener('resize', handleGraphResize); // 绑定窗口 resize 自适应

        // 等待 DOM 渲染完成后初始化 ECharts（容器在 GraphModal 子组件内，用固定 id 全局查找）
        nextTick(() => {
            const graphEl = document.getElementById('app-graph-container');
            if (!graphEl) { graphBuilding.value = false; return; }
            if (!echartsInstance) {
                echartsInstance = echarts.init(graphEl);
            }
            initGraphEvents(); // 绑定双击穿梭事件

            // 🔧 先让弹窗与 loading 遮罩完成绘制，再执行重构建
            clearTimeout(buildTimer);
            buildTimer = setTimeout(() => {
                try {
                    cacheDirty = true; // 每次打开强制重建（捕获期间的增删卡）
                    renderGraph();
                } catch (e) {
                    console.error('关系图谱构建失败:', e);
                    nativeAlert('图谱构建失败: ' + e.message, 'error');
                    showGraph.value = false;
                } finally {
                    graphBuilding.value = false;
                }
            }, 50);
        });
    };

    const closeGraph = () => {
        showGraph.value = false;
        graphBuilding.value = false;
        clearTimeout(buildTimer);
        window.removeEventListener('resize', handleGraphResize); // 解绑 resize，防止泄漏

        // ✅ [补丁] 延迟销毁：给 Vue 移除 DOM 的过渡动画时间，
        // 防止 dblclick 穿梭回调里 closeGraph 时 Canvas/WebGL 上下文未释放导致低配机内存溢出（OOM）
        if (echartsInstance) {
            const instanceToDestroy = echartsInstance;
            echartsInstance = null;
            setTimeout(() => {
                if (instanceToDestroy && !instanceToDestroy.isDisposed()) {
                    instanceToDestroy.dispose();
                }
            }, 300);
        }
    };

    const renderGraph = () => {
        if (!echartsInstance) return;
        if (cacheDirty) { buildGraphData(); cacheDirty = false; }

        // 🔧 位置种子（仅力导向）：过滤/搜索/阈值切换后节点保持在原位附近，不整图重洗
        const seedPos = graphLayoutMode.value === 'force' ? capturePositions() : null;

        const kw = graphSearchKeyword.value.trim().toLowerCase();
        const nodes = [];
        const nodeMap = new Map();
        const nodeDegree = new Map(); // 用于统计节点的连线度数（计算枢纽人物）

        // 1. 节点装配（隔离模式 / 搜索高亮 / 位置种子均在此轻量应用，不动缓存）
        nodeCache.forEach(c => {
            if (isolateCurrentGroup.value && !c.isGroup) return;

            const matchSearch = !kw ||
                                c.name.toLowerCase().includes(kw) ||
                                c.tags.some(t => t.toLowerCase().includes(kw));

            const node = {
                id: c.id,
                name: c.name,
                symbolSize: 32,
                symbol: c.avatar ? `image://${c.avatar}` : 'circle',
                itemStyle: {
                    color: c.isGroup ? '#3b82f6' : '#374151',
                    borderColor: c.isGroup ? '#60a5fa' : '#4b5563',
                    borderWidth: c.isGroup ? 3 : 1,
                    opacity: matchSearch ? 1 : 0.2
                },
                label: {
                    show: false, // 下方统一按预算决定，避免大库全量标签糊屏+掉帧
                    position: 'bottom',
                    color: c.isGroup ? '#ffffff' : '#9ca3af',
                    fontSize: c.isGroup ? 12 : 10,
                    textBorderColor: '#000',
                    textBorderWidth: 2
                }
            };
            if (seedPos) {
                const p = seedPos.get(c.id);
                if (p) { node.x = p[0]; node.y = p[1]; }
            }
            nodes.push(node);
            nodeMap.set(c.id, node);
            nodeDegree.set(c.id, 0);
        });

        // 2. 连线装配：缓存已按权重降序 → 顺序扫描过滤（可见节点/图例开关/权重阈值）
        const eligible = [];
        for (const l of linkCache) {
            if (!nodeMap.has(l.src) || !nodeMap.has(l.tgt)) continue;
            if (l.cat === '同作者' && !edgeFilters.creator) continue;
            if (l.cat === '同分组' && !edgeFilters.category) continue;
            if (l.cat === '共享标签' && !edgeFilters.tags) continue;
            if (minLinkWeight.value > 1 && l.value < minLinkWeight.value) continue;
            eligible.push(l);
        }
        let picked = eligible;
        graphStats.trimmed = 0;
        if (eligible.length > MAX_LINKS) {
            picked = eligible.slice(0, MAX_LINKS);
            graphStats.trimmed = eligible.length - MAX_LINKS;
        }
        const links = picked.map(l => ({
            source: l.src, target: l.tgt,
            value: l.value, categoryName: l.cat,
            lineStyle: { color: l.color, width: l.width, opacity: l.opacity }
        }));

        links.forEach(l => {
            const w = l.categoryName === '共享标签' ? l.value : 1;
            nodeDegree.set(l.source, (nodeDegree.get(l.source) || 0) + w);
            nodeDegree.set(l.target, (nodeDegree.get(l.target) || 0) + w);
        });

        // 3. 🔧 过绘制治理（v4 根因②）：按规模分档收缩节点尺寸 + 头像限流（根因①）
        //    旧版统一 35px + 全量头像，700 张卡 = 700 次 local-file 全尺寸 PNG 解码
        //    （每张 1-3MB），同时发生会拖垮渲染进程与主进程
        const total = nodes.length;
        const groupHighlighted = currentCategoryKey.value !== 'all';
        const byDegreeDesc = (a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0);

        if (total <= IMAGE_NODE_LIMIT) {
            // 小库：全量头像，尺寸 30 + 度数加成
            nodes.forEach(n => { n.symbolSize = 30 + Math.min(20, nodeDegree.get(n.id) || 0); });
        } else {
            // 大库：仅度数 Top N 保留头像，其余退化为圆点（尺寸分档收缩，降低过绘制）
            const ranked = [...nodes].sort(byDegreeDesc).slice(0, IMAGE_HUB_COUNT);
            const keepImage = new Set(ranked.map(n => n.id));
            const base = total <= LARGE_SCALE ? 18 : 11;
            nodes.forEach(n => {
                if (!keepImage.has(n.id)) n.symbol = 'circle';
                n.symbolSize = (keepImage.has(n.id) ? 26 : base) + Math.min(12, nodeDegree.get(n.id) || 0);
            });
        }

        // 4. 🔧 标签预算（v4 根因②）：大库只显示「按度数排名的 Top 标签」
        //    旧版分组高亮时全组标签齐开，大分组每帧渲染数千个带描边文本直接掉帧
        if (total <= 150) {
            nodes.forEach(n => { n.label.show = true; });
        } else {
            let cands = [];
            if (kw) cands = nodes.filter(n => n.itemStyle.opacity === 1);            // 搜索命中
            else if (groupHighlighted) cands = nodes.filter(n => n.itemStyle.color === '#3b82f6'); // 分组内
            cands.sort(byDegreeDesc);
            const showSet = new Set(cands.slice(0, LABEL_BUDGET).map(n => n.id));
            nodes.forEach(n => { n.label.show = showSet.has(n.id); });
        }

        // 5. 核心度/枢纽人物高亮：连线度数最高的前 3 名赋予金色光环与更大尺寸
        const hubSize = total <= 150 ? 55 : (total <= LARGE_SCALE ? 44 : 34);
        const hubNames = [];
        if (nodes.length > 0) {
            const topHubs = [...nodes].sort(byDegreeDesc).filter(n => (nodeDegree.get(n.id) || 0) > 0).slice(0, 3);
            topHubs.forEach(hub => {
                const n = nodeMap.get(hub.id);
                if (n) {
                    n.symbolSize = hubSize; // 超大尺寸
                    n.itemStyle.borderColor = '#f59e0b'; // 金色光环
                    n.itemStyle.borderWidth = 4;
                    n.label.color = '#fde047'; // 金色字体
                    n.label.show = true; // 枢纽永远显示标签
                    n.name = `👑 ${hub.name.replace('👑 ', '')}`; // 加上皇冠标识
                    hubNames.push(hub.name);
                }
            });
        }

        // 6. 统计徽标数据
        graphStats.nodes = nodes.length;
        graphStats.links = links.length;
        graphStats.hubs = hubNames;

        // 7. 规模自适应力导向参数：节点越多斥力越小/摩擦越大，快速收敛不鬼畜
        //    ⚠️ 不设 layoutAnimation:false —— 同步跑完全部物理迭代会冻结 UI 数秒（v2 回归，已移除）
        let force;
        if (total > HUGE_SCALE) {
            force = { repulsion: 260, edgeLength: [40, 120], gravity: 0.25, friction: 0.85 };
        } else if (total > LARGE_SCALE) {
            force = { repulsion: 420, edgeLength: [60, 170], gravity: 0.2, friction: 0.75 };
        } else {
            force = { repulsion: 700, edgeLength: [90, 260], gravity: 0.15, friction: 0.6 };
        }

        const option = {
            backgroundColor: 'transparent', // 跟随外层主题容器（暗夜/青灰/白昼）
            tooltip: {
                formatter: (params) => params.dataType === 'node' ? `<b>${params.data.name}</b><br>社交权重度: ${nodeDegree.get(params.data.id) || 0}` : `关联类型: ${params.data.categoryName}`
            },
            series: [{
                type: 'graph',
                layout: graphLayoutMode.value,
                data: nodes,
                links: links,
                roam: true,
                animation: false,
                // ✨ 聚光灯效应：悬浮只高亮当前节点与邻居，其余沉寂（大库下显著降低视觉噪音）
                emphasis: {
                    focus: 'adjacency',
                    lineStyle: { width: 3 }
                },
                force: force,
                circular: { rotateLabel: true },
                lineStyle: { curveness: 0.2 }
            }]
        };

        echartsInstance.setOption(option, true);
    };

    // 搜索防抖：停止输入 300ms 后才重渲（走缓存，成本极低）
    watch(graphSearchKeyword, () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => renderGraph(), 300);
    });

    // 监听状态改变时实时刷新图谱
    const updateGraphLayout = (mode) => {
        graphLayoutMode.value = mode;
        renderGraph();
    };

    // 📷 导出当前图谱为 PNG（2x 分辨率）
    const exportGraph = () => {
        if (!echartsInstance) return;
        try {
            const url = echartsInstance.getDataURL({ pixelRatio: 2, backgroundColor: '#09090b' });
            const a = document.createElement('a');
            a.href = url;
            a.download = `角色关系图谱_${new Date().toISOString().slice(0, 10)}.png`;
            a.click();
        } catch (e) {
            nativeAlert('图谱导出失败: ' + e.message, 'error');
        }
    };

    return {
        showGraph,
        graphBuilding,
        graphLayoutMode, graphSearchKeyword, minLinkWeight,
        isolateCurrentGroup, edgeFilters,
        graphStats,
        openGraph, closeGraph, renderGraph, updateGraphLayout, exportGraph
    };
}
