<template>
    <div class="view-page">
        <van-nav-bar title="卡片库" safe-area-inset-top>
            <template #right>
                <div class="nav-actions">
                    <van-icon name="plus" size="20" @click="onImport" />
                    <van-icon name="replay" size="20" style="margin-left: 14px" @click="onRefresh" />
                    <van-icon name="ellipsis" size="22" style="margin-left: 14px" @click="showMore = true" />
                </div>
            </template>
        </van-nav-bar>

        <van-pull-refresh :disabled="pullDisabled" v-model="refreshing" @refresh="onRefresh" class="flex-1" :pull-distance="80">
            <div class="view-body">
                <!-- 未授权引导：整页覆盖，隐藏工具条，引导完成 SAF 目录授权 -->
                <div v-if="!libraryReady && !loading && needsAuth" class="auth-guide">
                    <van-icon name="friends-o" size="56" :color="isDark ? '#3f3f46' : '#c8c9cc'" />
                    <div class="guide-title">{{ authLost ? '库目录已失效' : '尚未授权卡片库目录' }}</div>
                    <div class="guide-desc">
                        <template v-if="authLost">
                            之前授权的文件夹现在无法访问（可能已被移动、删除或系统回收了授权）。
                            请重新选择角色卡库文件夹以继续使用。
                        </template>
                        <template v-else>
                            选择存放角色卡片的文件夹后，即可浏览、搜索、编辑与导出卡片。授权基于系统文件夹（SAF），无需申请存储权限。
                        </template>
                    </div>
                    <van-button type="primary" round block class="guide-btn" @click="grantLib">
                        {{ authLost ? '重新选择库目录' : '选择库目录' }}
                    </van-button>
                    <div class="guide-tip">也可在「设置」页随时更改库目录</div>
                </div>

                <template v-else>
                <!-- 搜索 -->
                <van-search v-model="query" placeholder="搜索 名称/简介/触发词/标签/文件名" shape="round" />

                <!-- 快捷过滤 -->
                <div class="cat-scroll">
                    <div
                        v-for="f in quickFilters"
                        :key="f.value"
                        class="cat-chip"
                        :class="{ active: quickFilter === f.value }"
                        @click="onQuickFilter(f.value)"
                    >{{ f.label }}</div>
                    <div class="cat-chip" :class="{ active: showTagPanel }" @click="showTagPanel = true">🏷️ 标签分类</div>
                </div>

                <!-- 标签大分类面板（第二波：对齐桌面 v2.2.0 五级分类体系） -->
                <TagCategoryPanel v-model:show="showTagPanel" :library="mobileLibrary.library" @pick="onTagPick" />

                <!-- 激活的标签过滤指示（点 ✕ 清除） -->
                <div v-if="tagFilter" class="tag-active-bar">
                    <span class="tag-active-chip">🏷️ {{ tagFilter }}<van-icon name="cross" size="12" class="tag-clear" @click="clearTagFilter" /></span>
                </div>

                <!-- 分组横向滚动 -->
                <div class="cat-scroll">
                    <div
                        v-for="cat in groupChips"
                        :key="cat"
                        class="cat-chip"
                        :class="{ active: selected === cat }"
                        @click="onSelectCategory(cat)"
                    >{{ cat }}</div>
                    <div class="cat-chip manage-chip" @click="showGroupManage = true">
                        <van-icon name="setting-o" size="13" /> 管理分组
                    </div>
                </div>

                <!-- 视图切换 + 排序 -->
                <div class="view-bar">
                    <span class="count">{{ filtered.length }} 张</span>
                    <van-dropdown-menu class="sort-menu">
                        <van-dropdown-item v-model="sortBy" :options="sortOptions" />
                    </van-dropdown-menu>
                </div>

                <!-- 视图切换：平铺 / 网格 / 海报 / 翻页 -->
                <div class="view-mode-bar">
                    <span class="vm-btn" :class="{ active: viewMode === 'list' }" @click="setViewMode('list')">平铺</span>
                    <span class="vm-btn" :class="{ active: viewMode === 'grid' }" @click="setViewMode('grid')">网格</span>
                    <span class="vm-btn" :class="{ active: viewMode === 'poster' }" @click="setViewMode('poster')">海报</span>
                    <span class="vm-btn" :class="{ active: viewMode === 'page' }" @click="setViewMode('page')">翻页</span>
                </div>

                <!-- 卡片网格 / 列表 -->
                <div v-if="loading" class="status-wrap">
                    <van-loading size="28">
                        {{ loadTip }}
                    </van-loading>
                </div>
                <van-empty v-else-if="!filtered.length" description="没有卡片" />
                <div v-else-if="viewMode !== 'page'" class="cards-wrap" :class="{ list: viewMode === 'list', poster: viewMode === 'poster' }">
                    <div
                        v-for="card in visibleList"
                        :key="card.path"
                        class="card-item"
                        :class="{ 'is-list': viewMode === 'list', 'is-poster': viewMode === 'poster', 'batch-on': batchMode }"
                        @click="batchMode ? toggleBatch(card.path) : openCard(card)"
                        @longpress="batchMode ? toggleBatch(card.path) : showActions(card)"
                    >
                        <div
                            v-if="batchMode"
                            class="batch-dot"
                            :class="{ checked: batchSet.has(card.path) }"
                            @click.stop="toggleBatch(card.path)"
                        >✓</div>
                        <MobileCardCover v-if="viewMode !== 'list'" :card="card" class="grid-cover" :class="{ 'poster-cover': viewMode === 'poster' }" />
                        <div class="card-meta">
                            <div class="c-name">{{ card.name }}</div>
                            <div v-if="viewMode !== 'list'" class="c-cat">{{ card.category }}</div>
                            <div v-if="viewMode === 'list'" class="c-desc">{{ snippet(card) }}</div>
                            <div v-if="viewMode === 'poster'" class="c-desc">{{ snippet(card) }}</div>
                        </div>
                    </div>
                    <div
                        v-if="filtered.length > renderCount"
                        class="load-more-hint"
                    >
                        <van-loading size="20">下滑加载更多…</van-loading>
                    </div>
                </div>

                <!-- 翻页视图：一页一张大卡片，左右翻页 -->
                <div v-else class="page-wrap">
                    <div
                        v-if="pageCard"
                        class="page-card"
                        @click="batchMode ? toggleBatch(pageCard.path) : openCard(pageCard)"
                        @longpress="batchMode ? toggleBatch(pageCard.path) : showActions(pageCard)"
                    >
                        <div
                            v-if="batchMode"
                            class="batch-dot"
                            :class="{ checked: batchSet.has(pageCard.path) }"
                            @click.stop="toggleBatch(pageCard.path)"
                        >✓</div>
                        <MobileCardCover :card="pageCard" class="page-cover" />
                        <div class="page-meta">
                            <div class="page-name">{{ pageCard.name }}</div>
                            <div class="page-cat">{{ pageCard.category }}</div>
                            <div class="page-desc">{{ snippet(pageCard) }}</div>
                        </div>
                    </div>
                    <div v-else class="page-empty">没有卡片</div>
                    <div class="page-nav">
                        <van-button size="small" plain icon="arrow-left" :disabled="pageIndex === 0" @click="prevPage">上一张</van-button>
                        <span class="page-indicator">{{ filtered.length ? (pageIndex + 1) + ' / ' + filtered.length : '0 / 0' }}</span>
                        <van-button size="small" plain icon="arrow" :disabled="pageIndex >= filtered.length - 1" @click="nextPage">下一张</van-button>
                    </div>
                </div>
                <div class="bottom-pad" />
                </template>
            </div>
        </van-pull-refresh>

        <!-- 长按操作 -->
        <van-action-sheet
            v-model:show="showSheet"
            :actions="sheetActions"
            cancel-text="取消"
            @select="onSheetSelect"
            @cancel="showSheet = false"
        />

        <!-- 顶部「更多」操作菜单 -->
        <van-action-sheet
            v-model:show="showMore"
            :actions="moreActions"
            cancel-text="取消"
            description="更多操作"
            @select="onMoreSelect"
            @cancel="showMore = false"
        />

        <!-- 批量模式底部操作栏 -->
        <div v-if="batchMode" class="batch-bar">
            <span class="bb-count">已选 {{ batchSet.size }} 张</span>
            <van-button size="small" plain @click="selectAllBatch">全选</van-button>
            <van-button size="small" plain type="primary" :disabled="!batchSet.size" @click="showBatchTag = true">批量标签</van-button>
            <van-button size="small" plain :disabled="!batchSet.size || aiTagRunning" @click="showBatchAiTag = true">🤖 AI 打标</van-button>
            <van-button size="small" plain type="warning" :disabled="!batchSet.size" @click="showGroupSheet = true">批量分组</van-button>
            <van-button size="small" plain type="success" :disabled="!batchSet.size" @click="onBatchPush">推送</van-button>
            <van-button size="small" plain type="danger" :disabled="!batchSet.size" @click="onBatchDelete">删除</van-button>
            <van-button size="small" @click="exitBatch">退出</van-button>
        </div>

        <!-- 批量标签弹窗 -->
        <van-dialog
            v-model:show="showBatchTag"
            title="批量标签(逗号分隔)"
            show-cancel-button
            :before-close="onBatchTagClose"
        >
            <div style="padding: 12px 16px 4px">
                <van-radio-group v-model="batchTagMode" direction="horizontal">
                    <van-radio name="append">追加</van-radio>
                    <van-radio name="overwrite">覆盖</van-radio>
                </van-radio-group>
            </div>
            <van-field
                v-model="batchTagInput"
                type="textarea"
                rows="2"
                autosize
                placeholder="例: 奇幻,冒险,Fantasy"
                style="margin: 8px 0 16px"
            />
        </van-dialog>

        <!-- 批量 AI 打标进度弹窗 -->
        <van-dialog
            v-model:show="showBatchAiTag"
            title="🤖 批量 AI 打标"
            show-cancel-button
            confirm-button-text="开始打标"
            :confirm-button-disabled="aiTagRunning"
            :before-close="onBatchAiTagClose"
            :close-on-click-overlay="false"
        >
            <div class="aitag-progress">
                <p class="aitag-desc">将对选中的 {{ batchSet.size }} 张卡片调用 AI 提取标签并追加到卡片 tags（失败单卡自动跳过）。</p>
                <div v-if="aiTagRunning" class="aitag-bar">
                    <van-progress :percentage="aiTagProgress.total ? Math.round(aiTagProgress.current / aiTagProgress.total * 100) : 0" />
                    <p class="aitag-status">{{ aiTagProgress.status }}</p>
                    <p class="aitag-count">{{ aiTagProgress.current }} / {{ aiTagProgress.total }}</p>
                </div>
            </div>
        </van-dialog>

        <!-- 批量导出选择 -->
        <van-action-sheet
            v-model:show="showExportSheet"
            :actions="exportSheetActions"
            cancel-text="取消"
            description="批量导出为 ZIP 包(分享)"
            @select="onExportSelect"
            @cancel="showExportSheet = false"
        />

        <!-- 移动分组选择 -->
        <van-action-sheet
            v-model:show="showGroupSheet"
            :actions="batchMode ? batchGroupActions : groupSheetActions"
            cancel-text="取消"
            :description="batchMode ? '移动选中卡片到分组' : '移动到分组'"
            @select="onGroupSelect"
            @cancel="showGroupSheet = false"
        />

        <!-- 查重弹窗(角色卡) -->
        <DedupeModal v-model:show="showDedupe" :mode="dedupeMode" @cleaned="onDedupeCleaned" @switch-mode="dedupeMode = $event" />

        <!-- 分组管理 -->
        <van-action-sheet
            v-model:show="showGroupManage"
            :actions="groupManageActions"
            cancel-text="取消"
            description="分组管理(新建/重命名/删除空分组)"
            @select="onGroupManageSelect"
            @cancel="showGroupManage = false"
        />

        <!-- 分组操作二次菜单 -->
        <van-action-sheet
            v-model:show="showGroupAction"
            :actions="groupActionItems"
            cancel-text="取消"
            :description="`分组「${groupActionTarget}」`"
            @select="onGroupActionSelect"
            @cancel="showGroupAction = false"
        />

        <!-- URL 导入卡片 -->
        <van-dialog
            v-model:show="showUrlImport"
            title="从网址导入卡片"
            show-cancel-button
            :before-close="onUrlImportClose"
        >
            <van-field
                v-model="urlInput"
                label="网址"
                placeholder="https://…/character.png 直链"
                style="margin: 16px 0"
            />
        </van-dialog>

        <!-- 角色宇宙图谱(懒加载：首次打开才拉取 GraphModal+ECharts chunk) -->
        <GraphModal
            v-if="showGraph"
            :show="showGraph"
            :library="mobileLibrary.library"
            @close="showGraph = false"
            @jump="jumpFromGraph"
        />

        <!-- 输入弹窗(重命名/新建分组等，WebView 中 window.prompt 返回 null) -->
        <van-dialog
            v-model:show="showInputDialog"
            :title="inputDialogTitle"
            show-cancel-button
            @confirm="onInputConfirm"
            @cancel="onInputCancel"
        >
            <van-field v-model="inputValue" :placeholder="inputPlaceholder" style="margin: 16px 0" />
        </van-dialog>
    </div>
