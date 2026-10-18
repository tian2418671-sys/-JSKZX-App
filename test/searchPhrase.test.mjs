/**
 * 🔍 搜索索引就绪判定 + 短语复核单测（对齐桌面 PK-18）
 *
 * 覆盖：
 *   ① building 标志在异步构建期间为 true、结束后复位
 *   ② 单字倒排导致 `系统` 误命中 `体系 传统`（证明病根存在）
 *   ③ useSearch 侧短语复核逻辑（以纯函数形式复现同一判据）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import searchIndex from '../js/utils/searchIndex.js';

const extractText = (card) => card.text || '';
const extractTags = (card) => card.tags || [];
const extractShort = (card) => card.short || '';

test('① 异步构建期间 building=true，结束后复位', async () => {
    const cards = Array.from({ length: 120 }, (_, i) => ({ text: `卡片${i}`, short: `卡片${i}` }));
    const p = searchIndex.buildAsync(cards, extractText, extractTags, extractShort, 20);
    assert.equal(searchIndex.building, true, '构建开始后应为 building');
    await p;
    assert.equal(searchIndex.building, false, '构建完成后应复位');
    assert.equal(searchIndex.cardCount, 120);
});

test('② 病根复现：单字倒排下「系统」误命中「体系 传统」', async () => {
    // 卡片 A 真实含「系统」，卡片 B 只是短字段里分别出现「系」「统」两个字。
    await searchIndex.buildAsync([
        { text: '这是一张系统测试卡', short: '系统' },
        { text: '体系 传统 经典文字', short: '体系 传统' }
    ], extractText, extractTags, extractShort, 10);
    const hits = searchIndex.search('系统');
    assert.equal(hits.length, 2, '索引按单字切 token ⇒ 两张卡都命中（说明需要短语复核）');
});

test('③ 短语复核判据：候选集中按整词 includes 过滤', async () => {
    await searchIndex.buildAsync([
        { text: '这是一张系统测试卡', short: '系统' },
        { text: '体系 传统 经典文字', short: '体系 传统' }
    ], extractText, extractTags, extractShort, 10);
    const hits = searchIndex.search('系统');
    // 复现 useSearch 的 needPhraseCheck 逻辑：对候选集复算全文（⚠️ 必须用全文，
    // 短字段 token 已经丢了相邻关系；useSearch 里复算的正是 extractCardSearchableText）
    const phraseChecked = hits.filter((card) => String(card.text).toLowerCase().includes('系统'));
    assert.equal(phraseChecked.length, 1, '全文复核后只剩真实含「系统」的那张');
    assert.ok(phraseChecked[0].text.includes('系统测试卡'));
});

test('④ 索引命中正确短语时复核保留', async () => {
    await searchIndex.buildAsync([
        { text: '角色是一位系统管理员', short: '系统管理员' },
        { text: '体系 传统 经典文字', short: '体系传统' }
    ], extractText, extractTags, extractShort, 10);
    const hits = searchIndex.search('系统');
    const phraseChecked = hits.filter((card) => String(card.text).toLowerCase().includes('系统'));
    assert.equal(phraseChecked.length, 1);
    assert.ok(phraseChecked[0].text.includes('系统管理员'));
});
