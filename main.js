/**
 * SillyTavern 角色卡高级解析中心 - Electron 主进程
 *
 * 架构说明：
 * - 渲染进程（Vue）通过 preload 暴露的 window.electronAPI 与主进程通信（IPC）；
 * - `app://` 协议加载应用自身页面：解决 file:// 下 ES Modules 的 CORS 限制；
 * - `local-file://` 特权协议安全读取磁盘图片：无需关闭 webSecurity 即可展示本地立绘；
 * - 文件夹选择通过原生 dialog 弹出，选中的路径静默保存到系统 userData 目录。
 */
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ================= 兼容 360 主动防御：禁用 GPU 进程沙箱 =================
// 症状：安装版在装有 360（ZhuDongFangYu 主动防御内核驱动）的机器上启动即闪退，
// 表现：GPU 子进程以沙箱(降权)方式加载 DLL 被内核驱动拦截 → 0xC0000135 循环崩溃
// → FATAL: GPU process isn't usable. Goodbye（无 crash.log，纯原生层崩溃）。
// 实测：--disable-gpu-sandbox / --no-sandbox 均可正常启动，普通 DLL 加载无异常。
// 这里仅禁用 GPU 进程沙箱（保留渲染/网络进程沙箱），影响面最小。
app.commandLine.appendSwitch('disable-gpu-sandbox');

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

