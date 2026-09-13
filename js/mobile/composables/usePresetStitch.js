/**
 * 移动版预设缝合逻辑层（Composable）
 * 复用桌面版核心算法，适配移动端状态管理和交互流程
 * 
 * 核心概念：
 *   基座 = 缝合的底子（新建/覆盖/写回三种模式）
 *   源预设 = 1~N 本源头预设（只读）
 *   工作台 = 临时条目池（选中待写入的条目）
 *   冲突 = 条目 identifier 与基座同名 → 需人工决策
 *   落位 = 条目插进 order 的位置（追加/按内置序/锚点前后）
 * 
 * 执行后输出：新的 prompts[] + prompt_order[]（符合 SillyTavern）
 */

import { ref, computed, reactive } from 'vue';

// ST 内置条目顺序
const BUILTIN_ORDER = [
    'main', 'worldInfoBefore', 'worldInfoAfter', 'personaDescription',
    'charDescription', 'charPersonality', 'scenario', 'enhanceDefinitions',
    'nsfw', 'dialogueExamples', 'chatHistory', 'jailbreak', 'summary', 'SPresetSettings'
];

const REGEN_UID = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const NEW_IDENTIFIER = () => {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* 忽略 */ }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};
const deepCopy = (obj) => JSON.parse(JSON.stringify(obj === undefined ? null : obj));

const ITEM_FIELDS = ['name', 'content', 'enabled', 'role', 'injection_position', 'injection_depth', 'injection_order', 'system_prompt', 'marker', 'forbid_overrides'];

