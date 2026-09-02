package com.sillytavern.cardmanager.android;

import android.os.Bundle;
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
        super.onCreate(savedInstanceState);
    }
}
