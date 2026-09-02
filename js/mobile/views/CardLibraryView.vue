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

        <van-pull-refresh :key="pullRefKey" :disabled="pullDisabled" v-model="refreshing" @refresh="onRefresh" class="flex-1" :pull-distance="80">
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
                    <div class="cat-chip manage-chip" @click="showGroupManage = true">
                        <van-icon name="setting-o" size="13" /> 管理
                    </div>
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
                </div>

                <!-- 视图切换 + 排序 -->
                <div class="view-bar">
                    <span class="count">{{ filtered.length }} 张</span>
                    <van-dropdown-menu class="sort-menu">
                        <van-dropdown-item v-model="sortBy" :options="sortOptions" />
                    </van-dropdown-menu>
                    <van-icon name="apps-o" :color="viewMode === 'grid' ? '#06b6d4' : ''" size="20" @click="setViewMode('grid')" />
                    <van-icon name="bars" :color="viewMode === 'list' ? '#06b6d4' : ''" size="20" @click="setViewMode('list')" />
                    <van-icon name="photo-o" :color="viewMode === 'poster' ? '#06b6d4' : ''" size="20" @click="setViewMode('poster')" />
                    <van-icon name="exchange" :color="viewMode === 'page' ? '#06b6d4' : ''" size="20" @click="setViewMode('page')" />
                </div>

                <!-- 卡片网格 / 列表 / 海报 / 翻页 -->
                <div v-if="loading" class="status-wrap">
                    <van-loading size="28">
                        {{ loadTip }}
                    </van-loading>
                </div>
                <van-empty v-else-if="!filtered.length" description="没有卡片" />
                <div v-else class="cards-wrap" :class="{ list: viewMode === 'list', poster: viewMode === 'poster', page: viewMode === 'page' }">
                    <div
                        v-for="card in paginatedList"
                        :key="card.path"
                        class="card-item"
                        :class="{ 'is-list': viewMode === 'list', 'is-poster': viewMode === 'poster', 'is-page': viewMode === 'page', 'batch-on': batchMode }"
                        @click="batchMode ? toggleBatch(card.path) : openCard(card)"
                        @longpress="batchMode ? toggleBatch(card.path) : showActions(card)"
                    >
                        <div
                            v-if="batchMode"
                            class="batch-dot"
                            :class="{ checked: batchSet.has(card.path) }"
                            @click.stop="toggleBatch(card.path)"
                        >✓</div>
                        <MobileCardCover v-if="viewMode !== 'list'" :card="card" class="grid-cover" />
                        <div class="card-meta">
                            <div class="c-name">{{ card.name }}</div>
                            <div v-if="viewMode === 'grid'" class="c-cat">{{ card.category }}</div>
                            <div v-else class="c-desc">{{ snippet(card) }}</div>
                        </div>
                    </div>
                </div>
                <!-- 分页条 -->
                <div v-if="filtered.length" class="pager-bar">
                    <van-icon name="arrow-left" size="18" :class="{ 'pager-dis': pageNo <= 1 }" @click="prevPage" />
                    <span class="pager-info">{{ pageNo }} / {{ totalPages }}</span>
                    <van-icon name="arrow" size="18" :class="{ 'pager-dis': pageNo >= totalPages }" @click="nextPage" />
                    <van-dropdown-menu class="pager-size">
                        <van-dropdown-item v-model="pageSize" :options="pageSizeOptions" />
                    </van-dropdown-menu>
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
            <van-button size="small" plain type="warning" :disabled="!batchSet.size" @click="showBatchGroup = true">批量分组</van-button>
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

        <!-- 角色宇宙图谱 -->
        <GraphModal
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
import { computed, ref, reactive, onMounted, watch, onBeforeUnmount } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import { currentTheme } from '../theme';
import { useSearch, extractCardSearchableText, extractCardTags } from '../../composables/useSearch';
import searchIndex from '../../utils/searchIndex.js';
import { api } from '../../bridge/api';
import MobileCardCover from '../components/MobileCardCover.vue';
import DedupeModal from '../components/DedupeModal.vue';
import GraphModal from '../components/GraphModal.vue';
import {
    mobileLibrary, loadLibrary, moveCardToGroup, removeCard, renameCardTo, LIBRARY_ROOT
} from '../useMobileLibrary';

