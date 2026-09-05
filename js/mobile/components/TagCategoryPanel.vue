<!--
  TagCategoryPanel 标签大分类浏览面板（第二波：对齐桌面 v2.2.0 标签大分类体系）
  复用桌面规则引擎 js/utils/tagCategories.js（五级策略，向量层在移动端无引擎时静默跳过）。
  交互：底部弹层 → 18+ 大分类折叠展示全库标签 → 点标签回填库页搜索。
  第三波：AI 归类——对规则未命中（其他）的标签分批调 LLM，建议逐条核对后应用
  （对齐桌面 TagCategoryModal.runAIClassify + resolveTagCategoryTarget 归一）。
-->
<template>
    <van-popup v-model:show="visibleProxy" position="bottom" round closeable class="tcp-popup">
        <div class="tcp-head">
            <span class="tcp-title">🏷️ 标签大分类</span>
            <span class="tcp-sub">{{ totalTags }} 个标签 · {{ groups.length }} 个分类</span>
        </div>

        <!-- AI 归类工具条（第三波） -->
        <div class="tcp-ai-bar">
            <van-button size="small" type="primary" plain icon="magic" :loading="aiBusy" :disabled="aiBusy || !otherTags.length" @click="runAIClassify">
                AI 归类
            </van-button>
            <span class="tcp-ai-tip">{{ aiBusy ? aiText : (otherTags.length ? `${otherTags.length} 个「其他」未归类` : '无未归类标签') }}</span>
        </div>

        <!-- AI 建议核对区（对齐桌面：逐条核对，全部应用） -->
        <div v-if="aiSuggestions.length" class="tcp-ai-review">
            <div class="tcp-ai-review-head">
                <span>✨ AI 建议 {{ aiSuggestions.length }} 条（核对后应用）</span>
                <van-button size="mini" type="primary" @click="applyAllSuggestions">全部应用</van-button>
            </div>
            <div class="tcp-ai-list">
                <div v-for="(s, i) in aiSuggestions" :key="s.tag" class="tcp-ai-item" :class="{ off: !s.accepted }">
                    <span class="tcp-ai-tag" @click="s.accepted = !s.accepted">{{ s.accepted ? '✅' : '⬜' }} {{ s.tag }}</span>
                    <van-icon name="arrow" size="10" class="tcp-ai-arrow" />
                    <span class="tcp-ai-cat" @click="cycleSuggestion(i)">{{ catLabel(s.cat) }}</span>
                </div>
            </div>
            <div class="tcp-ai-review-tip">点标签勾选/取消 · 点目标分类循环切换 · 新分类名自动建类承接</div>
        </div>

        <div class="tcp-body">
            <van-empty v-if="!groups.length" description="当前库无标签" image-size="50" />
            <div v-for="g in groups" :key="g.key" class="tcp-group">
                <div class="tcp-group-head" @click="toggle(g.key)">
                    <van-icon name="arrow" :class="['tcp-arrow', { open: expanded[g.key] }]" size="12" />
                    <span class="tcp-gicon">{{ g.icon }}</span>
                    <span class="tcp-gname">{{ g.name }}</span>
                    <span class="tcp-gcount">{{ g.tags.length }}</span>
                </div>
                <div v-if="expanded[g.key]" class="tcp-tags">
                    <span
                        v-for="t in g.tags"
                        :key="t"
                        class="tcp-tag"
                        :class="{ picked: t === pickedTag }"
                        @click="onPickTag(t)"
                    >{{ t }}</span>
                </div>
            </div>
        </div>
    </van-popup>
</template>

<script>
import { ref, computed, reactive, watch } from 'vue';
import {
    groupTagsByCategory, TAG_CATEGORIES,
    buildTagClassificationSystemPrompt, buildTagClassificationUserPrompt,
    resolveTagCategoryTarget, setCustomTagState
} from '../../utils/tagCategories.js';
import { extractCardTags } from '../../composables/useSearch';
import { api } from '../../bridge/api';
import { showToast, showSuccessToast } from 'vant';
import { loadApiKey } from '../useChatApiConfig';

