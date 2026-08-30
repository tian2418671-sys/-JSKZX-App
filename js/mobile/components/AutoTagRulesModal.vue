<!--
  AutoTagRulesModal 移动端自动打标规则表弹窗（Vant 底部弹层）
  对齐桌面 v2.1.0 AutoTagRulesModal 语义：38 条系统预设规则(4组) + 自定义规则 + 关键词候选
  纯 UI 组件：规则由父级注入并 emit 增删改，配置持久化由父级完成（app_config.json）
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="atrm-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="atrm-head">
            <span class="atrm-title">🏷️ 自动打标规则表</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <van-tabs v-model:active="activeTab" class="atrm-tabs">
            <!-- 系统预设规则（只读展示 + 生效开关） -->
            <van-tab title="系统规则">
                <div class="atrm-tip">默认全部生效；关闭某条后不再自动打该标签。</div>
                <van-cell-group inset>
                    <template v-for="(group, gname) in groupedSystemRules" :key="gname">
                        <div class="atrm-group">{{ gname }}</div>
                        <van-cell
                            v-for="rule in group"
                            :key="rule.name"
                            :title="rule.name"
                            :label="rule.regex.length > 46 ? rule.regex.slice(0, 46) + '…' : rule.regex"
                            center
                        >
                            <template #right-icon>
                                <van-switch
                                    :model-value="!disabledRules.includes(rule.name)"
                                    size="20"
                                    @update:model-value="(v) => toggleSystem(rule.name, v)"
                                />
                            </template>
                        </van-cell>
                    </template>
                </van-cell-group>
            </van-tab>

            <!-- 自定义规则（增删改） -->
            <van-tab title="自定义规则">
                <div class="atrm-tip">正则命中（名称/简介/性格/场景/开场白）即自动打标签。</div>
                <van-cell-group inset>
                    <van-cell
                        v-for="(rule, i) in customRules"
                        :key="i"
                        :title="rule.name"
                        :label="rule.regex.length > 46 ? rule.regex.slice(0, 46) + '…' : rule.regex"
                    >
                        <template #right-icon>
                            <van-icon name="delete-o" color="#ee0a24" size="18" @click="$emit('remove-custom', i)" />
                        </template>
                    </van-cell>
                    <van-cell v-if="!customRules.length" title="暂无自定义规则" label="在下方添加" />
                </van-cell-group>
                <div class="atrm-add">
                    <van-field v-model="newName" label="标签" placeholder="如：赛博朋克" />
                    <van-field v-model="newRegex" label="正则" placeholder="如：赛博朋克|义体|义眼" />
                    <van-button block type="primary" size="small" :disabled="!newName.trim() || !newRegex.trim()" @click="addCustom">添加规则</van-button>
                </div>
                <!-- 关键词候选：点击追加到正则输入框 -->
                <div class="atrm-kw">
                    <van-tag
                        v-for="kw in keywordCandidates"
                        :key="kw"
                        plain
                        color="#eef7fb"
                        text-color="#06b6d4"
                        class="atrm-kw-item"
                        @click="appendKw(kw)"
                    >{{ kw }}</van-tag>
                </div>
            </van-tab>
        </van-tabs>
    </van-popup>
</template>

<script>
import { ref, computed } from 'vue';

export default {
    name: 'AutoTagRulesModal',
    props: {
        show: { type: Boolean, default: false },
        // 系统预设规则：[{name, regex, group}]
        systemRules: { type: Array, default: () => [] },
        // 已关闭的系统规则名列表
        disabledRules: { type: Array, default: () => [] },
        // 自定义规则：[{name, regex}]
        customRules: { type: Array, default: () => [] },
        // 常用关键词候选（点击追加到正则输入框）
        keywordCandidates: { type: Array, default: () => [] }
    },
    emits: ['close', 'toggle-system', 'add-custom', 'remove-custom'],
    setup(props, { emit }) {
        const activeTab = ref(0);
        const newName = ref('');
        const newRegex = ref('');

        const groupedSystemRules = computed(() => {
            const map = {};
            for (const r of props.systemRules || []) {
                (map[r.group] = map[r.group] || []).push(r);
            }
            return map;
        });

        function toggleSystem(name, enabled) {
            emit('toggle-system', { name, enabled });
        }
        function addCustom() {
            const name = (newName.value || '').trim();
            const regex = (newRegex.value || '').trim();
            if (!name || !regex) return;
            emit('add-custom', { name, regex });
            newName.value = '';
            newRegex.value = '';
        }
        function appendKw(kw) {
            newRegex.value = (newRegex.value ? newRegex.value + '|' : '') + kw;
        }

        return { activeTab, newName, newRegex, groupedSystemRules, toggleSystem, addCustom, appendKw };
    }
};
</script>

<style scoped>
.atrm-popup { max-height: 88vh; display: flex; flex-direction: column; }
.atrm-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 8px;
    flex-shrink: 0;
}
.atrm-title { font-size: 16px; font-weight: 600; }
.atrm-tip {
    padding: 4px 20px 8px;
    font-size: 11px;
    color: #969799;
}
.atrm-group {
    padding: 8px 16px 4px;
    font-size: 12px;
    font-weight: 600;
    color: #06b6d4;
    background: #f7f8fa;
}
.atrm-add { padding: 12px 16px 4px; }
.atrm-kw {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 12px 16px 20px;
}
.atrm-kw-item { cursor: pointer; }
:deep(.atrm-tabs) { flex: 1; overflow-y: auto; }
</style>
