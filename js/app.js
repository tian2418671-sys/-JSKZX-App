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
        // 主题状态（localStorage 在自定义协议下可能不可用，做防御性读取；默认暗夜极客）
        let savedTheme = 'dark';
        try { savedTheme = localStorage.getItem('stc-theme') || 'dark'; } catch (e) { /* 忽略 */ }
        const theme = ref(savedTheme);

        const isAppLoading = ref(true); // 应用首屏加载状态（数据就绪后淡出）

        // ================= [ 全局界面与字体设置 ] =================
        const showSettingsModal = ref(false);

        // =========================================================
        // 🖥️ 智能屏幕分辨率与 Windows DPI 缩放适配（防双重放大）
        // （仅对首次启动/无存档用户生效，已有存档的用户尊重其手动设置）
        // =========================================================

        // 1. 获取 DPR（设备像素比，例如 150% 缩放时 dpr 为 1.5）
        const dpr = window.devicePixelRatio || 1;

        // 2. 获取【逻辑宽度】（已被操作系统除以 DPR 的宽度，缩放交给系统负责）
        // 例如：4K 屏 (3840) 开 200% 缩放后，logicalWidth 会是 1920
        const logicalWidth = window.innerWidth || window.screen.width || 1920;

        console.debug(`[DPI] dpr=${dpr}, logicalWidth=${logicalWidth}`);

        let defaultUiFs = 13;   // 界面字号（顶部导航/侧边栏/菜单/弹窗）
        let defaultWsFs = 14;   // 工作区字号（右侧编辑区：世界书/设定/聊天气泡/RAW JSON）

        // 3. 根据「真正的可用逻辑空间」来分配字号，完美避开双重放大
        if (logicalWidth >= 2560) {
            // 只有在实体大于 4K 且缩放比例很小，或者实体是 5K/8K 时，才会进入这里
            // 此时屏幕空间极度宽广，我们才主动调大字号
            defaultUiFs = 15;
            defaultWsFs = 16;
        } else if (logicalWidth >= 1600) {
            // 涵盖标准 1080p，或是 4K 开了 200%~225% 缩放的状态
            // 让 Windows 自己做缩放，我们保持标准字号！
            defaultUiFs = 13;
            defaultWsFs = 14;
        } else {
            // 小笔记本屏幕，或 1080p 开了 150% 缩放 (逻辑宽度约 1280)
            // 稍微缩小基础字号，避免界面被挤爆
            defaultUiFs = 12;
            defaultWsFs = 13;
        }

        // 4. 从 localStorage 读取历史设置，如果没有则使用智能默认值（防御性读取，localStorage 不可用时回退默认）
        const appSettings = ref((() => {
            const defaults = {
                // 注：内部用单引号，与设置面板下拉选项的值保持一致，确保初始选中项正确
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif",
                fontSize: defaultWsFs,      // 智能分配的工作区字号
                fontWeight: 'normal',       // 可选 'normal' 或 '500' (中等加粗)
                uiFontSize: defaultUiFs     // 智能分配的界面字号
            };
            let loadedSettings = defaults;
            try { loadedSettings = JSON.parse(localStorage.getItem('appSettings')) || defaults; } catch (e) { /* 忽略 */ }
            // 兼容旧存档：缺失双轨字号时补智能默认值
            if (loadedSettings.uiFontSize === undefined) loadedSettings.uiFontSize = defaultUiFs;
            if (loadedSettings.fontSize === undefined) loadedSettings.fontSize = defaultWsFs;
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
        // 酒馆本地根目录（物理推送用；绑定一次即可永久免密一键推送）
        if (appSettings.value.tavernLocalPath === undefined) {
            appSettings.value.tavernLocalPath = '';
        }

        // 推送到酒馆：本地物理拷贝（直接复制卡片 PNG 到酒馆 characters 目录，无 API / CORS / 403 烦恼）
        const pushToTavern = async () => {
            showExperimentalMenu.value = false;

            if (selectedIds.value.length === 0) {
                return nativeAlert('请先在列表中勾选要推送到酒馆的角色卡！', 'warning');
            }

            // 1. 检查或请求酒馆的本地绝对路径
            let stRoot = appSettings.value.tavernLocalPath;

            // ===== 如果还没有绑定路径：先智能嗅探，再手动选择兜底 =====
            if (!stRoot) {
                // 1) 先尝试让主进程静默嗅探常见位置
                const autoDetected = await window.electronAPI.autoDetectTavernPath();
                if (autoDetected) {
                    const confirmAuto = await confirmDialog(`🎉 系统自动检测到了你的酒馆路径：\n\n${autoDetected}\n\n是否直接使用该路径？(选确定将自动永久绑定)`);
                    if (confirmAuto) {
                        stRoot = autoDetected;
                        appSettings.value.tavernLocalPath = stRoot;
                    }
                }

                // 2) 嗅探失败或用户拒绝 → 手动选择
                if (!stRoot) {
                    const confirmManual = await confirmDialog('尚未绑定 SillyTavern 本地目录，且未自动检索到。\n是否现在手动选择你的酒馆【根文件夹】？\n(选对一次即可永久免密一键推送)');
                    if (!confirmManual) return;

                    const folderPath = await window.electronAPI.selectGenericFolder();
                    if (!folderPath) return; // 用户取消选择

                    stRoot = folderPath;
                    appSettings.value.tavernLocalPath = stRoot; // 自动持久化保存
                }
            }

            // 2. 收集目标文件的真实物理路径
            const targetIds = [...selectedIds.value];
            const pathsToPush = [];
            for (const id of targetIds) {
                const item = library.value.find(c => c.id === id);
                if (item && item.path) pathsToPush.push(item.path);
            }
            if (pathsToPush.length === 0) {
                return nativeAlert('未找到选中卡片的物理文件路径，无法推送。', 'warning');
            }

            // 3. 执行系统级物理推送
            try {
                const res = await window.electronAPI.pushToSillyTavernDir(pathsToPush, stRoot);

                if (res && res.success) {
                    nativeAlert(`🎉 推送完成！共将 ${res.count} 张角色卡成功发送至酒馆！\n请前往酒馆刷新角色列表查看。`, 'info');
                    clearSelection();
                } else {
                    // 路径可能错误或版本不兼容，清空错误路径让用户下次重选
                    appSettings.value.tavernLocalPath = '';
                    nativeAlert(`推送失败：${(res && res.error) || '未知错误'}\n目录绑定已自动重置，请下次重新选择正确的 SillyTavern 根目录。`, 'error');
                }
            } catch (error) {
                nativeAlert(`推送发生底层异常: ${error.message}`, 'error');
            }
        };

        // 重新绑定酒馆本地目录（设置面板内使用）
        const rebindTavernPath = async () => {
            const folderPath = await window.electronAPI.selectGenericFolder();
            if (folderPath) {
                appSettings.value.tavernLocalPath = folderPath;
                nativeAlert('酒馆目录已重新绑定：' + folderPath, 'info');
            }
        };

        // ================= [ 顶部菜单系统：视图选项与工具函数 ] =================
        // API 设置独立弹窗开关
        const showApiModal = ref(false);
        // 视图菜单控制状态（控制 Raw JSON 页签 / 立绘预览 / Token 分析栏的显隐）
        const viewOptions = ref({
            showSidebar: true,        // 左侧侧边栏（角色卡列表）
            showToolbar: true,        // 顶部快捷工具栏
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

        // 用户自定义添加的额外分组列表（存字符串；localStorage 持久化，重启不丢失）
        const customCategories = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavern_customCategories'));
                if (Array.isArray(saved)) return saved.filter(c => typeof c === 'string' && c.trim() !== '');
            } catch (e) { /* 忽略 */ }
            return [];
        })());

        // 监听分类列表变化，实时写入 localStorage（新建/重命名/删除自动持久化）
        watch(customCategories, (newVal) => {
            try { localStorage.setItem('jsTavern_customCategories', JSON.stringify(newVal)); } catch (e) { /* 忽略 */ }
        }, { deep: true });

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

        // 删除自定义分组（预设/视图模式不可删；卡片自动归入未分类）
        const deleteCustomCategory = async (categoryName) => {
            if (!categoryName || !customCategories.value.includes(categoryName)) {
                return nativeAlert('只能删除自定义分组！', 'warning');
            }
            const ok = await confirmDialog(`确定要删除分组【${categoryName}】吗？\n（不会删除卡片，卡片将归入未分类）`);
            if (!ok) return;
            customCategories.value = customCategories.value.filter(c => c !== categoryName);
            // 原属于该分组的卡片重置为未分类
            library.value.forEach(card => { if (card.category === categoryName) card.category = '未分类'; });
            if (currentCategoryKey.value === categoryName) currentCategoryKey.value = 'all';
            addLog(`🗑️ 已删除分组: ${categoryName}`, 'warning');
            nativeAlert(`已删除分组「${categoryName}」。`, 'info');
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
        // 默认地址：兼容 LM Studio 或 Oobabooga 的 OpenAI 格式接口（支持持久化，重启后自动恢复）
        const DEFAULT_API_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';
        let savedEndpoint = '';
        try { savedEndpoint = localStorage.getItem('stc-api-endpoint') || ''; } catch (e) { /* 忽略 */ }
        const apiEndpoint = ref(savedEndpoint || DEFAULT_API_ENDPOINT);
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

        // API 三件套（Endpoint / Key / Model）变化时自动持久化，重启软件后自动恢复
        watch(apiEndpoint, (v) => {
            try { localStorage.setItem('stc-api-endpoint', v || ''); } catch (e) { /* 忽略 */ }
        });
        watch(apiKey, (v) => {
            try { localStorage.setItem('stc-api-key', v || ''); } catch (e) { /* 忽略 */ }
        });
        watch(apiModel, (v) => {
            try { localStorage.setItem('stc-api-model', v || ''); } catch (e) { /* 忽略 */ }
        });

        // API 协议类型：'openai'（OpenAI 兼容，默认）或 'anthropic'（Claude 原生）
        let savedApiType = '';
        try { savedApiType = localStorage.getItem('stc-api-type') || ''; } catch (e) { /* 忽略 */ }
        const apiType = ref(savedApiType === 'anthropic' ? 'anthropic' : 'openai');
        watch(apiType, (v) => {
            try { localStorage.setItem('stc-api-type', v || 'openai'); } catch (e) { /* 忽略 */ }
        });

        // 手动保存 API 配置（按钮触发，立即落盘 + 提示）
        const saveApiConfig = () => {
            try {
                localStorage.setItem('stc-api-endpoint', apiEndpoint.value);
                localStorage.setItem('stc-api-key', apiKey.value);
                localStorage.setItem('stc-api-model', apiModel.value);
                localStorage.setItem('stc-api-type', apiType.value);
            } catch (e) { /* 忽略 */ }
            nativeAlert('API 设置已成功保存！', 'info');
        };

        // 切换 API 类型时自动填充常用默认 Endpoint / Model
        const handleApiTypeChange = () => {
            if (apiType.value === 'anthropic') {
                if (!apiEndpoint.value || apiEndpoint.value.includes('openai') || apiEndpoint.value.includes('1234')) {
                    apiEndpoint.value = 'https://api.anthropic.com';
                    apiModel.value = 'claude-3-5-sonnet-20241022';
                }
            } else {
                if (!apiEndpoint.value || apiEndpoint.value.includes('anthropic')) {
                    apiEndpoint.value = DEFAULT_API_ENDPOINT;
                    apiModel.value = '';
                }
            }
            saveApiConfig();
        };

        // 兼容 OpenAI（choices[0].message.content）与 Anthropic（content[0].text）的回复提取
        const extractReplyContent = (result) => {
            if (!result || !result.data) return '';
            const d = result.data;
            if (apiType.value === 'anthropic') {
                return (d.content && d.content[0] && d.content[0].text) || '';
            }
            return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
        };

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
                const result = await window.electronAPI.fetchModels(ep, authKey, apiType.value);
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

        // 正则脚本稳定标识（同世界书机制，避免增删时节点错位）
        const regexUidMap = new Map();
        let regexUidCounter = 0;
        const getRegexUid = (script) => {
            if (!script || typeof script !== 'object') return 'regex-' + (++regexUidCounter);
            if (!regexUidMap.has(script)) regexUidMap.set(script, 'regex-' + (++regexUidCounter));
            return regexUidMap.get(script);
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

        const updateEntryKeys = (entry, fieldOrVal, value) => {
            if (!entry) return;
            // 兼容两种调用形态：
            //   updateEntryKeys(entry, value)          -> 写 entry.keys（角色卡世界书编辑器）
            //   updateEntryKeys(entry, 'key', value)   -> 写 entry.key / entry.keysecondary（独立世界书 IDE）
            let targetField = 'keys';
            let rawValue = fieldOrVal;
            if (value !== undefined) {
                targetField = fieldOrVal;
                rawValue = value;
            }
            // 将逗号分隔的字符串切割为数组，自动去除空格与空项（兼容中英文逗号）
            entry[targetField] = String(rawValue).split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0);
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

        // 正则脚本（兼容不同存放位置；只读提取，不做副作用，避免无正则卡片保存时写入空数组）
        const regexScripts = computed(() => {
            const d = safeData.value;
            if (!d || typeof d !== 'object') return [];
            return d.extensions?.regex_scripts || (Array.isArray(d.regex_scripts) ? d.regex_scripts : []);
        });

        // 确保 extensions.regex_scripts 数组存在（仅在用户主动编辑/新增时调用）
        const ensureRegexScriptsArray = () => {
            const d = safeData.value;
            if (!d || typeof d !== 'object') return null;
            if (!d.extensions) d.extensions = {};
            if (!Array.isArray(d.extensions.regex_scripts)) {
                // 兼容旧结构：若顶层有 regex_scripts 数组则迁移进来
                d.extensions.regex_scripts = Array.isArray(d.regex_scripts) ? d.regex_scripts : [];
            }
            return d.extensions.regex_scripts;
        };

        // 新增一条正则脚本
        const addRegexScript = () => {
            if (!cardData.value) return;
            const arr = ensureRegexScriptsArray();
            if (!arr) return;
            arr.push({
                id: 'regex_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                scriptName: '新建正则脚本',
                findRegex: '',
                replaceString: '',
                placement: [2], // 默认作用于 2: AI 输出
                disabled: false
            });
        };

        // 删除一条正则脚本
        const deleteRegexScript = (index) => {
            if (cardData.value && regexScripts.value[index] !== undefined) {
                regexScripts.value.splice(index, 1);
            }
        };

        // 安全规范化单个正则脚本字段（双向同步 camelCase 与 snake_case，兼容不同前端导出）
        const syncRegexScriptField = (script, field, value) => {
            if (!script) return;
            if (field === 'scriptName') {
                script.scriptName = value;
                script.script_name = value;
            } else if (field === 'findRegex') {
                script.findRegex = value;
                script.find_regex = value;
            } else if (field === 'replaceString') {
                script.replaceString = value;
                script.replace_string = value;
            } else if (field === 'disabled') {
                script.disabled = !!value;
            }
        };

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
                const result = await window.electronAPI.sendChatMessage(apiEndpoint.value, payload, apiKey.value, apiType.value);

                const reply = extractReplyContent(result);
                if (result.success && reply) {
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

        // 主题切换（暗夜极客 dark / 雅致青灰 slate / 明亮白昼 light）
        const applyTheme = (t) => {
            document.documentElement.setAttribute('data-theme', t);
        };
        const setTheme = (t) => {
            theme.value = t;
            try { localStorage.setItem('stc-theme', t); } catch (e) { /* 忽略 */ }
            applyTheme(t);
        };
        const toggleTheme = () => {
            const order = ['dark', 'slate', 'light'];
            const idx = order.indexOf(theme.value);
            setTheme(order[(idx + 1) % order.length]);
        };

        // =========================================================
        // 📏 侧边栏宽度自定义（拖拽把手调节 + localStorage 持久化）
        // =========================================================
        const sidebarEl = ref(null); // 侧边栏 DOM 引用（拖拽时读取当前宽度）
        const sidebarWidth = ref((() => {
            try {
                const w = parseInt(localStorage.getItem('jsTavern_sidebarWidth') || '', 10);
                if (w >= 220 && w <= 520) return w;
            } catch (e) { /* 忽略 */ }
            return 0; // 0 = 使用默认 calc(var(--ui-fs) * 22)
        })());

        // 侧边栏样式：拖拽后使用固定像素宽度；未拖拽时跟随字号缩放
        const sidebarStyle = computed(() => {
            if (sidebarWidth.value > 0) return { width: sidebarWidth.value + 'px', minWidth: '220px' };
            return { width: 'calc(var(--ui-fs, 13px) * 22)', minWidth: '260px' };
        });

        // 拖拽调整侧边栏宽度（min 220 / max 520）
        const startSidebarResize = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarEl.value ? sidebarEl.value.offsetWidth : 286;
            const onMove = (ev) => {
                const delta = ev.clientX - startX;
                sidebarWidth.value = Math.max(220, Math.min(520, Math.round(startWidth + delta)));
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                try { localStorage.setItem('jsTavern_sidebarWidth', String(sidebarWidth.value)); } catch (err) { /* 忽略 */ }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        // 双击把手恢复默认宽度（跟随字号缩放）
        const resetSidebarWidth = () => {
            sidebarWidth.value = 0;
            try { localStorage.removeItem('jsTavern_sidebarWidth'); } catch (e) { /* 忽略 */ }
        };

        // 原生确认对话框（Electron 中 window.confirm 会静默返回 null，须经 dialog.showMessageBox）
        const confirmDialog = async (message) => {
            if (!window.electronAPI) return window.confirm(message);
            const res = await window.electronAPI.showMessage({
                type: 'question',
                title: '确认操作',
                message: message,
                buttons: ['取消', '确定'],
                defaultId: 1,
                cancelId: 0
            });
            return !!(res && res.response === 1);
        };

        // 重置界面外观与个性化设置（不影响 API 配置）
        const resetPersonalizationSettings = async () => {
            if (!(await confirmDialog('是否确定重置界面字号与外观设置？（API 配置将保持不变）'))) return;
            // 保留酒馆推送地址，避免误重置
            const prevTavernUrl = appSettings.value.tavernUrl || 'http://127.0.0.1:8000';
            appSettings.value = {
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif",
                fontSize: 14,
                fontWeight: 'normal',
                uiFontSize: 13,
                tavernUrl: prevTavernUrl
            };
            nativeAlert('界面外观设置已恢复默认！', 'info');
        };

        // 重置 API 接口配置（不影响外观设置）
        const resetApiSettings = async () => {
            if (!(await confirmDialog('是否重置 API 接口地址与 Key / 模型参数？'))) return;
            apiEndpoint.value = 'http://127.0.0.1:1234/v1/chat/completions';
            apiKey.value = '';
            apiModel.value = '';
            availableModels.value = [];
            fetchModelStatus.value = '';
            nativeAlert('API 配置已恢复默认！', 'info');
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

            // 🌍 自动记忆恢复上次的世界书目录（静默扫描，无需手动选择）
            if (lastWorldbookDirPath.value) {
                try {
                    await scanWorldbookDir(lastWorldbookDirPath.value);
                    addLog(`📂 自动记忆载入世界书库: ${lastWorldbookDirPath.value}`);
                } catch (err) {
                    console.warn('自动加载世界书目录失败', err);
                }
            }

            // 数据加载完毕，淡出启动加载蒙版
            isAppLoading.value = false;
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

        // 打开右键菜单（带边缘碰撞检测，防止菜单超出屏幕）
        const openContextMenu = (event, item) => {
            event.preventDefault(); // 阻止浏览器默认右键菜单
            let x = event.clientX;
            let y = event.clientY;
            // 假设右键菜单最大宽度 210px，最大高度 320px
            if (x + 210 > window.innerWidth) x = window.innerWidth - 210;
            if (y + 320 > window.innerHeight) y = window.innerHeight - 320;
            contextMenu.value = {
                visible: true,
                x: Math.max(x, 4),
                y: Math.max(y, 4),
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

        // =========================================================
        // 🖱️ 右键菜单：增强原生操作（资源管理器定位/物理副本/AI打标/安全回收站）
        // =========================================================
        const handleContextMenuAction = async (action) => {
            const card = contextMenu.value.item;
            if (!card) return;
            closeContextMenu(); // 立即收起菜单

            try {
                switch (action) {
                    case 'openFolder':
                        // 调用系统资源管理器定位文件
                        await window.electronAPI.showItemInFolder(card.path);
                        addLog(`📁 已在资源管理器中定位: ${card.name}`, 'info');
                        break;

                    case 'duplicate': {
                        // 创建卡片物理副本（时间戳后缀）
                        const dupRes = await window.electronAPI.duplicateFile(card.path);
                        if (dupRes && dupRes.success) {
                            addLog(`📋 已成功创建卡片副本: ${card.name}`, 'success');
                            nativeAlert(`【${card.name}】的副本已创建！\n请点击左上角[文件]->[打开角色库目录]刷新查看。`, 'info');
                        } else {
                            throw new Error((dupRes && dupRes.error) || '复制失败');
                        }
                        break;
                    }

                    case 'aiTag': {
                        // 单卡快捷唤起 AI 打标（无需多选模式）
                        selectedIds.value = [card.id];
                        openAITagModal();
                        addLog(`🤖 已为 [${card.name}] 唤起 AI 打标`, 'info');
                        break;
                    }

                    case 'trash': {
                        // 安全移入全局回收站（userData/jsTavern_Trash，绝不物理删除）
                        // ⚠️ 必须用 confirmDialog（window.confirm 在 Electron 中静默返回 null）
                        const ok = await confirmDialog(`确定要将【${card.name}】移入安全回收站吗？\n(可在 文件(F)->查看回收站 找回)`);
                        if (!ok) break;
                        const trashRes = await window.electronAPI.trashFiles([card.path]);
                        if (trashRes && trashRes.success) {
                            const wasCurrent = !!(cardData.value && card.data === cardData.value);
                            // 动态从内存中剔除，无需刷新
                            library.value = library.value.filter(c => c.path !== card.path);
                            if (wasCurrent) reset();
                            addLog(`🗑️ 已将卡片移入回收站: ${card.name}`, 'warning');
                            nativeAlert('已安全移入回收站。', 'info');
                        } else {
                            throw new Error((trashRes && trashRes.error) || '移入回收站失败');
                        }
                        break;
                    }
                }
            } catch (err) {
                nativeAlert(`操作失败: ${err.message}`, 'error');
                addLog(`❌ 右键操作失败: ${err.message}`, 'error');
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

        // ================= [ 系统级微调全局提示词管理 ] =================
        // 默认内置几条高频实用的系统提示词（localStorage 持久化）
        const systemPromptPresets = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavernSysPrompts'));
                if (Array.isArray(saved) && saved.length > 0) return saved;
            } catch (e) { /* 忽略 */ }
            return [
                {
                    id: 'preset_1',
                    name: '标准标签提取助手',
                    content: '你是一个专业的角色卡分析助手。请阅读以下角色设定，提取最符合角色的标签。请严格只返回一个 JSON 数组格式（例如：["标签1", "标签2"]），绝对不要返回任何其他说明文字。',
                    expanded: false
                },
                {
                    id: 'preset_2',
                    name: '精简短标签模式 (2-4个)',
                    content: '你是一个精准的标签归纳专家。请为该角色提取 2-4 个极度精简的核心短标签。输出必须是纯 JSON 数组格式，形如 ["词1", "词2"]，不要附加任何解释。',
                    expanded: false
                }
            ];
        })());

        // 当前选中的系统提示词 ID
        const activeSystemPromptId = ref(systemPromptPresets.value[0]?.id || '');

        // 保存到 localStorage
        const saveSystemPromptsToStorage = () => {
            try { localStorage.setItem('jsTavernSysPrompts', JSON.stringify(systemPromptPresets.value)); } catch (e) { /* 忽略 */ }
        };

        // 新增一条系统提示词
        const addSystemPromptPreset = () => {
            const newId = 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            systemPromptPresets.value.push({
                id: newId,
                name: '新提示词模板',
                content: '你是一个专业的角色卡分析助手。请严格只返回 JSON 数组格式（例如：["标签1", "标签2"]），不要返回任何其他说明文字。',
                expanded: true // 默认展开方便编辑
            });
            activeSystemPromptId.value = newId;
            saveSystemPromptsToStorage();
        };

        // 删除一条系统提示词
        const deleteSystemPromptPreset = (index) => {
            if (systemPromptPresets.value.length <= 1) {
                nativeAlert('至少需要保留一条系统提示词！', 'warning');
                return;
            }
            systemPromptPresets.value.splice(index, 1);
            if (!systemPromptPresets.value.some(p => p.id === activeSystemPromptId.value)) {
                activeSystemPromptId.value = systemPromptPresets.value[0].id;
            }
            saveSystemPromptsToStorage();
        };

        // 获取当前生效的系统提示词内容（优先选中预设，回退 aiCustomPrompt）
        const getCurrentSystemPromptContent = () => {
            const found = systemPromptPresets.value.find(p => p.id === activeSystemPromptId.value);
            return found ? found.content : (aiCustomPrompt.value || '你是一个专业的角色卡分析助手。');
        };
        const aiTaggingProgress = ref({ current: 0, total: 0, status: '' });
        const isAITagging = ref(false);

        // 打开 AI 打标弹窗
        const openAITagModal = () => {
            if (selectedIds.value.length === 0) return;
            showAITagModal.value = true;
            aiTaggingProgress.value = { current: 0, total: selectedIds.value.length, status: '等待开始...' };
        };

        // =========================================================
        // ⚡ 真·全权限 AI 智能打标与物理落盘引擎（修正版）
        // 关键适配：① 经 IPC 转发调用 API（renderer 直接 fetch 会被 CORS 拦截）
        //           ② API 配置为独立 ref（apiEndpoint/apiKey/apiModel，非 appSettings）
        //           ③ 单卡兜底用 cardData（本项目无 activeCard 变量）
        //           ④ 标签层级兼容 card.data.data / card.data 两种结构
        // =========================================================
        const startAITagging = async () => {
            if (isAITagging.value) return;

            // 1. 目标：多选选中的卡片 ID（openAITagModal 已保证 selectedIds 非空，此处兜底校验）
            const targetIds = [...selectedIds.value];

            if (targetIds.length === 0) {
                nativeAlert('请先选择需要打标的角色卡！', 'warning');
                return;
            }

            isAITagging.value = true;
            let successCount = 0;
            let failCount = 0;
            const failReasons = []; // 收集失败明细（卡片名 + 原因）

            for (let i = 0; i < targetIds.length; i++) {
                const currentId = targetIds[i];
                const card = library.value.find(c => c.id === currentId);
                if (!card) continue;

                aiTaggingProgress.value.current = i + 1;
                aiTaggingProgress.value.total = targetIds.length;
                aiTaggingProgress.value.status = `正在分析 (${i + 1}/${targetIds.length}): ${card.name || '未知角色'}`;

                try {
                    // 3. 深度提取卡片设定（防爆 Token 截断）
                    const d = card.data?.data || card.data || {};
                    const charDesc = (d.description || card.description || '').substring(0, 1500);
                    const charMes = (d.first_mes || card.first_mes || '').substring(0, 500);
                    const charPersonality = (d.personality || card.personality || '').substring(0, 300);

                    // 4. 构建强约束 Prompt
                    let modeInstruction = (aiTagMode.value === 'candidate' && aiCandidateTags.value.trim() !== '')
                        ? `必须严格只从以下候选标签池中挑选最符合的 2-5 个标签：[${aiCandidateTags.value}]。`
                        : `请自由提取 3-5 个最契合的简短标签。`;

                    const promptText = `${modeInstruction}
【输出强制规则】：必须只返回格式为 ["标签1", "标签2"] 的纯 JSON 数组，绝不要包含 markdown 标记或任何前导/后置解释文字。

【角色设定提取】：
名字：${card.name || '未知'}
描述：${charDesc}
性格：${charPersonality}
首句：${charMes}`;

                    // 5. 经主进程 IPC 转发调用 API（绕过 CORS；与聊天测卡共用通道）
                    const payload = {
                        model: resolveApiModel(), // 优先使用配置的模型名称，留空回退 local-model
                        messages: [
                            { role: 'system', content: getCurrentSystemPromptContent() }, // 动态挂载当前选中的系统提示词预设
                            { role: 'user', content: promptText }
                        ],
                        temperature: 0.2 // 偏低温度保证 JSON 格式稳定性
                    };
                    const authKey = (apiKey.value && apiKey.value.trim()) ? apiKey.value : 'test-key';
                    const result = await window.electronAPI.sendChatMessage(apiEndpoint.value, payload, authKey, apiType.value);
                    if (!result || !result.success) throw new Error((result && result.error) || 'API 请求失败');

                    // 6. 强力提取 JSON 数组（兼容 OpenAI / Anthropic 回复结构）
                    let rawReply = extractReplyContent(result).trim();
                    rawReply = rawReply.replace(/```json/gi, '').replace(/```/g, '').trim();
                    const jsonMatch = rawReply.match(/\[[\s\S]*\]/);
                    if (!jsonMatch) throw new Error(`模型未返回有效的 JSON 数组: ${rawReply}`);

                    let newTags;
                    try {
                        newTags = JSON.parse(jsonMatch[0]);
                    } catch (err) {
                        // 兜底：按标点符号暴力拆分
                        newTags = rawReply.replace(/[\[\]"'`]/g, '').split(/[,，、\n]/).map(t => t.trim()).filter(Boolean);
                    }

                    if (Array.isArray(newTags) && newTags.length > 0) {
                        // 防错初始化层级（兼容 V2/V3 结构，不强制嵌套 data.data）
                        if (!Array.isArray(card.customTags)) card.customTags = [];
                        const dataLayer = card.data?.data || card.data || {};
                        if (!Array.isArray(dataLayer.tags)) dataLayer.tags = [];

                        let addedAny = false;
                        newTags.forEach(tag => {
                            const cleanTag = String(tag).trim();
                            if (!cleanTag) return;
                            // 内存显示层（library 深度响应式，push 即触发界面刷新）
                            if (!card.customTags.includes(cleanTag)) { card.customTags.push(cleanTag); addedAny = true; }
                            // 酒馆 PNG 元数据层 data.tags
                            if (!dataLayer.tags.includes(cleanTag)) { dataLayer.tags.push(cleanTag); addedAny = true; }
                        });

                        // 7. 物理覆写本地 PNG 文件（剥离 Proxy 转纯对象）
                        if (addedAny) {
                            const plainData = JSON.parse(JSON.stringify(card.data));
                            const saveRes = await window.electronAPI.saveCard(card.path, plainData);
                            if (!saveRes || !saveRes.success) throw new Error((saveRes && saveRes.error) || '物理保存失败');
                        }
                        successCount++;
                    }
                } catch (err) {
                    console.error(`❌ 卡片 [${card.name}] 打标失败:`, err);
                    failCount++;
                    failReasons.push(`${card.name || '未知角色'}: ${(err && err.message) ? err.message : String(err)}`);
                }
            }

            // 8. 扫尾工作
            isAITagging.value = false;
            aiTaggingProgress.value.status = '✅ 全部处理完成！';

            // 组装结果提示：失败时逐条展示具体原因（最多 6 条，超长截断防刷屏）
            let resultMsg = `🎉 批量处理完成！成功更新: ${successCount} 张，失败: ${failCount} 张`;
            if (failReasons.length > 0) {
                const shown = failReasons.slice(0, 6);
                resultMsg += '\n\n❌ 失败原因：\n' + shown.map(r => '· ' + r).join('\n');
                if (failReasons.length > 6) resultMsg += `\n... 等共 ${failReasons.length} 条`;
            }
            nativeAlert(resultMsg, successCount > 0 ? 'info' : 'warning');

            // 延迟一点关闭弹窗，让用户看到最后的状态
            setTimeout(() => {
                showAITagModal.value = false;
            }, 1500);
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

        // =========================================================
        // 🌍 世界书管理器状态与逻辑（独立于角色卡库，主视图双引擎模式）
        // =========================================================

        // 视图切换模式：'characters' (角色卡) | 'worldbooks' (世界书)
        const appMode = ref('characters');

        const worldbooks = ref([]);          // 世界书列表
        const activeWorldbook = ref(null);   // 当前正在深度编辑的世界书

        // 记忆上次打开的世界书目录（localStorage 持久化，重启自动静默恢复）
        const lastWorldbookDirPath = ref((() => {
            try { return localStorage.getItem('jsTavern_lastWbDir') || ''; } catch (e) { return ''; }
        })());

        // =========================================================
        // 📟 全局终端控制台与日志状态（角色卡/世界书双模式共用）
        // =========================================================
        const editorLogs = ref([]);
        const showEditorLogs = ref(false); // 默认收起，点击控制杆可随时展开

        // 全局日志打印辅助函数
        const addLog = (msg, type = 'info') => {
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            editorLogs.value.unshift({ time, msg, type });
            if (editorLogs.value.length > 100) editorLogs.value.pop(); // 保留最新 100 条
        };

        // 扫描世界书文件夹（弹目录选择；复用 selectGenericFolder 返回纯路径字符串，selectFolder 返回扫描结果对象不适用）
        const loadWorldbooks = async () => {
            const dirPath = await window.electronAPI.selectGenericFolder();
            if (!dirPath) return;
            await scanWorldbookDir(dirPath);
        };

        // 扫描指定世界书目录（供手动选择与启动自动恢复共用；自动持久化记忆路径）
        const scanWorldbookDir = async (dirPath) => {
            if (!dirPath) return;
            lastWorldbookDirPath.value = dirPath;
            try { localStorage.setItem('jsTavern_lastWbDir', dirPath); } catch (e) { /* 忽略 */ }

            addLog(`开始扫描世界书目录: ${dirPath}`);
            const res = await window.electronAPI.scanWorldbooks(dirPath);
            if (res.success) {
                // 统一清洗：确保每本世界书的 entries 均为纯数组（兼容旧版/第三方工具的对象字典格式）
                res.data.forEach(wb => {
                    if (wb.data && wb.data.entries && typeof wb.data.entries === 'object' && !Array.isArray(wb.data.entries)) {
                        wb.data.entries = Object.values(wb.data.entries);
                    }
                });
                worldbooks.value = res.data;
                addLog(`扫描完成，共加载 ${res.data.length} 本世界书`, 'success');
            } else {
                addLog(`扫描失败: ${res.error}`, 'error');
                nativeAlert(`世界书扫描失败: ${res.error}`, 'error');
            }
        };

        // 物理保存当前世界书
        const saveActiveWorldbook = async () => {
            if (!activeWorldbook.value) return;
            addLog(`准备落盘保存世界书: ${activeWorldbook.value.name}...`);

            // 脱离 Proxy 代理进行序列化（避免 IPC "An object could not be cloned"），并剔除 IDE 展示字段 _collapsed 防污染
            const plainData = JSON.parse(JSON.stringify(activeWorldbook.value.data));
            if (Array.isArray(plainData.entries)) {
                plainData.entries.forEach(e => { if (e && e._collapsed !== undefined) delete e._collapsed; });
            }
            const res = await window.electronAPI.saveWorldbook({
                filePath: activeWorldbook.value.path,
                data: plainData
            });

            if (res.success) {
                addLog(`✅ 保存成功: ${activeWorldbook.value.name}`, 'success');
                nativeAlert('世界书物理落盘保存成功！', 'info');
            } else {
                addLog(`❌ 保存失败: ${res.error}`, 'error');
                nativeAlert(`世界书保存失败: ${res.error}`, 'error');
            }
        };

        // 提供独立的世界书本地导出功能（方便开发测试时脱离环境发给别人；导出前剔除 _collapsed 防污染）
        const exportActiveWorldbook = () => {
            if (!activeWorldbook.value) return;
            const plainData = JSON.parse(JSON.stringify(activeWorldbook.value.data));
            if (Array.isArray(plainData.entries)) {
                plainData.entries.forEach(e => { if (e && e._collapsed !== undefined) delete e._collapsed; });
            }
            const blob = new Blob([JSON.stringify(plainData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeWorldbook.value.name || 'worldbook_export.json';
            a.click();
            URL.revokeObjectURL(url);
            addLog(`已触发本地独立导出: ${a.download}`);
        };

        // 智能保存：世界书模式下保存世界书，角色卡模式下保存当前卡片（文件菜单共用入口）
        const saveCurrentAsset = async () => {
            if (appMode.value === 'worldbooks' && activeWorldbook.value) return saveActiveWorldbook();
            if (cardData.value) return saveToLocalDisk();
            nativeAlert('当前没有可保存的内容。', 'warning');
        };

        // =========================================================
        // 🌍 世界书词条深度编辑逻辑 (Entry IDE)
        // =========================================================

        // 新增一条空白词条
        const addWorldbookEntry = () => {
            if (!activeWorldbook.value) return;
            if (!Array.isArray(activeWorldbook.value.data.entries)) {
                activeWorldbook.value.data.entries = [];
            }

            // 生成唯一 UID（字符串：时间戳 + 随机段，避免同毫秒冲突）
            const newUid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            activeWorldbook.value.data.entries.unshift({
                uid: newUid,
                key: [],            // 主触词
                keysecondary: [],   // 次级触词
                content: '',        // 正文
                constant: false,    // 是否常驻
                selective: false,   // 是否条件触发
                insertion_order: 50, // 插入顺序
                order: 100,         // 权重
                position: 1,        // 插入位置 (0: 顶部, 1: 底部, 2: 聊天前等)
                enabled: true,      // 启用状态
                _collapsed: false   // 折叠状态（仅 IDE 展示用，保存时剔除）
            });

            addLog(`➕ 新增了一条空白世界书词条 (UID: ${newUid})`, 'info');
        };

        // 删除一条词条（⚠️ Electron 中 window.confirm 静默返回 null，必须走 confirmDialog 原生确认框）
        // 接收词条对象而非索引——列表可能处于搜索过滤态，索引会错位
        const deleteWorldbookEntry = async (entry) => {
            if (!activeWorldbook.value) return;
            const entries = activeWorldbook.value.data.entries;
            const index = entries.indexOf(entry);
            if (index === -1) return;
            const ok = await confirmDialog('确定要删除这条世界书设定吗？操作不可逆！');
            if (ok) {
                entries.splice(index, 1);
                addLog(`🗑️ 删除了第 ${index + 1} 个词条`, 'warning');
            }
        };

        // =========================================================
        // 🎛️ 世界书词条 IDE 控制栏（搜索 / 折叠 / 克隆）
        // =========================================================
        const entrySearchQuery = ref('');         // 词条关键字实时搜索
        const isAllEntriesCollapsed = ref(false); // 词条全局折叠状态

        // 动态过滤搜索后的词条（触发词 / 次级触词 / 正文 / 备注 全字段匹配）
        const filteredWorldbookEntries = computed(() => {
            if (!activeWorldbook.value || !Array.isArray(activeWorldbook.value.data.entries)) return [];
            const q = entrySearchQuery.value.trim().toLowerCase();
            if (!q) return activeWorldbook.value.data.entries;

            return activeWorldbook.value.data.entries.filter(entry => {
                const keysStr = Array.isArray(entry.key) ? entry.key.join(' ') : String(entry.key || '');
                const secKeysStr = Array.isArray(entry.keysecondary) ? entry.keysecondary.join(' ') : '';
                const contentStr = entry.content || '';
                const commentStr = entry.comment || '';
                return keysStr.toLowerCase().includes(q) ||
                       secKeysStr.toLowerCase().includes(q) ||
                       contentStr.toLowerCase().includes(q) ||
                       commentStr.toLowerCase().includes(q);
            });
        });

        // 一键全部折叠/展开
        const toggleAllEntriesCollapse = () => {
            isAllEntriesCollapsed.value = !isAllEntriesCollapsed.value;
            if (activeWorldbook.value && Array.isArray(activeWorldbook.value.data.entries)) {
                activeWorldbook.value.data.entries.forEach(e => { e._collapsed = isAllEntriesCollapsed.value; });
            }
        };

        // 克隆指定词条（在后方插入副本）
        const duplicateWorldbookEntry = (entry) => {
            if (!activeWorldbook.value) return;
            const entries = activeWorldbook.value.data.entries;
            const index = entries.indexOf(entry);
            if (index === -1) return;

            const cloned = JSON.parse(JSON.stringify(entry));
            cloned.uid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            cloned.comment = (cloned.comment || '词条') + ' (副本)';
            cloned._collapsed = false;

            entries.splice(index + 1, 0, cloned);
            addLog(`📋 成功复制了第 ${index + 1} 条词条`, 'info');
        };

        // =========================================================
        // 🔍 智能查重与版本清洗系统
        // =========================================================
        const showDedupeModal = ref(false);
        const duplicateGroups = ref([]);

        // 计算单张卡片的设定丰度（复用全局 estimateTokens，叠加描述/首句/示例/性格四段文本）
        const estimateCardTokens = (card) => {
            const d = card.data?.data || card.data || {};
            const text = [d.description, d.first_mes, d.mes_example, d.personality].filter(Boolean).join('\n');
            return estimateTokens(text);
        };

        // 提取核心描述以便于对比差异
        const getCoreDescription = (card) => {
            const d = card.data?.data || card.data || {};
            return d.description || '';
        };

        // 启动全库查重扫描（升级版：综合 Token 丰度 + 物理文件修改时间判定；整体 try-catch 防静默崩溃）
        const startDedupeScan = async () => {
            try {
                if (library.value.length === 0) {
                    nativeAlert('卡片库为空，无法查重！', 'warning');
                    return;
                }

                // 【防崩溃检查】底层 API 是否真的连接上了
                if (!window.electronAPI || typeof window.electronAPI.getFileStats !== 'function') {
                    nativeAlert('❌ 查重引擎启动失败：preload.js 中未找到 getFileStats 接口！', 'error');
                    return;
                }

                const groups = {};
                // 1. 聚类：按角色名称分组
                library.value.forEach(card => {
                    const name = (card.name || '未命名').trim();
                    if (!groups[name]) groups[name] = [];
                    groups[name].push(card);
                });

                const potentialGroups = Object.entries(groups).filter(([name, cards]) => cards.length > 1);

                if (potentialGroups.length === 0) {
                    nativeAlert('🎉 恭喜！当前库中极为整洁，未发现同名重复的角色卡！', 'info');
                    return;
                }

                // 2. 收集所有需要获取 stats 的文件路径
                const pathsToStat = [];
                potentialGroups.forEach(([name, cards]) => cards.forEach(c => pathsToStat.push(c.path)));

                // 3. 批量获取文件物理状态 (修改时间/大小)；失败时降级为仅 Token 判定
                let fileStats = {};
                try {
                    const statsRes = await window.electronAPI.getFileStats(pathsToStat);
                    if (statsRes && statsRes.success) fileStats = statsRes.data || {};
                } catch (e) {
                    console.warn('获取文件信息失败，将仅依据 Token 判定:', e);
                }

                // 4. 组装查重分组并综合排序
                duplicateGroups.value = potentialGroups.map(([name, cards]) => {
                    cards.forEach(c => {
                        c._tokens = estimateCardTokens(c);
                        c._desc = getCoreDescription(c);
                        // 优先使用物理文件修改时间（可空链保护），兜底使用内部数据时间
                        const fallback = (c.data && c.data.create_date) ? new Date(c.data.create_date).getTime() : 0;
                        c._mtime = fileStats?.[c.path]?.mtimeMs || fallback || Date.now();
                        c._dateStr = new Date(c._mtime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    });

                    // 【综合排序策略】Token 差异 > 5% 视为有实质差异，Token 多者优先；相近则比较物理修改时间，越新越优先
                    cards.sort((a, b) => {
                        const tokenDiff = b._tokens - a._tokens;
                        const tokenRatio = Math.abs(tokenDiff) / Math.max(a._tokens, b._tokens, 1);
                        if (tokenRatio > 0.05) {
                            return tokenDiff;
                        } else {
                            return b._mtime - a._mtime;
                        }
                    });

                    // 【差异计算】将第一张（推荐保留）与其他卡片对比描述长度差异
                    cards.forEach((c, idx) => {
                        if (idx === 0) {
                            c._diffType = '推荐版';
                            return;
                        }
                        const diffLen = c._desc.length - cards[0]._desc.length;
                        if (diffLen > 100) c._diffType = '可能包含更多设定';
                        else if (diffLen < -100) c._diffType = '设定可能有缺失';
                        else if (c._desc !== cards[0]._desc) c._diffType = '设定细节不同';
                        else c._diffType = '设定完全一致';
                    });

                    return { name, cards };
                });

                // 只要逻辑没报错，就一定能打开弹窗！
                showDedupeModal.value = true;
            } catch (err) {
                console.error('查重引擎崩溃:', err);
                nativeAlert(`❌ 查重系统发生异常: ${err.message}`, 'error');
            }
        };

        // 一键清理：保留指定卡片，其余送入回收站
        const resolveDedupeGroup = async (groupIndex, keepCardPath) => {
            const group = duplicateGroups.value[groupIndex];
            if (!group) return;

            // 选出所有不等于 keepCardPath 的卡片路径（即准备扔掉的冗余版本）
            const pathsToTrash = group.cards
                .filter(c => c.path !== keepCardPath)
                .map(c => c.path);

            if (pathsToTrash.length === 0) return;

            // ⚠️ 必须用 confirmDialog（window.confirm 在 Electron 中静默返回 null）
            const ok = await confirmDialog(`确定要将另外 ${pathsToTrash.length} 个历史版本/重复卡移入回收站吗？`);
            if (!ok) return;

            const res = await window.electronAPI.trashFiles(pathsToTrash);
            if (res && res.success) {
                // 3. 先记录当前正在编辑的卡片是否会被清理
                const currentLibItem = library.value.find(item => item.data === cardData.value);
                const currentTrashed = !!(currentLibItem && pathsToTrash.includes(currentLibItem.path));

                // 2. 从内存库中物理踢出已清理的卡片
                library.value = library.value.filter(c => !pathsToTrash.includes(c.path));

                // 1. 从查重视图中移除该组
                duplicateGroups.value.splice(groupIndex, 1);

                // 3. 若当前编辑卡片被清理，关闭编辑器
                if (currentTrashed) reset();

                nativeAlert(`清理成功！已将 ${res.count} 张冗余卡片移入回收站。`, 'info');
            } else {
                nativeAlert(`清理失败: ${(res && res.error) || '未知错误'}`, 'error');
            }
        };

        // =========================================================
        // 🌍 世界书库筛选与智能对比查重引擎
        // =========================================================
        const wbSearchQuery = ref('');         // 世界书侧边栏搜索框
        const wbFilterType = ref('all');        // 词条数筛选: 'all' | 'empty' | 'small' | 'large'
        const showWbDedupeModal = ref(false);  // 世界书对比查重弹窗开关
        const wbDuplicateGroups = ref([]);     // 世界书查重分组

        // 计算属性：世界书列表筛选（搜索 + 词条数过滤）
        const filteredWorldbooks = computed(() => {
            return worldbooks.value.filter(wb => {
                const name = ((wb.data && wb.data.name) || wb.name || '').toLowerCase();
                const matchesSearch = !wbSearchQuery.value || name.includes(wbSearchQuery.value.toLowerCase());

                const entryCount = (wb.data && Array.isArray(wb.data.entries)) ? wb.data.entries.length : 0;
                let matchesFilter = true;
                if (wbFilterType.value === 'empty') matchesFilter = entryCount === 0;
                else if (wbFilterType.value === 'small') matchesFilter = entryCount > 0 && entryCount <= 15;
                else if (wbFilterType.value === 'large') matchesFilter = entryCount > 15;

                return matchesSearch && matchesFilter;
            });
        });

        // 提取世界书的所有触发词集合（用于计算重合度）
        const getWorldbookKeysSet = (wb) => {
            const keys = new Set();
            const entries = (wb.data && Array.isArray(wb.data.entries)) ? wb.data.entries : [];
            entries.forEach(e => {
                const kArr = Array.isArray(e.key) ? e.key : (typeof e.key === 'string' ? e.key.split(/[,，]/) : []);
                kArr.forEach(k => {
                    const clean = String(k).trim().toLowerCase();
                    if (clean) keys.add(clean);
                });
            });
            return keys;
        };

        // 启动世界书智能查重扫描
        const startWorldbookDedupeScan = async () => {
            try {
                if (worldbooks.value.length === 0) {
                    nativeAlert('世界书库为空，无法进行查重！', 'warning');
                    return;
                }

                // 【防崩溃检查】底层 API 是否真的连接上了
                if (!window.electronAPI || typeof window.electronAPI.getFileStats !== 'function') {
                    nativeAlert('❌ 世界书查重引擎启动失败：preload.js 中未找到 getFileStats 接口！', 'error');
                    return;
                }

                const groups = {};
                // 1. 按书名或文件名聚类
                worldbooks.value.forEach(wb => {
                    const name = ((wb.data && wb.data.name) || (wb.name || '').replace(/\.json$/i, '') || '未命名世界书').trim();
                    if (!groups[name]) groups[name] = [];
                    groups[name].push(wb);
                });

                const potentialGroups = Object.entries(groups).filter(([_, list]) => list.length > 1);

                if (potentialGroups.length === 0) {
                    nativeAlert('🎉 恭喜！当前库中未发现同名的重复世界书！', 'info');
                    return;
                }

                // 2. 收集物理文件状态（带空安全保护）
                const pathsToStat = [];
                potentialGroups.forEach(([_, list]) => list.forEach(wb => pathsToStat.push(wb.path)));
                let fileStats = {};
                try {
                    const statsRes = await window.electronAPI.getFileStats(pathsToStat);
                    if (statsRes && statsRes.success) fileStats = statsRes.data || {};
                } catch (e) {
                    console.warn('获取世界书文件信息失败:', e);
                }

                wbDuplicateGroups.value = potentialGroups.map(([name, list]) => {
                    list.forEach(wb => {
                        const entries = (wb.data && Array.isArray(wb.data.entries)) ? wb.data.entries : [];
                        wb._entryCount = entries.length;
                        wb._keysSet = getWorldbookKeysSet(wb);
                        wb._mtime = fileStats?.[wb.path]?.mtimeMs || Date.now();
                        wb._dateStr = new Date(wb._mtime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                        wb._sizeKb = ((fileStats?.[wb.path]?.size || 0) / 1024).toFixed(1);
                    });

                    // 排序：词条数多的排前面，词条数相近则新的排前面
                    list.sort((a, b) => {
                        if (b._entryCount !== a._entryCount) return b._entryCount - a._entryCount;
                        return b._mtime - a._mtime;
                    });

                    // 计算相对第一本（推荐版本）的差异与触发词交集
                    const masterKeys = list[0]._keysSet;
                    list.forEach((wb, idx) => {
                        if (idx === 0) {
                            wb._diffInfo = '👑 建议保留 (词条最全/最新)';
                        } else {
                            let overlapCount = 0;
                            wb._keysSet.forEach(k => { if (masterKeys.has(k)) overlapCount++; });
                            const ratio = wb._keysSet.size > 0 ? Math.round((overlapCount / wb._keysSet.size) * 100) : 0;

                            if (wb._entryCount === list[0]._entryCount && ratio === 100) {
                                wb._diffInfo = '⚠️ 词条内容完全重合 (可安全清理)';
                            } else {
                                wb._diffInfo = `🔍 触发词重合度: ${ratio}% (${wb._entryCount}条)`;
                            }
                        }
                    });

                    return { name, list };
                });

                // 只要逻辑没报错，就一定能打开弹窗！
                showWbDedupeModal.value = true;
            } catch (err) {
                console.error('世界书查重引擎崩溃:', err);
                nativeAlert(`❌ 世界书查重系统发生异常: ${err.message}`, 'error');
            }
        };

        // 一键清理重复世界书
        const resolveWbDedupeGroup = async (groupIndex, keepPath) => {
            const group = wbDuplicateGroups.value[groupIndex];
            if (!group) return;
            const pathsToTrash = group.list.filter(wb => wb.path !== keepPath).map(wb => wb.path);
            if (pathsToTrash.length === 0) return;

            // ⚠️ confirm 在 Electron 中静默返回 null，必须用 confirmDialog
            const ok = await confirmDialog(`确定要将另外 ${pathsToTrash.length} 本冗余/旧版世界书放入回收站吗？`);
            if (!ok) return;

            const res = await window.electronAPI.trashFiles(pathsToTrash);
            if (res && res.success) {
                wbDuplicateGroups.value.splice(groupIndex, 1);
                worldbooks.value = worldbooks.value.filter(wb => !pathsToTrash.includes(wb.path));
                if (activeWorldbook.value && pathsToTrash.includes(activeWorldbook.value.path)) {
                    activeWorldbook.value = worldbooks.value[0] || null;
                }
                addLog(`🗑️ 已清理 ${res.count} 本冗余世界书`, 'warning');
                nativeAlert(`清理完成！已移入回收站 ${res.count} 本世界书。`, 'info');
            } else {
                nativeAlert(`清理失败: ${(res && res.error) || '未知错误'}`, 'error');
            }
        };

        // =========================================================
        // 🔍 查重双屏差异比对器 (Diff Inspector) 终极修复版
        // =========================================================
        const showDiffDetailModal = ref(false);
        const diffMasterItem = ref(null);
        const diffCompareItem = ref(null);
        const diffFieldResults = ref([]);

        // 智能句级切块算法 (取代简陋的段落比对，精确到每一个标点符号)
        const chunkTextForDiff = (text) => {
            if (!text) return [];
            try {
                // 按标点或换行进行精细分句，保留标点，极大提升长段落对比体验
                return text.split(/(?<=[。！？.!?\n]+)/).map(s => s.trim()).filter(Boolean);
            } catch (e) {
                // 兜底降级
                return text.split('\n').map(s => s.trim()).filter(Boolean);
            }
        };

        const computeTextDiffLines = (str1 = '', str2 = '') => {
            const chunks1 = chunkTextForDiff(str1);
            const chunks2 = chunkTextForDiff(str2);

            const set1 = new Set(chunks1);
            const set2 = new Set(chunks2);

            const res1 = chunks1.map(chunk => ({
                text: chunk,
                type: set2.has(chunk) ? 'same' : 'removed'
            }));

            const res2 = chunks2.map(chunk => ({
                text: chunk,
                type: set1.has(chunk) ? 'same' : 'added'
            }));

            return { masterLines: res1, compareLines: res2 };
        };

        // 全能通用比对唤起 (自动识别世界书 / 角色卡)
        const openDiffDetailModal = (masterItem, compareItem) => {
            if (!masterItem || !compareItem) return;

            diffMasterItem.value = masterItem;
            diffCompareItem.value = compareItem;
            diffFieldResults.value = [];

            // 智能识别：当前是在查重世界书还是角色卡？
            const isWorldbook = !!(masterItem.data && Array.isArray(masterItem.data.entries));

            const masterData = (masterItem.data && (masterItem.data.data || masterItem.data)) || {};
            const compareData = (compareItem.data && (compareItem.data.data || compareItem.data)) || {};

            if (isWorldbook) {
                // ---------- 🌍 世界书对比逻辑 ----------
                const entries1 = masterItem.data.entries || [];
                const entries2 = compareItem.data.entries || [];

                diffFieldResults.value.push({
                    label: '📚 世界书词条总数 (Entries Count)',
                    isSame: entries1.length === entries2.length,
                    len1: `${entries1.length} 条`,
                    len2: `${entries2.length} 条`,
                    diffText: null
                });

                // 提取所有触发词 Key
                const getKeys = (entries) => entries.map(e => (Array.isArray(e.key) ? e.key.join(', ') : e.key)).filter(Boolean);
                const keys1 = new Set(getKeys(entries1));
                const keys2 = new Set(getKeys(entries2));

                diffFieldResults.value.push({
                    label: '🔑 触发词池覆盖差异 (Trigger Keys)',
                    isSame: keys1.size === keys2.size && [...keys1].every(k => keys2.has(k)),
                    isTags: true,
                    commonTags: [...keys1].filter(k => keys2.has(k)),
                    onlyMasterTags: [...keys1].filter(k => !keys2.has(k)),
                    onlyCompareTags: [...keys2].filter(k => !keys1.has(k))
                });

                // 将所有词条内容拼接起来进行宏观文本对比
                const text1 = entries1.map(e => e.content || '').join('\n');
                const text2 = entries2.map(e => e.content || '').join('\n');
                const isTextSame = text1 === text2;

                diffFieldResults.value.push({
                    label: '📝 词条正文总集比对 (All Content Diff)',
                    isSame: isTextSame,
                    len1: `${text1.length} 字`,
                    len2: `${text2.length} 字`,
                    diffText: isTextSame ? null : computeTextDiffLines(text1, text2)
                });

            } else {
                // ---------- 🎴 角色卡对比逻辑 ----------
                const fieldsToCompare = [
                    { key: 'description', label: '📝 角色描述 (Description)' },
                    { key: 'personality', label: '🎭 性格设定 (Personality)' },
                    { key: 'first_mes', label: '💬 开场首句 (First Message)' },
                    { key: 'mes_example', label: '🗣️ 示例对话 (Mes Example)' }
                ];

                diffFieldResults.value = fieldsToCompare.map(f => {
                    const val1 = String(masterData[f.key] || masterItem[f.key] || '');
                    const val2 = String(compareData[f.key] || compareItem[f.key] || '');
                    const isSame = val1.trim() === val2.trim();
                    return {
                        label: f.label,
                        isSame,
                        len1: `${val1.length} 字`,
                        len2: `${val2.length} 字`,
                        diffText: isSame ? null : computeTextDiffLines(val1, val2)
                    };
                });

                // 标签对比
                const tags1 = new Set([...(masterItem.customTags || []), ...((masterData && masterData.tags) || [])]);
                const tags2 = new Set([...(compareItem.customTags || []), ...((compareData && compareData.tags) || [])]);

                diffFieldResults.value.push({
                    label: '🏷️ 自定义/系统标签 (Tags)',
                    isSame: tags1.size === tags2.size && [...tags1].every(t => tags2.has(t)),
                    isTags: true,
                    commonTags: [...tags1].filter(t => tags2.has(t)),
                    onlyMasterTags: [...tags1].filter(t => !tags2.has(t)),
                    onlyCompareTags: [...tags2].filter(t => !tags1.has(t))
                });
            }

            showDiffDetailModal.value = true;
        };

        return {
            theme, toggleTheme, appSettings, showSettingsModal, showApiModal, resetPersonalizationSettings, resetApiSettings,
            showExperimentalMenu, pushToTavern,
            viewOptions, importFileInput, handleImportFiles, importCards, selectAllCards, cleanGlobalTagsPrompt,
            openBakFolder, openTrashFolder, openChatTab,
            isScanningDisk, diskScanProgress, useSizeFilter, runDiskScan,
            isDragging, cardData, imgUrl, tabs, currentTab, currentTabInfo,
            safeData, specVersion, worldbookEntries, getEntryUid, getRegexUid, regexScripts, formattedJson,
            addRegexScript, deleteRegexScript, syncRegexScriptField,
            worldbookExpanded, toggleWorldbookEntry, expandAllWorldbook, collapseAllWorldbook,
            getKeysString, updateEntryKeys,
            getRegexPlacement, handleDrop, handleFileUpload, downloadJson, reset,
            library, openFromLibrary,
            allCategories, customCategories, currentCategoryKey,
            getCategoryDisplayName, addNewCategory, changeCardCategory,
            renameCurrentCategory, deleteCustomCategory,
            currentCardCategory, handleCardCategoryChange,
            currentPage, totalPages,
            searchQuery, filteredLibrary, paginatedLibrary,
            selectFixedDirectory, addManualTag, changeCategory, changePage,
            exportLibraryDB, importLibraryDB,
            renameCard, exportWorldbook,
            selectedIds, handleCardClick, toggleSelection, clearSelection,
            isMultiSelectMode, contextMenu, openContextMenu, closeContextMenu,
            quickMoveGroup, exportCard, deleteCardItem, handleContextMenuAction,
            batchChangeCategory, batchAddTag,
            batchChangeCategoryModal, batchExportSelected,
            showBatchTagModal, batchInputTags, batchMode, presetTagsLibrary,
            tagLangMode, toggleTagLangMode, getPresetTagText, displayTagText,
            togglePresetTag, executeBatchTagSave,
            showAITagModal, aiTagMode, aiCandidateTags, aiCustomPrompt, aiTaggingProgress, isAITagging, openAITagModal, startAITagging,
            systemPromptPresets, activeSystemPromptId, addSystemPromptPreset, deleteSystemPromptPreset, saveSystemPromptsToStorage, getCurrentSystemPromptContent,
            defaultSystemTags, globalAvailableTags, newGlobalTagInput, addTagToGlobalPool, removeTagFromGlobalPool,
            isEditingSystemTags, addGlobalTag,
            chatHistory, chatInput, isChatting, apiEndpoint, apiKey, apiModel, apiType, saveApiConfig, handleApiTypeChange, chatContainer,
            rebindTavernPath,
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
            confirmPrompt, cancelPrompt,
            // 🌍 世界书双引擎模式
            appMode, worldbooks, activeWorldbook, lastWorldbookDirPath, editorLogs, showEditorLogs, addLog,
            loadWorldbooks, scanWorldbookDir, saveActiveWorldbook, exportActiveWorldbook, saveCurrentAsset,
            // 🌍 世界书词条深度编辑 (Entry IDE)
            addWorldbookEntry, deleteWorldbookEntry, duplicateWorldbookEntry,
            entrySearchQuery, isAllEntriesCollapsed, filteredWorldbookEntries, toggleAllEntriesCollapse,
            // 🎨 三主题切换（暗夜/青灰/白昼）
            setTheme,
            // 🚀 首屏加载状态
            isAppLoading,
            // � 侧边栏宽度拖拽自定义
            sidebarEl, sidebarWidth, sidebarStyle, startSidebarResize, resetSidebarWidth,
            // �🔍 智能查重与版本清洗
            showDedupeModal, duplicateGroups, startDedupeScan, resolveDedupeGroup,
            // 🌍 世界书库筛选与对比查重
            wbSearchQuery, wbFilterType, filteredWorldbooks,
            showWbDedupeModal, wbDuplicateGroups, startWorldbookDedupeScan, resolveWbDedupeGroup,
            // ⚖️ 双屏差异比对器 (Diff Inspector)
            showDiffDetailModal, diffMasterItem, diffCompareItem, diffFieldResults, openDiffDetailModal
        };
    }
});

// ================= Vue 全局错误兜底 =================
app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue 错误]', info, err);
};

app.mount('#app');

window.__app = app; // 【临时】截图脚本暴露 Vue 实例（用后移除）
