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
            <!-- 功能按钮 -->
            <van-cell-group inset title="单卡功能（作用于当前卡片）">
                <van-cell title="🏷️ AI 智能打标" label="规则表命中 + AI 提取（可选候选池）" is-link @click="$emit('tag')" />
                <van-cell title="⚙️ 打标规则表" label="系统预设规则开关 + 自定义正则规则（免费优先）" is-link @click="$emit('rules')" />
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
        candidates: { type: Array, default: () => [] },
        running: { type: Boolean, default: false },
        progress: { type: String, default: '' }
    },
    emits: ['close', 'tag', 'rules', 'translate', 'refactor', 'add-candidate', 'remove-candidate'],
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
