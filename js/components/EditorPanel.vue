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
                <div class="flex items-center gap-2 shrink-0">
                    <button @click="translateCardContent" :disabled="isTranslating" class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white rounded shadow-sm transition text-xs font-bold whitespace-nowrap" title="调用 AI 翻译角色设定/首条消息/场景/对话示例">
                        <span v-if="!isTranslating">🌐 一键汉化</span>
                        <span v-else class="animate-pulse">⏳ AI 翻译中...</span>
                    </button>
                    <button @click="refactorCardFormat" :disabled="isRefactoring" class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white rounded shadow-sm transition text-xs font-bold whitespace-nowrap" title="将旧格式（W++/JSON）设定重构为高密度 Markdown，大幅降低 Token 占用">
                        <span v-if="!isRefactoring">✨ 格式升维 (降 Token)</span>
                        <span v-else class="animate-pulse">⏳ AI 正在重构中...</span>
                    </button>
                    <button @click="saveToLocalDisk" class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm transition text-xs font-bold whitespace-nowrap">
                        💾 覆盖保存
                    </button>
                    <button @click="exportPackage" class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-sm transition text-xs font-bold whitespace-nowrap" title="一键打包卡片、独立世界书与正则脚本">
                        📦 导出整合包
                    </button>
                    <button @click="deleteCard" class="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded shadow-sm transition text-xs font-bold ml-2 whitespace-nowrap">
                        🗑️ 删除
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
                </div>

                <div class="flex flex-wrap gap-1 p-1.5 bg-zinc-800/60 rounded border border-zinc-700 overflow-y-auto custom-scrollbar max-h-40">
                    <span v-for="tag in globalAvailableTags" :key="tag"
                          :class="activeCardTags.includes(tag) ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'"
                          class="text-[10px] px-2 py-0.5 rounded transition shadow-sm border flex items-center gap-1 group cursor-pointer"
                          @click="addGlobalTag(tag)">
                        <span>+ {{ tag }}</span>
                        <span @click.stop="removeTagFromGlobalPool(tag)" class="text-zinc-500 group-hover:text-red-400 hover:bg-red-500/20 hover:text-red-400 rounded-full w-3 h-3 flex items-center justify-center transition-colors font-bold ml-1" title="彻底删除此标签">×</span>
                    </span>
                    <div v-if="globalAvailableTags.length === 0" class="text-xs text-zinc-500 py-1">暂无可选标签，请输入后添加</div>
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
                <div v-if="currentTab === 'basic'" class="space-y-4 max-w-5xl">
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
                <div v-if="currentTab === 'advanced'" class="space-y-4 max-w-5xl">
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

                <!-- 2. 世界书 (Worldbook) -->
                <div v-if="currentTab === 'worldbook'" class="max-w-5xl">
                    <div v-if="worldbookEntries.length > 0">
                        <div class="flex justify-between items-center mb-3 bg-zinc-900 p-2 rounded border border-zinc-800">
                            <span class="text-xs text-zinc-400 font-bold">共 {{ worldbookEntries.length }} 条世界书设定</span>
                            <div class="flex gap-2">
                                <button @click="expandAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部展开</button>
                                <button @click="collapseAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部折叠</button>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <div v-for="(entry, index) in worldbookEntries" :key="getEntryUid(entry)" class="bg-zinc-900 border border-zinc-800 rounded shadow-sm overflow-hidden transition-all">

                                <div @click="toggleWorldbookEntry(entry)" class="px-3 py-2.5 bg-zinc-800/60 hover:bg-zinc-800 cursor-pointer flex justify-between items-center select-none">
                                    <div class="flex items-center gap-2 overflow-hidden">
                                        <span class="text-zinc-500 text-xs transition-transform inline-block" :class="worldbookExpanded[getEntryUid(entry)] ? 'rotate-90' : ''">▶</span>
                                        <span class="font-bold text-xs text-zinc-200 truncate">{{ entry.name || entry.comment || '未命名条目' }}</span>
                                        <span class="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.2 rounded border border-green-500/30 truncate max-w-xs" v-if="entry.keys && entry.keys.length">
                                            🔑 {{ entry.keys.join(', ') }}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0">
                                        <span class="text-[10px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 border border-zinc-700">优先级: {{ entry.insertion_order ?? 50 }}</span>
                                    </div>
                                </div>

                                <div v-if="worldbookExpanded[getEntryUid(entry)]" class="p-3 border-t border-zinc-800 bg-zinc-950/60 space-y-3 text-xs">

                                    <div class="grid grid-cols-3 gap-2">
                                        <div class="col-span-2 flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">条目名称 (Name / Comment):</label>
                                            <input v-model="entry.name" @input="refreshCardData" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="条目名称">
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label class="font-bold text-zinc-400">优先级 (Order):</label>
                                            <input v-model.number="entry.insertion_order" type="number" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="50">
                                        </div>
                                    </div>

                                    <div class="flex flex-col gap-1">
                                        <label class="font-bold text-zinc-400">触发关键词 (Keys，用逗号分隔):</label>
                                        <input :value="getKeysString(entry.keys)" @input="updateEntryKeys(entry, $event.target.value)" class="bg-zinc-800 border border-zinc-700 rounded p-1.5 outline-none text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50" placeholder="关键词1, 关键词2">
                                    </div>

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
                    <div v-else class="text-zinc-500 text-center py-10">此卡片未内置世界书数据</div>
                </div>

                <!-- 正则脚本：兼容 V2/V3 的可视化编辑器 -->
                <div v-if="currentTab === 'regex'" class="max-w-5xl">
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
                                        <div v-else v-html="cleanMarkdownFences(msg.content)"></div>
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

                    <div class="flex items-center gap-2 flex-1 min-w-[180px]">
                        <span class="text-xs font-bold text-amber-500 shrink-0 truncate max-w-[150px]">📖 {{ activeWorldbook.data.name || activeWorldbook.name }}</span>
                        <input v-model="entrySearchQuery" type="text"
                               placeholder="🔍 搜索词条..."
                               title="搜索词条 (触发词 / 内容 / 备注)"
                               class="flex-1 min-w-[100px] max-w-[220px] theme-element border rounded px-2.5 py-1 text-xs focus:outline-none">
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <button @click="openWbGraphModal" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="查看当前世界书的词条关联图谱">
                            🌐 关系图谱
                        </button>
                        <button @click="openWbImportModal" class="px-2 py-1 theme-element hover:border-emerald-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="从其他世界书按需导入词条到当前书">
                            🔀 导入词条
                        </button>
                        <button @click="exportFilteredWorldbook" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="将当前搜索过滤出的词条拆分为独立世界书">
                            📤 拆分导出
                        </button>
                        <button @click="toggleAllEntriesCollapse" class="px-2 py-1 theme-element hover:border-amber-500 border rounded text-[11px] font-medium transition whitespace-nowrap">
                            {{ isAllEntriesCollapsed ? '↔️ 展开' : '↕️ 折叠' }}
                        </button>
                        <button @click="exportActiveWorldbook" class="px-2 py-1 theme-element hover:border-indigo-500 border rounded text-[11px] font-medium transition whitespace-nowrap" title="导出单文件">📤</button>
                        <button @click="addWorldbookEntry" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold rounded shadow transition whitespace-nowrap">➕ 新增</button>
                        <button @click="saveActiveWorldbook" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded shadow transition whitespace-nowrap">💾 保存</button>
                    </div>
                </div>

                <!-- 词条列表编辑区（紧凑化：更小间距/卡片） -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5 pb-32">
                    <div v-for="(entry, index) in filteredWorldbookEntries" :key="entry.uid || index"
                         :id="'wb-entry-' + getEntryUid(entry)"
                         class="group theme-surface border rounded-lg p-2 shadow-sm transition-all"
                         :class="{ 'opacity-50 border-dashed': !entry.enabled }">

                        <!-- 词条头部（紧凑：启用圆点 + 触发词 + 折叠信息徽章） -->
                        <div class="flex items-center justify-between cursor-pointer select-none gap-2"
                             @click="entry._collapsed = !entry._collapsed">

                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                <!-- ✅ 启用状态圆点（紧凑可视化） -->
                                <span class="shrink-0 w-2 h-2 rounded-full transition-colors"
                                      :class="entry.enabled !== false ? 'bg-emerald-500 shadow-[0_0_4px_#10b981]' : 'bg-zinc-600'"></span>
                                <span class="text-xs text-amber-500 transition-transform font-mono shrink-0" :class="{ '-rotate-90': entry._collapsed }">▼</span>
                                <span class="text-[11px] font-mono opacity-50 shrink-0">#{{ index + 1 }}</span>

                                <span class="text-xs font-bold truncate">
                                    {{ entry.comment || (Array.isArray(entry.key) && entry.key.length ? entry.key.join(', ') : '未命名词条') }}
                                </span>

                                <!-- 折叠态：触发词标签 + 字数 + 插入位置徽章 -->
                                <div v-if="entry._collapsed" class="flex items-center gap-1 overflow-hidden shrink-0 ml-1">
                                    <span v-for="k in (entry.key || []).slice(0, 3)" :key="k" class="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">{{ k }}</span>
                                    <span v-if="(entry.key || []).length > 3" class="text-[9px] opacity-40">+{{ (entry.key || []).length - 3 }}</span>
                                    <span v-if="!entry.enabled" class="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded">停用</span>
                                    <span class="text-[9px] text-zinc-500 shrink-0 whitespace-nowrap">{{ entry.content ? entry.content.length : 0 }}字</span>
                                    <span class="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded shrink-0 whitespace-nowrap">{{ getEntryPositionText(entry.position) }}</span>
                                </div>
                            </div>

                            <!-- ✅ [紧凑化] 右侧操作：折叠时 hover 显示，展开时保持可见（编辑需要） -->
                            <div class="flex items-center gap-2 shrink-0 transition-opacity duration-150"
                                 :class="entry._collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'"
                                 @click.stop>
                                <label class="flex items-center gap-1 cursor-pointer text-xs">
                                    <input type="checkbox" v-model="entry.enabled" class="rounded theme-element text-amber-500 focus:ring-0">
                                    <span :class="entry.enabled ? 'text-amber-400 font-bold' : 'opacity-40'">{{ entry.enabled ? '已启用' : '已停用' }}</span>
                                </label>
                                <button @click="duplicateWorldbookEntry(entry)" class="p-1 hover:text-indigo-400 text-xs opacity-60 hover:opacity-100" title="复制词条">📋</button>
                                <button @click="deleteWorldbookEntry(entry)" class="p-1 hover:text-rose-400 text-xs opacity-60 hover:opacity-100" title="删除词条">🗑️</button>
                            </div>
                        </div>

                        <!-- 展开态：全字段编辑 -->
                        <div v-show="!entry._collapsed" class="mt-3 pt-3 border-t border-zinc-700/40 space-y-3">

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[10px] opacity-60 mb-1">📌 词条备注/名称 (Comment)</label>
                                    <input v-model="entry.comment" @input="refreshCardData" type="text" placeholder="例: 主角家乡背景" class="w-full theme-element border rounded px-2.5 py-1 text-xs focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] text-amber-400 mb-1">🔑 主触发词 (Keys) <span class="opacity-50 font-normal">逗号分隔</span></label>
                                    <input :value="(entry.key || []).join(', ')" @input="updateEntryKeys(entry, 'key', $event.target.value)" type="text" placeholder="例: 城堡, 魔法" class="w-full theme-element border rounded px-2.5 py-1 text-xs font-mono focus:outline-none">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="col-span-2">
                                    <label class="block text-[10px] opacity-60 mb-1">🪝 次级触词 (Secondary Keys)</label>
                                    <input :value="(entry.keysecondary || []).join(', ')" @input="updateEntryKeys(entry, 'keysecondary', $event.target.value)" type="text" placeholder="逻辑与匹配" class="w-full theme-element border rounded px-2.5 py-1 text-xs font-mono focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-[10px] opacity-60 mb-1 truncate">⚖️ 权重 (Order)</label>
                                    <input type="number" v-model.number="entry.order" class="w-full theme-element border rounded px-2 py-1 text-xs">
                                </div>
                                <div>
                                    <label class="block text-[10px] opacity-60 mb-1 truncate">⬇️ 深度 (Insertion)</label>
                                    <input type="number" v-model.number="entry.insertion_order" class="w-full theme-element border rounded px-2 py-1 text-xs">
                                </div>
                                <div>
                                    <label class="block text-[10px] opacity-60 mb-1 truncate">📍 插入位置</label>
                                    <select v-model.number="entry.position" class="w-full theme-element border rounded px-2 py-1 text-xs">
                                        <option value="0">0: 顶部</option>
                                        <option value="1">1: 底部</option>
                                        <option value="2">2: 聊天前</option>
                                    </select>
                                </div>
                                <div class="flex items-center">
                                    <label class="flex items-center gap-1.5 cursor-pointer text-xs whitespace-nowrap">
                                        <input type="checkbox" v-model="entry.constant" class="rounded theme-element text-indigo-500 focus:ring-0">
                                        📌 全局常驻
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label class="block text-[10px] text-amber-500 mb-1 font-bold">📝 设定集正文 (Content)</label>
                                <textarea v-model="entry.content" @input="refreshCardData" rows="4" placeholder="在此输入当触发词匹配时注入给 AI 的背景设定..." class="w-full theme-element border rounded p-2.5 text-xs focus:outline-none custom-scrollbar resize-y min-h-[70px]"></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- 搜索无结果提示 -->
                    <div v-if="filteredWorldbookEntries.length === 0" class="text-center py-10 text-zinc-500 text-sm">
                        <p>🔍 没有匹配「{{ entrySearchQuery }}」的词条</p>
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
</template>

<script>
import { inject } from 'vue';

export default {
    name: 'EditorPanel',
    setup() {
        const ctx = inject('appCtx');
        return {
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
            addGlobalTag: ctx.addGlobalTag,
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
            // ✅ [紧凑化] 世界书词条插入位置可读化（position: 0顶部/1底部/2聊天前）
            getEntryPositionText: (p) => ({ 0: '顶部', 1: '底部', 2: '聊天前' })[p] || '默认',
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
            cleanMarkdownFences: ctx.cleanMarkdownFences,
            isChatting: ctx.isChatting,
            chatInput: ctx.chatInput,
            sendMessage: ctx.sendMessage,
            formattedJson: ctx.formattedJson,
            activeWorldbook: ctx.activeWorldbook,
            entrySearchQuery: ctx.entrySearchQuery,
            openWbGraphModal: ctx.openWbGraphModal,
            openWbImportModal: ctx.openWbImportModal,
            exportFilteredWorldbook: ctx.exportFilteredWorldbook,
            toggleAllEntriesCollapse: ctx.toggleAllEntriesCollapse,
            isAllEntriesCollapsed: ctx.isAllEntriesCollapsed,
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
