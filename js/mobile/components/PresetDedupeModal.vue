<!--
  PresetDedupeModal 预设智能查重弹窗（移动版 · 2026-09-25，对齐桌面 PresetDedupeModal）
  ─────────────────────────────────────────────────────────────
  展示由 `scanPresetDuplicates`（js/utils/presetDedupe.js）产出的聚类分组；
  清理动作留在父级（emits resolve-group → 父级确认后删除其余）。
  分组语义：同名家族 + 跨名「结构指纹聚类」（可发现改名同源）。
-->
<template>
    <van-popup
        :show="show"
        position="bottom"
        round
        class="pdm-popup"
        @update:show="(v) => { if (!v) $emit('close'); }"
    >
        <div class="pdm-head">
            <span class="pdm-title">⚙️ 预设智能查重</span>
            <span class="pdm-sub">按结构指纹比对（可发现改名同源）</span>
            <van-tag type="primary" plain class="pdm-count">{{ groups.length }} 组疑似重复</van-tag>
            <van-icon name="cross" size="18" class="pdm-close" @click="$emit('close')" />
        </div>

        <div class="pdm-body">
            <van-empty v-if="!groups.length" description="未发现重复预设 🎉" image-size="72" />

            <div v-for="(group, gi) in groups" :key="gi" class="pdm-group">
                <div class="pdm-group-head">
                    <span class="pdm-group-name">『{{ group.name }}』</span>
                    <van-tag v-if="group.byStructure" plain type="primary" size="mini">结构指纹聚类</van-tag>
                    <van-tag v-if="group.renamedCount" color="#fff7e6" text-color="#d48806" size="mini">
                        🔔 含 {{ group.renamedCount }} 个改名同源
                    </van-tag>
                    <span class="pdm-group-count">共 {{ group.list.length }} 个版本</span>
                </div>

                <div
                    v-for="(p, pi) in group.list"
                    :key="pi"
                    class="pdm-card"
                    :class="{ center: p._isCenter }"
                >
                    <div class="pdm-card-top">
                        <span class="pdm-name" :title="p.name">{{ p.name }}</span>
                        <van-tag v-if="p._isCenter" type="success" plain size="medium">推荐保留</van-tag>
                        <van-tag v-else :color="toneBg(p._simTone)" :text-color="toneFg(p._simTone)" size="medium">
                            {{ p._simLabel }}
                        </van-tag>
                    </div>
                    <div class="pdm-meta">💬 提示词 {{ p._promptCount }} 段 · ⚙️ {{ p._settings }}</div>
                    <div v-if="!p._isCenter" class="pdm-stats">
                        🧬 结构 {{ fmt(p._structPct) }} ｜ 📝 内容 {{ fmt(p._contentPct) }}<template v-if="p._enabledPct !== null && p._enabledPct !== undefined && p._enabledPct < 100"> ｜ 🎛️ 启用 {{ fmt(p._enabledPct) }}</template>
                    </div>
                    <div v-if="p._simAdvice" class="pdm-advice">💡 {{ p._simAdvice }}</div>
                    <div v-if="p._pctAdvice && !p._isCenter" class="pdm-advice pdm-advice-dim">{{ p._pctAdvice }}</div>
                    <van-button
                        size="small"
                        block
                        class="pdm-btn"
                        :type="btnType(p)"
                        :plain="!p._isCenter"
                        @click="$emit('resolve-group', { groupIndex: gi, keepPath: p.path })"
                    >
                        {{ p._isCenter ? '✅ 保留此版，清理其余' : (isRisky(p) ? '🚨 高风险，建议先人工核对' : '⚠️ 保留此版本，清理其余') }}
                    </van-button>
                </div>
            </div>

            <div v-if="skipped && skipped.length" class="pdm-skipped">
                已跳过 {{ skipped.length }} 本（缺数据/无提示词）：{{ skipped.slice(0, 3).map(s => s.name).join('、') }}{{ skipped.length > 3 ? '…' : '' }}
            </div>
        </div>
    </van-popup>
</template>

<script>
export default {
    name: 'PresetDedupeModal',
    props: {
        show: { type: Boolean, default: false },
        /** scanPresetDuplicates 的 groups 输出 */
        groups: { type: Array, default: () => [] },
        /** 跳过的预设 [{name, reason}] */
        skipped: { type: Array, default: () => [] }
    },
    emits: ['close', 'resolve-group'],
    setup() {
        const fmt = (v) => (v === null || v === undefined ? '—' : v + '%');
        /** 高风险类型（对齐桌面保守档）：内容差异 / 启用不同 / 换皮 / 参数 / 顺序——清理按钮降级警示 */
        const isRisky = (p) => !!p && ['different', 'flipped', 'reskin', 'sampler', 'reorder'].includes(p._simType);
        const btnType = (p) => {
            if (p._isCenter) return 'primary';
            return (p._simType === 'different' || p._simType === 'flipped') ? 'danger' : 'warning';
        };
        const toneBg = (tone) => ({
            emerald: '#f0f9eb', amber: '#fff7e6', blue: '#e8f3ff', rose: '#ffece8', purple: '#f5f0ff'
        }[tone] || '#f2f3f5');
        const toneFg = (tone) => ({
            emerald: '#07c160', amber: '#d48806', blue: '#1989fa', rose: '#ee0a24', purple: '#7232dd'
        }[tone] || '#646566');
        return { fmt, isRisky, btnType, toneBg, toneFg };
    }
};
</script>

<style scoped>
.pdm-popup { height: 85%; display: flex; flex-direction: column; }
.pdm-head {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 14px 16px 8px; flex-shrink: 0;
}
.pdm-title { font-size: 15px; font-weight: 600; }
.pdm-sub { font-size: 11px; color: var(--van-text-color-3, #969799); }
.pdm-count { margin-left: auto; }
.pdm-close { color: var(--van-text-color-3, #969799); padding: 4px; }

.pdm-body { flex: 1; overflow-y: auto; padding: 0 12px calc(14px + env(safe-area-inset-bottom, 0px)); }

.pdm-group { background: #f7f8fa; border-radius: 12px; padding: 10px; margin-bottom: 12px; }
.pdm-group-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.pdm-group-name { font-size: 13px; font-weight: 700; color: var(--van-primary-color, #06b6d4); }
.pdm-group-count { font-size: 11px; color: var(--van-text-color-3, #969799); margin-left: auto; }

.pdm-card {
    background: #fff; border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px; padding: 10px; margin-bottom: 8px;
}
.pdm-card.center { border-color: var(--van-primary-color, #06b6d4); }
.pdm-card:last-child { margin-bottom: 0; }
.pdm-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.pdm-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.pdm-meta { font-size: 11px; color: var(--van-text-color-2, #646566); margin-bottom: 4px; word-break: break-all; }
.pdm-stats { font-size: 11px; color: var(--van-primary-color, #06b6d4); margin-bottom: 4px; }
.pdm-advice { font-size: 11px; color: var(--van-text-color-2, #646566); margin-bottom: 4px; }
.pdm-advice-dim { color: var(--van-text-color-3, #969799); }
.pdm-btn { margin-top: 4px; }
.pdm-skipped { font-size: 11px; color: var(--van-text-color-3, #969799); padding: 4px 2px 10px; }
</style>
