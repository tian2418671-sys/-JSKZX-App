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

const safeSystemBars = () => {
    try { return import('@capacitor/core').then((m) => m.SystemBars).catch(() => null); }
    catch (e) { return Promise.resolve(null); }
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

export function applyTheme(theme) {
    const t = THEMES.includes(theme) ? theme : 'light';
    const root = document.documentElement;
    const oldTheme = root.getAttribute('data-theme');

    // 主题切换动画
    if (oldTheme && oldTheme !== t) {
        root.classList.add('theme-switching');
        setTimeout(() => { try { root.classList.remove('theme-switching'); } catch (e) {} }, 600);
    }
    root.classList.add('theme-transition');
    setTimeout(() => { try { root.classList.remove('theme-transition'); } catch (e) {} }, 400);

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
    safeSystemBars().then((SB) => {
        if (SB && SB.setStyle) SB.setStyle({ style: isDark ? 'DARK' : 'LIGHT' }).catch(() => {});
    });
    return t;
}

export function applyFs(fs) {
    const v = FS_MAP[fs] ? fs : 14;
    document.documentElement.style.setProperty('--ui-fs', FS_MAP[v]);
    document.documentElement.style.fontSize = FS_MAP[v];
    localStorage.setItem(FS_KEY, String(v));
    return v;
}

// 初始化主题字体和风格
export function initThemeStyle() {
    const t = currentTheme();
    const meta = THEME_META[t] || THEME_META.light;
    const root = document.documentElement;
    root.style.setProperty('--theme-font', meta.font);
    root.style.setProperty('--theme-radius', meta.radius);
    root.style.setProperty('--theme-deco', meta.deco);
    if (meta.deco) root.classList.add(`deco-${meta.deco}`);
}
