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
    // 🔧 纯函数化：深拷贝后再规范化，杜绝原地修改入参造成的跨引用污染
    // （同一 parsedData 可能同时被 library 旧引用持有；structuredClone 对 JSON 派生对象零损耗）
    let card = (rawData && typeof rawData === 'object' && !Array.isArray(rawData))
        ? structuredClone(rawData)
        : {};

    if (!card.spec && card.data && typeof card.data === 'object') {
        card.spec = 'chara_card_v2';
        card.spec_version = '2.0';
    } else if (!card.spec && !card.data) {
        card = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: { ...card }
        };
    }

    if (card.data) {
        card.data.tags = Array.isArray(card.data.tags) ? card.data.tags : [];
        card.data.alternate_greetings = Array.isArray(card.data.alternate_greetings) ? card.data.alternate_greetings : [];
        card.data.extensions = card.data.extensions || {};
    }

    return card;
}

/**
 * 安全提取角色卡内嵌世界书条目数组（全形态兼容，杜绝脏数据崩溃）
 *
 * 修复「导入 JSON 角色卡后侧边栏消失/白屏」的根因：character_book 的形态陷阱
 *   ① entries 为字典对象（SillyTavern 世界书标准形态 { "0": {...}, "1": {...} }）
 *     → 旧写法 `book.entries || (Array.isArray(book) ? book : [])` 拿到字典，
 *       后续 .forEach/.filter 直接 TypeError → computed 崩溃 → 侧边栏（角色栏）消失；
 *   ② character_book 本身是数组（老 V1 嵌入形态）
 *     → 数组自带 Array.prototype.entries 方法（truthy 函数），同样短路旧判断拿到函数，
 *       .forEach 崩溃；且 JSON.stringify(函数) 返回 undefined，链式 .toLowerCase() 崩溃。
 *
 * 统一规则：数组 book 优先识别（避开原型方法陷阱）→ entries 数组 → entries 字典（Object.values）
 *
 * @param {object|Array} book 卡片的 character_book 字段（任意脏形态，含 null/undefined）
 * @returns {Array<object>} 条目数组（null/非对象脏条目已过滤；异常形态返回 []，永不抛错）
 */
export function extractBookEntries(book) {
    if (!book) return [];
    // 形态②：book 本身就是条目数组（老 V1 嵌入形态）——必须在读取 .entries 前判断，
    // 否则数组自带的 entries 原型方法（函数）会被误当作条目集合
    if (Array.isArray(book)) return book.filter(e => e && typeof e === 'object');
    if (typeof book !== 'object') return [];
    const raw = book.entries;
    // 形态①标准：entries 是数组
    if (Array.isArray(raw)) return raw.filter(e => e && typeof e === 'object');
    // 形态①兼容：entries 是字典（SillyTavern 世界书导出形态）
    if (raw && typeof raw === 'object') return Object.values(raw).filter(e => e && typeof e === 'object');
    return [];
}

/**
 * 🕵️ 角色卡血统严格鉴定（纯函数，从 App.vue 迁入）：
 * 过滤伪装成卡片的聊天记录、独立世界书、UI 主题配置、config.json 等系统配置
 * 与无内容字段的杂物，防止污染卡片库。
 * @param {object} data 待鉴定的解析后 JSON 对象
 * @returns {boolean} 是否为合法角色卡数据
 */
export function isCharacterCardData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

    // 🚫 绝对拦截①：聊天记录（酒馆聊天导出常为数组，或含 messages / chat_metadata 字段）
    if (data.messages || data.chat_metadata) return false;

    // 🚫 绝对拦截②：独立世界书 —— 任何形态的 entries 都是世界书特征（数组 / 对象字典 / 字符串），
    //    以及 data.entries 嵌套结构（非 character_book），一律拦截。
    //    角色卡的世界书永远只在 data.character_book / data.data.character_book 内，绝不会是顶层或 data.entries。
    if (data.entries !== undefined) return false;
    if (data.data && typeof data.data === 'object' &&
        'entries' in data.data && !data.data.character_book) return false;

    // 🚫 绝对拦截③：酒馆 UI 主题 / 界面配置 JSON
    if (data.colors || data.user_settings) return false;

    // V2/V3：spec 标记（chara_card_v2/v3）且带 data 对象
    if (typeof data.spec === 'string' && /^chara_card_v[23]$/i.test(data.spec.trim())) {
        return !!(data.data && typeof data.data === 'object');
    }
    // V1 / Character.ai 格式：必须有角色名 + 至少一个内容字段
    if (typeof data.name === 'string' && data.name.trim() !== '') {
        // ✅ [补丁] 增加更严格的排他条件：酒馆 config.json 等标准配置文件即使带 name 也直接抛弃，
        // 防止其被误当成 V1 角色卡混入库中
        if (data.system_settings || data.api_keys || data.public_api) return false;

        return typeof data.description === 'string' ||
               typeof data.personality === 'string' ||
               typeof data.first_mes === 'string' ||
               typeof data.scenario === 'string' ||
               typeof data.mes_example === 'string';
    }
    return false;
}

/**
 * 自动贴标签规则（正则匹配关键词，静态常量，从 App.vue 迁入）
 * 供 useCardCrud 的 processAutoTagsAndCategory 消费。
 */
export const autoTagRules = {
    'Fantasy (奇幻)': /魔法|精灵|异世界|巨龙|魔王|骑士/i,
    'Sci-Fi (科幻)': /星系|机甲|赛博朋克|AI|未来/i,
    'Monster (魔物娘)': /吸血鬼|狼人|魅魔|触手|兽人/i,
    'NSFW (限制级)': /nsfw|18\+|r18|色情|淫乱/i,
    'Romance (恋爱)': /恋爱|傲娇|病娇|青梅竹马/i
};

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
