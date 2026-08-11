/**
 * 图片解析工具
 * 支持标准 PNG tEXt / iTXt 数据块解析，以及对 WebP / 损坏 PNG 的深度扫描提取。
 */

/**
 * 稳健地解码 Base64，正确处理 UTF-8 字符
 * @param {string} base64 Base64 字符串
 * @returns {string} 解码后的字符串
 */
export function decodeBase64UTF8(base64) {
    try {
        return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
        return atob(base64);
    }
}

/**
 * 从图片缓冲区中深度扫描提取有效 JSON（适用于 WebP 与损坏的 PNG）
 * @param {ArrayBuffer} buffer 图片文件缓冲区
 * @returns {object|null} 提取到的角色卡数据，未找到时返回 null
 */
export function deepScanForJSON(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    // 匹配以 eyJ（即 '{"' 的 Base64 编码）开头的 Base64 块
    const base64Regex = /(eyJ[A-Za-z0-9+/=]+)/g;
    const matches = binary.match(base64Regex);

    if (matches) {
        // 按长度降序排列，优先尝试最可能是完整载荷的匹配
        matches.sort((a, b) => b.length - a.length);
        for (const match of matches) {
            try {
                const decoded = decodeBase64UTF8(match);
                const parsed = JSON.parse(decoded);
                if (parsed.name || (parsed.data && parsed.data.name)) {
                    return parsed;
                }
            } catch (e) {
                continue;
            }
        }
    }

    // 纯 JSON 文本扫描兜底
    const jsonMatch = binary.match(/\{[\s\S]*"name"[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name || parsed.data) return parsed;
        } catch (e) { /* 忽略解析失败 */ }
    }

    return null;
}

/**
 * 标准 PNG tEXt / iTXt 数据块解析器
 * @param {ArrayBuffer} buffer PNG 文件缓冲区
 * @returns {object|null} 解析出的角色卡数据，非 PNG 或未找到时返回 null
 */
export function parsePNGChunk(buffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0) !== 0x89504E47) return null; // 非 PNG 文件

    let offset = 8;
    while (offset < buffer.byteLength) {
        try {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(
                view.getUint8(offset + 4), view.getUint8(offset + 5),
                view.getUint8(offset + 6), view.getUint8(offset + 7)
            );

            if (type === 'tEXt' || type === 'iTXt') {
                const chunkData = new Uint8Array(buffer, offset + 8, length);
                const nullPos = chunkData.indexOf(0);
                const keyword = new TextDecoder().decode(chunkData.slice(0, nullPos));

                if (keyword === 'chara' || keyword === 'ccv3') {
                    // 兼容 V2(chara) / V3(ccv3) 两种数据块关键字；
                    // tEXt 为 latin1（或 Base64 字符串），iTXt 为 utf-8
                    const textData = new TextDecoder('utf-8').decode(chunkData.slice(nullPos + (type === 'iTXt' ? 3 : 1)));
                    const base64Str = textData.replace(/\0/g, ''); // 清理空字节
                    const jsonStr = decodeBase64UTF8(base64Str);
                    return JSON.parse(jsonStr);
                }
            }
            offset += 12 + length;
        } catch (e) {
            break;
        }
    }
    return null;
}
