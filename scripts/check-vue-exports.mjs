#!/usr/bin/env node
/**
 * 模板 ↔ setup() return 一致性静态检查
 * 扫描 js/mobile 下所有 .vue:模板中 @事件引用的方法名若未出现在 setup 的 return 中,
 * 运行时会报 "xxx is not defined"(构建期不报错) —— 此类 bug 曾导致「预设详情页没接入」。
 * 用法: node scripts/check-vue-exports.mjs [文件...]  ;默认扫描 js/mobile 下所有 vue 文件
 * 排除项: props 名 / v-for 循环变量 / emit / Options API(data/methods)组件 / v-slot 解构。
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (extname(p) === '.vue') out.push(p);
    }
    return out;
}

/** 从 return { 起配平大括号,取完整 return 块文本 */
function matchBalanced(src, start) {
    let depth = 0, i = start, inStr = null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return src.slice(start);
}

function checkFile(file) {
    const src = readFileSync(file, 'utf8');
    const tplMatch = src.match(/<template>([\s\S]*?)<\/template>/);
    if (!tplMatch) return [];
    const tpl = tplMatch[1];
    const scriptMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return [];
    const script = scriptMatch[1];
    // Options API 组件(模板函数在 data/methods) → 跳过
    if (/\bdata\s*\(\s*\)\s*\{|\bmethods\s*:\s*\{/.test(script)) return [];
    // setup return:最后一个 "return {"(排除 return 语句后跟非 { 的)
    const retIdx = script.lastIndexOf('return {');
    if (retIdx < 0) return [];
    const returned = matchBalanced(script, retIdx + 'return '.length);
    // props 键名集合
    const propsSet = new Set();
    const propsMatch = script.match(/props\s*:\s*\{([\s\S]*?)\n\s*\},/);
    if (propsMatch) {
        for (const m of propsMatch[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) propsSet.add(m[1]);
    }
    // v-for 变量
    const loopVars = new Set();
    for (const m of tpl.matchAll(/v-for=["']\(?([^)"']+)\)?\s+in\s+/g)) {
        m[1].split(',').forEach((v) => loopVars.add(v.trim()));
    }
    // 模板引用的事件/表达式函数名
    const used = new Set();
    const re = /@[a-z-]+(?:\.[a-z]+)*="([A-Za-z_$][\w$]*)(?:\(|"|')|:[\w-]+="([A-Za-z_$][\w$]*)\("/g;
    let m;
    while ((m = re.exec(tpl)) !== null) {
        for (const g of [m[1], m[2]]) {
            if (g && !propsSet.has(g) && !loopVars.has(g) && !['emit', '$emit', '$router', '$route'].includes(g)) used.add(g);
        }
    }
    const builtin = /^(true|false|null|undefined|Math|JSON|Object|Array|String|Number|Date|parseInt|parseFloat|isNaN|Object|Set|Map|RegExp)$/;
    const missing = [];
    for (const name of used) {
        if (builtin.test(name)) continue;
        const wordRe = new RegExp('(^|[,\\s\\n])' + name + '($|[,\\s\\n])', 'm');
        if (!wordRe.test(returned)) missing.push(name);
    }
    return missing;
}

const targets = process.argv.slice(2);
const files = targets.length ? targets : walk(join(process.cwd(), 'js', 'mobile'));
let bad = 0;
for (const file of files) {
    try {
        const missing = checkFile(file);
        if (missing.length) {
            bad++;
            console.log(`❌ ${file.replace(process.cwd(), '.')} 模板引用但未导出: ${[...new Set(missing)].join(', ')}`);
        }
    } catch (e) {
        console.log(`⚠️ ${file.replace(process.cwd(), '.')} 解析失败: ${e.message}`);
    }
}
if (!bad) console.log(`✅ 检查完成(${files.length} 个文件):模板引用均已导出`);
process.exit(bad ? 1 : 0);
