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
            <van-tabbar-item replace to="/worldbook" icon="bookmark-o">世界书库</van-tabbar-item>
            <van-tabbar-item replace to="/settings" icon="setting-o">设置</van-tabbar-item>
        </van-tabbar>
    </div>
</template>

<script>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { applyTheme, currentTheme } from './theme';

export default {
    name: 'MobileApp',
    setup() {
        const route = useRoute();
        const showTabbar = computed(() => route.meta.tabbar !== false);
        onMounted(() => {
            // 启动即应用已保存主题(M2)
            applyTheme(currentTheme());
        });
        return { showTabbar };
    }
};
</script>

<style>
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