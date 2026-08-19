# 卡片导入 BUG：分组后出现「没有名字的空组」修复方案

## 一、问题现象

导入卡片后，再执行分组（移分组 / 批量修改分类分组）操作，分组下拉列表里会多出一个**没有名字的空分组**（下拉项显示为空白）。

## 二、根因分析

分组下拉列表渲染的数据源是 `allCategories`，它由「系统预设分组 + 自定义分组」合并而来：

```js
// js/components/App.vue 第 937~940 行
const allCategories = computed(() => {
    const customObjs = customCategories.value.map(c => ({ key: c, cn: c, en: c }));
    return [...defaultCategories.value, ...customObjs];
});
```

因此，只要 `customCategories` 数组里混入一个**空字符串 `''`**（或 `null`），就会生成：

```js
{ key: '', cn: '', en: '' }
```

`getCategoryDisplayName` 返回空字符串，最终在侧边栏 [SidebarPanel.vue](file:///workspace/js/components/SidebarPanel.vue) 的分组下拉框、以及编辑器 [EditorPanel.vue](file:///workspace/js/components/EditorPanel.vue) 的「分组」下拉框里渲染成一个**没有名字的空组**。

排查所有往 `customCategories` 写入的代码，绝大多数入口都做了 `trim() !== ''` 之类的防呆校验，**唯独「恢复配置 / 导入库配置」`importLibraryDB` 没有做任何空值校验**：

```js
// js/components/App.vue 第 3341~3347 行 —— ❌ 存在 BUG
if (dbData.categories && Array.isArray(dbData.categories)) {
    dbData.categories.forEach(c => {
        if (!isCategoryKnown(c)) {
            customCategories.value.push(c);   // ❌ c 可能是 '' / null / 数字 / 对象
        }
    });
}
```

当导入的备份配置文件（`SillyTavern_Library_DB.json`）的 `categories` 数组里含有空字符串或脏数据时（手改过、旧版本导出、或被污染过），空值会被原样塞进 `customCategories`，从而出现「没有名字的空组」。

> 补充：`isCategoryKnown('')` 会返回 `false`（因为没有任何分组的 cn/en/key 等于空字符串），这正是空值能绕过 `!isCategoryKnown(c)` 判断、最终被 `push` 进去的原因。

## 三、修复代码块

### （1）主修复：`importLibraryDB` 增加类型 + 非空校验

修改 [App.vue](file:///workspace/js/components/App.vue) 的 `importLibraryDB`，与其它分组写入入口保持一致：

```js
if (dbData.categories && Array.isArray(dbData.categories)) {
    dbData.categories.forEach(c => {
        // 🔧 修复：只接受「非空字符串」，杜绝空组 / 幽灵分组
        if (typeof c !== 'string' || c.trim() === '') return;
        if (!isCategoryKnown(c)) {
            customCategories.value.push(c);
        }
    });
}
```

### （2）防御性加固（推荐同时加上）：`allCategories` 合并处兜底过滤

修改 [App.vue](file:///workspace/js/components/App.vue) 的 `allCategories` 计算属性，任何来源（含遗留的 localStorage / app_config.json 脏数据）的空值都无法再渲染为空分组：

```js
const allCategories = computed(() => {
    const customObjs = customCategories.value
        .filter(c => typeof c === 'string' && c.trim() !== '') // 🔧 兜底过滤空值
        .map(c => ({ key: c, cn: c, en: c }));
    return [...defaultCategories.value, ...customObjs];
});
```

## 四、修复效果

- 导入含脏数据的库配置后，不会再生成「没有名字的空组」；
- `allCategories` 兜底过滤后，即使历史 localStorage / 配置文件中残留含空值的分组，UI 也不会再显示空白分组项；
- 不改变其它分组逻辑（新建 / 重命名 / 删除 / 移动 / 自动清理）的正常行为。

---

> 说明：本次仅定位问题并给出修复代码，未对任何源代码做改动。