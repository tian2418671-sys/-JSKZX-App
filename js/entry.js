/**
 * SillyTavern 角色卡高级解析中心 - 前端入口（Vite）
 * 挂载 App.vue 根组件（全部界面与逻辑已迁入 SFC 结构）
 */
import { createApp } from 'vue';
import App from './components/App.vue';

const app = createApp(App);

// Vue 全局错误兜底（原 js/app.js 末尾逻辑，迁移至此）
app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue 错误]', info, err);
    // 🔔 统一错误兜底提示（代码审查修复 6）：渲染层异常时给出用户可见提示
    try {
        window.__vueErrorTips?.('发生未预期错误，请查看控制台（F12）。');
    } catch (e) { /* 忽略 */ }
};

// 🛡️ 全局 error / unhandledrejection 兜底（代码审查修复 6）
window.addEventListener('error', (e) => {
    console.error('[全局错误]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[未处理 Promise]', e.reason);
});

app.mount('#app');
