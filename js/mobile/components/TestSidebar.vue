<template>
    <transition name="ts-slide">
        <div v-show="visible" class="test-sidebar">
            <div class="ts-header">
                <span class="ts-title">测卡配置</span>
                <van-icon name="cross" size="18" class="ts-close" @click="$emit('update:visible', false)" />
            </div>
            <div class="ts-body">
                <van-collapse v-model="activeSections">

                    <!-- ========== 预设导入 ========== -->
                    <van-collapse-item name="preset">
                        <template #title>
                            <div class="ts-sec-title">
                                <span>📋 预设</span>
                                <van-tag v-if="activePresetName" type="primary" size="mini" round>{{ activePresetName }}</van-tag>
                            </div>
                        </template>
                        <!-- 当前激活预设 -->
                        <div v-if="activePresetName" class="ts-preset-active">
                            <span class="ts-preset-name">{{ activePresetName }}</span>
                            <van-button size="mini" plain type="danger" @click="$emit('clear-preset')">取消预设</van-button>
                        </div>
                        <!-- 扫描外部目录 -->
                        <van-button block plain icon="folder-o" type="primary" size="small" :loading="presetScanning"
                            @click="$emit('scan-presets')" style="margin-bottom: 8px">
                            扫描预设目录
                        </van-button>
                        <!-- 扫描到的预设列表 -->
                        <div v-if="externalPresets && externalPresets.length" class="ts-preset-list">
                            <div v-for="(p, i) in externalPresets" :key="i" class="ts-preset-item"
                                @click="$emit('apply-preset', p.data)">
                                <div class="ts-preset-item-name">{{ (p.data && p.data.name) || p.name || '未命名' }}</div>
                                <div class="ts-preset-item-meta">{{ (p.data && p.data.prompts && p.data.prompts.length) || 0 }} 条提示词</div>
                            </div>
                        </div>
                        <van-empty v-else-if="!presetScanning" description="点击上方扫描或下方粘贴导入" image-size="40" />
                        <!-- 粘贴导入 -->
                        <van-field v-model="presetPasteText" type="textarea" rows="4" autosize
                            placeholder="粘贴预设 JSON..." spellcheck="false" class="ts-paste-field" />
                        <van-button block type="primary" size="small" @click="applyPastedPreset" style="margin-top: 8px">
                            导入粘贴的预设
                        </van-button>
                    </van-collapse-item>

                    <!-- ========== 预设参数 ========== -->
                    <van-collapse-item v-if="activePresetName" name="params">
                        <template #title>
                            <div class="ts-sec-title">
                                <span>⚙️ 预设参数</span>
                            </div>
                        </template>
                        <div v-for="pk in paramKeys" :key="pk.key" class="ts-param-row">
                            <div class="ts-param-label">{{ pk.label }}</div>
                            <div class="ts-param-control">
                                <van-stepper v-model="paramOverrides[pk.key]" :min="pk.min" :max="pk.max"
                                    :step="pk.step" :decimal-length="pk.decimal || 0" allow-empty
                                    @change="emitParams" />
                            </div>
                            <div v-if="presetParams && presetParams[pk.key] !== undefined" class="ts-param-default">
                                预设: {{ presetParams[pk.key] }}
                            </div>
                        </div>
                        <van-button size="mini" plain @click="resetParams" style="margin-top: 8px">重置为预设默认值</van-button>
                    </van-collapse-item>

                    <!-- ========== 正则 ========== -->
                    <van-collapse-item name="regex">
                        <template #title>
                            <div class="ts-sec-title">
                                <span>🔤 正则</span>
                                <van-tag size="mini" round>{{ regexCount }}</van-tag>
                            </div>
                        </template>
                        <!-- 正则列表 -->
                        <div v-if="allRegexScripts && allRegexScripts.length" class="ts-regex-list">
                            <div v-for="(r, i) in allRegexScripts" :key="i" class="ts-regex-item">
                                <van-icon :name="r.disabled ? 'circle' : 'success'" :color="r.disabled ? '#c8c9cc' : '#06b6d4'"
                                    size="16" />
                                <span class="ts-regex-name" :class="{ disabled: r.disabled }">{{ r.scriptName || '未命名' }}</span>
                                <span class="ts-regex-placement">{{ formatPlacement(r.placement) }}</span>
                            </div>
                        </div>
                        <van-empty v-else description="无正则脚本" image-size="40" />
                        <!-- 导入正则 -->
                        <van-field v-model="regexPasteText" type="textarea" rows="4" autosize
                            placeholder='粘贴正则 JSON，如 [{"findRegex":"old","replaceString":"new","placement":["AI"]}]'
                            spellcheck="false" class="ts-paste-field" style="margin-top: 8px" />
                        <van-button block type="primary" size="small" @click="importPastedRegex" style="margin-top: 8px">
                            导入正则
                        </van-button>
                    </van-collapse-item>

                    <!-- ========== 插件 ========== -->
                    <van-collapse-item name="plugin">
                        <template #title>
                            <div class="ts-sec-title">
                                <span>🧩 插件</span>
                                <van-tag size="mini" round>{{ (plugins && plugins.length) || 0 }}</van-tag>
                            </div>
                        </template>
                        <!-- 插件列表 -->
                        <div v-if="plugins && plugins.length" class="ts-plugin-list">
                            <div v-for="p in plugins" :key="p.name" class="ts-plugin-item">
                                <van-switch :model-value="p.enabled" size="18px"
                                    @update:model-value="$emit('toggle-plugin', p.name)" />
                                <div class="ts-plugin-info">
                                    <div class="ts-plugin-name">{{ p.name }}</div>
                                    <div v-if="p.description" class="ts-plugin-desc">{{ p.description }}</div>
                                </div>
                                <van-icon name="delete-o" color="#ee0a24" size="16" @click="$emit('remove-plugin', p.name)" />
                            </div>
                        </div>
                        <van-empty v-else description="无插件" image-size="40" />
                        <!-- 导入插件 -->
                        <van-field v-model="pluginPasteText" type="textarea" rows="4" autosize
                            placeholder='粘贴插件 JSON，如 {"name":"插件","systemPrompts":["指令"],"macros":{}}'
                            spellcheck="false" class="ts-paste-field" style="margin-top: 8px" />
                        <van-button block type="primary" size="small" @click="importPastedPlugin" style="margin-top: 8px">
                            导入插件
                        </van-button>
                    </van-collapse-item>

                    <!-- ========== 世界书 ========== -->
                    <van-collapse-item name="worldbook">
                        <template #title>
                            <div class="ts-sec-title">
                                <span>📖 世界书</span>
                                <van-tag size="mini" round>{{ wbCount }}</van-tag>
                            </div>
                        </template>
                        <div v-if="wbCount" class="ts-wb-list">
                            <div v-for="(e, key) in wbEntries" :key="key" class="ts-wb-item">
                                <van-switch v-model="e.enabled" size="18px" />
                                <span class="ts-wb-name" :class="{ disabled: !e.enabled }">
                                    {{ e.comment || '(未命名)' }}
                                </span>
                                <span v-if="e.constant" class="ts-wb-tag">常驻</span>
                            </div>
                        </div>
                        <van-empty v-else description="当前卡片无内嵌世界书" image-size="40" />
                        <div class="ts-wb-tip">条目来自角色卡内嵌数据，开关控制测卡时是否注入，与世界书库无关。</div>
                    </van-collapse-item>

                </van-collapse>
            </div>
        </div>
    </transition>
