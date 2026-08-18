# 角色卡管理器 BUG 排查与修复记录

> 仓库：`https://github.com/tian2418671-sys/JSKZX.git`
> 本地路径：`d:\1\JSKZX`
> 技术栈：Electron + Vue 3（Composition API）+ Tailwind CSS + Vite
> 项目性质：SillyTavern（酒馆）角色卡本地桌面管理工具（离线可用）

本文档汇总本次会话的全部 BUG 排查经过、根因分析、修复代码块，供手动修改。

---

## ✅ 修复状态总览（2026-08-18，已应用于 `e:\AI\酒馆工具\JSK管理`，当前版本 v1.7.1）

| 编号 | 问题 | 状态 | 修复位置 |
|------|------|------|----------|
| BUG-1 | "最新"排序混乱（用 `create_date`） | ✅ 已修复 | `App.vue` `sortCards` 改物理时间 `_mtime`；`parseAndAddCard` 兜底 `file.mtime \|\| Date.now()`（内存导入的新卡也正确排前） |
| BUG-2 | 标签池无条件透出卡片自带标签（开关失效） | ✅ 已修复 | `App.vue` `globalAvailableTags` 受 `sanitizeImportedTags` 开关控制 |
| BUG-3 | 导入后自动创建分组 | ✅ 已修复 | `App.vue` `processAutoTagsAndCategory` 联动开关 + 过滤「未分类」 |
| BUG-4 | webp 卡保存提示含糊 | ✅ 已修复 | `main.js` `file:saveCard` 明确提示「仅支持 .json/.png，webp 无法回写」 |
| BUG-5 | 打包图标路径 | ❌ 不成立 | 当前工作区 `build/icon.ico` 存在，`package.json` 配置正确（buildResources 默认目录） |
| BUG-6 | 快照配置重启不同步主进程 | ✅ 已修复 | 当前代码 `onMounted` 已 `await saveSnapshotSettings()` 启动同步 |
| 中等 | 世界书切换后 `currentEntry` 残留 | ✅ 已修复 | `EditorPanel.vue` 新增 watch 清空选中词条 |
| 轻微 | `pngParser.js` iTXt 偏移计算错误 | ✅ 已修复 | 正确跳过 language_tag\0 + translated_keyword\0（已单测验证） |
| 轻微 | 汉化/升维/聊天三处异步竞态（切卡回写旧卡） | ✅ 已修复 | 捕获 `targetCard` 引用，在途期间切卡即丢弃结果 |
| 轻微 | blob URL 未释放 | ❌ 不成立 | `reset` 已有 revoke；`handleImportFiles` 仅在真正需要时创建 blob |
| 轻微 | `onMounted` 全局监听无清理 | ⏸️ 跳过 | 根组件几乎不卸载，影响可忽略 |
| 合理代码 | `max_tokens` 双协议口径不一致 | ✅ 已修复 | `main.js` Anthropic 分支 `payload.max_tokens \|\| 4096`，与 OpenAI 分支一致透传 |
| 合理代码 | `js/main.js` 与根 `main.js` 同名 | ✅ 已修复 | `git mv js/main.js js/entry.js` + `index.html` 引用 + README 同步；`vite build` 验证通过（640 模块） |
| 合理代码 | `models:fetch` 冗余分支 | ✅ 已修复 | `/\/v1\/?$/` 分支与 `else` 分支结果完全相同，已合并为单一 else 分支 |
| 优化 | 刷新全量重载卡顿（embeddedData 主进程提取） | ⏸️ 未做 | 较大改动，待后续性能优化专项处理 |

> 说明：本文档部分行号针对旧路径 `d:\1\JSKZX` 早期版本，应用修复时以当前工作区实际代码为准。

---

