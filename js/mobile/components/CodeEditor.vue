<!--
  CodeEditor 轻量代码编辑器(预设脚本查看/编辑用,零依赖)
  行号栏 + 语法高亮层(highlightJs) + 透明 textarea 编辑层叠加;
  同步滚动;Tab 键缩进;工具栏一键格式化(formatJs)。
-->
<template>
    <div class="ce-wrap">
        <div class="ce-toolbar">
            <span class="ce-info">{{ lineCount }} 行 · {{ charCount }} 字符</span>
            <van-button size="mini" plain type="primary" @click="doFormat">✨ 格式化</van-button>
        </div>
        <div class="ce-body" :class="{ 'ce-fallback': !overlaySupported }" :style="{ height: height }">
            <div class="ce-gutter" ref="gutterEl" aria-hidden="true">{{ gutterText }}</div>
            <div class="ce-stage">
                <pre v-if="overlaySupported" class="ce-highlight" ref="hlEl" aria-hidden="true" v-html="highlighted"></pre>
                <textarea
                    ref="taEl"
                    class="ce-input"
                    :class="{ 'ce-input-fallback': !overlaySupported }"
                    :value="modelValue"
                    :spellcheck="false"
                    :autocapitalize="off"
                    :autocomplete="off"
                    @input="onInput"
                    @scroll="onScroll"
                    @keydown.tab.prevent="onTab"
                />
            </div>
        </div>
    </div>
</template>

<script>
import { computed, ref, onMounted, watch } from 'vue';
import { highlightJs, formatJs } from '../../utils/codeFormat.js';

export default {
    name: 'CodeEditor',
    props: {
        modelValue: { type: String, default: '' },
        height: { type: String, default: '52vh' }
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
        const taEl = ref(null);
        const hlEl = ref(null);
        const gutterEl = ref(null);
        // 🚀 WebView 兜底:检测透明文字叠层是否受支持(部分旧 WebView 不支持 -webkit-text-fill-color:transparent
        //    → 文字会以黑色直接显示,与高亮层叠影)。不支持时切「直显模式」:黑字白底,仍可正常编辑。
        const overlaySupported = (() => {
            try {
                const el = document.createElement('textarea');
                el.style.setProperty('-webkit-text-fill-color', 'transparent');
                document.body.appendChild(el);
                const v = getComputedStyle(el).webkitTextFillColor;
                el.remove();
                return v === 'transparent' || v === 'rgba(0, 0, 0, 0)';
            } catch (e) {
                return false;
            }
        })();
        const code = computed(() => String(props.modelValue == null ? '' : props.modelValue));
        const highlighted = computed(() => highlightJs(code.value));
        const lineCount = computed(() => (code.value ? code.value.split('\n').length : 1));
        const charCount = computed(() => code.value.length);
        const gutterText = computed(() => {
            const lines = [];
            for (let i = 1; i <= lineCount.value; i++) lines.push(i);
            return lines.join('\n');
        });

        function onInput(e) {
            emit('update:modelValue', e.target.value);
        }
        function onScroll() {
            if (!taEl.value) return;
            if (hlEl.value) { hlEl.value.scrollTop = taEl.value.scrollTop; hlEl.value.scrollLeft = taEl.value.scrollLeft; }
            if (gutterEl.value) gutterEl.value.scrollTop = taEl.value.scrollTop;
        }
        function onTab(e) {
            const ta = taEl.value;
            if (!ta) return;
            const start = ta.selectionStart, end = ta.selectionEnd;
            const next = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
            emit('update:modelValue', next);
            requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 2;
            });
        }
        function doFormat() {
            try {
                emit('update:modelValue', formatJs(code.value));
            } catch (e) { /* 格式化失败保持原样 */ }
        }
        // 换行数变化时保持高亮层高度同步(高亮层靠内容高度,textarea 滚动同步即可)
        onMounted(() => {
            if (taEl.value && hlEl.value) {
                hlEl.value.scrollTop = taEl.value.scrollTop;
                hlEl.value.scrollLeft = taEl.value.scrollLeft;
            }
        });
        return {
            taEl, hlEl, gutterEl, overlaySupported, highlighted, lineCount, charCount, gutterText,
            onInput, onScroll, onTab, doFormat
        };
    }
};
</script>

<style scoped>
.ce-wrap { display: flex; flex-direction: column; }
.ce-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 14px; border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.ce-info { font-size: 11px; color: var(--van-gray-5, #969799); font-variant-numeric: tabular-nums; }
.ce-body { display: flex; overflow: hidden; background: #0f172a; }
.ce-gutter {
    flex: 0 0 auto; min-width: 38px; padding: 12px 8px 12px 0;
    text-align: right; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.55;
    color: #475569; background: #0b1120; overflow: hidden; user-select: none;
    white-space: pre; box-sizing: border-box;
}
.ce-stage { position: relative; flex: 1; min-width: 0; }
.ce-highlight, .ce-input {
    position: absolute; inset: 0; margin: 0; padding: 12px 12px;
    font-family: 'Consolas', 'Monaco', 'SF Mono', monospace; font-size: 12px; line-height: 1.55;
    white-space: pre; overflow: auto; tab-size: 2;
    border: 0; border-radius: 0; box-sizing: border-box;
}
.ce-highlight {
    pointer-events: none; z-index: 1; color: #e2e8f0; background: transparent;
}
.ce-input {
    z-index: 2; color: transparent; caret-color: #38bdf8; background: transparent;
    resize: none; outline: none; -webkit-text-fill-color: transparent;
}
/* 🚀 选中态修复:叠层方案下编辑层文字是透明的,默认选中时看不到选中内容(只剩色块)。
   显式给选中态上白字+半透明蓝底,拖选/全选都有清晰反馈。 */
.ce-input::selection {
    background: rgba(56, 189, 248, 0.45);
    color: #ffffff;
    -webkit-text-fill-color: #ffffff;
}
.ce-highlight::selection { background: rgba(56, 189, 248, 0.30); }
/* 🚀 直显回退模式(WebView 不支持透明叠层):白底黑字,放弃高亮保可编辑性 */
.ce-fallback { background: #ffffff; }
.ce-input-fallback {
    color: #1e293b; background: #ffffff; -webkit-text-fill-color: #1e293b;
    caret-color: #0284c7;
}
.ce-fallback .ce-gutter { background: #f1f5f9; color: #94a3b8; }
/* 语法高亮色系(暗色编辑器) */
.ce-highlight :deep(.kw) { color: #c084fc; }
.ce-highlight :deep(.str) { color: #86efac; }
.ce-highlight :deep(.num) { color: #fbbf24; }
.ce-highlight :deep(.cmt) { color: #64748b; font-style: italic; }
.ce-highlight :deep(.lit) { color: #fb923c; }
.ce-highlight :deep(.bi) { color: #7dd3fc; }
.ce-highlight :deep(.re) { color: #f9a8d4; }
</style>
