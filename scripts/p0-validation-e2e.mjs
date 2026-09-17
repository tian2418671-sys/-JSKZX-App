#!/usr/bin/env node

/**
 * P0 高风险项自动化验证脚本
 * 
 * 场景：
 * 0.1 卡片导入与去重
 * 0.2 世界书编辑保存
 * 0.3 预设条目开关有效性
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ADB = 'E:\\AndroidSDK\\platform-tools\\adb.exe';
const SHOTS_DIR = './shots/p0-test-validation';

function ensureShotsDir() {
  if (!fs.existsSync(SHOTS_DIR)) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }
}

function screenshot(name) {
  execSync(`${ADB} shell screencap -p /sdcard/${name}.png`, { stdio: 'inherit' });
  execSync(`${ADB} pull /sdcard/${name}.png "${SHOTS_DIR}/${name}.png"`, { stdio: 'inherit' });
  console.log(`[SCREENSHOT] ${SHOTS_DIR}/${name}.png`);
}

function tap(x, y) {
  execSync(`${ADB} shell input tap ${x} ${y}`, { stdio: 'inherit' });
  console.log(`[TAP] ${x}, ${y}`);
}

function sleep(ms) {
  console.log(`[WAIT] ${ms}ms`);
  return new Promise(r => setTimeout(r, ms));
}

function log(msg, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${msg}`);
}

async function test0_1_ImportDedup() {
  log('=== TEST 0.1: 卡片导入与去重 ===');
  
  // 打开卡片库
  log('打开应用');
  screenshot('0.1-step-01-app-launch');
  
  tap(680, 850);  // 底部 📚 卡片库
  await sleep(1000);
  screenshot('0.1-step-02-library-opened');
  
  // 记录初始卡片数
  log('记录初始卡片数');
  // 由于自动化难以精确读取卡片数，这里仅作流程演示
  
  // 导入同一张卡 3 次（实际操作中应选择同一文件）
  for (let i = 1; i <= 3; i++) {
    log(`第 ${i} 次导入`);
    tap(680, 1400);  // 导入按钮（假设位置）
    await sleep(500);
    
    // 这里实际环境需要选择 SAF 目录
    // 为演示起见，仅记录步骤
    screenshot(`0.1-step-import-${i}`);
    await sleep(2000);
  }
  
  screenshot('0.1-step-final-check');
  log('✓ TEST 0.1 完成（需手工验证最终卡片数是否为 N+1）');
}

async function test0_2_WorldbookEditSave() {
  log('=== TEST 0.2: 世界书编辑保存 ===');
  
  // 打开某张卡片的详情
  log('打开卡片详情');
  tap(540, 600);  // 假设卡片位置
  await sleep(1000);
  screenshot('0.2-step-01-card-detail');
  
  // 进入世界书标签
  log('进入世界书标签');
  tap(540, 400);  // 世界书标签
  await sleep(500);
  screenshot('0.2-step-02-worldbook-tab');
  
  // 新增条目
  log('新增世界书条目');
  tap(950, 1900);  // 新增按钮（假设位置）
  await sleep(500);
  screenshot('0.2-step-03-add-entry');
  
  // 输入内容
  log('输入条目内容');
  tap(540, 900);  // 条目内容输入框
  execSync(`${ADB} shell input text "Test Entry Content"`, { stdio: 'inherit' });
  await sleep(500);
  screenshot('0.2-step-04-content-entered');
  
  // 保存
  log('保存卡片');
  tap(950, 1950);  // 保存按钮（假设位置）
  await sleep(1000);
  screenshot('0.2-step-05-saved');
  
  // 返回卡库
  log('返回卡库，再次打开该卡片验证');
  tap(50, 100);  // 返回按钮（假设位置）
  await sleep(500);
  
  // 重新打开该卡片
  tap(540, 600);
  await sleep(1000);
  tap(540, 400);  // 世界书标签
  await sleep(500);
  screenshot('0.2-step-06-reopen-verify');
  
  log('✓ TEST 0.2 完成（需手工验证条目是否仍在）');
}

async function test0_3_PresetToggleEffective() {
  log('=== TEST 0.3: 预设条目开关有效性 ===');
  
  // 打开预设页
  log('打开预设页');
  tap(680, 1000);  // 底部 ⚙️ 预设
  await sleep(1000);
  screenshot('0.3-step-01-presets-opened');
  
  // 打开某个预设的详情
  log('打开预设详情');
  tap(540, 500);  // 假设预设项位置
  await sleep(500);
  screenshot('0.3-step-02-preset-detail');
  
  // 找到某个 prompt 条目并关闭
  log('关闭某个 prompt 条目');
  tap(900, 700);  // 开关按钮（假设位置）
  await sleep(300);
  screenshot('0.3-step-03-toggle-off');
  
  // 保存
  log('保存预设');
  tap(950, 1950);
  await sleep(1000);
  screenshot('0.3-step-04-saved');
  
  // 返回预设列表，再次打开验证开关状态
  log('重新打开预设验证开关状态');
  tap(50, 100);  // 返回
  await sleep(500);
  
  tap(540, 500);  // 重新打开同一预设
  await sleep(500);
  screenshot('0.3-step-05-reopen-verify');
  
  log('✓ TEST 0.3 完成（需手工验证开关状态是否保存）');
}

async function main() {
  try {
    ensureShotsDir();
    
    log('P0 高风险项自动化验证开始');
    
    await test0_1_ImportDedup();
    await sleep(2000);
    
    await test0_2_WorldbookEditSave();
    await sleep(2000);
    
    await test0_3_PresetToggleEffective();
    
    log('=== 所有 P0 测试完成 ===');
    log('截图已保存至: ' + SHOTS_DIR);
    log('建议手工检查截图序列，验证各场景是否符合预期');
    
  } catch (err) {
    log('❌ 测试失败: ' + err.message, 'ERROR');
    process.exit(1);
  }
}

main();
