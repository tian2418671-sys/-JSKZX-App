/**
 * Electron(桌面)实现:直接透传 preload 注入的 window.electronAPI
 */
export const electronImpl = (typeof window !== 'undefined' && window.electronAPI)
    ? window.electronAPI
    : null;

if (typeof window !== 'undefined' && !window.electronAPI) {
    // 浏览器纯调试模式(无 Electron):提供最小桩,避免渲染层崩溃
    console.warn('[bridge] 未检测到 electronAPI(非 Electron 环境),功能将受限');
}