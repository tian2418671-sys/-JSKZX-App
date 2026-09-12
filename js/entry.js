/**
 * SillyTavern 角色卡高级解析中心 - 移动版前端入口（Vite / Capacitor）
 * 挂载 MobileApp.vue 移动壳（4 Tab 骨架）
 * 🚀 移动版专用：入口只加载移动壳链（MobileApp+Vant+路由），单一 chunk 无桌面代码
 */
import { createApp } from 'vue';

// 预览调试开关：URL 带 ?mobile=1 或 localStorage 设 jsx_mobile_preview=1 时强制进入移动端界面（仅浏览器调试用，对 APK 实际运行零影响）
const forceMobile = typeof window !== 'undefined'
    && (new URLSearchParams(window.location.search).has('mobile')
        || window.localStorage.getItem('jsx_mobile_preview') === '1');
const isNative = forceMobile || (typeof window !== 'undefined'
    && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

async function boot() {
    // 🚀 移动版：始终挂载移动壳（浏览器预览也走移动端界面）
    const rootComponent = (await import('./mobile/MobileApp.vue')).default;
    const app = createApp(rootComponent);
    await registerPlatform(app);
    app.config.errorHandler = errorHandler;
    app.mount('#app');
    // 🚀 后台保活(Bug 反馈#2):应用启动(前台)即拉起前台服务,WakeLock 防切后台被杀;
    // 用户可在设置页关闭;浏览器预览/非原生环境静默跳过。读取 AppConfig 持久化开关。
    maybeAutoStartKeepAlive();
}

/** 按持久化开关启动保活(默认开;设置页可关) */
async function maybeAutoStartKeepAlive() {
    if (!isNative) return;
    try {
        const { androidImpl, keepAlive } = await import('./bridge/android');
        const cfg = await androidImpl.loadAppConfig().catch(() => null);
        const enabled = cfg && cfg.keepAlive !== undefined ? !!cfg.keepAlive : true;
        if (enabled) await keepAlive.start();
    } catch (e) { /* 保活启动失败不影响主流程 */ }
}

// 移动端:注册路由与 Vant + Android 桥接
async function registerPlatform(app) {
    const [{ default: Vant }, { default: router }, { androidImpl }] = await Promise.all([
        import('vant'),
        import('./mobile/router'),
        import('./bridge/android')
    ]);
    await import('vant/lib/index.css');
    // 注入桥接:渲染层所有 window.electronAPI.xxx 调用在 Android 上自动命中等价实现
    window.electronAPI = androidImpl;
    app.use(router);
    app.use(Vant);

    // 长按手势(任意元素):触屏 500ms 触发;触发后抑制随后的 click,避免误入详情页
    app.directive('longpress', {
        mounted(el, binding) {
            const value = typeof binding.value === 'function' ? binding.value : null;
            let timer = null;
            let fired = false;
            let sx = 0;
            let sy = 0;
            const clear = () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            };
            const onStart = (e) => {
                const t = e.changedTouches && e.changedTouches[0];
                if (t) {
                    sx = t.clientX;
                    sy = t.clientY;
                }
                clear();
                timer = setTimeout(() => {
                    fired = true;
                    // 触觉反馈:长按触发时轻震一下,提示手势已被识别
                    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                        try { navigator.vibrate(15); } catch (err) { /* 忽略设备不支持 */ }
                    }
                    if (value) value(e);
                    setTimeout(() => { fired = false; }, 700);
                }, 500);
            };
            const onMove = (e) => {
                const t = e.changedTouches && e.changedTouches[0];
                if (t && (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)) clear();
            };
            const onEnd = () => clear();
            const onClick = (e) => {
                if (fired) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            el.addEventListener('touchstart', onStart, { passive: true });
            el.addEventListener('touchmove', onMove, { passive: true });
            el.addEventListener('touchend', onEnd, { passive: true });
            el.addEventListener('click', onClick, true);
            el.__lpCleanup = () => {
                clear();
                el.removeEventListener('touchstart', onStart);
                el.removeEventListener('touchmove', onMove);
                el.removeEventListener('touchend', onEnd);
                el.removeEventListener('click', onClick, true);
            };
        },
        unmounted(el) {
            if (el.__lpCleanup) el.__lpCleanup();
        }
    });
}

// Vue 全局错误兜底（原 js/app.js 末尾逻辑，迁移至此）
function errorHandler(err, _instance, info) {
    // 🩺 诊断增强：带上组件名与堆栈，便于定位渲染崩溃源
    const compName = _instance?.$options?.name || _instance?.type?.name || _instance?.type?.__name || '(匿名组件)';
    console.error('[Vue 错误]', info, '| 组件:', compName, '|', err && err.message, '\n', err && err.stack);
    // 🔔 统一错误兜底提示（代码审查修复 6）：渲染层异常时给出用户可见提示
    try {
        window.__vueErrorTips?.('发生未预期错误，请查看控制台（F12）。');
    } catch (e) { /* 忽略 */ }
}

// 🛡️ 全局 error / unhandledrejection 兜底（代码审查修复 6）
window.addEventListener('error', (e) => {
    console.error('[全局错误]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[未处理 Promise]', e.reason);
});

boot();
