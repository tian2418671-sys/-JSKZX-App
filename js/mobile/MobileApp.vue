<!--
  MobileApp 移动端壳
  底部 3 Tab 导航：卡片库 / 世界书 / 设置
  聊天测卡与桌面版一致，不设独立主界面，而是作为角色卡详情页内置「测卡」Tab
  页面主体由 <router-view> 按路由填充；Tab 高亮与切换由 Vant Tabbar(route 模式)接管
  全屏页(如卡片详情 route.meta.tabbar=false)自动隐藏底部导航
-->
<template>
    <div class="mobile-shell">
        <router-view />
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
html.van-theme-dark {
    --van-button-primary-background: #6366f1;
    --van-button-primary-border-color: #6366f1;
    --van-primary-color: #6366f1;
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