// ====== statusSystem.js ======
// 状态系统核心模块 v2.1 (兼容JS Slash Runner)

// 注册状态栏命令
SlashRunner.registerCommand({
  name: "状态栏",
  description: "显示当前状态",
  handler: () => {
    const state = StateManager.getState();
    const status = [
      `📅 日期时间: ${state.datetime}`,
      `👕 上身: ${state.upperClothing}`,
      `👖 下身: ${state.lowerClothing}`,
      `💃 行为: ${state.behavior}`,
      `🎒 角色持有: ${state.charInventory}`,
      `💼 我的持有: ${state.userInventory}`,
      `❤️ 友好度: ${state.affection}/100`,
      `🤝 关系: ${state.relationship}`,
      `🌍 环境: ${state.location} | ${state.weather}`
    ].join("\n");
    
    return SlashRunner.showMessage(status, "状态面板");
  }
});

// 注册时间系统
SlashRunner.registerModule({
  name: "时间系统",
  init: () => {
    // 初始化状态
    StateManager.initState({
      datetime: "2025年01月01日 08:00 | 星期三",
      upperClothing: "睡衣",
      lowerClothing: "睡裤",
      behavior: "刚睡醒",
      charInventory: "无",
      userInventory: "手机",
      affection: 30,
      relationship: "陌生人",
      location: "卧室",
      weather: "晴朗"
    });
    
    // 注册时间更新器
    SlashRunner.registerHook("postMessage", updateTime);
  }
});

// 时间更新函数（每4条消息+1小时）
function updateTime(context) {
  const state = StateManager.getState();
  const now = parseDateTime(state.datetime);
  
  // 消息计数器（从JS Slash Runner获取）
  const msgCount = context.messageHistory.length;
  const hoursToAdd = Math.floor(msgCount / 4);
  
  // 计算新时间
  now.setHours(now.getHours() + hoursToAdd);
  
  // 格式化时间
  state.datetime = formatDateTime(now);
  StateManager.saveState();
}

// 工具函数
function parseDateTime(dtStr) {
  const [datePart, timePart] = dtStr.split(" ");
  const [year, month, day] = datePart.match(/\d+/g);
  const [hour, minute] = timePart.split(":");
  
  return new Date(year, month-1, day, hour, minute);
}

function formatDateTime(date) {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()}年${pad(date.getMonth()+1)}月${pad(date.getDate())}日 ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())} | 星期${weekdays[date.getDay()]}`;
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

// ====== 导出模块 ======
export default {
  install: () => SlashRunner.loadModule("时间系统")
};