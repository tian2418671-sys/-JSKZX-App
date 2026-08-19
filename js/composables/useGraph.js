/**
 * 关系图谱组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：角色宇宙关系图谱（ECharts）的生成/渲染、布局切换、
 * 双击穿梭、窗口自适应与弹窗开关。
 * 共享响应式状态（library / cardData / imgUrl / currentTab / chatHistory / worldbookExpanded /
 * allCategories / currentCategoryKey）与 nativeAlert 保留在 App.vue 顶层并注入，其余状态与方法在此定义。
 */
import { ref, reactive, nextTick } from 'vue';
import * as echarts from 'echarts';

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
    let echartsInstance = null;

    // ================= 升级版图谱状态与交互控制 =================
    const graphLayoutMode = ref('force'); // 'force' 力引导布局 或 'circular' 环形布局
    const graphSearchKeyword = ref(''); // 图谱内节点搜索
    const minLinkWeight = ref(1); // 最小关联权重过滤（解决卡片多时的卡顿与视觉杂乱）

    // ================= 终极版图谱状态与高阶控制 =================
    const isolateCurrentGroup = ref(false); // 是否开启“仅显示当前分组”隔离模式

    // 关系图例过滤开关
    const edgeFilters = reactive({
        creator: true,  // 同作者连线
        category: true, // 同分组连线
        tags: true      // 共享标签连线
    });

    // 初始化图谱事件绑定（只需在 echarts 实例初始化后执行一次或在 openGraph 里绑定）
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

    const openGraph = () => {
        if (library.value.length < 2) {
            return nativeAlert('库中至少需要有 2 张卡片才能生成关系图谱。', 'warning');
        }
        showGraph.value = true;
        window.addEventListener('resize', handleGraphResize); // 绑定窗口 resize 自适应

        // 等待 DOM 渲染完成后初始化 ECharts（容器在 GraphModal 子组件内，用固定 id 全局查找）
        nextTick(() => {
            const graphEl = document.getElementById('app-graph-container');
            if (!graphEl) return;
            if (!echartsInstance) {
                echartsInstance = echarts.init(graphEl);
            }
            initGraphEvents(); // 绑定双击穿梭事件
            renderGraph();
        });
    };

    const closeGraph = () => {
        showGraph.value = false;
        window.removeEventListener('resize', handleGraphResize); // 解绑 resize，防止泄漏

        // ✅ [补丁] 加入延迟销毁：给 Vue 移除 DOM 的过渡动画时间，
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

        const nodes = [];
        const links = [];
        const nodeMap = new Map();
        const nodeDegree = new Map(); // 用于统计节点的连线度数（计算枢纽人物）

        const activeCatObj = allCategories.value.find(c => c.key === currentCategoryKey.value);
        const activeCatName = activeCatObj ? activeCatObj.cn : '';

        // 1. 预处理节点
        library.value.forEach(item => {
            const tags = item.customTags || [];
            const isCurrentGroup = currentCategoryKey.value === 'all' || 
                                   item.category === activeCatName || 
                                   item.category === activeCatObj?.en ||
                                   item.category === currentCategoryKey.value;

            // 【功能2】如果开启了“仅显示当前分组”，非本组节点直接跳过不渲染
            if (isolateCurrentGroup.value && !isCurrentGroup) return;

            const matchSearch = !graphSearchKeyword.value || 
                                item.name.toLowerCase().includes(graphSearchKeyword.value.toLowerCase()) ||
                                tags.some(t => t.toLowerCase().includes(graphSearchKeyword.value.toLowerCase()));

            const node = {
                id: item.id,
                name: item.name,
                symbolSize: 35,
                symbol: item.avatar ? `image://${item.avatar}` : 'circle',
                itemStyle: {
                    color: isCurrentGroup ? '#3b82f6' : '#374151',
                    borderColor: isCurrentGroup ? '#60a5fa' : '#4b5563',
                    borderWidth: isCurrentGroup ? 3 : 1,
                    opacity: matchSearch ? 1 : 0.2
                },
                label: { 
                    show: isCurrentGroup || matchSearch, 
                    position: 'bottom', 
                    color: isCurrentGroup ? '#ffffff' : '#9ca3af', 
                    fontSize: isCurrentGroup ? 12 : 10,
                    textBorderColor: '#000', 
                    textBorderWidth: 2 
                }
            };
            nodes.push(node);
            nodeMap.set(item.id, node);
            nodeDegree.set(item.id, 0);
        });

        // 2. 构建连线与分类过滤
        for (let i = 0; i < library.value.length; i++) {
            for (let j = i + 1; j < library.value.length; j++) {
                const cardA = library.value[i];
                const cardB = library.value[j];

                // 如果节点因为隔离模式被过滤掉了，不处理其连线
                if (!nodeMap.has(cardA.id) || !nodeMap.has(cardB.id)) continue;

                // 分别计算不同维度的关联
                const isSameCreator = cardA.creator && cardA.creator !== '未知' && cardA.creator === cardB.creator;
                const isSameCategory = cardA.category && cardA.category !== '未分类' && cardA.category === cardB.category;
                const commonTags = (cardA.customTags || []).filter(t => (cardB.customTags || []).includes(t));
                const hasCommonTags = commonTags.length > 0;

                // 【功能4】根据顶部图例勾选状态过滤连线
                if (isSameCreator && edgeFilters.creator) {
                    links.push({
                        source: cardA.id, target: cardB.id,
                        value: 3, categoryName: '同作者',
                        lineStyle: { color: '#60a5fa', width: 3, opacity: 0.6 } // 蓝线：同作者
                    });
                    nodeDegree.set(cardA.id, nodeDegree.get(cardA.id) + 1);
                    nodeDegree.set(cardB.id, nodeDegree.get(cardB.id) + 1);
                }
                if (isSameCategory && edgeFilters.category) {
                    links.push({
                        source: cardA.id, target: cardB.id,
                        value: 2, categoryName: '同分组',
                        lineStyle: { color: '#c084fc', width: 2, opacity: 0.5 } // 紫线：同分组
                    });
                    nodeDegree.set(cardA.id, nodeDegree.get(cardA.id) + 1);
                    nodeDegree.set(cardB.id, nodeDegree.get(cardB.id) + 1);
                }
                if (hasCommonTags && edgeFilters.tags) {
                    links.push({
                        source: cardA.id, target: cardB.id,
                        value: commonTags.length, categoryName: '共享标签',
                        lineStyle: { color: '#34d399', width: Math.min(commonTags.length, 4), opacity: 0.4 } // 绿线：共享标签
                    });
                    nodeDegree.set(cardA.id, nodeDegree.get(cardA.id) + commonTags.length);
                    nodeDegree.set(cardB.id, nodeDegree.get(cardB.id) + commonTags.length);
                }
            }
        }

        // 【功能3】核心度/枢纽人物高亮：找出连线度数最高的前 3 名社交达人，赋予金色光环与更大尺寸
        if (nodes.length > 0) {
            const sortedNodes = [...nodes].sort((a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0));
            const topHubs = sortedNodes.slice(0, 3); // 前三名枢纽
            topHubs.forEach(hub => {
                const n = nodeMap.get(hub.id);
                if (n) {
                    n.symbolSize = 55; // 超大尺寸
                    n.itemStyle.borderColor = '#f59e0b'; // 金色光环
                    n.itemStyle.borderWidth = 4;
                    n.label.color = '#fde047'; // 金色字体
                    n.name = `👑 ${hub.name.replace('👑 ', '')}`; // 加上皇冠标识
                }
            });
        }

        const option = {
            backgroundColor: 'transparent', // 【修复】不再写死深色背景，跟随外层主题容器（暗夜/青灰/白昼）
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
                force: { repulsion: 700, edgeLength: [90, 260], gravity: 0.15 },
                circular: { rotateLabel: true },
                lineStyle: { curveness: 0.2 }
            }]
        };

        echartsInstance.setOption(option, true);
    };

    // 监听状态改变时实时刷新图谱
    const updateGraphLayout = (mode) => {
        graphLayoutMode.value = mode;
        renderGraph();
    };

    return {
        showGraph,
        graphLayoutMode, graphSearchKeyword, minLinkWeight,
        isolateCurrentGroup, edgeFilters,
        openGraph, closeGraph, renderGraph, updateGraphLayout
    };
}