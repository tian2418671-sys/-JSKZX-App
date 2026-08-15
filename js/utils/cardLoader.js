/**
 * 卡片加载与数据规范化工具
 * 支持 V1/V2/V3 规范以及 PNG / WebP / JPEG / JSON 格式。
 */
import { parsePNGChunk, deepScanForJSON } from './pngParser.js';

/**
 * 将卡片数据规范化为 V2 结构，并确保关键数组存在，防止前端白屏
 * @param {object} rawData 原始卡片数据
 * @returns {object} 规范化后的 V2 结构
 */
export function normalizeCardData(rawData) {
    let card = rawData;

    // 1. 防止双重嵌套（修复缺陷2）：卡片缺 spec 但已有 data 层（第三方导出/手改 JSON 常见），
    //    直接补齐 spec 即可，绝不能把整个对象再包进新的 data 层造成 {data:{data:{...}}} 套娃
    if (!card.spec && card.data && typeof card.data === 'object') {
        card.spec = 'chara_card_v2';
        card.spec_version = '2.0';
    }
    // 2. V1 卡片包装：既无 spec 也无 data 层，说明是 V1 扁平结构，进行标准 V2 包装
    else if (!card.spec && !card.data) {
        card = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: { ...rawData }
        };
    }

    // 3. 字段绝对安全兜底（修复缺陷1）：无论原生 V2/V3 还是包装来的 V1，
    //    一律强制补齐容易缺失的数组字段，杜绝 Vue 渲染时
    //    `card.data.tags.filter()` 报 Cannot read properties of undefined 导致白屏
    if (card.data) {
        card.data.tags = Array.isArray(card.data.tags) ? card.data.tags : [];
        card.data.alternate_greetings = Array.isArray(card.data.alternate_greetings) ? card.data.alternate_greetings : [];
        card.data.extensions = card.data.extensions || {};
    }

    return card;
}

/**
 * 读取并解析角色卡文件
 * @param {File} file 用户选择的文件（.json / .png / .webp / .jpeg / .jpg）
 * @returns {Promise<{data: object, imgUrl: string|null, file: File}>} 解析结果
 * @throws {Error} 抛出带错误码（message）的错误，用于上层提示：
 *   - 'NO_CARD_DATA'：未能提取到有效的角色卡数据
 */
export async function processFile(file) {
    try {
        let parsedData = null;
        let url = null;

        if (file.name.toLowerCase().endsWith('.json')) {
            const text = await file.text();
            parsedData = JSON.parse(text);
        } else {
            // 图片处理（PNG、WebP 等）
            // 修复缺陷3：Electron 架构优先用本地路径协议（零 Blob 内存占用）；
            // 纯 Web/浏览器 File 无 path 时才降级 ObjectURL（由上层组件销毁时 revoke）
            url = file.path
                ? `local-file://img/?path=${encodeURIComponent(file.path)}`
                : URL.createObjectURL(file);

            const buffer = await file.arrayBuffer();

            // 1. 先尝试标准 PNG 数据块解析
            parsedData = parsePNGChunk(buffer);

            // 2. 失败时（WebP 或非标准）进行深度扫描
            if (!parsedData) {
                parsedData = deepScanForJSON(buffer);
            }
        }

        if (parsedData) {
            // 将 file 一起返回，方便上层组件统一处理 URL 回收或路径绑定
            return { data: normalizeCardData(parsedData), imgUrl: url, file };
        }

        // 解析失败时的内存清理（仅回收 blob: 链接，local-file:// 无需回收）
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }

        throw new Error('NO_CARD_DATA');
    } catch (error) {
        console.error(`解析卡片 [${file.name}] 失败:`, error);
        throw error;
    }
}
