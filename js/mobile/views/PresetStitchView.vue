<!--
  移动版预设缝合中心（PresetStitchView）
  多步骤向导式交互（1=模式选择 / 2=源预设 / 3=条目池 / 4=工作台 / 5=预览）
  
  适配 Vant 4 + Vue 3，支持移动端触屏交互与屏幕大小限制
-->
<template>
    <van-popup v-model:show="showModal" position="bottom" round class="psv-popup" @update:show="(v) => !v && $emit('close')">
        <div class="psv-container">
            <!-- 标题 -->
            <div class="psv-header">
                <van-nav-bar title="🧵 预设缝合" left-arrow @click-left="close" />
            </div>

            <!-- 步骤指示 -->
            <div class="psv-steps">
                <button v-for="s in 5" :key="s"
                        @click="step = s"
                        :class="step === s ? 'active' : 'done'"
                        class="step-dot">{{ s }}</button>
            </div>

            <!-- 步骤内容 -->
            <div class="psv-body">
                <!-- Step 1: 模式选择 -->
                <div v-show="step === 1" class="step-content">
                    <div class="step-title">选择缝合模式</div>
                    <div class="mode-grid">
                        <div class="mode-card" @click="mode = 'new'" :class="{ active: mode === 'new' }">
                            <div class="mode-icon">🆕</div>
                            <div class="mode-label">新建预设</div>
                            <div class="mode-desc">生成新文件（原件不变）</div>
                        </div>
                        <div class="mode-card" @click="mode = 'overwrite'" :class="{ active: mode === 'overwrite' }">
                            <div class="mode-icon">✏️</div>
                            <div class="mode-label">覆盖已有</div>
                            <div class="mode-desc">写回指定预设</div>
                        </div>
                        <div class="mode-card" @click="mode = 'current'" :class="{ active: mode === 'current' }">
                            <div class="mode-icon">🎯</div>
                            <div class="mode-label">写回当前</div>
                            <div class="mode-desc">修改内存中预设</div>
                        </div>
                    </div>

                    <!-- 基座选择（new/overwrite 模式） -->
                    <div v-if="mode !== 'current'" class="form-group">
                        <label class="form-label">{{ mode === 'new' ? '基座预设（继承参数）' : '覆盖目标' }}:</label>
                        <van-field :model-value="mode === 'new' ? basePath : overwritePath" type="select" label-width="0" class="form-field" @update:model-value="onBaseTargetChange">
                            <template #input>
                                <select :value="mode === 'new' ? basePath : overwritePath"
                                        @change="onBaseTargetChange($event.target.value)"
                                        class="form-select">
                                    <option v-for="p in sourceCandidates" :key="p.path" :value="p.path">
                                        {{ (p.data && p.data.name) || p.name }}
                                    </option>
                                </select>
                            </template>
                        </van-field>
                    </div>

                    <div v-else class="form-group">
                        <div class="form-label-text">
                            当前预设：<span class="active-preset-name">{{ basePreset ? ((basePreset.data && basePreset.data.name) || basePreset.name) : '未打开' }}</span>
                        </div>
                    </div>

                    <!-- 新预设名（new 模式） -->
                    <div v-if="mode === 'new'" class="form-group">
                        <van-field v-model="newName" label="新预设名" placeholder="输入名称" />
                    </div>

                    <div class="form-actions">
                        <van-button plain @click="close">取消</van-button>
                        <van-button type="primary" @click="step = 2">下一步</van-button>
                    </div>
                </div>

                <!-- Step 2: 源预设选择 -->
                <div v-show="step === 2" class="step-content">
                    <div class="step-title">选择源预设（1~N本）</div>
                    <div class="form-group">
                        <div class="select-tools">
                            <van-button size="small" plain @click="selectAllSources">全选</van-button>
                            <van-button size="small" plain type="danger" @click="clearSources">清空</van-button>
                            <span class="select-count">已选 {{ sourcePaths.length }} 本</span>
                        </div>
                    </div>
                    <div class="preset-list">
                        <label v-for="p in sourceCandidates" :key="p.path" class="preset-item">
                            <input type="checkbox" :checked="sourcePaths.includes(p.path)" @change="toggleSource(p)" class="preset-checkbox">
                            <div class="preset-info">
                                <div class="preset-name">{{ (p.data && p.data.name) || p.name }}</div>
                                <div class="preset-meta">
                                    {{ Array.isArray(p.data?.prompts) ? p.data.prompts.length : 0 }} 条
                                </div>
                            </div>
                        </label>
                    </div>
                    <div class="form-actions">
                        <van-button plain @click="step = 1">上一步</van-button>
                        <van-button type="primary" :disabled="!sourcePaths.length" @click="step = 3">
                            下一步 ({{ sourcePaths.length }})
                        </van-button>
                    </div>
                </div>

                <!-- Step 3: 条目池浏览 -->
                <div v-show="step === 3" class="step-content">
                    <div class="step-title">从条目池加入工作台</div>
                    <van-search v-model="poolQuery" placeholder="搜索条目名/identifier" shape="round" />
                    
                    <div v-if="!poolGroups.length" class="empty-tip">
                        请先在上一步选择源预设
                    </div>
                    <div v-else class="pool-groups">
                        <div v-for="g in poolGroups" :key="g.path" class="pool-group">
                            <div class="group-header">
                                <span class="group-name">{{ g.name }}</span>
                                <span class="group-count">{{ g.shown.length }} / {{ g.total }}</span>
                                <van-button size="mini" type="primary" @click="addAllFromPreset(g)">
                                    ＋ 全部
                                </van-button>
                            </div>
                            <div class="group-items">
                                <div v-for="row in g.shown" :key="g.path + '#' + row.srcIndex"
                                     @click="addItem(row.prompt, g)"
                                     class="pool-item">
                                    <span class="item-name">{{ row.prompt.name || row.prompt.identifier }}</span>
                                    <span class="item-size">{{ ((row.prompt.content || '').length / 1024).toFixed(1) }}K</span>
                                    <span class="item-badge">＋</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <van-button plain @click="step = 2">上一步</van-button>
                        <van-button type="primary" @click="step = 4">下一步</van-button>
                    </div>
                </div>

                <!-- Step 4: 工作台编辑 -->
                <div v-show="step === 4" class="step-content">
                    <div class="step-title">
                        缝合工作台
                        <span class="item-count">{{ items.length }} 条{{ conflictCount ? '（' + conflictCount + ' 冲突）' : '' }}</span>
                    </div>

                    <div v-if="!items.length" class="empty-tip">
                        工作台为空
                        <van-button size="small" type="primary" @click="addCustom" class="mt-2">
                            ✏️ 新建自定义条目
                        </van-button>
                    </div>

                    <div v-else class="form-group">
                        <div class="toolbar">
                            <van-button size="small" type="primary" @click="addCustom">✏️ 新建</van-button>
                            <van-button size="small" type="danger" @click="clearItems">清空</van-button>
                            <label class="checkbox-label">
                                <input type="checkbox" v-model="showConflictOnly" class="checkbox">
                                只看冲突
                            </label>
                        </div>

                        <div class="work-items">
                            <div v-for="(it, idx) in visibleItems" :key="it.uid"
                                 @click="selectedUid = it.uid"
                                 :class="{ selected: selectedUid === it.uid, conflict: it.conflict }"
                                 class="work-item">
                                <div class="item-header">
                                    <span class="item-badge" :class="it.origin">{{ it.origin === 'custom' ? '✏️' : '📚' }}</span>
                                    <input v-model="it.name" type="text" placeholder="条目名" class="item-name-input">
                                    <button @click.stop="removeItem(it.uid)" class="remove-btn">🗑</button>
                                </div>
                                <div v-if="it.conflict" class="item-conflict">
                                    ⚠️ 与 {{ it.conflict.type === 'base' ? '基座' : '工作台内' }} 的 {{ it.conflict.withName }} 同名
                                </div>
                                <select v-if="it.conflict" v-model="it.decision" class="decision-select" @click.stop>
                                    <option value="">— 待决策 —</option>
                                    <option value="source">✏️ 用来源覆盖</option>
                                    <option value="target">🔒 保留基座</option>
                                    <option value="rename">🔀 重命名都保留</option>
                                    <option value="skip">⏭ 跳过</option>
                                </select>
                                <select v-model="it.place" class="place-select" @click.stop>
                                    <option value="append">⬇ 尾部</option>
                                    <option value="builtin">🏛 内置序</option>
                                    <option value="after">📍 锚点后</option>
                                    <option value="before">📍 锚点前</option>
                                </select>
                                <textarea v-show="selectedUid === it.uid" v-model="it.content" rows="4" placeholder="内容" class="item-content-textarea" @click.stop></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <van-button plain @click="step = 3">上一步</van-button>
                        <van-button type="primary" @click="step = 5">预览</van-button>
                    </div>
                </div>

                <!-- Step 5: 预览与执行 -->
                <div v-show="step === 5" class="step-content">
                    <div class="step-title">预览缝合结果</div>
                    
                    <div v-if="plan.ok" class="summary-box">
                        <div class="summary-text">{{ summaryText }}</div>
                        <div v-if="plan.stats.pending > 0" class="summary-warning">
                            ⚠️ 还有 {{ plan.stats.pending }} 条冲突未决策
                        </div>
                    </div>
                    <div v-else class="summary-error">
                        ❌ {{ plan.reason }}
                    </div>

                    <div class="preview-stats">
                        <div class="stat-item">
                            <span class="stat-label">🆕 新增</span>
                            <span class="stat-value">{{ plan.stats.added }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">✏️ 覆盖</span>
                            <span class="stat-value">{{ plan.stats.overwritten }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">🔀 重命名</span>
                            <span class="stat-value">{{ plan.stats.renamed }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">⏭ 跳过</span>
                            <span class="stat-value">{{ plan.stats.skipped }}</span>
                        </div>
                    </div>

                    <div v-if="previewRows.length" class="preview-table">
                        <div class="table-header">
                            <div class="col-num">#</div>
                            <div class="col-name">条目</div>
                            <div class="col-from">来源</div>
                        </div>
                        <div v-for="row in previewRows" :key="row.i" class="table-row" :class="{ new: row.isNew, overwritten: row.isOverwritten }">
                            <div class="col-num">{{ row.i }}</div>
                            <div class="col-name">{{ row.name }}</div>
                            <div class="col-from">
                                <span v-if="row.isNew" class="badge new">🆕</span>
                                <span v-else-if="row.isOverwritten" class="badge overwritten">✏️</span>
                                <span v-else class="badge base">🔒</span>
                                {{ row.from }}
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <van-button plain @click="step = 4">上一步</van-button>
                        <van-button type="primary" 
                                    :loading="busy"
                                    :disabled="busy || !plan.ok || plan.stats.pending > 0"
                                    @click="executeStitch">
                            {{ mode === 'new' ? '🚀 生成新预设' : mode === 'overwrite' ? '🚀 覆盖写入' : '🚀 写回当前' }}
                        </van-button>
                    </div>
                </div>
            </div>
        </div>
    </van-popup>
</template>

<script>
import { showToast, showConfirmDialog } from 'vant';
import { usePresetStitch } from '../composables/usePresetStitch';
import { onMounted, toRef } from 'vue';

export default {
    name: 'PresetStitchView',
    props: {
        presets: { type: Array, default: () => [] },
        activePreset: { type: Object, default: null }
    },
    emits: ['close', 'save'],
    setup(props, { emit }) {
        const stitch = usePresetStitch({
            presets: toRef(props, 'presets'),
            activePreset: toRef(props, 'activePreset'),
            showToast,
            confirm: showConfirmDialog
        });

        const onBaseTargetChange = (value) => {
            if (!value) return;
            if (stitch.mode.value === 'new') {
                stitch.basePath.value = value;
            } else {
                stitch.overwritePath.value = value;
            }
        };

        const executeStitch = async () => {
            await stitch.execute((preset) => {
                emit('save', preset);
            });
        };

        onMounted(() => {
            stitch.open();
        });

        return {
            ...stitch,
            onBaseTargetChange,
            executeStitch,
            close: () => { stitch.close(); emit('close'); }
        };
    }
};
</script>

<style scoped>
.psv-popup :deep(.van-popup) {
    max-height: 95vh;
    border-radius: 16px 16px 0 0;
}

.psv-container {
    display: flex;
    flex-direction: column;
    height: 95vh;
    background: var(--van-background, #f7f8fa);
}

.psv-header {
    border-bottom: 1px solid var(--van-gray-3, #ebedf0);
    flex-shrink: 0;
}

.psv-steps {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--van-background-2, #fff);
    border-bottom: 1px solid var(--van-gray-2, #f3f4f6);
    flex-shrink: 0;
}

.step-dot {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--van-gray-4, #d9d9d9);
    background: var(--van-background-2, #fff);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--van-text-color-2, #969799);
}

.step-dot.active {
    background: #06b6d4;
    border-color: #06b6d4;
    color: white;
}

.step-dot.done {
    background: #c6f6d5;
    border-color: #48bb78;
    color: #22543d;
}

.psv-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 12px;
    -webkit-overflow-scrolling: touch;
}

.step-content {
    animation: slideIn 0.3s ease;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.step-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--van-text-color, #323233);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.item-count {
    font-size: 12px;
    color: var(--van-gray-6, #969799);
    font-weight: 400;
}

/* Step 1: 模式选择 */
.mode-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
}

.mode-card {
    padding: 16px 8px;
    border: 2px solid var(--van-gray-3, #ebedf0);
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--van-background-2, #fff);
}

.mode-card.active {
    border-color: #06b6d4;
    background: #cffafe;
}

.mode-icon {
    font-size: 24px;
    margin-bottom: 4px;
}

.mode-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--van-text-color, #323233);
    margin-bottom: 4px;
}

.mode-desc {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
}

/* 表单 */
.form-group {
    margin-bottom: 12px;
}

.form-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--van-text-color-2, #646566);
    margin-bottom: 8px;
}

.form-label-text {
    font-size: 12px;
    color: var(--van-text-color-2, #646566);
    padding: 10px 12px;
    background: var(--van-background-2, #fff);
    border-radius: 8px;
}

.active-preset-name {
    color: #06b6d4;
    font-weight: 600;
}

.form-field :deep(.van-field__control) {
    font-size: 14px;
}

.form-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    font-size: 14px;
    background: var(--van-background-2, #fff);
}

.form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--van-gray-2, #f3f4f6);
}

/* Step 2: 源预设选择 */
.select-tools {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    align-items: center;
}

.select-count {
    margin-left: auto;
    font-size: 12px;
    color: var(--van-gray-6, #969799);
}

.preset-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
}

.preset-item {
    display: flex;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    background: var(--van-background-2, #fff);
    cursor: pointer;
    transition: background 0.2s;
}

.preset-item:active {
    background: var(--van-gray-1, #f7f8fa);
}

.preset-checkbox {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: #06b6d4;
}

.preset-info {
    flex: 1;
    min-width: 0;
}

.preset-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--van-text-color, #323233);
    margin-bottom: 4px;
}

.preset-meta {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
}

/* Step 3: 条目池 */
.empty-tip {
    text-align: center;
    padding: 40px 16px;
    color: var(--van-gray-6, #969799);
    font-size: 13px;
}

.pool-groups {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
}

.pool-group {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
}

.group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--van-background, #f7f8fa);
    border-bottom: 1px solid var(--van-gray-2, #f3f4f6);
}

.group-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--van-text-color, #323233);
}

.group-count {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    margin-left: auto;
}

.group-items {
    max-height: 200px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}

.pool-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--van-gray-2, #f3f4f6);
    cursor: pointer;
    transition: background 0.2s;
}

.pool-item:active {
    background: var(--van-gray-1, #f7f8fa);
}

.item-name {
    flex: 1;
    font-size: 12px;
    color: var(--van-text-color, #323233);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.item-size {
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    flex-shrink: 0;
}

.item-badge {
    font-size: 12px;
    color: #06b6d4;
    flex-shrink: 0;
}

/* Step 4: 工作台 */
.toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    align-items: center;
    flex-wrap: wrap;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--van-text-color-2, #646566);
    cursor: pointer;
    margin-left: auto;
}

.checkbox {
    accent-color: #06b6d4;
}

.work-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.work-item {
    border: 2px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    padding: 12px;
    background: var(--van-background-2, #fff);
    cursor: pointer;
    transition: all 0.2s;
}

.work-item.selected {
    border-color: #06b6d4;
    background: #cffafe;
}

.work-item.conflict {
    border-color: #f5222d;
}

.item-header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.item-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
}

.item-badge.custom {
    background: #c6f6d5;
    color: #22543d;
}

.item-badge.source {
    background: #bfdbfe;
    color: #1e40af;
}

.item-name-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    outline: none;
    color: var(--van-text-color, #323233);
    padding: 0;
}

.remove-btn {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
    color: var(--van-gray-6, #969799);
}

.item-conflict {
    font-size: 11px;
    color: #f5222d;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #ffa39e;
}

.decision-select,
.place-select {
    width: 100%;
    font-size: 12px;
    padding: 6px 8px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 4px;
    background: var(--van-background, #f7f8fa);
    margin-top: 6px;
}

.item-content-textarea {
    width: 100%;
    font-size: 12px;
    padding: 8px;
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 4px;
    margin-top: 8px;
    font-family: monospace;
    resize: vertical;
    max-height: 150px;
}

/* Step 5: 预览 */
.summary-box {
    padding: 12px;
    background: #ecfdf5;
    border: 1px solid #86efac;
    border-radius: 8px;
    margin-bottom: 12px;
}

.summary-text {
    font-size: 13px;
    color: #166534;
    font-weight: 500;
}

.summary-warning {
    font-size: 11px;
    color: #ea580c;
    margin-top: 4px;
    font-weight: 500;
}

.summary-error {
    padding: 12px;
    background: #fee2e2;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    color: #7f1d1d;
}

.preview-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
}

.stat-item {
    padding: 10px;
    background: var(--van-background-2, #fff);
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    text-align: center;
}

.stat-label {
    display: block;
    font-size: 11px;
    color: var(--van-gray-6, #969799);
    margin-bottom: 4px;
}

.stat-value {
    display: block;
    font-size: 18px;
    font-weight: 600;
    color: #06b6d4;
}

.preview-table {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 8px;
    overflow: hidden;
    background: var(--van-background-2, #fff);
    margin-bottom: 12px;
    max-height: 300px;
    overflow-y: auto;
}

.table-header {
    display: grid;
    grid-template-columns: 30px 1fr 120px;
    gap: 0;
    padding: 10px 12px;
    background: var(--van-background, #f7f8fa);
    border-bottom: 1px solid var(--van-gray-2, #f3f4f6);
    font-size: 11px;
    font-weight: 600;
    color: var(--van-gray-6, #969799);
    position: sticky;
    top: 0;
}

.table-row {
    display: grid;
    grid-template-columns: 30px 1fr 120px;
    gap: 0;
    padding: 10px 12px;
    border-top: 1px solid var(--van-gray-2, #f3f4f6);
    font-size: 12px;
    align-items: center;
}

.table-row.new {
    background: #ecfdf5;
}

.table-row.overwritten {
    background: #fef3c7;
}

.col-num {
    color: var(--van-gray-6, #969799);
    text-align: center;
}

.col-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--van-text-color, #323233);
}

.col-from {
    text-align: right;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
}

.badge {
    font-size: 10px;
    font-weight: 600;
}

.badge.new {
    color: #15803d;
}

.badge.overwritten {
    color: #d97706;
}

.badge.base {
    color: #0369a1;
}

.mt-2 {
    margin-top: 12px;
}
</style>
