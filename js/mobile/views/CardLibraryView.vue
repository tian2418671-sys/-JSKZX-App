<template>
    <div class="view-page">
        <van-nav-bar safe-area-inset-top>
            <template #title>
                <span>{{ manageMode ? `已选 ${selectedCount} 张` : '卡片库' }}</span>
            </template>
            <template #right>
                <div class="nav-actions">
                    <van-icon v-if="manageMode" name="close" size="20" @click="exitManage" />
                    <template v-else>
                        <van-icon name="cluster-o" size="20" @click="onDedupe" />
                        <van-icon name="share-o" size="19" @click="$router.push('/graph')" />
                        <van-icon name="plus" size="20" @click="onImport" />
                        <van-icon name="share-o" size="19" @click="showExportSheet = true" />
                        <van-icon name="replay" size="20" @click="onRefresh" />
                    </template>
                </div>
            </template>
        </van-nav-bar>

        <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="flex-1">
            <div class="view-body">
                <!-- 未授权引导 -->
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
                <van-search v-model="query" placeholder="搜索卡片名 / 描述 / 作者… tag:标签 -排除" shape="round" />
                <!-- 快捷搜索 chip -->
                <div class="search-chips" v-if="searchChips.length">
                    <van-tag
                        v-for="chip in searchChips" :key="chip.key"
                        :type="activeSearchChip === chip.key ? 'primary' : 'default'"
                        size="medium" plain
                        @click="toggleSearchChip(chip.key)"
                    >{{ chip.label }}</van-tag>
                </div>
                <div class="url-import-row">
                    <van-button size="small" plain icon="link-o" @click="showUrlImport = true">URL 导入</van-button>
                </div>
                <!-- URL 导入弹窗 -->
                <van-popup v-model:show="showUrlImport" position="center" round class="url-import-popup">
                    <div class="url-import-head">URL 导入角色卡</div>
                    <van-field v-model="cardUrl" placeholder="https://...card.png" class="url-field" />
                    <div class="url-import-ops">
                        <van-button size="small" @click="showUrlImport = false">取消</van-button>
                        <van-button size="small" type="primary" :loading="urlImporting" @click="onUrlImport">导入</van-button>
                    </div>
                </van-popup>

                <!-- 分组横向滚动 -->
                <div class="cat-scroll">
                    <div
                        v-for="cat in groupChips"
                        :key="cat"
                        class="cat-chip"
                        :class="{ active: selected === cat }"
                        @click="selected = cat"
                    >{{ cat }}</div>
                    <div class="cat-chip manage-chip" @click="showGroupManager = true">
                        <van-icon name="setting-o" size="14" /> 管理分组
                    </div>
                </div>

                <!-- 视图/排序/密度切换 -->
                <div class="view-bar">
                    <span class="count">{{ filtered.length }} 张</span>
                    <div class="view-bar-right">
                        <span class="sort-label" @click="showSortSheet = true">
                            {{ sortLabel }}
                            <van-icon name="arrow-down" size="10" />
                        </span>
                        <van-icon name="column" size="18" :color="compactMode ? '#06b6d4' : ''" @click="compactMode = !compactMode" />
                        <van-icon name="apps-o" :color="gridMode ? '#06b6d4' : ''" size="20" @click="gridMode = true" />
                        <van-icon name="list" :color="!gridMode ? '#06b6d4' : ''" size="20" @click="gridMode = false" />
                    </div>
                </div>

                <!-- 卡片网格 / 列表 -->
                <div v-if="loading" class="status-wrap">
                    <van-loading size="28">
                        {{ loadTip }}
                    </van-loading>
                </div>
                <van-empty v-else-if="!filtered.length" description="没有卡片" />
                <div v-else class="cards-wrap" :class="{ list: !gridMode, compact: compactMode }">
                    <div
                        v-for="card in visibleList"
                        :key="card.path"
                        class="card-item"
                        :class="{
                            'is-list': !gridMode,
                            'is-selected': manageMode && selectedSet.has(card.path)
                        }"
                        @click="manageMode ? toggleSelect(card) : openCard(card)"
                        @longpress="manageMode ? null : showActions(card)"
                    >
                        <!-- 管理模式勾选框 -->
                        <van-checkbox
                            v-if="manageMode"
                            :model-value="selectedSet.has(card.path)"
                            class="card-check"
                            @click.stop
                            @change="toggleSelect(card)"
                        />
                        <MobileCardCover v-if="gridMode" :card="card" class="grid-cover" />
                        <MobileCardCover v-else :card="card" class="list-cover" />
                        <div class="card-meta">
                            <div class="c-name">{{ card.name }}</div>
                            <div class="c-badges">
                                <span class="c-token-badge" :class="tokenLevel(card)">{{ tokenLabel(card) }}</span>
                                <span v-if="card.customTags && card.customTags.length" class="c-tag-badge">
                                    <van-tag v-for="t in card.customTags.slice(0,2)" :key="t" size="mini" type="primary" plain>{{ t }}</van-tag>
                                </span>
                            </div>
                            <div v-if="gridMode" class="c-cat">{{ card.category }}</div>
                            <div v-else class="c-desc">{{ snippet(card) }}</div>
                        </div>
                    </div>
                    <!-- 增量渲染哨兵 -->
                    <div v-if="filtered.length > renderCount" v-load-more="extendRender" class="load-more-hint">
                        上滑加载更多…
                    </div>
                </div>
                <div class="bottom-pad" />

                <!-- 批量操作条 -->
                <div v-if="manageMode && selectedCount > 0" class="batch-bar">
                    <van-checkbox
                        :model-value="isAllSelected"
                        :indeterminate="isIndeterminate"
                        @change="toggleSelectAll"
                        class="batch-check"
                    >全选</van-checkbox>
                    <div class="batch-actions">
                        <van-button size="small" plain icon="cluster-o" @click="showBatchGroup = true">移分组</van-button>
                        <van-button size="small" plain icon="share-o" @click="batchExport">导出 ZIP</van-button>
                        <van-button size="small" plain icon="delete-o" type="danger" @click="batchDelete">删除</van-button>
                    </div>
                </div>
                </template>
            </div>
        </van-pull-refresh>

        <!-- 长按操作 -->
        <van-popup v-model:show="showSheet" position="bottom" round>
            <van-action-sheet
                :actions="sheetActions"
                cancel-text="取消"
                @select="onSheetSelect"
                @cancel="showSheet = false"
            />
        </van-popup>

        <!-- 批量导出选择 -->
        <van-popup v-model:show="showExportSheet" position="bottom" round>
            <van-action-sheet
                :actions="exportSheetActions"
                cancel-text="取消"
                description="批量导出为 ZIP 包(分享)"
                @select="onExportSelect"
                @cancel="showExportSheet = false"
            />
        </van-popup>

        <!-- 移动分组选择 -->
        <van-popup v-model:show="showGroupSheet" position="bottom" round>
            <van-action-sheet
                :actions="groupSheetActions"
                cancel-text="取消"
                description="移动到分组"
                @select="onGroupSelect"
                @cancel="showGroupSheet = false"
            />
        </van-popup>

        <!-- 排序选择 -->
        <van-popup v-model:show="showSortSheet" position="bottom" round>
            <van-action-sheet
                :actions="sortActions"
                cancel-text="取消"
                description="排序方式"
                @select="onSortSelect"
                @cancel="showSortSheet = false"
            />
        </van-popup>

        <!-- 分组管理弹窗 -->
        <van-popup v-model:show="showGroupManager" position="center" round class="group-manager-popup">
            <div class="gm-head">分组管理</div>
            <div class="gm-list">
                <div v-for="cat in groupManageList" :key="cat" class="gm-row">
                    <span class="gm-name">{{ cat }}</span>
                    <div class="gm-ops">
                        <van-button size="mini" plain icon="edit" @click="startRename(cat)">重命名</van-button>
                        <van-button size="mini" plain icon="delete-o" type="danger" @click="onDeleteGroup(cat)">删除</van-button>
                    </div>
                </div>
                <van-empty v-if="!groupManageList.length" description="暂无分组" />
            </div>
            <div class="gm-add">
                <van-field v-model="newGroupName" placeholder="新分组名称" class="gm-field" />
                <van-button size="small" type="primary" :disabled="!newGroupName.trim()" @click="onCreateGroup">创建</van-button>
            </div>
            <div class="gm-close">
                <van-button size="small" @click="showGroupManager = false">关闭</van-button>
            </div>
        </van-popup>

        <!-- 重命名分组弹窗 -->
        <van-popup v-model:show="showRenameGroup" position="center" round class="rename-popup">
            <div class="rename-head">重命名分组</div>
            <van-field v-model="renameGroupName" :placeholder="renamingGroup" />
            <div class="rename-ops">
                <van-button size="small" @click="showRenameGroup = false">取消</van-button>
                <van-button size="small" type="primary" :disabled="!renameGroupName.trim()" @click="onRenameGroup">确认</van-button>
            </div>
        </van-popup>

        <!-- 批量移动分组选择 -->
        <van-popup v-model:show="showBatchGroup" position="bottom" round>
            <van-action-sheet
                :actions="batchGroupActions"
                cancel-text="取消"
                description="移动所选卡片到分组"
                @select="onBatchGroupSelect"
                @cancel="showBatchGroup = false"
            />
        </van-popup>

        <!-- 查重弹窗(角色卡) -->
        <DedupeModal v-model:show="showDedupe" mode="card" @cleaned="onDedupeCleaned" />
    </div>
