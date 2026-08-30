<!--
  PresetsView 移动端预设管理页（对齐桌面 v2.1.0 usePresets 引擎）
  预设 = 酒馆 OpenAI Settings / Presets 目录 JSON（prompts/prompt_order/temperature 等）
  复用外部世界书目录 SAF 桥接（pickExternalWbDir/scanExternalPresets/saveExternalPreset/...）
  支持：选目录扫描、搜索、重命名、复制副本、删除、JSON 深度编辑、导出
-->
<template>
    <div class="presets-view">
        <!-- 顶部 -->
        <van-nav-bar :title="title" left-arrow @click-left="$router.back()" />

        <div class="pv-body">
            <!-- 未授权 / 空目录 -->
            <van-empty v-if="!treeUri" description="选择酒馆 Presets 目录后可管理预设">
                <van-button type="primary" round class="pv-btn" @click="pickDir">
                    <van-icon name="folder-o" /> 选择预设目录
                </van-button>
                <div class="pv-tip">预设 = OpenAI Settings / Presets 目录下的 JSON 文件</div>
            </van-empty>

            <template v-else>
                <!-- 目录操作 -->
                <div class="pv-toolbar">
                    <van-button size="small" icon="replay" plain @click="scan">重新扫描</van-button>
                    <van-button size="small" icon="plus" type="primary" plain @click="createPreset">新建预设</van-button>
                    <van-button size="small" icon="folder-o" plain @click="pickDir">更换目录</van-button>
                    <span class="pv-count">{{ filtered.length }} 个</span>
                </div>

                <!-- 搜索 -->
                <van-search v-model="q" placeholder="搜索预设名称" shape="round" />

                <van-loading v-if="loading" class="pv-loading" size="28">扫描预设…</van-loading>

                <!-- 列表 -->
                <div v-else-if="filtered.length" class="pv-list">
                    <div v-for="p in filtered" :key="p.path" class="pv-card" @click="openEditor(p)">
                        <div class="pv-card-main">
                            <div class="pv-name">{{ pName(p) }}</div>
                            <div class="pv-meta">
                                {{ pMeta(p) }}
                                <van-tag v-if="p.external" size="mini" plain type="primary">外部目录</van-tag>
                            </div>
                        </div>
                        <div class="pv-actions" @click.stop>
                            <van-icon name="edit" size="18" @click="openEditor(p)" />
                            <van-icon name="duplicate-o" size="18" @click="duplicate(p)" />
                            <van-icon name="delete-o" size="18" @click="remove(p)" />
                        </div>
                    </div>
                </div>
                <van-empty v-else description="该目录未发现有效预设（含 prompts/prompt_order/temperature 的 JSON）" />
            </template>
        </div>

        <!-- JSON 编辑器弹窗 -->
        <van-popup :show="showEditor" position="bottom" round class="pv-editor-popup" @update:show="(v) => !v && (showEditor = false)">
            <div class="pv-editor-head">
                <span class="pv-editor-title">✏️ {{ edName }} <span class="pv-editor-sub">(JSON 编辑)</span></span>
                <van-icon name="cross" size="18" @click="showEditor = false" />
            </div>
            <textarea v-model="edJson" class="pv-json" spellcheck="false" />
            <div class="pv-editor-actions">
                <van-button size="small" plain @click="showEditor = false">取消</van-button>
                <van-button size="small" type="primary" :loading="saving" @click="saveEditor">保存</van-button>
            </div>
            <div v-if="edError" class="pv-editor-error">{{ edError }}</div>
        </van-popup>
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import { api } from '../../bridge/api';

const LS_EXT_PRESET_DIR = 'jsmobile-ext-preset-dir'; // { uri, title }

