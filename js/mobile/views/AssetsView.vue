<!--
  AssetsView 全局资产中心（阶段 4.4 全库词条搜索 + 4.5 全局正则中心）
  Tab 1: 全库词条 — 遍历所有卡片内嵌世界书，按触发词/正文/注释搜索，点结果跳详情
  Tab 2: 全库正则 — 遍历所有卡片正则脚本，查看/编辑
-->
<template>
    <div class="assets-page">
        <van-nav-bar title="资产中心" left-arrow @click-left="$router.back()" safe-area-inset-top />
        <van-tabs v-model:active="activeTab" sticky offset-top="46">
            <!-- Tab 1: 全库词条搜索 -->
            <van-tab title="全库词条" name="entries">
                <div class="tab-body">
                    <van-search v-model="entryQuery" placeholder="搜索触发词 / 正文 / 注释…" shape="round"
                        @search="searchEntries" @clear="entryResults = []" />
                    <div v-if="entrySearching" class="loading-box">
                        <van-loading size="20" /> <span>正在索引全库词条…</span>
                    </div>
                    <van-empty v-else-if="entryResults.length === 0 && hasSearched" description="未找到匹配词条" />
                    <van-empty v-else-if="entryResults.length === 0" description="输入关键词搜索全库世界书词条" />
                    <div v-else class="result-count">找到 {{ entryResults.length }} 条结果</div>
                    <div class="entry-list">
                        <div v-for="(r, i) in entryResults" :key="i" class="entry-card" @click="jumpToCard(r)">
                            <div class="entry-head">
                                <span class="entry-card-name">{{ r.cardName }}</span>
                                <van-tag v-if="r.constant" type="danger" size="mini">常驻</van-tag>
                                <van-tag v-else type="primary" size="mini">触发</van-tag>
                            </div>
                            <div class="entry-name">{{ r.entryName || '(未命名)' }}</div>
                            <div class="entry-keys" v-if="r.keys">🔑 {{ r.keys }}</div>
                            <div class="entry-content">{{ r.contentSnippet }}</div>
                        </div>
                    </div>
                </div>
            </van-tab>

            <!-- Tab 2: 全库正则脚本 -->
            <van-tab title="全库正则" name="regex">
                <div class="tab-body">
                    <van-search v-model="regexQuery" placeholder="搜索脚本名 / 正则 / 替换内容…" shape="round" />
                    <div v-if="regexLoading" class="loading-box">
                        <van-loading size="20" /> <span>正在索引全库正则…</span>
                    </div>
                    <van-empty v-else-if="filteredRegex.length === 0" description="未找到正则脚本" />
                    <div v-else class="result-count">共 {{ filteredRegex.length }} 条正则</div>
                    <div class="regex-list">
                        <div v-for="(r, i) in filteredRegex" :key="i" class="regex-card" @click="jumpToCard(r)">
                            <div class="regex-head">
                                <span class="regex-card-name">{{ r.cardName }}</span>
                                <van-tag :type="r.disabled ? 'default' : 'success'" size="mini">{{ r.disabled ? '已禁用' : '启用' }}</van-tag>
                            </div>
                            <div class="regex-name">{{ r.scriptName || '(未命名)' }}</div>
                            <div class="regex-find">Find: <code>{{ (r.findRegex || '').substring(0, 60) }}</code></div>
                            <div class="regex-rep">Replace: <code>{{ (r.replaceString || '').substring(0, 60) }}</code></div>
                        </div>
                    </div>
                </div>
            </van-tab>
        </van-tabs>
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { mobileLibrary } from '../useMobileLibrary';
import { extractBookEntries } from '../../utils/cardLoader.js';

