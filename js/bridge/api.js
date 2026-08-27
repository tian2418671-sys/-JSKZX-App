/**
 * 桥接层入口:根据运行环境注入具体实现
 *  - Electron:暴露 preload 已经注入好的 window.electronAPI
 *  - Android/Capacitor:实现对应方法的等价 API(SAF 替代原生文件系统,OkHttp 替代 Node http)
 * 保证渲染层调用入口只有一处: import { api } from '@/bridge'; api.[methodName](...)
 */
import { electronImpl } from './electron.js';
import { androidImpl } from './android.js';

const isCapacitorNative = typeof window !== 'undefined'
    && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export const api = isCapacitorNative ? androidImpl : electronImpl;

/** API 类型契约（供 IDE 参考,实际运行由环境动态注入）
 * @typedef {typeof api} ElectronAPI
 */