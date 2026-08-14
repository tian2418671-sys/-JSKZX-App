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
};

app.mount('#app');
