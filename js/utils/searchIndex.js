/**
 * 高性能搜索索引引擎：倒排索引 + 增量更新。
 * 卡片对象作为结果引用保存；文本与标签缓存使用 WeakMap，避免延长卡片生命周期。
 *
 * 🚀 两万卡专项（C2）：倒排索引只建「短字段」（名称/作者/文件名/分组/标签），
 * 长文本（description 等，内存 _searchText 已截断 1.5K）不逐字进倒排——否则
 * 两万卡 = 数千万 posting、数百 MB 内存、分钟级构建。
 * 召回策略：短字段先走倒排；短字段未命中的词自动降级为全文线性匹配
 * （2 万 × 1.5K ≈ 30MB，单次扫描 50-100ms，配合 300ms 防抖可接受）。
 * API 兼容：不传 extractShortText 时行为与旧版一致（全文建索引）。
 */

class SearchIndex {
    constructor() {
        this.index = new Map();
        this.cards = new Set();
        this.cardTexts = new WeakMap();
        this.cardShortTexts = new WeakMap();
        this.cardTags = new WeakMap();
        this.buildTime = 0;
        this.cardCount = 0;
    }

    build(library, extractText, extractTags, extractShortText) {
        this.clear();
        for (const card of library || []) this._indexCard(card, extractText, extractTags, extractShortText);
        this.buildTime = Date.now();
        return this.stats();
    }

    /**
     * 异步分片构建索引：将大批量卡片拆分为小块，每块之间 yield 给主线程，
     * 避免阻塞 UI 渲染和用户交互。使用 requestIdleCallback 或 setTimeout 回退。
     */
    async buildAsync(library, extractText, extractTags, extractShortText, chunkSize = 50) {
        this.clear();
        const cards = library || [];
        for (let i = 0; i < cards.length; i += chunkSize) {
            const chunk = cards.slice(i, i + chunkSize);
            for (const card of chunk) this._indexCard(card, extractText, extractTags, extractShortText);
            // 每处理一个 chunk 后 yield 给主线程
            if (i + chunkSize < cards.length) {
                await new Promise(resolve => {
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(resolve, { timeout: 50 });
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
            }
        }
        this.buildTime = Date.now();
        return this.stats();
    }

    add(card, extractText, extractTags, extractShortText) {
        if (!card || typeof card !== 'object') return;
        this.remove(card);
        this._indexCard(card, extractText, extractTags, extractShortText);
    }

    remove(card) {
        if (!this.cards.has(card)) return;
        // 倒排只含短字段 token：用短文本回收 posting
        const shortText = this.cardShortTexts.get(card) || '';
        for (const word of this._tokenize(shortText)) {
            const cards = this.index.get(word);
            if (!cards) continue;
            const next = cards.filter(item => item !== card);
            if (next.length) this.index.set(word, next);
            else this.index.delete(word);
        }
        this.cards.delete(card);
        this.cardCount = this.cards.size;
    }

    search(keywords = [], options = {}) {
        const terms = Array.isArray(keywords) ? keywords : this._tokenize(String(keywords).toLowerCase());
        const normalized = terms.map(term => String(term).toLowerCase()).filter(Boolean);
        const { tags = [], excludeKeywords = [] } = options;
        let results;

        if (normalized.length === 0) {
            results = [...this.cards];
        } else {
            // 短字段倒排命中优先；未命中的词降级为全文线性匹配（C2）
            const candidates = normalized.map(keyword => ({
                keyword,
                cards: (() => {
                    const hit = this._getMatches(keyword);
                    return hit.length ? hit : this._linearSearch(keyword);
                })()
            }));
            candidates.sort((a, b) => a.cards.length - b.cards.length);
            results = candidates[0].cards;
            for (let i = 1; i < candidates.length && results.length; i++) {
                const allowed = new Set(candidates[i].cards);
                results = results.filter(card => allowed.has(card));
            }
        }

        if (tags.length) {
            const wanted = tags.map(tag => String(tag).toLowerCase());
            results = results.filter(card => {
                const cardTags = this.cardTags.get(card) || [];
                return wanted.every(tag => cardTags.some(value => value.includes(tag)));
            });
        }
        if (excludeKeywords.length) {
            const excluded = excludeKeywords.map(word => String(word).toLowerCase());
            results = results.filter(card => {
                const text = this.cardTexts.get(card) || '';
                return !excluded.some(word => text.includes(word));
            });
        }
        return results;
    }

    /**
     * 全文线性降级匹配（C2）：倒排未命中的查询词，对全部卡片的全文做 includes 扫描。
     * 只发生在短字段无命中的词上；两万卡 ~30MB 全文单次扫描 50-100ms。
     */
    _linearSearch(keyword) {
        const matches = [];
        for (const card of this.cards) {
            if ((this.cardTexts.get(card) || '').includes(keyword)) matches.push(card);
        }
        return matches;
    }

    _indexCard(card, extractText, extractTags, extractShortText) {
        const text = String(extractText(card) || '').toLowerCase();
        // 短字段文本（名称/作者/文件名/分组/标签）：缺省回退全文，保持旧版行为
        const shortText = extractShortText
            ? String(extractShortText(card) || '').toLowerCase()
            : text;
        const tags = (extractTags(card) || []).map(tag => String(tag).toLowerCase());
        this.cardTexts.set(card, text);
        this.cardShortTexts.set(card, shortText);
        this.cardTags.set(card, tags);
        this.cards.add(card);
        for (const word of this._tokenize(shortText)) {
            const cards = this.index.get(word) || [];
            cards.push(card);
            this.index.set(word, cards);
        }
        this.cardCount = this.cards.size;
    }

    _tokenize(text) {
        const tokens = [];
        let word = '';
        for (const char of String(text)) {
            if (/[\u4e00-\u9fff]/.test(char)) {
                if (word) tokens.push(word);
                word = '';
                tokens.push(char);
            } else if (/[A-Za-z0-9_]/.test(char)) {
                word += char;
            } else {
                if (word) tokens.push(word);
                word = '';
            }
        }
        if (word) tokens.push(word);
        return [...new Set(tokens)];
    }

    _getMatches(keyword) {
        const exact = this.index.get(keyword);
        if (exact) return exact;
        const matches = [];
        for (const [word, cards] of this.index) {
            if (word.includes(keyword)) matches.push(...cards);
        }
        return [...new Set(matches)];
    }

    clear() {
        this.index.clear();
        this.cards.clear();
        this.cardCount = 0;
        this.buildTime = 0;
    }

    stats() {
        return {
            cardCount: this.cardCount,
            wordCount: this.index.size,
            buildTime: this.buildTime,
            avgCardsPerWord: this.cardCount ? this.index.size / this.cardCount : 0
        };
    }
}

export default new SearchIndex();
