<template>
    <div class="detail-page">
        <van-nav-bar :title="card ? card.name : '卡片详情'" left-arrow @click-left="$router.back()" safe-area-inset-top>
            <template #right>
                <van-icon name="chat-o" size="20" style="margin-right: 12px" @click="showAITools = true" />
                <van-icon name="share-o" size="20" style="margin-right: 14px" @click="showPush = true" />
                <van-icon name="copy-o" size="20" style="margin-right: 14px" @click="onDuplicate" />
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
                            <div class="id-cover-wrap" @click="showImagePreview = true">
                                <MobileCardCover :card="card" aspect="1 / 1" class="id-cover" />
                                <div class="cover-actions">
                                    <van-button size="mini" plain icon="photo-o" @click="triggerChangeImage">换图</van-button>
                                    <input
                                        ref="changeImageInput"
                                        type="file"
                                        accept="image/*"
                                        style="display:none"
                                        @change="onChangeImage"
                                    />
                                </div>
                            </div>
                            <div class="id-info">
                                <van-field v-model="d.name" label="名称" placeholder="角色名称" />
                                <van-field v-model="d.creator" label="创建者" placeholder="创建者" />
                            </div>
                        </div>
                        <div class="detail-actions">
                            <van-button size="mini" plain icon="location-o" @click="onOpenFolder">打开位置</van-button>
                            <van-button size="mini" plain icon="clock-o" @click="showSnapshots = true">快照</van-button>
                        </div>
                        <div class="tag-row">
                            <van-tag
                                v-for="(t, i) in tags"
                                :key="i" closable color="#eef7fb" text-color="#06b6d4"
                                @close="removeTag(i)"
                            >{{ t }}</van-tag>
                            <van-tag plain color="#999" class="add-tag" @click="showTagPanel = true">＋</van-tag>
                        </div>
                        <div class="sec-label">Token 估算</div>
                        <van-field :model-value="tokenText" readonly is-link center @click="showTokenDetail = !showTokenDetail" />
                        <div v-if="showTokenDetail" class="token-detail">{{ tokenDetailText }}</div>

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
                            <van-field v-model="d.first_mes" type="textarea" rows="3" autosize label="开场白" />
                            <van-field v-model="d.scenario" type="textarea" rows="3" autosize label="场景" />
                            <van-field v-model="d.mes_example" type="textarea" rows="5" autosize label="示例对话" />
                            <van-field
                                :model-value="greetingsText" label="备用开场白"
                                type="textarea" rows="3" autosize
                                @update:model-value="greetingsText = $event"
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
                                    <div class="st-btns">
                                        <van-button size="mini" plain type="primary" @click="showTemplatePicker = true">📋 渲染模板</van-button>
                                        <van-button size="mini" plain type="warning" @click="showPromptPicker = true">📝 指令模板</van-button>
                                        <van-button size="mini" plain @click="resetStatusDemo">恢复示例</van-button>
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
                        <van-button v-if="wbEntries.length" block icon="share-o" type="warning" plain style="margin-top:6px" @click="extractWbAsStandalone">📤 提取为独立世界书</van-button>
                        <div v-for="(e, i) in wbEntries" :key="i" class="wb-item" :class="{ folded: isWbFolded(i) }">
                            <!-- 头行常驻:点击展开/收起正文(BUG 0.5) -->
                            <div class="wb-head" @click="toggleWbFold(i)">
                                <van-icon name="arrow" class="fold-arrow" :class="{ open: !isWbFolded(i) }" />
                                <van-switch v-model="e.enabled" size="20px" @click.stop />
                                <van-field v-model="e.comment" placeholder="条目名(comment)" class="wb-name" @click.stop />
                                <van-icon name="arrow-up" size="14" @click.stop="moveWbEntry(i, -1)" :style="{ opacity: i > 0 ? 1 : 0.3 }" />
                                <van-icon name="arrow-down" size="14" @click.stop="moveWbEntry(i, 1)" :style="{ opacity: i < wbEntries.length - 1 ? 1 : 0.3 }" />
                                <van-icon name="copy-o" size="16" @click.stop="cloneWbEntry(i)" />
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click.stop="removeWbEntry(i)" />
                            </div>
                            <div v-show="!isWbFolded(i)" class="wb-body">
                                <van-field
                                    v-model="e.content" type="textarea" rows="3" autosize
                                    placeholder="条目内容"
                                />
                                <!-- 阶段 5.1: 词条增强编辑 -->
                                <div class="wb-advanced">
                                    <van-field v-model="e._keysStr" placeholder="触发词(逗号分隔)" label="触发词" @blur="syncKeys(e)" @click.stop />
                                    <div class="wb-advanced-row">
                                        <div class="wb-advanced-col">
                                            <span class="wb-advanced-label">selective</span>
                                            <van-switch v-model="e.selective" size="16px" />
                                        </div>
                                        <div class="wb-advanced-col">
                                            <span class="wb-advanced-label">constant</span>
                                            <van-switch v-model="e.constant" size="16px" />
                                        </div>
                                        <div class="wb-advanced-col wb-pos-col">
                                            <span class="wb-advanced-label">position</span>
                                            <select v-model.number="e.position" class="wb-pos-select" @click.stop>
                                                <option v-for="po in POSITION_OPTIONS" :key="po.value" :value="po.value">{{ po.label }}</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <van-empty v-if="!wbEntries.length" description="无世界书条目" image-size="60" />
                    </div>
                </van-tab>

                <van-tab title="正则" name="regex">
                    <div class="tab-pad">
                        <van-button block icon="plus" type="primary" plain @click="addRegex">添加正则</van-button>
                        <div v-for="(r, i) in regexList" :key="i" class="regex-item" :class="{ folded: isRegexFolded(i) }">
                            <!-- 头行常驻,正文点击展开(BUG 0.5) -->
                            <div class="wb-head" @click="toggleRegexFold(i)">
                                <van-icon name="arrow" class="fold-arrow" :class="{ open: !isRegexFolded(i) }" />
                                <van-switch v-model="r.enabled" size="20px" @click.stop />
                                <van-field v-model="r.scriptName" placeholder="名称" class="wb-name" @click.stop />
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click.stop="removeRegex(i)" />
                            </div>
                            <div v-show="!isRegexFolded(i)" class="regex-body">
                                <van-field v-model="r.findRegex" placeholder="查找(正则)" />
                                <van-field v-model="r.replaceString" type="textarea" rows="2" autosize placeholder="替换(空 = 删除匹配)" />
                            </div>
                        </div>
                        <van-empty v-if="!regexList || !regexList.length" description="无正则脚本" image-size="60" />
                    </div>
                </van-tab>

                <van-tab title="测卡" name="chat">
                    <div class="chat-wrap">
                        <div class="chat-toolbar">
                            <span class="ct-title">与「{{ card ? card.name : '' }}」对话</span>
                            <span class="ct-render" :class="{ on: chatRenderMode }" @click="toggleChatRender">渲染</span>
                            <van-icon name="replay" size="18" style="margin: 0 12px 0 auto" @click="clearChat" />
                            <van-icon name="setting-o" size="18" @click="showChatApi = true" />
                        </div>
                        <div ref="chatListEl" class="chat-list">
                            <div v-for="(m, i) in chatMessages" :key="i" class="bubble" :class="m.role">
                                <div class="b-name" :class="m.role">{{ m.role === 'user' ? '我' : (card ? card.name : 'AI') }}</div>
                                <div v-if="chatRenderMode && m.role === 'assistant'" class="b-content rich" v-html="renderChat(m.content)"></div>
                                <pre v-else class="b-content">{{ m.content }}</pre>
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
                <span class="push-title">推送到酒馆</span>
                <van-icon name="cross" size="18" @click="showPush = false" />
            </div>
            <div class="push-body">
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
            </div>
            <div class="push-ops">
                <van-button block type="primary" :loading="pushing" @click="doPush">推送到酒馆(API)</van-button>
                <van-button block type="default" :loading="pushingFolder" @click="doPushToFolder" style="margin-top: 8px">复制文件到酒馆目录</van-button>
            </div>
        </van-popup>

        <!-- 测卡 API 配置弹窗(与设置页共享 stc-api-* 存储键) -->
        <van-popup v-model:show="showChatApi" position="bottom" round style="height: 60%">
            <van-nav-bar title="API 设置" @click-left="showChatApi = false">
                <template #left><van-icon name="arrow-left" /></template>
            </van-nav-bar>
            <van-cell-group inset style="margin-top: 12px">
                <van-field v-model="chatApiEndpoint" label="端点" placeholder="http://127.0.0.1:1234/v1/chat/completions" />
                <van-field v-model="chatApiKey" label="Key" placeholder="sk-... 或留空" />
                <van-field v-model="chatApiModel" label="模型" placeholder="local-model" />
                <van-cell title="拉取模型列表">
                    <template #value>
                        <van-button size="mini" plain type="primary" :loading="fetchingModels" @click="onFetchModels">拉取</van-button>
                    </template>
                </van-cell>
                <div v-if="fetchedModels.length" class="model-list">
                    <van-tag
                        v-for="(m, i) in fetchedModels"
                        :key="i"
                        :color="m === chatApiModel ? '#06b6d4' : ''"
                        :text-color="m === chatApiModel ? '#fff' : ''"
                        style="margin: 2px 4px"
                        @click="chatApiModel = m"
                    >{{ m }}</van-tag>
                </div>
                <van-cell title="协议">
                    <template #value>
                        <van-radio-group v-model="chatApiType" direction="horizontal">
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

        <!-- 阶段 2.1: 卡片快照 -->
        <SnapshotModal v-model:show="showSnapshots" :target-path="card ? card.path : ''" :target-name="card ? card.name : ''" @restored="onSnapshotRestored" />

        <!-- 阶段 3.6: 大图预览 -->
        <van-popup v-model:show="showImagePreview" position="center" round closeable class="img-preview-popup" @click-overlay="showImagePreview = false">
            <img v-if="previewSrc" :src="previewSrc" class="preview-img" />
            <van-loading v-else size="24" class="preview-loading" />
        </van-popup>

        <!-- 阶段 3.4: 标签面板 -->
        <TagPanel v-model:show="showTagPanel" :tags="tags" @change="onTagsChange" />

        <!-- 阶段 4.1/4.2: AI 工具菜单 -->
        <van-action-sheet v-model:show="showAITools" :actions="aiActions" cancel-text="取消" close-on-click-action
            @select="onAIActionSelect" title="🤖 AI 工具" />

        <!-- 阶段 4.1: AI 打标面板 -->
        <AITagPanel v-model:show="showAITagPanel" :card="card"
            :api-endpoint="chatApiEndpoint" :api-key="chatApiKey"
            :api-model="chatApiModel" :api-type="chatApiType"
            @tagged="onAITagged" />

        <!-- 阶段 4.6: 状态栏渲染模板选择 -->
        <van-popup v-model:show="showTemplatePicker" position="bottom" round :style="{ maxHeight: '70vh' }">
            <div class="tpl-picker">
                <div class="tpl-picker-title">📋 状态栏渲染模板（15 套）</div>
                <div class="tpl-list">
                    <div v-for="t in templateMeta" :key="t.key" class="tpl-item" @click="injectStatusbarTemplate(t.key)">
                        <span class="tpl-icon">{{ t.icon }}</span>
                        <div class="tpl-info">
                            <div class="tpl-name">{{ t.name }}</div>
                            <div class="tpl-desc">{{ t.desc }}</div>
                            <div class="tpl-fields">{{ t.fields }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </van-popup>

        <!-- 阶段 4.6: 状态栏指令模板选择 -->
        <van-popup v-model:show="showPromptPicker" position="bottom" round :style="{ maxHeight: '70vh' }">
            <div class="tpl-picker">
                <div class="tpl-picker-title">📝 状态栏指令模板（11 套）</div>
                <div class="tpl-list">
                    <div v-for="t in promptMeta" :key="t.key" class="tpl-item" @click="injectPromptTemplate(t.key)">
                        <span class="tpl-icon">{{ t.icon }}</span>
                        <div class="tpl-info">
                            <div class="tpl-name">{{ t.name }}</div>
                            <div class="tpl-desc">{{ t.desc }}</div>
                            <div class="tpl-fields">{{ t.fields }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </van-popup>

        <!-- 阶段 4.1/4.2: AI 操作加载遮罩 -->
        <van-overlay :show="aiLoading" z-index="9999">
            <div class="ai-loading-box">
                <van-loading size="28" color="#06b6d4" />
                <span class="ai-loading-text">{{ aiLoadingText || 'AI 处理中…' }}</span>
            </div>
        </van-overlay>
    </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showSuccessToast, showConfirmDialog } from 'vant';
import DOMPurify from 'dompurify';
import MobileCardCover from '../components/MobileCardCover.vue';
import { coverCache } from '../components/MobileCardCover.vue';
import SnapshotModal from '../components/SnapshotModal.vue';
import TagPanel from '../components/TagPanel.vue';
import AITagPanel from '../components/AITagPanel.vue';
import { findCard, saveCardData } from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate';
import { extractBookEntries } from '../../utils/cardLoader.js';
import { api } from '../../bridge/api';
import { parseRegexPattern, classifyTemplate, sanitizeStatusHtml } from '../../composables/useStatusbarPreview.js';
import { STATUSBAR_TEMPLATE_META, findStatusbarTemplate } from '../../utils/statusbarTemplates.js';
import { STATUSBAR_PROMPT_META, findStatusbarPrompt } from '../../utils/statusbarPromptTemplates.js';

// 推送酒馆配置存储键
const LS_TAVERN_URL = 'jsmobile-tavern-url';
const LS_TAVERN_KEY = 'jsmobile-tavern-key';

export default {
    name: 'CardDetailView',
    components: { MobileCardCover, SnapshotModal, TagPanel, AITagPanel },
    setup() {
        const route = useRoute();
        const id = ref('');
        const card = ref(null);
        const activeTab = ref('basic');
        const advancedOpen = ref([]);
        const showTokenDetail = ref(false);
        let saved = ref(true);
        const changeImageInput = ref(null);
        // 阶段 2.1: 快照
        const showSnapshots = ref(false);
        // 阶段 3.6: 大图预览
        const showImagePreview = ref(false);
        const previewSrc = computed(() => coverCache.get(card.value?.path) || null);

        // ---------- 阶段 4.1/4.2: AI 打标 + AI 工具 ----------
        const showAITools = ref(false);
        const showAITagPanel = ref(false);
        const aiLoading = ref(false);
        const aiLoadingText = ref('');

        // ---------- 推送酒馆 ----------
        const showPush = ref(false);
        const pushing = ref(false);
        const pushingFolder = ref(false);
        const tavernUrl = ref(localStorage.getItem(LS_TAVERN_URL) || '');
        const tavernKey = ref(localStorage.getItem(LS_TAVERN_KEY) || '');
        function savePushConfig() {
            localStorage.setItem(LS_TAVERN_URL, tavernUrl.value.trim());
            localStorage.setItem(LS_TAVERN_KEY, tavernKey.value.trim());
        }
        async function doPush() {
            if (!card.value) return;
            const url = tavernUrl.value.trim().replace(/\/+$/, '');
            if (!url) {
                showToast('请先填写酒馆地址');
                return;
            }
            pushing.value = true;
            try {
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

        // 阶段 2.10: 物理推送酒馆(复制文件到目标目录)
        async function doPushToFolder() {
            if (!card.value) return;
            pushingFolder.value = true;
            try {
                const folder = await api.selectPushFolder();
                if (!folder || !folder.success || !folder.path) {
                    if (folder && folder.error) showToast(folder.error);
                    return;
                }
                const res = await api.pushToCustomDir({ filePaths: [card.value.path], targetDir: folder.path });
                if (res && res.success) {
                    showSuccessToast(`已复制到 ${folder.title || '目标目录'} (${res.count || 0} 个文件)`);
                    showPush.value = false;
                } else {
                    showToast((res && res.error) || '推送失败');
                }
            } catch (e) {
                showToast('推送失败: ' + (e.message || e));
            } finally {
                pushingFolder.value = false;
            }
        }

        // 阶段 2.1: 快照恢复后重新加载卡片
        function onSnapshotRestored() {
            if (id.value) {
                card.value = findCard(id.value) || null;
                showSuccessToast('快照已恢复，请重新编辑');
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

        // 阶段 5.1: 世界书词条 position 选项
        const POSITION_OPTIONS = [
            { value: 0, label: 'before_char' },
            { value: 1, label: 'after_char' },
            { value: 2, label: 'before_user' },
            { value: 3, label: 'after_user' },
            { value: 4, label: 'chat_depth' },
        ];

        // ---------- 世界书(BUG 0.3:统一 extractBookEntries,兼容 V1 顶层 character_book / 数组 / 字典) ----------
        const wbContainer = computed(() => {
            if (!d.value) return null;
            if (!d.value.extensions) d.value.extensions = {};
            let book = d.value.extensions.world_book;
            if (!book || typeof book !== 'object') {
                if (d.value.character_book && typeof d.value.character_book === 'object') {
                    book = d.value.character_book; // 老 V1 卡:世界书在顶层
                } else {
                    book = { entries: {} };
                    d.value.extensions.world_book = book;
                }
            }
            if (!book.entries || typeof book.entries !== 'object') book.entries = {};
            return book;
        });
        // 视图:条目数组(任何形态均归一化,永不抛错)
        const wbEntries = computed(() => extractBookEntries(wbContainer.value));

        function addWbEntry() {
            const book = wbContainer.value;
            const key = 'wb_' + Date.now().toString(36);
            const entry = { comment: '', content: '', enabled: true, keys: [], _keysStr: '', selective: false, constant: false, position: 0 };
            if (Array.isArray(book.entries)) {
                entry.key = key;
                book.entries.push(entry);
            } else {
                book.entries[key] = entry;
            }
            saved.value = false;
        }
        function removeWbEntry(index) {
            const book = wbContainer.value;
            const arr = extractBookEntries(book);
            const target = arr[index];
            if (!target) return;
            if (Array.isArray(book.entries)) {
                book.entries.splice(index, 1);
            } else {
                const hit = Object.keys(book.entries).find((k) => book.entries[k] === target);
                if (hit) delete book.entries[hit];
            }
            saved.value = false;
        }

        // 阶段 5.1: 词条排序(上移/下移)
        function moveWbEntry(index, delta) {
            const book = wbContainer.value;
            if (!book) return;
            const arr = extractBookEntries(book);
            const newIndex = index + delta;
            if (newIndex < 0 || newIndex >= arr.length) return;
            if (Array.isArray(book.entries)) {
                const tmp = book.entries[index];
                book.entries[index] = book.entries[newIndex];
                book.entries[newIndex] = tmp;
            } else {
                const keys = Object.keys(book.entries);
                const tmp = book.entries[keys[index]];
                book.entries[keys[index]] = book.entries[keys[newIndex]];
                book.entries[keys[newIndex]] = tmp;
            }
            saved.value = false;
        }
        // 阶段 5.1: 克隆词条
        function cloneWbEntry(index) {
            const book = wbContainer.value;
            if (!book) return;
            const arr = extractBookEntries(book);
            const src = arr[index];
            if (!src) return;
            const clone = JSON.parse(JSON.stringify(src));
            clone.comment = (clone.comment || '') + ' (副本)';
            clone._keysStr = Array.isArray(clone.keys) ? clone.keys.join(',') : '';
            if (Array.isArray(book.entries)) {
                book.entries.splice(index + 1, 0, clone);
            } else {
                const newKey = 'wb_' + Date.now().toString(36);
                clone.key = newKey;
                const keys = Object.keys(book.entries);
                const newEntries = {};
                for (let i = 0; i <= index; i++) newEntries[keys[i]] = book.entries[keys[i]];
                newEntries[newKey] = clone;
                for (let i = index + 1; i < keys.length; i++) newEntries[keys[i]] = book.entries[keys[i]];
                book.entries = newEntries;
            }
            saved.value = false;
        }
        // 阶段 5.1: 触发词同步(_keysStr ↔ keys[])
        function syncKeys(entry) {
            if (!entry) return;
            const str = (entry._keysStr || '').trim();
            entry.keys = str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
            saved.value = false;
        }
        // 阶段 5.2: 提取卡内世界书为独立世界书
        async function extractWbAsStandalone() {
            const entries = wbEntries.value;
            if (!entries.length) { showToast('无世界书条目可提取'); return; }
            const cardName = (d.value && d.value.name) || '未命名角色';
            const cleanEntries = entries.map(e => {
                const c = { ...e };
                c.key = Array.isArray(c.keys) ? [...c.keys] : (c.keys || []);
                c.keysecondary = Array.isArray(c.secondary_keys) ? [...c.secondary_keys] : [];
                c.order = c.order ?? c.insertion_order ?? 100;
                delete c.keys; delete c.secondary_keys; delete c._keysStr; delete c._collapsed;
                c.comment = String(c.comment || c.name || '');
                return c;
            });
            const wbName = `${cardName} - 世界书`;
            const wbData = { name: wbName, description: `从角色卡「${cardName}」提取的世界书`, entries: cleanEntries };
            const safeName = wbName.replace(/[\\/:*?"<>|]/g, '_') + '.json';
            const res = await api.createWorldbook({ path: '/library/' + safeName, name: safeName, wb: wbData });
            if (res && res.success) {
                showSuccessToast(`已提取世界书《${wbName}》（${cleanEntries.length} 个词条）`);
            } else {
                showToast((res && res.error) || '提取失败');
            }
        }

        // ---------- 条目折叠(BUG 0.5:头行常驻,正文点击展开/收起,默认折叠) ----------
        const wbFolded = ref({});
        const regexFolded = ref({});
        const isWbFolded = (i) => wbFolded.value[i] !== false;
        const isRegexFolded = (i) => regexFolded.value[i] !== false;
        function toggleWbFold(i) { wbFolded.value[i] = !isWbFolded(i); }
        function toggleRegexFold(i) { regexFolded.value[i] = !isRegexFolded(i); }

        // 正则
        const regexList = computed(() => {
            if (!d.value.extensions) d.value.extensions = {};
            if (!Array.isArray(d.value.extensions.regex_scripts)) d.value.extensions.regex_scripts = [];
            return d.value.extensions.regex_scripts;
        });
        function addRegex() {
            regexList.value.push({ scriptName: '', findRegex: '', replaceString: '', enabled: false });
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
        // 阶段 3.4: 标签面板
        const showTagPanel = ref(false);
        function onTagsChange(arr) {
            if (!d.value) return;
            d.value.tags = arr;
            saved.value = false;
        }

        // ---------- 状态栏预览(简化版:应用卡内渲染脚本到 AI 输出) ----------
        const STATUS_DEMO = `<status>\n❤️ 体力：85/100\n💰 金钱：320\n💕 好感度：42\n📅 第 3 天 · 上午 · 晴\n</status>\n\n其余回复内容原样保留，只有 <status> 块被渲染成面板。`;
        const statusInput = ref(STATUS_DEMO);
        const previewText = computed(() => statusInput.value.length);

        // 可参与渲染的脚本:replaceString 被分类器判定为完整模板(loader/html/code)且启用
        const statusScripts = computed(() => {
            const list = Array.isArray(regexList.value) ? regexList.value : [];
            return list.filter((s) => s && s.enabled !== false
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

        // ---------- 阶段 4.6: 状态栏模板库 ----------
        const showTemplatePicker = ref(false);
        const showPromptPicker = ref(false);
        const templateMeta = STATUSBAR_TEMPLATE_META;
        const promptMeta = STATUSBAR_PROMPT_META;

        function injectStatusbarTemplate(key) {
            const tpl = findStatusbarTemplate(key);
            if (!tpl) return;
            if (!d.value.extensions) d.value.extensions = {};
            if (!Array.isArray(d.value.extensions.regex_scripts)) d.value.extensions.regex_scripts = [];
            // 隔离：禁用已有的状态栏渲染脚本（findRegex 含 <status>）
            d.value.extensions.regex_scripts.forEach(s => {
                if (/<status/i.test(s.findRegex || '')) s.enabled = false;
            });
            d.value.extensions.regex_scripts.push({
                scriptName: `状态栏-${tpl.name}`,
                findRegex: tpl.findRegex,
                replaceString: tpl.replaceString,
                enabled: true
            });
            saved.value = false;
            showTemplatePicker.value = false;
            showSuccessToast(`已注入「${tpl.name}」模板`);
        }

        function injectPromptTemplate(key) {
            const tpl = findStatusbarPrompt(key);
            if (!tpl) return;
            if (!d.value.extensions) d.value.extensions = {};
            if (!d.value.extensions.world_book) {
                if (d.value.character_book) d.value.extensions.world_book = d.value.character_book;
                else d.value.extensions.world_book = { entries: {} };
            }
            const book = d.value.extensions.world_book;
            if (!book.entries || typeof book.entries !== 'object') book.entries = {};
            const idx = String(Object.keys(book.entries).length);
            book.entries[idx] = {
                keys: [],
                constant: true,
                position: 'before_char',
                insertorder: 10,
                comment: `状态栏指令-${tpl.name}`,
                content: tpl.content,
                enabled: true
            };
            saved.value = false;
            showPromptPicker.value = false;
            showSuccessToast(`已注入「${tpl.name}」指令模板`);
        }

        const t = (v) => estimateTokens(String(v || ''));
        const tokenTotal = computed(() =>
            t(d.value.description) + t(d.value.personality) + t(d.value.first_mes)
            + t(d.value.scenario) + t(d.value.mes_example) + t(greetingsText.value)
        );
        const tokenText = computed(() => `≈ ${tokenTotal.value} tokens`);
        const tokenDetailText = computed(() =>
            `详细设定: ${t(d.value.description)}\n性格: ${t(d.value.personality)}\n开场白: ${t(d.value.first_mes)}\n场景: ${t(d.value.scenario)}\n示例对话: ${t(d.value.mes_example)}\n备用开场白: ${t(greetingsText.value)}\n合计: ${tokenTotal.value}`
        );

        async function save() {
            if (!card.value) return;
            // 阶段 1.2:WebP 卡片编辑友好降级
            const fileName = (card.value.fileName || card.value.path || '').toLowerCase();
            if (fileName.endsWith('.webp')) {
                showToast('暂不支持 WebP 卡片原地编辑，建议在桌面端转为 PNG 格式后重新导入');
                return;
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

        // ---------- 阶段 2.4:复制副本 ----------
        async function onDuplicate() {
            if (!card.value) return;
            const res = await api.duplicateFile(card.value.path);
            if (res && res.success) {
                showSuccessToast('已复制副本');
            } else {
                showToast((res && res.error) || '复制失败');
            }
        }

        // ---------- 阶段 2.5:打开位置 ----------
        async function onOpenFolder() {
            if (!card.value) return;
            try {
                await api.showItemInFolder(card.value.path);
            } catch (e) {
                showToast('打开失败: ' + (e.message || e));
            }
        }

        // ---------- 阶段 2.3:换卡图 ----------
        function triggerChangeImage() {
            if (changeImageInput.value) changeImageInput.value.click();
        }
        async function onChangeImage(e) {
            const file = e.target && e.target.files && e.target.files[0];
            if (!file) return;
            if (!card.value) return;
            try {
                const reader = new FileReader();
                const base64 = await new Promise((resolve, reject) => {
                    reader.onload = () => {
                        const result = reader.result;
                        const comma = result.indexOf(',');
                        resolve(comma >= 0 ? result.slice(comma + 1) : result);
                    };
                    reader.onerror = () => reject(new Error('读取文件失败'));
                    reader.readAsDataURL(file);
                });
                const imageType = (file.type || 'image/png').split('/').pop();
                const res = await api.replaceCardImage({ filePath: card.value.path, imageBase64: base64, imageType });
                if (res && res.success) {
                    showSuccessToast('已更新封面');
                    // 刷新封面:重新加载卡片
                    card.value = { ...card.value };
                } else {
                    showToast((res && res.error) || '更换封面失败');
                }
            } catch (err) {
                showToast('换图失败: ' + (err.message || err));
            }
            if (changeImageInput.value) changeImageInput.value.value = '';
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
        // 渲染模式(BUG 0.7:AI 回复按 HTML 渲染,DOMPurify 清洗)
        const chatRenderMode = ref(localStorage.getItem('jsmobile-chat-render') === '1');
        function toggleChatRender() {
            chatRenderMode.value = !chatRenderMode.value;
            localStorage.setItem('jsmobile-chat-render', chatRenderMode.value ? '1' : '0');
        }
        function renderChat(text) {
            if (!text) return '';
            return DOMPurify.sanitize(String(text));
        }

        const chatApiEndpoint = ref(localStorage.getItem(LS_ENDPOINT) || 'http://127.0.0.1:1234/v1/chat/completions');
        const chatApiKey = ref(localStorage.getItem(LS_KEY) || '');
        const chatApiModel = ref(localStorage.getItem(LS_MODEL) || 'local-model');
        const chatApiType = ref(localStorage.getItem(LS_TYPE) === 'anthropic' ? 'anthropic' : 'openai');
        const radioStyle = { marginRight: '16px' };
        // 阶段 2.8:模型列表拉取
        const fetchingModels = ref(false);
        const fetchedModels = ref([]);

        function saveChatApi() {
            localStorage.setItem(LS_ENDPOINT, chatApiEndpoint.value.trim());
            localStorage.setItem(LS_KEY, chatApiKey.value.trim());
            localStorage.setItem(LS_MODEL, chatApiModel.value.trim());
            localStorage.setItem(LS_TYPE, chatApiType.value);
            showChatApi.value = false;
            showSuccessToast('已保存 API 配置');
        }

        // 阶段 2.8:拉取模型列表
        async function onFetchModels() {
            const endpoint = chatApiEndpoint.value.trim();
            if (!endpoint) { showToast('请先填写 API 端点'); return; }
            fetchingModels.value = true;
            try {
                const res = await api.fetchModels(chatApiEndpoint.value.trim(), chatApiKey.value.trim(), chatApiType.value);
                if (res && res.success && res.data) {
                    const ids = (res.data.data || res.data || []).map((m) => m.id || m).filter(Boolean);
                    fetchedModels.value = ids;
                    if (ids.length) {
                        showSuccessToast(`获取到 ${ids.length} 个模型`);
                    } else {
                        showToast('未获取到模型列表');
                    }
                } else {
                    showToast(res.error || '获取模型列表失败');
                }
            } catch (e) {
                showToast('获取失败: ' + (e.message || e));
            } finally {
                fetchingModels.value = false;
            }
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

        // ---------- 阶段 4.2: AI 工具（汉化 / 格式升维）----------
        async function aiTranslate() {
            if (!card.value || !d.value) return;
            if (!chatApiEndpoint.value || !chatApiEndpoint.value.trim()) {
                showToast('请先在测卡 Tab 配置 API'); return;
            }
            try {
                await showConfirmDialog({
                    title: 'AI 一键汉化',
                    message: '将调用 AI 翻译当前卡片的「角色设定」「首条消息」「场景」和「对话示例」。\n这可能会消耗一定 Token，是否继续？'
                });
            } catch { return; }

            aiLoading.value = true;
            const targetCard = card.value;
            const data = d.value;
            const sysPrompt = `你是一个专业的 SillyTavern 角色卡本地化翻译专家。
请将用户发送的文本翻译成流畅、符合中文语境的网文/轻小说风格中文。
【绝对不可违背的规则】：
1. 绝对不要翻译、修改或删除任何包裹在双大括号中的宏变量（如 {{user}}, {{char}}, {{original}} 等）。
2. 绝对不要翻译包裹在星号中的正则逻辑或代码。
3. 保持原有的换行符和段落格式。
4. 直接返回翻译后的纯文本，不要包含任何多余的解释、问候或引号。`;

            const callAI = async (text) => {
                if (!text || text.trim() === '') return text;
                const payload = {
                    model: chatApiModel.value || 'local-model',
                    messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: text }],
                    temperature: 0.3
                };
                const authKey = (chatApiKey.value && chatApiKey.value.trim()) ? chatApiKey.value : '';
                const res = await api.sendChatMessage(chatApiEndpoint.value.trim(), payload, authKey, chatApiType.value);
                if (!res || !res.success) throw new Error((res && res.error) || 'API 请求失败');
                return extractChatReply(res, chatApiType.value).trim();
            };

            try {
                aiLoadingText.value = '翻译角色设定…';
                if (data.description) data.description = await callAI(data.description);
                if (card.value !== targetCard) return;
                aiLoadingText.value = '翻译首条消息…';
                if (data.first_mes) data.first_mes = await callAI(data.first_mes);
                if (card.value !== targetCard) return;
                aiLoadingText.value = '翻译场景…';
                if (data.scenario) data.scenario = await callAI(data.scenario);
                if (card.value !== targetCard) return;
                aiLoadingText.value = '翻译对话示例…';
                if (data.mes_example) data.mes_example = await callAI(data.mes_example);
                saved.value = false;
                showSuccessToast('🎉 翻译完成！请检查后保存。');
            } catch (err) {
                showToast('翻译失败: ' + (err.message || err));
            } finally {
                aiLoading.value = false;
                aiLoadingText.value = '';
            }
        }

        async function aiRefactor() {
            if (!card.value || !d.value) return;
            if (!chatApiEndpoint.value || !chatApiEndpoint.value.trim()) {
                showToast('请先在测卡 Tab 配置 API'); return;
            }
            if (!d.value.description || !d.value.description.trim()) {
                showToast('角色设定为空，无需重构'); return;
            }
            try {
                await showConfirmDialog({
                    title: 'AI 格式升维',
                    message: '将调用 AI 把「角色设定」从旧格式（W++/JSON）重构为更省 Token 的 Markdown 格式。\n这会覆盖原有设定，是否继续？'
                });
            } catch { return; }

            aiLoading.value = true;
            const targetCard = card.value;
            const sysPrompt = `你是一个大语言模型提示词优化专家和角色卡设定师。
用户会发送一段可能由旧版 W++、JSON 或繁琐描述堆砌的角色卡设定 (Description)。
请将其重构为极其紧凑、高信息密度的结构化 Markdown 格式。
【绝对不可违背的规则】：
1. 绝对不遗漏人物的原有特征、外貌、XP、弱点和世界观设定。
2. 绝对不能更改、翻译或删除包裹在双大括号中的宏变量（如 {{user}}, {{char}}）。
3. 去除无意义的括号、JSON 键名等冗余符号，极大压缩 Token 占用。
4. 如果原文是英文，请用英文重构；如果原文是中文，请用中文重构。
5. 直接输出重构后的纯文本，不要带有任何废话。`;

            try {
                aiLoadingText.value = '重构设定格式…';
                const payload = {
                    model: chatApiModel.value || 'local-model',
                    messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: d.value.description }],
                    temperature: 0.3
                };
                const authKey = (chatApiKey.value && chatApiKey.value.trim()) ? chatApiKey.value : '';
                const res = await api.sendChatMessage(chatApiEndpoint.value.trim(), payload, authKey, chatApiType.value);
                if (!res || !res.success) throw new Error((res && res.error) || 'API 请求失败');
                if (card.value !== targetCard) return;
                d.value.description = extractChatReply(res, chatApiType.value).trim();
                saved.value = false;
                showSuccessToast('✨ 格式升维完成！请检查后保存。');
            } catch (err) {
                showToast('重构失败: ' + (err.message || err));
            } finally {
                aiLoading.value = false;
                aiLoadingText.value = '';
            }
        }

        // 阶段 4.1: AI 打标回调
        function onAITagged(newTags) {
            if (!d.value) return;
            d.value.tags = newTags;
            saved.value = false;
        }

        // 阶段 4.1/4.2: AI 工具菜单
        const aiActions = [
            { name: '🤖 AI 智能打标', action: 'tag' },
            { name: '🌐 AI 一键汉化', action: 'translate' },
            { name: '✨ AI 格式升维', action: 'refactor' }
        ];
        function onAIActionSelect(item) {
            if (item.action === 'tag') {
                showAITagPanel.value = true;
            } else if (item.action === 'translate') {
                aiTranslate();
            } else if (item.action === 'refactor') {
                aiRefactor();
            }
        }

        onMounted(() => {
            resolveId();
            card.value = findCard(id.value) || null;
            initChat();
        });

        return {
            card, id, activeTab, advancedOpen, showTokenDetail, saved, changeImageInput,
            d, tags, greetingsText, wbEntries, regexList,
            tokenText, tokenDetailText,
            addWbEntry, removeWbEntry, moveWbEntry, cloneWbEntry, syncKeys, extractWbAsStandalone, POSITION_OPTIONS,
            addRegex, removeRegex, removeTag, showTagPanel, onTagsChange,
            isWbFolded, isRegexFolded, toggleWbFold, toggleRegexFold,
            save, onDuplicate, onOpenFolder, triggerChangeImage, onChangeImage,
            statusInput, previewText, statusScripts, statusApplied, statusHtml, resetStatusDemo,
            showTemplatePicker, showPromptPicker, templateMeta, promptMeta,
            injectStatusbarTemplate, injectPromptTemplate,
            showPush, pushing, pushingFolder, tavernUrl, tavernKey, savePushConfig, doPush, doPushToFolder,
            showSnapshots, onSnapshotRestored,
            showImagePreview, previewSrc,
            chatMessages, chatDraft, chatSending, chatListEl, showChatApi,
            chatRenderMode, toggleChatRender, renderChat,
            chatApiEndpoint, chatApiKey, chatApiModel, chatApiType, radioStyle,
            fetchingModels, fetchedModels, onFetchModels,
            saveChatApi, sendChat, clearChat,
            // 阶段 4.1/4.2
            showAITools, showAITagPanel, aiLoading, aiLoadingText,
            aiTranslate, aiRefactor, onAITagged,
            aiActions, onAIActionSelect
        };
    }
};
</script>

<style scoped>
.detail-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* 阶段 4.1/4.2: AI 加载遮罩 */
.ai-loading-box {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 40px;
}
.ai-loading-text { color: #06b6d4; font-size: 14px; }
/* 滚动链修复:van-tabs 根节点必须占满可用高度,content 才能按高度滚动(BUG 0.2) */
.detail-page :deep(.van-tabs) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.detail-page :deep(.van-tabs__content) { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.detail-page :deep(.van-tab__panel) { min-height: 100%; }
.basic-wrap { padding: 4px 12px; }
.id-row { display: flex; gap: 12px; align-items: flex-start; margin: 8px 0 4px; }
.id-cover { width: 84px; height: 84px; border-radius: 10px; flex-shrink: 0; }
.id-cover-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.cover-actions { display: flex; gap: 4px; }
.detail-actions { display: flex; gap: 8px; padding: 4px 0 8px; }
.id-info { flex: 1; min-width: 0; }
.id-info :deep(.van-field) { padding: 6px 0; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0 10px; align-items: center; }
.add-tag { cursor: pointer; }
.sec-label { font-size: 12px; color: var(--van-gray-6); margin: 6px 0 2px; }
.token-detail {
    white-space: pre-line; font-size: 12px; color: var(--van-gray-6);
    background: var(--van-gray-1); border-radius: 8px; padding: 8px; margin-bottom: 8px;
}
.adv-collapse { margin: 8px 0; }
.tab-pad { padding: 12px; }
.wb-item, .regex-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 8px 10px 4px;
    margin-top: 10px;
    background: var(--van-background-2, #fff);
}
.wb-item.folded, .regex-item.folded { padding-bottom: 6px; }
.wb-head { display: flex; align-items: center; gap: 8px; }
.wb-head .fold-arrow { transition: transform .18s; flex-shrink: 0; color: var(--van-gray-6, #969799); }
.wb-head .fold-arrow.open { transform: rotate(90deg); }
.wb-name { flex: 1; }
.wb-name :deep(.van-field__control) { font-size: 14px; }
.wb-body, .regex-body { padding-top: 2px; }
/* 阶段 5.1: 词条增强编辑 */
.wb-advanced { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--van-gray-3, #ebedf0); }
.wb-advanced :deep(.van-field) { padding: 4px 0; }
.wb-advanced :deep(.van-field__label) { font-size: 12px; color: var(--van-gray-6, #969799); width: 56px; }
.wb-advanced-row { display: flex; align-items: center; gap: 12px; padding: 6px 0 2px; flex-wrap: wrap; }
.wb-advanced-col { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.wb-advanced-label { font-size: 11px; color: var(--van-gray-6, #969799); white-space: nowrap; }
.wb-pos-col { flex: 1.5; }
.wb-pos-select { font-size: 12px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--van-gray-3, #ebedf0); background: var(--van-background-2, #fff); color: var(--van-text-color, #323233); max-width: 100%; }
.stub-window { padding: 2px 2px 6px; }
.st-bar { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 8px; }
.st-btns { display: flex; gap: 4px; flex-wrap: wrap; }
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

/* 阶段 4.6: 模板选择器 */
.tpl-picker { padding: 16px 12px 32px; }
.tpl-picker-title { font-size: 15px; font-weight: bold; text-align: center; margin-bottom: 12px; }
.tpl-list { display: flex; flex-direction: column; gap: 8px; max-height: 55vh; overflow-y: auto; }
.tpl-item {
    display: flex; gap: 10px; padding: 10px 12px;
    background: var(--van-background-2, #fff);
    border: 1px solid var(--van-border-color, #ebedf0);
    border-radius: 8px; cursor: pointer;
}
.tpl-item:active { opacity: 0.7; }
.tpl-icon { font-size: 24px; flex-shrink: 0; }
.tpl-info { flex: 1; min-width: 0; }
.tpl-name { font-size: 14px; font-weight: 600; }
.tpl-desc { font-size: 12px; color: var(--van-text-color-2); margin-top: 2px; }
.tpl-fields { font-size: 11px; color: var(--van-gray-5); margin-top: 2px; }
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
/* 渲染模式开关(BUG 0.7) */
.ct-render {
    margin-left: 10px;
    font-size: 12px;
    color: var(--van-gray-6, #969799);
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 999px;
    padding: 1px 10px;
    line-height: 18px;
}
.ct-render.on { color: #fff; background: #06b6d4; border-color: #06b6d4; }
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
/* 对比增强:用户=主题主色白字,AI=边框+主题化背景(BUG 0.7) */
.bubble.user {
    align-self: flex-end;
    background: var(--van-primary-color, #06b6d4);
    color: #fff;
    border: 1px solid var(--van-primary-color, #06b6d4);
}
.bubble.assistant {
    align-self: flex-start;
    border: 1px solid var(--van-border-color, #ebedf0);
}
.b-name {
    display: flex; align-items: center;
    font-size: 11px;
    color: var(--van-primary-color, #06b6d4);
    font-weight: 600;
    margin-bottom: 4px;
}
.b-name::before {
    content: '';
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; margin-right: 5px;
}
.b-name.user { color: var(--van-gray-6, #969799); }
.bubble.user .b-name { color: rgba(255,255,255,.92); }
.b-content {
    margin: 0; white-space: pre-wrap; word-break: break-word;
    font-family: inherit; font-size: 15px; line-height: 1.7;
}
.bubble.user .b-content { color: #fff; font-weight: 500; }
.b-content.rich { white-space: normal; }
.b-content.rich :deep(style), .b-content.rich :deep(script) { display: none; }
.b-content.rich :deep(img) { max-width: 100%; border-radius: 8px; }
.b-content.rich :deep(a) { color: var(--van-primary-color, #06b6d4); }
.b-content.rich :deep(pre) { white-space: pre-wrap; word-break: break-word; }
.input-bar {
    display: flex; align-items: flex-end; gap: 8px;
    padding: 8px 10px;
    background: var(--van-background-2, #fff);
    border-top: 1px solid var(--van-gray-2, #ebedf0);
}
.input-bar .van-field { flex: 1; }
/* 模型列表 */
.model-list { padding: 4px 16px 8px; flex-wrap: wrap; display: flex; }

/* 阶段 3.6: 大图预览 */
.img-preview-popup {
    width: 96vw;
    max-height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.92);
}
.preview-img {
    max-width: 100%;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 4px;
}
.preview-loading {
    padding: 40px;
}
</style>