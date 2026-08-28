<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        closeable
        class="tag-panel"
        @update:show="(v) => $emit('update:show', v)"
        @click-overlay="$emit('update:show', false)"
    >
        <div class="tp-head">
            <span class="tp-title">标签管理</span>
            <div class="tp-lang">
                <span class="tp-lang-opt" :class="{ active: langMode === 'cn' }" @click="setLang('cn')">中</span>
                <span class="tp-lang-opt" :class="{ active: langMode === 'en' }" @click="setLang('en')">EN</span>
                <span class="tp-lang-opt" :class="{ active: langMode === 'both' }" @click="setLang('both')">中英</span>
            </div>
        </div>

        <div class="tp-body">
            <!-- 当前标签 -->
            <div class="tp-sec">
                <div class="tp-sec-label">当前标签</div>
                <div class="tp-chips">
                    <van-tag
                        v-for="(t, i) in tags"
                        :key="'cur' + i"
                        closable
                        color="#eef7fb"
                        text-color="#06b6d4"
                        class="tp-chip"
                        @close="removeCurrentTag(i)"
                    >{{ display(t) }}</van-tag>
                    <span v-if="!tags.length" class="tp-empty">暂无标签</span>
                </div>
            </div>

            <!-- 我的收藏 -->
            <div class="tp-sec">
                <div class="tp-sec-label">⭐ 我的收藏 <span class="tp-sec-hint">点标签加入卡片，✕ 移除收藏</span></div>
                <div class="tp-chips">
                    <van-tag
                        v-for="(f, i) in favorites"
                        :key="'fav' + i"
                        closable
                        :color="isFreeTagSelected(f) ? '#06b6d4' : '#f2f3f5'"
                        :text-color="isFreeTagSelected(f) ? '#fff' : '#646566'"
                        class="tp-chip"
                        @click="toggleFreeTag(f)"
                        @close="removeFavorite(i)"
                    >{{ display(f) }}</van-tag>
                    <span v-if="!favorites.length" class="tp-empty">点预设标签右侧 ☆ 收藏，或下方输入后点「收藏」</span>
                </div>
            </div>

            <!-- 预设标签池 -->
            <div class="tp-sec">
                <div class="tp-sec-label">预设标签池</div>
                <div class="tp-chips">
                    <div
                        v-for="p in presetTags"
                        :key="p.en"
                        class="tp-pchip"
                        :class="{ selected: presetSelected(p) }"
                        @click="togglePreset(p)"
                    >
                        <span>{{ label(p) }}</span>
                        <span
                            class="tp-star"
                            :class="{ fav: isFavPreset(p) }"
                            @click.stop="toggleFavPreset(p)"
                        >{{ isFavPreset(p) ? '★' : '☆' }}</span>
                    </div>
                </div>
            </div>

            <!-- 自定义 -->
            <div class="tp-sec tp-custom">
                <van-field
                    v-model="customInput"
                    placeholder="输入自定义标签"
                    class="tp-input"
                    @keyup.enter="addCustom"
                />
                <van-button size="small" type="primary" class="tp-btn" @click="addCustom">添加</van-button>
                <van-button size="small" plain class="tp-btn" @click="favCustom">收藏</van-button>
            </div>
        </div>
    </van-popup>
</template>

<script>
/**
 * 阶段 3.4: 标签系统增强
 *  - 预设标签池(固化 JSON,结构化中英文)
 *  - 收藏(自定义/预设标签收藏,localStorage 持久化)
 *  - 中英切换(中/EN/中英 三态,localStorage 持久化)
 * 受控组件: 展示 props.tags,操作时 emit('change', 新数组),由父组件落盘。
 */
import { ref } from 'vue';

// 本地持久化键(沿用移动端 jsmobile- 前缀)
const LS_LANG = 'jsmobile-tag-lang';
const LS_FAVS = 'jsmobile-tag-favs';

// 预设标签池(固化 JSON:结构化中英文,与桌面版 useTags.js 对齐)
const presetTags = [
    { cn: '奇幻', en: 'Fantasy' },
    { cn: '科幻', en: 'Sci-Fi' },
    { cn: '现代', en: 'Modern' },
    { cn: '末日', en: 'Post-Apocalyptic' },
    { cn: '限制级', en: 'NSFW' },
    { cn: '恋爱', en: 'Romance' },
    { cn: '病娇', en: 'Yandere' },
    { cn: '傲娇', en: 'Tsundere' },
    { cn: '精灵', en: 'Elf' },
    { cn: '魔物娘', en: 'Monster Girl' },
    { cn: '巨龙', en: 'Dragon' },
    { cn: '吸血鬼', en: 'Vampire' },
    { cn: '恶魔', en: 'Demon' },
    { cn: '天使', en: 'Angel' },
    { cn: '兽耳', en: 'Kemonomimi' },
    { cn: '机甲', en: 'Mecha' },
    { cn: '魔法', en: 'Magic' },
    { cn: '系统流', en: 'System' },
    { cn: '异世界', en: 'Isekai' },
    { cn: '暗黑', en: 'Dark' },
    { cn: '喜剧', en: 'Comedy' },
    { cn: '虐心', en: 'Angst' },
    { cn: '日常', en: 'Slice of Life' },
    { cn: '动作', en: 'Action' },
    { cn: '原创', en: 'Original' },
    { cn: '动漫', en: 'Anime' },
    { cn: '游戏', en: 'Game' },
    { cn: '小说', en: 'Novel' }
];

function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); } catch { return []; }
}

