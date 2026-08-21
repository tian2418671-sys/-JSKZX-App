<template>
<div :style="{
        '--workspace-fs': appSettings.fontSize + 'px',
        fontFamily: appSettings.fontFamily,
        fontWeight: appSettings.fontWeight
    }" class="h-full flex flex-col text-[13px]"
         @dragenter="handleDragEnter"
         @dragleave="handleDragLeave"
         @dragover.prevent
         @drop="handleDrop">

        <!-- 拖拽导入全屏遮罩（子组件 DragOverlay） -->
        <drag-overlay :is-dragging="isDragging" />

        <!-- 启动过渡蒙版（子组件 AppLoadingOverlay） -->
        <app-loading-overlay :is-loading="isAppLoading" />
        
        <!-- ================= [ 顶部菜单栏 + 紧凑工具栏（子组件 HeaderBar） ] ================= -->
        <header-bar />

        <!-- ================= [ 主工作区 (左右分栏) ] ================= -->
        <div class="flex-1 flex overflow-hidden">
            
            <!-- 【左侧】资源管理器 + 拖拽调宽把手（子组件 SidebarPanel） -->
            <sidebar-panel />

            <!-- 【右侧】编辑器面板（子组件 EditorPanel） -->
            <editor-panel />
        </div>

        <!-- ================= [ 弹窗：单卡添加标签（子组件 SingleTagModal） ] ================= -->
        <single-tag-modal
            :show="tagModalVisible"
            :title="tagModalTitle"
            :model-value="tagInput"
            @update:model-value="tagInput = $event"
            @confirm="confirmSingleTag"
            @close="closeSingleTagModal"
        />

        <!-- ================= [ 弹窗：通用输入（子组件 PromptModal，替代 prompt） ] ================= -->
        <prompt-modal
            :show="promptModalVisible"
            :title="promptModalTitle"
            :model-value="promptInput"
            @update:model-value="promptInput = $event"
            @confirm="confirmPrompt"
            @cancel="cancelPrompt"
        />

        <!-- ================= [ 弹窗：批量标签（子组件 BatchTagModal） ] ================= -->
        <batch-tag-modal
            :show="showBatchTagModal"
            :selected-count="selectedIds.length"
            :batch-mode="batchMode"
            :batch-input-tags="batchInputTags"
            :batch-tag-chips="batchTagChips"
            :system-common-tags="systemCommonTags"
            @close="showBatchTagModal = false"
            @confirm="executeBatchTagSave"
            @update:batch-mode="batchMode = $event"
            @update:batch-input-tags="batchInputTags = $event"
            @remove-batch-tag="removeBatchTag($event)"
            @toggle-common-tag="toggleBatchCommonTag($event)"
            @remove-system-common-tag="removeTagFromGlobalPool"
        />

        <!-- ================= [ 弹窗：AI 智能批量打标（子组件 AITagModal） ] ================= -->
        <ai-tag-modal
            :show="showAITagModal"
            :selected-count="selectedIds.length"
            :system-common-tags="systemCommonTags"
            :ai-candidate-tags="aiCandidateTags"
            :new-a-i-candidate-tag="newAICandidateTag"
            :enable-a-i-extraction="enableAIExtraction"
            :custom-a-i-prompt="customAIPrompt"
            :use-jailbreak="useJailbreak"
            :jailbreak-prompt="jailbreakPrompt"
            :jailbreak-presets="jailbreakPresets"
            :system-prompt-presets="systemPromptPresets"
            :active-system-prompt-id="activeSystemPromptId"
            :api-endpoint="apiEndpoint"
            :api-key="apiKey"
            :api-model="apiModel"
            :available-models="availableModels"
            :is-fetching-models="isFetchingModels"
            :fetch-model-status="fetchModelStatus"
            :is-a-i-tagging="isAITagging"
            :ai-tagging-progress="aiTaggingProgress"
            @close="showAITagModal = false"
            @remove-ai-candidate-tag="removeAICandidateTag"
            @update:newAICandidateTag="newAICandidateTag = $event"
            @add-ai-candidate-tag-manual="addAICandidateTagManual"
            @add-ai-candidate-tag="addAICandidateTag"
            @update:enableAIExtraction="enableAIExtraction = $event"
            @update:customAIPrompt="customAIPrompt = $event"
            @update:useJailbreak="useJailbreak = $event"
            @update:jailbreakPrompt="jailbreakPrompt = $event"
            @add-system-prompt-preset="addSystemPromptPreset"
            @update:activeSystemPromptId="activeSystemPromptId = $event"
            @save-system-prompts="saveSystemPromptsToStorage"
            @delete-system-prompt-preset="deleteSystemPromptPreset"
            @fetch-available-models="fetchAvailableModels"
            @update:apiEndpoint="apiEndpoint = $event"
            @update:apiKey="apiKey = $event"
            @update:apiModel="apiModel = $event"
            @start-tagging="startAITagging"
            @remove-system-common-tag="removeTagFromGlobalPool"
        />

        <!-- ================= [ 弹窗：关系图谱（子组件 GraphModal） ] ================= -->
        <graph-modal
            :show="showGraph"
            :graph-layout-mode="graphLayoutMode"
            :isolate-current-group="isolateCurrentGroup"
            :edge-filters="edgeFilters"
            :graph-search-keyword="graphSearchKeyword"
            :min-link-weight="minLinkWeight"
            :graph-stats="graphStats"
            :building="graphBuilding"
            @update-graph-layout="updateGraphLayout"
            @update:isolateCurrentGroup="isolateCurrentGroup = $event"
            @update:graphSearchKeyword="graphSearchKeyword = $event"
            @update:minLinkWeight="minLinkWeight = $event"
            @render="renderGraph"
            @export="exportGraph"
            @close="closeGraph"
        />

        <!-- ================= [ 弹窗：全局资产中心（子组件 GlobalAssetModal） ] ================= -->
        <global-asset-modal
            :show="showGlobalAssetModal"
            :asset-tab="globalAssetTab"
            :all-worldbooks="globalAllWorldbooks"
            :all-regex-scripts="globalAllRegexScripts"
            @close="showGlobalAssetModal = false"
            @update:assetTab="globalAssetTab = $event"
        />

        <!-- ================= [ 右键快捷菜单：角色卡（子组件 ContextMenu） ] ================= -->
        <context-menu
            :visible="contextMenu.visible"
            :x="contextMenu.x"
            :y="contextMenu.y"
            :item="contextMenu.item"
            @view="openFromLibrary(contextMenu.item); closeContextMenu()"
            @open-folder="handleContextMenuAction('openFolder')"
            @duplicate="handleContextMenuAction('duplicate')"
            @move-group="quickMoveGroup(contextMenu.item); closeContextMenu()"
            @export="exportCard(contextMenu.item); closeContextMenu()"
            @ai-tag="handleContextMenuAction('aiTag')"
            @snapshots="handleContextMenuAction('snapshots')"
            @replace-image="replaceCardImage(contextMenu.item); closeContextMenu()"
            @trash="handleContextMenuAction('trash')"
        />

        <!-- ================= [ 右键快捷菜单：世界书（子组件 WbContextMenu） ] ================= -->
        <wb-context-menu
            :show="wbContextMenu.show"
            :x="wbContextMenu.x"
            :y="wbContextMenu.y"
            :wb="wbContextMenu.wb"
            @open-folder="openWbInFolder(wbContextMenu.wb); closeWbContextMenu()"
            @rename="renameWorldbook(wbContextMenu.wb); closeWbContextMenu()"
            @duplicate="duplicateWorldbook(wbContextMenu.wb); closeWbContextMenu()"
            @move-group="changeWbCategory(wbContextMenu.wb); closeWbContextMenu()"
            @delete="deleteWorldbook(wbContextMenu.wb); closeWbContextMenu()"
        />

        <!-- ================= [ 弹窗：全屏大文本阅读/编辑（子组件 TextModal） ] ================= -->
        <text-modal
            :show="showTextModal"
            :title="textModalTitle"
            :model-value="textModalContent"
            :font-size="textModalFontSize"
            @update:model-value="textModalContent = $event"
            @update:font-size="textModalFontSize = $event"
            @save="saveTextModal"
            @close="showTextModal = false"
        />

        <!-- ================= [ 弹窗：高清立绘大图预览（子组件 ImageModal） ] ================= -->
        <image-modal
            :show="showImageModal"
            :url="previewImageUrl"
            @close="showImageModal = false"
        />

        <!-- ================= [ 弹窗：历史快照列表与一键恢复（子组件 SnapshotModal） ] ================= -->
        <snapshot-modal
            :show="showSnapshotModal"
            :snapshots="snapshotList"
            :card-name="snapshotCardName"
            :card-path="snapshotCardPath"
            @close="closeSnapshotModal"
            @restore="restoreSnapshot"
            @delete="deleteSnapshot"
            @open-folder="openSnapshotFolder"
        />

        <!-- ================= [ 弹窗：API 引擎与模型设置（子组件 ApiSettingsModal） ] ================= -->
        <api-settings-modal
            :show="showApiModal"
            :api-type="apiType"
            :api-endpoint="apiEndpoint"
            :api-key="apiKey"
            :api-model="apiModel"
            :available-models="availableModels"
            :is-fetching-models="isFetchingModels"
            :fetch-model-status="fetchModelStatus"
            :tavern-local-path="appSettings.tavernLocalPath"
            @close="showApiModal = false"
            @update:apiType="apiType = $event"
            @api-type-change="handleApiTypeChange"
            @update:apiEndpoint="apiEndpoint = $event"
            @update:apiKey="apiKey = $event"
            @update:apiModel="apiModel = $event"
            @fetch-models="fetchAvailableModels"
            @rebind-path="rebindTavernPath"
            @clear-path="appSettings.tavernLocalPath = ''"
            @save="saveApiConfig"
        />

        <!-- 模型名称下拉建议（供聊天面板与设置弹窗共用；置于常驻 DOM 避免被 v-if 移除） -->
        <datalist id="model-suggestions">
            <option value="local-model">本地 LM Studio / Ollama 默认</option>
            <option value="gpt-3.5-turbo">ChatGPT 3.5 速度快</option>
            <option value="gpt-4o">ChatGPT 4o 最聪明</option>
            <option value="gpt-4o-mini">ChatGPT 4o mini 经济</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet 文本好</option>
            <option value="qwen2.5-7b-instruct">本地 Qwen 7B</option>
        </datalist>

        <!-- ================= [ 🛰️ 全盘深度检索引擎弹窗（子组件 DiskScanModal） ] ================= -->
        <disk-scan-modal
            :show="showDiskScanModal"
            :current-library-path="currentFolderPath"
            :open-library="selectFixedDirectory"
            @close="showDiskScanModal = false"
            @imported="handleScanImported"
        />

        <!-- ================= [ 🔍 智能查重与版本清洗弹窗（子组件 DedupeModal） ] ================= -->
        <dedupe-modal
            :show="showDedupeModal"
            :groups="duplicateGroups"
            @close="showDedupeModal = false"
            @open-diff="openDiffDetailModal"
            @resolve-group="resolveDedupeGroup"
        />

        <!-- ================= [ 📖 世界书智能版本对比查重弹窗（子组件 WbDedupeModal） ] ================= -->
        <wb-dedupe-modal
            :show="showWbDedupeModal"
            :groups="wbDuplicateGroups"
            @close="showWbDedupeModal = false"
            @open-diff="openDiffDetailModal"
            @resolve-group="resolveWbDedupeGroup"
        />

        <!-- ================= [ ⚖️ 数据版本差异深度比对 (Diff Inspector)（子组件 DiffModal） ] ================= -->
        <diff-modal
            :show="showDiffDetailModal"
            :master-item="diffMasterItem"
            :compare-item="diffCompareItem"
            :field-results="diffFieldResults"
            @close="showDiffDetailModal = false"
        />

    <!-- ================= [ 🌐 世界书词条逻辑关联图谱（子组件 WbGraphModal） ] ================= -->
    <wb-graph-modal
        :show="showWbGraphModal"
        :layout="wbGraphLayout"
        :search="wbGraphSearch"
        :filters="wbGraphFilters"
        :min-weight="wbGraphMinWeight"
        :stats="wbGraphStats"
        :building="wbGraphBuilding"
        @update-layout="updateWbGraphLayout"
        @update:search="wbGraphSearch = $event"
        @update:minWeight="wbGraphMinWeight = $event"
        @render="renderWbGraph"
        @export="exportWbGraph"
        @close="closeWbGraphModal"
    />

    <!-- ================= [ 🔗 多本世界书智能合并（子组件 WbMergeModal） ] ================= -->
    <wb-merge-modal
        :show="showWbMergeModal"
        :worldbooks="worldbooks"
        :selected-paths="selectedWbMergePaths"
        @close="showWbMergeModal = false"
        @update:selectedPaths="selectedWbMergePaths = $event"
        @merge="executeWorldbookMerge"
    />

    <!-- ================= [ 🔀 条目级导入合并弹窗（子组件 WbImportModal） ] ================= -->
    <wb-import-modal
        :show="showWbImportModal"
        :active-worldbook-name="(activeWorldbook && activeWorldbook.data && activeWorldbook.data.name) || '未命名'"
        :source-books="importableSourceBooks"
        :source-book="importSourceBook"
        :candidates="importCandidates"
        :selected-entries="selectedImportEntries"
        @close="showWbImportModal = false"
        @pick-source="pickImportSource"
        @update:selectedEntries="selectedImportEntries = $event"
        @confirm-import="confirmImportEntries"
    />

    <!-- ================= [ 🔎 全库词条搜索与反向引用（子组件 GlobalEntrySearchModal） ] ================= -->
    <global-entry-search-modal
        :show="showGlobalEntrySearchModal"
        v-model:query="globalEntrySearchQuery"
        :results="globalEntrySearchResults"
        :index-count="globalEntryIndex.length"
        @close="closeGlobalEntrySearch"
        @jump="jumpToEntrySource"
    />

    <!-- ================= [ 🕒 世界书快照历史与回滚（子组件 WbSnapshotModal） ] ================= -->
    <wb-snapshot-modal
        :show="showWbSnapshotModal"
        :target-name="(wbSnapshotTarget && wbSnapshotTarget.data && wbSnapshotTarget.data.name) || (wbSnapshotTarget && wbSnapshotTarget.name) || '未命名'"
        :snapshots="wbSnapshotList"
        @close="closeWbSnapshotModal"
        @restore="restoreWbSnapshot"
    />

    <!-- ================= [ 弹窗：版本更新检测（子组件 UpdateModal） ] ================= -->
    <update-modal
        :show="showUpdateModal"
        :info="updateInfo"
        :error-msg="updateErrorMsg"
        @close="showUpdateModal = false"
    />

        <!-- ================= [ 全局 Toast 消息通知（子组件 ToastContainer） ] ================= -->
        <toast-container :toasts="toasts" />

        <!-- ================= [ 批量操作悬浮控制台（可拖动：按住标题栏拖动，双击标题栏复位底部居中） ] ================= -->
        <div v-if="selectedIds.length > 0"
             class="fixed z-50 bg-gray-800/95 backdrop-blur-sm text-zinc-100 p-2.5 flex flex-col gap-1.5 shadow-2xl text-xs border border-gray-700 rounded-xl"
             :style="batchBarStyle">
            <div class="flex justify-between items-center px-1 cursor-grab select-none active:cursor-grabbing"
                 title="按住此处可随意拖动；双击复位到底部居中"
                 @mousedown="startBatchBarDrag"
                 @dblclick="resetBatchBarPos">
                <span class="font-bold text-blue-400">已勾选 {{ selectedIds.length }} 张卡片</span>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-500 select-none">⠿ 可拖动</span>
                    <button @click="clearSelection" class="text-gray-400 hover:text-zinc-100">取消选择 ✕</button>
                </div>
            </div>
            <div class="grid grid-cols-5 gap-1">
                <button @click="batchChangeCategoryModal" class="bg-gray-700 hover:bg-blue-600 py-1.5 rounded transition font-medium">📁 移分组</button>
                <button @click="showBatchTagModal = true" class="bg-gray-700 hover:bg-purple-600 py-1.5 rounded transition font-medium">🏷️ 贴标签</button>
                <button @click="openAITagModal" class="bg-gray-700 hover:bg-amber-600 py-1.5 rounded transition font-medium">🤖 AI 打标</button>
                <button @click="batchExportSelected" class="bg-gray-700 hover:bg-emerald-600 py-1.5 rounded transition font-medium">📦 导出</button>
                <button @click="batchDeleteSelected" class="bg-gray-700 hover:bg-red-600 py-1.5 rounded transition font-medium" title="将选中的卡片批量移入回收站">🗑️ 删除</button>
            </div>
        </div>

    </div>
</template>

<script>
import { ref, shallowRef, reactive, computed, watch, onMounted, onUnmounted, nextTick, triggerRef, provide, toRaw } from 'vue';
import DOMPurify from 'dompurify'; // 渲染模式 XSS 清洗（本地依赖，随 Vite 打包，离线可用）
import * as echarts from 'echarts'; // ECharts 由 npm 依赖提供（替代旧全局 script）
import Section from './Section.vue'; // SFC 单文件组件（由 Section.js 迁移）
import DragOverlay from './DragOverlay.vue'; // 拖拽导入全屏遮罩
import AppLoadingOverlay from './AppLoadingOverlay.vue'; // 启动过渡蒙版
import ToastContainer from './ToastContainer.vue'; // 全局 Toast 消息容器
import BatchTagModal from './BatchTagModal.vue'; // 批量设置标签弹窗
import PromptModal from './PromptModal.vue'; // 通用输入弹窗（替代 prompt）
import SingleTagModal from './SingleTagModal.vue'; // 单卡添加标签弹窗
import DiskScanModal from './DiskScanModal.vue'; // 磁盘扫描进度弹窗
import UpdateModal from './UpdateModal.vue'; // 版本更新检测弹窗
import TextModal from './TextModal.vue'; // 全屏大文本阅读/编辑弹窗
import ImageModal from './ImageModal.vue'; // 高清立绘大图预览弹窗
import ApiSettingsModal from './ApiSettingsModal.vue'; // API 引擎与模型设置弹窗
import GlobalAssetModal from './GlobalAssetModal.vue'; // 全局世界书与正则资产中心弹窗
import GraphModal from './GraphModal.vue'; // 角色宇宙关系图谱弹窗
import WbGraphModal from './WbGraphModal.vue'; // 世界书词条逻辑关联图谱弹窗
import DedupeModal from './DedupeModal.vue'; // 智能版本查重中心弹窗
import WbDedupeModal from './WbDedupeModal.vue'; // 世界书智能版本对比查重弹窗
import DiffModal from './DiffModal.vue'; // 数据版本差异深度比对弹窗
import WbMergeModal from './WbMergeModal.vue'; // 多本世界书智能合并弹窗
import WbImportModal from './WbImportModal.vue'; // 条目级导入合并弹窗
import GlobalEntrySearchModal from './GlobalEntrySearchModal.vue'; // 🔎 全库词条搜索弹窗
import WbSnapshotModal from './WbSnapshotModal.vue'; // 🕒 世界书快照历史弹窗
import ContextMenu from './ContextMenu.vue'; // 角色卡右键快捷菜单
import WbContextMenu from './WbContextMenu.vue'; // 世界书右键快捷菜单
import AiTagModal from './AITagModal.vue'; // AI 智能批量打标弹窗（⚠️ 注册名须用 AiTagModal，kebab 标签 ai-tag-modal 解析为 AiTagModal 而非 AITagModal）
import HeaderBar from './HeaderBar.vue'; // 顶部菜单栏 + 紧凑工具栏
import SidebarPanel from './SidebarPanel.vue'; // 左侧资源管理器（角色卡/世界书库）+ 拖拽把手
import EditorPanel from './EditorPanel.vue'; // 右侧编辑器面板（角色卡编辑 + 世界书 IDE + 日志控制台）
import SnapshotModal from './SnapshotModal.vue'; // 📸 历史快照列表与一键恢复弹窗
import { processFile, normalizeCardData, extractBookEntries } from '../utils/cardLoader.js';
import { parsePNGChunk, deepScanForJSON } from '../utils/pngParser.js';
import { estimateTokens } from '../utils/tokenEstimate.js'; // Token 估算（与 TextModal 共享）
import { useSnapshots } from '../composables/useSnapshots.js'; // 📸 历史快照功能（拆分出的组合式函数）
import { useCardGroups } from '../composables/useCardGroups.js'; // 📁 角色卡分组/分类功能（拆分出的组合式函数）
import { useDedupe } from '../composables/useDedupe.js'; // 🔍 查重与差异比对功能（拆分出的组合式函数）
import { useWorldbooks } from '../composables/useWorldbooks.js'; // 🌍 世界书库与分组功能（拆分出的组合式函数）
import { useWorldbookEntries } from '../composables/useWorldbookEntries.js'; // 📚 世界书词条深度编辑（Entry IDE）组合式函数
import { useGlobalEntrySearch } from '../composables/useGlobalEntrySearch.js'; // 🔎 全库词条搜索与反向引用组合式函数
import { useWorldbookExtras } from '../composables/useWorldbookExtras.js'; // 📤 世界书扩展：提取/JSONL导入/批量导出/快照/统计
import { useAITools } from '../composables/useAITools.js'; // ✨ AI 打标/翻译/格式升维功能（拆分出的组合式函数）
import { useTags } from '../composables/useTags.js'; // 🏷️ 标签系统（批量标签/预设标签/系统标签池/中英切换/全局标签库）组合式函数
import { useChat } from '../composables/useChat.js'; // 💬 聊天测卡（聊天历史/发送/API 设置/模型拉取）组合式函数
import { useSearch } from '../composables/useSearch.js'; // 🔎 超级搜索引擎（搜索防抖/全字段过滤/分页）组合式函数
import { useGraph } from '../composables/useGraph.js'; // 🕸️ 关系图谱（角色宇宙关系图谱生成/渲染）组合式函数
import { useDiskScan } from '../composables/useDiskScan.js'; // 💽 磁盘卡片扫描（全盘扫描/收编/刷新目录）组合式函数
import { useBatch } from '../composables/useBatch.js'; // ✅ 批量操作（多选/批量导出/批量删除/批量打标）组合式函数

/** 用户可读的错误提示映射 */
const ERROR_MESSAGES = {
    NO_CARD_DATA: '未能提取到有效的角色卡数据。这可能不是一张标准格式的 Tavern 图片卡，或者数据已损坏。',
    DEFAULT: '文件读取或解析失败，请检查文件是否损坏。'
};

// 🔎 超级搜索引擎辅助函数（extractCardSearchableText / extractCardTags）已移入 useSearch.js

