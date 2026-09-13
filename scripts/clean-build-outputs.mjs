/**
 * 构建输出目录健壮清理。
 *
 * 背景(一次真实事故的根因):
 *   package.json 的 build:web 使用 fs.rmSync('web', {recursive:true, force:true}) 清理产物。
 *   但在 Windows 上,当目录内文件被其他进程持有句柄时(常见于杀毒实时扫描、编辑器文件监听),
 *   rmSync 会「静默失败」——不抛异常,也不删除任何文件。
 *   于是 web/ 里的历史分块持续累积(实测累积到 345 个文件,可回溯数天),
 *   cap sync 再把它们整体拷进 Android 工程,最终:
 *     ① 发布包体积近乎翻倍(7.58 MB → 清理后 3.85 MB)
 *     ② 打包可能带上陈旧的 index.html 入口,用户装到的其实是旧版本
 *
 * 本模块的应对策略(逐级降级):
 *   ① 多次重试删除(句柄占用往往是瞬时的,杀毒扫描结束后即可删除)
 *   ② 仍失败则「重命名腾挪」——Windows 上目录被占用时通常仍可重命名,
 *      把占用目录改名后,目标路径即被腾空,构建可继续正常进行
 *   ③ 记录腾挪出来的目录,流程末尾再尝试回收
 *
 * 用法:
 *   import { cleanBuildOutputs, cleanupTrash } from './clean-build-outputs.mjs';
 *   const trash = cleanBuildOutputs();   // 返回未能删除的目录列表
 *   ...
 *   cleanupTrash(trash);
 *
 * 直接执行时:清理 web/ 与 android/app/src/main/assets/public/。
 */
import { existsSync, rmSync, renameSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const WEB_DIR = join(root, 'web');
export const PUBLIC_DIR = join(root, 'android', 'app', 'src', 'main', 'assets', 'public');

/**
 * 腾挪目录的落脚点。
 * ⚠ 不能放在 android/app/src/main/assets/ 下 —— Gradle 会打包该目录下的一切,
 * 残留垃圾会直接进 APK(实测体积反弹 3.85 MB → 4.64 MB)。
 * 放在项目根下与构建输出同卷,保证 rename 不跨卷。
 */
const TRASH_ROOT = join(root, '.trash');

const sleep = (ms) => {
    // 同步等待:清理发生在构建开始前,阻塞式实现最简单且无并发风险
    const end = Date.now() + ms;
    while (Date.now() < end) {
        /* busy wait */
    }
};

function countEntries(dir) {
    try {
        return readdirSync(dir).length;
    } catch (e) {
        return 0;
    }
}

/**
 * 尽力删除一个目录。返回:
 *   { ok: true }                     已删除
 *   { ok: false, trash: '<路径>' }   删除失败,已重命名腾挪
 */
export function forceRemoveDir(dir) {
    if (!existsSync(dir)) return { ok: true };

    // ① 重试删除:句柄占用常为瞬时(杀毒扫描 / 编辑器索引),退避重试往往能成功
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
        } catch (e) {
            /* 交给下一轮重试 */
        }
        if (!existsSync(dir)) return { ok: true };
        if (attempt < 4) sleep(250 * attempt);
    }

    // ② 兜底:重命名腾挪。Windows 上目录被占用时通常仍可重命名,
    //    改名后目标路径即被腾空,构建得以在干净路径上进行。
    //    落脚点选在项目根下的 .trash/,既同卷可 rename,又不在 Gradle 资源目录内。
    const trashName = `${basename(dir)}.__stale_${Date.now()}`;
    let trash;
    try {
        mkdirSync(TRASH_ROOT, { recursive: true });
        trash = join(TRASH_ROOT, trashName);
        renameSync(dir, trash);
    } catch (e) {
        // rename 失败(如跨卷/权限)时退回同目录改名,至少腾空原路径
        try {
            trash = `${dir}.__stale_${Date.now()}`;
            renameSync(dir, trash);
        } catch (e2) {
            return { ok: false, trash: null, error: e2 };
        }
    }
    return { ok: false, trash };
}

/**
 * 清理全部构建输出目录。
 * @returns {{ cleaned: string[], trashed: string[], failed: string[] }}
 */
export function cleanBuildOutputs({ verbose = true } = {}) {
    const result = { cleaned: [], trashed: [], failed: [] };

    for (const dir of [WEB_DIR, PUBLIC_DIR]) {
        const before = existsSync(dir) ? countEntries(dir) : 0;
        const res = forceRemoveDir(dir);

        if (res.ok) {
            result.cleaned.push(dir);
            if (verbose) console.log(`[clean] ✓ 已清理 ${dir}${before ? `(原含 ${before} 项)` : ''}`);
        } else if (res.trash) {
            result.trashed.push(res.trash);
            if (verbose) {
                console.log(
                    `[clean] ⚠ ${dir} 被进程占用无法删除,已重命名腾挪 → ${basename(res.trash)}\n` +
                        `        目标路径已腾空,构建可继续;该目录将在流程末尾再次尝试回收。`
                );
            }
        } else {
            result.failed.push(dir);
            if (verbose) {
                console.error(
                    `[clean] ✗ ${dir} 既无法删除也无法重命名:${res.error?.code || ''} ${res.error?.message || ''}`
                );
            }
        }
    }

    return result;
}

/** 流程末尾再次尝试回收腾挪出来的目录(此时占用的进程通常已释放句柄)。 */
export function cleanupTrash(trashList, { verbose = true } = {}) {
    const left = [];
    for (const trash of trashList || []) {
        let removed = false;
        for (let i = 0; i < 3 && !removed; i++) {
            try {
                rmSync(trash, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            } catch (e) {
                /* 继续重试 */
            }
            removed = !existsSync(trash);
            if (!removed) sleep(300);
        }
        if (!removed) left.push(trash);
        else if (verbose) console.log(`[clean] ✓ 已回收 ${basename(trash)}`);
    }
    if (left.length && verbose) {
        console.log(`[clean] ⚠ 以下目录仍被占用,请稍后手动删除:\n${left.map((d) => '        ' + d).join('\n')}`);
    }
    return left;
}

// 直接执行:仅做清理
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const res = cleanBuildOutputs();
    if (res.failed.length) process.exit(1);
    cleanupTrash(res.trashed);
}
