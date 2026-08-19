/**
 * SillyTavern 角色卡高级解析中心 - Electron 主进程
 *
 * 架构说明：
 * - 渲染进程（Vue）通过 preload 暴露的 window.electronAPI 与主进程通信（IPC）；
 * - `app://` 协议加载应用自身页面：解决 file:// 下 ES Modules 的 CORS 限制；
 * - `local-file://` 特权协议安全读取磁盘图片：无需关闭 webSecurity 即可展示本地立绘；
 * - 文件夹选择通过原生 dialog 弹出，选中的路径静默保存到系统 userData 目录。
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater'); // 【新增】OTA 自动更新模块（发布需上传 latest.yml）
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const crypto = require('crypto'); // 📸 快照内容去重（SHA-256）

// 📸 换卡图：非 PNG 新图转 PNG（可选依赖；未安装/加载失败时 PNG→PNG 换图仍可用）
let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

// ================= 兼容 360 主动防御：禁用 GPU 进程沙箱 =================
// 症状：安装版在装有 360（ZhuDongFangYu 主动防御内核驱动）的机器上启动即闪退，
// 表现：GPU 子进程以沙箱(降权)方式加载 DLL 被内核驱动拦截 → 0xC0000135 循环崩溃
// → FATAL: GPU process isn't usable. Goodbye（无 crash.log，纯原生层崩溃）。
// 实测：--disable-gpu-sandbox / --no-sandbox 均可正常启动，普通 DLL 加载无异常。
// 这里仅禁用 GPU 进程沙箱（保留渲染/网络进程沙箱），影响面最小。
app.commandLine.appendSwitch('disable-gpu-sandbox');

// ================= 高 DPI 缩放支持（防糊/防双重缩放） =================
// 1. 强制开启 Chromium 的高 DPI 支持与系统缩放同步（必须在 app.whenReady() 前调用）
app.commandLine.appendSwitch('high-dpi-support', '1');
// 2. 开启 GPU 光栅化，确保高 DPI 缩放下的滚动与动画流畅度不掉帧
app.commandLine.appendSwitch('enable-gpu-rasterization');

// ================= 全局异常兜底（崩溃不闪退，错误堆栈落盘） =================
function crashLogPath() {
  return path.join(app.getPath('userData'), 'crash.log');
}

function writeCrashLog(err) {
  try {
    const entry = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : String(err)}\n\n`;
    fs.appendFileSync(crashLogPath(), entry);
  } catch (e) { /* 日志写入失败时静默忽略，避免递归崩溃 */ }
}

process.on('uncaughtException', (err) => {
  writeCrashLog(err);
  console.error('未捕获异常:', err);
  try {
    dialog.showErrorBox('程序发生未预期的错误', `${err && err.message ? err.message : String(err)}\n\n错误堆栈已写入日志：\n${crashLogPath()}`);
  } catch (e) { /* 弹窗失败忽略 */ }
});

process.on('unhandledRejection', (reason) => {
  writeCrashLog(reason instanceof Error ? reason : new Error(String(reason)));
  console.error('未处理的 Promise 拒绝:', reason);
});

// ================= [ 📸 历史快照配置与节流阀（可在设置面板动态更新） ] =================
// snapshotConfig 默认值；前端通过 settings:updateSnapshotConfig IPC 实时同步
let snapshotConfig = {
  enabled: true,         // 是否开启自动快照
  intervalMinutes: 5,    // 自动快照冷却间隔（分钟）
  maxSnapshots: 10       // 单张卡片最多保留的快照数量
};
// 记录卡片上一次生成快照的时间 { [filePath]: timestamp }
const cardLastBackupMap = new Map();

/**
 * 清理指定卡片超量的历史快照（按修改时间排序，保留最新的 N 份）
 * @param {string} historyDir .bak_history 目录
 * @param {string} baseFileName 卡片文件名（不含扩展名）
 * @param {string} ext 卡片扩展名
 * @param {number} maxCount 最大保留数（<=0 不清理）
 */
async function cleanupOldSnapshots(historyDir, baseFileName, ext, maxCount) {
  try {
    if (!maxCount || maxCount <= 0) return;
    const allFiles = await fs.promises.readdir(historyDir);
    // 精确前缀匹配（base + '_'），避免 "卡A" 误配到 "卡A2" 的快照
    const cardBackups = allFiles.filter(f => f.startsWith(baseFileName + '_') && f.endsWith(ext));
    if (cardBackups.length <= maxCount) return;
    const fileStats = await Promise.all(
      cardBackups.map(async (f) => {
        const p = path.join(historyDir, f);
        const stat = await fs.promises.stat(p);
        return { fileName: f, path: p, mtimeMs: stat.mtimeMs };
      })
    );
    fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs); // 旧 → 新
    const deleteCount = fileStats.length - maxCount;
    for (let i = 0; i < deleteCount; i++) {
      await fs.promises.unlink(fileStats[i].path).catch(() => { });
    }
  } catch (err) {
    // 清理失败不影响保存
  }
}

/**
 * 计算文件内容 SHA-256（内容去重用；走流式读取，PNG 大文件不一次性吃满内存）
 * @param {string} filePath 文件物理路径
 * @returns {Promise<string|null>} 十六进制哈希；读取失败返回 null
 */
function hashFileContent(filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', () => resolve(null));
  });
}

/**
 * 核心快照生成与清理函数（保存前调用 = 备份旧版本；手动触发绕过冷却）
 * @param {string} filePath 原始角色卡物理路径
 * @param {boolean} isManual 是否为手动触发（绕过冷却节流阀）
 */
