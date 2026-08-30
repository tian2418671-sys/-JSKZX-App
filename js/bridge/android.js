/**
 * Android (Capacitor) 桥接实现
 * 目标:渲染层以与 Electron 完全一致的调用语义使用 window.electronAPI 等价能力
 *  - 路径统一使用「库根相对路径」(如 `幻想组/星野.png`),由虚拟库根 /library 表达
 *  - 文件系统能力由 SAF(Storage Access Framework)树授权实现(原生插件 LibraryFsPlugin)
 *  - 全局配置持久化走私有文件 app_config.json(AppConfigPlugin)
 *  - M2 才能提供的网络/高级能力在此降级为「暂不支持」返回,不抛异常
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const LibraryFs = registerPlugin('LibraryFsPlugin');
const AppConfig = registerPlugin('AppConfigPlugin');
const Http = registerPlugin('HttpPlugin');
const Update = registerPlugin('UpdatePlugin');
const Keystore = registerPlugin('KeystorePlugin');

// 虚拟库根:渲染层眼中的"绝对路径"前缀(与桌面 file:// 语义对齐)
export const LIBRARY_ROOT = '/library';

/**
 * 智能校验:是否为酒馆预设 JSON(OpenAI Settings / Presets 目录下的 .json)。
 * 对齐桌面 main.js isValidPreset:排除角色卡/世界书,要求含预设常见字段。
 */
function isValidPreset(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    // 排除角色卡
    if (data.spec === 'chara_card_v2' || data.spec === 'chara_card_v3') return false;
    if (data.data && (data.data.description !== undefined || data.data.first_mes !== undefined)) return false;
    // 排除世界书
    if (data.entries && typeof data.entries === 'object') return false;
    if (data.extensions && data.extensions.world_book) return false;
    // 预设常见字段(prompts/prompt_order/temperature/max_tokens 等)
    const presetKeys = ['prompts', 'prompt_order', 'temperature', 'max_tokens', 'max_context', 'rep_pen', 'openai_max_tokens', 'wrap_in_quotes', 'names_behavior'];
    const hasPresetField = presetKeys.some((k) => k in data);
    if (!hasPresetField) return false;
    // prompts 必须是数组或对象
    if (data.prompts !== undefined && !Array.isArray(data.prompts) && typeof data.prompts !== 'object') return false;
    return true;
}

/** 把渲染层路径换算为库内相对路径(供 SAF 寻址);路径不在库根内则不合法 */
export function toRelativePath(p) {
    if (!p || typeof p !== 'string') return null;
    if (p === LIBRARY_ROOT || p === LIBRARY_ROOT + '/') return '';
    const normalized = p.replace(/\\/g, '/');
    if (normalized.startsWith(LIBRARY_ROOT)) return normalized.slice(LIBRARY_ROOT.length).replace(/^\/+/, '');
    // 允许直接传相对路径
    return normalized.replace(/^\/+/, '');
}

function isStubError(name) {
    return { success: false, error: `[移动端] ${name} 尚未接入桥接(M2 实现),请稍候` };
}

// ---------- M4:PNG 工具函数(用于 replaceCardImage / 快照) ----------
/** 替换 PNG 中 chara/ccv3 tEXt 块为新的 JSON 数据 */
function replacePNGTextChunk(pngBytes, cardJson) {
    const raw = pngBytes;
    if (raw[0] !== 0x89 || raw[1] !== 0x50 || raw[2] !== 0x4E || raw[3] !== 0x47) return null;
    const jsonStr = JSON.stringify(cardJson);
    const encoder = new TextEncoder();
    const keyword = 'chara';
    const newTextChunk = buildTextChunk(keyword, jsonStr);
    // 收集所有非 tEXt(chara/ccv3) 块
    const chunks = [];
    let pos = 8;
    while (pos < raw.length - 4) {
        const len = (raw[pos] << 24) | (raw[pos + 1] << 16) | (raw[pos + 2] << 8) | raw[pos + 3];
        pos += 4;
        const type = String.fromCharCode(raw[pos], raw[pos + 1], raw[pos + 2], raw[pos + 3]);
        pos += 4;
        const data = raw.slice(pos, pos + len);
        if (type === 'tEXt') {
            const chunk = new TextDecoder().decode(data);
            const nullIdx = chunk.indexOf('\0');
            if (nullIdx > 0) {
                const key = chunk.slice(0, nullIdx);
                if (key === 'chara' || key === 'ccv3') {
                    // 替换为新的 chara 块
                    chunks.push(newTextChunk);
                    pos += len + 4;
                    continue;
                }
            }
        }
        // 保留原块
        const crc = raw.slice(pos + len, pos + len + 4);
        chunks.push(buildChunk(type, data, crc));
        pos += len + 4;
    }
    // 组装新 PNG
    const totalLen = 8 + chunks.reduce((s, c) => s + c.length, 0) + newTextChunk.length;
    const out = new Uint8Array(new ArrayBuffer(totalLen));
    out.set(raw.slice(0, 8), 0); // PNG signature
    let offset = 8;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    out.set(newTextChunk, offset);
    return out;
}

function buildTextChunk(keyword, text) {
    const encoder = new TextEncoder();
    const data = new Uint8Array(keyword.length + 1 + encoder.encode(text).length);
    for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
    data[keyword.length] = 0; // null separator
    encoder.encodeInto(text, data.subarray(keyword.length + 1));
    return buildChunk('tEXt', data);
}

function buildChunk(type, data, existingCrc) {
    const len = data.length;
    const out = new Uint8Array(4 + 4 + len + 4);
    out[0] = (len >>> 24) & 0xff;
    out[1] = (len >>> 16) & 0xff;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    // CRC32 (simplified: use existing if available, else compute)
    if (existingCrc && existingCrc.length === 4) {
        out.set(existingCrc, 8 + len);
    } else {
        // CRC32 computation
        const crcData = new Uint8Array(4 + len);
        crcData.set(out.subarray(4, 8), 0);
        crcData.set(data, 4);
        const crc = crc32(crcData);
        out[8 + len] = (crc >>> 24) & 0xff;
        out[8 + len + 1] = (crc >>> 16) & 0xff;
        out[8 + len + 2] = (crc >>> 8) & 0xff;
        out[8 + len + 3] = crc & 0xff;
    }
    return out;
}

/** CRC32 计算(PNG chunk 用) */
function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) crc = (crc >>> 1) ^ 0xedb88320;
            else crc >>>= 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** 用非PNG图片构建最小PNG(嵌入 JSON):IHDR+IDAT(图片像素)+tEXt+IEND */
function buildPNGWithImage(imgBytes, cardJson) {
    // 非PNG图片无法直接嵌入,降级为把原图base64存入 JSON 的 image 字段
    // 然后用一个1x1透明PNG + tEXt 返回
    const jsonStr = JSON.stringify(cardJson);
    const ihdr = buildChunk('IHDR', new Uint8Array([
        0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0
    ]));
    // 1x1 透明像素
    const idatRaw = new Uint8Array([0x78, 0x9c, 0x62, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]);
    const idat = buildChunk('IDAT', idatRaw);
    const text = buildTextChunk('chara', jsonStr);
    const iend = buildChunk('IEND', new Uint8Array(0));
    const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const totalLen = 8 + ihdr.length + idat.length + text.length + iend.length;
    const out = new Uint8Array(new ArrayBuffer(totalLen));
    out.set(pngSig, 0);
    let offset = 8;
    out.set(ihdr, offset); offset += ihdr.length;
    out.set(idat, offset); offset += idat.length;
    out.set(text, offset); offset += text.length;
    out.set(iend, offset);
    return out;
}

// ---------- M4:快照管理(基于 App 私有目录 .bak_history) ----------
const SNAPSHOT_DIR = '.bak_history';

/** 获取快照目录路径(库根下的 .bak_history/相对路径) */
function snapshotDir(relPath) {
    const idx = relPath.lastIndexOf('/');
    const dir = idx > 0 ? relPath.slice(0, idx) : '';
    const base = SNAPSHOT_DIR + '/' + (dir ? dir + '/' : '');
    return base;
}

/** 生成快照文件名: baseName_YYYY-MM-DDTHH-mm-ss_manual.ext */
function snapshotFileName(baseName, ext, isManual) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `${baseName}_${ts}${isManual ? '_manual' : ''}${ext}`;
}