</template>

<script>
import { ref, reactive, computed, watch } from 'vue';
import { showToast, showSuccessToast } from 'vant';

export default {
    name: 'TestSidebar',
    props: {
        visible: { type: Boolean, default: false },
        activePresetName: { type: String, default: '' },
        plugins: { type: Array, default: () => [] },
        allRegexScripts: { type: Array, default: () => [] },
        externalPresets: { type: Array, default: () => [] },
        presetScanning: { type: Boolean, default: false },
        wbEntries: { type: Object, default: () => ({}) },
        presetParams: { type: Object, default: () => ({}) },
    },
    emits: [
        'update:visible', 'scan-presets', 'apply-preset', 'clear-preset',
        'import-regex', 'import-plugin', 'remove-plugin', 'toggle-plugin',
        'update-params'
    ],
    setup(props, { emit }) {
        const activeSections = ref(['preset']);
        const presetPasteText = ref('');
        const regexPasteText = ref('');
        const pluginPasteText = ref('');

        // 预设参数覆盖（用户在侧边栏中调整的值，覆盖预设默认值）
        const paramOverrides = reactive({});

        // 参数定义
        const paramKeys = [
            { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.1, decimal: 1 },
            { key: 'max_tokens', label: 'Max Tokens', min: 1, max: 32768, step: 1, decimal: 0 },
            { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05, decimal: 2 },
            { key: 'top_k', label: 'Top K', min: 0, max: 100, step: 1, decimal: 0 },
            { key: 'frequency_penalty', label: 'Freq Penalty', min: -2, max: 2, step: 0.1, decimal: 1 },
            { key: 'presence_penalty', label: 'Pres Penalty', min: -2, max: 2, step: 0.1, decimal: 1 },
            { key: 'rep_pen', label: 'Repetition Penalty', min: 1, max: 2, step: 0.01, decimal: 2 },
            { key: 'max_context', label: 'Max Context', min: 1024, max: 200000, step: 1024, decimal: 0 },
        ];

        const regexCount = computed(() => (props.allRegexScripts && props.allRegexScripts.length) || 0);
        const wbCount = computed(() => (props.wbEntries ? Object.keys(props.wbEntries).length : 0));

        // 当预设变化时，用预设默认值初始化参数覆盖
        watch(() => props.presetParams, (params) => {
            if (params) {
                for (const pk of paramKeys) {
                    if (params[pk.key] !== undefined && paramOverrides[pk.key] === undefined) {
                        paramOverrides[pk.key] = params[pk.key];
                    }
                }
            }
        }, { immediate: true, deep: true });

        // 预设变化或清空时重置覆盖
        watch(() => props.activePresetName, (name) => {
            if (!name) {
                // 预设被清除，清空覆盖
                for (const k of Object.keys(paramOverrides)) {
                    delete paramOverrides[k];
                }
            }
        });

        function emitParams() {
            const out = {};
            for (const k of Object.keys(paramOverrides)) {
                if (paramOverrides[k] !== null && paramOverrides[k] !== undefined && paramOverrides[k] !== '') {
                    out[k] = Number(paramOverrides[k]);
                }
            }
            emit('update-params', out);
        }

        function resetParams() {
            for (const k of Object.keys(paramOverrides)) {
                delete paramOverrides[k];
            }
            // 用预设默认值重新填充
            if (props.presetParams) {
                for (const pk of paramKeys) {
                    if (props.presetParams[pk.key] !== undefined) {
                        paramOverrides[pk.key] = props.presetParams[pk.key];
                    }
                }
            }
            emitParams();
            showToast('已重置为预设默认值');
        }

        function applyPastedPreset() {
            const raw = (presetPasteText.value || '').trim();
            if (!raw) { showToast('请粘贴预设 JSON'); return; }
            try {
                const data = JSON.parse(raw);
                emit('apply-preset', data);
                presetPasteText.value = '';
            } catch (e) {
                showToast('JSON 解析失败: ' + e.message);
            }
        }

        function importPastedRegex() {
            const raw = (regexPasteText.value || '').trim();
            if (!raw) { showToast('请粘贴正则 JSON'); return; }
            try {
                const data = JSON.parse(raw);
                emit('import-regex', data);
                regexPasteText.value = '';
            } catch (e) {
                showToast('JSON 解析失败: ' + e.message);
            }
        }

        function importPastedPlugin() {
            const raw = (pluginPasteText.value || '').trim();
            if (!raw) { showToast('请粘贴插件 JSON'); return; }
            try {
                const data = JSON.parse(raw);
                emit('import-plugin', data);
                pluginPasteText.value = '';
            } catch (e) {
                showToast('JSON 解析失败: ' + e.message);
            }
        }

        function formatPlacement(placement) {
            if (!placement || !Array.isArray(placement) || !placement.length) return '';
            return placement.join('/');
        }

        return {
            activeSections, presetPasteText, regexPasteText, pluginPasteText,
            paramOverrides, paramKeys, regexCount, wbCount,
            emitParams, resetParams, applyPastedPreset, importPastedRegex, importPastedPlugin,
            formatPlacement,
        };
    }
};
</script>

