/**
 * Electron(桌面)实现:直接透传 preload 注入的 window.electronAPI
 */
export const electronImpl = (typeof window !== 'undefined' && window.electronAPI)
    ? window.electronAPI
    : {
        // 浏览器纯调试模式(无 Electron):提供最小桩,避免渲染层崩溃
        // pickJsonFile:用 <input type=file> 模拟移动端单文件导入
        async pickJsonFile() {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json,.json,text/plain,.txt';
                input.onchange = () => {
                    const f = input.files && input.files[0];
                    if (!f) { resolve({ success: false, error: '未选择文件' }); return; }
                    const reader = new FileReader();
                    reader.onload = () => resolve({ success: true, name: f.name, text: String(reader.result || '') });
                    reader.onerror = () => resolve({ success: false, error: '读取失败' });
                    reader.readAsText(f, 'utf-8');
                };
                input.oncancel = () => resolve({ success: false, error: '用户取消选择' });
                input.click();
            });
        }
    };

if (typeof window !== 'undefined' && !window.electronAPI) {
    // 浏览器纯调试模式(无 Electron):提供最小桩,避免渲染层崩溃
    console.warn('[bridge] 未检测到 electronAPI(非 Electron 环境),功能将受限');
}