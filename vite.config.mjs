import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import VueDevTools from 'vite-plugin-vue-devtools';

// SillyTavern 角色卡管理器 - Vite 构建配置
// 使用函数形式按 command 区分：serve = 开发(可视化调试)，build = 生产(不带 devtools)
export default defineConfig(({ command }) => ({
  // 相对路径基准：兼容 Electron app:// 自定义协议加载构建产物（无需服务器）
  base: './',
  // 🖥️ 可视化开发：仅 dev server 启用 Vue DevTools（组件树/状态/事件面板），生产构建自动排除
  plugins: [vue(), ...(command === 'serve' ? [VueDevTools()] : [])],
  resolve: {
    alias: {
      // ⚠️ 关键：项目模板写在 index.html 的 DOM 内（非 SFC 字符串模板），
      // 必须使用 Vue 完整版（含运行时编译器），否则 createApp 挂载 DOM 模板会报错
      vue: 'vue/dist/vue.esm-bundler.js'
    }
  },
  build: {
    outDir: 'web', // 构建产物目录（供 Electron app:// 协议加载）
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome120',
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false
  }
}));
