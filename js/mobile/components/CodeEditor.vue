<!--
  CodeEditor 轻量代码编辑器(预设脚本查看/编辑用,零依赖)
  行号栏 + 语法高亮层(highlightJs) + 透明 textarea 编辑层叠加;
  同步滚动;Tab 键缩进;工具栏:格式化 / 复制 / 明暗切换。
  🎨 主题架构:根容器 .ce-editor 上的 CSS 变量统一驱动全部节点
     (背景/文字/行号/光标/高亮 token),切换只改根 class,任何子节点必然同步;
     样式全部非 scoped 且带 .ce-editor 前缀 + !important,杜绝作用域丢失与全局污染。
-->
<template>
    <div class="ce-editor" :class="{ 'ce-light': lightTheme }">
        <div class="ce-toolbar">
            <span class="ce-info">{{ lineCount }} 行 · {{ charCount }} 字符</span>
            <span class="ce-actions">
                <van-button size="mini" plain type="primary" @click="doFormat">✨ 格式化</van-button>
                <van-button size="mini" plain @click="doCopy">{{ copied ? '✅ 已复制' : '📋 复制' }}</van-button>
                <van-button size="mini" plain @click="lightTheme = !lightTheme">{{ lightTheme ? '🌙 深色' : '☀️ 浅色' }}</van-button>
            </span>
        </div>
        <div class="ce-body" :style="{ height: height }">
            <div class="ce-gutter" ref="gutterEl" aria-hidden="true">{{ gutterText }}</div>
            <div class="ce-stage">
                <pre class="ce-highlight" ref="hlEl" aria-hidden="true" v-html="highlighted"></pre>
                <textarea
                    ref="taEl"
                    class="ce-input"
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
import { computed, ref, onMounted } from 'vue';
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
        // 🎨 明暗主题(默认深色 One Dark;浅色为 GitHub Light 系)
        const lightTheme = ref(false);
        const copied = ref(false);
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
        async function doCopy() {
            const text = code.value;
            if (!text) return;
            const fallback = () => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            };
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
                else fallback();
                copied.value = true;
            } catch (e) {
                try { fallback(); copied.value = true; } catch (e2) { /* 复制失败静默 */ }
            }
            setTimeout(() => { copied.value = false; }, 1600);
        }
        onMounted(() => {
            if (taEl.value && hlEl.value) {
                hlEl.value.scrollTop = taEl.value.scrollTop;
                hlEl.value.scrollLeft = taEl.value.scrollLeft;
            }
        });
        return {
            taEl, hlEl, gutterEl, lightTheme, copied,
            highlighted, lineCount, charCount, gutterText,
            onInput, onScroll, onTab, doFormat, doCopy
        };
    }
};
</script>

<!--
  主题样式:非 scoped,全部 .ce-editor 前缀 + !important。
  深色(默认)与浅色(.ce-light)两组 CSS 变量,节点只引用变量 → 切换必然整体同步。
-->
<style>
/* ===== 主题变量 ===== */
.ce-editor {
    --ce-bg: #0d1117;         /* 代码区背景 */
    --ce-gutter-bg: #0d1117;  /* 行号栏背景 */
    --ce-gutter-fg: #6e7681;  /* 行号文字 */
    --ce-fg: #e6edf3;         /* 默认文字 */
    --ce-caret: #58a6ff;      /* 光标 */
    --ce-kw: #c678dd;         /* 关键字 */
    --ce-str: #98c379;        /* 字符串 */
    --ce-num: #d19a66;        /* 数字 */
    --ce-cmt: #8b949e;        /* 注释 */
    --ce-lit: #56b6c2;        /* 字面量 */
    --ce-bi: #79c0ff;         /* 内置 API */
    --ce-re: #e06c75;         /* 正则 */
}
.ce-editor.ce-light {
    --ce-bg: #ffffff;
    --ce-gutter-bg: #f6f8fa;
    --ce-gutter-fg: #8c959f;
    --ce-fg: #1f2328;
    --ce-caret: #0969da;
    --ce-kw: #cf222e;
    --ce-str: #0a3069;
    --ce-num: #0550ae;
    --ce-cmt: #6e7781;
    --ce-lit: #0550ae;
    --ce-bi: #8250df;
    --ce-re: #a40e26;
}

/* ===== 布局 ===== */
.ce-editor { display: flex; flex-direction: column; }
.ce-editor .ce-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 14px; border-bottom: 1px solid var(--van-gray-3, #ebedf0);
}
.ce-editor .ce-info { font-size: 11px; color: var(--van-gray-5, #969799); font-variant-numeric: tabular-nums; }
.ce-editor .ce-actions { display: flex; gap: 6px; }
.ce-editor .ce-body { display: flex; overflow: hidden; background: var(--ce-bg) !important; }
.ce-editor .ce-gutter {
    flex: 0 0 auto; min-width: 38px; padding: 12px 8px 12px 0;
    text-align: right; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.55;
    color: var(--ce-gutter-fg) !important; background: var(--ce-gutter-bg) !important;
    overflow: hidden; user-select: none; white-space: pre; box-sizing: border-box;
}
.ce-editor .ce-stage { position: relative; flex: 1; min-width: 0; }
.ce-editor .ce-highlight, .ce-editor .ce-input {
    position: absolute; inset: 0; margin: 0; padding: 12px 12px;
    font-family: 'Consolas', 'Monaco', 'SF Mono', monospace; font-size: 13px; line-height: 1.55;
    white-space: pre; overflow: auto; tab-size: 2;
    border: 0; border-radius: 0; box-sizing: border-box;
}
.ce-editor .ce-highlight {
    pointer-events: none; z-index: 1;
    color: var(--ce-fg) !important;
    background: transparent !important;
}
.ce-editor .ce-input {
    z-index: 2; color: transparent; caret-color: var(--ce-caret) !important; background: transparent !important;
    resize: none; outline: none; -webkit-text-fill-color: transparent;
}
.ce-editor .ce-input::selection {
    background: rgba(88, 166, 255, 0.45);
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff;
}
.ce-editor .ce-highlight::selection { background: rgba(88, 166, 255, 0.30); }

/* ===== 语法高亮 token(全部引用主题变量) ===== */
.ce-editor .ce-highlight .kw { color: var(--ce-kw) !important; font-weight: 600; }
.ce-editor .ce-highlight .str { color: var(--ce-str) !important; }
.ce-editor .ce-highlight .num { color: var(--ce-num) !important; }
.ce-editor .ce-highlight .cmt { color: var(--ce-cmt) !important; font-style: italic; }
.ce-editor .ce-highlight .lit { color: var(--ce-lit) !important; }
.ce-editor .ce-highlight .bi { color: var(--ce-bi) !important; }
.ce-editor .ce-highlight .re { color: var(--ce-re) !important; }
</style>
