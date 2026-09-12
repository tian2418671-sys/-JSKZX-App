<template>
    <div class="card-cover" v-intersect="loadCover">
        <img v-if="src" :src="src" alt="" class="cover-img" />
        <div v-else class="cover-ph" :class="{ 'is-loading': loading, 'is-failed': failed }" :style="phStyle">
            <span v-if="failed" class="ph-badge">!</span>
            <template v-else>✦</template>
        </div>
    </div>
</template>

<script>
/**
 * 卡片封面:IntersectionObserver 懒加载 + 缩略图磁盘缓存优先(Quick Win v1.10.15)
 * 读取策略:① readThumb(MD5(path|mtime|size) 磁盘缓存,12KB WebP,未命中原生生成)
 *          → ② readBuffer 整图兜底(缩略图不可用/解析失败时)
 * 内存缓存:coverCache(Map, 200 LRU);in-flight 去重(pendingCovers 同路径共享一次读取);
 * 失败负缓存(failedPaths:坏卡不反复重试);并发信号量(MAX_CONCURRENT):快滑防原生读取风暴
 * (全量整图 base64 过桥是 350MB 内存尖峰的主因,缩略图命中后降为 12KB 载荷)
 */
const coverCache = new Map();      // path → blob URL
const pendingCovers = new Map();   // path → Promise<url|null> 并发去重
const failedPaths = new Set();     // 失败负缓存(有界)
const revokedPaths = new Set();    // clearCoverCache 作废路径:在途结果丢弃,防旧图回填
const MAX_COVER_CACHE = 200;
const MAX_FAILED = 200;
const MAX_CONCURRENT = 4;          // 同时进行的原生读取数
let activeLoads = 0;
const loadQueue = [];

function acquire() {
    if (activeLoads < MAX_CONCURRENT) { activeLoads++; return Promise.resolve(); }
    return new Promise((resolve) => loadQueue.push(resolve));
}
function release() {
    const next = loadQueue.shift();
    if (next) next();              // 槽位直接转交等待者,计数不变
    else activeLoads--;
}

function trimFailedPaths() {
    if (failedPaths.size > MAX_FAILED) {
        const first = failedPaths.values().next().value;
        if (first !== undefined) failedPaths.delete(first);
    }
}

/** 清除指定卡片或全部封面缓存(换卡图后强制重新加载;传 mtime/size 同步清磁盘缩略图) */
export function clearCoverCache(cardPath, mtime, size) {
    if (cardPath) {
        const url = coverCache.get(cardPath);
        if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* 忽略 */ } }
        coverCache.delete(cardPath);
        pendingCovers.delete(cardPath);
        failedPaths.delete(cardPath);
        revokedPaths.add(cardPath);
        // 磁盘缩略图同步失效:下次 readThumb 从新文件重新生成(换卡图场景必须)
        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.deleteThumb === 'function') {
            try { window.electronAPI.deleteThumb(cardPath, mtime || 0, size || 0); } catch (e) { /* 忽略 */ }
        }
    } else {
        coverCache.forEach((url) => { try { URL.revokeObjectURL(url); } catch (e) { /* 忽略 */ } });
        coverCache.clear();
        pendingCovers.clear();
        failedPaths.clear();
        revokedPaths.clear();
    }
}

/** 预热填充内存封面缓存(首屏:数据层批量生成后直接入内存,免二次原生读取) */
export function prefillCoverCache(cardPath, buffer) {
    if (!cardPath || !buffer) return null;
    const url = URL.createObjectURL(new Blob([buffer]));
    if (coverCache.size >= MAX_COVER_CACHE) {
        const firstKey = coverCache.keys().next().value;
        const old = coverCache.get(firstKey);
        coverCache.delete(firstKey);
        try { URL.revokeObjectURL(old); } catch (e) { /* 忽略 */ }
    }
    coverCache.set(cardPath, url);
    return url;
}

