<!--
  TagCategoryPanel 标签大分类浏览面板（第二波：对齐桌面 v2.2.0 标签大分类体系）
  复用桌面规则引擎 js/utils/tagCategories.js（五级策略，向量层在移动端无引擎时静默跳过）。
  交互：底部弹层 → 18+ 大分类折叠展示全库标签 → 点标签回填库页搜索（tag: 语法）。
-->
<template>
    <van-popup v-model:show="visibleProxy" position="bottom" round closeable class="tcp-popup">
        <div class="tcp-head">
            <span class="tcp-title">🏷️ 标签大分类</span>
            <span class="tcp-sub">{{ totalTags }} 个标签 · {{ groups.length }} 个分类</span>
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
import { groupTagsByCategory } from '../../utils/tagCategories.js';
import { extractCardTags } from '../../composables/useSearch';

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

        // 规则引擎分组(桌面同款五级策略;移动端无向量引擎→③层自动跳过,规则+其他兜底)
        const groups = computed(() => {
            if (!allTags.value.length) return [];
            const gs = groupTagsByCategory(allTags.value);
            // 组内标签按出现频次/字母序稳定排序
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

        const pickedTag = ref('');
        function onPickTag(t) {
            pickedTag.value = t;
            emit('pick', t);
            visibleProxy.value = false;
        }

        return { visibleProxy, groups, totalTags, expanded, toggle, pickedTag, onPickTag };
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
</style>
