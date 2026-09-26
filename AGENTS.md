# AGENTS.md — JSK管理APP 给 AI 助手的入口

> 本文件供 AI 助手自动加载。开工前先读：
> [`docs/README.md`](docs/README.md)（文档中心）→ [`docs/内部开发/README.md`](docs/内部开发/README.md)

## 项目是什么

SillyTavern 角色卡管理器的 **Android 版**（Capacitor 8 + Vue 3.5 + Vite 8 + Tailwind 3），
当前版本 **v1.10.31**。与桌面版 `e:\AI\酒馆工具\JSK管理` 同源、构建链不同（桌面版为 Electron）。

## 必读文档

| 找什么 | 去哪 |
| --- | --- |
| 文档总导航 | [`docs/README.md`](docs/README.md) |
| 开发规范 / 流程铁律 | [`docs/铁律/开发流程铁律.md`](docs/铁律/开发流程铁律.md) |
| 每日开发流程 | [`docs/铁律/一条龙服务流程.md`](docs/铁律/一条龙服务流程.md) |
| BUG 修复 / 实测 / 技术文档 / 方案 | [`docs/内部开发/`](docs/内部开发/) |
| 用户可见更新说明 | [`docs/用户更新/`](docs/用户更新/) |
| 版本技术细节（内部） | [`CHANGELOG.md`](CHANGELOG.md) |

## 常用命令

```bash
npm run dev            # 开发（浏览器）
npm run build:web      # 构建 Web 层
npm run sync:android   # 同步到 Android 工程
npm run build:android  # 构建 APK
npm run verify:apk     # APK 校验
npm run test           # 测试
```

Android 构建走命令行（Capacitor / Gradle，SDK 在 `android-sdk/`），**不需要 VS Code Java 扩展**。

## 红线 / 注意

1. **没收到用户明确的推送 / 打包指令，禁止 push、打包、发 Release。**
2. **对外文档不写内部细节**（文件名 / 函数名 / 内存 MB / 崩溃原文）—— 那些只进 `CHANGELOG.md` 与 `docs/内部开发/`。
3. 与桌面版共研同一功能时，先参考桌面版对应实现与文档（桌面版 `docs/bugs/` 有 100+ 条历史踩坑）。

## AI 工具链（本机通用）

> 用户级指令（所有工作区自动加载）：`%APPDATA%\Code\User\prompts\instructions\ai-extension-workflow.instructions.md`
> 通用原则：**装了就要用** —— 终端 CLI 优先（可闭环验证）→ VS Code 命令（UI 效果）→ 文件工作流。

| 场景 | 工具 |
| --- | --- |
| Markdown 检查/修复 | `npx --yes markdownlint-cli2 "<glob>" --fix` |
| 全工作区 md 检查 | VS Code 命令 `markdownlint.lintWorkspace` |
| 文档导出 PDF / HTML | VS Code 命令 `md.exportPdf` / `md.exportHtml`（nettrash 扩展） |
| 酒馆卡片/UI 工作流 | 用户级 skills：`tavern-ui`、`tavern-cards` |

写 Markdown 请遵守 lint 规则（标题空行 / 代码块标语言 / 列表空行）。
