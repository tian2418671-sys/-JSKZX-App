// Worker 消息处理逻辑冒烟测试(JSON/PNG 路径,含损坏输入)
// png 分支输入为 ArrayBuffer(与移动端桥接 readBuffer 产出一致)
import { parsePNGChunk, deepScanForJSON } from '../js/utils/pngParser.js';

function workerHandle({ id, kind, raw }) {
    let parsed = null;
    try {
        if (kind === 'json') parsed = JSON.parse(raw);
        else parsed = parsePNGChunk(raw) || deepScanForJSON(raw);
    } catch (err) { parsed = null; }
    return { id, ok: !!parsed, parsed };
}

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('ok  ', name); }
    else { fail++; console.log('FAIL', name); }
}

// 1. JSON 正常卡
const r1 = workerHandle({ id: 1, kind: 'json', raw: JSON.stringify({ spec: 'chara_card_v2', data: { name: '测试' } }) });
check('json normal parsed + name', r1.ok && r1.parsed.data.name === '测试');

// 2. JSON 损坏
const r2 = workerHandle({ id: 2, kind: 'json', raw: '{bad json' });
check('json broken -> ok:false', r2.ok === false && r2.parsed === null);

// 3. PNG 损坏 ArrayBuffer(垃圾字节)
const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer;
const r3 = workerHandle({ id: 3, kind: 'png', raw: garbage });
check('png garbage ArrayBuffer -> ok:false 不抛异常', r3.ok === false);

// 4. PNG 空输入
const r4 = workerHandle({ id: 4, kind: 'png', raw: new ArrayBuffer(0) });
check('png empty -> ok:false', r4.ok === false);

// 5. 构造最小合法 PNG(tEXt chara) 验证正路径
function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
const cardJson = JSON.stringify({ spec: 'chara_card_v2', data: { name: 'PNG卡' } });
const b64 = Buffer.from(cardJson, 'utf8').toString('base64');
const tEXt = chunk('tEXt', Buffer.concat([Buffer.from('chara\0', 'ascii'), Buffer.from(b64, 'ascii')]));
const ihdr = chunk('IHDR', Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0]));
const png = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), ihdr, tEXt, chunk('IEND', Buffer.alloc(0))]);
const pngAb = new Uint8Array(png).buffer;
const r5 = workerHandle({ id: 5, kind: 'png', raw: pngAb });
check('png valid -> parsed card', r5.ok && r5.parsed && r5.parsed.data && r5.parsed.data.name === 'PNG卡');

// 6. 主线程回退逻辑与 Worker 一致性检查
import fs from 'fs';
const lib = fs.readFileSync('js/mobile/useMobileLibrary.js', 'utf8');
check('回退 parseRawSync 存在', lib.includes('function parseRawSync'));
check('Worker 超时保护 5s', lib.includes('5000'));
check('Worker 失败置位回退', lib.includes('parseWorkerFailed'));
check('JSON 路径已接 Worker', lib.includes("parseViaWorker('json'"));
check('PNG 路径已接 Worker', lib.includes("parseViaWorker('png'"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
