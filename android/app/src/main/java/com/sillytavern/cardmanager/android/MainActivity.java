package com.sillytavern.cardmanager.android;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 显式注册本地插件:不依赖 capacitor.plugins.json(该文件会被 cap sync 覆盖清空),
        // 避免「插件未注册 → 文件系统/配置/网络全失效」的问题。
        registerPlugin(LibraryFsPlugin.class);
        registerPlugin(AppConfigPlugin.class);
        registerPlugin(HttpPlugin.class);
        registerPlugin(UpdatePlugin.class);
        registerPlugin(KeystorePlugin.class);
        registerPlugin(MemoryPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        registerPlugin(SqliteMetaPlugin.class);
        super.onCreate(savedInstanceState);
        setupBackNavigation();
    }

    /**
     * 物理返回键交给 WebView 历史,而不是直接退出应用。
     *
     * 路由为 hash 模式,页面跳转(push)会增长 WebView 历史;因此:
     *   有历史 → goBack()(触发 popstate,由 vue-router 切回上一页,Vant 弹窗随之关闭)
     *   无历史(已到根页) → 交回系统默认行为(退出应用)
     *
     * 实测背景:未处理前在卡片详情页按返回会直接退出整个 App。
     */
    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // 根页:关闭本回调后交回系统,避免递归调用自身
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }
}