// 手动归属状态持久化（localStorage；对齐桌面 ui.customTagAssignments 语义）
const LS_AI_CAT_ASSIGN = 'jsmobile-tagcat-assignments'; // { 小写标签: 分类key }
const LS_AI_CAT_CUSTOM = 'jsmobile-tagcat-custom-cats'; // [{key,name,icon}]
function loadCustomState() {
    let cats = [], assigns = {};
    try { cats = JSON.parse(localStorage.getItem(LS_AI_CAT_CUSTOM) || '[]'); } catch (e) { cats = []; }
    try { assigns = JSON.parse(localStorage.getItem(LS_AI_CAT_ASSIGN) || '{}'); } catch (e) { assigns = {}; }
    return { cats, assigns };
}
function persistCustomState(cats, assigns) {
    try {
        localStorage.setItem(LS_AI_CAT_CUSTOM, JSON.stringify(cats));
        localStorage.setItem(LS_AI_CAT_ASSIGN, JSON.stringify(assigns));
    } catch (e) { /* 忽略 */ }
}

export default {
    name: 'TagCategoryPanel',
    props: {
        show: { type: Boolean, default: false },
        library: { type: Array, default: () => [] }
    },
    emits: ['update:show', 'pick'],
    setup(props, { emit }) {
        const visibleProxy = computed({
            get: () => props.show,
            set: (v) => emit('update:show', v)
        });

        // 聚合全库标签(尊重「忽略卡自带标签」开关语义:与库页搜索保持一致)
        const allTags = computed(() => {
            const ignoreNative = localStorage.getItem('jsmobile-ignore-import-tags') === '1';
            const set = new Set();
            for (const card of props.library || []) {
                for (const t of extractCardTags(card, { ignoreNative })) set.add(t);
            }
            return Array.from(set);
        });
        const totalTags = computed(() => allTags.value.length);

        // 规则引擎分组(桌面同款五级策略;移动端无向量引擎→④层自动跳过,规则+其他兜底)
        const groups = computed(() => {
            if (!allTags.value.length) return [];
            const gs = groupTagsByCategory(allTags.value);
            // 组内标签按字母序稳定排序
            for (const g of gs) g.tags.sort((a, b) => String(a).localeCompare(String(b), 'zh'));
            return gs;
        });

        // 默认只展开前 3 个有内容的分类,避免 1500+ 标签一次性渲染卡顿
        const expanded = reactive({});
        watch(groups, (gs) => {
            let opened = 0;
            for (const g of gs) {
                if (opened < 3) { if (expanded[g.key] === undefined) expanded[g.key] = true; opened++; }
                else if (expanded[g.key] === undefined) expanded[g.key] = false;
            }
        }, { immediate: true });
        function toggle(key) { expanded[key] = !expanded[key]; }

        // ---------- 第三波：AI 归类 ----------
        // 引擎 ⓪层装载：已持久化的自定义分类 + 手动归属（启动即生效）
        const { cats: initCats, assigns: initAssigns } = loadCustomState();
        setCustomTagState(initCats, initAssigns);
        const customCats = ref(initCats);
        const aiBusy = ref(false);
        const aiText = ref('');
        const aiSuggestions = ref([]);

        // 「其他」分类下的标签 = AI 归类对象（对齐桌面 allOtherTags）
        const otherTags = computed(() => {
            const g = groups.value.find((x) => x.key === 'other');
            return g ? g.tags : [];
        });

        // AI 回复 → JSON 对象（容忍 markdown 围栏/杂质；对齐桌面 parseAIJson）
        function parseAIJson(text) {
            const s = String(text || '').trim();
            const start = s.indexOf('{');
            const end = s.lastIndexOf('}');
            if (start === -1 || end <= start) return null;
            try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
        }

        // 分类 key → 显示名（内置/自定义/新类名直显）
        function catLabel(key) {
            if (key === 'other') return '其他';
            const b = TAG_CATEGORIES.find((c) => c.key === key);
            if (b) return `${b.icon} ${b.name}`;
            const cu = customCats.value.find((c) => c.key === key);
            if (cu) return `${cu.icon || '🏷️'} ${cu.name}`;
            return `🏷️ ${key}(新)`;
        }

        // 候选分类池（内置非 other + 自定义），点目标分类循环切换
        const catPool = computed(() => {
            const pool = TAG_CATEGORIES.filter((c) => c.key !== 'other').map((c) => c.key);
            for (const c of customCats.value) pool.push(c.key);
            return pool;
        });
        function cycleSuggestion(i) {
            const s = aiSuggestions.value[i];
            const pool = catPool.value;
            const cur = pool.indexOf(s.cat);
            s.cat = pool[(cur + 1 + pool.length) % pool.length];
            s.isNew = false;
        }

        async function runAIClassify() {
            if (aiBusy.value) return;
            const labels = otherTags.value;
            if (!labels.length) { showToast('当前没有「其他」未归类标签'); return; }
            const endpoint = (localStorage.getItem('stc-api-endpoint') || '').trim();
            if (!endpoint) { showToast('请先在「设置」页配置 AI API 端点'); return; }
            const model = (localStorage.getItem('stc-api-model') || 'local-model').trim();
            const type = localStorage.getItem('stc-api-type') === 'anthropic' ? 'anthropic' : 'openai';
            const authKey = (await loadApiKey()).trim();
            const system = buildTagClassificationSystemPrompt(customCats.value);

            const BATCH = 120; // 每批标签数（对齐桌面，避免单请求过长）
            const batches = [];
            for (let i = 0; i < labels.length; i += BATCH) batches.push(labels.slice(i, i + BATCH));

            aiBusy.value = true;
            aiText.value = '准备调用…';
            aiSuggestions.value = [];
            const suggestions = [];
            try {
                for (let b = 0; b < batches.length; b++) {
                    aiText.value = `🤖 归类中 ${b + 1}/${batches.length}（${labels.length} 个）…`;
                    const batch = batches[b];
                    const user = buildTagClassificationUserPrompt(batch);
                    const result = await api.sendChatMessage(endpoint, {
                        model,
                        messages: [
                            { role: 'system', content: system },
                            { role: 'user', content: user }
                        ],
                        temperature: 0
                    }, authKey, type);
                    if (!result || !result.success) throw new Error((result && result.error) || 'API 请求失败');
                    const dd = result.data || {};
                    const text = type === 'anthropic'
                        ? ((dd.content && dd.content[0] && dd.content[0].text) || '')
                        : ((dd.choices && dd.choices[0] && dd.choices[0].message && dd.choices[0].message.content) || '');
                    const map = parseAIJson(text) || {};
                    for (let k = 0; k < batch.length; k++) {
                        const tag = batch[k];
                        // 优先「标签原文」为键，回退「序号」为键（模型两种输出都兼容，对齐桌面）
                        let cat = map[tag];
                        if (cat === undefined && map[String(k)] !== undefined) cat = map[String(k)];
                        // v2.2.1 增强：新分类名经 resolveTagCategoryTarget 归一 → isNew 候选（应用时自动建类）
                        const r = resolveTagCategoryTarget(cat, customCats.value);
                        suggestions.push({ tag, cat: r.key, isNew: r.isNew, accepted: true });
                    }
                    if (b < batches.length - 1) await new Promise((r) => setTimeout(r, 400));
                }
                aiSuggestions.value = suggestions;
                showSuccessToast(`AI 归类完成，共 ${suggestions.length} 条建议（可逐条核对）`);
            } catch (e) {
                showToast('AI 归类失败：' + ((e && e.message) || e));
                console.error('[tagcat] AI 归类失败:', e);
            } finally {
                aiBusy.value = false;
                aiText.value = '';
            }
        }

        // 应用勾选的建议：写入引擎 ⓪层手动归属（持久化；新类名自动建类承接）
        function applyAllSuggestions() {
            const { cats, assigns } = loadCustomState();
            let built = 0, assigned = 0;
            for (const s of aiSuggestions.value) {
                if (!s.accepted) continue;
                const r = resolveTagCategoryTarget(s.cat, cats);
                const key = r.key;
                if (key === 'other') continue;
                if (r.isNew) {
                    // 自动建类承接（对齐桌面 v2.2.1：语义成组建大分类）
                    const nk = 'c_' + Date.now().toString(36) + '_' + built;
                    cats.push({ key: nk, name: key, icon: '🏷️' });
                    assigns[String(s.tag).toLowerCase().trim()] = nk;
                    built++;
                } else {
                    assigns[String(s.tag).toLowerCase().trim()] = key;
                }
                assigned++;
            }
            if (!assigned) { showToast('没有勾选任何建议'); return; }
            persistCustomState(cats, assigns);
            customCats.value = cats;
            setCustomTagState(cats, assigns); // 引擎 ⓪层即时生效 → 分组自动重算
            aiSuggestions.value = [];
            showSuccessToast(`已应用 ${assigned} 条归属${built ? `（新建 ${built} 个分类）` : ''}`);
        }

        const pickedTag = ref('');
        function onPickTag(t) {
            pickedTag.value = t;
            emit('pick', t);
            visibleProxy.value = false;
        }

        return {
            visibleProxy, groups, totalTags, expanded, toggle, pickedTag, onPickTag,
            otherTags, aiBusy, aiText, aiSuggestions, runAIClassify, catLabel, cycleSuggestion, applyAllSuggestions
        };
    }
};
</script>

