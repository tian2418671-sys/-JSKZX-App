/**
 * 移动端双主题工具(浅色/深色)
 * 深色:html 同时加 theme-dark(Vant 变量)与 dark(Tailwind dark:) 两个类
 * 选择持久化在 localStorage,同时由设置页写入 app_config(桌面端共享,后置)
 * 主题切换时联动原生系统栏(状态栏/导航栏)图标深浅色(Android 由 Capacitor SystemBars 实现)
 */
export const THEME_KEY = 'stc-theme';

const safeSystemBars = () => {
    try {
        // SystemBars 仅在 Capacitor 环境生效;Web/Electron 环境为 no-op,失败静默
        return import('@capacitor/core').then((m) => m.SystemBars).catch(() => null);
    } catch (e) {
        return Promise.resolve(null);
    }
};

export function currentTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
}

export function applyTheme(theme) {
    const t = theme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    if (t === 'dark') {
        root.classList.add('theme-dark');
        root.classList.add('dark');
    } else {
        root.classList.remove('theme-dark');
        root.classList.remove('dark');
    }
    if (document.body) document.body.style.background = t === 'dark' ? '#09090b' : '#f7f8fa';
    localStorage.setItem(THEME_KEY, t);
    safeSystemBars().then((SB) => {
        if (SB && SB.setStyle) SB.setStyle({ style: t === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
    });
    return t;
}