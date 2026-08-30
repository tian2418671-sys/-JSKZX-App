/**
 * 楂樻€ц兘鎼滅储绱㈠紩寮曟搸锛氬€掓帓绱㈠紩 + 澧為噺鏇存柊銆? * 鍗＄墖瀵硅薄浣滀负缁撴灉寮曠敤淇濆瓨锛涙枃鏈笌鏍囩缂撳瓨浣跨敤 WeakMap锛岄伩鍏嶅欢闀垮崱鐗囩敓鍛藉懆鏈熴€? */

class SearchIndex {
    constructor() {
        this.index = new Map();
        this.cards = new Set();
        this.cardTexts = new WeakMap();
        this.cardTags = new WeakMap();
        this.buildTime = 0;
        this.cardCount = 0;
    }

    build(library, extractText, extractTags) {
        this.clear();
        for (const card of library || []) this._indexCard(card, extractText, extractTags);
        this.buildTime = Date.now();
        return this.stats();
    }

    /**
     * 寮傛鍒嗙墖鏋勫缓绱㈠紩锛氬皢澶ф壒閲忓崱鐗囨媶鍒嗕负灏忓潡锛屾瘡鍧椾箣闂?yield 缁欎富绾跨▼锛?     * 閬垮厤闃诲 UI 娓叉煋鍜岀敤鎴蜂氦浜掋€備娇鐢?requestIdleCallback 鎴?setTimeout 鍥為€€銆?     */
    async buildAsync(library, extractText, extractTags, chunkSize = 50) {
        this.clear();
        const cards = library || [];
        for (let i = 0; i < cards.length; i += chunkSize) {
            const chunk = cards.slice(i, i + chunkSize);
            for (const card of chunk) this._indexCard(card, extractText, extractTags);
            // 姣忓鐞嗕竴涓?chunk 鍚?yield 缁欎富绾跨▼
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

    add(card, extractText, extractTags) {
        if (!card || typeof card !== 'object') return;
        this.remove(card);
        this._indexCard(card, extractText, extractTags);
    }

    remove(card) {
        if (!this.cards.has(card)) return;
        const text = this.cardTexts.get(card) || '';
        for (const word of this._tokenize(text)) {
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
            // 浠庢渶绋€鏈夌殑璇嶅紑濮嬶紝鍑忓皯闆嗗悎鐩镐氦鎴愭湰銆?            const candidates = normalized.map(keyword => ({ keyword, cards: this._getMatches(keyword) }));
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

    _indexCard(card, extractText, extractTags) {
        const text = String(extractText(card) || '').toLowerCase();
        const tags = (extractTags(card) || []).map(tag => String(tag).toLowerCase());
        this.cardTexts.set(card, text);
        this.cardTags.set(card, tags);
        this.cards.add(card);
        for (const word of this._tokenize(text)) {
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