<style scoped>
.test-sidebar {
    position: absolute;
    right: 0; top: 0; bottom: 0;
    width: 300px;
    z-index: 20;
    background: var(--van-background, #fff);
    box-shadow: -2px 0 12px rgba(0,0,0,0.12);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.ts-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--van-gray-2, #ebedf0);
    flex-shrink: 0;
}
.ts-title { font-size: 14px; font-weight: 600; }
.ts-close { cursor: pointer; color: var(--van-gray-5, #969799); }
.ts-body {
    flex: 1; overflow-y: auto;
    padding-bottom: 24px;
}
.ts-sec-title { display: flex; align-items: center; gap: 6px; width: 100%; }

/* 预设 */
.ts-preset-active {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; margin-bottom: 8px;
    border-bottom: 1px solid var(--van-gray-2, #ebedf0);
}
.ts-preset-name { font-size: 13px; font-weight: 600; color: #06b6d4; }
.ts-preset-list { margin-bottom: 8px; }
.ts-preset-item {
    padding: 10px 12px; border-radius: 8px;
    background: var(--van-background-2, #f7f8fa);
    margin-bottom: 6px; cursor: pointer;
}
.ts-preset-item:active { background: var(--van-active-color, #f2f3f5); }
.ts-preset-item-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.ts-preset-item-meta { font-size: 11px; color: var(--van-gray-5, #969799); }

/* 参数 */
.ts-param-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0;
}
.ts-param-label { width: 90px; flex-shrink: 0; font-size: 12px; color: var(--van-gray-6, #646566); }
.ts-param-control { flex-shrink: 0; }
.ts-param-default { font-size: 10px; color: var(--van-gray-5, #969799); }

/* 正则 */
.ts-regex-list { margin-bottom: 4px; }
.ts-regex-item {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid var(--van-gray-1, #f7f8fa);
}
.ts-regex-name { font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ts-regex-name.disabled { color: var(--van-gray-5, #c8c9cc); text-decoration: line-through; }
.ts-regex-placement { font-size: 10px; color: var(--van-gray-5, #969799); flex-shrink: 0; }

/* 插件 */
.ts-plugin-list { margin-bottom: 4px; }
.ts-plugin-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--van-gray-1, #f7f8fa);
}
.ts-plugin-info { flex: 1; min-width: 0; }
.ts-plugin-name { font-size: 13px; font-weight: 600; }
.ts-plugin-desc { font-size: 11px; color: var(--van-gray-5, #969799); margin-top: 2px; }

/* 世界书 */
.ts-wb-list { margin-bottom: 4px; }
.ts-wb-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--van-gray-1, #f7f8fa);
}
.ts-wb-name { font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ts-wb-name.disabled { color: var(--van-gray-5, #c8c9cc); }
.ts-wb-tag { font-size: 9px; color: #06b6d4; background: #eef7fb; padding: 1px 4px; border-radius: 3px; flex-shrink: 0; }
.ts-wb-tip { font-size: 10px; color: var(--van-gray-5, #969799); padding: 8px 4px; line-height: 1.5; }

/* 通用 */
.ts-paste-field {
    border: 1px solid var(--van-gray-3, #dcdee0);
    border-radius: 6px;
    margin-top: 4px;
}
.ts-paste-field :deep(textarea) { font-size: 11px; }

/* 过渡动画 */
.ts-slide-enter-active, .ts-slide-leave-active {
    transition: transform 0.3s ease;
}
.ts-slide-enter-from, .ts-slide-leave-to {
    transform: translateX(100%);
}
</style>
