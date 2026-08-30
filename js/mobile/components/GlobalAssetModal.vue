<!--
  GlobalAssetModal 移动端全局资产中心弹窗（Vant 底部弹层）
  世界书合集 + 正则脚本合集，纯展示（数据由父级 computed 提供）
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="gam-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="gam-head">
            <span class="gam-title">📚 全局资产中心</span>
            <van-icon name="cross" size="18" @click="$emit('close')" />
        </div>

        <van-tabs v-model:active="activeTab" class="gam-tabs">
            <van-tab :title="`世界书 (${worldbooks.length})`" name="worldbook">
                <div class="gam-list">
                    <van-empty v-if="!worldbooks.length" description="全库未收集到世界书条目" image-size="70" />
                    <div v-for="(e, i) in worldbooks" :key="i" class="gam-item">
                        <div class="gam-item-head">
                            <span class="gam-name">{{ e.displayName }}</span>
                            <span class="gam-meta">优先级 {{ e.insertion_order ?? 50 }}</span>
                        </div>
                        <div class="gam-owner">所属角色：{{ e.ownerCardName }}</div>
                        <div v-if="e.keys && e.keys.length" class="gam-keys">
                            <van-tag v-for="k in e.keys.slice(0, 6)" :key="k" plain type="success" size="mini">{{ k }}</van-tag>
                        </div>
                        <div class="gam-content" v-html="renderHTML(e.content)"></div>
                    </div>
                </div>
            </van-tab>

            <van-tab :title="`正则 (${regexScripts.length})`" name="regex">
                <div class="gam-list">
                    <van-empty v-if="!regexScripts.length" description="全库未收集到正则脚本" image-size="70" />
                    <div v-for="(r, i) in regexScripts" :key="i" class="gam-item">
                        <div class="gam-item-head">
                            <span class="gam-name">{{ r.scriptName || r.comment || '未命名正则' }}</span>
                        </div>
                        <div class="gam-owner">所属角色：{{ r.ownerCardName }}</div>
                        <div class="gam-regex">
                            <div class="gam-regex-label">查找</div>
                            <code>{{ r.findRegex || r.find }}</code>
                        </div>
                        <div class="gam-regex">
                            <div class="gam-regex-label">替换</div>
                            <code>{{ r.replaceString || r.replace }}</code>
                        </div>
                    </div>
                </div>
            </van-tab>
        </van-tabs>
    </van-popup>
</template>

<script>
import { ref, watch } from 'vue';

export default {
    name: 'GlobalAssetModal',
    props: {
        show: { type: Boolean, default: false },
        worldbooks: { type: Array, default: () => [] },
        regexScripts: { type: Array, default: () => [] }
    },
    emits: ['close'],
    setup(props) {
        const activeTab = ref('worldbook');
        watch(() => props.show, (v) => { if (v) activeTab.value = 'worldbook'; });

        function renderHTML(text) {
            if (!text) return '';
            let safeText = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return safeText.replace(/\n/g, '<br>').replace(/\s\s/g, '&nbsp;&nbsp;');
        }
        return { activeTab, renderHTML };
    }
};
</script>

<style scoped>
.gam-popup {
    width: 100%;
    height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.gam-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 4px;
}
.gam-title { font-size: 16px; font-weight: 600; }
.gam-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gam-list { padding: 12px 14px 24px; overflow-y: auto; flex: 1; }
.gam-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px; padding: 10px; margin-bottom: 10px;
    background: var(--van-background-2, #fff);
}
.gam-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.gam-name { font-size: 14px; font-weight: 600; color: var(--van-text-color, #323233); }
.gam-meta { font-size: 11px; color: var(--van-gray-6, #969799); flex-shrink: 0; }
.gam-owner { font-size: 11px; color: var(--van-gray-6, #969799); margin-bottom: 6px; }
.gam-keys { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.gam-content {
    font-size: 12px; color: var(--van-gray-7, #646566);
    background: var(--van-gray-1, #f7f8fa);
    padding: 8px; border-radius: 6px;
    max-height: 120px; overflow-y: auto;
    word-break: break-all;
}
.gam-regex { margin-bottom: 6px; }
.gam-regex-label { font-size: 11px; color: var(--van-gray-6, #969799); margin-bottom: 2px; }
.gam-regex code {
    display: block; font-size: 11px; font-family: monospace;
    background: var(--van-gray-1, #f7f8fa); padding: 6px 8px; border-radius: 6px;
    word-break: break-all;
}
</style>
