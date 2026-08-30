/**
 * 鍗＄墖 Token 浼扮畻缂撳瓨銆備娇鐢?WeakMap 鎸夊崱鐗囧璞＄紦瀛橈紝鍗＄墖閲婃斁鍚庣紦瀛樺彲鑷姩鍥炴敹銆? */
import { estimateTokens } from './tokenEstimate.js';

class TokenCache {
    constructor() {
        this.cache = new WeakMap();
        this.stats = { hits: 0, misses: 0, totalComputed: 0, totalTime: 0 };
    }

    get(card) {
        if (!card || typeof card !== 'object') return 0;
        if (this.cache.has(card)) {
            this.stats.hits++;
            return this.cache.get(card);
        }
        this.stats.misses++;
        const start = performance.now();
        const tokens = estimateTokens(this._extractFullText(card));
        this.stats.totalComputed++;
        this.stats.totalTime += performance.now() - start;
        this.cache.set(card, tokens);
        return tokens;
    }

    getBatch(cards) { return (cards || []).map(card => [card, this.get(card)]); }

    warmup(cards) { for (const card of cards || []) this.get(card); }

    /**
     * 寮傛鍒嗙墖棰勭儹锛氬皢澶ф壒閲忓崱鐗囨媶鍒嗕负灏忓潡锛屾瘡鍧椾箣闂?yield 缁欎富绾跨▼锛?     * 閬垮厤闃诲 UI 娓叉煋鍜岀敤鎴蜂氦浜掋€?     */
    async warmupAsync(cards, chunkSize = 50) {
        const list = cards || [];
        for (let i = 0; i < list.length; i += chunkSize) {
            const chunk = list.slice(i, i + chunkSize);
            for (const card of chunk) this.get(card);
            if (i + chunkSize < list.length) {
                await new Promise(resolve => {
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(resolve, { timeout: 50 });
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
            }
        }
    }

    clear() {
        this.cache = new WeakMap();
        this.stats = { hits: 0, misses: 0, totalComputed: 0, totalTime: 0 };
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            hitRate: total ? `${((this.stats.hits / total) * 100).toFixed(2)}%` : '0%',
            avgComputeTime: this.stats.totalComputed
                ? `${(this.stats.totalTime / this.stats.totalComputed).toFixed(2)}ms`
                : '0ms'
        };
    }

    _extractFullText(card) {
        const data = card?.data?.data || card?.data || {};
        const parts = [
            card?.name, card?.creator, card?.fileName, card?.path,
            data.name, data.creator || data.author, data.description,
            data.personality, data.scenario, data.first_mes,
            data.mes_example, data.creator_notes,
            Array.isArray(data.alternate_greetings) ? data.alternate_greetings.join(' ') : '',
            data.extensions?.depth_prompt?.prompt,
            typeof data.extensions?.system_prompt === 'string' ? data.extensions.system_prompt : ''
        ];
        return parts.filter(Boolean).join(' ');
    }
}

export default new TokenCache();
