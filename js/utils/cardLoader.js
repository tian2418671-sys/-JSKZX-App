/**
 * 卡片加载与数据规范化工具
 * 支持 V1/V2/V3 规范以及 PNG / WebP / JPEG / JSON 格式。
 */
import { parsePNGChunk, deepScanForJSON } from './pngParser.js';

/**
 * 将卡片数据规范化为 V2 结构，确保旧格式或外部 JSON 也能在界面中正常工作
 * @param {object} data 原始卡片数据
 * @returns {object} 规范化后的 V2 结构
 */
export function normalizeCardData(data) {
    if (data.spec && data.data) return data; // 已是 V2/V3

    // 将 V1 / Character.ai 导出等包装为类似 V2 的结构
    return {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
            ...data,
            tags: data.tags || [],
            alternate_greetings: data.alternate_greetings || [],
            extensions: data.extensions || {}
        }
    };
}

/**
 * 读取并解析角色卡文件
 * @param {File} file 用户选择的文件（.json / .png / .webp / .jpeg / .jpg）
 * @returns {Promise<{data: object, imgUrl: string|null}>} 解析结果
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
            url = URL.createObjectURL(file);
            const buffer = await file.arrayBuffer();

            // 1. 先尝试标准 PNG 数据块解析
            parsedData = parsePNGChunk(buffer);

            // 2. 失败时（WebP 或非标准）进行深度扫描
            if (!parsedData) {
                parsedData = deepScanForJSON(buffer);
            }
        }

        if (parsedData) {
            return { data: normalizeCardData(parsedData), imgUrl: url };
        }

        if (url) URL.revokeObjectURL(url);
        throw new Error('NO_CARD_DATA');
    } catch (error) {
        console.error(error);
        throw error;
    }
}