</template>

<script>
import { computed, ref, reactive, onMounted, watch, onBeforeUnmount, onActivated, onDeactivated, nextTick, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import { currentTheme } from '../theme';
import { useSearch, extractCardSearchableText, extractCardTags } from '../../composables/useSearch';
import searchIndex from '../../utils/searchIndex.js';
import { defaultAutoTagRules, compileAutoTagRules } from '../../utils/cardLoader.js';
import { api } from '../../bridge/api';
import { loadApiKey } from '../useChatApiConfig';
import MobileCardCover from '../components/MobileCardCover.vue';
import DedupeModal from '../components/DedupeModal.vue';
import TagCategoryPanel from '../components/TagCategoryPanel.vue';
// 🚀 加载提速：GraphModal 携带 ECharts(约 1MB)，改异步组件 + 模板 v-if 门控，
// 首次打开图谱才拉取该 chunk，启动/列表滚动不再背负图谱代码与模板编译
import {
    mobileLibrary, loadLibrary, moveCardToGroup, removeCard, renameCardTo, saveCardData, LIBRARY_ROOT, setLastOpenedPath
} from '../useMobileLibrary';

export default {
    name: 'CardLibraryView',
    components: { MobileCardCover, DedupeModal, TagCategoryPanel, GraphModal: defineAsyncComponent(() => import('../components/GraphModal.vue')) },
    directives: {
        // (已移除) 原 IntersectionObserver 触底哨兵在 pull-refresh 回弹时会被误判为上滑触发,
        // 改为基于滚动方向的 scroll 监听,见 setup 内触底加载逻辑。
    },
    setup() {
        const router = useRouter();
        const queryInput = ref('');
        const query = queryInput; // 搜索输入(桌面版 useSearch 内置 300ms 防抖,此处 query 直接引用输入值)
        const searchQueryInput = queryInput;
        const isDark = currentTheme() === 'dark';
        const selected = ref('全部');
        const VIEW_MODES = ['list', 'grid', 'poster', 'page'];
        const viewMode = ref((() => {
            const saved = localStorage.getItem('jsmobile_viewmode');
            if (VIEW_MODES.includes(saved)) return saved;
            // 兼容旧版 jsmobile_grid 存储:list→平铺,其余→网格
            return localStorage.getItem('jsmobile_grid') === 'list' ? 'list' : 'grid';
        })());
        function setViewMode(v) {
            if (!VIEW_MODES.includes(v)) return;
            viewMode.value = v;
            try { localStorage.setItem('jsmobile_viewmode', v); } catch (e) { /* 忽略 */ }
            renderCount.value = 24;   // 切换视图重置增量渲染窗口
            pageIndex.value = 0;      // 切换视图重置翻页索引
        }
        const refreshing = ref(false);
        const pullDisabled = ref(false);
        const loading = ref(false);
        const libraryReady = ref(false);
        const needsAuth = ref(false);
        const authLost = ref(false);
        const showSheet = ref(false);
        const showGroupSheet = ref(false);
        const showExportSheet = ref(false);
        const showDedupe = ref(false);
        const dedupeMode = ref('card'); // 'card' | 'content' | 'worldbook'
        // 顶部「更多」菜单
        const showMore = ref(false);
        const moreActions = [
            { name: '角色宇宙图谱', value: 'graph', icon: 'cluster-o' },
            { name: '查重', value: 'dedupe', icon: 'cluster' },
            { name: '从网址导入', value: 'urlimport', icon: 'link-o' },
            { name: '批量导出 ZIP', value: 'export', icon: 'share-o' }
        ];
        function onMoreSelect(action) {
            showMore.value = false;
            if (action.value === 'graph') showGraph.value = true;
            else if (action.value === 'dedupe') onDedupe();
            else if (action.value === 'urlimport') showUrlImport.value = true;
            else if (action.value === 'export') showExportSheet.value = true;
        }
        // 增量渲染:首次只渲染 24 张,触底每次加 16 张
        const BATCH_STEP = 16;
        const renderCount = ref(24);
        const visibleList = computed(() => filtered.value.slice(0, renderCount.value));
        function extendRender() {
            if (renderCount.value >= filtered.value.length) return;
            renderCount.value += BATCH_STEP;
            if (renderCount.value > filtered.value.length) renderCount.value = filtered.value.length;
        }
        // 触底加载:基于滚动方向判定,避免 van-pull-refresh 回弹导致哨兵反复触发。
        // 只在大于 lastScrollTop 且距底部 < 180px 时加载;筛选/搜索/分组切换时重置 scrollTop。
        let lastScrollTop = 0;
        let sentinelGuard = false;
        let scrollListener = null;
        let touchStartListener = null;
        const sentinelThreshold = 180;
        let scroller = null;
        function bindScroll() {
            unbindScroll();
            scroller = document.querySelector('.van-pull-refresh__track');
            if (!scroller) return;
            // 关键修复:在 touchstart 时锁定 pullDisabled 状态。
            // 手指按下时不在顶部(scrollTop>5)→ 整个手势期间禁用下拉刷新,
            // 即使手指滚回顶部也不会误触发。只有从顶部开始的新手势才能下拉刷新。
            touchStartListener = () => {
                pullDisabled.value = scroller.scrollTop > 5;
            };
            scroller.addEventListener('touchstart', touchStartListener, { passive: true });
            scrollListener = () => {
                const st = scroller.scrollTop;
                if (sentinelGuard) return;
                if (st < lastScrollTop) { lastScrollTop = st; return; } // 上滑忽略
                lastScrollTop = st;
                const sh = scroller.scrollHeight;
                const ch = scroller.clientHeight;
                if (sh - st - ch < sentinelThreshold) {
                    sentinelGuard = true;
                    extendRender();
                    setTimeout(() => { sentinelGuard = false; }, 250);
                }
            };
            scroller.addEventListener('scroll', scrollListener, { passive: true });
        }
        function unbindScroll() {
            if (scroller) {
                if (scrollListener) scroller.removeEventListener('scroll', scrollListener);
                if (touchStartListener) scroller.removeEventListener('touchstart', touchStartListener);
            }
            scrollListener = null;
            touchStartListener = null;
            scroller = null;
        }
        // keep-alive 缓存下 onMounted 只跑一次；pull-refresh 内部 track DOM 会随路由重建，
        // 必须用 onActivated 每次进入重新绑定监听，否则 pullDisabled 永不更新 → 滚动中误触刷新
        onMounted(() => { nextTick(bindScroll); });
        onActivated(() => {
            nextTick(bindScroll);
            // 回库时同步「忽略卡自带标签」开关(可能在设置页被切换)→ 标签搜索语义即时生效
            sanitizeImportedTags.value = localStorage.getItem('jsmobile-ignore-import-tags') === '1';
        });
        onDeactivated(unbindScroll);
        onBeforeUnmount(unbindScroll);
        // 修复 TDZ：quickFilter 在下方才初始化，watch 不能在此处先行执行
        // watch([() => selected.value, () => quickFilter.value, () => queryInput.value], () => { lastScrollTop = 0; renderCount.value = 24; });
        let activeCard = null;

        /** 查重入口(角色卡) */
        function onDedupe() {
            if (!mobileLibrary.library.length) {
                showToast('卡片库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }
        /** 查重清理完成后刷新分组(空分组/统计) */
        function onDedupeCleaned() {
            load();
        }

        const groupChips = computed(() => {
            const set = ['全部', '未分类', ...mobileLibrary.categories];
            return [...new Set(set)];
        });

        // ---------- 快捷过滤 ----------
        const quickFilter = ref('all');
        // ---------- 标签大分类面板（第二波：对齐桌面 v2.2.0） ----------
        const showTagPanel = ref(false);
        const tagFilter = ref(''); // 当前激活的标签过滤（精确匹配卡片任一标签）
        function onTagPick(t) {
            tagFilter.value = t;
            lastScrollTop = 0; renderCount.value = 24;
        }
        function clearTagFilter() {
            tagFilter.value = '';
            lastScrollTop = 0; renderCount.value = 24;
        }
        // 修复 TDZ：原来 watch 在 quickFilter 定义之前注册(初始化求值)，抛 Cannot access 'quickFilter' before
        // initialization → 移动端首屏渲染即崩溃。移到定义后注册，语义不变。
        watch([() => selected.value, () => quickFilter.value, () => queryInput.value], () => { lastScrollTop = 0; renderCount.value = 24; });
        const quickFilters = [
            { label: '全部', value: 'all' },
            { label: '📚 有世界书', value: 'has_lorebook' },
            { label: '🔧 有正则', value: 'has_regex' }
        ];
        // 对齐桌面:内嵌世界书在 data.character_book(V2/V3),兼容 V1 顶层
        const wbOf = (c) => {
            const data = c && c.data;
            return (data && data.data && data.data.character_book) || (data && data.character_book);
        };
        const applyQuickFilter = (list) => {
            if (quickFilter.value === 'has_lorebook') {
                return list.filter((c) => {
                    const wb = wbOf(c);
                    return wb && wb.entries && Object.keys(wb.entries).length;
                });
            }
            if (quickFilter.value === 'has_regex') {
                // 全形态兼容:对齐 useChatRegex.extractRegexFromCard 的四个读取位置
                return list.filter((c) => {
                    const dd = c.data && c.data.data;
                    const top = c.data;
                    const ddScripts = dd && dd.extensions && Array.isArray(dd.extensions.regex_scripts) ? dd.extensions.regex_scripts
                        : (dd && Array.isArray(dd.regex_scripts) ? dd.regex_scripts : null);
                    const topScripts = top && top.extensions && Array.isArray(top.extensions.regex_scripts) ? top.extensions.regex_scripts
                        : (top && Array.isArray(top.regex_scripts) ? top.regex_scripts : null);
                    return !!(ddScripts && ddScripts.length) || !!(topScripts && topScripts.length);
                });
            }
            return list;
        };

        // 快捷过滤与分组互斥：点快捷过滤重置分组，点分组重置快捷过滤
        function onQuickFilter(v) {
            quickFilter.value = v;
            selected.value = '全部';
            pageIndex.value = 0;
        }
        function onSelectCategory(cat) {
            selected.value = cat;
            quickFilter.value = 'all';
            pageIndex.value = 0;
        }

        // ---------- 搜索引擎：桌面 v2.1.0 同款 useSearch（倒排索引 + 中文分词 + 高级语法 + 9种排序） ----------
        const currentCategoryKey = computed(() => {
            // 快捷过滤优先级高于分组（否则「全部」分支会吞掉 has_regex/has_lorebook）
            if (quickFilter.value === 'has_lorebook') return 'has_lorebook';
            if (quickFilter.value === 'has_regex') return 'has_regex';
            if (selected.value === '全部') return 'all';
            // ⚠️ 分组 key 必须与 allCategories.key 严格一致(纯分组名,不带 'cat:' 前缀),
            // 否则 useSearch.passCategory 找不到 targetCat → return true → 分组过滤失效。
            if (selected.value === '未分类') return 'uncategorized';
            return selected.value;
        });
        const allCategories = computed(() => {
            // 桌面版 useSearch 用 cn/en/key 三态匹配分组；移动端统一用 cn 键。
            // '未分类' 是系统必需视图,须纳入 allCategories 才能被 passCategory 匹配。
            return [
                { key: 'uncategorized', cn: '未分类', en: '未分类' },
                ...mobileLibrary.categories.map((cn) => ({ cn, en: cn, key: cn }))
            ];
        });
        const sortBy = ref(localStorage.getItem('jsmobile-sortby') || 'time'); // 默认最新优先(与原实现一致)
        watch(sortBy, (v) => { try { localStorage.setItem('jsmobile-sortby', v); } catch (e) { /* 忽略 */ } });
        // 对齐桌面 v2.1.0 9种排序
        const sortOptions = [
            { text: '⏱ 本地文件最新', value: 'time' },
            { text: '📥 导入最新', value: 'importTime' },
            { text: '📅 创建时间 新→旧', value: 'ctime' },
            { text: '✏️ 修改时间 新→旧', value: 'mtime' },
            { text: '🔤 A-Z 正序', value: 'name' },
            { text: '🔡 A-Z 倒序', value: 'nameDesc' },
            { text: '📦 大→小', value: 'sizeDesc' },
            { text: '🎦 小→大', value: 'sizeAsc' },
            { text: '🎯 Token 多→少', value: 'tokens' }
        ];
        const currentPage = ref(1);
        const itemsPerPage = ref(999999); // 移动端无分页,增量渲染接管
        const lastSelectedIndex = ref(-1);
        // 对齐桌面 v2.2.1:开关开启时,标签搜索不再匹配卡片原生 data.tags(仅索引自定义标签)
        // 开关本体在设置页(localStorage jsmobile-ignore-import-tags);keep-alive 回库时在 onActivated 重读同步
        const sanitizeImportedTags = ref(localStorage.getItem('jsmobile-ignore-import-tags') === '1');
        const searchEngine = useSearch({
            library: computed(() => mobileLibrary.library),
            currentCategoryKey,
            allCategories,
            sortBy,
            currentPage,
            itemsPerPage,
            lastSelectedIndex,
            sanitizeImportedTags,
            estimateCardTokens: null // 桌面版 v2.1.0 已改用 tokenCache,此参数仅旧版引用
        });

        // 搜索输入同步到引擎(引擎内部 300ms 防抖写入 searchQuery,filteredLibrary 生效)
        watch(queryInput, (v) => { searchEngine.searchQueryInput.value = v; });

        // 分组匹配桌面版语义：'cat:xxx' 前缀转分组过滤；useSearch passCategory 已处理分类/子目录过滤
        const filtered = computed(() => {
            const list = searchEngine.filteredLibrary.value;
            if (!tagFilter.value) return list;
            // 精确标签过滤：卡片任一标签(尊重「忽略自带标签」开关)命中即保留
            const ignoreNative = sanitizeImportedTags.value;
            const target = tagFilter.value.toLowerCase();
            return list.filter((c) => {
                try {
                    return extractCardTags(c, { ignoreNative }).some((t) => String(t).toLowerCase() === target);
                } catch (e) { return false; }
            });
        });

        // 翻页视图：一页一张大卡片，左右翻页 + 页码指示
        const pageIndex = ref(0);
        const pageCard = computed(() => filtered.value[pageIndex.value] || null);
        watch(() => filtered.value.length, (n) => {
            if (pageIndex.value >= n) pageIndex.value = Math.max(0, n - 1);
        });
        function prevPage() { if (pageIndex.value > 0) pageIndex.value--; }
        function nextPage() { if (pageIndex.value < filtered.value.length - 1) pageIndex.value++; }

        function snippet(card) {
            const desc = (card.data && card.data.data && card.data.data.description) || '';
            return (desc.length > 60 ? desc.slice(0, 60) + '…' : desc) || card.category;
        }

        /** 加载提示:大库解析进度(前 200ms 与总数为 0 时显示通用文案) */
        const loadTip = computed(() => {
            const { done, total } = mobileLibrary.progress;
            if (total > 0 && done > 0) return `加载库… ${done}/${total} 张`;
            return '加载库…';
        });

        function openCard(card) {
            // 用 query 传 path:path 含 '/' 与中文,走 params 会被 vue-router 二次编码导致 id 对不上
            setLastOpenedPath(card.path);
            router.push({ name: 'cardDetail', query: { p: card.path } });
        }

        /** 导入卡片:系统文件选择器多选 → 复制入库(当前查看的分组内导入) */
        async function onImport() {
            const dest = (selected.value && selected.value !== '全部' && selected.value !== '未分类')
                ? LIBRARY_ROOT + '/' + selected.value
                : LIBRARY_ROOT;
            const res = await window.electronAPI.importExternalCards([], dest);
            if (res && res.success) {
                const m = [`导入 ${(res.copied || []).length} 张`];
                if (res.skipped && res.skipped.length) m.push(`跳过同名 ${res.skipped.length} 张`);
                if (res.failed && res.failed.length) m.push(`失败 ${res.failed.length} 张`);
                showSuccessToast(m.join(' · '));
                // 导入后必须强制重扫：loadLibrary(false) 在库就绪时会跳过扫描，新卡进不了内存
                await load(true);
                // 第三波：导入自动打标（开关开启时后台低并发执行，库重载完成后启动）
                autoTagImportedCards(res.copied || []);
            } else {
                showToast((res && res.error) || '已取消导入');
            }
        }

        async function load(refresh = false) {
            loading.value = true;
            needsAuth.value = false;
            renderCount.value = 24;
            await loadLibrary(refresh);
            loading.value = false;
            needsAuth.value = !mobileLibrary.ready && !!mobileLibrary.error;
            libraryReady.value = mobileLibrary.ready;
            // 库加载成功后异步构建搜索倒排索引（分块构建不阻塞 UI，万卡库搜索加速）
            if (libraryReady.value && mobileLibrary.library.length > 0) {
                searchIndex.buildAsync(mobileLibrary.library, extractCardSearchableText, extractCardTags).catch(() => {});
            }
            if (needsAuth.value && !authLost.value) {
                // 扫描失败且非"库根不可用"时,区分首次授权与授权失效(需查原生持久化状态)
                const info = await api.libraryInfo();
                authLost.value = !!(info && info.hasUri) && !info.granted;
            }
        }

        async function onRefresh() {
            refreshing.value = true;
            await load(true);
            refreshing.value = false;
        }

        async function grantLib() {
            const res = await window.electronAPI.selectFolder();
            if (res && !res.error) {
                authLost.value = false;
                load(true);
                // 选错目录引导:授权成功但该文件夹没有角色卡
                if (!(res.files && res.files.length)) {
                    showToast('该文件夹未找到角色卡，可重新选择');
                }
            }
            else showToast((res && res.error) || '已取消');
        }

        // ---------- 长按操作 ----------
        const sheetActions = computed(() => [
            { name: batchMode.value ? '退出多选' : '多选(批量操作)', value: 'batch' },
            { name: '移动到分组', value: 'move' },
            { name: '创建物理副本', value: 'duplicate' },
            { name: '导出', value: 'export' },
            { name: '定位文件', value: 'locate' },
            { name: '重命名', value: 'rename' },
            { name: '删除', value: 'delete', color: '#ee0a24' }
        ]);

        // ---------- URL 导入卡片 ----------
        const showUrlImport = ref(false);
        const urlInput = ref('');
        const urlImporting = ref(false);

        async function doUrlImport() {
            const url = (urlInput.value || '').trim();
            if (!url) { showToast('请输入卡片网址'); return false; }
            urlImporting.value = true;
            try {
                const dest = (selected.value && selected.value !== '全部' && selected.value !== '未分类')
                    ? LIBRARY_ROOT + '/' + selected.value
                    : LIBRARY_ROOT;
                const res = await window.electronAPI.downloadCardFromUrl({ url, destFolder: dest });
                if (res && res.success) {
                    showSuccessToast(`已导入「${res.fileName || '卡片'}」`);
                    urlInput.value = '';
                    await load(true); // 强制重扫：新卡进内存
                    // 第三波：导入自动打标（开关开启时后台低并发执行，不阻塞）
                    if (res.filePath) autoTagImportedCards([res.filePath]);
                    return true;
                }
                showToast((res && res.error) || '导入失败');
                return false;
            } finally {
                urlImporting.value = false;
            }
        }

        async function onUrlImportClose(action) {
            if (action !== 'confirm') { showUrlImport.value = false; return; }
            const ok = await doUrlImport();
            if (ok) showUrlImport.value = false;
        }

        // ---------- 批量系统(长按菜单「多选」进入) ----------
        const batchMode = ref(false);
        const batchSet = reactive(new Set());
        const showBatchTag = ref(false);
        const batchTagMode = ref('append');
        const batchTagInput = ref('');
        const showBatchGroup = ref(false);
        // 批量 AI 打标状态
        const showBatchAiTag = ref(false);
        const aiTagRunning = ref(false);
        const aiTagProgress = reactive({ current: 0, total: 0, status: '' });

        function enterBatch() {
            batchMode.value = true;
            batchSet.clear();
        }
        function exitBatch() {
            batchMode.value = false;
            batchSet.clear();
        }
        function toggleBatch(path) {
            if (batchSet.has(path)) batchSet.delete(path);
            else batchSet.add(path);
            // 触发响应式更新(Set 在 Vue3 reactive 下自动追踪)
        }
        function selectAllBatch() {
            if (batchSet.size >= filtered.value.length) {
                batchSet.clear();
            } else {
                filtered.value.forEach((c) => batchSet.add(c.path));
            }
        }

        const batchSelectedCards = () => mobileLibrary.library.filter((c) => batchSet.has(c.path));

        async function onBatchTagClose(action) {
            if (action !== 'confirm') return;
            const cards = batchSelectedCards();
            if (!cards.length) { showBatchTag.value = false; return; }
            const newTags = (batchTagInput.value || '').split(/[,，、\n]/).map(t => t.trim()).filter(Boolean);
            if (!newTags.length && batchTagMode.value === 'overwrite') {
                showToast('覆盖模式需输入标签');
                return;
            }
            let okCount = 0;
            for (const c of cards) {
                try {
                    const dd = c.data && (c.data.data || c.data);
                    if (!dd) continue;
                    if (batchTagMode.value === 'overwrite') {
                        dd.tags = [...newTags];
                    } else {
                        const cur = Array.isArray(dd.tags) ? dd.tags : [];
                        dd.tags = [...cur, ...newTags.filter(t => !cur.includes(t))];
                    }
                    const res = await window.electronAPI.saveCard(c.path, JSON.parse(JSON.stringify(c.data)));
                    if (res && res.success) okCount++;
                } catch (e) { /* 单卡失败不中断 */ }
            }
            showBatchTag.value = false;
            batchTagInput.value = '';
            showSuccessToast(`批量标签完成 ${okCount}/${cards.length} 张`);
        }

        // ---------- 批量 AI 打标（对齐桌面 AITagModal 的批量能力） ----------
        const LS_AI_ENDPOINT = 'stc-api-endpoint';
        const LS_AI_MODEL = 'stc-api-model';
        const LS_AI_TYPE = 'stc-api-type';
        function extractAiReply(res, type) {
            if (!res || !res.data) return '';
            const dd = res.data;
            if (type === 'anthropic') return (dd.content && dd.content[0] && dd.content[0].text) || '';
            return (dd.choices && dd.choices[0] && dd.choices[0].message && dd.choices[0].message.content) || '';
        }
        function parseAiTags(reply) {
            const s = String(reply || '').trim();
            // 容忍被 markdown 代码块包裹 / 前后杂质
            const m = s.match(/\[[\s\S]*?\]/);
            if (!m) return [];
            try {
                const arr = JSON.parse(m[0]);
                if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
            } catch (e) { /* 解析失败返回空 */ }
            return [];
        }
        // 弹窗关闭钩子：确认 → 触发打标；取消 → 仅关闭（若正在打标则忽略取消）
        async function onBatchAiTagClose(action) {
            if (action === 'confirm' && !aiTagRunning.value) await onBatchAiTag();
            else if (action !== 'confirm' && !aiTagRunning.value) { showBatchAiTag.value = false; }
        }

        async function onBatchAiTag() {
            const cards = batchSelectedCards();
            if (!cards.length) { showBatchAiTag.value = false; return; }
            const endpoint = (localStorage.getItem(LS_AI_ENDPOINT) || '').trim();
            if (!endpoint) { showToast('请先在「设置」页配置 AI API 端点'); return; }
            const model = (localStorage.getItem(LS_AI_MODEL) || 'local-model').trim();
            const type = localStorage.getItem(LS_AI_TYPE) === 'anthropic' ? 'anthropic' : 'openai';
            const key = (await loadApiKey()).trim();
            aiTagRunning.value = true;
            aiTagProgress.total = cards.length;
            aiTagProgress.current = 0;
            let okCount = 0;
            for (const c of cards) {
                aiTagProgress.current++;
                aiTagProgress.status = `正在分析 ${c.name || '卡片'}…`;
                const dd = c.data && (c.data.data || c.data);
                if (!dd) continue;
                const desc = String(dd.description || '').substring(0, 1500);
                const mes = String(dd.first_mes || '').substring(0, 500);
                const pers = String(dd.personality || '').substring(0, 300);
                const prompt = '你是专业的角色卡片标签分类助手。请根据角色设定提取最精准的标签。\n'
                    + '【输出强制规则】：必须只返回形如 ["标签1", "标签2"] 的纯 JSON 数组，不要任何解释文字。\n\n'
                    + `【角色设定】：\n名字：${c.name || '未知'}\n描述：${desc}\n性格：${pers}\n首句：${mes}`;
                try {
                    const res = await api.sendChatMessage(endpoint, {
                        model,
                        messages: [
                            { role: 'system', content: '你是一个专业的角色卡分析助手。请提取最符合角色的标签，严格只返回一个 JSON 数组（如 ["标签1","标签2"]），不要返回其他文字。' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.2
                    }, key, type);
                    if (!res || !res.success) continue;
                    const newTags = parseAiTags(extractAiReply(res, type));
                    if (!newTags.length) continue;
                    const cur = Array.isArray(dd.tags) ? dd.tags : [];
                    dd.tags = [...cur, ...newTags.filter((t) => !cur.includes(t))];
                    const saveRes = await api.saveCard(c.path, JSON.parse(JSON.stringify(c.data)));
                    if (saveRes && saveRes.success) okCount++;
                } catch (e) { /* 单卡失败不中断，继续下一张 */ }
            }
            aiTagRunning.value = false;
            showBatchAiTag.value = false;
            aiTagProgress.status = '';
            if (okCount) showSuccessToast(`AI 打标完成 ${okCount}/${cards.length} 张`);
            else showToast('AI 打标未命中任何标签（请检查 API 配置或网络）');
        }

        // ---------- 导入自动打标（第三波：对齐桌面 useCardCrud.processAutoTagsAndCategory） ----------
        // 规则表：系统预设(未禁用) + 用户自定义（与详情页 AI 打标面板同一套 localStorage 配置）
        function buildImportAutoTagRules() {
            let disabled = [];
            let custom = [];
            try { disabled = JSON.parse(localStorage.getItem('jsmobile-autotag-disabled') || '[]'); } catch (e) { /* ignore */ }
            try { custom = JSON.parse(localStorage.getItem('jsmobile-autotag-custom') || '[]'); } catch (e) { /* ignore */ }
            const sys = defaultAutoTagRules.filter((r) => !disabled.includes(r.name)).map((r) => ({ name: r.name, regex: r.regex }));
            return compileAutoTagRules([...sys, ...custom]);
        }

        /**
         * 对导入后的新卡应用自动打标规则：匹配卡文本 → 追加命中标签到 data.tags → 写盘。
         * 低并发(2)后台执行，不阻塞列表渲染；单卡失败静默跳过。
         * @param {string[]} paths 新卡路径列表（导入成功返回的 copied / filePath）
         */
        async function autoTagImportedCards(paths) {
            if (!paths || !paths.length) return;
            if (localStorage.getItem('jsmobile-import-autotag') !== '1') return; // 开关默认关
            const rules = buildImportAutoTagRules();
            if (!Object.keys(rules).length) return;
            // 调用方已保证库重载完成（load(true)），此处直接定位内存中的卡片对象
            const targets = mobileLibrary.library.filter((c) => paths.includes(c.path));
            if (!targets.length) return;
            const CONCURRENCY = 2; // 低并发：避免与用户交互争抢磁盘/桥接
            let okCount = 0;
            for (let i = 0; i < targets.length; i += CONCURRENCY) {
                const batch = targets.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (c) => {
                    try {
                        const dd = (c.data && (c.data.data || c.data)) || {};
                        const fullText = [dd.description, dd.personality, dd.scenario, dd.first_mes]
                            .filter(Boolean).join('\n');
                        if (!fullText.trim()) return;
                        const cur = Array.isArray(dd.tags) ? dd.tags : [];
                        const added = [];
                        for (const [tag, re] of Object.entries(rules)) {
                            try {
                                if (re.test(fullText) && !cur.includes(tag)) added.push(tag);
                            } catch (e) { /* 单条正则非法跳过 */ }
                        }
                        if (!added.length) return;
                        dd.tags = [...cur, ...added];
                        const res = await saveCardData(c);
                        if (res && res.success) okCount++;
                    } catch (e) { /* 单卡失败跳过 */ }
                }));
                await new Promise((r) => setTimeout(r, 0)); // 批间让出主线程
            }
            if (okCount) showSuccessToast(`自动打标完成 ${okCount}/${targets.length} 张`);
        }

        /** 批量推送:复制选中卡片到共享推送目标(卡库目录模式);酒馆模式引导去详情页配地址 */
        const LS_PUSH_TARGETS = 'jsmobile-push-targets';
        async function onBatchPush() {
            const cards = batchSelectedCards();
            if (!cards.length) return;
            let cfg = null;
            try { cfg = JSON.parse(localStorage.getItem(LS_PUSH_TARGETS) || 'null'); } catch (e) { cfg = null; }
            if (!cfg || cfg.mode !== 'custom' || !(cfg.currentId)) {
                showToast('请先在卡片详情页推送弹窗中配置卡库目录目标');
                return;
            }
            const target = (cfg.targets || []).find((t) => t.id === cfg.currentId);
            if (!target) {
                showToast('推送目标不存在，请重新配置');
                return;
            }
            try {
                await showConfirmDialog({
                    title: '批量推送',
                    message: `将选中的 ${cards.length} 张卡片复制到「${target.name}」？同名文件将被覆盖。`
                });
            } catch (e) { return; }
            const res = await window.electronAPI.pushToCustomDir({
                filePaths: cards.map((c) => c.path),
                targetDir: target.uri
            });
            if (res && res.success) {
                const failCount = (res.failed || []).length;
                showSuccessToast(`已推送 ${res.count || cards.length - failCount} 张` + (failCount ? `，失败 ${failCount} 张` : ''));
            } else {
                showToast((res && res.error) || '批量推送失败');
            }
        }

        async function onBatchDelete() {
            const cards = batchSelectedCards();
            if (!cards.length) return;
            try {
                await showConfirmDialog({
                    title: '批量删除',
                    message: `确定将选中的 ${cards.length} 张卡片移入回收站吗？`
                });
            } catch (e) { return; }
            let okCount = 0;
            for (const c of cards) {
                const res = await removeCard(c);
                if (res && res.success) { okCount++; batchSet.delete(c.path); }
            }
            showSuccessToast(`已移入回收站 ${okCount}/${cards.length} 张`);
            if (!batchSet.size) exitBatch();
            load();
        }


        const groupSheetActions = computed(() => {
            const cats = ['未分类', ...mobileLibrary.categories]
                .filter((c) => c !== (activeCard && activeCard.category));
            return [
                ...cats.map((c) => ({ name: c, value: c })),
                { name: '＋ 新建分组', value: '__new__' }
            ];
        });
        // 批量模式分组列表(不排除当前分组,因为批量选中可能跨多个分组)
        const batchGroupActions = computed(() => [
            ...['未分类', ...mobileLibrary.categories].map((c) => ({ name: c, value: c })),
            { name: '＋ 新建分组', value: '__new__' }
        ]);

        function showActions(card) {
            activeCard = card;
            showSheet.value = true;
        }

        function onSheetSelect(action) {
            showSheet.value = false;
            if (!activeCard) return;
            if (action.value === 'batch') {
                if (batchMode.value) exitBatch();
                else { enterBatch(); toggleBatch(activeCard.path); }
                return;
            }
            handleCardAction(action);
        }

        // ---------- 分组管理(新建/重命名/删除空分组) ----------
        const showGroupManage = ref(false);
        const groupManageActions = computed(() => {
            const actions = mobileLibrary.categories.map((c) => ({ name: c, value: c }));
            actions.unshift({ name: '＋ 新建分组', value: '__new__', color: '#06b6d4' });
            return actions;
        });
        const showGroupAction = ref(false);
        const groupActionTarget = ref('');
        const groupActionItems = [
            { name: '重命名', value: 'rename' },
            { name: '删除空分组', value: 'delete', color: '#ee0a24' }
        ];
        let groupActionResolver = null;

        function onGroupManageSelect(action) {
            showGroupManage.value = false;
            const val = action.value;
            if (val === '__new__') {
                createGroupFlow();
                return;
            }
            groupActionTarget.value = val;
            showGroupAction.value = true;
        }

        async function onGroupActionSelect(action) {
            showGroupAction.value = false;
            const target = groupActionTarget.value;
            if (action.value === 'rename') {
                const newName = await promptInput(`重命名分组「${target}」`, target, '输入新名称');
                if (!newName || !newName.trim() || newName.trim() === target) return;
                const res = await window.electronAPI.renameGroupFolder({ libraryPath: LIBRARY_ROOT, oldName: target, newName: newName.trim() });
                if (res && res.success) {
                    showSuccessToast('已重命名');
                    if (selected.value === target) selected.value = newName.trim();
                    load();
                } else showToast((res && res.error) || '重命名失败');
            } else if (action.value === 'delete') {
                const res = await window.electronAPI.deleteEmptyGroupFolder({ libraryPath: LIBRARY_ROOT, groupName: target });
                if (res && res.success) {
                    showSuccessToast(res.deleted ? '已删除空分组' : '分组非空，未删除');
                    if (selected.value === target) selected.value = '全部';
                    load();
                } else showToast((res && res.error) || '删除失败');
            }
        }

        async function createGroupFlow() {
            const name = await promptInput('新建分组', '', '输入分组名称');
            if (!name || !name.trim()) return;
            const res = await window.electronAPI.createGroupFolder({ libraryPath: LIBRARY_ROOT, groupName: name.trim() });
            if (res && res.success) {
                showSuccessToast(`已创建「${name.trim()}」`);
                load();
            } else showToast((res && res.error) || '创建失败');
        }

        async function handleCardAction(action) {
            if (action.value === 'move') {
                showGroupSheet.value = true;
            } else if (action.value === 'rename') {
                const newName = await promptInput('重命名角色卡', activeCard.name, '输入新名称');
                if (newName && newName.trim() && newName.trim() !== activeCard.name) {
                    const res = await renameCardTo(activeCard, newName.trim());
                    res.success ? showSuccessToast('已重命名') : showToast(res.error || '失败');
                }
            } else if (action.value === 'duplicate') {
                const res = await window.electronAPI.duplicateFile(activeCard.path);
                res && res.success ? showSuccessToast('已创建副本') : showToast((res && res.error) || '复制失败');
                if (res && res.success) load();
            } else if (action.value === 'locate') {
                const res = await window.electronAPI.showItemInFolder(activeCard.path);
                if (res && res.success) { /* 系统文件管理器已定位 */ }
                else if (res && res.error) showToast(res.error);
            } else if (action.value === 'export') {
                showToast('正在打开导出位置…');
                const res = await window.electronAPI.exportPackage(activeCard.path);
                if (res && res.success) showSuccessToast('已导出');
                else if (res && res.error && !/取消/i.test(res.error)) showToast(res.error);
            } else if (action.value === 'delete') {
                try {
                    await showConfirmDialog({
                        title: '删除卡片',
                        message: `确定将「${activeCard.name}」移入回收站吗？\n可在「设置 → 回收站」恢复。`
                    });
                    const res = await removeCard(activeCard);
                    res.success ? showSuccessToast('已移入回收站') : showToast(res.error || '失败');
                } catch (e) { /* 用户取消 */ }
            }
        }

        async function onGroupSelect(action) {
            showGroupSheet.value = false;
            let target = action.value;
            if (target === '__new__') {
                const name = await promptInput('新建分组', '', '输入分组名称');
                if (!name || !name.trim()) return;
                target = name.trim();
            }
            // 批量模式:移动选中卡到目标分组
            if (batchMode.value) {
                const cards = batchSelectedCards();
                if (!cards.length) return;
                let okCount = 0;
                for (const c of cards) {
                    const res = await moveCardToGroup(c, target);
                    if (res && res.success) okCount++;
                }
                showSuccessToast(`已移动 ${okCount}/${cards.length} 张到「${target}」`);
                exitBatch();
                load();
                return;
            }
            if (!activeCard) return;
            const res = await moveCardToGroup(activeCard, target);
            if (res.success) showSuccessToast(`已移动到「${target}」`);
            else showToast(res.error || '移动失败');
        }

        // ---------- 批量导出(ZIP + 分享) / URL 导入 ----------
        const exportSheetActions = computed(() => [
            { name: '从网址导入角色卡', value: 'url' },
            { name: '导出当前分组（ZIP）', value: 'current' },
            { name: '导出全部（ZIP）', value: 'all' }
        ]);

        async function onExportSelect(action) {
            showExportSheet.value = false;
            if (action.value === 'url') {
                const url = await promptInput('从网址导入', '', 'https://…/character.png 直链');
                if (!url || !/^https?:\/\//i.test(url)) { if (url) showToast('仅支持 http/https 直链'); return; }
                showToast('下载中…');
                const dest = (selected.value && selected.value !== '全部' && selected.value !== '未分类')
                    ? LIBRARY_ROOT + '/' + selected.value : LIBRARY_ROOT;
                const res = await window.electronAPI.downloadCardFromUrl({ url: url.trim(), destFolder: dest });
                if (res && res.success) {
                    showSuccessToast('已导入');
                    await load(true); // 强制重扫：新卡进内存
                    // 第三波：导入自动打标（开关开启时后台低并发执行，不阻塞）
                    if (res.filePath) autoTagImportedCards([res.filePath]);
                }
                else showToast((res && res.error) || '下载失败');
                return;
            }
            const list = action.value === 'current' ? filtered.value : mobileLibrary.library;
            if (!list || !list.length) {
                showToast('没有可导出的卡片');
                return;
            }
            showToast(`正在打包 ${list.length} 张…`);
            try {
                const res = await window.electronAPI.exportBatchPackage(list.map((c) => c.path));
                if (res && res.success) {
                    if (res.shared) {
                        showSuccessToast(`已打包导出 ${res.count} 张`);
                    } else {
                        // 兼容层无分享目标:文件已保存到下载目录,提示用户去文件管理器查看
                        showSuccessToast(`已保存到 ${res.savedPath || '下载/JSKZX'}`);
                    }
                } else if (res && res.error && !/取消/i.test(res.error)) showToast(res.error);
            } catch (e) {
                showToast('批量导出失败');
            }
        }

        onMounted(load);

        // ---------- 角色宇宙图谱 ----------
        const showGraph = ref(false);
        function jumpFromGraph(path) {
            setLastOpenedPath(path);
            router.push({ name: 'cardDetail', query: { p: path } });
        }

        // Promise 式输入弹窗(WebView 中 window.prompt 返回 null，必须用 van-dialog 替代)
        const showInputDialog = ref(false);
        const inputDialogTitle = ref('');
        const inputValue = ref('');
        const inputPlaceholder = ref('');
        let inputResolver = null;
        function promptInput(title, value, placeholder) {
            inputDialogTitle.value = title;
            inputValue.value = value || '';
            inputPlaceholder.value = placeholder || '';
            showInputDialog.value = true;
            return new Promise((resolve) => { inputResolver = resolve; });
        }
        function onInputConfirm() {
            showInputDialog.value = false;
            if (inputResolver) { inputResolver(inputValue.value.trim()); inputResolver = null; }
        }
        function onInputCancel() {
            showInputDialog.value = false;
            if (inputResolver) { inputResolver(null); inputResolver = null; }
        }

        return {
            showInputDialog, inputDialogTitle, inputValue, inputPlaceholder, onInputConfirm, onInputCancel,
            showTagPanel, tagFilter, onTagPick, clearTagFilter,
            query, selected, viewMode, refreshing, pullDisabled, loading, libraryReady, needsAuth, authLost, isDark, loadTip,
            filtered, visibleList, renderCount, extendRender, groupChips, showSheet, showGroupSheet, showExportSheet, showDedupe,
            quickFilter, quickFilters, showGroupManage, groupManageActions, onGroupManageSelect,
            onQuickFilter, onSelectCategory, setViewMode, pageIndex, pageCard, prevPage, nextPage,
            sortBy, sortOptions,
            showGroupAction, groupActionTarget, groupActionItems, onGroupActionSelect,
            sheetActions, groupSheetActions, batchGroupActions, exportSheetActions,
            openCard, onRefresh, grantLib, showActions, onSheetSelect, onGroupSelect,
            onExportSelect, onImport, onDedupe, onDedupeCleaned, snippet,
            showGraph, jumpFromGraph, mobileLibrary,
            showUrlImport, urlInput, urlImporting, doUrlImport, onUrlImportClose,
            showMore, moreActions, onMoreSelect,
            batchMode, batchSet, showBatchTag, batchTagMode, batchTagInput, showBatchGroup,
            showBatchAiTag, aiTagRunning, aiTagProgress, onBatchAiTag, onBatchAiTagClose,
            toggleBatch, selectAllBatch, exitBatch, onBatchTagClose, onBatchDelete, onBatchPush, dedupeMode
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nav-actions .van-icon { margin-left: 14px; }
.flex-1 { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
/* track 自身作为滚动容器:Vant PullRefresh 才能正确检测 scrollTop,避免上滑误触发刷新 */
.flex-1 :deep(.van-pull-refresh__track) { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.view-body { min-height: 100%; padding-bottom: 8px; }

.cat-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 12px 8px;
    -webkit-overflow-scrolling: touch;
}
.cat-chip {
    flex-shrink: 0;
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 13px;
    background: var(--van-gray-2, #f2f3f5);
    color: var(--van-text-color, #323233);
}
.cat-chip.active {
    background: #06b6d4;
    color: #fff;
}
.manage-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px dashed var(--van-gray-5, #c8c9cc);
    color: var(--van-gray-6, #969799);
}
.tag-active-bar { padding: 0 12px 6px; }
.tag-active-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    background: rgba(6, 182, 212, 0.15);
    color: #06b6d4;
    border: 1px solid rgba(6, 182, 212, 0.4);
}
.tag-clear { cursor: pointer; opacity: 0.7; }
.view-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
}
.view-bar .count { font-size: 12px; color: var(--van-gray-6, #969799); }
.view-bar .van-icon { margin-left: 12px; }
.view-toggle { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; }
.view-bar .sort-menu { flex: 1; min-width: 0; margin-left: 8px; }
.view-bar .sort-menu :deep(.van-dropdown-menu__bar) { background: transparent; box-shadow: none; height: 30px; }
.view-bar .sort-menu :deep(.van-dropdown-menu__title) { font-size: 12px; padding: 0 4px; justify-content: flex-end; }

.view-mode-bar {
    display: flex;
    gap: 8px;
    padding: 2px 14px 10px;
    overflow-x: auto;
}
.vm-btn {
    flex-shrink: 0;
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 13px;
    background: var(--van-gray-2, #f2f3f5);
    color: var(--van-text-color, #323233);
}
.vm-btn.active { background: #06b6d4; color: #fff; }

.cards-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 0 12px;
}
.cards-wrap.list { grid-template-columns: 1fr; }
.cards-wrap.poster { grid-template-columns: 1fr; gap: 14px; }
.card-item {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.card-item.batch-on { outline: 2px solid rgba(6,182,212,.35); }
.batch-dot {
    position: absolute; top: 6px; right: 6px; z-index: 3;
    width: 24px; height: 24px; border-radius: 50%;
    background: rgba(255,255,255,.85);
    border: 1.5px solid #c8c9cc;
    color: transparent;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: bold;
}
.batch-dot.checked {
    background: #06b6d4; border-color: #06b6d4; color: #fff;
}
.batch-bar {
    position: fixed; left: 0; right: 0; bottom: 50px;
    z-index: 150;
    display: flex; align-items: center; gap: 6px;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    background: var(--van-background-2, #fff);
    box-shadow: 0 -2px 12px rgba(0,0,0,.12);
    overflow-x: auto;
}
.bb-count { font-size: 12px; color: var(--van-gray-6, #969799); flex-shrink: 0; margin-right: 2px; }
.aitag-progress { padding: 8px 16px 18px; }
.aitag-desc { font-size: 13px; color: var(--van-gray-6, #646566); line-height: 1.5; margin: 0 0 14px; }
.aitag-bar .van-progress { margin-bottom: 10px; }
.aitag-status { font-size: 13px; color: #06b6d4; margin: 0 0 4px; }
.aitag-count { font-size: 12px; color: var(--van-gray-5, #969799); margin: 0; font-variant-numeric: tabular-nums; }
.grid-cover { aspect-ratio: 3 / 4; }
.poster-cover { aspect-ratio: 3 / 4; }
.card-meta { padding: 8px 10px 10px; }
.c-name {
    font-size: 14px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.c-cat { margin-top: 2px; font-size: 11px; color: var(--van-gray-6, #969799); }
.is-list { display: flex; align-items: center; }
.is-list .card-meta { flex: 1; padding: 10px 12px 12px; }
.card-item.is-poster .c-desc {
    white-space: normal;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.c-desc {
    margin-top: 4px; font-size: 12px; color: var(--van-gray-6, #969799);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 翻页视图 */
.page-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 4px 16px 24px;
}
.page-card {
    position: relative;
    width: 100%;
    max-width: 380px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
    box-shadow: 0 2px 12px rgba(0,0,0,.08);
}
.page-cover { aspect-ratio: 3 / 4; }
.page-meta { padding: 12px 14px 14px; }
.page-name { font-size: 17px; font-weight: 700; }
.page-cat { margin-top: 4px; font-size: 12px; color: #06b6d4; }
.page-desc {
    margin-top: 8px; font-size: 13px; color: var(--van-gray-6, #969799);
    line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.page-empty { padding: 60px 0; color: var(--van-gray-5, #c8c9cc); }
.page-nav { display: flex; align-items: center; gap: 14px; }
.page-indicator { font-size: 14px; color: var(--van-gray-6, #969799); min-width: 64px; text-align: center; font-variant-numeric: tabular-nums; }
.status-wrap { padding: 40px 0; text-align: center; }
.load-more-hint {
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
    color: var(--van-gray-5, #c8c9cc);
}
.bottom-pad { height: 16px; }

/* 未授权引导 */
.auth-guide {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 88px 40px 24px;
    text-align: center;
}
.guide-title { margin-top: 18px; font-size: 17px; font-weight: 600; }
.guide-desc {
    margin-top: 10px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--van-gray-6, #969799);
}
.guide-btn { margin-top: 26px; }
.guide-tip { margin-top: 14px; font-size: 12px; color: var(--van-gray-5, #c8c9cc); }
</style>