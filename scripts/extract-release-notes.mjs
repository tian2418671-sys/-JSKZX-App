/**
 * 从仓库根 RELEASE_NOTES.md 抽取指定版本段（对外正文），输出临时文件路径。
 *
 * 对齐桌面版发布规范：GitHub Release 正文一律用 --notes-file 从 RELEASE_NOTES.md
 * 抽取，不手抄。抽取用仅 ASCII 的正则（^##）定位版本段，写到系统临时目录（ASCII 路径）。
 *
 * 用法：
 *   node scripts/extract-release-notes.mjs v1.10.26
 *   # → 打印临时文件路径；配合:
 *   #   gh release edit v1.10.26 --notes-file <打印的路径>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!tag) {
    console.error('用法: node scripts/extract-release-notes.mjs vX.Y.Z');
    process.exit(1);
}

const notesPath = join(root, 'RELEASE_NOTES.md');
if (!existsSync(notesPath)) {
    console.error('未找到 RELEASE_NOTES.md');
    process.exit(1);
}

const raw = readFileSync(notesPath, 'utf-8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/);
const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(tag));
if (start < 0) {
    console.error(`RELEASE_NOTES.md 中未找到 ${tag} 版本段`);
    process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) || /^---\s*$/.test(lines[i])) { end = i; break; }
}
const text = lines.slice(start, end).join('\n').trim();
const out = join(tmpdir(), `jskzx-release-notes-${tag.replace(/[^\w.-]/g, '')}.md`);
writeFileSync(out, text + '\n', 'utf-8');
console.log(out);
