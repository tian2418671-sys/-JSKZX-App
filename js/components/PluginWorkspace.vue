<!--
  PluginWorkspace 插件工作区（右侧面板，appMode === 'plugins' 时显示）
  📄 代码 / ✨ 效果 双选项卡：
    - 「代码」：展示插件源码（散落脚本/酒馆助手直出 content；扩展工程展示文件树 + 源码查看器）
    - 「效果」：在沙箱 iframe 内模拟酒馆运行环境，运行插件脚本，渲染悬浮球/按钮/面板
  ⚠️ 所有共享状态/方法经 inject('appCtx') 从 App.vue 获取
-->
<template>
    <div v-show="appMode === 'plugins'" class="flex-1 flex flex-col h-full overflow-hidden relative bg-zinc-950">

        <!-- 空状态 -->
        <div v-if="!activePlugin" class="flex-1 flex items-center justify-center text-zinc-500 flex-col gap-4">
            <div class="w-20 h-20 rounded-2xl flex items-center justify-center bg-violet-500/10 border border-violet-500/20 shadow-inner">
                <span class="text-4xl opacity-70">🧩</span>
            </div>
            <div class="text-center">
                <p class="text-sm tracking-widest text-zinc-300">请在左侧选择一个插件查看</p>
                <p class="text-[11px] text-zinc-600 mt-1">支持酒馆助手脚本 / 用户脚本 / 命令 / 扩展工程</p>
            </div>
        </div>

        <template v-else>
            <!-- 顶部控制栏 -->
            <div class="px-4 py-3 border-b border-zinc-800 bg-zinc-900/90 shrink-0 shadow-sm">
                <div class="flex items-center justify-between gap-3 min-w-0">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/15 border border-violet-500/30 text-lg shrink-0">🧩</div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 min-w-0">
                                <h2 class="text-sm font-bold text-zinc-100 truncate">{{ activePlugin.name }}</h2>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 shrink-0">{{ pluginKindLabel(activePlugin) }}</span>
                            </div>
                            <p class="text-[10px] text-zinc-500 truncate mt-0.5" :title="activePlugin.source?.origin">{{ activePlugin.source?.origin || '未落盘' }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button @click="openPluginInFolder(activePlugin)" class="px-2.5 py-1.5 theme-element hover:border-violet-500/60 border rounded-lg text-[11px] transition" title="在资源管理器中定位插件">📂 定位</button>
                        <button @click="deletePlugin(activePlugin)" class="px-2.5 py-1.5 theme-element hover:border-rose-500/60 border rounded-lg text-[11px] text-rose-300 transition" title="移入回收站">🗑️ 删除</button>
                    </div>
                </div>
            </div>

            <!-- 📄 / ✨ 双选项卡 -->
            <div class="flex items-center gap-1 px-4 pt-2.5 shrink-0">
                <button @click="switchTab('code')"
                        :class="pluginTab === 'code' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-200'"
                        class="px-3 py-1.5 rounded-t-md text-[11px] font-medium transition">
                    📄 代码
                </button>
                <button @click="switchTab('effect')"
                        :class="pluginTab === 'effect' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-200'"
                        class="px-3 py-1.5 rounded-t-md text-[11px] font-medium transition">
                    ✨ 效果
                </button>
                <span class="ml-auto text-[10px] text-zinc-600 pr-1">{{ pluginKindHint(activePlugin) }}</span>
            </div>

            <!-- 📄 代码页 -->
            <div v-show="pluginTab === 'code'" class="flex-1 flex overflow-hidden min-h-0">
                <!-- 扩展工程：文件树 + 源码查看器 -->
                <template v-if="activePlugin.kind === 'extension'">
                    <aside class="w-52 shrink-0 border-r border-zinc-800 bg-zinc-900/60 overflow-y-auto custom-scrollbar">
                        <div class="px-3 py-2 text-[10px] font-bold text-zinc-500 border-b border-zinc-800">📦 文件树 ({{ relativeFiles.length }})</div>
                        <div v-for="f in relativeFiles" :key="f.abs"
                             @click="selectFile(f)"
                             :class="selectedFile && selectedFile.abs === f.abs ? 'bg-violet-600/20 text-violet-200 border-violet-500/40' : 'text-zinc-400 hover:bg-zinc-800 border-transparent'"
                             class="px-3 py-1.5 text-[11px] font-mono cursor-pointer border-l-2 transition truncate"
                             :title="f.rel">
                            {{ f.icon }} {{ f.rel }}
                        </div>
                    </aside>
                    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                        <div class="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[10px] text-zinc-500 font-mono shrink-0 truncate">{{ selectedFile ? selectedFile.abs : '选择左侧文件查看源码' }}</div>
                        <textarea v-if="selectedFile" :value="selectedSource" readonly
                                  class="flex-1 w-full resize-none bg-zinc-900/40 p-4 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none custom-scrollbar"
                                  spellcheck="false"></textarea>
                        <div v-else class="flex-1 flex items-center justify-center text-zinc-600 text-xs">← 选择文件查看源码</div>
                    </div>
                </template>
                <!-- 散落脚本 / 酒馆助手：直出 content -->
                <div v-else class="flex-1 overflow-y-auto custom-scrollbar p-4">
                    <div v-for="(s, i) in (activePlugin.scripts || [])" :key="i" class="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden mb-4">
                        <div class="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                            <span class="text-[11px] font-mono text-zinc-400 truncate">{{ s.file }}</span>
                            <span class="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{{ scriptKindLabel(s.kind) }}</span>
                        </div>
                        <textarea :value="s.content" readonly
                                  class="w-full min-h-[420px] resize-y bg-zinc-950/60 p-4 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none custom-scrollbar"
                                  spellcheck="false"></textarea>
                    </div>
                </div>
            </div>

            <!-- ✨ 效果页 -->
            <div v-show="pluginTab === 'effect'" class="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-zinc-800">
                <div class="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
                    <span class="text-[10px] text-zinc-500">酒馆运行模拟（沙箱隔离）· 脚本注入的悬浮球/按钮/面板将在此渲染</span>
                    <button @click="buildPreview" class="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold rounded transition">🔄 {{ previewState.loading ? '加载中…' : '重新渲染' }}</button>
                </div>
                <div class="flex-1 relative bg-[#18181b]">
                    <div v-if="previewState.loading" class="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">⏳ 正在读取插件资源…</div>
                    <iframe v-else-if="previewState.html" :srcdoc="previewState.html" sandbox="allow-scripts" class="w-full h-full border-0" title="插件效果预览"></iframe>
                    <div v-else class="absolute inset-0 flex items-center justify-center text-rose-400 text-xs px-6 text-center">{{ previewState.error || '无法预览：插件无可运行脚本。' }}</div>
                </div>
            </div>
        </template>
    </div>
</template>

<script>
import { inject, ref, computed, watch } from 'vue';
import { resolvePreviewAssets } from '../utils/pluginScanner.js';
import { buildPluginPreviewHtml } from '../plugins/hostStub.js';

export default {
    name: 'PluginWorkspace',
    setup() {
        const ctx = inject('appCtx');
        const activePlugin = ctx.activePlugin;
        const appMode = ctx.appMode;

        // 工作区选项卡 / 选中文件 / 文件源码 —— 提升为共享状态（App.vue），
        // 使侧边栏树状子条目点击后能直接定位到代码页对应文件。
        const pluginTab = ctx.pluginTab;
        const selectedFile = ctx.pluginSelectedFile;
        const selectedSource = ctx.pluginSelectedSource;
        const previewState = ref({ html: null, error: null, loading: false });

        // 类型徽标文案（与侧边栏一致）
        const pluginKindLabel = (p) => {
            if (!p) return '';
            if (p.kind === 'extension') return '扩展工程';
            if (p.kind === 'slash') return '命令';
            if (p.kind === 'userscript') return '用户脚本';
            return '酒馆助手';
        };
        // 顶部右侧提示
        const pluginKindHint = (p) => {
            if (!p) return '';
            if (p.kind === 'extension') return '扩展工程 · bundle 整包加载';
            if (p.scriptKind === 'B') return 'userscript 头 · jQuery 注入';
            if (p.scriptKind === 'C') return 'SlashRunner 命令 · 依赖 JS-Slash-Runner';
            return 'jQuery 注入脚本';
        };
        const scriptKindLabel = (k) => ({ A: 'jQuery 注入', B: 'userscript', C: '命令', bundle: 'bundle' })[k] || k;

        // 扩展工程文件树：绝对路径 → 相对路径 + 图标
        const relativeFiles = computed(() => {
            const p = activePlugin.value;
            if (!p || p.kind !== 'extension') return [];
            const root = (p.source && p.source.origin) || '';
            return (p.files || []).map(abs => {
                let rel = abs;
                if (root && abs.startsWith(root)) rel = abs.slice(root.length).replace(/^[/\\]+/, '');
                const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
                const icon = ext === 'js' || ext === 'mjs' ? '🟨' : ext === 'css' ? '🎨' : ext === 'json' ? '📄' : ext === 'html' ? '🌐' : '📃';
                return { abs, rel, icon };
            }).sort((a, b) => a.rel.localeCompare(b.rel));
        });

        const selectFile = async (f) => {
            selectedFile.value = f;
            selectedSource.value = '读取中…';
            try {
                const res = await window.electronAPI.readPluginFile(f.abs);
                selectedSource.value = res && res.success ? res.data : ((res && res.error) || '读取失败');
            } catch (e) {
                selectedSource.value = '读取失败: ' + e.message;
            }
        };

        // 切换选项卡：切到「效果」时自动构建预览
        const switchTab = (tab) => {
            pluginTab.value = tab;
            if (tab === 'effect' && !previewState.value.html) buildPreview();
        };

        // 构建效果预览：非扩展内联 content；扩展读取 bundle js/css 后整包注入
        const buildPreview = async () => {
            const p = activePlugin.value;
            if (!p) return;
            previewState.value = { html: null, error: null, loading: true };
            try {
                let html = '';
                if (p.kind === 'extension') {
                    const assets = resolvePreviewAssets(p);
                    const bundleJs = [];
                    const bundleCss = [];
                    // 🧩 扩展模板收集：工程内所有 .html 按相对 manifest 根的 POSIX 路径注入 __jskTemplates，
                    //    宿主 renderExtensionTemplate/Async 据此做 Handlebars 渲染（对齐酒馆 scripts/extensions/<ext>/<id>.html）。
                    const templates = {};
                    const root = (p.source && p.source.origin) || '';
                    for (const abs of (p.files || [])) {
                        const low = String(abs).toLowerCase();
                        if (!low.endsWith('.html') && !low.endsWith('.htm')) continue;
                        let rel = abs;
                        if (root && abs.startsWith(root)) rel = abs.slice(root.length).replace(/^[/\\]+/, '');
                        rel = String(rel).replace(/\\/g, '/');
                        const res = await window.electronAPI.readPluginFile(abs);
                        if (res && res.success && typeof res.data === 'string' && res.data) templates[rel] = res.data;
                    }
                    for (const f of assets.js) {
                        const res = await window.electronAPI.readPluginFile(f);
                        if (res && res.success && res.data) bundleJs.push(res.data);
                    }
                    for (const f of assets.css) {
                        const res = await window.electronAPI.readPluginFile(f);
                        if (res && res.success && res.data) bundleCss.push(res.data);
                    }
                    if (bundleJs.length === 0 && bundleCss.length === 0) {
                        throw new Error('未找到可运行的 bundle 资源（js/css）。');
                    }
                    html = buildPluginPreviewHtml(p, { bundleJs, bundleCss, templates });
                } else {
                    const hasContent = (p.scripts || []).some(s => s.content && s.content.trim());
                    if (!hasContent) throw new Error('插件没有可运行的脚本内容。');
                    html = buildPluginPreviewHtml(p);
                }
                previewState.value = { html, error: null, loading: false };
            } catch (e) {
                previewState.value = { html: null, error: e.message || '预览构建失败', loading: false };
            }
        };

        // 切换插件时重置选项卡与预览（选中文件由侧边栏子条目/代码页文件树显式管理，
        // 不在此重置，避免覆盖「侧边栏子条目点击 → 定位到代码页对应文件」的选中状态）
        watch(activePlugin, () => {
            pluginTab.value = 'code';
            previewState.value = { html: null, error: null, loading: false };
        });

        return {
            appMode,
            activePlugin,
            pluginTab,
            pluginKindLabel,
            pluginKindHint,
            scriptKindLabel,
            relativeFiles,
            selectedFile,
            selectedSource,
            selectFile,
            switchTab,
            previewState,
            buildPreview,
            openPluginInFolder: ctx.openPluginInFolder,
            deletePlugin: ctx.deletePlugin
        };
    }
};
</script>
