/**
 * 移动端测卡 API Key 配置（加密持久化，与设置页共用 stc-api-key 存储键）
 *  - 读取：优先经桥接 decryptSecret 解密；失败/无密文时返回原始存储值（兼容历史明文）
 *  - 保存：优先经桥接 encryptSecret 加密后落盘（Keystore AES-256-GCM）；失败回退明文
 * 与桌面 useConfigPersistence 的 API Key 加密语义对齐。
 */
import { api } from '../bridge/api.js';

const LS_KEY = 'stc-api-key';

export async function loadApiKey() {
    const stored = localStorage.getItem(LS_KEY) || '';
    if (!stored) return '';
    try {
        const res = await api.decryptSecret(stored);
        if (res && res.success && res.value) return res.value;
    } catch (e) { /* 兼容旧明文/解密失败，返回原值 */ }
    return stored;
}

export async function saveApiKey(key) {
    const plain = (key || '').trim();
    if (!plain) {
        localStorage.removeItem(LS_KEY);
        return;
    }
    try {
        const enc = await api.encryptSecret(plain);
        if (enc && enc.success && enc.value) localStorage.setItem(LS_KEY, enc.value);
        else localStorage.setItem(LS_KEY, plain);
    } catch (e) {
        localStorage.setItem(LS_KEY, plain);
    }
}
