/**
 * 🗑️ 回收站移动重试链单元测试（修复「首次清理必失败」回归）
 *
 * 背景（2026-09-25 用户实测抓出）：原生 move 对「目标父目录不存在」是 call.reject（抛异常），
 * 而旧 trashByMove 的重试降级写在 resolve({success:false}) 分支 → 异常直接进 catch，
 * 首次清理（库根 .trash 从未创建）必然报「目标目录不可写」。
 *
 * 覆盖：首次清理逐级建目录+重试 / 已存在目录一次成功 / 深子路径链 / resolve 假值形态 /
 *       重试仍失败 / mkdir 也失败 / 空路径。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trashOneByMove } from '../js/bridge/android.js';

/** 模拟原生桥:move 目标父目录不存在 → reject;mkdir 父不存在 → reject(非递归)、已存在幂等 */
function makeFs(initialDirs = []) {
    const dirs = new Set(initialDirs);
    const moved = [];
    const mkdirCalls = [];
    const moveCalls = [];
    return {
        dirs,
        moved,
        mkdirCalls,
        moveCalls,
        fs: {
            async move({ path, newPath }) {
                moveCalls.push({ path, newPath });
                const parent = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : '';
                if (parent && !dirs.has(parent)) throw new Error('目标目录不可写');
                moved.push(path);
                return { success: true };
            },
            async mkdir({ path }) {
                mkdirCalls.push(path);
                const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
                if (parent && !dirs.has(parent)) throw new Error('创建失败:目录不可写');
                dirs.add(path);
                return { success: true };
            }
        }
    };
}

test('首次清理：.trash 不存在 → 逐级建目录后重试成功', async () => {
    const { fs, moved, mkdirCalls, moveCalls, dirs } = makeFs([]);
    const err = await trashOneByMove(fs, 'RealCards/---温馨的翻斗花园1.0.json');
    assert.equal(err, null, '应成功');
    assert.deepEqual(mkdirCalls, ['.trash', '.trash/RealCards'], 'mkdir 链应为 .trash → .trash/RealCards');
    assert.equal(moveCalls.length, 2, '第一次失败 + 重试一次');
    assert.deepEqual(moved, ['RealCards/---温馨的翻斗花园1.0.json']);
    assert.ok(dirs.has('.trash/RealCards'));
});

test('二次清理：.trash 链已存在 → 一次移动成功且不建目录', async () => {
    const { fs, mkdirCalls, moveCalls } = makeFs(['.trash', '.trash/RealCards']);
    const err = await trashOneByMove(fs, 'RealCards/xxx.json');
    assert.equal(err, null);
    assert.equal(mkdirCalls.length, 0);
    assert.equal(moveCalls.length, 1);
});

test('根目录文件：只需 .trash 一层', async () => {
    const { fs, mkdirCalls, moved } = makeFs([]);
    const err = await trashOneByMove(fs, 'top.json');
    assert.equal(err, null);
    assert.deepEqual(mkdirCalls, ['.trash']);
    assert.deepEqual(moved, ['top.json']);
});

test('深子路径 a/b/c.json → 完整目录链', async () => {
    const { fs, mkdirCalls, moved } = makeFs([]);
    const err = await trashOneByMove(fs, 'a/b/c.json');
    assert.equal(err, null);
    assert.deepEqual(mkdirCalls, ['.trash', '.trash/a', '.trash/a/b']);
    assert.deepEqual(moved, ['a/b/c.json']);
});

test('move 以 resolve({success:false}) 形态失败 → 同样触发重试', async () => {
    let calls = 0;
    const fs = {
        async move() {
            calls += 1;
            return calls === 1 ? { success: false, error: '目标目录不可写' } : { success: true };
        },
        async mkdir() {
            return { success: true };
        }
    };
    const err = await trashOneByMove(fs, 'x.json');
    assert.equal(err, null);
    assert.equal(calls, 2, 'resolve 假值也应触发重试');
});

test('重试仍失败 → 返回最后一次错误信息', async () => {
    const fs = {
        async move() {
            throw new Error('目标目录不可写');
        },
        async mkdir() {
            return { success: true };
        }
    };
    const err = await trashOneByMove(fs, 'locked.json');
    assert.equal(err, '目标目录不可写');
});

test('mkdir 也失败 → 返回移动错误而非崩溃', async () => {
    const fs = {
        async move() {
            throw new Error('目标目录不可写');
        },
        async mkdir() {
            throw new Error('创建失败:目录不可写');
        }
    };
    const err = await trashOneByMove(fs, 'x/y.json');
    assert.equal(err, '目标目录不可写');
});

test('空路径 → 无效路径（不触碰桥）', async () => {
    const { fs, moveCalls, mkdirCalls } = makeFs([]);
    assert.equal(await trashOneByMove(fs, ''), '无效路径');
    assert.equal(await trashOneByMove(fs, null), '无效路径');
    assert.equal(moveCalls.length, 0);
    assert.equal(mkdirCalls.length, 0);
});

test('中文特殊文件名 & 深链完整往返', async () => {
    const { fs, moved } = makeFs([]);
    const err = await trashOneByMove(fs, '幻想组/星野 あい_副本.json');
    assert.equal(err, null);
    assert.deepEqual(moved, ['幻想组/星野 あい_副本.json']);
});
