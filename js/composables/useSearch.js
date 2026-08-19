import { ref, computed, watch } from 'vue';

/**
 * 超级搜索引擎组合式函数（Composable）
 * 从 App.vue 拆分而来，收敛：搜索输入防抖、全字段穿透检索/高级语法过滤/排序（filteredLibrary）、
 * 分页计算（totalPages/paginatedLibrary）与换页逻辑（changePage）。
 * 共享响应式状态（library / currentCategoryKey / allCategories / sortBy / currentPage / itemsPerPage / lastSelectedIndex）
 * 与工具 estimateCardTokens 保留在 App.vue 顶层并注入，其余状态与计算方法在此定义。
 */

/**
 * 安全提取卡片对象内所有递归可检索字符串（防 null/undefined 报错，兼容 V1/V2/V3/SillyTavern 扩展）
 * 覆盖：物理文件名/路径/分组、角色名/作者/描述/性格/场景/首条开场白/对话示例/作者备注、
 * 备选开场白列表、深度提示词/系统提示词、正则脚本、内嵌世界书全部词条（名称/注释/触发词/正文）
 */
function extractCardSearchableText(item) {
    const data = (item && item.data && item.data.data) || (item && item.data) || {};
    const textSegments = [];
    const push = (v) => { if (v !== undefined && v !== null && v !== '') textSegments.push(String(v)); };

    // 1. 基础物理与系统信息
    if (item && item.fileName) push(item.fileName); // 物理文件名（含扩展名）
    if (item && item.path) push(item.path); // 绝对路径
    if (item && item.subFolder) push(item.subFolder); // 物理分组
    if (item && item.category) push(item.category);
    if (item && item.name) push(item.name);
    if (item && item.creator) push(item.creator);

    // 2. 核心人设文本
    push(data.name);
    push(data.creator || data.author);
    push(data.description);
    push(data.personality);
    push(data.scenario);
    push(data.first_mes);
    push(data.mes_example);
    push(data.creator_notes);

    // 3. 备选开场白 (Alternate Greetings)
    if (Array.isArray(data.alternate_greetings)) {
        push(data.alternate_greetings.map(g => String(g)).join(' '));
    }

    // 4. 扩展配置 (Extensions: depth_prompt / system_prompt / regex_scripts)
    const ext = data.extensions;
    if (ext && typeof ext === 'object') {
        if (ext.depth_prompt && ext.depth_prompt.prompt) push(ext.depth_prompt.prompt);
        if (ext.system_prompt !== undefined && ext.system_prompt !== null) {
            push(typeof ext.system_prompt === 'string' ? ext.system_prompt : JSON.stringify(ext.system_prompt));
        }
        if (Array.isArray(ext.regex_scripts)) {
            ext.regex_scripts.forEach(script => {
                if (!script || typeof script !== 'object') return;
                if (script.scriptName) push(script.scriptName);
                if (script.findRegex) push(script.findRegex);
                if (script.replaceString) push(script.replaceString);
            });
        }
    }

    // 5. 关联世界书 (Character Book / Lorebook)
    const book = data.character_book || (item && item.data && item.data.character_book) || (item && item.character_book);
    if (book) {
        const entries = book.entries || (Array.isArray(book) ? book : []);
        if (Array.isArray(entries)) {
            entries.forEach(entry => {
                if (!entry || typeof entry !== 'object') return; // 防脏数据条目（null/非对象）崩溃
                if (entry.comment || entry.name) push(entry.comment || entry.name);
                if (entry.content) push(entry.content);
                if (Array.isArray(entry.keys)) push(entry.keys.map(k => String(k)).join(' '));
                if (Array.isArray(entry.secondary_keys)) push(entry.secondary_keys.map(k => String(k)).join(' '));
            });
        }
    }

    // 拼合成单一的全量小写字符串流
    return textSegments.join(' ').toLowerCase();
}

/**
 * 提取卡片的所有标签数组（兼容数组/逗号分隔字符串/customTags/原生 tags）
 */
