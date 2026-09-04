<!--
  MobileApp 移动端壳
  底部 3 Tab 导航：卡片库 / 世界书 / 设置
  聊天测卡与桌面版一致，不设独立主界面，而是作为角色卡详情页内置「测卡」Tab
  页面主体由 <router-view> 按路由填充；Tab 高亮与切换由 Vant Tabbar(route 模式)接管
  全屏页(如卡片详情 route.meta.tabbar=false)自动隐藏底部导航
-->
<template>
    <div class="mobile-shell">
        <router-view v-slot="{ Component }">
            <keep-alive include="CardLibraryView,WorldbookView,PresetsView,SettingsView">
                <component :is="Component" />
            </keep-alive>
        </router-view>
        <van-tabbar v-if="showTabbar" route safe-area-inset-bottom class="mobile-tabbar">
            <van-tabbar-item replace to="/" icon="apps-o">卡片库</van-tabbar-item>
            <van-tabbar-item replace to="/worldbook" icon="bookmark-o">世界书</van-tabbar-item>
            <van-tabbar-item replace to="/presets" icon="apps-o">预设</van-tabbar-item>
            <van-tabbar-item replace to="/settings" icon="setting-o">设置</van-tabbar-item>
        </van-tabbar>
    </div>
</template>

<script>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { applyTheme, currentTheme, currentFs, applyFs } from './theme';
import './theme-mobile-app.css';

export default {
    name: 'MobileApp',
    setup() {
        const route = useRoute();
        const showTabbar = computed(() => route.meta.tabbar !== false);
        onMounted(() => {
            // 启动即应用已保存主题(M2→F组三主题)与字号(F组)
            applyTheme(currentTheme());
            applyFs(currentFs());
        });
        return { showTabbar };
    }
};
</script>

<style>
/* =========================================================
   🎨 三主题变量 (白昼 light / 暗夜 dark / 青灰 slate，对齐桌面)
   深色系由 van-theme-dark 提供基础；slate 在其上叠加蓝灰色调
   ========================================================= */
:root {
    --ui-fs: 14px;
}
/* 深色基底主色（供 dark 主题使用；须置于所有 data-theme 主题之前，
   否则同等特异性下会覆盖 han/future/cyberpunk 等深色主题的自定义主色） */
html.van-theme-dark {
    --van-button-primary-background: #6366f1;
    --van-button-primary-border-color: #6366f1;
    --van-primary-color: #6366f1;
}
/* 主题切换平滑过渡：背景/文字颜色渐变动画 */
html.theme-transition,
html.theme-transition body,
html.theme-transition .mobile-shell,
html.theme-transition .van-nav-bar,
html.theme-transition .van-tabbar,
html.theme-transition .van-cell,
html.theme-transition .van-popup {
    transition: background-color .3s ease, color .3s ease, border-color .3s ease;
}
html[data-theme="slate"] {
    --van-background: #0f172a;
    --van-background-2: #1e293b;
    --van-gray-3: #334155;
    --van-gray-2: #1e293b;
    --van-gray-1: #0f172a;
    --van-text-color: #f8fafc;
    --van-text-color-2: #94a3b8;
    --van-text-color-3: #64748b;
    --van-cell-background: #1e293b;
    --van-nav-bar-background: #0f172a;
    --van-nav-bar-title-text-color: #f8fafc;
    --van-nav-bar-icon-color: #94a3b8;
    --van-tabbar-background: #1e293b;
    --van-tabbar-item-text-color: #94a3b8;
    --van-tabbar-item-active-background: #1e293b;
    --van-popup-background: #1e293b;
    --van-button-primary-background: #38bdf8;
    --van-button-primary-border-color: #38bdf8;
    --van-primary-color: #38bdf8;
}

/* ===== 古风 ancient：羊皮纸 + 朱砂红（浅色暖调） ===== */
html[data-theme="ancient"] {
    --van-background: #f5efe0;
    --van-background-2: #efe6d0;
    --van-background-3: #e8dcc0;
    --van-gray-3: #d8c9a8;
    --van-gray-2: #efe6d0;
    --van-gray-1: #f5efe0;
    --van-text-color: #4a3728;
    --van-text-color-2: #7a5c43;
    --van-text-color-3: #9c8269;
    --van-cell-background: #fbf6ea;
    --van-nav-bar-background: #f5efe0;
    --van-nav-bar-title-text-color: #4a3728;
    --van-nav-bar-icon-color: #7a5c43;
    --van-tabbar-background: #efe6d0;
    --van-tabbar-item-text-color: #7a5c43;
    --van-tabbar-item-active-background: #efe6d0;
    --van-popup-background: #fbf6ea;
    --van-button-primary-background: #b03a2e;
    --van-button-primary-border-color: #b03a2e;
    --van-primary-color: #b03a2e;
    --van-active-color: #e8dcc0;
}

