dan# JSKZX App 移植方案（定稿 v1）

> 对象：SillyTavern 角色卡管理器（Vue 3 + Tailwind + Electron）移植为 Android App
> 版本：v1.9.0 源码基线｜方案版本 v1（2026-08-27）

---

## 1. 项目背景与目标

桌面版是 Electron 应用，渲染层为 Vue 3 SPA（`js/`），原生能力集中在主进程（`main.js`）。
目标：将「角色卡/世界书管理、解析、编辑、导入导出、聊天测试」核心能力搬到 Android，移动端信息架构与交互重新设计，同时保持桌面版可用。

## 2. 现状架构

| 层级 | 位置 | 说明 |
|---|---|---|
| UI 层 | `js/components/*.vue`（30 个） | Vue 3 + Tailwind，纯前端 |
| 状态/逻辑层 | `js/composables/*.js`（18 个）+ `utils/` | 卡片/世界书/快照/查重/图表等 |
| 桥接层 | `preload.js` → `window.electronAPI` | 约 50 个 IPC 通道，全渲染层 **221 处**调用，集中在 9 个 composables + `App.vue` |
| 原生能力层 | `main.js`（Electron 主进程） | 文件读写、PNG 解析、sharp 图片、CORS 转发、对话框、OTA | 

- 渲染层仅依赖 `window.electronAPI` 统一接口 → **迁移可复用 >90%**。
- 移植本质 = 在目标平台重新实现 electronAPI 底层，接口签名不变。

## 3. 已确定决策（全部已定）

| 维度 | 决策 |
|---|---|
| 目标平台 | Android（首发单端） |
| 技术路线 | Capacitor 封装（WebView 复用 Vue 渲染层） |
| 数据存储 | 直连系统文件夹（SAF 授权目录树） |
| 功能范围 | 核心优先（查重/磁盘扫描/OTA/推送酒馆 后置） |
| UI 实现方式 | Vant4 组件库重写 |
| 桌面版处理 | 双端同一套代码（同一组件双端响应式） |
| 信息架构 | 4 Tab 底部导航 |
| 视觉风格 | 深浅双主题切换 |
| 品牌主色 | 青色系（`#06B6D4`） |
| 卡片形态 | 网格 / 列表可切换 |

## 4. 总体技术路线

```
现有 Vue SPA（js/）
   ├─ Electron 壳（桌面）  保留
   └─ Capacitor 壳（Android）新增
        ├─ android/ 平台工程（Gradle）
        ├─ capacitor.config（webDir → Vite 构建输出）
        └─ 原生插件：文件系统(SAF) / 网络转发(OkHttp) / 共享
```

- 新增 `js/bridge/` 适配层：析出「electronAPI 接口定义 + Electron 实现 + Android 实现」，启动时按环境注入。
- 新增依赖：`vant`、`vue-router`；`vue` 保持现状。

## 5. 桥接层替换映射（核心工作）

| electronAPI 通道 | Android 实现 |
|---|---|
| `dialog:openFolder` / 选库目录 | SAF 目录选择器 + 授权目录树 URI 持久化 |
| `fs:*` 分组新建/重命名/移动/删除 | SAF `DocumentFile` 操作 |
| `library:rescan` / `readBuffer` / `readText` / `saveCard` | SAF 文件读写 |
| `file:exportPackage` / 批量导入导出 | ZIP 打包/解包 + 系统分享 |
| `chat:send` / `models:fetch` / `wb:fetchUrl` / 下载卡片 | 自建 Capacitor 插件（OkHttp 转发，绕 CORS），接口不变 |
| PNG 解析 / 换图 | 渲染层已有纯 JS 解析器；sharp 逻辑替换为 Web 端重编码 |
| `dialog:showMessage` | 桥接为系统 Toast/Alert |
| 拖拽 `getPathForFile` / `copyToLibrary` | 系统文件选择器 + 复制 |
| 快照 / 查重 / 磁盘扫描 / OTA / 推送酒馆 | **后置（M4）或裁剪** |

## 6. UI 设计规范

### 6.1 双主题（深浅切换）
- Vant CSS 变量 + Tailwind `dark:`；主题存 `app_config.json`，桌面与移动共用、一处切换双端生效。
- 深色：`zinc-950/800` 底；浅色：`zinc-50/100` 底。

### 6.2 品牌主色
- 青色系 `#06B6D4`（dark `#22D3EE`），统一改写 `--van-primary` 等；桌面高亮同步对齐。