<style scoped>
.tcp-popup { max-height: 78vh; display: flex; flex-direction: column; }
.tcp-head {
    padding: 14px 16px 8px; display: flex; align-items: baseline; gap: 8px;
}
.tcp-title { font-size: 16px; font-weight: 600; }
.tcp-sub { font-size: 12px; opacity: 0.55; }
.tcp-body { flex: 1; overflow-y: auto; padding: 0 12px 16px; }
.tcp-group { margin-bottom: 6px; border-radius: 8px; overflow: hidden; }
.tcp-group-head {
    display: flex; align-items: center; gap: 6px; padding: 9px 10px;
    background: rgba(128, 128, 128, 0.08); cursor: pointer; user-select: none;
}
.tcp-arrow { transition: transform 0.18s; opacity: 0.6; }
.tcp-arrow.open { transform: rotate(90deg); }
.tcp-gicon { font-size: 15px; }
.tcp-gname { font-size: 14px; font-weight: 500; flex: 1; }
.tcp-gcount { font-size: 12px; opacity: 0.5; }
.tcp-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 4px; }
.tcp-tag {
    padding: 3px 10px; border-radius: 12px; font-size: 12px;
    background: rgba(6, 182, 212, 0.12); color: inherit; cursor: pointer;
}
.tcp-tag.picked { background: #06b6d4; color: #fff; }
/* AI 归类工具条 */
.tcp-ai-bar { display: flex; align-items: center; gap: 10px; padding: 0 16px 8px; }
.tcp-ai-tip { font-size: 12px; opacity: 0.55; }
/* AI 建议核对区 */
.tcp-ai-review { margin: 0 12px 8px; padding: 8px; border-radius: 8px; background: rgba(6, 182, 212, 0.06); border: 1px solid rgba(6, 182, 212, 0.2); }
.tcp-ai-review-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 6px; }
.tcp-ai-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.tcp-ai-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.tcp-ai-item.off { opacity: 0.45; }
.tcp-ai-tag { flex: 1; cursor: pointer; }
.tcp-ai-arrow { opacity: 0.5; }
.tcp-ai-cat { padding: 2px 8px; border-radius: 10px; background: rgba(6, 182, 212, 0.12); cursor: pointer; }
.tcp-ai-review-tip { font-size: 11px; opacity: 0.5; margin-top: 6px; }
</style>
