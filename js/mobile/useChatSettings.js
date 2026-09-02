/**
 * 移动端测卡全局设置（设置页为唯一入口，测卡 Tab / AI 工具只读）
 *  - 回复数量：每次发送生成的候选回复条数（酒馆式 swipe，默认 1）
 *  - 用户名：对话中「我」的显示名 + 宏 {{user}}
 *  - 用户人设：{{user}} 的角色设定，注入 system 提示词
 * 存储键与 API 配置（stc-api-*）分离，互不干扰。
 */

const LS_REPLY_COUNT = 'jsmobile-chat-reply-count';
const LS_USER_NAME = 'jsmobile-user-name';
const LS_USER_PERSONA = 'jsmobile-user-persona';

const MIN_REPLY = 1;
const MAX_REPLY = 10;

export function getReplyCount() {
    const n = parseInt(localStorage.getItem(LS_REPLY_COUNT) || '', 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(n, MIN_REPLY), MAX_REPLY);
}

export function setReplyCount(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return;
    localStorage.setItem(LS_REPLY_COUNT, String(Math.min(Math.max(Math.round(v), MIN_REPLY), MAX_REPLY)));
}

export function getUserName() {
    return (localStorage.getItem(LS_USER_NAME) || '').trim() || '我';
}

export function setUserName(name) {
    const v = String(name == null ? '' : name).trim();
    if (v) localStorage.setItem(LS_USER_NAME, v);
    else localStorage.removeItem(LS_USER_NAME);
}

export function getUserPersona() {
    return (localStorage.getItem(LS_USER_PERSONA) || '').trim();
}

export function setUserPersona(persona) {
    const v = String(persona == null ? '' : persona).trim();
    if (v) localStorage.setItem(LS_USER_PERSONA, v);
    else localStorage.removeItem(LS_USER_PERSONA);
}