### 6.3 图形规范
- 圆角：卡片 12dp / BottomSheet 顶 16dp / 按钮 8dp；8pt 间距网格；Tab 栏 64dp + 安全区适配。

### 6.4 交互映射（桌面 → 移动）
- 右键 / Hover → 长按 BottomSheet
- 拖拽分组 → 长按 + 滑动排序
- 全屏 Modal → 移动端页面 / 半屏 BottomSheet
- 触控目标 ≥ 48dp；列表 KeepAlive 保状态；骨架屏 / 空状态统一

## 7. 移动端信息架构（4 Tab）

| Tab | 结构 |
|---|---|
| 卡片库 | 工具条（搜索/过滤/新建）→ 网格/列表（可切换）→ 抽屉分组 → 卡片详情页 |
| 世界书 | 分组侧栏（抽屉）+ 条目搜索 → 条目全屏编辑页 → 长按动作单 |
| 聊天测试 | 卡片选择器 → 气泡会话页 → 长按消息复制/重发 |
| 设置 | 列表式：库目录(SAF 状态)/API 配置/语言/快照开关/关于（后置项置灰） |

### 卡片详情页（三段结构 · 已定稿）
- 页面：顶栏(返回+卡名+⋯) / 16:9 封面(可换) / 信息行(名称+版本+标签+⚡Token) / **分段 Tab：设定·世界书·正则** / 内容区 / 底部常驻栏(聊天测试+更多)
- **设定段**：人物描述 / 性格 字段卡（点按 → 半屏 BottomSheet 大文本编辑，字数+Token 实时）+ **折叠块「高级设定」**（开场白/场景/示例对话/备用开场白）+ **折叠块「状态栏预览」**（Vant Collapse，默认收起）
- **世界书段**：内嵌条目列表（标题+触发词），左滑移除/右滑复用，底部「打开世界书管理器」
- **正则段**：开关行列表（名称+匹配要点+启用态）
- 保存：任何修改轻保存（防抖 800ms）+ "已保存 ✓" 提示；编辑中文件外改 → 冲突提示；删除双步确认

## 8. 数据与存储（关键实现要点）

- **直连系统文件夹**：Android 10+ scoped storage 下唯一可靠做法 = **SAF 授权目录树**。
  首次启动引导用户选库目录 → 全库读写都在这棵目录树内，**不申请** `MANAGE_EXTERNAL_STORAGE`。
- 配置 `app_config.json` 存 APP 私有目录 + 记录库目录 URI。

## 9. 里程碑

| 阶段 | 内容 | 出口 |
|---|---|---|
| **M0 壳工程** | Capacitor Android 工程 + Vite 构建接入 WebView + 引入 Vant4/vue-router | 空白 App 出包 |
| **M1 桥接层** | 文件系统核心方法 + 配置持久化 + SAF 授权流程 | 渲染层可读写库目录 |
| **M2-UI** | 4 Tab 骨架 + 卡片库页（列表/分组/详情三段）双端渲染 | 移动端核心导航跑通 |
| **M2-功能** | 世界书 + 聊天测试 + 导入导出（逐功能 UI 同步移动化） | 核心功能可用 |
| **M3 打磨** | 手势细节 / 性能 / 真机兼容 / 权限流程 / 签名打包 | 可安装分发 |
| **M4 后置** | 查重 / 磁盘扫描 / OTA / 推送酒馆 | 按需 |

## 10. 风险与注意

1. **存储权限**：SAF 授权流程是体验关键，需做好"选错目录/权限丢失"引导。
2. **CORS**：聊天/模型/世界书 URL 需走原生 OkHttp 转发，注意超时与错误透传。
3. **WebView 性能**：大库扫描、图片懒加载、减少 DOM 重绘。
4. **双端回归**：UI 改造需保证桌面 Electron 版不回归（同一组件断点分叉）。
5. **包体**：Vant 按需引入，控制体积。

## 11. 待确认 / 待提供

- [ ] 封面形态：16:9 大图 vs 紧凑头像（默认 16:9）
- [ ] 底部常驻栏是否加「收藏 ⭐」
- [ ] 编辑入口：字段卡"编辑"角标 vs 点整卡（默认角标）
- [ ] 应用名 / 包名（默认 `com.sillytavern.cardmanager.android`）
- [ ] Android 签名证书；真机调试设备