/**
 * 移动端路由（M0 壳骨架）
 * ⚠️ 使用 Hash 模式：Capacitor WebView 以 file:// 加载构建产物，history 模式无法定位页面
 */
import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
    { path: '/', name: 'library', component: () => import('./views/CardLibraryView.vue'), meta: { title: '卡片库' } },
    { path: '/card', name: 'cardDetail', component: () => import('./views/CardDetailView.vue'), meta: { title: '卡片详情', tabbar: false } },
    { path: '/worldbook', name: 'worldbook', component: () => import('./views/WorldbookView.vue'), meta: { title: '世界书' } },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/scan', name: 'scan', component: () => import('./views/DiskScanView.vue'), meta: { title: '磁盘扫描', tabbar: false } },
    { path: '/presets', name: 'presets', component: () => import('./views/PresetsView.vue'), meta: { title: '预设管理', tabbar: false } }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;