/**
 * 项目全面自检脚本（高置信度缺陷雷达）
 * 扫描范围：js/、main.js、mobile gap docs
 * 用法：node scripts/audit-full.mjs
 * 输出：audit-report.md（同时 console 打印摘要）
 * 退出码：0=无P0/P1；1=存在P0/P1（建议 CI 拦截打包）
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const REPORT_PATH = join(ROOT, 'audit-report.md');
const JSON_PATH = join(ROOT, 'audit-report.json');

const SEV = { P0: 'P0', P1: 'P1', P2: 'P2' };
const issues = [];
function add(sev, area, file, line, desc, fix) {
    issues.push({
        sev,
        area,
        file: file.replace(ROOT, '').replace(/\\/g, '/'),
        line,
        desc,
        fix
    });
}

function walk(dir, pred) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p, pred));
        else if (pred(p, name)) out.push(p);
    }
    return out;
}
function read(path) { return readFileSync(path, 'utf-8'); }

// ─────────────────────────────────────────────────────────
// 1. 废弃酒馆 API / 推送接口
// ─────────────────────────────────────────────────────────
function auditDeprecatedTavernApi() {
    const paths = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    const deprecated = [
        { re: /api\/characters\/import/, name: '/api/characters/import' },
        { re: /api\/characters\/export/, name: '/api/characters/export' },
        { re: /api\/worldbook\/import/, name: '/api/worldbook/import' },
        { re: /api\/worldbook\/export/, name: '/api/worldbook/export' },
    ];
    for (const file of paths) {
        const ls = read(file).split(/\r?\n/);
        for (let i = 0; i < ls.length; i++) {
            const line = ls[i];
            // 跳过注释行和模板文本（不是实际 API 调用）
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--') || trimmed.startsWith('/**') || trimmed.startsWith('van-notice-bar') || trimmed.includes('push-tip') || trimmed.includes('废弃')) continue;
            for (const { re, name } of deprecated) {
                if (re.test(line)) {
                    add(SEV.P0, '推送-酒馆API废弃', file, i + 1, `调用已被 SillyTavern 废弃的接口 ${name}`, '改用本地目录推送/导出文件');
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 2. API 假密钥与硬编码默认值
// ─────────────────────────────────────────────────────────
function auditApiKeysAndDefaults() {
    const paths = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    for (const file of paths) {
        const ls = read(file).split(/\r?\n/);
        for (let i = 0; i < ls.length; i++) {
            if (ls[i].includes("'test-key'")) {
                add(SEV.P0, 'API-假密钥', file, i + 1, '存在硬编码 test-key fallback，远端 API 会 401', '空 Key 时拒绝请求并提示用户配置');
            }
            if (ls[i].includes('127.0.0.1:1234')) {
                add(SEV.P1, 'API-硬编码默认地址', file, i + 1, '硬编码本地 LM Studio 地址，不便切换第三方中转', '仅作为占位提示，不写入持久化配置');
            }
            if (/claude-3-5-sonnet-20241022|claude-3-haiku-20240307/.test(ls[i]) && ls[i].includes('api')) {
                add(SEV.P1, 'API-硬编码默认模型', file, i + 1, '硬编码 Claude 模型名称', '回退留空或让用户选择，避免模型不存在');
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 3. 移动端桥接占位 / NOT_IMPLEMENTED
// ─────────────────────────────────────────────────────────
function auditMobileStubs() {
    const androidPath = join(ROOT, 'js', 'bridge', 'android.js');
    const text = read(androidPath);
    const ls = text.split(/\r?\n/);

    // 显式"尚未接入"的函数
    const stubMatches = text.matchAll(/async\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,200}?尚未接入桥接/g);
    for (const m of stubMatches) {
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        add(SEV.P0, '桥接-移动端未实现', androidPath, line, `方法 ${m[1]} 仍是未实现占位`, '接入原生能力或在 UI 禁用');
    }

    // 显式抛 NOT_IMPLEMENTED
    const throwMatches = text.matchAll(/async\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,300}?(NOT_IMPLEMENTED|未实现)/g);
    for (const m of throwMatches) {
        const idx = text.slice(0, m.index).lastIndexOf('async');
        const nameMatch = text.slice(idx, m.index + m[0].length).match(/async\s+(\w+)\s*\(/);
        if (!nameMatch) continue;
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        add(SEV.P0, '桥接-移动端占位', androidPath, line, `方法 ${nameMatch[1]} 抛 NOT_IMPLEMENTED`, '接入或隐藏入口');
    }

    // 辅助工具函数抛 NOT_IMPLEMENTED
    for (let i = 0; i < ls.length; i++) {
        if (ls[i].includes('NOT_IMPLEMENTED') || /尚未接入/.test(ls[i])) {
            add(SEV.P2, '桥接-占位标记', androidPath, i + 1, '存在 NOT_IMPLEMENTED / 尚未接入标记', '检查是否已可接入或已废弃');
        }
    }
}

// ─────────────────────────────────────────────────────────
// 4. 桌面-移动端 IPC 差距
// ─────────────────────────────────────────────────────────
function auditIpcGap() {
    const mainPath = join(ROOT, 'main.js');
    const androidPath = join(ROOT, 'js', 'bridge', 'android.js');
    const mainText = read(mainPath);
    const androidText = read(androidPath);
    const ipcList = mainText.match(/ipcMain\.handle\(['"]([^'"]+)['"]/g) || [];
    const ipcNames = ipcList.map(s => s.match(/ipcMain\.handle\(['"]([^'"]+)['"]/)[1]);
    for (const ipc of ipcNames) {
        const existsInMobile = androidText.includes(`'${ipc}'`) || androidText.includes(`"${ipc}"`);
        if (!existsInMobile) {
            const sev = ipc.startsWith('tavern:') ? SEV.P1 : SEV.P2;
            add(sev, '桥接-IPC差距', androidPath, 0, `桌面 IPC "${ipc}" 在移动端 android.js 无实现`, '确认是否需要移动端支持，若不需要则 UI 禁用');
        }
    }
}

// ─────────────────────────────────────────────────────────
// 5. 数据双数据源 / 幽灵字段
// ─────────────────────────────────────────────────────────
function auditDataSources() {
    const tagsPath = join(ROOT, 'js', 'composables', 'useTags.js');
    const tagsText = read(tagsPath);
    if (tagsText.includes('customTags') && tagsText.includes('data.tags')) {
        add(SEV.P1, '标签-双数据源', tagsPath, 0, 'customTags 与 data.tags 并存，易导致标签重启/重扫后丢失或复活', '统一以 data.tags 为唯一数据源');
    }

    const files = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    for (const file of files) {
        const text = read(file);
        if (text.includes('character_book') && text.includes('characterBook')) {
            add(SEV.P1, '世界书-双字段名', file, 0, '同时存在 character_book 与 characterBook，世界书数据可能不一致', '统一字段名并做迁移');
        }
    }
}

// ─────────────────────────────────────────────────────────
// 6. 已知移动端 UI 缺陷模式
// ─────────────────────────────────────────────────────────
function auditMobileUiPatterns() {
    const mobileVue = walk(join(ROOT, 'js', 'mobile'), (p, n) => n.endsWith('.vue'));
    for (const file of mobileVue) {
        const text = read(file);
        const ls = text.split(/\r?\n/);

        // van-action-sheet 缺 v-model:show
        for (let i = 0; i < ls.length; i++) {
            if (ls[i].includes('<van-action-sheet') && !/<van-action-sheet[\s\S]{0,200}v-model:show/.test(ls.slice(i, i + 3).join('\n'))) {
                add(SEV.P1, '移动端UI-ActionSheet', file, i + 1, 'van-action-sheet 疑似缺少 v-model:show', '补全 v-model:show 绑定');
            }
            if (ls[i].includes('<van-dropdown-item') && !ls[i].includes('v-model')) {
                add(SEV.P1, '移动端UI-DropdownItem', file, i + 1, 'van-dropdown-item 缺少 v-model', '补全 v-model 绑定');
            }
        }

        // :value="函数名" 未调用
        for (let i = 0; i < ls.length; i++) {
            const m = ls[i].match(/:value="(\w+)"/);
            if (m && !ls[i].includes('()') && text.includes(`const ${m[1]} = () =>`)) {
                add(SEV.P1, '移动端UI-函数未调用', file, i + 1, `:value="${m[1]}" 绑定函数未调用，应写 ${m[1]}()`, `改为 :value="${m[1]}()"`);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 7. 关键功能缺失（移动端 vs 桌面）
// ─────────────────────────────────────────────────────────
function auditFeatureGaps() {
    const mobileLib = join(ROOT, 'js', 'mobile', 'views', 'CardLibraryView.vue');
    const text = read(mobileLib);
    if (!/ai.*tag|批量.*(打标|标签)|startAITagging/i.test(text)) {
        add(SEV.P1, '功能缺失-批量AI打标', mobileLib, 0, '移动端卡片库无批量 AI 打标入口', '批量选择后调用 startAITagging');
    }
    if (!/snapshot|快照/i.test(text)) {
        add(SEV.P2, '功能缺失-快照入口', mobileLib, 0, '移动端卡片库无快照入口（桌面详情页有）', '在详情页或库页补快照按钮');
    }

    const mobileDetail = join(ROOT, 'js', 'mobile', 'views', 'CardDetailView.vue');
    const detailText = read(mobileDetail);
    if (!/push.*target|推送目标/i.test(detailText)) {
        add(SEV.P1, '功能缺失-推送目标管理', mobileDetail, 0, '移动端详情页无推送目标管理', '参考桌面 PushModal 实现');
    }
}

// ─────────────────────────────────────────────────────────
// 8. 调试残留与待办
// ─────────────────────────────────────────────────────────
function auditDebugAndTodos() {
    const files = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    for (const file of files) {
        const ls = read(file).split(/\r?\n/);
        for (let i = 0; i < ls.length; i++) {
            const line = ls[i];
            if (/(TODO|FIXME|XXX|HACK)\s*[:：]/.test(line) && !line.trim().startsWith('*')) {
                add(SEV.P2, '代码-待办', file, i + 1, `存在待办: ${line.trim().slice(0, 80)}`, '排期修复或移除');
            }
            if (/console\.(log|warn|error|debug)\(/.test(line) && !line.includes('//')) {
                add(SEV.P2, '代码-调试输出', file, i + 1, '存在 console 调试输出', '上线前清理或改为日志组件');
            }
            if (/window\.alert\(/.test(line)) {
                // bridge/android.js 里可能用 window.alert 作为 WebView 兜底，不算 P1
                const sev = file.includes('android.js') ? SEV.P2 : SEV.P1;
                add(sev, '代码-nativeAlert兜底', file, i + 1, '存在 window.alert 原生弹窗', '统一使用 nativeAlert/Toast');
            }
            // window.prompt 在移动端 WebView 中返回 null，导致按钮点击静默失效
            if (/window\.prompt\(/.test(line)) {
                add(SEV.P0, '代码-window.prompt静默失效', file, i + 1, 'window.prompt 在安卓 WebView 返回 null，按钮点击无反应', '替换为 van-dialog 输入弹窗');
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 9. 异步吞错误 / 只有 console 的 try/catch
// ─────────────────────────────────────────────────────────
function auditSwallowedAsync() {
    const files = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    for (const file of files) {
        const text = read(file);
        // 用大括号计数找到完整的 try...catch 块（正则会被模板字符串 ${...} 里的 } 截断）
        const tryRe = /try\s*\{/g;
        let m;
        while ((m = tryRe.exec(text)) !== null) {
            // 从 try{ 开始，用大括号计数找到匹配的 catch 块结束
            let depth = 1;
            let i = m.index + m[0].length;
            const tryStart = m.index;
            // 跳过 try 主体
            while (i < text.length && depth > 0) {
                if (text[i] === '{') depth++;
                else if (text[i] === '}') depth--;
                i++;
            }
            // 找 catch
            const catchMatch = text.slice(i).match(/^\s*catch\s*\([^)]*\)\s*\{/);
            if (!catchMatch) continue;
            i += catchMatch[0].length;
            depth = 1;
            const catchStart = i;
            while (i < text.length && depth > 0) {
                if (text[i] === '{') depth++;
                else if (text[i] === '}') depth--;
                i++;
            }
            const block = text.slice(tryStart, i);
            const catchBody = text.slice(catchStart, i - 1);
            const hasConsole = /console\.(log|warn|error|debug)\(/.test(catchBody);
            if (!hasConsole) continue;
            const isSilent = !/throw\s+/.test(catchBody)
                && !/nativeAlert|showToast|alert\(|addLog\(/.test(catchBody)
                && !/\.value\s*=\s*['"][^'"]*(失败|错误|error|fail|loading|加载中|保存中)/i.test(catchBody)
                && !/return\s+(`|\[|false|true)/.test(catchBody);
            if (isSilent) {
                const line = text.slice(0, tryStart).split(/\r?\n/).length;
                add(SEV.P1, '异步-错误被吞', file, line, 'try/catch 内仅 console 输出，用户感知不到错误', 'catch 里加 Toast/Alert 或 throw 给外层');
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 10. Vue emit 没人接（子组件 emit 的 event 父组件没 @监听）
// ─────────────────────────────────────────────────────────
function auditEmitListeners() {
    const vueFiles = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.vue'));
    const allText = vueFiles.map(f => ({ f, text: read(f) }));
    for (const { f: file, text } of allText) {
        // 定义了 emits 的组件
        const emits = [...text.matchAll(/defineEmits\((?:\[[\s\S]*?\]|\{[\s\S]*?\})\)/g)];
        if (!emits.length) continue;
        const compName = file.split(/[\\/]/).pop();
        const events = new Set();
        for (const e of emits) {
            const str = e[0];
            const names = str.matchAll(/['"]([\w-]+)['"]/g);
            for (const n of names) events.add(n[1]);
        }
        // 看看其他文件有没有用 <CompName @eventName="..."
        for (const { f: other, text: otext } of allText) {
            if (other === file) continue;
            for (const ev of events) {
                const re = new RegExp(`<${compName.replace(/\.vue$/, '')}[^>]*@${ev}[^>]*>`, 'i');
                if (re.test(otext)) events.delete(ev);
            }
        }
        // 还有未监听的
        for (const ev of events) {
            add(SEV.P2, '组件-emit无人监听', file, 0, `emit 事件 "${ev}" 未在其他组件中找到 @${ev} 监听`, '补监听或从 emits 中移除');
        }
    }
}

// ─────────────────────────────────────────────────────────
// 11. 路由死路 / 未使用的路由 path
// ─────────────────────────────────────────────────────────
function auditRouterDead() {
    const routerFile = join(ROOT, 'js', 'mobile', 'router.js');
    if (!statSync(routerFile).size) return;
    const text = read(routerFile);
    const imports = [...text.matchAll(/import\s+\w+\s+from\s+['"]([^'"]+)['"]/g)];
    const routes = [...text.matchAll(/\{[\s\S]{0,200}?path\s*:\s*['"]([^'"]+)['"][\s\S]{0,200}?component\s*:\s*(\w+)['"]?/g)];
    for (const m of routes) {
        const comp = m[2];
        const found = imports.some(im => im[0].includes(comp));
        if (!found) {
            const line = text.slice(0, m.index).split(/\r?\n/).length;
            add(SEV.P1, '路由-组件缺失', routerFile, line, `路由使用组件 ${comp} 但未在 router.js 中 import`, '补 import 或移除路由');
        }
    }
}

// ─────────────────────────────────────────────────────────
// 12. 移动端调用桌面独占 API
// ─────────────────────────────────────────────────────────
function auditMobileUsesDesktopOnly() {
    const mobileFiles = walk(join(ROOT, 'js', 'mobile'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    const androidText = read(join(ROOT, 'js', 'bridge', 'android.js'));
    for (const file of mobileFiles) {
        const ls = read(file).split(/\r?\n/);
        for (let i = 0; i < ls.length; i++) {
            const m = ls[i].match(/electronAPI\.(\w+)\(/);
            if (!m) continue;
            const method = m[1];
            // 检查 android.js 里有没有同名实现（粗略）
            if (!androidText.includes(`${method}(`)) {
                add(SEV.P1, '移动端-桌面独占API', file, i + 1, `移动端代码直接调用 window.electronAPI.${method}，android.js 未实现`, '改用 bridge/api.js 或 android.js 实现');
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 13. 关键配置开关未同步持久化
// 只检查真正应该持久化的配置对象字段，避免普通 UI 状态误报
// ─────────────────────────────────────────────────────────
function auditConfigSync() {
    const configObjects = ['snapshotConfig', 'apiConfig', 'uiConfig', 'settings', 'appConfig'];
    const files = walk(join(ROOT, 'js'), (p, n) => n.endsWith('.js') || n.endsWith('.vue'));
    for (const file of files) {
        const ls = read(file).split(/\r?\n/);
        for (let i = 0; i < ls.length; i++) {
            const line = ls[i];
            const hasConfigObj = configObjects.some(c => line.includes(c));
            if (hasConfigObj && /\.(value)\s*=/.test(line) && !/syncConfigToDisk|saveConfig|saveSnapshot|syncConfig|persist|watch\(/.test(line) && !line.trim().startsWith('//')) {
                add(SEV.P2, '配置-可能未持久化', file, i + 1, `配置字段被修改但该行未见持久化调用: ${line.trim().slice(0, 80)}`, '确认是否有 watch 做持久化，否则立即同步');
            }
        }
    }
}

// ─────────────────────────────────────────────────────────
// 报告生成
// ─────────────────────────────────────────────────────────
function buildReport() {
    const grouped = {};
    for (const it of issues) { (grouped[it.area] ||= []).push(it); }
    const sorted = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));

    let md = `# 项目自检报告\n\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;
    md += `## 汇总\n\n| 严重级别 | 数量 |\n| --- | --- |\n| P0 | ${issues.filter(i => i.sev === SEV.P0).length} |\n| P1 | ${issues.filter(i => i.sev === SEV.P1).length} |\n| P2 | ${issues.filter(i => i.sev === SEV.P2).length} |\n| **总计** | **${issues.length}** |\n\n`;

    for (const [area, list] of sorted) {
        md += `## ${area}\n\n`;
        for (const it of list.sort((a, b) => (a.sev > b.sev ? 1 : -1))) {
            md += `- **${it.sev}** \`${it.file}${it.line ? ':' + it.line : ''}\`：${it.desc}  \n  → 修复建议：${it.fix}\n`;
        }
        md += '\n';
    }

    md += `## 使用说明\n\n运行 \`node scripts/audit-full.mjs\`，退出码非 0 表示存在 P0/P1 问题，建议在 CI / 打包前拦截。\n`;
    return md;
}

// 主流程
auditDeprecatedTavernApi();
auditApiKeysAndDefaults();
auditMobileStubs();
auditIpcGap();
auditDataSources();
auditMobileUiPatterns();
auditFeatureGaps();
auditDebugAndTodos();
auditSwallowedAsync();
auditEmitListeners();
auditRouterDead();
auditMobileUsesDesktopOnly();
auditConfigSync();

const report = buildReport();
writeFileSync(REPORT_PATH, report, 'utf-8');
writeFileSync(JSON_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), counts: { P0: issues.filter(i => i.sev === SEV.P0).length, P1: issues.filter(i => i.sev === SEV.P1).length, P2: issues.filter(i => i.sev === SEV.P2).length }, issues }, null, 2), 'utf-8');
console.log(report);

if (issues.some(i => i.sev === SEV.P0 || i.sev === SEV.P1)) {
    const p0 = issues.filter(i => i.sev === SEV.P0).length;
    const p1 = issues.filter(i => i.sev === SEV.P1).length;
    console.error(`\n❌ 自检未通过：${p0} 个 P0、${p1} 个 P1 问题。建议修复后再打包。`);
    process.exit(1);
}
console.log('\n✅ 自检通过，无 P0/P1 问题。');
process.exit(0);