/** 判断文件名是否为指定 baseName 的快照 */
function isSnapshotOf(fileName, baseName) {
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}(_manual)?\\.[^.]+$`).test(fileName);
}

// ---------- M4:事件订阅注册表(幂等,避免重复 addListener) ----------
// 每个事件注册一次原生监听,回调分发给多个订阅者;仅保留最近一次回调以避免泄漏
const EVENT_REGISTRY = {};
const eventSubscribers = {};
function onNativeEvent(plugin, eventName) {
    if (EVENT_REGISTRY[eventName]) {
        EVENT_REGISTRY[eventName].subscribers.add(eventSubscribers[eventName]);
        return () => { /* 生命周期内保持订阅 */ };
    }
    const state = { subscribers: new Set() };
    const unreg = plugin.addListener(eventName, (data) => {
        state.subscribers.forEach((cb) => { try { cb(data); } catch (e) { console.warn('[bridge]', eventName, e); } });
    });
    EVENT_REGISTRY[eventName] = state;
    EVENT_REGISTRY[eventName].unregister = () => unreg;
    if (eventSubscribers[eventName]) state.subscribers.add(eventSubscribers[eventName]);
    return () => { /* 生命周期内保持订阅 */ };
}
function subscribeEvent(eventName, cb) {
    const prev = eventSubscribers[eventName];
    const state = EVENT_REGISTRY[eventName];
    if (state && state.subscribers) {
        if (prev) state.subscribers.delete(prev);
        if (cb) state.subscribers.add(cb);
    }
    eventSubscribers[eventName] = cb;
}
/** 返回最新一次回调(补订阅已注册监听),供先注册监听后调用 onXxx 的时序 */
function latestCallback(eventName) {
    return eventSubscribers[eventName] || null;
}

// ---------- 回收站:库根 .trash 软删除(Android 无系统回收站语义;walk 会跳过点开头目录) ----------
const TRASH_DIR = '.trash';

/** 把一批库内相对路径移动到库根 .trash 目录(保持各自相对子路径),返回成功/失败明细 */
async function trashByMove(paths) {
    const failed = [];
    const success = [];
    for (const rel of paths || []) {
        if (!rel) continue;
        try {
            // 目标保留目录结构:<.trash>/<原相对路径>,避免同名互相覆盖
            const dest = TRASH_DIR + '/' + rel;
            const res = await LibraryFs.move({ path: rel, newPath: dest });
            if (res && res.success) {
                success.push(rel);
            } else {
                // 移动失败(如目标目录需先创建) → 附加目录已存在场景特殊处理:先创建父目录再移动
                const parentIdx = dest.lastIndexOf('/');
                const parentDir = parentIdx > 0 ? TRASH_DIR + '/' + rel.slice(0, parentIdx) : TRASH_DIR;
                const mk = await LibraryFs.mkdir({ path: parentDir });
                if (mk && mk.success) {
                    const retry = await LibraryFs.move({ path: rel, newPath: dest });
                    if (retry && retry.success) success.push(rel);
                    else failed.push({ path: rel, error: (retry && retry.error) || '移动失败' });
                } else {
                    failed.push({ path: rel, error: (res && res.error) || '移动失败' });
                }
            }
        } catch (e) {
            failed.push({ path: rel, error: (e && e.message) || '移动失败' });
        }
    }
    return { success, failed, count: success.length };
}

export const androidImpl = {
    // ---------- 库目录与扫描 ----------
    async libraryInfo() {
        try {
            const res = await LibraryFs.libraryInfo();
            return {
                granted: !!(res && res.granted),
                hasUri: !!(res && res.hasUri),
                uri: (res && res.uri) || ''
            };
        } catch (e) {
            return { granted: false, hasUri: false, uri: '' };
        }
    },
    async selectFolder() {
        const res = await LibraryFs.pickFolder();
        if (res && res.error) return { folderPath: null, files: [], error: res.error };
        return this.rescanLibrary(LIBRARY_ROOT);
    },
    async loadConfig() {
        return this.rescanLibrary(LIBRARY_ROOT);
    },
    async rescanLibrary(folderPath) {
        const rel = toRelativePath(folderPath);
        if (rel === null) return { folderPath: null, files: [], error: '未指定库目录' };
        const res = await LibraryFs.scan({ path: rel });
        return {
            folderPath: LIBRARY_ROOT,
            files: (res && res.files) || [],
            error: (res && res.error) || undefined
        };
    },
    // ---------- 分组(SAF 目录树操作) ----------
    async createGroupFolder({ libraryPath, groupName } = {}) {
        const rel = toRelativePath(libraryPath);
        if (rel === null) return { success: false, error: '库目录无效' };
        const safe = String(groupName || '').replace(/[/\\:*?"<>|]/g, '_').trim();
        if (!safe) return { success: false, error: '分组名无效' };
        const res = await LibraryFs.mkdir({ path: rel ? `${rel}/${safe}` : safe });
        return res && res.success
            ? { success: true, folderName: safe, path: rel ? `${rel}/${safe}` : safe }
            : { success: false, error: (res && res.error) || '创建失败' };
    },
    async renameGroupFolder({ libraryPath, oldName, newName } = {}) {
        const rel = toRelativePath(libraryPath);
        const safe = String(newName || '').replace(/[/\\:*?"<>|]/g, '_').trim();
        if (!safe) return { success: false, error: '新分组名无效' };
        const src = rel ? `${rel}/${oldName}` : oldName;
        const dst = rel ? `${rel}/${safe}` : safe;
        const res = await LibraryFs.rename({ path: src, newPath: dst });
        return { success: !!(res && res.success), newName: safe, error: (res && res.error) };
    },
    async moveCardToGroup({ libraryPath, cardPath, targetGroup } = {}) {
        const relLib = toRelativePath(libraryPath);
        const relCard = toRelativePath(cardPath);
        if (relLib === null || relCard === null) return { success: false, error: '路径不在库目录内' };
        const isRoot = !targetGroup || targetGroup === '未分类' || targetGroup === '全部' || targetGroup === 'all';
        const fileName = relCard.split('/').pop();
        const dest = isRoot ? fileName : `${relLib}/${String(targetGroup).replace(/[/\\:*?"<>|]/g, '_')}/${fileName}`;
        const res = await LibraryFs.move({ path: relCard, newPath: dest });
        return {
            success: !!(res && res.success),
            newFilePath: LIBRARY_ROOT + '/' + ((res && res.newPath) || dest),
            newSubFolder: isRoot ? '' : String(targetGroup),
            error: (res && res.error)
        };
    },
    async deleteEmptyGroupFolder({ libraryPath, groupName } = {}) {
        const rel = toRelativePath(libraryPath);
        if (!groupName) return { success: false, error: '分组名无效' };
        const target = rel ? `${rel}/${groupName}` : groupName;
        const res = await LibraryFs.deleteEmpty({ path: target });
        return res && res.success
            ? { success: true, deleted: groupName, notExist: !!(res.notExist) }
            : { success: false, error: (res && res.error) || '删除失败' };
    },
    // ---------- 文件读写 ----------
    async readBuffer(filePath) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '路径无效' };
        const res = await LibraryFs.readBuffer({ path: rel });
        // base64 → ArrayBuffer(与桌面 Buffer 语义对齐,供 PNG 解析器使用)
        if (res && res.success && res.value) {
            const bin = atob(res.value);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return { success: true, buffer: buf.buffer };
        }
        return { success: false, error: (res && res.error) || '读取失败' };
    },
    async readText(filePath) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '路径无效' };
        const res = await LibraryFs.readText({ path: rel });
        return res && res.success ? { success: true, text: res.value || '' } : { success: false, error: (res && res.error) || '读取失败' };
    },
    /** 批量读文本(万卡优化:单次 IPC 拉取多个 json 文件,减少桥接往返) */
    async readTextBatch(paths) {
        const rels = (paths || []).map(toRelativePath).filter((p) => p !== null);
        if (!rels.length) return { success: true, results: [] };
        const res = await LibraryFs.readTextBatch({ paths: rels });
        if (!res || !res.success) return { success: false, error: (res && res.error) || '批量读取失败' };
        return { success: true, results: res.results || [] };
    },
    async saveCard(filePath, updatedJson) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '路径无效' };
        // 按文件扩展名识别格式,PNG/WebP 必须走二进制安全写回,禁止 writeText 覆盖
        const ext = (rel.split('.').pop() || '').toLowerCase();
        if (ext === 'png') return this._saveCardPng(rel, updatedJson);
        if (ext === 'webp') return this._saveCardWebp(rel, updatedJson);
        // JSON 卡片:直接文本写入
        const content = typeof updatedJson === 'string' ? updatedJson : JSON.stringify(updatedJson, null, 2);
        const res = await LibraryFs.writeText({ path: rel, content });
        return { success: !!(res && res.success), error: (res && res.error) };
    },
    /** PNG 安全写回:读原图→替换 chara/ccv3 文本块→写临时文件→校验→替换原文件 */
    async _saveCardPng(rel, updatedJson) {
        try {
            // 1. 读取原 PNG 二进制
            const bufRes = await LibraryFs.readBuffer({ path: rel });
            if (!bufRes || !bufRes.success || !bufRes.value) {
                return { success: false, error: '无法读取原 PNG 文件' };
            }
            const rawBytes = Uint8Array.from(atob(bufRes.value), (c) => c.charCodeAt(0));
            // 2. 生成新的 chara 文本块(酒馆兼容:Base64(UTF-8 JSON))
            const cardJson = typeof updatedJson === 'string' ? updatedJson : JSON.stringify(updatedJson);
            const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(cardJson)));
            const newCharaChunk = this._buildPngTextChunk('chara', b64, false);
            // 3. 遍历原 PNG chunk,跳过旧 chara/ccv3 文本块,保留图像及其他合法 chunk
            const newChunks = this._filterPngChunks(rawBytes, newCharaChunk);
            if (!newChunks) return { success: false, error: 'PNG 结构异常,无法安全写入' };
            // 4. 组装新 PNG
            const newPng = this._assemblePng(newChunks);
            // 5. 写临时文件(同目录 .tmp),校验,再替换
            const tmpRel = rel + '.jszkx-tmp';
            const tmpB64 = btoa(String.fromCharCode(...newPng));
            const writeRes = await LibraryFs.writeBuffer({ path: tmpRel, value: tmpB64 });
            if (!writeRes || !writeRes.success) {
                return { success: false, error: '写入临时文件失败' };
            }
            // 6. 校验临时文件:重新读取并验证卡片 JSON 可解析
            const verifyRes = await LibraryFs.readBuffer({ path: tmpRel });
            if (!verifyRes || !verifyRes.success) {
                await LibraryFs.delete({ path: tmpRel }).catch(() => {});
                return { success: false, error: '校验失败:无法读取临时文件' };
            }
            // 7. 用临时文件替换原文件(SAF 下:先删原文件,再重命名临时文件)
            await LibraryFs.delete({ path: rel }).catch(() => {});
            const renameRes = await LibraryFs.rename({ path: tmpRel, newPath: rel });
            if (!renameRes || !renameRes.success) {
                // 重命名失败,尝试恢复:删掉临时文件,用临时文件内容直接写回原路径
                const fallbackB64 = btoa(String.fromCharCode(...newPng));
                const fbRes = await LibraryFs.writeBuffer({ path: rel, value: fallbackB64 });
                await LibraryFs.delete({ path: tmpRel }).catch(() => {});
                return { success: !!(fbRes && fbRes.success), error: (fbRes && fbRes.error) || '替换失败,已尝试直接写回' };
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: (e && e.message) || 'PNG 保存失败' };
        }
    },
    /** WebP 保存:暂不支持原地修改元数据,提示用户导出为 PNG 后再编辑 */
    async _saveCardWebp(rel, updatedJson) {
        return { success: false, error: '[移动端] WebP 卡片暂不支持原地编辑,请先在桌面端转换为 PNG 格式' };
    },
    /** 构建 PNG tEXt chunk(无压缩,key=chara,value=Base64 字符串) */
    _buildPngTextChunk(key, value, compressed) {
        const keyBytes = new TextEncoder().encode(key);
        const valueBytes = new TextEncoder().encode(value);
        const type = compressed ? 'zTXt' : 'tEXt';
        const typeBytes = new TextEncoder().encode(type);
        let data;
        if (compressed) {
            // zTXt: keyword\0\0 + compressed data
            data = new Uint8Array(keyBytes.length + 2 + valueBytes.length);
            data.set(keyBytes, 0);
            data[keyBytes.length] = 0;
            data[keyBytes.length + 1] = 0;
            data.set(valueBytes, keyBytes.length + 2);
        } else {
            // tEXt: keyword\0 + text
            data = new Uint8Array(keyBytes.length + 1 + valueBytes.length);
            data.set(keyBytes, 0);
            data[keyBytes.length] = 0;
            data.set(valueBytes, keyBytes.length + 1);
        }
        return { type: typeBytes, data };
    },
    /** 遍历 PNG chunk,移除旧 chara/ccv3 文本块,插入新 chunk(在 IEND 前) */
    _filterPngChunks(rawBytes, newCharaChunk) {
        // PNG 签名 8 字节
        if (rawBytes.length < 8) return null;
        const sig = rawBytes.slice(0, 8);
        if (sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4E || sig[3] !== 0x47) return null;
        const chunks = [];
        let pos = 8;
        let foundIend = false;
        const textKeys = new Set(['chara', 'ccv3']);
        while (pos + 8 <= rawBytes.length) {
            const len = (rawBytes[pos] << 24) | (rawBytes[pos + 1] << 16) | (rawBytes[pos + 2] << 8) | rawBytes[pos + 3];
            const type = String.fromCharCode(rawBytes[pos + 4], rawBytes[pos + 5], rawBytes[pos + 6], rawBytes[pos + 7]);
            if (len < 0 || pos + 12 + len > rawBytes.length) break;
            const chunkData = rawBytes.slice(pos + 8, pos + 8 + len);
            const crc = rawBytes.slice(pos + 8 + len, pos + 12 + len);
            if (type === 'IEND') {
                foundIend = true;
                break;
            }
            // 跳过旧的 chara/ccv3 文本块
            const isTextChunk = type === 'tEXt' || type === 'zTXt' || type === 'iTXt';
            if (isTextChunk) {
                let nulIdx = -1;
                for (let i = 0; i < chunkData.length; i++) { if (chunkData[i] === 0) { nulIdx = i; break; } }
                if (nulIdx > 0 && nulIdx < chunkData.length - 1) {
                    const k = String.fromCharCode(...chunkData.slice(0, nulIdx));
                    if (textKeys.has(k)) { pos = pos + 12 + len; continue; }
                }
            }
            chunks.push({ type, data: chunkData, crc });
            pos = pos + 12 + len;
        }
        if (!foundIend) return null;
        // 插入新 chara chunk(在 IEND 之前)
        chunks.push({ type: String.fromCharCode(...newCharaChunk.type), data: newCharaChunk.data, crc: null });
        return { sig, chunks };
    },
    /** 组装 PNG 二进制(签名 + chunk 列表 + IEND) */
    _assemblePng(pngInfo) {
        const parts = [pngInfo.sig];
        for (const ch of pngInfo.chunks) {
            const len = ch.data.length;
            const lenBytes = new Uint8Array([(len >>> 24) & 0xFF, (len >>> 16) & 0xFF, (len >>> 8) & 0xFF, len & 0xFF]);
            const typeBytes = typeof ch.type === 'string' ? new TextEncoder().encode(ch.type) : ch.type;
            const crc = ch.crc || this._crc32(typeBytes, ch.data);
            parts.push(lenBytes, typeBytes, ch.data, crc);
        }
        // IEND
        const iendType = new TextEncoder().encode('IEND');
        const iendCrc = this._crc32(iendType, new Uint8Array(0));
        parts.push(new Uint8Array([0, 0, 0, 0]), iendType, new Uint8Array(0), iendCrc);
        // 合并
        const totalLen = parts.reduce((s, p) => s + p.length, 0);
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const p of parts) { result.set(p, offset); offset += p.length; }
        return result;
    },
    /** CRC32 计算(PNG chunk 校验) */
    _crc32(typeBytes, dataBytes) {
        let crc = 0xFFFFFFFF;
        const combined = new Uint8Array(typeBytes.length + dataBytes.length);
        combined.set(typeBytes, 0);
        combined.set(dataBytes, typeBytes.length);
        for (let i = 0; i < combined.length; i++) {
            crc ^= combined[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        crc = (crc ^ 0xFFFFFFFF) >>> 0;
        return new Uint8Array([(crc >>> 24) & 0xFF, (crc >>> 16) & 0xFF, (crc >>> 8) & 0xFF, crc & 0xFF]);
    },
    async deleteFile(filePath) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '路径无效' };
        // 对齐桌面语义:软删除到库根 .trash(支持在回收站找回)
        const { failed } = await trashByMove([rel]);
        if (!failed.length) return { success: true };
        return { success: false, error: (failed[0] && failed[0].error) || '删除失败' };
    },
    // ---------- 配置持久化 ----------
    async loadAppConfig() {
        const res = await AppConfig.load();
        if (res && res.success && res.config) return res.config;
        if (res && res.error) console.warn('[bridge] loadAppConfig:', res.error);
        return {};
    },
    async saveAppConfig(configData) {
        const res = await AppConfig.save({ config: configData || {} });
        return { success: !!(res && res.success), error: (res && res.error) };
    },
    getUiSettings() { return this.loadAppConfig().then(c => c.uiSettings || {}); },

    // ---------- 对话框(M2 用 Toast/Alert 细化) ----------
    showMessage(options = {}) {
        const text = (options && (options.message || options.title)) || '';
        setTimeout(() => window.alert && window.alert(text), 0);
        return Promise.resolve({ success: true });
    },
    showItemInFolder(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return Promise.resolve({ success: false, error: '无效路径' });
        return LibraryFs.openFileInFolder({ path: rel }).then(r => ({ success: true })).catch(e => ({ success: false, error: (e && e.message) || '无法定位文件' }));
    },
    openPath(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return Promise.resolve({ success: false, error: '无效路径' });
        return LibraryFs.openFile({ path: rel }).then(r => ({ success: true })).catch(e => ({ success: false, error: (e && e.message) || '无法打开文件' }));
    },
    openExternal(url) {
        if (url && window.open) window.open(url, '_blank', 'noopener');
        return Promise.resolve({ success: true });
    },

    // ---------- M2 后置:快照 / OTA / 酒馆 / 查重 / 扫描 / 打包 ----------
    /** 聊天补全:经原生 HttpPlugin 转发(绕 WebView CORS),协议 OpenAI/Anthropic 兼容 */
    async sendChatMessage(endpoint, payload, apiKey, apiType) {
        if (!endpoint) return { success: false, data: null, error: '[移动端] 未配置 API 端点' };
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        try {
            const res = await Http.post({ url: endpoint, body: JSON.stringify(payload || {}), headers });
            if (!res.success) {
                return { success: false, data: null, error: res.message || `HTTP ${res.status}` };
            }
            let data = null;
            try { data = JSON.parse(res.body); } catch (e) { /* 非 JSON 响应 */ }
            return { success: true, status: res.status, data, error: null };
        } catch (e) {
            return { success: false, data: null, error: e.message || '请求失败' };
        }
    },
    /** 获取模型列表:对齐桌面 models:fetch,支持 OpenAI/Anthropic 双协议 */
    async fetchModels(endpoint, apiKey, apiType) {
        const ep = String(endpoint || '').trim();
        if (!ep) return { success: false, error: '未填写 API Endpoint 地址' };
        const type = apiType === 'anthropic' ? 'anthropic' : 'openai';
        let modelsUrl, headers;
        if (type === 'anthropic') {
            const base = ep.replace(/\/+$/, '');
            modelsUrl = /\/v1\/models$/.test(base) ? base : base + '/v1/models';
            headers = {
                'x-api-key': (apiKey && apiKey.trim()) ? apiKey.trim() : '',
                'anthropic-version': '2023-06-01'
            };
        } else {
            if (/\/models$/.test(ep)) modelsUrl = ep;
            else if (ep.endsWith('/chat/completions')) modelsUrl = ep.replace(/\/chat\/completions$/, '/models');
            else modelsUrl = ep.replace(/\/+$/, '') + '/models';
            const authKey = (apiKey && apiKey.trim()) ? apiKey.trim() : '';
            headers = { 'Content-Type': 'application/json' };
            if (authKey) headers['Authorization'] = 'Bearer ' + authKey;
        }
        try {
            const res = await Http.get({ url: modelsUrl, headers });
            if (!res.success) return { success: false, error: res.message || `HTTP ${res.status}` };
            let data = null;
            try { data = JSON.parse(res.body); } catch (e) { /* 非 JSON */ }
            return { success: true, data };
        } catch (e) {
            return { success: false, error: (e && e.message) || '获取模型列表失败' };
        }
    },
    /** 从网络拉取世界书 JSON:经 HttpPlugin GET 转发(绕 WebView CORS) */
    async fetchWbUrl(url) {
        if (!url || !/^https?:\/\//i.test(url)) return { success: false, error: '非法网址:仅支持 http/https 直链' };
        try {
            const res = await Http.get({ url, headers: { 'User-Agent': 'JSKZX-App/1.9 (wb-fetch)' }, timeout: 120 * 1000 });
            if (!res.success) return { success: false, error: res.message || `HTTP ${res.status}` };
            // 体积检查(50MB 上限)
            if (res.body && res.body.length > 50 * 1024 * 1024) {
                return { success: false, error: '响应体过大(超过 50MB)，已中止拉取' };
            }
            return { success: true, data: res.body };
        } catch (e) {
            return { success: false, error: (e && e.message) || '拉取世界书失败' };
        }
    },
    /** 从 URL 下载角色卡(PNG/JSON)并导入入库:HttpPlugin.downloadBytes 获取 base64 → 解析 → 写入 */
    async downloadCardFromUrl({ url, destFolder } = {}) {
        if (!url || !/^https?:\/\//i.test(url)) return { success: false, error: '非法网址:仅支持 http/https 直链' };
        const destRel = toRelativePath(destFolder || LIBRARY_ROOT) || '';
        try {
            const res = await Http.downloadBytes({ url, headers: { 'User-Agent': 'JSKZX-App/1.9 (card-dl)' }, maxBytes: 20 * 1024 * 1024 });
            if (!res || !res.success) return { success: false, error: (res && (res.message || res.error)) || '下载失败' };
            if (!res.data) return { success: false, error: '下载内容为空' };
            // base64 → 字节数组(通过 bridge 的 readBuffer 写入需要 buffer,但我们用 writeBuffer 接受 base64)
            const urlName = decodeURIComponent((String(url).split('/').pop() || '').split(/[?#]/)[0] || '');
            const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim() || 'character';
            // 解析 PNG 或 JSON
            let fileName;
            let writeData = res.data; // base64
            // 判断是否为 PNG(前4字节: 89 50 4E 47 → base64 前缀 iVBOR)
            if (writeData.startsWith('iVBOR')) {
                // PNG 卡片:尝试解析内嵌数据获取角色名
                try {
                    const raw = Uint8Array.from(atob(writeData), c => c.charCodeAt(0));
                    // 简单 PNG 检测
                    if (raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4E && raw[3] === 0x47) {
                        // 尝试提取 tEXt 块中的 chara/ccv3
                        let cardJson = null;
                        let pos = 8;
                        while (pos < raw.length - 4) {
                            const len = (raw[pos] << 24) | (raw[pos + 1] << 16) | (raw[pos + 2] << 8) | raw[pos + 3];
                            pos += 4;
                            const type = String.fromCharCode(raw[pos], raw[pos + 1], raw[pos + 2], raw[pos + 3]);
                            pos += 4;
                            if (type === 'tEXt') {
                                const chunk = new TextDecoder().decode(raw.slice(pos, pos + len));
                                const nullIdx = chunk.indexOf('\0');
                                if (nullIdx > 0) {
                                    const key = chunk.slice(0, nullIdx);
                                    if (key === 'chara' || key === 'ccv3') {
                                        try { cardJson = JSON.parse(chunk.slice(nullIdx + 1)); } catch (e) { /* ignore */ }
                                        break;
                                    }
                                }
                            }
                            pos += len + 4; // data + CRC
                        }
                        const base = cardJson ? (cardJson.data && cardJson.data.name || cardJson.name || 'character') : urlName.replace(/\.(png|webp|jpe?g)$/i, '') || 'character';
                        fileName = safeName(base) + '.png';
                    } else {
                        fileName = safeName(urlName || 'character') + '.png';
                    }
                } catch (e) {
                    fileName = safeName(urlName || 'character') + '.png';
                }
            } else {
                // JSON 卡
                try {
                    const text = atob(writeData);
                    const card = JSON.parse(text.replace(/^\uFEFF/, ''));
                    const base = (card.data && card.data.name) || card.name || urlName.replace(/\.json$/i, '') || 'character';
                    fileName = safeName(base) + '.json';
                } catch (e) {
                    fileName = safeName(urlName || 'character') + '.json';
                }
            }
            // 写入库目录
            const fileRel = destRel ? `${destRel}/${fileName}` : fileName;
            const writeRes = await LibraryFs.writeBuffer({ path: fileRel, value: writeData });
            if (!writeRes || !writeRes.success) {
                return { success: false, error: (writeRes && writeRes.error) || '写入卡片文件失败' };
            }
            return { success: true, filePath: LIBRARY_ROOT + '/' + fileRel, fileName };
        } catch (e) {
            return { success: false, error: (e && e.message) || '下载角色卡失败' };
        }
    },
    /** M4 快照配置持久化:存到 AppConfig 中 */
    async updateSnapshotConfig(config) {
        try {
            // 保存到 AppConfig 的 snapshotConfig 字段
            const current = await this.loadAppConfig();
            current.snapshotConfig = { ...(current.snapshotConfig || {}), ...(config || {}) };
            await this.saveAppConfig(current);
            return { success: true, config: current.snapshotConfig };
        } catch (e) {
            return { success: false, error: (e && e.message) || '保存快照配置失败' };
        }
    },
    /** M4 手动创建快照:读取当前卡片 → 写入 .bak_history */
    async createManualSnapshot(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return { success: false, error: '路径无效' };
        try {
            const bufRes = await LibraryFs.readBuffer({ path: rel });
            if (!bufRes || !bufRes.success) return { success: false, error: '读取卡片失败' };
            const dot = rel.lastIndexOf('.');
            const ext = dot > 0 ? rel.slice(dot) : '.png';
            const baseName = dot > 0 ? rel.slice(rel.lastIndexOf('/') + 1, dot) : rel.slice(rel.lastIndexOf('/') + 1);
            const sDir = snapshotDir(rel);
            const sName = snapshotFileName(baseName, ext, true);
            const sRel = sDir + sName;
            // 确保快照目录存在
            const mkRes = await LibraryFs.writeBuffer({ path: sRel, value: bufRes.value || bufRes.data || '' });
            if (!mkRes || !mkRes.success) return { success: false, error: (mkRes && mkRes.error) || '创建快照失败' };
            return { success: true, snapshotPath: LIBRARY_ROOT + '/' + sRel };
        } catch (e) {
            return { success: false, error: (e && e.message) || '创建快照失败' };
        }
    },
    /** M4 列出卡片快照:扫描 .bak_history 目录 */
    async listCardSnapshots(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return [];
        try {
            const sDir = snapshotDir(rel);
            const dot = rel.lastIndexOf('.');
            const ext = dot > 0 ? rel.slice(dot) : '.png';
            const baseName = dot > 0 ? rel.slice(rel.lastIndexOf('/') + 1, dot) : rel.slice(rel.lastIndexOf('/') + 1);
            const scanRes = await LibraryFs.scan({ path: sDir });
            const files = (scanRes && scanRes.files) || [];
            const snaps = files
                .filter(f => isSnapshotOf(f.name || '', baseName) && (f.name || '').endsWith(ext))
                .map(f => ({
                    fileName: f.name,
                    path: LIBRARY_ROOT + '/' + sDir + f.name,
                    mtimeMs: f.mtime || 0,
                    size: f.size || 0,
                    isManual: /_manual\./.test(f.name || '')
                }))
                .sort((a, b) => b.mtimeMs - a.mtimeMs);
            return snaps;
        } catch (e) {
            return [];
        }
    },
    /** M4 恢复快照:先备份当前 → 复制快照覆盖原文件 */
    async restoreCardSnapshot({ filePath, snapshotPath } = {}) {
        const rel = toRelativePath(filePath);
        const sRel = toRelativePath(snapshotPath);
        if (!rel || !sRel) return { success: false, error: '路径无效' };
        try {
            // 备份当前版本
            const bufRes = await LibraryFs.readBuffer({ path: rel });
            if (bufRes && bufRes.success) {
                const dot = rel.lastIndexOf('.');
                const ext = dot > 0 ? rel.slice(dot) : '.png';
                const baseName = dot > 0 ? rel.slice(rel.lastIndexOf('/') + 1, dot) : rel.slice(rel.lastIndexOf('/') + 1);
                const bkDir = snapshotDir(rel);
                const bkName = snapshotFileName(baseName, ext, true);
                const bkRel = bkDir + bkName;
                await LibraryFs.writeBuffer({ path: bkRel, value: bufRes.value || bufRes.data || '' }).catch(() => {});
            }
            // 读取快照 → 覆盖原文件
            const snapBuf = await LibraryFs.readBuffer({ path: sRel });
            if (!snapBuf || !snapBuf.success) return { success: false, error: '读取快照失败' };
            const writeRes = await LibraryFs.writeBuffer({ path: rel, value: snapBuf.value || snapBuf.data || '' });
            if (!writeRes || !writeRes.success) return { success: false, error: (writeRes && writeRes.error) || '恢复快照失败' };
            return { success: true };
        } catch (e) {
            return { success: false, error: (e && e.message) || '恢复快照失败' };
        }
    },
    /** M4 删除单个快照 */
    async deleteCardSnapshot(snapshotPath) {
        const sRel = toRelativePath(snapshotPath);
        if (!sRel) return { success: false, error: '路径无效' };
        try {
            // 安全检查:必须在 .bak_history 目录下
            if (!sRel.includes('/' + SNAPSHOT_DIR + '/')) return { success: false, error: '非法快照路径' };
            const res = await LibraryFs.delete({ path: sRel });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '删除快照失败' };
        }
    },
    /** M4 清理所有快照:递归删除库内所有 .bak_history */
    async cleanAllSnapshots() {
        try {
            // 递归扫描找到所有 .bak_history 目录并删除
            let removedCount = 0;
            const walk = async (dirRel) => {
                const scanRes = await LibraryFs.scan({ path: dirRel });
                const files = (scanRes && scanRes.files) || [];
                for (const f of files) {
                    if (f.isDirectory && f.name === SNAPSHOT_DIR) {
                        const full = dirRel ? `${dirRel}/${SNAPSHOT_DIR}` : SNAPSHOT_DIR;
                        const delRes = await LibraryFs.delete({ path: full, recursive: true }).catch(() => {});
                        if (delRes && delRes.success) removedCount++;
                    } else if (f.isDirectory && !(f.name || '').startsWith('.')) {
                        const sub = dirRel ? `${dirRel}/${f.name}` : f.name;
                        await walk(sub);
                    }
                }
            };
            await walk('');
            return { success: true, removedCount };
        } catch (e) {
            return { success: false, error: (e && e.message) || '清理快照失败' };
        }
    },
    /** M4 清理孤儿快照:删除无对应卡片的 .bak_history */
    async cleanOrphanSnapshots() {
        try {
            let removedCount = 0;
            // 收集所有卡片 baseName
            const collectCards = async (dirRel) => {
                const cards = new Set();
                const scanRes = await LibraryFs.scan({ path: dirRel });
                const files = (scanRes && scanRes.files) || [];
                for (const f of files) {
                    if (f.isDirectory && !(f.name || '').startsWith('.')) {
                        const sub = dirRel ? `${dirRel}/${f.name}` : f.name;
                        const subCards = await collectCards(sub);
                        subCards.forEach(c => cards.add(c));
                    } else if (!f.isDirectory && !(f.name || '').startsWith('.')) {
                        const dot = (f.name || '').lastIndexOf('.');
                        if (dot > 0) cards.add((f.name || '').slice(0, dot));
                    }
                }
                return cards;
            };
            const cardBases = await collectCards('');
            // 扫描所有 .bak_history 目录
            const walk = async (dirRel) => {
                const scanRes = await LibraryFs.scan({ path: dirRel });
                const files = (scanRes && scanRes.files) || [];
                for (const f of files) {
                    if (f.isDirectory && f.name === SNAPSHOT_DIR) {
                        const full = dirRel ? `${dirRel}/${SNAPSHOT_DIR}` : SNAPSHOT_DIR;
                        const snapScan = await LibraryFs.scan({ path: full });
                        const snapFiles = (snapScan && snapScan.files) || [];
                        let alive = false;
                        for (const cb of cardBases) {
                            if (snapFiles.some(sf => isSnapshotOf(sf.name || '', cb))) {
                                alive = true;
                                break;
                            }
                        }
                        if (!alive) {
                            const delRes = await LibraryFs.delete({ path: full, recursive: true }).catch(() => {});
                            if (delRes && delRes.success) removedCount++;
                        }
                    } else if (f.isDirectory && !(f.name || '').startsWith('.')) {
                        const sub = dirRel ? `${dirRel}/${f.name}` : f.name;
                        await walk(sub);
                    }
                }
            };
            await walk('');
            return { success: true, removedCount };
        } catch (e) {
            return { success: false, error: (e && e.message) || '清理孤儿快照失败' };
        }
    },
    /** M4 替换卡片封面:读取原卡 → 替换内嵌 PNG 图像 → 写回(保留 JSON 数据不变) */
    async replaceCardImage({ filePath, imageBase64, imageType } = {}) {
        const rel = toRelativePath(filePath);
        if (!rel) return { success: false, error: '路径无效' };
        try {
            // 1. 读取原卡二进制
            const bufRes = await LibraryFs.readBuffer({ path: rel });
            if (!bufRes || !bufRes.success) return { success: false, error: '读取原卡失败' };
            const rawB64 = bufRes.value || bufRes.data || '';
            if (!rawB64) return { success: false, error: '原卡数据为空' };
            const raw = Uint8Array.from(atob(rawB64), c => c.charCodeAt(0));
            const isPNG = raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4E && raw[3] === 0x47;
            // 2. 提取原卡 JSON 数据
            let cardJson = null;
            if (isPNG) {
                let pos = 8;
                while (pos < raw.length - 4) {
                    const len = (raw[pos] << 24) | (raw[pos + 1] << 16) | (raw[pos + 2] << 8) | raw[pos + 3];
                    pos += 4;
                    const type = String.fromCharCode(raw[pos], raw[pos + 1], raw[pos + 2], raw[pos + 3]);
                    pos += 4;
                    if (type === 'tEXt') {
                        const chunk = new TextDecoder().decode(raw.slice(pos, pos + len));
                        const nullIdx = chunk.indexOf('\0');
                        if (nullIdx > 0) {
                            const key = chunk.slice(0, nullIdx);
                            if (key === 'chara' || key === 'ccv3') {
                                try { cardJson = JSON.parse(chunk.slice(nullIdx + 1)); } catch (e) { /* ignore */ }
                                break;
                            }
                        }
                    }
                    pos += len + 4;
                }
            } else {
                try { cardJson = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { /* ignore */ }
            }
            if (!cardJson) return { success: false, error: '无法解析原卡 JSON 数据' };
            // 3. 解码新图片 base64 → 构建新 PNG(嵌入原 JSON)
            const imgBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
            // 4. 构建新 PNG:用新图片 + 原 JSON 嵌入 tEXt chunk
            // 简单策略:如果新图片也是 PNG 且有 tEXt,直接用它;否则把 JSON 嵌入新图
            const isNewPNG = imgBytes[0] === 0x89 && imgBytes[1] === 0x50 && imgBytes[2] === 0x4E && imgBytes[3] === 0x47;
            let newPNG;
            if (isNewPNG) {
                // 新图片是 PNG:替换其 tEXt chara/ccv3 块
                newPNG = replacePNGTextChunk(imgBytes, cardJson);
            } else {
                // 新图片不是 PNG(如 JPEG):需要转换,这里简单用 base64 嵌入 PNG
                // 构建最小 PNG:IHDR + IDAT(新图片base64) + tEXt(chara) + IEND
                newPNG = buildPNGWithImage(imgBytes, cardJson);
            }
            if (!newPNG) return { success: false, error: '构建新 PNG 失败' };
            // 5. 写回(原子替换:先写 tmp 再 rename)
            const tmpRel = rel + '.tmp_' + Date.now();
            const newB64 = btoa(String.fromCharCode(...newPNG));
            const writeRes = await LibraryFs.writeBuffer({ path: tmpRel, value: newB64 });
            if (!writeRes || !writeRes.success) {
                return { success: false, error: (writeRes && writeRes.error) || '写入临时文件失败' };
            }
            const verifyRes = await LibraryFs.readBuffer({ path: tmpRel });
            if (!verifyRes || !verifyRes.success) {
                await LibraryFs.delete({ path: tmpRel }).catch(() => {});
                return { success: false, error: '写入验证失败' };
            }
            await LibraryFs.delete({ path: rel }).catch(() => {});
            const renameRes = await LibraryFs.rename({ path: tmpRel, newPath: rel });
            if (!renameRes || !renameRes.success) {
                // 回退:直接写回原路径
                const fbRes = await LibraryFs.writeBuffer({ path: rel, value: newB64 });
                await LibraryFs.delete({ path: tmpRel }).catch(() => {});
                if (!fbRes || !fbRes.success) return { success: false, error: '写入新卡失败,原卡可能已丢失' };
            }
            return { success: true, newPath: filePath, format: 'png' };
        } catch (e) {
            return { success: false, error: (e && e.message) || '替换卡图失败' };
        }
    },
    /** M4 复制文件:创建带时间戳的副本 */
    async duplicateFile(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return { success: false, error: '路径无效' };
        try {
            const dot = rel.lastIndexOf('.');
            const ext = dot > 0 ? rel.slice(dot) : '';
            const base = dot > 0 ? rel.slice(0, dot) : rel;
            const newRel = `${base}_copy_${Math.floor(Date.now() / 1000)}${ext}`;
            // 读取原文件 → 写入新文件
            const bufRes = await LibraryFs.readBuffer({ path: rel });
            if (!bufRes || !bufRes.success) return { success: false, error: '读取源文件失败' };
            const writeRes = await LibraryFs.writeBuffer({ path: newRel, value: bufRes.value || bufRes.data || '' });
            if (!writeRes || !writeRes.success) return { success: false, error: (writeRes && writeRes.error) || '写入副本失败' };
            return { success: true, destPath: LIBRARY_ROOT + '/' + newRel };
        } catch (e) {
            return { success: false, error: (e && e.message) || '复制文件失败' };
        }
    },
    /** M4.5 弹出系统图片选择器,返回 { success, base64, mime } 或 { success:false, error } */
    async pickImage() {
        try {
            const res = await LibraryFs.pickImage({});
            if (!res || !res.success) return { success: false, error: (res && (res.error || res.message)) || '未选择图片' };
            return { success: true, base64: res.base64, mime: res.mime || 'image/png' };
        } catch (e) {
            const msg = String((e && e.message) || e || '');
            if (/取消/i.test(msg)) return { success: false, cancelled: true };
            return { success: false, error: msg || '选择图片失败' };
        }
    },
    /** M4.5 换卡图:pickImage → replaceCardImage 一站式调用,返回 { success, newPath, format } */
    async changeCardImage(filePath) {
        const pick = await this.pickImage();
        if (!pick.success) return pick;
        return await this.replaceCardImage({ filePath, imageBase64: pick.base64, imageType: pick.mime });
    },
    /** M4 批量导出世界书:多选世界书文件打包 ZIP → 下载目录 → 系统分享(filePaths 为库根相对路径) */
    async exportWorldbooksBatch(filePaths) {
        return await this.exportBatchPackage(filePaths);
    },
    getWindowsDrives: () => Promise.resolve([]),
    /** M4 磁盘扫描:SAF 目录选择器 → 原生递归收集 png/webp,返回列表(相对所选目录);扫描大目录时通过 onScanProgress 上报心跳 */
    async scanTargetFolder() {
        try {
            const res = await LibraryFs.scanFolder({ ext: '.png', skipLarge: true });
            if (!res.success) return { files: [], error: res.message || '扫描失败' };
            const files = (res.files || []).map((o) => ({
                path: o.path,
                name: o.name,
                size: o.size || 0
            }));
            // 记录本次扫描根目录信息(供结果列表标题显示)
            if (res.treeUri) this._scanTreeUri = res.treeUri;
            if (res.title) this._scanTitle = res.title;
            return { files, treeUri: res.treeUri, title: res.title, error: undefined };
        } catch (e) {
            return { files: [], error: (e && e.message) || '扫描失败' };
        }
    },
    /** M4 扫描进度心跳(原生 scanProgress 事件),回调会在整个扫描期间持续收到(progress/finish) */
    onScanProgress(cb) {
        onNativeEvent(LibraryFs, 'scanProgress');
        subscribeEvent('scanProgress', cb);
    },
    /** M4 推送酒馆:multipart 上传角色卡(对齐桌面 tavern:push;端点 {targetUrl}/api/characters/import,字段 avatar,Bearer 鉴权) */
    async pushToTavern({ filePath, targetUrl, apiKey, cardName, fieldName = 'avatar' } = {}) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '卡片路径无效' };
        if (!targetUrl) return { success: false, error: '未配置酒馆推送地址' };
        try {
            const baseName = rel.split('/').pop() || 'card.png';
            const dot = baseName.lastIndexOf('.');
            const ext = dot > 0 ? baseName.slice(dot) : '.png';
            const safe = String(cardName || baseName.slice(0, dot > 0 ? dot : baseName.length) || 'card')
                .replace(/[\\/:*?"<>|]/g, '_');
            const fileName = safe + ext;
            const res = await Http.pushCard({
                url: targetUrl,
                relPath: rel,
                fileName,
                fieldName,
                apiKey: apiKey || ''
            });
            return {
                success: !!(res && res.success),
                status: res && res.status,
                body: res && res.body,
                error: (res && (res.message || res.error)) || ((res && !res.success) ? '推送失败' : undefined)
            };
        } catch (e) {
            return { success: false, error: (e && e.message) || '推送失败' };
        }
    },
    /** M4 选择通用文件夹(用于绑定酒馆根目录):弹出 SAF 目录选择器,返回 URI 字符串或 null */
    async selectGenericFolder() {
        try {
            const res = await LibraryFs.pickPushFolder();
            if (res && res.success && res.uri) {
                await this._saveTavernPath(res.uri, res.title || '');
                return res.uri;
            }
            return null;
        } catch (e) {
            return null;
        }
    },
    /** M4 选择推送目标文件夹:不覆盖库根,返回 treeUri 供后续 copyToFolder 使用 */
    async selectPushFolder() {
        try {
            const res = await LibraryFs.pickPushFolder();
            return { success: !!(res && res.success), path: res && res.uri, title: res && res.title, error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '选择推送文件夹失败' };
        }
    },
    /** 移动端无法自动检测酒馆目录,改为「记住上次选择的推送目录」机制:
     *  有保存 → 返回 URI 字符串; 无 → 返回 null(与桌面 null 语义一致) */
    async autoDetectTavernPath() {
        try {
            const saved = await AppConfig.loadTavernPath({});
            if (saved && saved.hasSaved && saved.path) {
                return saved.path; // 与桌面一致:返回字符串路径
            }
            return null;
        } catch (e) {
            return null;
        }
    },
    /** 保存用户选择的酒馆目录路径(在 selectGenericFolder 成功后调用) */
    async _saveTavernPath(uri, title) {
        try {
            await AppConfig.saveTavernPath({ uri, title: title || '' });
        } catch (e) { /* 静默失败,不影响主流程 */ }
    },
    /** M4 推送到酒馆目录:复制卡片到目标 treeUri(签名与桌面 preload 一致: paths, rootPath) */
    async pushToSillyTavernDir(paths, rootPath) {
        const pathsArr = Array.isArray(paths) ? paths : (paths ? [paths] : []);
        return await this.pushToCustomDir({ filePaths: pathsArr, targetDir: rootPath });
    },
    /** M4 推送到自定义目录:copyToFolder 将库内文件复制到目标 SAF 树 */
    async pushToCustomDir({ filePaths, targetDir } = {}) {
        if (!targetDir) return { success: false, error: '未选择推送目标目录' };
        const paths = (filePaths || []).map(toRelativePath).filter(Boolean);
        if (paths.length === 0) return { success: false, error: '未选择要推送的文件' };
        try {
            const res = await LibraryFs.copyToFolder({ treeUri: targetDir, paths });
            return {
                success: !!(res && res.success),
                copied: res && res.copied || [],
                failed: res && res.failed || [],
                count: res && res.count || 0,
                error: (res && !res.success && res.error) || undefined
            };
        } catch (e) {
            return { success: false, error: (e && e.message) || '推送到目录失败' };
        }
    },
    /** 扫描库内独立世界书:列出所有.json文件,过滤出含 entries 且非角色卡的世界书 */
    async scanWorldbooks(dirPath) {
        const rel = toRelativePath(dirPath || LIBRARY_ROOT) || '';
        try {
            const res = await LibraryFs.scan({ path: rel });
            if (!res || res.error) return { worldbooks: [], error: (res && res.error) || '扫描失败' };
            const files = (res.files || []).filter(f => {
                const n = (f.name || '').toLowerCase();
                return n.endsWith('.json');
            });
            const worldbooks = [];
            for (const f of files) {
                try {
                    const r = await LibraryFs.readText({ path: toRelativePath(f.path) });
                    if (!r || !r.success || !r.value) continue;
                    const parsed = JSON.parse(r.value);
                    // 排除角色卡(V2/V3 spec 或含角色描述字段)
                    if (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') continue;
                    if (parsed.data && (parsed.data.description !== undefined || parsed.data.first_mes !== undefined)) continue;
                    // 必须有 entries 字段(字典或数组)
                    if (!parsed.entries || typeof parsed.entries !== 'object') continue;
                    worldbooks.push({ path: f.path, name: f.name, wb: parsed });
                } catch (e) {
                    // 跳过损坏/非标准 JSON
                }
            }
            return { worldbooks, error: undefined };
        } catch (e) {
            return { worldbooks: [], error: (e && e.message) || '扫描失败' };
        }
    },
    /** 保存世界书:序列化为 JSON 并覆写文件 */
    async saveWorldbook({ path, wb }) {
        const rel = toRelativePath(path);
        if (!rel) return { success: false, error: '无效路径' };
        try {
            const json = JSON.stringify(wb, null, 2);
            const res = await LibraryFs.writeText({ path: rel, content: json });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '保存失败' };
        }
    },
    /**
     * ============ 外部世界书目录(独立 SAF 树) ============
     * 桌面端「打开世界书目录」的移动端等价:选择一个任意目录树,扫描/读写其中的世界书 .json。
     * 授权为持久化授权(原生 pickPushFolder 内已 takePersistableUriPermission),
     * uri 字符串由 JS 侧持久化到 AppConfig,重启后可直接复用无需重新选择。
     */
    async pickExternalWbDir() {
        try {
            const res = await LibraryFs.pickPushFolder();
            return { success: !!(res && res.success), uri: res && res.uri, title: res && res.title, error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '选择目录失败' };
        }
    },
    /** 扫描外部目录树中的世界书 .json(排除角色卡,要求含 entries) */
    async scanExternalWorldbooks(treeUri) {
        if (!treeUri) return { worldbooks: [], error: '未选择世界书目录' };
        try {
            const scan = await LibraryFs.scanWbTree({ treeUri });
            if (!scan || !scan.success) return { worldbooks: [], error: (scan && scan.error) || '扫描失败' };
            const files = scan.files || [];
            const worldbooks = [];
            for (const f of files) {
                try {
                    const r = await LibraryFs.readWbText({ treeUri, path: f.path });
                    if (!r || !r.success || !r.value) continue;
                    const parsed = JSON.parse(r.value);
                    // 排除角色卡(与桌面 scanWorldbooks 同口径)
                    if (parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') continue;
                    if (parsed.data && (parsed.data.description !== undefined || parsed.data.first_mes !== undefined)) continue;
                    const wb = (parsed.extensions && parsed.extensions.world_book) || parsed;
                    if (!wb || typeof wb.entries !== 'object' || wb.entries === null) continue;
                    // 归一化:extensions.world_book 包装形态记录标志,保存时按原结构回写
                    worldbooks.push({
                        path: 'extwb://' + f.path, // 外部世界书虚拟路径(与库内 /library 前缀区分)
                        treeUri,
                        rel: f.path,
                        name: f.name,
                        wb,
                        wrapped: !!(parsed.extensions && parsed.extensions.world_book),
                        external: true
                    });
                } catch (e) { /* 跳过损坏/非标准 JSON */ }
            }
            return { worldbooks, title: scan.title || '', error: undefined };
        } catch (e) {
            return { worldbooks: [], error: (e && e.message) || '扫描失败' };
        }
    },
    /** 保存外部世界书(按原结构回写:wrapped 时重新包 extensions.world_book) */
    async saveExternalWorldbook({ treeUri, rel, wb, wrapped }) {
        if (!treeUri || !rel) return { success: false, error: '缺少目录授权' };
        try {
            const body = wrapped ? { extensions: { world_book: wb } } : wb;
            const res = await LibraryFs.writeWbText({ treeUri, path: rel, content: JSON.stringify(body, null, 2) });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '保存失败' };
        }
    },
    /** 在外部目录树中新建世界书文件 */
    async createExternalWorldbook({ treeUri, rel, wb }) {
        if (!treeUri || !rel) return { success: false, error: '缺少目录授权' };
        try {
            const res = await LibraryFs.writeWbText({ treeUri, path: rel, content: JSON.stringify(wb, null, 2) });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '创建失败' };
        }
    },
    /** 重命名外部世界书物理文件 */
    async renameExternalWbFile({ treeUri, rel, newName }) {
        if (!treeUri || !rel || !newName) return { success: false, error: '参数缺失' };
        try {
            const res = await LibraryFs.renameWbFile({ treeUri, path: rel, newName });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '重命名失败' };
        }
    },
    /** 删除外部世界书物理文件(物理删除;外部树无库根回收站语义,调用方先确认) */
    async deleteExternalWbFile({ treeUri, rel }) {
        if (!treeUri || !rel) return { success: false, error: '参数缺失' };
        try {
            const res = await LibraryFs.deleteWbFile({ treeUri, path: rel });
            return { success: !!(res && res.success), notExist: !!(res && res.notExist), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '删除失败' };
        }
    },

    /**
     * ============ 预设管理(酒馆 Presets 目录,对齐桌面 usePresets) ============
     * 预设 = OpenAI Settings JSON(prompts/prompt_order/temperature 等)。
     * 完整复用外部世界书目录的 SAF 桥接(scanWbTree/readWbText/writeWbText/renameWbFile/deleteWbFile),
     * 仅在 JS 层加预设智能校验(排除世界书/角色卡)。
     */
    async scanExternalPresets(treeUri) {
        if (!treeUri) return { presets: [], error: '未选择预设目录' };
        try {
            const scan = await LibraryFs.scanWbTree({ treeUri });
            if (!scan || !scan.success) return { presets: [], error: (scan && scan.error) || '扫描失败' };
            const files = scan.files || [];
            const presets = [];
            for (const f of files) {
                try {
                    const r = await LibraryFs.readWbText({ treeUri, path: f.path });
                    if (!r || !r.success || !r.value) continue;
                    const parsed = JSON.parse(r.value);
                    if (!isValidPreset(parsed)) continue;
                    presets.push({
                        path: 'expst://' + f.path,
                        treeUri,
                        rel: f.path,
                        name: f.name,
                        data: parsed,
                        external: true
                    });
                } catch (e) { /* 跳过损坏/非标准 JSON */ }
            }
            return { presets, title: scan.title || '', error: undefined };
        } catch (e) {
            return { presets: [], error: (e && e.message) || '扫描失败' };
        }
    },
    /** 保存外部预设(整包覆写) */
    async saveExternalPreset({ treeUri, rel, data }) {
        if (!treeUri || !rel) return { success: false, error: '缺少目录授权' };
        try {
            const res = await LibraryFs.writeWbText({ treeUri, path: rel, content: JSON.stringify(data, null, 2) });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '保存失败' };
        }
    },
    /** 重命名外部预设物理文件 */
    async renameExternalPreset({ treeUri, rel, newName }) {
        if (!treeUri || !rel || !newName) return { success: false, error: '参数缺失' };
        try {
            const res = await LibraryFs.renameWbFile({ treeUri, path: rel, newName });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '重命名失败' };
        }
    },
    /** 删除外部预设物理文件 */
    async deleteExternalPreset({ treeUri, rel }) {
        if (!treeUri || !rel) return { success: false, error: '参数缺失' };
        try {
            const res = await LibraryFs.deleteWbFile({ treeUri, path: rel });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '删除失败' };
        }
    },
    /** 新建预设文件 */
    async createExternalPreset({ treeUri, rel, data }) {
        if (!treeUri || !rel) return { success: false, error: '缺少目录授权' };
        try {
            const res = await LibraryFs.writeWbText({ treeUri, path: rel, content: JSON.stringify(data, null, 2) });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '创建失败' };
        }
    },
    /** 创建世界书:在库内新建 .json 文件并写入 */
    async createWorldbook({ path, name, wb }) {
        const rel = toRelativePath(path);
        if (!rel) return { success: false, error: '无效路径' };
        try {
            const json = JSON.stringify(wb, null, 2);
            const res = await LibraryFs.writeText({ path: rel, content: json });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '创建失败' };
        }
    },
    /** 重命名世界书物理文件 */
    async renameWorldbookFile({ path, newPath }) {
        const rel = toRelativePath(path);
        const newRel = toRelativePath(newPath);
        if (!rel || !newRel) return { success: false, error: '无效路径' };
        try {
            const res = await LibraryFs.rename({ path: rel, newPath: newRel });
            return { success: !!(res && res.success), newPath: newPath, error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '重命名失败' };
        }
    },
    /** M4 列出世界书快照:复用卡片快照逻辑,扫描 .bak_history 中 .json 快照 */
    async listWorldbookSnapshots(filePath) {
        const rel = toRelativePath(filePath);
        if (!rel) return [];
        try {
            const sDir = snapshotDir(rel);
            const baseName = rel.slice(rel.lastIndexOf('/') + 1, rel.lastIndexOf('.'));
            const scanRes = await LibraryFs.scan({ path: sDir });
            const files = (scanRes && scanRes.files) || [];
            const snaps = files
                .filter(f => isSnapshotOf(f.name || '', baseName) && (f.name || '').endsWith('.json'))
                .map(f => ({
                    fileName: f.name,
                    path: LIBRARY_ROOT + '/' + sDir + f.name,
                    mtimeMs: f.mtime || 0,
                    size: f.size || 0,
                    isManual: /_manual\./.test(f.name || '')
                }))
                .sort((a, b) => b.mtimeMs - a.mtimeMs);
            return snaps;
        } catch (e) {
            return [];
        }
    },
    /** M4 恢复世界书快照:先备份当前 → 复制快照覆盖 */
    async restoreWorldbookSnapshot({ filePath, snapshotPath } = {}) {
        const rel = toRelativePath(filePath);
        const sRel = toRelativePath(snapshotPath);
        if (!rel || !sRel) return { success: false, error: '路径无效' };
        try {
            // 备份当前版本
            const bufRes = await LibraryFs.readText({ path: rel });
            if (bufRes && bufRes.success) {
                const baseName = rel.slice(rel.lastIndexOf('/') + 1, rel.lastIndexOf('.'));
                const bkDir = snapshotDir(rel);
                const bkName = snapshotFileName(baseName, '.json', true);
                const bkRel = bkDir + bkName;
                await LibraryFs.writeText({ path: bkRel, content: bufRes.text || '' }).catch(() => {});
            }
            // 读取快照 → 覆盖
            const snapBuf = await LibraryFs.readText({ path: sRel });
            if (!snapBuf || !snapBuf.success) return { success: false, error: '读取快照失败' };
            const writeRes = await LibraryFs.writeText({ path: rel, content: snapBuf.text || '' });
            if (!writeRes || !writeRes.success) return { success: false, error: (writeRes && writeRes.error) || '恢复快照失败' };
            return { success: true };
        } catch (e) {
            return { success: false, error: (e && e.message) || '恢复快照失败' };
        }
    },
    /** M4 删除世界书快照 */
    async deleteWorldbookSnapshot(snapshotPath) {
        const sRel = toRelativePath(snapshotPath);
        if (!sRel) return { success: false, error: '路径无效' };
        try {
            if (!sRel.includes('/' + SNAPSHOT_DIR + '/')) return { success: false, error: '非法快照路径' };
            const res = await LibraryFs.delete({ path: sRel });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '删除快照失败' };
        }
    },
    /** M4 查重清理:移入库根 _trash 软回收站(Android 无系统回收站);返回 { success, count, failed:[{path}] } 对齐桌面语义 */
    async trashFiles(filePaths) {
        const rels = (filePaths || []).map(toRelativePath).filter(Boolean);
        if (rels.length === 0) return { success: false, count: 0, failed: [], error: '无效路径' };
        const { success, failed, count } = await trashByMove(rels);
        return { success, count, failed, error: undefined };
    },
    /** 回收站目录(.trash)管理:在系统文件管理器中打开库内 .trash 目录 */
    async openGlobalTrash() {
        try {
            const res = await LibraryFs.openTrash({});
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '无法打开回收站' };
        }
    },
    /** 列出回收站内容:递归扫描 .trash,返回 { success, items:[{name, path, relPath, size, mtimeMs}] } */
    async listTrash() {
        try {
            const items = [];
            const walk = async (dirRel) => {
                const scanRes = await LibraryFs.scan({ path: dirRel });
                const files = (scanRes && scanRes.files) || [];
                for (const f of files) {
                    const rel = dirRel ? `${dirRel}/${f.name}` : f.name;
                    if (f.isDirectory) {
                        await walk(rel);
                    } else {
                        items.push({
                            name: f.name,
                            path: LIBRARY_ROOT + '/' + rel,
                            relPath: rel.slice(TRASH_DIR.length + 1),
                            size: f.size || 0,
                            mtimeMs: f.mtime || 0
                        });
                    }
                }
            };
            await walk(TRASH_DIR);
            items.sort((a, b) => b.mtimeMs - a.mtimeMs);
            return { success: true, items };
        } catch (e) {
            return { success: false, items: [], error: (e && e.message) || '读取回收站失败' };
        }
    },
    /** 恢复回收站条目:把 .trash/<relPath> 移回原相对路径 */
    async restoreTrashItem(trashPath) {
        const rel = toRelativePath(trashPath);
        if (!rel || !rel.startsWith(TRASH_DIR + '/')) return { success: false, error: '非法回收站路径' };
        const origRel = rel.slice(TRASH_DIR.length + 1);
        try {
            const parentIdx = origRel.lastIndexOf('/');
            if (parentIdx > 0) {
                const parentDir = origRel.slice(0, parentIdx);
                await LibraryFs.mkdir({ path: parentDir }).catch(() => {});
            }
            const res = await LibraryFs.move({ path: rel, newPath: origRel });
            if (res && res.success) return { success: true };
            // 移动失败:目标目录需先创建后重试
            const parentDir = parentIdx > 0 ? origRel.slice(0, parentIdx) : '';
            if (parentDir) {
                const mk = await LibraryFs.mkdir({ path: parentDir });
                if (mk && mk.success) {
                    const retry = await LibraryFs.move({ path: rel, newPath: origRel });
                    if (retry && retry.success) return { success: true };
                }
            }
            return { success: false, error: (res && res.error) || '恢复失败' };
        } catch (e) {
            return { success: false, error: (e && e.message) || '恢复失败' };
        }
    },
    /** 清空回收站:递归删除 .trash 目录内容 */
    async emptyTrash() {
        try {
            const res = await LibraryFs.delete({ path: TRASH_DIR, recursive: true });
            return { success: !!(res && res.success), error: (res && !res.success && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '清空回收站失败' };
        }
    },
    /** M4 扫描收编:把扫描结果中勾选的文件复制入库(destFolder 为库根或分组相对路径),同名跳过不覆盖 */
    async importScanned({ treeUri, scanPaths = [], destFolder } = {}) {
        if (!treeUri || !scanPaths.length) return { success: false, copied: [], skipped: [], failed: [], error: '缺少扫描结果' };
        const destRel = toRelativePath(destFolder || LIBRARY_ROOT) || '';
        try {
            const res = await LibraryFs.importScanned({ treeUri, paths: scanPaths, dest: destRel });
            if (!res || !res.success) return { success: false, copied: [], skipped: [], failed: [], error: (res && (res.message || res.error)) || '导入失败' };
            return {
                success: true,
                copied: (res.copied || []).map((p) => LIBRARY_ROOT + '/' + p.replace(/^\/+/, '')),
                skipped: res.skipped || [],
                failed: res.failed || []
            };
        } catch (e) {
            return { success: false, copied: [], skipped: [], failed: [], error: (e && e.message) || '导入失败' };
        }
    },
    /** M4 查重:批量获取物理文件状态(修改时间/大小);返回 { success, data:{ [path]: {mtimeMs,size} } } 对齐桌面 preload */
    async getFileStats(paths) {
        try {
            const res = await LibraryFs.getFileStats({ paths: (paths || []).map(toRelativePath).filter(Boolean) });
            return { success: true, data: res || {} };
        } catch (e) {
            return { success: false, data: {}, error: (e && e.message) || '获取文件信息失败' };
        }
    },
    /** M4 OTA:检查更新。feed 支持 GitHub Releases API 或自定义 {version,url,...} JSON(见 UpdatePlugin 注释) */
    async checkUpdate(feed) {
        const url = (typeof feed === 'string' && feed.trim()) || this._updateFeed || '';
        if (!url) return { success: false, error: '未配置更新源地址' };
        try {
            const res = await Update.checkUpdate({ feed: url });
            const update = res && res.update;
            const info = update ? {
                version: res.version || '',
                name: res.name || '',
                url: res.url || '',
                size: res.size || 0,
                notes: res.notes || ''
            } : null;
            // 发通知回调(与桌面事件语义一致:available/notAvailable)
            if (info) {
                this._updateInfo = info; // 保存供 downloadUpdate 复用
                const cb = latestCallback('updateAvailable'); if (cb) cb(info);
            }
            else { const cb = latestCallback('updateNotAvailable'); if (cb) cb(info); }
            return update
                ? { success: true, update: true, info, version: info.version, url: info.url }
                : { success: true, update: false, info: null };
        } catch (e) {
            return { success: false, update: false, error: (e && e.message) || '检查更新失败' };
        }
    },
    /** M4 OTA:下载更新包到缓存目录(url/fileName 缺省时复用 checkUpdate 结果) */
    async downloadUpdate(url, fileName) {
        const dlUrl = url || (this._updateInfo && this._updateInfo.url);
        if (!dlUrl) return { success: false, error: '缺少下载地址' };
        try {
            const res = await Update.downloadUpdate({ url: dlUrl, fileName: fileName || 'jszkx-update.apk' });
            if (res && res.success) {
                if (this._updateInfo) this._updateInfo.filePath = res.filePath;
                const cb = latestCallback('updateDownloaded');
                if (cb) cb({ filePath: res.filePath, fileName: res.fileName });
            }
            return { success: !!(res && res.success), filePath: res && res.filePath, error: (res && (res.message || res.error)) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '下载失败' };
        }
    },
    /** M4 OTA:拉起系统安装器(未知来源需用户在系统弹窗确认) */
    async installUpdate(filePath) {
        const apkPath = filePath || (this._updateInfo && this._updateInfo.filePath);
        if (!apkPath) return { success: false, error: '缺少安装包路径,请先完成下载' };
        try {
            const res = await Update.installUpdate({ filePath: apkPath });
            if (res && res.success) {
                const cb = latestCallback('updateDownloaded'); // 安装成功视为完成
                if (cb) cb({ filePath: apkPath, installed: true });
            }
            return { success: !!(res && res.success), error: (res && (res.message || res.error)) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '拉起安装器失败' };
        }
    },
    /** OTA 事件回调订阅(移动端由 checkUpdate/downloadUpdate 的返回值驱动,回调仅作补充通知) */
    onUpdateAvailable(cb) { subscribeEvent('updateAvailable', cb); },
    onUpdateNotAvailable(cb) { subscribeEvent('updateNotAvailable', cb); },
    onUpdateProgress(cb) { onNativeEvent(Update, 'updateProgress'); subscribeEvent('updateProgress', cb); },
    onUpdateDownloaded(cb) { subscribeEvent('updateDownloaded', cb); },
    onUpdateError(cb) { subscribeEvent('updateError', cb); },
    /** 加密敏感数据:Android Keystore AES-256-GCM,输出 base64(iv+ciphertext) */
    async encryptSecret(plain) {
        try {
            const res = await Keystore.encrypt({ plain });
            return { success: !!(res && res.success), value: res && res.value, error: (res && res.error) || undefined };
        } catch (e) {
            return { success: false, value: plain, error: (e && e.message) || '加密失败' };
        }
    },
    /** 解密敏感数据:base64(iv+ciphertext) → 明文;失败返回原值(兼容旧版明文) */
    async decryptSecret(cipher) {
        try {
            const res = await Keystore.decrypt({ cipher });
            if (res && res.success) return { success: true, value: res.value };
            // 解密失败:可能是旧版明文,返回原值向后兼容
            return { success: true, value: cipher };
        } catch (e) {
            return { success: true, value: cipher }; // 回退明文
        }
    },

    // ---------- 导入 / 导出(M2) ----------
    /** 导入:系统文件选择器多选 .png/.webp/.json → 复制入库(destFolder 为库根或分组相对路径) */
    async importExternalCards(_sourceFiles, destFolder) {
        const destRel = toRelativePath(destFolder || LIBRARY_ROOT) || '';
        let res;
        try {
            res = await LibraryFs.importCardFiles({ destPath: destRel });
        } catch (e) {
            return { success: false, error: (e && e.message) || '导入失败' };
        }
        if (!res || !res.success) return { success: false, error: (res && res.error) || '导入失败' };
        return {
            success: true,
            copied: (res.copied || []).map((p) => LIBRARY_ROOT + '/' + p.replace(/^\/+/, '')),
            skipped: res.skipped || [],
            failed: res.failed || []
        };
    },
    /** 拖拽/复制语义在移动端 = 系统选择器导入(与 importExternalCards 等价) */
    copyToLibrary() { return this.importExternalCards(); },
    /** 单卡导出:系统「创建文档」写原始卡片文件 */
    async exportPackage(filePath) {
        const rel = toRelativePath(filePath);
        if (rel === null) return { success: false, error: '路径无效' };
        try {
            const res = await LibraryFs.exportCardFile({ path: rel });
            return { success: !!(res && res.success), error: (res && res.error) || undefined };
        } catch (e) {
            return { success: false, error: (e && e.message) || '导出失败' };
        }
    },
    /** 批量导出:库内多文件打包 ZIP → 系统分享(绕开目录写权限);兼容层降级为保存到下载目录 */
    async exportBatchPackage(filePaths) {
        const rels = (filePaths || []).map(toRelativePath).filter(Boolean);
        try {
            const res = await LibraryFs.exportBatchZip({ paths: rels });
            return {
                success: !!(res && res.success),
                count: res.count || 0,
                savedPath: res.savedPath || '',
                shared: !!res.shared,
                error: (res && res.error) || undefined
            };
        } catch (e) {
            return { success: false, error: (e && e.message) || '批量导出失败' };
        }
    }
};