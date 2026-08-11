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

        // ================= [ 全局界面与字体设置 ] =================
        const showSettingsModal = ref(false);

        // 从 localStorage 读取历史设置，如果没有则使用默认值（防御性读取，localStorage 不可用时回退默认）
        const appSettings = ref((() => {
            const defaults = {
                // 注：内部用单引号，与设置面板下拉选项的值保持一致，确保初始选中项正确
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif",
                fontSize: 14,           // 工作区字号（右侧编辑区：世界书/设定/聊天气泡/RAW JSON）
                fontWeight: 'normal',   // 可选 'normal' 或 '500' (中等加粗)
                uiFontSize: 13          // 界面字号（顶部导航/侧边栏/菜单/弹窗）
            };
            let loadedSettings = defaults;
            try { loadedSettings = JSON.parse(localStorage.getItem('appSettings')) || defaults; } catch (e) { /* 忽略 */ }
            // 兼容旧存档：缺失双轨字号时补默认值
            if (loadedSettings.uiFontSize === undefined) loadedSettings.uiFontSize = 13;
            if (loadedSettings.fontSize === undefined) loadedSettings.fontSize = 14;
            return loadedSettings;
        })());

        // 监听设置变化，自动保存到本地
        watch(appSettings, (newVal) => {
            try { localStorage.setItem('appSettings', JSON.stringify(newVal)); } catch (e) { /* 忽略 */ }
        }, { deep: true });

        // 字体设置应用：fontFamily/fontWeight 全局生效于 body；
        // 双轨字号：--ui-fs 接管外围界面（导航/侧边栏/菜单/弹窗），--workspace-fs 接管右侧工作区
        // （Vue 不会编译挂载容器 #app 自身的 :style 绑定，故此处以 documentElement 兜底保证变量生效）
        watch(appSettings, (s) => {
            document.body.style.fontFamily = s.fontFamily;
            document.body.style.fontWeight = s.fontWeight;
            document.documentElement.style.setProperty('--ui-fs', (s.uiFontSize || 13) + 'px');
            document.documentElement.style.setProperty('--workspace-fs', (s.fontSize || 14) + 'px');
        }, { deep: true, immediate: true });

        // ================= [ 实验功能与酒馆联动 ] =================
        const showExperimentalMenu = ref(false); // 控制实验菜单的展开/收起

        // 给设置里加一个酒馆API地址的配置项 (兼容旧设置)
        if (appSettings.value.tavernUrl === undefined) {
            appSettings.value.tavernUrl = 'http://127.0.0.1:8000';
        }

        // 推送到酒馆的具体方法
        const pushToTavern = async () => {
            showExperimentalMenu.value = false; // 点击后关闭下拉菜单

            if (selectedIds.value.length === 0) {
                return nativeAlert('请先在列表中勾选要推送到酒馆的角色卡！', 'warning');
            }

            // 询问酒馆地址（Electron 中 window.prompt 静默失效，改用通用弹窗 appPrompt）
            const currentUrl = appSettings.value.tavernUrl;
            const inputUrl = await appPrompt('🍻 请输入您的酒馆 (SillyTavern) 根地址：\n(确保酒馆已开启 API 扩展功能)', currentUrl);

            if (!inputUrl) return; // 用户取消
            appSettings.value.tavernUrl = inputUrl; // 保存最新地址

            // 进入推送流程
            const targetIds = [...selectedIds.value];
            let successCount = 0;

            for (const id of targetIds) {
                const item = library.value.find(c => c.id === id);
                if (!item) continue;

                try {
                    console.log(`正在推送 [${item.name}] 到酒馆: ${inputUrl}`);

                    // ==========================================
                    // ⚠️ 这里是对接酒馆 API 的核心位置
                    // 酒馆通常通过 POST /api/characters/import 接收卡片
                    // 如果你使用的是 Electron，建议在这里调用 window.electronAPI
                    // 例如： await window.electronAPI.pushToSillyTavern(inputUrl, item.data);
                    // ==========================================

                    // 模拟网络请求延迟
                    await new Promise(resolve => setTimeout(resolve, 500));
                    successCount++;

                } catch (error) {
                    console.error(`推送 [${item.name}] 失败:`, error);
                }
            }

            nativeAlert(`🎉 推送完成！共将 ${successCount} 张角色卡成功发送至酒馆！\n请前往酒馆刷新角色列表查看。`, 'info');

            // 可选：推送完成后清空勾选
            // clearSelection();
        };

        // ================= [ 顶部菜单系统：视图选项与工具函数 ] =================
        // 视图菜单控制状态（控制 Raw JSON 页签 / 立绘预览 / Token 分析栏的显隐）
        const viewOptions = ref({
            showRawJson: true,        // 是否显示 Raw JSON 页签
            showAvatarPreview: true,  // 是否显示顶部立绘预览
            showTokenStats: true,     // 是否显示 Token 消耗分析栏
            showWorldbook: true,      // 是否显示世界书页签
            showRegex: true           // 是否显示正则脚本页签
        });

        // 导入单张/多张角色卡文件（经隐藏文件输入，追加写入当前库）
        const importFileInput = ref(null);
        const handleImportFiles = async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = ''; // 允许重复选择同一文件
            let added = 0;
            for (const f of files) {
                try {
                    // Electron 33 起 File.path 已移除，经 preload 获取真实绝对路径
                    const realPath = window.electronAPI ? window.electronAPI.getPathForFile(f) : null;
                    const isImage = /\.(png|webp)$/i.test(f.name);
                    const file = {
                        name: f.name,
                        path: realPath || f.name,
                        url: isImage ? URL.createObjectURL(f) : null
                    };
                    if (await parseAndAddCard(file)) added++;
                } catch (err) {
                    console.warn(`导入失败 ${f.name}`, err);
                }
            }
            if (added > 0) nativeAlert(`成功导入 ${added} 张角色卡！`, 'info');
            else nativeAlert('未识别到有效的角色卡文件。', 'warning');
        };
        const importCards = () => { if (importFileInput.value) importFileInput.value.click(); };

        // 全选当前过滤列表中的所有卡片（并自动进入多选模式）
        const selectAllCards = () => {
            if (!isMultiSelectMode.value) isMultiSelectMode.value = true;
            selectedIds.value = filteredLibrary.value.map(i => i.id);
            nativeAlert(`已全选 ${selectedIds.value.length} 张卡片。`, 'info');
        };

        // 清理全库所有卡片中的无效标签（空字符串/纯空白），并物理落盘
        const cleanGlobalTagsPrompt = async () => {
            const modifiedItems = [];
            library.value.forEach(item => {
                let isModified = false;
                const cleanArr = (arr) => arr.filter(t => t && String(t).trim() !== '');
                if (Array.isArray(item.customTags)) {
                    const filtered = cleanArr(item.customTags);
                    if (filtered.length !== item.customTags.length) { item.customTags = filtered; isModified = true; }
                }
                const d = item.data?.data || item.data || {};
                if (Array.isArray(d.tags)) {
                    const filtered = cleanArr(d.tags);
                    if (filtered.length !== d.tags.length) { d.tags = filtered; isModified = true; }
                }
                if (isModified) modifiedItems.push(item);
            });

            if (modifiedItems.length === 0) {
                return nativeAlert('库中未发现无效标签（空字符串等）。', 'info');
            }

            let saved = 0;
            for (const item of modifiedItems) {
                try {
                    const res = await window.electronAPI.saveCard(item.path, JSON.parse(JSON.stringify(item.data)));
                    if (res && res.success) saved++;
                } catch (err) { console.error(`清理无效标签保存失败 [${item.name}]`, err); }
            }
            nativeAlert(`已清理 ${modifiedItems.length} 张卡片中的无效标签，并物理保存 ${saved} 张。`, 'info');
        };

        // 用系统资源管理器打开当前库的快照 / 回收站文件夹
        const openBakFolder = async () => {
            if (!currentFolderPath.value) return nativeAlert('请先打开角色库文件夹。', 'warning');
            const res = await window.electronAPI.openPath(currentFolderPath.value + '\\.bak_history');
            if (!res.success) nativeAlert(res.error || '打开失败', 'error');
        };
        const openTrashFolder = async () => {
            if (!currentFolderPath.value) return nativeAlert('请先打开角色库文件夹。', 'warning');
            const res = await window.electronAPI.openPath(currentFolderPath.value + '\\.trash');
            if (!res.success) nativeAlert(res.error || '打开失败', 'error');
        };

        // 打开聊天测卡（映射到聊天 Tab）
        const openChatTab = () => { currentTab.value = 'chat'; initChat(); };

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

        // API 模型名称（OpenAI 兼容格式的 model 字段；本地 LM Studio/Ollama 通常忽略，可留空回退 local-model）
        let savedApiModel = '';
        try { savedApiModel = localStorage.getItem('stc-api-model') || ''; } catch (e) { /* 忽略 */ }
        const apiModel = ref(savedApiModel);

        // 生成 API 请求的 model 字段：优先使用配置的模型名称，留空时回退到 local-model
        const resolveApiModel = () => (apiModel.value && apiModel.value.trim()) ? apiModel.value.trim() : 'local-model';

        // 模型名称变化时自动持久化到 localStorage（与 apiKey 懒保存互补，保证设置即存）
        watch(apiModel, (v) => {
            try { localStorage.setItem('stc-api-model', v || ''); } catch (e) { /* 忽略 */ }
        });

        // ================= [ API 模型列表拉取（GET /v1/models，经主进程转发绕过 CORS）] =================
        const availableModels = ref([]);      // 拉取到的服务端模型列表
        const isFetchingModels = ref(false);  // 是否正在拉取
        const fetchModelStatus = ref('');     // 拉取状态提示

        const fetchAvailableModels = async () => {
            const ep = (apiEndpoint.value || '').trim();
            if (!ep) {
                nativeAlert('请先输入有效的 API Endpoint 地址！', 'warning');
                return;
            }
            isFetchingModels.value = true;
            fetchModelStatus.value = '⏳ 正在连接服务端拉取模型列表...';
            availableModels.value = [];
            try {
                const authKey = (apiKey.value && apiKey.value.trim()) ? apiKey.value : 'test-key';
                const result = await window.electronAPI.fetchModels(ep, authKey);
                if (!result || !result.success) {
                    fetchModelStatus.value = `❌ 拉取失败: ${(result && result.error) || '未知错误'}`;
                    return;
                }
                // 兼容 OpenAI / LM Studio 标准格式 { data: [{ id }] } 与裸数组
                const raw = result.data;
                let modelList = [];
                if (Array.isArray(raw.data)) {
                    modelList = raw.data.map(m => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
                } else if (Array.isArray(raw)) {
                    modelList = raw.map(m => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
                }
                if (modelList.length > 0) {
                    availableModels.value = modelList;
                    fetchModelStatus.value = `✅ 成功获取 ${modelList.length} 个模型！`;
                    if (!modelList.includes(apiModel.value)) {
                        apiModel.value = modelList[0]; // 当前模型不在列表中时自动选中第一个
                    }
                } else {
                    fetchModelStatus.value = '⚠️ 接口已响应，但未抓取到有效模型列表';
                }
            } catch (err) {
                console.error('拉取模型列表失败:', err);
                fetchModelStatus.value = `❌ 拉取失败: ${err.message}`;
            } finally {
                isFetchingModels.value = false;
            }
        };

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
        // 世界书条目稳定标识：为每个条目对象分配唯一 uid（v-for :key 使用，避免增删时节点错位）
        const entryUidMap = new Map();
        let entryUidCounter = 0;
        const getEntryUid = (entry) => {
            if (!entry || typeof entry !== 'object') return 'entry-' + (++entryUidCounter);
            if (!entryUidMap.has(entry)) entryUidMap.set(entry, 'entry-' + (++entryUidCounter));
            return entryUidMap.get(entry);
        };

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

        // 【修复】清洗 Markdown 代码块标记（```html、```yaml、```json 等），
        // 防止渲染模式下这些围栏标记被当成普通文本暴露在气泡顶部/底部
        const cleanMarkdownFences = (text) => {
            if (!text) return '';
            return text
                .replace(/```(html|yaml|json|xml|css|js)?\n?/gi, '') // 洗掉开头的 ```html、```yaml 等
                .replace(/```/g, ''); // 洗掉结尾的 ```
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
                model: resolveApiModel(), // 优先使用配置的模型名称，留空回退 local-model
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
            window.removeEventListener('resize', handleGraphResize); // 解绑 resize，防止泄漏
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

        // ================= [ 全屏放大文本阅读/编辑器 ] =================
        const showTextModal = ref(false);
        const textModalTitle = ref('');
        const textModalContent = ref('');
        const textModalTargetRef = ref(null);
        const textModalFontSize = ref(14); // 默认字号 14px

        // 打开大文本弹窗
        const openTextModal = (title, targetObj, fieldName) => {
            textModalTitle.value = title;
            textModalTargetRef.value = { obj: targetObj, field: fieldName };
            textModalContent.value = targetObj[fieldName] || '';
            showTextModal.value = true;
        };

        // 保存大文本修改并同步回卡片数据
        const saveTextModal = () => {
            if (textModalTargetRef.value) {
                const { obj, field } = textModalTargetRef.value;
                obj[field] = textModalContent.value;
            }
            showTextModal.value = false;
        };

        // ================= [ 高清立绘大图预览 Modal ] =================
        const showImageModal = ref(false);
        const previewImageUrl = ref('');

        const openImageModal = (url) => {
            if (!url) return;
            previewImageUrl.value = url;
            showImageModal.value = true;
        };

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

        // 导航标签（含图标与数量徽标；Raw JSON 页签可按视图设置隐藏）
        const tabs = computed(() => {
            const list = [
                { id: 'basic', name: '基础设定', icon: '📖' },
                { id: 'advanced', name: '进阶设定', icon: '🛠️' },
                { id: 'worldbook', name: '世界书', icon: '🌍', badge: worldbookEntries.value.length || null },
                { id: 'regex', name: '正则脚本', icon: '⚙️', badge: regexScripts.value.length || null },
                { id: 'chat', name: '聊天测试', icon: '💬', action: initChat },
                { id: 'raw', name: 'Raw JSON', icon: '💻' }
            ];
            return list.filter(t => {
                if (t.id === 'raw' && !viewOptions.value.showRawJson) return false;
                if (t.id === 'worldbook' && !viewOptions.value.showWorldbook) return false;
                if (t.id === 'regex' && !viewOptions.value.showRegex) return false;
                return true;
            });
        });

        const currentTabInfo = computed(() => tabs.value.find(t => t.id === currentTab.value) || tabs.value[0]);

        const formattedJson = computed(() => {
            return cardData.value ? JSON.stringify(cardData.value, null, 2) : '';
        });

        // ================= [ 计算属性 (分类与分页) ] =================
        const searchQuery = ref(''); // 搜索框绑定的关键词

        // ================= 全局全文检索与深度过滤引擎（强壮空值保护版，兼容 V1/V2 与多语言分组 Key） =================
        const filteredLibrary = computed(() => {
            return library.value.filter(card => {
                // 1. 分组过滤（含特殊快捷过滤：带世界书 / 带正则脚本）
                let matchesCategory = true;
                if (currentCategoryKey.value !== 'all') {
                    if (currentCategoryKey.value === 'has_lorebook') {
                        // 📖 带世界书：卡片内嵌世界书且有条目
                        const d = card.data?.data || card.data || {};
                        const book = d.character_book || card.data?.character_book || {};
                        const entries = book.entries || (Array.isArray(book) ? book : []);
                        matchesCategory = (entries || []).length > 0;
                    } else if (currentCategoryKey.value === 'has_regex') {
                        // ⚡ 带正则脚本：卡片内嵌正则脚本
                        const d = card.data?.data || card.data || {};
                        const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                        matchesCategory = (regex || []).length > 0;
                    } else {
                        const targetCat = allCategories.value.find(c => c.key === currentCategoryKey.value);
                        if (targetCat) {
                            matchesCategory = card.category === targetCat.cn || card.category === targetCat.en || card.category === targetCat.key;
                        }
                    }
                }

                // 2. 关键词/全文检索安全过滤（无关键词时仅按分组过滤）
                const query = (searchQuery.value || '').toLowerCase().trim();
                if (!query) return matchesCategory;

                // 安全提取各项字段，防止空值引发 .toLowerCase() 崩溃
                const d = card.data?.data || card.data || {};
                const name = (card.name || d.name || '').toLowerCase();
                const creator = (card.creator || d.creator || '').toLowerCase();

                // 安全处理 tags 字段（兼容数组、字符串、甚至 undefined/null；同时覆盖 customTags 与自带 tags）
                let tagsList = [];
                const safeCollectTags = (t) => {
                    if (Array.isArray(t)) {
                        tagsList = tagsList.concat(t);
                    } else if (typeof t === 'string' && t.trim() !== '') {
                        tagsList = tagsList.concat(t.split(',').map(x => x.trim()));
                    }
                };
                safeCollectTags(card.tags);
                safeCollectTags(card.customTags);
                safeCollectTags(d.tags);
                const tagsMatch = tagsList.some(t => (t || '').toLowerCase().includes(query));

                const desc = (d.description || card.description || '').toLowerCase();
                const personality = (d.personality || card.personality || '').toLowerCase();
                const firstMes = (d.first_mes || card.first_mes || '').toLowerCase();

                // 世界书深度检索安全保护（条目名称 / 注释 / 关键词 / 正文）
                let wbMatch = false;
                const book = d.character_book || card.character_book || {};
                const wbEntries = book.entries || (Array.isArray(book) ? book : []);
                if (Array.isArray(wbEntries)) {
                    wbMatch = wbEntries.some(entry => {
                        const eName = (entry.name || entry.comment || '').toLowerCase();
                        const eKeys = Array.isArray(entry.keys) ? entry.keys.join(' ') : String(entry.keys || '').toLowerCase();
                        const eContent = (entry.content || '').toLowerCase();
                        return eName.includes(query) || eKeys.includes(query) || eContent.includes(query);
                    });
                }

                const isMatch = name.includes(query) || creator.includes(query) || tagsMatch ||
                                desc.includes(query) || personality.includes(query) || firstMes.includes(query) || wbMatch;
                return matchesCategory && isMatch;
            });
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

        // 读取并解析单张卡片文件，成功则加入库中（供文件夹加载 / 磁盘扫描共用）
        // 判断 JSON 数据是否为真正的角色卡（V2/V3 或 V1 格式），
        // 过滤掉 config.json 等非卡片文件，防止污染卡片库
        const isCharacterCardData = (data) => {
            if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
            // V2/V3：spec 标记（chara_card_v2/v3）且带 data 对象
            if (typeof data.spec === 'string' && /^chara_card_v[23]$/i.test(data.spec.trim())) {
                return !!(data.data && typeof data.data === 'object');
            }
            // V1 / Character.ai 格式：必须有角色名 + 至少一个内容字段
            if (typeof data.name === 'string' && data.name.trim() !== '') {
                return typeof data.description === 'string' ||
                       typeof data.personality === 'string' ||
                       typeof data.first_mes === 'string' ||
                       typeof data.scenario === 'string' ||
                       typeof data.mes_example === 'string';
            }
            return false;
        };

        const parseAndAddCard = async (file) => {
            try {
                // 去重拦截：同一路径的卡片已在库中则跳过（防止重复扫描/重复导入产生“影分身”）
                if (library.value.some(c => c.path === file.path)) {
                    return false;
                }

                let parsedData = null;

                if (file.name.toLowerCase().endsWith('.json')) {
                    // 读取本地 JSON 文本
                    const text = await window.electronAPI.readText(file.path);
                    const parsed = JSON.parse(text);
                    // 内容校验：非角色卡的 JSON（如 config.json）直接跳过，不进入解析与入库
                    if (!isCharacterCardData(parsed)) {
                        console.warn(`跳过非角色卡 JSON: ${file.name}`);
                        return false;
                    }
                    parsedData = parsed;
                } else {
                    // 读取本地图片 Buffer
                    const buffer = await window.electronAPI.readBuffer(file.path);
                    // 复用解析函数（Buffer 经 IPC 传递后为 Uint8Array，取 .buffer 为 ArrayBuffer）
                    parsedData = parsePNGChunk(buffer.buffer) || deepScanForJSON(buffer.buffer);
                }

                if (parsedData) {
                    const normalized = normalizeCardData(parsedData);
                    // 前端专用唯一随机 ID（时间戳 + 随机串），保证 Vue key / 多选 / 图谱标识永不冲突
                    const cardId = 'card_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
                    const cardInfo = {
                        id: cardId,
                        path: file.path, // 保留真实绝对路径，供保存/删除/导出等文件操作使用
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
                    return true;
                }
            } catch (err) {
                console.warn(`跳过文件 ${file.name}`, err);
            }
            return false;
        };

        // 统一处理主进程传来的文件列表
        const processElectronFiles = async (folderData) => {
            if (!folderData || !folderData.files) return;

            currentFolderPath.value = folderData.folderPath;
            library.value = []; // 清空当前库
            let addedCount = 0;

            for (const file of folderData.files) {
                if (await parseAndAddCard(file)) addedCount++;
            }
            console.log(`成功从 ${folderData.folderPath} 加载了 ${addedCount} 张卡片`);
        };

        // ================= [ 磁盘卡片扫描系统 ] =================
        const isScanningDisk = ref(false);
        const diskScanProgress = ref({ status: '准备就绪', count: 0 });
        const useSizeFilter = ref(true); // 默认开启体积过滤（跳过 <40KB 的贴图/图标）

        // 将扫描到的绝对路径列表导入到库中（追加模式，不清空现有库）
        const importScanPaths = async (paths) => {
            let added = 0;
            for (const absPath of paths) {
                const name = absPath.split(/[\\/]/).pop() || absPath;
                const isImage = /\.(png|webp)$/i.test(name);
                const file = {
                    name,
                    path: absPath,
                    url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null
                };
                if (await parseAndAddCard(file)) added++;
            }
            return added;
        };

        // 核心扫描执行器
        const runDiskScan = async (mode) => {
            if (!window.electronAPI) {
                return nativeAlert('该功能需要 Electron 桌面环境，请使用 npm start 启动应用。', 'warning');
            }
            isScanningDisk.value = true;
            diskScanProgress.value = { status: '正在初始化扫描引擎...', count: 0 };

            let foundFiles = [];

            // 监听底层发来的扫描进度心跳
            window.electronAPI.onScanProgress((data) => {
                diskScanProgress.value = data;
            });

            try {
                if (mode === 'specific') {
                    // 1. 指定盘符/文件夹扫描（主进程弹出原生目录选择器），传递体积过滤开关
                    const result = await window.electronAPI.scanTargetFolder(null, useSizeFilter.value);
                    if (result && result.files) foundFiles = result.files;

                } else if (mode === 'all') {
                    // 2. 暴力全盘扫描
                    const drives = await window.electronAPI.getWindowsDrives();
                    diskScanProgress.value.status = `共检测到 ${drives.length} 个本地磁盘，准备遍历...`;

                    for (const drive of drives) {
                        diskScanProgress.value.status = `正在深度扫描磁盘: ${drive}`;
                        const result = await window.electronAPI.scanTargetFolder(drive, useSizeFilter.value);
                        if (result && result.files) {
                            foundFiles = foundFiles.concat(result.files);
                        }
                    }
                }

                if (foundFiles.length === 0) {
                    nativeAlert('扫描结束，未在指定区域发现新的 PNG 角色卡文件。', 'info');
                } else {
                    diskScanProgress.value.status = `✅ 扫描完成！共发现 ${foundFiles.length} 张卡片，准备导入...`;

                    // 将扫描到的卡片路径逐个解析并追加进库（未识别的文件自动跳过）
                    const addedCount = await importScanPaths(foundFiles);
                    diskScanProgress.value.status = `✅ 已成功导入 ${addedCount} 张角色卡！`;

                    nativeAlert(`全盘/指定扫描完成！\n共提取 ${foundFiles.length} 个角色卡文件，成功导入 ${addedCount} 张。\n（无法识别的文件已自动跳过）`, 'info');
                }
            } catch (err) {
                console.error("扫描失败:", err);
                nativeAlert('扫描过程中发生异常，详情请查看控制台。', 'error');
            } finally {
                isScanningDisk.value = false;
            }
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

            // 全局快捷键：Ctrl+S 保存 / Ctrl+O 打开角色库 / Ctrl+I 导入卡片
            const handleGlobalKeys = (e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const k = e.key.toLowerCase();
                if (k === 's') { e.preventDefault(); saveToLocalDisk(); }
                else if (k === 'o') { e.preventDefault(); selectFixedDirectory(); }
                else if (k === 'i') { e.preventDefault(); importCards(); }
                else if (k === 'a') {
                    // 批量模式下全选（输入框内不拦截，保留原生全选文本能力）
                    const tag = document.activeElement?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                    e.preventDefault();
                    selectAllCards();
                }
            };
            window.addEventListener('keydown', handleGlobalKeys);

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
                const res = await window.electronAPI.exportBatchPackage([item.path]);
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
                const res = await window.electronAPI.deleteFile(item.path);
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
                // selectedIds 现在存的是前端唯一随机 ID，需映射回真实文件路径再交给主进程
                const exportPaths = library.value
                    .filter(item => selectedIds.value.includes(item.id))
                    .map(item => item.path);
                const res = await window.electronAPI.exportBatchPackage(exportPaths);
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

        const newGlobalTagInput = ref(''); // 用于绑定直接新增标签的输入框

        // 2. 动态计算：从当前所有已导入的卡片中聚合提取出所有的标签
        const globalAvailableTags = computed(() => {
            const tagSet = new Set(defaultSystemTags.value);
            library.value.forEach(item => {
                // 提取自定义标签
                if (item.customTags && Array.isArray(item.customTags)) {
                    item.customTags.forEach(t => { if (t) tagSet.add(t); });
                }
                // 提取卡片原生自带标签（兼顾旧版卡片的字符串格式）
                const d = item.data?.data || item.data || {};
                if (d.tags) {
                    if (Array.isArray(d.tags)) {
                        d.tags.forEach(t => { if (t) tagSet.add(t); });
                    } else if (typeof d.tags === 'string' && d.tags.trim() !== '') {
                        d.tags.split(',').forEach(t => tagSet.add(t.trim()));
                    }
                }
            });
            return Array.from(tagSet);
        });

        // 3. 允许在系统/常用标签栏直接添加新标签
        const addTagToGlobalPool = () => {
            const val = newGlobalTagInput.value.trim();
            if (val && !defaultSystemTags.value.includes(val)) {
                defaultSystemTags.value.push(val);
                newGlobalTagInput.value = '';
            }
        };

        // 4. 彻底清洗：点击 × 删除系统标签，从所有卡片中洗掉脏标签，并将受影响的卡片物理落盘
        const removeTagFromGlobalPool = async (tagToRemove) => {
            // 从预设池移除
            defaultSystemTags.value = defaultSystemTags.value.filter(t => t !== tagToRemove);

            // 深度清洗库中所有卡片的该标签，并记录被修改的卡片
            const modifiedItems = [];
            library.value.forEach(item => {
                let isModified = false;

                if (Array.isArray(item.customTags)) {
                    const filtered = item.customTags.filter(t => t !== tagToRemove);
                    if (filtered.length !== item.customTags.length) { item.customTags = filtered; isModified = true; }
                }

                const d = item.data?.data || item.data || {};
                if (Array.isArray(d.tags)) {
                    const filtered = d.tags.filter(t => t !== tagToRemove);
                    if (filtered.length !== d.tags.length) { d.tags = filtered; isModified = true; }
                } else if (typeof d.tags === 'string') {
                    const cleaned = d.tags.split(',').map(t => t.trim()).filter(t => t && t !== tagToRemove).join(', ');
                    if (cleaned !== d.tags) { d.tags = cleaned; isModified = true; }
                }

                if (isModified) modifiedItems.push(item);
            });

            // 将受影响的卡片物理保存到本地（防止重启/重新扫描后脏标签复活）
            let savedCount = 0;
            for (const item of modifiedItems) {
                try {
                    // 剥离 Vue 响应式 Proxy，经 IPC 写回物理文件
                    const plainData = JSON.parse(JSON.stringify(item.data));
                    const res = await window.electronAPI.saveCard(item.path, plainData);
                    if (res && res.success) savedCount++;
                    else console.warn(`清洗标签后保存失败 [${item.name}]:`, res && res.error);
                } catch (e) {
                    console.error(`清洗标签后物理保存失败 [${item.name}]:`, e);
                }
            }

            nativeAlert(`已从系统库彻底清洗标签：[${tagToRemove}]\n${savedCount > 0 ? `并已将 ${savedCount} 张受影响卡片物理保存到本地！` : '（库中未发现残留该标签的卡片）'}`, 'info');
        };

        // 标签快捷栏展开状态（点击展开/收起系统标签面板）
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

        // ================= [ AI 智能批量打标系统 ] =================
        const showAITagModal = ref(false);
        const aiTagMode = ref('candidate'); // 'candidate' 候选池模式 或 'free' 自由发散模式
        const aiCandidateTags = ref('');
        const aiCustomPrompt = ref('你是一个专业的角色卡分析助手。请阅读以下角色设定，提取最符合角色的标签。请严格只返回一个 JSON 数组格式（例如：["标签1", "标签2"]），绝对不要返回任何其他说明文字。');
        const aiTaggingProgress = ref({ current: 0, total: 0, status: '' });
        const isAITagging = ref(false);

        // 打开 AI 打标弹窗
        const openAITagModal = () => {
            if (selectedIds.value.length === 0) return;
            showAITagModal.value = true;
            aiTaggingProgress.value = { current: 0, total: selectedIds.value.length, status: '等待开始...' };
        };

        // 执行批量打标任务
        const startAITagging = async () => {
            if (isAITagging.value) return;
            if (aiTagMode.value === 'candidate' && !aiCandidateTags.value.trim()) {
                return nativeAlert('候选模式下，必须在输入框中提供你的候选标签池！', 'warning');
            }

            isAITagging.value = true;
            const targetIds = [...selectedIds.value];
            aiTaggingProgress.value.total = targetIds.length;
            
            for (let i = 0; i < targetIds.length; i++) {
                const id = targetIds[i];
                const item = library.value.find(c => c.id === id);
                if (!item) continue;

                aiTaggingProgress.value.current = i + 1;
                aiTaggingProgress.value.status = `正在让 AI 分析: ${item.name}...`;

                try {
                    const d = item.data?.data || item.data || {};
                    // 提取核心描述（为了防止超长溢出，可以稍微截断）
                    const desc = (d.description || '').substring(0, 2000);
                    const pers = (d.personality || '').substring(0, 1000);
                    const charInfo = `【角色名】: ${item.name || '未知'}\n【设定描述】: ${desc}\n【性格特征】: ${pers}`;

                    let finalPrompt = aiCustomPrompt.value;
                    if (aiTagMode.value === 'candidate') {
                        finalPrompt += `\n\n【必须严格从以下候选标签池中选择（最多5个）】: ${aiCandidateTags.value}`;
                    } else {
                        finalPrompt += `\n\n【自由发散模式】请根据角色内容自由提取符合角色的精准标签（最多5个）。`;
                    }
                    finalPrompt += `\n\n=== 角色数据 ===\n${charInfo}`;

                    const payload = {
                        model: resolveApiModel(), // 优先使用配置的模型名称，留空回退 local-model
                        messages: [
                            { role: 'system', content: '你是一个严格输出 JSON 数组的标签提取助手。' },
                            { role: 'user', content: finalPrompt }
                        ],
                        temperature: 0.3, // 使用低温度保证输出格式的稳定性
                        max_tokens: 150
                    };

                    const authKey = (apiKey.value && apiKey.value.trim()) ? apiKey.value : 'test-key';
                    const result = await window.electronAPI.sendChatMessage(apiEndpoint.value, payload, authKey);

                    if (result.success && result.data.choices && result.data.choices.length > 0) {
                        const reply = result.data.choices[0].message.content.trim();
                        let newTags = [];
                        
                        try {
                            // 暴力清洗 AI 可能返回的 markdown 语法 (例如 ```json ... ```)
                            let jsonStr = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
                            // 尝试精准定位中括号
                            const firstBracket = jsonStr.indexOf('[');
                            const lastBracket = jsonStr.lastIndexOf(']');
                            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                                jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
                            }
                            newTags = JSON.parse(jsonStr);
                        } catch (err) {
                            console.warn(`[${item.name}] JSON 解析失败，尝试强制分割 fallback:`, reply);
                            // 如果 AI 不听话没给 JSON，用 fallback 方案按标点符号暴力拆分
                            newTags = reply.replace(/[\[\]"'`]/g, '').split(/[,，、\n]/).map(t => t.trim()).filter(Boolean);
                        }

                        // 将成功提取的标签注入到卡片中
                        if (Array.isArray(newTags) && newTags.length > 0) {
                            item.customTags = Array.from(new Set([...(item.customTags || []), ...newTags]));
                        }
                    }
                } catch (e) {
                    console.error(`AI 打标异常 [${item.name}]:`, e);
                }
            }

            aiTaggingProgress.value.status = '✅ 全部打标完成！';
            isAITagging.value = false;
            nativeAlert(`成功为 ${targetIds.length} 张卡片完成 AI 智能打标！`, 'info');
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
                const res = await window.electronAPI.deleteFile(libItem.path);
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
                const res = await window.electronAPI.saveCard(libItem.path, getPlainCardData());
                if (res.success) nativeAlert(`成功保存到本地！\n文件：${libItem.path}`, 'info');
                else nativeAlert(`保存失败: ${res.error}`, 'error');
            } catch (e) { nativeAlert(`发生错误: ${e.message}`, 'error'); }
        };

        // 一键导出整合包（主卡 + 独立世界书 + 正则脚本）
        const exportPackage = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return nativeAlert("未找到原文件路径。");
            
            try {
                const res = await window.electronAPI.exportPackage(libItem.path, getPlainCardData());
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
            theme, toggleTheme, appSettings, showSettingsModal,
            showExperimentalMenu, pushToTavern,
            viewOptions, importFileInput, handleImportFiles, importCards, selectAllCards, cleanGlobalTagsPrompt,
            openBakFolder, openTrashFolder, openChatTab,
            isScanningDisk, diskScanProgress, useSizeFilter, runDiskScan,
            isDragging, cardData, imgUrl, tabs, currentTab, currentTabInfo,
            safeData, specVersion, worldbookEntries, getEntryUid, regexScripts, formattedJson,
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
            showAITagModal, aiTagMode, aiCandidateTags, aiCustomPrompt, aiTaggingProgress, isAITagging, openAITagModal, startAITagging,
            defaultSystemTags, globalAvailableTags, newGlobalTagInput, addTagToGlobalPool, removeTagFromGlobalPool,
            isEditingSystemTags, addGlobalTag,
            chatHistory, chatInput, isChatting, apiEndpoint, apiKey, apiModel, chatContainer,
            availableModels, isFetchingModels, fetchModelStatus, fetchAvailableModels,
            isChatRenderMode, // 【新增暴露】渲染/代码模式开关
            sendMessage, clearChat,
            showGraph, graphContainer, openGraph, closeGraph,
            graphLayoutMode, graphSearchKeyword, minLinkWeight,
            isolateCurrentGroup, edgeFilters,
            updateGraphLayout, renderGraph,
            estimateTokens, cardTokenStats,
            showTextModal, textModalTitle, textModalContent, textModalFontSize, openTextModal, saveTextModal,
            showImageModal, previewImageUrl, openImageModal,
            showGlobalAssetModal, globalAssetTab, globalAllWorldbooks, globalAllRegexScripts,
            renderHTML, cleanMarkdownFences, deleteCard, updateName, saveToLocalDisk, exportPackage,
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
