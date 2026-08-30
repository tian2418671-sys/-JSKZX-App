/**
 * 卡片解析 Worker（移动端加载加速）
 * 把 CPU 密集的原始解析移出主线程：JSON.parse（大卡）/ PNG chunk 解析 / WebP 深度扫描。
 * 主线程保留文件读取(桥接)与结果组装；Worker 只做「原始字符串 → 解析对象」纯计算。
 *
 * 消息协议：
 *   主→Worker: { id, kind: 'json'|'png', raw: string }
 *   Worker→主: { id, ok: boolean, parsed: object|null }
 */
import { parsePNGChunk, deepScanForJSON } from '../utils/pngParser.js';

self.onmessage = (e) => {
    const { id, kind, raw } = e.data || {};
    let parsed = null;
    try {
        if (kind === 'json') {
            parsed = JSON.parse(raw);
        } else {
            // PNG:先走标准 chunk 提取,失败再深度扫描(WebP/损坏 PNG)
            parsed = parsePNGChunk(raw) || deepScanForJSON(raw);
        }
    } catch (err) {
        parsed = null; // 解析失败,主线程按「损坏卡」跳过
    }
    self.postMessage({ id, ok: !!parsed, parsed });
};
