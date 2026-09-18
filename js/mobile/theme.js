/**
 * 移动端主题与字号工具 — 完整主题风格系统
 * 每套主题不只是换色，而是包含：字体、圆角、阴影、边框、装饰、动画
 */
export const THEME_KEY = 'stc-theme';
export const FS_KEY = 'stc-ui-fs';

const THEMES = ['light', 'dark', 'slate', 'ancient', 'han', 'future', 'cyberpunk', 'ink'];
const DARK_THEMES = new Set(['dark', 'slate', 'han', 'future', 'cyberpunk']);
const FS_MAP = { 12: '12px', 14: '14px', 16: '16px' };

export const THEME_LABELS = {
    light: '白昼', dark: '暗夜', slate: '青灰',
    ancient: '古风', han: '汉风', future: '未来',
    cyberpunk: '赛博朋克', ink: '水墨',
};

// 主题元数据：字体、圆角、阴影、装饰特征、描述
export const THEME_META = {
    light:     { font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",                radius: '10px', deco: 'modern',     desc: '现代清爽，明亮通透' },
    dark:      { font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",                radius: '10px', deco: 'modern',     desc: '深邃暗色，护眼舒适' },
    slate:     { font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",                radius: '6px',  deco: 'industrial', desc: '工业冷灰，极简克制' },
    ancient:   { font: "'STKaiti', 'KaiTi', '楷体', 'STSong', 'SimSun', serif",                          radius: '6px',  deco: 'scroll',     desc: '羊皮纸卷，朱砂题字' },
    han:       { font: "'STSong', 'SimSun', '宋体', 'Noto Serif SC', serif",                              radius: '0px',  deco: 'seal',       desc: '汉风印章，庄重典雅' },
    future:    { font: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",                   radius: '14px', deco: 'scanline',   desc: '青霓虹光，数字未来' },
    cyberpunk: { font: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",                   radius: '0px',  deco: 'glitch',     desc: '故障艺术，赛博朋克' },
    ink:       { font: "'STKaiti', 'KaiTi', '楷体', 'Noto Serif SC', serif",                             radius: '4px',  deco: 'ink',        desc: '水墨宣纸，淡墨留白' },
};

/**
 * 把 SystemBars 插件安全交给回调消费。
 *
 * ⚠️ 绝不能把 Capacitor 插件代理作为 Promise 的「解决值」返回：
 *    Promise 解析时会读取 value.then 判定是否为 thenable，而插件代理会把 .then
 *    当成插件方法去调用，于是抛出
 *      "SystemBars.then()" is not implemented on android
 *    表现为启动时的未处理 Promise 异常（即使外面套了 .catch 也拦不住，因为异常
 *    发生在 then 回调的返回值被同化那一步）。
 *    所以这里在 then 回调内部直接消费插件对象，绝不把它传出去。
 *
 * @param {(sb:any)=>void} fn 拿到插件的回调（非 Capacitor 环境/模块缺失时不执行）
 */
const withSystemBars = (fn) => {
    try {
        import('@capacitor/core')
            .then((m) => { fn(m.SystemBars); })
            .catch(() => { /* 非 Capacitor 环境 / 模块缺失，忽略 */ });
    } catch (e) { /* 同步异常忽略 */ }
};

export function currentTheme() {
    const t = localStorage.getItem(THEME_KEY) || 'light';
    return THEMES.includes(t) ? t : 'light';
}

export function isDarkTheme(t) {
    return DARK_THEMES.has(t);
}

export function currentFs() {
    const v = parseInt(localStorage.getItem(FS_KEY) || '', 10);
    return FS_MAP[v] ? v : 14;
}

let themeProbed = false;

/** 核心主题切换（无动画包装，仅应用属性/类/变量） */
function applyThemeCore(theme) {
    const t = THEMES.includes(theme) ? theme : 'light';
    const root = document.documentElement;

    root.setAttribute('data-theme', t);
    const meta = THEME_META[t] || THEME_META.light;

    // 应用主题字体和风格变量
    root.style.setProperty('--theme-font', meta.font);
    root.style.setProperty('--theme-radius', meta.radius);
    root.style.setProperty('--theme-deco', meta.deco);

    const isDark = isDarkTheme(t);
    root.classList.toggle('van-theme-dark', isDark);
    root.classList.toggle('dark', isDark);

    // 主题装饰类
    root.classList.remove('deco-modern', 'deco-industrial', 'deco-scroll', 'deco-seal', 'deco-scanline', 'deco-glitch', 'deco-ink');
    if (meta.deco) root.classList.add(`deco-${meta.deco}`);

    if (document.body) {
        const bgMap = {
            dark: '#09090b', slate: '#0f172a', ancient: '#f5efe0', han: '#1a1410',
            future: '#0a1220', cyberpunk: '#0f0a1a', ink: '#f7f7f2', light: '#f7f8fa',
        };
        document.body.style.background = bgMap[t] || '#f7f8fa';
    }
    localStorage.setItem(THEME_KEY, t);
    withSystemBars((SB) => {
        if (SB && typeof SB.setStyle === 'function') {
            try {
                const r = SB.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } catch (e) { /* 插件调用失败不影响主题应用 */ }
        }
    });
    // P0 前置：首次应用时探测内核能力并输出（供调试面板/日志确认 OKLCH/View Transitions 可用性）
    if (!themeProbed) { themeProbed = true; probeThemeSupport(); }
    return t;
}

/**
 * 🚀 P1：主题切换入口——View Transitions 平滑切换 + CSS transition 降级。
 * - startViewTransition 存在且用户未开启减少动画 → 用 VT（期间禁用 CSS transition 防叠加）
 * - 否则 → CSS transition 降级动画（原有主题切换过渡，保留视觉效果）
 */
export function applyTheme(theme) {
    const root = document.documentElement;
    const oldTheme = root.getAttribute('data-theme');
    const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canVT = !reducedMotion && typeof document.startViewTransition === 'function' && oldTheme && oldTheme !== theme;

    if (canVT) {
        // VT 分支：禁用 CSS transition 防双重动画
        root.classList.remove('theme-transition', 'theme-switching');
        try {
            const vt = document.startViewTransition(() => { applyThemeCore(theme); });
            if (vt && typeof vt.finished?.then === 'function') {
                vt.finished.then(() => { try { root.classList.remove('theme-transition', 'theme-switching'); } catch (e) {} }).catch(() => {});
            }
            return theme;
        } catch (e) {
            // VT 内部异常 → 落到 CSS transition 降级
        }
    }
    // 降级：CSS transition 动画（保留主题切换过渡效果，兼容旧内核 / reduce-motion / 无起始主题）
    if (oldTheme && oldTheme !== theme) {
        root.classList.add('theme-switching');
        setTimeout(() => { try { root.classList.remove('theme-switching'); } catch (e) {} }, 600);
    }
    root.classList.add('theme-transition');
    setTimeout(() => { try { root.classList.remove('theme-transition'); } catch (e) {} }, 400);
    return applyThemeCore(theme);
}

export function applyFs(fs) {
    const v = FS_MAP[fs] ? fs : 14;
    document.documentElement.style.setProperty('--ui-fs', FS_MAP[v]);
    document.documentElement.style.fontSize = FS_MAP[v];
    localStorage.setItem(FS_KEY, String(v));
    return v;
}

// ---------- 初始化主题字体和风格 ----------
export function initThemeStyle() {
    const t = currentTheme();
    const meta = THEME_META[t] || THEME_META.light;
    const root = document.documentElement;
    root.style.setProperty('--theme-font', meta.font);
    root.style.setProperty('--theme-radius', meta.radius);
    root.style.setProperty('--theme-deco', meta.deco);
    if (meta.deco) root.classList.add(`deco-${meta.deco}`);
}

// ---------- 内核/特性探测（P0 前置：确认 OKLCH / View Transitions 可用性） ----------
export function probeThemeSupport() {
    const startVT = typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
    let oklch = false;
    try { oklch = CSS.supports && CSS.supports('color', 'oklch(50% 0.1 200)'); } catch (e) { /* 旧浏览器不支持 CSS.supports */ }
    const vtPrefersReducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const result = { startViewTransition: startVT, oklch, vtPrefersReducedMotion };
    console.log('[ThemeProbe]', JSON.stringify(result));
    return result;
}
