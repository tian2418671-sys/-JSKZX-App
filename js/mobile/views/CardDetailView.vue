<template>
    <div class="detail-page">
        <van-nav-bar :title="card ? card.name : '卡片详情'" left-arrow @click-left="$router.back()" safe-area-inset-top>
            <template #right>
                <van-icon name="share-o" size="20" style="margin-right: 14px" @click="showPush = true" />
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
                            <MobileCardCover :card="card" aspect="1 / 1" class="id-cover" />
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
                                    <van-button size="mini" plain type="primary" @click="resetStatusDemo">恢复示例</van-button>
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
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeWbEntry(key)" />
                            </div>
                            <van-field
                                v-model="e.content" type="textarea" rows="3" autosize
                                placeholder="条目内容"
                            />
                        </div>
                        <van-empty v-if="!Object.keys(wbEntries || {}).length" description="无世界书条目" image-size="60" />
                    </div>
                </van-tab>

                <van-tab title="正则" name="regex">
                    <div class="tab-pad">
                        <van-button block icon="plus" type="primary" plain @click="addRegex">添加正则</van-button>
                        <div v-for="(r, i) in regexList" :key="i" class="regex-item">
                            <div class="wb-head">
                                <van-switch v-model="r.enabled" size="20px" />
                                <van-field v-model="r.scriptName" placeholder="名称" class="wb-name" />
                                <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeRegex(i)" />
                            </div>
                            <van-field v-model="r.findRegex" placeholder="查找(正则)" />
                            <van-field v-model="r.replaceString" type="textarea" rows="2" autosize placeholder="替换(空 = 删除匹配)" />
                        </div>
                        <van-empty v-if="!regexList || !regexList.length" description="无正则脚本" image-size="60" />
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
                <van-button block type="primary" :loading="pushing" @click="doPush">推送到酒馆</van-button>
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
    </div>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import MobileCardCover from '../components/MobileCardCover.vue';
import { findCard, saveCardData } from '../useMobileLibrary';
import { estimateTokens } from '../../utils/tokenEstimate';
import { api } from '../../bridge/api';
import { parseRegexPattern, classifyTemplate, sanitizeStatusHtml } from '../../composables/useStatusbarPreview.js';

// 推送酒馆配置存储键
const LS_TAVERN_URL = 'jsmobile-tavern-url';
const LS_TAVERN_KEY = 'jsmobile-tavern-key';

export default {
    name: 'CardDetailView',
    components: { MobileCardCover },
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
            return wb.entries;
        });

        function addWbEntry() {
            const key = 'wb_' + Date.now().toString(36);
            wbEntries.value[key] = { comment: '', content: '', enabled: true, keys: [], selective: false, constant: false, position: 0 };
            saved.value = false;
        }
        function removeWbEntry(key) {
            delete wbEntries.value[key];
            saved.value = false;
        }

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
        function addTag() {
            const t = window.prompt('输入标签:');
            if (t && t.trim() && !d.value.tags.includes(t.trim())) {
                d.value.tags.push(t.trim());
                saved.value = false;
            }
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
            const res = await saveCardData(card.value);
            if (res.success) {
                saved.value = true;
                card.value.name = d.value.name || card.value.name;
                showSuccessToast('已保存');
            } else {
                showToast(res.error || '保存失败');
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

        function saveChatApi() {
            localStorage.setItem(LS_ENDPOINT, chatApiEndpoint.value.trim());
            localStorage.setItem(LS_KEY, chatApiKey.value.trim());
            localStorage.setItem(LS_MODEL, chatApiModel.value.trim());
            localStorage.setItem(LS_TYPE, chatApiType.value);
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

        onMounted(() => {
            resolveId();
            card.value = findCard(id.value) || null;
            initChat();
        });

        return {
            card, id, activeTab, advancedOpen, showTokenDetail, saved,
            d, tags, greetingsText, wbEntries, regexList,
            tokenText, tokenDetailText,
            addWbEntry, removeWbEntry, addRegex, removeRegex, removeTag, addTag,
            save,
            statusInput, previewText, statusScripts, statusApplied, statusHtml, resetStatusDemo,
            showPush, pushing, tavernUrl, tavernKey, savePushConfig, doPush,
            chatMessages, chatDraft, chatSending, chatListEl, showChatApi,
            chatApiEndpoint, chatApiKey, chatApiModel, chatApiType, radioStyle,
            saveChatApi, sendChat, clearChat
        };
    }
};
</script>

<style scoped>
.detail-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.detail-page :deep(.van-tabs__content) { flex: 1; overflow-y: auto; padding-bottom: 24px; }
.basic-wrap { padding: 4px 12px; }
.id-row { display: flex; gap: 12px; align-items: flex-start; margin: 8px 0 4px; }
.id-cover { width: 84px; height: 84px; border-radius: 10px; flex-shrink: 0; }
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
.wb-head { display: flex; align-items: center; gap: 8px; }
.wb-name { flex: 1; }
.wb-name :deep(.van-field__control) { font-size: 14px; }
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