// 系统级应用数据目录（用于保存配置，不会随项目丢失）
const configPath = path.join(app.getPath('userData'), 'tavern_manager_config.json');

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

    const resolved = path.normalize(path.join(__dirname, filePath));

    // 安全校验：确保解析后的路径始终位于项目根目录内（防止路径穿越）
    if (!resolved.startsWith(path.join(__dirname))) {
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
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 安全桥梁
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 通过自定义协议加载页面（支持 ES Modules 与 CDN）
  win.loadURL('app://index.html');

  // ===== 【临时】截图脚本：生成 screenshots/ 后移除 =====
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const log = (msg) => { win.webContents.executeJavaScript(`console.log(${JSON.stringify(msg)})`).catch(() => { }); };
      try {
        log('截图脚本启动');
        const shotDir = path.join(__dirname, 'screenshots');
        fs.mkdirSync(shotDir, { recursive: true });
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const ev = async (code) => await win.webContents.executeJavaScript(code);
        const snap = async (name) => {
          await wait(1200);
          const img = await win.capturePage();
          fs.writeFileSync(path.join(shotDir, name + '.png'), img.toPNG());
          log('截图完成: ' + name);
        };
        // 等待卡片加载
        for (let i = 0; i < 90; i++) {
          let n = 0;
          try { n = await ev(`(window.__app && window.__app._instance) ? (window.__app._instance.proxy.library || []).length : -1`); } catch (e) { log('轮询错误: ' + e.message); }
          log('library=' + n);
          if (n > 0) break;
          await wait(1000);
        }
        await wait(1500);
        const P = 'window.__app._instance.proxy';
        await ev(`${P}.reset && ${P}.reset(); true`);
        await snap('01-主界面');
        await ev(`(() => { const p = window.__app._instance.proxy; if (p.library && p.library.length) { p.openFromLibrary(p.library[0]); } return true; })()`);
        await snap('02-卡片编辑');
        await ev(`(() => { const p = window.__app._instance.proxy; const c = (p.library||[]).find(i => { const d = i.data?.data || i.data || {}; const b = d.character_book || i.data?.character_book || {}; return ((b.entries||[]).length > 0) || (Array.isArray(b) && b.length > 0); }); if (c) p.openFromLibrary(c); p.currentTab = 'worldbook'; return true; })()`);
        await snap('03-世界书');
        await ev(`${P}.currentTab = 'chat'; true`);
        await snap('04-聊天测卡');
        await ev(`${P}.openGraph(); true`);
        await snap('05-关系图谱');
        await ev(`${P}.closeGraph(); ${P}.showGlobalAssetModal = true; true`);
        await snap('06-全局资产中心');
        await ev(`${P}.showGlobalAssetModal = false; true`);
        log('截图全部完成');
      } catch (e) { log('截图失败: ' + (e && e.message)); }
    }, 3000);
  });
  // ===== 【临时】截图脚本结束 =====

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

  // IPC：读取单个文件内容（返回二进制 Buffer）
  ipcMain.handle('file:readBuffer', (event, filePath) => {
    return fs.readFileSync(filePath);
  });

  // IPC：读取单个文件文本（用于 JSON 卡片）
  ipcMain.handle('file:readText', (event, filePath) => {
    return fs.readFileSync(filePath, 'utf-8');
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

    // 如果没有传入路径，则弹出原生文件夹选择器让用户选
    if (!folderToScan) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择要扫描的磁盘或文件夹'
      });
      if (result.canceled || result.filePaths.length === 0) return [];
      folderToScan = result.filePaths[0];
    }

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
      // 目录不存在则自动创建（防御：仅当非文件路径时自动建目录，避免把 "1.png" 这类文件路径误建成文件夹）
      if (!fs.existsSync(fullPath) && !path.extname(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
      const err = await shell.openPath(fullPath);
      return err ? { success: false, error: err } : { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IPC：推送角色卡到酒馆（经主进程以 multipart/form-data 上传，绕过渲染进程 CORS 限制）
  // 酒馆导入端点：POST {tavernUrl}/api/characters/import，字段名 avatar
  ipcMain.handle('tavern:push', async (event, { tavernUrl, cardPath, cardName }) => {
    try {
      const baseUrl = String(tavernUrl || '').trim().replace(/\/+$/, '');
      if (!baseUrl) return { success: false, error: '酒馆地址为空' };
      if (!cardPath || !fs.existsSync(cardPath)) return { success: false, error: '卡片文件不存在: ' + cardPath };

      const importUrl = baseUrl + '/api/characters/import';
      const fileBuf = fs.readFileSync(cardPath);
      const blob = new Blob([fileBuf]);
      const form = new FormData();
      // 用卡片名作为上传文件名（保留原扩展名），酒馆导入后即为该角色名
      const ext = path.extname(cardPath) || '.png';
      const safeName = String(cardName || path.basename(cardPath, ext) || 'card').replace(/[\\/:*?"<>|]/g, '_');
      form.append('avatar', blob, safeName + ext);

      const response = await fetch(importUrl, { method: 'POST', body: form });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { success: false, error: `HTTP ${response.status}: ${String(text).slice(0, 300)}` };
      }
      const text = await response.text();
      return { success: true, data: text };
    } catch (e) {
      console.error('推送酒馆失败:', e);
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

  // IPC：保存卡片（写入前自动备份历史快照到 .bak_history）
  ipcMain.handle('file:saveCard', (event, filePath, updatedJson) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "原文件不存在，无法保存。" };
      }

      // --- 【新增】版本控制：创建 .bak_history 隐藏备份 ---
      const dir = path.dirname(filePath);
      const bakDir = path.join(dir, '.bak_history');
      if (!fs.existsSync(bakDir)) {
        fs.mkdirSync(bakDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      const timeStr = new Date().toISOString().replace(/[:.]/g, '-');
      const bakPath = path.join(bakDir, `${timeStr}_${fileName}`);

      // 复制当前老文件到备份目录
      fs.copyFileSync(filePath, bakPath);

      // --- 【新增】备份数量上限：每张卡只保留最近 5 份快照，防止 .bak_history 磁盘膨胀 ---
      try {
        const baks = fs.readdirSync(bakDir).filter(f => f.includes(fileName));
        if (baks.length > 5) {
          // 文件名以 ISO 时间戳开头，字典序即时间序；删除最旧的超出部分
          baks.sort().slice(0, baks.length - 5).forEach(oldBak => {
            fs.unlinkSync(path.join(bakDir, oldBak));
          });
        }
      } catch (cleanupErr) { /* 清理失败不影响本次保存 */ }
      // --------------------------------------------------

      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.json') {
        fs.writeFileSync(filePath, JSON.stringify(updatedJson, null, 2), 'utf-8');
        return { success: true };
      } else if (ext === '.png') {
        const buffer = fs.readFileSync(filePath);
        const newBuffer = writeTavernPNGChunk(buffer, updatedJson);
        if (newBuffer) {
          fs.writeFileSync(filePath, newBuffer);
          return { success: true };
        } else {
          return { success: false, error: "无法写入 PNG 结构。" };
        }
      }
      return { success: false, error: "不支持的文件格式。" };
    } catch (e) {
      return { success: false, error: e.message };
    }
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
          max_tokens: 4096,
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
        } else if (/\/v1\/?$/.test(ep)) {
          modelsUrl = ep.replace(/\/+$/, '') + '/models';
        } else {
          modelsUrl = ep.replace(/\/+$/, '') + '/models';
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
        if (fs.existsSync(srcPath)) {
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
function scanAndSaveFolder(folderPath) {
  try {
    // 静默保存配置
    fs.writeFileSync(configPath, JSON.stringify({ lastFolder: folderPath }));

    // 读取目录下所有文件，过滤出支持的格式
    const files = fs.readdirSync(folderPath);
    const validFiles = files
      .filter(f => f.match(/\.(png|webp|json)$/i))
      .map(f => {
        const absPath = path.join(folderPath, f);
        // 仅图片文件生成立绘展示链接（JSON 无立绘，避免无谓请求）
        // 路径经查询参数传递，规避 URL 规范化对盘符冒号的影响
        const isImage = /\.(png|webp)$/i.test(f);
        return {
          name: f,
          path: absPath,
          url: isImage ? 'local-file://img/?path=' + encodeURIComponent(absPath) : null
        };
      });

    return { folderPath, files: validFiles };
  } catch (e) {
    return { folderPath: null, files: [], error: e.message };
  }
}
