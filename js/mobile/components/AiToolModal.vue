<!--
  AiToolModal 移动端 AI 智能工具弹窗（Vant 底部弹层）
  单卡模式（移动端无多选）：AI 打标 / 一键汉化 / 提示词重构
  复用 stc-api-* 存储的 API 配置 + api.sendChatMessage 桥接（绕过 CORS）
  逻辑由父级注入（emit 调用），本组件纯 UI + 状态展示
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="aitm-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="aitm-head">
            <span class="aitm-title">🤖 AI 智能工具</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <div class="aitm-body">
            <!-- API 配置提示 -->
            <van-cell-group inset title="大模型 API（与测卡共用）">
                <van-field :model-value="endpoint" label="端点" placeholder="http://127.0.0.1:1234/v1" @update:model-value="$emit('update:endpoint', $event)" />
                <van-field :model-value="key" label="Key" placeholder="sk-... 或留空" @update:model-value="$emit('update:key', $event)" />
                <van-field :model-value="model" label="模型" placeholder="local-model" @update:model-value="$emit('update:model', $event)" />
                <van-cell title="协议">
                    <template #value>
                        <van-radio-group :model-value="apiType" direction="horizontal" @update:model-value="$emit('update:apiType', $event)">
                            <van-radio name="openai">OpenAI</van-radio>
                            <van-radio name="anthropic">Anthropic</van-radio>
                        </van-radio-group>
                    </template>
                </van-cell>
            </van-cell-group>

            <!-- 功能按钮 -->
            <van-cell-group inset title="单卡功能（作用于当前卡片）">
                <van-cell title="🏷️ AI 智能打标" label="提取/补充角色标签（可选候选池）" is-link @click="$emit('tag')" />
                <van-cell title="🌐 一键汉化" label="翻译设定/开场白/场景/示例对话" is-link @click="$emit('translate')" />
                <van-cell title="✨ 提示词重构" label="W++/JSON 重构为紧凑 Markdown" is-link @click="$emit('refactor')" />
            </van-cell-group>

            <!-- 打标候选池（点击打标时展开使用） -->
            <van-cell-group v-if="mode === 'tag'" inset title="标签候选池（可选，留空则 AI 自由提取）">
                <div class="aitm-cands">
                    <van-tag
                        v-for="(t, i) in candidates"
                        :key="i"
                        closable
                        color="#eef7fb"
                        text-color="#06b6d4"
                        @close="removeCandidate(i)"
                    >{{ t }}</van-tag>
                    <van-tag plain color="#999" class="aitm-add" @click="addCandidate">＋</van-tag>
                </div>
                <van-field v-model="candidateInput" placeholder="输入候选标签后回车" @keyup.enter="commitCandidate" />
            </van-cell-group>

            <!-- 执行进度 -->
            <div v-if="running" class="aitm-running">
                <van-loading size="20" color="#06b6d4">{{ progress }}</van-loading>
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'AiToolModal',
    props: {
        show: { type: Boolean, default: false },
        mode: { type: String, default: '' },       // '' | 'tag' | 'translate' | 'refactor'
        endpoint: { type: String, default: '' },
        key: { type: String, default: '' },
        model: { type: String, default: '' },
        apiType: { type: String, default: 'openai' },
        candidates: { type: Array, default: () => [] },
        running: { type: Boolean, default: false },
        progress: { type: String, default: '' }
    },
    emits: ['close', 'update:endpoint', 'update:key', 'update:model', 'update:apiType', 'tag', 'translate', 'refactor', 'add-candidate', 'remove-candidate'],
    data() {
        return { candidateInput: '' };
    },
    methods: {
        addCandidate() {
            this.commitCandidate();
        },
        commitCandidate() {
            const v = (this.candidateInput || '').trim();
            if (v) {
                this.$emit('add-candidate', v);
                this.candidateInput = '';
            }
        },
        removeCandidate(i) {
            this.$emit('remove-candidate', i);
        }
    }
};
</script>

<style scoped>
.aitm-popup { max-height: 85vh; overflow-y: auto; }
.aitm-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 8px;
}
.aitm-title { font-size: 16px; font-weight: 600; }
.aitm-body { padding-bottom: 16px; }
.aitm-cands {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 8px 16px;
}
.aitm-add { cursor: pointer; }
.aitm-running {
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    color: #06b6d4;
    font-size: 13px;
}
</style>
