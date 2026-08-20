<!--
  EditorPanel 右侧编辑器面板（角色卡编辑工作区 + 世界书 Entry IDE + 全局终端控制台）（子组件）
  ⚠️ 所有状态/方法经 provide/inject 从 App.vue 共享（inject('appCtx') 后按名解构）；
      ref="chatContainer" 写回父级 ref（sendMessage 滚动依赖）
-->
<template>
    <main class="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">

        <!-- 🎴 引擎 A：角色卡编辑工作区 -->
        <div v-show="appMode === 'characters'" class="flex-1 flex flex-col overflow-hidden min-h-0">

        <template v-if="cardData">
            <!-- 编辑器头部: 角色名与保存动作 -->
            <div class="h-12 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 bg-zinc-900">
                <div class="flex items-center gap-3 w-1/2">
                    <!-- 立绘缩略卡 -->
                    <div v-if="imgUrl && viewOptions.showAvatarPreview" class="relative group cursor-pointer shrink-0 rounded-lg overflow-hidden border border-zinc-700 shadow-sm" @click="openImageModal(imgUrl)" title="点击查看高清大立绘">
                        <img :src="imgUrl" class="w-10 h-10 object-cover object-top transition-transform duration-300 group-hover:scale-110" alt="角色立绘">
                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span class="text-sm">🔍</span>
                        </div>
                    </div>
                    <input :value="safeData.name" @input="updateName($event.target.value)" class="font-bold text-base bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 outline-none w-full px-1 py-0.5 transition text-zinc-100 placeholder-zinc-500" placeholder="角色名称">
                    <div v-if="viewOptions.showTokenStats" class="hidden md:flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-[11px] shrink-0" title="预估总 Token 消耗量">
                        <span>⚡ 预估 Token:</span>
                        <span class="font-bold">{{ cardTokenStats.total }}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <!-- ⚙️ 操作下拉菜单开关（菜单本体经 <Teleport to="body"> 渲染到 body 顶层 + fixed 定位，物理上不可能被编辑器内任何元素遮挡或裁剪） -->
                    <button ref="toolbarMenuBtn" @click="toggleToolbarMenu"
                            :title="isToolbarMenuOpen ? '收起操作菜单' : '展开操作菜单'"
                            class="tb-btn bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white">
                        <span class="ico">⚙️</span>{{ isToolbarMenuOpen ? '收起' : '菜单' }}
                    </button>

                    <div class="w-px h-4 bg-zinc-700 mx-1"></div>
                    <button @click="reset" class="px-2 py-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 rounded transition" title="关闭卡片">✕</button>
                </div>
            </div>

            <!-- 分组与标签工具栏（合并紧凑版） -->
            <div class="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 flex flex-wrap gap-x-3 gap-y-1 items-center shrink-0">
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[11px] text-zinc-400 font-medium whitespace-nowrap">分组:</span>
                    <select v-model="currentCardCategory" @change="handleCardCategoryChange" class="bg-zinc-800 border border-zinc-700 text-[11px] rounded px-1.5 py-0.5 outline-none focus:border-blue-500 font-medium text-zinc-300">
                        <option v-for="cat in allCategories.filter(c => c.key !== 'all')" :key="cat.key" :value="cat.key">
                            📁 {{ getCategoryDisplayName(cat) }}
                        </option>
                    </select>
                    <button @click="addNewCategory" class="text-[11px] text-blue-400 hover:text-blue-300 font-bold" title="创建新分组">➕</button>
                </div>
                <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span class="text-[11px] font-bold text-zinc-400 whitespace-nowrap">标签:</span>
                    <button @click="toggleTagLangMode" title="切换标签语言显示" class="text-[10px] px-1.5 py-0.5 bg-zinc-800 hover:bg-blue-600 hover:text-white rounded transition font-bold text-zinc-400">
                        {{ tagLangMode === 'both' ? '🌐' : (tagLangMode === 'cn' ? '🇨🇳' : '🇺🇸') }}
                    </button>
                    <span v-for="tag in activeCardTags" :key="tag"
                          class="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                        {{ displayTagText(tag) }}
                        <button @click="removeSingleTag(tag)" class="hover:text-red-400 hover:bg-indigo-500/20 rounded-full w-3 h-3 flex items-center justify-center transition-colors">✕</button>
                    </span>
                    <button @click="addSingleTag" class="text-[10px] text-zinc-500 hover:text-indigo-400 border border-dashed border-zinc-700 hover:border-indigo-500 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                        + 贴标签
                    </button>
                </div>
            </div>

            <!-- 系统/全局标签快捷添加（默认收起，点击展开；支持输入新增与 × 彻底删除） -->
            <div class="px-3 py-1 border-b border-zinc-800 bg-zinc-900 shrink-0 flex items-center justify-between cursor-pointer select-none" @click="isEditingSystemTags = !isEditingSystemTags">
                <span class="text-[11px] text-zinc-400">💡 系统/常用标签快速添加 <span class="text-zinc-500">({{ globalAvailableTags.length }})</span></span>
                <span class="text-[10px] text-blue-400 font-medium">{{ isEditingSystemTags ? '收起 ▲' : '展开 ▼' }}</span>
            </div>
            <div v-if="isEditingSystemTags" class="px-3 pb-2 pt-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
                <div class="flex items-center gap-2 mb-2">
                    <input v-model="newGlobalTagInput" @keyup.enter="addTagToGlobalPool" type="text" placeholder="输入并回车直接新增全局标签..." class="flex-1 bg-zinc-800 border border-zinc-700 text-[11px] px-2 py-1 rounded outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                    <button @click="addTagToGlobalPool" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded transition shadow-sm font-bold">添加</button>
                    <button @click="clearAllTagsFromPool" title="一键清空所有标签（系统库 + 全库卡片）" class="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] rounded transition shadow-sm font-bold whitespace-nowrap">🧹 一键清空</button>
                    <button @click="isBatchDeleteTags = !isBatchDeleteTags; if (!isBatchDeleteTags) batchSelectedTags = new Set()"
                            :class="isBatchDeleteTags ? 'bg-red-600 text-white border-red-600' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'"
                            class="px-3 py-1 text-[11px] rounded transition shadow-sm font-bold whitespace-nowrap border" title="进入批量模式，勾选多个标签后一键删除">☑️ 批量删除</button>
                </div>

                <div class="flex flex-wrap gap-1 p-1.5 bg-zinc-800/60 rounded border border-zinc-700 overflow-y-auto custom-scrollbar max-h-40">
                    <span v-for="tag in globalAvailableTags" :key="tag"
                          :class="isBatchDeleteTags
                              ? (batchSelectedTags.has(tag) ? 'bg-red-600 text-white border-red-600' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700')
                              : (activeCardTags.includes(tag) ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700')"
                          class="text-[10px] px-2 py-0.5 rounded transition shadow-sm border flex items-center gap-1 group cursor-pointer"
                          @click="isBatchDeleteTags ? toggleBatchTagSelect(tag) : addGlobalTag(tag)">
                        <template v-if="isBatchDeleteTags">
                            <span>{{ batchSelectedTags.has(tag) ? '☑' : '☐' }} {{ tag }}</span>
                        </template>
                        <template v-else>
                            <span>+ {{ tag }}</span>
                            <span @click.stop="removeTagFromGlobalPool(tag)" class="text-zinc-500 group-hover:text-red-400 hover:bg-red-500/20 hover:text-red-400 rounded-full w-3 h-3 flex items-center justify-center transition-colors font-bold ml-1" title="彻底删除此标签">×</span>
                        </template>
                    </span>
                    <div v-if="globalAvailableTags.length === 0" class="text-xs text-zinc-500 py-1">暂无可选标签，请输入后添加</div>
                </div>

                <!-- 批量删除标签操作栏 -->
                <div v-if="isBatchDeleteTags" class="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-zinc-700">
                    <span class="text-[10px] text-red-400 font-bold">已选 {{ batchSelectedTags.size }} 个标签</span>
                    <div class="flex-1"></div>
                    <button @click="selectAllBatchTags" class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded border border-zinc-700 transition">全选</button>
                    <button @click="exitBatchDeleteTags" class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded border border-zinc-700 transition">取消</button>
                    <button @click="confirmBatchDeleteTags" :disabled="batchSelectedTags.size === 0" class="px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-[10px] rounded font-bold transition">🗑️ 删除选中 ({{ batchSelectedTags.size }})</button>
                </div>
            </div>

            <!-- 紧凑型 Tab 栏 -->
            <div class="flex border-b border-zinc-800 bg-zinc-900 px-2 shrink-0 overflow-x-auto custom-scrollbar-x">
                <button v-for="tab in tabs" :key="tab.id" @click="currentTab = tab.id; if(tab.action) tab.action()"
                    :class="['px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5',
                    currentTab === tab.id ? 'border-blue-500 text-blue-400 bg-zinc-950' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200']">
                    {{ tab.icon }} {{ tab.name }}
                    <span v-if="tab.badge" class="px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-[9px] rounded-full ml-1">{{ tab.badge }}</span>
                </button>
            </div>

            <!-- 核心内容滚动区 -->
            <div class="flex-1 overflow-y-auto bg-zinc-950 p-4 pb-10 custom-scrollbar text-zinc-200">

                <!-- 1. 基础设定 (Basic) -->
                <div v-if="currentTab === 'basic'" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-1">
                            <div class="flex justify-between items-center mb-1">
                                <label class="text-xs font-bold text-zinc-400 uppercase">性格特征 (Personality)</label>
                                <button @click="openTextModal('性格特征 (Personality)', safeData, 'personality')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                            </div>
                            <textarea v-model="safeData.personality" @input="refreshCardData" rows="4" class="w-full text-xs p-2 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                        </div>
                        <div class="flex flex-col gap-1">
                            <div class="flex justify-between items-center mb-1">
                                <label class="text-xs font-bold text-zinc-400 uppercase">初始场景 (Scenario)</label>
                                <button @click="openTextModal('初始场景 (Scenario)', safeData, 'scenario')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                            </div>
                            <textarea v-model="safeData.scenario" @input="refreshCardData" rows="4" class="w-full text-xs p-2 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                        </div>
                    </div>

                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-zinc-400 uppercase">详细设定 (Description)</label>
                            <button @click="openTextModal('详细设定 (Description)', safeData, 'description')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大全屏查看 / 编辑</button>
                        </div>
                        <textarea v-model="safeData.description" @input="refreshCardData" rows="8" class="w-full text-xs p-2 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                    </div>

                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-blue-400 uppercase">初次问候 (First Message)</label>
                            <button @click="openTextModal('初次问候 (First Message)', safeData, 'first_mes')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大全屏查看 / 编辑</button>
                        </div>
                        <textarea v-model="safeData.first_mes" @input="refreshCardData" rows="8" class="w-full text-xs p-2 border border-blue-500/40 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                    </div>

                    <div v-if="viewOptions.showTokenStats" class="mt-6 p-3 bg-zinc-900 border border-zinc-800 rounded text-xs space-y-2">
                        <div class="font-bold text-zinc-300 flex justify-between items-center">
                            <span>📊 卡片重量与 Token 消耗明细</span>
                            <span class="text-amber-400 font-bold">总计: ~{{ cardTokenStats.total }} Tokens</span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-zinc-400">
                            <div class="bg-zinc-800 p-1.5 rounded border border-zinc-700">详细设定: <b>{{ cardTokenStats.desc }}</b></div>
                            <div class="bg-zinc-800 p-1.5 rounded border border-zinc-700">性格特征: <b>{{ cardTokenStats.pers }}</b></div>
                            <div class="bg-zinc-800 p-1.5 rounded border border-zinc-700">初始场景: <b>{{ cardTokenStats.scen }}</b></div>
                            <div class="bg-zinc-800 p-1.5 rounded border border-zinc-700">初次问候: <b>{{ cardTokenStats.first }}</b></div>
                            <div class="bg-zinc-800 p-1.5 rounded border border-zinc-700">世界书合集: <b>{{ cardTokenStats.book }}</b></div>
                        </div>
                    </div>
                </div>

                <!-- 进阶设定 -->
                <div v-if="currentTab === 'advanced'" class="space-y-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-zinc-400 uppercase">系统提示词 (System Prompt)</label>
                            <button @click="openTextModal('系统提示词 (System Prompt)', safeData, 'system_prompt')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                        </div>
                        <textarea v-model="safeData.system_prompt" @input="refreshCardData" rows="5" class="w-full text-xs p-2 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-zinc-400 uppercase">历史记录后注入 (Post History Instructions)</label>
                            <button @click="openTextModal('历史记录后注入 (Post History Instructions)', safeData, 'post_history_instructions')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                        </div>
                        <textarea v-model="safeData.post_history_instructions" @input="refreshCardData" rows="5" class="w-full text-xs p-2 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                    </div>
                    <div v-if="safeData.extensions?.depth_prompt" class="flex flex-col gap-1">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-purple-400 uppercase">深度提示词 (深度: {{ safeData.extensions.depth_prompt.depth }})</label>
                            <button @click="openTextModal('深度提示词', safeData.extensions.depth_prompt, 'prompt')" class="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                        </div>
                        <textarea v-model="safeData.extensions.depth_prompt.prompt" @input="refreshCardData" rows="4" class="w-full text-xs p-2 border border-purple-500/40 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"></textarea>
                    </div>
                    <div v-if="safeData.alternate_greetings && safeData.alternate_greetings.length > 0">
                        <label class="text-xs font-bold text-zinc-400 uppercase mb-2 block">附加问候语 (Alternate Greetings)</label>
                        <div class="space-y-2">
                            <div v-for="(greeting, index) in safeData.alternate_greetings" :key="index" class="relative">
                                <span class="absolute top-1 right-2 bg-zinc-800 text-zinc-500 text-[10px] font-bold px-1.5 py-0.5 rounded">#{{index + 1}}</span>
                                <textarea v-model="safeData.alternate_greetings[index]" @input="refreshCardData" rows="3" class="w-full text-xs p-2 pr-10 border border-zinc-700 rounded outline-none bg-zinc-900 text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2. 世界书 (Worldbook) —— 增强版：搜索过滤 + 词条增删/克隆/排序 + 启用/常驻/条件开关 + 标签化触发词 -->
                <div v-if="currentTab === 'worldbook'">
                    <div v-if="worldbookEntries.length > 0">

                        <!-- 工具栏：计数 + 搜索 + 新增 + 折叠 -->
                        <div class="bg-zinc-900 p-2 rounded border border-zinc-800 mb-3">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-xs text-zinc-400 font-bold">共 {{ worldbookEntries.length }} 条世界书设定<span v-if="characterWorldbookSearchQuery.trim()" class="text-blue-400">（筛选后 {{ filteredCharacterWorldbookEntries.length }} 条）</span></span>
                                <div class="flex gap-2">
                                    <button @click="expandAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部展开</button>
                                    <button @click="collapseAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部折叠</button>
                                    <button @click="extractWorldbookFromCard(cardData, safeData.name)" class="text-xs px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 border border-amber-500/30 rounded text-amber-100 transition whitespace-nowrap" title="把该卡片内嵌世界书提取为独立世界书">📤 提取为世界书</button>
                                </div>
                            </div>
                            <div class="flex gap-2 items-center">
                                <input v-model="characterWorldbookSearchQuery" type="text" placeholder="🔍 搜索: 触发词 / 正文 / 备注..." class="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 outline-none text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                                <button @click="addCharacterWorldbookEntry" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded whitespace-nowrap">➕ 新增词条</button>
                            </div>
                        </div>

                        <!-- 词条列表 -->
                        <div class="space-y-2">
                            <div v-if="filteredCharacterWorldbookEntries.length === 0" class="text-zinc-500 text-center py-8 border border-dashed border-zinc-800 rounded">无匹配词条</div>
                            <div v-for="(entry, index) in filteredCharacterWorldbookEntries" :key="getEntryUid(entry)" class="bg-zinc-900 border border-zinc-800 rounded shadow-sm overflow-hidden transition-all" :class="{ 'opacity-60': entry.enabled === false }">

                                <!-- 词条头部 -->
                                <div @click="toggleWorldbookEntry(entry)" class="px-3 py-2.5 bg-zinc-800/60 hover:bg-zinc-800 cursor-pointer flex justify-between items-center select-none">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <span class="text-zinc-500 text-xs transition-transform inline-block" :class="worldbookExpanded[getEntryUid(entry)] ? 'rotate-90' : ''">▶</span>
                                        <span class="font-bold text-xs text-zinc-200 truncate">{{ entry.comment || entry.name || '未命名条目' }}</span>
                                        <span v-if="entry.enabled === false" class="text-[10px] px-1.5 py-0.5 rounded border border-zinc-600 bg-zinc-800 text-zinc-500 whitespace-nowrap">禁用</span>
                                        <span v-if="entry.constant" class="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 whitespace-nowrap">常驻</span>
                                        <span class="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/30 truncate max-w-xs" v-if="entry.keys && entry.keys.length">
                                            🔑 {{ entry.keys.join(', ') }}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <span class="text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 border border-zinc-700">优先级: {{ entry.insertion_order ?? 50 }}</span>
                                        <button @click.stop="moveCharacterWorldbookEntry(entry, -1)" class="text-zinc-400 hover:text-white hover:bg-zinc-700 px-1 py-0.5 rounded text-xs" title="上移">↑</button>
                                        <button @click.stop="moveCharacterWorldbookEntry(entry, 1)" class="text-zinc-400 hover:text-white hover:bg-zinc-700 px-1 py-0.5 rounded text-xs" title="下移">↓</button>
                                        <button @click.stop="duplicateCharacterWorldbookEntry(entry)" class="text-zinc-400 hover:text-blue-400 hover:bg-zinc-700 px-1 py-0.5 rounded text-xs" title="克隆">⧉</button>
                                        <button @click.stop="deleteCharacterWorldbookEntry(entry)" class="text-zinc-400 hover:text-rose-400 hover:bg-zinc-700 px-1 py-0.5 rounded text-xs" title="删除">🗑</button>
                                    </div>
                                </div>

                                <!-- 词条展开详情 -->
                                <div v-if="worldbookExpanded[getEntryUid(entry)]" class="p-3 border-t border-zinc-800 bg-zinc-950/60 space-y-3 text-xs">

                                    <!-- 名称 + 优先级 + 权重 -->
                                    <div class="grid grid-cols-4 gap-2">
                                        <div class="col-span-2 flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">名称 / 备注 (Comment):</label>
                                            <input :value="entry.comment || entry.name || ''" @input="updateEntryComment(entry, $event.target.value)" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="条目名称/备注">
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">优先级:</label>
                                            <input v-model.number="entry.insertion_order" type="number" @input="refreshCardData" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="50">
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">权重:</label>
                                            <input v-model.number="entry.order" type="number" @input="refreshCardData" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="50">
                                        </div>
                                    </div>

                                    <!-- 状态开关 + 插入位置 -->
                                    <div class="grid grid-cols-4 gap-2 items-center">
                                        <label class="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input type="checkbox" :checked="entry.enabled !== false" @change="entry.enabled = $event.target.checked; refreshCardData()" class="rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0">
                                            <span :class="entry.enabled !== false ? 'text-emerald-400 font-bold' : 'text-zinc-500'">启用</span>
                                        </label>
                                        <label class="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input type="checkbox" :checked="!!entry.constant" @change="entry.constant = $event.target.checked; refreshCardData()" class="rounded bg-zinc-900 border-zinc-700 text-purple-500 focus:ring-0">
                                            <span :class="entry.constant ? 'text-purple-400 font-bold' : 'text-zinc-500'">常驻显示</span>
                                        </label>
                                        <label class="flex items-center gap-1.5 cursor-pointer select-none">
                                            <input type="checkbox" :checked="!!entry.selective" @change="entry.selective = $event.target.checked; refreshCardData()" class="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0">
                                            <span :class="entry.selective ? 'text-amber-400 font-bold' : 'text-zinc-500'">条件触发</span>
                                        </label>
                                        <div class="flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">插入位置:</label>
                                            <select :value="entry.position ?? 1" @change="entry.position = Number($event.target.value); refreshCardData()" class="bg-zinc-800 border border-zinc-700 rounded p-1 outline-none text-zinc-200">
                                                <option :value="0">顶部（定义前）</option>
                                                <option :value="1">底部（定义后）</option>
                                                <option :value="2">聊天记录前</option>
                                                <option :value="3">@D 深度提示内</option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- 触发关键词（标签化） -->
                                    <div class="flex flex-col gap-1">
                                        <label class="font-bold text-zinc-400">触发关键词 (Keys):</label>
                                        <div class="flex flex-wrap gap-1 p-1.5 bg-zinc-800 border border-zinc-700 rounded min-h-[34px] items-center">
                                            <span v-for="k in (entry.keys || [])" :key="k" class="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/30 flex items-center gap-1">
                                                {{ k }}
                                                <button @click="removeEntryKey(entry, k, 'keys')" class="hover:text-red-400">×</button>
                                            </span>
                                            <input @keydown="handleEntryKeyInput(entry, $event, 'keys')" @blur="addEntryKey(entry, $event.target.value, 'keys'); $event.target.value=''" type="text" placeholder="输入后回车/逗号添加" class="flex-1 min-w-[120px] bg-transparent outline-none text-zinc-200 placeholder-zinc-500 text-[11px]">
                                        </div>
                                    </div>

                                    <!-- 次级关键词（标签化） -->
                                    <div class="flex flex-col gap-1">
                                        <label class="font-bold text-zinc-400">次级关键词 (Secondary Keys):</label>
                                        <div class="flex flex-wrap gap-1 p-1.5 bg-zinc-800 border border-zinc-700 rounded min-h-[34px] items-center">
                                            <span v-for="k in (entry.secondary_keys || [])" :key="k" class="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                                                {{ k }}
                                                <button @click="removeEntryKey(entry, k, 'secondary_keys')" class="hover:text-red-400">×</button>
                                            </span>
                                            <input @keydown="handleEntryKeyInput(entry, $event, 'secondary_keys')" @blur="addEntryKey(entry, $event.target.value, 'secondary_keys'); $event.target.value=''" type="text" placeholder="输入后回车/逗号添加" class="flex-1 min-w-[120px] bg-transparent outline-none text-zinc-200 placeholder-zinc-500 text-[11px]">
                                        </div>
                                    </div>

                                    <!-- 正文 -->
                                    <div class="flex flex-col gap-1">
                                        <div class="flex justify-between items-center">
                                            <label class="font-bold text-zinc-400">注入正文内容 (Content):</label>
                                            <button @click="openTextModal('世界书条目正文 (Content)', entry, 'content')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition">🔍 放大</button>
                                        </div>
                                        <textarea v-model="entry.content" @input="refreshCardData" rows="6" class="w-full bg-zinc-900 border border-zinc-700 rounded p-2 outline-none text-zinc-200 resize-y leading-relaxed font-medium custom-scrollbar font-mono text-[11px] transition-all focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"></textarea>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-zinc-500 text-center py-10">此卡片未内置世界书数据
                        <button @click="addCharacterWorldbookEntry" class="ml-2 text-blue-400 hover:underline">+ 立即新增一条</button>
                    </div>
                </div>

                <!-- 正则脚本：兼容 V2/V3 的可视化编辑器 -->
                <div v-if="currentTab === 'regex'">
                    <div class="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 mb-4 shadow-sm">
                        <div class="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-bold text-amber-400">⚡ 正则与脚本配置 (Regex Scripts)</span>
                                <span class="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full font-mono">{{ regexScripts.length }} 条脚本</span>
                            </div>
                            <button @click="addRegexScript" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded shadow flex items-center gap-1 transition">
                                ➕ 添加正则脚本
                            </button>
                        </div>

                        <div v-if="regexScripts.length > 0" class="space-y-3">
                            <div v-for="(script, index) in regexScripts" :key="getRegexUid(script)" class="bg-zinc-800/80 border border-zinc-700/80 rounded-lg p-3 transition" :class="{ 'opacity-50 border-dashed': script.disabled }">
                                <div class="flex items-center justify-between gap-3 mb-2.5">
                                    <div class="flex items-center gap-2 flex-1">
                                        <span class="text-xs font-mono text-zinc-400 shrink-0">#{{ index + 1 }}</span>
                                        <input :value="script.scriptName || script.script_name || ''" @input="syncRegexScriptField(script, 'scriptName', $event.target.value)" type="text" placeholder="脚本名称 (如: 去除思考词)" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 font-medium focus:border-amber-500 focus:outline-none">
                                        <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 shrink-0 whitespace-nowrap">作用域: {{ getRegexPlacement(script.placement) }}</span>
                                    </div>
                                    <div class="flex items-center gap-3 shrink-0">
                                        <label class="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                                            <input type="checkbox" :checked="!script.disabled" @change="syncRegexScriptField(script, 'disabled', !$event.target.checked)" class="rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-0">
                                            <span :class="!script.disabled ? 'text-emerald-400 font-bold' : 'text-zinc-500'">{{ !script.disabled ? '已启用' : '已禁用' }}</span>
                                        </label>
                                        <button @click="deleteRegexScript(index)" class="text-zinc-400 hover:text-rose-400 p-1 rounded hover:bg-zinc-700/50 transition text-xs" title="删除此正则">🗑️ 删除</button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label class="block text-[10px] text-zinc-400 mb-1">🔍 查找正则表达式 (Find Regex)</label>
                                        <input :value="script.findRegex || script.find_regex || ''" @input="syncRegexScriptField(script, 'findRegex', $event.target.value)" type="text" placeholder="例: &lt;think&gt;.*?&lt;/think&gt;" class="regex-input-find w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-amber-300 font-mono focus:border-amber-500 focus:outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-[10px] text-zinc-400 mb-1">✏️ 替换为文本 (Replace With)</label>
                                        <input :value="script.replaceString !== undefined ? script.replaceString : (script.replace_string || '')" @input="syncRegexScriptField(script, 'replaceString', $event.target.value)" type="text" placeholder="留空表示直接删除匹配项" class="regex-input-replace w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-emerald-300 font-mono focus:border-amber-500 focus:outline-none">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="text-center py-6 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-xs">
                            <p class="mb-2">此角色卡暂未配置正则替换脚本</p>
                            <button @click="addRegexScript" class="text-indigo-400 hover:underline">+ 立即新增一条正则脚本</button>
                        </div>
                    </div>
                </div>

                <!-- 3. 聊天测卡 (Chat) -->
                <div v-if="currentTab === 'chat'" class="flex flex-col h-full max-w-4xl mx-auto border border-zinc-700 rounded">
                    <div class="bg-zinc-900 p-2 text-xs flex items-center justify-between border-b border-zinc-800 flex-wrap gap-2">
                        <div class="flex items-center gap-2 flex-1 flex-wrap">
                            <span class="font-bold text-zinc-400">API:</span>
                            <input v-model="apiEndpoint" type="text" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded w-64 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="http://127.0.0.1:1234/v1/chat/completions">
                            <span class="font-bold text-zinc-400 shrink-0">Key:</span>
                            <input v-model="apiKey" type="password" placeholder="留空则使用 test-key" title="远端 API 的鉴权密钥，本地 API 可留空" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded w-24 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                            <span class="font-bold text-zinc-400 shrink-0">Model:</span>
                            <select v-if="availableModels.length > 0" v-model="apiModel" class="px-2 py-1 bg-zinc-800 border border-indigo-500/80 rounded outline-none text-zinc-200 text-xs max-w-[11rem]">
                                <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
                            </select>
                            <input v-else v-model="apiModel" list="model-suggestions" type="text" placeholder="local-model 或模型 ID" title="OpenAI 兼容接口的模型名称，本地 API 可留空" class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded w-28 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50">
                            <button @click="fetchAvailableModels" :disabled="isFetchingModels" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-[11px] font-medium rounded shadow flex items-center gap-1 transition" title="拉取服务端可用模型列表">
                                <span v-if="isFetchingModels" class="animate-spin">🌀</span>
                                <span v-else>🔄</span> 拉取模型
                            </button>
                            <span v-if="fetchModelStatus" class="text-[10px] shrink-0" :class="fetchModelStatus.includes('❌') ? 'text-red-400' : 'text-emerald-400'">{{ fetchModelStatus }}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                            <button @click="isChatRenderMode = !isChatRenderMode"
                                    :class="isChatRenderMode ? 'text-indigo-400' : 'text-zinc-400'"
                                    class="font-bold mr-4 hover:opacity-80 transition-opacity">
                                {{ isChatRenderMode ? '👁️ 渲染模式' : '💻 代码模式' }}
                            </button>
                            <button @click="clearChat" class="text-red-400 hover:text-red-300 font-bold">清空记录</button>
                        </div>
                    </div>
                    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950 custom-scrollbar">
                        <template v-for="(msg, idx) in chatHistory" :key="idx">
                            <div v-if="msg.role !== 'system'" class="flex gap-3" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
                                <div class="w-8 h-8 rounded shrink-0 shadow-sm border border-zinc-700 overflow-hidden" :class="msg.role === 'user' ? 'bg-blue-600' : 'bg-zinc-700'">
                                    <img v-if="msg.role === 'assistant' && imgUrl" :src="imgUrl" class="w-full h-full object-cover">
                                </div>
                                <div class="max-w-[75%]">
                                    <div class="text-[10px] text-zinc-400 mb-0.5" :class="msg.role === 'user' ? 'text-right' : ''">{{ msg.name }}</div>
                                    <div :class="msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 border border-zinc-700 text-zinc-200'" class="p-2.5 rounded shadow-sm leading-relaxed text-[12px]">
                                        <div v-if="!isChatRenderMode" v-html="renderHTML(cleanMarkdownFences(msg.content))"></div>
                                        <div v-else v-html="renderSafeHTML(cleanMarkdownFences(msg.content))"></div>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <div v-if="isChatting" class="text-xs text-zinc-500 italic">对方正在输入...</div>
                    </div>
                    <div class="p-2 bg-zinc-900 border-t border-zinc-800 flex gap-2">
                        <textarea v-model="chatInput" @keydown.enter.exact.prevent="sendMessage" rows="2" class="flex-1 bg-zinc-800 border border-zinc-700 rounded py-1.5 px-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 resize-none text-[12px] text-zinc-200 placeholder-zinc-500 custom-scrollbar" placeholder="输入对话... (Enter 发送)"></textarea>
                        <button @click="sendMessage" :disabled="isChatting || chatInput.trim() === ''" class="px-4 bg-blue-600 text-white rounded font-bold disabled:bg-zinc-700 disabled:text-zinc-500">发送</button>
                    </div>
                </div>

                <!-- 4. 原始代码 (Raw JSON) -->
                <div v-if="currentTab === 'raw'" class="h-full">
                    <pre class="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded text-[11px] overflow-auto h-full font-mono leading-tight custom-scrollbar">{{ formattedJson }}</pre>
                </div>

            </div>
        </template>

        <div v-else class="flex flex-col items-center justify-center h-full text-zinc-500 bg-zinc-950">
            <p class="text-sm font-medium">在左侧选择角色卡进行编辑</p>
        </div>
        </div>

        <!-- 🌍 引擎 B：世界书深度编辑工作区 (Entry IDE) -->
        <div v-show="appMode === 'worldbooks'" class="flex-1 flex flex-col h-full overflow-hidden relative">

            <!-- 空状态提示 -->
            <div v-if="!activeWorldbook" class="flex-1 flex items-center justify-center text-zinc-500 flex-col gap-3">
                <span class="text-5xl opacity-30">🌍</span>
                <p class="text-sm tracking-widest">请在左侧选择一本世界书进行编辑</p>
            </div>

            <!-- 深度编辑器主体 -->
            <template v-else>
                <!-- 🎛️ IDE 控制栏 -->
                <div class="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 flex flex-wrap items-center justify-between shrink-0 gap-2 shadow-sm min-w-0">

                    <div class="flex items-center gap-2 flex-1 min-w-[120px]">
                        <span class="text-xs font-bold text-amber-500 shrink-0 truncate">📖 {{ activeWorldbook.data.name || activeWorldbook.name }}</span>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <button @click="openWbSnapshots(activeWorldbook)" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="查看当前世界书的历史快照并回滚">🕒 快照</button>
                        <button @click="openWbGraphModal" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="查看当前世界书的词条关联图谱">
                            🌐 关系图谱
                        </button>
                        <button @click="openWbImportModal" class="px-2 py-1 theme-element hover:border-emerald-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="从其他世界书按需导入词条到当前书">
                            🔀 导入词条
                        </button>
                        <button @click="exportFilteredWorldbook" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="将当前搜索过滤出的词条拆分为独立世界书">
                            📤 拆分导出
                        </button>
                        <button @click="exportActiveWorldbook" class="px-2 py-1 theme-element hover:border-indigo-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="导出单文件">📤</button>
                        <button @click="addWorldbookEntry" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded shadow transition whitespace-nowrap">➕ 新增</button>
                        <button @click="saveActiveWorldbook" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded shadow transition whitespace-nowrap">💾 保存</button>
                    </div>
                </div>

                <!-- ✅ 世界书编辑器：左侧词条列表（可收起）+ 右侧详情编辑 -->
                <div class="flex-1 flex overflow-hidden min-h-0 relative">

                    <!-- 左：词条列表侧栏 -->
                    <div class="relative h-full flex flex-col border-r border-zinc-800 bg-zinc-900/90 transition-all duration-300 shrink-0"
                         :style="{ width: isWbSidebarCollapsed ? '48px' : '260px' }">

                        <!-- ✅ 竖直长条折叠按钮（浮在栏边缘，垂直居中） -->
                        <button @click="isWbSidebarCollapsed = !isWbSidebarCollapsed"
                                class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-800 border border-zinc-700 rounded-r-md flex items-center justify-center text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 shadow-lg z-20 transition"
                                :title="isWbSidebarCollapsed ? '展开词条列表' : '收起词条列表'">
                            {{ isWbSidebarCollapsed ? '▶' : '◀' }}
                        </button>

                        <!-- 收起态：📖 可点击展开 + 竖排词条数 -->
                        <div v-if="isWbSidebarCollapsed" class="flex-1 py-4 flex flex-col items-center gap-3 text-zinc-500">
                            <span class="cursor-pointer text-lg hover:text-emerald-400 transition" @click="isWbSidebarCollapsed = false" title="展开词条列表">📖</span>
                            <span class="text-[10px] font-mono font-bold writing-vertical-rl">{{ (activeWorldbook.data && activeWorldbook.data.entries) ? activeWorldbook.data.entries.length : 0 }} 词条</span>
                        </div>

                        <!-- 展开态：搜索 + 筛选/排序 + 批量 + 词条列表 -->
                        <div v-else class="flex-1 flex flex-col overflow-hidden">
                            <div class="p-2 border-b border-zinc-800 flex gap-1 items-center shrink-0 bg-zinc-900 flex-wrap">
                                <div class="relative flex-1 min-w-[120px]">
                                    <span class="absolute left-2 top-1.5 text-zinc-500 text-xs">🔍</span>
                                    <input v-model="entrySearchQuery" type="text" placeholder="搜索触发词或备注..."
                                           class="w-full h-7 bg-zinc-800/80 border border-zinc-700 rounded pl-7 pr-2 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none transition">
                                </div>
                                <button @click="addWorldbookEntry" title="新建词条" class="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs shrink-0 transition flex items-center justify-center">➕</button>
                            </div>

                            <!-- 筛选 / 排序 / 批量 / 体检 工具行 -->
                            <div class="px-2 py-1.5 border-b border-zinc-800 flex flex-wrap gap-1.5 items-center shrink-0 bg-zinc-900/60">
                                <select v-model="entryFilterState" class="h-6 bg-zinc-800 border border-zinc-700 rounded px-1 text-[10px] text-zinc-300 focus:outline-none">
                                    <option value="all">全部状态</option>
                                    <option value="enabled">仅启用</option>
                                    <option value="disabled">仅停用</option>
                                    <option value="constant">仅常驻</option>
                                    <option value="selective">仅条件触发</option>
                                </select>
                                <select v-model="entrySortBy" class="h-6 bg-zinc-800 border border-zinc-700 rounded px-1 text-[10px] text-zinc-300 focus:outline-none">
                                    <option value="default">默认顺序</option>
                                    <option value="orderAsc">权重升序</option>
                                    <option value="orderDesc">权重降序</option>
                                    <option value="name">按名称</option>
                                    <option value="contentLen">按正文长度</option>
                                </select>
                                <button @click="toggleBatchMode"
                                        :class="batchMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'"
                                        class="h-6 px-1.5 border rounded text-[10px] transition shrink-0">☑️ 批量</button>
                                <button @click="runEntryHealthCheck" title="查重 + 空词条/孤儿触发词体检"
                                        class="h-6 px-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-amber-400 transition shrink-0">🩺 体检</button>
                            </div>

                            <!-- 批量操作栏（仅批量模式显示） -->
                            <div v-if="batchMode" class="px-2 py-1.5 border-b border-zinc-800 flex flex-wrap gap-1.5 items-center shrink-0 bg-emerald-500/10">
                                <span class="text-[10px] text-emerald-400 font-bold">已选 {{ batchSelected.size }} 条</span>
                                <button @click="selectAllEntries" class="h-6 px-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-300 transition">全选</button>
                                <button @click="clearBatchSelection" class="h-6 px-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] text-zinc-300 transition">清空</button>
                                <div class="flex-1"></div>
                                <button @click="batchToggleEnabled(true)" class="h-6 px-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-600 rounded text-[10px] transition">启用</button>
                                <button @click="batchToggleEnabled(false)" class="h-6 px-1.5 bg-zinc-700 hover:bg-zinc-600 text-white border border-zinc-600 rounded text-[10px] transition">停用</button>
                                <button @click="batchDeleteEntries" class="h-6 px-1.5 bg-rose-600 hover:bg-rose-500 text-white border border-rose-600 rounded text-[10px] transition">删除</button>
                            </div>

                            <div class="flex-1 overflow-y-auto pt-1 px-1 custom-scrollbar" :class="showEditorLogs ? 'pb-40' : 'pb-8'">
                                <div v-for="(entry, index) in filteredWorldbookEntries" :key="entry.uid || index"
                                     :id="'wb-entry-' + ensureUid(entry)"
                                     @click="batchMode ? toggleBatchSelect(entry) : selectEntry(entry)"
                                     class="group relative flex items-center gap-1.5 p-1.5 mb-0.5 rounded cursor-pointer border border-transparent hover:bg-zinc-800/80 transition"
                                     :class="currentEntry === entry ? 'bg-zinc-800 border-emerald-500/50' : ''">

                                    <input v-if="batchMode" type="checkbox" :checked="batchSelected.has(ensureUid(entry))"
                                           @click.stop @change="toggleBatchSelect(entry)"
                                           class="shrink-0 rounded accent-emerald-500">

                                    <button v-else @click.stop="toggleEntryState(entry)" class="shrink-0 w-2 h-2 rounded-full transition"
                                            :title="entry.enabled === false ? '已停用，点击启用' : '已启用，点击停用'"
                                            :class="entry.enabled !== false ? 'bg-emerald-500 shadow-[0_0_4px_#10b981]' : 'bg-zinc-600'"></button>

                                    <div class="flex-1 min-w-0 flex flex-col justify-center">
                                        <span class="text-[11px] font-bold truncate leading-tight" :class="entry.enabled !== false ? 'text-emerald-400' : 'text-zinc-500'">
                                            {{ formatKeys(entry.key) }}
                                        </span>
                                        <span v-if="entry.comment" class="text-[9px] text-zinc-500 truncate mt-0.5">{{ entry.comment }}</span>
                                        <span class="text-[9px] text-amber-500/70 font-mono mt-0.5">⚡ {{ entryTokens(entry) }}</span>
                                    </div>

                                    <div class="hidden group-hover:flex items-center gap-1 absolute right-1 bg-zinc-800/95 backdrop-blur px-1 py-0.5 rounded border border-zinc-700 shadow-sm z-10">
                                        <button @click.stop="moveEntry(entry, -1)" class="text-[10px] hover:text-white" title="上移">↑</button>
                                        <button @click.stop="moveEntry(entry, 1)" class="text-[10px] hover:text-white" title="下移">↓</button>
                                        <button @click.stop="duplicateWorldbookEntry(entry)" class="text-[10px] hover:text-blue-400" title="复制词条">📋</button>
                                        <button @click.stop="deleteWorldbookEntry(entry)" class="text-[10px] hover:text-rose-400" title="删除词条">🗑️</button>
                                    </div>
                                </div>

                                <div v-if="filteredWorldbookEntries.length === 0" class="text-center py-8 text-zinc-500 text-xs">
                                    <p>🔍 没有匹配「{{ entrySearchQuery }}」的词条</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 右：详情编辑（点击左侧词条后显示） -->
                    <div v-if="currentEntry" class="flex-1 pt-4 px-4 overflow-y-auto custom-scrollbar" :class="showEditorLogs ? 'pb-40' : 'pb-8'">
                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block text-xs font-bold text-zinc-300 mb-1">🔑 主触发词 (Key)</label>
                                <input v-model="primaryKeysStr" placeholder="逗号分隔，例如: sword, magic" class="w-full h-8 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-zinc-300 mb-1">📝 备注 (Comment)</label>
                                <input v-model="currentEntry.comment" placeholder="仅作标识用，大模型不可见" class="w-full h-8 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
                            </div>
                        </div>

                        <div class="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-4 grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-zinc-400 mb-1">🛡️ 次要触发词 (Key Secondary)</label>
                                <input v-model="secondaryKeysStr" placeholder="逗号分隔..." class="w-full h-8 bg-zinc-900/50 border border-zinc-700/80 rounded px-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-zinc-400 mb-1">⭐ 权重 / 优先级 (Order)</label>
                                <input v-model.number="currentEntry.order" type="number" class="w-full h-8 bg-zinc-900/50 border border-zinc-700/80 rounded px-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500" />
                            </div>
                        </div>

                        <div class="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-4">
                            <label class="block text-xs text-zinc-400 mb-1">📌 插入位置 (Position)</label>
                            <select v-model.number="currentEntry.position" class="w-full h-8 bg-zinc-900/50 border border-zinc-700/80 rounded px-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500">
                                <option :value="0">0 - 顶部 (全局设定)</option>
                                <option :value="1">1 - 用户输入前</option>
                                <option :value="2">2 - AI回复前</option>
                                <option :value="3">3 - 全文本</option>
                                <option :value="4">4 - 系统提示词</option>
                            </select>
                        </div>

                        <div class="flex flex-col min-h-[300px]">
                            <label class="block text-xs font-bold text-emerald-400 mb-1 flex justify-between">
                                <span>📖 词条内容 (Content)</span>
                                <span class="text-zinc-500 font-mono">字数: {{ currentEntry.content?.length || 0 }}</span>
                            </label>
                            <textarea v-model="currentEntry.content" class="w-full flex-1 bg-zinc-900 border border-zinc-700 rounded-md p-3 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 custom-scrollbar leading-relaxed min-h-[200px] resize-y" placeholder="在此输入核心设定..."></textarea>
                        </div>
                    </div>

                    <!-- 未选择词条时的占位 -->
                    <div v-else class="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                        <div class="text-center flex flex-col items-center gap-2">
                            <span class="text-3xl opacity-30">📖</span>
                            <p>在左侧选择一个词条进行编辑</p>
                        </div>
                    </div>
                </div>

            </template>
        </div>


        <!-- 📟 全局终端控制台（悬浮于 main 底部） -->
        <div class="absolute bottom-0 left-0 right-0 bg-black/95 border-t border-zinc-800 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] flex flex-col z-30 transition-all duration-300"
             :class="showEditorLogs ? 'h-36' : 'h-7'">

            <div @click="showEditorLogs = !showEditorLogs"
                 class="flex items-center justify-between px-3 py-1 bg-zinc-900/90 border-b border-zinc-800 shrink-0 cursor-pointer hover:bg-zinc-800 transition select-none">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold tracking-wider" :class="appMode === 'characters' ? 'text-indigo-400' : 'text-amber-400'">
                        TERMINAL LOGS // {{ appMode === 'characters' ? '🎴 角色卡控制器' : '🌍 世界书控制器' }}
                    </span>
                    <span class="text-[9px] text-zinc-500">
                        {{ showEditorLogs ? '▼ 点击折叠面板' : '▲ 点击展开控制台' }}
                    </span>
                </div>

                <div class="flex items-center gap-3">
                    <span class="text-[10px] text-zinc-500 font-mono">Logs: {{ editorLogs.length }}</span>
                    <button v-show="showEditorLogs" @click.stop="editorLogs = []" class="text-[10px] text-zinc-500 hover:text-white transition">
                        清空日志
                    </button>
                </div>
            </div>

            <div v-show="showEditorLogs" class="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1 custom-scrollbar">
                <div v-for="(log, i) in editorLogs" :key="i" class="flex gap-2">
                    <span class="text-zinc-600 shrink-0">[{{ log.time }}]</span>
                    <span :class="{
                        'text-emerald-400': log.type === 'success',
                        'text-rose-400': log.type === 'error',
                        'text-amber-400': log.type === 'warning',
                        'text-indigo-300': log.type === 'info'
                    }">{{ log.msg }}</span>
                </div>
                <div v-if="editorLogs.length === 0" class="text-zinc-700 text-center mt-4 italic">
                    系统就绪，等待操作指令...
                </div>
            </div>
        </div>
    </main>

    <!-- ⚙️ 操作下拉菜单：<Teleport> 渲染到 body 顶层，fixed 定位在按钮正下方；外层全屏透明遮罩，点击任意处关闭 -->
    <Teleport to="body">
        <div v-if="isToolbarMenuOpen" class="fixed inset-0 z-[9999]" @click="isToolbarMenuOpen = false">
            <div class="fixed w-48 max-h-[70vh] overflow-y-auto flex flex-col gap-1 p-1.5 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg shadow-2xl custom-scrollbar"
                 :style="{ left: toolbarMenuPos.x + 'px', top: toolbarMenuPos.y + 'px' }" @click.stop>
                <button @click="translateCardContent(); isToolbarMenuOpen = false" :disabled="isTranslating" class="tb-btn w-full bg-indigo-600 hover:bg-indigo-500 text-white" title="调用 AI 翻译角色设定/首条消息/场景/对话示例">
                    <span class="ico">🌐</span><span v-if="!isTranslating">一键汉化</span><span v-else class="animate-pulse">翻译中...</span>
                </button>
                <button @click="refactorCardFormat(); isToolbarMenuOpen = false" :disabled="isRefactoring" class="tb-btn w-full bg-emerald-600 hover:bg-emerald-500 text-white" title="将旧格式（W++/JSON）设定重构为高密度 Markdown，大幅降低 Token 占用">
                    <span class="ico">✨</span><span v-if="!isRefactoring">格式升维</span><span v-else class="animate-pulse">重构中...</span>
                </button>
                <button @click="triggerManualSnapshot(); isToolbarMenuOpen = false" class="tb-btn w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white" title="绕过冷却机制，立即将当前卡片状态备份至历史目录">
                    <span class="ico">📸</span>快照
                </button>
                <button @click="replaceCardImage(); isToolbarMenuOpen = false" class="tb-btn w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white" title="选择新立绘替换当前卡片（PNG 卡原地替换；WebP/JSON 卡转为标准 PNG 卡）">
                    <span class="ico">🖼️</span>换卡图
                </button>
                <button @click="saveToLocalDisk(); isToolbarMenuOpen = false" class="tb-btn w-full bg-blue-600 hover:bg-blue-700 text-white">
                    <span class="ico">💾</span>覆盖保存
                </button>
                <button @click="exportPackage(); isToolbarMenuOpen = false" class="tb-btn w-full bg-indigo-600 hover:bg-indigo-700 text-white" title="一键打包卡片、独立世界书与正则脚本">
                    <span class="ico">📦</span>导出
                </button>
                <button @click="deleteCard(); isToolbarMenuOpen = false" class="tb-btn w-full bg-red-600 hover:bg-red-700 text-white">
                    <span class="ico">🗑️</span>删除
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script>
import { inject, ref, computed, watch } from 'vue';
import { estimateTokens } from '../utils/tokenEstimate.js';

export default {
    name: 'EditorPanel',
    setup() {
        const ctx = inject('appCtx');

        // ✅ [工具栏下拉菜单] 操作菜单开关（本地视觉状态，不落盘；菜单 <Teleport to="body"> 渲染到顶层，fixed 定位在按钮下方，永不被遮挡/裁剪）
        const isToolbarMenuOpen = ref(false);
        const toolbarMenuBtn = ref(null);          // ⚙ 按钮 DOM（取定位坐标）
        const toolbarMenuPos = ref({ x: 0, y: 0 }); // 菜单 fixed 坐标
        const toggleToolbarMenu = () => {
            if (isToolbarMenuOpen.value) { isToolbarMenuOpen.value = false; return; }
            const rect = toolbarMenuBtn.value.getBoundingClientRect();
            const PANEL_W = 192; // w-48 = 192px
            let x = rect.right - PANEL_W; // 菜单右对齐按钮
            if (x < 8) x = 8; // 防左溢出屏幕
            toolbarMenuPos.value = { x, y: rect.bottom + 6 }; // 出现在按钮正下方
            isToolbarMenuOpen.value = true;
        };

        // ✅ [批量删除标签] 标签云批量勾选删除模式（本组件本地状态）
        const isBatchDeleteTags = ref(false); // 是否处于批量删除标签模式
        const batchSelectedTags = ref(new Set()); // 批量模式下选中的标签集合
        const toggleBatchTagSelect = (tag) => {
            const s = new Set(batchSelectedTags.value);
            if (s.has(tag)) s.delete(tag);
            else s.add(tag);
            batchSelectedTags.value = s;
        };
        const selectAllBatchTags = () => {
            batchSelectedTags.value = new Set(ctx.globalAvailableTags.value || []);
        };
        const exitBatchDeleteTags = () => {
            isBatchDeleteTags.value = false;
            batchSelectedTags.value = new Set();
        };
        const confirmBatchDeleteTags = async () => {
            const tags = Array.from(batchSelectedTags.value);
            if (tags.length === 0) return;
            const count = await ctx.batchRemoveTags(tags);
            if (count > 0) exitBatchDeleteTags();
        };

        // ✅ [世界书编辑器] 左侧词条列表可收起（纯视觉，不影响数据）
        const isWbSidebarCollapsed = ref(false);
        // ✅ [世界书编辑器] 当前选中编辑的词条（列表+详情布局）
        const currentEntry = ref(null);
        // 【修复】切换世界书时清空当前选中词条（防旧书词条残留，详情面板 v-model 误改旧书对象）
        watch(
            () => (ctx.activeWorldbook ? ctx.activeWorldbook.value : null),
            () => { currentEntry.value = null; }
        );
        const selectEntry = (entry) => {
            if (!entry) return;
            currentEntry.value = entry;
            if (isWbSidebarCollapsed.value) isWbSidebarCollapsed.value = false; // 选中时自动展开侧栏
        };
        // ✅ [世界书编辑器] 侧栏列表触发词格式化（只读展示；空则提示）
        const formatKeys = (keys) => {
            if (!keys || keys.length === 0) return '无触发词';
            return Array.isArray(keys) ? keys.join(', ') : String(keys);
        };
        // ✅ [世界书编辑器] 单条词条 Token 估算（触发词 + 次级触发词 + 正文）
        const entryTokens = (entry) => {
            if (!entry) return 0;
            const keyText = Array.isArray(entry.key) ? entry.key.join(' ') : String(entry.key || '');
            const secText = Array.isArray(entry.keysecondary) ? entry.keysecondary.join(' ') : '';
            return estimateTokens([keyText, secText, entry.content || ''].join(' '));
        };
        // ✅ [世界书编辑器] 主触发词 key 逗号分隔双向绑定（原生字段映射，不污染 JSON）
        const primaryKeysStr = computed({
            get() {
                if (!currentEntry.value || !currentEntry.value.key) return '';
                return Array.isArray(currentEntry.value.key) ? currentEntry.value.key.join(', ') : currentEntry.value.key;
            },
            set(val) {
                if (!currentEntry.value) return;
                currentEntry.value.key = val.split(',').map(k => k.trim()).filter(k => k !== '');
            }
        });
        // ✅ [世界书编辑器] 次级触发词 keysecondary 逗号分隔双向绑定
        const secondaryKeysStr = computed({
            get() {
                if (!currentEntry.value || !currentEntry.value.keysecondary) return '';
                return Array.isArray(currentEntry.value.keysecondary) ? currentEntry.value.keysecondary.join(', ') : currentEntry.value.keysecondary;
            },
            set(val) {
                if (!currentEntry.value) return;
                currentEntry.value.keysecondary = val.split(',').map(k => k.trim()).filter(k => k !== '');
            }
        });
        return {
            isWbSidebarCollapsed,
            isToolbarMenuOpen,
            toolbarMenuBtn,
            toolbarMenuPos,
            toggleToolbarMenu,
            currentEntry,
            selectEntry,
            formatKeys,
            primaryKeysStr,
            secondaryKeysStr,
            appMode: ctx.appMode,
            cardData: ctx.cardData,
            imgUrl: ctx.imgUrl,
            viewOptions: ctx.viewOptions,
            openImageModal: ctx.openImageModal,
            safeData: ctx.safeData,
            updateName: ctx.updateName,
            cardTokenStats: ctx.cardTokenStats,
            translateCardContent: ctx.translateCardContent,
            isTranslating: ctx.isTranslating,
            refactorCardFormat: ctx.refactorCardFormat,
            isRefactoring: ctx.isRefactoring,
            saveToLocalDisk: ctx.saveToLocalDisk,
            triggerManualSnapshot: ctx.triggerManualSnapshot,
            replaceCardImage: ctx.replaceCardImage,
            exportPackage: ctx.exportPackage,
            deleteCard: ctx.deleteCard,
            reset: ctx.reset,
            currentCardCategory: ctx.currentCardCategory,
            handleCardCategoryChange: ctx.handleCardCategoryChange,
            allCategories: ctx.allCategories,
            getCategoryDisplayName: ctx.getCategoryDisplayName,
            addNewCategory: ctx.addNewCategory,
            toggleTagLangMode: ctx.toggleTagLangMode,
            tagLangMode: ctx.tagLangMode,
            activeCardTags: ctx.activeCardTags,
            displayTagText: ctx.displayTagText,
            removeSingleTag: ctx.removeSingleTag,
            addSingleTag: ctx.addSingleTag,
            isEditingSystemTags: ctx.isEditingSystemTags,
            globalAvailableTags: ctx.globalAvailableTags,
            newGlobalTagInput: ctx.newGlobalTagInput,
            addTagToGlobalPool: ctx.addTagToGlobalPool,
            removeTagFromGlobalPool: ctx.removeTagFromGlobalPool,
            clearAllTagsFromPool: ctx.clearAllTagsFromPool,
            addGlobalTag: ctx.addGlobalTag,
            // ✅ [批量删除标签] 标签云批量勾选删除
            isBatchDeleteTags,
            batchSelectedTags,
            toggleBatchTagSelect,
            selectAllBatchTags,
            exitBatchDeleteTags,
            confirmBatchDeleteTags,
            tabs: ctx.tabs,
            currentTab: ctx.currentTab,
            openTextModal: ctx.openTextModal,
            refreshCardData: ctx.refreshCardData,
            worldbookEntries: ctx.worldbookEntries,
            getEntryUid: ctx.getEntryUid,
            toggleWorldbookEntry: ctx.toggleWorldbookEntry,
            worldbookExpanded: ctx.worldbookExpanded,
            expandAllWorldbook: ctx.expandAllWorldbook,
            collapseAllWorldbook: ctx.collapseAllWorldbook,
            getKeysString: ctx.getKeysString,
            updateEntryKeys: ctx.updateEntryKeys,
            // 🎛️ 角色卡内嵌世界书细化操作（词条增删/克隆/排序/搜索/标签化触发词）
            characterWorldbookSearchQuery: ctx.characterWorldbookSearchQuery,
            filteredCharacterWorldbookEntries: ctx.filteredCharacterWorldbookEntries,
            addCharacterWorldbookEntry: ctx.addCharacterWorldbookEntry,
            deleteCharacterWorldbookEntry: ctx.deleteCharacterWorldbookEntry,
            duplicateCharacterWorldbookEntry: ctx.duplicateCharacterWorldbookEntry,
            moveCharacterWorldbookEntry: ctx.moveCharacterWorldbookEntry,
            addEntryKey: ctx.addEntryKey,
            removeEntryKey: ctx.removeEntryKey,
            handleEntryKeyInput: ctx.handleEntryKeyInput,
            updateEntryComment: ctx.updateEntryComment,
            // ✅ [紧凑化] 点击启用圆点切换词条启用/停用（缺失 enabled 视为启用，首次点击=停用）
            toggleEntryState: (entry) => {
                if (!entry) return;
                if (entry.enabled === undefined) entry.enabled = false;
                else entry.enabled = !entry.enabled;
            },
            regexScripts: ctx.regexScripts,
            addRegexScript: ctx.addRegexScript,
            getRegexUid: ctx.getRegexUid,
            syncRegexScriptField: ctx.syncRegexScriptField,
            getRegexPlacement: ctx.getRegexPlacement,
            deleteRegexScript: ctx.deleteRegexScript,
            apiEndpoint: ctx.apiEndpoint,
            apiKey: ctx.apiKey,
            apiModel: ctx.apiModel,
            availableModels: ctx.availableModels,
            isFetchingModels: ctx.isFetchingModels,
            fetchAvailableModels: ctx.fetchAvailableModels,
            fetchModelStatus: ctx.fetchModelStatus,
            isChatRenderMode: ctx.isChatRenderMode,
            clearChat: ctx.clearChat,
            chatContainer: ctx.chatContainer,
            chatHistory: ctx.chatHistory,
            renderHTML: ctx.renderHTML,
            renderSafeHTML: ctx.renderSafeHTML,
            cleanMarkdownFences: ctx.cleanMarkdownFences,
            isChatting: ctx.isChatting,
            chatInput: ctx.chatInput,
            sendMessage: ctx.sendMessage,
            formattedJson: ctx.formattedJson,
            activeWorldbook: ctx.activeWorldbook,
            entrySearchQuery: ctx.entrySearchQuery,
            entryFilterState: ctx.entryFilterState,
            entrySortBy: ctx.entrySortBy,
            batchMode: ctx.entryBatchMode,
            batchSelected: ctx.batchSelected,
            toggleBatchMode: ctx.toggleEntryBatchMode,
            toggleBatchSelect: ctx.toggleBatchSelect,
            selectAllEntries: ctx.selectAllEntries,
            clearBatchSelection: ctx.clearBatchSelection,
            batchToggleEnabled: ctx.batchToggleEnabled,
            batchDeleteEntries: ctx.batchDeleteEntries,
            moveEntry: ctx.moveEntry,
            entryHealthReport: ctx.entryHealthReport,
            runEntryHealthCheck: ctx.runEntryHealthCheck,
            ensureUid: ctx.ensureUid,
            entryTokens,
            extractWorldbookFromCard: ctx.extractWorldbookFromCard,
            openWbSnapshots: ctx.openWbSnapshots,
            openWbGraphModal: ctx.openWbGraphModal,
            openWbImportModal: ctx.openWbImportModal,
            exportFilteredWorldbook: ctx.exportFilteredWorldbook,
            exportActiveWorldbook: ctx.exportActiveWorldbook,
            addWorldbookEntry: ctx.addWorldbookEntry,
            saveActiveWorldbook: ctx.saveActiveWorldbook,
            filteredWorldbookEntries: ctx.filteredWorldbookEntries,
            duplicateWorldbookEntry: ctx.duplicateWorldbookEntry,
            deleteWorldbookEntry: ctx.deleteWorldbookEntry,
            showEditorLogs: ctx.showEditorLogs,
            editorLogs: ctx.editorLogs
        };
    }
};
</script>

<style scoped>
/* ================= 统一工具栏按钮外壳 =================
   所有操作按钮：同高 / 同最小宽 / 同圆角 / 同边框 / 同字体 / 同图标尺寸，仅颜色不同。 */
.tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;            /* 统一高度 */
    min-width: 84px;         /* 统一最小宽度（文字居中，短按钮也同宽） */
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    cursor: pointer;
    transition: all 0.15s ease;
}
.tb-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
}
.tb-btn .ico {
    font-size: 13px;         /* 统一图标尺寸 */
    line-height: 1;
}
</style>
