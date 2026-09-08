<!--
  PresetDetailView 预设详情页（对齐角色卡详情页的选项卡形态）
  三子选项卡:
    ① 提示词 —— van-collapse 可展开编辑每条(名称/角色/正文/启用),可新增/删除
    ② 正则   —— 预设内嵌 regex_scripts 列表(查看/编辑/开关/新增/删除)
    ③ 插件   —— 预设内嵌 plugins 列表(查看/开关/新增/删除)
  保存写回外部预设目录(saveExternalPreset 整包覆写);JSON 源码编辑入口保留。
  数据来源:sessionStorage 传递扫描结果(避免进入详情页重复全目录扫描);
  冷启动/直达链接时回退重新扫描外部目录。
-->
<template>
    <div class="pd-page">
        <van-nav-bar :title="presetName" left-arrow @click-left="$router.back()" safe-area-inset-top>
            <template #right>
                <van-icon name="description" size="18" style="margin-right: 12px" @click="showJsonEditor = true" />
                <van-icon name="success" size="18" :color="dirty ? '#06b6d4' : ''" @click="save" />
            </template>
        </van-nav-bar>

        <van-loading v-if="loading" class="pd-loading" size="28">加载预设…</van-loading>
        <van-empty v-else-if="!preset" description="未找到预设" />
        <template v-else>
            <van-tabs v-model:active="activeTab" sticky offset-top="46" class="pd-tabs">
                <!-- ① 提示词条目 -->
                <van-tab title="提示词" name="prompts">
                    <div class="pd-body">
                        <div class="pd-tip">展开条目可编辑内容;改动后点右上角 💾 保存写回文件</div>
                        <van-collapse v-model="promptOpen">
                            <van-collapse-item
                                v-for="(p, i) in editablePrompts"
                                :key="p._uid"
                                :name="p._uid"
                            >
                                <template #title>
                                    <span class="pd-p-name">{{ p.name || ('提示词 ' + (i + 1)) }}</span>
                                    <van-tag size="mini" :type="p.role === 'system' ? 'warning' : 'primary'" plain>{{ p.role || 'system' }}</van-tag>
                                    <van-switch v-model="p.enabled" size="16px" class="pd-p-switch" @click.stop />
                                </template>
                                <van-field v-model="p.name" label="名称" placeholder="提示词名称" />
                                <van-field v-model="p.content" label="内容" type="textarea" rows="6" autosize placeholder="提示词正文" class="pd-p-content" />
                                <div class="pd-p-ops">
                                    <van-button size="mini" plain type="danger" @click="removePrompt(i)">删除此条</van-button>
                                </div>
                            </van-collapse-item>
                        </van-collapse>
                        <van-button block plain type="primary" size="small" style="margin-top: 10px" @click="addPrompt">＋ 新增提示词</van-button>
                    </div>
                </van-tab>

                <!-- ② 正则 -->
                <van-tab title="正则" name="regex">
                    <div class="pd-body">
                        <div class="pd-tip">预设内嵌的 regex_scripts,测卡时与卡内正则一并生效</div>
                        <van-empty v-if="!editableRegex.length" description="此预设没有内嵌正则" image-size="60" />
                        <div v-for="(r, i) in editableRegex" :key="r._uid" class="pd-item">
                            <div class="pd-item-head">
                                <span class="pd-item-name">{{ r.scriptName || ('正则 ' + (i + 1)) }}</span>
                                <van-switch v-model="r.disabled" size="16px" :active-value="false" :inactive-value="true" @click.stop />
                            </div>
                            <div class="pd-item-meta">匹配 {{ shortText(r.findRegex, 60) }}</div>
                            <div class="pd-item-ops">
                                <van-button size="mini" plain type="primary" @click="editRegex(i)">编辑</van-button>
                                <van-button size="mini" plain type="danger" @click="removeRegex(i)">删除</van-button>
                            </div>
                        </div>
                        <van-button block plain type="primary" size="small" style="margin-top: 10px" @click="addRegex">＋ 新增正则</van-button>
                    </div>
                </van-tab>

                <!-- ③ 插件 -->
                <van-tab title="插件" name="plugins">
                    <div class="pd-body">
                        <div class="pd-tip">预设内嵌的插件定义(宏/系统提示词/触发词),测卡时与手动插件一并生效</div>
                        <van-empty v-if="!editablePlugins.length" description="此预设没有内嵌插件" image-size="60" />
                        <div v-for="(pl, i) in editablePlugins" :key="pl._uid" class="pd-item">
                            <div class="pd-item-head">
                                <span class="pd-item-name">{{ pl.name || ('插件 ' + (i + 1)) }}</span>
                                <van-switch v-model="pl.enabled" size="16px" @click.stop />
                            </div>
                            <div class="pd-item-meta">{{ pl.description || '无描述' }}</div>
                            <div class="pd-item-ops">
                                <van-button size="mini" plain type="primary" @click="editPlugin(i)">编辑</van-button>
                                <van-button size="mini" plain type="danger" @click="removePlugin(i)">删除</van-button>
                            </div>
                        </div>
                        <van-button block plain type="primary" size="small" style="margin-top: 10px" @click="addPlugin">＋ 新增插件</van-button>
                    </div>
                </van-tab>
            </van-tabs>
        </template>

        <!-- JSON 源码编辑(保留原深度编辑能力) -->
        <van-popup v-model:show="showJsonEditor" position="bottom" round class="pd-json-popup">
            <div class="pd-json-head">
                <span class="pd-json-title">✏️ JSON 源码编辑</span>
                <van-icon name="cross" size="18" @click="showJsonEditor = false" />
            </div>
            <textarea v-model="jsonDraft" class="pd-json" spellcheck="false" />
            <div class="pd-json-actions">
                <van-button size="small" plain @click="showJsonEditor = false">取消</van-button>
                <van-button size="small" type="primary" @click="applyJsonDraft">应用</van-button>
            </div>
        </van-popup>

        <!-- 正则/插件编辑弹窗(简易表单) -->
        <van-dialog v-model:show="showItemEdit" :title="itemEditTitle" show-cancel-button :before-close="onItemEditClose" style="padding: 8px 0">
            <div class="pd-edit-body">
                <van-field v-model="itemEditForm.name" label="名称" placeholder="名称" />
                <van-field v-model="itemEditForm.field1" :label="itemEditLabel1" type="textarea" rows="3" autosize :placeholder="itemEditLabel1" />
                <van-field v-if="itemEditKind === 'regex'" v-model="itemEditForm.field2" :label="itemEditLabel2" type="textarea" rows="3" autosize :placeholder="itemEditLabel2" />
                <van-field v-if="itemEditKind === 'plugin'" v-model="itemEditForm.desc" label="描述" placeholder="描述" />
            </div>
        </van-dialog>
    </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { api } from '../../bridge/api';