function extractCardTags(item) {
    const data = (item && item.data && item.data.data) || (item && item.data) || {};
    const tags = new Set();
    const collect = (t) => {
        if (Array.isArray(t)) {
            t.forEach(x => { if (x !== undefined && x !== null && x !== '') tags.add(String(x).toLowerCase()); });
        } else if (typeof t === 'string' && t.trim() !== '') {
            t.split(',').map(x => x.trim()).filter(Boolean).forEach(x => tags.add(x.toLowerCase()));
        }
    };
    if (item) {
        collect(item.tags);
        collect(item.customTags);
    }
    collect(data.tags);
    return Array.from(tags);
}

export function useSearch({
    library,
    currentCategoryKey,
    allCategories,
    sortBy,
    currentPage,
    itemsPerPage,
    lastSelectedIndex,
    estimateCardTokens
}) {
    // ================= [ 性能优化：搜索防抖 ] =================
    const searchQueryInput = ref(''); // 绑定给搜索框的输入值（实时更新）
    const searchQuery = ref('');      // 用于实际过滤的内部值（300ms 防抖延迟更新）
    let searchTimeout = null;

    // 监听输入，300ms 后才更新实际的过滤词
    watch(searchQueryInput, (newVal) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery.value = newVal;
        }, 300);
    });

    // ================= 🚀 超级搜索引擎：全字段穿透 + 高级语法检索 + 全规范兼容 =================
    // 支持：多词 AND（傲娇 女仆）/ -排除词 / tag:/t: / author:/a: / file:/f: / wb:/w:
    const filteredLibrary = computed(() => {
        // —— 分类/快捷筛选（含特殊快捷过滤：带世界书 / 带正则脚本）——
        const passCategory = (card) => {
            if (currentCategoryKey.value === 'all') return true;
            if (currentCategoryKey.value === 'has_lorebook') {
                // 📖 带世界书：卡片内嵌世界书且有条目
                const d = card.data?.data || card.data || {};
                const book = d.character_book || card.data?.character_book || {};
                const entries = book.entries || (Array.isArray(book) ? book : []);
                return (entries || []).length > 0;
            }
            if (currentCategoryKey.value === 'has_regex') {
                // ⚡ 带正则脚本：卡片内嵌正则脚本
                const d = card.data?.data || card.data || {};
                const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                return (regex || []).length > 0;
            }
            const targetCat = allCategories.value.find(c => c.key === currentCategoryKey.value);
            if (!targetCat) return true;
            // 【加固】分组匹配兼容多种存储形态：预设 cn/en/key + 物理文件夹一级名（subFolder）
            const subName = card.subFolder ? card.subFolder.split(/[\\/]/)[0] : '';
            return card.category === targetCat.cn || card.category === targetCat.en || card.category === targetCat.key
                || (!!subName && (subName === targetCat.cn || subName === targetCat.en || subName === targetCat.key));
        };

        // —— 列表排序（在过滤结果上稳定排序，不修改原始 library）——
        const sortCards = (a, b) => {
            if (sortBy.value === 'name') {
                return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
            }
            if (sortBy.value === 'time') {
                // 【修复 BUG-1】"最新"以物理文件时间为准（修改时间 > 创建时间），避免卡片内建 create_date
                // （作者创作日期可多年不变/同批卡相同）造成的排序混乱；
                // 物理时间缺失时才回退卡片内建 create_date（用于未落盘/特殊来源的卡）
                const pickTime = (card) => {
                    const m = Number(card._mtime) || 0;
                    const c = Number(card._ctime) || 0;
                    if (m && c) return Math.max(m, c); // 修改与创建取较新（最近活动）
                    if (m) return m;
                    if (c) return c;
                    return Date.parse((card.data?.data || card.data || {}).create_date) || 0;
                };
                return pickTime(b) - pickTime(a); // 最新优先
            }
            if (sortBy.value === 'tokens') {
                return estimateCardTokens(b) - estimateCardTokens(a); // Token 多优先
            }
            return 0;
        };

        // 无关键词：仅按当前分类过滤 + 排序（浏览模式）
        const query = (searchQuery.value || '').toLowerCase().trim();
        if (!query) {
            return library.value.filter(passCategory).sort(sortCards);
        }

        // —— 解析搜索表达式（拆分为多个 token，识别高级语法）——
        const rules = { mustInclude: [], mustExclude: [], tagOnly: [], authorOnly: [], fileOnly: [], wbOnly: [] };
        query.split(/\s+/).forEach(token => {
            if (token.startsWith('-') && token.length > 1) rules.mustExclude.push(token.slice(1));
            else if (token.startsWith('tag:') || token.startsWith('t:')) rules.tagOnly.push(token.replace(/^(tag:|t:)/, ''));
            else if (token.startsWith('author:') || token.startsWith('a:')) rules.authorOnly.push(token.replace(/^(author:|a:)/, ''));
            else if (token.startsWith('file:') || token.startsWith('f:')) rules.fileOnly.push(token.replace(/^(file:|f:)/, ''));
            else if (token.startsWith('wb:') || token.startsWith('w:')) rules.wbOnly.push(token.replace(/^(wb:|w:)/, ''));
            else rules.mustInclude.push(token);
        });

        return library.value.filter(card => {
            try {
                // 1. 分类过滤（搜索也遵守当前分组/快捷筛选；选"全部"= 全局检索）
                if (!passCategory(card)) return false;

                const data = card.data?.data || card.data || {};

                // 2. 排除词校验（- 语法）
                if (rules.mustExclude.length > 0) {
                    const fullText = extractCardSearchableText(card);
                    if (rules.mustExclude.some(ex => fullText.includes(ex))) return false;
                }

                // 3. 标签特定筛选（tag:/t: 语法）
                if (rules.tagOnly.length > 0) {
                    const cardTags = extractCardTags(card);
                    if (!rules.tagOnly.every(target => cardTags.some(t => t.includes(target)))) return false;
                }

                // 4. 作者特定筛选（author:/a: 语法）
                if (rules.authorOnly.length > 0) {
                    const author = String(data.creator || data.author || card.creator || '').toLowerCase();
                    if (!rules.authorOnly.every(a => author.includes(a))) return false;
                }

                // 5. 物理文件名/路径筛选（file:/f: 语法）
                if (rules.fileOnly.length > 0) {
                    const fileName = card.fileName || String(card.path || '').split(/[\\/]/).pop() || '';
                    const filePath = `${fileName} ${card.subFolder || ''} ${card.path || ''}`.toLowerCase();
                    if (!rules.fileOnly.every(f => filePath.includes(f))) return false;
                }

                // 6. 世界书专用筛选（wb:/w: 语法）
                if (rules.wbOnly.length > 0) {
                    const book = data.character_book || card.data?.character_book || card.character_book;
                    const entries = book ? (book.entries || (Array.isArray(book) ? book : [])) : [];
                    const wbText = JSON.stringify(entries || []).toLowerCase();
                    if (!rules.wbOnly.every(w => wbText.includes(w))) return false;
                }

                // 7. 全文本多词必含校验（AND 逻辑，穿透 100% 字段盲区）
                if (rules.mustInclude.length > 0) {
                    const fullText = extractCardSearchableText(card);
                    if (!rules.mustInclude.every(kw => fullText.includes(kw))) return false;
                }

                return true;
            } catch (e) {
                // 🛡️ 异常卡片自动跳过，保证列表稳定渲染不白屏
                console.warn('⚠️ 检索卡片异常跳过:', card.fileName || card.name, e);
                return false;
            }
        }).sort(sortCards);
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

    // 换页逻辑
    const changePage = (page) => {
        if (page >= 1 && page <= totalPages.value) {
            currentPage.value = page;
            // ✅ [补丁] 翻页时清理上一次点击索引，防止跨页 Shift 连选基于页内索引超界误选当页卡片
            lastSelectedIndex.value = -1;
        }
    };

    return {
        searchQueryInput, searchQuery,
        filteredLibrary, totalPages, paginatedLibrary,
        changePage
    };
}