export default {
    name: 'MobileCardCover',
    props: {
        card: { type: Object, required: true },
        aspect: { type: String, default: '1 / 1' }
    },
    directives: {
        intersect: {
            mounted(el, binding) {
                // binding.value 是组件方法引用，直接调用会丢失 this，需显式绑定组件实例
                const run = () => binding.value.call(binding.instance);
                if (!('IntersectionObserver' in window)) { run(); return; }
                const obs = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        obs.disconnect();
                        run();
                    }
                }, { rootMargin: '300px' });
                obs.observe(el);
                el.__coverObs__ = obs;
            },
            unmounted(el) {
                if (el.__coverObs__) { el.__coverObs__.disconnect(); el.__coverObs__ = null; }
            }
        }
    },
    data() {
        return {
            src: null,
            failed: false,
            loading: false
        };
    },
    watch: {
        // 修复 Bug #3：翻页/换卡时 card prop 变化，需重置图片
        card(newCard, oldCard) {
            if (!newCard || !oldCard || newCard.path === oldCard.path) return;
            this.src = null;
            this.failed = false;
            this.loading = false;
            this.$nextTick(() => this.loadCover());
        }
    },
    computed: {
        phStyle() {
            return { aspectRatio: this.aspect };
        }
    },
    methods: {
        async loadCover() {
            const card = this.card;
            if (!card || !card.path || this.src || this.failed) return;
            // 失败负缓存:坏卡直接显示占位,不发起原生读取
            if (failedPaths.has(card.path)) { this.failed = true; return; }
            if (coverCache.has(card.path)) {
                this.src = coverCache.get(card.path);
                return;
            }
            // in-flight 去重:同一路径的并发请求共享同一次原生读取
            let promise = pendingCovers.get(card.path);
            if (!promise) {
                promise = this.fetchCover(card).finally(() => pendingCovers.delete(card.path));
                pendingCovers.set(card.path, promise);
            }
            const url = await promise;
            // 卡片可能已滚动复用:仅当 prop 未变时写入
            if (this.card && this.card.path === card.path) {
                if (url) this.src = url;
                else this.failed = true;
            }
        },
        /** 缩略图优先 → 整图兜底;全程受并发信号量约束 */
        async fetchCover(card) {
            await acquire();
            try {
                // ① 缩略图磁盘缓存(命中 12KB 过桥;未命中原生降采样生成 300px WebP 并缓存)
                if (typeof window.electronAPI.readThumb === 'function') {
                    try {
                        const t = await window.electronAPI.readThumb(card.path, card._mtime || 0, card._size || 0);
                        if (t && t.success && t.buffer && t.buffer.byteLength > 0) {
                            if (revokedPaths.has(card.path)) { revokedPaths.delete(card.path); return null; }
                            return this.cacheUrl(card.path, t.buffer);
                        }
                    } catch (e) { /* 缩略图失败 → 整图兜底 */ }
                }
                // ② 整图兜底(缩略图不可用/非图片解码失败时)
                const r = await window.electronAPI.readBuffer(card.path);
                if (r && r.success && r.buffer) {
                    if (revokedPaths.has(card.path)) { revokedPaths.delete(card.path); return null; }
                    return this.cacheUrl(card.path, r.buffer);
                }
                failedPaths.add(card.path); trimFailedPaths();
                return null;
            } catch (e) {
                failedPaths.add(card.path); trimFailedPaths();
                return null;
            } finally {
                release();
            }
        },
        cacheUrl(path, buffer) {
            const url = URL.createObjectURL(new Blob([buffer]));
            if (coverCache.size >= MAX_COVER_CACHE) {
                const firstKey = coverCache.keys().next().value;
                const old = coverCache.get(firstKey);
                coverCache.delete(firstKey);
                try { URL.revokeObjectURL(old); } catch (e) { /* 忽略 */ }
            }
            coverCache.set(path, url);
            return url;
        }
    }
};
</script>

<style scoped>
.card-cover {
    width: 100%;
    position: relative;
    overflow: hidden;
    background: linear-gradient(150deg, #0f172a, #1e293b);
}
.cover-ph {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    color: rgba(255, 255, 255, 0.45);
    font-size: 26px;
    background:
        radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,.06), transparent 60%),
        linear-gradient(150deg, #0f172a, #1e293b);
}
.cover-ph.is-loading {
    color: transparent;
    background:
        linear-gradient(100deg, rgba(255, 255, 255, 0.04) 30%, rgba(255, 255, 255, 0.14) 50%, rgba(255, 255, 255, 0.04) 70%);
    background-size: 220% 100%;
    animation: cover-shimmer 1.4s linear infinite;
}
.cover-ph.is-failed {
    color: rgba(148, 163, 184, 0.5);
}
.cover-ph:not(.is-loading):not(.is-failed) > :not(.ph-badge) {
    animation: cover-float 2.4s ease-in-out infinite;
}
@keyframes cover-float {
    0%, 100% { transform: translateY(0); opacity: .5; }
    50% { transform: translateY(-4px); opacity: .9; }
}
.ph-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.55);
    font-size: 13px;
    line-height: 1;
}
@keyframes cover-shimmer {
    from { background-position: 120% 0; }
    to { background-position: -120% 0; }
}
.cover-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
