/**
 * 移动端主题与字号工具
 * 主题（data-theme 语义）：
 *   白昼 light / 暗夜 dark / 青灰 slate（对齐桌面三主题）
 *   + 古风 ancient / 汉风 han / 未来 future / 赛博朋克 cyberpunk / 水墨 ink（用户扩展）
 * 深色系：html 加 van-theme-dark（Vant 4 官方暗色变量类）+ dark（Tailwind dark:）
 * 浅色系：全部移除
 * 字号：--ui-fs 根字号（对齐桌面字号系统），html font-size 跟随
 * 主题切换联动原生系统栏（Capacitor SystemBars，Web/Electron no-op）
 */
export const THEME_KEY = 'stc-theme';
export const FS_KEY = 'stc-ui-fs';

const THEMES = ['light', 'dark', 'slate', 'ancient', 'han', 'future', 'cyberpunk', 'ink'];
// 深色主题集合（决定是否加 van-theme-dark + 原生系统栏 DARK）
const DARK_THEMES = new Set(['dark', 'slate', 'han', 'future', 'cyberpunk']);
const FS_MAP = { 12: '12px', 14: '14px', 16: '16px' };

// 主题中文名（设置页展示用）
export const THEME_LABELS = {
    light: '白昼',
    dark: '暗夜',
    slate: '青灰',
    ancient: '古风',
    han: '汉风',
    future: '未来',
    cyberpunk: '赛博朋克',
    ink: '水墨',
};

const safeSystemBars = () => {
    try {
        // SystemBars 仅在 Capacitor 环境生效；Web/Electron 环境为 no-op，失败静默
        return import('@capacitor/core').then((m) => m.SystemBars).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
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
    // 短暂加过渡类，让背景/文字颜色渐变（切换后移除，避免拖慢滚动性能）
    root.classList.add('theme-transition');
    setTimeout(() => { try { root.classList.remove('theme-transition'); } catch (e) { /* 忽略 */ } }, 350);
    root.setAttribute('data-theme', t);
    const isDark = isDarkTheme(t);
    root.classList.toggle('van-theme-dark', isDark);
    root.classList.toggle('dark', isDark);
    if (document.body) {
        const bgMap = {
            dark: '#09090b',
            slate: '#0f172a',
            ancient: '#f5efe0',
            han: '#1a1410',
            future: '#0a1220',
            cyberpunk: '#0f0a1a',
            ink: '#f7f7f2',
            light: '#f7f8fa',
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
