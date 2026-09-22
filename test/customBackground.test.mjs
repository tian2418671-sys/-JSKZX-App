/**
 * 🖼️ 自定义背景图单元测试（防回归）
 * 覆盖:可见度归一化(缺失/非法/夹取/取整/字符串) 与 遮罩浓度换算(边界/默认值)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeVisibility,
    visibilityToMaskOpacity,
    BG_VIS_KEY,
    BG_VIS_DEFAULT,
    BG_VIS_MIN,
    BG_VIS_MAX
} from '../js/mobile/useCustomBackground.js';

test('可见度归一化:缺失/非法值回默认', () => {
    assert.equal(normalizeVisibility(undefined), BG_VIS_DEFAULT);
    assert.equal(normalizeVisibility(null), BG_VIS_DEFAULT);
    assert.equal(normalizeVisibility(''), BG_VIS_DEFAULT);
    assert.equal(normalizeVisibility('abc'), BG_VIS_DEFAULT);
    assert.equal(normalizeVisibility(NaN), BG_VIS_DEFAULT);
    assert.equal(normalizeVisibility({}), BG_VIS_DEFAULT);
});

test('可见度归一化:夹取到 [MIN, MAX]', () => {
    assert.equal(normalizeVisibility(0), BG_VIS_MIN);
    assert.equal(normalizeVisibility(-50), BG_VIS_MIN);
    assert.equal(normalizeVisibility(10), BG_VIS_MIN);
    assert.equal(normalizeVisibility(999), BG_VIS_MAX);
    assert.equal(normalizeVisibility(150), BG_VIS_MAX);
});

test('可见度归一化:取整与字符串兼容', () => {
    assert.equal(normalizeVisibility(66.6), 67);
    assert.equal(normalizeVisibility('50'), 50);
    assert.equal(normalizeVisibility(' 75 '), 75);
    assert.equal(normalizeVisibility(80), 80);
});

test('遮罩浓度 = 1 - 可见度（含边界）', () => {
    assert.equal(visibilityToMaskOpacity(100), 0);          // 完全清晰,不遮
    assert.equal(visibilityToMaskOpacity(80), 0.2);         // 默认:轻遮
    assert.equal(visibilityToMaskOpacity(20), 0.8);         // 下限:重遮
    assert.equal(visibilityToMaskOpacity(150), 0);          // 超限→100
    assert.equal(visibilityToMaskOpacity(-10), 0.8);        // 超限→20
    assert.equal(visibilityToMaskOpacity(undefined), 0.2);  // 默认 80
});

test('存储键名契约（防误改导致旧配置丢失）', () => {
    assert.equal(BG_VIS_KEY, 'jsmobile-bg-visibility');
    assert.equal(BG_VIS_DEFAULT, 80);
    assert.equal(BG_VIS_MIN, 20);
    assert.equal(BG_VIS_MAX, 100);
});
