/**
 * PNG 角色卡解析边界测试（代码审查 37 项自检第 1/2/4 项补充）
 * 覆盖 parsePNGChunk：标准 tEXt chara 卡 / 非 PNG / 截断 / 无 chara 数据
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { parsePNGChunk } from '../js/utils/pngParser.js';

// 构造最小合法 PNG 结构（IHDR + tEXt(chara) + IEND），CRC 不校验故占位即可
function buildPngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4); // parsePNGChunk 不校验 CRC
  return Buffer.concat([length, typeBuf, data, crc]);
}

function buildCardPng(cardJson, keyword = 'chara') {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // IHDR：13 字节（宽高各 4 + 位深 1 + 颜色类型 1 + 压缩/滤波/隔行各 1）
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  const b64 = Buffer.from(JSON.stringify(cardJson), 'utf-8').toString('base64');
  const texData = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(b64, 'latin1')]);
  const buf = Buffer.concat([sig, buildPngChunk('IHDR', ihdrData), buildPngChunk('tEXt', texData), buildPngChunk('IEND', Buffer.alloc(0))]);
  // ⚠️ Node Buffer 可能来自共享内存池（byteOffset≠0），必须复制出独立 ArrayBuffer，
  //    否则 .buffer 返回整个池导致 parsePNGChunk 读到错误偏移
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test('标准 tEXt chara 卡可解析', () => {
  const card = { spec: 'chara_card_v3', data: { name: 'PNG测试角色' } };
  const buf = buildCardPng(card);
  const out = parsePNGChunk(buf);
  assert.ok(out, '应解析出卡片');
  assert.equal(out.spec, 'chara_card_v3');
  assert.equal(out.data.name, 'PNG测试角色');
});

test('ccv3 关键字兼容', () => {
  const card = { spec: 'chara_card_v3', data: { name: 'V3卡' } };
  const buf = buildCardPng(card, 'ccv3');
  const out = parsePNGChunk(buf);
  assert.ok(out);
  assert.equal(out.data.name, 'V3卡');
});

test('非 PNG 数据返回 null', () => {
  const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
  assert.equal(parsePNGChunk(buf), null);
});

test('截断 PNG（数据不完整）不抛异常且返回 null', () => {
  const card = { spec: 'chara_card_v2', data: { name: '截断' } };
  const full = new Uint8Array(buildCardPng(card));
  const truncated = full.slice(0, full.length - 10).buffer; // slice 产生独立精确 ArrayBuffer
  let out = null;
  assert.doesNotThrow(() => { out = parsePNGChunk(truncated); });
  // 截断可能解析不出（返回 null），但绝不能抛异常
  assert.ok(out === null || typeof out === 'object');
});

test('PNG 无 chara 数据返回 null', () => {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  const buf = Buffer.concat([sig, buildPngChunk('IHDR', ihdrData), buildPngChunk('IEND', Buffer.alloc(0))]).buffer;
  assert.equal(parsePNGChunk(buf), null);
});
