/**
 * 移动端主题与字号工具
 * 主题：白昼 light / 暗夜 dark / 青灰 slate（对齐桌面 data-theme 三主题语义）
 * 深色系：html 加 van-theme-dark（Vant 4 官方暗色变量类）+ dark（Tailwind dark:）
 * 浅色：全部移除；青灰 slate 为深蓝灰深色系，同样加 dark 类并叠加 slate 变量覆盖
 * 字号：--ui-fs 根字号（对齐桌面字号系统），html font-size 跟随
 * 主题切换联动原生系统栏（Capacitor SystemBars，Web/Electron no-op）
 */
export const THEME_KEY = 'stc-theme';
export const FS_KEY = 'stc-ui-fs';

const THEMES = ['dark', 'slate', 'light'];
const FS_MAP = { 12: '12px', 14: '14px', 16: '16px' };

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

export function currentFs() {
    const v = parseInt(localStorage.getItem(FS_KEY) || '', 10);
    return FS_MAP[v] ? v : 14;
}

export function applyTheme(theme) {
    const t = THEMES.includes(theme) ? theme : 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    const isDark = t !== 'light';
    root.classList.toggle('van-theme-dark', isDark);
    root.classList.toggle('dark', isDark);
    if (document.body) {
        document.body.style.background = t === 'dark' ? '#09090b' : (t === 'slate' ? '#0f172a' : '#f7f8fa');
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
