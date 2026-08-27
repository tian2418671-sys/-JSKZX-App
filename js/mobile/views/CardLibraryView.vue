<template>
    <div class="view-page">
        <van-nav-bar title="卡片库" safe-area-inset-top>
            <template #right>
                <div class="nav-actions">
                    <van-icon name="cluster-o" size="20" @click="onDedupe" />
                    <van-icon name="plus" size="20" @click="onImport" />
                    <van-icon name="share-o" size="19" @click="showExportSheet = true" />
                    <van-icon name="replay" size="20" @click="onRefresh" />
                </div>
            </template>
        </van-nav-bar>

        <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="flex-1">
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
                <van-search v-model="query" placeholder="搜索卡片名 / 描述" shape="round" />

                <!-- 分组横向滚动 -->
                <div class="cat-scroll">
                    <div
                        v-for="cat in groupChips"
                        :key="cat"
                        class="cat-chip"
                        :class="{ active: selected === cat }"
                        @click="selected = cat"
                    >{{ cat }}</div>
                </div>

                <!-- 视图切换 -->
                <div class="view-bar">
                    <span class="count">{{ filtered.length }} 张</span>
                    <van-icon name="apps-o" :color="gridMode ? '#06b6d4' : ''" size="20" @click="gridMode = true" />
                    <van-icon name="list" :color="!gridMode ? '#06b6d4' : ''" size="20" @click="gridMode = false" />
                </div>

                <!-- 卡片网格 / 列表 -->
                <div v-if="loading" class="status-wrap">
                    <van-loading size="28">
                        {{ loadTip }}
                    </van-loading>
                </div>
                <van-empty v-else-if="!filtered.length" description="没有卡片" />
                <div v-else class="cards-wrap" :class="{ list: !gridMode }">
                    <div
                        v-for="card in visibleList"
                        :key="card.path"
                        class="card-item"
                        :class="{ 'is-list': !gridMode }"
                        @click="openCard(card)"
                        @longpress="showActions(card)"
                    >
                        <MobileCardCover v-if="gridMode" :card="card" class="grid-cover" />
                        <MobileCardCover v-else :card="card" class="list-cover" />
                        <div class="card-meta">
                            <div class="c-name">{{ card.name }}</div>
                            <div v-if="gridMode" class="c-cat">{{ card.category }}</div>
                            <div v-else class="c-desc">{{ snippet(card) }}</div>
                        </div>
                    </div>
                    <!-- 增量渲染哨兵:触底扩展渲染数量,大库避免一次性渲染全部 DOM -->
                    <div v-if="filtered.length > renderCount" v-load-more="extendRender" class="load-more-hint">
                        上滑加载更多…
                    </div>
                </div>
                <div class="bottom-pad" />
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

        <!-- 查重弹窗(角色卡) -->
        <DedupeModal v-model:show="showDedupe" mode="card" @cleaned="onDedupeCleaned" />
    </div>
</template>

<script>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { currentTheme } from '../theme';
import { api } from '../../bridge/api';
import MobileCardCover from '../components/MobileCardCover.vue';
import DedupeModal from '../components/DedupeModal.vue';
import {
    mobileLibrary, loadLibrary, moveCardToGroup, removeCard, renameCardTo, LIBRARY_ROOT
} from '../useMobileLibrary';

export default {
    name: 'CardLibraryView',
    components: { MobileCardCover, DedupeModal },
    directives: {
        // 触底哨兵:进入视口附近即扩展增量渲染,断开避免重复触发
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
        // 增量渲染:首次只渲染 24 张,触底每次加 16 张
        const BATCH_STEP = 16;
        const renderCount = ref(24);
        const visibleList = computed(() => filtered.value.slice(0, renderCount.value));
        function extendRender() {
            if (renderCount.value >= filtered.value.length) return;
            renderCount.value += BATCH_STEP;
            if (renderCount.value > filtered.value.length) renderCount.value = filtered.value.length;
        }
        let activeCard = null;

        // 搜索词/分组切换时重置增量渲染,保证立即看到首屏结果
        watch([query, selected], () => {
            renderCount.value = 24;
        });

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

        const filtered = computed(() => {
            let list = mobileLibrary.library;
            if (selected.value === '全部') {
                // 全部
            } else if (selected.value === '未分类') {
                list = list.filter((c) => c.category === '未分类');
            } else {
                list = list.filter((c) => c.category === selected.value);
            }
            const q = query.value.trim().toLowerCase();
            if (q) {
                list = list.filter((c) =>
                    (c.name || '').toLowerCase().includes(q)
                    || ((c.data && c.data.data && c.data.data.description) || '').toLowerCase().includes(q)
                    || (c.creator || '').toLowerCase().includes(q)
                );
            }
            return [...list].sort((a, b) => (b._mtime || 0) - (a._mtime || 0));
        });

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
                // 扫描失败且非"库根不可用"时,区分首次授权与授权失效(需查原生持久化状态)
                const info = await api.libraryInfo();
                authLost.value = !!(info && info.hasUri) && !info.granted;
            }
        }

        async function onRefresh() {
            refreshing.value = true;
            await load();
            refreshing.value = false;
        }

        async function grantLib() {
            const res = await window.electronAPI.selectFolder();
            if (res && !res.error) {
                authLost.value = false;
                load();
                // 选错目录引导:授权成功但该文件夹没有角色卡
                if (!(res.files && res.files.length)) {
                    showToast('该文件夹未找到角色卡，可重新选择');
                }
            }
            else showToast((res && res.error) || '已取消');
        }

        // ---------- 长按操作 ----------
        const sheetActions = computed(() => [
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
            activeCard = card;
            showSheet.value = true;
        }

        async function onSheetSelect(action) {
            showSheet.value = false;
            if (!activeCard) return;
            if (action.value === 'move') {
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
                if (window.confirm(`确定删除 [${activeCard.name}] 吗?\n文件将被移入系统回收站。`)) {
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

        // ---------- 批量导出(ZIP + 分享) ----------
        const exportSheetActions = computed(() => [
            { name: '导出当前分组（ZIP）', value: 'current' },
            { name: '导出全部（ZIP）', value: 'all' }
        ]);

        async function onExportSelect(action) {
            showExportSheet.value = false;
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

        return {
            query, selected, gridMode, refreshing, loading, libraryReady, needsAuth, authLost, isDark, loadTip,
            filtered, visibleList, renderCount, extendRender, groupChips, showSheet, showGroupSheet, showExportSheet, showDedupe,
            sheetActions, groupSheetActions, exportSheetActions,
            openCard, onRefresh, grantLib, showActions, onSheetSelect, onGroupSelect,
            onExportSelect, onImport, onDedupe, onDedupeCleaned, snippet
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.nav-actions .van-icon { margin-left: 14px; }
.flex-1 { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.view-body { flex: 1; overflow-y: auto; padding-bottom: 8px; }

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
.view-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
}
.view-bar .count { font-size: 12px; color: var(--van-gray-6, #969799); }
.view-bar .van-icon { margin-left: 12px; }

.cards-wrap {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 0 12px;
}
.cards-wrap.list { grid-template-columns: 1fr; }
.card-item {
    border-radius: 12px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.grid-cover { aspect-ratio: 3 / 4; }
.card-meta { padding: 8px 10px 10px; }
.c-name {
    font-size: 14px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
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