export function usePresetStitch({
    presets,           // ref: 所有预设
    activePreset,      // ref: 当前激活预设（写回模式用）
    showToast,         // fn: 移动端 toast 提示（来自 vant）
    confirm,           // fn: 确认对话框
    snippets = ref([]) // ref: 常用条目库（可选）
}) {
    // ========== 状态 ==========
    const showModal = ref(false);
    const step = ref(1);                    // 1=选基座 / 2=选源 / 3=条目池 / 4=工作台 / 5=预览
    const mode = ref('new');                // new | overwrite | current
    const basePath = ref('');               // 基座预设 path
    const overwritePath = ref('');          // 覆盖目标 path
    const newName = ref('');                // 新预设名（new 模式）
    const sourcePaths = ref([]);            // 源预设 path[]
    const poolQuery = ref('');              // 条目池搜索
    const items = ref([]);                  // 工作台 staging
    const selectedUid = ref('');            // 当前选中行
    const showConflictOnly = ref(false);    // 只看冲突
    const busy = ref(false);
    
    // ========== 计算属性 ==========
    const basePreset = computed(() => {
        if (mode.value === 'current') return activePreset.value || null;
        const p = mode.value === 'overwrite' ? overwritePath.value : basePath.value;
        return presets.value.find(x => x.path === p) || null;
    });

    const basePrompts = computed(() => {
        const b = basePreset.value;
        return b && b.data && Array.isArray(b.data.prompts) ? b.data.prompts : [];
    });

    const baseTimeline = computed(() => {
        const b = basePreset.value;
        if (!b) return [];
        const data = b.data || {};
        const prompts = Array.isArray(data.prompts) ? data.prompts : [];
        const byId = new Map(prompts.map(p => [p.identifier, p]));
        const o0 = Array.isArray(data.prompt_order) && data.prompt_order.length ? data.prompt_order[0] : null;
        const order = (o0 && Array.isArray(o0.order))
            ? o0.order
            : prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
        return order.map((o, i) => {
            const p = byId.get(o.identifier);
            return {
                index: i,
                identifier: o.identifier,
                enabled: o.enabled !== false,
                name: (p && (p.name || p.identifier)) || o.identifier,
                isBuiltin: BUILTIN_ORDER.includes(o.identifier),
                len: p && typeof p.content === 'string' ? p.content.length : 0,
                missing: !p
            };
        });
    });

    const baseIdentifierSet = computed(() => new Set(baseTimeline.value.map(t => t.identifier)));

    const sourceCandidates = computed(() => presets.value.filter(p => p.path));

    const poolGroups = computed(() => {
        const q = poolQuery.value.trim().toLowerCase();
        return sourcePaths.value.map(p => {
            const preset = presets.value.find(x => x.path === p);
            if (!preset) return null;
            const prompts = (preset.data && Array.isArray(preset.data.prompts)) ? preset.data.prompts : [];
            const indexed = prompts.map((pt, i) => ({ pt, i }));
            const list = q
                ? indexed.filter(({ pt }) =>
                    String(pt.name || '').toLowerCase().includes(q) ||
                    String(pt.identifier || '').toLowerCase().includes(q) ||
                    String(pt.content || '').toLowerCase().includes(q))
                : indexed;
            return {
                path: p,
                name: (preset.data && preset.data.name) || preset.name,
                total: prompts.length,
                shown: list.map(({ pt, i }) => ({ prompt: pt, srcIndex: i }))
            };
        }).filter(Boolean);
    });

    const visibleItems = computed(() =>
        showConflictOnly.value
            ? items.value.filter(it => it.conflict)
            : items.value
    );

    const conflictCount = computed(() => items.value.filter(it => it.conflict).length);
    const pendingCount = computed(() => items.value.filter(it => it.conflict && !it.decision).length);

    // ========== 工作台操作 ==========
    const buildStageItem = (prompt, source, origin) => {
        const item = {
            uid: REGEN_UID(),
            origin,                           // 'source' | 'custom'
            sourcePath: source.path || '',
            sourceName: source.name || '',
            sourceIndex: source.index === undefined ? -1 : source.index,
            conflict: null,
            decision: '',                     // '' | 'source' | 'target' | 'rename' | 'skip'
            place: 'append',                  // append | builtin | after | before
            anchorUid: '',
            selected: true
        };
        for (const f of ITEM_FIELDS) item[f] = prompt[f] !== undefined ? deepCopy(prompt[f]) : undefined;
        item.identifier = String(prompt.identifier || '');
        if (item.name === undefined) item.name = '';
        if (item.content === undefined) item.content = '';
        if (item.enabled === undefined) item.enabled = true;
        if (item.role === undefined) item.role = 'system';
        if (item.injection_position === undefined) item.injection_position = 0;
        if (item.injection_depth === undefined) item.injection_depth = 4;
        if (item.injection_order === undefined) item.injection_order = 100;
        return item;
    };

    const addItem = (prompt, group) => {
        const dup = items.value.find(it => it.origin === 'source' && it.sourcePath === group.path && it.identifier === prompt.identifier);
        if (dup) {
            showToast(`该条目已在工作台：「${prompt.name || prompt.identifier}」`);
            return false;
        }
        items.value.push(buildStageItem(prompt, { path: group.path, name: group.name, index: group.shown.findIndex(x => x.prompt === prompt) }, 'source'));
        refreshConflicts();
        return true;
    };

    const addAllFromPreset = (group) => {
        let n = 0;
        group.shown.forEach(({ prompt }) => {
            const dup = items.value.find(it => it.origin === 'source' && it.sourcePath === group.path && it.identifier === prompt.identifier);
            if (dup) return;
            items.value.push(buildStageItem(prompt, { path: group.path, name: group.name, index: -1 }, 'source'));
            n++;
        });
        refreshConflicts();
        if (n) showToast(`📚 从《${group.name}》加入 ${n} 条`);
    };

    const addCustom = () => {
        const item = buildStageItem({
            identifier: NEW_IDENTIFIER(),
            name: '新自定义条目',
            content: '',
            enabled: true,
            role: 'system',
            injection_position: 0,
            injection_depth: 4,
            injection_order: 100
        }, { path: '', name: '✏️ 自定义', index: -1 }, 'custom');
        items.value.push(item);
        selectedUid.value = item.uid;
        refreshConflicts();
        return item;
    };

    const removeItem = (uid) => {
        const i = items.value.findIndex(it => it.uid === uid);
        if (i >= 0) items.value.splice(i, 1);
        if (selectedUid.value === uid) selectedUid.value = '';
        refreshConflicts();
    };

    const clearItems = () => {
        if (!items.value.length) return;
        items.value = [];
        selectedUid.value = '';
    };

    const moveItem = (uid, dir) => {
        const i = items.value.findIndex(it => it.uid === uid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= items.value.length) return;
        const arr = items.value;
        const [it] = arr.splice(i, 1);
        arr.splice(j, 0, it);
    };

    // ========== 冲突检测 ==========
    const refreshConflicts = () => {
        const baseIds = new Map(baseTimeline.value.map(t => [t.identifier, t]));
        const peer = new Map();
        for (const it of items.value) {
            const key = it.identifier || `name:${it.name}`;
            const base = baseIds.get(it.identifier);
            const prev = peer.get(key);
            if (base) {
                it.conflict = {
                    type: 'base',
                    withName: base.name,
                    baseEnabled: base.enabled,
                    baseLen: base.len,
                    builtin: base.isBuiltin
                };
            } else if (prev) {
                it.conflict = { type: 'peer', withName: prev.name || prev.identifier, baseLen: 0, builtin: false };
            } else {
                it.conflict = null;
            }
            if (it.conflict) {
                if (!it.decision) it.decision = '';
            } else {
                it.decision = 'source';
            }
            if (!peer.has(key)) peer.set(key, it);
        }
    };

    const applyDecision = (decision, onlyUid) => {
        const targets = onlyUid
            ? items.value.filter(it => it.uid === onlyUid)
            : items.value.filter(it => it.conflict);
        targets.forEach(it => { it.decision = decision; });
    };

    const applyPlace = (place, anchorUid) => {
        const targets = selectedUid.value
            ? items.value.filter(it => it.uid === selectedUid.value)
            : items.value;
        targets.forEach(it => { it.place = place; if (anchorUid !== undefined) it.anchorUid = anchorUid; });
    };

    const setAnchor = (anchorUid) => {
        if (!selectedUid.value) {
            showToast('请先选中工作台的一条条目');
            return;
        }
        const it = items.value.find(x => x.uid === selectedUid.value);
        if (!it) return;
        it.anchorUid = anchorUid;
        if (it.place !== 'after' && it.place !== 'before') it.place = 'after';
        showToast(`📍 已锚定到该位置`);
    };

    const anchorLabel = (uid) => {
        if (!uid) return '未设置';
        if (uid.startsWith('b:')) {
            const t = baseTimeline.value.find(x => 'b:' + x.identifier === uid);
            return t ? `${t.name}` : '基座条目';
        }
        const it = items.value.find(x => x.uid === uid);
        return it ? it.name : '未知';
    };

    // ========== 干跑算法 ==========
    const insertByBuiltinRank = (order, ordItem) => {
        const rank = BUILTIN_ORDER.indexOf(ordItem.identifier);
        if (rank === -1) { order.push(ordItem); return; }
        for (let i = 0; i < order.length; i++) {
            const r = BUILTIN_ORDER.indexOf(order[i].identifier);
            if (r !== -1 && r > rank) { order.splice(i, 0, ordItem); return; }
        }
        order.push(ordItem);
    };

    const plan = computed(() => {
        const base = basePreset.value;
        const stats = { added: 0, overwritten: 0, skipped: 0, renamed: 0, pending: 0, finalPrompts: 0, finalOrder: 0 };
        if (!base) return { ok: false, reason: '未选择基座预设', prompts: [], prompt_order: [], stats, orderPreview: [] };

        const baseData = base.data || {};
        const prompts = Array.isArray(baseData.prompts) ? deepCopy(baseData.prompts) : [];
        const o0 = Array.isArray(baseData.prompt_order) && baseData.prompt_order.length ? baseData.prompt_order[0] : null;
        const charId = (o0 && o0.character_id) || 100001;
        let order = (o0 && Array.isArray(o0.order))
            ? deepCopy(o0.order)
            : prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));

        const promptIdx = new Map(prompts.map((p, i) => [p.identifier, i]));
        const orderIdx = new Map(order.map((o, i) => [o.identifier, i]));
        const newOnes = [];
        const newIdents = new Set();
        const overwrittenIdents = new Set();

        for (const it of items.value) {
            if (!it.selected) continue;
            if (it.conflict && !it.decision) { stats.pending++; continue; }
            const dec = it.decision || 'source';

            if (dec === 'skip' || dec === 'target') { stats.skipped++; continue; }

            if (dec === 'source' && it.conflict) {
                const pi = promptIdx.get(it.identifier);
                if (pi === undefined) { newOnes.push({ item: it, identifier: it.identifier, place: it.place, anchorUid: it.anchorUid }); continue; }
                const target = prompts[pi];
                for (const f of ITEM_FIELDS) if (it[f] !== undefined) target[f] = deepCopy(it[f]);
                const oi = orderIdx.get(it.identifier);
                if (oi !== undefined) order[oi].enabled = it.enabled !== false;
                overwrittenIdents.add(it.identifier);
                stats.overwritten++;
                continue;
            }

            const ident = dec === 'rename' ? NEW_IDENTIFIER() : (it.identifier || NEW_IDENTIFIER());
            if (dec === 'rename') stats.renamed++;
            newOnes.push({ item: it, identifier: ident, place: it.place || 'append', anchorUid: it.anchorUid || '' });
        }

        const resultIdent = new Map();
        const newIdentToItem = new Map();
        for (const n of newOnes) { resultIdent.set(n.item.uid, n.identifier); newIdentToItem.set(n.identifier, n.item); }
        const deferred = [];
        for (const n of newOnes) {
            const p = {};
            for (const f of ITEM_FIELDS) if (n.item[f] !== undefined) p[f] = deepCopy(n.item[f]);
            p.identifier = n.identifier;
            prompts.push(p);
            newIdents.add(n.identifier);
            const ordItem = { identifier: n.identifier, enabled: n.item.enabled !== false };
            if (n.place === 'append') order.push(ordItem);
            else if (n.place === 'builtin') insertByBuiltinRank(order, ordItem);
            else deferred.push({ n, ordItem });
            stats.added++;
        }

        for (const { n, ordItem } of deferred) {
            let anchorIdent = '';
            if (n.anchorUid && n.anchorUid.startsWith('b:')) anchorIdent = n.anchorUid.slice(2);
            else if (n.anchorUid) {
                const refItem = items.value.find(x => x.uid === n.anchorUid);
                anchorIdent = refItem ? (resultIdent.get(refItem.uid) || refItem.identifier) : '';
            }
            const ai = order.findIndex(o => o.identifier === anchorIdent);
            if (ai === -1) { order.push(ordItem); continue; }
            order.splice(n.place === 'before' ? ai : ai + 1, 0, ordItem);
        }

        const promptIdSet = new Set(prompts.map(p => p.identifier));
        const seenOrder = new Set();
        order = order.filter(o => {
            if (!o || !o.identifier) return false;
            if (seenOrder.has(o.identifier)) return false;
            seenOrder.add(o.identifier);
            return promptIdSet.has(o.identifier);
        });

        stats.finalPrompts = prompts.length;
        stats.finalOrder = order.length;
        return {
            ok: true,
            baseName: (baseData.name) || base.name,
            prompts,
            prompt_order: [{ character_id: charId, order }],
            stats,
            orderPreview: order.map((o, i) => {
                const p = prompts.find(x => x.identifier === o.identifier);
                const st = newIdentToItem.get(o.identifier) || items.value.find(it => it.identifier === o.identifier);
                const isNew = newIdents.has(o.identifier);
                const isOverwritten = overwrittenIdents.has(o.identifier);
                return {
                    i: i + 1,
                    identifier: o.identifier,
                    name: (p && p.name) || o.identifier,
                    enabled: o.enabled !== false,
                    from: st ? (st.origin === 'custom' ? '✏️ 自定义' : st.sourceName) : '🔒 基座',
                    isNew,
                    isOverwritten,
                    changed: isNew || isOverwritten,
                    contentLen: p && typeof p.content === 'string' ? p.content.length : 0
                };
            })
        };
    });

    const summaryText = computed(() => {
        const p = plan.value;
        if (!p.ok) return p.reason;
        const s = p.stats;
        return `新增 ${s.added} · 覆盖 ${s.overwritten} · 重命名 ${s.renamed} · 跳过 ${s.skipped}${s.pending ? ` · ⚠️ 待决策 ${s.pending}` : ''} → ${s.finalPrompts} 条`;
    });

    const previewRows = computed(() => {
        return (plan.value.orderPreview || []).map(r => r);
    });

    // ========== 执行 ==========
    const execute = async (onSave) => {
        const p = plan.value;
        if (!p.ok) { showToast(p.reason); return; }
        if (p.stats.pending > 0) { showToast(`还有 ${p.stats.pending} 条冲突未决策`); return; }
        if (p.stats.added === 0 && p.stats.overwritten === 0) { showToast('没有需要写入的条目'); return; }

        const base = basePreset.value;
        busy.value = true;
        try {
            if (mode.value === 'current') {
                const cur = activePreset.value;
                if (!cur) { showToast('未打开任何预设'); return; }
                const data = deepCopy(cur.data || {});
                data.prompts = p.prompts;
                data.prompt_order = p.prompt_order;
                const newP = { path: cur.path, name: cur.name, data };
                activePreset.value = newP;
                const idx = presets.value.indexOf(cur);
                if (idx >= 0) presets.value[idx] = newP;
                showToast('✅ 已写回当前预设（内存中，需点保存）');
                if (onSave) onSave(newP);
                close();
                return;
            }

            if (mode.value === 'overwrite') {
                const target = presets.value.find(p => p.path === overwritePath.value);
                if (!target) { showToast('未找到目标预设'); return; }
                const tName = (target.data && target.data.name) || target.name;
                const ok = await confirm(`确认覆盖《${tName}》？`);
                if (!ok) return;
                const data = deepCopy(target.data || {});
                data.prompts = p.prompts;
                data.prompt_order = p.prompt_order;
                target.data = data;
                const idx = presets.value.indexOf(target);
                if (idx >= 0) presets.value[idx] = target;
                if (activePreset.value && activePreset.value.path === target.path) activePreset.value = target;
                showToast('✅ 已覆盖预设');
                if (onSave) onSave(target);
                close();
                return;
            }

            // new：生成新预设
            const name = newName.value.trim();
            if (!name) { showToast('请输入新预设名称'); return; }
            const safe = name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
            const data = deepCopy((base && base.data) || {});
            data.name = name;
            data.prompts = p.prompts;
            data.prompt_order = p.prompt_order;
            const newPreset = {
                path: safe,
                name: safe,
                rel: safe,
                treeUri: base && base.treeUri,
                external: !!(base && base.treeUri),
                data
            };
            presets.value.push(newPreset);
            activePreset.value = newPreset;
            showToast('✅ 已生成新预设');
            if (onSave) onSave(newPreset);
            close();
        } catch (err) {
            showToast(`缝合失败: ${err.message}`);
        } finally {
            busy.value = false;
        }
    };

    // ========== 打开/关闭 ==========
    const open = () => {
        if (!presets.value.length) { showToast('尚未加载预设'); return; }
        step.value = 1;
        mode.value = 'new';
        basePath.value = (presets.value[0] && presets.value[0].path) || '';
        overwritePath.value = (activePreset.value && activePreset.value.path) || '';
        newName.value = `缝合_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
        sourcePaths.value = [];
        poolQuery.value = '';
        items.value = [];
        selectedUid.value = '';
        showConflictOnly.value = false;
        showModal.value = true;
    };

    const close = () => {
        showModal.value = false;
    };

    const toggleSource = (p) => {
        const i = sourcePaths.value.indexOf(p.path);
        if (i >= 0) sourcePaths.value.splice(i, 1);
        else sourcePaths.value.push(p.path);
        sourcePaths.value = [...sourcePaths.value];
    };

    const selectAllSources = () => {
        sourcePaths.value = sourceCandidates.value.map(p => p.path);
    };

    const clearSources = () => {
        sourcePaths.value = [];
    };

    return {
        showModal, open, close, step,
        mode, basePath, overwritePath, newName,
        basePreset, basePrompts, baseTimeline,
        sourcePaths, sourceCandidates, toggleSource, selectAllSources, clearSources,
        poolQuery, poolGroups,
        items, visibleItems, selectedUid, showConflictOnly,
        addItem, addAllFromPreset, addCustom, removeItem, clearItems, moveItem,
        conflictCount, pendingCount,
        refreshConflicts, applyDecision, applyPlace, setAnchor, anchorLabel,
        plan, summaryText, previewRows,
        execute, busy, snippets
    };
}
