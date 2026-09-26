/**
 * 🏷️ 世界书标签 —— 纯函数层（对齐桌面版 js/utils/wbGroupsTags.js，S1 迁移 · 2026-09-25）
 *
 * 📌 桌面版三个既定决策（移动版沿用）：
 *   · 元数据只留配置层（不写世界书文件）——移动版存 localStorage `jsmobile-wb-tags`；
 *   · 标签允许重复输入（去重）、可使用「全部」等词（标签不参与视图哨兵判定）；
 *   · 筛选语义：标签之间 **AND**（必须同时命中所选标签），与分组是复合条件。
 *
 * ⚠️ 与桌面版的差别：桌面世界书对象挂在 shallowRef 上需要手动 triggerRef（S1 响应式缺口）；
 *    移动版映射用 reactive 对象，新增/删除键自动响应，无需该处理（在视图层说明）。
 */

/** 标签名最大长度（防止超长名把 UI 撑爆、把配置写肥；与桌面 WB_NAME_MAX_LEN 一致） */
export const WB_TAG_MAX_LEN = 40;

/**
 * 🧹 规范化单个标签（纯函数）
 * 处理：trim → 折叠内部空白 → 截断到上限；非法输入返回空串。
 * @param {*} raw 原始输入
 * @returns {string}
 */
export function normalizeWbTag(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim().replace(/\s+/g, ' ');
    if (!s) return '';
    if (s.length > WB_TAG_MAX_LEN) s = s.slice(0, WB_TAG_MAX_LEN).trim();
    return s;
}

/**
 * 🧹 规范化标签数组：逐项规范化 → 去空 → 去重（保留首次出现顺序）
 * @param {*} arr
 * @returns {string[]}
 */
export function normalizeWbTags(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const t of arr) {
        const n = normalizeWbTag(t);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push(n);
    }
    return out;
}

/**
 * 🔀 切换某标签的存在性（有则删、无则加）——纯函数，返回新数组
 * @param {string[]} tags 现有标签
 * @param {string} tag 目标标签
 * @returns {string[]}
 */
export function toggleWbTag(tags, tag) {
    const list = normalizeWbTags(tags);
    const n = normalizeWbTag(tag);
    if (!n) return list;
    return list.includes(n) ? list.filter((t) => t !== n) : [...list, n];
}

/**
 * 🔎 统计标签使用频次（供标签选择器/筛选行按热度排序）
 * @param {Iterable<string[]>} tagLists 每本书的标签数组
 * @returns {Array<{tag:string, count:number}>} 按 count 降序、同频按名称升序（zh-CN）
 */
export function countWbTags(tagLists) {
    const map = new Map();
    for (const list of tagLists || []) {
        for (const t of normalizeWbTags(list)) {
            map.set(t, (map.get(t) || 0) + 1);
        }
    }
    return [...map.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, 'zh-CN'));
}

/**
 * 🎯 复合过滤判定（分组 + 标签 [+ 搜索/词条数]）——纯函数
 *
 * 语义（与桌面版一致）：
 *   · 搜索 / 词条数：由调用方传入已算好的布尔值（不传 = 不参与判定）；
 *   · 标签：选中的标签必须**全部命中**（AND，不是 OR）。
 *
 * @param {object} p
 * @param {string} [p.bookCategory] 该书分组
 * @param {string[]} [p.bookTags] 该书标签
 * @param {string} [p.filterCategory] 当前选中分组（缺省/「全部」= 不过滤）
 * @param {string[]} [p.filterTags] 当前选中标签（缺省 = 不过滤）
 * @param {boolean} [p.matchesSearch] 搜索是否命中（调用方算）
 * @param {boolean} [p.matchesCount] 词条数档是否命中（调用方算）
 * @returns {boolean}
 */
export function matchWbFilter(p) {
    const o = p || {};
    if (o.matchesSearch === false) return false;
    if (o.matchesCount === false) return false;
    const filterCat = o.filterCategory;
    if (filterCat && filterCat !== '全部') {
        if (o.bookCategory !== filterCat) return false;
    }
    const want = normalizeWbTags(o.filterTags);
    if (want.length) {
        const have = new Set(normalizeWbTags(o.bookTags));
        for (const t of want) if (!have.has(t)) return false;
    }
    return true;
}