async function processCardSnapshot(filePath, isManual = false) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: '文件不存在' };

    // 1. 关闭了自动快照且非手动触发，直接跳过
    if (!snapshotConfig.enabled && !isManual) {
      return { success: true, skipped: true, reason: '自动快照已关闭' };
    }

    const now = Date.now();
    const lastBackupTime = cardLastBackupMap.get(filePath) || 0;
    const cooldownMs = Math.max(0, snapshotConfig.intervalMinutes || 0) * 60 * 1000;

    // 2. 自动快照冷却节流（手动触发无视冷却）
    if (!isManual && cooldownMs > 0 && (now - lastBackupTime < cooldownMs)) {
      return { success: true, skipped: true, reason: '处于快照冷却时间内' };
    }

    // 3. 构建备份目录 .bak_history（与卡片同目录）
    const fileDir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const historyDir = path.join(fileDir, '.bak_history');
    if (!fs.existsSync(historyDir)) {
      await fs.promises.mkdir(historyDir, { recursive: true });
    }

    // 4. 内容去重：若与「最新一份快照」内容完全一致，说明自上次备份后未改动，跳过（省空间）
    //    （手动快照绕过此判断，保证用户显式操作一定生效）
    if (!isManual) {
      const currentHash = await hashFileContent(filePath);
      if (currentHash) {
        let latestHash = null;
        try {
          const existing = await fs.promises.readdir(historyDir);
          const mine = existing
            .filter(f => f.startsWith(baseName + '_') && f.endsWith(ext))
            .sort(); // 文件名含 ISO 时间戳，字典序即时间序
          const latestName = mine[mine.length - 1];
          if (latestName) latestHash = await hashFileContent(path.join(historyDir, latestName));
        } catch (e) { /* 目录为空或读取失败时忽略，走正常备份 */ }

        if (currentHash && latestHash && currentHash === latestHash) {
          cardLastBackupMap.set(filePath, now);
          return { success: true, skipped: true, reason: '内容未变化，跳过快照' };
        }
      }
    }

    // 5. 生成带精准时间戳的备份文件名（手动快照带 _manual 标记）
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${baseName}_${timestampStr}${isManual ? '_manual' : ''}${ext}`;
    const backupFilePath = path.join(historyDir, backupFileName);

    // 复制当前文件进行备份（保存前调用 = 备份的是旧版本）
    await fs.promises.copyFile(filePath, backupFilePath);
    cardLastBackupMap.set(filePath, now);

    // 6. 自动清理超出最大保留数量的旧快照
    await cleanupOldSnapshots(historyDir, baseName, ext, snapshotConfig.maxSnapshots);

    return { success: true, backupFilePath, isManual };
  } catch (error) {
    console.error('📸 生成快照失败:', error);
    return { success: false, error: error.message };
  }
}

// ================= [ PNG 角色卡写入工具 ] =================
// CRC32 校验（PNG 块标准算法）
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

// 将更新后的角色卡 JSON 写回 PNG 的 chara/ccv3 块（保留原图，仅替换数据块）
function writeTavernPNGChunk(buffer, updatedJson) {
  // 校验 PNG 签名
  if (!buffer || buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504E47) return null;

  const base64 = Buffer.from(JSON.stringify(updatedJson), 'utf-8').toString('base64');
  const sig = buffer.subarray(0, 8);
  let offset = 8;
  let chunks = [];
  let found = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) break; // 越界保护
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    // chara/ccv3 数据块：保留第一个用于替换为新数据（统一写为 tEXt + Base64），
    // 其余所有旧的 chara/ccv3 块一律剔除——防止 V3 幽灵数据残留（酒馆优先读 ccv3，残留会导致修改不生效）
    if (type === 'tEXt' || type === 'iTXt') {
      const nullPos = data.indexOf(0);
      if (nullPos > 0) {
        const keyword = data.subarray(0, nullPos).toString('latin1');
        if (keyword === 'chara' || keyword === 'ccv3') {
          if (!found) {
            chunks.push({
              type: 'tEXt',
              data: Buffer.concat([
                Buffer.from(keyword, 'latin1'),
                Buffer.from([0]),
                Buffer.from(base64, 'latin1')
              ])
            });
            found = true;
          }
          // 无论是否作为替换目标，旧的 chara/ccv3 块都不再保留（大扫除）
          offset += 12 + length;
          continue;
        }
      }
    }
    chunks.push({ type, data });
    offset += 12 + length;
  }

  if (!found) return null; // 未找到角色卡数据块，无法写入

  // ✅ [补丁] IEND 兜底：确保重建产物以标准 IEND 块收尾。
  // 源文件异常/尾部截断时（while 越界 break 丢 IEND），强制补一个空 IEND，
  // 杜绝 Windows 高频原位覆盖后产出无 IEND 的残缺 PNG（部分看图器会拒绝打开）
  if (chunks.length === 0 || chunks[chunks.length - 1].type !== 'IEND') {
    chunks.push({ type: 'IEND', data: Buffer.alloc(0) });
  }

  // 重建 PNG 文件（重新计算每个块的 CRC）
  const parts = [sig];
  for (const chunk of chunks) {
    const typeBuf = Buffer.from(chunk.type, 'latin1');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(chunk.data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, chunk.data])));
    parts.push(lengthBuf, typeBuf, chunk.data, crcBuf);
  }
  return Buffer.concat(parts);
}

// ================= [ 换卡图：内嵌数据 + 校验校准 ] =================
// PNG 协议关键字常量（避免魔法字符串散落）
const CHUNK_TEXt = 'tEXt';
const CHUNK_iTXt = 'iTXt';
const CHUNK_IHDR = 'IHDR';
const CHUNK_IEND = 'IEND';
const CHARA_KEYWORDS = ['chara', 'ccv3'];

// 构建单个 PNG 块（length + type + data + CRC32）
function buildPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'latin1');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

// 判断某块是否为 chara/ccv3 文本数据块
function isCharaChunk(type, data) {
  if (type !== CHUNK_TEXt && type !== CHUNK_iTXt) return false;
  const nullPos = data.indexOf(0);
  if (nullPos <= 0) return false;
  const kw = data.subarray(0, nullPos).toString('latin1');
  return CHARA_KEYWORDS.includes(kw);
}

// 判断是否为 PNG（文件头签名）
function isPNGBuffer(buf) {
  return !!(buf && buf.length >= 8 && buf.readUInt32BE(0) === 0x89504E47);
}

// 将角色卡 JSON 内嵌为 PNG 的 chara 块（插入 IHDR 之后；清理旧 chara/ccv3，避免幽灵数据残留）
function embedCardJSONIntoPNG(pngBuf, cardJson) {
  if (!isPNGBuffer(pngBuf)) return null;

  const base64 = Buffer.from(JSON.stringify(cardJson), 'utf-8').toString('base64');
  const chunkData = Buffer.concat([
    Buffer.from('chara', 'latin1'),
    Buffer.from([0]),
    Buffer.from(base64, 'latin1')
  ]);

  const sig = pngBuf.subarray(0, 8);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= pngBuf.length) {
    const length = pngBuf.readUInt32BE(offset);
    if (offset + 12 + length > pngBuf.length) break;
    const type = pngBuf.subarray(offset + 4, offset + 8).toString('latin1');
    const data = pngBuf.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
  }

  // 去掉旧 chara/ccv3
  const cleaned = chunks.filter(c => !isCharaChunk(c.type, c.data));

  // 插到 IHDR 之后、IDAT 之前（标准位置）
  const ihdrIdx = cleaned.findIndex(c => c.type === CHUNK_IHDR);
  const insertAt = ihdrIdx === -1 ? 0 : ihdrIdx + 1;
  cleaned.splice(insertAt, 0, { type: CHUNK_TEXt, data: chunkData });

  // IEND 兜底
  const last = cleaned[cleaned.length - 1];
  if (!last || last.type !== CHUNK_IEND) cleaned.push({ type: CHUNK_IEND, data: Buffer.alloc(0) });

  const parts = [sig];
  for (const c of cleaned) parts.push(buildPngChunk(c.type, c.data));
  return Buffer.concat(parts);
}

// 自动校准：V1/V2/V3 统一补齐为合法 V2 结构，并清洗空标签
// （注：与前端 cardLoader.js 的 normalizeCardData 思路一致，但本文件为 Node/CJS 环境，
//   无法直接复用浏览器 ESM 模块，故保留独立实现并保持口径一致）
function calibrateCardData(raw) {
  let card = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  if (!card.spec && card.data && typeof card.data === 'object') {
    card.spec = 'chara_card_v2';
    card.spec_version = '2.0';
  } else if (!card.spec && !card.data) {
    card = { spec: 'chara_card_v2', spec_version: '2.0', data: { ...card } };
  }

  if (card.data && typeof card.data === 'object') {
    card.data.tags = Array.isArray(card.data.tags)
      ? Array.from(new Set(card.data.tags.filter(t => typeof t === 'string' && t.trim() !== '').map(t => t.trim())))
      : [];
    card.data.alternate_greetings = Array.isArray(card.data.alternate_greetings)
      ? card.data.alternate_greetings
      : [];
    card.data.extensions = (card.data.extensions && typeof card.data.extensions === 'object')
      ? card.data.extensions
      : {};
  }
  return card;
}

// 提取角色名
function getCardName(card) {
  return String((card && card.data && card.data.name) || (card && card.name) || '').trim();
}

// 校验生成后的 PNG：结构合法 + 内嵌数据可回读
function validateCardPNG(pngBuf) {
  const report = { ok: false, errors: [], warnings: [] };
  if (!isPNGBuffer(pngBuf)) { report.errors.push('不是有效的 PNG 图片'); return report; }

  let card = null;
  try { card = readTavernPNGChunk(pngBuf); } catch (e) { card = null; }
  if (!card) { report.errors.push('内嵌角色卡数据(chara/ccv3)缺失或无法解析'); return report; }

  if (!getCardName(card)) report.warnings.push('角色缺少 name');

  const calibrated = calibrateCardData(card);
  const changed = JSON.stringify(calibrated) !== JSON.stringify(card);
  if (changed) report.warnings.push('结构已自动校准（补齐 spec/data 及缺失数组字段、清洗空标签）');

  report.ok = report.errors.length === 0;
  report.card = calibrated;
  report.calibrated = changed;
  return report;
}

// 读取 PNG 内嵌 chara/ccv3 数据块的 JSON（扫描阶段调用，避免整图跨 IPC 搬运）
// 与 writeTavernPNGChunk 对称；buffer 可为文件头截断段（chara 块位于 IHDR 之后、IDAT 之前）
// 注：按 tEXt（keyword\0 + Base64）标准结构提取；异常 iTXt/损坏块返回 null，由前端回退完整 readBuffer 解析，绝不漏卡
function readTavernPNGChunk(buffer) {
  if (!buffer || buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504E47) return null;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (offset + 12 + length > buffer.length) break; // 越界/截断保护
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt' || type === 'iTXt') {
      const nullPos = data.indexOf(0);
      if (nullPos > 0) {
        const keyword = data.subarray(0, nullPos).toString('latin1');
        if (keyword === 'chara' || keyword === 'ccv3') {
          const raw = data.subarray(nullPos + 1); // 跳过 keyword\0
          const base64Str = raw.toString('latin1').replace(/\0/g, '');
          try {
            return JSON.parse(Buffer.from(base64Str, 'base64').toString('utf-8'));
          } catch (e) { return null; }
        }
      }
    }
    offset += 12 + length;
  }
  return null;
}

// 系统级应用数据目录（用于保存配置，不会随项目丢失）
const configPath = path.join(app.getPath('userData'), 'tavern_manager_config.json');

// 【统一持久化中枢】app_config.json 作为全软件 UI/全局状态的唯一权威物理文件。
// 原子写入：先写临时文件再 rename，防止写入中途崩溃导致配置损坏/丢失。
const APP_CONFIG_PATH = path.join(app.getPath('userData'), 'app_config.json');

// 原子写 JSON 配置文件（写临时文件 + rename 原子替换，绝不在原文件上直接覆盖）
function atomicWriteJson(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ================= [ 📸 快照配置持久化：跨重启记住「是否启用自动快照」 ] =================
// app_config.json 的 ui.snapshotConfig 是权威源（前端恢复后经 IPC 同步覆盖）；
// 此处单独落盘作为主进程启动早期兜底，双源在正常流程下保持一致。
const SNAPSHOT_CONFIG_PATH = path.join(app.getPath('userData'), 'snapshot_config.json');

function loadSnapshotConfig() {
  try {
    if (fs.existsSync(SNAPSHOT_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(SNAPSHOT_CONFIG_PATH, 'utf-8'));
      if (saved && typeof saved === 'object') {
        if (typeof saved.enabled === 'boolean') snapshotConfig.enabled = saved.enabled;
        const interval = Number(saved.intervalMinutes);
        if (!Number.isNaN(interval) && interval >= 0) snapshotConfig.intervalMinutes = interval;
        const max = Number(saved.maxSnapshots);
        if (!Number.isNaN(max) && max >= 0) snapshotConfig.maxSnapshots = max;
      }
    }
  } catch (e) { /* 读取失败时保留默认值 */ }
}

function saveSnapshotConfig() {
  try {
    atomicWriteJson(SNAPSHOT_CONFIG_PATH, snapshotConfig);
  } catch (e) { /* 写盘失败忽略 */ }
}

// 启动即加载，确保主进程从第一刻起就记住用户「关闭自动快照」的选择（前端 IPC 同步前兜底）
loadSnapshotConfig();

// ================= 路径安全白名单 =================
// 所有涉及任意 filePath 的 IPC handler 必须先过 isPathAllowed 校验，
// 防止渲染层被注入脚本后越权读写/删除白名单外的任意本地文件。
// 安全根目录集合：用户已选定的卡片库 + 世界书目录 + 酒馆根 + 全盘扫描过的根 + userData
const allowedRoots = new Set();
function addAllowedRoot(p) {
  try { if (p && typeof p === 'string') allowedRoots.add(path.resolve(p)); } catch (e) { /* 忽略非法路径 */ }
}
function isPathAllowed(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  let resolved;
  try {
    resolved = path.resolve(filePath);
  } catch (e) {
    return false;
  }
  // userData（配置/备份/回收站）总允许
  try {
    const ud = path.resolve(app.getPath('userData'));
    if (resolved === ud || resolved.startsWith(ud + path.sep)) return true;
  } catch (e) { /* 忽略 */ }
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}
// 给渲染进程一个统一的拒绝返回体，方便前端识别
function forbidden() {
  return { success: false, error: '路径越界，操作被拒绝' };
}

// ================= Vite 构建双模式 =================
// 开发模式：VITE_DEV_SERVER_URL 指向 Vite Dev Server（支持热更新）
// 生产模式：app:// 协议加载 web/ 目录下的 Vite 构建产物
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const appRoot = isDev ? __dirname : path.join(__dirname, 'web');

// 将自定义协议注册为特权协议（必须在 app ready 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    // standard + secure：使 app:// 形成可持久化的 origin（否则 localStorage 每次重启丢失），
    // 并保持安全上下文以使用 localStorage 等 Web API
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: 'local-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

/**
 * 注册自定义协议
 * - app://        -> 项目根目录下的文件（页面、JS、CSS）
 * - local-file:// -> 磁盘上的任意本地文件（仅用于展示本地立绘图片）
 */
function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // standard scheme 下页面 origin 为 app://index.html，其相对资源形如 app://index.html/css/style.css
    // （host 恒为 index.html，pathname 为项目根下的相对路径）；极少数跨 host 场景按 host 首段拼接
    const host = url.hostname;
    let filePath = '';
    if (host === 'index.html') {
      filePath = url.pathname; // 页面 origin 内的资源：app://index.html/vendor/x.js -> /vendor/x.js
    } else if (host) {
      filePath = '/' + host + url.pathname;
    } else {
      filePath = url.pathname;
    }
    filePath = decodeURIComponent(filePath);

    // 根路径默认加载 index.html
    if (filePath === '/' || filePath === '') filePath = '/index.html';

    const resolved = path.normalize(path.join(appRoot, filePath));

    // 安全校验：确保解析后的路径始终位于应用根目录内（防止路径穿越）
    // 【修复】必须追加 path.sep，否则 "C:\App_Hacked".startsWith("C:\App") 会误判合法，导致跨目录越权读取
    const rootPrefix = appRoot + path.sep;
    if (resolved !== appRoot && !resolved.startsWith(rootPrefix)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 直接以 fs 读取本地文件返回（比 net.fetch(file://) 更兼容 standard scheme）
    try {
      const content = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.ico': 'image/x-icon'
      }[ext] || 'application/octet-stream';
      return new Response(content, { headers: { 'content-type': mime } });
    } catch (e) {
      console.error('[app-proto] 读取失败:', request.url, '->', resolved, e.message);
      return new Response('Not Found', { status: 404 });
    }
  });

  protocol.handle('local-file', (request) => {
    const url = new URL(request.url);
    // 路径通过查询参数传递（如 local-file://img/?path=E:\...），
    // 避免 Windows 盘符冒号被 URL 规范化当作端口剥离
    const filePath = url.searchParams.get('path');
    // 【安全加固】仅放行白名单内的本地文件（防 XSS 后借 local-file:// 越权读取任意文件）
    if (!isPathAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true, // 隐藏顶部菜单栏
    show: false, // 初始隐藏视窗，防止加载完成前出现白屏/错乱闪烁
    backgroundColor: '#09090b', // 背景色与暗色主题一致，防白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 安全桥梁
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 通过自定义协议加载页面（生产加载 web/ 构建产物；开发加载 Vite Dev Server）
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadURL('app://index.html');
  }

  // 🔒 安全加固：禁止非 app:// 的一切导航（含拖放文件触发的 file:// 导航）与任何弹窗，
  // 防止图片/文件被误交给系统默认程序打开（如系统英文图片查看器）
  // 开发模式下放行 Vite Dev Server 地址
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('app://') || url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173');
    if (!allowed) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // DOM 与 CSS 完全就绪后再显示视窗，杜绝启动闪烁
  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

// ================= [ 底层极速扫描引擎：并发递归遍历盘符/文件夹 (V2) ] =================
// ⚠️ 扩展超级黑名单：跳过各种含有海量无用 PNG 的软件缓存、游戏资源和系统目录
const skipFolders = [
    '.git', 'node_modules', 'windows', 'program files', 'program files (x86)', 
    'appdata', 'system volume information', '$recycle.bin', 'programdata', 
    'temp', 'cache', 'caches', 'logs', 'steamapps', 'tencent files'
];

// 角色卡 PNG 因内嵌设定代码（Base64 JSON），体积几乎不可能小于 40KB；
// 小于该值极大概率是图标/UI 贴图等垃圾文件，在解析前直接丢弃（体积拦截）
const MIN_CARD_FILE_SIZE = 40960;

// 递归扫描核心引擎（目录串行递归 + 文件批并发，彻底避免 EMFILE 句柄爆炸崩溃）
async function scanDirectoryForCards(dirPath, event, progressState = { count: 0 }, useSizeFilter = false) {
    try {
        // 读取当前目录下的所有文件和文件夹对象
        const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const results = [];

        // 1. 子目录：串行递归（保证任意时刻并发深度为 1，杜绝 EMFILE）
        for (const file of files) {
            if (!file.isDirectory()) continue;
            if (file.name.startsWith('.')) continue;
            const lowerName = file.name.toLowerCase();
            // 精准匹配黑名单（'cache'/'temp'/'caches' 等已在列表中），避免误杀含关键词的正常文件夹
            if (skipFolders.includes(lowerName)) continue;
            const subResults = await scanDirectoryForCards(path.join(dirPath, file.name), event, progressState, useSizeFilter);
            results.push(...subResults);
        }

        // 2. 文件：分批并发收集（单批上限 64，兼顾 SSD 并行与文件句柄安全）
        const fileEntries = files.filter(f => f.isFile());
        const BATCH = 64;
        for (let i = 0; i < fileEntries.length; i += BATCH) {
            const batch = fileEntries.slice(i, i + BATCH);
            const batchResults = await Promise.all(batch.map(async (file) => {
                // 跳过隐藏文件
                if (file.name.startsWith('.')) return [];

                const fullPath = path.join(dirPath, file.name);
                const ext = path.extname(file.name).toLowerCase();
                // 白名单：PNG / WebP / JSON 角色卡全部放行
                if (ext !== '.png' && ext !== '.webp' && ext !== '.json') return [];

                // 体积拦截：仅当开关开启时，过滤过小的图片（PNG/WebP；JSON 不限制，卡片 JSON 可能本来就小）
                if (useSizeFilter && (ext === '.png' || ext === '.webp')) {
                    try {
                        const stats = await fs.promises.stat(fullPath);
                        if (stats.size < MIN_CARD_FILE_SIZE) return []; // 小于 40KB 直接抛弃
                    } catch (e) {
                        return []; // stat 失败（文件被占用等）也直接抛弃
                    }
                }

                progressState.count++;
                // 降低通信频率：每找到 100 张卡片才给前端发一次进度，防止主进程阻塞
                if (progressState.count % 100 === 0) {
                    event.sender.send('scan-progress', { 
                        status: `🚀 极速检索中... 已发现 ${progressState.count} 个目标文件`, 
                        count: progressState.count 
                    });
                }
                return [fullPath];
            }));
            for (const r of batchResults) results.push(...r);
        }

        return results;

    } catch (err) {
        // 静默处理权限不足 (EPERM) 或系统锁定文件夹
        return [];
    }
}

app.whenReady().then(() => {
  registerAppProtocol();

  // 【安全加固】仅生产模式注入 CSP（纵深防御兜底）：开发模式走 Vite Dev Server
  // (http://localhost:5173)，HMR 依赖 ws:// 连接，无条件注入 connect-src 'self'
  // 会挡掉 ws:// 导致热更新失效，故仅在 !isDev 下注册该拦截器。
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' app: local-file:; " +
            "img-src 'self' app: local-file: data: blob:; " +   // 不放行 http(s) 外联图(防追踪像素/内网探测)
            "style-src 'self' app: 'unsafe-inline'; " +          // Vue/Tailwind 运行时内联样式所需
            "script-src 'self' app:; " +
            "font-src 'self' app: data:; " +
            "connect-src 'self' http: https: ws: wss:"           // 聊天测卡需连用户自定义 API 地址，无法进一步收紧
          ]
        }
      });
    });
  }

  createWindow();

  // IPC：打开文件夹弹窗并扫描
  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择角色卡所在的文件夹'
    });

    if (canceled || filePaths.length === 0) return null;
    return scanAndSaveFolder(filePaths[0]);
  });

  // IPC：启动时加载上一次的文件夹配置
  ipcMain.handle('config:load', () => {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.lastFolder && fs.existsSync(config.lastFolder)) {
          return scanAndSaveFolder(config.lastFolder);
        }
      }
    } catch (e) {
      console.error('读取配置失败', e);
    }
    return null;
  });

  // IPC：重新扫描当前角色卡库目录（刷新按钮用，无需重新弹出目录选择框）
  // 安全契约：folderPath 必须已在白名单内（即用户此前通过选择目录/启动加载确认过的库），
  // 否则拒绝，避免被注入脚本利用来枚举任意磁盘目录。
  ipcMain.handle('library:rescan', async (event, folderPath) => {
    try {
      if (!folderPath || typeof folderPath !== 'string') {
        return { folderPath: null, files: [], error: '未指定库目录' };
      }
      if (!isPathAllowed(folderPath)) return forbidden();
      if (!fs.existsSync(folderPath)) {
        return { folderPath: null, files: [], error: '库目录不存在，请重新打开角色库目录。' };
      }
      return scanAndSaveFolder(folderPath);
    } catch (e) {
      return { folderPath: null, files: [], error: e.message };
    }
  });

  // 📁 物理新建分组文件夹（在库目录下创建子文件夹，白名单校验）
  ipcMain.handle('fs:createGroupFolder', async (event, { libraryPath, groupName } = {}) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      const safeGroupName = String(groupName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!safeGroupName) return { success: false, error: '分组名无效' };
      const targetPath = path.join(libraryPath, safeGroupName);
      if (!isPathAllowed(targetPath)) return forbidden();
      if (!fs.existsSync(targetPath)) {
        await fs.promises.mkdir(targetPath, { recursive: true });
      }
      return { success: true, folderName: safeGroupName, path: targetPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 📁 物理重命名分组文件夹（同步迁移子文件夹内所有卡片的物理路径）
  ipcMain.handle('fs:renameGroupFolder', async (event, { libraryPath, oldName, newName } = {}) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      const oldPath = path.join(libraryPath, String(oldName || ''));
      const safeNewName = String(newName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!safeNewName) return { success: false, error: '新分组名无效' };
      const newPath = path.join(libraryPath, safeNewName);
      if (!isPathAllowed(oldPath) || !isPathAllowed(newPath)) return forbidden();
      if (fs.existsSync(oldPath)) {
        await fs.promises.rename(oldPath, newPath);
      } else {
        await fs.promises.mkdir(newPath, { recursive: true });
      }
      return { success: true, newName: safeNewName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 📁 物理移动卡片文件到目标分组文件夹（目标为根/未分类时移回库根）
  ipcMain.handle('fs:moveCardToGroup', async (event, { libraryPath, cardPath, targetGroup } = {}) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      if (!cardPath || typeof cardPath !== 'string' || !isPathAllowed(cardPath)) return forbidden();
      // 只处理库目录内的卡片（外部全盘扫描/收编的卡先收编入库，避免跨盘 EXDEV 移动失败）
      const libRoot = path.resolve(libraryPath);
      if (!path.resolve(cardPath).startsWith(libRoot + path.sep)) {
        return { success: false, error: '该卡片不在当前库目录内，请先将其收编到库目录再移动分组。' };
      }
      const isRootTarget = !targetGroup || targetGroup === '未分类' || targetGroup === '全部' || targetGroup === 'all';
      const targetGroupDir = isRootTarget
        ? libraryPath
        : path.join(libraryPath, String(targetGroup).replace(/[\\/:*?"<>|]/g, '_').trim());
      if (!isPathAllowed(targetGroupDir)) return forbidden();
      if (!fs.existsSync(targetGroupDir)) {
        await fs.promises.mkdir(targetGroupDir, { recursive: true });
      }
      const fileName = path.basename(cardPath);
      const destPath = path.join(targetGroupDir, fileName);
      if (path.resolve(cardPath) !== path.resolve(destPath)) {
        if (fs.existsSync(destPath)) {
          // 目标同名已存在：追加时间戳后缀，绝不覆盖原文件
          const ext = path.extname(fileName);
          const base = path.basename(fileName, ext);
          const destPath2 = path.join(targetGroupDir, `${base}_移动_${Date.now()}${ext}`);
          await fs.promises.rename(cardPath, destPath2);
          return { success: true, newFilePath: destPath2, newSubFolder: isRootTarget ? '' : String(targetGroup) };
        }
        await fs.promises.rename(cardPath, destPath);
      }
      return { success: true, newFilePath: destPath, newSubFolder: isRootTarget ? '' : String(targetGroup) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 🧹 删除空分组文件夹（仅当文件夹为空时删除，绝不误删有卡片的目录；删除卡片后自动清理空分组用）
  ipcMain.handle('fs:deleteEmptyGroupFolder', async (event, { libraryPath, groupName } = {}) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      const safeName = String(groupName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      if (!safeName) return { success: false, error: '分组名无效' };
      const dirPath = path.join(libraryPath, safeName);
      if (!isPathAllowed(dirPath)) return forbidden();
      if (!fs.existsSync(dirPath)) return { success: true, notExist: true };
      // 只允许删除空目录（存在卡片或其他文件时拒绝，防止误删用户数据）
      const items = await fs.promises.readdir(dirPath);
      if (items.length > 0) return { success: false, error: '文件夹非空，无法自动删除' };
      await fs.promises.rmdir(dirPath);
      return { success: true, deleted: safeName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // IPC：读取全局标签库（userData/tavern_manager_config.json 的 globalTags 字段）
  // ⚠️ 必须用主进程配置文件而非 localStorage：dev(localhost) 与生产(app://) 是不同 origin，localStorage 互不共享
  ipcMain.handle('config:getGlobalTags', () => {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(config.globalTags)) return config.globalTags;
      }
    } catch (e) {
      console.error('读取全局标签配置失败', e);
    }
    return null;
  });

  // IPC：保存全局标签库（合并写入 userData/tavern_manager_config.json 的 globalTags 字段）
  ipcMain.handle('config:saveGlobalTags', (event, tags) => {
    try {
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { config = {}; }
      }
      config.globalTags = Array.isArray(tags) ? tags : [];
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      console.error('保存全局标签配置失败', e);
      return { success: false, error: e.message };
    }
  });

  // ==========================================
  // 🎛️ 通用 UI 状态持久化（分组/语言/卡片分类等）
  // 【修复】生产模式 app:// 的 localStorage 不持久（Chromium 对 custom scheme
  // 的 localStorage 不落盘，实测重启后丢失），故关键 UI 状态改存主进程配置文件。
  // ==========================================
  ipcMain.handle('config:getUiSettings', () => {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config.uiSettings || {};
      }
    } catch (e) { console.error('读取 UI 设置失败', e); }
    return {};
  });

  // 合并保存通用 UI 状态（增量合并，避免覆盖其他字段）
  ipcMain.handle('config:saveUiSettings', (event, settings) => {
    try {
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { config = {}; }
      }
      config.uiSettings = { ...(config.uiSettings || {}), ...(settings || {}) };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ==========================================
  // 🛡️ 统一持久化中枢（app_config.json 最高权威）
  // 全软件所有全局状态（语言/分组/全局标签池/卡片覆盖层/API Key 等）
  // 统一经 sys:saveConfig 原子写入 app_config.json；sys:loadConfig 全量读取。
  // ⚠️ 历史兼容：旧版 tavern_manager_config.json 的 globalTags / uiSettings
  //    会在首次读取时自动合并迁移，绝不丢数据。
  // ==========================================
  ipcMain.handle('sys:loadConfig', () => {
    try {
      if (fs.existsSync(APP_CONFIG_PATH)) {
        const raw = fs.readFileSync(APP_CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
      }
    } catch (e) {
      console.error('读取全局物理配置失败:', e);
    }
    // 首次使用：合并迁移旧版配置文件中的 globalTags / uiSettings，保证历史数据不丢
    try {
      const legacy = {};
      if (fs.existsSync(configPath)) {
        const old = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(old.globalTags)) legacy.globalTags = old.globalTags;
        if (old.uiSettings && typeof old.uiSettings === 'object') legacy.uiSettings = old.uiSettings;
        if (legacy.globalTags || legacy.uiSettings) {
          atomicWriteJson(APP_CONFIG_PATH, legacy); // 一次性迁移落盘
        }
      }
      return legacy;
    } catch (e) {
      console.error('迁移旧配置失败:', e);
    }
    return {};
  });

  // 安全写入配置（全量原子替换；渲染层必须传入完整对象）
  ipcMain.handle('sys:saveConfig', (event, configData) => {
    try {
      atomicWriteJson(APP_CONFIG_PATH, (configData && typeof configData === 'object') ? configData : {});
      return { success: true };
    } catch (e) {
      console.error('写入全局物理配置失败:', e);
      return { success: false, error: e.message };
    }
  });

  // IPC：读取单个文件内容（返回二进制 Buffer；异步化防大图卡主进程消息循环）
  ipcMain.handle('file:readBuffer', async (event, filePath) => {
    if (!isPathAllowed(filePath)) return forbidden();
    return fs.promises.readFile(filePath);
  });

  // IPC：读取单个文件文本（用于 JSON 卡片；异步化）
  ipcMain.handle('file:readText', async (event, filePath) => {
    if (!isPathAllowed(filePath)) return forbidden();
    return fs.promises.readFile(filePath, 'utf-8');
  });

  // IPC：获取所有存在的盘符 (Windows 专属 C:, D:, E: ...)
  ipcMain.handle('get-windows-drives', async () => {
    const drives = [];
    for (let i = 67; i <= 90; i++) { // 从 C (67) 遍历到 Z (90)
      const drive = String.fromCharCode(i) + ':' + '\\';
      try {
        await fs.promises.access(drive, fs.constants.R_OK);
        drives.push(drive);
      } catch (e) { /* 盘符不存在 */ }
    }
    return drives;
  });

  // IPC：指定文件夹/盘符扫描（未传路径时弹出原生文件夹选择器；useSizeFilter 控制体积过滤开关）
  ipcMain.handle('scan-target-folder', async (event, targetPath, useSizeFilter) => {
    let folderToScan = targetPath;
    let trustedByDialog = false;

    // 没有传入路径 → 弹出原生文件夹选择器（系统对话框需真实用户点击，天然可信）
    if (!folderToScan) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择要扫描的磁盘或文件夹'
      });
      if (result.canceled || result.filePaths.length === 0) return [];
      folderToScan = result.filePaths[0];
      trustedByDialog = true;
    } else {
      // 【安全修复】直接传入路径的唯一合法场景是「点击盘符按钮扫描整个磁盘」：
      // 严格限定为纯盘符格式（如 C: 或 C:\），拒绝任意子目录字符串，
      // 防止脚本借 scan-target-folder 传任意路径实现白名单自扩权
      if (!/^[A-Za-z]:\\?$/.test(folderToScan)) {
        return { path: null, files: [], error: '非法路径参数' };
      }
      trustedByDialog = true; // 盘符格式已收紧，视为可信授权
    }

    // 【安全修复】仅可信来源（真实对话框 或 合法纯盘符）才加入白名单
    if (trustedByDialog) addAllowedRoot(folderToScan);

    event.sender.send('scan-progress', { status: `正在急速遍历: ${folderToScan}`, count: 0 });
    // 将 useSizeFilter 传递给扫描引擎
    const cardFiles = await scanDirectoryForCards(folderToScan, event, { count: 0 }, useSizeFilter);
    return { path: folderToScan, files: cardFiles };
  });

  // IPC：唤起系统资源管理器打开指定路径（.bak_history / .trash 等）
  ipcMain.handle('system:openPath', async (event, targetPath) => {
    try {
      if (!targetPath) return { success: false, error: '路径为空。' };
      // 相对路径转为绝对路径（相对项目根目录）；绝对路径原样使用
      const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);
      // 【安全加固】仅放行白名单内的路径（库内 .bak_history/.trash 与 userData 均已在白名单）
      if (!isPathAllowed(fullPath)) return forbidden();
      // 目录不存在则自动创建（防御：仅当非文件路径时自动建目录，避免把 "1.png" 这类文件路径误建成文件夹）
      if (!fs.existsSync(fullPath) && !path.extname(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
      // 【修复】安全化：目录用 openPath 直接打开窗口；文件一律用 showItemInFolder 高亮定位，绝不执行（防恶意 .exe/.bat 被 openPath 运行）
      let isDir = false;
      try { isDir = fs.statSync(fullPath).isDirectory(); } catch (e) { /* 路径不存在或无法读取 */ }
      if (isDir) {
        const err = await shell.openPath(fullPath);
        return err ? { success: false, error: err } : { success: true };
      }
      shell.showItemInFolder(fullPath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC：推送角色卡到酒馆（经主进程以 multipart/form-data 上传，绕过渲染进程 CORS 限制）
  // 酒馆导入端点：POST {tavernUrl}/api/characters/import，字段名 avatar
  ipcMain.handle('tavern:push', async (event, { tavernUrl, cardPath, cardName, apiKey }) => {
    try {
      const baseUrl = String(tavernUrl || '').trim().replace(/\/+$/, '');
      if (!baseUrl) return { success: false, error: '酒馆地址为空' };
      // 【安全加固】源卡片必须在白名单内
      if (!isPathAllowed(cardPath)) return forbidden();
      if (!cardPath || !fs.existsSync(cardPath)) return { success: false, error: '卡片文件不存在: ' + cardPath };

      const importUrl = baseUrl + '/api/characters/import';
      const fileBuf = fs.readFileSync(cardPath);
      const blob = new Blob([fileBuf]);
      const form = new FormData();
      // 用卡片名作为上传文件名（保留原扩展名），酒馆导入后即为该角色名
      const ext = path.extname(cardPath) || '.png';
      const safeName = String(cardName || path.basename(cardPath, ext) || 'card').replace(/[\\/:*?"<>|]/g, '_');
      form.append('avatar', blob, safeName + ext);

      // 若酒馆设置了 API 密码，需携带 Bearer 鉴权
      const headers = {};
      if (apiKey && apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

      const response = await fetch(importUrl, { method: 'POST', headers, body: form });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 403) {
          return { success: false, error: 'HTTP 403 Forbidden：请确认酒馆已开启 API 扩展（设置 → Extensions → API → 启用），并检查 API 密码是否正确。' };
        }
        return { success: false, error: `HTTP ${response.status}: ${String(text).slice(0, 300)}` };
      }
      const text = await response.text();
      return { success: true, data: text };
    } catch (e) {
      console.error('推送酒馆失败:', e);
      return { success: false, error: e.message };
    }
  });

  // IPC：酒馆路径智能嗅探（遍历常见位置，通过 server.js + public 指纹验证）
  ipcMain.handle('tavern:autoDetectPath', async () => {
    const homeDir = os.homedir(); // 当前用户家目录 (C:\Users\Username)

    // 罗列绝大多数用户习惯放置酒馆的常见路径
    const candidatePaths = [
      path.join(homeDir, 'Desktop', 'SillyTavern'),
      path.join(homeDir, 'Desktop', 'SillyTavern-main'),
      path.join(homeDir, 'Downloads', 'SillyTavern'),
      path.join(homeDir, 'Downloads', 'SillyTavern-main'),
      path.join(homeDir, 'Documents', 'SillyTavern'),
      path.join(homeDir, 'Documents', 'SillyTavern-main'),
      'C:\\SillyTavern',
      'D:\\SillyTavern',
      'E:\\SillyTavern'
    ];

    // 遍历路径，通过“指纹文件”验证是否真的是酒馆目录
    for (const testPath of candidatePaths) {
      try {
        // 酒馆目录的独特特征：根目录下一定有 server.js 并且有 public 文件夹
        const hasServerJs = fs.existsSync(path.join(testPath, 'server.js'));
        const hasPublicDir = fs.existsSync(path.join(testPath, 'public'));
        if (hasServerJs && hasPublicDir) {
          // 【安全加固】探测到的酒馆根目录加入白名单（pushDir 直推用）
          addAllowedRoot(testPath);
          console.log('✅ 智能嗅探到酒馆路径:', testPath);
          return testPath;
        }
      } catch (e) {
        // 忽略没有权限访问的文件夹报错
        continue;
      }
    }
    return null; // 未找到
  });

  // IPC：通用选择文件夹对话框（用于绑定酒馆本地根目录）
  ipcMain.handle('dialog:selectGenericFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 SillyTavern (酒馆) 根目录'
    });
    if (canceled || filePaths.length === 0) return null;
    // 【安全加固】用户选定的酒馆根目录加入白名单
    addAllowedRoot(filePaths[0]);
    return filePaths[0]; // 只返回纯字符串路径
  });

  // IPC：物理跨目录拷贝卡片到酒馆 characters 目录（本地直推，无需 API / 无 CORS / 无 403）
  ipcMain.handle('tavern:pushDir', async (event, sourcePaths, stRootPath) => {
    try {
      // 【安全修复】不再无条件 addAllowedRoot(stRootPath)：
      // ① 已在白名单（本次会话经 dialog:selectGenericFolder / autoDetectPath 真实来源加入）→ 直接通过
      // ② 未在白名单（如重启后从持久化设置读取的酒馆路径）→ 必须通过酒馆指纹验证
      //    （server.js + public 目录同时存在）才信任并加入白名单，堵死任意路径自扩权后门
      if (!isPathAllowed(stRootPath)) {
        const hasServerJs = fs.existsSync(path.join(stRootPath, 'server.js'));
        const hasPublicDir = fs.existsSync(path.join(stRootPath, 'public'));
        if (!hasServerJs || !hasPublicDir) return forbidden();
        addAllowedRoot(stRootPath);
      }
      for (const src of (Array.isArray(sourcePaths) ? sourcePaths : [])) {
        if (!isPathAllowed(src)) return forbidden();
      }
      if (!fs.existsSync(stRootPath)) return { success: false, error: '无效的酒馆根目录路径' };

      // 智能兼容：新版酒馆(多用户结构) 和 老版酒馆 的角色存储路径
      const newDataDir = path.join(stRootPath, 'data', 'default-user', 'characters');
      const oldDataDir = path.join(stRootPath, 'public', 'characters');

      let targetDir = '';
      if (fs.existsSync(newDataDir)) targetDir = newDataDir;
      else if (fs.existsSync(oldDataDir)) targetDir = oldDataDir;
      else return { success: false, error: '未找到 characters 文件夹，请确认选择的是 SillyTavern 根目录！' };

      let count = 0;
      for (const src of (Array.isArray(sourcePaths) ? sourcePaths : [])) {
        if (fs.existsSync(src)) {
          const fileName = path.basename(src);
          const dest = path.join(targetDir, fileName);
          // 强制覆盖同名卡片，实现更新效果
          fs.copyFileSync(src, dest);
          count++;
        }
      }
      return { success: true, count };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC：原生消息对话框（替代 alert）
  ipcMain.handle('dialog:showMessage', async (event, options) => {
    return await dialog.showMessageBox(options);
  });

  // IPC：系统级拖拽复制文件到库
  ipcMain.handle('file:copyToLibrary', (event, sourcePaths, targetFolder) => {
    const copiedFiles = [];
    // 【安全加固】目标必须落在白名单内（卡片库）；源为拖拽授权，不做限制
    if (!isPathAllowed(targetFolder)) return copiedFiles;
    for (const src of sourcePaths) {
      try {
        // 确保拖入的是支持的文件格式
        if (!src.match(/\.(png|webp|json)$/i)) continue;

        const fileName = path.basename(src);
        const dest = path.join(targetFolder, fileName);

        // 如果目标文件夹中没有同名文件，则进行复制
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          copiedFiles.push(dest);
        }
      } catch (e) {
        console.error('复制文件失败:', e);
      }
    }
    return copiedFiles; // 返回成功复制的文件路径数组
  });

  // ==========================================
  // 🚀 全盘检索专属：外部卡片强行收编引擎
  // 全盘扫描找到的卡片可能散布在白名单之外的任意磁盘角落，
  // 该通道只校验【目标】必须是白名单内的卡片库，源路径为检索结果不校验。
  // ⚠️ 安全增强：同名文件跳过（绝不覆盖已有卡片）；格式白名单 + 目标白名单双重拦截。
  // ==========================================
  ipcMain.handle('sys:importExternalCards', async (event, sourceFiles, destFolder) => {
    try {
      // 1. 严格校验目标文件夹（必须是白名单内的卡片库）
      if (!isPathAllowed(destFolder)) {
        throw new Error('安全拦截：目标导入路径不在合法的卡片库范围内！');
      }
      // 2. 确保目标文件夹存在
      if (!fs.existsSync(destFolder) || !fs.statSync(destFolder).isDirectory()) {
        throw new Error('目标导入文件夹不存在或不是目录！');
      }

      const copiedList = [];
      const skippedList = [];

      for (const file of sourceFiles) {
        // 兼容全盘扫描返回的对象 { path: '...' } 或纯字符串
        const srcPath = (typeof file === 'string' ? file : (file && file.path)) || '';
        if (!srcPath) continue;
        // 源路径存在性检查（不存在/被占用则跳过，不中断整体）
        try {
          if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) continue;
        } catch (e) { continue; }

        const fileName = path.basename(srcPath);
        // 格式白名单（与全盘扫描/拖拽一致）
        if (!/\.(png|webp|json)$/i.test(fileName)) continue;

        const destPath = path.join(destFolder, fileName);
        // 同名文件跳过（绝不覆盖用户已有卡片），记录到 skippedList 便于前端提示
        if (fs.existsSync(destPath)) {
          skippedList.push(fileName);
          continue;
        }

        // 3. 执行物理拷贝（源路径为全盘检索结果，属用户主动授权，不做白名单限制）
        fs.copyFileSync(srcPath, destPath);
        copiedList.push(destPath);
      }

      return { success: true, copied: copiedList, skipped: skippedList };
    } catch (err) {
      console.error('收编外部卡片失败:', err);
      return { success: false, error: err.message };
    }
  });

  // 📸 快照配置更新（设置面板动态更新开关/冷却/最大保留数）
  ipcMain.handle('settings:updateSnapshotConfig', (event, config) => {
    if (config && typeof config === 'object') {
      if (typeof config.enabled === 'boolean') snapshotConfig.enabled = config.enabled;
      const interval = Number(config.intervalMinutes);
      if (!Number.isNaN(interval) && interval >= 0) snapshotConfig.intervalMinutes = interval;
      const max = Number(config.maxSnapshots);
      if (!Number.isNaN(max) && max >= 0) snapshotConfig.maxSnapshots = max;
    }
    saveSnapshotConfig(); // 🔧 持久化，避免重启后回到默认 true
    return { success: true, config: snapshotConfig };
  });

  // 📸 换角色卡图：选择新立绘，内嵌原卡数据，校验 + 自动校准后落盘
  ipcMain.handle('card:replaceImage', async (event, { cardPath, cardJson } = {}) => {
    try {
      if (!cardPath || typeof cardPath !== 'string' || !isPathAllowed(cardPath)) return forbidden();
      if (!fs.existsSync(cardPath)) return { success: false, error: '卡片文件不存在: ' + cardPath };

      // 1. 弹窗选择新图片（用户对话框选择，天然可信）
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: '选择新的角色立绘图片',
        filters: [{ name: '图片', extensions: ['png', 'webp', 'jpg', 'jpeg'] }]
      });
      if (canceled || filePaths.length === 0) return { success: false, error: '用户取消操作' };
      const newImagePath = filePaths[0];
      addAllowedRoot(path.dirname(newImagePath));

      // 2. 读取新图；非 PNG 先转 PNG
      let imageBuf = await fs.promises.readFile(newImagePath);
      if (!isPNGBuffer(imageBuf)) {
        if (!sharp) return { success: false, error: '新图为非 PNG 格式，需先 `npm install sharp` 以支持格式转换。' };
        imageBuf = await sharp(imageBuf).png().toBuffer();
      }

      // 3. 卡片数据：优先用前端传入；否则从原文件回读（PNG 内嵌 / JSON 纯文本）
      let card = (cardJson && typeof cardJson === 'object') ? cardJson : null;
      if (!card) {
        try {
          const srcBuf = await fs.promises.readFile(cardPath);
          if (isPNGBuffer(srcBuf)) card = readTavernPNGChunk(srcBuf);
          else if (/\.json$/i.test(cardPath)) card = JSON.parse(srcBuf.toString('utf-8'));
        } catch (e) { /* 忽略 */ }
      }
      if (!card) return { success: false, error: '无法获取卡片数据，请先打开该卡片再换图。' };

      // 4. 自动校准
      const calibrated = calibrateCardData(card);

      // 5. 内嵌 + 生成 PNG，并往返校验
      const outBuf = embedCardJSONIntoPNG(imageBuf, calibrated);
      if (!outBuf) return { success: false, error: '新图片无法写入角色卡数据。' };

      const report = validateCardPNG(outBuf);
      if (!report.ok) return { success: false, error: '校验失败：' + report.errors.join('；') };

      // 6. 目标路径：PNG 就地覆盖；webp/json 升级为同名 .png
      const ext = path.extname(cardPath).toLowerCase();
      const targetPath = ext === '.png' ? cardPath : cardPath.slice(0, -ext.length) + '.png';

      // 7. 写前手动备份原卡（.bak_history），再原子写入
      if (targetPath === cardPath) {
        await processCardSnapshot(cardPath, true);
      }
      const tmpPath = targetPath + '.tmp';
      await fs.promises.writeFile(tmpPath, outBuf);
      await fs.promises.rename(tmpPath, targetPath);

      // 8. webp/json 升级后删除旧文件，避免刷新时误扫成重复卡片
      if (targetPath !== cardPath && fs.existsSync(cardPath)) {
        try { await fs.promises.unlink(cardPath); } catch (e) { /* 忽略 */ }
      }

      const message = ['✅ 换卡图成功' + (report.calibrated ? '（已自动校准）' : '')]
        .concat((report.warnings || []).map(w => '⚠ ' + w))
        .join('\n');

      return {
        success: true,
        newPath: targetPath,
        oldPath: cardPath,
        format: 'png',
        calibrated: report.calibrated,
        warnings: report.warnings || [],
        message
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 📸 手动创建快照（绕过冷却节流阀，立即为指定卡片备份当前状态）
  ipcMain.handle('card:createManualSnapshot', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath)) return forbidden();
    return await processCardSnapshot(filePath, true);
  });

  // 📸 列出指定卡片的历史快照（.bak_history/baseName_*，按时间倒序）
  ipcMain.handle('card:listSnapshots', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath)) return forbidden();
      const fileDir = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));
      const ext = path.extname(filePath);
      const historyDir = path.join(fileDir, '.bak_history');
      if (!fs.existsSync(historyDir)) return { success: true, snapshots: [] };
      const allFiles = await fs.promises.readdir(historyDir);
      const snaps = [];
      for (const f of allFiles) {
        // 精确前缀匹配（base + '_'）避免 "卡A" 误配到 "卡A2" 的快照
        if (!f.startsWith(baseName + '_') || !f.endsWith(ext)) continue;
        const p = path.join(historyDir, f);
        try {
          const st = await fs.promises.stat(p);
          snaps.push({
            fileName: f,
            path: p,
            mtimeMs: st.mtimeMs,
            size: st.size,
            isManual: /_manual\./.test(f) // 手动快照带 _manual 标记
          });
        } catch (e) { /* 文件被外部删除时跳过 */ }
      }
      snaps.sort((a, b) => b.mtimeMs - a.mtimeMs); // 最新在前
      return { success: true, snapshots: snaps };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 📸 从历史快照恢复指定卡片（先把当前版本备份为新快照防丢，再把快照复制覆盖回原路径）
  ipcMain.handle('card:restoreSnapshot', async (event, payload) => {
    try {
      const filePath = payload && payload.filePath;
      const snapshotPath = payload && payload.snapshotPath;
      if (!filePath || typeof filePath !== 'string' || !isPathAllowed(filePath)) return forbidden();
      if (!snapshotPath || typeof snapshotPath !== 'string' || !isPathAllowed(snapshotPath)) return forbidden();
      if (!fs.existsSync(filePath)) return { success: false, error: '原卡片文件不存在' };
      if (!fs.existsSync(snapshotPath)) return { success: false, error: '快照文件不存在（可能已被清理）' };
      // 安全校验：快照必须位于原卡片同目录的 .bak_history 下（防任意文件覆盖）
      const expectedDir = path.join(path.dirname(filePath), '.bak_history').toLowerCase();
      if (path.dirname(snapshotPath).toLowerCase() !== expectedDir) {
        return { success: false, error: '非法快照路径' };
      }
      // 1. 先把当前版本强制备份为新快照（恢复后仍可回退）
      await processCardSnapshot(filePath, true);
      // 2. 复制快照覆盖回原文件
      await fs.promises.copyFile(snapshotPath, filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 🧹 一键清理全部历史快照垃圾（递归删除库目录下所有 .bak_history，释放硬盘空间；保存后会重新生成）
  ipcMain.handle('sys:cleanAllSnapshots', async (event, libraryPath) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      if (!fs.existsSync(libraryPath)) return { success: false, error: '库目录不存在' };
      if (!fs.statSync(libraryPath).isDirectory()) return { success: false, error: '路径不是目录' };
      let removedCount = 0;
      let freedBytes = 0;
      // 计算目录占用字节数
      const calcDirSize = (p) => {
        let total = 0;
        let items;
        try { items = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return 0; }
        for (const it of items) {
          const fp = path.join(p, it.name);
          try {
            if (it.isDirectory()) total += calcDirSize(fp);
            else total += fs.statSync(fp).size;
          } catch (e) { /* 忽略单个失败 */ }
        }
        return total;
      };
      // 递归扫描：删除所有 .bak_history 文件夹（含物理分组子文件夹内的），跳过其他隐藏目录
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const f of entries) {
          if (f.name === '.bak_history') {
            const full = path.join(dir, f.name);
            try {
              freedBytes += calcDirSize(full);
              fs.rmSync(full, { recursive: true, force: true });
              removedCount++;
            } catch (e) { /* 单个删除失败继续 */ }
          } else if (f.isDirectory() && !f.name.startsWith('.')) {
            walk(path.join(dir, f.name));
          }
        }
      };
      walk(libraryPath);
      return { success: true, removedCount, freedBytes };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 🧹 清理「无对应卡片」的孤儿快照目录（卡片被删除后其 .bak_history 残留；默认按目录整体判定）
  ipcMain.handle('sys:cleanOrphanSnapshots', async (event, libraryPath) => {
    try {
      if (!libraryPath || typeof libraryPath !== 'string' || !isPathAllowed(libraryPath)) return forbidden();
      if (!fs.existsSync(libraryPath)) return { success: false, error: '库目录不存在' };
      if (!fs.statSync(libraryPath).isDirectory()) return { success: false, error: '路径不是目录' };
      let removedCount = 0;
      let freedBytes = 0;
      const calcDirSize = (p) => {
        let total = 0;
        let items;
        try { items = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return 0; }
        for (const it of items) {
          const fp = path.join(p, it.name);
          try {
            if (it.isDirectory()) total += calcDirSize(fp);
            else total += fs.statSync(fp).size;
          } catch (e) { /* 忽略单个失败 */ }
        }
        return total;
      };
      // 递归收集孤儿 .bak_history：若其中所有快照对应的卡片均已不存在（目录级判定），视为孤儿目录
      // ⚠️ 正向匹配（卡片 base 为快照前缀），避免快照 split('_')[0] 在「卡片名含下划线」时误判
      const collectOrphans = (dir, result = []) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return result; }
        for (const f of entries) {
          const full = path.join(dir, f.name);
          if (f.name === '.bak_history') {
            try {
              const cardBases = new Set();
              for (const ef of fs.readdirSync(dir)) {
                if (ef.startsWith('.') || ef === '.bak_history') continue;
                const efPath = path.join(dir, ef);
                try { if (fs.statSync(efPath).isFile()) cardBases.add(ef.replace(/\.[^.]+$/, '')); } catch (e) { /* 忽略 */ }
              }
              const hfs = fs.readdirSync(full);
              // 存在至少一张「有快照的卡片」仍存活 → 目录非孤儿
              let alive = false;
              for (const cb of cardBases) {
                if (hfs.some(hf => hf.startsWith(cb + '_'))) { alive = true; break; }
              }
              if (!alive) result.push(full);
            } catch (e) { /* 忽略 */ }
          } else if (f.isDirectory() && !f.name.startsWith('.')) {
            collectOrphans(full, result);
          }
        }
        return result;
      };
      const orphans = collectOrphans(libraryPath);
      for (const dir of orphans) {
        try {
          freedBytes += calcDirSize(dir);
          fs.rmSync(dir, { recursive: true, force: true });
          removedCount++;
        } catch (e) { /* 单个失败继续 */ }
      }
      return { success: true, removedCount, freedBytes };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC：保存卡片（写入前自动备份历史快照到 .bak_history；异步化防大图保存卡主进程）
  ipcMain.handle('file:saveCard', async (event, filePath, updatedJson) => {
    try {
      if (!isPathAllowed(filePath)) return forbidden();
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "原文件不存在，无法保存。" };
      }

      // 📸 版本控制：保存前自动备份旧文件到 .bak_history
      // （可配置：开关/冷却间隔/最大保留数；手动触发走 card:createManualSnapshot 绕过冷却）
      await processCardSnapshot(filePath, false);

      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.json') {
        await fs.promises.writeFile(filePath, JSON.stringify(updatedJson, null, 2), 'utf-8');
        return { success: true };
      } else if (ext === '.png') {
        const buffer = await fs.promises.readFile(filePath);
        const newBuffer = writeTavernPNGChunk(buffer, updatedJson);
        if (newBuffer) {
          await fs.promises.writeFile(filePath, newBuffer);
          return { success: true };
        } else {
          return { success: false, error: "无法写入 PNG 结构。" };
        }
      }
      // 【修复 BUG-4】webp 等格式无法把 JSON 回写图内，明确提示而非笼统"不支持的文件格式"
      return { success: false, error: `暂不支持 ${ext || ''} 格式的在线保存（仅支持 .json / .png 卡片，webp 无法回写数据）` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ==========================================
  // 🌍 世界书 (Worldbook) 专属物理文件接口 (严格过滤版)
  // ==========================================

  // 智能校验：是否为标准的酒馆世界书 JSON
  function isValidWorldbook(wbData) {
    if (!wbData || typeof wbData !== 'object') return false;

    // 1. 过滤掉标准酒馆角色卡 JSON (V2/V3 导出 JSON 文件)
    if (wbData.spec === 'chara_card_v2' || wbData.spec === 'chara_card_v3') return false;
    if (wbData.data && (wbData.data.description !== undefined || wbData.data.first_mes !== undefined)) return false;

    // 2. 必须存在 entries 字段
    if (!wbData.entries) return false;

    // 3. 兼容处理：某些酒馆版本将 entries 存为对象字典 {"0":{...},"1":{...}}，统一清洗为数组
    if (typeof wbData.entries === 'object' && !Array.isArray(wbData.entries)) {
      wbData.entries = Object.values(wbData.entries);
    }

    if (!Array.isArray(wbData.entries)) return false;

    // 4. 若包含词条，抽取校验是否含世界书词条特有字段 (key / keys / content / comment / uid)
    if (wbData.entries.length > 0) {
      const sample = wbData.entries[0];
      if (!sample || typeof sample !== 'object') return false;
      const isWbEntry = ('key' in sample) || ('keys' in sample) || ('content' in sample) || ('comment' in sample) || ('uid' in sample);
      if (!isWbEntry) return false;
    }

    return true;
  }

  // 扫描世界书目录 (仅限 .json，经 isValidWorldbook 严格防伪过滤)
  // 【修复】升级为深度递归扫描：穿透所有子文件夹/二级文件夹，只要含 .json 世界书就全部提取
  ipcMain.handle('wb:scan', async (event, dirPath) => {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) {
        return { success: false, error: '目录不存在: ' + dirPath };
      }
      // 【安全加固】用户选择的世界书目录加入白名单（该目录内文件可读可写）
      addAllowedRoot(dirPath);
      const results = [];

      // 深度递归扫描（不限层级；跳过隐藏文件/目录）
      const walk = async (dir) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue; // 忽略隐藏文件/目录
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await walk(fullPath); // 递归进入子文件夹
            continue;
          }
          if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;

          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            const wbData = JSON.parse(content);

            // 严格防伪校验：确保只拦截真正的世界书 JSON
            if (isValidWorldbook(wbData)) {
              results.push({
                path: fullPath,
                name: entry.name,
                data: wbData
              });
            }
          } catch (parseErr) {
            // 静默跳过损坏或非标准 JSON 文件
            console.warn('[wb:scan] 跳过非世界书文件:', entry.name, parseErr.message);
          }
        }
      };

      await walk(dirPath);
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 物理覆写世界书（保存前自动快照备份到 .bak_history，与角色卡保存逻辑保持一致）
  ipcMain.handle('wb:save', async (event, { filePath, data }) => {
    try {
      if (!filePath) return { success: false, error: '文件路径为空。' };
      // 【安全加固】仅放行白名单内的世界书文件
      if (!isPathAllowed(filePath)) return forbidden();
      if (!fs.existsSync(filePath)) return { success: false, error: '原文件不存在，无法保存。' };

      // 1. 数据清洗 (剔除 _collapsed 等临时 UI 字段 + 前端临时 uid，保证落盘 JSON 100% 符合酒馆原生规范)
      const cleanData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key.startsWith('_') || key === 'uid') return undefined;
        return value;
      }));

      const fileContent = JSON.stringify(cleanData, null, 4);

      // 2. 物理快照备份逻辑 (保留最近 10 次)
      const backupDir = path.join(app.getPath('userData'), 'jsTavern_Backups', 'worldbooks');
      if (!fs.existsSync(backupDir)) {
        await fs.promises.mkdir(backupDir, { recursive: true });
      }

      const baseName = path.basename(filePath, '.json');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${baseName}_${timestamp}.json`);

      // 备份当前原文件
      await fs.promises.copyFile(filePath, backupPath);

      // 清理老旧备份，只保留同名文件的最近 10 份
      const files = await fs.promises.readdir(backupDir);
      const myBackups = files.filter(f => f.startsWith(baseName + '_')).sort();
      if (myBackups.length > 10) {
        const filesToDelete = myBackups.slice(0, myBackups.length - 10);
        for (const f of filesToDelete) {
          await fs.promises.unlink(path.join(backupDir, f)).catch(() => { });
        }
      }

      // 3. 覆盖写入新文件
      await fs.promises.writeFile(filePath, fileContent, 'utf-8');
      return { success: true };
    } catch (err) {
      console.error('保存世界书失败:', err);
      return { success: false, error: err.message };
    }
  });

  // 从网络拉取世界书 JSON 文本（主进程 net.fetch 转发，彻底绕开渲染层 CORS 限制；
  // Discord CDN / GitHub Raw 等直链均可，前端 fetch 失败时自动回退到这里）
  ipcMain.handle('wb:fetchUrl', async (event, url) => {
    try {
      if (!url || !/^https?:\/\//i.test(url)) {
        return { success: false, error: '非法网址：仅支持 http/https 直链。' };
      }
      const response = await net.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (JSK-Manager; compatible)' },
        redirect: 'follow'
      });
      if (!response.ok) {
        return { success: false, error: `网络请求失败 (状态码: ${response.status})` };
      }
      const text = await response.text();
      if (text.length > 50 * 1024 * 1024) {
        return { success: false, error: '响应体过大（超过 50MB），已中止拉取。' };
      }
      return { success: true, data: text };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // 🌐 从 URL 直链下载角色卡并导入到卡片库（支持 PNG 卡 / JSON 卡，Discord/GitHub 等 CDN 直链均可）
  ipcMain.handle('card:downloadFromUrl', async (event, { url, destFolder } = {}) => {
    try {
      if (!url || !/^https?:\/\//i.test(url)) {
        return { success: false, error: '非法网址：仅支持 http/https 直链。' };
      }
      // 【安全加固】目标目录必须是白名单内的卡片库
      if (!destFolder || !isPathAllowed(destFolder) || !fs.existsSync(destFolder) || !fs.statSync(destFolder).isDirectory()) {
        return { success: false, error: '目标卡片库目录无效（未设置或不在合法范围内）。' };
      }

      // 1. 下载二进制内容（角色卡是 PNG，必须按字节取，不能用 text）
      const response = await net.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (JSK-Manager; compatible)' },
        redirect: 'follow'
      });
      if (!response.ok) {
        return { success: false, error: `网络请求失败 (状态码: ${response.status})` };
      }
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf || buf.length === 0) return { success: false, error: '下载内容为空。' };
      if (buf.length > 20 * 1024 * 1024) {
        return { success: false, error: '文件过大（超过 20MB），已中止下载。' };
      }

      // 2. 校验并识别卡片类型（PNG 内嵌 chara/ccv3 块 或 标准 JSON 卡）
      const urlName = decodeURIComponent((String(url).split('/').pop() || '').split(/[?#]/)[0] || '');
      const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim() || 'character';
      let card = null;
      let fileName = '';

      if (isPNGBuffer(buf)) {
        card = readTavernPNGChunk(buf);
        if (!card) return { success: false, error: 'PNG 内未找到角色卡数据 (chara/ccv3)，请确认是角色卡图片。' };
        const base = getCardName(card) || urlName.replace(/\.(png|webp|jpe?g)$/i, '') || 'character';
        fileName = safeName(base) + '.png';
      } else {
        // 按 JSON 卡处理
        try {
          card = JSON.parse(buf.toString('utf-8').replace(/^\uFEFF/, ''));
        } catch (e) {
          return { success: false, error: '无法识别的文件：既不是有效的 PNG 角色卡，也不是 JSON 角色卡。' };
        }
        if (!card || typeof card !== 'object' || (!card.data && !card.name)) {
          return { success: false, error: 'JSON 不是有效的角色卡数据（缺少 name/data 字段）。' };
        }
        const base = getCardName(card) || urlName.replace(/\.json$/i, '') || 'character';
        fileName = safeName(base) + '.json';
      }

      // 3. 同名跳过（绝不覆盖用户已有卡片）+ 落盘
      const destPath = path.join(destFolder, fileName);
      if (fs.existsSync(destPath)) {
        return { success: false, error: `已存在同名卡片「${fileName}」，已跳过（不覆盖）。`, skipped: true };
      }
      fs.writeFileSync(destPath, buf);

      return { success: true, filePath: destPath, fileName, name: getCardName(card) || fileName };
    } catch (err) {
      console.error('从链接下载角色卡失败:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // 新建世界书文件（网址导入落盘用；自动创建父目录，剔除 _ 前缀与 uid 临时字段防污染）
  ipcMain.handle('wb:create', async (event, { filePath, data }) => {
    try {
      if (!filePath) return { success: false, error: '文件路径为空。' };
      // 【安全加固】仅允许在世界书白名单目录内新建
      if (!isPathAllowed(filePath)) return forbidden();
      if (fs.existsSync(filePath)) return { success: false, error: '目标文件已存在，请换一个文件名。' };
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const cleanData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key.startsWith('_') || key === 'uid') return undefined;
        return value;
      }));
      await fs.promises.writeFile(filePath, JSON.stringify(cleanData, null, 4), 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 重命名世界书物理文件（内存列表同步由渲染进程负责；改名后 .bak_history 历史备份不受影响）
  ipcMain.handle('wb:rename', async (event, { oldPath, newPath }) => {
    try {
      if (!oldPath || !newPath) return { success: false, error: '路径为空。' };
      // 【安全加固】新旧路径都必须在白名单内（防越权移动文件）
      if (!isPathAllowed(oldPath) || !isPathAllowed(newPath)) return forbidden();
      if (!fs.existsSync(oldPath)) return { success: false, error: '原文件不存在。' };
      if (fs.existsSync(newPath)) return { success: false, error: '目标文件已存在，请换一个名称。' };
      await fs.promises.rename(oldPath, newPath);
      return { success: true, newPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 打开全局回收站（世界书删除/查重清洗移入的 userData/jsTavern_Trash；不存在则先创建）
  ipcMain.handle('sys:openGlobalTrash', async () => {
    try {
      const trashDir = path.join(app.getPath('userData'), 'jsTavern_Trash');
      await fs.promises.mkdir(trashDir, { recursive: true });
      shell.openPath(trashDir);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // 🗑️ 系统级安全回收站接口 (跨盘移动防崩溃升级版)
  // ==========================================
  // 智能查重清洗用：绝不物理删除，而是把冗余文件移动到 userData 下的专属回收站目录
  ipcMain.handle('sys:trashFiles', async (event, filePaths) => {
    try {
      const trashDir = path.join(app.getPath('userData'), 'jsTavern_Trash');
      if (!fs.existsSync(trashDir)) {
        await fs.promises.mkdir(trashDir, { recursive: true });
      }

      let trashedCount = 0;
      for (const p of (Array.isArray(filePaths) ? filePaths : [])) {
        // 【安全加固】仅处理白名单内的文件（防越权移动任意文件）
        if (!isPathAllowed(p)) continue;
        if (p && fs.existsSync(p)) {
          const fileName = path.basename(p);
          // 加上时间戳前缀防重名覆盖
          const dest = path.join(trashDir, `${Date.now()}_${fileName}`);

          try {
            // 1. 首选：尝试直接重命名（同盘移动极快）
            await fs.promises.rename(p, dest);
          } catch (renameErr) {
            // 2. 核心修复：如果是跨盘移动（EXDEV: cross-device link），降级为【复制 + 删除】策略
            if (renameErr && renameErr.code === 'EXDEV') {
              await fs.promises.copyFile(p, dest);
              await fs.promises.unlink(p);
            } else {
              // 其他错误（如文件被占用 EBUSY / 权限 EPERM）原样抛出，让前端看到明确报错
              throw renameErr;
            }
          }
          trashedCount++;
        }
      }
      return { success: true, count: trashedCount };
    } catch (err) {
      console.error('🗑️ 移入回收站失败:', err);
      return { success: false, error: err.message };
    }
  });

  // 批量获取文件物理状态（修改时间/创建时间/大小），供智能查重综合判定使用
  ipcMain.handle('sys:getFileStats', async (event, filePaths) => {
    try {
      const stats = {};
      for (const p of (Array.isArray(filePaths) ? filePaths : [])) {
        // 【安全加固】仅统计白名单内的文件
        if (!isPathAllowed(p)) continue;
        if (p && fs.existsSync(p)) {
          const stat = await fs.promises.stat(p);
          stats[p] = {
            mtimeMs: stat.mtimeMs,       // 修改时间戳
            birthtimeMs: stat.birthtimeMs, // 创建时间戳
            size: stat.size              // 文件大小
          };
        }
      }
      return { success: true, data: stats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // 🖱️ 右键菜单专属增强系统接口
  // ==========================================

  // 1. 在系统资源管理器中打开并定位到该文件（shell 已在顶部引入）
  ipcMain.handle('sys:showItemInFolder', (event, filePath) => {
    try {
      if (!filePath) return { success: false, error: '路径为空。' };
      // 【安全加固】仅放行白名单内的文件
      if (!isPathAllowed(filePath)) return forbidden();
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 2. 物理复制文件（创建带时间戳的副本，供大改前留档）
  ipcMain.handle('sys:duplicateFile', async (event, sourcePath) => {
    try {
      // 【安全加固】仅放行白名单内的源文件
      if (!isPathAllowed(sourcePath)) return forbidden();
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: '源文件不存在: ' + sourcePath };
      }
      const dir = path.dirname(sourcePath);
      const ext = path.extname(sourcePath); // .png / .webp / .json
      const baseName = path.basename(sourcePath, ext);

      // 生成副本名称，如: 角色名_copy_16234567.png
      const destPath = path.join(dir, `${baseName}_copy_${Math.floor(Date.now() / 1000)}${ext}`);

      await fs.promises.copyFile(sourcePath, destPath);
      return { success: true, destPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // 🚀 系统更新检测与外部链接打开接口
  // ==========================================

  // 1. 调用系统默认浏览器打开外部网页（跳转 GitHub Releases 下载页）
  // 【安全加固】仅放行 http/https 链接，防止被滥用触发本机任意 URL scheme handler（Electron 已知 CVE 类型）
  ipcMain.handle('sys:openExternal', async (event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) {
      return { success: false, error: '仅支持 http/https 链接' };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // 🚀 OTA 自动更新系统 (electron-updater: 检测/下载/进度/安装)
  // ==========================================
  // 禁用自动下载，改为由用户确认后再下载；退出应用时自动安装
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 1. 触发检查更新（结果通过事件广播给渲染进程）
  ipcMain.handle('sys:checkUpdate', async () => {
    try {
      if (isDev) return { success: false, error: '开发模式跳过更新检测' };
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 2. 触发开始下载
  ipcMain.handle('sys:downloadUpdate', () => {
    autoUpdater.downloadUpdate();
    return { success: true };
  });

  // 3. 触发退出并安装
  ipcMain.handle('sys:installUpdate', () => {
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // 4. 将更新状态广播给渲染进程
  const broadcastUpdate = (channel, payload) => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload));
  };

  autoUpdater.on('update-available', (info) => {
    // releaseNotes 兼容字符串或 GitHub 提供的数组形态
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map(n => (n && n.note) || '').join('\n')
      : (info.releaseNotes || '');
    broadcastUpdate('update-available', {
      success: true,
      hasUpdate: true,
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseNotes: notes,
      downloadUrl: `https://github.com/tian2418671-sys/JSKZX/releases/tag/v${info.version}`
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcastUpdate('update-not-available', {
      success: true,
      hasUpdate: false,
      currentVersion: app.getVersion(),
      latestVersion: (info && info.version) || '',
      releaseNotes: '',
      downloadUrl: ''
    });
  });

  autoUpdater.on('error', (err) => {
    broadcastUpdate('update-error', (err && err.message) || String(err));
  });

  autoUpdater.on('download-progress', (progressObj) => {
    broadcastUpdate('update-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdate('update-downloaded', info);
  });

  // 智能规范化 OpenAI 兼容聊天端点：兼容只填 /v1、误填 /v1/models、或完整 /chat/completions 三种情况
  const normalizeChatEndpoint = (endpoint) => {
    let url = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!url) return url;
    if (/\/chat\/completions$/.test(url)) return url;        // 已是完整聊天端点
    if (/\/v1\/models$/.test(url)) {                          // 误填了 models 列表地址 → 转回聊天端点
      return url.replace(/\/v1\/models$/, '/v1/chat/completions');
    }
    if (/\/v1$/.test(url)) {                                   // 形如 /v1 → 补 /chat/completions
      return url + '/chat/completions';
    }
    return url;                                                // 其他自定义路径保持原样
  };

  // IPC：发送大模型 API 请求（经主进程转发，绕过前端 CORS 限制；支持 OpenAI 兼容 / Anthropic 双协议）
  ipcMain.handle('chat:send', async (event, endpoint, payload, apiKey, apiType) => {
    try {
      const type = apiType === 'anthropic' ? 'anthropic' : 'openai';
      let fetchUrl, headers, bodyData;

      if (type === 'anthropic') {
        // Anthropic 原生协议：POST /v1/messages + x-api-key 鉴权，system 独立字段
        const base = String(endpoint || '').trim().replace(/\/+$/, '');
        fetchUrl = /\/v1\/messages$/.test(base) ? base : base + '/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': (apiKey && apiKey.trim()) ? apiKey.trim() : '',
          'anthropic-version': '2023-06-01'
        };
        let systemPrompt = '';
        const filteredMessages = (payload.messages || []).filter(m => {
          if (m.role === 'system') { systemPrompt = m.content; return false; }
          return true;
        });
        bodyData = {
          model: payload.model,
          // 【修复】统一 max_tokens 口径：优先透传前端传入的上限，缺省再给 4096（Anthropic 必填字段），
          // 不再单边硬编码 4096 截断长回复
          max_tokens: payload.max_tokens || 4096,
          system: systemPrompt,
          messages: filteredMessages,
          temperature: payload.temperature ?? 0.2
        };
      } else {
        // OpenAI 兼容协议（OpenAI / DeepSeek / Kimi / 聚合中转）：/chat/completions + Bearer
        fetchUrl = normalizeChatEndpoint(endpoint);
        const authKey = (apiKey && apiKey.trim()) ? apiKey.trim() : 'test-key';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authKey}` };
        bodyData = payload;
      }

      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyData)
      });

      if (!response.ok) {
        return { success: false, error: `HTTP 错误: ${response.status} - ${await response.text()}` };
      }

      const data = await response.json();
      return { success: true, data: data };
    } catch (e) {
      console.error('API 请求失败:', e);
      return { success: false, error: e.message };
    }
  });

  // IPC：拉取服务端可用模型列表（GET /v1/models，经主进程转发绕过 CORS；支持双协议）
  ipcMain.handle('models:fetch', async (event, endpoint, apiKey, apiType) => {
    try {
      const ep = String(endpoint || '').trim();
      if (!ep) return { success: false, error: '未填写 API Endpoint 地址' };

      const type = apiType === 'anthropic' ? 'anthropic' : 'openai';
      let modelsUrl, headers;

      if (type === 'anthropic') {
        // Anthropic：GET /v1/models + x-api-key
        const base = ep.replace(/\/+$/, '');
        modelsUrl = /\/v1\/models$/.test(base) ? base : base + '/v1/models';
        headers = {
          'x-api-key': (apiKey && apiKey.trim()) ? apiKey.trim() : '',
          'anthropic-version': '2023-06-01'
        };
      } else {
        // 智能构建 /v1/models 地址：兼容 OpenAI / LM Studio / Ollama 标准接口
        if (/\/models$/.test(ep)) {
          modelsUrl = ep; // 已是以 /models 结尾的完整列表地址，直接使用
        } else if (ep.endsWith('/chat/completions')) {
          modelsUrl = ep.replace(/\/chat\/completions$/, '/models');
        } else {
          modelsUrl = ep.replace(/\/+$/, '') + '/models'; // 其余（含 /v1、裸域名等）统一补 /models
        }
        const authKey = (apiKey && apiKey.trim()) ? apiKey.trim() : '';
        headers = { 'Content-Type': 'application/json' };
        if (authKey) headers['Authorization'] = `Bearer ${authKey}`;
      }

      const response = await fetch(modelsUrl, { method: 'GET', headers });
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status} ${response.statusText}` };
      }
      const data = await response.json();
      return { success: true, data: data };
    } catch (e) {
      console.error('拉取模型列表失败:', e);
      return { success: false, error: e.message };
    }
  });

  // IPC：删除卡片（移入本地回收站 .trash 而非物理删除）
  ipcMain.handle('file:delete', (event, filePath) => {
    try {
      // 【安全加固】仅放行白名单内的卡片
      if (!isPathAllowed(filePath)) return forbidden();
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "未找到该文件" };
      }

      const dir = path.dirname(filePath);
      const trashDir = path.join(dir, '.trash');
      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      const trashPath = path.join(trashDir, `${Date.now()}_${fileName}`);

      // 将文件移动到回收站目录
      fs.renameSync(filePath, trashPath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC 通信：一键导出角色卡完整整合包（主卡 + 独立世界书 + 正则脚本）
  ipcMain.handle('file:exportPackage', async (event, filePath, cardJsonData) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: "原文件路径无效" };
      }
      // 【安全加固】源卡片必须在白名单内（目标目录由用户 dialog 显式选择，视为授权）
      if (!isPathAllowed(filePath)) return forbidden();
      
      // 弹出文件夹选择对话框，让用户选择导出的目标父目录
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择整合包导出的存放目录'
      });
      
      if (canceled || filePaths.length === 0) return { success: false, error: "用户取消操作" };
      
      const targetParentDir = filePaths[0];
      const charName = (cardJsonData.data?.name || cardJsonData.name || 'character').replace(/[\/\\?%*:|"<>]/g, '_');
      const exportDir = path.join(targetParentDir, `${charName}_Package`);
      
      // 创建专属整合文件夹
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      
      // 1. 复制原卡片文件 (PNG 或 JSON)
      const fileName = path.basename(filePath);
      const destCardPath = path.join(exportDir, fileName);
      fs.copyFileSync(filePath, destCardPath);
      
      // 2. 如果卡片中内嵌了世界书，自动将其单独导出为 worldbook.json
      const d = cardJsonData.data || cardJsonData;
      const book = d.character_book;
      if (book && ((book.entries && book.entries.length > 0) || Array.isArray(book))) {
        const wbPath = path.join(exportDir, 'worldbook.json');
        fs.writeFileSync(wbPath, JSON.stringify(book, null, 2), 'utf-8');
      }
      
      // 3. 如果卡片中内嵌了正则脚本，自动将其单独导出为 regex_scripts.json
      const regex = d.extensions?.regex_scripts || d.regex_scripts;
      if (regex && regex.length > 0) {
        const regexPath = path.join(exportDir, 'regex_scripts.json');
        fs.writeFileSync(regexPath, JSON.stringify(regex, null, 2), 'utf-8');
      }
      
      return { success: true, exportDir };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC 通信：批量打包导出多张卡片
  ipcMain.handle('file:exportBatchPackage', async (event, filePaths) => {
    try {
      if (!filePaths || filePaths.length === 0) {
        return { success: false, error: "未选择任何卡片" };
      }
      
      const { canceled, filePaths: targetDirs } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择批量导出的目标文件夹'
      });
      
      if (canceled || targetDirs.length === 0) return { success: false, error: "用户取消操作" };
      
      const targetParentDir = targetDirs[0];
      const batchDirName = `Batch_Export_${Date.now()}`;
      const exportRoot = path.join(targetParentDir, batchDirName);
      fs.mkdirSync(exportRoot, { recursive: true });
      
      let successCount = 0;
      for (const srcPath of filePaths) {
        // 【安全加固】跳过越界路径，不中断整批操作，只丢弃非法项
        if (srcPath && isPathAllowed(srcPath) && fs.existsSync(srcPath)) {
          const fileName = path.basename(srcPath);
          const destPath = path.join(exportRoot, fileName);
          fs.copyFileSync(srcPath, destPath);
          successCount++;
        }
      }
      
      return { success: true, exportDir: exportRoot, count: successCount };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // macOS：点击 Dock 图标且无窗口时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * 扫描文件夹并静默保存配置
 * @param {string} folderPath 用户选择的文件夹
 * @returns {{folderPath: string|null, files: Array, error?: string}}
 */
// 📁 递归遍历库目录：一级子文件夹名 = 物理分组；跳过隐藏文件夹与系统黑名单
// relPath 为相对库根的路径（'' 表示根目录），一级文件夹名作为 category 识别
function walkLibraryDir(dirPath, relPath, files, categories) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return; // 权限不足 / 系统锁定文件夹静默跳过
  }
  for (const f of entries) {
    if (f.name.startsWith('.')) continue; // .bak_history / .trash 等隐藏文件夹
    const absPath = path.join(dirPath, f.name);
    if (f.isDirectory()) {
      const lowerName = f.name.toLowerCase();
      if (skipFolders.includes(lowerName)) continue; // node_modules 等海量垃圾目录黑名单
      if (!relPath) categories.add(f.name); // 一级文件夹名 = 物理分组
      const subRel = relPath ? path.join(relPath, f.name) : f.name;
      walkLibraryDir(absPath, subRel, files, categories);
    } else if (f.isFile()) {
      const ext = path.extname(f.name).toLowerCase();
      if (ext !== '.png' && ext !== '.webp' && ext !== '.json') continue;
      const isImage = ext === '.png' || ext === '.webp';
      let mtime = 0;
      let birthtime = 0;
      try {
        const st = fs.statSync(absPath);
        mtime = st.mtimeMs || 0;       // 文件修改时间
        birthtime = st.birthtimeMs || 0; // 文件创建时间（Windows 支持；可 0，排序时自动回退）
      } catch (e) { /* 文件被占用/删除时忽略 */ }
      // 🚀 性能优化：扫描时主进程本地提取 PNG 内嵌卡片 JSON（只读文件头 1MB，
      // chara/ccv3 块位于 IHDR 之后、IDAT 之前），随 files 一起返回，
      // 前端直接复用，彻底省掉"整张 PNG 跨 IPC 读回渲染端"的最大瓶颈。
      // 提取失败（异常 iTXt/截断）→ embeddedData=null，前端自动回退完整 readBuffer，绝不漏卡
      let embeddedData = null;
      if (ext === '.png') {
        try {
          const size = fs.statSync(absPath).size;
          const headLen = Math.min(1024 * 1024, size);
          const fd = fs.openSync(absPath, 'r');
          const head = Buffer.alloc(headLen);
          fs.readSync(fd, head, 0, headLen, 0);
          fs.closeSync(fd);
          embeddedData = readTavernPNGChunk(head) || null;
        } catch (e) { embeddedData = null; }
      }
      files.push({
        name: f.name,
        path: absPath,
        url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null,
        mtime,
        birthtime,
        subFolder: relPath || '', // 相对库根的文件夹路径（'' = 根目录）
        category: relPath ? relPath.split(path.sep)[0] : '未分类', // 一级文件夹名 = 物理分组
        embeddedData // 🚀 内嵌 card JSON（无则 null），前端解析优先复用
      });
    }
  }
}

function scanAndSaveFolder(folderPath) {
  try {
    // 【新增】记录当前库根目录，供白名单校验使用
    addAllowedRoot(folderPath);

    // 【修复】合并写入而非整体覆盖，避免冲掉已保存的 globalTags 等字段
    let config = {};
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { config = {}; }
    }
    config.lastFolder = folderPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // 📁 递归扫描库目录：子文件夹名自动识别为物理分组
    const files = [];
    const categories = new Set();
    walkLibraryDir(folderPath, '', files, categories);

    return { folderPath, files, categories: Array.from(categories) };
  } catch (e) {
    return { folderPath: null, files: [], error: e.message };
  }
}