/* ===== 汉风 han：玄黑 + 朱红 + 鎏金（深色） ===== */
html[data-theme="han"] {
    --van-background: #1a1410;
    --van-background-2: #241c15;
    --van-background-3: #2e2419;
    --van-gray-3: #3a2f22;
    --van-gray-2: #241c15;
    --van-gray-1: #1a1410;
    --van-text-color: #f5e9d5;
    --van-text-color-2: #cbb79a;
    --van-text-color-3: #8f7a5e;
    --van-cell-background: #241c15;
    --van-nav-bar-background: #1a1410;
    --van-nav-bar-title-text-color: #f5e9d5;
    --van-nav-bar-icon-color: #cbb79a;
    --van-tabbar-background: #241c15;
    --van-tabbar-item-text-color: #cbb79a;
    --van-tabbar-item-active-background: #241c15;
    --van-popup-background: #241c15;
    --van-button-primary-background: #b03a2e;
    --van-button-primary-border-color: #b03a2e;
    --van-primary-color: #b03a2e;
    --van-active-color: #2e2419;
}

/* ===== 未来 future：深空蓝 + 青霓虹（深色） ===== */
html[data-theme="future"] {
    --van-background: #0a1220;
    --van-background-2: #111c30;
    --van-background-3: #182a44;
    --van-gray-3: #1f3350;
    --van-gray-2: #111c30;
    --van-gray-1: #0a1220;
    --van-text-color: #e6f1ff;
    --van-text-color-2: #8fb3d9;
    --van-text-color-3: #5a7a9e;
    --van-cell-background: #111c30;
    --van-nav-bar-background: #0a1220;
    --van-nav-bar-title-text-color: #e6f1ff;
    --van-nav-bar-icon-color: #8fb3d9;
    --van-tabbar-background: #111c30;
    --van-tabbar-item-text-color: #8fb3d9;
    --van-tabbar-item-active-background: #111c30;
    --van-popup-background: #111c30;
    --van-button-primary-background: #22d3ee;
    --van-button-primary-border-color: #22d3ee;
    --van-primary-color: #22d3ee;
    --van-active-color: #182a44;
}

/* ===== 赛博朋克 cyberpunk：深紫黑 + 品红霓虹（深色） ===== */
html[data-theme="cyberpunk"] {
    --van-background: #0f0a1a;
    --van-background-2: #1a1030;
    --van-background-3: #241545;
    --van-gray-3: #2f1d55;
    --van-gray-2: #1a1030;
    --van-gray-1: #0f0a1a;
    --van-text-color: #f0e6ff;
    --van-text-color-2: #b39ddb;
    --van-text-color-3: #7e6ba8;
    --van-cell-background: #1a1030;
    --van-nav-bar-background: #0f0a1a;
    --van-nav-bar-title-text-color: #f0e6ff;
    --van-nav-bar-icon-color: #b39ddb;
    --van-tabbar-background: #1a1030;
    --van-tabbar-item-text-color: #b39ddb;
    --van-tabbar-item-active-background: #1a1030;
    --van-popup-background: #1a1030;
    --van-button-primary-background: #e935c1;
    --van-button-primary-border-color: #e935c1;
    --van-primary-color: #e935c1;
    --van-active-color: #241545;
}

/* ===== 水墨 ink：宣纸白 + 墨黑（浅色单色极简） ===== */
html[data-theme="ink"] {
    --van-background: #f7f7f2;
    --van-background-2: #ecece4;
    --van-background-3: #e2e2d8;
    --van-gray-3: #d4d4c8;
    --van-gray-2: #ecece4;
    --van-gray-1: #f7f7f2;
    --van-text-color: #1f2937;
    --van-text-color-2: #4b5563;
    --van-text-color-3: #9ca3af;
    --van-cell-background: #fcfcf8;
    --van-nav-bar-background: #f7f7f2;
    --van-nav-bar-title-text-color: #1f2937;
    --van-nav-bar-icon-color: #4b5563;
    --van-tabbar-background: #ecece4;
    --van-tabbar-item-text-color: #4b5563;
    --van-tabbar-item-active-background: #ecece4;
    --van-popup-background: #fcfcf8;
    --van-button-primary-background: #1f2937;
    --van-button-primary-border-color: #1f2937;
    --van-primary-color: #1f2937;
    --van-active-color: #e2e2d8;
}

/* 界面字号跟随 --ui-fs：导航/单元/弹窗/按钮等外围 UI 缩放 */
html .mobile-shell {
    font-size: var(--ui-fs, 14px);
}
html .van-nav-bar__title,
html .van-nav-bar .van-icon,
html .van-cell__title,
html .van-cell__label,
html .van-cell__value {
    font-size: var(--ui-fs, 14px);
}
html .van-tabbar-item__text {
    font-size: calc(var(--ui-fs, 14px) - 2px);
}

.mobile-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--van-background, #f7f8fa);
}
.mobile-shell .mobile-tabbar {
    flex-shrink: 0;
}

/* 抑制系统长按菜单(复制/分享),保证自定义长按动作单优先触发(鸿蒙/国产 WebView 兼容) */
.mobile-shell,
.mobile-shell * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.mobile-shell input,
.mobile-shell textarea,
.mobile-shell [contenteditable="true"] {
    -webkit-user-select: text;
    user-select: text;
}
</style>