// ================= 渲染进程全局错误兜底 =================
window.addEventListener('error', (event) => {
    console.error('[全局错误]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('[未处理的 Promise 拒绝]', event.reason);
});

// ================= [ 阻止 Electron 默认打开拖入的文件 ] =================
// 全局按住浏览器的默认拖拽行为，禁止它私自打开/导航到文件（纵深防御，覆盖 #app 之外的边缘区域）
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

export default {
    components: { Section, DragOverlay, AppLoadingOverlay, ToastContainer, BatchTagModal, PromptModal, SingleTagModal, DiskScanModal, UpdateModal, TextModal, ImageModal, ApiSettingsModal, GlobalAssetModal, GraphModal, WbGraphModal, DedupeModal, WbDedupeModal, DiffModal, WbMergeModal, WbImportModal, GlobalEntrySearchModal, WbSnapshotModal, ContextMenu, WbContextMenu, AiTagModal, HeaderBar, SidebarPanel, EditorPanel, SnapshotModal },
    setup() {
        // 主题状态（localStorage 在自定义协议下可能不可用，做防御性读取；默认暗夜极客）
        let savedTheme = 'dark';
        try { savedTheme = localStorage.getItem('stc-theme') || 'dark'; } catch (e) { /* 忽略 */ }
        const theme = ref(savedTheme);

        const isAppLoading = ref(true); // 应用首屏加载状态（数据就绪后淡出）

        // ================= [ 全局 Toast 消息通知系统 ] =================
        const toasts = ref([]);
        let toastIdCounter = 0;

        /**
         * 显示全局 Toast 消息（右上角自动淡入淡出，非阻塞）
         * @param {string} message - 消息内容
         * @param {string} type - 消息类型: 'success' | 'error' | 'info'
         * @param {number} duration - 显示时长(毫秒)，默认 3000
         */
        const showToast = (message, type = 'success', duration = 3000) => {
            const id = toastIdCounter++;
            toasts.value.push({ id, message, type });
            // 定时自动移除
            setTimeout(() => {
                const index = toasts.value.findIndex(t => t.id === id);
                if (index !== -1) toasts.value.splice(index, 1);
            }, duration);
        };

        // 🔧 每次批量操作创建独立进度 Toast 句柄（并发安全，不再共享单例）
        const createProgressToast = () => {
            const id = toastIdCounter++;
            toasts.value.push({ id, message: '...', type: 'info' });
            const update = (msg) => {
                const t = toasts.value.find(x => x.id === id);
                if (t) t.message = msg;
            };
            const finish = (msg, type = 'success', duration = 3000) => {
                const t = toasts.value.find(x => x.id === id);
                if (t) { t.message = msg; t.type = type; }
                setTimeout(() => {
                    const i = toasts.value.findIndex(x => x.id === id);
                    if (i !== -1) toasts.value.splice(i, 1);
                }, duration);
            };
            return { update, finish };
        };

        // =========================================================
        // 🖥️ 智能屏幕分辨率与 Windows DPI 缩放适配（防双重放大）
        // （仅对首次启动/无存档用户生效，已有存档的用户尊重其手动设置）
        // =========================================================

        // 1. 获取 DPR（设备像素比，例如 150% 缩放时 dpr 为 1.5）
        const dpr = window.devicePixelRatio || 1;

        // 2. 获取【逻辑宽度】（已被操作系统除以 DPR 的宽度，缩放交给系统负责）
        // 例如：4K 屏 (3840) 开 200% 缩放后，logicalWidth 会是 1920
        const logicalWidth = window.innerWidth || window.screen.width || 1920;

        console.debug(`[DPI] dpr=${dpr}, logicalWidth=${logicalWidth}`);

        let defaultUiFs = 13;   // 界面字号（顶部导航/侧边栏/菜单/弹窗）
        let defaultWsFs = 14;   // 工作区字号（右侧编辑区：世界书/设定/聊天气泡/RAW JSON）

        // 3. 根据「真正的可用逻辑空间」来分配字号，完美避开双重放大
        if (logicalWidth >= 2560) {
            // 只有在实体大于 4K 且缩放比例很小，或者实体是 5K/8K 时，才会进入这里
            // 此时屏幕空间极度宽广，我们才主动调大字号
            defaultUiFs = 15;
            defaultWsFs = 16;
        } else if (logicalWidth >= 1600) {
            // 涵盖标准 1080p，或是 4K 开了 200%~225% 缩放的状态
            // 让 Windows 自己做缩放，我们保持标准字号！
            defaultUiFs = 13;
            defaultWsFs = 14;
        } else {
            // 小笔记本屏幕，或 1080p 开了 150% 缩放 (逻辑宽度约 1280)
            // 稍微缩小基础字号，避免界面被挤爆
            defaultUiFs = 12;
            defaultWsFs = 13;
        }

        // 4. 从 localStorage 读取历史设置，如果没有则使用智能默认值（防御性读取，localStorage 不可用时回退默认）
        const appSettings = ref((() => {
            const defaults = {
                // 注：内部用单引号，与设置面板下拉选项的值保持一致，确保初始选中项正确
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif",
                fontSize: defaultWsFs,      // 智能分配的工作区字号
                fontWeight: 'normal',       // 可选 'normal' 或 '500' (中等加粗)
                uiFontSize: defaultUiFs     // 智能分配的界面字号
            };
            let loadedSettings = defaults;
            try {
                const saved = JSON.parse(localStorage.getItem('appSettings'));
                if (saved) {
                    // 【修复】必须解构合并，让 defaults 兜底缺失字段
                    // （旧版本存档可能没有 fontFamily/fontWeight 等新字段，直接整体覆盖会变 undefined 导致样式错乱）
                    loadedSettings = { ...defaults, ...saved };
                }
            } catch (e) { /* 忽略 */ }
            // 兼容旧存档：缺失双轨字号时补智能默认值
            if (loadedSettings.uiFontSize === undefined) loadedSettings.uiFontSize = defaultUiFs;
            if (loadedSettings.fontSize === undefined) loadedSettings.fontSize = defaultWsFs;
            return loadedSettings;
        })());

        // 监听设置变化，自动保存到本地
        watch(appSettings, (newVal) => {
            try { localStorage.setItem('appSettings', JSON.stringify(newVal)); } catch (e) { /* 忽略 */ }
        }, { deep: true });

        // ================= [ 导入数据清洗开关 ] =================
        // 开启后，导入/扫描卡片时将忽略卡片自带的原生 tags（防止他人卡片的杂乱标签混入全局标签池），
        // 仅保留自动分类结果；分类统一由自动规则或用户手动指定。
        const sanitizeImportedTags = ref((() => {
            try { return localStorage.getItem('jsTavern_sanitizeImportedTags') === '1'; } catch (e) { return false; }
        })());
        watch(sanitizeImportedTags, (v) => {
            try { localStorage.setItem('jsTavern_sanitizeImportedTags', v ? '1' : '0'); } catch (e) { /* 忽略 */ }
        });

        

        // 字体设置应用：fontFamily/fontWeight 全局生效于 body；
        // 双轨字号：--ui-fs 接管外围界面（导航/侧边栏/菜单/弹窗），--workspace-fs 接管右侧工作区
        // （Vue 不会编译挂载容器 #app 自身的 :style 绑定，故此处以 documentElement 兜底保证变量生效）
        watch(appSettings, (s) => {
            document.body.style.fontFamily = s.fontFamily;
            document.body.style.fontWeight = s.fontWeight;
            document.documentElement.style.setProperty('--ui-fs', (s.uiFontSize || 13) + 'px');
            document.documentElement.style.setProperty('--workspace-fs', (s.fontSize || 14) + 'px');
        }, { deep: true, immediate: true });

        // ================= [ 实验功能与酒馆联动 ] =================
        const showExperimentalMenu = ref(false); // 控制实验菜单的展开/收起

        // 给设置里加一个酒馆API地址的配置项 (兼容旧设置)
        if (appSettings.value.tavernUrl === undefined) {
            appSettings.value.tavernUrl = 'http://127.0.0.1:8000';
        }
        // 酒馆本地根目录（物理推送用；绑定一次即可永久免密一键推送）
        if (appSettings.value.tavernLocalPath === undefined) {
            appSettings.value.tavernLocalPath = '';
        }

        // 推送到酒馆：本地物理拷贝（直接复制卡片 PNG 到酒馆 characters 目录，无 API / CORS / 403 烦恼）
        const pushToTavern = async () => {
            showExperimentalMenu.value = false;

            if (selectedIds.value.length === 0) {
                return nativeAlert('请先在列表中勾选要推送到酒馆的角色卡！', 'warning');
            }

            // 1. 检查或请求酒馆的本地绝对路径
            let stRoot = appSettings.value.tavernLocalPath;

            // ===== 如果还没有绑定路径：先智能嗅探，再手动选择兜底 =====
            if (!stRoot) {
                // 1) 先尝试让主进程静默嗅探常见位置
                const autoDetected = await window.electronAPI.autoDetectTavernPath();
                if (autoDetected) {
                    const confirmAuto = await confirmDialog(`🎉 系统自动检测到了你的酒馆路径：\n\n${autoDetected}\n\n是否直接使用该路径？(选确定将自动永久绑定)`);
                    if (confirmAuto) {
                        stRoot = autoDetected;
                        appSettings.value.tavernLocalPath = stRoot;
                    }
                }

                // 2) 嗅探失败或用户拒绝 → 手动选择
                if (!stRoot) {
                    const confirmManual = await confirmDialog('尚未绑定 SillyTavern 本地目录，且未自动检索到。\n是否现在手动选择你的酒馆【根文件夹】？\n(选对一次即可永久免密一键推送)');
                    if (!confirmManual) return;

                    const folderPath = await window.electronAPI.selectGenericFolder();
                    if (!folderPath) return; // 用户取消选择

                    stRoot = folderPath;
                    appSettings.value.tavernLocalPath = stRoot; // 自动持久化保存
                }
            }

            // 2. 收集目标文件的真实物理路径
            const targetIds = [...selectedIds.value];
            const pathsToPush = [];
            for (const id of targetIds) {
                const item = library.value.find(c => c.id === id);
                if (item && item.path) pathsToPush.push(item.path);
            }
            if (pathsToPush.length === 0) {
                return nativeAlert('未找到选中卡片的物理文件路径，无法推送。', 'warning');
            }

            // 3. 执行系统级物理推送
            try {
                const res = await window.electronAPI.pushToSillyTavernDir(pathsToPush, stRoot);

                if (res && res.success) {
                    nativeAlert(
                        `🎉 推送完成！共 ${res.count} 张角色卡已发送至酒馆！` +
                        ((res.overwritten && res.overwritten.length > 0)
                            ? `\n其中 ${res.overwritten.length} 张同名卡已更新，旧版已存入回收站。` : '') +
                        `\n请前往酒馆刷新角色列表查看。`, 'info');
                    clearSelection();
                } else {
                    // 路径可能错误或版本不兼容，清空错误路径让用户下次重选
                    appSettings.value.tavernLocalPath = '';
                    nativeAlert(`推送失败：${(res && res.error) || '未知错误'}\n目录绑定已自动重置，请下次重新选择正确的 SillyTavern 根目录。`, 'error');
                }
            } catch (error) {
                nativeAlert(`推送发生底层异常: ${error.message}`, 'error');
            }
        };

        // 重新绑定酒馆本地目录（设置面板内使用）
        const rebindTavernPath = async () => {
            const folderPath = await window.electronAPI.selectGenericFolder();
            if (folderPath) {
                appSettings.value.tavernLocalPath = folderPath;
                nativeAlert('酒馆目录已重新绑定：' + folderPath, 'info');
            }
        };

        // ================= [ 顶部菜单系统：视图选项与工具函数 ] =================
        // API 设置独立弹窗开关
        const showApiModal = ref(false);
        // 视图菜单控制状态（控制 Raw JSON 页签 / 立绘预览 / Token 分析栏的显隐）
        const viewOptions = ref({
            showSidebar: true,        // 左侧侧边栏（角色卡列表）
            showToolbar: true,        // 顶部快捷工具栏
            showRawJson: true,        // 是否显示 Raw JSON 页签
            showAvatarPreview: true,  // 是否显示顶部立绘预览
            showTokenStats: true,     // 是否显示 Token 消耗分析栏
            showWorldbook: true,      // 是否显示世界书页签
            showRegex: true           // 是否显示正则脚本页签
        });

        // 导入单张/多张角色卡文件（经隐藏文件输入，追加写入当前库）
        const importFileInput = ref(null);
        const handleImportFiles = async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = ''; // 允许重复选择同一文件
            let added = 0;
            let skippedExisting = 0;
            for (const f of files) {
                try {
                    // Electron 33 起 File.path 已移除，经 preload 获取真实绝对路径
                    const realPath = window.electronAPI ? window.electronAPI.getPathForFile(f) : null;
                    const isImage = /\.(png|webp|jpe?g)$/i.test(f.name);
                    const isJson = /\.json$/i.test(f.name);

                    // 🛡️ 破碎图标修复：文件菜单导入的卡片若用 blob URL 做图片地址，
                    // 应用重启/刷新后 blob URL 立即失效 → 缩略图全变破碎图标。
                    // 正确做法：先把文件物理复制到当前库目录（与拖拽导入一致），
                    // 再用 local-file:// 永久路径做图片地址 → 重启后图片依然正常显示。
                    let finalPath = realPath || f.name;
                    let finalUrl = null;
                    let rawBuffer = null;
                    let rawText = null;

                    if (window.electronAPI && realPath && currentFolderPath.value) {
                        // Electron 环境 + 已设置库目录：复制文件到库，用永久路径
                        try {
                            const copied = await window.electronAPI.copyToLibrary([realPath], currentFolderPath.value);
                            if (copied && copied.length > 0) {
                                finalPath = copied[0];
                                finalUrl = isImage ? 'local-file://img/?path=' + encodeURIComponent(copied[0]) : null;
                            } else {
                                // 🔧 库内已有同名：跳过本文件并计数，继续处理后续文件
                                // （切勿 return——那会中止整个批量导入并吞掉汇总提示）
                                skippedExisting++;
                                continue;
                            }
                        } catch (copyErr) {
                            console.warn(`复制到库目录失败，跳过该文件: ${f.name}`, copyErr);
                            continue; // IPC 异常同样只跳过本文件
                        }
                    }

                    const file = {
                        name: f.name,
                        path: finalPath,
                        url: finalUrl
                    };

                    // 读取文件内容：优先从复制后的库内文件读取（白名单内，IPC 可靠）；
                    // 复制失败/无库目录时回退浏览器 File API（绕过白名单，保证能导入）
                    if (isImage) {
                        try {
                            if (window.electronAPI && finalPath !== (realPath || f.name)) {
                                const res = await window.electronAPI.readBuffer(finalPath);
                                if (res && typeof res === 'object' && res.buffer) {
                                    rawBuffer = res.buffer;
                                }
                            }
                        } catch (err) { /* 忽略 */ }
                        if (!rawBuffer) {
                            try { rawBuffer = await f.arrayBuffer(); } catch (readErr) { console.warn(`读取图片内容失败 ${f.name}:`, readErr); }
                        }
                        file.rawBuffer = rawBuffer;
                    } else if (isJson) {
                        try {
                            if (window.electronAPI && finalPath !== (realPath || f.name)) {
                                const res = await window.electronAPI.readText(finalPath);
                                if (typeof res === 'string') rawText = res;
                            }
                        } catch (err) { /* 忽略 */ }
                        if (rawText === null || rawText === undefined) {
                            try { rawText = await f.text(); } catch (readErr) { console.warn(`读取 JSON 内容失败 ${f.name}:`, readErr); }
                        }
                        file.rawText = rawText;
                    }

                    // 🛡️ 兜底：若 Electron 环境无法用 local-file 协议展示（无库目录时），
                    // 用 blob URL 保证本次会话内能看到图（重启后由用户重新导入解决）
                    if (!file.url && isImage) {
                        file.url = URL.createObjectURL(f);
                    }

                    if (await parseAndAddCard(file)) added++;
                    else if (file._skippedExisting) skippedExisting++;
                    else {
                        // 🔧 解析失败时回收兜底 blob URL（此时无人接管该 URL，
                        // 批量导入失败场景下大图 blob 会持续占用内存）
                        if (file.url && file.url.startsWith('blob:')) URL.revokeObjectURL(file.url);
                        console.warn(`未能解析为角色卡: ${f.name}（rawBuffer=${file.rawBuffer ? '有' : '无'}, path=${file.path}）`);
                    }
                } catch (err) {
                    console.warn(`导入失败 ${f.name}`, err);
                }
            }
            if (added > 0) {
                let msg = `成功导入 ${added} 张角色卡！`;
                if (skippedExisting > 0) msg += `\n${skippedExisting} 张已在库中，已跳过。`;
                nativeAlert(msg, 'info');
            } else if (skippedExisting > 0) {
                nativeAlert(`所选文件已在库中（${skippedExisting} 张），未重复添加。\n若需导入新卡，请选择库中不存在的卡片文件。`, 'warning');
            } else {
                nativeAlert('未识别到有效的角色卡文件。', 'warning');
            }
        };
        const importCards = () => { if (importFileInput.value) importFileInput.value.click(); };

        // 全选当前过滤列表中的所有卡片（并自动进入多选模式）
        const selectAllCards = () => {
            if (!isMultiSelectMode.value) isMultiSelectMode.value = true;
            selectedIds.value = filteredLibrary.value.map(i => i.id);
            nativeAlert(`已全选 ${selectedIds.value.length} 张卡片。`, 'info');
        };

        // 清理全库所有卡片中的无效标签（空字符串/纯空白），并物理落盘
        const cleanGlobalTagsPrompt = async () => {
            const modifiedItems = [];
            library.value.forEach(item => {
                let isModified = false;
                const cleanArr = (arr) => arr.filter(t => t && String(t).trim() !== '');
                if (Array.isArray(item.customTags)) {
                    const filtered = cleanArr(item.customTags);
                    if (filtered.length !== item.customTags.length) { item.customTags = filtered; isModified = true; }
                }
                const d = item.data?.data || item.data || {};
                if (Array.isArray(d.tags)) {
                    const filtered = cleanArr(d.tags);
                    if (filtered.length !== d.tags.length) { d.tags = filtered; isModified = true; }
                }
                if (isModified) modifiedItems.push(item);
            });

            if (modifiedItems.length === 0) {
                return nativeAlert('库中未发现无效标签（空字符串等）。', 'info');
            }

            let saved = 0;
            for (const item of modifiedItems) {
                try {
                    // 统一持久化中枢：写覆盖层 + 物理落盘
                    await persistCardUpdate(item, { tags: item.customTags, category: item.category });
                    saved++;
                } catch (err) { console.error(`清理无效标签保存失败 [${item.name}]`, err); }
            }
            nativeAlert(`已清理 ${modifiedItems.length} 张卡片中的无效标签，并物理保存 ${saved} 张。`, 'info');
        };

        // 用系统资源管理器打开当前库的快照 / 回收站文件夹
        const openBakFolder = async () => {
            if (!currentFolderPath.value) return nativeAlert('请先打开角色库文件夹。', 'warning');
            const res = await window.electronAPI.openPath(currentFolderPath.value + '\\.bak_history');
            if (!res.success) nativeAlert(res.error || '打开失败', 'error');
        };
        const openTrashFolder = async () => {
            if (!currentFolderPath.value) return nativeAlert('请先打开角色库文件夹。', 'warning');
            const res = await window.electronAPI.openPath(currentFolderPath.value + '\\.trash');
            if (!res.success) nativeAlert(res.error || '打开失败', 'error');
        };
        // 打开全局回收站（世界书删除/查重清洗移入的 userData/jsTavern_Trash）
        const openGlobalTrash = async () => {
            if (!window.electronAPI || typeof window.electronAPI.openGlobalTrash !== 'function') {
                nativeAlert('当前环境不支持打开全局回收站。', 'warning');
                return;
            }
            const res = await window.electronAPI.openGlobalTrash();
            if (!res.success) nativeAlert(`打开全局回收站失败: ${res.error}`, 'error');
        };

        // 打开聊天测卡（映射到聊天 Tab）
        const openChatTab = () => { currentTab.value = 'chat'; initChat(); };

        const isDragging = ref(false);
        const dragCounter = ref(0); // 拖拽进入深度计数器（防止在子元素间移动时遮罩闪烁）

        // 拖拽进入窗口：深度 +1 并显示全屏遮罩
        const handleDragEnter = (e) => {
            e.preventDefault();
            dragCounter.value++;
            isDragging.value = true;
        };

        // 拖拽离开窗口：深度 -1，归零后才隐藏遮罩
        const handleDragLeave = (e) => {
            e.preventDefault();
            // 🔧 兜底修复：拖拽取消/拖出窗口时 relatedTarget 为 null，直接复位，
            // 杜绝计数器残留导致下次拖入时遮罩不再消失
            if (!e.relatedTarget) {
                dragCounter.value = 0;
                isDragging.value = false;
                return;
            }
            dragCounter.value = Math.max(0, dragCounter.value - 1);
            if (dragCounter.value === 0) isDragging.value = false;
        };
        const cardData = shallowRef(null); // 【优化】使用浅层响应式，完美解决大卡片切换卡顿
        const imgUrl = ref(null);
        const currentTab = ref('basic');
        const library = ref([]); // 存放扫描到的角色卡集合
        // ================= 动态分类/分组与多语言系统 =================
        // 全量系统预设分组（中英文对照）
        const allDefaultCategories = [
            { key: 'all', cn: '全部', en: 'All' },
            { key: 'uncategorized', cn: '未分类', en: 'Uncategorized' },
            { key: 'fantasy', cn: '奇幻', en: 'Fantasy' },
            { key: 'scifi', cn: '科幻', en: 'Sci-Fi' },
            { key: 'romance', cn: '恋爱', en: 'Romance' },
            { key: 'nsfw', cn: '限制级', en: 'NSFW' }
        ];
        // 【修复】被用户删除/重命名的预设分组 key（localStorage 持久化，重启不再重新生成）
        const removedDefaultKeys = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavern_removedDefaultCategories'));
                if (Array.isArray(saved)) return saved.filter(k => typeof k === 'string');
            } catch (e) { /* 忽略 */ }
            return [];
        })());
        // 生效的系统预设分组（排除已被删除/重命名的，重启保持用户的选择）
        const defaultCategories = ref(allDefaultCategories.filter(c => !removedDefaultKeys.value.includes(c.key)));
        // 持久化删除/重命名记录（localStorage + 主进程配置文件）
        watch(removedDefaultKeys, (v) => {
            try { localStorage.setItem('jsTavern_removedDefaultCategories', JSON.stringify(v)); } catch (e) { /* 忽略 */ }
            saveUiSettingsToDisk();
        }, { deep: true });

        // 用户自定义添加的额外分组列表（存字符串；localStorage 持久化，重启不丢失）
        const customCategories = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavern_customCategories'));
                if (Array.isArray(saved)) return saved.filter(c => typeof c === 'string' && c.trim() !== '');
            } catch (e) { /* 忽略 */ }
            return [];
        })());

        // 监听分类列表变化，实时写入 localStorage + 主进程配置文件（新建/重命名/删除自动持久化）
        watch(customCategories, (newVal) => {
            try { localStorage.setItem('jsTavern_customCategories', JSON.stringify(newVal)); } catch (e) { /* 忽略 */ }
            saveUiSettingsToDisk();
        }, { deep: true });

        // 合并系统预设与自定义分组
        const allCategories = computed(() => {
            const customObjs = customCategories.value
                .filter(c => typeof c === 'string' && c.trim() !== '') // 🔧 兜底过滤空值，任何来源的空组都无法渲染
                .map(c => ({ key: c, cn: c, en: c }));
            return [...defaultCategories.value, ...customObjs];
        });

        // 判断名称是否已存在于预设或自定义分组（中/英/key 任一匹配即视为已知，避免与预设重复）
        const isCategoryKnown = (name) => allCategories.value.some(c => c.cn === name || c.en === name || c.key === name);

        // 根据当前语言模式（tagLangMode）渲染分类显示名称
        const getCategoryDisplayName = (catObj) => {
            if (tagLangMode.value === 'cn') return catObj.cn;
            if (tagLangMode.value === 'en') return catObj.en;
            return `${catObj.en} (${catObj.cn})`;
        };

        // 当前选中的分类 key
        const currentCategoryKey = ref('all');

        // 📁 分组操作（新建/删除/重命名）已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // 📁 卡片分类映射与物理移动已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // 📸 历史快照功能已拆分为组合式函数 useSnapshots（见下文 setup 尾部调用）

        // 分页状态
        const currentPage = ref(1);
        const itemsPerPage = ref(18);

        // 自动贴标签/分类规则 (正则匹配关键词)
        const autoTagRules = {
            'Fantasy (奇幻)': /魔法|精灵|异世界|巨龙|魔王|骑士/i,
            'Sci-Fi (科幻)': /星系|机甲|赛博朋克|AI|未来/i,
            'Monster (魔物娘)': /吸血鬼|狼人|魅魔|触手|兽人/i,
            'NSFW (限制级)': /nsfw|18\+|r18|色情|淫乱/i,
            'Romance (恋爱)': /恋爱|傲娇|病娇|青梅竹马/i
        };

        // 记录从外部导入的配置，格式: { '卡片原名': { category: 'xx', customTags: ['A', 'B'] } }
        const importedConfig = ref({});

        // 【修复】卡片分类实时持久化（localStorage，跨重启保留）
        // 分组重命名/删除/移动后同步写入；重扫/启动时优先于自动分类恢复。
        // 说明：category 是前端库字段（不在卡片文件 JSON 内），无法用 saveCard 落盘，
        // 因此用 localStorage 作为其持久化载体，与「导出/导入库配置」双保险。
        const localCategoryMap = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavern_cardsCategory'));
                if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
            } catch (e) { /* 忽略 */ }
            return {};
        })());
        watch(localCategoryMap, (v) => {
            try { localStorage.setItem('jsTavern_cardsCategory', JSON.stringify(v)); } catch (e) { /* 忽略 */ }
            saveUiSettingsToDisk();
        }, { deep: true });
        // 单卡分类持久化辅助：写 localStorage 映射 + 统一配置覆盖层（双保险，防重扫冲刷）
        const persistCardCategory = (item) => {
            if (item && item.name) {
                localCategoryMap.value[item.name] = item.category || '未分类';
                // 🛡️ 同步写入统一配置覆盖层（key=path，重名卡片不再互相覆盖）
                const key = (item.path || item.name || '').toString();
                if (!appConfig.value.cardOverlays[key]) appConfig.value.cardOverlays[key] = {};
                appConfig.value.cardOverlays[key].category = item.category || '未分类';
                if (Array.isArray(item.customTags)) {
                    appConfig.value.cardOverlays[key].tags = [...item.customTags];
                }
                syncConfigToDisk();
            }
        };

        // =========================================================
        // 🛡️ 统一持久化中枢（app_config.json 最高权威）
        // 全软件全局状态（语言/分组/全局标签池/卡片覆盖层/API Key）统一收口于此：
        //   - syncConfigToDisk()   全局配置原子落盘（从各 ref 收集 → 剥离 Proxy → 写盘）
        //   - persistCardUpdate()  卡片变更中枢（更新内存 + 写覆盖层 + 物理重写 PNG）
        // ⚠️ 生产模式 app:// 的 localStorage 不持久，app_config.json 才是跨重启权威载体。
        // =========================================================
        const appConfig = ref({
            language: 'zh-CN',
            tagLangMode: 'both',
            customCategories: [],
            removedDefaultKeys: [],
            globalTags: [],       // 全局/常用标签池
            cardOverlays: {},     // 卡片属性物理覆盖表 { "卡片路径|名称": { category, tags } }
            api: {                // API 配置（生产 app:// 下 localStorage 不持久，统一走物理文件）
                endpoint: '',
                key: '',
                model: '',
                type: 'openai'
            }
        });

        // 🛡️ 启动配置恢复保护：loadAppConfig 恢复字段时置 true，防止各 watch 触发写盘把「恢复值/旧残留」回写 app_config.json
        //    （否则旧文件 / localStorage 残留会在加载竞态中被写回权威文件，导致「删除/清空后重启复活」）
        let isRestoringConfig = false;

        // 📸 历史快照配置 ref
        // ⚠️ 必须在此（syncConfigToDisk / 集中 watch 之前）顶层定义：
        //    syncConfigToDisk(ui.snapshotConfig) 与集中 watch 在 setup 早期就引用 snapshotConfig，
        //    若只由 useSnapshots（setup 尾部注入）定义会触发 TDZ「Cannot access 'snapshotConfig' before initialization」。
        const snapshotConfig = ref((() => {
            const defaults = { enabled: true, intervalMinutes: 5, maxSnapshots: 10 };
            try {
                return {
                    enabled: localStorage.getItem('snapshot_enabled') !== 'false',
                    intervalMinutes: Number(localStorage.getItem('snapshot_interval')) || defaults.intervalMinutes,
                    maxSnapshots: Number(localStorage.getItem('snapshot_max_count')) || defaults.maxSnapshots
                };
            } catch (e) { return { ...defaults }; }
        })());

        // 统一写入磁盘：从各响应式源收集完整配置 → JSON 剥离 Vue 响应式 Proxy → 原子落盘
        // ⚠️ 关键：ref 的 value 若为对象/数组会被 reactive 包装成 Proxy，直接传 IPC 会报
        //    "An object could not be cloned"（structured clone 失败）→ 必须统一 JSON 序列化剥离。
        const syncConfigToDisk = async () => {
            if (isRestoringConfig) return; // 启动恢复期间不落盘，避免把恢复值/旧值写回造成复活
            if (!window.electronAPI || typeof window.electronAPI.saveAppConfig !== 'function') return;
            // 🔐 加密 API Key 后落盘（代码审查修复 2）：密文写入 app_config.json，明文只存内存
            const rawKey = apiKey ? apiKey.value : (appConfig.value.api && appConfig.value.api.key) || '';
            let encKey = rawKey || '';
            if (rawKey && typeof window.electronAPI.encryptSecret === 'function') {
                try {
                    const enc = await window.electronAPI.encryptSecret(rawKey);
                    if (enc && enc.success && enc.value) encKey = enc.value;
                } catch (e) { /* 加密失败回退明文 */ }
            }
            const payload = {
                language: 'zh-CN',
                tagLangMode: tagLangMode.value,
                customCategories: JSON.parse(JSON.stringify(Array.isArray(customCategories.value) ? customCategories.value : [])),
                removedDefaultKeys: JSON.parse(JSON.stringify(Array.isArray(removedDefaultKeys.value) ? removedDefaultKeys.value : [])),
                globalTags: JSON.parse(JSON.stringify(Array.isArray(systemCommonTags.value) ? systemCommonTags.value : [])),
                cardOverlays: JSON.parse(JSON.stringify(appConfig.value.cardOverlays || {})),
                api: {
                    endpoint: apiEndpoint ? apiEndpoint.value : (appConfig.value.api && appConfig.value.api.endpoint) || '',
                    key: encKey,
                    model: apiModel ? apiModel.value : (appConfig.value.api && appConfig.value.api.model) || '',
                    type: apiType ? apiType.value : (appConfig.value.api && appConfig.value.api.type) || 'openai'
                },
                // 🧩 UI 状态统一收口：生产 app:// 下 localStorage 不持久，改存 app_config.json
                ui: {
                    theme: theme.value,
                    appSettings: JSON.parse(JSON.stringify(appSettings.value || {})),
                    sanitizeImportedTags: sanitizeImportedTags.value,
                    snapshotConfig: JSON.parse(JSON.stringify(snapshotConfig.value || {})),
                    localCategoryMap: JSON.parse(JSON.stringify(localCategoryMap.value || {})),
                    sidebarWidth: Number(sidebarWidth.value) || 0,
                    viewMode: viewMode.value,
                    isCompactMode: isCompactMode.value,
                    sortBy: sortBy.value,
                    systemPromptPresets: JSON.parse(JSON.stringify(Array.isArray(systemPromptPresets.value) ? systemPromptPresets.value : [])),
                    lastWorldbookDirPath: lastWorldbookDirPath.value || '',
                    wbCategoryMap: JSON.parse(JSON.stringify(wbCategoryMap.value || {}))
                }
            };
            window.electronAPI.saveAppConfig(payload).catch(() => { });
        };

        // 🔧 落盘防抖：批量操作（清空标签/批量删除/批量加标签等）会对每张卡
        // 调 persistCardUpdate → syncConfigToDisk（全量序列化 + 加密 IPC + 写盘），
        // 几千张卡 = 几千次写放大。500ms 内的变更合并为一次落盘。
        let syncTimer = null;
        const syncConfigToDiskDebounced = () => {
            if (isRestoringConfig) return;
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(() => {
                syncTimer = null;
                syncConfigToDisk();
            }, 500);
        };
        // 窗口关闭前冲刷最后一次挂起的落盘（尽力而为：IPC 为异步，极端情况可能来不及）
        window.addEventListener('beforeunload', () => {
            if (syncTimer) {
                clearTimeout(syncTimer);
                syncTimer = null;
                syncConfigToDisk();
            }
        });

        // 卡片变更持久化中枢：只要卡片数据发生变化（标签/分类/名字等），统一经过此函数
        // 三保险：① 更新内存状态 ② 写入 AppData 物理覆盖层（即使 PNG 重写失败也能记住）③ 物理重写文件
        const persistCardUpdate = async (cardItem, updatePayload = {}) => {
            if (!cardItem) return;

            // 1. 更新内存状态
            if (updatePayload.category !== undefined) cardItem.category = updatePayload.category;
            if (updatePayload.tags !== undefined) {
                // 🔧 契约加固：updatePayload.tags 视为该卡自定义标签的【权威完整列表】。
                // 旧实现 union(data.tags, customTags) 只增不减——调用方若传入
                // "比旧 customTags 少"的列表（如未来的标签编辑器），被移除的标签会从
                // 原生 data.tags 复活。现改为：旧 customTags 中被移除的标签同步从
                // data.tags 清除（与 removeSingleTag 双清语义对齐），
                // 卡片原生自带且从未进入 customTags 的标签不受影响。
                const oldCustom = Array.isArray(cardItem.customTags) ? [...cardItem.customTags] : [];
                cardItem.customTags = Array.isArray(updatePayload.tags) ? [...updatePayload.tags] : [];

                const dataLayer = cardItem.data?.data || cardItem.data || {};
                if (!dataLayer.tags || typeof dataLayer.tags === 'string') dataLayer.tags = [];
                const newCustomSet = new Set(cardItem.customTags);
                const removedSet = new Set(oldCustom.filter(t => !newCustomSet.has(t)));
                const kept = (Array.isArray(dataLayer.tags) ? dataLayer.tags : []).filter(t => !removedSet.has(t));
                dataLayer.tags = Array.from(new Set([...kept, ...cardItem.customTags]));
            }

            // 2. 写入 AppData 物理覆盖层（双重保险：即使 PNG 重写失败，配置库也能记住数据）
            const cardKey = cardItem.path || cardItem.name;
            appConfig.value.cardOverlays[cardKey] = {
                category: cardItem.category || '未分类',
                tags: Array.isArray(cardItem.customTags) ? [...cardItem.customTags] : []
            };
            syncConfigToDiskDebounced();

            // 3. 物理重写文件（PNG 的 tEXt 元数据块 / JSON 覆写），剥离 Proxy 后经 IPC
            if (window.electronAPI && typeof window.electronAPI.saveCard === 'function' && cardItem.path && cardItem.data) {
                try {
                    await window.electronAPI.saveCard(cardItem.path, JSON.parse(JSON.stringify(cardItem.data)));
                } catch (err) {
                    console.error('卡片文件物理覆盖失败，已用物理配置文件兜底:', err);
                }
            }
        };

        // 🔧 删除卡片后清理覆盖层 key：防止 app_config.json 的 cardOverlays 随删除操作无限膨胀
        // ⚠️ 行为取舍：清理后若从 .trash/jsTavern_Trash 手动找回同名卡，分类会回退为
        // 「未分类」（分类只存覆盖层；标签已随 persistCardUpdate 物理写回 PNG，不受影响）。
        // 若更看重找回后的状态完整性，可不接入本函数（膨胀速度极慢，每条几十字节）
        const deleteCardOverlays = (paths) => {
            if (!Array.isArray(paths) || paths.length === 0) return;
            const overlays = appConfig.value.cardOverlays || {};
            let removed = false;
            for (const p of paths) {
                if (p && overlays[p]) { delete overlays[p]; removed = true; }
            }
            if (removed) syncConfigToDisk();
        };

        // 【兼容保留】统一将关键 UI 状态（分组/语言/卡片分类等）持久化到主进程配置文件。
        // 现在内部直接走统一中枢 syncConfigToDisk（app_config.json 唯一权威），旧文件双写已移除（避免双权威竞态）。
        const saveUiSettingsToDisk = () => {
            if (!window.electronAPI) return;
            if (isRestoringConfig) return; // 启动恢复期间不落盘
            // 统一写入 app_config.json（唯一权威）；旧文件 uiSettings 双写已移除
            syncConfigToDisk();
        };
        const currentFolderPath = ref(''); // 当前打开的文件夹路径（Electron）

        // ================= [ 多选与批量操作状态 ] =================
        const selectedIds = ref([]); // 存放被选中的卡片 ID
        const lastSelectedIndex = ref(-1); // 用于 Shift 连续多选记录

        // 🧹 清除多选（共享工具：被 useBatch/useCardGroups/useTags 注入）
        const clearSelection = () => {
            selectedIds.value = [];
            lastSelectedIndex.value = -1;
        };

        // ================= [ 聊天测卡状态 ] =================
        // 默认地址：兼容 LM Studio 或 Oobabooga 的 OpenAI 格式接口（支持持久化，重启后自动恢复）
        const DEFAULT_API_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions';
        let savedEndpoint = '';
        try { savedEndpoint = localStorage.getItem('stc-api-endpoint') || ''; } catch (e) { /* 忽略 */ }
        const apiEndpoint = ref(savedEndpoint || DEFAULT_API_ENDPOINT);

        // API 鉴权密钥（可配置，远端 API 需要真实 key；本地 API 可留空，主进程回退到 test-key）
        let savedApiKey = '';
        try { savedApiKey = localStorage.getItem('stc-api-key') || ''; } catch (e) { /* 忽略 */ }
        const apiKey = ref(savedApiKey);
        // 🔐 解密历史密文（代码审查修复 2）：兼容旧明文——解密失败则原样使用
        if (savedApiKey && window.electronAPI && typeof window.electronAPI.decryptSecret === 'function') {
            (async () => {
                try {
                    const dec = await window.electronAPI.decryptSecret(savedApiKey);
                    if (dec && dec.success && typeof dec.value === 'string') apiKey.value = dec.value;
                } catch (e) { /* 解密失败回退明文 */ }
            })();
        }

        // API 模型名称（OpenAI 兼容格式的 model 字段；本地 LM Studio/Ollama 通常忽略，可留空回退 local-model）
        let savedApiModel = '';
        try { savedApiModel = localStorage.getItem('stc-api-model') || ''; } catch (e) { /* 忽略 */ }
        const apiModel = ref(savedApiModel);

        // 生成 API 请求的 model 字段：优先使用配置的模型名称，留空时按协议回退
        // 【修复】Anthropic 协议必须回退到 Claude 模型，否则网关返回 400；OpenAI 兼容协议才用 local-model
        const resolveApiModel = () => {
            if (apiModel.value && apiModel.value.trim()) return apiModel.value.trim();
            return apiType.value === 'anthropic' ? 'claude-3-haiku-20240307' : 'local-model';
        };

        // API 三件套（Endpoint / Key / Model）变化时自动持久化：localStorage 兜底 + 统一配置中枢（app_config.json）
        watch(apiEndpoint, (v) => {
            try { localStorage.setItem('stc-api-endpoint', v || ''); } catch (e) { /* 忽略 */ }
            syncConfigToDisk();
        });
        watch(apiKey, async (v) => {
            // 🔐 落盘前加密（代码审查修复 2）：密文写入 localStorage，明文只存内存
            let storeVal = v || '';
            if (storeVal && window.electronAPI && typeof window.electronAPI.encryptSecret === 'function') {
                try {
                    const enc = await window.electronAPI.encryptSecret(storeVal);
                    if (enc && enc.success && enc.value) storeVal = enc.value;
                } catch (e) { /* 加密失败回退明文 */ }
            }
            try { localStorage.setItem('stc-api-key', storeVal); } catch (e) { /* 忽略 */ }
            syncConfigToDisk();
        });
        watch(apiModel, (v) => {
            try { localStorage.setItem('stc-api-model', v || ''); } catch (e) { /* 忽略 */ }
            syncConfigToDisk();
        });

        // API 协议类型：'openai'（OpenAI 兼容，默认）或 'anthropic'（Claude 原生）
        let savedApiType = '';
        try { savedApiType = localStorage.getItem('stc-api-type') || ''; } catch (e) { /* 忽略 */ }
        const apiType = ref(savedApiType === 'anthropic' ? 'anthropic' : 'openai');
        watch(apiType, (v) => {
            try { localStorage.setItem('stc-api-type', v || 'openai'); } catch (e) { /* 忽略 */ }
            syncConfigToDisk();
        });

        // ✨ 聊天测卡逻辑（sendMessage/initChat/clearChat）与 API 设置保存/切换 已拆分为组合式函数 useChat（见下文 setup 尾部调用）
        // ✅ [补丁] 引擎协议切换时强制清洗不兼容的模型名，防止把 local-model/gpt-* 发给 Claude 触发 400
        watch(apiType, (newType) => {
            const currentModel = (apiModel.value || '').trim();
            // 切到 Claude：本地/OpenAI 系模型名与 Anthropic 不兼容，强制清空触发默认回退（claude-3-haiku）
            if (newType === 'anthropic' && (currentModel === 'local-model' || currentModel.startsWith('gpt-'))) {
                apiModel.value = '';
            }
            // 切回 OpenAI 兼容：清除 Claude 系模型名
            else if (newType !== 'anthropic' && currentModel.startsWith('claude-')) {
                apiModel.value = 'local-model';
            }
        });

        // 兼容 OpenAI（choices[0].message.content）与 Anthropic（content[0].text）的回复提取
        const extractReplyContent = (result) => {
            if (!result || !result.data) return '';
            const d = result.data;
            if (apiType.value === 'anthropic') {
                return (d.content && d.content[0] && d.content[0].text) || '';
            }
            return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
        };

        // ================= [ API 模型列表拉取（GET /v1/models，经主进程转发绕过 CORS）] =================
        // （已拆分为组合式函数 useChat）

        // 兼容不同数据结构的取值助手：优先取 data 字段
        const safeData = computed(() => {
            if (!cardData.value) return {};
            return cardData.value.data || cardData.value || {};
        });

        // 【修复】shallowRef 下深层编辑（v-model 直接改 data 内部字段）不会触发响应式更新，
        // 导致 Token 统计 / Raw JSON 视图在打字时不刷新。手动 triggerRef 强制刷新（保留 shallowRef 性能优势）
        const refreshCardData = () => {
            if (cardData.value) triggerRef(cardData);
            // 🚀 v1.8.5：编辑器改了当前卡内容 → 精确失效该卡的 Token 缓存（侧栏徽章下次渲染重算）
            if (cardData.value) cardTokensCache.delete(cardData.value);
        };

        // 识别卡片规范版本
        const specVersion = computed(() => {
            if (!cardData.value) return 'Unknown';
            if (cardData.value.spec === 'chara_card_v3') return 'V3';
            if (cardData.value.spec === 'chara_card_v2') return 'V2';
            if (cardData.value.name && !cardData.value.data) return 'V1 / Custom';
            return 'Custom';
        });

        // 世界书条目（兼容 V1/V2 层级与 comment 字段）
        // 世界书条目稳定标识：为每个条目对象分配唯一 uid（v-for :key 使用，避免增删时节点错位）
        // 【修复】改用 WeakMap：键为对象引用，条目对象被 GC 时映射自动释放，防止频繁切卡导致内存泄漏
        const entryUidMap = new WeakMap();
        let entryUidCounter = 0;
        const getEntryUid = (entry) => {
            if (!entry || typeof entry !== 'object') return 'entry-' + (++entryUidCounter);
            if (!entryUidMap.has(entry)) entryUidMap.set(entry, 'entry-' + (++entryUidCounter));
            return entryUidMap.get(entry);
        };

        // 正则脚本稳定标识（同世界书机制，避免增删时节点错位）
        // 【修复】同样改用 WeakMap，避免正则脚本对象被丢弃后残留强引用
        const regexUidMap = new WeakMap();
        let regexUidCounter = 0;
        const getRegexUid = (script) => {
            if (!script || typeof script !== 'object') return 'regex-' + (++regexUidCounter);
            if (!regexUidMap.has(script)) regexUidMap.set(script, 'regex-' + (++regexUidCounter));
            return regexUidMap.get(script);
        };

        const worldbookEntries = computed(() => {
            // 兼容 V1 和 V2 的存放位置
            const book = safeData.value.character_book || cardData.value?.character_book || {};
            // 🛡️ 全形态安全提取（entries 数组 / entries 字典 / book 本身为数组），
            // 修复字典形态 entries 与数组形态 book 导致 .filter 崩溃（编辑器白屏）
            const entries = extractBookEntries(book);

            // 【关键】直接返回原始条目的响应式代理（不做拷贝展开），
            // 这样 v-model 编辑能写回原数据（保存时落盘），同时保持响应式（cardData 是 shallowRef）
            // 【脏数据防护】脏条目过滤已由 extractBookEntries 完成，防止 EditorPanel v-for 渲染时读 entry.name 空引用崩溃
            return entries
                .map(entry => reactive(entry));
        });

        // ================= 世界书折叠展开控制 =================
        // 存储每个世界书条目是否展开的映射表，key 为条目的稳定唯一标识（getEntryUid），value 为 boolean
        // ✅ [补丁] 改用 uid 而非数组 index：删除/排序条目后 index 会错位继承旧折叠状态（打开的突然闭合）
        const worldbookExpanded = ref({});

        // 切换单个条目的折叠状态（按条目的稳定唯一标识追踪）
        const toggleWorldbookEntry = (entry) => {
            if (!entry) return;
            const key = getEntryUid(entry);
            worldbookExpanded.value[key] = !worldbookExpanded.value[key];
        };

        // 全部展开
        const expandAllWorldbook = () => {
            worldbookEntries.value.forEach((entry) => {
                if (entry) worldbookExpanded.value[getEntryUid(entry)] = true;
            });
        };

        // 全部折叠
        const collapseAllWorldbook = () => {
            worldbookEntries.value.forEach((entry) => {
                if (entry) worldbookExpanded.value[getEntryUid(entry)] = false;
            });
        };

        // 世界书触发词转字符串以便在 input 中编辑
        const getKeysString = (keysArray) => {
            return Array.isArray(keysArray) ? keysArray.join(', ') : (keysArray || '');
        };

        const updateEntryKeys = (entry, fieldOrVal, value) => {
            if (!entry) return;
            // 兼容两种调用形态：
            //   updateEntryKeys(entry, value)          -> 写 entry.keys（角色卡世界书编辑器）
            //   updateEntryKeys(entry, 'key', value)   -> 写 entry.key / entry.keysecondary（独立世界书 IDE）
            let targetField = 'keys';
            let rawValue = fieldOrVal;
            if (value !== undefined) {
                targetField = fieldOrVal;
                rawValue = value;
            }
            // 将逗号分隔的字符串切割为数组，自动去除空格与空项（兼容中英文逗号）
            entry[targetField] = String(rawValue).split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0);
            // 【修复】词条触发词变化会影响世界书 Token 统计，手动触发浅层刷新
            // 🚀 v1.8.5：触发词参与 Token 估算 → 同步失效缓存
            if (cardData.value) { triggerRef(cardData); cardTokensCache.delete(cardData.value); }
        };

        // 【修复】富文本渲染与代码安全转义
        const renderHTML = (text) => {
            if (!text) return '';
            // 1. 必须先转义 < 和 >，否则 <html> 这种代码会被浏览器吞掉
            let safeText = text.replace(/&/g, "&amp;")
                               .replace(/</g, "&lt;")
                               .replace(/>/g, "&gt;");
            // 2. 替换换行，保留多个空格以便代码缩进不丢失
            return safeText.replace(/\n/g, '<br>')
                           .replace(/\s\s/g, '&nbsp;&nbsp;');
        };

        // 【安全加固】渲染模式专用：允许基本排版标签，但剥离脚本/事件/危险协议
        // 经 DOMPurify 清洗后再 v-html，从源头掐断聊天内容 XSS（追踪像素/内网探测/脚本注入）
        const renderSafeHTML = (text) => {
            if (!text) return '';
            return DOMPurify.sanitize(text, {
                ALLOWED_TAGS: [
                    'b', 'i', 'em', 'strong', 'u', 's', 'br', 'p', 'div', 'span',
                    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'hr',
                    'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
                ],
                ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'title'],
                ALLOW_DATA_ATTR: false,
                // 【安全修复】FORBID_ATTR 只接受属性名字符串（内部哈希查找，不支持正则），
                // 显式列出常见事件属性（真正生效的兜底写法）；ALLOWED_ATTR 白名单仍是主防线
                FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'oninput', 'onanimationstart', 'onanimationend', 'onpointerdown', 'onpointerup', 'onpointermove', 'ondragstart', 'ondrop'],
                // 【安全平衡】允许内嵌 base64 图(data:image/)与相对路径，禁止 http(s) 外联
                // （防追踪像素/内网探测；外联图需求可再评估放开）
                ALLOWED_URI_REGEXP: /^(?:data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
            });
        };

        // 【修复】清洗 Markdown 代码块标记（```html、```yaml、```json 等），
        // 防止渲染模式下这些围栏标记被当成普通文本暴露在气泡顶部/底部
        const cleanMarkdownFences = (text) => {
            if (!text) return '';
            return text
                .replace(/```[a-zA-Z]*\n?/gi, '') // 【修复】匹配任意语言标记 (```python、```markdown、``` 等)，不再残留裸文本
                .replace(/```/g, ''); // 洗掉结尾的 ```
        };

        // 正则脚本（兼容不同存放位置；只读提取，不做副作用，避免无正则卡片保存时写入空数组）
        const regexScripts = computed(() => {
            const d = safeData.value;
            if (!d || typeof d !== 'object') return [];
            return d.extensions?.regex_scripts || (Array.isArray(d.regex_scripts) ? d.regex_scripts : []);
        });

        // 确保 extensions.regex_scripts 数组存在（仅在用户主动编辑/新增时调用）
        const ensureRegexScriptsArray = () => {
            const d = safeData.value;
            if (!d || typeof d !== 'object') return null;
            if (!d.extensions) d.extensions = {};
            if (!Array.isArray(d.extensions.regex_scripts)) {
                // 兼容旧结构：若顶层有 regex_scripts 数组则迁移进来
                d.extensions.regex_scripts = Array.isArray(d.regex_scripts) ? d.regex_scripts : [];
            }
            return d.extensions.regex_scripts;
        };

        // 新增一条正则脚本
        const addRegexScript = () => {
            if (!cardData.value) return;
            const arr = ensureRegexScriptsArray();
            if (!arr) return;
            arr.push({
                id: 'regex_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                scriptName: '新建正则脚本',
                findRegex: '',
                replaceString: '',
                placement: [2], // 默认作用于 2: AI 输出
                disabled: false
            });
        };

        // 删除一条正则脚本
        const deleteRegexScript = (index) => {
            if (cardData.value && regexScripts.value[index] !== undefined) {
                regexScripts.value.splice(index, 1);
            }
        };

        // 安全规范化单个正则脚本字段（双向同步 camelCase 与 snake_case，兼容不同前端导出）
        const syncRegexScriptField = (script, field, value) => {
            if (!script) return;
            if (field === 'scriptName') {
                script.scriptName = value;
                script.script_name = value;
            } else if (field === 'findRegex') {
                script.findRegex = value;
                script.find_regex = value;
            } else if (field === 'replaceString') {
                script.replaceString = value;
                script.replace_string = value;
            } else if (field === 'disabled') {
                script.disabled = !!value;
            }
            // 【修复】shallowRef 深层编辑不触发响应式，手动刷新视图（防 Checkbox/文字假死）
            if (cardData.value) { triggerRef(cardData); cardTokensCache.delete(cardData.value); }
        };

        // ================= [ 方法：聊天测卡逻辑 ] =================
        // （已拆分为组合式函数 useChat）

        // 🕸️ 关系图谱 已拆分为组合式函数 useGraph（见下文 setup 尾部调用）

        // ================= Token 消耗与上下文预估 =================
        // 简易 Token 估算算法：中文按 1.5 权重，英文单词按 1.2 权重计算
        // Token 估算函数已提取到 ../utils/tokenEstimate.js（共享 import，见文件顶部）

        // 计算当前卡片各个模块的 Token 消耗明细及总数
        const cardTokenStats = computed(() => {
            if (!cardData.value) return { total: 0, desc: 0, pers: 0, scen: 0, first: 0, book: 0 };
            const d = safeData.value;
            
            const desc = estimateTokens(d.description);
            const pers = estimateTokens(d.personality);
            const scen = estimateTokens(d.scenario);
            const first = estimateTokens(d.first_mes);
            
            // 计算所有世界书条目的 Token 总和
            let bookTokens = 0;
            const book = d.character_book || cardData.value?.character_book || {};
            // 🛡️ 全形态安全提取（entries 数组/字典/数组 book），修复脏形态 .forEach 崩溃
            const entries = extractBookEntries(book);
            entries.forEach(e => {
                // 🛡️ keys 非数组脏数据防护（字符串 keys 直接 .join 会 TypeError）
                bookTokens += estimateTokens(e.content) + estimateTokens((Array.isArray(e.keys) ? e.keys : []).join(', '));
            });

            const total = desc + pers + scen + first + bookTokens;
            return { total, desc, pers, scen, first, book: bookTokens };
        });

        // ================= [ 全屏放大文本阅读/编辑器 ] =================
        const showTextModal = ref(false);
        const textModalTitle = ref('');
        const textModalContent = ref('');
        const textModalTargetRef = ref(null);
        const textModalFontSize = ref(14); // 默认字号 14px

        // 打开大文本弹窗
        const openTextModal = (title, targetObj, fieldName) => {
            textModalTitle.value = title;
            textModalTargetRef.value = { obj: targetObj, field: fieldName };
            textModalContent.value = targetObj[fieldName] || '';
            showTextModal.value = true;
        };

        // 保存大文本修改并同步回卡片数据
        const saveTextModal = () => {
            if (textModalTargetRef.value) {
                const { obj, field } = textModalTargetRef.value;
                obj[field] = textModalContent.value;
            }
            showTextModal.value = false;
            // 【修复】shallowRef 深层编辑不触发响应式，手动刷新（全屏编辑器保存后 Token/正文实时更新）
            // 🚀 v1.8.5：正文字段变化影响 Token 估算 → 同步失效缓存
            if (cardData.value) { triggerRef(cardData); cardTokensCache.delete(cardData.value); }
        };

        // ================= [ 高清立绘大图预览 Modal ] =================
        const showImageModal = ref(false);
        const previewImageUrl = ref('');

        const openImageModal = (url) => {
            if (!url) return;
            previewImageUrl.value = url;
            showImageModal.value = true;
        };

        // ================= 全局资产中枢 (世界书/正则共享库) =================
        const showGlobalAssetModal = ref(false);
        const globalAssetTab = ref('worldbook'); // 'worldbook' 或 'regex'

        // 聚合全库所有卡片的世界书条目 (附带所属卡片名字)
        const globalAllWorldbooks = computed(() => {
            const list = [];
            library.value.forEach(item => {
                const d = item.data?.data || item.data || {};
                const book = d.character_book || item.data?.character_book || {};
                // 🛡️ 全形态安全提取（entries 数组/字典/数组 book），修复脏形态 .forEach 崩溃
                const entries = extractBookEntries(book);
                entries.forEach(e => {
                    list.push({
                        ...e,
                        displayName: e.name || e.comment || '未命名条目',
                        ownerCardName: d.name || item.name || '未知角色'
                    });
                });
            });
            return list;
        });

        // 聚合全库所有卡片的正则脚本
        const globalAllRegexScripts = computed(() => {
            const list = [];
            library.value.forEach(item => {
                const d = item.data?.data || item.data || {};
                const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                regex.forEach(r => {
                    list.push({
                        ...r,
                        ownerCardName: d.name || item.name || '未知角色'
                    });
                });
            });
            return list;
        });

        // 导航标签（含图标与数量徽标；Raw JSON 页签可按视图设置隐藏）
        const tabs = computed(() => {
            const list = [
                { id: 'basic', name: '基础设定', icon: '📖' },
                { id: 'advanced', name: '进阶设定', icon: '🛠️' },
                { id: 'worldbook', name: '世界书', icon: '🌍', badge: worldbookEntries.value.length || null },
                { id: 'regex', name: '正则脚本', icon: '⚙️', badge: regexScripts.value.length || null },
                { id: 'chat', name: '聊天测试', icon: '💬', action: initChat },
                { id: 'raw', name: 'Raw JSON', icon: '💻' }
            ];
            return list.filter(t => {
                if (t.id === 'raw' && !viewOptions.value.showRawJson) return false;
                if (t.id === 'worldbook' && !viewOptions.value.showWorldbook) return false;
                if (t.id === 'regex' && !viewOptions.value.showRegex) return false;
                return true;
            });
        });

        const currentTabInfo = computed(() => tabs.value.find(t => t.id === currentTab.value) || tabs.value[0]);

        const formattedJson = computed(() => {
            return cardData.value ? JSON.stringify(cardData.value, null, 2) : '';
        });

        // ================= [ 性能优化：搜索防抖 ] =================
        // （搜索防抖/全字段过滤/分页计算已拆分为组合式函数 useSearch）

        // 正则作用域（placement）可读化
        const getRegexPlacement = (arr) => {
            // ✅ [补丁] 严格判定：区分 0 与 null/undefined（旧版 `!arr` 会把 placement:0 误判为默认）
            if (arr === undefined || arr === null) return '默认';
            const map = { 0: '全局/未定义', 1: '用户输入', 2: 'AI回复', 3: '全文本' };
            return Array.isArray(arr) ? arr.map(i => map[i] || i).join(', ') : map[arr] || arr;
        };

        // 原生提示框封装：替代浏览器 alert()，弹出 Electron 原生对话框
        const nativeAlert = async (message, type = 'info', title = '系统提示') => {
            if (!window.electronAPI) return alert(message); // 浏览器环境回退
            await window.electronAPI.showMessage({
                type: type, // 'none' | 'info' | 'error' | 'question' | 'warning'
                title: title,
                message: message,
                buttons: ['确定']
            });
        };

        // 主题切换（暗夜极客 dark / 雅致青灰 slate / 明亮白昼 light）
        const applyTheme = (t) => {
            document.documentElement.setAttribute('data-theme', t);
        };
        const setTheme = (t) => {
            theme.value = t;
            try { localStorage.setItem('stc-theme', t); } catch (e) { /* 忽略 */ }
            applyTheme(t);
        };
        const toggleTheme = () => {
            const order = ['dark', 'slate', 'light'];
            const idx = order.indexOf(theme.value);
            setTheme(order[(idx + 1) % order.length]);
        };

        // =========================================================
        // 📏 侧边栏宽度自定义（拖拽把手调节 + localStorage 持久化）
        // =========================================================
        const sidebarEl = ref(null); // 侧边栏 DOM 引用（拖拽时读取当前宽度）
        const sidebarWidth = ref((() => {
            try {
                const w = parseInt(localStorage.getItem('jsTavern_sidebarWidth') || '', 10);
                if (w >= 220 && w <= 520) return w;
            } catch (e) { /* 忽略 */ }
            return 0; // 0 = 使用默认 calc(var(--ui-fs) * 22)
        })());

        // 侧边栏样式：拖拽后使用固定像素宽度；未拖拽时跟随字号缩放
        const sidebarStyle = computed(() => {
            if (sidebarWidth.value > 0) return { width: sidebarWidth.value + 'px', minWidth: '220px' };
            return { width: 'calc(var(--ui-fs, 13px) * 22)', minWidth: '260px' };
        });

        // 拖拽调整侧边栏宽度（min 220 / max 520）
        const startSidebarResize = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarEl.value ? sidebarEl.value.offsetWidth : 286;
            const onMove = (ev) => {
                const delta = ev.clientX - startX;
                sidebarWidth.value = Math.max(220, Math.min(520, Math.round(startWidth + delta)));
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                try { localStorage.setItem('jsTavern_sidebarWidth', String(sidebarWidth.value)); } catch (err) { /* 忽略 */ }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        // 双击把手恢复默认宽度（跟随字号缩放）
        const resetSidebarWidth = () => {
            sidebarWidth.value = 0;
            try { localStorage.removeItem('jsTavern_sidebarWidth'); } catch (e) { /* 忽略 */ }
        };

        // 原生确认对话框（Electron 中 window.confirm 会静默返回 null，须经 dialog.showMessageBox）
        const confirmDialog = async (message) => {
            if (!window.electronAPI) return window.confirm(message);
            const res = await window.electronAPI.showMessage({
                type: 'question',
                title: '确认操作',
                message: message,
                buttons: ['取消', '确定'],
                defaultId: 1,
                cancelId: 0
            });
            return !!(res && res.response === 1);
        };

        // 重置界面外观与个性化设置（不影响 API 配置）
        const resetPersonalizationSettings = async () => {
            if (!(await confirmDialog('是否确定重置界面字号与外观设置？（API 配置将保持不变）'))) return;
            // 保留酒馆推送地址，避免误重置
            const prevTavernUrl = appSettings.value.tavernUrl || 'http://127.0.0.1:8000';
            appSettings.value = {
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif",
                fontSize: 14,
                fontWeight: 'normal',
                uiFontSize: 13,
                tavernUrl: prevTavernUrl
            };
            nativeAlert('界面外观设置已恢复默认！', 'info');
        };

        // 重置 API 接口配置（不影响外观设置）
        const resetApiSettings = async () => {
            if (!(await confirmDialog('是否重置 API 接口地址与 Key / 模型参数？'))) return;
            apiEndpoint.value = 'http://127.0.0.1:1234/v1/chat/completions';
            apiKey.value = '';
            apiModel.value = '';
            availableModels.value = [];
            fetchModelStatus.value = '';
            nativeAlert('API 配置已恢复默认！', 'info');
        };

        // 处理文件读取（含错误提示）
        const handleFile = async (file) => {
            try {
                const { data, imgUrl: url } = await processFile(file);
                cardData.value = data;
                imgUrl.value = url;
                currentTab.value = 'basic';
            } catch (error) {
                console.error(error);
                nativeAlert(ERROR_MESSAGES[error.message] || ERROR_MESSAGES.DEFAULT, 'error');
            }
        };

        // 系统级拖拽导入：将拖入的文件复制到卡片库文件夹
        const handleDrop = async (e) => {
            e.preventDefault();
            isDragging.value = false;
            dragCounter.value = 0; // 重置计数器

            // 检查是否已设置固定的卡片库文件夹
            if (!currentFolderPath.value) {
                return nativeAlert('请先在顶部【选择固定文件夹读取】，设定你的卡片库目录，然后再拖入新卡片。', 'warning');
            }

            // 获取拖入文件的真实绝对路径
            // 注意：Electron 33 起 File.path 已移除，须经 webUtils.getPathForFile 获取（由 preload 暴露）
            const files = Array.from(e.dataTransfer.files);
            const filePaths = files
                .map(f => window.electronAPI ? window.electronAPI.getPathForFile(f) : f.path)
                .filter(p => p);

            if (filePaths.length > 0) {
                // 调用主进程，把拖入的文件复制到库文件夹
                const copiedFiles = await window.electronAPI.copyToLibrary(filePaths, currentFolderPath.value);

                if (copiedFiles.length > 0) {
                    nativeAlert(`成功将 ${copiedFiles.length} 张新卡片导入到你的卡片库中！`, 'info');

                    // 【性能修复】只解析并追加新拖入的文件（O(1) 增量），
                    // 避免原实现调 processElectronFiles 清空全库后逐张重读重解析（千卡库拖 1 张也全量重载）
                    for (const newFilePath of copiedFiles) {
                        const fName = newFilePath.split(/[\\/]/).pop();
                        const isImg = /\.(png|jpe?g|webp)$/i.test(fName);
                        await parseAndAddCard({
                            name: fName,
                            path: newFilePath,
                            url: isImg ? 'local-file://img/?path=' + encodeURIComponent(newFilePath) : null
                        });
                    }
                } else {
                    nativeAlert('导入失败：卡片格式不支持，或者库中已存在同名文件。', 'warning');
                }
            }
        };

        const handleFileUpload = (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
            e.target.value = ''; // 重置输入框，允许重复选择同一文件
        };

        // 🌐 从 URL 直链下载角色卡并导入（PNG/JSON 卡，支持 Discord/GitHub 等 CDN 直链）
        const downloadCardFromUrl = async () => {
            if (!currentFolderPath.value) {
                return nativeAlert('请先在顶部【选择固定文件夹读取】，设定你的卡片库目录，然后再从链接导入。', 'warning');
            }
            const url = await appPrompt('🌐 从链接下载导入角色卡\n请输入角色卡直链（支持 PNG / JSON 卡，Discord/GitHub 等 CDN 均可）：');
            if (!url || !url.trim()) return;
            // ⚠️ 进度提示必须用非阻塞的 showToast：nativeAlert 是模态框（等用户点确定才返回），
            // 会把窗口整个挡住，导致下载完成的"成功/失败"弹窗也无法显示（表现为"下载中"一直卡住）
            showToast('⏳ 正在从链接下载并导入角色卡，请稍候...', 'info', 6000);
            try {
                const res = await window.electronAPI.downloadCardFromUrl({ url: url.trim(), destFolder: currentFolderPath.value });
                if (res && res.success) {
                    const isImg = /\.png$/i.test(res.fileName);
                    const added = await parseAndAddCard({
                        name: res.fileName,
                        path: res.filePath,
                        url: isImg ? 'local-file://img/?path=' + encodeURIComponent(res.filePath) : null,
                        mtime: Date.now()
                    });
                    if (added) {
                        nativeAlert(`✅ 已从链接导入「${res.name}」到卡片库！`, 'success');
                    } else {
                        nativeAlert('卡片已下载到库中，但未入库（可能已在库中）。', 'warning');
                    }
                } else if (res && res.skipped) {
                    nativeAlert(res.error, 'warning');
                } else {
                    nativeAlert(res?.error || '下载导入失败，请检查链接是否有效。', 'error');
                }
            } catch (err) {
                console.error(err);
                nativeAlert('下载导入失败: ' + (err.message || err), 'error');
            }
        };

        // 导出 JSON
        const downloadJson = () => {
            if (!cardData.value) return;
            // 【修复】深拷贝时用 replacer 递归剔除 Vue 前端专属字段（_collapsed 折叠状态 / uid 列表防错位 ID），避免污染酒馆标准 JSON 格式
            const cleanData = JSON.parse(JSON.stringify(cardData.value, (k, v) => (k === '_collapsed' || k === 'uid') ? undefined : v));
            const jsonStr = JSON.stringify(cleanData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${safeData.value.name || 'character'}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        // 自动分类与贴标签的核心逻辑
        const processAutoTagsAndCategory = (cardInfo) => {
            // 📁 物理文件夹分组优先：卡片位于库目录的子文件夹时，其一级文件夹名即为分组
            // （文件系统位置是事实依据，重扫/重命名/移动后保持一致）
            if (cardInfo.subFolder) {
                cardInfo.category = cardInfo.subFolder.split(/[\\/]/)[0] || '未分类';
                return;
            }
            // ---- 【🛡️ 最高优先级】物理配置库覆盖层恢复（用户手动改过的分类/标签，防重扫冲刷） ----
            // 覆盖层 key = 卡片路径（path），兼容旧数据回退卡片名（name）
            const overlayKey = (cardInfo.path || cardInfo.name || '').toString();
            const overlay = appConfig.value.cardOverlays && appConfig.value.cardOverlays[overlayKey];
            if (overlay) {
                let overlayApplied = false;
                if (overlay.category && overlay.category.trim() !== '') {
                    cardInfo.category = overlay.category;
                    overlayApplied = true;
                }
                // tags 存在即恢复（含空数组 = 用户清空过标签，同样要记住，禁止回退自动分类）
                if (Array.isArray(overlay.tags)) {
                    cardInfo.customTags = [...overlay.tags];
                    // 同步回酒馆原生 data.tags（保证后续保存一致）
                    const dataLayer = cardInfo.data?.data || cardInfo.data || {};
                    if (dataLayer && Array.isArray(dataLayer.tags)) {
                        dataLayer.tags = Array.from(new Set([...dataLayer.tags, ...overlay.tags]));
                    }
                    overlayApplied = true;
                }
                if (overlayApplied) return; // 覆盖层命中即视为用户配置，跳过自动分类，绝不冲刷
            }
            // ---- 【优先应用导入的历史配置】 ----
            const savedConfig = importedConfig.value[cardInfo.name];
            if (savedConfig) {
                cardInfo.category = savedConfig.category || '未分类';
                cardInfo.customTags = savedConfig.customTags || [];
                return; // 如果有历史配置，就跳过自动分类，直接使用用户的历史数据
            }
            // ---- 【修复】localStorage 持久化的手动分类（优先级高于自动分类，重启/重扫后保留） ----
            if (localCategoryMap.value[cardInfo.name]) {
                cardInfo.category = localCategoryMap.value[cardInfo.name];
                return;
            }
            // ---- 【以下为原有的自动规则代码】 ----
            const data = cardInfo.data?.data || cardInfo.data;
            if (!data) return;

            // 提取所有文本用于分析
            const fullText = [data.description, data.personality, data.scenario, data.first_mes].join('\n');
            // 🧹 导入数据清洗开关：开启时忽略卡片自带的原生 tags（防止他人卡片的杂乱标签混入全局标签池）
            let generatedTags = sanitizeImportedTags.value ? [] : [...(data.tags || [])];
            let assignedCategory = '未分类';

            // 匹配自动标签
            for (const [tag, regex] of Object.entries(autoTagRules)) {
                if (regex.test(fullText) && !generatedTags.includes(tag)) {
                    generatedTags.push(tag);
                    // 【修复】自动分类仅落到已知预设分组：
                    //   tag.split(' ')[0] 可能产生预设外的英文组名（如 'Monster (魔物娘)' → 'Monster'），
                    //   导致导入卡片被分到莫名/英文名的分组（用户眼中"没有名字的分组"）。
                    //   未知组名不设分类（保持"未分类"），也不自动创建新分组。
                    if (assignedCategory === '未分类') {
                        const cand = tag.split(' ')[0];
                        if (allCategories.value.some(c => c.key === cand || c.cn === cand || c.en === cand)) {
                            assignedCategory = cand;
                        }
                    }
                }
            }

            // 更新到卡片对象
            cardInfo.customTags = Array.from(new Set(generatedTags));
            cardInfo.category = assignedCategory;

            // 【修复 BUG-3】自动分类不再盲目创建分组：
            //  · 开关开启（导入即净化）：完全不自动创建分组，自动分类仅落到卡片属性；
            //  · 开关关闭：也先过滤「未分类」，仅对真正的新分类才补建分组。
            //  分组在物理文件夹体系下以库目录子文件夹为准（walkLibraryDir 一级文件夹），
            //  此处避免把自动贴标签引入的普通分类词当成分组，产生"幽灵分组"。
            const shouldAutoBuildCategory = !sanitizeImportedTags.value;
            const catTrimmed = String(assignedCategory || '').trim();
            if (shouldAutoBuildCategory
                && catTrimmed && catTrimmed !== '未分类'
                && !allCategories.value.some(c => c.cn === assignedCategory || c.en === assignedCategory || c.key === assignedCategory)) {
                customCategories.value.push(assignedCategory);
            }
        };

        // ================= [ Electron 专属逻辑 ] =================

        // 读取并解析单张卡片文件，成功则加入库中（供文件夹加载 / 磁盘扫描共用）
        // 🕵️ 角色卡血统严格鉴定：过滤伪装成卡片的聊天记录、独立世界书、UI 主题配置、
        //     config.json 等系统配置与无内容字段的杂物，防止污染卡片库
        const isCharacterCardData = (data) => {
            if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

            // 🚫 绝对拦截①：聊天记录（酒馆聊天导出常为数组，或含 messages / chat_metadata 字段）
            if (data.messages || data.chat_metadata) return false;

            // 🚫 绝对拦截②：独立世界书 —— 任何形态的 entries 都是世界书特征（数组 / 对象字典 / 字符串），
            //    以及 data.entries 嵌套结构（非 character_book），一律拦截。
            //    角色卡的世界书永远只在 data.character_book / data.data.character_book 内，绝不会是顶层或 data.entries。
            if (data.entries !== undefined) return false;
            if (data.data && typeof data.data === 'object' &&
                'entries' in data.data && !data.data.character_book) return false;

            // 🚫 绝对拦截③：酒馆 UI 主题 / 界面配置 JSON
            if (data.colors || data.user_settings) return false;

            // V2/V3：spec 标记（chara_card_v2/v3）且带 data 对象
            if (typeof data.spec === 'string' && /^chara_card_v[23]$/i.test(data.spec.trim())) {
                return !!(data.data && typeof data.data === 'object');
            }
            // V1 / Character.ai 格式：必须有角色名 + 至少一个内容字段
            if (typeof data.name === 'string' && data.name.trim() !== '') {
                // ✅ [补丁] 增加更严格的排他条件：酒馆 config.json 等标准配置文件即使带 name 也直接抛弃，
                // 防止其被误当成 V1 角色卡混入库中
                if (data.system_settings || data.api_keys || data.public_api) return false;

                return typeof data.description === 'string' ||
                       typeof data.personality === 'string' ||
                       typeof data.first_mes === 'string' ||
                       typeof data.scenario === 'string' ||
                       typeof data.mes_example === 'string';
            }
            return false;
        };

        // 🚀 v1.8.5 性能参数（App.vue 模块内共享）：
        //    - deferredAutoTagSaves：批量加载期收集的"自动打标待落盘"卡片列表
        //    - flushDeferredAutoTagSaves：加载完成后低并发后台写盘（不阻塞 UI 呈现）
        //    - opts.target：staging 暂存数组（批量加载完成后一次性赋给 library）
        //    - opts.deferAutoTagSave：批量加载路径置 true，跳过逐卡立即写盘
        const deferredAutoTagSaves = [];
        const flushDeferredAutoTagSaves = async () => {
            if (deferredAutoTagSaves.length === 0) return;
            const pending = deferredAutoTagSaves.splice(0, deferredAutoTagSaves.length);
            console.log(`⏳ 后台落盘自动打标卡片: ${pending.length} 张（低并发，不阻塞界面）`);
            const CONCURRENCY = 2; // 低并发：避免与用户交互争抢磁盘 IO
            for (let i = 0; i < pending.length; i += CONCURRENCY) {
                const batch = pending.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (cardInfo) => {
                    try {
                        await window.electronAPI.saveCard(cardInfo.path, JSON.parse(JSON.stringify(cardInfo.data)));
                    } catch (e) {
                        console.warn(`自动打标后台保存失败 [${cardInfo.name}]:`, e);
                    }
                }));
                await new Promise(r => setTimeout(r, 0)); // 批间让出主线程一拍
            }
            console.log(`✅ 自动打标后台落盘完成`);
        };

        const parseAndAddCard = async (file, opts = {}) => {
            try {
                // 去重拦截：同一路径的卡片已在库中则跳过（防止重复扫描/重复导入产生“影分身”）
                // 标记 _skippedExisting 供上层区分"已在库中"与"无法解析"，给出准确提示
                // 🚀 v1.8.5：批量加载（staging）时需同时查 staging 与 library ——
                //    加载窗口期手工导入与正在扫描的同路径卡若只查一边会双双入库（影分身）
                const dupIn = (arr) => arr.some(c => c.path === file.path);
                if (dupIn(opts.target || library.value) || (opts.target && dupIn(library.value))) {
                    file._skippedExisting = true;
                    return false;
                }

                let parsedData = null;

                if (file.name.toLowerCase().endsWith('.json')) {
                    // 🛡️ 优先使用内存内容（文件菜单导入已用 File API 读取，绕过 IPC 白名单）
                    let text = null;
                    if (typeof file.rawText === 'string') {
                        text = file.rawText;
                    } else if (window.electronAPI && typeof window.electronAPI.readText === 'function') {
                        const res = await window.electronAPI.readText(file.path);
                        // readText 返回 forbidden() 对象（{success:false}）时不能当文本解析
                        if (typeof res === 'string') text = res;
                        else console.warn(`读取 JSON 失败（可能路径不在白名单）: ${file.name}`, res && res.error);
                    }
                    if (text === null) return false;
                    const parsed = JSON.parse(text);
                    // 内容校验：非角色卡的 JSON（如 config.json）直接跳过，不进入解析与入库
                    if (!isCharacterCardData(parsed)) {
                        console.warn(`跳过非角色卡 JSON: ${file.name}`);
                        return false;
                    }
                    parsedData = parsed;
                } else if (file.embeddedData && typeof file.embeddedData === 'object') {
                    // 🚀 性能优化：主进程扫描已本地提取内嵌 card JSON，直接复用，
                    // 跳过整张 PNG 跨 IPC 读回（千卡库加载从几 GB 搬运降至几百 KB JSON）
                    parsedData = file.embeddedData;
                } else {
                    // 🛡️ 优先使用内存内容（文件菜单导入已用 File API 读取，绕过 IPC 白名单）
                    let buffer = null;
                    if (file.rawBuffer instanceof ArrayBuffer) {
                        buffer = file.rawBuffer;
                    } else if (file.rawBuffer instanceof Uint8Array) {
                        buffer = file.rawBuffer.buffer;
                    } else if (window.electronAPI && typeof window.electronAPI.readBuffer === 'function') {
                        const res = await window.electronAPI.readBuffer(file.path);
                        // readBuffer 返回 forbidden() 对象（{success:false}）时不能取 .buffer 解析
                        if (res && typeof res === 'object' && res.buffer) buffer = res.buffer;
                        else console.warn(`读取图片失败（可能路径不在白名单）: ${file.name}`, res && res.error);
                    }
                    if (!buffer) return false;
                    // 复用解析函数（Buffer 经 IPC 传递后为 Uint8Array，取 .buffer 为 ArrayBuffer）
                    parsedData = parsePNGChunk(buffer) || deepScanForJSON(buffer);
                }

                if (parsedData) {
                    const normalized = normalizeCardData(parsedData);
                    // 前端专用唯一随机 ID（时间戳 + 随机串），保证 Vue key / 多选 / 图谱标识永不冲突
                    const cardId = 'card_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
                    const cardInfo = {
                        id: cardId,
                        path: file.path, // 保留真实绝对路径，供保存/删除/导出等文件操作使用
                        fileName: file.name, // 📄 物理文件名（含扩展名，供 file: 语法搜索与显示）
                        name: normalized.data?.name || parsedData.name || '未命名',
                        creator: normalized.data?.creator || '未知',
                        avatar: file.url, // 通过 local-file:// 协议展示本地图片
                        data: normalized,
                        category: '未分类',
                        customTags: [],
                        // 【修复 BUG-1】"最新"排序基准：扫描路径带真实物理 mtime/birthtime；
                        // 内存导入路径（拖拽/文件菜单/全盘收编）无物理时间 → 以当前时间为准，
                        // 保证新导入的卡在"最新"排序中正确排到最前（否则回退 create_date 可能排到旧卡后面）
                        _mtime: file.mtime || Date.now(),
                        _ctime: file.birthtime || 0, // 物理文件创建时间（mtime 缺失时排序回退）
                        subFolder: file.subFolder || '' // 相对库根的文件夹路径（'' = 根目录；物理分组用）
                    };

                    // 【唯一性洗礼】防御性兜底：确保 id 永不缺失、也永不与 name 相同
                    // （正常路径已生成随机 id；此守卫防止未来重构/新导入路径引入 id 复用或丢失的回归）
                    if (!cardInfo.id || cardInfo.id === cardInfo.name) {
                        cardInfo.id = cardInfo.path || `${cardInfo.name}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    }

                    // 触发自动标签和分类（会优先应用导入的历史配置）
                    const oldTagsLen = (cardInfo.customTags || []).length;
                    const oldCategory = cardInfo.category;
                    processAutoTagsAndCategory(cardInfo);
                    // 🚀 v1.8.5 性能修复：批量加载路径推入 staging 暂存数组（加载完成后一次性
                    //    赋给 library），避免每 push 一张就触发全库 computed（filteredLibrary/
                    //    globalAllWorldbooks 等）失效风暴 —— 千卡库加载期 O(N²) 重算主因之一。
                    (opts.target || library.value).push(cardInfo);

                    // ✅ [补丁] 如果自动分类/打标签使数据发生了变更，必须覆盖物理文件！
                    // （否则新卡导入的自动标签/分类只活在内存，重启后全部丢失）
                    // 🚀 v1.8.5 性能修复：批量加载路径（deferAutoTagSave）不再逐卡立即写盘 ——
                    //    旧版启动加载 = 千张卡 × (整 PNG 读回 + 重写 + 快照备份) 的 I/O 风暴，
                    //    直接把启动拖到分钟级并伴随「未响应」。现在只收集，加载完成后由
                    //    flushDeferredAutoTagSaves 低并发后台落盘，UI 秒开。
                    if (oldCategory !== cardInfo.category || oldTagsLen !== (cardInfo.customTags || []).length) {
                        if (window.electronAPI && !/\.json$/i.test(cardInfo.path)) {
                            // 只写入原生 data 的 tags，保证卡片格式不被污染
                            const dataLayer = cardInfo.data?.data || cardInfo.data || {};
                            dataLayer.tags = Array.from(new Set([...(dataLayer.tags || []), ...(cardInfo.customTags || [])]));
                            if (opts.deferAutoTagSave) {
                                deferredAutoTagSaves.push(cardInfo);
                            } else {
                                try {
                                    await window.electronAPI.saveCard(cardInfo.path, JSON.parse(JSON.stringify(cardInfo.data)));
                                } catch (e) {
                                    console.warn(`自动打标物理保存失败 [${cardInfo.name}]:`, e);
                                }
                            }
                        }
                    }
                    return true;
                }
            } catch (err) {
                console.warn(`跳过文件 ${file.name}`, err);
            }
            return false;
        };

        // 统一处理主进程传来的文件列表（并发受限批处理：每批最多 8 张并行解析，
        // 大幅加速启动加载，同时避免一次性并发读取几百张 PNG 导致磁盘 I/O 尖峰）
        // 🚀 v1.8.5 性能修复：
        //    ① 解析结果先推入 staging 暂存数组，全部完成后【一次性】赋给 library ——
        //       旧版逐张 library.value.push 会让依赖 library 的全库 computed
        //       （filteredLibrary / globalAllWorldbooks / globalAllRegexScripts）
        //       在加载期间反复失效+重算，千卡库 = 千次 O(N) 重算 ≈ O(N²) 开销，
        //       且每次重算都在主线程排序/拼接大字符串 → 输入卡顿、界面冻结；
        //    ② 自动打标产生的物理写盘延迟到加载完成后低并发后台执行（见
        //       flushDeferredAutoTagSaves），启动路径彻底告别「千卡读写 I/O 风暴」。
        const processElectronFiles = async (folderData) => {
            if (!folderData || !folderData.files) return;

            currentFolderPath.value = folderData.folderPath;
            // 🧹 释放旧卡片 blob URL（浏览器降级导入的卡片用 blob: 临时地址，重建库后无人引用 → 泄漏；local-file 永久路径无需 revoke）
            library.value.forEach(c => {
                if (c.avatar && typeof c.avatar === 'string' && c.avatar.startsWith('blob:')) {
                    try { URL.revokeObjectURL(c.avatar); } catch (e) { /* 忽略 */ }
                }
            });
            library.value = [];

            // 📁 物理子文件夹 = 分组：自动并入自定义分组列表（去重），刷新后立即可见
            if (Array.isArray(folderData.categories)) {
                folderData.categories.forEach(cat => {
                    if (cat && cat.trim() !== '' && !customCategories.value.includes(cat) && !isCategoryKnown(cat)) {
                        customCategories.value.push(cat);
                    }
                });
            } // 清空当前库
            let addedCount = 0;

            const staging = []; // 🚀 暂存数组：加载完成前不触发任何全库 computed
            const CONCURRENCY = 8;
            const files = folderData.files;
            for (let i = 0; i < files.length; i += CONCURRENCY) {
                const batch = files.slice(i, i + CONCURRENCY);
                const results = await Promise.all(batch.map(file => parseAndAddCard(file, {
                    target: staging,             // 推入暂存数组而非 library
                    deferAutoTagSave: true       // 写盘延迟到加载完成后批量执行
                })));
                addedCount += results.filter(Boolean).length;
            }
            // 🚀 一次性并入（分块 push，同一同步批内 computed 只重算一次）。
            //    ⚠️ 不能写 `library.value = staging` 整体换引用：加载窗口（大库数秒~数十秒）
            //    期间拖拽导入 / 文件菜单导入 / URL 下载等不带 opts 的 parseAndAddCard
            //    会直接 push 进 library.value 当前数组 —— 整体换引用会把这些卡连同
            //    旧数组一起丢弃（提示导入成功但卡从界面消失，须手动刷新才找回）。
            //    分块 push 保留这些窗口期卡片，且不损失"一次性失效"的 computed 优化。
            for (let i = 0; i < staging.length; i += 500) {
                library.value.push(...staging.slice(i, i + 500));
            }
            console.log(`成功从 ${folderData.folderPath} 加载了 ${addedCount} 张卡片`);
            // 🚀 自动打标落盘转后台低并发执行，不阻塞首屏呈现
            flushDeferredAutoTagSaves();
        };

        // 💽 磁盘卡片扫描 已拆分为组合式函数 useDiskScan（见下文 setup 尾部调用）

        // 【关键】软件启动时，自动无感加载上次的文件夹（Electron 环境）
        // 🔧 全局监听引用（供 onUnmounted 清理，文档第 2 节轻微项：根组件全局监听无 onUnmounted 移除）
        let _gClickHandler = null;
        let _gKeysHandler = null;
        let _eKeysHandler = null;
        onUnmounted(() => {
            if (_gClickHandler) window.removeEventListener('click', _gClickHandler);
            if (_gKeysHandler) window.removeEventListener('keydown', _gKeysHandler);
            if (_eKeysHandler) window.removeEventListener('keydown', _eKeysHandler);
        });
        onMounted(async () => {
            // =========================================================
            // 🛡️ 统一持久化中枢装载：从 app_config.json（最高权威）恢复全部全局状态
            // 覆盖 localStorage 初始化值——生产模式 app:// 的 localStorage 不持久，物理文件才是权威。
            // ⚠️ 关键：IPC 返回的是纯 JSON 对象（无 Proxy），可直接赋给 ref。
            // =========================================================
            try {
                if (window.electronAPI && typeof window.electronAPI.loadAppConfig === 'function') {
                    const cfg = await window.electronAPI.loadAppConfig();
                    if (cfg && typeof cfg === 'object') {
                        isRestoringConfig = true; // 🛡️ 恢复期间统一禁止写盘（防竞态自污染，任何恢复值都不回写磁盘）
                        try {
                            // 全局标签池（globalTags）
                            // 🐛 修复「删除标签后重启复发」：app_config.json 是唯一权威，必须【整体替换】而非【并集合并】。
                            //    否则生产模式(app://)下 localStorage 不持久、初始化回退到内置默认池，
                            //    并集会把「已删除的默认标签」重新带回（"一键清空"也会被忽略）。
                            if (Array.isArray(cfg.globalTags)) {
                                const cleanTags = cfg.globalTags.filter(t => typeof t === 'string' && t.trim() !== '');
                                systemCommonTags.value = Array.from(new Set(cleanTags));
                            }
                            // 自定义分组（空数组也要覆盖，尊重「全部删除」结果）
                            if (Array.isArray(cfg.customCategories)) {
                                const clean = cfg.customCategories.filter(c => typeof c === 'string' && c.trim() !== '');
                                customCategories.value = clean;
                            }
                            // 删除/重命名的预设分组记录
                            if (Array.isArray(cfg.removedDefaultKeys)) {
                                removedDefaultKeys.value = cfg.removedDefaultKeys;
                                defaultCategories.value = allDefaultCategories.filter(c => !removedDefaultKeys.value.includes(c.key));
                            }
                            // 标签语言模式
                            if (cfg.tagLangMode === 'cn' || cfg.tagLangMode === 'en' || cfg.tagLangMode === 'both') {
                                tagLangMode.value = cfg.tagLangMode;
                            }
                            // 卡片属性物理覆盖表（防重扫冲刷的核心数据）
                            if (cfg.cardOverlays && typeof cfg.cardOverlays === 'object') {
                                appConfig.value.cardOverlays = cfg.cardOverlays;
                            }
                            // API 配置（空串也要覆盖，尊重「清空」结果）
                            if (cfg.api && typeof cfg.api === 'object') {
                                if (typeof cfg.api.endpoint === 'string') apiEndpoint.value = cfg.api.endpoint;
                                if (typeof cfg.api.key === 'string') {
                                    apiKey.value = cfg.api.key;
                                    // 🔐 解密后使用（代码审查修复 2）：兼容旧明文——解密失败回退原值
                                    if (cfg.api.key && window.electronAPI && typeof window.electronAPI.decryptSecret === 'function') {
                                        try {
                                            const dec = await window.electronAPI.decryptSecret(cfg.api.key);
                                            if (dec && dec.success && typeof dec.value === 'string') apiKey.value = dec.value;
                                        } catch (e) { /* 回退明文 */ }
                                    }
                                }
                                if (typeof cfg.api.model === 'string') apiModel.value = cfg.api.model;
                                if (cfg.api.type === 'anthropic' || cfg.api.type === 'openai') apiType.value = cfg.api.type;
                            }
                            // 🧩 UI 状态恢复（app_config.json 权威）
                            if (cfg.ui && typeof cfg.ui === 'object') {
                                if (typeof cfg.ui.theme === 'string' && cfg.ui.theme) theme.value = cfg.ui.theme;
                                if (cfg.ui.appSettings && typeof cfg.ui.appSettings === 'object') {
                                    appSettings.value = { ...appSettings.value, ...cfg.ui.appSettings };
                                }
                                if (typeof cfg.ui.sanitizeImportedTags === 'boolean') sanitizeImportedTags.value = cfg.ui.sanitizeImportedTags;
                                if (cfg.ui.snapshotConfig && typeof cfg.ui.snapshotConfig === 'object') {
                                    snapshotConfig.value = { ...snapshotConfig.value, ...cfg.ui.snapshotConfig };
                                }
                                if (cfg.ui.localCategoryMap && typeof cfg.ui.localCategoryMap === 'object') {
                                    localCategoryMap.value = { ...localCategoryMap.value, ...cfg.ui.localCategoryMap };
                                }
                                if (typeof cfg.ui.sidebarWidth === 'number') sidebarWidth.value = cfg.ui.sidebarWidth;
                                if (cfg.ui.viewMode === 'list' || cfg.ui.viewMode === 'grid') viewMode.value = cfg.ui.viewMode;
                                if (typeof cfg.ui.isCompactMode === 'boolean') isCompactMode.value = cfg.ui.isCompactMode;
                                if (['name', 'time', 'tokens'].includes(cfg.ui.sortBy)) sortBy.value = cfg.ui.sortBy;
                                if (Array.isArray(cfg.ui.systemPromptPresets) && cfg.ui.systemPromptPresets.length) {
                                    systemPromptPresets.value = cfg.ui.systemPromptPresets;
                                }
                                if (typeof cfg.ui.lastWorldbookDirPath === 'string') lastWorldbookDirPath.value = cfg.ui.lastWorldbookDirPath;
                                if (cfg.ui.wbCategoryMap && typeof cfg.ui.wbCategoryMap === 'object') {
                                    wbCategoryMap.value = { ...wbCategoryMap.value, ...cfg.ui.wbCategoryMap };
                                }
                            }
                        } finally {
                            isRestoringConfig = false;
                        }
                    }
                } else if (window.electronAPI && typeof window.electronAPI.getUiSettings === 'function') {
                    // 旧版兼容回退：从 tavern_manager_config.json 的 uiSettings 读取（无 app_config.json 的旧环境）
                    const ui = await window.electronAPI.getUiSettings();
                    if (ui) {
                        if (Array.isArray(ui.customCategories)) {
                            const clean = ui.customCategories.filter(c => typeof c === 'string' && c.trim() !== '');
                            if (clean.length) customCategories.value = clean;
                        }
                        if (Array.isArray(ui.removedDefaultKeys)) {
                            removedDefaultKeys.value = ui.removedDefaultKeys;
                            // 按最新删除/重命名记录重新过滤生效预设
                            defaultCategories.value = allDefaultCategories.filter(c => !removedDefaultKeys.value.includes(c.key));
                        }
                        if (ui.tagLangMode === 'cn' || ui.tagLangMode === 'en' || ui.tagLangMode === 'both') {
                            tagLangMode.value = ui.tagLangMode;
                        }
                        if (ui.localCategoryMap && typeof ui.localCategoryMap === 'object') {
                            localCategoryMap.value = ui.localCategoryMap;
                        }
                    }
                }
            } catch (e) { /* 忽略 */ }

            // 📸 恢复权威快照配置（app_config.json）后、加载卡片触发 saveCard 之前，
            //    再把正确配置同步到主进程——防止用 localStorage 默认值反向覆盖主进程、
            //    以及启动加载卡片时误生成自动快照。
            await saveSnapshotSettings();

            _gClickHandler = handleGlobalClick;
            window.addEventListener('click', _gClickHandler); // 点击任意处关闭右键菜单
            applyTheme(theme.value); // 应用已保存的主题

            // 全局快捷键：Ctrl+S 保存 / Ctrl+O 打开角色库 / Ctrl+I 导入卡片
            const handleGlobalKeys = (e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const k = e.key.toLowerCase();
                if (k === 's') { e.preventDefault(); saveCurrentAsset(); } // 【修复】Ctrl+S 走智能保存路由，避免世界书模式下误保存角色卡
                else if (k === 'o') { e.preventDefault(); selectFixedDirectory(); }
                else if (k === 'i') { e.preventDefault(); importCards(); }
                else if (k === 'a') {
                    // 批量模式下全选（输入框内不拦截，保留原生全选文本能力）
                    const tag = document.activeElement?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                    e.preventDefault();
                    selectAllCards();
                }
            };
            _gKeysHandler = handleGlobalKeys;
            window.addEventListener('keydown', _gKeysHandler);

            // 🌟 扩展快捷键：Ctrl+F 聚焦搜索 / Delete 移入回收站 / Esc 退出多选或关闭预览
            const handleExtendedKeys = async (e) => {
                const tag = document.activeElement?.tagName;
                const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA';

                // Ctrl+F：聚焦全局搜索框（即使已在输入框也允许，覆盖浏览器默认查找）
                if (e.ctrlKey && e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    const searchInput = document.getElementById('global-search-input');
                    if (searchInput) { searchInput.focus(); searchInput.select(); }
                    return;
                }

                // Delete 键：移入回收站（输入框内不拦截，保留文本删除能力）
                if (e.key === 'Delete' && !isInputFocused) {
                    if (isMultiSelectMode.value && selectedIds.value.length > 0) {
                        // 批量移入全局回收站
                        const ok = await confirmDialog(`确定将选中的 ${selectedIds.value.length} 张卡片移入回收站吗？`);
                        if (ok) {
                            const paths = library.value
                                .filter(i => selectedIds.value.includes(i.id))
                                .map(i => i.path);
                            const res = await window.electronAPI.trashFiles(paths);
                            if (res && res.success) {
                                library.value = library.value.filter(i => !selectedIds.value.includes(i.id));
                                selectedIds.value = [];
                                await cleanupEmptyCategories(); // 🧹 自动清理空分组
                                showToast(`已移入回收站 ${paths.length} 张卡片`, 'info');
                            }
                        }
                    } else if (cardData.value) {
                        // 当前打开的卡片移入回收站
                        const libItem = library.value.find(item => item.data === cardData.value);
                        if (libItem) deleteCardItem(libItem);
                    }
                    return;
                }

                // Esc 键：关闭图片预览 / 退出多选模式
                if (e.key === 'Escape') {
                    if (showImageModal.value) { showImageModal.value = false; }
                    else if (isMultiSelectMode.value) {
                        isMultiSelectMode.value = false;
                        selectedIds.value = [];
                        showToast('已退出多选模式', 'info', 1500);
                    }
                }
            };
            _eKeysHandler = handleExtendedKeys;
            window.addEventListener('keydown', _eKeysHandler);

            if (!window.electronAPI) {
                // 【健壮性】纯浏览器环境（无 preload）也应放行加载蒙版，避免永久卡在加载画面
                isAppLoading.value = false;
                return;
            }
            try {
                const lastData = await window.electronAPI.loadConfig();
                if (lastData && lastData.folderPath) {
                    await processElectronFiles(lastData);
                }
            } catch (err) {
                console.warn('自动加载上次文件夹失败', err);
            }

            // 🌍 自动记忆恢复上次的世界书目录（静默扫描，无需手动选择）
            if (lastWorldbookDirPath.value) {
                try {
                    await scanWorldbookDir(lastWorldbookDirPath.value);
                    addLog(`📂 自动记忆载入世界书库: ${lastWorldbookDirPath.value}`);
                } catch (err) {
                    console.warn('自动加载世界书目录失败', err);
                }
            }

            // 数据加载完毕，淡出启动加载蒙版
            isAppLoading.value = false;

            // 🚀 后台静默检测更新（延迟 3 秒，不卡首屏；无新版本不打扰）
            setTimeout(() => { silentCheckForUpdates(); }, 3000);
        });

        // 手动贴标签（单张卡片：内存 customTags + 原生 data.tags 双写，并物理落盘）
        const addManualTag = async (item) => {
            const newTag = await appPrompt(`为 ${item.name} 添加新标签 (多个标签用逗号分隔):`);
            if (newTag) {
                const tags = newTag.split(',').map(t => t.trim()).filter(t => t);
                let isModified = false;

                // 1. 内存自定义标签层
                const newCustom = Array.from(new Set([...(item.customTags || []), ...tags]));
                if (newCustom.length !== item.customTags?.length) {
                    item.customTags = newCustom;
                    isModified = true;
                }

                // 2. 原生 data.tags 层（兼容 V1/V2）
                const dataLayer = item.data?.data || item.data || {};
                if (!Array.isArray(dataLayer.tags)) dataLayer.tags = [];
                const newDataTags = Array.from(new Set([...dataLayer.tags, ...tags]));
                if (newDataTags.length !== dataLayer.tags.length) {
                    dataLayer.tags = newDataTags;
                    isModified = true;
                }

                // 3. 统一持久化中枢：写覆盖层 + 物理落盘（防止内存/PNG 单点失败丢数据）
                if (isModified) {
                    await persistCardUpdate(item, { tags: item.customTags, category: item.category });
                }
            }
        };

        // 换页逻辑
        // （changePage 已拆分为组合式函数 useSearch）
        // ================= [ 方法：导出/导入 本地库文件 ] =================

        // 1. 导出数据库文件 (Backup Library)
        const exportLibraryDB = () => {
            if (library.value.length === 0) return nativeAlert("当前库为空，没有需要导出的内容。", 'warning');

            // 只保存关键配置（不保存庞大的图片数据，保持文件轻量）
            const dbData = {
                version: "1.0",
                categories: customCategories.value,
                cardsConfig: {}
            };

            library.value.forEach(item => {
                // 使用卡片名称作为唯一标识符
                dbData.cardsConfig[item.name] = {
                    category: item.category,
                    customTags: item.customTags
                };
            });

            const jsonStr = JSON.stringify(dbData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `SillyTavern_Library_DB.json`; // 下载到本地的数据库文件
            a.click();
            URL.revokeObjectURL(a.href);
        };

        // 2. 加载数据库文件 (Load Library)
        const importLibraryDB = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const dbData = JSON.parse(text);

                if (dbData.categories && Array.isArray(dbData.categories)) {
                    dbData.categories.forEach(c => {
                        // 🔧 修复：只接受「非空字符串」，杜绝空组 / 幽灵分组
                        if (typeof c !== 'string' || c.trim() === '') return;
                        if (!isCategoryKnown(c)) {
                            customCategories.value.push(c);
                        }
                    });
                }
                if (dbData.cardsConfig) {
                    importedConfig.value = dbData.cardsConfig;

                    // 如果当前库里已经有卡片了，立即应用配置
                    library.value.forEach(item => {
                        const config = importedConfig.value[item.name];
                        if (config) {
                            item.category = (typeof config.category === 'string' && config.category.trim() !== '')
                                ? config.category.trim()
                                : item.category;
                            // 🔧 修复：标签只保留「非空字符串」，杜绝空/脏标签注入
                            item.customTags = Array.isArray(config.customTags)
                                ? Array.from(new Set(config.customTags.filter(t => typeof t === 'string' && t.trim() !== '')))
                                : item.customTags;
                        }
                    });
                }
                nativeAlert("库配置导入成功！请点击【读取本地文件夹】扫描你的图片，系统会自动恢复标签和分类。", 'info');
            } catch (err) {
                nativeAlert("导入失败，无效的库文件格式。", 'error');
            }
            e.target.value = '';
        };

        // 从库中点击打开卡片
        const openFromLibrary = (item) => {
            // 🧹 切换卡片时释放上一张卡的 blob 预览（仅 blob: 引用需 revoke；local-file 永久路径无需）
            if (imgUrl.value && imgUrl.value.startsWith('blob:') && imgUrl.value !== (item && item.avatar)) {
                try { URL.revokeObjectURL(imgUrl.value); } catch (e) { /* 忽略 */ }
            }
            cardData.value = item.data;
            imgUrl.value = item.avatar;
            currentTab.value = 'basic';
            // 【关键修复】切换卡片时强制清空聊天记录，确保下次进入聊天 Tab 时重新加载新卡的设定
            chatHistory.value = [];
            // 同时重置世界书折叠状态，避免上一张卡的展开状态残留
            worldbookExpanded.value = {};
            window.scrollTo({ top: 0, behavior: 'smooth' }); // 滚动到顶部查看
        };

        // ✅ 选择逻辑（handleCardClick/toggleSelection/clearSelection）与批量操作悬浮台已拆分为组合式函数 useBatch（见下文 setup 尾部调用）

        // ================= 交互优化：多选开关与右键菜单 =================
        const isMultiSelectMode = ref(false); // 默认隐藏批量复选框

        // ================= [ 视图模式状态（列表 / 网格） ] =================
        // 默认优先读取用户的历史偏好，没有则默认 'list'
        const viewMode = ref((() => {
            try { return localStorage.getItem('jsTavernViewMode') || 'list'; } catch (e) { /* 忽略 */ }
            return 'list';
        })());

        // 切换视图并持久化保存（用户下次打开依然是自己喜欢的视图）
        const toggleViewMode = () => {
            viewMode.value = viewMode.value === 'list' ? 'grid' : 'list';
            try { localStorage.setItem('jsTavernViewMode', viewMode.value); } catch (e) { /* 忽略 */ }
        };

        // ✅ [UI 瘦身] 列表紧凑模式（隐藏副行/缩头像，一屏显示更多卡片；localStorage 持久化）
        const isCompactMode = ref((() => {
            try { return localStorage.getItem('jsTavernCompactMode') === '1'; } catch (e) { return false; }
        })());
        watch(isCompactMode, (v) => {
            try { localStorage.setItem('jsTavernCompactMode', v ? '1' : '0'); } catch (e) { /* 忽略 */ }
        });

        // ✅ [UI 方案1] 列表排序方式：'name' 名称 | 'time' 最新 | 'tokens' Token（localStorage 持久化）
        const sortBy = ref((() => {
            try {
                const s = localStorage.getItem('jsTavernSortBy');
                return ['name', 'time', 'tokens'].includes(s) ? s : 'name';
            } catch (e) { return 'name'; }
        })());
        watch(sortBy, (v) => {
            try { localStorage.setItem('jsTavernSortBy', v); } catch (e) { /* 忽略 */ }
        });

        // 右键菜单状态
        const contextMenu = ref({
            visible: false,
            x: 0,
            y: 0,
            item: null
        });

        // 打开右键菜单（带边缘碰撞检测，防止菜单超出屏幕）
        const openContextMenu = (event, item) => {
            event.preventDefault(); // 阻止浏览器默认右键菜单
            if (wbContextMenu.value && wbContextMenu.value.show) closeWbContextMenu(); // 先收起世界书右键菜单
            let x = event.clientX;
            let y = event.clientY;
            // 假设右键菜单最大宽度 210px，最大高度 320px
            if (x + 210 > window.innerWidth) x = window.innerWidth - 210;
            if (y + 320 > window.innerHeight) y = window.innerHeight - 320;
            contextMenu.value = {
                visible: true,
                x: Math.max(x, 4),
                y: Math.max(y, 4),
                item: item
            };
        };

        // 关闭右键菜单
        const closeContextMenu = () => {
            contextMenu.value.visible = false;
        };

        // 📁 右键快速移动分组已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // 右键菜单：导出单张卡片（复制到用户选择的目录）
        const exportCard = async (item) => {
            if (!item) return;
            try {
                const res = await window.electronAPI.exportBatchPackage([item.path]);
                if (res.success) {
                    nativeAlert(`单卡导出成功！\n已导出至:\n${res.exportDir}`, 'info');
                } else if (res.error !== "用户取消操作") {
                    nativeAlert(`导出失败: ${res.error}`, 'error');
                }
            } catch (e) {
                nativeAlert(`发生错误: ${e.message}`, 'error');
            }
        };

        // 右键菜单：删除指定卡片（移入回收站，独立于当前打开的卡片）
        const deleteCardItem = async (item) => {
            if (!item) return;
            const { response } = await window.electronAPI.showMessage({
                type: 'warning', title: '安全删除提示',
                message: `确定要将卡片 [${item.name}] 移入回收站吗？\n(文件将被放入目录下的 .trash 文件夹中，支持手动找回)`,
                buttons: ['移入回收站', '取消'], cancelId: 1
            });
            if (response === 0) {
                const res = await window.electronAPI.deleteFile(item.path);
                if (res.success) {
                    library.value = library.value.filter(i => i.id !== item.id);
                    // 如果删除的正是当前打开的卡片，关闭编辑面板
                    if (cardData.value && item.data === cardData.value) reset();
                    await cleanupEmptyCategories(); // 🧹 自动清理空分组
                    nativeAlert("卡片已安全移入本地回收站。", "info");
                } else {
                    nativeAlert("操作失败: " + res.error, "error");
                }
            }
        };

        // 点击页面任意地方自动关闭右键菜单（角色卡 + 世界书共用）
        const handleGlobalClick = () => {
            if (contextMenu.value.visible) {
                closeContextMenu();
            }
            if (wbContextMenu.value && wbContextMenu.value.show) {
                closeWbContextMenu();
            }
        };

        // =========================================================
        // 🖱️ 右键菜单：增强原生操作（资源管理器定位/物理副本/AI打标/安全回收站）
        // =========================================================
        const handleContextMenuAction = async (action) => {
            const card = contextMenu.value.item;
            if (!card) return;
            closeContextMenu(); // 立即收起菜单

            try {
                switch (action) {
                    case 'openFolder':
                        // 调用系统资源管理器定位文件
                        await window.electronAPI.showItemInFolder(card.path);
                        addLog(`📁 已在资源管理器中定位: ${card.name}`, 'info');
                        break;

                    case 'duplicate': {
                        // 创建卡片物理副本（时间戳后缀）
                        const dupRes = await window.electronAPI.duplicateFile(card.path);
                        if (dupRes && dupRes.success) {
                            addLog(`📋 已成功创建卡片副本: ${card.name}`, 'success');
                            nativeAlert(`【${card.name}】的副本已创建！\n请点击左上角[文件]->[打开角色库目录]刷新查看。`, 'info');
                        } else {
                            throw new Error((dupRes && dupRes.error) || '复制失败');
                        }
                        break;
                    }

                    case 'aiTag': {
                        // 单卡快捷唤起 AI 打标（无需多选模式）
                        // 【修复】若右键的卡片已在多选列表中则保留多选状态，否则才重置为单卡选择
                        if (!selectedIds.value.includes(card.id)) {
                            selectedIds.value = [card.id];
                        }
                        openAITagModal();
                        addLog(`🤖 已为 [${card.name}] 唤起 AI 打标`, 'info');
                        break;
                    }

                    case 'snapshots': {
                        // 📸 查看该卡片的历史快照并支持一键恢复
                        await openSnapshotModal(card);
                        break;
                    }

                    case 'trash': {
                        // 安全移入全局回收站（userData/jsTavern_Trash，绝不物理删除）
                        // ⚠️ 必须用 confirmDialog（window.confirm 在 Electron 中静默返回 null）
                        const ok = await confirmDialog(`确定要将【${card.name}】移入安全回收站吗？\n(可在 文件(F)->查看回收站 找回)`);
                        if (!ok) break;
                        const trashRes = await window.electronAPI.trashFiles([card.path]);
                        if (trashRes && trashRes.success) {
                            const wasCurrent = !!(cardData.value && card.data === cardData.value);
                            // 动态从内存中剔除，无需刷新
                            library.value = library.value.filter(c => c.path !== card.path);
                            if (wasCurrent) reset();
                            await cleanupEmptyCategories(); // 🧹 自动清理空分组
                            addLog(`🗑️ 已将卡片移入回收站: ${card.name}`, 'warning');
                            nativeAlert('已安全移入回收站。', 'info');
                        } else {
                            throw new Error((trashRes && trashRes.error) || '移入回收站失败');
                        }
                        break;
                    }
                }
            } catch (err) {
                nativeAlert(`操作失败: ${err.message}`, 'error');
                addLog(`❌ 右键操作失败: ${err.message}`, 'error');
            }
        };

        // ================= [ 方法：批量操作 ] =================
        // 📁 批量移动分类已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // 📁 批量移动分组（弹窗版）已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // ✅ 批量打包导出/批量删除/批量添加标签 已拆分为组合式函数 useBatch（见下文 setup 尾部调用）

        // 🧹 清理空分组已拆分为组合式函数 useCardGroups（见下文 setup 尾部调用）

        // ✅ 批量添加标签（batchAddTag）已拆分为组合式函数 useBatch（见下文 setup 尾部调用）

        // ================= [ 系统级常用标签池 (超级扩充版) ] =================
        // 统一数据源：批量设置弹窗与 AI 打标候选池共享（点击即加，无需手动输入）
        // 内置 40+ 精选分类标签；localStorage 键 customSystemTags 保存用户自定义标签（越用越懂你）
        const systemCommonTags = ref((() => {
            const defaults = [
                // 📌 1. 基础/性别 (Base/Gender)
                'Male (男性)', 'Female (女性)', 'Futa (扶她)', 'Non-binary (非二元)', 'Multiple Characters (多角色)',

                // 📌 2. 种族/物种 (Species)
                'Human (人类)', 'Elf (精灵)', 'Demon (恶魔)', 'Angel (天使)', 'Vampire (吸血鬼)',
                'Succubus/Incubus (魅魔/梦魇)', 'Furry (兽人/福瑞)', 'Monster (怪物/异种)', 'Android (仿生人/机娘)', 'Beastman (亚人/兽耳)',

                // 📌 3. 世界观/题材 (Genre/Setting)
                'Fantasy (奇幻/魔法)', 'Sci-Fi (科幻)', 'Cyberpunk (赛博朋克)', 'Steampunk (蒸汽朋克)',
                'Modern (现代都市)', 'Historical (历史/古代)', 'Post-Apocalyptic (末世/废土)',
                'Isekai (异世界/穿越)', 'School (校园)', 'Workplace (职场)', 'Cultivation (修仙/仙侠)',

                // 📌 4. 角色属性/XP/性格 (Personality/Tropes)
                'Yandere (病娇)', 'Tsundere (傲娇)', 'Kuudere (三无)', 'Submissive (顺从/M)', 'Dominant (强势/S)',
                'Maid/Butler (女仆/执事)', 'Villain (反派)', 'Master/Slave (主仆)', 'Royalty (皇室/贵族)',
                'Step-family (继亲)', 'Childhood Friend (青梅竹马)', 'MILF/Oyakodon (熟女/太太)',

                // 📌 5. 内容分级与基调 (Rating/Tone)
                'SFW (全年龄/安全)', 'NSFW (成人/敏感)', 'Wholesome (纯爱/温馨)', 'Dark (暗黑/虐心)',
                'Romance (恋爱)', 'Action (战斗/动作)', 'Horror (恐怖/悬疑)', 'Comedy (搞笑/轻松)',
                'Smut (搞颜色)', 'Slow Burn (慢热)', 'Corruption (堕落/恶堕)',

                // 📌 6. 卡片功能类型 (Card Type)
                'RPG (文字游戏/跑团)', 'Scenario (特定情景剧)', 'Narrator (旁白驱动)', 'Assistant (AI助手/工具卡)'
            ];
            // 优先读取 localStorage 中用户自定义的标签（越用越懂你）；无记录/损坏时回退默认池
            // 🐛 修复「删除标签后重启复发」：旧逻辑用「默认标签命中率 < 50% 即判定污染并回填默认」，
            //    删掉超过一半默认标签后，重启会把已删除的默认标签全部复活。
            //    现在：只要存在有效保存记录（含空数组 = 用户主动清空），一律尊重保存结果，绝不自动回填默认。
            try {
                const saved = JSON.parse(localStorage.getItem('customSystemTags'));
                if (Array.isArray(saved)) {
                    const clean = saved.filter(t => typeof t === 'string' && t.trim() !== '');
                    return Array.from(new Set(clean));
                }
            } catch (e) { /* 忽略 */ }
            return defaults;
        })());

        // 系统/常用标签库变化时自动持久化：统一配置中枢（app_config.json 唯一权威）+ localStorage 兜底（浏览器环境）
        // （写盘 guard 已内置于 syncConfigToDisk，启动恢复期间不会落盘）
        watch(systemCommonTags, (val) => {
            try { syncConfigToDisk(); } catch (e) { /* 忽略 */ }
            try { localStorage.setItem('customSystemTags', JSON.stringify(val)); } catch (e) { /* 忽略 */ }
        }, { deep: true });

        // ⚠️ 已移除 loadGlobalTagsFromDisk()：旧文件 tavern_manager_config.json 的读取路径与
        //    app_config.json 权威加载形成竞态（两个不同文件互相覆盖），是「删除标签重启复发」的根源。
        //    旧文件 globalTags 的迁移已在 main.js sys:loadConfig 首次启动时一次性完成，无需再读取。

        // ================= 标签中英文切换系统 =================
        // 标签语言模式: 'cn' (纯中文), 'en' (纯英文), 'both' (中英双语)
        // 【修复】localStorage 持久化，重启保持上次选择
        const tagLangMode = ref((() => {
            try {
                const saved = localStorage.getItem('jsTavern_tagLangMode');
                if (saved === 'cn' || saved === 'en' || saved === 'both') return saved;
            } catch (e) { /* 忽略 */ }
            return 'both';
        })());
        watch(tagLangMode, (v) => {
            try { localStorage.setItem('jsTavern_tagLangMode', v); } catch (e) { /* 忽略 */ }
            saveUiSettingsToDisk(); // 内部已走统一中枢 syncConfigToDisk
        });

        // 🏷️ 批量标签/预设标签/标签中英文切换/全局标签库 已拆分为组合式函数 useTags（见下文 setup 尾部调用）
        // 🧠 系统提示词预设（跨模块共享状态：被 syncConfigToDisk / 集中 watch 引用，保留在 App.vue；打标相关操作方法见 useAITools）
        const systemPromptPresets = ref((() => {
            try {
                const saved = JSON.parse(localStorage.getItem('jsTavernSysPrompts'));
                if (Array.isArray(saved) && saved.length > 0) return saved;
            } catch (e) { /* 忽略 */ }
            return [
                {
                    id: 'preset_1',
                    name: '标准标签提取助手',
                    content: '你是一个专业的角色卡分析助手。请阅读以下角色设定，提取最符合角色的标签。请严格只返回一个 JSON 数组格式（例如：["标签1", "标签2"]），绝对不要返回任何其他说明文字。',
                    expanded: false
                },
                {
                    id: 'preset_2',
                    name: '精简短标签模式 (2-4个)',
                    content: '你是一个精准的标签归纳专家。请为该角色提取 2-4 个极度精简的核心短标签。输出必须是纯 JSON 数组格式，形如 ["词1", "词2"]，不要附加任何解释。',
                    expanded: false
                }
            ];
        })());

        // ✨ AI 打标 / 翻译 / 格式升维 已拆分为组合式函数 useAITools（见下文 setup 尾部调用）

        // ================= [ 方法：重命名与导出世界书 ] =================

        // 重命名卡片
        const renameCard = async () => {
            if (!cardData.value) return;
            const currentName = safeData.value.name || '未命名';
            const newName = await appPrompt('请输入新的角色名称：', currentName);

            if (newName && newName.trim() !== '' && newName !== currentName) {
                const trimmedName = newName.trim();

                // 更新当前打开卡片的数据
                if (cardData.value.data) {
                    cardData.value.data.name = trimmedName;
                } else {
                    cardData.value.name = trimmedName;
                }

                // 如果该卡片存在于库中，同步更新库中的名称
                const libItem = library.value.find(item => item.data === cardData.value);
                if (libItem) {
                    libItem.name = trimmedName;
                }

                nativeAlert(`已成功重命名为: ${trimmedName}\n(提示: 点击顶部"导出 JSON"可将改名后的文件保存到本地)`, 'info');
            }
        };

        // 导出世界书 (Lorebook) 为独立的 JSON 文件
        const exportWorldbook = () => {
            if (!cardData.value) return;
            const book = safeData.value.character_book;

            // 🛡️ 全形态安全判定（数组 book 的 .entries 是原型方法函数，旧写法会误判长度为 0）
            if (extractBookEntries(book).length === 0) {
                return nativeAlert("此卡片没有世界书数据可供导出。", 'warning');
            }

            // 拷贝一份世界书数据
            const wbData = JSON.parse(JSON.stringify(book));
            // 如果原世界书没有名字，用角色名生成一个
            if (!wbData.name) {
                wbData.name = `${safeData.value.name || 'Character'}_Lorebook`;
            }

            const jsonStr = JSON.stringify(wbData, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${wbData.name}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        const reset = () => {
            cardData.value = null;
            if (imgUrl.value) URL.revokeObjectURL(imgUrl.value);
            imgUrl.value = null;
        };

        // 删除卡片（安全机制：移入本地回收站 .trash，可手动找回）
        const deleteCard = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;

            const { response } = await window.electronAPI.showMessage({
                type: 'warning', title: '安全删除提示',
                message: `确定要将卡片 [${safeData.value.name}] 移入回收站吗？\n(文件将被放入目录下的 .trash 文件夹中，支持手动找回)`,
                buttons: ['移入回收站', '取消'], cancelId: 1
            });

            if (response === 0) {
                const res = await window.electronAPI.deleteFile(libItem.path);
                if (res.success) {
                    library.value = library.value.filter(item => item.id !== libItem.id);
                    deleteCardOverlays([libItem.path]); // 🔧 同步清理覆盖层，防配置膨胀
                    reset();
                    nativeAlert("卡片已安全移入本地回收站。", "info");
                } else {
                    nativeAlert("操作失败: " + res.error, "error");
                }
            }
        };

        // 更新名称绑定 (处理 V1 / V2 差异)
        const updateName = (val) => {
            if (!cardData.value) return;
            if (cardData.value.data) cardData.value.data.name = val;
            else cardData.value.name = val;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem) libItem.name = val;
        };

        // ================= 单卡标签管理 =================
        // 弹窗状态（Electron 不支持 window.prompt，改用自建 Vue 弹窗输入）
        const tagModalVisible = ref(false);
        const tagInput = ref('');
        const tagModalTitle = ref('为当前角色添加新标签');

        // 获取当前正在编辑的卡片的标签
        const activeCardTags = computed(() => {
            const libItem = library.value.find(item => item.data === cardData.value);
            return libItem ? libItem.customTags : [];
        });

        const addSingleTag = () => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;
            tagInput.value = '';
            tagModalTitle.value = `为 ${libItem.name || '当前角色'} 添加新标签`;
            tagModalVisible.value = true;
            // 打开后自动聚焦输入框
            nextTick(() => {
                const el = document.getElementById('single-tag-input');
                if (el) el.focus();
            });
        };

        // 单卡手动输入贴标签（内存 customTags + 原生 data.tags 双写，并物理落盘）
        const confirmSingleTag = async () => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (libItem && tagInput.value.trim()) {
                const tags = tagInput.value.split(',').map(t => t.trim()).filter(t => t);
                let isModified = false;

                // 1. 更新内存自定义标签层
                const newCustom = Array.from(new Set([...(libItem.customTags || []), ...tags]));
                if (newCustom.length !== libItem.customTags?.length) {
                    libItem.customTags = newCustom;
                    isModified = true;
                }

                // 2. 同步到物理卡片原生的 data.tags 层（兼容 V1/V2）
                const dataLayer = libItem.data?.data || libItem.data || {};
                if (!Array.isArray(dataLayer.tags)) dataLayer.tags = [];
                const newDataTags = Array.from(new Set([...dataLayer.tags, ...tags]));
                if (newDataTags.length !== dataLayer.tags.length) {
                    dataLayer.tags = newDataTags;
                    isModified = true;
                }

                // 3. 统一持久化中枢：写覆盖层 + 物理落盘（防止内存/PNG 单点失败丢数据）
                if (isModified) {
                    await persistCardUpdate(libItem, { tags: libItem.customTags, category: libItem.category });
                }
            }
            tagModalVisible.value = false;
        };

        const closeSingleTagModal = () => {
            tagModalVisible.value = false;
        };

        // ================= 通用输入弹窗（替代 Electron 不支持的 window.prompt） =================
        const promptModalVisible = ref(false);
        const promptModalTitle = ref('');
        const promptInput = ref('');
        const promptModalDefault = ref('');
        let promptModalResolve = null; // 保存 promise 回调

        // 打开通用输入弹窗，返回 Promise<string|null>（取消返回 null）
        const appPrompt = (title, defaultValue = '') => {
            // 🔧 重入保护：上一个弹窗未关闭时先结清其 Promise（按取消处理），
            // 避免回调被覆盖导致第一个 await 永久挂起 + 闭包内存泄漏
            if (promptModalResolve) {
                promptModalResolve(null);
                promptModalResolve = null;
            }
            promptModalTitle.value = title;
            promptModalDefault.value = defaultValue;
            promptInput.value = defaultValue;
            promptModalVisible.value = true;
            nextTick(() => {
                const el = document.getElementById('app-prompt-input');
                if (el) el.focus();
            });
            return new Promise((resolve) => {
                promptModalResolve = resolve;
            });
        };

        const confirmPrompt = () => {
            if (promptModalResolve) promptModalResolve(promptInput.value);
            promptModalVisible.value = false;
            promptModalResolve = null;
        };

        const cancelPrompt = () => {
            if (promptModalResolve) promptModalResolve(null);
            promptModalVisible.value = false;
            promptModalResolve = null;
        };

        // 删除单卡某个标签（内存 customTags + 原生 data.tags 双清，并物理落盘）
        const removeSingleTag = async (tag) => {
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return;

            let isModified = false;

            // 1. 从自定义标签中移除
            if (libItem.customTags && libItem.customTags.includes(tag)) {
                libItem.customTags = libItem.customTags.filter(t => t !== tag);
                isModified = true;
            }

            // 2. 从原生数据层 tags 移除（兼顾旧版卡片的字符串格式）
            const dataLayer = libItem.data?.data || libItem.data || {};
            if (Array.isArray(dataLayer.tags) && dataLayer.tags.includes(tag)) {
                dataLayer.tags = dataLayer.tags.filter(t => t !== tag);
                isModified = true;
            } else if (typeof dataLayer.tags === 'string' && dataLayer.tags.includes(tag)) {
                dataLayer.tags = dataLayer.tags.split(',').map(t => t.trim()).filter(t => t && t !== tag).join(', ');
                isModified = true;
            }

            // 3. 统一持久化中枢：写覆盖层 + 物理落盘
            if (isModified) {
                await persistCardUpdate(libItem, { tags: libItem.customTags, category: libItem.category });
            }
        };

        // 将可能为 Vue 响应式 Proxy 的卡片数据转为可经 IPC 结构化克隆的纯 JSON 对象
        // （直接从左侧库打开时 cardData.value 是 reactive Proxy，直接传 IPC 会报 "An object could not be cloned"）
        const getPlainCardData = () => {
            if (!cardData.value) return null;
            return JSON.parse(JSON.stringify(cardData.value));
        };

        // 覆盖保存当前卡片到本地原文件（经 saveCard IPC）
        const saveToLocalDisk = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return nativeAlert("未找到原文件路径。");
            try {
                const res = await window.electronAPI.saveCard(libItem.path, getPlainCardData());
                if (res.success) {
                    // 🛡️ 覆盖保存后同步覆盖层，防止重扫冲刷本次改动
                    const key = (libItem.path || libItem.name || '').toString();
                    if (!appConfig.value.cardOverlays[key]) appConfig.value.cardOverlays[key] = {};
                    appConfig.value.cardOverlays[key].category = libItem.category || '未分类';
                    if (Array.isArray(libItem.customTags)) {
                        appConfig.value.cardOverlays[key].tags = [...libItem.customTags];
                    }
                    syncConfigToDisk();
                    showToast('角色卡保存成功！', 'success');
                }
                else nativeAlert(`保存失败: ${res.error}`, 'error');
            } catch (e) { nativeAlert(`发生错误: ${e.message}`, 'error'); }
        };

        // 一键导出整合包（主卡 + 独立世界书 + 正则脚本）
        const exportPackage = async () => {
            if (!cardData.value) return;
            const libItem = library.value.find(item => item.data === cardData.value);
            if (!libItem) return nativeAlert("未找到原文件路径。");
            
            try {
                const res = await window.electronAPI.exportPackage(libItem.path, getPlainCardData());
                if (res.success) {
                    nativeAlert(`整合包导出成功！\n已归档至目录:\n${res.exportDir}`, "info");
                } else if (res.error !== "用户取消操作") {
                    nativeAlert(`导出失败: ${res.error}`, "error");
                }
            } catch (e) {
                nativeAlert(`发生错误: ${e.message}`, "error");
            }
        };

        // =========================================================
        // 🌍 世界书管理器状态与逻辑（独立于角色卡库，主视图双引擎模式）
        // =========================================================

        // 视图切换模式：'characters' (角色卡) | 'worldbooks' (世界书)
        const appMode = ref('characters');

        const worldbooks = ref([]);          // 世界书列表
        const activeWorldbook = ref(null);   // 当前正在深度编辑的世界书

        // 记忆上次打开的世界书目录（localStorage 持久化，重启自动静默恢复）
        const lastWorldbookDirPath = ref((() => {
            try { return localStorage.getItem('jsTavern_lastWbDir') || ''; } catch (e) { return ''; }
        })());

        // =========================================================
        // 📟 全局终端控制台与日志状态（角色卡/世界书双模式共用）
        // =========================================================
        const editorLogs = ref([]);
        const showEditorLogs = ref(false); // 默认收起，点击控制杆可随时展开

        // 全局日志打印辅助函数
        const addLog = (msg, type = 'info') => {
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            editorLogs.value.unshift({ time, msg, type });
            if (editorLogs.value.length > 100) editorLogs.value.pop(); // 保留最新 100 条
        };

        // 🌍 世界书扫描与加载方法已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // 🌍 网址导入状态已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // =========================================================
        // 💾 统一 IPC 落盘拦截器：保证没有任何世界书只停留在内存中
        // ---------------------------------------------------------
        // 本应用每本世界书是独立的 .json 文件（非单个数据库文件）：
        //  - 重命名/删除必须按“文件路径”走物理 IPC（renameWorldbookFile / trashFiles）
        //  - 新增/克隆/导入已各自调用 createWorldbook 落盘
        // 因此这里只做“兜底”：把 path 为空（内存态）的世界书补齐保存到世界书目录。
        // ⚠️ 不采用“整体数组覆盖写”：每本书独立文件 + wb:save 每次保存都建快照，
        //    全量写会刷爆 .bak_history 备份目录。
        const syncWorldbooksToDisk = async () => {
            if (!window.electronAPI || typeof window.electronAPI.createWorldbook !== 'function') {
                console.warn('未检测到 Electron IPC 环境，仅在内存中修改。');
                return 0;
            }

            const pending = worldbooks.value.filter(wb => !wb.path);
            if (pending.length === 0) {
                addLog('💾 所有世界书均已落盘，无需同步。', 'info');
                return 0;
            }

            let saveDir = lastWorldbookDirPath.value;
            if (!saveDir) {
                addLog('请选择世界书保存目录以完成落盘...', 'warning');
                saveDir = await window.electronAPI.selectGenericFolder();
                if (saveDir) lastWorldbookDirPath.value = saveDir;
            }
            if (!saveDir) {
                addLog('用户取消选择目录，未能完成落盘。', 'warning');
                return 0;
            }

            let synced = 0;
            for (const wb of pending) {
                const plainData = JSON.parse(JSON.stringify(wb.data || {}));
                const safeFileName = (wb.name && wb.name.toLowerCase().endsWith('.json'))
                    ? wb.name
                    : `${(wb.name || 'worldbook').replace(/[\\/:*?"<>|]/g, '_')}.json`;
                const filePath = `${saveDir.replace(/[\\/]+$/, '')}\\${safeFileName}`;
                const res = await window.electronAPI.createWorldbook({ filePath, data: plainData });
                if (res && res.success) {
                    wb.path = filePath;
                    synced++;
                    addLog(`💾 已落盘: ${safeFileName}`, 'success');
                } else {
                    addLog(`⚠️ 落盘失败: ${(res && res.error) || '未知错误'} (${safeFileName})`, 'warning');
                }
            }
            if (synced > 0) {
                nativeAlert(`已将 ${synced} 本内存中的世界书保存到本地磁盘！`, 'info');
            }
            return synced;
        };

        // 🌍 网址导入世界书已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // 🌍 世界书重命名/文件夹导入/删除/克隆/右键菜单已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // 🌍 世界书文件夹导入/删除/克隆/右键菜单方法已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // 物理保存当前世界书
        const saveActiveWorldbook = async () => {
            if (!activeWorldbook.value) return;
            const wb = activeWorldbook.value;
            addLog(`准备落盘保存世界书: ${wb.name}...`);

            // 脱离 Proxy 代理进行序列化（避免 IPC "An object could not be cloned"），
            // 并剔除 IDE 展示字段 _collapsed 与前端临时 UID（酒馆原生世界书格式无 uid 字段）防污染
            const plainData = JSON.parse(JSON.stringify(wb.data));
            if (Array.isArray(plainData.entries)) {
                plainData.entries.forEach(e => {
                    if (!e) return;
                    if (e._collapsed !== undefined) delete e._collapsed;
                    if (e.uid !== undefined) delete e.uid;
                });
            }

            // 【修复】内存态世界书（path 为空，如网址导入后未落盘）先补齐物理文件再保存
            if (!wb.path) {
                await syncWorldbooksToDisk();
                if (!wb.path) {
                    addLog(`❌ 保存失败: 该书仍停留在内存，请先点击工具栏「💾 落盘」`, 'error');
                    nativeAlert(`世界书保存失败：该书仍在内存中，请先点击世界书工具栏的「💾 落盘」按钮，或重新导入时选择保存目录。`, 'error');
                    return;
                }
            }

            const res = await window.electronAPI.saveWorldbook({
                filePath: wb.path,
                data: plainData
            });

            if (res.success) {
                addLog(`✅ 保存成功: ${activeWorldbook.value.name}`, 'success');
                nativeAlert('世界书物理落盘保存成功！', 'info');
            } else {
                addLog(`❌ 保存失败: ${res.error}`, 'error');
                nativeAlert(`世界书保存失败: ${res.error}`, 'error');
            }
        };

        // 提供独立的世界书本地导出功能（方便开发测试时脱离环境发给别人；导出前剔除 _collapsed 防污染）
        const exportActiveWorldbook = () => {
            if (!activeWorldbook.value) return;
            const plainData = JSON.parse(JSON.stringify(activeWorldbook.value.data));
            if (Array.isArray(plainData.entries)) {
                plainData.entries.forEach(e => {
                    if (!e) return;
                    if (e._collapsed !== undefined) delete e._collapsed;
                    if (e.uid !== undefined) delete e.uid;
                });
            }
            const blob = new Blob([JSON.stringify(plainData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeWorldbook.value.name || 'worldbook_export.json';
            a.click();
            URL.revokeObjectURL(url);
            addLog(`已触发本地独立导出: ${a.download}`);
        };

        // ✂️ 轻量级世界书拆分引擎 (基于当前搜索结果/过滤词条)
        const exportFilteredWorldbook = () => {
            if (!activeWorldbook.value) return;

            const currentEntries = filteredWorldbookEntries.value;
            if (!currentEntries || currentEntries.length === 0) {
                nativeAlert('当前没有可导出的词条！', 'warning');
                return;
            }

            // 组装新世界书的 JSON 结构
            const suffix = entrySearchQuery.value ? `_${entrySearchQuery.value.trim()}篇` : '_完整导出';
            const newWbName = (activeWorldbook.value.data.name || '拆分世界书') + suffix;

            // 清洗 UI 字段（剥离 _ 前缀临时字段、前端临时 UID 与 Vue Proxy）
            const cleanEntries = JSON.parse(JSON.stringify(currentEntries, (key, val) => (key.startsWith('_') || key === 'uid') ? undefined : val));

            const exportData = {
                name: newWbName,
                description: `这是从原版世界书拆分出的子集。包含 ${cleanEntries.length} 个词条。`,
                entries: cleanEntries
            };

            // 触发浏览器下载
            const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${newWbName}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addLog(`✂️ 成功拆分并导出世界书: ${newWbName}.json`, 'success');
        };

        // 智能保存：世界书模式下保存世界书，角色卡模式下保存当前卡片（文件菜单共用入口）
        const saveCurrentAsset = async () => {
            // 【修复】严格隔离双模式保存上下文，杜绝跨模式幽灵误保存
            if (appMode.value === 'worldbooks') {
                if (activeWorldbook.value) return saveActiveWorldbook();
                return nativeAlert('当前没有打开的世界书。', 'warning');
            }
            if (cardData.value) return saveToLocalDisk();
            return nativeAlert('当前没有打开的角色卡。', 'warning');
        };

        // 📚 世界书词条深度编辑（Entry IDE）已拆分为组合式函数 useWorldbookEntries（见下文 setup 尾部调用）

        // =========================================================
        // 🎛️ 角色卡内嵌世界书（Character Book）细化操作
        // 针对 data.character_book.entries（V2 字段 keys/secondary_keys），
        // 与上方「独立世界书 IDE」的 activeWorldbook（V3 字段 key/keysecondary）区分
        // =========================================================
        const characterWorldbookSearchQuery = ref('');   // 词条关键字搜索（角色卡世界书 tab 专用）

        // 确保角色卡存在 character_book.entries，返回该数组（V2/V3 的 data 内，或 V1 顶层）
        const ensureCharacterBookEntries = () => {
            if (!cardData.value) return null;
            const target = safeData.value;
            if (!target.character_book || typeof target.character_book !== 'object') {
                target.character_book = { entries: [] };
            }
            if (!Array.isArray(target.character_book.entries)) {
                target.character_book.entries = [];
            }
            return target.character_book.entries;
        };

        // 搜索过滤后的角色卡世界书词条（触发词/次级词/备注/正文 全字段匹配）
        const filteredCharacterWorldbookEntries = computed(() => {
            const q = characterWorldbookSearchQuery.value.trim().toLowerCase();
            const list = worldbookEntries.value;
            if (!q) return list;
            return list.filter(entry => {
                if (!entry) return false;
                const keysStr = (Array.isArray(entry.keys) ? entry.keys.join(' ') : String(entry.keys || '')) + ' ' +
                                (Array.isArray(entry.secondary_keys) ? entry.secondary_keys.join(' ') : '');
                const text = `${entry.comment || entry.name || ''} ${entry.content || ''} ${keysStr}`.toLowerCase();
                return text.includes(q);
            });
        });

        // 新增空白词条（unshift 到最前）
        const addCharacterWorldbookEntry = () => {
            const entries = ensureCharacterBookEntries();
            if (!entries) return;
            entries.unshift({
                uid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                keys: [], secondary_keys: [], content: '', comment: '',
                constant: false, selective: false, insertion_order: 50,
                position: 1, enabled: true, order: 100
            });
            refreshCardData();
            addLog('➕ 新增了一条世界书词条', 'info');
        };

        // 删除词条（走原生 confirmDialog 确认）
        const deleteCharacterWorldbookEntry = async (entry) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));   // toRaw 找回原始对象（worldbookEntries 返回的是 reactive 代理）
            if (index === -1) return;
            const ok = await confirmDialog('确定要删除这条世界书设定吗？操作不可逆！');
            if (ok) {
                entries.splice(index, 1);
                refreshCardData();
                addLog('🗑️ 删除了一条世界书词条', 'warning');
            }
        };

        // 克隆词条（在后方插入副本）
        const duplicateCharacterWorldbookEntry = (entry) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));
            if (index === -1) return;
            const cloned = JSON.parse(JSON.stringify(entry));
            cloned.uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            cloned.comment = (cloned.comment || cloned.name || '词条') + ' (副本)';
            entries.splice(index + 1, 0, cloned);
            refreshCardData();
            addLog('📋 复制了一条世界书词条', 'info');
        };

        // 上移/下移（dir = -1 上移，+1 下移）
        const moveCharacterWorldbookEntry = (entry, dir) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));
            if (index === -1) return;
            const target = index + dir;
            if (target < 0 || target >= entries.length) return;
            const [item] = entries.splice(index, 1);
            entries.splice(target, 0, item);
            refreshCardData();
        };

        // 往词条 key 数组追加一个触发词（field: 'keys' | 'secondary_keys'）
        const addEntryKey = (entry, value, field = 'keys') => {
            if (!entry || !field) return;
            const v = String(value || '').trim().replace(/,$/, '').trim();
            if (!v) return;
            if (!Array.isArray(entry[field])) entry[field] = [];
            if (!entry[field].includes(v)) entry[field].push(v);
            refreshCardData();
        };

        // 从词条 key 数组移除一个触发词
        const removeEntryKey = (entry, value, field = 'keys') => {
            if (!entry || !field || !Array.isArray(entry[field])) return;
            entry[field] = entry[field].filter(k => k !== value);
            refreshCardData();
        };

        // 触发词输入框的回车/逗号处理（标签化输入）
        const handleEntryKeyInput = (entry, event, field = 'keys') => {
            if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addEntryKey(entry, event.target.value, field);
                event.target.value = '';
            }
        };

        // 写回 comment（兼容旧卡仅有 name 字段）
        const updateEntryComment = (entry, value) => {
            if (!entry) return;
            entry.comment = value;
            refreshCardData();
        };

        // 🔍 角色卡查重弹窗状态与方法已拆分为组合式函数 useDedupe（见下文 setup 尾部调用）

        // 计算单张卡片的设定丰度（与 cardTokenStats 口径对齐：叠加描述/首句/示例/性格/场景 + 世界书正文与触发词）
        // 🚀 v1.8.5 性能修复：WeakMap 结果缓存（key = 卡片 data 对象引用）。
        //    该函数被侧栏每个列表项渲染（itemTokenCount）+ tokens 排序比较器调用，
        //    旧版无缓存：千卡库一次 tokens 排序 = O(N log N) 次全量重算（每卡正则
        //    匹配 + 世界书全条目遍历），列表每次重渲再对全部可见项重算一遍 → 输入
        //    卡顿/界面冻结主因。卡片 data 引用在库内稳定，缓存命中率极高；
        //    编辑当前卡时由 refreshCardData 精确失效（WeakMap.delete）。
        const cardTokensCache = new WeakMap();
        const estimateCardTokens = (card) => {
            const dataKey = (card && (card.data || card)) || null;
            if (dataKey && typeof dataKey === 'object') {
                const cached = cardTokensCache.get(dataKey);
                if (cached !== undefined) return cached;
            }
            const d = card.data?.data || card.data || {};
            const text = [d.description, d.first_mes, d.mes_example, d.personality, d.scenario].filter(Boolean).join('\n');
            let total = estimateTokens(text);
            // 追加世界书词条正文与触发词（与 cardTokenStats 的世界书口径保持一致）
            // 🛡️ extractBookEntries 全形态安全提取：修复 entries 字典形态 / character_book 数组形态
            //    导致的 entries.forEach 崩溃——该函数被侧栏列表每张卡的渲染（itemTokenCount）与
            //    tokens 排序调用，一旦抛错即引发「角色栏消失/空屏」，且卡在库内每次重启复发
            const book = d.character_book || (card.data && card.data.character_book) || {};
            const entries = extractBookEntries(book);
            entries.forEach(e => {
                total += estimateTokens(e.content) + estimateTokens((Array.isArray(e.key) ? e.key : []).join(', '));
            });
            if (dataKey && typeof dataKey === 'object') cardTokensCache.set(dataKey, total);
            return total;
        };

        // 🔍 角色卡查重扫描与清理方法已拆分为组合式函数 useDedupe（见下文 setup 尾部调用）

        // =========================================================
        // 🌍 世界书库筛选与智能对比查重引擎
        // =========================================================
        const wbSearchQuery = ref('');         // 世界书侧边栏搜索框
        const wbFilterType = ref('all');        // 词条数筛选: 'all' | 'empty' | 'small' | 'large'
        // 🔍 世界书查重弹窗状态与方法已拆分为组合式函数 useDedupe（见下文 setup 尾部调用）

        // =========================================================
        // 📁 世界书库：分组功能（Set 动态搜集 + localStorage 持久化）
        // =========================================================
        const currentWbCategory = ref('全部'); // 当前选中的分组

        // 分组持久化映射：key(path||name) -> 分类名（重扫/重启后自动恢复）
        const loadWbCategoriesMap = () => {
            try { return JSON.parse(localStorage.getItem('jsTavern_wbCategories') || '{}'); } catch (e) { return {}; }
        };
        const wbCategoryMap = ref(loadWbCategoriesMap());
        const saveWbCategoriesMap = () => {
            try { localStorage.setItem('jsTavern_wbCategories', JSON.stringify(wbCategoryMap.value)); } catch (e) { /* 忽略 */ }
        };

        // ================= [ UI 状态统一收口到 app_config.json ] =================
        // 生产 app:// 下 localStorage 不持久，这些 UI 偏好变化时在写 localStorage 之外，
        // 再触发一次 syncConfigToDisk 写入 app_config.json（localCategoryMap 已由自身 watch 收口，此处去重）。
        // 与此处建立集中 watch：所有相关 ref 已声明完毕（最后一个为 wbCategoryMap），
        // 回调里的 syncConfigToDisk 已内置 isRestoringConfig guard，恢复期触发的写盘会被自动拦截，无需 immediate。
        watch(
            [theme, appSettings, sanitizeImportedTags, snapshotConfig, sidebarWidth, viewMode, isCompactMode, sortBy, systemPromptPresets, lastWorldbookDirPath, wbCategoryMap],
            // 🚀 v1.8.5 性能修复：改走 500ms 防抖落盘。旧版直接调 syncConfigToDisk（全量
            //    序列化 appSettings/cardOverlays/wbCategoryMap + 加密 IPC + 同步写盘），
            //    连续 UI 微调（拖侧栏宽度/切主题等）每次都全量写盘，千卡库 overlays 体积
            //    大时拖动全程卡顿。防抖版已有 beforeunload 冲刷兜底，不丢最后一次变更。
            () => syncConfigToDiskDebounced(),
            { deep: true }
        );

        // 📁 世界书分组（获取/列表/修改/筛选）已拆分为组合式函数 useWorldbooks（见下文 setup 尾部调用）

        // 🔍 世界书查重扫描与清理方法已拆分为组合式函数 useDedupe（见下文 setup 尾部调用）

        // 🔍 双屏差异比对器（Diff Inspector）已拆分为组合式函数 useDedupe（见下文 setup 尾部调用）

        // =========================================================
        // 🌐 世界书可视化关系图谱 (ECharts Graph) —— v2 性能与功能升级
        // - 索引化构建：key→词条 倒排索引 + 权重聚合，替代旧版 O(n²) 双循环逐对
        //   keys.some(content.includes)（300+ 词条大书卡顿主因）；过滤 <2 字符噪音 key；
        // - 构建/渲染分离：打开时构建一次全量缓存，过滤/搜索/阈值只做轻量重渲；
        // - 新增：布局切换 / 词条类型过滤(常驻/触发/禁用) / 搜索高亮 / 连线权重阈值 /
        //   孤立词条统计 / PNG 导出 / resize 自适应 / 关闭时销毁实例防泄漏；
        // - 大书同步构建会阻塞主线程 → 先绘制弹窗与 loading 遮罩，再后台构建
        // =========================================================
        const showWbGraphModal = ref(false);
        const wbGraphBuilding = ref(false);
        let wbChartInstance = null;
        let wbGraphNodesCache = [];   // 全量节点（打开时构建一次）
        let wbGraphLinksCache = [];   // 全量连线（打开时构建一次，含 weight）
        let wbGraphSearchTimer = null;

        const wbGraphLayout = ref('force');
        const wbGraphSearch = ref('');
        const wbGraphMinWeight = ref(1);
        const wbGraphFilters = reactive({ constant: true, triggered: true, disabled: false });
        const wbGraphStats = reactive({ nodes: 0, links: 0, orphans: 0 });

        const handleWbGraphResize = () => {
            if (wbChartInstance) wbChartInstance.resize();
        };

        // 构建全量节点与连线（仅打开时执行一次；分批让出主线程，loading 转圈不冻结）
        const buildWbGraphData = async () => {
            const entries = activeWorldbook.value.data.entries || [];
            const nodes = [];

            // 构建节点 —— 300+ 节点需调小球体（按内容长度微调区分大小，范围 10-22）
            entries.forEach((e, idx) => {
                const label = e.comment || (Array.isArray(e.key) ? e.key.join('/') : e.key) || `词条 #${idx + 1}`;
                nodes.push({
                    id: String(e.uid || idx),
                    name: label,
                    symbolSize: Math.max(10, Math.min(22, 8 + String(e.content || '').length / 40)),
                    entryIndex: idx,
                    isConstant: !!e.constant,
                    isDisabled: e.enabled === false,
                    itemStyle: {
                        color: e.enabled === false ? '#71717a' : (e.constant ? '#6366f1' : '#d97706')
                    }
                });
            });

            // 倒排索引：触发词 → 目标词条列表（去重 + 过滤 <2 字符的噪音 key，
            // 单字 key 如「你」会造成连线风暴且多为误命中）
            const keyIndex = new Map();
            entries.forEach((e, idx) => {
                const keys = Array.isArray(e.key) ? e.key : (e.key ? [e.key] : []);
                keys.forEach(k => {
                    const kk = String(k || '').trim().toLowerCase();
                    if (kk.length < 2) return;
                    if (!keyIndex.has(kk)) keyIndex.set(kk, new Set());
                    keyIndex.get(kk).add(String(e.uid || idx));
                });
            });

            // 权重聚合：同一 (source→target) 的多个 key 命中合并为一条线，线宽随权重增长
            // 🔧 分批处理：每批之间让出主线程一帧——旧版一次性同步聚合曾把 UI 冻结数秒，
            //    分批后 loading 转圈（CSS 合成器动画）保持流畅
            // 🔧 bigram 预过滤：key 命中判断从「每个 key 全文 includes」降为 O(1) Set 查询——
            //    只有 key 的首两字确实相邻出现在正文中时才回退全文校验。
            //    大书(2000 词条 × 5000 key)从 ~千万次全文扫描降至 ~千万次 Set 命中，提速 10-100 倍
            const getBigrams = (content) => {
                const s = new Set();
                for (let i = 0; i + 1 < content.length; i++) s.add(content.slice(i, i + 2));
                return s;
            };
            const linkAgg = new Map();
            const CHUNK = 80;
            for (let base = 0; base < entries.length; base += CHUNK) {
                const end = Math.min(base + CHUNK, entries.length);
                for (let idxA = base; idxA < end; idxA++) {
                    const eA = entries[idxA];
                    const content = String(eA.content || '').toLowerCase();
                    if (!content) continue;
                    const bg = getBigrams(content);
                    const srcId = String(eA.uid || idxA);
                    keyIndex.forEach((targetIds, kk) => {
                        if (!bg.has(kk.slice(0, 2))) return;          // 首二字未相邻出现 → 必不命中，跳过
                        if (kk.length > 2 && !content.includes(kk)) return; // 长词回退全文精确校验
                        targetIds.forEach(tgtId => {
                            if (tgtId === srcId) return;
                            const key = srcId + '→' + tgtId;
                            linkAgg.set(key, (linkAgg.get(key) || 0) + 1);
                        });
                    });
                }
                await new Promise(r => setTimeout(r, 0)); // 让出主线程
            }

            // 🔧 连线预算：极端常见的通用词会产生数万条连线，直接卡死力导向模拟器；
            // 按权重降序保留前 4000 条（权重=命中触发词数，泛化连线先被裁掉）
            let aggList = Array.from(linkAgg, ([key, w]) => ({ key, w }));
            const WB_MAX_LINKS = 4000;
            if (aggList.length > WB_MAX_LINKS) {
                aggList.sort((x, y) => y.w - x.w);
                aggList = aggList.slice(0, WB_MAX_LINKS);
            }

            const links = aggList.map(({ key, w }) => {
                const sep = key.indexOf('→');
                return {
                    source: key.slice(0, sep),
                    target: key.slice(sep + 1),
                    weight: w,
                    lineStyle: { curveness: 0.1, opacity: 0.5, width: Math.min(1 + w * 0.4, 4) }
                };
            });

            wbGraphNodesCache = nodes;
            wbGraphLinksCache = links;
        };

        // 🔧 捕获世界书图谱当前布局坐标（半内部 API，失败静默降级）
        // 作为下次渲染的位置种子：过滤/搜索/阈值切换后整图不再重新洗牌
        const captureWbGraphPositions = () => {
            const pos = new Map();
            try {
                const model = wbChartInstance.getModel && wbChartInstance.getModel();
                const seriesModel = model && model.getSeriesByIndex && model.getSeriesByIndex(0);
                const graph = seriesModel && seriesModel.getGraph && seriesModel.getGraph();
                if (graph && graph.eachNode) {
                    graph.eachNode((node) => {
                        const layout = node.getLayout && node.getLayout();
                        if (layout && layout.length >= 2) pos.set(String(node.id), [layout[0], layout[1]]);
                    });
                }
            } catch (e) { return new Map(); }
            return pos;
        };

        // 轻量重渲：应用 类型过滤 / 权重阈值 / 搜索高亮 / 布局（不重建缓存）
        const renderWbGraph = () => {
            if (!wbChartInstance) return;

            const seedPos = wbGraphLayout.value === 'force' ? captureWbGraphPositions() : null;
            const kw = wbGraphSearch.value.trim().toLowerCase();
            const visibleNodes = [];
            const visibleIds = new Set();

            wbGraphNodesCache.forEach(n => {
                const passFilter = (n.isDisabled && wbGraphFilters.disabled) ||
                                   (!n.isDisabled && n.isConstant && wbGraphFilters.constant) ||
                                   (!n.isDisabled && !n.isConstant && wbGraphFilters.triggered);
                if (!passFilter) return;
                const hit = !kw || n.name.toLowerCase().includes(kw);
                const node = {
                    ...n,
                    itemStyle: { ...n.itemStyle, opacity: kw ? (hit ? 1 : 0.15) : 1 },
                    symbolSize: hit && kw ? Math.min(n.symbolSize * 1.5, 36) : n.symbolSize,
                    label: { show: !!kw && hit, position: 'right' }
                };
                if (seedPos) {
                    const p = seedPos.get(n.id);
                    if (p) { node.x = p[0]; node.y = p[1]; }
                }
                visibleNodes.push(node);
                visibleIds.add(n.id);
            });

            const visibleLinks = wbGraphLinksCache.filter(l =>
                l.weight >= wbGraphMinWeight.value && visibleIds.has(l.source) && visibleIds.has(l.target)
            );

            // 统计徽标：词条 / 连线 / 孤立词条（无任何连线的词条，常为死词条线索）
            const deg = new Map();
            visibleLinks.forEach(l => {
                deg.set(l.source, (deg.get(l.source) || 0) + 1);
                deg.set(l.target, (deg.get(l.target) || 0) + 1);
            });
            wbGraphStats.nodes = visibleNodes.length;
            wbGraphStats.links = visibleLinks.length;
            wbGraphStats.orphans = visibleNodes.reduce((acc, n) => acc + (deg.get(n.id) ? 0 : 1), 0);

            // 🔧 标签封顶：宽泛搜索词可能命中数百词条，全开标签会每帧渲染数百文本掉帧；
            // 仅保留度数 Top80 的命中标签（聚光灯悬浮时仍能看到任意节点名）
            if (kw) {
                const hits = visibleNodes.filter(n => n.label && n.label.show);
                if (hits.length > 80) {
                    hits.sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0));
                    hits.forEach((hn, i) => { if (i >= 80) hn.label.show = false; });
                }
            }

            // 规模自适应物理参数：大书收缩斥力 + 高摩擦快速收敛
            // ⚠️ 不设 layoutAnimation:false —— 同步跑完全部物理迭代会冻结 UI 数秒（v2 回归，已移除）
            const n = visibleNodes.length;
            const forceParams = n > 200
                ? { repulsion: 120, edgeLength: [15, 60], gravity: 0.15, friction: 0.8 }
                : { repulsion: 150, edgeLength: [20, 70], gravity: 0.15, friction: 0.6 };

            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    formatter: (params) => {
                        if (params.dataType === 'node') {
                            return `<b>${params.name}</b><br/>关联度: ${deg.get(params.data.id) || 0} 条连线<br/>👉 点击节点可跳转直达词条`;
                        }
                        return `<b>关联引用</b>: ${params.data.source} ➔ ${params.data.target}<br/>命中 ${params.data.weight} 个触发词`;
                    }
                },
                series: [{
                    type: 'graph',
                    layout: wbGraphLayout.value,
                    data: visibleNodes,
                    links: visibleLinks,
                    roam: true,        // 滚轮缩放 + 鼠标平移
                    draggable: true,   // 允许单独拖拽球体

                    symbolSize: 12,
                    label: { show: false, position: 'right' },

                    // ✨ 聚光灯效应：悬浮只高亮当前节点与邻居，其余全部变暗沉寂
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: { width: 3 },
                        label: {
                            show: true,
                            fontSize: 13,
                            color: '#34d399',
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            padding: [4, 8],
                            borderRadius: 4
                        }
                    },

                    force: forceParams,
                    edgeSymbol: ['none', 'arrow'],
                    edgeSymbolSize: [4, 7],
                    lineStyle: { color: '#a1a1aa', width: 1.2 }
                }]
            };

            wbChartInstance.setOption(option, true);
        };

        // 绑定节点点击事件：关闭图谱，展开并平滑滚动定位 + 高亮闪烁目标词条
        const bindWbGraphEvents = () => {
            if (!wbChartInstance) return;
            wbChartInstance.off('click');
            wbChartInstance.on('click', (params) => {
                if (params.dataType === 'node' && params.data.entryIndex !== undefined) {
                    closeWbGraphModal();
                    const targetEntry = activeWorldbook.value.data.entries[params.data.entryIndex];
                    if (!targetEntry) return;
                    targetEntry._collapsed = false; // 自动展开

                    // ✅ 增强：平滑滚动到词条卡片并高亮闪烁（用 getEntryUid 做稳定锚点，不受搜索过滤影响）
                    nextTick(() => {
                        const dom = document.getElementById('wb-entry-' + getEntryUid(targetEntry));
                        if (dom) {
                            dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            dom.classList.add('ring-2', 'ring-emerald-500', 'shadow-[0_0_24px_rgba(16,185,129,0.35)]');
                            setTimeout(() => {
                                dom.classList.remove('ring-2', 'ring-emerald-500', 'shadow-[0_0_24px_rgba(16,185,129,0.35)]');
                            }, 1800);
                        }
                    });
                    addLog(`📍 通过图谱定位到词条: #${params.data.entryIndex + 1}`, 'info');
                }
            });
        };

        const openWbGraphModal = () => {
            if (!activeWorldbook.value || !activeWorldbook.value.data || !activeWorldbook.value.data.entries || activeWorldbook.value.data.entries.length === 0) {
                nativeAlert('当前世界书没有词条，无法生成关系图谱！', 'warning');
                return;
            }
            showWbGraphModal.value = true;
            wbGraphBuilding.value = true;
            window.addEventListener('resize', handleWbGraphResize);

            // 待 DOM 挂载后初始化 ECharts
            nextTick(() => {
                const chartDom = document.getElementById('wb-graph-container');
                if (!chartDom) { wbGraphBuilding.value = false; return; }

                if (wbChartInstance) wbChartInstance.dispose();
                wbChartInstance = echarts.init(chartDom, theme.value === 'light' ? 'light' : 'dark');
                bindWbGraphEvents();

                // 大书同步构建会阻塞主线程：先让弹窗与 loading 遮罩完成绘制，再分批后台构建
                setTimeout(async () => {
                    try {
                        await buildWbGraphData();
                        renderWbGraph();
                    } catch (e) {
                        console.error('世界书图谱构建失败:', e);
                        nativeAlert('图谱构建失败: ' + e.message, 'error');
                        showWbGraphModal.value = false;
                    } finally {
                        wbGraphBuilding.value = false;
                    }
                }, 50);
            });
        };

        const closeWbGraphModal = () => {
            showWbGraphModal.value = false;
            window.removeEventListener('resize', handleWbGraphResize);
            // 延迟销毁：给过渡动画时间，防 Canvas 上下文未释放导致低配机内存溢出
            if (wbChartInstance) {
                const inst = wbChartInstance;
                wbChartInstance = null;
                setTimeout(() => {
                    if (inst && !inst.isDisposed()) inst.dispose();
                }, 300);
            }
        };

        const updateWbGraphLayout = (mode) => {
            wbGraphLayout.value = mode;
            renderWbGraph();
        };

        // 搜索防抖：停止输入 300ms 后才重渲（过滤走缓存，成本极低）
        watch(wbGraphSearch, () => {
            clearTimeout(wbGraphSearchTimer);
            wbGraphSearchTimer = setTimeout(() => renderWbGraph(), 300);
        });

        // 📷 导出当前世界书图谱为 PNG（2x 分辨率，跟随主题底色）
        const exportWbGraph = () => {
            if (!wbChartInstance) return;
            try {
                const url = wbChartInstance.getDataURL({ pixelRatio: 2, backgroundColor: theme.value === 'light' ? '#ffffff' : '#09090b' });
                const bookName = ((activeWorldbook.value && activeWorldbook.value.name) || 'worldbook').replace(/\.json$/i, '');
                const a = document.createElement('a');
                a.href = url;
                a.download = `世界书图谱_${bookName}_${new Date().toISOString().slice(0, 10)}.png`;
                a.click();
            } catch (e) {
                nativeAlert('图谱导出失败: ' + e.message, 'error');
            }
        };

        // =========================================================
        // 🔗 多书一键合并引擎 (Worldbook Merger)
        // =========================================================
        const showWbMergeModal = ref(false);
        const selectedWbMergePaths = ref([]);

        const openWbMergeModal = () => {
            if (worldbooks.value.length < 2) {
                nativeAlert('当前载入的世界书少于 2 本，无需合并！', 'warning');
                return;
            }
            selectedWbMergePaths.value = [];
            showWbMergeModal.value = true;
        };

        const executeWorldbookMerge = () => {
            if (selectedWbMergePaths.value.length < 2) {
                nativeAlert('请至少勾选 2 本世界书进行合并！', 'warning');
                return;
            }

            const targetWbs = worldbooks.value.filter(wb => selectedWbMergePaths.value.includes(wb.path));
            const mergedEntries = [];
            const seenMap = new Set(); // 指纹去重: Key + Content

            targetWbs.forEach(wb => {
                const entries = (wb.data && Array.isArray(wb.data.entries)) ? wb.data.entries : [];
                entries.forEach(e => {
                    if (!e || typeof e !== 'object') return; // 脏数据条目防护
                    // 【加固】key/content 可能是数字/对象等非字符串，直接 .trim() 会崩溃
                    const keysStr = String(Array.isArray(e.key) ? e.key.map(k => String(k)).join(',') : (e.key || '')).trim().toLowerCase();
                    const contentStr = String(e.content || '').trim().toLowerCase();
                    const signature = `${keysStr}:::${contentStr}`;

                    if (!seenMap.has(signature)) {
                        seenMap.add(signature);
                        // 剔除 _collapsed 等临时 UI 字段
                        const cleanEntry = JSON.parse(JSON.stringify(e, (k, v) => k.startsWith('_') ? undefined : v));
                        cleanEntry.uid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                        mergedEntries.push(cleanEntry);
                    }
                });
            });

            const mergeName = `合并世界书_${targetWbs.length}本`;
            const mergedWbData = {
                name: mergeName,
                description: `由 [${targetWbs.map(w => (w.data && w.data.name) || w.name).join(', ')}] 合并而成，包含 ${mergedEntries.length} 个词条。`,
                entries: mergedEntries
            };

            const newWbItem = {
                // 【修复】path 设为空字符串，让保存系统知道它还从未落盘，
                // 触发 syncWorldbooksToDisk 的智能落盘分配（否则假路径会让 Electron 报“原文件不存在”）
                path: '',
                name: `${mergeName}.json`,
                data: mergedWbData
            };

            worldbooks.value.unshift(newWbItem);
            activeWorldbook.value = newWbItem;
            showWbMergeModal.value = false;

            nativeAlert(`🎉 成功合并 ${targetWbs.length} 本世界书！共生成 ${mergedEntries.length} 个去重词条。`, 'info');
            addLog(`🔗 完成多书合并: ${mergeName}`, 'success');
        };

        // =========================================================
        // � 条目级合并引擎：从其他世界书按需导入词条到当前书（弹窗 → 勾选 → 确认）
        // =========================================================
        const showWbImportModal = ref(false);      // 导入弹窗显隐
        const importSourceBook = ref(null);        // 当前选中的源世界书
        const importCandidates = ref([]);          // 源书词条候选（带临时 _srcUid 做勾选 key）
        const selectedImportEntries = ref([]);     // 用户勾选的词条 _srcUid 集合

        // 可导入的源书列表（排除当前正在编辑的世界书）
        const importableSourceBooks = computed(() => {
            if (!activeWorldbook.value) return worldbooks.value;
            return worldbooks.value.filter(wb => wb.path !== activeWorldbook.value.path);
        });

        const openWbImportModal = () => {
            if (!activeWorldbook.value) {
                nativeAlert('请先打开/选中一本世界书作为合并目标。', 'warning');
                return;
            }
            importSourceBook.value = null;
            importCandidates.value = [];
            selectedImportEntries.value = [];
            showWbImportModal.value = true;
        };

        // 选中源世界书后，展开其词条候选
        const pickImportSource = (wb) => {
            importSourceBook.value = wb;
            importCandidates.value = ((wb.data && wb.data.entries) || []).map((e, i) => ({
                ...e,
                _srcIndex: i,
                _srcUid: e.uid || ('src-' + i)
            }));
            selectedImportEntries.value = [];
        };

        // 确认导入：深拷贝选中词条 → 清洗临时字段 → 追加到当前世界书
        const confirmImportEntries = () => {
            if (!importSourceBook.value) { nativeAlert('请先选择源世界书。', 'warning'); return; }
            if (selectedImportEntries.value.length === 0) {
                nativeAlert('请至少勾选一个词条。', 'warning');
                return;
            }
            const targetEntries = activeWorldbook.value.data.entries;
            if (!Array.isArray(targetEntries)) activeWorldbook.value.data.entries = [];

            let count = 0;
            importCandidates.value.forEach(c => {
                if (!selectedImportEntries.value.includes(c._srcUid)) return;
                // 深拷贝并剔除 _ 前缀临时字段（_collapsed/_srcIndex/_srcUid），重新生成前端 uid
                const clean = JSON.parse(JSON.stringify(c, (k, v) => k.startsWith('_') ? undefined : v));
                clean.uid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                clean._collapsed = false;
                activeWorldbook.value.data.entries.push(clean);
                count++;
            });

            showWbImportModal.value = false;
            nativeAlert(`🎉 成功从 [${importSourceBook.value.name}] 导入 ${count} 个词条到当前世界书！`, 'info');
            addLog(`🔀 从 ${importSourceBook.value.name} 导入 ${count} 个词条`, 'success');
        };

        // =========================================================
        // 🚀 OTA 自动更新系统（electron-updater：检测/下载/进度/安装）
        // =========================================================
        const showUpdateModal = ref(false);
        const updateInfo = ref({
            hasUpdate: false,
            currentVersion: '1.0.0',
            latestVersion: '',
            releaseNotes: '',
            downloadUrl: ''
        });
        // 更新错误信号（统一在 App 层收口，转发给 UpdateModal 重置状态，避免与子组件监听冲突）
        const updateErrorMsg = ref('');
        let isManualCheck = false; // 区分手动/静默检测（静默检测到已最新时不打扰）
        let manualCheckTimer = null; // 手动检测超时保护，防止事件未到达时 isManualCheck 卡死

        // 手动检测更新（用于设置菜单里的按钮）：触发检查，结果通过事件驱动
        const checkForUpdatesManual = async () => {
            addLog('🔄 正在检查更新...', 'info');
            isManualCheck = true;
            // 60 秒超时保护：若事件始终未到达（网络异常/升级器静默失败），重置手动检测标志
            clearTimeout(manualCheckTimer);
            manualCheckTimer = setTimeout(() => { isManualCheck = false; }, 60000);
            try {
                const res = await window.electronAPI.checkUpdate();
                if (!res || !res.success) {
                    clearTimeout(manualCheckTimer);
                    isManualCheck = false;
                    // 开发模式是预期跳过，用 info 提示而非"失败"
                    if (res && /开发模式/.test(res.error || '')) {
                        nativeAlert(res.error, 'info');
                    } else {
                        nativeAlert(`更新检测失败: ${res?.error || '网络错误'}`, 'error');
                    }
                }
                // 成功：结果通过 update-available / update-not-available 事件到达
            } catch (err) {
                clearTimeout(manualCheckTimer);
                isManualCheck = false;
                nativeAlert(`更新检测失败: ${err.message || '网络错误'}`, 'error');
            }
        };

        // 后台静默检测（开机时自动调用）：有更新才弹窗，没更新不打扰
        const silentCheckForUpdates = async () => {
            if (!window.electronAPI || typeof window.electronAPI.checkUpdate !== 'function') return;
            try {
                await window.electronAPI.checkUpdate();
                // 有更新时 update-available 事件会弹窗；无更新时 update-not-available 静默忽略
            } catch (err) {
                console.warn('静默检测更新失败', err);
            }
        };

        // 绑定 OTA 更新事件（弹窗驱动）
        const setupUpdateListeners = () => {
            if (!window.electronAPI) return;
            if (typeof window.electronAPI.onUpdateAvailable === 'function') {
                window.electronAPI.onUpdateAvailable((info) => {
                    updateInfo.value = { ...(info || {}) };
                    updateErrorMsg.value = ''; // 新版本信息到达，清空上一次的错误信号
                    showUpdateModal.value = true;
                    addLog(`🎉 发现新版本: v${(info && info.latestVersion) || ''}`, 'success');
                });
            }
            if (typeof window.electronAPI.onUpdateNotAvailable === 'function') {
                window.electronAPI.onUpdateNotAvailable((info) => {
                    if (isManualCheck) {
                        isManualCheck = false;
                        nativeAlert(`当前已是最新版本 (v${(info && info.currentVersion) || ''})！`, 'info');
                    }
                });
            }
            if (typeof window.electronAPI.onUpdateError === 'function') {
                window.electronAPI.onUpdateError((err) => {
                    // 统一错误收口：清除手动检测标志、转发给弹窗重置状态
                    clearTimeout(manualCheckTimer);
                    isManualCheck = false;
                    updateErrorMsg.value = String(err || '未知错误');
                    if (showUpdateModal.value) {
                        nativeAlert(`更新失败: ${String(err || '')}`, 'error');
                    }
                });
            }
        };
        setupUpdateListeners();

        // 打开外部链接（跳转系统浏览器）
        const openExternalUrl = (url) => {
            if (!url) return;
            window.electronAPI.openExternal(url);
        };

        // 📸 历史快照功能：组合式函数注入（依赖 App.vue 共享状态；行为与原内联实现一致）
        // ⚠️ snapshotConfig 由 App.vue 顶层定义并注入（syncConfigToDisk/集中 watch 需早期引用，防 TDZ）
        const {
            saveSnapshotSettings, triggerManualSnapshot,
            showSnapshotModal, snapshotList, snapshotCardName, snapshotCardPath,
            openSnapshotModal, restoreSnapshot, openSnapshotFolder, closeSnapshotModal, deleteSnapshot,
            cleanAllSnapshots, cleanOrphanSnapshots
        } = useSnapshots({ snapshotConfig, library, cardData, currentFolderPath, nativeAlert, confirmDialog, addLog, showToast, refreshCardData });

        // 💽 磁盘卡片扫描：组合式函数注入（共享创库基础设施 parseAndAddCard/processElectronFiles 与共享状态保留在 App.vue）
        const {
            isScanningDisk, diskScanProgress, useSizeFilter, showDiskScanModal,
            runDiskScan, handleScanImported, selectFixedDirectory, refreshLibrary
        } = useDiskScan({ library, currentFolderPath, cardData, customCategories, appMode, nativeAlert, showToast, isCategoryKnown, openFromLibrary, parseAndAddCard, processElectronFiles });

        // 🔎 超级搜索引擎：组合式函数注入（共享状态 library/currentCategoryKey/allCategories/sortBy/currentPage/itemsPerPage/lastSelectedIndex 保留在 App.vue）
        const {
            searchQueryInput, searchQuery,
            filteredLibrary, totalPages, paginatedLibrary,
            changePage
        } = useSearch({ library, currentCategoryKey, allCategories, sortBy, currentPage, itemsPerPage, lastSelectedIndex, estimateCardTokens });

        // 📁 角色卡分组/分类：组合式函数注入（状态仍在 App.vue，此处仅注入操作逻辑）
        const {
            addNewCategory, currentCategoryDeletable, currentCategoryRenamable,
            deleteCustomCategory, renameCurrentCategory,
            currentCardCategory, handleCardCategoryChange, migrateOverlayKey, moveCardToGroup,
            quickMoveGroup, batchChangeCategory, batchChangeCategoryModal, cleanupEmptyCategories
        } = useCardGroups({ library, cardData, currentFolderPath, appConfig, selectedIds, customCategories, defaultCategories, removedDefaultKeys, currentCategoryKey, allCategories, isCategoryKnown, nativeAlert, confirmDialog, appPrompt, addLog, persistCardCategory, refreshLibrary, clearSelection, syncConfigToDisk });

        // ✅ 批量操作：组合式函数注入（共享状态 selectedIds/lastSelectedIndex 与工具 clearSelection/cleanupEmptyCategories/paginatedLibrary 等保留或来自其他组合式函数）
        const {
            handleCardClick, toggleSelection,
            batchBarStyle, startBatchBarDrag, resetBatchBarPos,
            batchExportSelected, batchDeleteSelected, batchAddTag
        } = useBatch({ selectedIds, lastSelectedIndex, library, cardData, openFromLibrary, paginatedLibrary, reset, cleanupEmptyCategories, persistCardUpdate, deleteCardOverlays, nativeAlert, confirmDialog, appPrompt, clearSelection });

        // � 换角色卡图：选择新立绘替换，成功后刷新路径/立绘，并展示校验校准结果
        // （item 为空时自动定位当前打开的卡片；PNG 卡原地替换，WebP / JSON 卡升级为标准 PNG 卡）
        const replaceCardImage = async (item) => {
            if (!item) {
                if (!cardData.value) return nativeAlert('请先打开一张卡片。', 'warning');
                item = library.value.find(i => i.data === cardData.value) || null;
                if (!item) return nativeAlert('未找到当前卡片的库记录。', 'warning');
            }
            if (!item || !item.path) return nativeAlert('未找到卡片文件路径', 'warning');
            if (!window.electronAPI || typeof window.electronAPI.replaceCardImage !== 'function') {
                return nativeAlert('当前版本不支持换卡图，请更新应用。', 'warning');
            }
            const ok = await confirmDialog(
                `将为角色卡【${item.name}】更换立绘图片。\n` +
                `（PNG 卡原地替换；WebP / JSON 卡将转为标准 PNG 卡）`
            );
            if (!ok) return;

            const payload = { cardPath: item.path };
            if (item.data) payload.cardJson = JSON.parse(JSON.stringify(item.data));

            const res = await window.electronAPI.replaceCardImage(payload);
            if (res && res.success) {
                const isImage = /\.(png|webp|jpe?g)$/i.test(res.newPath);
                const oldPath = item.path;
                item.path = res.newPath;
                item.fileName = res.newPath.split(/[\\/]/).pop();
                item.avatar = isImage ? `local-file://img/?path=${encodeURIComponent(res.newPath)}&_=${Date.now()}` : null;
                migrateOverlayKey(oldPath, res.newPath); // 分组/标签覆盖层跟随新路径
                // 若正打开该卡，刷新立绘显示
                if (cardData.value && item.data === cardData.value) {
                    imgUrl.value = item.avatar;
                }
                nativeAlert(res.message || '换卡图成功', 'info');
            } else {
                nativeAlert(`换卡图失败: ${(res && res.error) || '未知错误'}`, 'error');
            }
        };

        // �🔍 查重与差异比对：组合式函数注入（estimateCardTokens 为共享工具，保留在 App.vue）
        const {
            showDedupeModal, duplicateGroups, startDedupeScan, resolveDedupeGroup,
            showWbDedupeModal, wbDuplicateGroups, startWorldbookDedupeScan, resolveWbDedupeGroup,
            showDiffDetailModal, diffMasterItem, diffCompareItem, diffFieldResults, openDiffDetailModal
        } = useDedupe({ library, worldbooks, activeWorldbook, cardData, estimateCardTokens, nativeAlert, confirmDialog, addLog, reset, cleanupEmptyCategories, deleteCardOverlays });

        // 🌍 世界书库与分组：组合式函数注入（共享状态 worldbooks/wbCategoryMap 等保留在 App.vue）
        const {
            importUrl, isImportingWb, wbContextMenu,
            loadWorldbooks, scanWorldbookDir, importWorldbookFromUrl, renameWorldbook,
            handleWorldbookFolderSelect, deleteWorldbook, duplicateWorldbook,
            openWbContextMenu, closeWbContextMenu, openWbInFolder,
            wbCategories, changeWbCategory, filteredWorldbooks
        } = useWorldbooks({ worldbooks, activeWorldbook, lastWorldbookDirPath, wbSearchQuery, wbFilterType, currentWbCategory, wbCategoryMap, saveWbCategoriesMap, syncWorldbooksToDisk, appMode, appPrompt, nativeAlert, confirmDialog, addLog, contextMenu, closeContextMenu });

        // 📚 世界书词条深度编辑 (Entry IDE)：组合式函数注入（activeWorldbook 等共享状态保留在 App.vue）
        const {
            ensureUid,
            addWorldbookEntry, deleteWorldbookEntry, duplicateWorldbookEntry, moveEntry,
            entrySearchQuery, entryFilterState, entrySortBy, filteredWorldbookEntries,
            // ⚠️ 重命名：与 useTags 的标签批量模式 batchMode 区分（词条批量模式为布尔开关）
            batchMode: entryBatchMode, batchSelected, toggleBatchMode: toggleEntryBatchMode, toggleBatchSelect, selectAllEntries, clearBatchSelection,
            batchToggleEnabled, batchDeleteEntries,
            entryHealthReport, runEntryHealthCheck
        } = useWorldbookEntries({ activeWorldbook, addLog, confirmDialog, nativeAlert });

        // 🔎 全库词条搜索与反向引用：组合式函数注入
        const {
            globalEntryIndex, globalEntrySearchQuery, globalEntrySearchResults,
            showGlobalEntrySearchModal, openGlobalEntrySearch, closeGlobalEntrySearch, jumpToEntrySource
        } = useGlobalEntrySearch({ worldbooks, library, appMode, activeWorldbook, openFromLibrary });

        // 📤 世界书扩展：提取/JSONL导入/批量导出/快照/统计
        const {
            extractWorldbookFromCard, importWbFromJsonl, exportWorldbooksBatch,
            showWbSnapshotModal, wbSnapshotList, wbSnapshotTarget, openWbSnapshots, closeWbSnapshotModal, restoreWbSnapshot,
            wbStats
        } = useWorldbookExtras({ worldbooks, activeWorldbook, lastWorldbookDirPath, nativeAlert, addLog, confirmDialog });

        // ✨ AI 打标 / 翻译 / 格式升维：组合式函数注入（共享状态与 API 配置保留在 App.vue）
        const {
            showAITagModal, aiCandidateTags, aiCustomPrompt, aiTaggingProgress, isAITagging, openAITagModal, startAITagging,
            enableAIExtraction, customAIPrompt, newAICandidateTag,
            addAICandidateTag, addAICandidateTagManual, removeAICandidateTag,
            activeSystemPromptId, addSystemPromptPreset, deleteSystemPromptPreset,
            saveSystemPromptsToStorage, getCurrentSystemPromptContent, buildTaggingSystemPrompt,
            useJailbreak, jailbreakPrompt, jailbreakPresets,
            isTranslating, translateCardContent, isRefactoring, refactorCardFormat
        } = useAITools({ selectedIds, library, cardData, apiEndpoint, apiKey, apiType, resolveApiModel, extractReplyContent, persistCardUpdate, refreshCardData, nativeAlert, confirmDialog, showToast, systemPromptPresets });

        // 💬 聊天测卡：组合式函数注入（共享状态 apiEndpoint/apiKey/apiModel/apiType 与工具 resolveApiModel/extractReplyContent 保留在 App.vue）
        const {
            chatHistory, chatInput, isChatting, chatContainer,
            saveApiConfig, handleApiTypeChange,
            availableModels, isFetchingModels, fetchModelStatus, fetchAvailableModels,
            isChatRenderMode,
            initChat, sendMessage, clearChat
        } = useChat({ apiEndpoint, apiKey, apiModel, apiType, resolveApiModel, extractReplyContent, DEFAULT_API_ENDPOINT, syncConfigToDisk, nativeAlert, safeData, cardData });

        // 🕸️ 关系图谱：组合式函数注入（共享状态 library/cardData/imgUrl/currentTab/chatHistory/worldbookExpanded/allCategories/currentCategoryKey 保留或来自其他组合式函数）
        const {
            showGraph,
            graphLayoutMode, graphSearchKeyword, minLinkWeight,
            isolateCurrentGroup, edgeFilters, graphStats, graphBuilding,
            openGraph, closeGraph, renderGraph, updateGraphLayout, exportGraph
        } = useGraph({ library, cardData, imgUrl, currentTab, chatHistory, worldbookExpanded, nativeAlert, allCategories, currentCategoryKey });

        // 🌌 统一图谱入口：按当前模式智能分流——
        // 角色卡模式 → 角色宇宙关系图谱；世界书模式 → 当前世界书词条关联图谱
        // （顶栏唯一全局入口；世界书 IDE 编辑区另有「🌐 关系图谱」上下文快捷键）
        const openGraphSmart = () => {
            if (appMode.value === 'worldbooks') return openWbGraphModal();
            return openGraph();
        };

        // 🏷️ 标签系统：组合式函数注入（共享状态 systemCommonTags/tagLangMode 保留在 App.vue，此处注入操作逻辑与局部状态）
        const {
            showBatchTagModal, batchInputTags, batchMode, presetTagsLibrary,
            batchTagChips, toggleBatchCommonTag, removeBatchTag,
            toggleTagLangMode, getPresetTagText, displayTagText,
            togglePresetTag, executeBatchTagSave,
            globalAvailableTags, newGlobalTagInput, addTagToGlobalPool,
            removeTagFromGlobalPool, clearAllTagsFromPool, batchRemoveTags,
            appendTagToSearch, isEditingSystemTags, addGlobalTag
        } = useTags({ systemCommonTags, tagLangMode, library, sanitizeImportedTags, confirmDialog, nativeAlert, persistCardUpdate, cardData, searchQueryInput, selectedIds, clearSelection, syncConfigToDisk, createProgressToast });

        // ===== SFC 化：构建全局上下文对象（provide 给 HeaderBar/SidebarPanel/EditorPanel 子组件共享） =====
        const ctx = {
            theme, toggleTheme, appSettings, showApiModal, resetPersonalizationSettings, resetApiSettings,
            showExperimentalMenu, pushToTavern,
            viewOptions, importFileInput, handleImportFiles, importCards, downloadCardFromUrl, selectAllCards, cleanGlobalTagsPrompt, sanitizeImportedTags,
            openBakFolder, openTrashFolder, openGlobalTrash, openChatTab,
            isScanningDisk, diskScanProgress, useSizeFilter, runDiskScan, showDiskScanModal,
            currentFolderPath, handleScanImported, refreshLibrary,
            isDragging, dragCounter, handleDragEnter, handleDragLeave, cardData, imgUrl, tabs, currentTab, currentTabInfo,
            safeData, specVersion, worldbookEntries, getEntryUid, getRegexUid, regexScripts, formattedJson, refreshCardData,
            addRegexScript, deleteRegexScript, syncRegexScriptField,
            worldbookExpanded, toggleWorldbookEntry, expandAllWorldbook, collapseAllWorldbook,
            getKeysString, updateEntryKeys,
            getRegexPlacement, handleDrop, handleFileUpload, downloadJson, reset,
            library, openFromLibrary,
            allCategories, customCategories, currentCategoryKey,
            getCategoryDisplayName, addNewCategory,
            renameCurrentCategory, deleteCustomCategory, currentCategoryDeletable, currentCategoryRenamable,
            currentCardCategory, handleCardCategoryChange, moveCardToGroup, triggerManualSnapshot,
            snapshotConfig, saveSnapshotSettings,
            // 📸 历史快照查看与一键恢复
            showSnapshotModal, snapshotList, snapshotCardName, snapshotCardPath,
            openSnapshotModal, restoreSnapshot, openSnapshotFolder, closeSnapshotModal, deleteSnapshot, cleanAllSnapshots, cleanOrphanSnapshots,
            currentPage, totalPages,
            searchQuery, searchQueryInput, filteredLibrary, paginatedLibrary,
            selectFixedDirectory, addManualTag, changePage,
            exportLibraryDB, importLibraryDB,
            renameCard, exportWorldbook,
            selectedIds, handleCardClick, toggleSelection, clearSelection,
            batchBarStyle, startBatchBarDrag, resetBatchBarPos,
            isMultiSelectMode, viewMode, toggleViewMode, isCompactMode, sortBy,
            contextMenu, openContextMenu, closeContextMenu,
            quickMoveGroup, exportCard, deleteCardItem, handleContextMenuAction,
            replaceCardImage,
            batchChangeCategory, batchAddTag,
            batchChangeCategoryModal, batchExportSelected, batchDeleteSelected, cleanupEmptyCategories,
            showBatchTagModal, batchInputTags, batchMode, presetTagsLibrary,
            systemCommonTags, batchTagChips, toggleBatchCommonTag, removeBatchTag,
            tagLangMode, toggleTagLangMode, getPresetTagText, displayTagText,
            togglePresetTag, executeBatchTagSave,
            showAITagModal, aiCandidateTags, aiCustomPrompt, aiTaggingProgress, isAITagging, openAITagModal, startAITagging,
            enableAIExtraction, customAIPrompt, newAICandidateTag,
            addAICandidateTag, addAICandidateTagManual, removeAICandidateTag,
            isTranslating, translateCardContent,
            isRefactoring, refactorCardFormat,
            toasts, showToast,
            systemPromptPresets, activeSystemPromptId, addSystemPromptPreset, deleteSystemPromptPreset, saveSystemPromptsToStorage, getCurrentSystemPromptContent, buildTaggingSystemPrompt,
            // 🚨 破限 (Jailbreak) 状态（对抗模型拒答/道德审查；localStorage 持久化）
            useJailbreak, jailbreakPrompt, jailbreakPresets,
            globalAvailableTags, newGlobalTagInput, addTagToGlobalPool, removeTagFromGlobalPool, clearAllTagsFromPool, batchRemoveTags, appendTagToSearch,
            isEditingSystemTags, addGlobalTag,
            chatHistory, chatInput, isChatting, apiEndpoint, apiKey, apiModel, apiType, saveApiConfig, handleApiTypeChange, chatContainer,
            rebindTavernPath,
            availableModels, isFetchingModels, fetchModelStatus, fetchAvailableModels,
            isChatRenderMode, // 【新增暴露】渲染/代码模式开关
            sendMessage, clearChat,
            showGraph, graphBuilding, openGraph, closeGraph,
            graphLayoutMode, graphSearchKeyword, minLinkWeight,
            isolateCurrentGroup, edgeFilters, graphStats,
            updateGraphLayout, renderGraph, exportGraph,
            estimateTokens, cardTokenStats, estimateCardTokens,
            showTextModal, textModalTitle, textModalContent, textModalFontSize, openTextModal, saveTextModal,
            showImageModal, previewImageUrl, openImageModal,
            showGlobalAssetModal, globalAssetTab, globalAllWorldbooks, globalAllRegexScripts,
            renderHTML, renderSafeHTML, cleanMarkdownFences, deleteCard, updateName, saveToLocalDisk, exportPackage,
            activeCardTags, addSingleTag, removeSingleTag,
            tagModalVisible, tagInput, tagModalTitle,
            confirmSingleTag, closeSingleTagModal,
            promptModalVisible, promptModalTitle, promptInput,
            confirmPrompt, cancelPrompt,
            // 🌍 世界书双引擎模式
            appMode, worldbooks, activeWorldbook, lastWorldbookDirPath, editorLogs, showEditorLogs, addLog,
            loadWorldbooks, scanWorldbookDir, saveActiveWorldbook, exportActiveWorldbook, exportFilteredWorldbook, saveCurrentAsset,
            // 🌍 世界书网址导入与重命名
            importUrl, isImportingWb, importWorldbookFromUrl, renameWorldbook,
            // 🌍 世界书文件夹导入 + 删除/克隆 + 专属右键菜单
            handleWorldbookFolderSelect, deleteWorldbook, duplicateWorldbook,
            wbContextMenu, openWbContextMenu, closeWbContextMenu, openWbInFolder,
            // 📁 世界书分组
            currentWbCategory, wbCategories, changeWbCategory,
            // 💾 统一 IPC 落盘
            syncWorldbooksToDisk,
            // 🌍 世界书词条深度编辑 (Entry IDE)
            ensureUid,
            addWorldbookEntry, deleteWorldbookEntry, duplicateWorldbookEntry, moveEntry,
            entrySearchQuery, entryFilterState, entrySortBy, filteredWorldbookEntries,
            entryBatchMode, batchSelected, toggleEntryBatchMode, toggleBatchSelect, selectAllEntries, clearBatchSelection,
            batchToggleEnabled, batchDeleteEntries,
            entryHealthReport, runEntryHealthCheck,
            // 🔎 全库词条搜索与反向引用
            globalEntryIndex, globalEntrySearchQuery, globalEntrySearchResults,
            showGlobalEntrySearchModal, openGlobalEntrySearch, closeGlobalEntrySearch, jumpToEntrySource,
            // 📤 世界书扩展
            extractWorldbookFromCard, importWbFromJsonl, exportWorldbooksBatch,
            showWbSnapshotModal, wbSnapshotList, wbSnapshotTarget, openWbSnapshots, closeWbSnapshotModal, restoreWbSnapshot,
            wbStats,
            // 🎛️ 角色卡内嵌世界书细化操作（词条增删/克隆/排序/搜索/标签化触发词）
            characterWorldbookSearchQuery, filteredCharacterWorldbookEntries,
            addCharacterWorldbookEntry, deleteCharacterWorldbookEntry,
            duplicateCharacterWorldbookEntry, moveCharacterWorldbookEntry,
            addEntryKey, removeEntryKey, handleEntryKeyInput, updateEntryComment,
            // 🎨 三主题切换（暗夜/青灰/白昼）
            setTheme,
            // 🚀 首屏加载状态
            isAppLoading,
            // � 侧边栏宽度拖拽自定义
            sidebarEl, sidebarWidth, sidebarStyle, startSidebarResize, resetSidebarWidth,
            // �🔍 智能查重与版本清洗
            showDedupeModal, duplicateGroups, startDedupeScan, resolveDedupeGroup,
            // 🌍 世界书库筛选与对比查重
            wbSearchQuery, wbFilterType, filteredWorldbooks,
            showWbDedupeModal, wbDuplicateGroups, startWorldbookDedupeScan, resolveWbDedupeGroup,
            // ⚖️ 双屏差异比对器 (Diff Inspector)
            showDiffDetailModal, diffMasterItem, diffCompareItem, diffFieldResults, openDiffDetailModal,
            // 🌐 世界书关系图谱 v2（过滤/搜索/布局/统计/导出）+ 🔗 多书合并 + 🔀 条目导入
            showWbGraphModal, openWbGraphModal, closeWbGraphModal,
            wbGraphLayout, wbGraphSearch, wbGraphFilters, wbGraphMinWeight, wbGraphStats, wbGraphBuilding,
            updateWbGraphLayout, renderWbGraph, exportWbGraph,
            openGraphSmart,
            showWbMergeModal, selectedWbMergePaths, openWbMergeModal, executeWorldbookMerge,
            showWbImportModal, importSourceBook, importCandidates, selectedImportEntries, importableSourceBooks,
            openWbImportModal, pickImportSource, confirmImportEntries,
            // 🚀 系统版本更新检测
            showUpdateModal, updateInfo, updateErrorMsg, checkForUpdatesManual, openExternalUrl,
            // 🛡️ 统一持久化中枢（app_config.json 最高权威）
            appConfig, syncConfigToDisk, persistCardUpdate
        };
        provide('appCtx', ctx);
        return ctx;
    }
};

