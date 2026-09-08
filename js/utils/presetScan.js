/**
 * 预设通用扫描(移动端预设详情页"插件"Tab 数据源,零依赖纯函数)
 * 目标:不依赖白名单,任何酒馆预设里任意位置的脚本与扩展数据都能被发现——
 *   - scripts    :全树递归扫描"像 JS 脚本"的字符串字段(排除已知正则字段与提示词,避免与正则 Tab 重复)
 *   - extEntries :extensions 下全部键的树状枚举(含未知插件键),每项给出类型/体积/预览
 * 这样新预设无需逐个适配:SPreset/RegexBinding/MacroNest/ToolBindings/任意自定义插件键全部可见。
 */

/** 深度上限(防极端嵌套) */
const MAX_DEPTH = 6;
/** 每层最多枚举的键数(防超大对象爆列表) */
const MAX_KEYS_PER_LEVEL = 200;

/** JS 脚本特征:代码关键字/API 使用(不强求 <script> 标签,纯 JS 片段也认;无标签时需足够长度防误判) */
export function looksLikeScript(s) {
    if (typeof s !== 'string' || s.length < 40) return false;
    const head = s.slice(0, 3000);
    const hasJs = /(function\s*\(|function\s+\w|=>\s*\{|var\s+\w+\s*=|let\s+\w+\s*=|const\s+\w+\s*=|document\.|window\.|addEventListener|setInterval|setTimeout|new\s+Promise|XMLHttpRequest|fetch\s*\()/i.test(head);
    const hasTag = /<script/i.test(head);
    // 有 <script> 标签:标签本身即强特征;无标签:需长度 ≥120 防普通长文本误判
    return (hasTag || s.length >= 120) && hasJs;
}

/** 已知的正则字段路径(其内容归"正则 Tab"管理,通用扫描跳过避免重复) */
function isRegexField(key) {
    return key === 'replaceString' || key === 'findRegex' || key === 'replace_string' || key === 'find_regex';
}

/** 已知的脚本容器(由"预设脚本"区单独管理) */
function isKnownScriptContainer(key) {
    return key === 'scripts';
}

/** 跳过路径:prompts 等由其他 Tab 展示的字段 */
function shouldSkipKey(key) {
    return key === 'prompts' || key === 'prompt_order' || key === '_uid';
}

function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    const t = typeof v;
    if (t === 'object') return 'object';
    return t;
}

function sizeOf(v) {
    if (typeof v === 'string') return v.length;
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    return 1;
}

/**
 * 递归扫描预设数据。
 * @param {object} data 预设 JSON 本体
 * @returns {{ scripts: Array, extEntries: Array }}
 *   scripts:    [{ path, name, size, content }] path 如 extensions.SPreset.Foo.code
 *   extEntries: [{ path, name, type, size, preview }] extensions 下全部键(树平铺,path 点分)
 */
export function scanPresetData(data) {
    const scripts = [];
    const extEntries = [];

    function walk(node, path, depth, inExtensions) {
        if (node === null || node === undefined) return;
        if (depth > MAX_DEPTH) return;
        const t = typeOf(node);
        if (t === 'string') {
            if (looksLikeScript(node)) {
                // 名称取路径末段
                const segs = path.split('.');
                const name = segs[segs.length - 1] || '脚本';
                scripts.push({ path, name, size: node.length, content: node });
            }
            return;
        }
        if (t === 'array') {
            node.forEach((v, i) => walk(v, path + '[' + i + ']', depth + 1, inExtensions));
            return;
        }
        if (t === 'object') {
            let count = 0;
            for (const k of Object.keys(node)) {
                if (count++ >= MAX_KEYS_PER_LEVEL) break;
                if (shouldSkipKey(k)) continue;
                const np = path ? path + '.' + k : k;
                const v = node[k];
                // 已知正则字段:记录进 extEntries 但不继续向下扫脚本(避免与正则 Tab 重复展示大模板)
                if (isRegexField(k)) {
                    continue;
                }
                // 已由"预设脚本"区单独管理的容器:内容不再向下扫
                if (isKnownScriptContainer(k) && inExtensions) {
                    continue;
                }
                walk(v, np, depth + 1, inExtensions || path === 'extensions' || path.startsWith('extensions.'));
            }
        }
    }

    // ① 脚本扫描:整卡范围(排除 prompts),从根开始
    if (data && typeof data === 'object') {
        for (const k of Object.keys(data)) {
            if (shouldSkipKey(k)) continue;
            if (k === 'extensions') {
                // extensions 子树:跳过正则字段与 tavern_helper.scripts(单独管理)
                const ext = data.extensions;
                if (ext && typeof ext === 'object') {
                    for (const ek of Object.keys(ext)) {
                        if (ek === 'regex_scripts') continue; // 正则 Tab 已展示
                        walk(ext[ek], 'extensions.' + ek, 1, true);
                    }
                }
            } else if (k !== 'data') {
                walk(data[k], k, 1, false);
            }
        }
    }

    // ② 扩展数据枚举:extensions 全树(所有键,含未知插件键,不跳过正则字段)
    function enumTree(node, path, depth) {
        if (node === null || node === undefined) return;
        if (depth > MAX_DEPTH) return;
        const t = typeOf(node);
        if (t !== 'object' && t !== 'array') {
            extEntries.push({
                path,
                name: path.split('.').pop() || path,
                type: t,
                size: sizeOf(node),
                preview: t === 'string' ? String(node).slice(0, 120) : String(node)
            });
            return;
        }
        const entries = t === 'array' ? node.map((v, i) => [String(i), v]) : Object.entries(node);
        let count = 0;
        for (const [k, v] of entries) {
            if (count++ >= MAX_KEYS_PER_LEVEL) break;
            if (shouldSkipKey(k) || k === '_uid') continue;
            const np = path ? path + '.' + k : k;
            const vt = typeOf(v);
            if (vt === 'object' || vt === 'array') {
                extEntries.push({
                    path: np,
                    name: k,
                    type: vt,
                    size: sizeOf(v),
                    preview: ''
                });
                enumTree(v, np, depth + 1);
            } else {
                extEntries.push({
                    path: np,
                    name: k,
                    type: vt,
                    size: sizeOf(v),
                    preview: vt === 'string' ? String(v).slice(0, 120) : String(v)
                });
            }
        }
    }
    if (data && data.extensions && typeof data.extensions === 'object') {
        extEntries.push({ path: 'extensions', name: 'extensions', type: 'object', size: Object.keys(data.extensions).length, preview: '' });
        enumTree(data.extensions, 'extensions', 1);
    }

    return { scripts, extEntries };
}