import { isValidPresetStructure, extractRegexFromPreset, extractPluginsFromPreset } from '../useChatPresets';

const LS_EXT_PRESET_DIR = 'jsmobile-ext-preset-dir';
const SS_PRESET_DATA = 'jsmobile-preset-detail-data';

let UID = 0;
const nextUid = () => 'pd' + (++UID);

export default {
    name: 'PresetDetailView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const preset = ref(null);
        const loading = ref(true);
        const dirty = ref(false);
        const activeTab = ref('prompts');
        const promptOpen = ref([]);
        const showJsonEditor = ref(false);
        const jsonDraft = ref('');
        // 条目编辑弹窗
        const showItemEdit = ref(false);
        const itemEditKind = ref('regex'); // 'regex' | 'plugin'
        const itemEditIndex = ref(-1);
        const itemEditTitle = ref('');
        const itemEditLabel1 = ref('');
        const itemEditLabel2 = ref('');
        const itemEditForm = reactive({ name: '', field1: '', field2: '', desc: '' });

        const presetName = computed(() => {
            if (!preset.value) return '预设详情';
            return (preset.value.data && preset.value.data.name) || preset.value.name || '未命名预设';
        });

        // 提示词条目:加载后已预处理(_uid/enabled 默认值),此处纯读取(不在 computed 内变异响应式数据)
        const editablePrompts = computed(() => {
            const d = preset.value && preset.value.data;
            return (d && Array.isArray(d.prompts)) ? d.prompts : [];
        });
        // 🚀 正则/插件双位置读取:酒馆预设的 regex_scripts 在「顶层 extensions」;
        //   兼容 data.extensions 形态的卡内预设(与 extractRegexFromPreset 语义对齐)
        function presetExt(presetObj) {
            const d = presetObj && presetObj.data;
            if (!d) return {};
            return d.extensions || (d.data && d.data.extensions) || {};
        }
        const editableRegex = computed(() => {
            const ext = presetExt(preset.value);
            return Array.isArray(ext.regex_scripts) ? ext.regex_scripts : [];
        });
        const editablePlugins = computed(() => {
            const ext = presetExt(preset.value);
            return Array.isArray(ext.plugins) ? ext.plugins : [];
        });

        /** 加载后预处理:补临时 _uid(折叠 key)与缺失的默认值(在 setup 阶段执行,避免 computed 内变异) */
        function prepareEditable() {
            const d = preset.value && preset.value.data;
            if (!d) return;
            if (!d.extensions) d.extensions = {};
            if (!Array.isArray(d.extensions.regex_scripts)) d.extensions.regex_scripts = [];
            if (!Array.isArray(d.extensions.plugins)) d.extensions.plugins = [];
            if (!Array.isArray(d.prompts)) d.prompts = [];
            d.prompts.forEach((p) => {
                if (!p._uid) p._uid = nextUid();
                if (p.enabled === undefined) p.enabled = true;
            });
            d.extensions.regex_scripts.forEach((r) => {
                if (!r._uid) r._uid = nextUid();
                if (!r.scriptName) r.scriptName = r.script_name || '未命名正则';
                if (!r.findRegex) r.findRegex = r.find_regex || '';
                if (!r.replaceString) r.replaceString = r.replace_string || '';
            });
            d.extensions.plugins.forEach((pl) => {
                if (!pl._uid) pl._uid = nextUid();
                if (!pl.name) pl.name = '未命名插件';
                if (pl.enabled === undefined) pl.enabled = true;
            });
        }

        function shortText(s, n) {
            const t = String(s || '');
            return t.length > n ? t.slice(0, n) + '…' : (t || '(空)');
        }
        function markDirty() { dirty.value = true; }

        // ---------- 提示词 ----------
        function addPrompt() {
            const d = preset.value && preset.value.data;
            if (!d || !Array.isArray(d.prompts)) d.prompts = [];
            const p = { identifier: 'p_' + Date.now().toString(36), name: '新提示词', role: 'system', content: '', enabled: true, _uid: nextUid() };
            d.prompts.push(p);
            promptOpen.value = [p._uid];
            markDirty();
        }
        function removePrompt(i) {
            const d = preset.value && preset.value.data;
            if (!d || !Array.isArray(d.prompts)) return;
            d.prompts.splice(i, 1);
            markDirty();
        }

        // ---------- 正则 ----------
        function addRegex() { openItemEdit('regex', -1); }
        function editRegex(i) { openItemEdit('regex', i); }
        function removeRegex(i) {
            const ext = preset.value.data.extensions || {};
            if (Array.isArray(ext.regex_scripts)) ext.regex_scripts.splice(i, 1);
            markDirty();
        }

        // ---------- 插件 ----------
        function addPlugin() { openItemEdit('plugin', -1); }
        function editPlugin(i) { openItemEdit('plugin', i); }
        function removePlugin(i) {
            const ext = preset.value.data.extensions || {};
            if (Array.isArray(ext.plugins)) ext.plugins.splice(i, 1);
            markDirty();
        }

        function openItemEdit(kind, idx) {
            itemEditKind.value = kind;
            itemEditIndex.value = idx;
            const ext = preset.value.data.extensions || {};
            if (kind === 'regex') {
                itemEditTitle.value = idx >= 0 ? '编辑正则' : '新增正则';
                itemEditLabel1.value = '匹配式 findRegex';
                itemEditLabel2.value = '替换串 replaceString';
                const list = Array.isArray(ext.regex_scripts) ? ext.regex_scripts : [];
                const cur = idx >= 0 ? list[idx] : null;
                itemEditForm.name = cur ? (cur.scriptName || '') : '';
                itemEditForm.field1 = cur ? (cur.findRegex || cur.find_regex || '') : '';
                itemEditForm.field2 = cur ? (cur.replaceString || cur.replace_string || '') : '';
            } else {
                itemEditTitle.value = idx >= 0 ? '编辑插件' : '新增插件';
                itemEditLabel1.value = '系统提示词(每行一条)';
                itemEditLabel2.value = '';
                const list = Array.isArray(ext.plugins) ? ext.plugins : [];
                const cur = idx >= 0 ? list[idx] : null;
                itemEditForm.name = cur ? (cur.name || '') : '';
                itemEditForm.field1 = cur ? (Array.isArray(cur.systemPrompts) ? cur.systemPrompts.join('\n') : '') : '';
                itemEditForm.desc = cur ? (cur.description || '') : '';
            }
            showItemEdit.value = true;
        }
        function onItemEditClose(action) {
            if (action !== 'confirm') { showItemEdit.value = false; return; }
            const ext = preset.value.data.extensions || (preset.value.data.extensions = {});
            if (itemEditKind.value === 'regex') {
                if (!Array.isArray(ext.regex_scripts)) ext.regex_scripts = [];
                const list = ext.regex_scripts;
                const base = itemEditIndex.value >= 0 ? list[itemEditIndex.value] : null;
                if (base) {
                    base.scriptName = itemEditForm.name || base.scriptName;
                    base.findRegex = itemEditForm.field1;
                    base.replaceString = itemEditForm.field2;
                } else {
                    list.push({
                        scriptName: itemEditForm.name || '未命名正则',
                        findRegex: itemEditForm.field1,
                        replaceString: itemEditForm.field2,
                        placement: [2, 1],
                        _uid: nextUid()
                    });
                }
            } else {
                if (!Array.isArray(ext.plugins)) ext.plugins = [];
                const list = ext.plugins;
                const base = itemEditIndex.value >= 0 ? list[itemEditIndex.value] : null;
                if (base) {
                    base.name = itemEditForm.name || base.name;
                    base.description = itemEditForm.desc;
                    base.systemPrompts = String(itemEditForm.field1 || '').split('\n').map((s) => s.trim()).filter(Boolean);
                } else {
                    list.push({
                        name: itemEditForm.name || '未命名插件',
                        description: itemEditForm.desc || '',
                        enabled: true,
                        systemPrompts: String(itemEditForm.field1 || '').split('\n').map((s) => s.trim()).filter(Boolean),
                        macros: {},
                        regexScripts: [],
                        worldbookTriggers: [],
                        _uid: nextUid()
                    });
                }
            }
            showItemEdit.value = false;
            markDirty();
        }

        // ---------- JSON 源码 ----------
        function openJsonEditor() {
            jsonDraft.value = JSON.stringify(preset.value.data, null, 2);
            showJsonEditor.value = true;
        }
        function applyJsonDraft() {
            try {
                const obj = JSON.parse(jsonDraft.value);
                if (!obj || typeof obj !== 'object') throw new Error('需为 JSON 对象');
                preset.value.data = obj;
                showJsonEditor.value = false;
                markDirty();
                showSuccessToast('已应用');
            } catch (e) {
                showToast('JSON 解析失败: ' + (e.message || e));
            }
        }

        // ---------- 保存 ----------
        async function save() {
            if (!preset.value) return;
            // 剥离临时 _uid(不写入文件)
            const data = JSON.parse(JSON.stringify(preset.value.data, (k, v) => (k === '_uid' ? undefined : v)));
            const res = await api.saveExternalPreset({ treeUri: preset.value.treeUri, rel: preset.value.rel, data });
            if (res && res.success) {
                dirty.value = false;
                showSuccessToast('已保存');
            } else {
                showToast((res && res.error) || '保存失败');
            }
        }

        // ---------- 加载 ----------
        async function load() {
            loading.value = true;
            const target = String(route.query.p || '');
            try {
                // ① sessionStorage 快传(列表页写入的扫描结果)
                const ss = sessionStorage.getItem(SS_PRESET_DATA);
                if (ss) {
                    const arr = JSON.parse(ss);
                    const hit = arr.find((x) => (x.path === target) || (x.rel === target) || (x.name === target));
                    if (hit) { preset.value = hit; prepareEditable(); loading.value = false; return; }
                }
                // ② 回退:重扫外部目录
                const cfg = JSON.parse(localStorage.getItem(LS_EXT_PRESET_DIR) || 'null');
                if (cfg && cfg.uri) {
                    const res = await api.scanExternalPresets(cfg.uri);
                    const list = res.presets || [];
                    const hit = list.find((x) => (x.path === target) || (x.rel === target) || (x.name === target));
                    if (hit) { preset.value = hit; prepareEditable(); }
                }
            } catch (e) {
                console.error('[PresetDetail] 加载失败', e);
            } finally {
                loading.value = false;
            }
        }

        onMounted(load);
        return {
            preset, presetName, loading, dirty, activeTab, promptOpen,
            editablePrompts, editableRegex, editablePlugins,
            addPrompt, removePrompt, addRegex, editRegex, removeRegex, addPlugin, editPlugin, removePlugin,
            shortText, showJsonEditor, jsonDraft, openJsonEditor, applyJsonDraft,
            showItemEdit, itemEditTitle, itemEditLabel1, itemEditLabel2, itemEditForm, onItemEditClose,
            save
        };
    }
};
</script>

