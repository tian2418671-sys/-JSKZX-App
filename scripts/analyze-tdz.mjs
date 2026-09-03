import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const dir = 'D:/TkDmGzq/JSKZX - app/JSKZX - app/web/assets';
const file = readdirSync(dir).find(f => f.startsWith('CardLibraryView') && f.endsWith('.js'));
const src = readFileSync(dir + '/' + file, 'utf-8');
console.log('文件:', file, '长度:', src.length);

// 错误栈: CardLibraryView-B7GE9nh_.js:1:8616  (Cannot access 'H' before initialization)
// 但当前哈希可能不同, 先搜错误特征
const idx = src.indexOf('before initialization');
console.log('字符串"before initialization"位置:', idx);

// TDZ 错误的调用位置在 8616 列附近, 直接切片看上下文
const col = 8616;
console.log('\n=== 位置 8616 附近(当前构建) ===');
console.log(src.slice(col - 400, col + 400));

// 搜索可疑模式: 定义前使用 (const/let 提升问题在 vite 构建中常见于 import 与闭包引用)
// 查找 ,H= 或 H() 定义位置
for (const pat of [/\bH\s*=/g, /\bH\(/g]) {
    const matches = [...src.matchAll(pat)];
    console.log(`\n模式 ${pat} 匹配数:`, matches.length);
    for (const m of matches.slice(0, 10)) {
        console.log(`  @${m.index}:`, src.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\n/g, '\\n'));
    }
}