export default {
    name: 'PresetsView',
    setup() {
        const title = ref('⚙️ 预设管理');
        const treeUri = ref('');
        const treeTitle = ref('');
        const q = ref('');
        const loading = ref(false);
        const presets = ref([]);
        const showEditor = ref(false);
        const edName = ref('');
        const edJson = ref('');
        const edTarget = ref(null); // { treeUri, rel }
        const saving = ref(false);
        const edError = ref('');

        const filtered = computed(() => {
            const kw = q.value.trim().toLowerCase();
            if (!kw) return presets.value;
            return presets.value.filter((p) => (p.name || '').toLowerCase().includes(kw));
        });

        function pName(p) {
            return (p.data && p.data.name) || p.name || '未命名预设';
        }
        function pMeta(p) {
            const d = p.data || {};
            const prompts = Array.isArray(d.prompts) ? d.prompts.length : (d.prompts ? Object.keys(d.prompts).length : 0);
            const t = d.temperature !== undefined ? ` · temp ${d.temperature}` : '';
            return `${prompts} 条提示词${t}`;
        }

        function saveMemory() {
            try { localStorage.setItem(LS_EXT_PRESET_DIR, JSON.stringify({ uri: treeUri.value, title: treeTitle.value })); } catch (e) { /* 忽略 */ }
        }

        async function pickDir() {
            const res = await api.pickExternalWbDir();
            if (res && res.success && res.uri) {
                treeUri.value = res.uri;
                treeTitle.value = res.title || '';
                saveMemory();
                title.value = '⚙️ 预设管理 · ' + (res.title || '');
                await scan();
            } else if (res && res.error) {
                showToast(res.error);
            }
        }

        async function scan() {
            if (!treeUri.value) return;
            loading.value = true;
            try {
                const res = await api.scanExternalPresets(treeUri.value);
                presets.value = res.presets || [];
                if (res.title) {
                    treeTitle.value = res.title;
                    title.value = '⚙️ 预设管理 · ' + res.title;
                    saveMemory();
                }
                if (res.error) showToast(res.error);
            } catch (e) {
                showToast('扫描失败: ' + (e.message || e));
            } finally {
                loading.value = false;
            }
        }

        function openEditor(p) {
            edName.value = pName(p);
            try {
                edJson.value = JSON.stringify(p.data, null, 2);
                edTarget.value = { treeUri: p.treeUri, rel: p.rel };
                edError.value = '';
                showEditor.value = true;
            } catch (e) {
                showToast('解析失败: ' + (e.message || e));
            }
        }

        async function saveEditor() {
            let data;
            try {
                data = JSON.parse(edJson.value);
            } catch (e) {
                edError.value = 'JSON 格式错误: ' + e.message;
                return;
            }
            saving.value = true;
            edError.value = '';
            try {
                const res = await api.saveExternalPreset({ treeUri: edTarget.value.treeUri, rel: edTarget.value.rel, data });
                if (res && res.success) {
                    showSuccessToast('已保存');
                    showEditor.value = false;
                    await scan();
                } else {
                    edError.value = (res && res.error) || '保存失败';
                }
            } catch (e) {
                edError.value = '保存失败: ' + (e.message || e);
            } finally {
                saving.value = false;
            }
        }

        async function duplicate(p) {
            const newName = await promptName('复制副本名称', (pName(p) || '预设') + '_副本');
            if (!newName) return;
            try {
                const base = newName.replace(/\.json$/i, '');
                const safeName = base.replace(/[\\/:*?"<>|]/g, '_') + '.json';
                const res = await api.createExternalPreset({ treeUri: p.treeUri, rel: safeName, data: JSON.parse(JSON.stringify(p.data)) });
                if (res && res.success) {
                    showSuccessToast('已创建副本');
                    await scan();
                } else {
                    showToast((res && res.error) || '复制失败');
                }
            } catch (e) {
                showToast('复制失败: ' + (e.message || e));
            }
        }

        async function createPreset() {
            const name = await promptName('新建预设名称', 'new_preset');
            if (!name) return;
            const safeName = name.replace(/\.json$/i, '').replace(/[\\/:*?"<>|]/g, '_') + '.json';
            const defaultData = {
                name,
                prompts: [{ identifier: 'main', role: 'system', content: '', extensions: {} }],
                prompt_order: [0],
                temperature: 0.9,
                max_tokens: 500,
                max_context: 4096
            };
            try {
                const res = await api.createExternalPreset({ treeUri: treeUri.value, rel: safeName, data: defaultData });
                if (res && res.success) {
                    showSuccessToast('已创建');
                    await scan();
                } else {
                    showToast((res && res.error) || '创建失败');
                }
            } catch (e) {
                showToast('创建失败: ' + (e.message || e));
            }
        }

        async function remove(p) {
            const ok = await showConfirmDialog({
                title: '删除预设',
                message: `确认将「${pName(p)}」移入回收站/删除？此操作不可撤销。`
            }).catch(() => false);
            if (!ok) return;
            try {
                const res = await api.deleteExternalPreset({ treeUri: p.treeUri, rel: p.rel });
                if (res && res.success) {
                    showSuccessToast('已删除');
                    await scan();
                } else {
                    showToast((res && res.error) || '删除失败');
                }
            } catch (e) {
                showToast('删除失败: ' + (e.message || e));
            }
        }

        /** 简易名称输入弹窗（WebView 原生 prompt，返回 null 表示取消） */
        function promptName(label, def) {
            if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
                return Promise.resolve(window.prompt(label, def || ''));
            }
            return Promise.resolve(def || '');
        }

        onMounted(async () => {
            try {
                const s = JSON.parse(localStorage.getItem(LS_EXT_PRESET_DIR) || '{}');
                if (s && s.uri) {
                    treeUri.value = s.uri;
                    treeTitle.value = s.title || '';
                    title.value = '⚙️ 预设管理 · ' + (s.title || '');
                    await scan();
                }
            } catch (e) { /* 忽略 */ }
        });

        return {
            title, treeUri, q, loading, filtered, presets, showEditor, edName, edJson, saving, edError,
            pickDir, scan, openEditor, saveEditor, duplicate, createPreset, remove, pName, pMeta
        };
    }
};
</script>

<style scoped>
.presets-view { display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: var(--van-background, #f7f8fa); }
.pv-body { flex: 1; overflow-y: auto; }
.pv-btn { width: 200px; margin-top: 8px; }
.pv-tip { margin-top: 12px; font-size: 12px; color: var(--van-gray-6, #969799); }
.pv-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px 4px; flex-wrap: wrap; }
.pv-count { margin-left: auto; font-size: 12px; color: var(--van-gray-6, #969799); }
.pv-loading { padding: 48px 0; text-align: center; }
.pv-list { padding: 4px 12px 20px; display: flex; flex-direction: column; gap: 8px; }
.pv-card {
    display: flex; align-items: center; gap: 8px;
    background: var(--van-background-2, #fff);
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px; padding: 12px;
}
.pv-card-main { flex: 1; min-width: 0; }
.pv-name { font-size: 14px; font-weight: 600; color: var(--van-text-color, #323233); }
.pv-meta { margin-top: 3px; font-size: 11px; color: var(--van-gray-6, #969799); display: flex; align-items: center; gap: 6px; }
.pv-actions { display: flex; gap: 14px; color: var(--van-gray-6, #969799); }
.pv-editor-popup { height: 80vh; display: flex; flex-direction: column; }
.pv-editor-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px; border-bottom: 1px solid var(--van-gray-3, #ebedf0); }
.pv-editor-title { font-size: 15px; font-weight: 600; }
.pv-editor-sub { font-size: 11px; color: var(--van-gray-6, #969799); font-weight: 400; }
.pv-json {
    flex: 1; margin: 10px 14px; padding: 10px;
    border: 1px solid var(--van-gray-3, #ebedf0); border-radius: 8px;
    font-family: monospace; font-size: 12px; line-height: 1.5;
    background: var(--van-background-2, #fff); color: var(--van-text-color, #323233);
    resize: none;
}
.pv-editor-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 0 14px 14px; }
.pv-editor-error { padding: 0 14px 12px; color: #ee0a24; font-size: 12px; }
</style>
