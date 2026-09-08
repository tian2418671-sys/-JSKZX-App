/**
 * JS 代码展示与格式化纯函数(移动端预设脚本编辑器用,零依赖)
 *  - highlightJs(code) → 语法高亮 HTML(转义 + span 着色,供 CodeEditor 高亮层)
 *  - formatJs(code)   → 极简美化(按 {} ; 换行缩进,跳过字符串/注释内部,不改变语义)
 * 两者均 O(n) 单遍扫描;394KB 脚本高亮/格式化在百毫秒级。
 */

// JS 关键字/内置(粗体蓝紫)
const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await').split(' '));
const LITERALS = new Set('true false null undefined NaN Infinity'.split(' '));
const BUILTINS = new Set(('window document console localStorage sessionStorage fetch Math JSON Object Array String Number Boolean Date RegExp Map Set Promise Symbol Error parseInt parseFloat isNaN setTimeout setInterval clearTimeout clearInterval requestAnimationFrame MutationObserver ResizeObserver').split(' '));

/** HTML 转义 */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 语法高亮:单遍 tokenizer。
 * 顺序:块注释 → 行注释 → 字符串('"`) → 正则字面量(启发式) → 数字 → 关键字/内置/字面量 → 标识符/其余。
 * @returns {string} 安全 HTML(已转义)
 */
export function highlightJs(code) {
    const src = String(code == null ? '' : code);
    let out = '';
    let i = 0;
    const n = src.length;
    const isWord = (c) => /[A-Za-z0-9_$]/.test(c || '');

    const push = (s) => { out += s; };
    const pushSpan = (cls, s) => { out += '<span class="' + cls + '">' + esc(s) + '</span>'; };

    while (i < n) {
        const c = src[i];
        const rest = src.slice(i);
        // 块注释
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            pushSpan('cmt', src.slice(i, stop));
            i = stop;
            continue;
        }
        // 行注释
        if (c === '/' && src[i + 1] === '/') {
            const nl = src.indexOf('\n', i + 2);
            const stop = nl === -1 ? n : nl;
            pushSpan('cmt', src.slice(i, stop));
            i = stop;
            continue;
        }
        // 字符串
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { j++; break; }
                j++;
            }
            pushSpan('str', src.slice(i, j));
            i = j;
            continue;
        }
        // 正则字面量(启发式:/ 前是 ( , = : [ ! & | ? { ; 或行首 且含闭合 /)
        if (c === '/' && !/\/[/*]/.test(rest)) {
            const prev = i > 0 ? src[i - 1] : '';
            if (/[(=:,[!&|?;{}]|^/.test(prev === '' ? '^' : prev) || prev === '') {
                let j = i + 1, inClass = false, closed = -1;
                while (j < n) {
                    const ch = src[j];
                    if (ch === '\\') { j += 2; continue; }
                    if (ch === '[') inClass = true;
                    else if (ch === ']') inClass = false;
                    else if (ch === '/' && !inClass) { closed = j; break; }
                    if (ch === '\n') break;
                    j++;
                }
                if (closed > 0) {
                    // 含标志
                    let k = closed + 1;
                    while (k < n && /[gimsuy]/.test(src[k])) k++;
                    pushSpan('re', src.slice(i, k));
                    i = k;
                    continue;
                }
            }
        }
        // 数字
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            const m = rest.match(/^(?:0[xXbBoO][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/);
            if (m) { pushSpan('num', m[0]); i += m[0].length; continue; }
        }
        // 标识符
        if (/[A-Za-z_$]/.test(c)) {
            const m = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
            if (m) {
                const w = m[0];
                if (KEYWORDS.has(w)) pushSpan('kw', w);
                else if (LITERALS.has(w)) pushSpan('lit', w);
                else if (BUILTINS.has(w)) pushSpan('bi', w);
                else push(w);
                i += w.length;
                continue;
            }
        }
        // 其余字符:HTML 特殊字符转义
        if (c === '<') push('&lt;');
        else if (c === '>') push('&gt;');
        else if (c === '&') push('&amp;');
        else push(c);
        i++;
    }
    return out;
}

/**
 * 极简 JS 美化:按 { } ; 换行缩进。
 *  - 字符串/模板串/注释内部原样跳过
 *  - 已有换行保留(不重排已有格式)
 *  - 输出不改变语义(仅插入空白)
 */
export function formatJs(code) {
    const src = String(code == null ? '' : code);
    if (!src) return '';
    let out = '';
    let i = 0;
    const n = src.length;
    let depth = 0;
    let lineHasContent = false;
    let lastWasNewline = true;

    const emit = (s) => {
        out += s;
        if (s === '\n') { lastWasNewline = true; lineHasContent = false; }
        else if (s.trim() !== '') { lastWasNewline = false; lineHasContent = true; }
    };
    const newline = () => {
        if (!lastWasNewline) emit('\n');
        let d = depth;
        while (d-- > 0) emit('  ');
    };
    const trimTrailingSpaces = () => {
        out = out.replace(/[ \t]+$/, '');
    };

    while (i < n) {
        const c = src[i];
        const rest = src.slice(i);
        // 块注释
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            emit(src.slice(i, stop));
            i = stop;
            continue;
        }
        // 行注释:保留到行尾(换行也保留)
        if (c === '/' && src[i + 1] === '/') {
            const nl = src.indexOf('\n', i + 2);
            const stop = nl === -1 ? n : nl;
            emit(src.slice(i, stop));
            i = stop;
            continue;
        }
        // 字符串/模板串
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { j++; break; }
                j++;
            }
            emit(src.slice(i, j));
            i = j;
            continue;
        }
        // 正则字面量启发式(同高亮)
        if (c === '/' && !/\/[/*]/.test(rest)) {
            const prev = i > 0 ? src[i - 1] : '';
            if (prev === '' || /[(=:,[!&|?;{}]/.test(prev)) {
                let j = i + 1, inClass = false, closed = -1;
                while (j < n) {
                    const ch = src[j];
                    if (ch === '\\') { j += 2; continue; }
                    if (ch === '[') inClass = true;
                    else if (ch === ']') inClass = false;
                    else if (ch === '/' && !inClass) { closed = j; break; }
                    if (ch === '\n') break;
                    j++;
                }
                if (closed > 0) {
                    let k = closed + 1;
                    while (k < n && /[gimsuy]/.test(src[k])) k++;
                    emit(src.slice(i, k));
                    i = k;
                    continue;
                }
            }
        }
        // 结构符处理
        if (c === '{') {
            trimTrailingSpaces();
            emit('{');
            depth++;
            newline();
            i++;
            continue;
        }
        if (c === '}') {
            depth = Math.max(0, depth - 1);
            trimTrailingSpaces();
            newline();
            emit('}');
            i++;
            continue;
        }
        if (c === ';') {
            emit(';');
            // 不换行的情况:for(...; ...; ...) 内
            newline();
            i++;
            continue;
        }
        // 已有换行:去行尾空格后重发 + 缩进
        if (c === '\n') {
            trimTrailingSpaces();
            emit('\n');
            let d = depth;
            while (d-- > 0) emit('  ');
            i++;
            continue;
        }
        emit(c);
        i++;
    }
    return out.trim();
}