</script>

<style>

        /* ==========================================================
           🎨 全局主题变量系统 (暗夜 dark / 青灰 slate / 白昼 light)
           ========================================================== */
        :root, [data-theme="dark"] {
            --bg-app: #09090b;
            --bg-surface: #18181b;
            --bg-element: #27272a;
            --bg-hover: #3f3f46;
            --text-main: #f4f4f5;
            --text-sub: #a1a1aa;
            --border-color: #27272a;
            --accent-color: #6366f1;
            --accent-wb: #d97706;
        }
        [data-theme="slate"] {
            --bg-app: #0f172a;
            --bg-surface: #1e293b;
            --bg-element: #334155;
            --bg-hover: #475569;
            --text-main: #f8fafc;
            --text-sub: #94a3b8;
            --border-color: #334155;
            --accent-color: #38bdf8;
            --accent-wb: #f59e0b;
        }
        [data-theme="light"] {
            --bg-app: #f4f4f5;
            --bg-surface: #ffffff;
            --bg-element: #e4e4e7;
            --bg-hover: #d4d4d8;
            --text-main: #18181b;
            --text-sub: #71717a;
            --border-color: #e4e4e7;
            --accent-color: #4f46e5;
            --accent-wb: #b45309;
        }
        /* 主题语义类：供组件直接引用变量（配合 css/style.css 的 [data-theme] 类覆盖全量生效） */
        .theme-surface { background-color: var(--bg-surface); border-color: var(--border-color); color: var(--text-main); }
        .theme-element { background-color: var(--bg-element); border-color: var(--border-color); color: var(--text-main); }

        /* ==========================================================
           高分屏字体渲染优化 (2K/4K 下中文更锐利、不发虚、无彩边)
           ========================================================== */
        html, body {
            /* 开启 WebKit 字体抗锯齿，2K/4K 屏幕下字体会更平滑、不发虚 */
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            /* 强制引擎优先保证文字的可读性与字形渲染质量 */
            text-rendering: optimizeLegibility;
        }

        /* ==========================================================
           DPI 缩放锐化：解决 125% / 150% 等非整数缩放下的发虚
           ========================================================== */
        /* 解决非整数 DPI 缩放 (如 125%, 150%) 下的缩图发虚问题 */
        img {
            /* 强制影像渲染引擎优化对比度，保持立绘与头像的锐利边缘 */
            image-rendering: -webkit-optimize-contrast;
        }

        /* 解决高 DPI 下 1px 边框被次像素抹除/发糊的问题 */
        /* 将所有外框线转换为高精度渲染模式 */
        .border, .border-b, .border-r, .border-t {
            /* 配合硬件加速，锁定像素网格对齐 */
            transform: translateZ(0);
            backface-visibility: hidden;
        }

        /* 如果外围容器有毛玻璃效果 (backdrop-blur)，确保它在缩放时不出撕裂黑边 */
        .backdrop-blur-sm, .backdrop-blur-md {
            -webkit-backdrop-filter: blur(8px) translateZ(0);
            backdrop-filter: blur(8px) translateZ(0);
        }

        /* ==========================================================
           双轨字号接管：
           1) --ui-fs 接管外围界面（顶部导航、侧边栏、菜单、按钮、弹窗）
           2) --workspace-fs 仅接管右侧编辑区（textarea / pre / 聊天气泡）
           ========================================================== */
        body, #app, nav, aside, header, footer,
        .ui-text, button, select, input:not(textarea) {
            font-size: var(--ui-fs, 13px) !important;
        }
        main textarea,          /* 接管所有多行文本输入框 (世界书、设定描述等) */
        main pre,               /* 接管 Raw JSON 原始代码展示区 */
        main .leading-relaxed,  /* 接管聊天测卡界面的对话气泡内容 */
        .workspace-editor {     /* 通用工作区编辑器标记 */
            font-size: var(--workspace-fs, 14px) !important;
        }
    
</style>
