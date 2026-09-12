// 500 张重型测试采样脚本：从 I:\03\角色色卡 按目录加权均匀采样
// 输出: E:\AI\酒馆工具\JSK管理APP\scripts\pick500_list.txt (tab 分隔: 源路径|目标相对路径)
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = 'I:\\03\\角色色卡';
const OUT_LIST = path.join(process.cwd(), 'scripts', 'pick500_list.txt');
const TARGET_COUNT = 500;

const EXTS = new Set(['.png', '.json', '.webp']);
const MAX_SIZE = 15 * 1024 * 1024; // 单卡上限 15MB

// 1. 收集所有候选文件（递归）
const dirs = fs.readdirSync(SRC_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(SRC_ROOT, d.name));

let all = [];
for (const dir of dirs) {
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) { walk(full); }
      else if (e.isFile() && EXTS.has(path.extname(e.name).toLowerCase())) {
        const st = fs.statSync(full);
        if (st.size > 0 && st.size <= MAX_SIZE) all.push({ full, size: st.size, dir });
      }
    }
  };
  walk(dir);
}
console.log(`候选文件(<=15MB): ${all.length}`);

// 2. 按目录分组
const byDir = new Map();
for (const f of all) {
  if (!byDir.has(f.dir)) byDir.set(f.dir, []);
  byDir.get(f.dir).push(f);
}

// 3. 分配配额：每目录至少 1 张（若目录非空），其余按文件数加权
const dirsList = [...byDir.keys()];
const nonEmpty = dirsList.filter((d) => byDir.get(d).length > 0);
const weights = nonEmpty.map((d) => Math.max(1, Math.sqrt(byDir.get(d).length)));
const totalW = weights.reduce((a, b) => a + b, 0);
const quotas = new Map();
let assigned = 0;
nonEmpty.forEach((d, i) => {
  let q = Math.floor((weights[i] / totalW) * TARGET_COUNT);
  if (q < 1) q = 1;
  quotas.set(d, q);
  assigned += q;
});

// 4. 修正配额到目标总数（从配额最大的目录增减）
let diff = TARGET_COUNT - assigned;
while (diff !== 0) {
  const sorted = [...quotas.entries()].sort((a, b) => b[1] - a[1]);
  if (diff > 0) {
    // 需要增加：找当前分配最少且还有余量的
    const cand = [...quotas.entries()].filter(([d, q]) => q < byDir.get(d).length).sort((a, b) => a[1] - b[1]);
    if (!cand.length) break;
    quotas.set(cand[0][0], cand[0][1] + 1);
    diff--;
  } else {
    // 需要减少：找当前分配最多且 >1 的
    const cand = sorted.filter(([d, q]) => q > 1);
    if (!cand.length) break;
    quotas.set(cand[0][0], cand[0][1] - 1);
    diff++;
  }
}

// 5. 每个目录内打乱并取配额（先取小的，保证体积可控）
let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const selected = [];
for (const [dir, quota] of quotas) {
  const files = [...byDir.get(dir)].sort((a, b) => a.size - b.size); // 小在前
  // 打乱（Fisher-Yates）
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
  // 交替取：优先小文件混合
  files.sort((a, b) => a.size - b.size);
  // 均匀打散：取前 quota 个（已按大小排序，小文件优先，控制体积）
  const picked = files.slice(0, quota);
  for (const f of picked) {
    const relDir = path.basename(dir);
    selected.push({ full: f.full, dest: `${relDir}/${path.basename(f.full)}`, size: f.size });
  }
}

// 6. 最终校验
console.log(`实际采样: ${selected.length}`);
const sizeSum = selected.reduce((a, b) => a + b.size, 0);
console.log(`总体积: ${(sizeSum / 1024 / 1024).toFixed(1)} MB`);
const extStat = {};
for (const s of selected) {
  const e = path.extname(s.dest).toLowerCase();
  extStat[e] = (extStat[e] || 0) + 1;
}
console.log(`扩展名分布: ${JSON.stringify(extStat)}`);
console.log(`覆盖目录数: ${new Set(selected.map((s) => s.dest.split('/')[0])).size}`);

// 7. 检查目标重名（同目录同名）→ 自动加序号去重
const nameCount = new Map();
for (const s of selected) {
  const k = s.dest;
  const c = (nameCount.get(k) || 0) + 1;
  nameCount.set(k, c);
  if (c > 1) {
    // 重名：加 (N) 后缀
    const dot = k.lastIndexOf('.');
    const base = dot > 0 ? k.substring(0, dot) : k;
    const ext = dot > 0 ? k.substring(dot) : '';
    s.dest = `${base}(${c}).${ext.replace(/^\./, '')}`;
  }
}
// 二次校验
const finalNames = new Map();
let dup2 = 0;
for (const s of selected) {
  if (finalNames.has(s.dest)) { dup2++; console.log(`仍重名: ${s.dest}`); }
  finalNames.set(s.dest, true);
}
console.log(`二次重名: ${dup2}`);

// 8. 写清单
const lines = selected.map((s) => `${s.full}\t${s.dest}`);
fs.writeFileSync(OUT_LIST, lines.join('\n') + '\n', 'utf8');
console.log(`清单已写入: ${OUT_LIST}`);
