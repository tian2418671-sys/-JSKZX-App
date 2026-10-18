/**
 * 🛡️ WebView 兼容性守卫：禁止源码中出现正则后行断言 lookbehind。
 *
 * 背景（2026-10-18 真机实测）：ZTE 7551N 上的系统 WebView 为 Chromium 101，
 * 执行 `(?<=…)` / `(?<!…)` 会触发 V8 内部 CHECK 失败 →
 * `CrRendererMain` SIGTRAP → 整个 WebView 渲染进程被杀 →
 * `[FATAL:crashpad_client_linux.cc] Render process's crash wasn't handled`
 * → App 连带崩溃。表现为「AI 打标跑到一半 App 直接退出」。
 *
 * 修复方式：改写为等价的无 lookbehind 形式（捕获组前置 / 逐字符扫描）。
 * 本测试用于防止后续提交把 lookbehind 又加回来。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../js/', import.meta.url));
const EXTS = new Set(['.js', '.vue', '.mjs']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (EXTS.has(extname(name))) out.push(p);
    }
    return out;
}

test('js/ 源码不含正则后行断言（WebView 101 会崩渲染进程）', () => {
    const files = walk(ROOT);
    assert.ok(files.length > 0, '应扫描到 js 源码文件');

    const offenders = [];
    for (const f of files) {
        const text = readFileSync(f, 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((line, i) => {
            // 跳过注释行（说明性文字允许提到该语法）
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
            if (/\(\?<[=!]/.test(line)) {
                offenders.push(`${f.replace(ROOT, 'js/')}:${i + 1}`);
            }
        });
    }

    assert.deepEqual(offenders, [], `发现后行断言（请改为无 lookbehind 写法）：\n${offenders.join('\n')}`);
});

test('squeezeCjkSpaces 行为等价于原 lookbehind 正则', async () => {
    const mod = await import('../js/utils/parseTagReply.js');
    // 通过公开 API 间接验证：中文之间的空白应被压掉，英文单词间空白保留
    const r1 = mod.sanitizeTagList(['安达 与岛村']);
    assert.deepEqual(r1, ['安达与岛村']);
    const r2 = mod.sanitizeTagList(['hello world']);
    assert.deepEqual(r2, ['hello world']);
    const r3 = mod.sanitizeTagList(['校园 / 青春']);
    assert.deepEqual(r3, ['校园/青春']);
});
