<template>
    <div class="detail-page">
        <van-nav-bar :title="card ? card.name : '卡片详情'" left-arrow @click-left="$router.back()" safe-area-inset-top>
            <template #right>
                <van-icon name="smile-o" size="20" style="margin-right: 12px" @click="openAiTools" />
                <van-icon name="share-o" size="20" style="margin-right: 12px" @click="showPush = true" />
                <van-icon name="clock-o" size="20" style="margin-right: 12px" @click="openSnapshots" />
                <van-icon name="success" size="20" :color="saved ? '#06b6d4' : ''" @click="save" />
            </template>
        </van-nav-bar>

        <van-empty v-if="!card" description="卡片不存在">
            <van-button size="small" type="primary" @click="$router.back()">返回</van-button>
        </van-empty>

        <template v-else>
            <van-tabs v-model:active="activeTab" sticky offset-top="46">
                <van-tab title="设定" name="basic">
                    <!-- 基本信息(高频,每屏可见) -->
                    <div class="basic-wrap">
                        <div class="id-row">
                            <div class="id-cover-wrap">
                                <MobileCardCover :card="card" aspect="1 / 1" class="id-cover" />
                                <div class="id-cover-edit" @click="onChangeCover">🖼️</div>
                            </div>
                            <div class="id-info">
                                <van-field v-model="d.name" label="名称" placeholder="角色名称" />
                                <van-field v-model="d.creator" label="创建者" placeholder="创建者" />
                            </div>
                        </div>
                        <div class="tag-row">
                            <van-tag
                                v-for="(t, i) in tags"
                                :key="i" closable color="#eef7fb" text-color="#06b6d4"
                                @close="removeTag(i)"
                            >{{ t }}</van-tag>
                            <van-tag plain color="#999" class="add-tag" @click="addTag">＋</van-tag>
                        </div>
                        <div class="preset-tags">
                            <span class="pt-label" @click="toggleTagLang">标签库({{ tagLangMode === 'cn' ? '中' : 'EN' }})</span>
                            <van-tag
                                v-for="p in presetTagList"
                                :key="p.en"
                                plain
                                :color="tags.includes(p.en) ? '#06b6d4' : '#999'"
                                :text-color="tags.includes(p.en) ? '#fff' : '#666'"
                                class="pt-item"
                                @click="togglePresetTag(p)"
                            >{{ tagLangMode === 'cn' ? p.cn : p.en }}</van-tag>
                            <van-tag v-for="ct in customTagPool" :key="'c_'+ct" plain :color="tags.includes(ct) ? '#ee0a24' : '#c8c9cc'" :text-color="tags.includes(ct) ? '#fff' : '#666'" class="pt-item" @click="toggleCustomTag(ct)">{{ ct }}</van-tag>
                            <van-tag plain color="#ddd" text-color="#666" class="pt-item" @click="addCustomTag">＋自定义</van-tag>
                            <van-tag plain color="#ffecec" text-color="#ee0a24" class="pt-item" @click="manageCustomTags">管理</van-tag>
                        </div>
                        <div class="sec-label">Token 估算</div>
                        <van-field :model-value="tokenText" readonly is-link center @click="showTokenDetail = !showTokenDetail" />
                        <!-- 字段级 Token 分析栏(对齐桌面 Token 分析) -->
                        <div v-if="showTokenDetail" class="token-analysis">
                            <div v-for="row in tokenRows" :key="row.label" class="ta-row">
                                <span class="ta-label">{{ row.label }}</span>
                                <div class="ta-bar-wrap">
                                    <div class="ta-bar" :style="{ width: row.pct + '%', background: row.color }" />
                                </div>
                                <span class="ta-num">{{ row.value }}</span>
                            </div>
                            <div class="ta-total">合计 ≈ {{ tokenTotal }} tokens（酒馆上下文按 4 字符 ≈ 1 token 估算）</div>
                        </div>
                        <div v-else class="token-detail">{{ tokenDetailText }}</div>

                        <van-field
                            v-model="d.description"
                            type="textarea" rows="6" autosize
                            label="详细设定"
                            placeholder="性格、背景、行为模式…"
                        />
                    </div>

                    <!-- 高级设定(折叠) -->
                    <van-collapse v-model="advancedOpen" class="adv-collapse">
                        <van-collapse-item title="高级设定" name="adv">
                            <van-field v-model="d.creator_notes" type="textarea" rows="2" autosize label="创建者备注" placeholder="仅作者可见的备注(creator_notes)" />
                            <van-field :model-value="d.character_version || ''" @update:model-value="d.character_version = $event" label="卡版本" placeholder="如 1.0.0" />
                            <van-field v-model="d.first_mes" type="textarea" rows="3" autosize label="开场白" />
                            <van-field v-model="d.scenario" type="textarea" rows="3" autosize label="场景" />
                            <van-field v-model="d.mes_example" type="textarea" rows="5" autosize label="示例对话" />
                            <van-field
                                :model-value="greetingsText" label="备用开场白"
                                type="textarea" rows="3" autosize
                                @update:model-value="greetingsText = $event"
                            />
                            <van-field v-model="d.system_prompt" type="textarea" rows="2" autosize label="系统提示" placeholder="system_prompt(卡内覆写,酒馆兼容)" />
                            <van-field v-model="d.post_history_instructions" type="textarea" rows="2" autosize label="对话后注入" placeholder="post_history_instructions(酒馆兼容)" />
                            <van-field
                                :model-value="depthPromptText"
                                @update:model-value="depthPromptText = $event"
                                type="textarea" rows="2" autosize
                                label="深度提示"
                                placeholder="extensions.depth_prompt.prompt"
                            />
                        </van-collapse-item>
                        <van-collapse-item title="状态栏预览" name="status">
                            <div class="stub-window">
                                <van-field
                                    v-model="statusInput"
                                    type="textarea"
                                    rows="5"
                                    autosize
                                    label="AI 输出(可粘贴 <status> 块)"
                                    placeholder="粘贴包含 <status>…</status> 的 AI 回复…"
                                />
                                <div class="st-bar">
                                    <span class="st-count">
                                        {{ previewText.length }} 字 ·
                                        {{ statusScripts.length }} 个渲染脚本
                                        <template v-if="!statusScripts.length">(正则段添加)</template>
                                    </span>
                                    <van-button size="mini" plain type="primary" @click="showStatusTemplates = !showStatusTemplates">模板库</van-button>
                                    <van-button size="mini" plain @click="resetStatusDemo">恢复示例</van-button>
                                </div>
                                <div v-if="showStatusTemplates" class="st-tpl-list">
                                    <div class="st-tpl-title">🎨 渲染模板（注入为正则脚本）</div>
                                    <div
                                        v-for="tp in STATUSBAR_TEMPLATES"
                                        :key="tp.key"
                                        class="st-tpl-item"
                                        @click="injectStatusTemplate(tp)"
                                    >
                                        <span class="st-tpl-icon">{{ tp.icon }}</span>
                                        <div class="st-tpl-main">
                                            <div class="st-tpl-name">{{ tp.name }}</div>
                                            <div class="st-tpl-desc">{{ tp.desc }}</div>
                                        </div>
                                    </div>
                                    <div class="st-tpl-title" style="margin-top: 10px">📜 世界书指令模板（注入为内嵌世界书条目）</div>
                                    <div
                                        v-for="tp in STATUSBAR_PROMPT_TEMPLATES"
                                        :key="tp.key"
                                        class="st-tpl-item"
                                        @click="injectPromptTemplate(tp)"
                                    >
                                        <span class="st-tpl-icon">{{ tp.icon }}</span>
                                        <div class="st-tpl-main">
                                            <div class="st-tpl-name">{{ tp.name }}</div>
                                            <div class="st-tpl-desc">{{ tp.desc }}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="st-label">渲染预览</div>
                                <div class="st-preview" v-html="statusHtml"></div>
                                <div class="st-label">应用后源码</div>
                                <pre class="st-source">{{ statusHtml ? statusApplied : '（输入 AI 输出后实时渲染）' }}</pre>
                            </div>
                        </van-collapse-item>
                    </van-collapse>
                </van-tab>

                <van-tab title="世界书" name="wb">
                    <div class="tab-pad">
                        <van-button block icon="plus" type="primary" plain @click="addWbEntry">添加条目</van-button>
                        <div v-for="(e, key) in wbEntries" :key="key" class="wb-item">
                            <div class="wb-head">
                                <van-switch v-model="e.enabled" size="20px" />
                                <van-field v-model="e.comment" placeholder="条目名(comment)" class="wb-name" />
                                <van-icon name="arrow-up" size="14" class="wb-op" @click="moveWbEntry(key, -1)" />
                                <van-icon name="arrow-down" size="14" class="wb-op" @click="moveWbEntry(key, 1)" />
                                <van-icon name="arrow" :class="['wb-arrow', { 'wb-arrow-open': wbExpanded[key] }]" size="14" @click="toggleWbExpand(key)" />
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeWbEntry(key)" />
                            </div>
                            <div v-if="wbExpanded[key]" class="wb-detail">
                                <van-field v-model="e._keysText" label="触发词" placeholder="逗号分隔，多个用英文逗号" @blur="syncWbKeys(e)" />
                                <van-field v-model="e._secKeysText" label="次级触发词" placeholder="逗号分隔，可选" @blur="syncWbSecKeys(e)" />
                                <div class="wb-num-row">
                                    <van-field v-model.number="e.insertion_order" type="number" label="优先级" placeholder="50" />
                                    <van-field v-model.number="e.order" type="number" label="权重" placeholder="100" />
                                </div>
                                <van-cell title="常驻显示" center>
                                    <template #right-icon><van-switch v-model="e.constant" size="20px" /></template>
                                </van-cell>
                                <van-cell title="条件触发" center>
                                    <template #right-icon><van-switch v-model="e.selective" size="20px" /></template>
                                </van-cell>
                                <van-cell-group inset title="插入位置">
                                    <van-radio-group v-model="e.position">
                                        <van-cell v-for="opt in WB_POSITIONS" :key="opt.value" :title="opt.label" clickable @click="e.position = opt.value">
                                            <template #right-icon><van-radio :name="opt.value" :checked="e.position === opt.value" @click.stop /></template>
                                        </van-cell>
                                    </van-radio-group>
                                </van-cell-group>
                                <van-field v-model="e.content" type="textarea" rows="3" autosize placeholder="条目内容" />
                            </div>
                        </div>
                        <van-empty v-if="!Object.keys(wbEntries || {}).length" description="无世界书条目" image-size="60" />
                    </div>
                </van-tab>

                <van-tab title="正则" name="regex">
                    <div class="tab-pad">
                        <van-button block icon="plus" type="primary" plain @click="addRegex">添加正则</van-button>
                        <div v-for="(r, i) in regexList" :key="i" class="regex-item">
                            <div class="wb-head">
                                <van-switch :model-value="!r.disabled" @update:model-value="r.disabled = !$event" size="20px" />
                                <van-field v-model="r.scriptName" placeholder="名称" class="wb-name" />
                                <van-icon name="arrow" :class="['wb-arrow', { 'wb-arrow-open': regexExpanded[i] }]" size="14" @click="toggleRegexExpand(i)" />
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeRegex(i)" />
                            </div>
                            <div v-if="regexExpanded[i]" class="regex-detail">
                                <van-field v-model="r.findRegex" label="查找" placeholder="例: <think>.*?</think>" />
                                <van-field v-model="r.replaceString" label="替换" type="textarea" rows="2" autosize placeholder="替换(空 = 删除匹配)" />
                                <van-cell-group inset title="作用位置">
                                    <van-cell v-for="opt in REGEX_PLACEMENTS" :key="opt.value" :title="opt.label">
                                        <template #right-icon>
                                            <van-checkbox :model-value="(r.placement || []).includes(opt.value)" @update:model-value="toggleRegexPlacement(r, opt.value)" />
                                        </template>
                                    </van-cell>
                                </van-cell-group>
                            </div>
                        </div>
                        <van-empty v-if="!regexList || !regexList.length" description="无正则脚本" image-size="60" />
                    </div>
                </van-tab>

                <van-tab title="JSON" name="raw">
                    <div class="tab-pad">
                        <div class="raw-bar">
                            <span class="raw-size">{{ rawJsonText.length }} 字符</span>
                            <van-button size="mini" plain type="primary" @click="copyRawJson">复制全部</van-button>
                        </div>
                        <pre class="raw-json">{{ rawJsonText }}</pre>
                    </div>
                </van-tab>

                <van-tab title="测卡" name="chat">
                    <div class="chat-wrap">
                        <div class="chat-toolbar">
                            <span class="ct-title">与「{{ card ? card.name : '' }}」对话</span>
                            <van-icon name="replay" size="18" style="margin: 0 12px 0 auto" @click="clearChat" />
                            <van-icon name="setting-o" size="18" @click="showChatApi = true" />
                        </div>
                        <div ref="chatListEl" class="chat-list">
                            <div v-for="(m, i) in chatMessages" :key="i" class="bubble" :class="m.role">
                                <div class="b-name">{{ m.role === 'user' ? '我' : (card ? card.name : 'AI') }}</div>
                                <pre class="b-content">{{ m.content }}</pre>
                            </div>
                            <van-loading v-if="chatSending" size="20">思考中…</van-loading>
                            <van-empty v-if="!chatMessages.length && !chatSending" description="暂无对话，输入消息开始测卡" image-size="60" />
                        </div>
                        <div class="input-bar">
                            <van-field v-model="chatDraft" type="textarea" autosize rows="1" placeholder="输入消息…" />
                            <van-button type="primary" size="small" :loading="chatSending" @click="sendChat">发送</van-button>
                        </div>
                    </div>
                </van-tab>
            </van-tabs>
        </template>

        <!-- 推送酒馆弹窗 -->
        <van-popup v-model:show="showPush" position="center" round class="push-popup">
            <div class="push-head">
                <span class="push-title">推送到目标</span>
                <van-icon name="cross" size="18" @click="showPush = false" />
            </div>
            <div class="push-body">
                <!-- 目标类型切换 -->
                <van-cell-group inset>
                    <van-cell title="目标类型">
                        <template #value>
                            <van-radio-group :model-value="pushTargetMode" direction="horizontal" @update:model-value="switchPushMode">
                                <van-radio name="sillytavern">酒馆 API</van-radio>
                                <van-radio name="custom">卡库目录</van-radio>
                            </van-radio-group>
                        </template>
                    </van-cell>
                </van-cell-group>

                <!-- 酒馆 API 模式 -->
                <template v-if="pushTargetMode === 'sillytavern'">
                    <van-field
                        v-model="tavernUrl"
                        label="酒馆地址"
                        placeholder="http://192.168.1.100:8000"
                        @update:model-value="savePushConfig"
                    />
                    <van-field
                        v-model="tavernKey"
                        label="API 密码"
                        type="password"
                        placeholder="留空 = 未开启 API 扩展"
                        @update:model-value="savePushConfig"
                    />
                    <div class="push-tip">
                        将向 {{ tavernUrl || '酒馆地址' }}/api/characters/import 以角色名「{{ card ? card.name : '' }}」推送本卡片。
                        若酒馆开启了 API 扩展（设置 → Extensions → API），需要填写 API 密码。
                    </div>
                </template>

                <!-- 卡库目录模式:多目标管理 -->
                <template v-else>
                    <van-cell-group inset>
                        <van-cell
                            v-for="t in pushTargets"
                            :key="t.id"
                            :title="t.name"
                            :label="t.title || t.uri"
                            clickable
                            @click="currentPushTargetId = t.id; savePushTargets()"
                        >
                            <template #icon>
                                <van-icon
                                    :name="currentPushTargetId === t.id ? 'checked' : 'circle'"
                                    :color="currentPushTargetId === t.id ? '#06b6d4' : '#c8c9cc'"
                                    size="20"
                                    style="margin: 12px"
                                />
                            </template>
                            <template #value>
                                <van-icon name="delete-o" size="16" @click.stop="removePushTarget(t.id)" />
                            </template>
                        </van-cell>
                        <van-cell title="添加卡库目录" icon="plus" clickable @click="addPushTarget" />
                    </van-cell-group>
                    <div class="push-tip">
                        直接把卡片文件复制到所选目录（同名覆盖，与桌面推送一致）；无需酒馆开启 API。
                    </div>
                </template>
            </div>
            <div class="push-ops">
                <van-button block type="primary" :loading="pushing" @click="doPush">
                    {{ pushTargetMode === 'sillytavern' ? '推送到酒馆' : '复制到所选目录' }}
                </van-button>
            </div>
        </van-popup>

        <!-- 历史快照弹窗 -->
        <SnapshotModal
            :show="showSnapshots"
            :snapshots="snapshots"
            :card-name="card ? card.name : ''"
            @close="showSnapshots = false"
            @create="createSnapshot"
            @restore="restoreSnapshot"
            @delete="deleteSnapshot"
            @clean="cleanSnapshots"
        />

        <!-- 测卡 API 配置弹窗(与设置页共享 stc-api-* 存储键) -->
        <van-popup v-model:show="showChatApi" position="bottom" round style="height: 60%">
            <van-nav-bar title="API 设置" @click-left="showChatApi = false">
                <template #left><van-icon name="arrow-left" /></template>
            </van-nav-bar>
            <van-cell-group inset style="margin-top: 12px">
                <van-field v-model="chatApiEndpoint" label="端点" placeholder="http://127.0.0.1:1234/v1/chat/completions" />
                <van-field v-model="chatApiKey" label="Key" placeholder="sk-... 或留空" />
                <van-field v-model="chatApiModel" label="模型" placeholder="local-model" is-link readonly clickable @click="showModelPicker = availableModels.length > 0" />
                <van-cell title="拉取模型" :value="modelFetchStatus || '点击获取服务端模型列表'" is-link :disabled="fetchingModels" @click="fetchAvailableModels" />
                <van-cell v-if="availableModels.length" :title="`已拉取 ${availableModels.length} 个模型`" is-link @click="showModelPicker = true" />
                <van-cell title="协议">
                    <template #value>
                        <van-radio-group :model-value="chatApiType" direction="horizontal" @update:model-value="onApiTypeChange">
                            <van-radio name="openai" :style="radioStyle">OpenAI</van-radio>
                            <van-radio name="anthropic" :style="radioStyle">Anthropic</van-radio>
                        </van-radio-group>
                    </template>
                </van-cell>
            </van-cell-group>
            <div style="padding: 16px">
                <van-button block type="primary" @click="saveChatApi">保存</van-button>
            </div>
        </van-popup>

        <!-- 模型选择弹窗 -->
        <van-popup v-model:show="showModelPicker" position="bottom" round style="max-height: 60%">
            <van-nav-bar title="选择模型" @click-right="showModelPicker = false">
                <template #right><van-icon name="cross" /></template>
            </van-nav-bar>
            <van-search v-model="modelFilter" placeholder="搜索模型" />
            <div style="overflow-y: auto; max-height: calc(60vh - 100px)">
                <van-cell
                    v-for="m in filteredModels"
                    :key="m"
                    :title="m"
                    clickable
                    @click="pickModel(m)"
                >
                    <template #right-icon>
                        <van-icon v-if="m === chatApiModel" name="success" color="#06b6d4" />
                    </template>
                </van-cell>
            </div>
        </van-popup>

        <!-- 输入弹窗(自定义标签等) -->
        <van-dialog
            v-model:show="showInputDialog"
            :title="inputDialogTitle"
            show-cancel-button
            @confirm="onInputConfirm"
            @cancel="onInputCancel"
        >
            <van-field v-model="inputValue" :placeholder="inputPlaceholder" style="margin: 16px 0" />
        </van-dialog>

        <!-- AI 智能工具弹窗 -->
        <AiToolModal
            :show="showAiTools"
            :mode="aiMode"
            :endpoint="chatApiEndpoint"
            :key="chatApiKey"
            :model="chatApiModel"
            :api-type="chatApiType"
            :candidates="aiCandidates"
            :running="aiRunning"
            :progress="aiProgress"
            @close="showAiTools = false; aiMode = ''"
            @update:endpoint="chatApiEndpoint = $event"
            @update:key="chatApiKey = $event"
            @update:model="chatApiModel = $event"
            @update:apiType="chatApiType = $event"
            @tag="startAiTagging"
            @rules="showAutoTagRules = true"
            @translate="startAiTranslate"
            @refactor="startAiRefactor"
            @add-candidate="addAICandidate"
            @remove-candidate="removeAICandidate"
        />

        <!-- 自动打标规则表弹窗 -->
        <AutoTagRulesModal
            :show="showAutoTagRules"
            :system-rules="defaultAutoTagRules"
            :disabled-rules="disabledRuleNames"
            :custom-rules="customAutoTagRules"
            :keyword-candidates="autoTagKeywordCandidates"
            @close="showAutoTagRules = false"
            @toggle-system="toggleSystemRule"
            @add-custom="addCustomRule"
            @remove-custom="removeCustomRule"
        />
    </div>
