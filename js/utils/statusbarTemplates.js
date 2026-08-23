/**
 * 状态栏渲染模板库（15 套风格）
 * 每套模板 = 完整 HTML（<style> 样式 + <div> 结构 + <script> 动态读取酒馆变量渲染）
 * 注入为酒馆正则脚本：findRegex 匹配 AI 输出的 <status>...</status> 块，
 * replaceString 替换为整套模板 HTML —— 模板 script 通过 window.getVariables 读 stat_data 实时渲染。
 *
 * ⚠️ 预览环境无酒馆变量接口（window.getVariables），沙箱 iframe 会显示模板默认值 —— 属预期降级；
 *    注入卡内后实际酒馆聊天中可正常读取变量动态渲染。
 */

// findRegex 统一约定：AI 输出 <status>...</status> 状态块即触发替换
const STATUS_FIND = '<status>([\\s\\S]*?)</status>';

export const STATUSBAR_TEMPLATES = [
    // ============ 模板一：暗黑奇幻 RPG ============
    {
        key: 'dark-rpg',
        icon: '⚔️',
        name: '暗黑奇幻 RPG',
        category: '奇幻 / 剑与魔法 / D&D',
        desc: '深红描边 + 属性条 + 标签云，经典冒险面板',
        fields: 'HP / MP / SP / 理智 / 等级 / 职业',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.dark-rpg {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 1px solid #e94560;
  border-radius: 12px;
  padding: 14px 18px;
  color: #eee;
  font-family: 'Segoe UI', sans-serif;
  box-shadow: 0 0 20px rgba(233,69,96,0.15);
}
.dark-rpg .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(233,69,96,0.3);
  padding-bottom: 8px;
  margin-bottom: 10px;
}
.dark-rpg .name { font-size: 18px; font-weight: bold; color: #e94560; letter-spacing: 1px; }
.dark-rpg .level { font-size: 12px; color: #888; background: rgba(255,255,255,0.06); padding: 2px 10px; border-radius: 20px; }
.dark-rpg .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 6px 16px; }
.dark-rpg .stat { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.dark-rpg .stat .label { color: #888; min-width: 2.2em; }
.dark-rpg .stat .value { font-weight: bold; color: #f0f0f0; }
.dark-rpg .bar-wrap { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dark-rpg .bar-track { flex: 1; height: 5px; background: #2a2a4a; border-radius: 4px; overflow: hidden; }
.dark-rpg .bar-track .fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
.dark-rpg .fill-hp { background: linear-gradient(90deg, #e94560, #ff6b6b); }
.dark-rpg .fill-mp { background: linear-gradient(90deg, #4a9eff, #6bc5ff); }
.dark-rpg .fill-stamina { background: linear-gradient(90deg, #f9ca24, #f0932b); }
.dark-rpg .fill-sanity { background: linear-gradient(90deg, #a29bfe, #6c5ce7); }
.dark-rpg .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
.dark-rpg .tag { font-size: 11px; background: rgba(233,69,96,0.12); color: #e94560; padding: 1px 10px; border-radius: 12px; border: 1px solid rgba(233,69,96,0.15); }
</style>

<div class="dark-rpg" id="rpgBar">
  <div class="header">
    <span class="name" id="rpgName">冒险者</span>
    <span class="level" id="rpgLevel">Lv.1</span>
  </div>
  <div class="stats">
    <div class="stat"><span class="label">❤️</span><span class="value" id="rpgHp">100/100</span></div>
    <div class="stat"><span class="label">💧</span><span class="value" id="rpgMp">50/50</span></div>
    <div class="stat"><span class="label">⚡</span><span class="value" id="rpgSp">80/80</span></div>
    <div class="stat"><span class="label">🧠</span><span class="value" id="rpgSan">70</span></div>
  </div>
  <div class="bar-wrap"><span class="label">HP</span><div class="bar-track"><div class="fill fill-hp" id="rpgHpBar" style="width:100%"></div></div><span id="rpgHpPct">100%</span></div>
  <div class="bar-wrap"><span class="label">MP</span><div class="bar-track"><div class="fill fill-mp" id="rpgMpBar" style="width:100%"></div></div><span id="rpgMpPct">100%</span></div>
  <div class="bar-wrap"><span class="label">SP</span><div class="bar-track"><div class="fill fill-stamina" id="rpgSpBar" style="width:100%"></div></div><span id="rpgSpPct">100%</span></div>
  <div class="tags" id="rpgTags"><span class="tag">🏹 游侠</span><span class="tag">📍 森林</span><span class="tag">⏰ 黄昏</span></div>
</div>

<script>
(function() {
  const map = {
    name: 'rpgName', level: 'rpgLevel', hp: 'rpgHp', mp: 'rpgMp', sp: 'rpgSp', san: 'rpgSan',
    hpBar: 'rpgHpBar', hpPct: 'rpgHpPct', mpBar: 'rpgMpBar', mpPct: 'rpgMpPct',
    spBar: 'rpgSpBar', spPct: 'rpgSpPct', tags: 'rpgTags'
  };
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, mp = c.MP ?? 50, maxMp = c.maxMP ?? 50, sp = c.SP ?? 80, maxSp = c.maxSP ?? 80, san = c.理智 ?? 70;
    document.getElementById(map.name).textContent = c.姓名 || '冒险者';
    document.getElementById(map.level).textContent = 'Lv.' + (c.等级 || 1);
    document.getElementById(map.hp).textContent = hp + '/' + maxHp;
    document.getElementById(map.mp).textContent = mp + '/' + maxMp;
    document.getElementById(map.sp).textContent = sp + '/' + maxSp;
    document.getElementById(map.san).textContent = san;
    document.getElementById(map.hpBar).style.width = Math.min(100, (hp/maxHp)*100) + '%';
    document.getElementById(map.hpPct).textContent = Math.round((hp/maxHp)*100) + '%';
    document.getElementById(map.mpBar).style.width = Math.min(100, (mp/maxMp)*100) + '%';
    document.getElementById(map.mpPct).textContent = Math.round((mp/maxMp)*100) + '%';
    document.getElementById(map.spBar).style.width = Math.min(100, (sp/maxSp)*100) + '%';
    document.getElementById(map.spPct).textContent = Math.round((sp/maxSp)*100) + '%';
    const tags = [];
    if (c.职业) tags.push('🏹 ' + c.职业);
    if (w.当前位置) tags.push('📍 ' + w.当前位置);
    if (w.当前时间) tags.push('⏰ ' + w.当前时间);
    document.getElementById(map.tags).innerHTML = tags.map(t => '<span class="tag">'+t+'</span>').join('');
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板二：赛博朋克 HUD ============
    {
        key: 'cyber-hud',
        icon: '🧪',
        name: '赛博朋克 HUD',
        category: '科幻 / 都市异能 / 超自然调查',
        desc: '青色霓虹 HUD + 脉冲指示灯 + 数据网格',
        fields: 'HP / EMP / 压力 / 信用 / 区域',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.cyber-hud {
  background: #0a0a0f;
  border: 1px solid #00f0ff;
  border-radius: 8px;
  padding: 12px 16px;
  color: #00f0ff;
  font-family: 'Courier New', monospace;
  text-shadow: 0 0 8px rgba(0,240,255,0.2);
  box-shadow: 0 0 30px rgba(0,240,255,0.05), inset 0 0 30px rgba(0,240,255,0.02);
}
.cyber-hud .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,240,255,0.15); padding-bottom: 6px; margin-bottom: 8px; }
.cyber-hud .handle { font-size: 14px; font-weight: bold; letter-spacing: 2px; }
.cyber-hud .handle .dot { display: inline-block; width: 8px; height: 8px; background: #00f0ff; border-radius: 50%; margin-right: 8px; box-shadow: 0 0 12px #00f0ff; animation: pulse-cyber 1.2s infinite; }
.cyber-hud .sys { font-size: 11px; color: #00f0ff88; }
.cyber-hud .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px 12px; }
.cyber-hud .item { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; border-bottom: 1px solid rgba(0,240,255,0.04); }
.cyber-hud .item .lbl { color: #00f0ff66; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
.cyber-hud .item .val { font-weight: bold; }
.cyber-hud .hud-bars { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,240,255,0.08); }
.cyber-hud .hud-bar { display: flex; align-items: center; gap: 8px; font-size: 10px; }
.cyber-hud .hud-bar .track { flex: 1; height: 4px; background: rgba(0,240,255,0.08); border-radius: 2px; overflow: hidden; }
.cyber-hud .hud-bar .track .fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.cyber-hud .fill-cyber-hp { background: #ff0040; box-shadow: 0 0 10px rgba(255,0,64,0.3); }
.cyber-hud .fill-cyber-emp { background: #00f0ff; box-shadow: 0 0 10px rgba(0,240,255,0.3); }
.cyber-hud .fill-cyber-stress { background: #ffaa00; box-shadow: 0 0 10px rgba(255,170,0,0.3); }
@keyframes pulse-cyber { 0%,100%{ opacity:1; } 50%{ opacity:0.3; } }
</style>

<div class="cyber-hud" id="cyberBar">
  <div class="top">
    <span class="handle"><span class="dot"></span><span id="cyberHandle">GHOST-01</span></span>
    <span class="sys" id="cyberSys">● 在线 | v2.4.1</span>
  </div>
  <div class="grid">
    <div class="item"><span class="lbl">层级</span><span class="val" id="cyberTier">3</span></div>
    <div class="item"><span class="lbl">信用</span><span class="val" id="cyberCred">¥12.4k</span></div>
    <div class="item"><span class="lbl">区域</span><span class="val" id="cyberZone">夜之城</span></div>
    <div class="item"><span class="lbl">威胁</span><span class="val" id="cyberThreat">低</span></div>
  </div>
  <div class="hud-bars">
    <div class="hud-bar"><span>HP</span><div class="track"><div class="fill fill-cyber-hp" id="cyberHpBar" style="width:85%"></div></div><span id="cyberHpText">85%</span></div>
    <div class="hud-bar"><span>EMP</span><div class="track"><div class="fill fill-cyber-emp" id="cyberEmpBar" style="width:60%"></div></div><span id="cyberEmpText">60%</span></div>
    <div class="hud-bar"><span>STRESS</span><div class="track"><div class="fill fill-cyber-stress" id="cyberStressBar" style="width:30%"></div></div><span id="cyberStressText">30%</span></div>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, emp = c.EMP ?? 60, stress = c.压力 ?? 30;
    document.getElementById('cyberHandle').textContent = c.代号 || 'GHOST-01';
    document.getElementById('cyberTier').textContent = c.层级 || '3';
    document.getElementById('cyberCred').textContent = '¥' + (c.信用 || '12.4k');
    document.getElementById('cyberZone').textContent = w.当前位置 || '夜之城';
    document.getElementById('cyberThreat').textContent = c.威胁等级 || '低';
    const hpPct = Math.min(100, (hp/maxHp)*100);
    document.getElementById('cyberHpBar').style.width = hpPct + '%';
    document.getElementById('cyberHpText').textContent = Math.round(hpPct) + '%';
    document.getElementById('cyberEmpBar').style.width = Math.min(100, emp) + '%';
    document.getElementById('cyberEmpText').textContent = Math.min(100, Math.round(emp)) + '%';
    document.getElementById('cyberStressBar').style.width = Math.min(100, stress) + '%';
    document.getElementById('cyberStressText').textContent = Math.min(100, Math.round(stress)) + '%';
    document.getElementById('cyberSys').textContent = '● 在线 | ' + (w.当前时间 || 'v2.4.1');
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板三：江湖风 ============
    {
        key: 'jianghu',
        icon: '🏮',
        name: '江湖风',
        category: '武侠 / 仙侠 / 古风',
        desc: '古卷底色 + 楷体 + 修为进度条',
        fields: '境界 / 内力 / 剑意 / 修为',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.jianghu {
  background: linear-gradient(180deg, #1a1410, #251e18);
  border: 1px solid #b8945c;
  border-radius: 8px;
  padding: 14px 18px;
  color: #e8ddd0;
  font-family: 'KaiTi', 'STKaiti', serif;
  box-shadow: inset 0 0 60px rgba(184,148,92,0.04);
  position: relative;
}
.jianghu::before {
  content: '◆ ◇ ◆';
  position: absolute;
  top: -8px; right: 16px;
  font-size: 10px;
  color: #b8945c44;
  letter-spacing: 4px;
}
.jianghu .title { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #b8945c33; padding-bottom: 6px; margin-bottom: 10px; }
.jianghu .name { font-size: 20px; font-weight: bold; color: #d4b48c; letter-spacing: 4px; }
.jianghu .title .sub { font-size: 12px; color: #b8945c88; }
.jianghu .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
.jianghu .grid .item { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; border-bottom: 1px solid #b8945c11; }
.jianghu .grid .item .lbl { color: #b8945c88; }
.jianghu .grid .item .val { color: #f0e6d8; }
.jianghu .cultivation { margin-top: 8px; padding-top: 8px; border-top: 1px solid #b8945c22; }
.jianghu .cultivation .row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.jianghu .cultivation .track { flex: 1; height: 4px; background: #2a221c; border-radius: 2px; overflow: hidden; border: 1px solid #b8945c22; }
.jianghu .cultivation .track .fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #b8945c, #e8c88a); transition: width 0.4s; }
.jianghu .footer { display: flex; gap: 12px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #b8945c11; font-size: 11px; color: #b8945c66; flex-wrap: wrap; }
</style>

<div class="jianghu" id="jianghuBar">
  <div class="title">
    <span class="name" id="jhName">无名</span>
    <span class="sub" id="jhTitle">◇ 江湖散人</span>
  </div>
  <div class="grid">
    <div class="item"><span class="lbl">境界</span><span class="val" id="jhRealm">炼气</span></div>
    <div class="item"><span class="lbl">内力</span><span class="val" id="jhQi">320/500</span></div>
    <div class="item"><span class="lbl">剑意</span><span class="val" id="jhSword">七成</span></div>
    <div class="item"><span class="lbl">所在</span><span class="val" id="jhLoc">竹林</span></div>
  </div>
  <div class="cultivation">
    <div class="row"><span>修为</span><div class="track"><div class="fill" id="jhCultBar" style="width:45%"></div></div><span id="jhCultPct">45%</span></div>
  </div>
  <div class="footer" id="jhFooter"><span>⚔ 仇家：无</span><span>🏮 时辰：亥时</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('jhName').textContent = c.姓名 || '无名';
    document.getElementById('jhTitle').textContent = '◇ ' + (c.称号 || '江湖散人');
    document.getElementById('jhRealm').textContent = c.境界 || '炼气';
    const qi = c.内力 ?? 320, maxQi = c.max内力 ?? 500;
    document.getElementById('jhQi').textContent = qi + '/' + maxQi;
    document.getElementById('jhSword').textContent = c.剑意 || '七成';
    document.getElementById('jhLoc').textContent = w.当前位置 || '竹林';
    const cult = c.修为 ?? 45;
    document.getElementById('jhCultBar').style.width = Math.min(100, cult) + '%';
    document.getElementById('jhCultPct').textContent = Math.min(100, Math.round(cult)) + '%';
    document.getElementById('jhFooter').innerHTML = '<span>⚔ 仇家：' + (c.仇家 || '无') + '</span><span>🏮 时辰：' + (w.时辰 || '亥时') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板四：日常温馨 ============
    {
        key: 'cozy',
        icon: '🌸',
        name: '日常温馨',
        category: '日常 / 治愈 / 校园 / 种田',
        desc: '暖色圆角 + 心情气泡 + 三色进度条',
        fields: '饱食 / 精力 / 好感 / 心情',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.cozy-bar {
  background: linear-gradient(135deg, #fdf6ee, #f5ede4);
  border-radius: 16px;
  padding: 14px 20px;
  color: #4a3f38;
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
  border: 1px solid #e8ddd0;
  box-shadow: 0 4px 20px rgba(74,63,56,0.06);
}
.cozy-bar .head { display: flex; justify-content: space-between; align-items: center; }
.cozy-bar .name { font-size: 18px; font-weight: 600; color: #6b4f3a; }
.cozy-bar .mood { font-size: 14px; color: #b8957a; }
.cozy-bar .stats { display: flex; gap: 16px; margin: 8px 0 6px; flex-wrap: wrap; }
.cozy-bar .stat { display: flex; align-items: center; gap: 4px; font-size: 13px; background: rgba(255,255,255,0.5); padding: 3px 12px 3px 8px; border-radius: 20px; }
.cozy-bar .stat .lbl { color: #b8957a; }
.cozy-bar .stat .val { font-weight: 600; color: #4a3f38; }
.cozy-bar .bars { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
.cozy-bar .bars .row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8a7a6a; }
.cozy-bar .bars .track { flex: 1; height: 5px; background: #ede5dc; border-radius: 4px; overflow: hidden; }
.cozy-bar .bars .track .fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
.cozy-bar .fill-hunger { background: #d4a373; }
.cozy-bar .fill-energy { background: #7cb8a0; }
.cozy-bar .fill-affection { background: #e8a0b4; }
.cozy-bar .foot { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; color: #b8957a; flex-wrap: wrap; border-top: 1px solid #ede5dc; padding-top: 6px; }
</style>

<div class="cozy-bar" id="cozyBar">
  <div class="head">
    <span class="name" id="cozyName">小春</span>
    <span class="mood" id="cozyMood">☀️ 心情不错</span>
  </div>
  <div class="stats">
    <span class="stat"><span class="lbl">❤️</span><span class="val" id="cozyHp">100</span></span>
    <span class="stat"><span class="lbl">💬</span><span class="val" id="cozyAff">85</span></span>
    <span class="stat"><span class="lbl">📍</span><span class="val" id="cozyLoc">小镇</span></span>
  </div>
  <div class="bars">
    <div class="row"><span>🍽️ 饱食</span><div class="track"><div class="fill fill-hunger" id="cozyHunger" style="width:80%"></div></div><span id="cozyHungerText">80%</span></div>
    <div class="row"><span>⚡ 精力</span><div class="track"><div class="fill fill-energy" id="cozyEnergy" style="width:65%"></div></div><span id="cozyEnergyText">65%</span></div>
    <div class="row"><span>💕 好感</span><div class="track"><div class="fill fill-affection" id="cozyAffBar" style="width:85%"></div></div><span id="cozyAffText">85%</span></div>
  </div>
  <div class="foot" id="cozyFoot"><span>📅 春·午后</span><span>🏠 在家</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('cozyName').textContent = c.姓名 || '小春';
    document.getElementById('cozyMood').textContent = (c.心情 || '☀️ 心情不错');
    document.getElementById('cozyHp').textContent = c.HP ?? 100;
    document.getElementById('cozyAff').textContent = c.好感度 ?? 85;
    document.getElementById('cozyLoc').textContent = w.当前位置 || '小镇';
    const hunger = c.饱食 ?? 80, energy = c.精力 ?? 65, aff = c.好感度 ?? 85;
    document.getElementById('cozyHunger').style.width = Math.min(100, hunger) + '%';
    document.getElementById('cozyHungerText').textContent = Math.min(100, Math.round(hunger)) + '%';
    document.getElementById('cozyEnergy').style.width = Math.min(100, energy) + '%';
    document.getElementById('cozyEnergyText').textContent = Math.min(100, Math.round(energy)) + '%';
    document.getElementById('cozyAffBar').style.width = Math.min(100, aff) + '%';
    document.getElementById('cozyAffText').textContent = Math.min(100, Math.round(aff)) + '%';
    document.getElementById('cozyFoot').innerHTML = '<span>📅 ' + (w.季节 || '春') + '·' + (w.时段 || '午后') + '</span><span>🏠 ' + (w.位置 || '在家') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板五：鬼怪灵异 ============
    {
        key: 'ghostly',
        icon: '👻',
        name: '鬼怪灵异',
        category: '鬼怪 / 志怪 / 克苏鲁',
        desc: '阴森暗红 + 怨气/记忆/理智计量条',
        fields: '怨气 / 记忆 / 理智 / 隐匿',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.ghostly {
  background: #0b0808;
  border: 1px solid #3a2a2a;
  border-radius: 8px;
  padding: 14px 18px;
  color: #b8a8a0;
  font-family: 'KaiTi', 'STKaiti', serif;
  box-shadow: inset 0 0 60px rgba(60,30,30,0.2);
  position: relative;
}
.ghostly::after {
  content: '◌ ◌ ◌';
  position: absolute;
  bottom: 4px; right: 12px;
  font-size: 10px;
  color: #3a2a2a;
  letter-spacing: 6px;
}
.ghostly .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #2a1a1a; padding-bottom: 6px; }
.ghostly .name { font-size: 18px; color: #c8b8b0; letter-spacing: 2px; }
.ghostly .rank { font-size: 12px; color: #5a4a4a; }
.ghostly .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin: 6px 0; }
.ghostly .grid .item { display: flex; justify-content: space-between; font-size: 12px; padding: 1px 0; border-bottom: 1px solid #1a1212; }
.ghostly .grid .item .lbl { color: #5a4a4a; }
.ghostly .grid .item .val { color: #c8b8b0; }
.ghostly .gauge { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #1a1212; }
.ghostly .gauge .row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.ghostly .gauge .track { flex: 1; height: 4px; background: #1a1212; border-radius: 2px; overflow: hidden; }
.ghostly .gauge .track .fill { height: 100%; border-radius: 2px; transition: width 0.4s; }
.ghostly .fill-wrath { background: #6a2020; box-shadow: 0 0 12px rgba(106,32,32,0.3); }
.ghostly .fill-memory { background: #4a5a5a; box-shadow: 0 0 12px rgba(74,90,90,0.2); }
.ghostly .fill-sanity { background: #5a3a4a; box-shadow: 0 0 12px rgba(90,58,74,0.2); }
</style>

<div class="ghostly" id="ghostlyBar">
  <div class="head">
    <span class="name" id="ghostName">？？？</span>
    <span class="rank" id="ghostRank">游魂</span>
  </div>
  <div class="grid">
    <div class="item"><span class="lbl">怨气</span><span class="val" id="ghostWrath">45</span></div>
    <div class="item"><span class="lbl">记忆</span><span class="val" id="ghostMem">62</span></div>
    <div class="item"><span class="lbl">隐匿</span><span class="val" id="ghostHide">30%</span></div>
    <div class="item"><span class="lbl">所在</span><span class="val" id="ghostLoc">废弃医院</span></div>
  </div>
  <div class="gauge">
    <div class="row"><span>怨气</span><div class="track"><div class="fill fill-wrath" id="ghostWrathBar" style="width:45%"></div></div><span id="ghostWrathText">45%</span></div>
    <div class="row"><span>记忆</span><div class="track"><div class="fill fill-memory" id="ghostMemBar" style="width:62%"></div></div><span id="ghostMemText">62%</span></div>
    <div class="row"><span>理智</span><div class="track"><div class="fill fill-sanity" id="ghostSanBar" style="width:70%"></div></div><span id="ghostSanText">70%</span></div>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const g = d.鬼魂 || {};
    const w = d.世界 || {};
    const h = d.隐藏 || {};
    const name = g.姓名 || '？？？';
    const remember = g.是否记得自己 !== false;
    const mem = g.记忆 ?? 62;
    document.getElementById('ghostName').textContent = (mem < 30 || !remember) ? '？？？' : name;
    document.getElementById('ghostRank').textContent = g.阶位 || '游魂';
    document.getElementById('ghostWrath').textContent = g.怨气 ?? 45;
    document.getElementById('ghostMem').textContent = mem;
    document.getElementById('ghostHide').textContent = (g.隐匿度 ?? 30) + '%';
    document.getElementById('ghostLoc').textContent = w.当前区域 || '废弃医院';
    const wrath = g.怨气 ?? 45, sanity = h.理智 ?? 70;
    document.getElementById('ghostWrathBar').style.width = Math.min(100, wrath) + '%';
    document.getElementById('ghostWrathText').textContent = Math.min(100, Math.round(wrath)) + '%';
    document.getElementById('ghostMemBar').style.width = Math.min(100, mem) + '%';
    document.getElementById('ghostMemText').textContent = Math.min(100, Math.round(mem)) + '%';
    document.getElementById('ghostSanBar').style.width = Math.min(100, sanity) + '%';
    document.getElementById('ghostSanText').textContent = Math.min(100, Math.round(sanity)) + '%';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板六：极简横向条 ============
    {
        key: 'mini',
        icon: '⚡',
        name: '极简横向条',
        category: '紧凑通用 / 多行拼接',
        desc: '半透明胶囊条，空间友好，可拼多行',
        fields: 'HP / MP / 金币 / 位置',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.mini-bar {
  display: flex;
  align-items: center;
  gap: 8px 16px;
  padding: 6px 12px;
  background: rgba(0,0,0,0.65);
  border-radius: 6px;
  color: #ccc;
  font-size: 12px;
  font-family: 'Segoe UI', sans-serif;
  flex-wrap: wrap;
  border: 1px solid rgba(255,255,255,0.04);
  backdrop-filter: blur(4px);
}
.mini-bar .sep { color: #333; }
.mini-bar .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.mini-bar .value { font-weight: 600; color: #eee; }
.mini-bar .hp { color: #ff6b6b; }
.mini-bar .mp { color: #4a9eff; }
.mini-bar .gold { color: #f9ca24; }
.mini-bar .mini-track { display: inline-flex; align-items: center; gap: 4px; }
.mini-bar .mini-track .track { width: 50px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; display: inline-block; }
.mini-bar .mini-track .track .fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
</style>

<div class="mini-bar" id="miniBar">
  <span><span class="label">👤</span> <span class="value" id="miniName">旅人</span></span>
  <span class="sep">|</span>
  <span class="mini-track"><span class="label">HP</span><span class="track"><span class="fill hp" id="miniHp" style="width:80%"></span></span><span class="value" id="miniHpText">80</span></span>
  <span class="sep">|</span>
  <span class="mini-track"><span class="label">MP</span><span class="track"><span class="fill mp" id="miniMp" style="width:60%"></span></span><span class="value" id="miniMpText">60</span></span>
  <span class="sep">|</span>
  <span><span class="label">💰</span> <span class="value gold" id="miniGold">120</span></span>
  <span class="sep">|</span>
  <span><span class="label">📍</span> <span class="value" id="miniLoc"> tavern</span></span>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('miniName').textContent = c.姓名 || '旅人';
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, mp = c.MP ?? 60, maxMp = c.maxMP ?? 100;
    const hpPct = Math.min(100, (hp/maxHp)*100);
    const mpPct = Math.min(100, (mp/maxMp)*100);
    document.getElementById('miniHp').style.width = hpPct + '%';
    document.getElementById('miniHpText').textContent = Math.round(hpPct);
    document.getElementById('miniMp').style.width = mpPct + '%';
    document.getElementById('miniMpText').textContent = Math.round(mpPct);
    document.getElementById('miniGold').textContent = c.金币 ?? 120;
    document.getElementById('miniLoc').textContent = w.当前位置 || ' tavern';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板七：像素复古 ============
    {
        key: 'pixel',
        icon: '🎮',
        name: '像素复古',
        category: '复古 RPG / 像素风 / Meta',
        desc: '8-bit 像素框 + 硬边方块条',
        fields: 'HP / MP / 金币 / 等级',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.pixel-bar {
  background: #1a1a2e;
  border: 4px solid #4a4a6a;
  padding: 10px 14px;
  color: #c8c8d8;
  font-family: 'Courier New', monospace;
  image-rendering: pixelated;
  box-shadow: inset 0 0 0 2px #2a2a4a;
  border-radius: 0;
}
.pixel-bar .top { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 2px solid #4a4a6a; padding-bottom: 4px; margin-bottom: 6px; }
.pixel-bar .top .name { color: #7af0a0; }
.pixel-bar .top .lvl { color: #f0c87a; }
.pixel-bar .row { display: flex; gap: 16px; font-size: 12px; flex-wrap: wrap; }
.pixel-bar .row .stat { display: flex; gap: 2px; }
.pixel-bar .row .stat .lbl { color: #6a6a8a; }
.pixel-bar .row .stat .val { color: #e0e0f0; }
.pixel-bar .pixel-bars { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.pixel-bar .pixel-bars .pb { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.pixel-bar .pixel-bars .pb .track { flex: 1; height: 8px; background: #2a2a4a; border: 2px solid #3a3a5a; }
.pixel-bar .pixel-bars .pb .track .fill { height: 100%; background: #7af0a0; transition: width 0.1s; }
.pixel-bar .pixel-bars .pb .track .fill.hp-pixel { background: #f07a7a; }
.pixel-bar .pixel-bars .pb .track .fill.mp-pixel { background: #7aa0f0; }
</style>

<div class="pixel-bar" id="pixelBar">
  <div class="top">
    <span class="name" id="pixelName">HERO</span>
    <span class="lvl" id="pixelLvl">LV 01</span>
  </div>
  <div class="row">
    <span class="stat"><span class="lbl">HP</span><span class="val" id="pixelHp">100/100</span></span>
    <span class="stat"><span class="lbl">MP</span><span class="val" id="pixelMp">50/50</span></span>
    <span class="stat"><span class="lbl">G</span><span class="val" id="pixelGold">0</span></span>
  </div>
  <div class="pixel-bars">
    <div class="pb"><span>HP</span><div class="track"><div class="fill hp-pixel" id="pixelHpBar" style="width:100%"></div></div></div>
    <div class="pb"><span>MP</span><div class="track"><div class="fill mp-pixel" id="pixelMpBar" style="width:100%"></div></div></div>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    document.getElementById('pixelName').textContent = (c.姓名 || 'HERO').toUpperCase();
    document.getElementById('pixelLvl').textContent = 'LV ' + String(c.等级 || 1).padStart(2, '0');
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, mp = c.MP ?? 50, maxMp = c.maxMP ?? 50;
    document.getElementById('pixelHp').textContent = hp + '/' + maxHp;
    document.getElementById('pixelMp').textContent = mp + '/' + maxMp;
    document.getElementById('pixelGold').textContent = c.金币 ?? 0;
    document.getElementById('pixelHpBar').style.width = Math.min(100, (hp/maxHp)*100) + '%';
    document.getElementById('pixelMpBar').style.width = Math.min(100, (mp/maxMp)*100) + '%';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板八：角色关系网 ============
    {
        key: 'relation',
        icon: '💫',
        name: '角色关系网',
        category: '社交 / 多角色 / 后宫 / 团队',
        desc: '关系列表 + 好感条，群像场景专用',
        fields: '关系列表 / 好感度 / 状态',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.relation-bar {
  background: #14141e;
  border: 1px solid #3a3a52;
  border-radius: 10px;
  padding: 12px 16px;
  color: #c8c8dc;
  font-family: 'Segoe UI', sans-serif;
}
.relation-bar .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2a2a3e; padding-bottom: 6px; margin-bottom: 8px; }
.relation-bar .head .title { font-size: 13px; color: #8a8aaa; letter-spacing: 2px; }
.relation-bar .head .count { font-size: 11px; color: #5a5a7a; }
.relation-bar .list { display: flex; flex-direction: column; gap: 4px; }
.relation-bar .list .entry { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.02); }
.relation-bar .list .entry .avatar { width: 20px; height: 20px; border-radius: 50%; background: #2a2a42; display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
.relation-bar .list .entry .rname { flex: 1; color: #e0e0f0; }
.relation-bar .list .entry .rrel { font-size: 10px; color: #8a8aaa; }
.relation-bar .list .entry .rbar { width: 60px; height: 3px; background: #2a2a42; border-radius: 2px; overflow: hidden; }
.relation-bar .list .entry .rbar .fill { height: 100%; border-radius: 2px; transition: width 0.4s; }
.relation-bar .fill-like { background: #7ad0a0; }
.relation-bar .fill-neutral { background: #8a8aaa; }
.relation-bar .fill-hate { background: #d07a7a; }
</style>

<div class="relation-bar" id="relBar">
  <div class="head">
    <span class="title">👥 关系网</span>
    <span class="count" id="relCount">0 人</span>
  </div>
  <div class="list" id="relList">
    <div class="entry"><span class="avatar">🌸</span><span class="rname">小春</span><span class="rrel">好感</span><span class="rbar"><div class="fill fill-like" style="width:80%"></div></span></div>
    <div class="entry"><span class="avatar">🔮</span><span class="rname">影</span><span class="rrel">中立</span><span class="rbar"><div class="fill fill-neutral" style="width:50%"></div></span></div>
    <div class="entry"><span class="avatar">⚔</span><span class="rname">黑刃</span><span class="rrel">敌意</span><span class="rbar"><div class="fill fill-hate" style="width:20%"></div></span></div>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const rels = d.关系 || {};
    const entries = Object.entries(rels);
    document.getElementById('relCount').textContent = entries.length + ' 人';
    if (entries.length) {
      const map = { '友好': 'fill-like', '中立': 'fill-neutral', '敌意': 'fill-hate', '好感': 'fill-like', '厌恶': 'fill-hate' };
      document.getElementById('relList').innerHTML = entries.map(([name, info]) => {
        const rel = info.关系 || '中立';
        const val = info.数值 ?? 50;
        const cls = map[rel] || 'fill-neutral';
        const emoji = info.表情 || '👤';
        return '<div class="entry"><span class="avatar">' + emoji + '</span><span class="rname">' + name + '</span><span class="rrel">' + rel + '</span><span class="rbar"><div class="fill ' + cls + '" style="width:' + Math.min(100,val) + '%"></div></span></div>';
      }).join('');
    } else {
      document.getElementById('relList').innerHTML = '<div style="color:#5a5a7a;font-size:12px;padding:4px 0;">（暂无关系记录）</div>';
    }
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板九：日志体状态栏 ============
    {
        key: 'log',
        icon: '🗡️',
        name: '日志体状态栏',
        category: '叙事 / 文字沉浸',
        desc: '文字日志式排版，不打破叙事氛围',
        fields: '生命 / 精力 / 位置 / 任务 / 天气 / 天数',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.log-bar {
  background: #0d0b0a;
  border: 1px solid #3a2f28;
  border-radius: 6px;
  padding: 14px 18px;
  color: #b8aaa0;
  font-family: 'KaiTi', 'STKaiti', 'Georgia', serif;
  line-height: 1.7;
  box-shadow: inset 0 0 40px rgba(40,30,20,0.2);
}
.log-bar .log-line { font-size: 13px; color: #8a7a6a; letter-spacing: 0.5px; border-bottom: 1px solid #1a1410; padding: 2px 0; }
.log-bar .log-line .highlight { color: #d4c4b0; font-weight: bold; }
.log-bar .log-line .stat { color: #9a8a7a; font-size: 12px; }
.log-bar .log-line .emoji { margin-right: 6px; }
.log-bar .log-footer { margin-top: 6px; padding-top: 6px; border-top: 1px solid #1a1410; font-size: 11px; color: #5a4a3a; display: flex; gap: 16px; flex-wrap: wrap; }
</style>

<div class="log-bar" id="logBar">
  <div class="log-line"><span class="emoji">👤</span> 姓名：<span class="highlight" id="logName">旅人</span> <span class="stat" id="logTitle">· 无名者</span></div>
  <div class="log-line"><span class="emoji">❤️</span> 生命：<span class="highlight" id="logHp">100</span> / <span id="logMaxHp">100</span> <span class="stat" id="logHpState">（健康）</span></div>
  <div class="log-line"><span class="emoji">⚡</span> 精力：<span class="highlight" id="logSp">80</span> / <span id="logMaxSp">80</span></div>
  <div class="log-line"><span class="emoji">📍</span> 位置：<span class="highlight" id="logLoc"> tavern</span> <span class="stat" id="logTime">· 黄昏</span></div>
  <div class="log-line"><span class="emoji">📋</span> 当前：<span class="highlight" id="logTask">无</span></div>
  <div class="log-footer">
    <span id="logWeather">🌤️ 晴朗</span>
    <span id="logDay">📅 第 3 天</span>
    <span id="logNote">💭 一切尚好</span>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('logName').textContent = c.姓名 || '旅人';
    document.getElementById('logTitle').textContent = '· ' + (c.称号 || '无名者');
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, sp = c.SP ?? 80, maxSp = c.maxSP ?? 80;
    document.getElementById('logHp').textContent = hp;
    document.getElementById('logMaxHp').textContent = maxHp;
    const hpPct = hp / maxHp;
    document.getElementById('logHpState').textContent = hpPct > 0.7 ? '（健康）' : hpPct > 0.3 ? '（轻伤）' : '（重伤）';
    document.getElementById('logSp').textContent = sp;
    document.getElementById('logMaxSp').textContent = maxSp;
    document.getElementById('logLoc').textContent = w.当前位置 || ' tavern';
    document.getElementById('logTime').textContent = '· ' + (w.时辰 || '黄昏');
    document.getElementById('logTask').textContent = w.当前任务 || '无';
    document.getElementById('logWeather').textContent = (w.天气 || '🌤️ 晴朗');
    document.getElementById('logDay').textContent = '📅 第 ' + (c.天数 || 3) + ' 天';
    document.getElementById('logNote').textContent = '💭 ' + (c.心情 || '一切尚好');
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十：卡片式状态栏 ============
    {
        key: 'card',
        icon: '🃏',
        name: '卡片式状态栏',
        category: '桌面 / 信息聚合',
        desc: '深色卡片头 + 三列信息网格，信息密集干净',
        fields: '生命 / 精神 / 好感 / 位置 / 任务 / 资产',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.card-bar {
  background: #f0ece6;
  border-radius: 12px;
  padding: 0;
  color: #2a2420;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  border: 1px solid #e0d8d0;
  overflow: hidden;
}
.card-bar .card-head {
  background: #2a2420;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-bar .card-head .card-name { color: #f0ece6; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
.card-bar .card-head .card-badge { font-size: 11px; color: #b0a89a; background: rgba(255,255,255,0.06); padding: 2px 12px; border-radius: 20px; }
.card-bar .card-body { padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 12px; }
.card-bar .card-body .citem { display: flex; flex-direction: column; padding: 4px 0; border-bottom: 1px solid #e8e0d8; }
.card-bar .card-body .citem .clbl { font-size: 9px; text-transform: uppercase; color: #9a928a; letter-spacing: 1px; }
.card-bar .card-body .citem .cval { font-size: 15px; font-weight: 600; color: #2a2420; }
.card-bar .card-body .citem .csub { font-size: 11px; color: #8a827a; }
.card-bar .card-foot { background: #f8f4ee; padding: 8px 16px; border-top: 1px solid #e8e0d8; display: flex; gap: 16px; font-size: 11px; color: #8a827a; flex-wrap: wrap; }
</style>

<div class="card-bar" id="cardBar">
  <div class="card-head">
    <span class="card-name" id="cardName">Agent</span>
    <span class="card-badge" id="cardBadge">● 活跃</span>
  </div>
  <div class="card-body">
    <div class="citem"><span class="clbl">生命</span><span class="cval" id="cardHp">100</span><span class="csub" id="cardHpSub">/ 100</span></div>
    <div class="citem"><span class="clbl">精神</span><span class="cval" id="cardSan">85</span><span class="csub" id="cardSanSub">稳定</span></div>
    <div class="citem"><span class="clbl">好感</span><span class="cval" id="cardAff">72</span><span class="csub" id="cardAffSub">↑ 上升</span></div>
    <div class="citem"><span class="clbl">位置</span><span class="cval" id="cardLoc">城区</span><span class="csub" id="cardZone">B-7</span></div>
    <div class="citem"><span class="clbl">任务</span><span class="cval" id="cardTask">调查</span><span class="csub" id="cardTaskSub">35%</span></div>
    <div class="citem"><span class="clbl">资产</span><span class="cval" id="cardGold">¥2.4k</span><span class="csub" id="cardItem">3 件</span></div>
  </div>
  <div class="card-foot" id="cardFoot">
    <span>⏰ 13:47</span>
    <span>📅 2047.09.12</span>
    <span>📡 信号正常</span>
  </div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('cardName').textContent = c.姓名 || 'Agent';
    document.getElementById('cardBadge').textContent = (c.状态 || '● 活跃');
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100;
    document.getElementById('cardHp').textContent = hp;
    document.getElementById('cardHpSub').textContent = '/ ' + maxHp;
    const san = c.理智 ?? 85;
    document.getElementById('cardSan').textContent = san;
    document.getElementById('cardSanSub').textContent = san > 70 ? '稳定' : san > 40 ? '紧张' : '危机';
    const aff = c.好感度 ?? 72;
    document.getElementById('cardAff').textContent = aff;
    document.getElementById('cardAffSub').textContent = (c.好感趋势 || '↑ 上升');
    document.getElementById('cardLoc').textContent = w.当前位置 || '城区';
    document.getElementById('cardZone').textContent = w.区域 || 'B-7';
    document.getElementById('cardTask').textContent = w.当前任务 || '调查';
    document.getElementById('cardTaskSub').textContent = (w.任务进度 ?? '35%');
    document.getElementById('cardGold').textContent = '¥' + (c.资产 || '2.4k');
    document.getElementById('cardItem').textContent = (c.物品数 || 3) + ' 件';
    document.getElementById('cardFoot').innerHTML = '<span>⏰ ' + (w.时间 || '13:47') + '</span><span>📅 ' + (w.日期 || '2047.09.12') + '</span><span>📡 ' + (w.信号 || '正常') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十一：波浪动态条 ============
    {
        key: 'wave',
        icon: '🌊',
        name: '波浪动态条',
        category: '海洋 / 能量 / 治愈',
        desc: '海洋渐变 + 潮汐/能量/压力条，水元素专属',
        fields: '潮汐 / 能量 / 压力 / 深度 / 流速 / 温度',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.wave-bar {
  background: linear-gradient(180deg, #0a1a2a, #0d1f2e);
  border: 1px solid #2a5a7a;
  border-radius: 10px;
  padding: 14px 18px;
  color: #8ac8e8;
  font-family: 'Segoe UI', sans-serif;
  position: relative;
  overflow: hidden;
}
.wave-bar::before {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 40%;
  background: linear-gradient(180deg, transparent, rgba(30,100,140,0.08));
  pointer-events: none;
}
.wave-bar .top { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.wave-bar .top .name { font-size: 18px; font-weight: 300; letter-spacing: 4px; color: #7ac0e0; }
.wave-bar .top .phase { font-size: 12px; color: #4a8aaa; }
.wave-bar .wave-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin: 8px 0; position: relative; z-index: 1; }
.wave-bar .wave-grid .witem { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; border-bottom: 1px solid rgba(42,90,122,0.15); }
.wave-bar .wave-grid .witem .wlbl { color: #4a8aaa; }
.wave-bar .wave-grid .witem .wval { color: #b0e8f0; font-weight: 500; }
.wave-bar .wave-bars { display: flex; flex-direction: column; gap: 4px; position: relative; z-index: 1; }
.wave-bar .wave-bars .wb { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.wave-bar .wave-bars .wb .track { flex: 1; height: 6px; background: rgba(42,90,122,0.2); border-radius: 4px; overflow: hidden; }
.wave-bar .wave-bars .wb .track .fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.wave-bar .fill-tide { background: linear-gradient(90deg, #1a6a8a, #5ac8e8); }
.wave-bar .fill-flow { background: linear-gradient(90deg, #2a8a7a, #7ae8d0); }
.wave-bar .fill-depth { background: linear-gradient(90deg, #1a3a5a, #4a8aaa); }
.wave-bar .footer { display: flex; gap: 14px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(42,90,122,0.15); font-size: 11px; color: #4a8aaa; flex-wrap: wrap; position: relative; z-index: 1; }
</style>

<div class="wave-bar" id="waveBar">
  <div class="top">
    <span class="name" id="waveName">汐</span>
    <span class="phase" id="wavePhase">🌊 涨潮</span>
  </div>
  <div class="wave-grid">
    <div class="witem"><span class="wlbl">深度</span><span class="wval" id="waveDepth">100m</span></div>
    <div class="witem"><span class="wlbl">流速</span><span class="wval" id="waveFlow">3.2 kn</span></div>
    <div class="witem"><span class="wlbl">温度</span><span class="wval" id="waveTemp">18°C</span></div>
    <div class="witem"><span class="wlbl">可见</span><span class="wval" id="waveVis">12m</span></div>
  </div>
  <div class="wave-bars">
    <div class="wb"><span>潮汐</span><div class="track"><div class="fill fill-tide" id="waveTide" style="width:70%"></div></div><span id="waveTideText">70%</span></div>
    <div class="wb"><span>能量</span><div class="track"><div class="fill fill-flow" id="waveFlowBar" style="width:55%"></div></div><span id="waveFlowText">55%</span></div>
    <div class="wb"><span>压力</span><div class="track"><div class="fill fill-depth" id="wavePress" style="width:30%"></div></div><span id="wavePressText">30%</span></div>
  </div>
  <div class="footer" id="waveFoot"><span>🌌 月相 满月</span><span>🐚 贝壳 3</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('waveName').textContent = c.姓名 || '汐';
    document.getElementById('wavePhase').textContent = (c.潮汐 || '🌊 涨潮');
    document.getElementById('waveDepth').textContent = (c.深度 || '100') + 'm';
    document.getElementById('waveFlow').textContent = (c.流速 || '3.2') + ' kn';
    document.getElementById('waveTemp').textContent = (c.温度 || '18') + '°C';
    document.getElementById('waveVis').textContent = (c.可见度 || '12') + 'm';
    const tide = c.潮汐值 ?? 70, flow = c.能量 ?? 55, press = c.压力 ?? 30;
    document.getElementById('waveTide').style.width = Math.min(100, tide) + '%';
    document.getElementById('waveTideText').textContent = Math.min(100, Math.round(tide)) + '%';
    document.getElementById('waveFlowBar').style.width = Math.min(100, flow) + '%';
    document.getElementById('waveFlowText').textContent = Math.min(100, Math.round(flow)) + '%';
    document.getElementById('wavePress').style.width = Math.min(100, press) + '%';
    document.getElementById('wavePressText').textContent = Math.min(100, Math.round(press)) + '%';
    document.getElementById('waveFoot').innerHTML = '<span>🌌 ' + (c.月相 || '满月') + '</span><span>🐚 ' + (c.物品 || '贝壳 3') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十二：脑图式状态 ============
    {
        key: 'mind',
        icon: '🧠',
        name: '脑图式状态',
        category: '精神 / 心理 / 梦境',
        desc: '三环能量圈 + 精神数值，意识流专属',
        fields: '理智 / 灵性 / 记忆 / 直觉 / 情绪',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.mind-bar {
  background: #0a080e;
  border: 1px solid #3a2a4a;
  border-radius: 8px;
  padding: 14px 18px;
  color: #c8b8d0;
  font-family: 'Georgia', serif;
}
.mind-bar .mind-top { display: flex; justify-content: space-between; border-bottom: 1px solid #2a1a3a; padding-bottom: 6px; }
.mind-bar .mind-top .name { font-size: 16px; letter-spacing: 3px; color: #d0c0d8; }
.mind-bar .mind-top .state { font-size: 12px; color: #6a5a7a; }
.mind-bar .mind-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 10px; margin: 6px 0; }
.mind-bar .mind-grid .mi { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid #1a1220; }
.mind-bar .mind-grid .mi .milbl { font-size: 9px; text-transform: uppercase; color: #5a4a6a; letter-spacing: 2px; }
.mind-bar .mind-grid .mi .mival { font-size: 16px; font-weight: 300; color: #e0d0e8; }
.mind-bar .mind-grid .mi .misub { font-size: 10px; color: #6a5a7a; }
.mind-bar .mind-rings { display: flex; gap: 20px; margin: 6px 0; padding: 8px 0; border-top: 1px solid #1a1220; border-bottom: 1px solid #1a1220; justify-content: center; }
.mind-bar .mind-rings .ring { display: flex; flex-direction: column; align-items: center; }
.mind-bar .mind-rings .ring .ring-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #3a2a4a; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 300; background: rgba(26,18,32,0.5); }
.mind-bar .mind-rings .ring .ring-circle.high { border-color: #8a5a9a; color: #d0a0e0; }
.mind-bar .mind-rings .ring .ring-circle.mid { border-color: #6a5a7a; color: #b0a0b8; }
.mind-bar .mind-rings .ring .ring-circle.low { border-color: #3a2a4a; color: #6a5a7a; }
.mind-bar .mind-rings .ring .ring-lbl { font-size: 9px; color: #5a4a6a; margin-top: 3px; text-transform: uppercase; letter-spacing: 1px; }
.mind-bar .mind-foot { display: flex; gap: 12px; font-size: 11px; color: #5a4a6a; padding-top: 6px; flex-wrap: wrap; }
</style>

<div class="mind-bar" id="mindBar">
  <div class="mind-top">
    <span class="name" id="mindName">潜意识</span>
    <span class="state" id="mindState">🧠 清醒</span>
  </div>
  <div class="mind-grid">
    <div class="mi"><span class="milbl">理智</span><span class="mival" id="mindSan">80</span><span class="misub">/ 100</span></div>
    <div class="mi"><span class="milbl">灵性</span><span class="mival" id="mindSpirit">65</span><span class="misub">↑ 活跃</span></div>
    <div class="mi"><span class="milbl">记忆</span><span class="mival" id="mindMem">72</span><span class="misub">% 清晰</span></div>
  </div>
  <div class="mind-rings">
    <div class="ring"><div class="ring-circle high" id="mindRing1">⚡</div><span class="ring-lbl">直觉</span></div>
    <div class="ring"><div class="ring-circle mid" id="mindRing2">🌀</div><span class="ring-lbl">情绪</span></div>
    <div class="ring"><div class="ring-circle low" id="mindRing3">🌙</div><span class="ring-lbl">潜识</span></div>
  </div>
  <div class="mind-foot" id="mindFoot"><span>💭 梦境碎片 3</span><span>🔮 预兆 无</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    document.getElementById('mindName').textContent = c.姓名 || '潜意识';
    document.getElementById('mindState').textContent = (c.意识状态 || '🧠 清醒');
    const san = c.理智 ?? 80, spirit = c.灵性 ?? 65, mem = c.记忆 ?? 72;
    document.getElementById('mindSan').textContent = san;
    document.getElementById('mindSpirit').textContent = spirit;
    document.getElementById('mindSpirit').style.color = spirit > 70 ? '#d0a0e0' : spirit > 40 ? '#b0a0b8' : '#6a5a7a';
    document.getElementById('mindMem').textContent = mem;
    const ringStates = [c.直觉 ?? 80, c.情绪 ?? 50, c.潜意识 ?? 30];
    ['mindRing1','mindRing2','mindRing3'].forEach((id, i) => {
      const el = document.getElementById(id);
      const v = ringStates[i];
      el.className = 'ring-circle ' + (v > 70 ? 'high' : v > 40 ? 'mid' : 'low');
      el.textContent = i === 0 ? '⚡' : i === 1 ? '🌀' : '🌙';
    });
    document.getElementById('mindFoot').innerHTML = '<span>💭 ' + (c.梦境 || '碎片 3') + '</span><span>🔮 ' + (c.预兆 || '无') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十三：星际航行 HUD ============
    {
        key: 'star',
        icon: '🌌',
        name: '星际航行 HUD',
        category: '太空 / 机甲 / 机战',
        desc: '星舰控制台风格，护盾/引擎/船体三态条',
        fields: '护盾 / 引擎 / 船体 / 航速 / 距离',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.star-bar {
  background: #000408;
  border: 1px solid #1a3a4a;
  border-radius: 6px;
  padding: 12px 16px;
  color: #6ac8e8;
  font-family: 'Courier New', monospace;
  text-shadow: 0 0 8px rgba(60,160,200,0.1);
}
.star-bar .star-top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0a1a2a; padding-bottom: 4px; }
.star-bar .star-top .ship { font-size: 14px; letter-spacing: 3px; color: #8ad8f0; }
.star-bar .star-top .callsign { font-size: 11px; color: #3a7a8a; }
.star-bar .star-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 8px; margin: 4px 0; }
.star-bar .star-grid .si { display: flex; justify-content: space-between; font-size: 11px; padding: 1px 0; border-bottom: 1px solid #0a1a2a; }
.star-bar .star-grid .si .silbl { color: #3a7a8a; }
.star-bar .star-grid .si .sival { color: #8ad8f0; }
.star-bar .star-bars { display: flex; flex-direction: column; gap: 2px; margin: 4px 0; padding: 4px 0; border-top: 1px solid #0a1a2a; border-bottom: 1px solid #0a1a2a; }
.star-bar .star-bars .sb { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.star-bar .star-bars .sb .track { flex: 1; height: 4px; background: #0a1a2a; border-radius: 2px; overflow: hidden; border: 1px solid #1a2a3a; }
.star-bar .star-bars .sb .track .fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.star-bar .fill-shield { background: linear-gradient(90deg, #2a6a8a, #6ac8e8); }
.star-bar .fill-engine { background: linear-gradient(90deg, #8a6a2a, #e8c86a); }
.star-bar .fill-hull { background: linear-gradient(90deg, #4a4a5a, #8a8aaa); }
.star-bar .star-foot { display: flex; gap: 12px; font-size: 10px; color: #3a7a8a; padding-top: 4px; flex-wrap: wrap; }
</style>

<div class="star-bar" id="starBar">
  <div class="star-top">
    <span class="ship" id="starShip">▶ ARGO</span>
    <span class="callsign" id="starCallsign">● 在线</span>
  </div>
  <div class="star-grid">
    <div class="si"><span class="silbl">航速</span><span class="sival" id="starSpeed">0.8c</span></div>
    <div class="si"><span class="silbl">距离</span><span class="sival" id="starDist">3.2 LY</span></div>
    <div class="si"><span class="silbl">温度</span><span class="sival" id="starTemp">-270°C</span></div>
  </div>
  <div class="star-bars">
    <div class="sb"><span>护盾</span><div class="track"><div class="fill fill-shield" id="starShield" style="width:85%"></div></div><span id="starShieldText">85%</span></div>
    <div class="sb"><span>引擎</span><div class="track"><div class="fill fill-engine" id="starEngine" style="width:60%"></div></div><span id="starEngineText">60%</span></div>
    <div class="sb"><span>船体</span><div class="track"><div class="fill fill-hull" id="starHull" style="width:95%"></div></div><span id="starHullText">95%</span></div>
  </div>
  <div class="star-foot" id="starFoot"><span>🛸 目标：猎户座</span><span>📡 信号：稳定</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('starShip').textContent = '▶ ' + (c.飞船 || 'ARGO');
    document.getElementById('starCallsign').textContent = (c.状态 || '● 在线');
    document.getElementById('starSpeed').textContent = c.航速 || '0.8c';
    document.getElementById('starDist').textContent = c.距离 || '3.2 LY';
    document.getElementById('starTemp').textContent = c.温度 || '-270°C';
    const shield = c.护盾 ?? 85, engine = c.引擎 ?? 60, hull = c.船体 ?? 95;
    document.getElementById('starShield').style.width = Math.min(100, shield) + '%';
    document.getElementById('starShieldText').textContent = Math.min(100, Math.round(shield)) + '%';
    document.getElementById('starEngine').style.width = Math.min(100, engine) + '%';
    document.getElementById('starEngineText').textContent = Math.min(100, Math.round(engine)) + '%';
    document.getElementById('starHull').style.width = Math.min(100, hull) + '%';
    document.getElementById('starHullText').textContent = Math.min(100, Math.round(hull)) + '%';
    document.getElementById('starFoot').innerHTML = '<span>🛸 ' + (w.目标 || '猎户座') + '</span><span>📡 ' + (w.信号 || '稳定') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十四：领主/经营面板 ============
    {
        key: 'lord',
        icon: '🏰',
        name: '领主/经营面板',
        category: '策略 / 建设 / 种田',
        desc: '四列资源面板 + 人口财富军队民心',
        fields: '人口 / 财富 / 军队 / 民心 / 资源',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.lord-bar {
  background: #14100c;
  border: 1px solid #4a3a2a;
  border-radius: 8px;
  padding: 14px 18px;
  color: #d0c0a8;
  font-family: 'Georgia', serif;
}
.lord-bar .lord-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2a2218; padding-bottom: 6px; }
.lord-bar .lord-head .title { font-size: 18px; letter-spacing: 2px; color: #e8d8c0; }
.lord-bar .lord-head .realm { font-size: 12px; color: #8a7a62; }
.lord-bar .lord-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px 8px; margin: 8px 0; }
.lord-bar .lord-grid .li { display: flex; flex-direction: column; padding: 4px 0; border-bottom: 1px solid #1a1410; }
.lord-bar .lord-grid .li .lilbl { font-size: 9px; text-transform: uppercase; color: #6a5a4a; letter-spacing: 1px; }
.lord-bar .lord-grid .li .lival { font-size: 16px; font-weight: bold; color: #f0e0d0; }
.lord-bar .lord-grid .li .lisub { font-size: 10px; color: #8a7a62; }
.lord-bar .lord-res { display: flex; gap: 12px; padding: 6px 0; border-top: 1px solid #1a1410; border-bottom: 1px solid #1a1410; flex-wrap: wrap; }
.lord-bar .lord-res .res { font-size: 12px; color: #b0a088; }
.lord-bar .lord-res .res .rval { color: #f0e0d0; font-weight: bold; }
.lord-bar .lord-foot { display: flex; gap: 14px; font-size: 11px; color: #6a5a4a; padding-top: 6px; flex-wrap: wrap; }
</style>

<div class="lord-bar" id="lordBar">
  <div class="lord-head">
    <span class="title" id="lordName">领主</span>
    <span class="realm" id="lordRealm">⚔ 领地·北境</span>
  </div>
  <div class="lord-grid">
    <div class="li"><span class="lilbl">人口</span><span class="lival" id="lordPop">1.2k</span><span class="lisub">↑ 增长</span></div>
    <div class="li"><span class="lilbl">财富</span><span class="lival" id="lordGold">8.4k</span><span class="lisub">💰 金币</span></div>
    <div class="li"><span class="lilbl">军队</span><span class="lival" id="lordArmy">320</span><span class="lisub">⚔ 士气 78%</span></div>
    <div class="li"><span class="lilbl">民心</span><span class="lival" id="lordMoral">65</span><span class="lisub">📈 稳定</span></div>
  </div>
  <div class="lord-res">
    <span class="res">🌾 粮食 <span class="rval" id="lordFood">420</span></span>
    <span class="res">🪵 木材 <span class="rval" id="lordWood">180</span></span>
    <span class="res">🪨 石料 <span class="rval" id="lordStone">95</span></span>
    <span class="res">⚒️ 铁矿 <span class="rval" id="lordIron">60</span></span>
  </div>
  <div class="lord-foot" id="lordFoot"><span>📅 第 47 年</span><span>🏗️ 建设中</span></div>
</div>

<script>
(function() {
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    const w = d.世界 || {};
    document.getElementById('lordName').textContent = c.姓名 || '领主';
    document.getElementById('lordRealm').textContent = '⚔ ' + (c.领地 || '北境');
    document.getElementById('lordPop').textContent = c.人口 || '1.2k';
    document.getElementById('lordGold').textContent = c.财富 || '8.4k';
    document.getElementById('lordArmy').textContent = c.军队 || '320';
    document.getElementById('lordMoral').textContent = c.民心 || '65';
    document.getElementById('lordFood').textContent = c.粮食 ?? 420;
    document.getElementById('lordWood').textContent = c.木材 ?? 180;
    document.getElementById('lordStone').textContent = c.石料 ?? 95;
    document.getElementById('lordIron').textContent = c.铁矿 ?? 60;
    document.getElementById('lordFoot').innerHTML = '<span>📅 ' + (w.年代 || '第 47 年') + '</span><span>🏗️ ' + (w.状态 || '建设中') + '</span>';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    },

    // ============ 模板十五：多彩主题切换 ============
    {
        key: 'theme',
        icon: '🎨',
        name: '多彩主题切换',
        category: '多合一 / 一键换肤',
        desc: '内置 5 种主题（暗夜/森林/海洋/日落/极光），点击切换',
        fields: 'HP / MP / 好感 / 等级（可换肤）',
        findRegex: STATUS_FIND,
        replaceString: `<style>
.theme-bar {
  border-radius: 10px;
  padding: 14px 18px;
  font-family: 'Segoe UI', sans-serif;
  transition: all 0.3s;
}
.theme-bar[data-theme="dark"] { background: #111; border: 1px solid #333; color: #ccc; }
.theme-bar[data-theme="forest"] { background: #0a1a0a; border: 1px solid #2a4a2a; color: #8ac88a; }
.theme-bar[data-theme="ocean"] { background: #0a0a1a; border: 1px solid #2a4a6a; color: #8ac8e8; }
.theme-bar[data-theme="sunset"] { background: #1a0a0a; border: 1px solid #6a3a2a; color: #e8b08a; }
.theme-bar[data-theme="aurora"] { background: #0a0a1a; border: 1px solid #3a2a5a; color: #c8a8e8; }
.theme-bar .t-top { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; }
.theme-bar .t-top .tname { font-size: 16px; font-weight: 600; }
.theme-bar .t-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 12px; margin: 6px 0; }
.theme-bar .t-grid .ti { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.theme-bar .t-grid .ti .tilbl { opacity: 0.5; }
.theme-bar .t-grid .ti .tival { font-weight: 500; }
.theme-bar .t-bars { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.theme-bar .t-bars .tb { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.theme-bar .t-bars .tb .track { flex: 1; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.theme-bar .t-bars .tb .track .fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
</style>

<div class="theme-bar" data-theme="dark" id="themeBar">
  <div class="t-top">
    <span class="tname" id="themeName">冒险者</span>
    <span style="font-size:12px;opacity:0.6;" id="themeLevel">Lv.1</span>
  </div>
  <div class="t-grid">
    <div class="ti"><span class="tilbl">HP</span><span class="tival" id="themeHp">100</span></div>
    <div class="ti"><span class="tilbl">MP</span><span class="tival" id="themeMp">50</span></div>
    <div class="ti"><span class="tilbl">💬</span><span class="tival" id="themeAff">70</span></div>
  </div>
  <div class="t-bars">
    <div class="tb"><span>HP</span><div class="track"><div class="fill" id="themeHpBar" style="width:100%;background:#e74c3c;"></div></div><span id="themeHpPct">100%</span></div>
    <div class="tb"><span>MP</span><div class="track"><div class="fill" id="themeMpBar" style="width:50%;background:#4a9eff;"></div></div><span id="themeMpPct">50%</span></div>
  </div>
  <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;font-size:10px;opacity:0.4;">
    <span data-theme="dark" class="theme-switch" style="cursor:pointer;padding:2px 8px;border-radius:4px;background:#333;color:#fff;">暗夜</span>
    <span data-theme="forest" class="theme-switch" style="cursor:pointer;padding:2px 8px;border-radius:4px;background:#2a4a2a;color:#8ac88a;">森林</span>
    <span data-theme="ocean" class="theme-switch" style="cursor:pointer;padding:2px 8px;border-radius:4px;background:#2a4a6a;color:#8ac8e8;">海洋</span>
    <span data-theme="sunset" class="theme-switch" style="cursor:pointer;padding:2px 8px;border-radius:4px;background:#6a3a2a;color:#e8b08a;">日落</span>
    <span data-theme="aurora" class="theme-switch" style="cursor:pointer;padding:2px 8px;border-radius:4px;background:#3a2a5a;color:#c8a8e8;">极光</span>
  </div>
</div>

<script>
(function() {
  document.querySelectorAll('.theme-switch').forEach(el => {
    el.addEventListener('click', function() {
      document.getElementById('themeBar').dataset.theme = this.dataset.theme;
    });
  });
  function upd() {
    const v = (window.getVariables ? window.getVariables({type:'message'}) : {});
    const d = v.stat_data || {};
    const c = d.角色 || {};
    document.getElementById('themeName').textContent = c.姓名 || '冒险者';
    document.getElementById('themeLevel').textContent = 'Lv.' + (c.等级 || 1);
    const hp = c.HP ?? 100, maxHp = c.maxHP ?? 100, mp = c.MP ?? 50, maxMp = c.maxMP ?? 100, aff = c.好感度 ?? 70;
    document.getElementById('themeHp').textContent = hp;
    document.getElementById('themeMp').textContent = mp;
    document.getElementById('themeAff').textContent = aff;
    const hpPct = Math.min(100, (hp/maxHp)*100);
    const mpPct = Math.min(100, (mp/maxMp)*100);
    document.getElementById('themeHpBar').style.width = hpPct + '%';
    document.getElementById('themeHpPct').textContent = Math.round(hpPct) + '%';
    document.getElementById('themeMpBar').style.width = mpPct + '%';
    document.getElementById('themeMpPct').textContent = Math.round(mpPct) + '%';
  }
  upd();
  setInterval(upd, 3000);
})();
</script>`
    }
];

// 供 UI 展示的轻量元数据（不含完整 replaceString，避免模板选择列表过大）
export const STATUSBAR_TEMPLATE_META = STATUSBAR_TEMPLATES.map(t => ({
    key: t.key, icon: t.icon, name: t.name, category: t.category, desc: t.desc, fields: t.fields
}));

// 按 key 查找模板
export function findStatusbarTemplate(key) {
    return STATUSBAR_TEMPLATES.find(t => t.key === key) || null;
}
