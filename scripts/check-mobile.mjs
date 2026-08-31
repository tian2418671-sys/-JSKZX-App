/**
 * 移动端静态体检脚本：扫描 js/mobile 下的 .vue 源码，识别已知 bug 模式。
 * 用法：node scripts/check-mobile.mjs
 * 命中即打印「文件:行号 → 说明」，退出码非 0 表示发现问题（可接入 CI / 打包前钩子）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SCAN_DIR = join(ROOT, 'js', 'mobile');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.vue')) out.push(p);
    }
    return out;
}

const files = walk(SCAN_DIR);
const issues = [];

for (const file of files) {
    const rel = file.replace(ROOT + '\\', '').replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const lineOf = (re, from = 0) => {
        for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
        return -1;
    };

    // ── 1. van-action-sheet 缺 v-model:show（被 popup 包裹后永远 show=false） ──
    const asIdx = text.indexOf('<van-action-sheet');
    if (asIdx >= 0) {
        const asLine = lines.slice(0, text.slice(0, asIdx).split('\n').length).length;
        // 找到该 action-sheet 标签的起始行
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<van-action-sheet') && !/<van-action-sheet[\s\S]{0,200}v-model:show/.test(lines.slice(i, i + 3).join('\n'))) {
                issues.push(`${rel}:${i + 1} → van-action-sheet 疑似缺少 v-model:show（会导致面板无法弹出）`);
            }
        }
    }

    // ── 2. :value="函数名" 未调用（会显示函数源码/undefined） ──
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/:value="(\w+)"/);
        if (m && !lines[i].includes('()') && text.includes(`const ${m[1]} = () =>`)) {
            issues.push(`${rel}:${i + 1} → :value="${m[1]}" 疑似绑定函数未调用（应写 ${m[1]}()）`);
        }
    }

    // ── 3. {{ xxx.length }} 中 xxx 是数字 computed（显示 undefined） ──
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/\{\{\s*(\w+)\.length\s*\}\}/);
        if (m) {
            const decl = text.match(new RegExp(`const ${m[1]} = computed\\(\\(\\) => [^.]+\\.length\\)`));
            if (decl) issues.push(`${rel}:${i + 1} → {{ ${m[1]}.length }} 疑似数字取 .length（应直接写 ${m[1]}）`);
        }
    }

    // ── 4. (已移除) @click 直接赋值 boolean ref 在 Vue 3 中可靠，误报过高 ──

    // ── 5. van-dropdown-menu 有 item 但 item 缺 v-model（筛选不生效） ──
    if (text.includes('<van-dropdown-menu')) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<van-dropdown-item') && !lines[i].includes('v-model=')) {
                issues.push(`${rel}:${i + 1} → van-dropdown-item 缺 v-model（筛选值无法写入）`);
            }
        }
    }

    // ── 6. 快捷过滤类「全部」分支吞掉后续特判（currentCategoryKey 短路类） ──
    for (let i = 0; i < lines.length; i++) {
        if (/if\s*\(\s*\w+\.value\s*===\s*'全部'\s*\)\s*return\s*'all'/.test(lines[i])) {
            // 看后面几行是否还有 quickFilter 类特判，若有则提示顺序风险
            const tail = lines.slice(i, i + 8).join('\n');
            if (/has_lorebook|has_regex/.test(tail)) {
                issues.push(`${rel}:${i + 1} → 「全部」分支在前可能短路后续特判（has_lorebook/has_regex），请确认优先级`);
            }
        }
    }
}

if (issues.length === 0) {
    console.log(`✅ 移动端体检通过：扫描 ${files.length} 个 .vue 文件，未发现已知 bug 模式。`);
    process.exit(0);
} else {
    console.log(`⚠️  发现 ${issues.length} 处可疑问题：\n`);
    for (const it of issues) console.log('  ' + it);
    console.log('\n请逐条核对（存在误报可能，但均为已知 bug 高发模式）。');
    process.exit(1);
}
