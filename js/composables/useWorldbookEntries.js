/**
 * 世界书词条深度编辑（Entry IDE）组合式函数
 * 从 App.vue 拆分而来，收敛：世界书（独立世界书库模式）词条的新增/删除/克隆，以及词条搜索过滤。
 * activeWorldbook 等共享状态保留在 App.vue 并注入；行为保持不变。
 */
import { ref, computed } from 'vue';

export function useWorldbookEntries({ activeWorldbook, addLog, confirmDialog }) {
    // =========================================================
    // 🌍 世界书词条深度编辑逻辑 (Entry IDE)
    // =========================================================
    // 新增一条空白词条
    const addWorldbookEntry = () => {
        if (!activeWorldbook.value) return;
        if (!Array.isArray(activeWorldbook.value.data.entries)) {
            activeWorldbook.value.data.entries = [];
        }

        // 生成唯一 UID（字符串：时间戳 + 随机段，避免同毫秒冲突）
        const newUid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        activeWorldbook.value.data.entries.unshift({
            uid: newUid,
            key: [],            // 主触词
            keysecondary: [],   // 次级触词
            content: '',        // 正文
            constant: false,    // 是否常驻
            selective: false,   // 是否条件触发
            insertion_order: 50, // 插入顺序
            order: 100,         // 权重
            position: 1,        // 插入位置 (0: 顶部, 1: 底部, 2: 聊天前等)
            enabled: true,      // 启用状态
            _collapsed: false   // 折叠状态（仅 IDE 展示用，保存时剔除）
        });

        addLog(`➕ 新增了一条空白世界书词条 (UID: ${newUid})`, 'info');
    };

    // 删除一条词条（⚠️ Electron 中 window.confirm 静默返回 null，必须走 confirmDialog 原生确认框）
    // 接收词条对象而非索引——列表可能处于搜索过滤态，索引会错位
    const deleteWorldbookEntry = async (entry) => {
        if (!activeWorldbook.value) return;
        const entries = activeWorldbook.value.data.entries;
        const index = entries.indexOf(entry);
        if (index === -1) return;
        const ok = await confirmDialog('确定要删除这条世界书设定吗？操作不可逆！');
        if (ok) {
            entries.splice(index, 1);
            addLog(`🗑️ 删除了第 ${index + 1} 个词条`, 'warning');
        }
    };

    // =========================================================
    // 🎛️ 世界书词条 IDE 控制栏（搜索 / 折叠 / 克隆）
    // =========================================================
    const entrySearchQuery = ref('');         // 词条关键字实时搜索

    // 动态过滤搜索后的词条（触发词 / 次级触词 / 正文 / 备注 全字段匹配）
    const filteredWorldbookEntries = computed(() => {
        if (!activeWorldbook.value || !Array.isArray(activeWorldbook.value.data.entries)) return [];
        const q = entrySearchQuery.value.trim().toLowerCase();
        if (!q) return activeWorldbook.value.data.entries;

        return activeWorldbook.value.data.entries.filter(entry => {
            const keysStr = Array.isArray(entry.key) ? entry.key.join(' ') : String(entry.key || '');
            const secKeysStr = Array.isArray(entry.keysecondary) ? entry.keysecondary.join(' ') : '';
            const contentStr = entry.content || '';
            const commentStr = entry.comment || '';
            return keysStr.toLowerCase().includes(q) ||
                   secKeysStr.toLowerCase().includes(q) ||
                   contentStr.toLowerCase().includes(q) ||
                   commentStr.toLowerCase().includes(q);
        });
    });

    // 克隆指定词条（在后方插入副本）
    const duplicateWorldbookEntry = (entry) => {
        if (!activeWorldbook.value) return;
        const entries = activeWorldbook.value.data.entries;
        const index = entries.indexOf(entry);
        if (index === -1) return;

        const cloned = JSON.parse(JSON.stringify(entry));
        cloned.uid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        cloned.comment = (cloned.comment || '词条') + ' (副本)';
        cloned._collapsed = false;

        entries.splice(index + 1, 0, cloned);
        addLog(`📋 成功复制了第 ${index + 1} 条词条`, 'info');
    };

    return {
        addWorldbookEntry, deleteWorldbookEntry, duplicateWorldbookEntry,
        entrySearchQuery, filteredWorldbookEntries
    };
}