</template>

<script>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { defaultAutoTagRules, autoTagKeywordCandidates, compileAutoTagRules } from '../../utils/cardLoader.js';
import { useRoute } from 'vue-router';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import MobileCardCover from '../components/MobileCardCover.vue';
import SnapshotModal from '../components/SnapshotModal.vue';
import AiToolModal from '../components/AiToolModal.vue';
import AutoTagRulesModal from '../components/AutoTagRulesModal.vue';
import { findCard, saveCardData, loadLibrary } from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate';
import { api } from '../../bridge/api';
import { parseRegexPattern, classifyTemplate, sanitizeStatusHtml } from '../../composables/useStatusbarPreview.js';
import { STATUSBAR_TEMPLATES } from '../../utils/statusbarTemplates.js';
import { STATUSBAR_PROMPT_TEMPLATES } from '../../utils/statusbarPromptTemplates.js';

// 推送酒馆配置存储键
const LS_TAVERN_URL = 'jsmobile-tavern-url';
const LS_TAVERN_KEY = 'jsmobile-tavern-key';

export default {
    name: 'CardDetailView',
    components: { MobileCardCover, SnapshotModal, AiToolModal, AutoTagRulesModal },
    setup() {
        const route = useRoute();
        const id = ref('');
        const card = ref(null);
        const activeTab = ref('basic');
        const advancedOpen = ref([]);
        const showTokenDetail = ref(false);
        let saved = ref(true);

        // ---------- 推送酒馆 ----------
        const showPush = ref(false);
        const pushing = ref(false);
        const tavernUrl = ref(localStorage.getItem(LS_TAVERN_URL) || '');
        const tavernKey = ref(localStorage.getItem(LS_TAVERN_KEY) || '');
        function savePushConfig() {
            localStorage.setItem(LS_TAVERN_URL, tavernUrl.value.trim());
            localStorage.setItem(LS_TAVERN_KEY, tavernKey.value.trim());
        }

        // ---------- 推送目标管理(对齐桌面 PushModal:酒馆 API / 自定义卡库目录多目标) ----------
        const LS_PUSH_TARGETS = 'jsmobile-push-targets'; // { mode, currentId, targets: [{id,name,uri,title}] }
        const pushTargetMode = ref('sillytavern');
        const pushTargets = ref([]);
        const currentPushTargetId = ref('');
        try {
            const saved = JSON.parse(localStorage.getItem(LS_PUSH_TARGETS) || '{}');
            if (saved.mode) pushTargetMode.value = saved.mode;
            if (Array.isArray(saved.targets)) pushTargets.value = saved.targets;
            if (saved.currentId) currentPushTargetId.value = saved.currentId;
        } catch (e) { /* 首次无配置 */ }
        function savePushTargets() {
            localStorage.setItem(LS_PUSH_TARGETS, JSON.stringify({
                mode: pushTargetMode.value,
                currentId: currentPushTargetId.value,
                targets: pushTargets.value
            }));
        }
        function switchPushMode(m) {
            pushTargetMode.value = m;
            savePushTargets();
        }
        async function addPushTarget() {
            const res = await api.selectPushFolder();
            if (!res || !res.success || !res.path) {
                showToast((res && res.error) || '未选择目录');
                return;
            }
            const name = window.prompt('目标名称：', res.title || '卡库目录');
            if (name === null) return; // 用户取消
            const target = {
                id: 'pt_' + Date.now().toString(36),
                name: (String(name).trim() || '卡库目录'),
                uri: res.path,
                title: res.title || ''
            };
            pushTargets.value.push(target);
            currentPushTargetId.value = target.id;
            savePushTargets();
            showSuccessToast('已添加推送目标');
        }
        function removePushTarget(id) {
            pushTargets.value = pushTargets.value.filter((t) => t.id !== id);
            if (currentPushTargetId.value === id) {
                currentPushTargetId.value = pushTargets.value.length ? pushTargets.value[0].id : '';
            }
            savePushTargets();
        }
        async function doPush() {
            if (!card.value) return;
            pushing.value = true;
            try {
                    if (pushTargetMode.value === 'custom') {
                        const target = pushTargets.value.find((t) => t.id === currentPushTargetId.value);
                        if (!target) {
                            showToast('请先添加并选择卡库目录');
                            return;
                        }
                        const res2 = await api.pushToCustomDir({ filePaths: [card.value.path], targetDir: target.uri });
                        if (res2 && res2.success) {
                            showPush.value = false;
                            showSuccessToast('已复制到「' + target.name + '」');
                        } else {
                            showToast((res2 && res2.error) || '复制失败');
                        }
                        return;
                    }
                    const url = tavernUrl.value.trim().replace(/\/+$/, '');
                    if (!url) {
                        showToast('请先填写酒馆地址');
                        return;
                    }
                    const res = await api.pushToTavern({
                    filePath: card.value.path,
                    targetUrl: url,
                    apiKey: tavernKey.value.trim(),
                    cardName: card.value.name
                });
                if (res && res.success) {
                    showPush.value = false;
                    showSuccessToast('推送成功！请在酒馆刷新角色列表查看');
                } else {
                    showToast((res && res.error) || '推送失败');
                }
            } catch (e) {
                showToast((e && e.message) || '推送失败');
            } finally {
                pushing.value = false;
            }
        }

        function resolveId() {
            // query.p 由 vue-router 解析时已 decode,无需二次 decodeURIComponent
            id.value = String(route.query.p || '');
        }

        // 角色数据层(card.data.data);不存在则初始化
        const dataLayer = computed(() => {
            if (!card.value || !card.value.data) return null;
            if (!card.value.data.data) card.value.data.data = {};
            return card.value.data.data;
        });
        const d = computed(() => dataLayer.value || {});

        const tags = computed(() => {
            if (!d.value.tags) d.value.tags = [];
            return d.value.tags;
        });

        // 备用开场白(数组 ↔ 多行文本)
        const greetingsText = computed({
            get() {
                const g = d.value.alternate_greetings;
                return Array.isArray(g) ? g.join('\n### 分隔\n') : (g || '');
            },
            set(v) {
                d.value.alternate_greetings = String(v || '').split(/### 分隔|\n/).map((s) => s.trim()).filter(Boolean);
            }
        });

        // 世界书(兼容对象/数组两种容器)
        const wbEntries = computed(() => {
            if (!d.value.extensions) d.value.extensions = {};
            if (!d.value.extensions.world_book || typeof d.value.extensions.world_book !== 'object') {
                d.value.extensions.world_book = { entries: {} };
            }
            const wb = d.value.extensions.world_book;
            if (!wb.entries) wb.entries = {};
            if (!(wb.entries instanceof Object)) wb.entries = {};
            // 为每条补临时文本字段(触发词逗号分隔),确保 v-model 输入流畅,blur 时同步回数组
            Object.values(wb.entries).forEach((entry) => {
                if (entry && typeof entry === 'object') {
                    if (!('_keysText' in entry)) entry._keysText = Array.isArray(entry.keys) ? entry.keys.join(', ') : String(entry.keys || '');
                    if (!('_secKeysText' in entry)) {
                        const sec = Array.isArray(entry.keysecondary) ? entry.keysecondary : (Array.isArray(entry.secondary_keys) ? entry.secondary_keys : []);
                        entry._secKeysText = sec.join(', ');
                    }
                    if (entry.position === undefined) entry.position = 1;
                }
            });
            return wb.entries;
        });

        // 世界书条目展开编辑(完整字段)
        const WB_POSITIONS = [
            { value: 0, label: '顶部（定义前）' },
            { value: 1, label: '底部（定义后）' },
            { value: 2, label: '聊天记录前' },
            { value: 3, label: '@D 深度提示内' }
        ];
        const wbExpanded = reactive({});
        function toggleWbExpand(key) { wbExpanded[key] = !wbExpanded[key]; }
        function syncWbKeys(e) {
            e.keys = String(e._keysText || '').split(',').map((s) => s.trim()).filter(Boolean);
        }
        function syncWbSecKeys(e) {
            const keys = String(e._secKeysText || '').split(',').map((s) => s.trim()).filter(Boolean);
            e.keysecondary = keys;
            if (e.secondary_keys) delete e.secondary_keys;
        }

        function addWbEntry() {
            const key = 'wb_' + Date.now().toString(36);
            wbEntries.value[key] = {
                comment: '', content: '', enabled: true, keys: [], keysecondary: [],
                selective: false, constant: false, position: 1, insertion_order: 50, order: 100,
                _keysText: '', _secKeysText: ''
            };
            wbExpanded[key] = true;
            saved.value = false;
        }
        function removeWbEntry(key) {
            delete wbEntries.value[key];
            saved.value = false;
        }

        // 深度提示 prompt(存于 extensions.depth_prompt)
        const depthPromptText = computed({
            get() {
                const dp = d.value.extensions && d.value.extensions.depth_prompt;
                return (dp && dp.prompt) || '';
            },
            set(v) {
                if (!d.value.extensions) d.value.extensions = {};
                if (!d.value.extensions.depth_prompt || typeof d.value.extensions.depth_prompt !== 'object') {
                    d.value.extensions.depth_prompt = { prompt: '', depth: 4, role: 'system' };
                }
                d.value.extensions.depth_prompt.prompt = v;
                saved.value = false;
            }
        });

        // 卡内世界书条目排序:按键序重建 entries 对象(上下移)
        function moveWbEntry(key, dir) {
            const entries = wbEntries.value;
            const keys = Object.keys(entries);
            const idx = keys.indexOf(key);
            const next = idx + dir;
            if (idx < 0 || next < 0 || next >= keys.length) return;
            // 交换 insertion_order(物理持久层) + 重建键序(显示层)
            // 若两条 order 相同,交换后视觉无变化 → 强制产生 ±1 差异保证移动可见
            const a = entries[keys[idx]];
            const b = entries[keys[next]];
            const oa = Number(a.insertion_order) || 0;
            const ob = Number(b.insertion_order) || 0;
            a.insertion_order = (dir < 0) ? Math.min(oa, ob) - 1 : Math.max(oa, ob) + 1;
            b.insertion_order = (dir < 0) ? Math.max(oa, ob) : Math.min(oa, ob);
            const rebuilt = {};
            const order = keys.slice();
            order[next] = keys[idx];
            order[idx] = keys[next];
            order.forEach((k) => { rebuilt[k] = entries[k]; });
            d.value.extensions.world_book.entries = rebuilt;
            saved.value = false;
        }

        // 正则(兼容 enabled/disabled 双字段,统一归一化为 disabled;placement 数组化)
        const regexList = computed(() => {
            if (!d.value.extensions) d.value.extensions = {};
            if (!Array.isArray(d.value.extensions.regex_scripts)) d.value.extensions.regex_scripts = [];
            d.value.extensions.regex_scripts.forEach((r) => {
                if (r && typeof r === 'object') {
                    if (r.enabled !== undefined && r.disabled === undefined) r.disabled = !r.enabled;
                    if (!Array.isArray(r.placement)) r.placement = [];
                }
            });
            return d.value.extensions.regex_scripts;
        });
        const REGEX_PLACEMENTS = [
            { value: 0, label: '全局 / 未定义' },
            { value: 1, label: '用户输入' },
            { value: 2, label: 'AI 回复' },
            { value: 3, label: '全文本' }
        ];
        const regexExpanded = reactive({});
        function toggleRegexExpand(i) { regexExpanded[i] = !regexExpanded[i]; }
        function toggleRegexPlacement(r, v) {
            if (!Array.isArray(r.placement)) r.placement = [];
            const idx = r.placement.indexOf(v);
            if (idx >= 0) r.placement.splice(idx, 1);
            else r.placement.push(v);
        }
        function addRegex() {
            regexList.value.push({ scriptName: '', findRegex: '', replaceString: '', disabled: false, placement: [] });
            saved.value = false;
        }
        function removeRegex(i) {
            regexList.value.splice(i, 1);
            saved.value = false;
        }

        function removeTag(i) {
            d.value.tags.splice(i, 1);
            saved.value = false;
        }
        function addTag() {
            const t = window.prompt('输入标签:');
            if (t && t.trim() && !d.value.tags.includes(t.trim())) {
                d.value.tags.push(t.trim());
                saved.value = false;
            }
        }

        // ---------- 标签库（中英双语预设，对齐桌面 useTags presetTagsLibrary） ----------
        const PRESET_TAGS = [
            { cn: '奇幻', en: 'Fantasy' }, { cn: '科幻', en: 'Sci-Fi' }, { cn: '现代', en: 'Modern' },
            { cn: '末日', en: 'Post-Apocalyptic' }, { cn: '限制级', en: 'NSFW' }, { cn: '恋爱', en: 'Romance' },
            { cn: '病娇', en: 'Yandere' }, { cn: '傲娇', en: 'Tsundere' }, { cn: '精灵', en: 'Elf' },
            { cn: '魔物娘', en: 'Monster Girl' }, { cn: '巨龙', en: 'Dragon' }, { cn: '吸血鬼', en: 'Vampire' },
            { cn: '恶魔', en: 'Demon' }, { cn: '天使', en: 'Angel' }, { cn: '兽耳', en: 'Kemonomimi' },
            { cn: '机甲', en: 'Mecha' }, { cn: '魔法', en: 'Magic' }, { cn: '系统流', en: 'System' },
            { cn: '异世界', en: 'Isekai' }, { cn: '暗黑', en: 'Dark' }, { cn: '喜剧', en: 'Comedy' },
            { cn: '虐心', en: 'Angst' }, { cn: '日常', en: 'Slice of Life' }, { cn: '动作', en: 'Action' },
            { cn: '原创', en: 'Original' }, { cn: '动漫', en: 'Anime' }, { cn: '游戏', en: 'Game' }, { cn: '小说', en: 'Novel' }
        ];
        const tagLangMode = ref(localStorage.getItem('stc-tag-lang') || 'cn');
        const presetTagList = computed(() => PRESET_TAGS);
        function toggleTagLang() {
            tagLangMode.value = tagLangMode.value === 'cn' ? 'en' : 'cn';
            try { localStorage.setItem('stc-tag-lang', tagLangMode.value); } catch (e) { /* 忽略 */ }
        }

        // ---------- 自定义标签库(localStorage 持久化,对齐桌面 systemCommonTags 语义的轻量版) ----------
        const LS_CUSTOM_TAGS = 'jsmobile-custom-tags';
        const customTagPool = ref((() => {
            try { return JSON.parse(localStorage.getItem(LS_CUSTOM_TAGS) || '[]'); } catch (e) { return []; }
        })());
        function saveCustomTagPool() {
            try { localStorage.setItem(LS_CUSTOM_TAGS, JSON.stringify(customTagPool.value)); } catch (e) { /* 忽略 */ }
        }
        function toggleCustomTag(tag) {
            const idx = d.value.tags.indexOf(tag);
            if (idx >= 0) d.value.tags.splice(idx, 1);
            else d.value.tags.push(tag);
            saved.value = false;
        }
        async function addCustomTag() {
            const tag = await promptInput('添加自定义标签', '', '标签名');
            if (!tag) return;
            if (!customTagPool.value.includes(tag)) { customTagPool.value.push(tag); saveCustomTagPool(); }
            if (!d.value.tags.includes(tag)) { d.value.tags.push(tag); saved.value = false; }
        }
        async function manageCustomTags() {
            if (!customTagPool.value.length) { showToast('暂无自定义标签'); return; }
            const names = customTagPool.value.join('、');
            try {
                await showConfirmDialog({
                    title: '清理标签库',
                    message: `当前自定义标签：\n${names}\n\n选择「清空」移除全部自定义标签(不影响卡片已有标签)。`,
                    confirmButtonText: '清空',
                    confirmButtonColor: '#ee0a24',
                    showCancelButton: true,
                    cancelButtonText: '取消'
                });
            } catch (e) { return; }
            customTagPool.value = [];
            saveCustomTagPool();
            showSuccessToast('已清空自定义标签库');
        }
        // Promise 式输入弹窗(复用页面级 van-dialog)
        const showInputDialog = ref(false);
        const inputDialogTitle = ref('');
        const inputValue = ref('');
        const inputPlaceholder = ref('');
        let inputResolver = null;
        function promptInput(title, value, placeholder) {
            inputDialogTitle.value = title;
            inputValue.value = value || '';
            inputPlaceholder.value = placeholder || '';
            showInputDialog.value = true;
            return new Promise((resolve) => { inputResolver = resolve; });
        }
        function onInputConfirm() {
            showInputDialog.value = false;
            if (inputResolver) { inputResolver(inputValue.value.trim()); inputResolver = null; }
        }
        function onInputCancel() {
            showInputDialog.value = false;
            if (inputResolver) { inputResolver(null); inputResolver = null; }
        }
        function togglePresetTag(p) {
            const tag = tagLangMode.value === 'cn' ? p.cn : p.en;
            const idx = d.value.tags.indexOf(tag);
            if (idx >= 0) d.value.tags.splice(idx, 1);
            else d.value.tags.push(tag);
            saved.value = false;
        }

        // ---------- 状态栏预览(简化版:应用卡内渲染脚本到 AI 输出) ----------
        const STATUS_DEMO = `<status>\n❤️ 体力：85/100\n💰 金钱：320\n💕 好感度：42\n📅 第 3 天 · 上午 · 晴\n</status>\n\n其余回复内容原样保留，只有 <status> 块被渲染成面板。`;
        const statusInput = ref(STATUS_DEMO);
        const previewText = computed(() => statusInput.value.length);

        // 可参与渲染的脚本:replaceString 被分类器判定为完整模板(loader/html/code)且启用(统一 disabled 语义)
        const statusScripts = computed(() => {
            const list = Array.isArray(regexList.value) ? regexList.value : [];
            return list.filter((s) => s && s.disabled !== true
                && classifyTemplate(String(s.replaceString || '')).type !== 'none'
                && classifyTemplate(String(s.replaceString || '')).type !== 'fragment');
        });

        // 依次应用启用脚本(与酒馆一致:全局替换,$1 等捕获组原生支持)
        const statusApplied = computed(() => {
            let text = statusInput.value || '';
            for (const s of statusScripts.value) {
                const re = parseRegexPattern(s.findRegex || s.find_regex);
                if (!re) continue;
                try { text = text.replace(re, String(s.replaceString || '')); } catch (e) { /* 单脚本失败不中断 */ }
            }
            return text;
        });
        // 渲染预览:DOMPurify 白名单清洗
        const statusHtml = computed(() => sanitizeStatusHtml(statusApplied.value));

        function resetStatusDemo() {
            statusInput.value = STATUS_DEMO;
        }

        // ---------- 状态栏模板注入 ----------
        const showStatusTemplates = ref(false);

        // 渲染模板 → 注入为正则脚本(与酒馆 STATUS_FIND 约定一致,placement:[2] 作用于 AI 输出)
        function injectStatusTemplate(tp) {
            if (!tp || !tp.replaceString) return;
            const scripts = regexList.value;
            if (!Array.isArray(scripts)) return;
            const dup = scripts.some((s) => s && (s.findRegex || s.find_regex) === tp.findRegex && String(s.replaceString || '') === String(tp.replaceString));
            if (dup) {
                showToast('该模板已注入，未重复添加');
                return;
            }
            scripts.push({
                scriptName: `${tp.icon} ${tp.name}`,
                findRegex: tp.findRegex,
                replaceString: tp.replaceString,
                disabled: false,
                placement: [2]
            });
            saved.value = false;
            showSuccessToast(`已注入渲染模板「${tp.name}」`);
        }

        // 指令模板 → 注入为内嵌世界书常驻条目(keys 空 / constant / 插入深度 0 / 顶部)
        function injectPromptTemplate(tp) {
            if (!tp || !tp.content) return;
            const entries = wbEntries.value;
            if (!entries || typeof entries !== 'object') return;
            const dup = Object.values(entries).some((e) => e && (e.comment || e.name) === tp.name);
            if (dup) {
                showToast('该指令模板已注入，未重复添加');
                return;
            }
            const key = 'stprompt_' + Date.now().toString(36);
            entries[key] = {
                comment: `${tp.icon} ${tp.name}`,
                content: tp.content,
                keys: [],
                keysecondary: [],
                constant: true,
                selective: false,
                position: 0,
                insertion_order: 0,
                order: 100,
                enabled: true
            };
            saved.value = false;
            showSuccessToast(`已注入指令模板「${tp.name}」`);
        }

        const t = (v) => estimateTokens(String(v || ''));
        const tokenTotal = computed(() =>
            t(d.value.description) + t(d.value.personality) + t(d.value.first_mes)
            + t(d.value.scenario) + t(d.value.mes_example) + t(greetingsText.value)
        );
        const tokenText = computed(() => `≈ ${tokenTotal.value} tokens`);
        // 字段级 Token 分析(带占比进度条)
        const tokenRows = computed(() => {
            const rows = [
                { label: '详细设定', value: t(d.value.description), color: '#1989fa' },
                { label: '性格', value: t(d.value.personality), color: '#07c160' },
                { label: '开场白', value: t(d.value.first_mes), color: '#ff976a' },
                { label: '场景', value: t(d.value.scenario), color: '#ee0a24' },
                { label: '示例对话', value: t(d.value.mes_example), color: '#7232dd' },
                { label: '备用开场白', value: t(greetingsText.value), color: '#00b8d4' }
            ];
            const total = rows.reduce((s, r) => s + r.value, 0) || 1;
            rows.forEach((r) => { r.pct = Math.max(r.value ? 2 : 0, Math.round((r.value / total) * 100)); });
            return rows.filter((r) => r.value > 0 || r.label === '详细设定');
        });
        const tokenDetailText = computed(() =>
            `详细设定: ${t(d.value.description)}\n性格: ${t(d.value.personality)}\n开场白: ${t(d.value.first_mes)}\n场景: ${t(d.value.scenario)}\n示例对话: ${t(d.value.mes_example)}\n备用开场白: ${t(greetingsText.value)}\n合计: ${tokenTotal.value}`
        );

        async function save() {
            if (!card.value) return;
            // 正则脚本字段对齐酒馆规范:移除旧 enabled,保留 disabled
            if (d.value.extensions && Array.isArray(d.value.extensions.regex_scripts)) {
                d.value.extensions.regex_scripts.forEach((r) => {
                    if (r && typeof r === 'object') {
                        if (r.enabled !== undefined && r.disabled === undefined) r.disabled = !r.enabled;
                        delete r.enabled;
                    }
                });
            }
            // 剥离移动端临时编辑字段(不写入卡片 JSON)
            if (d.value.extensions && d.value.extensions.world_book && d.value.extensions.world_book.entries) {
                Object.values(d.value.extensions.world_book.entries).forEach((e) => {
                    if (e && typeof e === 'object') {
                        delete e._keysText;
                        delete e._secKeysText;
                    }
                });
            }
            const res = await saveCardData(card.value);
            if (res.success) {
                saved.value = true;
                card.value.name = d.value.name || card.value.name;
                showSuccessToast('已保存');
            } else {
                showToast(res.error || '保存失败');
            }
        }

        // ---------- 换卡图(pickImage → replaceCardImage) ----------
        const changingCover = ref(false);
        async function onChangeCover() {
            if (!card.value || changingCover.value) return;
            if (/\.webp$/i.test(card.value.path || '')) {
                showToast('WebP 卡片不支持换图，请先在桌面端转为 PNG');
                return;
            }
            try {
                await showConfirmDialog({ title: '换卡图', message: '选择新图片替换封面？原 JSON 数据将保留写入新图。' });
            } catch (e) { return; }
            changingCover.value = true;
            try {
                const res = await api.changeCardImage(card.value.path);
                if (res && res.success) {
                    // 清除封面缓存强制重新加载(MobileCardCover coverCache 以 path 为 key)
                    try {
                        const { clearCoverCache } = await import('../components/MobileCardCover.vue');
                        if (clearCoverCache) clearCoverCache(card.value.path);
                    } catch (e2) { /* 忽略 */ }
                    showSuccessToast('已替换卡图');
                } else if (res && res.cancelled) {
                    /* 用户取消选图 */
                } else {
                    showToast((res && res.error) || '替换失败');
                }
            } finally {
                changingCover.value = false;
            }
        }

        // ---------- 历史快照(移动端:复用桥接快照 API) ----------
        const showSnapshots = ref(false);
        const snapshots = ref([]);

        async function loadSnapshots() {
            if (!card.value) return;
            try {
                snapshots.value = (await api.listCardSnapshots(card.value.path)) || [];
            } catch (e) {
                snapshots.value = [];
            }
        }

        async function openSnapshots() {
            if (!card.value) return;
            showSnapshots.value = true;
            await loadSnapshots();
        }

        async function createSnapshot() {
            if (!card.value) return;
            // 先保存当前编辑,确保快照反映最新内容
            const saveRes = await saveCardData(card.value);
            if (!saveRes.success) {
                showToast(saveRes.error || '保存失败');
                return;
            }
            saved.value = true;
            const res = await api.createManualSnapshot(card.value.path);
            if (res && res.success) {
                showSuccessToast('已创建快照');
                await loadSnapshots();
            } else {
                showToast((res && res.error) || '创建快照失败');
            }
        }

        async function restoreSnapshot(snap) {
            if (!card.value) return;
            try {
                await showConfirmDialog({
                    title: '恢复快照',
                    message: `将当前卡片恢复为该快照内容（自动备份当前版本）。\n${snap.fileName || ''}`,
                    confirmButtonText: '恢复',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; } // 用户取消
            const res = await api.restoreCardSnapshot({ filePath: card.value.path, snapshotPath: snap.path });
            if (res && res.success) {
                showSuccessToast('已恢复');
                await loadLibrary();
                card.value = findCard(id.value) || null;
                initChat();
                showSnapshots.value = false;
            } else {
                showToast((res && res.error) || '恢复失败');
            }
        }

        async function deleteSnapshot(snap) {
            try {
                await showConfirmDialog({
                    title: '删除快照',
                    message: `删除后不可恢复：\n${snap.fileName || ''}`,
                    confirmButtonText: '删除',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.deleteCardSnapshot(snap.path);
            if (res && res.success) {
                showSuccessToast('已删除');
                await loadSnapshots();
            } else {
                showToast((res && res.error) || '删除失败');
            }
        }

        async function cleanSnapshots() {
            try {
                await showConfirmDialog({
                    title: '清理全部快照',
                    message: '将删除库内所有 .bak_history 快照，不可恢复。',
                    confirmButtonText: '清理',
                    confirmButtonColor: '#ee0a24'
                });
            } catch (e) { return; }
            const res = await api.cleanAllSnapshots();
            if (res && res.success) {
                showSuccessToast(`已清理 ${res.removedCount || 0} 处快照`);
                snapshots.value = [];
            } else {
                showToast((res && res.error) || '清理失败');
            }
        }

        // ---------- 聊天测卡(与桌面一致:详情页内置「测卡」Tab,非独立主界面) ----------
        const LS_ENDPOINT = 'stc-api-endpoint';
        const LS_KEY = 'stc-api-key';
        const LS_MODEL = 'stc-api-model';
        const LS_TYPE = 'stc-api-type';

        const chatMessages = ref([]);
        const chatDraft = ref('');
        const chatSending = ref(false);
        const chatListEl = ref(null);
        const showChatApi = ref(false);

        const chatApiEndpoint = ref(localStorage.getItem(LS_ENDPOINT) || 'http://127.0.0.1:1234/v1/chat/completions');
        const chatApiKey = ref(localStorage.getItem(LS_KEY) || '');
        const chatApiModel = ref(localStorage.getItem(LS_MODEL) || 'local-model');
        const chatApiType = ref(localStorage.getItem(LS_TYPE) === 'anthropic' ? 'anthropic' : 'openai');
        const radioStyle = { marginRight: '16px' };

        // ---------- 模型列表拉取(桥接 fetchModels 已支持双协议) + 协议切换自动填端点 ----------
        const availableModels = ref([]);
        const fetchingModels = ref(false);
        const modelFetchStatus = ref('');
        const showModelPicker = ref(false);
        const modelFilter = ref('');
        const filteredModels = computed(() => {
            const q = modelFilter.value.trim().toLowerCase();
            if (!q) return availableModels.value;
            return availableModels.value.filter((m) => m.toLowerCase().includes(q));
        });

        async function fetchAvailableModels() {
            const ep = (chatApiEndpoint.value || '').trim();
            if (!ep) { showToast('请先填写 API 端点'); return; }
            fetchingModels.value = true;
            modelFetchStatus.value = '拉取中…';
            availableModels.value = [];
            try {
                const res = await api.fetchModels(ep, chatApiKey.value.trim(), chatApiType.value);
                if (!res || !res.success) {
                    modelFetchStatus.value = '失败: ' + ((res && res.error) || '未知错误');
                    showToast(modelFetchStatus.value);
                    return;
                }
                const raw = res.data;
                let list = [];
                if (Array.isArray(raw && raw.data)) {
                    list = raw.data.map((m) => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
                } else if (Array.isArray(raw)) {
                    list = raw.map((m) => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
                }
                if (list.length) {
                    availableModels.value = list;
                    modelFetchStatus.value = `已拉取 ${list.length} 个模型`;
                    if (!list.includes(chatApiModel.value.trim())) chatApiModel.value = list[0];
                    showModelPicker.value = true;
                } else {
                    modelFetchStatus.value = '接口已响应，但未抓取到模型';
                }
            } catch (e) {
                modelFetchStatus.value = '失败: ' + (e.message || e);
                showToast(modelFetchStatus.value);
            } finally {
                fetchingModels.value = false;
            }
        }

        function pickModel(m) {
            chatApiModel.value = m;
            showModelPicker.value = false;
            modelFilter.value = '';
        }

        function onApiTypeChange(v) {
            chatApiType.value = v;
            const ep = chatApiEndpoint.value || '';
            if (v === 'anthropic') {
                if (!ep || ep.includes('openai') || ep.includes('1234')) {
                    chatApiEndpoint.value = 'https://api.anthropic.com';
                    chatApiModel.value = 'claude-3-5-sonnet-20241022';
                }
            } else {
                if (!ep || ep.includes('anthropic')) {
                    chatApiEndpoint.value = 'http://127.0.0.1:1234/v1/chat/completions';
                    chatApiModel.value = 'local-model';
                }
            }
            availableModels.value = []; // 协议切换后旧模型列表失效
            modelFetchStatus.value = '';
        }

        async function saveChatApi() {
            localStorage.setItem(LS_ENDPOINT, chatApiEndpoint.value.trim());
            localStorage.setItem(LS_MODEL, chatApiModel.value.trim());
            localStorage.setItem(LS_TYPE, chatApiType.value);
            // API Key 加密后落盘(Keystore AES-256-GCM;兼容读取旧明文)
            const plainKey = chatApiKey.value.trim();
            if (plainKey) {
                try {
                    const enc = await api.encryptSecret(plainKey);
                    if (enc && enc.success && enc.value) localStorage.setItem(LS_KEY, enc.value);
                    else localStorage.setItem(LS_KEY, plainKey);
                } catch (e) {
                    localStorage.setItem(LS_KEY, plainKey);
                }
            } else {
                localStorage.removeItem(LS_KEY);
            }
            showChatApi.value = false;
            showSuccessToast('已保存 API 配置');
        }

        function buildSystem(cardObj) {
            const dd = cardObj && cardObj.data && cardObj.data.data;
            const parts = [];
            if (dd.description) parts.push(dd.description);
            if (dd.personality) parts.push('### 性格\n' + dd.personality);
            if (dd.scenario) parts.push('### 场景\n' + dd.scenario);
            return parts.join('\n\n');
        }

        function initChat() {
            chatMessages.value = [];
            chatDraft.value = '';
            const dd = card.value && card.value.data && card.value.data.data;
            if (dd && dd.first_mes) {
                chatMessages.value.push({ role: 'assistant', content: dd.first_mes });
            }
        }

        function clearChat() {
            initChat();
            showToast('已清空对话');
        }

        async function scrollChat() {
            await nextTick();
            if (chatListEl.value) chatListEl.value.scrollTop = chatListEl.value.scrollHeight;
        }

        async function sendChat() {
            const text = (chatDraft.value || '').trim();
            if (!text || !card.value) {
                showToast(card.value ? '请输入内容' : '卡片未加载');
                return;
            }
            const type = chatApiType.value === 'anthropic' ? 'anthropic' : 'openai';
            chatMessages.value.push({ role: 'user', content: text });
            chatDraft.value = '';
            chatSending.value = true;
            scrollChat();

            const system = buildSystem(card.value);
            const history = chatMessages.value.slice(0, -1).filter((m) => m.role === 'user' || m.role === 'assistant');
            let payload;
            if (type === 'anthropic') {
                payload = {
                    model: chatApiModel.value.trim() || 'claude-3-haiku-20240307',
                    max_tokens: 2048,
                    system,
                    messages: history.map((m) => ({ role: m.role, content: m.content }))
                };
            } else {
                payload = {
                    model: chatApiModel.value.trim() || 'local-model',
                    messages: [{ role: 'system', content: system }, ...history],
                    stream: false,
                    temperature: 0.7
                };
            }

            try {
                const res = await api.sendChatMessage(chatApiEndpoint.value.trim(), payload, chatApiKey.value.trim(), type);
                const reply = extractChatReply(res, type);
                if (res && res.success && reply) {
                    chatMessages.value.push({ role: 'assistant', content: reply });
                } else {
                    chatMessages.value.push({ role: 'assistant', content: '⚠ ' + ((res && res.error) || '返回为空') });
                }
            } catch (e) {
                chatMessages.value.push({ role: 'assistant', content: '⚠ 请求异常: ' + (e.message || e) });
            } finally {
                chatSending.value = false;
                scrollChat();
            }
        }

        function extractChatReply(res, type) {
            if (!res || !res.data) return '';
            const dd = res.data;
            if (type === 'anthropic') {
                return (dd.content && dd.content[0] && dd.content[0].text) || '';
            }
            return (dd.choices && dd.choices[0] && dd.choices[0].message && dd.choices[0].message.content) || '';
        }

        // Raw JSON 只读查看(对齐桌面 raw 页签)
        const rawJsonText = computed(() => {
            try {
                return JSON.stringify(card.value ? (card.value.data || {}) : {}, null, 2);
            } catch (e) {
                return String(e);
            }
        });
        async function copyRawJson() {
            try {
                await navigator.clipboard.writeText(rawJsonText.value);
                showSuccessToast('已复制到剪贴板');
            } catch (e) {
                showToast('复制失败: ' + (e.message || e));
            }
        }

        // ================= AI 智能工具（单卡：打标 / 汉化 / 重构 + 规则表） =================
        const showAiTools = ref(false);
        const aiMode = ref('');
        const aiRunning = ref(false);
        const aiProgress = ref('');
        const aiCandidates = ref([]);

        // ---------- 自动打标规则表（对齐桌面 v2.1.0：38 条系统规则 + 自定义 + 关键词候选） ----------
        const LS_AUTOTAG_DISABLED = 'jsmobile-autotag-disabled';
        const LS_AUTOTAG_CUSTOM = 'jsmobile-autotag-custom';
        const disabledRuleNames = ref((() => {
            try { return JSON.parse(localStorage.getItem(LS_AUTOTAG_DISABLED) || '[]'); } catch (e) { return []; }
        })());
        const customAutoTagRules = ref((() => {
            try { return JSON.parse(localStorage.getItem(LS_AUTOTAG_CUSTOM) || '[]'); } catch (e) { return []; }
        })());
        function saveAutoTagConfig() {
            try {
                localStorage.setItem(LS_AUTOTAG_DISABLED, JSON.stringify(disabledRuleNames.value));
                localStorage.setItem(LS_AUTOTAG_CUSTOM, JSON.stringify(customAutoTagRules.value));
            } catch (e) { /* 忽略 */ }
        }
        // 编译后的完整规则表（系统未禁用 + 自定义）；逐条 try/catch，非法正则只跳过该条
        const compiledRules = computed(() => {
            const sys = defaultAutoTagRules
                .filter((r) => !disabledRuleNames.value.includes(r.name))
                .map((r) => ({ name: r.name, regex: r.regex }));
            return compileAutoTagRules([...sys, ...customAutoTagRules.value]);
        });
        // 第一层漏斗：规则匹配（零成本，命中标签追加到 arr）
        function applyRuleTags(fullText, arr) {
            let added = 0;
            for (const [tag, re] of Object.entries(compiledRules.value)) {
                try {
                    if (re.test(fullText) && !arr.includes(tag)) { arr.push(tag); added++; }
                } catch (e) { /* 单条正则异常跳过 */ }
            }
            return added;
        }

        // 规则表弹窗状态
        const showAutoTagRules = ref(false);
        function toggleSystemRule({ name, enabled }) {
            const i = disabledRuleNames.value.indexOf(name);
            if (enabled && i >= 0) disabledRuleNames.value.splice(i, 1);
            else if (!enabled && i < 0) disabledRuleNames.value.push(name);
            saveAutoTagConfig();
        }
        function addCustomRule({ name, regex }) {
            if (customAutoTagRules.value.some((r) => r.name === name)) { showToast('同名规则已存在'); return; }
            customAutoTagRules.value.push({ name, regex });
            saveAutoTagConfig();
            showSuccessToast('规则已添加');
        }
        function removeCustomRule(i) {
            customAutoTagRules.value.splice(i, 1);
            saveAutoTagConfig();
        }

        function openAiTools() {
            if (!card.value) { showToast('卡片未加载'); return; }
            aiMode.value = '';
            showAiTools.value = true;
        }
        function addAICandidate(tag) {
            const clean = String(tag || '').trim();
            if (clean && !aiCandidates.value.includes(clean)) aiCandidates.value.push(clean);
        }
        function removeAICandidate(i) { aiCandidates.value.splice(i, 1); }

        // 统一 AI 调用（复用测卡 API 配置，桥接 sendChatMessage 绕过 CORS）
        async function callAI(payload) {
            if (!chatApiEndpoint.value.trim()) throw new Error('请先配置 API 端点（点击右上角 🤖 或测卡 Tab 内设置）');
            const type = chatApiType.value === 'anthropic' ? 'anthropic' : 'openai';
            const res = await api.sendChatMessage(chatApiEndpoint.value.trim(), payload, chatApiKey.value.trim(), type);
            if (!res || !res.success) throw new Error((res && res.error) || 'API 请求失败');
            return extractChatReply(res, type);
        }

        // 通用：把 AI 回复清洗为文本
        function cleanReply(reply) {
            return String(reply || '').trim();
        }

        // 🏷️ AI 打标（单卡：提取/补充标签到 data.tags）
        async function startAiTagging() {
            if (!card.value || aiRunning.value) return;
            if (!chatApiEndpoint.value.trim()) { showToast('请先配置 API（设置页或测卡 Tab）'); return; }
            aiMode.value = 'tag';
            aiRunning.value = true;
            aiProgress.value = '正在分析卡片特征…';
            try {
                const d = (card.value.data && card.value.data.data) || card.value.data || {};
                const desc = String(d.description || '').substring(0, 1500);
                const mes = String(d.first_mes || '').substring(0, 500);
                const pers = String(d.personality || '').substring(0, 300);
                let prompt = '你是一个专业的角色卡片标签分类助手。请根据以下卡片内容进行打标。\n';
                if (aiCandidates.value.length) prompt += `【标签候选池】：[${aiCandidates.value.join(', ')}]\n`;
                prompt += aiCandidates.value.length
                    ? '【规则】：优先从候选池选择；没有合适的可自由提取最精准标签。\n'
                    : '【规则】：自由提取最精准的角色标签。\n';
                prompt += '【输出强制规则】：必须只返回格式为 ["标签1", "标签2"] 的纯 JSON 数组，绝不要包含任何解释文字。\n\n';
                prompt += `【角色设定提取】：\n名字：${card.value.name || '未知'}\n描述：${desc}\n性格：${pers}\n首句：${mes}`;

                const reply = cleanReply(await callAI({
                    model: chatApiModel.value.trim() || 'local-model',
                    messages: [{ role: 'system', content: '你是一个专业的角色卡分析助手。请阅读角色设定，提取最符合角色的标签。严格只返回一个 JSON 数组（如 ["标签1","标签2"]），不要返回任何其他文字。' }, { role: 'user', content: prompt }],
                    temperature: 0.2
                }));
                let newTags = [];
                // 第一层漏斗：规则匹配免费先行（对齐桌面 v2.1.0 三层漏斗第二层以 LLM 兜底）
                const fullText = [d.description, d.personality, d.scenario, d.first_mes, d.mes_example]
                    .filter(Boolean).join('\n');
                applyRuleTags(fullText, newTags);
                const ruleHit = newTags.length;
                const jsonMatch = reply.replace(/```json/gi, '').replace(/```/g, '').match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    try { newTags = newTags.concat(JSON.parse(jsonMatch[0])); } catch (e) { /* 落兜底 */ }
                }
                if (!jsonMatch) {
                    newTags = newTags.concat(reply.replace(/[\[\]"'`]/g, '').split(/[,，、\n]/).map(t => t.trim()).filter(Boolean));
                }
                if (newTags.length) {
                    const uniq = [...new Set(newTags.map((t) => String(t).trim()).filter(Boolean))];
                    const tagArr = tags.value;
                    let addedCount = 0;
                    uniq.forEach((t) => { if (!tagArr.includes(t)) { tagArr.push(t); addedCount++; } });
                    saved.value = false;
                    showSuccessToast(`打标完成：规则命中 ${ruleHit} 个，共新增 ${addedCount} 个标签`);
                } else {
                    showToast('AI 未返回有效标签');
                }
            } catch (e) {
                showToast('AI 打标失败: ' + (e.message || e));
            } finally {
                aiRunning.value = false;
                aiProgress.value = '';
            }
        }

        // 🌐 一键汉化（翻译 设定/开场白/场景/示例对话）
        async function startAiTranslate() {
            if (!card.value || aiRunning.value) return;
            if (!chatApiEndpoint.value.trim()) { showToast('请先配置 API（设置页或测卡 Tab）'); return; }
            const ok = await showConfirmDialog({ title: 'AI 汉化', message: '将调用 AI 翻译「角色设定」「首条消息」「场景」「对话示例」，可能消耗 Token，是否继续？' }).catch(() => false);
            if (!ok) return;
            aiMode.value = 'translate';
            aiRunning.value = true;
            const sys = '你是一个专业的 SillyTavern 角色卡本地化翻译专家。\n将用户文本翻译成流畅的中文。\n【绝对不可违背】：1. 不翻译 {{user}} {{char}} 等双大括号宏变量；2. 不翻译星号包裹的正则/代码；3. 保持换行格式；4. 直接输出译文，无解释。';
            const fields = [
                { key: 'description', label: '角色设定' },
                { key: 'first_mes', label: '首条消息' },
                { key: 'scenario', label: '场景' },
                { key: 'mes_example', label: '对话示例' }
            ];
            try {
                const d = (card.value.data && card.value.data.data) || card.value.data || {};
                for (const f of fields) {
                    const src = String(d[f.key] || '').trim();
                    if (!src) continue;
                    aiProgress.value = `正在翻译${f.label}…`;
                    const translated = cleanReply(await callAI({
                        model: chatApiModel.value.trim() || 'local-model',
                        messages: [{ role: 'system', content: sys }, { role: 'user', content: src }],
                        temperature: 0.3
                    }));
                    if (translated) { d[f.key] = translated; saved.value = false; }
                }
                showSuccessToast('翻译完成，请检查后保存');
            } catch (e) {
                showToast('AI 汉化失败: ' + (e.message || e));
            } finally {
                aiRunning.value = false;
                aiProgress.value = '';
            }
        }

        // ✨ 提示词重构（W++/JSON → 紧凑 Markdown）
        async function startAiRefactor() {
            if (!card.value || aiRunning.value) return;
            if (!chatApiEndpoint.value.trim()) { showToast('请先配置 API（设置页或测卡 Tab）'); return; }
            const d = (card.value.data && card.value.data.data) || card.value.data || {};
            if (!d.description || !String(d.description).trim()) { showToast('当前卡片设定为空，无需重构'); return; }
            const ok = await showConfirmDialog({ title: '提示词重构', message: '将调用 AI 把「角色设定」重构为紧凑 Markdown，覆盖原设定，是否继续？' }).catch(() => false);
            if (!ok) return;
            aiMode.value = 'refactor';
            aiRunning.value = true;
            aiProgress.value = '正在重构设定…';
            try {
                const sys = '你是一个大语言模型提示词优化专家。用户发送一段可能由旧版 W++、JSON 或繁琐描述堆砌的角色卡设定。请将其重构为极其紧凑、高信息密度的结构化 Markdown 格式。【规则】：1. 不遗漏原有特征/外貌/弱点/世界观；2. 不翻译不删除 {{user}} {{char}} 宏变量；3. 去除冗余符号压缩 Token；4. 保持原文语言；5. 直接输出结果无废话。';
                const result = cleanReply(await callAI({
                    model: chatApiModel.value.trim() || 'local-model',
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: d.description }],
                    temperature: 0.3
                }));
                if (result) { d.description = result; saved.value = false; showSuccessToast('重构完成，请检查后保存'); }
                else showToast('AI 返回为空');
            } catch (e) {
                showToast('AI 重构失败: ' + (e.message || e));
            } finally {
                aiRunning.value = false;
                aiProgress.value = '';
            }
        }

        onMounted(() => {
            resolveId();
            card.value = findCard(id.value) || null;
            initChat();
        });

        return {
            card, id, activeTab, advancedOpen, showTokenDetail, saved,
            d, tags, greetingsText, wbEntries, regexList,
            tokenText, tokenDetailText, tokenRows,
            addWbEntry, removeWbEntry, wbExpanded, toggleWbExpand, syncWbKeys, syncWbSecKeys, WB_POSITIONS,
            moveWbEntry, depthPromptText, rawJsonText, copyRawJson,
            addRegex, removeRegex, regexExpanded, toggleRegexExpand, toggleRegexPlacement, REGEX_PLACEMENTS, removeTag, addTag,
            presetTagList, tagLangMode, togglePresetTag, toggleTagLang,
            customTagPool, toggleCustomTag, addCustomTag, manageCustomTags,
            showInputDialog, inputDialogTitle, inputValue, inputPlaceholder, onInputConfirm, onInputCancel,
            save,
            changingCover, onChangeCover,
            showSnapshots, snapshots, openSnapshots, createSnapshot,
            restoreSnapshot, deleteSnapshot, cleanSnapshots,
            statusInput, previewText, statusScripts, statusApplied, statusHtml, resetStatusDemo,
            showStatusTemplates, STATUSBAR_TEMPLATES, STATUSBAR_PROMPT_TEMPLATES, injectStatusTemplate, injectPromptTemplate,
            showPush, pushing, tavernUrl, tavernKey, savePushConfig, doPush,
            pushTargetMode, pushTargets, currentPushTargetId, switchPushMode, addPushTarget, removePushTarget,
            chatMessages, chatDraft, chatSending, chatListEl, showChatApi,
            chatApiEndpoint, chatApiKey, chatApiModel, chatApiType, radioStyle,
            saveChatApi, sendChat, clearChat,
            availableModels, fetchingModels, modelFetchStatus, showModelPicker, modelFilter, filteredModels,
            fetchAvailableModels, pickModel, onApiTypeChange,
            showAiTools, aiMode, aiRunning, aiProgress, aiCandidates, openAiTools,
            showAutoTagRules, disabledRuleNames, customAutoTagRules, toggleSystemRule, addCustomRule, removeCustomRule,
            addAICandidate, removeAICandidate, startAiTagging, startAiTranslate, startAiRefactor
        };
    }
};
</script>

<style scoped>
.detail-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 滚动修复:补齐 van-tabs 高度链——根节点不控高度会被内容撑开,超出部分被
   .mobile-shell{overflow:hidden} 裁剪 → 整页无法上下滑动 */
.detail-page :deep(.van-tabs) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.detail-page :deep(.van-tabs__content) { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
/* 单面板占满,保证子滚动容器可用 */
.detail-page :deep(.van-tab__panel) { min-height: 100%; }
.basic-wrap { padding: 4px 12px; }
.id-row { display: flex; gap: 12px; align-items: flex-start; margin: 8px 0 4px; }
.id-cover-wrap { position: relative; width: 84px; flex-shrink: 0; }
.id-cover { width: 84px; height: 84px; border-radius: 10px; }
.id-cover-edit {
    position: absolute; right: -4px; bottom: -4px;
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(0,0,0,0.55); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; cursor: pointer;
}
.id-info { flex: 1; min-width: 0; }
.id-info :deep(.van-field) { padding: 6px 0; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0 10px; align-items: center; }
.add-tag { cursor: pointer; }
.preset-tags {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    padding: 2px 0 10px;
}
.pt-label { font-size: 11px; color: var(--van-gray-6); flex-shrink: 0; margin-right: 2px; cursor: pointer; }
.pt-item { cursor: pointer; }
.sec-label { font-size: 12px; color: var(--van-gray-6); margin: 6px 0 2px; }
.token-detail {
    white-space: pre-line; font-size: 12px; color: var(--van-gray-6);
    background: var(--van-gray-1); border-radius: 8px; padding: 8px; margin-bottom: 8px;
}
.token-analysis {
    background: var(--van-gray-1); border-radius: 8px; padding: 10px; margin-bottom: 8px;
}
.ta-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ta-label { width: 62px; flex-shrink: 0; font-size: 11px; color: var(--van-gray-6); }
.ta-bar-wrap { flex: 1; height: 8px; background: var(--van-gray-2); border-radius: 4px; overflow: hidden; }
.ta-bar { height: 100%; border-radius: 4px; transition: width .25s; }
.ta-num { width: 40px; flex-shrink: 0; text-align: right; font-size: 11px; color: var(--van-text-color); font-variant-numeric: tabular-nums; }
.ta-total { font-size: 10px; color: var(--van-gray-6); margin-top: 4px; }
.adv-collapse { margin: 8px 0; }
.tab-pad { padding: 12px; }
.wb-item, .regex-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 8px 10px 4px;
    margin-top: 10px;
    background: var(--van-background-2, #fff);
}
.wb-head { display: flex; align-items: center; gap: 8px; }
.wb-name { flex: 1; }
.wb-name :deep(.van-field__control) { font-size: 14px; }
.wb-arrow { color: var(--van-gray-5, #c8c9cc); transition: transform .2s; cursor: pointer; flex-shrink: 0; }
.wb-arrow-open { transform: rotate(90deg); }
.wb-op { color: var(--van-gray-6, #969799); cursor: pointer; flex-shrink: 0; }
.wb-op:active { color: var(--van-primary-color, #1989fa); }
.raw-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
}
.raw-size { font-size: 12px; color: var(--van-gray-6, #969799); }
.raw-json {
    margin: 0;
    padding: 10px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    background: var(--van-background-2, #fff);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 62vh;
    overflow-y: auto;
    color: var(--van-text-color, #323233);
}
.st-tpl-list {
    margin-top: 10px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    padding: 8px;
    background: var(--van-background-2, #fff);
    max-height: 320px;
    overflow-y: auto;
}
.st-tpl-title { font-size: 12px; color: var(--van-gray-6, #969799); margin: 4px 2px; font-weight: 600; }
.st-tpl-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px; border-radius: 6px; cursor: pointer;
    border-bottom: 1px dashed var(--van-gray-4, #ebedf0);
}
.st-tpl-item:last-child { border-bottom: none; }
.st-tpl-item:active { background: var(--van-gray-2, #f7f8fa); }
.st-tpl-icon { font-size: 18px; flex-shrink: 0; }
.st-tpl-main { flex: 1; min-width: 0; }
.st-tpl-name { font-size: 13px; font-weight: 600; color: var(--van-text-color, #323233); }
.st-tpl-desc {
    font-size: 11px; color: var(--van-gray-6, #969799);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wb-detail, .regex-detail { padding-top: 6px; }
.wb-detail :deep(.van-cell-group--inset),
.regex-detail :deep(.van-cell-group--inset) { margin: 10px 0; }
.wb-num-row { display: flex; gap: 10px; }
.wb-num-row .van-field { flex: 1; }
.stub-window { padding: 2px 2px 6px; }
.st-bar { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 8px; }
.st-count { font-size: 12px; color: var(--van-gray-6, #969799); }
.st-label { font-size: 12px; color: var(--van-gray-6, #969799); margin: 4px 0 6px; }
.st-preview {
    background: var(--van-gray-1, #f7f8fa);
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 12px;
    min-height: 60px;
}
.st-preview :deep(style), .st-preview :deep(script) { display: none; }
.st-preview :deep(img) { max-width: 100%; border-radius: 8px; }
.st-preview :deep(table) { display: inline-block; }
.st-source {
    margin: 0;
    background: var(--van-gray-1, #f7f8fa);
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 10px;
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--van-text-color, #323233);
    max-height: 160px;
    overflow-y: auto;
}
.push-popup {
    width: 84vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.push-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.push-title { font-size: 16px; font-weight: 600; }
.push-body { padding: 12px 16px 4px; }
.push-tip {
    margin: 8px 0;
    font-size: 12px;
    line-height: 1.7;
    color: var(--van-gray-6, #969799);
    word-break: break-all;
}
.push-ops { padding: 6px 16px 16px; }

/* 测卡 Tab 聊天 */
.chat-wrap { display: flex; flex-direction: column; }
.chat-toolbar {
    display: flex; align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--van-gray-2, #ebedf0);
    background: var(--van-background-2, #fff);
}
.ct-title { font-size: 13px; font-weight: 600; }
.chat-list {
    max-height: 50vh;
    overflow-y: auto;
    padding: 12px;
    display: flex; flex-direction: column; gap: 10px;
}
.bubble {
    max-width: 85%;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--van-background-2, #fff);
    box-shadow: 0 1px 3px rgba(0,0,0,.05);
}
.bubble.user { align-self: flex-end; background: #06b6d4; color: #fff; }
.bubble.assistant { align-self: flex-start; }
.b-name { font-size: 11px; color: var(--van-gray-6, #969799); margin-bottom: 4px; }
.bubble.user .b-name { color: rgba(255,255,255,.85); }
.b-content {
    margin: 0; white-space: pre-wrap; word-break: break-word;
    font-family: inherit; font-size: 14px; line-height: 1.6;
}
.input-bar {
    display: flex; align-items: flex-end; gap: 8px;
    padding: 8px 10px;
    background: var(--van-background-2, #fff);
    border-top: 1px solid var(--van-gray-2, #ebedf0);
}
.input-bar .van-field { flex: 1; }
</style>