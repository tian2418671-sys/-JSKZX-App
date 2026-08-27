<template>
    <div class="view-page">
        <van-nav-bar title="世界书" safe-area-inset-top>
            <template #right>
                <van-icon name="cluster-o" size="20" style="margin-right: 14px" @click="onDedupe" />
                <van-icon name="replay" size="20" @click="reload" />
            </template>
        </van-nav-bar>

        <div class="view-body">
            <div v-if="library.loading"><div class="status-wrap"><van-loading>加载库…</van-loading></div></div>

            <!-- 打开编辑器 -->
            <template v-if="editing">
                <van-nav-bar
                    :title="editing.name"
                    left-arrow
                    @click-left="closeEditor"
                    class="sub-nav"
                >
                    <template #right>
                        <van-icon name="success" size="20" :color="'#06b6d4'" @click="saveAll" />
                    </template>
                </van-nav-bar>
                <van-button block icon="plus" type="primary" plain style="margin: 10px 12px" @click="addEntry">添加条目</van-button>
                <div v-for="(e, key) in editing.entries" :key="key" class="wb-item">
                    <div class="wb-head">
                        <van-switch v-model="e.enabled" size="20px" />
                        <van-field v-model="e.comment" placeholder="条目名(comment)" class="wb-name" />
                        <van-icon name="delete-o" color="#ee0a24" size="18" @click="removeEntry(key)" />
                    </div>
                    <van-field v-model="e.content" type="textarea" rows="3" autosize placeholder="条目内容" />
                </div>
                <van-empty v-if="!Object.keys(editing.entries || {}).length" description="无条目" image-size="60" />
            </template>

            <!-- 文件列表 -->
            <template v-else>
                <van-cell-group inset title="卡内世界书">
                    <van-cell
                        v-for="card in cardWithWb"
                        :key="card.path"
                        :title="card.name"
                        :label="`${entryCount(card)} 条条目 · ${card.category}`"
                        is-link
                        @click="openCardWb(card)"
                    />
                    <van-empty v-if="!cardWithWb.length" description="暂无卡片内嵌世界书" image-size="60" />
                </van-cell-group>

                <van-cell-group inset title="独立世界书文件">
                    <van-cell
                        v-for="wb in library.worldbooks"
                        :key="wb.path"
                        :title="wb.name"
                        :label="`${Object.keys(wb.wb.entries || {}).length} 条条目`"
                        is-link
                        @click="openFileWb(wb)"
                    />
                    <van-empty v-if="!library.worldbooks.length" description="暂无独立世界书文件" image-size="60" />
                </van-cell-group>
            </template>
        </div>

        <!-- 查重弹窗(独立世界书) -->
        <DedupeModal
            v-model:show="showDedupe"
            mode="worldbook"
            @cleaned="reload"
        />
    </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { showSuccessToast, showToast } from 'vant';
import { mobileLibrary, loadLibrary } from '../useMobileLibrary';
import DedupeModal from '../components/DedupeModal.vue';

export default {
    name: 'WorldbookView',
    components: { DedupeModal },
    setup() {
        const editing = ref(null); // { path, name, entries, payload, wrapped }
        const library = mobileLibrary;
        const showDedupe = ref(false);

        /** 查重入口(独立世界书) */
        function onDedupe() {
            if (!library.worldbooks.length) {
                showToast('世界书库为空，无法查重');
                return;
            }
            showDedupe.value = true;
        }

        const cardWithWb = computed(() =>
            library.library.filter((c) => {
                const wb = c.data && c.data.data && c.data.data.extensions && c.data.data.extensions.world_book;
                return wb && wb.entries && Object.keys(wb.entries).length;
            })
        );

        function entryCount(card) {
            const wb = card.data.data.extensions.world_book;
            return Object.keys(wb.entries).length;
        }

        function reload() { loadLibrary(); }

        async function openCardWb(card) {
            const wb = card.data.data.extensions.world_book;
            editing.value = {
                path: card.path,
                name: card.name + '（卡内）',
                entries: wb.entries,
                wrapped: false,
                card
            };
        }

        async function openFileWb(wb) {
            const entries = wb.wb.entries || (typeof wb.wb.entries === 'object' ? wb.wb.entries : {});
            editing.value = {
                path: wb.path,
                name: wb.name,
                entries,
                wrapped: wb.wrapped,
                file: wb,
                payload: wb.wb
            };
        }

        function closeEditor() { editing.value = null; }

        function addEntry() {
            if (!editing.value) return;
            const key = 'wb_' + Date.now().toString(36);
            editing.value.entries[key] = { comment: '', content: '', enabled: true, keys: [], selective: false, constant: false, position: 0 };
        }

        function removeEntry(key) {
            if (!editing.value) return;
            delete editing.value.entries[key];
        }

        async function saveAll() {
            const ed = editing.value;
            if (!ed) return;
            let payload;
            if (ed.card) {
                // 卡内世界书:保存整卡
                const res = await window.electronAPI.saveCard(ed.path, JSON.parse(JSON.stringify(ed.card.data)));
                res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
            } else {
                // 独立世界书文件:按原结构回写
                const body = ed.wrapped ? { extensions: { world_book: ed.payload } } : ed.payload;
                const res = await window.electronAPI.saveCard(ed.path, JSON.stringify(body, null, 2));
                res && res.success ? showSuccessToast('已保存') : showToast((res && res.error) || '保存失败');
            }
        }

        onMounted(() => {
            if (!library.ready) loadLibrary();
        });

        return {
            library, cardWithWb, editing, entryCount, reload, showDedupe, onDedupe,
            openCardWb, openFileWb, closeEditor, addEntry, removeEntry, saveAll
        };
    }
};
</script>

<style scoped>
.view-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.view-body { flex: 1; overflow-y: auto; padding: 4px 0 24px; }
.sub-nav { box-shadow: 0 1px 4px rgba(0,0,0,.05); margin-bottom: 4px; }
.status-wrap { padding: 40px 0; text-align: center; }
.wb-item {
    border: 1px solid var(--van-gray-3, #ebedf0);
    border-radius: 10px;
    padding: 8px 10px 4px;
    margin: 10px 12px 0;
    background: var(--van-background-2, #fff);
}
.wb-head { display: flex; align-items: center; gap: 8px; }
.wb-name { flex: 1; }
</style>