## 目录
1. [排查范围与方法](#1-排查范围与方法)
2. [总体 BUG 清单（静态审查结论）](#2-总体-bug-清单静态审查结论)
3. [BUG-1：卡片"最新"排序混乱](#3-bug-1卡片最新排序混乱)
4. [BUG-2：导入卡片后标签池自动添加卡片自带标签（开关未生效）](#4-bug-2导入卡片后标签池自动添加卡片自带标签开关未生效)
5. [BUG-3：导入角色卡后有时会自动创建分组](#5-bug-3导入角色卡后有时会自动创建分组)
6. [待确认 / 其它建议](#6-待确认--其它建议)
7. [BUG-4：`.webp` 卡片可导入但保存失败](#7-bug-4webp-卡片可导入但保存失败)
8. [BUG-5：打包图标路径配置错误](#8-bug-5打包图标路径配置错误)
9. [BUG-6：快照配置重启后未同步到主进程](#9-bug-6快照配置重启后未同步到主进程)
10. [功能残缺 / 体验建议](#10-功能残缺--体验建议)
11. [性能优化：刷新按钮全量重载卡顿](#11-性能优化刷新按钮全量重载卡顿)
12. [功能细化：角色卡世界书选项卡增强](#12-功能细化角色卡世界书选项卡增强)
13. [不合理代码修复：main.js 命名混淆与冗余分支](#13-不合理代码修复mainjs-命名混淆与冗余分支)

---

## 1. 排查范围与方法

- 通读主进程 `main.js`（1799 行，含全部 IPC handler、PNG 写入、文件快照、磁盘扫描）。
- 审查 `preload.js`、渲染入口 `js/main.js`。
- 审查 `js/utils/`（`cardLoader.js`、`pngParser.js`、`tokenEstimate.js`）。
- 专项审计全部 Vue SFC 组件（`App.vue` 6419 行 + 20 个子组件）。
- 语法校验：`node --check` 通过（主进程 / preload / 工具模块）。
- 注：`node_modules` 未安装，未运行 `vite build` 做完整 SFC 编译。

---

## 2. 总体 BUG 清单（静态审查结论）

### 中等（Medium）

| 位置 | 问题 | 说明 |
|------|------|------|
| `EditorPanel.vue:623-628` / `SidebarPanel.vue:357` | 世界书切换后右侧详情面板残留旧书选中词条 | `currentEntry` 为本地 ref，与父级 `activeWorldbook` 无联动 watch，切书后 `v-model` 仍绑定旧书对象，用户误改旧书 |

### 轻微（Low）

| 位置 | 问题 | 说明 |
|------|------|------|
| `pngParser.js:100-111` | `iTXt` 数据块偏移计算错误 | `iTXt` 文本起点定位到语言标签区，标准 `iTXt` 卡片解析失败 |
| `App.vue` `translateCardContent`≈4288 / `refactorCardFormat`≈4352 | 切卡期间异步回写落到旧卡 | 捕获引用后多次 `await`，期间切卡导致回写旧卡 |
| `App.vue:1728-1766` `sendMessage` | 切卡竞态导致旧卡回复挂错卡 | 在途请求完成后仍 push 到当前 `chatHistory` |
| `App.vue` `handleImportFiles`≈764 / `reset`≈4466 | 兜底 blob URL 未释放 | 仅 `blob:` 引用应 revoke |
| `App.vue` `onMounted` | 根组件全局事件监听无 `onUnmounted` 清理 | 根组件几乎不卸载，影响有限 |

### 已确认规避、并非 BUG 的项
- 组件注册名（`AiTagModal` / `ApiSettingsModal` / `AppLoadingOverlay`）均正确小写化，弹窗不失效。
- `v-html` 全部经 `renderHTML` / `renderSafeHTML`(DOMPurify) 清洗。
- `window.prompt` 全程使用自建 `appPrompt`。
- `cardData`(shallowRef) 深层修改均有 `triggerRef` / `refreshCardData`；世界书 `worldbookEntries` 正确返回 `reactive(entry)`。
- 分类只写 `libItem.category`，未污染 `cardData` 落盘。
- 搜索/过滤用字面匹配，无用户输入正则注入；除零均有保护。

---

## 3. BUG-1：卡片"最新"排序混乱

### 3.1 现象
卡片面板选择「最新」排序时，顺序混乱、与"最近加入/修改"不符。

### 3.2 根因
[App.vue](file:///d:/1/JSKZX/js/components/App.vue#L2174-L2187) 的排序 `sortBy === 'time'` 分支**优先使用卡片内建 `create_date`（作者创作日期）**，仅在缺失时才回退文件 `mtime`：
- 一批同期创作 / 同一作者的卡 `create_date` 相同 → 相对顺序随机，看起来"混乱"；
- 多年前创作的卡即使最近才导入，也被排到最旧；
- 本地修改过的卡不会因物理 `mtime` 提前。

即排序依据其实是"作者创作年份"，而非"最近活动 / 最近加入"。

### 3.3 修复方案
升级为**以卡片文件的物理时间（修改/创建）为准**。共 4 处改动。

#### 改动 1｜`main.js` `walkLibraryDir` — 扫描时同时采集 修改时间 + 创建时间
替换位置：`walkLibraryDir` 内 `isFile()` 分支中读取 `mtime` 的整段，即 `const isImage = ...` 到 `files.push({ ... })`。

```js
      const isImage = ext === '.png' || ext === '.webp';
      let mtime = 0;
      let birthtime = 0;
      try {
        const st = fs.statSync(absPath);
        mtime = st.mtimeMs || 0;       // 文件修改时间
        birthtime = st.birthtimeMs || 0; // 文件创建时间（Windows 支持；可 0，排序时自动回退）
      } catch (e) { /* 文件被占用/删除时忽略 */ }
      files.push({
        name: f.name,
        path: absPath,
        url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null,
        mtime,
        birthtime,
        subFolder: relPath || '', // 相对库根的文件夹路径（'' = 根目录）
        category: relPath ? relPath.split(path.sep)[0] : '未分类' // 一级文件夹名 = 物理分组
      });
```

#### 改动 2｜`App.vue` `parseAndAddCard` 的 `cardInfo` — 卡片对象新增 `_ctime`
替换位置：`parseAndAddCard` 中构建 `cardInfo` 对象时的 `_mtime` 与 `subFolder` 两行。

```js
                        _mtime: file.mtime || 0, // 物理文件修改时间（"最新"排序基准）
                        _ctime: file.birthtime || 0, // 物理文件创建时间（mtime 缺失时排序回退）
                        subFolder: file.subFolder || '' // 相对库根的文件夹路径（'' = 根目录；物理分组用）
```

#### 改动 3｜`App.vue` 拖拽导入 — 新入库文件带上当前物理时间
替换位置：`handleDropToLibrary`（或拖拽复制成功后的 for 循环）中的 `for (const newFilePath of copiedFiles) { ... }` 整段。

```js
                    for (const newFilePath of copiedFiles) {
                        const fName = newFilePath.split(/[\\/]/).pop();
                        const isImg = /\.(png|jpe?g|webp)$/i.test(fName);
                        const now = Date.now(); // 新复制入库的文件，物理时间视为当前
                        await parseAndAddCard({
                            name: fName,
                            path: newFilePath,
                            url: isImg ? 'local-file://img/?path=' + encodeURIComponent(newFilePath) : null,
                            mtime: now,
                            birthtime: now
                        });
                    }
```

#### 改动 4｜`App.vue` `sortCards` — "最新"排序以物理文件时间为准
替换位置：`sortCards` 中 `if (sortBy.value === 'time') { ... }` 的整个分支。

```js
                if (sortBy.value === 'time') {
                    // "最新"以物理文件时间为准（修改时间 > 创建时间），避免卡片内建 create_date
                    // （作者创作日期可多年不变/同类卡相同）造成的排序混乱；
                    // 物理时间缺失时才回退卡片内建 create_date（用于未落盘/特殊来源的卡）
                    const pickTime = (card) => {
                        const m = Number(card._mtime) || 0;
                        const c = Number(card._ctime) || 0;
                        if (m && c) return Math.max(m, c); // 修改与创建取较新（最近活动）
                        if (m) return m;
                        if (c) return c;
                        return Date.parse((card.data?.data || card.data || {}).create_date) || 0;
                    };
                    return pickTime(b) - pickTime(a); // 最新优先
                }
```

---

## 4. BUG-2：导入卡片后标签池自动添加卡片自带标签（开关未生效）

### 4.1 现象
在设置里把「导入时忽略卡片自带标签」开关设为**关闭**后，导入卡片仍会在标签池中自动出现卡片自带的标签。

### 4.2 根因
该开关（[HeaderBar.vue:102-110](file:///d:/1/JSKZX/js/components/HeaderBar.vue#L102-L110)）背后的 `sanitizeImportedTags` **只控制了一个地方**：`App.vue:2530` 中是否把卡片原生 `data.tags` 写入该卡片的 `customTags`（卡片级）。

但"标签池"里实际展示的是 [App.vue:3781-3799](file:///d:/1/JSKZX/js/components/App.vue#L3781-L3799) 的 `globalAvailableTags` computed，它**无条件聚合**了全库所有卡片的原生 `d.tags`，完全没有引用开关：

```js
const globalAvailableTags = computed(() => {
    const tagSet = new Set(systemCommonTags.value);
    library.value.forEach(item => {
        if (item.customTags && Array.isArray(item.customTags)) {
            item.customTags.forEach(t => { if (t) tagSet.add(t); });
        }
        // 卡片原生自带标签 —— 无条件透出，无开关判断
        const d = item.data?.data || item.data || {};
        if (d.tags) {
            if (Array.isArray(d.tags)) {
                d.tags.forEach(t => { if (t) tagSet.add(t); });
            } else if (typeof d.tags === 'string' && d.tags.trim() !== '') {
                d.tags.split(',').forEach(t => tagSet.add(t.trim()));
            }
        }
    });
    return Array.from(tagSet);
});
```

所以无论开关开/关，标签池「系统/常用标签快速添加」栏都会透出全库卡片自带标签。开关只影响"卡片自定义标签"是否取原生，不影响"标签池展示"，故开关"失效"。

> 附带说明：开关本身语义方向易混淆——开启 = 忽略自带标签；关闭 = 允许。但当前展示层完全不受控，故现象与开关位置无关。

### 4.3 修复方案
让 `globalAvailableTags` 在开关**开启**（"忽略卡片自带标签"）时不再透出卡片原生 `d.tags`（只保留自选池与自定义标签）。

#### 改动｜`App.vue` `globalAvailableTags` 受开关控制
将 [App.vue:3781-3799](file:///d:/1/JSKZX/js/components/App.vue#L3781-L3799) 整个 computed 替换为：

```js
        // 2. 动态计算：从当前所有已导入的卡片中聚合提取出所有的标签（基于 systemCommonTags + 全库标签）
        // 🧹 受"导入时忽略卡片自带标签"开关控制：开启时不再透出卡片原生 data.tags，仅保留自选池与自定义标签
        const globalAvailableTags = computed(() => {
            const tagSet = new Set(systemCommonTags.value);
            library.value.forEach(item => {
                // 卡片自定义标签（用户主动打的，始终保留）
                if (item.customTags && Array.isArray(item.customTags)) {
                    item.customTags.forEach(t => { if (t) tagSet.add(t); });
                }
                // 卡片原生自带标签：仅在开关关闭（保留自带标签）时才透出
                if (!sanitizeImportedTags.value) {
                    const d = item.data?.data || item.data || {};
                    if (d.tags) {
                        if (Array.isArray(d.tags)) {
                            d.tags.forEach(t => { if (t) tagSet.add(t); });
                        } else if (typeof d.tags === 'string' && d.tags.trim() !== '') {
                            d.tags.split(',').forEach(t => tagSet.add(t.trim()));
                        }
                    }
                }
            });
            return Array.from(tagSet);
        });
```

> 若希望语义反过来（关闭才忽略、开启才显示），把 `if (!sanitizeImportedTags.value)` 中的 `!` 去掉即可。

---

## 5. BUG-3：导入角色卡后有时会自动创建分组

### 5.1 现象
导入一张角色卡后，分组列表有时会"自动"多出一个分组。

### 5.2 根因
`processAutoTagsAndCategory` 末尾（[App.vue:2546-2549](file:///d:/1/JSKZX/js/components/App.vue#L2546-L2549)）在做"自动贴标签"时，把自动分类结果直接 push 进 `customCategories`（即分组表）：

```js
let assignedCategory = '未分类';
for (const [tag, regex] of Object.entries(autoTagRules)) {
    if (regex.test(fullText) && !generatedTags.includes(tag)) {
        generatedTags.push(tag);
        // 简单的自动分类：将匹配到的第一个大类作为分类
        if (assignedCategory === '未分类') assignedCategory = tag.split(' ')[0]; // ← 标签名第一个单词当分组名
    }
}
cardInfo.category = assignedCategory;
if (!allCategories.value.some(c => c.cn === assignedCategory || c.en === assignedCategory || c.key === assignedCategory)) {
    customCategories.value.push(assignedCategory); // ← 自动分类被加进"分组"，导入后多出分组
}
```

- 只要卡片内容命中 `autoTagRules` 正则，就会取该标签英文名首个单词当分类；
- 无论是否真是"分组"用途，均被无差别写入自定义分组，表现为"导入后自动创建分组"。

> 次因（属于预期行为）：物理子文件夹即分组（[App.vue:2698-2704](file:///d:/1/JSKZX/js/components/App.vue#L2698-L2704)），扫描目录下一级子文件夹名会并入分组。

### 5.3 修复方案（方案 A：联动开关）
进入 `processAutoTagsAndCategory`，只改建组逻辑（正则匹配、`customTags` 赋值保持不变）。

#### 替换位置
[App.vue:2530-2550](file:///d:/1/JSKZX/js/components/App.vue#L2530-L2550)：将该函数内从 `let generatedTags = ...` 到函数收尾 `};` 的整段替换为下面代码。

#### 新版代码

```js
            // 🧹 导入数据清洗开关：开启时忽略卡片自带的原生 tags（防止他人卡片的杂乱标签混入全局标签池）
            let generatedTags = sanitizeImportedTags.value ? [] : [...(data.tags || [])];
            let assignedCategory = '未分类';

            // 匹配自动标签
            for (const [tag, regex] of Object.entries(autoTagRules)) {
                if (regex.test(fullText) && !generatedTags.includes(tag)) {
                    generatedTags.push(tag);
                    // 简单的自动分类：将匹配到的第一个大类作为分类
                    if (assignedCategory === '未分类') assignedCategory = tag.split(' ')[0];
                }
            }

            // 更新到卡片对象
            cardInfo.customTags = Array.from(new Set(generatedTags));
            cardInfo.category = assignedCategory;

            // 动态将新分类加入分类表（命中预设分组时不重复添加）
            // 【修复】方案 A：联动"导入时忽略卡片自带标签"开关——
            //   · 开关开启：视为"导入即净化"，完全不自动创建分组，自动分类仅落到卡片属性；
            //   · 开关关闭：也先过滤"未分类"，仅对真正的新分类才补建分组。
            //   此双重控制可避免自动贴标签引入的普通分类词被当成分组创建，导致导入后意外多出分组。
            const shouldAutoBuildCategory = !sanitizeImportedTags.value;
            const catTrimmed = String(assignedCategory || '').trim();
            if (shouldAutoBuildCategory
                && catTrimmed && catTrimmed !== '未分类'
                && !allCategories.value.some(c => c.cn === assignedCategory || c.en === assignedCategory || c.key === assignedCategory)) {
                customCategories.value.push(assignedCategory);
            }
```

### 5.4 行为说明
- **开关开启**（`sanitizeImportedTags = true`）：不再自动创建任何分组；卡片仍拿到 `category` 与 `customTags`，但不会往 `customCategories` 塞新项。
- **开关关闭**：仅在自动分类结果不是「未分类」且该分类尚未存在时才补建分组（多一层"非未分类"保护，减少误建）。
- **物理子文件夹即分组**（[App.vue:2698-2704](file:///d:/1/JSKZX/js/components/App.vue#L2698-L2704)）不受影响，仍是预期行为。

> 若开关语义方向想反过来（关闭 = 不建组、开启 = 允许），把 `shouldAutoBuildCategory` 的 `!sanitizeImportedTags.value` 去掉 `!` 即可。

---

## 6. 待确认 / 其它建议

- **开关语义方向**：BUG-2 与 BUG-3 中都牵涉 `sanitizeImportedTags` 的开/关语义，需确认你期望"开启=忽略"还是"关闭=忽略"，据此统一正负逻辑。
- **`autoTagRules` 具体映射**：如需精确定位哪些标签词会被误当分组名，可进一步列出 `autoTagRules` 的正则与取名规则。
- **完整构建验证**：未安装 `node_modules`，未能运行 `vite build`。建议修改后执行 `npm install` + `npm run build` 验证 SFC 编译与打包。
- 其余整体审查结论（世界书 `currentEntry` 残留、`iTXt` 解析等）见 [第 2 节](#2-总体-bug-清单静态审查结论)，如有需要可据此继续修复。

---

## 7. BUG-4：`.webp` 卡片可导入但保存失败

### 7.1 现象
导入 `.webp` 格式的角色卡后，能正常显示与编辑；点击「保存」时报「不支持的文件格式」。

### 7.2 根因
扫描与保存对 `.webp` 的支持不一致：

- 扫描白名单 [main.js:1761](file:///d:/1/JSKZX/main.js#L1761)：`ext !== '.png' && ext !== '.webp' && ext !== '.json'` → **webp 被当卡片收入库**，`isImage = ext === '.png' || ext === '.webp'`。
- 保存 [main.js:1085-1098](file:///d:/1/JSKZX/main.js#L1085-L1098) 只处理 `.json`（1085）与 `.png`（1088），webp 落到兜底返回「不支持的文件格式」。
- 且 [main.js:172](file:///d:/1/JSKZX/main.js#L172) `writeTavernPNGChunk` 仅识别 PNG 签名 `0x89504E47`，webp 为 RIFF 容器，即便放开保存分支也无法把 JSON 写回图内。

### 7.3 修复方案
推荐「明确提示不可回写」为主，避免误导用户。修改 `file:saveCard` 兜底分支：

```js
      } else {
          return { success: false, error: `暂不支持 ${ext} 格式的在线保存（仅支持 .json / .png 卡片）` };
      }
```

> 若希望 webp 卡彻底不可编辑，可进一步在导入/选中时对 `ext === '.webp'` 的卡片置为「仅查看」态并禁用保存/世界书写入按钮。

---

## 8. BUG-5：打包图标路径配置错误

### 8.1 现象
打包产物图标缺失或使用 Electron 默认图标。

### 8.2 根因
[package.json:53](file:///d:/1/JSKZX/package.json#L53) `"icon": "icon.ico"`，但实际图标文件位于 [build/icon.ico](file:///d:/1/JSKZX/build/icon.ico)，项目根目录不存在 `icon.ico`。electron-builder 找不到该文件时回退默认图标（或构建告警）。

### 8.3 修复方案

```jsonc
// package.json -> build.win
"icon": "build/icon.ico"   // 由 "icon.ico" 改为真实相对路径
```

---

## 9. BUG-6：快照配置重启后未同步到主进程

### 9.1 现象
用户在设置中关闭「自动快照」或修改冷却间隔/最大保留数后，**重启软件**，主进程仍按默认值（`enabled:true`、`5min`、`10`）继续自动备份，设置未生效。

### 9.2 根因
[App.vue:580](file:///d:/1/JSKZX/js/components/App.vue#L580) `watch(snapshotConfig, saveSnapshotSettings, { deep: true })` **缺少 `immediate: true`**：

- 前端 `snapshotConfig` 从 localStorage 恢复（[App.vue:560-568](file:///d:/1/JSKZX/js/components/App.vue#L560-L568)）；
- 主进程 `snapshotConfig` 仍是默认值（[main.js:57-61](file:///d:/1/JSKZX/main.js#L57-L61)）；
- 启动时该 watch 不触发，`updateSnapshotConfig`（同步主进程）不被调用，故主进程不感知用户设置，直到用户再次改动才同步。

### 9.3 修复方案

```js
// App.vue:580 补 immediate，让启动即把前端已恢复的配置同步给主进程
watch(snapshotConfig, saveSnapshotSettings, { deep: true, immediate: true });
```

---

## 10. 功能残缺 / 体验建议

### 10.1 快照无「一键恢复」入口
`.bak_history` 仅提供「创建快照」与「打开文件夹」两个能力（[App.vue:829](file:///d:/1/JSKZX/js/components/App.vue#L829) `openBakFolder`、[1182](file:///d:/1/JSKZX/js/components/App.vue#L1182) 手动快照）。用户要回滚旧版本只能手动打开 `.bak_history` 目录，把备份复制回来覆盖原文件。README 写明「可手动找回」，属设计限度，但缺少「从快照恢复」按钮，体验不完整。

> 建议（非必须）：在右键菜单增加「查看历史快照 / 恢复」——列出 `baseName_*` 备份文件并支持「复制覆盖回原路径」的恢复动作。

---

## 11. 性能优化：刷新按钮全量重载卡顿

### 11.1 现象与量级

刷新按钮（[App.vue refreshLibrary](file:///d:/1/JSKZX/js/components/App.vue#L2826-L2850)）走的是**全量重载**：清空内存库 → 主进程重扫 → 逐张把整张 PNG 跨 IPC 读回渲染端并解析。1000 张卡会明显卡顿（SSD 约 5~20s，机械盘 30s+，期间滚动掉帧）。

### 11.2 瓶颈定位

1. **每张卡都把整张 PNG 跨进程读回**：`parseAndAddCard` 调 `readBuffer` 读完整图，仅为了提取内嵌 JSON，却把几 MB 原图经 IPC 传回渲染端（[App.vue:2626-2634](file:///d:/1/JSKZX/js/components/App.vue#L2626-L2634)）。1000 张 × 4MB ≈ 4GB 跨进程搬运，是最大瓶颈。
2. **刷新不复用已加载卡片**：`processElectronFiles` 先 `library.value = []`（[App.vue:2696](file:///d:/1/JSKZX/js/components/App.vue#L2696)），所有卡全部重新读盘解析。
3. 解析降级路径 `deepScanForJSON` 对非标准/webp 卡做 latin1 全量转码（[pngParser.js:24-32](file:///d:/1/JSKZX/js/utils/pngParser.js#L24-L32)）。

> 已存在的优化：`CONCURRENCY = 8` 并发限制（[App.vue:2708](file:///d:/1/JSKZX/js/components/App.vue#L2708)），避免一次性并发 1000 个读请求打爆磁盘。

### 11.3 优化方案 A（治本）：主进程扫描时提取内嵌 JSON

核心思路：让内嵌卡片 JSON 的提取发生在**主进程扫描阶段**，返回时直接携带 `embeddedData` 轻量 JSON（几百 KB），彻底省掉整图跨 IPC 传输。前端拿到 `embeddedData` 后不再 `readBuffer`。

#### 改动 1｜`main.js` 新增读取 PNG 内嵌块函数（与 `writeTavernPNGChunk` 对称）

放在 `writeTavernPNGChunk` 附近：

```js
// 读取 PNG 内嵌 chara/ccv3 数据块的 JSON（扫描阶段调用，避免整图跨 IPC）
// 注：酒馆标准用 tEXt 存 Base64；iTXt 极少见，且此处按兼容 tEXt 路径处理
function readTavernPNGChunk(buffer) {
  if (!buffer || buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504E47) return null;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) break;
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt' || type === 'iTXt') {
      const nullPos = data.indexOf(0);
      if (nullPos > 0) {
        const keyword = data.subarray(0, nullPos).toString('latin1');
        if (keyword === 'chara' || keyword === 'ccv3') {
          const raw = data.subarray(nullPos + 1);          // 跳过 keyword\0
          const base64Str = raw.toString('latin1').replace(/\0/g, '');
          try {
            return JSON.parse(Buffer.from(base64Str, 'base64').toString('utf-8'));
          } catch (e) { return null; }
        }
      }
    }
    offset += 12 + length;
  }
  return null;
}
```

#### 改动 2｜`main.js` `walkLibraryDir` 扫描时顺带提取，写入 `files`

在 [main.js:1761-1778](file:///d:/1/JSKZX/main.js#L1761-L1778) 的卡片收集分支中，对 `.png` 增补提取：

```js
      let embeddedData = null;
      if (ext === '.png') {
        try {
          // 主进程本地读，不跨 IPC；可进一步优化为只读文件头 1MB（chara 块通常在 IEND 之前的头部）
          embeddedData = readTavernPNGChunk(fs.readFileSync(absPath)) || null;
        } catch (e) { /* 解析失败则设为 null，前端回退 readBuffer */ }
      }
      files.push({
        name: f.name,
        path: absPath,
        url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null,
        mtime,
        birthtime,
        subFolder: relPath || '',
        category: relPath ? relPath.split(path.sep)[0] : '未分类',
        embeddedData                          // 新增：内嵌 card JSON（无则 null）
      });
```

#### 改动 3｜`App.vue` `parseAndAddCard` 优先复用 `embeddedData`

在 [App.vue:2598](file:///d:/1/JSKZX/js/components/App.vue#L2598) `let parsedData = null;` 之后插入短路分支：

```js
                // ✅ 性能优化：主进程扫描已提取内嵌 JSON，直接复用，跳过整图跨 IPC 读取
                if (file.embeddedData && typeof file.embeddedData === 'object') {
                    parsedData = file.embeddedData;
                } else if (file.name.toLowerCase().endsWith('.json')) {
                    // ... 原 JSON 读取逻辑不变
                } else {
                    // ... 原 readBuffer 读取逻辑不变（兜底）
                }
```

### 11.4 优化方案 B（可选）：增量刷新，跳过未变化卡片

在 [refreshLibrary](file:///d:/1/JSKZX/js/components/App.vue#L2836-L2846) 获取 `result.files` 后，按 `path + mtime` 差分，复用未变化的旧对象：

```js
            if (result && result.files) {
                const oldMap = new Map(library.value.map(c => [c.path, c]));
                const toParse = [];
                const next = [];
                for (const f of result.files) {
                    const old = oldMap.get(f.path);
                    if (old && Number(old._mtime) === Number(f.mtime)) {
                        next.push(old);            // 未变化：直接复用内存对象，不重新读盘解析
                    } else {
                        toParse.push(f);           // 新增 / mtime 变化：走完整解析
                    }
                }
                library.value = next;
                // 复用现有并发批次逻辑解析 toParse（可抽取 processElectronFiles 的批处理部分）
                // ...
            }
```

> 注意：方案 B 会保留旧对象的 `_ctime` 等字段，须确保差分键与排序基准（`_mtime`）一致；与方案 A 叠加后收益最大（增量 + 无整图跨 IPC）。

### 11.5 其它小优化（可选）

- 扫描的 `fs.readFileSync(absPath)` 可改为只读文件头 1MB（`chara` 块一般位于 IHDR 之后、IDAT 之前），进一步降低主进程 I/O。
- 列表渲染对 1000+ 项采用虚拟滚动，避免 `library.value.push` 逐张触发全量重排。

---

## 12. 功能细化：角色卡世界书选项卡增强

### 12.1 背景与范围

角色卡编辑 →「世界书」选项卡原仅有：展开/折叠、改名称、改优先级、改触发词（逗号字符串）、改正文。本项目独立「世界书工作区」其实已有增删/克隆/搜索/多字段，但那些方法只作用于 `activeWorldbook`（V3 字段 `key`/`keysecondary`），并未接到**角色卡内嵌世界书**（V2 字段 `keys`/`secondary_keys`）上。

本次对齐并补齐四类能力：词条增删/克隆/排序、启用/禁用与高级开关、搜索过滤 + 触发词标签化、字段补全。

> 数据路径：`cardData.value.data.character_book.entries`（经 [App.vue safeData](file:///d:/1/JSKZX/js/components/App.vue#L1502-L1505) 返回 `data`，V1 卡在顶层）。

### 12.2 注意：`toRaw` 依赖

`worldbookEntries` computed 用 `.map(reactive)` 返回代理（[App.vue:1552-1554](file:///d:/1/JSKZX/js/components/App.vue#L1552-L1554)），模板遍历到的是 reactive 代理，而原始数组存的是 raw 对象。增删/移动用 `indexOf` 前必须 `toRaw(entry)` 找回原始对象，否则永远 -1。若顶部未引入 `toRaw`，需在 `import { ... } from 'vue'` 中补上。

### 12.3 改动 1｜App.vue — 新增方法（插在 `duplicateWorldbookEntry` 之后，约 5356 行后）

```js
        // =========================================================
        // 🎛️ 角色卡内嵌世界书（Character Book）细化操作
        // 针对 data.character_book.entries（V2 字段 keys/secondary_keys），
        // 与上方「独立世界书 IDE」的 activeWorldbook（V3 字段 key/keysecondary）区分
        // =========================================================
        const characterWorldbookSearchQuery = ref('');   // 词条关键字搜索（角色卡世界书 tab 专用）

        // 确保角色卡存在 character_book.entries，返回该数组（V2/V3 的 data 内，或 V1 顶层）
        const ensureCharacterBookEntries = () => {
            if (!cardData.value) return null;
            const target = safeData.value;
            if (!target.character_book || typeof target.character_book !== 'object') {
                target.character_book = { entries: [] };
            }
            if (!Array.isArray(target.character_book.entries)) {
                target.character_book.entries = [];
            }
            return target.character_book.entries;
        };

        // 搜索过滤后的角色卡世界书词条（触发词/次级词/备注/正文 全字段匹配）
        const filteredCharacterWorldbookEntries = computed(() => {
            const q = characterWorldbookSearchQuery.value.trim().toLowerCase();
            const list = worldbookEntries.value;
            if (!q) return list;
            return list.filter(entry => {
                if (!entry) return false;
                const keysStr = (Array.isArray(entry.keys) ? entry.keys.join(' ') : String(entry.keys || '')) + ' ' +
                                (Array.isArray(entry.secondary_keys) ? entry.secondary_keys.join(' ') : '');
                const text = `${entry.comment || entry.name || ''} ${entry.content || ''} ${keysStr}`.toLowerCase();
                return text.includes(q);
            });
        });

        // 新增空白词条（unshift 到最前）
        const addCharacterWorldbookEntry = () => {
            const entries = ensureCharacterBookEntries();
            if (!entries) return;
            entries.unshift({
                uid: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                keys: [], secondary_keys: [], content: '', comment: '',
                constant: false, selective: false, insertion_order: 50,
                position: 1, enabled: true, order: 100
            });
            refreshCardData();
            addLog('➕ 新增了一条世界书词条', 'info');
        };

        // 删除词条（走原生 confirmDialog 确认）
        const deleteCharacterWorldbookEntry = async (entry) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));   // toRaw 找回原始对象
            if (index === -1) return;
            const ok = await confirmDialog('确定要删除这条世界书设定吗？操作不可逆！');
            if (ok) {
                entries.splice(index, 1);
                refreshCardData();
                addLog('🗑️ 删除了一条世界书词条', 'warning');
            }
        };

        // 克隆词条（在后方插入副本）
        const duplicateCharacterWorldbookEntry = (entry) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));
            if (index === -1) return;
            const cloned = JSON.parse(JSON.stringify(entry));
            cloned.uid = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            cloned.comment = (cloned.comment || cloned.name || '词条') + ' (副本)';
            entries.splice(index + 1, 0, cloned);
            refreshCardData();
            addLog('📋 复制了一条世界书词条', 'info');
        };

        // 上移/下移（dir = -1 上移，+1 下移）
        const moveCharacterWorldbookEntry = (entry, dir) => {
            const entries = safeData.value.character_book?.entries;
            if (!Array.isArray(entries)) return;
            const index = entries.indexOf(toRaw(entry));
            if (index === -1) return;
            const target = index + dir;
            if (target < 0 || target >= entries.length) return;
            const [item] = entries.splice(index, 1);
            entries.splice(target, 0, item);
            refreshCardData();
        };

        // 往词条 key 数组追加一个触发词（field: 'keys' | 'secondary_keys'）
        const addEntryKey = (entry, value, field = 'keys') => {
            if (!entry || !field) return;
            const v = String(value || '').trim().replace(/,$/, '').trim();
            if (!v) return;
            if (!Array.isArray(entry[field])) entry[field] = [];
            if (!entry[field].includes(v)) entry[field].push(v);
            refreshCardData();
        };

        // 从词条 key 数组移除一个触发词
        const removeEntryKey = (entry, value, field = 'keys') => {
            if (!entry || !field || !Array.isArray(entry[field])) return;
            entry[field] = entry[field].filter(k => k !== value);
            refreshCardData();
        };

        // 触发词输入框的回车/逗号处理（标签化输入）
        const handleEntryKeyInput = (entry, event, field = 'keys') => {
            if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addEntryKey(entry, event.target.value, field);
                event.target.value = '';
            }
        };

        // 写回 comment（兼容旧卡仅有 name 字段）
        const updateEntryComment = (entry, value) => {
            if (!entry) return;
            entry.comment = value;
            refreshCardData();
        };
```

### 12.4 改动 2｜App.vue — ctx 注册（`provide('appCtx', ctx)` 之前，约 6308 行 `duplicateWorldbookEntry,` 后）

```js
            // 🎛️ 角色卡内嵌世界书细化操作
            characterWorldbookSearchQuery, filteredCharacterWorldbookEntries,
            addCharacterWorldbookEntry, deleteCharacterWorldbookEntry,
            duplicateCharacterWorldbookEntry, moveCharacterWorldbookEntry,
            addEntryKey, removeEntryKey, handleEntryKeyInput, updateEntryComment,
```

### 12.5 改动 3｜EditorPanel.vue — 替换世界书整段（[223-281 行](file:///d:/1/JSKZX/js/components/EditorPanel.vue#L223-L281)）

```html
                <div v-if="currentTab === 'worldbook'" class="max-w-5xl">
                    <div v-if="worldbookEntries.length > 0">

                        <!-- 工具栏：计数 + 搜索 + 新增 + 折叠 -->
                        <div class="bg-zinc-900 p-2 rounded border border-zinc-800 mb-3">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-xs text-zinc-400 font-bold">共 {{ worldbookEntries.length }} 条世界书设定<span v-if="characterWorldbookSearchQuery.trim()" class="text-blue-400">（筛选后 {{ filteredCharacterWorldbookEntries.length }} 条）</span></span>
                                <div class="flex gap-2">
                                    <button @click="expandAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部展开</button>
                                    <button @click="collapseAllWorldbook" class="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition whitespace-nowrap">全部折叠</button>
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
```

---

## 13. 不合理代码修复：main.js 命名混淆与冗余分支

### 13.1 问题清单（三条「不合理功能代码」）

1. **两个 `main.js` 同名不同职能**：根目录 [main.js](file:///d:/1/JSKZX/main.js) 是 Electron 主进程入口（`package.json` `"main": "main.js"`），[js/main.js](file:///d:/1/JSKZX/js/main.js) 是 Vite 渲染进程入口（`index.html` 引用挂载 App.vue）。同名极易混淆改错。
2. **`models:fetch` 地址构建存在等价冗余分支**：[main.js:1590-1593](file:///d:/1/JSKZX/main.js#L1590-L1593) 的 `/\/v1\/?$/` 分支与 `else` 分支结果完全相同。
3. **`chat:send` 两协议 `max_tokens` 口径不一致**：[main.js:1536](file:///d:/1/JSKZX/main.js#L1536) Anthropic 分支硬编码 `max_tokens: 4096`，OpenAI 分支却直接透传不设上限。

### 13.2 修复 1（已实施）：重命名渲染入口 `js/main.js` → `js/entry.js`

已完成三步：

1. 新建 [js/entry.js](file:///d:/1/JSKZX/js/entry.js)（内容与原 `js/main.js` 一致）。
2. 修改 [index.html:15](file:///d:/1/JSKZX/index.html#L15) 入口引用 `/js/main.js` → `/js/entry.js`。
3. 删除旧的 [js/main.js](file:///d:/1/JSKZX/js/main.js)。

> 根目录 `main.js`（Electron 主进程）与 `package.json` 的 `"main": "main.js"` / `build.files` 均未改动，不受影响。README 中关于 `js/main.js` 的描述属文档，本次未同步（如需可另行更新）。

### 13.3 修复 2（已实施）：合并 `models:fetch` 冗余分支

[main.js](file:///d:/1/JSKZX/main.js#L1586-L1592) 已合并，最终结果：

```js
        // 智能构建 /v1/models 地址：兼容 OpenAI / LM Studio / Ollama 标准接口
        if (/\/models$/.test(ep)) {
          modelsUrl = ep; // 已是以 /models 结尾的完整列表地址，直接使用
        } else if (ep.endsWith('/chat/completions')) {
          modelsUrl = ep.replace(/\/chat\/completions$/, '/models');
        } else {
          modelsUrl = ep.replace(/\/+$/, '') + '/models';
        }
```

### 13.4 问题 3（建议，未改）：统一 `max_tokens` 口径

Anthropic 分支硬编码 4096 会截断长回复。推荐两协议统一为「透传前端值、缺省交给服务端」，把 Anthropic 分支（约 1536 行）改为：

```js
        bodyData = {
          model: payload.model,
          system: systemPrompt,
          messages: filteredMessages,
          temperature: payload.temperature ?? 0.2
          // 移除写死的 max_tokens: 4096，交给服务端默认，避免截断长回复
        };
```

> 若确实需要上限，建议由前端传入 `max_tokens` 并在两分支统一读取，而非单边硬编码。

---

*生成方式：由本次会话排查结论整理；修改请以代码块为准，并自行做好变更前快照.*