</template>

<script>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast, showDialog } from 'vant';
import { currentTheme } from '../theme';
import { api } from '../../bridge/api';
import MobileCardCover from '../components/MobileCardCover.vue';
import DedupeModal from '../components/DedupeModal.vue';
import {
    mobileLibrary, loadLibrary, moveCardToGroup, removeCard, renameCardTo, LIBRARY_ROOT
} from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate.js';
import { extractCardSearchableText, extractCardTags } from '../../composables/useSearch.js';

// 本地持久化 key
const LS_SORT = 'jsmobile_sort';
const LS_COMPACT = 'jsmobile_compact';

export default {
    name: 'CardLibraryView',
    components: { MobileCardCover, DedupeModal },
    directives: {
        'load-more': {
            mounted(el, binding) {
                if (!('IntersectionObserver' in window)) return;
                const obs = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) binding.value();
                }, { rootMargin: '600px' });
                obs.observe(el);
                el.__lmObs__ = obs;
            },
            unmounted(el) {
                if (el.__lmObs__) { el.__lmObs__.disconnect(); el.__lmObs__ = null; }
            }
        }
    },
    setup() {
        const router = useRouter();
        const query = ref('');
        const isDark = currentTheme() === 'dark';
        const selected = ref('全部');
        const gridMode = ref(localStorage.getItem('jsmobile_grid') !== 'list');
        const refreshing = ref(false);
        const loading = ref(false);
        const libraryReady = ref(false);
        const needsAuth = ref(false);
        const authLost = ref(false);
        const showSheet = ref(false);
        const showGroupSheet = ref(false);
        const showExportSheet = ref(false);
        const showDedupe = ref(false);
        const showUrlImport = ref(false);
        const cardUrl = ref('');
        const urlImporting = ref(false);

        // ---- 阶段 3.1: 批量多选 ----
        const manageMode = ref(false);
        const selectedSet = ref(new Set());
        const showBatchGroup = ref(false);
        const selectedCount = computed(() => selectedSet.value.size);

        function toggleSelect(card) {
            const s = new Set(selectedSet.value);
            if (s.has(card.path)) s.delete(card.path);
            else s.add(card.path);
            selectedSet.value = s;
        }
        function toggleSelectAll() {
            if (isAllSelected.value) {
                selectedSet.value = new Set();
            } else {
                selectedSet.value = new Set(sorted.value.map(c => c.path));
            }
        }
        const isAllSelected = computed(() => sorted.value.length > 0 && selectedSet.value.size === sorted.value.length);
        const isIndeterminate = computed(() => selectedSet.value.size > 0 && selectedSet.value.size < sorted.value.length);

        function exitManage() {
            manageMode.value = false;
            selectedSet.value = new Set();
        }

        async function batchDelete() {
            const count = selectedCount.value;
            if (!count) return;
            try {
                await showDialog({
                    title: '批量删除',
                    message: `确定删除所选 ${count} 张卡片? 文件将移入回收站。`,
                    showCancelButton: true
                });
            } catch (_) { return; }
            const paths = [...selectedSet.value];
            const res = await window.electronAPI.trashFiles(paths);
            if (res && res.success) {
                showSuccessToast(`已删除 ${res.count || count} 张`);
                exitManage();
                await load();
            } else {
                showToast(res.error || '删除失败');
            }
        }

        async function batchExport() {
            const paths = [...selectedSet.value];
            if (!paths.length) return;
            showToast(`正在打包 ${paths.length} 张…`);
            const res = await window.electronAPI.exportBatchPackage(paths);
            if (res && res.success) {
                showSuccessToast(res.shared ? `已打包导出 ${res.count} 张` : `已保存到 ${res.savedPath || '下载/JSKZX'}`);
                exitManage();
            } else if (res && res.error && !/取消/i.test(res.error)) showToast(res.error);
        }

        const batchGroupActions = computed(() => {
            const cats = ['未分类', ...mobileLibrary.categories];
            return [
                ...cats.map((c) => ({ name: c, value: c })),
                { name: '＋ 新建分组', value: '__new__' }
            ];
        });

        async function onBatchGroupSelect(action) {
            showBatchGroup.value = false;
            let target = action.value;
            if (target === '__new__') {
                const name = window.prompt('新分组名称:');
                if (!name || !name.trim()) return;
                target = name.trim();
            }
            const paths = [...selectedSet.value];
            let moved = 0;
            for (const path of paths) {
                const card = sorted.value.find(c => c.path === path);
                if (!card) continue;
                const res = await moveCardToGroup(card, target);
                if (res.success) moved++;
            }
            showSuccessToast(`已移动 ${moved} 张到「${target}」`);
            exitManage();
            await load();
        }

        // ---- 阶段 3.2: 分组管理 ----
        const showGroupManager = ref(false);
        const newGroupName = ref('');
        const showRenameGroup = ref(false);
        const renamingGroup = ref('');
        const renameGroupName = ref('');

        const groupManageList = computed(() => {
            return [...mobileLibrary.categories].filter(c => c !== '全部' && c !== '未分类');
        });

        async function onCreateGroup() {
            const name = newGroupName.value.trim();
            if (!name) return;
            const res = await window.electronAPI.createGroupFolder({ libraryPath: LIBRARY_ROOT, groupName: name });
            if (res && res.success) {
                showSuccessToast('分组已创建');
                newGroupName.value = '';
                await load();
            } else {
                showToast(res.error || '创建失败');
            }
        }

        function startRename(cat) {
            renamingGroup.value = cat;
            renameGroupName.value = cat;
            showRenameGroup.value = true;
        }

        async function onRenameGroup() {
            const newName = renameGroupName.value.trim();
            if (!newName || newName === renamingGroup.value) {
                showRenameGroup.value = false;
                return;
            }
            const res = await window.electronAPI.renameGroupFolder({
                libraryPath: LIBRARY_ROOT,
                oldName: renamingGroup.value,
                newName
            });
            showRenameGroup.value = false;
            if (res && res.success) {
                showSuccessToast('已重命名');
                if (selected.value === renamingGroup.value) selected.value = newName;
                await load();
            } else {
                showToast(res.error || '重命名失败');
            }
        }

        async function onDeleteGroup(cat) {
            try {
                await showDialog({
                    title: '删除分组',
                    message: `确定删除空分组「${cat}」? 若分组非空则无法删除。`,
                    showCancelButton: true
                });
            } catch (_) { return; }
            const res = await window.electronAPI.deleteEmptyGroupFolder({
                libraryPath: LIBRARY_ROOT,
                groupName: cat
            });
            if (res && res.success) {
                showSuccessToast('已删除分组');
                if (selected.value === cat) selected.value = '全部';
                await load();
            } else {
                showToast(res.error || '删除失败（可能分组非空）');
            }
        }

        // ---- 阶段 3.3: 排序 + Token 徽标 + 紧凑密度 ----
        const sortBy = ref(localStorage.getItem(LS_SORT) || 'newest');
        const showSortSheet = ref(false);
        const compactMode = ref(localStorage.getItem(LS_COMPACT) === '1');

        const sortActions = [
            { name: '最新优先', value: 'newest' },
            { name: '名称 A-Z', value: 'name' },
            { name: 'Token 数 ↓', value: 'tokens' }
        ];

        const sortLabel = computed(() => {
            const m = { newest: '最新', name: '名称', tokens: 'Token' };
            return m[sortBy.value] || '最新';
        });

        function onSortSelect(action) {
            sortBy.value = action.value;
            localStorage.setItem(LS_SORT, action.value);
            showSortSheet.value = false;
        }

        watch(compactMode, (v) => {
            localStorage.setItem(LS_COMPACT, v ? '1' : '0');
        });

        /** 预计算每张卡片的 token 估算值（避免模板中重复计算） */
        function cardTokenEstimate(card) {
            if (card._tokenEst !== undefined) return card._tokenEst;
            let total = 0;
            const d = (card.data && card.data.data) || (card.data) || {};
            total += estimateTokens(d.description || '');
            total += estimateTokens(d.personality || '');
            total += estimateTokens(d.scenario || '');
            total += estimateTokens(d.first_mes || '');
            total += estimateTokens(d.mes_example || '');
            // 世界书
            const book = d.character_book || (card.data && card.data.character_book);
            if (book) {
                const entries = book.entries;
                if (entries && typeof entries === 'object') {
                    const vals = Array.isArray(entries) ? entries : Object.values(entries);
                    for (const e of vals) {
                        if (!e || typeof e !== 'object') continue;
                        total += estimateTokens(e.content || '');
                        total += estimateTokens((Array.isArray(e.keys) ? e.keys : []).join(', '));
                    }
                }
            }
            card._tokenEst = total;
            return total;
        }

        function tokenLabel(card) {
            const t = cardTokenEstimate(card);
            if (t >= 1000) return (t / 1000).toFixed(1) + 'K';
            return String(t);
        }

        function tokenLevel(card) {
            const t = cardTokenEstimate(card);
            if (t >= 3000) return 't-huge';
            if (t >= 1000) return 't-large';
            return 't-normal';
        }

        // ---- 增量渲染 ----
        const BATCH_STEP = 16;
        const renderCount = ref(24);
        const visibleList = computed(() => sorted.value.slice(0, renderCount.value));
        function extendRender() {
            if (renderCount.value >= sorted.value.length) return;
            renderCount.value += BATCH_STEP;
            if (renderCount.value > sorted.value.length) renderCount.value = sorted.value.length;
        }
        let activeCard = null;

        watch([query, selected, sortBy], () => {
            renderCount.value = 24;
        });

        /** 查重入口 */
        function onDedupe() {
            if (!mobileLibrary.library.length) {
                showToast('卡片库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }
        function onDedupeCleaned() { load(); }

        const groupChips = computed(() => {
            const set = ['全部', '未分类', ...mobileLibrary.categories];
            return [...new Set(set)];
        });

        // ---- 阶段 3.5: 超级搜索增强 ----
        const searchChips = [
            { key: 'has_wb', label: '带世界书' },
            { key: 'has_regex', label: '带正则' }
        ];
        const activeSearchChip = ref('');

        function toggleSearchChip(key) {
            activeSearchChip.value = activeSearchChip.value === key ? '' : key;
        }

        /**
         * 解析搜索词中的前缀语法: tag:xxx / author:xxx / -排除词
         */
        function parseQuery(raw) {
            const q = raw.trim();
            const result = { text: '', tags: [], authors: [], exclude: [] };
            const parts = q.split(/\s+/);
            for (const p of parts) {
                if (p.startsWith('-') && p.length > 1) {
                    result.exclude.push(p.slice(1).toLowerCase());
                } else if (p.toLowerCase().startsWith('tag:') && p.length > 4) {
                    result.tags.push(p.slice(4).toLowerCase());
                } else if (p.toLowerCase().startsWith('author:') && p.length > 7) {
                    result.authors.push(p.slice(7).toLowerCase());
                } else {
                    result.text += (result.text ? ' ' : '') + p;
                }
            }
            return result;
        }

        const filtered = computed(() => {
            let list = mobileLibrary.library;
            // 分组过滤
            if (selected.value === '全部') {
                // 全部
            } else if (selected.value === '未分类') {
                list = list.filter((c) => c.category === '未分类');
            } else {
                list = list.filter((c) => c.category === selected.value);
            }

            const q = query.value.trim();
            const parsed = parseQuery(q);
            const chip = activeSearchChip.value;

            if (q || chip) {
                const textLower = parsed.text.toLowerCase();
                list = list.filter((c) => {
                    // 前缀排除
                    if (parsed.exclude.length) {
                        const nameLower = (c.name || '').toLowerCase();
                        if (parsed.exclude.some(x => nameLower.includes(x))) return false;
                    }

                    // tag: 前缀
                    if (parsed.tags.length) {
                        const cardTags = extractCardTags(c);
                        if (!parsed.tags.some(t => cardTags.includes(t))) return false;
                    }

                    // author: 前缀
                    if (parsed.authors.length) {
                        const creator = (c.creator || '').toLowerCase();
                        const dataCreator = ((c.data && c.data.data && c.data.data.creator) || '').toLowerCase();
                        if (!parsed.authors.some(a => creator.includes(a) || dataCreator.includes(a))) return false;
                    }

                    // 快捷 chip
                    if (chip === 'has_wb') {
                        const d = (c.data && c.data.data) || (c.data) || {};
                        const book = d.character_book || (c.data && c.data.character_book);
                        if (!book || !book.entries) return false;
                    }
                    if (chip === 'has_regex') {
                        const d = (c.data && c.data.data) || (c.data) || {};
                        const ext = d.extensions;
                        if (!ext || !Array.isArray(ext.regex_scripts) || !ext.regex_scripts.length) return false;
                    }

                    // 全字段文本搜索
                    if (textLower) {
                        const fullText = extractCardSearchableText(c);
                        if (!fullText.includes(textLower)) return false;
                    }
                    return true;
                });
            }

            return list;
        });

        // ---- 排序 ----
        const sorted = computed(() => {
            const list = [...filtered.value];
            if (sortBy.value === 'name') {
                list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
            } else if (sortBy.value === 'tokens') {
                list.sort((a, b) => cardTokenEstimate(b) - cardTokenEstimate(a));
            } else {
                // newest (default)
                list.sort((a, b) => (b._mtime || 0) - (a._mtime || 0));
            }
            return list;
        });

        function snippet(card) {
            const desc = (card.data && card.data.data && card.data.data.description) || '';
            return (desc.length > 60 ? desc.slice(0, 60) + '…' : desc) || card.category;
        }

        const loadTip = computed(() => {
            const { done, total } = mobileLibrary.progress;
            if (total > 0 && done > 0) return `加载库… ${done}/${total} 张`;
            return '加载库…';
        });

        function openCard(card) {
            if (manageMode.value) return;
            router.push({ name: 'cardDetail', query: { p: card.path } });
        }

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
                load();
            } else {
                showToast((res && res.error) || '已取消导入');
            }
        }

        async function load() {
            loading.value = true;
            needsAuth.value = false;
            renderCount.value = 24;
            await loadLibrary();
            loading.value = false;
            needsAuth.value = !mobileLibrary.ready && !!mobileLibrary.error;
            libraryReady.value = mobileLibrary.ready;
            if (needsAuth.value && !authLost.value) {
                const info = await api.libraryInfo();
                authLost.value = !!(info && info.hasUri) && !info.granted;
            }
        }

        async function onRefresh() {
            refreshing.value = true;
            await load();
            refreshing.value = false;
        }

        // ---- URL 导入 ----
        async function onUrlImport() {
            const url = cardUrl.value.trim();
            if (!url || !/^https?:\/\//i.test(url)) { showToast('请输入有效的 HTTP/HTTPS 地址'); return; }
            urlImporting.value = true;
            try {
                const res = await api.downloadCardFromUrl({ url, destFolder: '/library/' });
                if (res && res.success) {
                    showSuccessToast('已导入角色卡');
                    showUrlImport.value = false;
                    cardUrl.value = '';
                    await load();
                } else {
                    showToast(res.error || '导入失败');
                }
            } catch (e) {
                showToast('导入失败: ' + (e.message || e));
            } finally {
                urlImporting.value = false;
            }
        }

        async function grantLib() {
            const res = await window.electronAPI.selectFolder();
            if (res && !res.error) {
                authLost.value = false;
                load();
                if (!(res.files && res.files.length)) {
                    showToast('该文件夹未找到角色卡，可重新选择');
                }
            }
            else showToast((res && res.error) || '已取消');
        }

        // ---- 长按操作 ----
        const sheetActions = computed(() => [
            { name: '添加到管理模式', value: 'manage' },
            { name: '移动到分组', value: 'move' },
            { name: '导出', value: 'export' },
            { name: '重命名', value: 'rename' },
            { name: '删除', value: 'delete', color: '#ee0a24' }
        ]);

        const groupSheetActions = computed(() => {
            const cats = ['未分类', ...mobileLibrary.categories]
                .filter((c) => c !== (activeCard && activeCard.category));
            return [
                ...cats.map((c) => ({ name: c, value: c })),
                { name: '＋ 新建分组', value: '__new__' }
            ];
        });

        function showActions(card) {
            if (manageMode.value) return;
            activeCard = card;
            showSheet.value = true;
        }

        async function onSheetSelect(action) {
            showSheet.value = false;
            if (!activeCard) return;
            if (action.value === 'manage') {
                manageMode.value = true;
                selectedSet.value = new Set([activeCard.path]);
            } else if (action.value === 'move') {
                showGroupSheet.value = true;
            } else if (action.value === 'rename') {
                const newName = window.prompt('新的角色名称:', activeCard.name);
                if (newName && newName.trim() && newName.trim() !== activeCard.name) {
                    const res = await renameCardTo(activeCard, newName.trim());
                    res.success ? showSuccessToast('已重命名') : showToast(res.error || '失败');
                }
            } else if (action.value === 'export') {
                showToast('正在打开导出位置…');
                const res = await window.electronAPI.exportPackage(activeCard.path);
                if (res && res.success) showSuccessToast('已导出');
                else if (res && res.error && !/取消/i.test(res.error)) showToast(res.error);
            } else if (action.value === 'delete') {
                if (window.confirm(`确定删除 [${activeCard.name}] 吗?\n文件将移入回收站(.trash/)。`)) {
                    const res = await removeCard(activeCard);
                    res.success ? showSuccessToast('已删除') : showToast(res.error || '失败');
                }
            }
        }

        async function onGroupSelect(action) {
            showGroupSheet.value = false;
            if (!activeCard) return;
            let target = action.value;
            if (target === '__new__') {
                const name = window.prompt('新分组名称:');
                if (!name || !name.trim()) return;
                target = name.trim();
            }
            const res = await moveCardToGroup(activeCard, target);
            if (res.success) showSuccessToast(`已移动到「${target}」`);
            else showToast(res.error || '移动失败');
        }

        // ---- 批量导出 ----
        const exportSheetActions = computed(() => [
            { name: '导出当前分组（ZIP）', value: 'current' },
            { name: '导出全部（ZIP）', value: 'all' }
        ]);

        async function onExportSelect(action) {
            showExportSheet.value = false;
            const list = action.value === 'current' ? sorted.value : mobileLibrary.library;
            if (!list || !list.length) {
                showToast('没有可导出的卡片');
                return;
            }
            showToast(`正在打包 ${list.length} 张…`);
            try {
                const res = await window.electronAPI.exportBatchPackage(list.map((c) => c.path));
                if (res && res.success) {
                    showSuccessToast(res.shared ? `已打包导出 ${res.count} 张` : `已保存到 ${res.savedPath || '下载/JSKZX'}`);
                } else if (res && res.error && !/取消/i.test(res.error)) showToast(res.error);
            } catch (e) {
                showToast('批量导出失败');
            }
        }

        onMounted(load);

        return {
            // 基础
            query, selected, gridMode, refreshing, loading, libraryReady, needsAuth, authLost, isDark, loadTip,
            filtered, visibleList, renderCount, extendRender, groupChips, showSheet, showGroupSheet, showExportSheet, showDedupe,
            showUrlImport, cardUrl, urlImporting, onUrlImport,
            sheetActions, groupSheetActions, exportSheetActions,
            openCard, onRefresh, grantLib, showActions, onSheetSelect, onGroupSelect,
            onExportSelect, onImport, onDedupe, onDedupeCleaned, snippet,
            // 阶段 3.1: 批量多选
            manageMode, selectedSet, selectedCount, showBatchGroup,
            toggleSelect, toggleSelectAll, isAllSelected, isIndeterminate, exitManage,
            batchDelete, batchExport, batchGroupActions, onBatchGroupSelect,
            // 阶段 3.2: 分组管理
            showGroupManager, newGroupName, groupManageList, onCreateGroup,
            showRenameGroup, renamingGroup, renameGroupName, startRename, onRenameGroup, onDeleteGroup,
            // 阶段 3.3: 排序 + Token + 密度
            sortBy, showSortSheet, sortActions, sortLabel, onSortSelect,
            compactMode, tokenLabel, tokenLevel, cardTokenEstimate,
            // 阶段 3.5: 超级搜索
            searchChips, activeSearchChip, toggleSearchChip,
            // 排序结果
            sorted
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nav-actions .van-icon { margin-left: 14px; }
.flex-1 { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.view-body { flex: 1; overflow-y: auto; padding-bottom: 8px; }

/* 搜索 chip */
.search-chips { display: flex; gap: 8px; padding: 0 16px 4px; }
.url-import-row { padding: 0 12px 4px; }
.url-import-popup { width: 84vw; padding: 16px; }
.url-import-head { font-size: 16px; font-weight: 600; margin-bottom: 12px; text-align: center; }
.url-field { margin-bottom: 12px; }
.url-import-ops { display: flex; gap: 10px; justify-content: flex-end; }

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
    display: flex; align-items: center; gap: 4px;
    background: var(--van-gray-1, #f7f8fa);
    border: 1px dashed var(--van-gray-4, #dcdee0);
    color: var(--van-gray-6, #969799);
    font-size: 12px;
}

.view-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
}
.view-bar .count { font-size: 12px; color: var(--van-gray-6, #969799); }
.view-bar-right { display: flex; align-items: center; gap: 10px; }
.sort-label {
    font-size: 12px; color: var(--van-gray-6, #969799);
    display: flex; align-items: center; gap: 2px;
    cursor: pointer;
}

.cards-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 0 12px;
}
.cards-wrap.list { grid-template-columns: 1fr; }
.cards-wrap.compact.list .card-item { padding: 4px 0; }
.cards-wrap.compact.list .list-cover { width: 48px; height: 64px; }
.cards-wrap.compact.list .card-meta { padding: 4px 8px 4px 0; }
.cards-wrap.compact .c-name { font-size: 13px; }
.cards-wrap.compact .c-desc { font-size: 11px; }

.card-item {
    border-radius: 12px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    position: relative;
}
.card-item.is-selected {
    outline: 2px solid #06b6d4;
    outline-offset: -2px;
}
.card-check {
    position: absolute;
    top: 6px; left: 6px;
    z-index: 2;
}
.grid-cover { aspect-ratio: 3 / 4; }
.card-meta { padding: 8px 10px 10px; }
.c-name {
    font-size: 14px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.c-badges {
    display: flex; align-items: center; gap: 4px;
    margin-top: 3px;
    flex-wrap: wrap;
}
.c-token-badge {
    font-size: 10px; padding: 0 5px;
    border-radius: 4px;
    background: var(--van-gray-2, #f2f3f5);
    color: var(--van-gray-6, #969799);
}
.c-token-badge.t-large { background: #fef3c7; color: #b45309; }
.c-token-badge.t-huge { background: #fee2e2; color: #b91c1c; }
.c-tag-badge { display: flex; gap: 2px; }
.c-cat { margin-top: 2px; font-size: 11px; color: var(--van-gray-6, #969799); }
.is-list { display: flex; align-items: center; gap: 12px; }
.list-cover { width: 64px; height: 84px; border-radius: 8px; flex-shrink: 0; }
.is-list .card-meta { flex: 1; padding: 8px 12px 8px 0; }
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
.bottom-pad { height: 16px; }

/* 批量操作条 */
.batch-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--van-background-2, #fff);
    border-top: 1px solid var(--van-border-color, #ebedf0);
    position: sticky;
    bottom: 0;
    z-index: 10;
}
.batch-check { flex-shrink: 0; }
.batch-actions { display: flex; gap: 8px; }

/* 分组管理 */
.group-manager-popup { width: 88vw; padding: 16px; max-height: 70vh; overflow-y: auto; }
.gm-head { font-size: 16px; font-weight: 600; margin-bottom: 12px; text-align: center; }
.gm-list { max-height: 40vh; overflow-y: auto; }
.gm-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 4px;
    border-bottom: 1px solid var(--van-border-color, #ebedf0);
}
.gm-name { font-size: 14px; font-weight: 500; }
.gm-ops { display: flex; gap: 6px; }
.gm-add {
    display: flex; align-items: center; gap: 8px;
    margin-top: 12px; padding: 0 4px;
}
.gm-field { flex: 1; }
.gm-close { margin-top: 12px; text-align: center; }

/* 重命名弹窗 */
.rename-popup { width: 80vw; padding: 16px; }
.rename-head { font-size: 16px; font-weight: 600; margin-bottom: 12px; text-align: center; }
.rename-ops { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }

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