export default {
    name: 'CardLibraryView',
    components: { MobileCardCover, DedupeModal, GraphModal },
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
        // 视图模式:grid 网格 / list 列表 / poster 海报 / page 翻页
        const viewMode = ref(localStorage.getItem('jsmobile_view') || 'grid');
        function setViewMode(v) {
            viewMode.value = v;
            try { localStorage.setItem('jsmobile_view', v); } catch (e) { /* 忽略 */ }
        }
        const refreshing = ref(false);
        const pullRefKey = ref(0);
        const pullDisabled = ref(false);
        onBeforeRouteLeave(() => { pullRefKey.value += 1; });
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
        // 分页:每页数量 + 翻页(替代原无限滚动)
        const pageSize = ref(parseInt(localStorage.getItem('jsmobile_pagesize') || '20', 10));
        const pageSizeOptions = [
            { text: '10 张/页', value: 10 },
            { text: '20 张/页', value: 20 },
            { text: '50 张/页', value: 50 },
            { text: '100 张/页', value: 100 }
        ];
        const pageNo = ref(1);
        const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
        const paginatedList = computed(() => {
            const start = (pageNo.value - 1) * pageSize.value;
            return filtered.value.slice(start, start + pageSize.value);
        });
        function nextPage() { if (pageNo.value < totalPages.value) pageNo.value++; }
        function prevPage() { if (pageNo.value > 1) pageNo.value--; }
        let touchStartListener = null;
        onMounted(() => {
            const scroller = document.querySelector('.van-pull-refresh__track');
            if (!scroller) return;
            // 手指按下时不在顶部(scrollTop>5)→ 整个手势期间禁用下拉刷新,避免与列表滚动冲突
            touchStartListener = () => {
                pullDisabled.value = scroller.scrollTop > 5;
            };
            scroller.addEventListener('touchstart', touchStartListener, { passive: true });
        });
        onBeforeUnmount(() => {
            const scroller = document.querySelector('.van-pull-refresh__track');
            if (scroller && touchStartListener) scroller.removeEventListener('touchstart', touchStartListener);
            touchStartListener = null;
        });
        // 搜索/筛选/分组/排序/视图/每页数量 变化时回到第 1 页
        watch([() => selected.value, () => quickFilter.value, () => queryInput.value, () => sortBy.value, viewMode, pageSize], () => { pageNo.value = 1; });
        let activeCard = null;

        /** 查重入口(角色卡) */
        function onDedupe() {
            if (!mobileLibrary.library.length) {
                showToast('卡片库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }
        /** 查重清理完成后刷新分组(空分组/统计)——查重可能删除卡片,必须强制重扫 */
        function onDedupeCleaned() {
            load(true);
        }

        const groupChips = computed(() => {
            const set = ['全部', '未分类', ...mobileLibrary.categories];
            return [...new Set(set)];
        });

        // ---------- 快捷过滤 ----------
        const quickFilter = ref('all');
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
                return list.filter((c) => {
                    const ext = c.data && c.data.data && c.data.data.extensions;
                    return ext && Array.isArray(ext.regex_scripts) && ext.regex_scripts.length;
                });
            }
            return list;
        };

        // 快捷过滤与分组互斥：点快捷过滤重置分组，点分组重置快捷过滤
        function onQuickFilter(v) {
            quickFilter.value = v;
            selected.value = '全部';
        }
        function onSelectCategory(cat) {
            selected.value = cat;
            quickFilter.value = 'all';
        }

        // ---------- 搜索引擎：桌面 v2.1.0 同款 useSearch（倒排索引 + 中文分词 + 高级语法 + 9种排序） ----------
        const currentCategoryKey = computed(() => {
            // 快捷过滤优先级高于分组（否则「全部」分支会吞掉 has_regex/has_lorebook）
            if (quickFilter.value === 'has_lorebook') return 'has_lorebook';
            if (quickFilter.value === 'has_regex') return 'has_regex';
            if (selected.value === '全部') return 'all';
            if (selected.value === '未分类') return 'cat:未分类';
            return 'cat:' + selected.value;
        });
        const allCategories = computed(() => {
            // 桌面版 useSearch 用 cn/en/key 三态匹配分组；移动端统一用 cn 键
            return mobileLibrary.categories.map((cn) => ({ cn, en: cn, key: cn }));
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
        const searchQuery = ref(''); // 桌面版引擎 300ms 防抖写入
        watch(queryInput, (v) => { searchQuery.value = v; });

        const searchEngine = useSearch({
            library: computed(() => mobileLibrary.library),
            currentCategoryKey,
            allCategories,
            sortBy,
            currentPage,
            itemsPerPage,
            lastSelectedIndex,
            estimateCardTokens: null // 桌面版 v2.1.0 已改用 tokenCache,此参数仅旧版引用
        });

        // 分组匹配桌面版语义：'cat:xxx' 前缀转分组过滤；useSearch 内置分类/子目录过滤
        const filtered = computed(() => searchEngine.filteredLibrary.value);

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
                // 🐛 修复:导入后必须强制重扫(load(true))。若库已加载,load() 会命中 loadLibrary 的
                // "已加载且非空则跳过" 守卫而不再扫描,新导入的卡不会进入 mobileLibrary.library,
                // 导致点开卡片时 findCard 找不到 → 显示「卡片不存在」。
                load(true);
            } else {
                showToast((res && res.error) || '已取消导入');
            }
        }

        async function load(refresh = false) {
            loading.value = true;
            needsAuth.value = false;
            currentPage.value = 1;
            await loadLibrary(refresh);
            loading.value = false;
            needsAuth.value = !mobileLibrary.ready && !!mobileLibrary.error;
            libraryReady.value = mobileLibrary.ready;
            // 异步预热搜索索引（分片 yield，不阻塞 UI），大库首次搜索免全量扫描
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
                    load(true); // 🐛 导入后强制重扫,避免新卡不入库导致详情页「卡片不存在」
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
            load(true); // 已删除文件,强制重扫让列表/分类同步
        }


        const groupSheetActions = computed(() => {
            const cats = ['未分类', ...mobileLibrary.categories]
                .filter((c) => c !== (activeCard && activeCard.category));
            return [
                ...cats.map((c) => ({ name: c, value: c })),
                { name: '＋ 新建分组', value: '__new__' }
            ];
        });

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
                    load(true); // 分组改名,强制重扫同步 subFolder/分类
                } else showToast((res && res.error) || '重命名失败');
            } else if (action.value === 'delete') {
                const res = await window.electronAPI.deleteEmptyGroupFolder({ libraryPath: LIBRARY_ROOT, groupName: target });
                if (res && res.success) {
                    showSuccessToast(res.deleted ? '已删除空分组' : '分组非空，未删除');
                    if (selected.value === target) selected.value = '全部';
                    load(true); // 分组变更,强制重扫同步分类列表
                } else showToast((res && res.error) || '删除失败');
            }
        }

        async function createGroupFlow() {
            const name = await promptInput('新建分组', '', '输入分组名称');
            if (!name || !name.trim()) return;
            const res = await window.electronAPI.createGroupFolder({ libraryPath: LIBRARY_ROOT, groupName: name.trim() });
            if (res && res.success) {
                showSuccessToast(`已创建「${name.trim()}」`);
                load(true); // 新分组需重扫后才会出现在分类列表
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
                if (res && res.success) load(true); // 物理副本入盘,强制重扫
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
                if (res && res.success) { showSuccessToast('已导入'); load(true); } // 🐛 同导入:强制重扫
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
            query, selected, viewMode, refreshing, pullRefKey, pullDisabled, loading, libraryReady, needsAuth, authLost, isDark, loadTip,
            filtered, paginatedList, pageSize, pageSizeOptions, pageNo, totalPages, nextPage, prevPage, groupChips, showSheet, showGroupSheet, showExportSheet, showDedupe,
            quickFilter, quickFilters, showGroupManage, groupManageActions, onGroupManageSelect,
            onQuickFilter, onSelectCategory, setViewMode,
            sortBy, sortOptions,
            showGroupAction, groupActionTarget, groupActionItems, onGroupActionSelect,
            sheetActions, groupSheetActions, exportSheetActions,
            openCard, onRefresh, grantLib, showActions, onSheetSelect, onGroupSelect,
            onExportSelect, onImport, onDedupe, onDedupeCleaned, snippet,
            showGraph, jumpFromGraph, mobileLibrary,
            showUrlImport, urlInput, urlImporting, doUrlImport, onUrlImportClose,
            showMore, moreActions, onMoreSelect,
            batchMode, batchSet, showBatchTag, batchTagMode, batchTagInput, showBatchGroup,
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
.view-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
}
.view-bar .count { font-size: 12px; color: var(--van-gray-6, #969799); }
.view-bar .van-icon { margin-left: 12px; }
.view-bar .sort-menu { flex: 1; min-width: 0; margin-left: 8px; }
.view-bar .sort-menu :deep(.van-dropdown-menu__bar) { background: transparent; box-shadow: none; height: 30px; }
.view-bar .sort-menu :deep(.van-dropdown-menu__title) { font-size: 12px; padding: 0 4px; justify-content: flex-end; }

.cards-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 0 12px;
}
.cards-wrap.list { grid-template-columns: 1fr; }
.cards-wrap.poster { grid-template-columns: 1fr; }
.cards-wrap.page { grid-template-columns: 1fr; }
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
.grid-cover { aspect-ratio: 3 / 4; }
.is-poster .grid-cover { aspect-ratio: 16 / 10; }
.is-page .grid-cover { aspect-ratio: 16 / 10; }
.is-page .card-meta { padding: 14px 14px 16px; }
.is-page .c-name { font-size: 16px; }
.card-meta { padding: 8px 10px 10px; }
.c-name {
    font-size: 14px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.c-cat { margin-top: 2px; font-size: 11px; color: var(--van-gray-6, #969799); }
.is-list { display: flex; align-items: center; }
.is-list .card-meta { flex: 1; padding: 10px 12px 12px; }
.c-desc {
    margin-top: 4px; font-size: 12px; color: var(--van-gray-6, #969799);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-wrap { padding: 40px 0; text-align: center; }
.load-more-hint {
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
    color: var(--van-gray-5, #c8c9cc);
}
.pager-bar {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    padding: 10px 14px 4px;
}
.pager-info { font-size: 13px; color: var(--van-gray-6, #969799); }
.pager-dis { color: var(--van-gray-3, #ebedf0) !important; }
.pager-size { min-width: 0; }
.pager-size :deep(.van-dropdown-menu__bar) { background: transparent; box-shadow: none; height: 28px; }
.pager-size :deep(.van-dropdown-menu__title) { font-size: 12px; }
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