<style scoped>
/* 🚀 滚动修复:完整高度链(页面→tabs→content),长列表(204 条提示词/26 条正则)必须可滚动 */
.pd-page { display: flex; flex-direction: column; height: 100vh; min-height: 0; background: var(--van-background-2, #f7f8fa); }
.pd-loading { padding: 80px 0; text-align: center; }
.pd-tabs { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.pd-tabs :deep(.van-tabs) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.pd-tabs :deep(.van-tabs__content) { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.pd-tabs :deep(.van-tab__panel) { height: auto; }
.pd-body { padding: 10px 12px 24px; }
.pd-tip { font-size: 12px; color: var(--van-gray-5, #969799); padding: 4px 4px 10px; }
.pd-p-name { margin-right: 8px; font-size: 14px; font-weight: 600; }
.pd-p-switch { margin-left: auto; }
.pd-p-content :deep(textarea) { min-height: 120px; }
.pd-p-ops { display: flex; justify-content: flex-end; padding: 6px 0 2px; }
.pd-item {
    background: var(--van-background, #fff);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
}
.pd-item-head { display: flex; align-items: center; gap: 8px; }
.pd-item-name { flex: 1; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-item-meta { font-size: 12px; color: var(--van-gray-5, #969799); margin: 6px 0; word-break: break-all; }
.pd-item-ops { display: flex; gap: 8px; justify-content: flex-end; }
.pd-json-popup { height: 75vh; display: flex; flex-direction: column; }
.pd-json-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px; }
.pd-json-title { font-size: 15px; font-weight: 600; }
.pd-json { flex: 1; width: 100%; border: 0; padding: 10px 16px; font-size: 12px; font-family: monospace; resize: none; background: transparent; }
.pd-json-actions { display: flex; gap: 10px; justify-content: flex-end; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.pd-edit-body { padding: 8px 16px 4px; }
</style>