export default {
    name: 'TagPanel',
    props: {
        show: { type: Boolean, default: false },
        tags: { type: Array, default: () => [] }
    },
    emits: ['update:show', 'change'],
    setup(props, { emit }) {
        const langMode = ref(localStorage.getItem(LS_LANG) || 'both');
        const favorites = ref(loadFavorites());
        const customInput = ref('');

        function setLang(m) {
            langMode.value = m;
            localStorage.setItem(LS_LANG, m);
        }
        function saveFavorites() {
            localStorage.setItem(LS_FAVS, JSON.stringify(favorites.value));
        }

        // 根据当前语言模式显示预设标签文本
        function label(p) {
            if (langMode.value === 'cn') return p.cn;
            if (langMode.value === 'en') return p.en;
            return `${p.en} (${p.cn})`;
        }

        // 任意已存储标签 → 当前模式显示文本(非预设原样返回)
        function display(tag) {
            if (!tag) return tag;
            const p = presetTags.find((x) => x.cn === tag || x.en === tag || tag.startsWith(`${x.en} (`));
            if (!p) return tag;
            return label(p);
        }

        // 判断某预设标签是否已存在于卡片 tags 中(兼容中/英/双语存储形式)
        function presetSelected(p) {
            return props.tags.some((t) => t === p.cn || t === p.en || t.startsWith(`${p.en} (`));
        }

        // 点选/取消预设标签
        function togglePreset(p) {
            let arr = [...props.tags];
            const has = presetSelected(p);
            if (has) {
                arr = arr.filter((t) => !(t === p.cn || t === p.en || t.startsWith(`${p.en} (`)));
            } else {
                arr.push(langMode.value === 'cn' ? p.cn : p.en);
            }
            emit('change', arr);
        }

        // 判断收藏的标签(可能为预设 en 键或自由字符串)是否已加入卡片
        function isFreeTagSelected(tag) {
            const p = presetTags.find((x) => x.cn === tag || x.en === tag);
            const target = p ? (langMode.value === 'cn' ? p.cn : p.en) : tag;
            return props.tags.includes(target);
        }

        // 点击收藏标签 → 加入/移出卡片
        function toggleFreeTag(tag) {
            const p = presetTags.find((x) => x.cn === tag || x.en === tag);
            const target = p ? (langMode.value === 'cn' ? p.cn : p.en) : tag;
            let arr = [...props.tags];
            const i = arr.indexOf(target);
            if (i >= 0) arr.splice(i, 1);
            else arr.push(target);
            emit('change', arr);
        }

        // 收藏/取消收藏预设标签(统一以 en 键存储,保证唯一可反查)
        function isFavPreset(p) {
            return favorites.value.includes(p.en) || favorites.value.includes(p.cn);
        }
        function toggleFavPreset(p) {
            const key = p.en;
            if (favorites.value.includes(key)) {
                favorites.value = favorites.value.filter((t) => t !== key);
            } else {
                favorites.value = [...favorites.value, key];
            }
            saveFavorites();
        }

        // 从收藏列表移除(仅移除收藏,不动卡片)
        function removeFavorite(i) {
            favorites.value.splice(i, 1);
            saveFavorites();
        }

        // 移除当前标签
        function removeCurrentTag(i) {
            const arr = [...props.tags];
            arr.splice(i, 1);
            emit('change', arr);
        }

        // 自定义标签 → 加入卡片
        function addCustom() {
            const t = customInput.value.trim();
            if (!t) return;
            const arr = [...props.tags];
            if (!arr.includes(t)) arr.push(t);
            emit('change', arr);
            customInput.value = '';
        }

        // 自定义标签 → 收藏(预设则存 en 键,否则存原字符串)
        function favCustom() {
            const t = customInput.value.trim();
            if (!t) return;
            const p = presetTags.find((x) => x.cn === t || x.en === t);
            const key = p ? p.en : t;
            if (!favorites.value.includes(key)) {
                favorites.value = [...favorites.value, key];
                saveFavorites();
            }
            customInput.value = '';
        }

        return {
            langMode, favorites, customInput, presetTags,
            setLang, label, display,
            presetSelected, togglePreset,
            isFreeTagSelected, toggleFreeTag,
            isFavPreset, toggleFavPreset, removeFavorite,
            removeCurrentTag, addCustom, favCustom
        };
    }
};
</script>

<style scoped>
.tag-panel { max-height: 72vh; }
.tp-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 44px 8px 16px;
}
.tp-title { font-size: 16px; font-weight: 600; }
.tp-lang {
    display: flex; gap: 4px; background: #f2f3f5; border-radius: 14px; padding: 2px;
}
.tp-lang-opt {
    font-size: 12px; padding: 3px 10px; border-radius: 12px; color: #646566;
}
.tp-lang-opt.active { background: #06b6d4; color: #fff; }
.tp-body { padding: 0 16px calc(16px + env(safe-area-inset-bottom)); overflow-y: auto; }
.tp-sec { margin-top: 12px; }
.tp-sec-label { font-size: 13px; color: #969799; margin-bottom: 8px; }
.tp-sec-hint { font-size: 11px; color: #c8c9cc; }
.tp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tp-chip { cursor: pointer; }
.tp-empty { font-size: 12px; color: #c8c9cc; padding: 4px 0; }
.tp-pchip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 12px; font-size: 13px;
    background: #f2f3f5; color: #646566; border: 1px solid transparent;
    cursor: pointer;
}
.tp-pchip.selected { background: #eef7fb; color: #06b6d4; border-color: #06b6d4; }
.tp-star { font-size: 13px; color: #c8c9cc; }
.tp-star.fav { color: #f5a623; }
.tp-custom { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.tp-input { flex: 1; background: #f7f8fa; border-radius: 8px; padding: 6px 12px; }
.tp-btn { flex-shrink: 0; }
</style>
