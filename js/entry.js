/**
 * SillyTavern 角色卡高级解析中心 - 前端入口（Vite）
 * 挂载 App.vue 根组件（全部界面与逻辑已迁入 SFC 结构）
 * M0：按运行环境分流挂载——
 *   ● Capacitor(Android WebView) → MobileApp 移动壳（4 Tab 骨架）
 *   ● Electron / 浏览器           → App.vue 桌面版
 */
import { createApp } from 'vue';

// 是否运行在 Capacitor 原生容器内（Android/iOS WebView）
// 预览调试开关：URL 带 ?mobile=1 或 localStorage 设 jsx_mobile_preview=1 时强制进入移动端界面（仅浏览器调试用，对 APK 实际运行零影响）
const forceMobile = typeof window !== 'undefined'
    && (new URLSearchParams(window.location.search).has('mobile')
        || window.localStorage.getItem('jsx_mobile_preview') === '1');
const isNative = forceMobile || (typeof window !== 'undefined'
    && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

/**
 * 🚀 启动提速：桌面/移动根组件改动态 import —— Vite 自动拆分为两个独立 chunk：
 *   - Android WebView 只下载解析移动壳链（MobileApp+Vant+路由），
 *     桌面 App.vue 及其依赖（ECharts 桌面用法/大量 composables）不进首屏包
 *   - 桌面同理不加载移动端代码
 * 原静态 import 会把两端全部代码打进同一主 chunk（约 1.9MB），中端机解析 2~4 秒
 */
async function boot() {
    const rootComponent = isNative
        ? (await import('./mobile/MobileApp.vue')).default
        : (await import('./components/App.vue')).default;
    const app = createApp(rootComponent);
    await registerPlatform(app);
    app.config.errorHandler = errorHandler;
    app.mount('#app');
}

// 移动端:注册路由与 Vant(桌面端保持原有行为,零影响)
// Vant/桥接仅移动端需要 → 随移动分支动态加载,桌面首屏不再携带
async function registerPlatform(app) {
    if (!isNative) return;
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
    console.error('[Vue 错误]', info, err);
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
