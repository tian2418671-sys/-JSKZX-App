/**
 * 缓存重建 Worker（v1.10.16 F3）
 * 在独立线程执行 .jskzx_cache.json 的 JSON.parse + 条目重建(大头),主线程只收成品数组。
 * 与 cardParseWorker 同款内联策略(?worker&inline)由调用方决定;本文件仅含 Worker 消息协议。
 */
import { restoreItemsFromCacheText, restoreItemsFromShardTexts } from './libraryCacheCore.js';

/**
 * 缓存重建 Worker（v1.10.16 F3 / v1.10.25 B1 分片扩展）
 * 在独立线程执行缓存 JSON.parse + 条目重建，主线程只收成品数组。
 * 支持两种消息：
 *   - { id, text }  单文件缓存文本（旧版，向后兼容）
 *   - { id, texts } 分片文本数组（B1 新版，16 片并行 parse）
 */
self.onmessage = (e) => {
    const { id, text, texts } = e.data || {};
    try {
        const r = Array.isArray(texts) ? restoreItemsFromShardTexts(texts)
            : (typeof text === 'string' ? restoreItemsFromCacheText(text) : null);
        self.postMessage({ id, ok: !!r, items: r ? r.items : null, categories: r ? r.categories : null });
    } catch (_) {
        self.postMessage({ id, ok: false, items: null, categories: null });
    }
};