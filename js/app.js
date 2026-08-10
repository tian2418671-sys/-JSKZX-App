/**
 * SillyTavern 角色卡高级解析中心 - 应用入口
 * Vue 3 组合式 API 风格，逻辑按职责拆分：
 *  - utils/cardLoader.js   文件读取、数据规范化
 *  - utils/pngParser.js    PNG/WebP 解析与深度扫描
 *  - components/Section.js 文本块展示组件
 */
import { createApp, ref, shallowRef, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { Section } from './components/Section.js';
import { processFile, normalizeCardData } from './utils/cardLoader.js';
import { parsePNGChunk, deepScanForJSON } from './utils/pngParser.js';

/** 用户可读的错误提示映射 */
const ERROR_MESSAGES = {
    NO_CARD_DATA: '未能提取到有效的角色卡数据。这可能不是一张标准格式的 Tavern 图片卡，或者数据已损坏。',
    DEFAULT: '文件读取或解析失败，请检查文件是否损坏。'
};

// ================= 渲染进程全局错误兜底 =================
window.addEventListener('error', (event) => {
    console.error('[全局错误]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('[未处理的 Promise 拒绝]', event.reason);
});

const app = createApp({
    components: { Section },
    setup() {
        // 主题状态（localStorage 在自定义协议下可能不可用，做防御性读取）
        let savedTheme = 'light';
        try { savedTheme = localStorage.getItem('stc-theme') || 'light'; } catch (e) { /* 忽略 */ }
        const theme = ref(savedTheme);
        const isDragging = ref(false);
        const cardData = shallowRef(null); // 【优化】使用浅层响应式，完美解决大卡片切换卡顿
        const imgUrl = ref(null);
        const currentTab = ref('basic');
        const library = ref([]); // 存放扫描到的角色卡集合
        // ================= 动态分类/分组与多语言系统 =================
        // 默认的系统预设分组（中英文对照，ref 以便支持动态重命名）
        const defaultCategories = ref([
            { key: 'all', cn: '全部', en: 'All' },
            { key: 'uncategorized', cn: '未分类', en: 'Uncategorized' },
            { key: 'fantasy', cn: '奇幻', en: 'Fantasy' },
            { key: 'scifi', cn: '科幻', en: 'Sci-Fi' },
            { key: 'romance', cn: '恋爱', en: 'Romance' },
            { key: 'nsfw', cn: '限制级', en: 'NSFW' }
        ]);

        // 用户自定义添加的额外分组列表（存字符串）
        const customCategories = ref([]);

        // 合并系统预设与自定义分组
        const allCategories = computed(() => {
            const customObjs = customCategories.value.map(c => ({ key: c, cn: c, en: c }));
            return [...defaultCategories.value, ...customObjs];
        });

        // 判断名称是否已存在于预设或自定义分组（中/英/key 任一匹配即视为已知，避免与预设重复）
        const isCategoryKnown = (name) => allCategories.value.some(c => c.cn === name || c.en === name || c.key === name);

        // 根据当前语言模式（tagLangMode）渲染分类显示名称
        const getCategoryDisplayName = (catObj) => {
            if (tagLangMode.value === 'cn') return catObj.cn;
            if (tagLangMode.value === 'en') return catObj.en;
            return `${catObj.en} (${catObj.cn})`;
        };

        // 当前选中的分类 key
        const currentCategoryKey = ref('all');

        // 新增自定义分组（用自建弹窗替代 Electron 不支持的 prompt）
        const addNewCategory = async () => {
            const newName = await appPrompt('请输入新分组的名称：');
            if (newName && newName.trim() !== '') {
                const cleanName = newName.trim();
                if (!isCategoryKnown(cleanName)) {
                    customCategories.value.push(cleanName);
                    currentCategoryKey.value = cleanName; // 自动切换过去
                } else {
                    nativeAlert('该分组已存在！', 'warning');
                }
            }
        };

        // 重命名当前选中的分组（预设与自定义均可，预设重命名后转为自定义分组；「全部」为视图模式不可改）
        const renameCurrentCategory = async () => {
            const currentKey = currentCategoryKey.value;
            
            // 特殊视图/过滤模式（非真实分组），不允许重命名
            if (currentKey === 'all' || currentKey === 'has_lorebook' || currentKey === 'has_regex') {
                nativeAlert('该选项为视图/过滤模式，无需重命名！', 'warning');
                return;
            }
            
            const oldPreset = defaultCategories.value.find(c => c.key === currentKey);
            const oldName = oldPreset ? oldPreset.cn : currentKey;
            
            const newName = await appPrompt(`请输入「${oldName}」的新分组名称：`, oldName);
            if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
            const cleanNewName = newName.trim();
            
            // 检查新名字是否冲突
            if (isCategoryKnown(cleanNewName)) {
                nativeAlert('该分组名称已存在！', 'warning');
                return;
            }
            
            // 1. 移除旧分组定义（预设重命名后转为自定义分组）
            if (oldPreset) {
                defaultCategories.value = defaultCategories.value.filter(c => c.key !== currentKey);
            } else {
                const idx = customCategories.value.indexOf(currentKey);
                if (idx !== -1) customCategories.value.splice(idx, 1);
            }
            
            // 2. 将新名称加入自定义分组列表
            customCategories.value.push(cleanNewName);
            
            // 3. 批量同步更新库中所有属于该旧分组的卡片归属（预设需匹配中/英/key 三种存储形态）
            library.value.forEach(item => {
                if (oldPreset) {
                    if (item.category === oldPreset.cn || item.category === oldPreset.en || item.category === oldPreset.key) {
                        item.category = cleanNewName;
                    }
                } else if (item.category === currentKey) {
                    item.category = cleanNewName;
                }
            });
            
            // 4. 自动将当前选中的分组切换为新名字
            currentCategoryKey.value = cleanNewName;
            nativeAlert(`分组已成功重命名为：「${cleanNewName}」`, 'info');
        };

        // 单卡修改分类时，如果输入了新分类自动加入自定义列表
        const changeCardCategory = async (item) => {
            const newCat = await appPrompt(`将 ${item.name} 移动到新分类：`, item.category);
            if (newCat && newCat.trim() !== '') {
                const cleanCat = newCat.trim();
                item.category = cleanCat;
                if (!isCategoryKnown(cleanCat)) {
                    customCategories.value.push(cleanCat);
                }
            }
        };

        // 当前编辑卡片的分类（映射到库项目 libItem.category，避免污染卡片原始文件数据）
        const currentCardCategory = computed({
            get() {
                const libItem = library.value.find(item => item.data === cardData.value);
                if (!libItem) return '';
                const cat = libItem.category || '';
                // 尝试匹配预设分组（中/英/key 均可），自定义分组直接返回字符串
                const preset = defaultCategories.value.find(c => c.cn === cat || c.en === cat || c.key === cat);
                return preset ? preset.key : cat;
            },
            set(val) {
                const libItem = library.value.find(item => item.data === cardData.value);
                if (!libItem) return;
                const preset = defaultCategories.value.find(c => c.key === val);
                libItem.category = preset ? preset.cn : val;
            }
        });

        // 当在右侧面板更改卡片分组时触发（同步左侧列表里的卡片归属）
        const handleCardCategoryChange = () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem) {
                const preset = defaultCategories.value.find(c => c.key === currentCardCategory.value);
                libItem.category = preset ? preset.cn : currentCardCategory.value;
            }
        };

        // 分页状态
        const currentPage = ref(1);
        const itemsPerPage = ref(18);

        // 自动贴标签/分类规则 (正则匹配关键词)
        const autoTagRules = {
            'Fantasy (奇幻)': /魔法|精灵|异世界|巨龙|魔王|骑士/i,
            'Sci-Fi (科幻)': /星系|机甲|赛博朋克|AI|未来/i,
            'Monster (魔物娘)': /吸血鬼|狼人|魅魔|触手|兽人/i,
            'NSFW (限制级)': /nsfw|18\+|r18|色情|淫乱/i,
            'Romance (恋爱)': /恋爱|傲娇|病娇|青梅竹马/i
        };

        // 记录从外部导入的配置，格式: { '卡片原名': { category: 'xx', customTags: ['A', 'B'] } }
        const importedConfig = ref({});
        const currentFolderPath = ref(''); // 当前打开的文件夹路径（Electron）

        // ================= [ 多选与批量操作状态 ] =================
        const selectedIds = ref([]); // 存放被选中的卡片 ID
        const lastSelectedIndex = ref(-1); // 用于 Shift 连续多选记录

        // ================= [ 聊天测卡状态 ] =================
        const chatHistory = ref([]); // 聊天记录
        const chatInput = ref('');   // 用户输入
        const isChatting = ref(false); // 加载状态
        // 默认地址：兼容 LM Studio 或 Oobabooga 的 OpenAI 格式接口
        const apiEndpoint = ref('http://127.0.0.1:1234/v1/chat/completions');
        const chatContainer = ref(null); // 用于自动滚动

        // API 鉴权密钥（可配置，远端 API 需要真实 key；本地 API 可留空，主进程回退到 test-key）
        let savedApiKey = '';
        try { savedApiKey = localStorage.getItem('stc-api-key') || ''; } catch (e) { /* 忽略 */ }
        const apiKey = ref(savedApiKey);

        // 【新增】聊天界面的 渲染/代码 模式开关 (默认 false 为代码模式，true 为渲染模式)
        const isChatRenderMode = ref(false);

        // 兼容不同数据结构的取值助手：优先取 data 字段
        const safeData = computed(() => {
            if (!cardData.value) return {};
            return cardData.value.data || cardData.value || {};
        });

        // 识别卡片规范版本
        const specVersion = computed(() => {
            if (!cardData.value) return 'Unknown';
            if (cardData.value.spec === 'chara_card_v3') return 'V3';
            if (cardData.value.spec === 'chara_card_v2') return 'V2';
            if (cardData.value.name && !cardData.value.data) return 'V1 / Custom';
            return 'Custom';
        });

        // 世界书条目（兼容 V1/V2 层级与 comment 字段）
        const worldbookEntries = computed(() => {
            // 兼容 V1 和 V2 的存放位置
            const book = safeData.value.character_book || cardData.value?.character_book || {};
            // 兼容是以 entries 数组存放，还是直接就是一个数组
            let entries = book.entries || (Array.isArray(book) ? book : []);

            // 【关键】直接返回原始条目的响应式代理（不做拷贝展开），
            // 这样 v-model 编辑能写回原数据（保存时落盘），同时保持响应式（cardData 是 shallowRef）
            return entries.map(entry => {
                if (!entry || typeof entry !== 'object') return entry;
                return reactive(entry);
            });
        });

        // ================= 世界书折叠展开控制 =================
        // 存储每个世界书条目是否展开的映射表，key 为索引，value 为 boolean
        const worldbookExpanded = ref({});

        // 切换单个条目的折叠状态
        const toggleWorldbookEntry = (index) => {
            worldbookExpanded.value[index] = !worldbookExpanded.value[index];
        };

        // 全部展开
        const expandAllWorldbook = () => {
            worldbookEntries.value.forEach((_, idx) => {
                worldbookExpanded.value[idx] = true;
            });
        };

        // 全部折叠
        const collapseAllWorldbook = () => {
            worldbookEntries.value.forEach((_, idx) => {
                worldbookExpanded.value[idx] = false;
            });
        };

        // 世界书触发词转字符串以便在 input 中编辑
        const getKeysString = (keysArray) => {
            return Array.isArray(keysArray) ? keysArray.join(', ') : (keysArray || '');
        };

        const updateEntryKeys = (entry, val) => {
            entry.keys = val.split(',').map(t => t.trim()).filter(t => t);
        };

        // 【修复】富文本渲染与代码安全转义
        const renderHTML = (text) => {
            if (!text) return '';
            // 1. 必须先转义 < 和 >，否则 <html> 这种代码会被浏览器吞掉
            let safeText = text.replace(/&/g, "&amp;")
                               .replace(/</g, "&lt;")
                               .replace(/>/g, "&gt;");
            // 2. 替换换行，保留多个空格以便代码缩进不丢失
            return safeText.replace(/\n/g, '<br>')
                           .replace(/\s\s/g, '&nbsp;&nbsp;');
        };

        // 正则脚本（兼容不同存放位置）
        const regexScripts = computed(() => {
            return safeData.value.extensions?.regex_scripts || safeData.value.regex_scripts || [];
        });

        // ================= [ 方法：聊天测卡逻辑 ] =================
        // 构造系统提示词 (模拟 Tavern 的基础拼接逻辑)
        const buildSystemPrompt = () => {
            const d = safeData.value;
            const charName = d.name || '角色';
            const sysPrompt = d.system_prompt ? d.system_prompt + '\n\n' : '';

            return `${sysPrompt}你要扮演 ${charName}。\n【角色描述】: ${d.description || ''}\n【性格特征】: ${d.personality || ''}\n【当前场景】: ${d.scenario || ''}\n\n请保持角色的设定，使用符合角色性格的语气与我对话。`;
        };

        // 初始化聊天 (点击进入测卡 Tab 时调用)
        const initChat = () => {
            if (chatHistory.value.length === 0 && safeData.value.first_mes) {
                chatHistory.value = [
                    { role: 'system', content: buildSystemPrompt() },
                    { role: 'assistant', content: safeData.value.first_mes, name: safeData.value.name }
                ];
            }
        };

        // 发送消息
        const sendMessage = async () => {
            if (chatInput.value.trim() === '' || isChatting.value) return;

            const userText = chatInput.value.trim();
            chatHistory.value.push({ role: 'user', content: userText, name: '你' });
            chatInput.value = '';
            isChatting.value = true;

            scrollToBottom();

            // 过滤掉 UI 用的 name 属性，只保留 OpenAI 标准的 role 和 content
            const payload = {
                model: "local-model", // 本地模型通常忽略此字段
                messages: chatHistory.value.map(msg => ({ role: msg.role, content: msg.content })),
                temperature: 0.7,
                max_tokens: 500
            };

            try {
                // 持久化 API Key（localStorage 可能不可用，做防御性写入）
                try { localStorage.setItem('stc-api-key', apiKey.value); } catch (e) { /* 忽略 */ }
                const result = await window.electronAPI.sendChatMessage(apiEndpoint.value, payload, apiKey.value);

                if (result.success && result.data.choices && result.data.choices.length > 0) {
                    const reply = result.data.choices[0].message.content;
                    chatHistory.value.push({ role: 'assistant', content: reply, name: safeData.value.name });
                } else {
                    nativeAlert(result.error || "模型返回了空数据", "error", "API 请求失败");
                    // 撤回用户的发送以便重试
                    chatHistory.value.pop();
                    chatInput.value = userText;
                }
            } catch (e) {
                nativeAlert(`请求异常: ${e.message}`, "error");
            } finally {
                isChatting.value = false;
                scrollToBottom();
            }
        };

        const scrollToBottom = () => {
            setTimeout(() => {
                if (chatContainer.value) {
                    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
                }
            }, 100);
        };

        // 重置聊天
        const clearChat = () => {
            chatHistory.value = [];
            initChat();
        };

        // ================= [ 关系图谱：生成与渲染 ] =================
        const showGraph = ref(false);
        const graphContainer = ref(null);
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

        const openGraph = () => {
            if (library.value.length < 2) {
                return nativeAlert('库中至少需要有 2 张卡片才能生成关系图谱。', 'warning');
            }
            showGraph.value = true;

            // 等待 DOM 渲染完成后初始化 ECharts
            nextTick(() => {
                if (!echartsInstance) {
                    echartsInstance = echarts.init(graphContainer.value);
                }
                initGraphEvents(); // 绑定双击穿梭事件
                renderGraph();
            });
        };

        const closeGraph = () => {
            showGraph.value = false;
            if (echartsInstance) {
                echartsInstance.dispose();
                echartsInstance = null;
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
                backgroundColor: '#111827',
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

        // ================= Token 消耗与上下文预估 =================
        // 简易 Token 估算算法：中文按 1.5 权重，英文单词按 1.2 权重计算
        const estimateTokens = (text) => {
            if (!text || typeof text !== 'string') return 0;
            const chinese = text.match(/[\u4e00-\u9fa5]/g) || [];
            const nonChinese = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean);
            return Math.ceil(chinese.length * 1.5 + nonChinese.length * 1.2);
        };

        // 计算当前卡片各个模块的 Token 消耗明细及总数
        const cardTokenStats = computed(() => {
            if (!cardData.value) return { total: 0, desc: 0, pers: 0, scen: 0, first: 0, book: 0 };
            const d = safeData.value;
            
            const desc = estimateTokens(d.description);
            const pers = estimateTokens(d.personality);
            const scen = estimateTokens(d.scenario);
            const first = estimateTokens(d.first_mes);
            
            // 计算所有世界书条目的 Token 总和
            let bookTokens = 0;
            const book = d.character_book || cardData.value?.character_book || {};
            const entries = book.entries || (Array.isArray(book) ? book : []);
            entries.forEach(e => {
                bookTokens += estimateTokens(e.content) + estimateTokens((e.keys || []).join(', '));
            });

            const total = desc + pers + scen + first + bookTokens;
            return { total, desc, pers, scen, first, book: bookTokens };
        });

        // ================= 全局资产中枢 (世界书/正则共享库) =================
        const showGlobalAssetModal = ref(false);
        const globalAssetTab = ref('worldbook'); // 'worldbook' 或 'regex'

        // 聚合全库所有卡片的世界书条目 (附带所属卡片名字)
        const globalAllWorldbooks = computed(() => {
            const list = [];
            library.value.forEach(item => {
                const d = item.data?.data || item.data || {};
                const book = d.character_book || item.data?.character_book || {};
                const entries = book.entries || (Array.isArray(book) ? book : []);
                entries.forEach(e => {
                    list.push({
                        ...e,
                        displayName: e.name || e.comment || '未命名条目',
                        ownerCardName: d.name || item.name || '未知角色'
                    });
                });
            });
            return list;
        });

        // 聚合全库所有卡片的正则脚本
        const globalAllRegexScripts = computed(() => {
            const list = [];
            library.value.forEach(item => {
                const d = item.data?.data || item.data || {};
                const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                regex.forEach(r => {
                    list.push({
                        ...r,
                        ownerCardName: d.name || item.name || '未知角色'
                    });
                });
            });
            return list;
        });

        // 导航标签（含图标与数量徽标）
        const tabs = computed(() => [
            { id: 'basic', name: '基础设定', icon: '📖' },
            { id: 'advanced', name: '进阶设定', icon: '🛠️' },
            { id: 'worldbook', name: '世界书', icon: '🌍', badge: worldbookEntries.value.length || null },
            { id: 'regex', name: '正则脚本', icon: '⚙️', badge: regexScripts.value.length || null },
            { id: 'chat', name: '聊天测试', icon: '💬', action: initChat },
            { id: 'raw', name: 'Raw JSON', icon: '💻' }
        ]);

        const currentTabInfo = computed(() => tabs.value.find(t => t.id === currentTab.value) || tabs.value[0]);

        const formattedJson = computed(() => {
            return cardData.value ? JSON.stringify(cardData.value, null, 2) : '';
        });

        // ================= [ 计算属性 (分类与分页) ] =================
        const searchQuery = ref(''); // 搜索框绑定的关键词

        // ================= 全局全文检索与深度过滤引擎（适配多语言分组 Key） =================
        const filteredLibrary = computed(() => {
            let list = library.value;

            // 1. 分组过滤（含特殊快捷过滤：带世界书 / 带正则脚本）
            if (currentCategoryKey.value !== 'all') {
                if (currentCategoryKey.value === 'has_lorebook') {
                    // 📖 带世界书：卡片内嵌世界书且有条目
                    list = list.filter(item => {
                        const d = item.data?.data || item.data || {};
                        const book = d.character_book || item.data?.character_book || {};
                        const entries = book.entries || (Array.isArray(book) ? book : []);
                        return entries.length > 0;
                    });
                } else if (currentCategoryKey.value === 'has_regex') {
                    // ⚡ 带正则脚本：卡片内嵌正则脚本
                    list = list.filter(item => {
                        const d = item.data?.data || item.data || {};
                        const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                        return regex.length > 0;
                    });
                } else {
                    const targetCat = allCategories.value.find(c => c.key === currentCategoryKey.value);
                    if (targetCat) {
                        list = list.filter(item => item.category === targetCat.cn || item.category === targetCat.en || item.category === targetCat.key);
                    }
                }
            }

            // 2. 全局全文深度检索过滤
            if (searchQuery.value && searchQuery.value.trim() !== '') {
                const q = searchQuery.value.trim().toLowerCase();
                
                list = list.filter(item => {
                    const d = item.data?.data || item.data || {};
                    
                    // A. 匹配基础字段 (名字、作者、简介、性格、开场白)
                    const matchBasic = (d.name && d.name.toLowerCase().includes(q)) ||
                                       (d.creator && d.creator.toLowerCase().includes(q)) ||
                                       (d.description && d.description.toLowerCase().includes(q)) ||
                                       (d.personality && d.personality.toLowerCase().includes(q)) ||
                                       (d.first_mes && d.first_mes.toLowerCase().includes(q));

                    // B. 匹配自定义标签
                    const matchTags = item.customTags && item.customTags.some(t => t.toLowerCase().includes(q));

                    // C. 深度穿透：匹配世界书内部的条目名称、注释、关键词或正文内容！
                    const book = d.character_book || item.data?.character_book || {};
                    const entries = book.entries || (Array.isArray(book) ? book : []);
                    const matchWorldbook = entries.some(e => {
                        const title = e.name || e.comment || '';
                        const content = e.content || '';
                        const keys = e.keys || [];
                        return title.toLowerCase().includes(q) ||
                               content.toLowerCase().includes(q) ||
                               keys.some(k => k.toLowerCase().includes(q));
                    });

                    // 只要任意一个维度命中，就将这张卡片保留在列表中
                    return matchBasic || matchTags || matchWorldbook;
                });
            }

            return list;
        });

        // 2. 计算总页数
        const totalPages = computed(() => {
            return Math.ceil(filteredLibrary.value.length / itemsPerPage.value) || 1;
        });

        // 3. 当前页展示的数据
        const paginatedLibrary = computed(() => {
            const start = (currentPage.value - 1) * itemsPerPage.value;
            const end = start + itemsPerPage.value;
            return filteredLibrary.value.slice(start, end);
        });

        // 过滤条件（搜索/分组）变化时重置回第一页，避免停留在超出范围的页面上
        watch([searchQuery, currentCategoryKey], () => {
            currentPage.value = 1;
        });

        // 正则作用域（placement）可读化
        const getRegexPlacement = (arr) => {
            if (!arr) return '默认';
            const map = { 1: '用户输入', 2: 'AI回复', 3: '全文本' };
            return Array.isArray(arr) ? arr.map(i => map[i] || i).join(', ') : map[arr] || arr;
        };

        // 原生提示框封装：替代浏览器 alert()，弹出 Electron 原生对话框
        const nativeAlert = async (message, type = 'info', title = '系统提示') => {
            if (!window.electronAPI) return alert(message); // 浏览器环境回退
            await window.electronAPI.showMessage({
                type: type, // 'none' | 'info' | 'error' | 'question' | 'warning'
                title: title,
                message: message,
                buttons: ['确定']
            });
        };

        // 主题切换（浅色/深色）
        const applyTheme = (t) => {
            document.documentElement.setAttribute('data-theme', t);
        };
        const toggleTheme = () => {
            theme.value = theme.value === 'light' ? 'dark' : 'light';
            try { localStorage.setItem('stc-theme', theme.value); } catch (e) { /* 忽略 */ }
            applyTheme(theme.value);
        };

        // 处理文件读取（含错误提示）
        const handleFile = async (file) => {
            try {
                const { data, imgUrl: url } = await processFile(file);
                cardData.value = data;
                imgUrl.value = url;
                currentTab.value = 'basic';
            } catch (error) {
                console.error(error);
                nativeAlert(ERROR_MESSAGES[error.message] || ERROR_MESSAGES.DEFAULT, 'error');
            }
        };

        // 系统级拖拽导入：将拖入的文件复制到卡片库文件夹
        const handleDrop = async (e) => {
            isDragging.value = false;

            // 检查是否已设置固定的卡片库文件夹
            if (!currentFolderPath.value) {
                return nativeAlert('请先在顶部【选择固定文件夹读取】，设定你的卡片库目录，然后再拖入新卡片。', 'warning');
            }

            // 获取拖入文件的真实绝对路径
            // 注意：Electron 33 起 File.path 已移除，须经 webUtils.getPathForFile 获取（由 preload 暴露）
            const files = Array.from(e.dataTransfer.files);
            const filePaths = files
                .map(f => window.electronAPI ? window.electronAPI.getPathForFile(f) : f.path)
                .filter(p => p);

            if (filePaths.length > 0) {
                // 调用主进程，把拖入的文件复制到库文件夹
                const copiedFiles = await window.electronAPI.copyToLibrary(filePaths, currentFolderPath.value);

                if (copiedFiles.length > 0) {
                    nativeAlert(`成功将 ${copiedFiles.length} 张新卡片导入到你的卡片库中！\n正在刷新...`, 'info');

                    // 复制完成后，重新扫描文件夹，让新卡片显示在界面
                    const result = await window.electronAPI.loadConfig();
                    if (result) await processElectronFiles(result);
                } else {
                    nativeAlert('导入失败：卡片格式不支持，或者库中已存在同名文件。', 'warning');
                }
            }
        };

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
            e.target.value = ''; // 重置输入框，允许重复选择同一文件
        };

        // 导出 JSON
        const downloadJson = () => {
            if (!cardData.value) return;
            const jsonStr = JSON.stringify(cardData.value, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${safeData.value.name || 'character'}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        // 自动分类与贴标签的核心逻辑
        const processAutoTagsAndCategory = (cardInfo) => {
            // ---- 【优先应用导入的历史配置】 ----
            const savedConfig = importedConfig.value[cardInfo.name];
            if (savedConfig) {
                cardInfo.category = savedConfig.category || '未分类';
                cardInfo.customTags = savedConfig.customTags || [];
                return; // 如果有历史配置，就跳过自动分类，直接使用用户的历史数据
            }
            // ---- 【以下为原有的自动规则代码】 ----
            const data = cardInfo.data?.data || cardInfo.data;
            if (!data) return;

            // 提取所有文本用于分析
            const fullText = [data.description, data.personality, data.scenario, data.first_mes].join('\n');
            let generatedTags = [...(data.tags || [])]; // 保留自带标签
            let assignedCategory = '未分类';

            // 匹配自动标签
            for (const [tag, regex] of Object.entries(autoTagRules)) {
                if (regex.test(fullText) && !generatedTags.includes(tag)) {
                    generatedTags.push(tag);
                    // 简单的自动分类：将匹配到的第一个大类作为分类
                    if (assignedCategory === '未分类') assignedCategory = tag.split(' ')[0];
                }
            }

            // 更新到卡片对象
            cardInfo.customTags = Array.from(new Set(generatedTags));
            cardInfo.category = assignedCategory;

            // 动态将新分类加入分类表（命中预设分组时不重复添加）
            if (!allCategories.value.some(c => c.cn === assignedCategory || c.en === assignedCategory || c.key === assignedCategory)) {
                customCategories.value.push(assignedCategory);
            }
        };

        // ================= [ Electron 专属逻辑 ] =================

        // 统一处理主进程传来的文件列表
        const processElectronFiles = async (folderData) => {
            if (!folderData || !folderData.files) return;

            currentFolderPath.value = folderData.folderPath;
            library.value = []; // 清空当前库
            let addedCount = 0;

            for (const file of folderData.files) {
                try {
                    let parsedData = null;

                    if (file.name.toLowerCase().endsWith('.json')) {
                        // 读取本地 JSON 文本
                        const text = await window.electronAPI.readText(file.path);
                        parsedData = JSON.parse(text);
                    } else {
                        // 读取本地图片 Buffer
                        const buffer = await window.electronAPI.readBuffer(file.path);
                        // 复用解析函数（Buffer 经 IPC 传递后为 Uint8Array，取 .buffer 为 ArrayBuffer）
                        parsedData = parsePNGChunk(buffer.buffer) || deepScanForJSON(buffer.buffer);
                    }

                    if (parsedData) {
                        const normalized = normalizeCardData(parsedData);
                        const cardInfo = {
                            id: file.path, // 绝对路径作为唯一 ID
                            name: normalized.data?.name || parsedData.name || '未命名',
                            creator: normalized.data?.creator || '未知',
                            avatar: file.url, // 通过 local-file:// 协议展示本地图片
                            data: normalized,
                            category: '未分类',
                            customTags: []
                        };

                        // 触发自动标签和分类（会优先应用导入的历史配置）
                        processAutoTagsAndCategory(cardInfo);
                        library.value.push(cardInfo);
                        addedCount++;
                    }
                } catch (err) {
                    console.warn(`跳过文件 ${file.name}`, err);
                }
            }
            console.log(`成功从 ${folderData.folderPath} 加载了 ${addedCount} 张卡片`);
        };

        // 按钮绑定的点击事件：通过主进程弹出原生文件夹选择框
        const selectFixedDirectory = async () => {
            if (!window.electronAPI) {
                return nativeAlert("该功能需要 Electron 桌面环境，请使用 npm start 启动应用。", 'warning');
            }
            const result = await window.electronAPI.selectFolder();
            if (result) await processElectronFiles(result);
        };

        // 【关键】软件启动时，自动无感加载上次的文件夹（Electron 环境）
        onMounted(async () => {
            window.addEventListener('click', handleGlobalClick); // 点击任意处关闭右键菜单
            applyTheme(theme.value); // 应用已保存的主题
            if (!window.electronAPI) return; // 浏览器环境直接跳过
            try {
                const lastData = await window.electronAPI.loadConfig();
                if (lastData && lastData.folderPath) {
                    await processElectronFiles(lastData);
                }
            } catch (err) {
                console.warn('自动加载上次文件夹失败', err);
            }
        });

        // 手动贴标签
        const addManualTag = async (item) => {
            const newTag = await appPrompt(`为 ${item.name} 添加新标签 (多个标签用逗号分隔):`);
            if (newTag) {
                const tags = newTag.split(',').map(t => t.trim()).filter(t => t);
                item.customTags = Array.from(new Set([...(item.customTags || []), ...tags]));
            }
        };

        // 手动更改分类
        const changeCategory = async (item) => {
            const newCat = await appPrompt(`将 ${item.name} 移动到新分类 (当前: ${item.category}):\n如果你输入新的分类名，将自动创建它。`, item.category);
            if (newCat && newCat.trim() !== '') {
                const cleanCat = newCat.trim();
                item.category = cleanCat;
                if (!isCategoryKnown(cleanCat)) {
                    customCategories.value.push(cleanCat);
                }
            }
        };

        // 换页逻辑
        const changePage = (page) => {
            if (page >= 1 && page <= totalPages.value) currentPage.value = page;
        };

        // ================= [ 方法：导出/导入 本地库文件 ] =================

        // 1. 导出数据库文件 (Backup Library)
        const exportLibraryDB = () => {
            if (library.value.length === 0) return nativeAlert("当前库为空，没有需要导出的内容。", 'warning');

            // 只保存关键配置（不保存庞大的图片数据，保持文件轻量）
            const dbData = {
                version: "1.0",
                categories: customCategories.value,
                cardsConfig: {}
            };

            library.value.forEach(item => {
                // 使用卡片名称作为唯一标识符
                dbData.cardsConfig[item.name] = {
                    category: item.category,
                    customTags: item.customTags
                };
            });

            const jsonStr = JSON.stringify(dbData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `SillyTavern_Library_DB.json`; // 下载到本地的数据库文件
            a.click();
            URL.revokeObjectURL(a.href);
        };

        // 2. 加载数据库文件 (Load Library)
        const importLibraryDB = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const dbData = JSON.parse(text);

                if (dbData.categories && Array.isArray(dbData.categories)) {
                    dbData.categories.forEach(c => {
                        if (!isCategoryKnown(c)) {
                            customCategories.value.push(c);
                        }
                    });
                }
                if (dbData.cardsConfig) {
                    importedConfig.value = dbData.cardsConfig;

                    // 如果当前库里已经有卡片了，立即应用配置
                    library.value.forEach(item => {
                        const config = importedConfig.value[item.name];
                        if (config) {
                            item.category = config.category || item.category;
                            item.customTags = config.customTags || item.customTags;
                        }
                    });
                }
                nativeAlert("库配置导入成功！请点击【读取本地文件夹】扫描你的图片，系统会自动恢复标签和分类。", 'info');
            } catch (err) {
                nativeAlert("导入失败，无效的库文件格式。", 'error');
            }
            e.target.value = '';
        };

        // 从库中点击打开卡片
        const openFromLibrary = (item) => {
            cardData.value = item.data;
            imgUrl.value = item.avatar;
            currentTab.value = 'basic';
            // 【关键修复】切换卡片时强制清空聊天记录，确保下次进入聊天 Tab 时重新加载新卡的设定
            chatHistory.value = [];
            // 同时重置世界书折叠状态，避免上一张卡的展开状态残留
            worldbookExpanded.value = {};
            window.scrollTo({ top: 0, behavior: 'smooth' }); // 滚动到顶部查看
        };

        // ================= [ 方法：选择逻辑 ] =================
        const handleCardClick = (e, item, index) => {
            // 按住 Ctrl / Cmd 键多选
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                toggleSelection(item.id);
                lastSelectedIndex.value = index;
            }
            // 按住 Shift 键连续多选
            else if (e.shiftKey && lastSelectedIndex.value !== -1) {
                e.preventDefault();
                const start = Math.min(lastSelectedIndex.value, index);
                const end = Math.max(lastSelectedIndex.value, index);

                // 在当前页视图中进行连续选择
                for (let i = start; i <= end; i++) {
                    const currentItem = filteredLibrary.value[i];
                    if (!selectedIds.value.includes(currentItem.id)) {
                        selectedIds.value.push(currentItem.id);
                    }
                }
                lastSelectedIndex.value = index;
            }
            // 普通点击：已处于选中模式则切换选择，否则打开卡片
            else {
                if (selectedIds.value.length > 0) {
                    toggleSelection(item.id);
                    lastSelectedIndex.value = index;
                } else {
                    openFromLibrary(item);
                }
            }
        };

        const toggleSelection = (id) => {
            const idx = selectedIds.value.indexOf(id);
            if (idx > -1) selectedIds.value.splice(idx, 1);
            else selectedIds.value.push(id);
        };

        const clearSelection = () => {
            selectedIds.value = [];
            lastSelectedIndex.value = -1;
        };

        // ================= 交互优化：多选开关与右键菜单 =================
        const isMultiSelectMode = ref(false); // 默认隐藏批量复选框
        
        // 右键菜单状态
        const contextMenu = ref({
            visible: false,
            x: 0,
            y: 0,
            item: null
        });

        // 打开右键菜单
        const openContextMenu = (event, item) => {
            event.preventDefault(); // 阻止浏览器默认右键菜单
            contextMenu.value = {
                visible: true,
                x: event.clientX,
                y: event.clientY,
                item: item
            };
        };

        // 关闭右键菜单
        const closeContextMenu = () => {
            contextMenu.value.visible = false;
        };

        // 右键菜单：快速移动单个卡片分组（用自建弹窗替代 prompt）
        const quickMoveGroup = async (item) => {
            const newCat = await appPrompt(`将卡片 [${item.name}] 移动到分组:`, item.category || '未分类');
            if (newCat && newCat.trim() !== '') {
                const cleanCat = newCat.trim();
                item.category = cleanCat;
                if (!isCategoryKnown(cleanCat)) {
                    customCategories.value.push(cleanCat);
                }
                nativeAlert(`已将卡片移动至 [${cleanCat}]`, 'info');
            }
        };

        // 右键菜单：导出单张卡片（复制到用户选择的目录）
        const exportCard = async (item) => {
            if (!item) return;
            try {
                const res = await window.electronAPI.exportBatchPackage([item.id]);
                if (res.success) {
                    nativeAlert(`单卡导出成功！\n已导出至:\n${res.exportDir}`, 'info');
                } else if (res.error !== "用户取消操作") {
                    nativeAlert(`导出失败: ${res.error}`, 'error');
                }
            } catch (e) {
                nativeAlert(`发生错误: ${e.message}`, 'error');
            }
        };

        // 右键菜单：删除指定卡片（移入回收站，独立于当前打开的卡片）
        const deleteCardItem = async (item) => {
            if (!item) return;
            const { response } = await window.electronAPI.showMessage({
                type: 'warning', title: '安全删除提示',
                message: `确定要将卡片 [${item.name}] 移入回收站吗？\n(文件将被放入目录下的 .trash 文件夹中，支持手动找回)`,
                buttons: ['移入回收站', '取消'], cancelId: 1
            });
            if (response === 0) {
                const res = await window.electronAPI.deleteFile(item.id);
                if (res.success) {
                    library.value = library.value.filter(i => i.id !== item.id);
                    // 如果删除的正是当前打开的卡片，关闭编辑面板
                    if (cardData.value && item.data === cardData.value) reset();
                    nativeAlert("卡片已安全移入本地回收站。", "info");
                } else {
                    nativeAlert("操作失败: " + res.error, "error");
                }
            }
        };

        // 点击页面任意地方自动关闭右键菜单
        const handleGlobalClick = () => {
            if (contextMenu.value.visible) {
                closeContextMenu();
            }
        };

        // ================= [ 方法：批量操作 ] =================
        // 批量移动分类
        const batchChangeCategory = async () => {
            if (selectedIds.value.length === 0) return;

            const newCat = await appPrompt(`将选中的 ${selectedIds.value.length} 张卡片移动到新分类:\n(输入新分类名称)`, '未分类');

            if (newCat && newCat.trim() !== '') {
                const cleanCat = newCat.trim();

                // 更新数据
                library.value.forEach(item => {
                    if (selectedIds.value.includes(item.id)) {
                        item.category = cleanCat;
                    }
                });

                // 动态添加新分类
                if (!isCategoryKnown(cleanCat)) {
                    customCategories.value.push(cleanCat);
                }

                await nativeAlert(`已成功将 ${selectedIds.value.length} 张卡片移动到 [${cleanCat}] 分类！`, 'info');
                clearSelection();
            }
        };

        // ================= 批量操作增强版逻辑 =================
        // 批量移动到指定分组（展示现有分组列表，用自建弹窗替代 prompt）
        const batchChangeCategoryModal = async () => {
            if (selectedIds.value.length === 0) return;
            const catNames = allCategories.value.filter(c => c.key !== 'all').map(c => c.cn).join(', ');
            const newCat = await appPrompt(`将选中的 ${selectedIds.value.length} 张卡片移动到分组:\n(现有分组: ${catNames})`, '未分类');
            
            if (newCat && newCat.trim() !== '') {
                const cleanCat = newCat.trim();
                library.value.forEach(item => {
                    if (selectedIds.value.includes(item.id)) {
                        item.category = cleanCat;
                    }
                });
                if (!isCategoryKnown(cleanCat)) {
                    customCategories.value.push(cleanCat);
                }
                nativeAlert(`成功将 ${selectedIds.value.length} 张卡片移动至 [${cleanCat}]`, 'info');
                clearSelection();
            }
        };

        // 批量打包导出已选卡片
        const batchExportSelected = async () => {
            if (selectedIds.value.length === 0) return;
            try {
                const res = await window.electronAPI.exportBatchPackage(selectedIds.value);
                if (res.success) {
                    nativeAlert(`批量导出成功！\n共导出 ${res.count} 张卡片至:\n${res.exportDir}`, 'info');
                    clearSelection();
                } else if (res.error !== "用户取消操作") {
                    nativeAlert(`导出失败: ${res.error}`, 'error');
                }
            } catch (e) {
                nativeAlert(`发生错误: ${e.message}`, 'error');
            }
        };

        // 批量添加标签
        const batchAddTag = async () => {
            if (selectedIds.value.length === 0) return;

            const newTag = await appPrompt(`为选中的 ${selectedIds.value.length} 张卡片批量添加标签:\n(多个标签用逗号分隔)`, '');

            if (newTag && newTag.trim() !== '') {
                const tagsToAdd = newTag.split(',').map(t => t.trim()).filter(t => t);

                library.value.forEach(item => {
                    if (selectedIds.value.includes(item.id)) {
                        item.customTags = Array.from(new Set([...(item.customTags || []), ...tagsToAdd]));
                    }
                });

                await nativeAlert(`批量打标签成功！`, 'info');
                clearSelection();
            }
        };

        // ================= 批量标签与预设系统 =================
        const showBatchTagModal = ref(false);
        const batchInputTags = ref('');
        const batchMode = ref('append'); // 'append' 追加 或 'overwrite' 覆盖

        // ================= 标签中英文切换系统 =================
        // 标签语言模式: 'cn' (纯中文), 'en' (纯英文), 'both' (中英双语)
        const tagLangMode = ref('both');

        const toggleTagLangMode = () => {
            if (tagLangMode.value === 'both') tagLangMode.value = 'cn';
            else if (tagLangMode.value === 'cn') tagLangMode.value = 'en';
            else tagLangMode.value = 'both';
        };

        // 系统自带的酒馆标签预设库（结构化中英文）
        const presetTagsLibrary = [
            { cn: '奇幻', en: 'Fantasy' },
            { cn: '科幻', en: 'Sci-Fi' },
            { cn: '现代', en: 'Modern' },
            { cn: '末日', en: 'Post-Apocalyptic' },
            { cn: '限制级', en: 'NSFW' },
            { cn: '恋爱', en: 'Romance' },
            { cn: '病娇', en: 'Yandere' },
            { cn: '傲娇', en: 'Tsundere' },
            { cn: '精灵', en: 'Elf' },
            { cn: '魔物娘', en: 'Monster Girl' },
            { cn: '巨龙', en: 'Dragon' },
            { cn: '吸血鬼', en: 'Vampire' },
            { cn: '恶魔', en: 'Demon' },
            { cn: '天使', en: 'Angel' },
            { cn: '兽耳', en: 'Kemonomimi' },
            { cn: '机甲', en: 'Mecha' },
            { cn: '魔法', en: 'Magic' },
            { cn: '系统流', en: 'System' },
            { cn: '异世界', en: 'Isekai' },
            { cn: '暗黑', en: 'Dark' },
            { cn: '喜剧', en: 'Comedy' },
            { cn: '虐心', en: 'Angst' },
            { cn: '日常', en: 'Slice of Life' },
            { cn: '动作', en: 'Action' },
            { cn: '原创', en: 'Original' },
            { cn: '动漫', en: 'Anime' },
            { cn: '游戏', en: 'Game' },
            { cn: '小说', en: 'Novel' }
        ];

        // 根据当前模式获取预设标签显示的文本
        const getPresetTagText = (preset) => {
            if (tagLangMode.value === 'cn') return preset.cn;
            if (tagLangMode.value === 'en') return preset.en;
            return `${preset.en} (${preset.cn})`;
        };

        // 点击预设标签时，根据当前语言模式注入对应的文本
        const togglePresetTag = (preset) => {
            const tagToAdd = tagLangMode.value === 'cn' ? preset.cn : (tagLangMode.value === 'en' ? preset.en : preset.en);
            let current = batchInputTags.value.split(',').map(t => t.trim()).filter(t => t);
            if (current.includes(tagToAdd)) {
                current = current.filter(t => t !== tagToAdd);
            } else {
                current.push(tagToAdd);
            }
            batchInputTags.value = current.join(', ');
        };

        // 根据当前语言模式显示任意已存储标签（未知标签原样返回，兼容中英/双语存储格式）
        const displayTagText = (tag) => {
            if (!tag) return tag;
            const preset = presetTagsLibrary.find(p => p.cn === tag || p.en === tag || tag.startsWith(`${p.en} (`));
            if (!preset) return tag;
            if (tagLangMode.value === 'cn') return preset.cn;
            if (tagLangMode.value === 'en') return preset.en;
            return `${preset.en} (${preset.cn})`;
        };

        // ================= 系统/全局标签库支持 =================
        // 1. 系统预设常用标签（可按需增减）
        const defaultSystemTags = ref([
            '原创', '同人', '男性', '女性', '双性', '奇幻', '科幻', 
            '现代', '古代', '克苏鲁', '日常', '战斗', '病娇', '御姐', '萝莉', '少年'
        ]);

        // 2. 动态计算：从当前所有已导入的卡片中聚合提取出所有的标签（形成动态系统标签库，兼容 V1/V2 的 tags 字段）
        const globalAvailableTags = computed(() => {
            const tagSet = new Set(defaultSystemTags.value);
            library.value.forEach(item => {
                if (item.customTags && Array.isArray(item.customTags)) {
                    item.customTags.forEach(t => tagSet.add(t));
                }
                // 如果卡片本身带有的 tags 字段
                const d = item.data?.data || item.data || {};
                if (d.tags && Array.isArray(d.tags)) {
                    d.tags.forEach(t => tagSet.add(t));
                }
            });
            return Array.from(tagSet);
        });

        // 标签快捷栏展开状态
        const isEditingSystemTags = ref(false);

        // 点击系统/全局标签快速添加到当前卡片（写入库项目 customTags，与单卡标签栏共用数据源）
        const addGlobalTag = (tag) => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;
            libItem.customTags = Array.from(new Set([...(libItem.customTags || []), tag]));
        };

        const executeBatchTagSave = () => {
            if (selectedIds.value.length === 0) return;
            const tagsToAdd = batchInputTags.value.split(',').map(t => t.trim()).filter(t => t);
            
            library.value.forEach(item => {
                if (selectedIds.value.includes(item.id)) {
                    if (batchMode.value === 'overwrite') {
                        item.customTags = [...tagsToAdd];
                    } else {
                        item.customTags = Array.from(new Set([...(item.customTags || []), ...tagsToAdd]));
                    }
                }
            });

            nativeAlert(`成功为 ${selectedIds.value.length} 张卡片更新标签！`, 'info');
            showBatchTagModal.value = false;
            batchInputTags.value = '';
            clearSelection();
        };

        // ================= [ 方法：重命名与导出世界书 ] =================

        // 重命名卡片
        const renameCard = async () => {
            if (!cardData.value) return;
            const currentName = safeData.value.name || '未命名';
            const newName = await appPrompt('请输入新的角色名称：', currentName);

            if (newName && newName.trim() !== '' && newName !== currentName) {
                const trimmedName = newName.trim();

                // 更新当前打开卡片的数据
                if (cardData.value.data) {
                    cardData.value.data.name = trimmedName;
                } else {
                    cardData.value.name = trimmedName;
                }

                // 如果该卡片存在于库中，同步更新库中的名称
                const libItem = library.value.find(item => item.data === cardData.value);
                if (libItem) {
                    libItem.name = trimmedName;
                }

                nativeAlert(`已成功重命名为: ${trimmedName}\n(提示: 点击顶部"导出 JSON"可将改名后的文件保存到本地)`, 'info');
            }
        };

        // 导出世界书 (Lorebook) 为独立的 JSON 文件
        const exportWorldbook = () => {
            if (!cardData.value) return;
            const book = safeData.value.character_book;

            if (!book || !book.entries || book.entries.length === 0) {
                return nativeAlert("此卡片没有世界书数据可供导出。", 'warning');
            }

            // 拷贝一份世界书数据
            const wbData = JSON.parse(JSON.stringify(book));
            // 如果原世界书没有名字，用角色名生成一个
            if (!wbData.name) {
                wbData.name = `${safeData.value.name || 'Character'}_Lorebook`;
            }

            const jsonStr = JSON.stringify(wbData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${wbData.name}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        const reset = () => {
            cardData.value = null;
            if (imgUrl.value) URL.revokeObjectURL(imgUrl.value);
            imgUrl.value = null;
        };

        // 删除卡片（安全机制：移入本地回收站 .trash，可手动找回）
        const deleteCard = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;

            const { response } = await window.electronAPI.showMessage({
                type: 'warning', title: '安全删除提示',
                message: `确定要将卡片 [${safeData.value.name}] 移入回收站吗？\n(文件将被放入目录下的 .trash 文件夹中，支持手动找回)`,
                buttons: ['移入回收站', '取消'], cancelId: 1
            });

            if (response === 0) {
                const res = await window.electronAPI.deleteFile(libItem.id);
                if (res.success) {
                    library.value = library.value.filter(item => item.id !== libItem.id);
                    reset();
                    nativeAlert("卡片已安全移入本地回收站。", "info");
                } else {
                    nativeAlert("操作失败: " + res.error, "error");
                }
            }
        };

        // 更新名称绑定 (处理 V1 / V2 差异)
        const updateName = (val) => {
            if (!cardData.value) return;
            if (cardData.value.data) cardData.value.data.name = val;
            else cardData.value.name = val;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem) libItem.name = val;
        };

        // ================= 单卡标签管理 =================
        // 弹窗状态（Electron 不支持 window.prompt，改用自建 Vue 弹窗输入）
        const tagModalVisible = ref(false);
        const tagInput = ref('');
        const tagModalTitle = ref('为当前角色添加新标签');

        // 获取当前正在编辑的卡片的标签
        const activeCardTags = computed(() => {
            const libItem = library.value.find(item => item.data === cardData.value);
            return libItem ? libItem.customTags : [];
        });

        const addSingleTag = () => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;
            tagInput.value = '';
            tagModalTitle.value = `为 ${libItem.name || '当前角色'} 添加新标签`;
            tagModalVisible.value = true;
            // 打开后自动聚焦输入框
            nextTick(() => {
                const el = document.getElementById('single-tag-input');
                if (el) el.focus();
            });
        };

        const confirmSingleTag = () => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem && tagInput.value.trim()) {
                const tags = tagInput.value.split(',').map(t => t.trim()).filter(t => t);
                libItem.customTags = Array.from(new Set([...(libItem.customTags || []), ...tags]));
            }
            tagModalVisible.value = false;
        };

        const closeSingleTagModal = () => {
            tagModalVisible.value = false;
        };

        // ================= 通用输入弹窗（替代 Electron 不支持的 window.prompt） =================
        const promptModalVisible = ref(false);
        const promptModalTitle = ref('');
        const promptInput = ref('');
        const promptModalDefault = ref('');
        let promptModalResolve = null; // 保存 promise 回调

        // 打开通用输入弹窗，返回 Promise<string|null>（取消返回 null）
        const appPrompt = (title, defaultValue = '') => {
            promptModalTitle.value = title;
            promptModalDefault.value = defaultValue;
            promptInput.value = defaultValue;
            promptModalVisible.value = true;
            nextTick(() => {
                const el = document.getElementById('app-prompt-input');
                if (el) el.focus();
            });
            return new Promise((resolve) => {
                promptModalResolve = resolve;
            });
        };

        const confirmPrompt = () => {
            if (promptModalResolve) promptModalResolve(promptInput.value);
            promptModalVisible.value = false;
            promptModalResolve = null;
        };

        const cancelPrompt = () => {
            if (promptModalResolve) promptModalResolve(null);
            promptModalVisible.value = false;
            promptModalResolve = null;
        };

        const removeSingleTag = (tag) => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem) {
                libItem.customTags = (libItem.customTags || []).filter(t => t !== tag);
            }
        };

        // 将可能为 Vue 响应式 Proxy 的卡片数据转为可经 IPC 结构化克隆的纯 JSON 对象
        // （直接从左侧库打开时 cardData.value 是 reactive Proxy，直接传 IPC 会报 "An object could not be cloned"）
        const getPlainCardData = () => {
            if (!cardData.value) return null;
            return JSON.parse(JSON.stringify(cardData.value));
        };

        // 覆盖保存当前卡片到本地原文件（经 saveCard IPC）
        const saveToLocalDisk = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return nativeAlert("未找到原文件路径。");
            try {
                const res = await window.electronAPI.saveCard(libItem.id, getPlainCardData());
                if (res.success) nativeAlert(`成功保存到本地！\n文件：${libItem.id}`, 'info');
                else nativeAlert(`保存失败: ${res.error}`, 'error');
            } catch (e) { nativeAlert(`发生错误: ${e.message}`, 'error'); }
        };

        // 一键导出整合包（主卡 + 独立世界书 + 正则脚本）
        const exportPackage = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return nativeAlert("未找到原文件路径。");
            
            try {
                const res = await window.electronAPI.exportPackage(libItem.id, getPlainCardData());
                if (res.success) {
                    nativeAlert(`整合包导出成功！\n已归档至目录:\n${res.exportDir}`, "info");
                } else if (res.error !== "用户取消操作") {
                    nativeAlert(`导出失败: ${res.error}`, "error");
                }
            } catch (e) {
                nativeAlert(`发生错误: ${e.message}`, "error");
            }
        };

        return {
            theme, toggleTheme,
            isDragging, cardData, imgUrl, tabs, currentTab, currentTabInfo,
            safeData, specVersion, worldbookEntries, regexScripts, formattedJson,
            worldbookExpanded, toggleWorldbookEntry, expandAllWorldbook, collapseAllWorldbook,
            getKeysString, updateEntryKeys,
            getRegexPlacement, handleDrop, handleFileUpload, downloadJson, reset,
            library, openFromLibrary,
            allCategories, customCategories, currentCategoryKey,
            getCategoryDisplayName, addNewCategory, changeCardCategory,
            renameCurrentCategory,
            currentCardCategory, handleCardCategoryChange,
            currentPage, totalPages,
            searchQuery, filteredLibrary, paginatedLibrary,
            selectFixedDirectory, addManualTag, changeCategory, changePage,
            exportLibraryDB, importLibraryDB,
            renameCard, exportWorldbook,
            selectedIds, handleCardClick, toggleSelection, clearSelection,
            isMultiSelectMode, contextMenu, openContextMenu, closeContextMenu,
            quickMoveGroup, exportCard, deleteCardItem,
            batchChangeCategory, batchAddTag,
            batchChangeCategoryModal, batchExportSelected,
            showBatchTagModal, batchInputTags, batchMode, presetTagsLibrary,
            tagLangMode, toggleTagLangMode, getPresetTagText, displayTagText,
            togglePresetTag, executeBatchTagSave,
            defaultSystemTags, globalAvailableTags, isEditingSystemTags, addGlobalTag,
            chatHistory, chatInput, isChatting, apiEndpoint, apiKey, chatContainer,
            isChatRenderMode, // 【新增暴露】渲染/代码模式开关
            sendMessage, clearChat,
            showGraph, graphContainer, openGraph, closeGraph,
            graphLayoutMode, graphSearchKeyword, minLinkWeight,
            isolateCurrentGroup, edgeFilters,
            updateGraphLayout, renderGraph,
            estimateTokens, cardTokenStats,
            showGlobalAssetModal, globalAssetTab, globalAllWorldbooks, globalAllRegexScripts,
            renderHTML, deleteCard, updateName, saveToLocalDisk, exportPackage,
            activeCardTags, addSingleTag, removeSingleTag,
            tagModalVisible, tagInput, tagModalTitle,
            confirmSingleTag, closeSingleTagModal,
            promptModalVisible, promptModalTitle, promptInput,
            confirmPrompt, cancelPrompt
        };
    }
});

// ================= Vue 全局错误兜底 =================
app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue 错误]', info, err);
};

app.mount('#app');

window.__app = app; // 【临时】截图脚本暴露 Vue 实例（用后移除）
