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
 * 卡片封面:IntersectionObserver 懒加载,异步 readBuffer → blob URL
 * 全局缓存避免重复读库;仅缓存 URL,由文档生命周期自行管理(数量受限)
 */
const coverCache = new Map();
export { coverCache };

export default {
    name: 'MobileCardCover',
    props: {
        card: { type: Object, required: true },
        aspect: { type: String, default: '1 / 1' }
    },
    directives: {
        intersect: {
            mounted(el, binding) {
                if (!('IntersectionObserver' in window)) { binding.value(); return; }
                const obs = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        obs.disconnect();
                        binding.value();
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
    computed: {
        phStyle() {
            return { aspectRatio: this.aspect };
        }
    },
    methods: {
        async loadCover() {
            const card = this.card;
            if (!card || this.src || this.failed) return;
            if (coverCache.has(card.path)) {
                this.src = coverCache.get(card.path);
                return;
            }
            this.loading = true;
            try {
                const r = await window.electronAPI.readBuffer(card.path);
                if (r && r.success && r.buffer) {
                    const url = URL.createObjectURL(new Blob([r.buffer]));
                    if (coverCache.size > 200) {
                        const firstKey = coverCache.keys().next().value;
                        const old = coverCache.get(firstKey);
                        coverCache.delete(firstKey);
                        try { URL.revokeObjectURL(old); } catch (e) { /* 忽略 */ }
                    }
                    coverCache.set(card.path, url);
                    this.src = url;
                } else {
                    this.failed = true;
                }
            } catch (e) {
                this.failed = true;
            } finally {
                this.loading = false;
            }
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