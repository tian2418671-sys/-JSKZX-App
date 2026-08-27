/**
 * cap sync 后置脚本:将本地 Android 插件(SAF/配置)重新注册到 capacitor.plugins.json
 * 原因:cap sync 会以 node_modules 插件为准重写该文件,覆盖本地插件条目。
 * 归属:随 package.json 的 sync:android 命令执行。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsFile = join(root, 'android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json');

// 本地插件清单(与 android/app/src/main/java/com/sillytavern/cardmanager/android 下的类一一对应)
// 注:字段名为 classpath(Capacitor CLI 约定),非 classname;插件 name 由 Java 类 @CapacitorPlugin 注解提供。
const LOCAL_PLUGINS = [
    { pkg: 'com.sillytavern.cardmanager.android', classpath: 'com.sillytavern.cardmanager.android.LibraryFsPlugin' },
    { pkg: 'com.sillytavern.cardmanager.android', classpath: 'com.sillytavern.cardmanager.android.AppConfigPlugin' },
    { pkg: 'com.sillytavern.cardmanager.android', classpath: 'com.sillytavern.cardmanager.android.HttpPlugin' },
    { pkg: 'com.sillytavern.cardmanager.android', classpath: 'com.sillytavern.cardmanager.android.UpdatePlugin' },
    { pkg: 'com.sillytavern.cardmanager.android', classpath: 'com.sillytavern.cardmanager.android.KeystorePlugin' }
];

let plugins = [];
try {
    plugins = JSON.parse(readFileSync(pluginsFile, 'utf-8') || '[]');
} catch (e) {
    plugins = [];
}

let changed = false;
for (const local of LOCAL_PLUGINS) {
    if (!plugins.some((p) => p.classpath === local.classpath)) {
        plugins.push(local);
        changed = true;
    }
}

if (changed) {
    writeFileSync(pluginsFile, JSON.stringify(plugins, null, 2), 'utf-8');
    console.log('[post-cap-sync] 已注册本地插件:', LOCAL_PLUGINS.map((p) => p.classpath.split('.').pop()).join(', '));
} else {
    console.log('[post-cap-sync] 本地插件已注册,跳过');
}