export default {
    name: 'AssetsView',
    setup() {
        const router = useRouter();
        const activeTab = ref('entries');

        // ---------- 全库词条搜索 ----------
        const entryQuery = ref('');
        const entryResults = ref([]);
        const entrySearching = ref(false);
        const hasSearched = ref(false);

        function searchEntries() {
            const q = entryQuery.value.trim().toLowerCase();
            if (!q) { entryResults.value = []; hasSearched.value = false; return; }
            entrySearching.value = true;
            hasSearched.value = true;

            // 延迟执行避免 UI 冻结（大库）
            setTimeout(() => {
                const results = [];
                for (const card of mobileLibrary.library) {
                    const d = (card.data && card.data.data) || card.data || {};
                    const ext = d.extensions || {};
                    let book = ext.world_book;
                    if (!book && d.character_book) book = d.character_book;
                    if (!book) continue;

                    const entries = extractBookEntries(book);
                    for (const entry of entries) {
                        const keys = Array.isArray(entry.keys) ? entry.keys.join(', ') : (entry.keys || '');
                        const comment = entry.comment || '';
                        const content = entry.content || '';
                        const name = entry.name || '';

                        const haystack = `${keys} ${comment} ${content} ${name}`.toLowerCase();
                        if (haystack.includes(q)) {
                            results.push({
                                cardName: card.name || '未知',
                                cardId: card.id || card.path,
                                entryName: name,
                                keys: keys,
                                constant: entry.constant,
                                contentSnippet: content.substring(0, 120) + (content.length > 120 ? '…' : '')
                            });
                        }
                    }
                }
                entryResults.value = results;
                entrySearching.value = false;
            }, 50);
        }

        // ---------- 全库正则 ----------
        const regexQuery = ref('');
        const regexLoading = ref(true);
        const allRegex = ref([]);

        function buildRegexIndex() {
            const list = [];
            for (const card of mobileLibrary.library) {
                const d = (card.data && card.data.data) || card.data || {};
                const ext = d.extensions || {};
                const scripts = ext.regex_scripts;
                if (!Array.isArray(scripts)) continue;
                for (const s of scripts) {
                    list.push({
                        cardName: card.name || '未知',
                        cardId: card.id || card.path,
                        scriptName: s.scriptName || s.name || '',
                        findRegex: s.findRegex || '',
                        replaceString: s.replaceString || '',
                        disabled: s.disabled || false
                    });
                }
            }
            allRegex.value = list;
            regexLoading.value = false;
        }

        const filteredRegex = computed(() => {
            const q = regexQuery.value.trim().toLowerCase();
            if (!q) return allRegex.value;
            return allRegex.value.filter(r =>
                `${r.scriptName} ${r.findRegex} ${r.replaceString} ${r.cardName}`.toLowerCase().includes(q)
            );
        });

        function jumpToCard(item) {
            if (item.cardId) {
                router.push({ path: '/card', query: { id: item.cardId } });
            }
        }

        onMounted(() => {
            buildRegexIndex();
        });

        return {
            activeTab,
            entryQuery, entryResults, entrySearching, hasSearched, searchEntries,
            regexQuery, regexLoading, filteredRegex,
            jumpToCard
        };
    }
};
</script>

<style scoped>
.assets-page { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.assets-page :deep(.van-tabs) { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.assets-page :deep(.van-tabs__content) { flex: 1; min-height: 0; overflow-y: auto; }
.tab-body { padding: 8px 12px 24px; }
.loading-box { display: flex; align-items: center; gap: 8px; padding: 20px 0; color: var(--van-text-color-2); font-size: 13px; }
.result-count { font-size: 12px; color: var(--van-text-color-2); padding: 4px 0 8px; }
.entry-list, .regex-list { display: flex; flex-direction: column; gap: 8px; }
.entry-card, .regex-card {
    background: var(--van-background-2, #fff);
    border-radius: 8px;
    padding: 10px 12px;
    border: 1px solid var(--van-border-color, #ebedf0);
    cursor: pointer;
}
.entry-head, .regex-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.entry-card-name, .regex-card-name { font-size: 11px; color: var(--van-text-color-2); font-weight: 500; }
.entry-name, .regex-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.entry-keys { font-size: 12px; color: #06b6d4; margin-bottom: 2px; }
.entry-content { font-size: 12px; color: var(--van-text-color-2); line-height: 1.5; }
.regex-find, .regex-rep { font-size: 11px; color: var(--van-text-color-2); margin-top: 2px; word-break: break-all; }
.regex-find code, .regex-rep code { font-family: monospace; background: var(--van-gray-1, #f7f8fa); padding: 1px 4px; border-radius: 3px; }
</style>
