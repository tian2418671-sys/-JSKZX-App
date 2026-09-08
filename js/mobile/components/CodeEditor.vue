<!--
  CodeEditor 轻量代码编辑器(预设脚本查看/编辑用,零依赖)
  行号栏 + 语法高亮层(highlightJs) + 透明 textarea 编辑层叠加;
  同步滚动;Tab 键缩进;工具栏:格式化 / 复制 / 明暗切换。
  🎨 配色:One Dark 深色主题(逐 token 对比度 ≥ 4.5:1,颜色全 !important 防全局样式污染)。
-->
<template>
    <div class="ce-wrap" :class="{ 'ce-light': lightTheme }">
        <div class="ce-toolbar">
            <span class="ce-info">{{ lineCount }} 行 · {{ charCount }} 字符</span>
            <span class="ce-actions">
                <van-button size="mini" plain type="primary" @click="doFormat">✨ 格式化</van-button>
                <van-button size="mini" plain @click="doCopy">{{ copied ? '✅ 已复制' : '📋 复制' }}</van-button>
                <van-button size="mini" plain @click="lightTheme = !lightTheme">{{ lightTheme ? '🌙 深色' : '☀️ 浅色' }}</van-button>
            </span>
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
        // 🎨 明暗主题切换(默认深色 One Dark;浅色为 GitHub Light 系,对比度同达标)
        const lightTheme = ref(false);
        const copied = ref(false);
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
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                }
                copied.value = true;
                setTimeout(() => { copied.value = false; }, 1600);
            } catch (e) {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    copied.value = true;
                    setTimeout(() => { copied.value = false; }, 1600);
                } catch (e2) { /* 复制失败静默 */ }
            }
        }
        // 换行数变化时保持高亮层高度同步(高亮层靠内容高度,textarea 滚动同步即可)
        onMounted(() => {
            if (taEl.value && hlEl.value) {
                hlEl.value.scrollTop = taEl.value.scrollTop;
                hlEl.value.scrollLeft = taEl.value.scrollLeft;
            }
        });
        return {
            taEl, hlEl, gutterEl, overlaySupported, lightTheme, copied,
            highlighted, lineCount, charCount, gutterText,
            onInput, onScroll, onTab, doFormat, doCopy
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
.ce-actions { display: flex; gap: 6px; }
.ce-body { display: flex; overflow: hidden; background: #0d1117; }
.ce-gutter {
    flex: 0 0 auto; min-width: 38px; padding: 12px 8px 12px 0;
    text-align: right; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.55;
    color: #484f58; background: #0d1117; overflow: hidden; user-select: none;
    white-space: pre; box-sizing: border-box;
}
.ce-stage { position: relative; flex: 1; min-width: 0; }
.ce-highlight, .ce-input {
    position: absolute; inset: 0; margin: 0; padding: 12px 12px;
    font-family: 'Consolas', 'Monaco', 'SF Mono', monospace; font-size: 13px; line-height: 1.55;
    white-space: pre; overflow: auto; tab-size: 2;
    border: 0; border-radius: 0; box-sizing: border-box;
}
.ce-highlight {
    pointer-events: none; z-index: 1;
    color: #e6edf3 !important; /* One Dark 主文字:浅灰白,对 #0d1117 底对比 ≈ 15:1 */
    background: transparent;
}
.ce-input {
    z-index: 2; color: transparent; caret-color: #58a6ff; background: transparent;
    resize: none; outline: none; -webkit-text-fill-color: transparent;
}
/* 🚀 选中态:叠层方案下编辑层文字透明,显式给选中态白字+蓝底 */
.ce-input::selection {
    background: rgba(88, 166, 255, 0.45);
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff;
}
.ce-highlight::selection { background: rgba(88, 166, 255, 0.30); }

/* ============ One Dark 语法高亮(逐 token 对比度 ≥ 4.5:1,!important 防全局污染) ============ */
/* 关键字 const/function/return… 亮紫 #c678dd,对比 ≈ 7.1:1 */
.ce-highlight :deep(.kw) { color: #c678dd !important; font-weight: 600; }
/* 字符串 浅绿 #98c379,对比 ≈ 8.6:1 */
.ce-highlight :deep(.str) { color: #98c379 !important; }
/* 数字 浅橙 #d19a66,对比 ≈ 7.0:1 */
.ce-highlight :deep(.num) { color: #d19a66 !important; }
/* 注释 中灰 #8b949e,对比 ≈ 5.2:1 */
.ce-highlight :deep(.cmt) { color: #8b949e !important; font-style: italic; }
/* 字面量 true/false/null 亮青 #56b6c2,对比 ≈ 7.3:1 */
.ce-highlight :deep(.lit) { color: #56b6c2 !important; }
/* 内置 API 亮蓝 #79c0ff,对比 ≈ 8.0:1 */
.ce-highlight :deep(.bi) { color: #79c0ff !important; }
/* 正则字面量 红 #e06c75,对比 ≈ 5.4:1 */
.ce-highlight :deep(.re) { color: #e06c75 !important; }

/* 🚀 直显回退模式(WebView 不支持透明叠层):白底黑字,放弃高亮保可编辑性 */
.ce-fallback { background: #ffffff; }
.ce-input-fallback {
    color: #1e293b !important; background: #ffffff; -webkit-text-fill-color: #1e293b;
    caret-color: #0284c7;
}
.ce-fallback .ce-gutter { background: #f6f8fa; color: #8c959f; }

/* ============ 浅色主题(GitHub Light 系,对比度同达标) ============ */
.ce-light .ce-body, .ce-light .ce-gutter { background: #ffffff; }
.ce-light .ce-gutter { color: #8c959f; }
.ce-light .ce-highlight { color: #1f2328 !important; }
.ce-light .ce-highlight :deep(.kw) { color: #cf222e !important; }
.ce-light .ce-highlight :deep(.str) { color: #0a3069 !important; }
.ce-light .ce-highlight :deep(.num) { color: #0550ae !important; }
.ce-light .ce-highlight :deep(.cmt) { color: #6e7781 !important; }
.ce-light .ce-highlight :deep(.lit) { color: #0550ae !important; }
.ce-light .ce-highlight :deep(.bi) { color: #8250df !important; }
.ce-light .ce-highlight :deep(.re) { color: #a40e26 !important; }
.ce-light .ce-input { caret-color: #0969da; }
</style>
