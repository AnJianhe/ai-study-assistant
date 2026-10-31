'use strict';

/* ============================================================
 * AI 学习助手 · 渲染进程
 * 纯原生 JS + DOM，无构建、无第三方依赖、无外网资源。
 *
 * 结构：
 *   0. 常量          1. 状态            2. 工具函数
 *   3. Toast / Modal 4. API 层          5. AI 任务调度
 *   6. 路由与外壳     7. 欢迎引导        8. 学习台
 *   9. 练习          10. 报告           11. 学习进度
 *  12. 资料库        13. AI 助手        14. 设置
 *  15. 全局事件委托  16. 启动
 * ============================================================ */

/* ============================================================
 * 0. 常量
 * ============================================================ */
const SUBJECTS = ['语文', '数学', '英语', '科学', '道法', '历史', '地理'];

const SUBJECT_META = {
  语文: { short: '语', cls: 'subj-语文', full: 120 },
  数学: { short: '数', cls: 'subj-数学', full: 120 },
  英语: { short: '英', cls: 'subj-英语', full: 120 },
  科学: { short: '科', cls: 'subj-科学', full: 160 },
  道法: { short: '道', cls: 'subj-道法', full: 100 },
  历史: { short: '史', cls: 'subj-历史', full: 100 },
  地理: { short: '地', cls: 'subj-地理', full: 100 },
  综合: { short: '综', cls: 'subj-综合', full: 100 }
};

const GRADES = ['七年级', '八年级', '九年级'];

const TEXTBOOK_RULES = [
  { subject: '语文', version: '人教版', note: '统编教材' },
  { subject: '数学', version: '浙教版', note: '浙江教育出版社' },
  { subject: '英语', version: '人教版', note: 'Go for it!' },
  { subject: '科学', version: '教科版', note: '浙江科学合并物理 · 化学 · 生物（部分地区用浙教版，内容一致）' },
  { subject: '道法', version: '人教版', note: '社会 = 道法 · 历史 · 地理' },
  { subject: '历史', version: '人教版', note: '与道法、地理合并为社会' },
  { subject: '地理', version: '人教版', note: '与道法、历史合并为社会' }
];

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const ICONS = {
  brand: '<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v16H7.5A2.5 2.5 0 0 0 5 22.5z"/><path d="M9 8.5h6.5M9 12h4"/>',
  home: '<path d="M4 10.6 12 4l8 6.6V19a1.6 1.6 0 0 1-1.6 1.6H15v-6.2H9v6.2H5.6A1.6 1.6 0 0 1 4 19z"/>',
  quiz: '<rect x="5" y="3.5" width="14" height="17" rx="2.6"/><path d="M9 9h6M9 13h4M9 17h2.5"/>',
  report: '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',
  progress: '<path d="M3 17l5.6-5.6 4 4L21 6.6"/><path d="M15.5 6.6H21v5.5"/>',
  library: '<path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H20v15.4H6.4A2.4 2.4 0 0 0 4 20.8z"/><path d="M4 18.6A2.4 2.4 0 0 1 6.4 16.2H20V22H6.4A2.4 2.4 0 0 1 4 19.6z"/>',
  assistant: '<path d="M12 3.2 13.9 8 19 9.9 13.9 11.8 12 16.6l-1.9-4.8L5 9.9 10.1 8z"/><path d="M18.4 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/><path d="M6 16.6l.6 1.5 1.5.6-1.5.6L6 21l-.6-1.7-1.5-.6 1.5-.6z"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11A1.7 1.7 0 0 0 21 10.1h.11a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.56 1.03z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/>',
  moon: '<path d="M20.4 14.3A8.5 8.5 0 1 1 9.7 3.6a6.7 6.7 0 0 0 10.7 10.7z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/><path d="M12 15V4M7.8 8.2 12 4l4.2 4.2"/>',
  trash: '<path d="M4 7h16M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3V7M6.2 7l.9 12.1a2 2 0 0 0 2 1.9h5.8a2 2 0 0 0 2-1.9L17.8 7"/><path d="M10.4 11v6M13.6 11v6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4.5 12.6 9.2 17.3 19.5 7"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.3 11 15.1l5-5"/>',
  'alert-circle': '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v4.9M12 16.1v.1"/>',
  'alert-triangle': '<path d="M10.4 4.3 2.6 17.7A1.7 1.7 0 0 0 4.1 20.3h15.8a1.7 1.7 0 0 0 1.5-2.6L13.6 4.3a1.8 1.8 0 0 0-3.2 0z"/><path d="M12 9.5v4M12 17v.1"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4M12 7.6v.1"/>',
  chevron: '<path d="M9 5.5 15.5 12 9 18.5"/>',
  'chevron-down': '<path d="M5.5 9 12 15.5 18.5 9"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
  calendar: '<rect x="3.6" y="5" width="16.8" height="16" rx="2.4"/><path d="M3.6 10h16.8M8.2 3v4M15.8 3v4"/>',
  send: '<path d="M4.2 11.3 20 4l-7.3 16-2.1-6.6z"/><path d="M10.6 13.4 20 4"/>',
  stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.2"/>',
  copy: '<rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.2"/><path d="M15.4 8.6V6.2a2.2 2.2 0 0 0-2.2-2.2H6.2A2.2 2.2 0 0 0 4 6.2v7a2.2 2.2 0 0 0 2.2 2.2h2.4"/>',
  image: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.4"/><circle cx="8.6" cy="9.4" r="1.5"/><path d="M3.8 16.4l4.4-4 3.6 3.2 3-2.6 5.4 4.8"/>',
  paperclip: '<path d="M20.4 11.5 12 19.9a5.2 5.2 0 0 1-7.4-7.4l8.5-8.4a3.5 3.5 0 0 1 4.9 4.9l-8.3 8.3a1.7 1.7 0 0 1-2.5-2.5l7.6-7.6"/>',
  brain: '<path d="M9.6 4.2A3 3 0 0 0 4.7 6a3 3 0 0 0-.9 4.4 3 3 0 0 0 .8 4.6A3 3 0 0 0 9 19a3 3 0 0 0 3-2.6V6.8a2.6 2.6 0 0 0-2.4-2.6z"/><path d="M14.4 4.2A3 3 0 0 1 19.3 6a3 3 0 0 1 .9 4.4 3 3 0 0 1-.8 4.6A3 3 0 0 1 15 19a3 3 0 0 1-3-2.6"/>',
  key: '<circle cx="8" cy="15.6" r="3.6"/><path d="M10.6 13 20 3.6M16.2 7.4l2.4 2.4M13.6 10l2.2 2.2"/>',
  user: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
  folder: '<path d="M3.8 7.2A2.2 2.2 0 0 1 6 5h3.6l2 2.4H18a2.2 2.2 0 0 1 2.2 2.2v7.8A2.4 2.4 0 0 1 17.8 20H6.2A2.4 2.4 0 0 1 3.8 17.6z"/>',
  eye: '<path d="M2.4 12S5.9 5.6 12 5.6 21.6 12 21.6 12 18.1 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="2.7"/>',
  'eye-off': '<path d="M4 4l16 16"/><path d="M9.8 5.9A9.3 9.3 0 0 1 12 5.6c6.1 0 9.6 6.4 9.6 6.4a17 17 0 0 1-3.3 4.1M6.5 7.5A17.4 17.4 0 0 0 2.4 12S5.9 18.4 12 18.4a9.5 9.5 0 0 0 3.7-.75"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20.4 3.6V9h-5.4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 21 21"/>',
  edit: '<path d="M4 20h4.2L20 8.2a2.1 2.1 0 0 0 0-3L19 4.2a2.1 2.1 0 0 0-3 0L4 16.2z"/><path d="M14.4 5.8l3.8 3.8"/>',
  'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  skip: '<circle cx="12" cy="12" r="8.6"/><path d="M5.9 5.9l12.2 12.2"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".6"/>',
  play: '<path d="M7.5 4.8 19 12 7.5 19.2z"/>',
  sparkles: '<path d="M11.5 3.4 13.3 8l4.6 1.8-4.6 1.8-1.8 4.6-1.8-4.6L5.1 9.8 9.7 8z"/><path d="M18 15.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  book: '<path d="M12 6.4C10.4 4.9 8.3 4.2 5.4 4.2A2 2 0 0 0 3.4 6.2v11.4a2 2 0 0 0 2 2c2.9 0 5 .7 6.6 2.2 1.6-1.5 3.7-2.2 6.6-2.2a2 2 0 0 0 2-2V6.2a2 2 0 0 0-2-2c-2.9 0-5 .7-6.6 2.2z"/><path d="M12 6.4v15.4"/>',
  download: '<path d="M12 4v11M7.8 10.8 12 15l4.2-4.2"/><path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
  external: '<path d="M14 4h6v6M20 4l-8.6 8.6"/><path d="M18 14.4V19a1.6 1.6 0 0 1-1.6 1.6H5A1.6 1.6 0 0 1 3.4 19V7.6A1.6 1.6 0 0 1 5 6h4.6"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  bookOpen: '<path d="M3.6 5.4A2 2 0 0 1 5.6 3.4h4.2a2 2 0 0 1 2 2v13a1.7 1.7 0 0 0-1.7-1.7H5.6a2 2 0 0 1-2-2z"/><path d="M20.4 5.4a2 2 0 0 0-2-2h-4.2a2 2 0 0 0-2 2v13a1.7 1.7 0 0 1 1.7-1.7h4.5a2 2 0 0 0 2-2z"/>',
  pin: '<path d="M12 21s6.6-5.6 6.6-10.4A6.6 6.6 0 0 0 5.4 10.6C5.4 15.4 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/>',
  flame: '<path d="M12 21c3.9 0 6.4-2.5 6.4-6 0-4.2-4.4-6.2-4.4-10.4-2.6 1.4-3.4 3.6-3.4 5.6-1.4-1-2-2.2-2-3.4C6.4 9 5.6 11.4 5.6 15c0 3.5 2.5 6 6.4 6z"/>',
  'wifi-off': '<path d="M3 3l18 18"/><path d="M8.6 15.4a4.8 4.8 0 0 1 6.8 0M5 12a9.7 9.7 0 0 1 4-2.4M19 12a9.7 9.7 0 0 0-3.2-2.2M2.2 8.6a14 14 0 0 1 3.4-2M21.8 8.6a14 14 0 0 0-7.6-2.4"/><path d="M12 19h.01"/>',
  layers: '<path d="M12 3.4 21 8l-9 4.6L3 8z"/><path d="M3 12.4 12 17l9-4.6M3 16.8 12 21.4l9-4.6"/>',
  compass: '<circle cx="12" cy="12" r="8.6"/><path d="M15.4 8.6 13.6 13.6 8.6 15.4 10.4 10.4z"/>'
};

const DEFAULT_SETTINGS = {
  api: {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat',
    reasoningModel: '',
    temperature: 0.3,
    maxTokens: 0,
    timeoutSec: 120
  },
  ai: { stream: true, deepThinking: false, webSearch: true, searchProvider: 'auto' },
  search: { tavilyKey: '', serperKey: '', bochaKey: '' },
  learning: {
    dailyAsk: true,
    askTime: '20:30',
    dailyMinutes: 40,
    subjects: SUBJECTS.slice()
  },
  ui: { theme: 'dark' }
};

const DEFAULT_PROFILE = {
  name: '',
  grade: '八年级',
  school: '',
  class: '',
  examName: '',
  examDate: '',
  notes: ''
};

const DEFAULT_CHAT_SUGGESTIONS = [
  '帮我梳理一下二次函数的知识框架',
  '英语作文怎么写才能拿高分？',
  '光合作用和呼吸作用的区别',
  '给我讲讲这次月考错题该怎么复习'
];

/* ============================================================
 * 1. 状态
 * ============================================================ */
const state = {
  ready: false,
  settings: null,
  profile: null,
  scores: null,
  materials: [],
  textbooks: [],
  progress: {},
  leaves: [],
  plans: [],
  reports: [],
  dailyLogs: {},
  makeups: [],
  exams: [],
  examForm: { name: '', date: '', subjects: [], note: '' },
  welcomed: false,
  needsWelcome: false,
  needsApi: true,
  appInfo: null,
  route: 'home',
  aiJobs: new Map(),
  quiz: null,
  quizGenText: '',
  reportId: null,
  libraryTab: 'textbooks',
  settingsTab: 'api',
  dailyDraft: '',
  chat: {
    messages: [],
    streaming: false,
    requestId: null,
    deepThinking: false,
    images: [],
    materialIds: [],
    draft: ''
  },
  welcome: { step: 1 },
  drafts: { settings: null, profile: null, scores: null },
  ui: { settingsDirty: false }
};

/* ============================================================
 * 2. 工具函数
 * ============================================================ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function icon(name, cls) {
  const body = ICONS[name] || ICONS.info;
  return (
    '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body +
    '</svg>'
  );
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function todayStr(d) {
  const date = d || new Date();
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function nowTimeStr() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtDay(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return pad2(d.getMonth() + 1) + '月' + pad2(d.getDate()) + '日';
}

function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - Number(ts);
  if (!isFinite(diff) || diff < 0) return fmtDay(ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + ' 小时前';
  const day = Math.floor(hour / 24);
  if (day < 7) return day + ' 天前';
  return fmtDay(ts);
}

function weekdayIndex(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

function weekdayLabel(dateStr) {
  return WEEKDAYS[weekdayIndex(dateStr) - 1] || '';
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function deepCopy(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch (err) { return obj; }
}

function setPath(obj, path, value) {
  if (!obj) return;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[path[path.length - 1]] = value;
}

function getPath(obj, path) {
  let cur = obj;
  for (let i = 0; i < path.length; i += 1) {
    if (cur == null) return undefined;
    cur = cur[path[i]];
  }
  return cur;
}

function parseHash() {
  const raw = String(location.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  const route = raw || 'home';
  return route;
}

function subjectMeta(subject) {
  return SUBJECT_META[subject] || SUBJECT_META['综合'];
}

function subjectDot(subject, size) {
  const meta = subjectMeta(subject);
  return '<span class="subject-dot ' + meta.cls + '">' + esc(meta.short) + '</span>';
}

function subjectSubjectLabel(subject) {
  const meta = subjectMeta(subject);
  return '<span class="subject-dot ' + meta.cls + '">' + esc(meta.short) + '</span><span>' + esc(subject) + '</span>';
}

function numOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
}

function accuracyClass(acc) {
  const p = acc * 100;
  if (p >= 80) return '';
  if (p >= 60) return 'is-mid';
  return 'is-low';
}

function accuracyText(acc) {
  return Math.round((Number(acc) || 0) * 100) + '%';
}

function normalizeAnswer(text) {
  return String(text == null ? '' : text)
    .trim()
    .toUpperCase()
    .replace(/^选项\s*/i, '')
    .replace(/[.、．,，:：;；\s]/g, '');
}

function answerKey(answer) {
  const raw = String(answer == null ? '' : answer).trim();
  const m = raw.match(/^([A-Da-d])/);
  if (m) return m[1].toUpperCase();
  return normalizeAnswer(raw);
}

function isChoiceType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'choice' || t === 'single' || t === 'select' || t === '选择题' || t === '单选';
}

function choiceOptions(q) {
  let options = q.options;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch (err) { options = String(options).split(/\n+/); }
  }
  if (!Array.isArray(options)) return [];
  return options.map(function (opt, idx) {
    if (opt && typeof opt === 'object') {
      const key = String(opt.key || opt.label || opt.value || String.fromCharCode(65 + idx)).replace(/[.、．:：]/g, '').trim();
      const text = String(opt.text || opt.content || opt.label || opt.value || '').trim();
      return { key: key, text: text || key };
    }
    const str = String(opt || '').trim();
    const m = str.match(/^([A-Da-d])[.、．)]\s*(.*)$/);
    if (m) return { key: m[1].toUpperCase(), text: m[2] || m[1] };
    return { key: String.fromCharCode(65 + idx), text: str };
  });
}

function isSkipped(entry) {
  return !!(entry && entry.skipped);
}

function textOr(value, fallback) {
  const s = String(value == null ? '' : value).trim();
  return s || fallback;
}

/* 轻量 Markdown → HTML（先转义，避免注入） */
function mdToHtml(src) {
  if (!src) return '';
  // 先把 $...$ / $$...$$ 公式抽出来，避免被 markdown 处理和 HTML 转义破坏
  const maths = [];
  let s = String(src).replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, function (_m, block, inline) {
    maths.push({ tex: block || inline, display: !!block });
    return '\u0001M' + (maths.length - 1) + '\u0001';
  });
  const blocks = [];
  s = esc(s);
  s = s.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g, function (_m, code) {
    blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
    return '\u0000' + (blocks.length - 1) + '\u0000';
  });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/^#{1,6}\s*(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a data-act="open-url" data-url="$2">$1</a>');
  const html = s.split(/\n{2,}/).map(function (chunk) {
    const p = chunk.trim();
    if (!p) return '';
    if (/^\u0000\d+\u0000$/.test(p)) return p;
    if (/^<(h4|blockquote|pre|ul|ol)/.test(p)) return p;
    const lines = p.split('\n');
    // Markdown 表格：| a | b | 加 | --- | --- |
    if (lines.length >= 2 && /^\s*\|/.test(lines[0]) && /^\s*\|?[\s:|-]+\|/.test(lines[1])) {
      const parseCells = function (line) {
        return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
      };
      const head = parseCells(lines[0]);
      const rows = lines.slice(2).filter(function (l) { return l.trim(); }).map(parseCells);
      return '<table class="md-table"><thead><tr>' +
        head.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        rows.map(function (row) {
          return '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
        }).join('') +
        '</tbody></table>';
    }
    const isUl = lines.every(function (l) { return !l.trim() || /^[-*•]\s+/.test(l); }) && lines.some(function (l) { return /^[-*•]\s+/.test(l); });
    if (isUl) {
      return '<ul>' + lines.filter(function (l) { return l.trim(); }).map(function (l) {
        return '<li>' + l.replace(/^[-*•]\s+/, '') + '</li>';
      }).join('') + '</ul>';
    }
    const isOl = lines.every(function (l) { return !l.trim() || /^\d+[.、)]\s+/.test(l); }) && lines.some(function (l) { return /^\d+[.、)]\s+/.test(l); });
    if (isOl) {
      return '<ol>' + lines.filter(function (l) { return l.trim(); }).map(function (l) {
        return '<li>' + l.replace(/^\d+[.、)]\s+/, '') + '</li>';
      }).join('') + '</ol>';
    }
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).filter(Boolean).join('');
  let out = html.replace(/\u0000(\d+)\u0000/g, function (_m, i) { return blocks[Number(i)] || ''; });
  out = out.replace(/\u0001M(\d+)\u0001/g, function (_m, i) {
    const item = maths[Number(i)];
    return item ? katexToHtml(item.tex, item.display) : '';
  });
  return out;
}

/* 行内富文本：只处理公式 / 粗体 / 行内代码，不包裹段落（用于选项、答案等短文本） */
function richInline(text) {
  if (text === undefined || text === null || text === '') return '';
  const maths = [];
  let s = String(text).replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, function (_m, block, inline) {
    maths.push({ tex: block || inline, display: !!block });
    return '\u0001M' + (maths.length - 1) + '\u0001';
  });
  s = esc(s);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return s.replace(/\u0001M(\d+)\u0001/g, function (_m, i) {
    const item = maths[Number(i)];
    return item ? katexToHtml(item.tex, item.display) : '';
  });
}

/* LaTeX 公式 → HTML（KaTeX 离线渲染；失败时退回原始文本，绝不会白屏） */
function katexToHtml(tex, display) {
  try {
    if (window.katex && typeof window.katex.renderToString === 'function') {
      return window.katex.renderToString(String(tex), {
        displayMode: !!display,
        throwOnError: false,
        strict: 'ignore',
        trust: false
      });
    }
  } catch (err) {
    /* 交给下面的兜底 */
  }
  return '<span class="math-fallback">' + esc('$' + String(tex) + '$') + '</span>';
}

/* ============================================================
 * 3. Toast / Modal
 * ============================================================ */
let confirmResolve = null;

// 调试钩子：方便自动化验证公式 / 富文本渲染（生产环境也保留，无副作用）
window.__render = { mdToHtml: mdToHtml, richInline: richInline };

function toast(message, type, duration) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const tone = type || 'info';
  const iconName = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  }[tone] || 'info';
  const el = document.createElement('div');
  el.className = 'toast toast-' + tone;
  el.innerHTML = icon(iconName) + '<div class="toast-text">' + esc(message) + '</div>';
  root.appendChild(el);
  const ttl = duration || (tone === 'error' ? 5200 : 3200);
  setTimeout(function () {
    el.classList.add('is-leaving');
    setTimeout(function () { el.remove(); }, 220);
  }, ttl);
}

function openModal(opts) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const size = opts.size === 'wide' ? 'is-wide' : opts.size === 'narrow' ? 'is-narrow' : '';
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.innerHTML =
    '<div class="modal-mask" data-act="modal-close"></div>' +
    '<div class="modal ' + size + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
        '<div class="modal-title">' + esc(opts.title || '') + '</div>' +
        '<button class="icon-btn" data-act="modal-close" aria-label="关闭">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
    '</div>';
  if (typeof opts.onMount === 'function') {
    try { opts.onMount(root); } catch (err) { console.error('[modal onMount]', err); }
  }
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
  }
  if (confirmResolve) {
    const r = confirmResolve;
    confirmResolve = null;
    r(false);
  }
}

// 关键防御：弹窗容器默认必须隐藏。它是 fixed 全屏容器，若空着还可见，
// 会变成看不见的"幽灵遮罩"，把所有页面点击全部吃掉（表现为"界面点不了"）。
(function ensureModalHidden() {
  const root = document.getElementById('modal-root');
  if (root) {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
  }
})();

function confirmDialog(opts) {
  return new Promise(function (resolve) {
    confirmResolve = resolve;
    openModal({
      title: opts.title || '确认操作',
      size: 'narrow',
      body: '<p style="font-size:13.5px;line-height:1.75;color:var(--text-2)">' + esc(opts.message || '') + '</p>',
      footer:
        '<button class="btn btn-secondary" data-act="confirm-cancel">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="confirm-ok">' +
        esc(opts.confirmText || '确定') + '</button>'
    });
  });
}

/* ============================================================
 * 4. API 层
 * ============================================================ */
let api = null;

async function waitForApi(timeoutMs) {
  const limit = timeoutMs || 9000;
  const started = Date.now();
  const sub = document.getElementById('boot-sub');
  let tick = 0;
  while (!window.api) {
    if (Date.now() - started > limit) return false;
    if (sub && tick % 8 === 0) {
      sub.textContent = tick === 0 ? '正在初始化…' : '正在等待主进程就绪…';
    }
    tick += 1;
    await sleep(120);
  }
  return true;
}

function isConfigured() {
  const s = state.settings;
  if (!s || !s.api) return false;
  return !!String(s.api.apiKey || '').trim() && !!String(s.api.baseUrl || '').trim();
}

function defaultSettings() {
  return deepCopy(DEFAULT_SETTINGS);
}

function defaultProfile() {
  return deepCopy(DEFAULT_PROFILE);
}

function defaultScores() {
  const subjects = {};
  SUBJECTS.forEach(function (sub) {
    subjects[sub] = { score: null, full: subjectMeta(sub).full, skipped: false };
  });
  return { examName: '', examDate: '', subjects: subjects };
}

function mergeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  ['api', 'ai', 'search', 'learning', 'ui'].forEach(function (key) {
    if (raw[key] && typeof raw[key] === 'object') {
      base[key] = Object.assign(base[key], raw[key]);
    }
  });
  return base;
}

function mergeProfile(raw) {
  const base = defaultProfile();
  if (raw && typeof raw === 'object') Object.assign(base, raw);
  return base;
}

function mergeScores(raw) {
  const base = defaultScores();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.examName) base.examName = raw.examName;
  if (raw.examDate) base.examDate = raw.examDate;
  if (raw.subjects && typeof raw.subjects === 'object') {
    SUBJECTS.forEach(function (sub) {
      const entry = raw.subjects[sub];
      if (entry && typeof entry === 'object') {
        const skipped = !!entry.skipped;
        const score = numOrNull(entry.score);
        const full = numOrNull(entry.full);
        base.subjects[sub] = {
          skipped: skipped,
          score: skipped ? null : score,
          full: full == null ? subjectMeta(sub).full : full
        };
      }
    });
  }
  return base;
}

async function safeCall(fn, fallback) {
  try {
    const value = await fn();
    return value === undefined || value === null ? fallback : value;
  } catch (err) {
    console.warn('[api]', err && err.message ? err.message : err);
    return fallback;
  }
}

async function loadAll() {
  const results = await Promise.all([
    safeCall(function () { return api.settings.get(); }, defaultSettings()),
    safeCall(function () { return api.profile.get(); }, defaultProfile()),
    safeCall(function () { return api.scores.get(); }, defaultScores()),
    safeCall(function () { return api.materials.list(); }, []),
    safeCall(function () { return api.textbooks.list(); }, []),
    safeCall(function () { return api.store.get('progress'); }, {}),
    safeCall(function () { return api.store.get('leaves'); }, []),
    safeCall(function () { return api.store.get('plans'); }, []),
    safeCall(function () { return api.store.get('reports'); }, []),
    safeCall(function () { return api.store.get('dailyLogs'); }, {}),
    safeCall(function () { return api.store.get('makeups'); }, []),
    safeCall(function () { return api.store.get('welcomed'); }, false),
    safeCall(function () { return api.app.info(); }, null),
    safeCall(function () { return api.store.get('uiTheme'); }, null),
    safeCall(function () { return api.store.get('chatHistory'); }, []),
    safeCall(function () { return api.store.get('exams'); }, [])
  ]);
  state.settings = mergeSettings(results[0]);
  state.profile = mergeProfile(results[1]);
  state.scores = mergeScores(results[2]);
  state.materials = Array.isArray(results[3]) ? results[3] : [];
  state.textbooks = Array.isArray(results[4]) ? results[4] : [];
  state.progress = results[5] && typeof results[5] === 'object' ? results[5] : {};
  state.leaves = Array.isArray(results[6]) ? results[6] : [];
  state.plans = Array.isArray(results[7]) ? results[7] : [];
  state.reports = Array.isArray(results[8]) ? results[8] : [];
  state.dailyLogs = results[9] && typeof results[9] === 'object' ? results[9] : {};
  state.exams = Array.isArray(results[15]) ? results[15] : [];
  state.makeups = Array.isArray(results[10]) ? results[10] : [];
  state.welcomed = !!results[11];
  state.appInfo = results[12];
  // 恢复 AI 助手对话记录（只恢复文本，不恢复图片附件，最多 40 条）
  state.chat.messages = Array.isArray(results[14])
    ? results[14]
        .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant'); })
        .slice(-40)
        .map(function (m) {
          return {
            id: m.id || uid('m'),
            role: m.role,
            content: String(m.content || ''),
            reasoning: String(m.reasoning || ''),
            search: m.search || null,
            images: [],
            createdAt: Number(m.createdAt) || Date.now(),
            status: 'done'
          };
        })
    : [];
  // 主题由前端自己记住（默认暗色）。浅色仅作为可选主题。
  const storedTheme = results[13] === 'light' ? 'light' : 'dark';
  state.themePreference = storedTheme;
  state.needsApi = !isConfigured();
  state.drafts.settings = deepCopy(state.settings);
  state.drafts.profile = deepCopy(state.profile);
  state.drafts.scores = deepCopy(state.scores);
  applyTheme(storedTheme);
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  if (state.settings && state.settings.ui) state.settings.ui.theme = t;
}

// 持久化 AI 助手对话记录（文本 + 引用来源，最多 40 条；图片附件不落盘以控制体积）
function saveChatHistory() {
  try {
    const messages = (state.chat.messages || []).slice(-40).map(function (m) {
      return {
        id: m.id,
        role: m.role,
        content: m.content || '',
        reasoning: m.reasoning || '',
        search: m.search || null,
        createdAt: m.createdAt || Date.now(),
        status: m.status === 'streaming' ? 'done' : m.status || 'done'
      };
    });
    storeSet('chatHistory', messages);
  } catch (err) {
    console.warn('[chat history] 保存失败', err && err.message ? err.message : err);
  }
}

async function saveSettingsPatch(patch, silent) {
  try {
    const saved = await api.settings.save(patch);
    state.settings = mergeSettings(saved);
    state.needsApi = !isConfigured();
    if (!silent) toast('设置已保存', 'success');
    return state.settings;
  } catch (err) {
    toast(err && err.message ? err.message : '保存设置失败', 'error');
    throw err;
  }
}

async function persistDraftSettings(silent) {
  const draft = state.drafts.settings;
  if (!draft) return;
  const saved = await saveSettingsPatch(deepCopy(draft), silent);
  state.drafts.settings = deepCopy(saved);
  updateSideMeta();
}

async function persistDraftProfile(silent) {
  try {
    const saved = await api.profile.save(deepCopy(state.drafts.profile));
    state.profile = mergeProfile(saved);
    state.drafts.profile = deepCopy(state.profile);
    updateSideMeta();
    if (!silent) toast('个人信息已保存', 'success');
  } catch (err) {
    toast(err && err.message ? err.message : '保存个人信息失败', 'error');
    throw err;
  }
}

async function persistDraftScores(silent) {
  try {
    const saved = await api.scores.save(deepCopy(state.drafts.scores));
    state.scores = mergeScores(saved);
    state.drafts.scores = deepCopy(state.scores);
    if (!silent) toast('成绩已保存', 'success');
  } catch (err) {
    toast(err && err.message ? err.message : '保存成绩失败', 'error');
    throw err;
  }
}

async function storeSet(key, value) {
  try {
    await api.store.set(key, value);
    return true;
  } catch (err) {
    toast(err && err.message ? err.message : '本地数据保存失败', 'error');
    return false;
  }
}

async function refreshMaterials() {
  state.materials = await safeCall(function () { return api.materials.list(); }, []);
  return state.materials;
}

async function refreshTextbooks() {
  state.textbooks = await safeCall(function () { return api.textbooks.list(); }, []);
  return state.textbooks;
}

/* ---- 材料上传流程（资料库 / 助手 / 设置 / 练习共用） ---- */
function openUploadDialog(options) {
  const opts = options || {};
  const subjects = SUBJECTS.slice();
  const kinds = [
    { value: 'handout', label: '课件 / 讲义' },
    { value: 'homework', label: '当天作业' },
    { value: 'paper', label: '试卷照片' },
    { value: 'textbook', label: '自己的课本' },
    { value: 'other', label: '其他' }
  ];
  let kind = opts.kind || 'handout';
  let subject = opts.subject || state.quiz && state.quiz.subject || '数学';

  const body =
    '<div class="stack" style="gap:14px">' +
      '<div class="form-grid">' +
        '<div class="field"><label class="field-label">材料类型</label>' +
          '<select class="select" id="up-kind">' +
            kinds.map(function (k) {
              return '<option value="' + k.value + '"' + (k.value === kind ? ' selected' : '') + '>' + k.label + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field"><label class="field-label">科目</label>' +
          '<select class="select" id="up-subject">' +
            subjects.map(function (s) {
              return '<option value="' + s + '"' + (s === subject ? ' selected' : '') + '>' + s + '</option>';
            }).join('') +
          '</select></div>' +
      '</div>' +
      '<div class="banner banner-info">' + icon('info') +
        '<div><div class="banner-title">支持哪些文件？</div>' +
        '<div class="banner-desc">图片（png / jpg / webp / gif / bmp）、文本（txt / md / csv / json）、' +
        '<strong>Office 文档：.pptx / .docx / .xlsx 会自动转换成 Markdown 文本</strong>后再给 AI 用。' +
        'PDF 暂不支持解析，请先截图再上传。旧版 .ppt / .doc / .xls 请另存为新格式。</div></div>' +
      '</div>' +
      '<div class="upload-drop" data-act="upload-pick">' +
        '<div class="upload-drop-icon">' + icon('upload') + '</div>' +
        '<div><div class="upload-drop-title">选择文件上传</div>' +
        '<div class="upload-drop-desc">上传后 AI 会把它当作参考资料，练习和问答时都能用到</div></div>' +
      '</div>' +
    '</div>';

  openModal({
    title: '上传学习材料',
    size: 'wide',
    body: body,
    footer:
      '<button class="btn btn-secondary" data-act="modal-close">取消</button>' +
      '<button class="btn btn-primary" data-act="upload-pick">' + icon('upload') + '上传文件</button>',
    onMount: function () {
      const k = $('#up-kind');
      const s = $('#up-subject');
      if (k) k.addEventListener('change', function () { kind = k.value; });
      if (s) s.addEventListener('change', function () { subject = s.value; });
    }
  });

  state.pendingUpload = {
    kind: kind,
    subject: subject,
    onDone: opts.onDone || null,
    getValues: function () {
      return { kind: kind, subject: subject };
    }
  };
}

/* ---- 材料列表选择弹窗 ---- */
function openMaterialPicker(selectedIds, onConfirm) {
  const chosen = new Set(selectedIds || []);
  const rows = state.materials.length
    ? state.materials.map(function (m) {
        return '<button class="material-option' + (chosen.has(m.id) ? ' is-active' : '') + '" data-act="pick-material" data-id="' + esc(m.id) + '">' +
          '<span class="check-box">' + icon('check') + '</span>' +
          '<span class="grow" style="text-align:left">' +
            '<span class="material-name">' + esc(m.name) + '</span>' +
            '<span class="material-desc">' + esc(m.subject || '综合') + ' · ' + esc(materialKindLabel(m.kind)) + '</span>' +
          '</span>' +
        '</button>';
      }).join('')
    : '<div class="empty" style="padding:26px">' +
        '<div class="empty-icon">' + icon('folder') + '</div>' +
        '<div class="empty-title">资料库还是空的</div>' +
        '<div class="empty-desc">先上传课件、作业或试卷照片，AI 就能结合这些资料回答</div>' +
        '<div class="empty-actions"><button class="btn btn-primary btn-sm" data-act="upload-from-picker">' + icon('upload') + '上传材料</button></div>' +
      '</div>';

  openModal({
    title: '选择参考资料',
    size: 'wide',
    body: '<div class="material-picker">' + rows + '</div>' +
      '<div class="row mt-12" style="justify-content:space-between">' +
        '<span class="field-hint">已选 <strong id="pick-count">' + chosen.size + '</strong> 个</span>' +
        '<button class="btn btn-soft btn-sm" data-act="upload-from-picker">' + icon('plus') + '上传新材料</button>' +
      '</div>',
    footer:
      '<button class="btn btn-secondary" data-act="modal-close">取消</button>' +
      '<button class="btn btn-primary" data-act="confirm-material-pick">' + icon('check') + '确定</button>',
    onMount: function () {
      state.materialPicker = { chosen: chosen, onConfirm: onConfirm };
    }
  });
}

function materialKindLabel(kind) {
  return {
    handout: '课件 / 讲义',
    homework: '当天作业',
    paper: '试卷照片',
    textbook: '自己的课本',
    other: '其他'
  }[kind] || '材料';
}

/* ---- 教材阅读 ---- */
async function openTextbookReader(id) {
  let data = null;
  try {
    data = await api.textbooks.read(id);
  } catch (err) {
    toast(err && err.message ? err.message : '读取教材失败', 'error');
    return;
  }
  if (!data) {
    toast('这本教材暂时读不到内容', 'warning');
    return;
  }
  const meta = data.meta || {};
  const content = String(data.content || '');
  openModal({
    title: (meta.subject || '教材') + ' · ' + (meta.version || '') + ' · ' + (meta.grade || ''),
    size: 'wide',
    body:
      '<div class="book-reader-head">' +
        '<strong style="font-size:14px">' + esc(meta.title || '教材正文') + '</strong>' +
        (meta.chars ? '<span class="badge badge-primary">' + meta.chars + ' 字</span>' : '') +
        '<span class="badge">教材正文</span>' +
      '</div>' +
      '<div class="text-preview">' + esc(content || '（暂无正文内容）') + '</div>',
    footer: '<button class="btn btn-secondary" data-act="modal-close">关闭</button>'
  });
}

/* ============================================================
 * 5. AI 任务调度
 * ============================================================ */
let aiSubscribed = false;

function subscribeAI() {
  if (aiSubscribed || !api || !api.ai) return;
  aiSubscribed = true;
  api.ai.onEvent(function (evt) {
    try { dispatchAIEvent(evt); } catch (err) { console.error('[ai event]', err); }
  });
}

function dispatchAIEvent(evt) {
  if (!evt || !evt.requestId) return;
  const job = state.aiJobs.get(evt.requestId);
  if (!job) return;
  if (evt.type === 'content') {
    job.text += evt.delta || '';
    if (job.onDelta) job.onDelta(job.text, job);
    return;
  }
  if (evt.type === 'reasoning') {
    job.reasoning += evt.delta || '';
    if (job.onReasoning) job.onReasoning(job.reasoning, job);
    return;
  }
  if (evt.type === 'status') {
    if (job.onStatus) job.onStatus(evt.status || '', evt.text || '', job);
    return;
  }
  if (evt.type === 'search') {
    if (job.onSearch) job.onSearch(evt, job);
    return;
  }
  if (evt.type === 'tool') {
    // AI 正在按需查看某个章节：转成状态提示，不打断流式输出
    if (job.onStatus) job.onStatus('writing', '正在查看「' + (evt.title || evt.id || '相关章节') + '」…');
    return;
  }
  if (evt.type === 'usage') {
    if (job.onUsage) job.onUsage(evt, job);
    return;
  }
  if (evt.type === 'done') {
    state.aiJobs.delete(evt.requestId);
    if (job.onDone) job.onDone(evt, job);
    if (job.mode === 'chat') saveChatHistory();
    return;
  }
  if (evt.type === 'error') {
    state.aiJobs.delete(evt.requestId);
    if (job.onError) job.onError(evt, job);
    if (job.mode === 'chat') saveChatHistory();
    return;
  }
  if (evt.type === 'start') {
    if (job.onStart) job.onStart(evt, job);
  }
}

async function startAI(req, handlers) {
  const job = {
    requestId: null,
    text: '',
    reasoning: '',
    mode: req.mode,
    onStatus: handlers.onStatus,
    onSearch: handlers.onSearch,
    onDone: handlers.onDone,
    onError: handlers.onError,
    onDelta: handlers.onDelta,
    onReasoning: handlers.onReasoning,
    onUsage: handlers.onUsage,
    onStart: handlers.onStart,
    meta: handlers.meta || {}
  };
  try {
    const res = await api.ai.start(req);
    job.requestId = res && res.requestId;
    if (!job.requestId) throw new Error('主进程没有返回请求编号');
    state.aiJobs.set(job.requestId, job);
    return job;
  } catch (err) {
    if (job.onError) {
      job.onError({ message: err && err.message ? err.message : 'AI 请求启动失败', code: 'unknown' }, job);
    } else {
      toast(err && err.message ? err.message : 'AI 请求启动失败', 'error');
    }
    return null;
  }
}

function abortAI(requestId) {
  if (!requestId) return;
  try {
    api.ai.abort(requestId);
  } catch (err) {
    console.warn('[ai abort]', err);
  }
  state.aiJobs.delete(requestId);
}

/* ============================================================
 * 6. 路由与外壳
 * ============================================================ */
const PAGES = Object.create(null);

function mountShell() {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.remove('is-booting');
  app.innerHTML =
    '<aside class="sidebar">' +
      '<div class="sidebar-brand">' +
        '<div class="brand-mark">' + icon('brand') + '</div>' +
        '<div class="brand-text">' +
          '<div class="brand-name">AI 学习助手</div>' +
          '<div class="brand-tag" id="brand-tag">浙江初中版</div>' +
        '</div>' +
      '</div>' +
      '<nav class="nav">' +
        '<div class="nav-label">日常学习</div>' +
        navItem('home', 'home', '学习台') +
        navItem('quiz', 'quiz', '练习') +
        navItem('report', 'report', '报告') +
        navItem('progress', 'progress', '学习进度') +
        '<div class="nav-label">资源与助手</div>' +
        navItem('library', 'library', '资料库') +
        navItem('assistant', 'assistant', 'AI 助手') +
        '<div class="nav-label">更多</div>' +
        navItem('settings', 'settings', '设置') +
      '</nav>' +
      '<div class="sidebar-foot">' +
        '<div class="net-badge" id="net-badge">' + icon('globe') + '<span>联网搜索已开启</span></div>' +
        '<div class="sidebar-actions">' +
          '<button class="side-btn" data-act="theme-toggle" id="theme-btn" title="切换深色 / 浅色主题">' +
            icon('sun') + '<span>主题</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</aside>' +
    '<main class="main"><div class="view" id="view"></div></main>';
  updateSideMeta();
}

function navItem(route, iconName, label) {
  return '<button class="nav-item" data-act="nav" data-route="' + route + '" title="' + label + '">' +
    icon(iconName) + '<span class="nav-text">' + label + '</span></button>';
}

function updateSideMeta() {
  const tag = document.getElementById('brand-tag');
  if (tag) {
    const grade = (state.profile && state.profile.grade) || '';
    tag.textContent = grade ? '浙江初中 · ' + grade : '浙江初中版';
  }
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.innerHTML = icon(dark ? 'moon' : 'sun') + '<span>主题</span>';
  }
  const net = document.getElementById('net-badge');
  if (net) {
    const ok = !!(state.settings && state.settings.ai && state.settings.ai.webSearch !== false);
    net.className = 'net-badge' + (ok ? '' : ' is-off');
    net.innerHTML = icon(ok ? 'globe' : 'wifi-off') + '<span>' + (ok ? '联网搜索已开启' : '联网搜索已关闭') + '</span>';
  }
}

function navigate(route) {
  const target = '#/' + route;
  if (location.hash === target) {
    render();
    return;
  }
  location.hash = target;
}

function render(opts) {
  const opts2 = opts || {};
  const route = parseHash();
  const known = !!PAGES[route] || route === 'welcome';
  const actual = known ? route : 'home';
  state.route = actual;

  document.body.classList.toggle('is-welcome', actual === 'welcome');
  document.body.classList.toggle('view-assistant', actual === 'assistant');
  document.body.setAttribute('data-view', actual);

  $$('.nav-item').forEach(function (el) {
    el.classList.toggle('is-active', el.dataset.route === actual);
  });
  updateSideMeta();

  const view = document.getElementById('view');
  if (!view) return;
  // 局部操作触发的重绘保持滚动位置；切换页面时回到顶部（临时关闭平滑滚动，避免"先跳顶再滚回"）
  const prevTop = opts2.resetScroll ? 0 : view.scrollTop;
  const prevBehavior = view.style.scrollBehavior;
  view.style.scrollBehavior = 'auto';
  if (actual === 'welcome') {
    view.innerHTML = renderWelcome();
  } else {
    const page = PAGES[actual];
    view.innerHTML = '<div class="page" id="page-root">' + (page ? page() : renderNotFound()) + '</div>';
  }
  view.scrollTop = prevTop;
  view.style.scrollBehavior = prevBehavior;
  if (actual === 'assistant' && PAGES.assistantAfterRender) PAGES.assistantAfterRender();
  if (actual === 'quiz' && PAGES.quizAfterRender) PAGES.quizAfterRender();
  if (actual === 'report' && PAGES.reportAfterRender) PAGES.reportAfterRender();
}

function renderNotFound() {
  return pageHead({ title: '页面走丢了', desc: '这个页面不存在，回到学习台继续吧' }) +
    '<div class="empty">' +
      '<div class="empty-icon">' + icon('compass') + '</div>' +
      '<div class="empty-title">没有找到这个页面</div>' +
      '<div class="empty-desc">可能是链接过期了，回到学习台重新开始。</div>' +
      '<div class="empty-actions"><button class="btn btn-primary" data-act="nav" data-route="home">回学习台</button></div>' +
    '</div>';
}

/* ---- 通用页面片段 ---- */
function pageHead(opts) {
  return '<div class="page-head">' +
    '<div class="page-title-wrap">' +
      (opts.eyebrow ? '<div class="page-eyebrow">' + opts.eyebrow + '</div>' : '') +
      '<h1 class="page-title">' + esc(opts.title) + '</h1>' +
      (opts.desc ? '<p class="page-desc">' + opts.desc + '</p>' : '') +
    '</div>' +
    (opts.actions ? '<div class="page-actions">' + opts.actions + '</div>' : '') +
  '</div>';
}

function emptyState(opts) {
  return '<div class="empty">' +
    '<div class="empty-icon">' + icon(opts.icon || 'sparkles') + '</div>' +
    '<div class="empty-title">' + esc(opts.title) + '</div>' +
    (opts.desc ? '<div class="empty-desc">' + esc(opts.desc) + '</div>' : '') +
    (opts.actions ? '<div class="empty-actions">' + opts.actions + '</div>' : '') +
  '</div>';
}

function apiGuideBanner() {
  if (isConfigured()) return '';
  return '<div class="banner banner-warning" style="margin-bottom:18px">' + icon('alert-triangle') +
    '<div><div class="banner-title">还没有配置 AI 接口</div>' +
    '<div class="banner-desc">填写 API 地址和 Key 后，练习、报告和 AI 助手才能工作。Key 只保存在你自己的电脑上。</div></div>' +
    '<div class="banner-actions"><button class="btn btn-primary btn-sm" data-act="nav" data-route="settings">' + icon('key') + '去设置</button></div>' +
    '</div>';
}

function collapsibleHead(title, open, extra) {
  return '<button class="collapsible-head' + (open ? ' is-open' : '') + '" data-act="toggle-collapse">' +
    icon('chevron', 'chev') + '<span>' + esc(title) + '</span>' +
    (extra ? '<span class="grow"></span>' + extra : '') +
  '</button>';
}

/* ============================================================
 * 7. 页面：欢迎引导
 * ============================================================ */
PAGES.welcome = function () { return ''; };

function renderWelcome() {
  const step = state.welcome.step;
  const steps = ['配置 AI', '认识一下', '成绩与教材'];
  const draftApi = state.drafts.settings ? state.drafts.settings.api : DEFAULT_SETTINGS.api;
  const draftProfile = state.drafts.profile || defaultProfile();

  const stepDots = steps.map(function (label, idx) {
    const n = idx + 1;
    const cls = n === step ? 'is-active' : n < step ? 'is-done' : '';
    return '<div class="wstep ' + cls + '">' +
      '<div class="wstep-dot">' + (n < step ? icon('check') : n) + '</div>' +
      '<div class="wstep-label">' + label + '</div>' +
    '</div>' + (idx < steps.length - 1 ? '<div class="wstep-line"></div>' : '');
  }).join('');

  let body = '';
  if (step === 1) {
    body =
      '<h2 class="welcome-h">先连上 AI 模型</h2>' +
      '<p class="welcome-p">AI 学习助手使用你自己的 API（DeepSeek、OpenAI 或任何兼容 OpenAI 协议的服务）。' +
      'Key 只保存在本机，所有请求都从主进程发出。</p>' +
      '<div class="form-grid">' +
        '<div class="field span-2"><label class="field-label">' + icon('globe') + 'API 地址（Base URL）</label>' +
          '<input class="input" data-bind="welcome.api.baseUrl" value="' + esc(draftApi.baseUrl) + '" placeholder="https://api.deepseek.com">' +
          '<span class="field-hint">DeepSeek 填 https://api.deepseek.com，OpenAI 填 https://api.openai.com/v1</span></div>' +
        '<div class="field span-2"><label class="field-label">' + icon('key') + 'API Key</label>' +
          '<input class="input" type="password" data-bind="welcome.api.apiKey" value="' + esc(draftApi.apiKey) + '" placeholder="sk-...">' +
          '<span class="field-hint">粘贴后点右侧眼睛可以检查有没有粘错</span></div>' +
        '<div class="field"><label class="field-label">' + icon('assistant') + '主对话模型</label>' +
          '<input class="input" data-bind="welcome.api.model" value="' + esc(draftApi.model) + '" placeholder="deepseek-chat"></div>' +
        '<div class="field"><label class="field-label">' + icon('brain') + '深度思考模型<span class="muted" style="font-weight:400">（可选）</span></label>' +
          '<input class="input" data-bind="welcome.api.reasoningModel" value="' + esc(draftApi.reasoningModel) + '" placeholder="deepseek-reasoner"></div>' +
      '</div>';
  } else if (step === 2) {
    body =
      '<h2 class="welcome-h">怎么称呼你？</h2>' +
      '<p class="welcome-p">这些信息只用来让 AI 的回答更贴合你的年级和进度，只保存在本机。</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label class="field-label">' + icon('user') + '昵称 / 姓名</label>' +
          '<input class="input" data-bind="welcome.profile.name" value="' + esc(draftProfile.name) + '" placeholder="比如：小林"></div>' +
        '<div class="field"><label class="field-label">' + icon('bookOpen') + '年级</label>' +
          '<select class="select" data-bind="welcome.profile.grade">' +
            GRADES.map(function (g) {
              return '<option value="' + g + '"' + (g === draftProfile.grade ? ' selected' : '') + '>' + g + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field"><label class="field-label">' + icon('home') + '学校<span class="muted" style="font-weight:400">（可选）</span></label>' +
          '<input class="input" data-bind="welcome.profile.school" value="' + esc(draftProfile.school) + '" placeholder="杭州市某某中学"></div>' +
        '<div class="field"><label class="field-label">' + icon('layers') + '班级<span class="muted" style="font-weight:400">（可选）</span></label>' +
          '<input class="input" data-bind="welcome.profile.class" value="' + esc(draftProfile.class) + '" placeholder="八（3）班"></div>' +
      '</div>' +
      '<div class="banner banner-info mt-16">' + icon('info') +
        '<div class="banner-desc">昵称会出现在问候语和 AI 的回答里；不填也能用，只是称呼会比较生疏。</div></div>';
  } else {
    body =
      '<h2 class="welcome-h">确认一下教材和成绩</h2>' +
      '<p class="welcome-p">浙江初中使用的教材版本是固定的，AI 出题和讲解都会依据这些版本；' +
      '成绩可以现在填，也可以以后在设置里补。</p>' +
      renderTextbookRules() +
      '<div class="divider"></div>' +
      '<div class="row-between mb-12"><div class="section-title" style="margin:0">' + icon('report') + '这次考试的成绩</div>' +
        '<span class="field-hint">没有考的科目点「跳过」，不要填 0</span></div>' +
      '<div class="field mb-12"><label class="field-label">考试名称</label>' +
        '<input class="input" data-bind="welcome.scores.examName" value="' + esc(state.drafts.scores ? state.drafts.scores.examName : '') + '" placeholder="比如：八年级上学期月考"></div>' +
      '<div id="score-rows">' + renderScoreRows(state.drafts.scores, 'welcome') + '</div>';
  }

  return '<div class="welcome">' +
    '<div class="welcome-top">' +
      '<div class="welcome-brand">' +
        '<div class="brand-mark">' + icon('brand') + '</div>' +
        '<div><div class="brand-name">AI 学习助手</div><div class="brand-tag">浙江初中 · 个性化学习</div></div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-sm" data-act="welcome-skip">先随便看看 ' + icon('arrow-right') + '</button>' +
    '</div>' +
    '<div class="welcome-card">' +
      '<div class="welcome-steps">' + stepDots + '</div>' +
      '<div class="welcome-body">' + body + '</div>' +
      '<div class="welcome-foot">' +
        (step > 1
          ? '<button class="btn btn-secondary" data-act="welcome-prev">' + icon('arrow-left') + '上一步</button>'
          : '<div class="welcome-tip">' + icon('info') + 'Key 只保存在本机</div>') +
        '<div class="row">' +
          (step < 3 ? '<button class="btn btn-ghost" data-act="welcome-next" data-skip="1">稍后填</button>' : '') +
          (step < 3
            ? '<button class="btn btn-primary" data-act="welcome-next">继续' + icon('arrow-right') + '</button>'
            : '<button class="btn btn-primary btn-lg" data-act="welcome-finish">' + icon('check') + '开始学习</button>') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderTextbookRules() {
  return '<div class="card card-flat" style="padding:4px 0">' +
    TEXTBOOK_RULES.map(function (rule) {
      return '<div class="textbook-rule">' +
        '<div class="textbook-rule-subject">' + subjectSubjectLabel(rule.subject) + '</div>' +
        '<div class="textbook-rule-value"><strong>' + esc(rule.version) + '</strong>' +
          '<span class="muted text-xs">' + esc(rule.note) + '</span></div>' +
      '</div>';
    }).join('') +
    '<div class="banner banner-info mt-12">' + icon('info') +
      '<div class="banner-desc">浙江的《科学》是合并课程，一本教科版教材覆盖物理、化学、生物三科内容；' +
      '《社会》由道法、历史、地理三科组成，均为人教版。AI 会按这个规则检索教材，回答不会串版本。</div>' +
    '</div>' +
  '</div>';
}

function renderScoreRows(scoresDraft, scope) {
  const scores = scoresDraft || defaultScores();
  return SUBJECTS.map(function (sub) {
    const entry = (scores.subjects && scores.subjects[sub]) || { score: null, full: subjectMeta(sub).full, skipped: false };
    const skipped = !!entry.skipped;
    return '<div class="score-row' + (skipped ? ' is-skipped' : '') + '" data-score-row="' + sub + '">' +
      '<div class="score-subject">' + subjectDot(sub) + esc(sub) + '</div>' +
      (skipped
        ? '<div class="score-skip-state" style="grid-column:span 2">' + icon('skip') + '已跳过 · 暂无成绩</div>'
        : '<input class="input" type="number" min="0" inputmode="decimal" data-bind="' + scope + '.scores.score" data-subject="' + sub + '" value="' + esc(entry.score == null ? '' : entry.score) + '" placeholder="分数">' +
          '<input class="input" type="number" min="0" inputmode="decimal" data-bind="' + scope + '.scores.full" data-subject="' + sub + '" value="' + esc(entry.full == null ? '' : entry.full) + '" placeholder="满分">') +
      '<button class="skip-btn' + (skipped ? ' is-on' : '') + '" data-act="toggle-skip" data-subject="' + sub + '" data-scope="' + scope + '">' +
        icon(skipped ? 'refresh' : 'skip') + (skipped ? '撤销跳过' : sub + '跳过') +
      '</button>' +
    '</div>';
  }).join('');
}

/* ============================================================
 * 8. 页面：学习台
 * ============================================================ */
PAGES.home = function () {
  const name = textOr(state.profile.name, '同学');
  const greeting = timeGreeting();
  const d = new Date();
  const dateText = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + weekdayLabel();
  const agenda = buildTodayAgenda();
  const recent = state.reports.slice(0, 3);
  const dailyAsk = state.settings.learning && state.settings.learning.dailyAsk !== false;
  const todayLogged = !!state.dailyLogs[todayStr()];
  const progressList = Object.keys(state.progress || {}).filter(function (sub) {
    const p = state.progress[sub];
    return p && (p.unit || (p.percent != null && p.percent > 0));
  }).slice(0, 4);

  let hero;
  if (!isConfigured()) {
    hero = '<div class="home-hero">' +
      '<div class="home-hero-main">' +
        '<div class="home-hero-title">先配置 AI 接口，就能开始学习了</div>' +
        '<div class="home-hero-desc">填一次 API 地址和 Key 就好，之后 AI 可以帮你出题、批改、讲解，还能结合你的教材和资料。</div>' +
      '</div>' +
      '<div class="home-hero-actions">' +
        '<button class="btn btn-on-hero" data-act="nav" data-route="settings">' + icon('key') + '去配置</button>' +
        '<button class="btn btn-on-hero-ghost" data-act="nav" data-route="library">' + icon('library') + '先看看资料库</button>' +
      '</div>' +
    '</div>';
  } else {
    hero = '<div class="home-hero">' +
      '<div class="home-hero-main">' +
        '<div class="home-hero-title">' + (agenda.leave ? '今天请假，好好休息' : '准备好了就开始今天的练习吧') + '</div>' +
        '<div class="home-hero-desc">' +
          (agenda.leave ? '休息也是一种学习节奏，回来再补上就好。' : '挑一科，AI 会根据你的进度和薄弱点出题，做完马上有详细报告。') +
        '</div>' +
      '</div>' +
      '<div class="home-hero-actions">' +
        '<button class="btn btn-on-hero" data-act="quick-quiz" data-subject="' + esc(pickWeakestSubject()) + '">' + icon('play') + '开始练习</button>' +
        '<button class="btn btn-on-hero-ghost" data-act="nav" data-route="assistant">' + icon('assistant') + '问问 AI</button>' +
      '</div>' +
    '</div>';
  }

  if (state.needsApi) hero = apiGuideBanner() + hero;

  return '<div class="home-head">' +
      '<div>' +
        '<div class="home-date">' + icon('calendar') + dateText + '</div>' +
        '<h1 class="home-hello">' + greeting + '，<em>' + esc(name) + '</em></h1>' +
        '<p class="home-sub">' + textOr(state.profile.grade ? state.profile.grade + ' · ' : '', '') +
          '今天想学点什么？挑一科开始，或者先问问 AI。</p>' +
      '</div>' +
      '<button class="btn btn-secondary" data-act="nav" data-route="progress">' + icon('target') + '管理学习安排</button>' +
    '</div>' +

    hero +

    '<div class="home-grid">' +
      '<div class="home-col">' +
        '<div class="card">' +
          '<div class="card-head">' +
            '<div><div class="card-title">' + icon('calendar') + '今日安排</div>' +
            '<div class="card-sub">' + (agenda.leave ? '今天请假了' : agenda.items.length ? '根据你的计划和进度整理' : '还没有安排') + '</div></div>' +
            '<button class="btn btn-ghost btn-sm" data-act="nav" data-route="progress">调整安排</button>' +
          '</div>' +
          (agenda.leave
            ? '<div class="today-leave">' + icon('info') +
                '<div><strong>今天请假</strong><div class="text-sm">' + esc(agenda.leave.reason || '已登记请假') + '</div></div></div>'
            : agenda.items.length
              ? agenda.items.map(function (item) {
                  return '<div class="today-item">' +
                    '<div class="today-time">' + esc(item.time || '—') + '</div>' +
                    '<div class="today-body">' +
                      '<div class="today-title">' + subjectDot(item.subject) + esc(item.title) +
                        (item.tag ? '<span class="badge badge-primary">' + esc(item.tag) + '</span>' : '') + '</div>' +
                      (item.desc ? '<div class="today-note">' + esc(item.desc) + '</div>' : '') +
                    '</div>' +
                    '<button class="btn btn-soft btn-sm" data-act="quick-quiz" data-subject="' + esc(item.subject) + '">去练</button>' +
                  '</div>';
                }).join('')
              : '<div class="home-empty-line">' + icon('info') +
                  '<span>今天还没有安排。在「学习进度」里添加固定安排，或者直接开始一次练习。</span></div>' +
                '<div class="row mt-12">' +
                  '<button class="btn btn-primary btn-sm" data-act="quick-quiz" data-subject="' + esc(pickWeakestSubject()) + '">' + icon('play') + '开始练习</button>' +
                  '<button class="btn btn-secondary btn-sm" data-act="nav" data-route="progress">' + icon('plus') + '添加安排</button>' +
                '</div>') +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><div class="card-title">' + icon('play') + '快捷开始练习</div>' +
            '<span class="card-sub">点科目直接进入练习</span></div>' +
          '<div class="quick-subjects">' +
            SUBJECTS.map(function (sub) {
              return '<button class="quick-subject" data-act="quick-quiz" data-subject="' + sub + '">' +
                subjectDot(sub) + esc(sub) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="divider"></div>' +
          '<div class="row-between">' +
            '<div class="home-empty-line">' + icon('clock') + '<span>每次默认 ' + esc(String(state.settings.learning.dailyMinutes || 20)) + ' 分钟，可随时调整</span></div>' +
            '<button class="btn btn-ghost btn-sm" data-act="upload-material">' + icon('upload') + '上传学习资料</button>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><div><div class="card-title">' + icon('report') + '最近报告</div>' +
            '<div class="card-sub">做完练习会自动生成</div></div>' +
            '<button class="btn btn-ghost btn-sm" data-act="nav" data-route="report">全部报告</button></div>' +
          (recent.length
            ? recent.map(reportMiniCard).join('')
            : '<div class="home-empty-line">' + icon('info') +
              '<span>还没有报告。完成一次练习，AI 会告诉你哪里薄弱、下一步怎么练。</span></div>') +
        '</div>' +
      '</div>' +

      '<div class="home-col">' +
        (dailyAsk && (!todayLogged || state.dailyEditing)
          ? '<div class="card daily-card">' +
              '<div class="card-head"><div><div class="card-title">' + icon('sparkles') + (todayLogged ? '修改今天的登记' : '今天学了点什么？') + '</div>' +
              '<div class="card-sub">' + (todayLogged ? '改完记得保存' : '登记一下，AI 好帮你安排后面') + '</div></div></div>' +
              '<textarea class="textarea" id="daily-input" placeholder="比如：数学学了二次函数，做了 6 道应用题；英语背了 Unit 5 单词…">' + esc(state.dailyDraft) + '</textarea>' +
              '<div class="row mt-12" style="justify-content:space-between">' +
                '<span class="field-hint">每天只问一次</span>' +
                '<button class="btn btn-primary btn-sm" data-act="save-daily">' + icon('check') + '记下来</button>' +
              '</div>' +
            '</div>'
          : dailyAsk
            ? '<div class="card"><div class="card-head"><div class="card-title">' + icon('check-circle') + '今天已经登记过了</div></div>' +
              '<p class="text-sm muted pre-wrap">' + esc((state.dailyLogs[todayStr()] || {}).text || '') + '</p>' +
              '<button class="btn btn-ghost btn-sm mt-8" data-act="edit-daily">' + icon('edit') + '修改</button></div>'
            : '') +

        '<div class="card">' +
          '<div class="card-head"><div class="card-title">' + icon('progress') + '各科进度</div>' +
            '<button class="btn btn-ghost btn-sm" data-act="nav" data-route="progress">详情</button></div>' +
          (progressList.length
            ? progressList.map(function (sub) {
                const p = state.progress[sub] || {};
                const percent = clamp(Number(p.percent) || 0, 0, 100);
                return '<div class="home-prog-item">' +
                  '<div class="home-prog-top"><span class="row" style="gap:7px">' + subjectDot(sub) + esc(sub) + '</span>' +
                    '<strong class="tabular" style="font-size:12px">' + percent + '%</strong></div>' +
                  '<div class="bar bar-sm"><div class="bar-fill" style="width:' + percent + '%"></div></div>' +
                  (p.unit ? '<div class="home-prog-unit" style="margin-top:5px">' + esc(p.unit) + '</div>' : '') +
                '</div>';
              }).join('')
            : '<div class="home-empty-line">' + icon('info') + '<span>还没有记录进度，去「学习进度」里填一下现在学到哪了。</span></div>') +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><div class="card-title">' + icon('assistant') + 'AI 助手</div>' +
            '<button class="btn btn-ghost btn-sm" data-act="nav" data-route="assistant">打开</button></div>' +
          '<p class="text-sm muted" style="line-height:1.75">不会的题、写不出的作文、记不住的知识点，都可以直接问。' +
          'AI 会先查你的教材和资料，再联网核对。</p>' +
          '<div class="banner banner-success mt-12" style="padding:9px 12px">' + icon('globe') +
            '<div class="banner-desc">联网搜索：已开启（强制）</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
};

function pickWeakestSubject() {
  const progress = state.progress || {};
  let pick = '';
  let low = 101;
  Object.keys(progress).forEach(function (sub) {
    const p = progress[sub];
    if (!p) return;
    const percent = Number(p.percent);
    if (isFinite(percent) && percent < low && percent < 100) {
      low = percent;
      pick = sub;
    }
  });
  return pick || '数学';
}

function buildTodayAgenda() {
  const today = todayStr();
  const wd = weekdayIndex();
  const leave = state.leaves.find(function (l) { return l && l.date === today; });
  if (leave) return { leave: leave, items: [] };
  const items = [];

  state.plans.filter(function (p) {
    if (!p) return false;
    // 考试复习计划项带具体日期时，只在当天出现
    if (p.date) return p.date === today;
    const pw = Number(p.weekday);
    return !pw || pw === wd;
  }).sort(function (a, b) {
    return String(a.time || '').localeCompare(String(b.time || ''));
  }).forEach(function (p) {
    items.push({
      type: 'plan',
      time: p.time || '—',
      title: p.title || ((p.subject || '综合') + ' 学习'),
      subject: p.subject || '综合',
      desc: [p.minutes ? p.minutes + ' 分钟' : '', p.note || ''].filter(Boolean).join(' · '),
      tag: ''
    });
  });

  if (!items.length) {
    Object.keys(state.progress || {}).slice(0, 3).forEach(function (sub) {
      const p = state.progress[sub];
      if (!p || !(p.unit || (Number(p.percent) > 0 && Number(p.percent) < 100))) return;
      items.push({
        type: 'progress',
        time: '—',
        title: '继续 ' + sub + (p.unit ? ' · ' + p.unit : ''),
        subject: sub,
        desc: '当前进度 ' + clamp(Number(p.percent) || 0, 0, 100) + '%' + (p.note ? ' · ' + p.note : ''),
        tag: '进度'
      });
    });
  }
  return { leave: null, items: items };
}

function stripMarkdown(text, max) {
  const plain = String(text == null ? '' : text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*#>_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && plain.length > max) return plain.slice(0, max) + '…';
  return plain;
}

function reportMiniCard(report) {
  const stats = report.stats || {};
  const acc = Number(stats.accuracy);
  const pct = Math.round((isFinite(acc) ? acc : 0) * 100);
  const cls = pct >= 80 ? '' : pct >= 60 ? 'is-mid' : 'is-low';
  return '<button class="report-mini" data-act="open-report" data-id="' + esc(report.id) + '">' +
    '<div class="report-mini-score ' + cls + '">' + pct + '%</div>' +
    '<div class="report-mini-main">' +
      '<div class="report-mini-title">' + esc(report.subject || '练习') + ' · ' + (stats.correct != null ? stats.correct + '/' + (stats.total || 0) + ' 题' : '练习报告') + '</div>' +
      '<div class="report-mini-desc">' + esc(fmtRelative(report.createdAt)) + ' · ' + esc(stripMarkdown((report.ai && report.ai.summary) || '查看详细报告', 60)) + '</div>' +
    '</div>' +
    icon('chevron') +
  '</button>';
}

/* ============================================================
 * 9. 页面：练习
 * ============================================================ */
function ensureQuizState(subject) {
  if (!state.quiz) {
    state.quiz = {
      step: 'setup',
      subject: subject || '数学',
      minutes: Number(state.settings.learning.dailyMinutes) || 20,
      minutesCustom: '',
      willing: '想学',
      willingCustom: '',
      count: 5,
      focus: '',
      useTextbooks: true,
      materialIds: [],
      gen: { status: '', statusText: '', search: null, steps: {} },
      error: '',
      raw: '',
      reasoning: '',
      questions: [],
      answers: {},
      index: 0,
      submitting: false,
      report: null,
      job: null,
      examMode: false,
      examTimeLimit: 0,
      examDeadline: 0,
      examTimer: null,
      examWarned: false,
      examForced: false,
      examSuggestion: null,
      examLoading: false,
      answeringStartedAt: 0,
      actualMinutes: null
    };
  } else if (subject) {
    state.quiz.subject = subject;
    if (state.quiz.step !== 'setup') resetQuizFlow();
  }
  if (state.quiz.step === 'done') resetQuizFlow();
  return state.quiz;
}

function resetQuizFlow() {
  const q = state.quiz;
  if (!q) return;
  if (q.job && q.job.requestId) abortAI(q.job.requestId);
  stopExamTimer();
  q.step = 'setup';
  q.questions = [];
  q.answers = {};
  q.index = 0;
  q.error = '';
  q.raw = '';
  q.reasoning = '';
  q.report = null;
  q.submitting = false;
  q.gen = { status: '', statusText: '', search: null, steps: {} };
  q.job = null;
  q.examMode = false;
  q.examTimeLimit = 0;
  q.examDeadline = 0;
  q.examWarned = false;
  q.examForced = false;
  q.examSuggestion = null;
  q.examLoading = false;
  q.answeringStartedAt = 0;
  q.actualMinutes = null;
  state.quizGenText = '';
}

function quizMinutes() {
  const q = state.quiz;
  const custom = Number(q && q.minutesCustom);
  if (isFinite(custom) && custom > 0) return clamp(Math.round(custom), 1, 180);
  return clamp(Number(q && q.minutes) || 20, 1, 180);
}

function quizWilling() {
  const q = state.quiz;
  const custom = String((q && q.willingCustom) || '').trim();
  return custom || (q && q.willing) || '想学';
}

function quizCount() {
  const q = state.quiz;
  const n = Number(q && q.count);
  return isFinite(n) && n > 0 ? clamp(Math.round(n), 1, 12) : 5;
}

PAGES.quiz = function () {
  const q = ensureQuizState();
  const stepMap = { setup: 0, generating: 2, ready: 3, answering: 3, submitting: 3, error: 2, done: 4 };
  const activeStep = stepMap[q.step] == null ? 0 : stepMap[q.step];
  const stepLabels = ['选择科目', '时长与意愿', '生成题目', '逐题作答', '查看报告'];
  const stepsHtml = stepLabels.map(function (label, idx) {
    const cls = idx === activeStep ? 'is-active' : idx < activeStep ? 'is-done' : '';
    return '<span class="qstep ' + cls + '"><span class="qstep-num">' + (idx < activeStep ? '✓' : idx + 1) + '</span>' + label + '</span>' +
      (idx < stepLabels.length - 1 ? icon('chevron', 'qstep-arrow') : '');
  }).join('');

  let body = '';
  if (q.step === 'setup') body = renderQuizSetup(q);
  else if (q.step === 'generating') body = renderQuizGenerating(q);
  else if (q.step === 'ready') body = renderQuizReady(q);
  else if (q.step === 'answering') body = renderQuizAnswering(q);
  else if (q.step === 'submitting') body = renderQuizSubmitting(q);
  else if (q.step === 'error') body = renderQuizError(q);

  return pageHead({
    eyebrow: icon('sparkles') + ' 个性化练习',
    title: '练习',
    desc: '选好科目和节奏，AI 按你的教材版本和进度出题，做完马上批改。',
    actions: '<button class="btn btn-secondary" data-act="nav" data-route="report">' + icon('report') + '历史报告</button>'
  }) + '<div class="quiz-steps">' + stepsHtml + '</div>' + body;
};

function renderQuizSetup(q) {
  const minutes = quizMinutes();
  const willing = quizWilling();
  const materialCount = q.materialIds.length;
  const customMinutes = Number(q.minutesCustom) > 0;
  const customWilling = !!String(q.willingCustom || '').trim();

  return apiGuideBanner() +
    '<div class="quiz-setup">' +
      '<div class="card quiz-form-card">' +
        '<div class="quiz-block">' +
          '<div class="quiz-block-head"><span class="quiz-block-num">1</span>' +
            '<span class="quiz-block-title">今天练哪一科？</span>' +
            '<span class="quiz-block-hint">浙江初中 · ' + esc(state.profile.grade || '八年级') + '</span></div>' +
          '<div class="subject-grid">' +
            SUBJECTS.map(function (sub) {
              return '<button class="subject-chip' + (sub === q.subject ? ' is-active' : '') + '" data-act="quiz-subject" data-subject="' + sub + '">' +
                subjectDot(sub) + esc(sub) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="quiz-block">' +
          '<div class="quiz-block-head"><span class="quiz-block-num">2</span>' +
            '<span class="quiz-block-title">打算练多久？</span>' +
            '<span class="quiz-block-hint">' + (customMinutes ? '已用自定义时长：' + minutes + ' 分钟' : '按自己的节奏来') + '</span></div>' +
          '<div class="pill-group">' +
            [10, 15, 20, 30].map(function (m) {
              const active = !customMinutes && Number(q.minutes) === m;
              return '<button class="pill' + (active ? ' is-active' : '') + '" data-act="quiz-minutes" data-value="' + m + '">' + m + ' 分钟</button>';
            }).join('') +
          '</div>' +
          '<div class="custom-input-row">' +
            '<input class="input input-sm" type="number" min="1" max="180" data-bind="quiz.minutesCustom" data-type="number" value="' + esc(q.minutesCustom) + '" placeholder="自定义分钟数">' +
            '<span class="field-hint">想要更短或更长？直接填数字，会覆盖上面的选项</span>' +
          '</div>' +
        '</div>' +

        '<div class="quiz-block">' +
          '<div class="quiz-block-head"><span class="quiz-block-num">3</span>' +
            '<span class="quiz-block-title">现在的心情怎么样？</span>' +
            '<span class="quiz-block-hint">' + (customWilling ? '已用自定义意愿：' + esc(willing) : 'AI 会据此调整难度和语气') + '</span></div>' +
          '<div class="pill-group">' +
            ['想学', '一般', '不太想'].map(function (w) {
              const active = !customWilling && q.willing === w;
              return '<button class="pill' + (active ? ' is-active' : '') + '" data-act="quiz-willing" data-value="' + w + '">' + w + '</button>';
            }).join('') +
          '</div>' +
          '<div class="custom-input-row">' +
            '<input class="input input-sm" data-bind="quiz.willingCustom" value="' + esc(q.willingCustom) + '" placeholder="自定义，比如：有点累但想试试">' +
            '<span class="field-hint">也可以直接描述状态，AI 会照顾你的节奏</span>' +
          '</div>' +
        '</div>' +

        '<div class="quiz-block">' +
          '<div class="quiz-block-head"><span class="quiz-block-num">4</span>' +
            '<span class="quiz-block-title">想重点练什么？</span>' +
            '<span class="quiz-block-hint">选填</span></div>' +
          '<div class="form-grid">' +
            '<div class="field"><label class="field-label">' + icon('target') + '题目数量</label>' +
              '<input class="input" type="number" min="1" max="12" data-bind="quiz.count" data-type="number" value="' + esc(q.count) + '">' +
              '<span class="field-hint">建议 3–8 道，一次练太多容易累</span></div>' +
            '<div class="field"><label class="field-label">' + icon('pin') + '具体范围</label>' +
              '<input class="input" data-bind="quiz.focus" value="' + esc(q.focus) + '" placeholder="例如：一元二次方程的应用题">' +
              '<span class="field-hint">留空就按教材进度出综合题</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="quiz-block">' +
          '<div class="quiz-block-head"><span class="quiz-block-num">5</span>' +
            '<span class="quiz-block-title">参考资料</span>' +
            '<span class="quiz-block-hint">让 AI 照着你的进度和资料出题</span></div>' +
          '<div class="switch-row">' +
            '<div><div class="switch-label">检索内置教材</div>' +
              '<div class="switch-desc">按浙江教材版本找知识点，避免超纲</div></div>' +
            '<button class="switch' + (q.useTextbooks ? ' is-on' : '') + '" data-act="quiz-toggle-textbooks" role="switch" aria-checked="' + (q.useTextbooks ? 'true' : 'false') + '"></button>' +
          '</div>' +
          '<div class="row wrap mt-12">' +
            '<button class="btn btn-secondary btn-sm" data-act="quiz-pick-materials">' + icon('folder') +
              '选择资料' + (materialCount ? '（已选 ' + materialCount + '）' : '') + '</button>' +
            '<button class="btn btn-ghost btn-sm" data-act="upload-material">' + icon('upload') + '上传新资料</button>' +
            (materialCount && q.selectedMaterialNames && q.selectedMaterialNames.length
              ? '<span class="field-hint">' + esc(q.selectedMaterialNames.join('、')) + '</span>'
              : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="quiz-side">' +
        '<div class="card">' +
          '<div class="card-title mb-12">' + icon('target') + '本次练习</div>' +
          '<div class="quiz-summary-row"><span>科目</span><strong>' + esc(q.subject) + '</strong></div>' +
          '<div class="quiz-summary-row"><span>时长</span><strong>' + minutes + ' 分钟</strong></div>' +
          '<div class="quiz-summary-row"><span>意愿</span><strong>' + esc(willing) + '</strong></div>' +
          '<div class="quiz-summary-row"><span>题量</span><strong>' + quizCount() + ' 道</strong></div>' +
          '<div class="quiz-summary-row"><span>教材依据</span><strong>' + (q.useTextbooks ? '已开启' : '未开启') + '</strong></div>' +
          '<div class="divider"></div>' +
          '<button class="btn btn-primary btn-block btn-lg" data-act="quiz-start"' + (isConfigured() ? '' : ' disabled') + '>' +
            icon('sparkles') + '开始出题</button>' +
          (isConfigured() ? '' : '<p class="field-hint mt-8" style="text-align:center">配置 API 后才能生成题目</p>') +
          '<div class="banner banner-success mt-12" style="padding:9px 12px">' + icon('globe') +
            '<div class="banner-desc">联网搜索：已开启（强制）</div></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="card-title mb-8">' + icon('layers') + '教材版本</div>' +
          '<div class="stack" style="gap:5px;font-size:12px;color:var(--muted)">' +
            TEXTBOOK_RULES.slice(0, 5).map(function (r) {
              return '<div class="row-between"><span>' + esc(r.subject) + '</span><strong style="color:var(--text-2)">' + esc(r.version) + '</strong></div>';
            }).join('') +
          '</div>' +
          '<p class="field-hint mt-8">浙江《科学》合并物理、化学、生物；《社会》= 道法 · 历史 · 地理。</p>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderQuizGenerating(q) {
  const gen = q.gen || {};
  const stepDefs = [
    { key: 'retrieving', label: '检索教材与资料', icon: 'bookOpen' },
    { key: 'searching', label: '联网核对知识点', icon: 'globe' },
    { key: 'thinking', label: 'AI 正在构思题目', icon: 'brain' },
    { key: 'writing', label: '正在写题', icon: 'edit' }
  ];
  const stepsHtml = stepDefs.map(function (s) {
    const stateName = gen.steps && gen.steps[s.key];
    const cls = stateName === 'done' ? 'is-done' : stateName === 'active' ? 'is-active' : '';
    const mark = stateName === 'done' ? icon('check') : stateName === 'active' ? '<span class="spinner spinner-sm"></span>' : icon(s.icon);
    return '<div class="gen-step ' + cls + '">' + mark + '<span>' + s.label + '</span></div>';
  }).join('');

  return '<div class="gen-panel" style="max-width:760px">' +
    '<div class="card">' +
      '<div class="gen-status">' +
        '<div class="gen-status-icon pulse">' + icon('sparkles') + '</div>' +
        '<div class="gen-status-main">' +
          '<div class="gen-status-title" id="gen-title">' + esc(gen.statusText || '正在生成练习…') + '</div>' +
          '<div class="gen-status-desc" id="gen-desc">' + esc(gen.statusDesc || 'AI 正在结合教材和你的进度准备题目') + '</div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-sm" data-act="quiz-cancel">' + icon('stop') + '停止</button>' +
      '</div>' +
      '<div class="gen-steps mt-12" id="gen-steps">' + stepsHtml + '</div>' +
      (gen.search
        ? '<div class="banner ' + (gen.search.ok ? 'banner-success' : 'banner-warning') + ' mt-12" style="padding:9px 12px">' +
            icon(gen.search.ok ? 'globe' : 'wifi-off') +
            '<div class="banner-desc" id="gen-search-desc">' +
              (gen.search.ok
                ? '已联网检索到 ' + ((gen.search.results && gen.search.results.length) || 0) + ' 条参考资料'
                : '本轮联网检索失败：' + esc(gen.search.error || '网络不可用')) +
            '</div></div>'
        : '') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div class="card-title">' + icon('edit') + 'AI 正在写什么</div>' +
        '<span class="badge badge-primary" id="gen-len">0 字</span></div>' +
      '<div class="gen-stream" id="gen-stream">已经连上模型，等第一段内容…</div>' +
    '</div>' +
  '</div>';
}

/* ---------- 考试模式（计时 / 提醒 / 强制交卷） ---------- */
function formatCountdown(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

function renderQuizReady(q) {
  const count = q.questions.length;
  const loading = !!q.examLoading;
  return '<div class="quiz-ready-wrap">' +
    '<div class="card">' +
      '<div class="card-head">' +
        '<div><div class="card-title">' + icon('check') + '题目已生成 · ' + count + ' 道</div>' +
        '<div class="card-sub">' + esc(q.subject) + ' · ' + esc(state.profile.grade || '八年级') +
        ' · 可以开始考试（计时），也可以直接练习</div></div>' +
      '</div>' +
      '<div class="quiz-ready-list">' +
        q.questions.map(function (it, i) {
          const rawStem = String(it.stem || '').replace(/\$/g, '');
          const preview = rawStem.slice(0, 70);
          return '<div class="quiz-ready-item">' +
            '<span class="quiz-ready-num">' + (i + 1) + '</span>' +
            '<span class="quiz-ready-text">' + esc(preview) + (rawStem.length > 70 ? '…' : '') + '</span>' +
            (it.knowledgePoint ? '<span class="tag">' + esc(it.knowledgePoint) + '</span>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="banner banner-info mt-16">' + icon('clock') +
        '<div><div class="banner-title">两种模式</div>' +
        '<div class="banner-desc">「开始考试」由 AI 自动建议总时长并开始倒计时，' +
        '<strong>最后 10% 的时间会提醒</strong>，时间到自动交卷（未作答的题按未作答处理）；' +
        '「直接练习」不计时，随时提交。</div></div>' +
      '</div>' +
      '<div class="row wrap mt-16">' +
        '<button class="btn btn-primary" data-act="quiz-start-exam"' + (loading ? ' disabled' : '') + '>' +
          (loading ? '<span class="spinner spinner-sm"></span> 正在估算建议时长…' : icon('play') + '开始考试（计时）') + '</button>' +
        '<button class="btn btn-secondary" data-act="quiz-start-practice"' + (loading ? ' disabled' : '') + '>' +
          icon('edit') + '直接练习（不计时）</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="quiz-back-setup"' + (loading ? ' disabled' : '') + '>' +
          icon('arrow-left') + '重新设置</button>' +
      '</div>' +
      (q.examSuggestion
        ? '<p class="field-hint mt-12">建议时长：' + q.examSuggestion.minutes + ' 分钟' +
          (q.examSuggestion.reason ? '（' + esc(q.examSuggestion.reason) + '）' : '') + '</p>'
        : '') +
    '</div>' +
  '</div>';
}

function startExamTimer(minutes) {
  const q = state.quiz;
  if (!q) return;
  stopExamTimer();
  q.examTimeLimit = Math.max(60, Math.round(minutes * 60));
  q.examDeadline = Date.now() + q.examTimeLimit * 1000;
  q.examWarned = false;
  q.examTimer = setInterval(tickExamTimer, 1000);
  tickExamTimer();
}

function stopExamTimer() {
  const q = state.quiz;
  if (!q) return;
  if (q.examTimer) {
    clearInterval(q.examTimer);
    q.examTimer = null;
  }
  q.examDeadline = 0;
}

function tickExamTimer() {
  const q = state.quiz;
  if (!q || !q.examDeadline) return;
  const remain = Math.max(0, Math.round((q.examDeadline - Date.now()) / 1000));
  const warnAt = Math.max(30, Math.round(q.examTimeLimit * 0.1));
  const el = document.getElementById('exam-countdown');
  if (el) {
    el.textContent = formatCountdown(remain);
    el.classList.toggle('is-warning', remain <= warnAt);
  }
  if (!q.examWarned && remain <= warnAt) {
    q.examWarned = true;
    toast('还剩 ' + Math.max(1, Math.ceil(remain / 60)) + ' 分钟，注意时间', 'warning', 6000);
  }
  if (remain <= 0) {
    stopExamTimer();
    q.examForced = true;
    toast('考试时间到，已自动交卷', 'warning', 5000);
    submitQuiz(true);
  }
}

async function startExamFlow() {
  const q = state.quiz;
  if (!q || q.step !== 'ready' || q.examLoading) return;
  if (!isConfigured()) {
    toast('没有配置 API，无法生成建议时长；可以先直接练习', 'warning');
    return;
  }
  q.examLoading = true;
  render();
  const suggestion = await requestExamTime(q);
  q.examLoading = false;
  q.examSuggestion = suggestion;
  q.examMode = true;
  q.step = 'answering';
  q.index = 0;
  q.answeringStartedAt = Date.now();
  startExamTimer(suggestion.minutes);
  render();
  toast('开始考试：建议时长 ' + suggestion.minutes + ' 分钟' + (suggestion.local ? '（本地估算）' : ''), 'success', 4500);
}

function localExamMinutesClient(q) {
  let mins = 0;
  q.questions.forEach(function (it) {
    const type = it.type === 'choice' ? 'choice' : it.type === 'short' ? 'short' : 'fill';
    mins += type === 'choice' ? 1.5 : type === 'fill' ? 2.5 : 4;
  });
  return Math.max(5, Math.min(90, Math.round(mins + 3)));
}

function requestExamTime(q) {
  const stats = { choice: 0, fill: 0, short: 0 };
  q.questions.forEach(function (it) {
    const t = it.type === 'choice' ? 'choice' : it.type === 'short' ? 'short' : 'fill';
    stats[t] += 1;
  });
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (val) {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const fallback = function () {
      done({ minutes: localExamMinutesClient(q), reason: '按题型估算', local: true });
    };
    const timer = setTimeout(fallback, 15000);
    try {
      startAI({
        mode: 'examTime',
        messages: [{ role: 'user', content: '请为这次 ' + q.subject + ' 练习建议一个总时长。' }],
        context: {
          subject: q.subject,
          grade: state.profile.grade || '八年级',
          quiz: {
            questions: q.questions.map(function (it) { return { type: it.type, difficulty: it.difficulty }; }),
            stats: stats
          },
          plannedMinutes: quizMinutes()
        },
        options: { deepThinking: false }
      }, {
        onDone: function (evt) {
          clearTimeout(timer);
          const json = evt.json || {};
          const m = Number(json.minutes);
          done({
            minutes: isFinite(m) ? clamp(Math.round(m), 5, 90) : localExamMinutesClient(q),
            reason: json.reason || '',
            local: !isFinite(m)
          });
        },
        onError: function () {
          clearTimeout(timer);
          fallback();
        }
      }).catch(function () {
        clearTimeout(timer);
        fallback();
      });
    } catch (err) {
      clearTimeout(timer);
      fallback();
    }
  });
}

function renderQuizAnswering(q) {
  const total = q.questions.length;
  const idx = clamp(q.index, 0, total - 1);
  const item = q.questions[idx];
  if (!item) return renderQuizError({ raw: q.raw, error: '题目数据不完整，请重新生成' });
  const answeredCount = q.questions.filter(function (x) {
    return String(q.answers[x.id] || '').trim() !== '';
  }).length;
  const percent = Math.round(((idx + 1) / total) * 100);
  const userAnswer = q.answers[item.id] || '';

  let inputHtml = '';
  if (item.type === 'choice') {
    const options = item.options && item.options.length ? item.options : [];
    inputHtml = '<div class="q-options">' + options.map(function (opt) {
      const active = normalizeAnswer(userAnswer) === normalizeAnswer(opt.key);
      return '<button class="q-option' + (active ? ' is-active' : '') + '" data-act="quiz-answer" data-qid="' + esc(item.id) + '" data-value="' + esc(opt.key) + '">' +
        '<span class="q-option-key">' + esc(opt.key) + '</span>' +
        '<span class="q-option-text">' + richInline(opt.text) + '</span>' +
      '</button>';
    }).join('') + '</div>';
  } else if (item.type === 'fill') {
    inputHtml = '<input class="input" data-bind="quiz.answer" data-qid="' + esc(item.id) + '" value="' + esc(userAnswer) + '" placeholder="在这里填写答案" autocomplete="off">';
  } else {
    inputHtml = '<textarea class="textarea q-textarea" data-bind="quiz.answer" data-qid="' + esc(item.id) + '" placeholder="写出你的思路和答案，AI 会看过程">' + esc(userAnswer) + '</textarea>';
  }

  const timerHtml = q.examMode && q.examDeadline
    ? '<div class="exam-bar" id="exam-bar">' + icon('clock') +
        '<span class="exam-bar-label">考试中</span>' +
        '<span class="exam-countdown" id="exam-countdown">' +
          formatCountdown(Math.max(0, Math.round((q.examDeadline - Date.now()) / 1000))) + '</span>' +
        '<span class="exam-bar-hint">最后 10% 时间会提醒 · 到点自动交卷</span>' +
      '</div>'
    : '';

  return timerHtml + '<div class="quiz-progress-bar">' +
      '<div class="bar"><div class="bar-fill" style="width:' + percent + '%"></div></div>' +
      '<div class="quiz-progress-text">第 ' + (idx + 1) + ' / ' + total + ' 题 · 已答 ' + answeredCount + '</div>' +
    '</div>' +
    '<div class="card quiz-question-card" id="quiz-question">' +
      '<div class="q-head">' +
        '<span class="q-index">第 ' + (idx + 1) + ' 题</span>' +
        '<span class="q-type">' + (item.type === 'choice' ? '选择题' : item.type === 'fill' ? '填空题' : '简答题') + '</span>' +
        (item.knowledgePoint ? '<span class="tag">' + esc(item.knowledgePoint) + '</span>' : '') +
        '<span class="grow"></span>' +
        '<button class="btn btn-ghost btn-sm" data-act="quiz-exit">' + icon('x') + '放弃本次</button>' +
      '</div>' +
      '<div class="q-stem">' + mdToHtml(item.stem) + '</div>' +
      inputHtml +
      '<div class="q-foot">' +
        '<div class="q-dots">' +
          q.questions.map(function (x, i) {
            const ans = String(q.answers[x.id] || '').trim() !== '' ? ' is-answered' : '';
            return '<button class="q-dot' + ans + (i === idx ? ' is-current' : '') + '" data-act="quiz-goto" data-index="' + i + '" title="第 ' + (i + 1) + ' 题">' + (i + 1) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-secondary" data-act="quiz-prev"' + (idx === 0 ? ' disabled' : '') + '>' + icon('arrow-left') + '上一题</button>' +
          (idx < total - 1
            ? '<button class="btn btn-primary" data-act="quiz-next">下一题' + icon('arrow-right') + '</button>'
            : '<button class="btn btn-primary" data-act="quiz-submit">' + icon('check') + '提交批改</button>') +
        '</div>' +
      '</div>' +
    '</div>' +
    (answeredCount < total
      ? '<p class="field-hint mt-12" style="text-align:center">还有 ' + (total - answeredCount) + ' 题没答，可以点上面的题号跳过去</p>'
      : '');
}

function renderQuizSubmitting(q) {
  return '<div class="card" style="max-width:640px">' +
    '<div class="gen-status">' +
      '<div class="gen-status-icon pulse">' + icon('report') + '</div>' +
      '<div class="gen-status-main">' +
        '<div class="gen-status-title">正在批改…</div>' +
        '<div class="gen-status-desc" id="gen-desc">AI 正在逐题核对，并整理薄弱点和下一步建议</div>' +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" data-act="quiz-cancel">' + icon('stop') + '停止</button>' +
    '</div>' +
    '<div class="skeleton mt-16"><div class="skeleton-line" style="height:14px;width:82%"></div>' +
      '<div class="skeleton-line" style="height:12px;width:96%"></div>' +
      '<div class="skeleton-line" style="height:12px;width:74%"></div>' +
      '<div class="skeleton-line" style="height:12px;width:56%"></div></div>' +
  '</div>';
}

function renderQuizError(q) {
  return '<div class="card" style="max-width:820px">' +
    '<div class="banner banner-warning mb-16">' + icon('alert-triangle') +
      '<div><div class="banner-title">AI 这次没有按格式返回题目</div>' +
      '<div class="banner-desc">' + esc(q.error || '模型输出的内容无法解析成题目。可以重试一次，通常会成功。') + '</div></div>' +
    '</div>' +
    (q.raw
      ? '<div class="card-head card-head-tight"><div class="card-title">' + icon('edit') + 'AI 的原始输出</div>' +
          '<span class="badge">' + esc(String(q.raw.length)) + ' 字</span></div>' +
        '<div class="text-preview" style="max-height:320px">' + esc(q.raw) + '</div>'
      : '') +
    '<div class="row mt-16">' +
      '<button class="btn btn-primary" data-act="quiz-retry">' + icon('refresh') + '重新生成</button>' +
      '<button class="btn btn-secondary" data-act="quiz-back-setup">' + icon('settings') + '调整设置</button>' +
      '<button class="btn btn-ghost" data-act="quiz-exit">放弃本次</button>' +
    '</div>' +
  '</div>';
}

/* ---- 练习：生成 ---- */
function buildQuizPrompt(q) {
  const grade = state.profile.grade || '八年级';
  const lines = [
    '请为' + grade + '学生出一组课堂小练习。',
    '科目：' + q.subject,
    '计划时长：' + quizMinutes() + ' 分钟',
    '学生当前状态：' + quizWilling(),
    '题目数量：' + quizCount() + ' 道',
    q.focus ? '重点范围：' + q.focus : '重点范围：按教材当前进度出综合题',
    '难度：以基础题为主，穿插 1 道稍难的题，题目要能对应到具体知识点。',
    '请只输出 JSON，结构如下（不要输出多余文字）：',
    '{"subject":"' + q.subject + '","questions":[{"id":"q1","stem":"题干","type":"choice","options":["A. 选项一","B. 选项二","C. 选项三","D. 选项四"],"answer":"A","knowledgePoint":"知识点","explanation":"解析"}]}',
    'type 只能是 choice / fill / short 三种；choice 的 options 必须是 4 个选项且 answer 是选项字母；fill 和 short 的 answer 写参考答案。'
  ];
  return lines.join('\n');
}

async function startQuizGeneration() {
  const q = ensureQuizState();
  if (!isConfigured()) {
    toast('还没有配置 API，请先去设置页填写', 'warning');
    navigate('settings');
    return;
  }
  const materials = q.materialIds.slice();
  q.step = 'generating';
  q.error = '';
  q.raw = '';
  q.reasoning = '';
  q.gen = {
    status: 'retrieving',
    statusText: '正在出题…',
    statusDesc: '正在检索教材与资料',
    search: null,
    steps: { retrieving: 'active' }
  };
  state.quizGenText = '';
  render();

  const req = {
    mode: 'quiz',
    messages: [{ role: 'user', content: buildQuizPrompt(q) }],
    context: {
      subject: q.subject,
      grade: state.profile.grade || '八年级',
      materialIds: materials,
      useTextbooks: !!q.useTextbooks,
      examFocus: !!q.focus,
      quizPlan: {
        minutes: quizMinutes(),
        willing: quizWilling(),
        count: quizCount(),
        custom: q.focus || ''
      }
    },
    options: { deepThinking: !!(state.settings.ai && state.settings.ai.deepThinking), webSearch: true }
  };

  const job = await startAI(req, {
    onStatus: onQuizStatus,
    onSearch: onQuizSearch,
    onDelta: function (text) {
      state.quizGenText = text;
      const box = document.getElementById('gen-stream');
      if (box) {
        box.textContent = text;
        box.scrollTop = box.scrollHeight;
      }
      if (text.length > 2400) {
        try { abortAI(job.requestId); } catch (e) { /* ignore */ }
      }
      const len = document.getElementById('gen-len');
      if (len) len.textContent = text.length + ' 字';
    },
    onDone: function (evt) {
      state.quizGenText = evt.text || state.quizGenText;
      onQuizDone(evt);
    },
    onError: function (evt) {
      onQuizFailed(evt);
    }
  });
  if (job) q.job = job;
}

function onQuizStatus(status, text) {
  const q = state.quiz;
  if (!q || (q.step !== 'generating' && q.step !== 'submitting')) return;
  const gen = q.gen;
  gen.status = status;
  const map = {
    retrieving: { text: '正在检索教材和资料…', icon: 'bookOpen' },
    searching: { text: '正在联网搜索…', icon: 'globe' },
    thinking: { text: 'AI 正在深度思考…', icon: 'brain' },
    writing: { text: '正在写题…', icon: 'edit' }
  };
  const info = map[status];
  if (info) {
    gen.statusText = text || info.text;
    gen.statusDesc = info.text;
  } else if (text) {
    gen.statusText = text;
  }
  const order = ['retrieving', 'searching', 'thinking', 'writing'];
  const pos = order.indexOf(status);
  if (pos >= 0) {
    order.forEach(function (key, i) {
      gen.steps[key] = i < pos ? 'done' : i === pos ? 'active' : '';
    });
  }
  const titleEl = document.getElementById('gen-title');
  const descEl = document.getElementById('gen-desc');
  const stepsEl = document.getElementById('gen-steps');
  if (titleEl) titleEl.textContent = gen.statusText;
  if (descEl) descEl.textContent = gen.statusDesc || '';
  if (stepsEl && q.step === 'generating') {
    const stepDefs = [
      { key: 'retrieving', label: '检索教材与资料', icon: 'bookOpen' },
      { key: 'searching', label: '联网核对知识点', icon: 'globe' },
      { key: 'thinking', label: 'AI 正在构思题目', icon: 'brain' },
      { key: 'writing', label: '正在写题', icon: 'edit' }
    ];
    stepsEl.innerHTML = stepDefs.map(function (s) {
      const stateName = gen.steps[s.key];
      const cls = stateName === 'done' ? 'is-done' : stateName === 'active' ? 'is-active' : '';
      const mark = stateName === 'done' ? icon('check') : stateName === 'active' ? '<span class="spinner spinner-sm"></span>' : icon(s.icon);
      return '<div class="gen-step ' + cls + '">' + mark + '<span>' + s.label + '</span></div>';
    }).join('');
  }
}

function onQuizSearch(evt) {
  const q = state.quiz;
  if (!q || (q.step !== 'generating' && q.step !== 'submitting')) return;
  q.gen.search = { ok: !!evt.ok, provider: evt.provider || '', results: evt.results || [], error: evt.error || '' };
  const steps = q.gen.steps || {};
  if (steps.searching !== 'done') steps.searching = 'done';
  const titleEl = document.getElementById('gen-title');
  if (titleEl) titleEl.textContent = '正在写题…';
  const descEl = document.getElementById('gen-desc');
  if (descEl) descEl.textContent = evt.ok ? '联网检索完成，正在组织题目' : '联网检索失败，正在用本地教材出题';
}

function parseQuizPayload(json) {
  if (!json) return null;
  let list = null;
  if (Array.isArray(json)) list = json;
  else if (Array.isArray(json.questions)) list = json.questions;
  else if (Array.isArray(json.quiz)) list = json.quiz;
  else if (Array.isArray(json.items)) list = json.items;
  if (!Array.isArray(list) || !list.length) return null;

  const usedIds = new Set();
  const questions = list.map(function (raw, i) {
    const item = raw && typeof raw === 'object' ? raw : { stem: String(raw || '') };
    const stem = String(item.stem || item.question || item.title || item.content || item.problem || '').trim();    let options = choiceOptions(item);
    let type = item.type || item.questionType || item.kind || '';
    const t = String(type).toLowerCase();
    if (!type) {
      type = options.length >= 2 ? 'choice' : item.answer ? 'fill' : 'short';
    } else if (options.length >= 2 || t.indexOf('choice') >= 0 || t.indexOf('select') >= 0 || t === '选择题' || t === '单选') {
      type = 'choice';
    } else if (t.indexOf('fill') >= 0 || t.indexOf('blank') >= 0 || t === '填空' || t === '填空题') {
      type = 'fill';
    } else if (t.indexOf('short') >= 0 || t.indexOf('essay') >= 0 || t.indexOf('简答') >= 0) {
      type = 'short';
    } else {
      type = options.length >= 2 ? 'choice' : 'short';
    }
    let qid = String(item.id || 'q' + (i + 1)).trim() || 'q' + (i + 1);
    if (usedIds.has(qid)) qid = qid + '_' + (i + 1);
    usedIds.add(qid);
    return {
      id: qid,
      stem: stem,
      type: type,
      options: options,
      answer: item.answer != null ? String(item.answer) : item.correctAnswer != null ? String(item.correctAnswer) : '',
      userAnswer: '',
      correct: null,
      knowledgePoint: String(item.knowledgePoint || item.knowledge || item.point || item.kp || '').trim(),
      explanation: String(item.explanation || item.analysis || item.solution || item.answerAnalysis || '').trim()
    };
  }).filter(function (item) { return item.stem; });

  if (!questions.length) return null;
  return { subject: json.subject || '', questions: questions };
}

function onQuizDone(evt) {
  const q = state.quiz;
  if (!q || q.step !== 'generating') return;
  let parsed = parseQuizPayload(evt.json);
  if (!parsed) parsed = parseQuizPayload(evt.text);
  if (!parsed) {
    q.step = 'error';
    q.raw = evt.text || '';
    q.error = evt.json ? 'AI 返回了内容，但没有解析出题目' : '模型没有按 JSON 格式返回题目';
    render();
    return;
  }
  q.questions = parsed.questions;
  q.answers = {};
  q.index = 0;
  q.step = 'ready';
  q.answeringStartedAt = 0;
  q.examMode = false;
  q.examForced = false;
  q.raw = evt.text || '';
  q.search = evt.search || null;
  q.gen.status = 'done';
  render();
  toast('题目生成好了，共 ' + parsed.questions.length + ' 道，选择考试或直接练习', 'success', 4500);
}

function onQuizFailed(evt) {
  const q = state.quiz;
  if (!q) return;
  if (q.step === 'submitting') {
    q.submitting = false;
    q.step = 'answering';
    render();
    toast(evt.message || '批改失败，请重试', 'error');
    return;
  }
  q.step = 'error';
  q.error = evt.message || '生成失败';
  q.raw = q.raw || '';
  if (evt.code === 'no_config') {
    q.error = '还没有配置 API Key，请先去设置页填写';
  }
  render();
}

/* ---- 练习：作答与提交 ---- */
function answerCurrentQuestion(value) {
  const q = state.quiz;
  if (!q || q.step !== 'answering') return;
  const item = q.questions[q.index];
  if (!item) return;
  q.answers[item.id] = value;
  const answeredCount = q.questions.filter(function (x) {
    return String(q.answers[x.id] || '').trim() !== '';
  }).length;
  $$('.q-option').forEach(function (el) {
    el.classList.toggle('is-active', normalizeAnswer(el.dataset.value) === normalizeAnswer(value));
  });
  $$('.q-dot').forEach(function (el, i) {
    const x = q.questions[i];
    if (!x) return;
    el.classList.toggle('is-answered', String(q.answers[x.id] || '').trim() !== '');
  });
  const txt = $('.quiz-progress-text');
  if (txt) txt.textContent = '第 ' + (q.index + 1) + ' / ' + q.questions.length + ' 题 · 已答 ' + answeredCount;
}

function quizNav(delta) {
  const q = state.quiz;
  if (!q || q.step !== 'answering') return;
  const next = clamp(q.index + delta, 0, q.questions.length - 1);
  if (next === q.index) return;
  q.index = next;
  render();
  const view = document.getElementById('view');
  if (view) view.scrollTop = 0;
}

function applyScoreBind(scope, path, el) {
  const target = state.drafts.scores;
  if (!target) return;
  if (path[0] === 'examName') {
    target.examName = String(el.value || '');
    return;
  }
  if (path[0] === 'examDate') {
    target.examDate = String(el.value || '');
    return;
  }
  if (!target.subjects) return;
  const subject = el.dataset.subject;
  if (!subject || !target.subjects[subject]) return;
  const value = numOrNull(el.value);
  if (path[0] === 'score') target.subjects[subject].score = value;
  else if (path[0] === 'full') target.subjects[subject].full = value;
}

async function submitQuiz(force) {
  const q = state.quiz;
  if (!q || q.step !== 'answering') return;
  const unanswered = q.questions.filter(function (item) {
    return String(q.answers[item.id] || '').trim() === '';
  });
  if (unanswered.length && !force) {
    const ok = await confirmDialog({
      title: '还有题目没答',
      message: '还有 ' + unanswered.length + ' 道题没有作答，未答的题会按 0 分计算。确定要提交吗？',
      confirmText: '提交批改'
    });
    if (!ok) return;
  }
  if (!isConfigured()) {
    toast('没有配置 API，无法生成批改报告', 'warning');
    return;
  }
  stopExamTimer();

  q.step = 'submitting';
  q.submitting = true;
  render();

  q.questions.forEach(function (item) {
    if (q.answers[item.id] == null) q.answers[item.id] = '';
  });

  const quizPayload = {
    questions: q.questions.map(function (item) {
      return {
        id: item.id,
        stem: item.stem,
        type: item.type,
        options: item.options,
        answer: item.answer,
        knowledgePoint: item.knowledgePoint,
        explanation: item.explanation,
        userAnswer: q.answers[item.id] || ''
      };
    }),
    answers: Object.assign({}, q.answers)
  };

  // 实际用时：从开始答题（题目生成完成）到点提交的时间；"计划时长"只是学生预估的可用时间
  const actualMinutes = Math.max(1, Math.round((Date.now() - (q.answeringStartedAt || Date.now())) / 60000));
  q.actualMinutes = actualMinutes;

  const messages = [{
    role: 'user',
    content:
      '请批改下面这组' + q.subject + '练习，并给出学习报告。\n' +
      '学生：' + (state.profile.grade || '八年级') + '\n' +
      '计划可用时长：' + quizMinutes() + ' 分钟（这是学生开始前预估的时间，不是实际用时，不要把它当成真实耗时来评价）\n' +
      '实际用时：' + actualMinutes + ' 分钟（从开始答题到提交的时间）\n' +
      '作答时的状态：' + quizWilling() + '\n' +
      '题目与学生的作答：\n' + JSON.stringify(quizPayload.questions, null, 2) + '\n' +
      '请逐题判断对错，并输出 JSON：' +
      '{"stats":{"total":5,"correct":3,"accuracy":0.6},' +
      '"ai":{"summary":"总体评价","strengths":["..."],"weaknesses":[{"knowledgePoint":"...","evidence":"...","advice":"..."}],"nextSteps":["..."],"encouragement":"..."},' +
      '"questions":[{"id":"q1","correct":true,"knowledgePoint":"...","explanation":"..."}]}\n' +
      '简答题按要点是否覆盖给分，不要因为表述不同直接判错。'
  }];

  const req = {
    mode: 'report',
    messages: messages,
    context: {
      subject: q.subject,
      grade: state.profile.grade || '八年级',
      materialIds: q.materialIds.slice(),
      useTextbooks: !!q.useTextbooks,
      quiz: quizPayload,
      actualMinutes: actualMinutes,
      plannedMinutes: quizMinutes()
    },
    options: { deepThinking: false, webSearch: true }
  };

  const job = await startAI(req, {
    onStatus: function (status, text) {
      const descEl = document.getElementById('gen-desc');
      if (descEl) descEl.textContent = text || '正在批改…';
      const titleEl = document.getElementById('gen-title');
      if (titleEl) titleEl.textContent = '正在批改…';
    },
    onDone: function (evt) {
      onReportDone(evt);
    },
    onError: function (evt) {
      onQuizFailed(evt);
    }
  });
  if (job) q.job = job;
}

function compareChoice(item, userAnswer) {
  if (!String(userAnswer || '').trim()) return false;
  const expected = answerKey(item.answer);
  const got = normalizeAnswer(userAnswer);
  if (!expected) return null;
  if (/^[A-D]$/.test(expected)) return got === expected || normalizeAnswer(item.answer) === got;
  return normalizeAnswer(item.answer) === got || String(item.answer).indexOf(userAnswer) >= 0;
}

function computeQuizStats(questions) {
  let graded = 0;
  let correct = 0;
  questions.forEach(function (item) {
    if (item.correct === true) {
      graded += 1;
      correct += 1;
    } else if (item.correct === false) {
      graded += 1;
    }
  });
  return {
    total: questions.length,
    correct: correct,
    accuracy: graded ? correct / graded : 0
  };
}

function buildReportFromDone(evt, q) {
  const json = evt.json || {};
  const aiRaw = json.ai && typeof json.ai === 'object' ? json.ai : json;
  const ai = {
    summary: String(aiRaw.summary || aiRaw.overall || evt.text || '').trim(),
    strengths: normalizeStringList(aiRaw.strengths || aiRaw.goodPoints || aiRaw.advantages),
    weaknesses: normalizeWeaknesses(aiRaw.weaknesses || aiRaw.weakPoints),
    nextSteps: normalizeStringList(aiRaw.nextSteps || aiRaw.suggestions || aiRaw.advice),
    encouragement: String(aiRaw.encouragement || aiRaw.encourage || '').trim()
  };

  const aiQuestions = Array.isArray(json.questions) ? json.questions : [];
  const byId = {};
  aiQuestions.forEach(function (item, idx) {
    if (!item) return;
    byId[String(item.id || 'q' + (idx + 1))] = item;
  });

  const questions = q.questions.map(function (item, idx) {
    const aiItem = byId[item.id] || aiQuestions[idx] || {};
    const userAnswer = q.answers[item.id] || '';
    let correct = null;
    if (typeof aiItem.correct === 'boolean') correct = aiItem.correct;
    else if (item.type === 'choice') correct = compareChoice(item, userAnswer);
    return {
      id: item.id,
      stem: item.stem,
      type: item.type,
      options: item.options,
      answer: item.answer || (aiItem.answer != null ? String(aiItem.answer) : ''),
      userAnswer: userAnswer,
      correct: correct,
      knowledgePoint: String(aiItem.knowledgePoint || item.knowledgePoint || '').trim(),
      explanation: String(aiItem.explanation || item.explanation || '').trim()
    };
  });

  const stats = computeQuizStats(questions);
  return {
    id: uid('rep'),
    createdAt: Date.now(),
    mode: 'quiz',
    subject: q.subject,
    plan: { minutes: quizMinutes(), willing: quizWilling(), custom: q.focus || '', mode: q.examMode ? 'exam' : 'practice' },
    duration: { planned: quizMinutes(), actual: q.actualMinutes || null },
    questions: questions,
    stats: stats,
    ai: ai,
    search: evt.search || { ok: false, provider: '', results: [] },
    raw: evt.text || ''
  };
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(function (item) {
      if (item && typeof item === 'object') return String(item.text || item.content || item.title || '').trim();
      return String(item || '').trim();
    }).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/\n+/).map(function (s) { return s.replace(/^[-*•\d.、\s]+/, '').trim(); }).filter(Boolean);
  }
  return [];
}

function normalizeWeaknesses(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : normalizeStringList(value).map(function (s) { return { knowledgePoint: s }; });
  return list.map(function (item) {
    if (item && typeof item === 'object') {
      return {
        knowledgePoint: String(item.knowledgePoint || item.point || item.knowledge || item.title || '').trim(),
        evidence: String(item.evidence || item.reason || item.detail || '').trim(),
        advice: String(item.advice || item.suggestion || item.howToFix || '').trim()
      };
    }
    return { knowledgePoint: String(item || '').trim(), evidence: '', advice: '' };
  }).filter(function (item) { return item.knowledgePoint || item.evidence || item.advice; });
}

async function saveReport(report) {
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, 60);
  await storeSet('reports', state.reports);
}

async function onReportDone(evt) {
  const q = state.quiz;
  if (!q) return;
  const report = buildReportFromDone(evt, q);
  await saveReport(report);
  q.step = 'done';
  q.submitting = false;
  q.report = report;
  state.reportId = report.id;
  toast('批改完成：' + report.stats.correct + '/' + report.stats.total + ' 题正确', 'success');
  navigate('report');
}

/* ============================================================
 * 10. 页面：报告
 * ============================================================ */
PAGES.report = function () {
  const reports = state.reports || [];
  if (!reports.length) {
    return pageHead({
      eyebrow: icon('report') + ' 学习报告',
      title: '报告',
      desc: '每次练习后的详细分析和建议都会留在这里。',
      actions: '<button class="btn btn-primary" data-act="nav" data-route="quiz">' + icon('play') + '去练习</button>'
    }) + emptyState({
      icon: 'report',
      title: '还没有报告',
      desc: '完成一次练习，AI 会告诉你正确率、薄弱知识点和下一步怎么练。报告会自动保存在本地。',
      actions: '<button class="btn btn-primary" data-act="nav" data-route="quiz">' + icon('play') + '开始第一次练习</button>'
    });
  }

  let selected = reports.find(function (r) { return r.id === state.reportId; });
  if (!selected) {
    selected = reports[0];
    state.reportId = selected.id;
  }

  const listHtml = reports.map(function (r) {
    const acc = Number(r.stats && r.stats.accuracy) || 0;
    const pct = Math.round(acc * 100);
    return '<button class="report-list-item' + (r.id === selected.id ? ' is-active' : '') + '" data-act="open-report" data-id="' + esc(r.id) + '">' +
      '<div class="report-list-top">' +
        '<span class="report-list-title">' + esc(r.subject || '练习') + '</span>' +
        '<span class="report-score-pill ' + accuracyClass(acc) + '">' + pct + '%</span>' +
      '</div>' +
      '<div class="report-list-date">' + esc(fmtDate(r.createdAt)) + '</div>' +
    '</button>';
  }).join('');

  return pageHead({
    eyebrow: icon('report') + ' 学习报告',
    title: '报告',
    desc: '共 ' + reports.length + ' 份报告，全部保存在本地。',
    actions:
      '<button class="btn btn-secondary" data-act="export-report">' + icon('copy') + '复制文本</button>' +
      '<button class="btn btn-primary" data-act="nav" data-route="quiz">' + icon('play') + '再练一组</button>'
  }) +
  '<div class="report-layout">' +
    '<aside class="card report-list-card">' +
      '<div class="card-head card-head-tight"><div class="card-title">' + icon('clock') + '历史报告</div></div>' +
      '<div class="report-list">' + listHtml + '</div>' +
    '</aside>' +
    '<div class="report-detail" id="report-detail">' + renderReportDetail(selected) + '</div>' +
  '</div>';
};

function renderReportDetail(report) {
  if (!report) return '';
  const stats = report.stats || {};
  const acc = Number(stats.accuracy) || 0;
  const pct = Math.round(acc * 100);
  const ringColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  const ai = report.ai || {};
  const plan = report.plan || {};
  const search = report.search || {};
  const sources = Array.isArray(search.results) ? search.results : [];
  const graded = (report.questions || []).filter(function (q) { return q.correct === true || q.correct === false; }).length;

  const actualMinutes = report.duration && report.duration.actual != null ? report.duration.actual : null;
  const plannedMinutes = (report.duration && report.duration.planned) || plan.minutes || null;
  const timeValue = actualMinutes != null ? actualMinutes : plannedMinutes != null ? plannedMinutes : '—';
  const timeLabel =
    actualMinutes != null
      ? '实际用时（分钟）' + (plannedMinutes ? ' · 计划 ' + plannedMinutes : '')
      : '计划时长（分钟）';
  const statsHtml =
    '<div class="stat"><div class="stat-value">' + (stats.correct != null ? stats.correct : '—') + '</div><div class="stat-label">答对题数</div></div>' +
    '<div class="stat"><div class="stat-value">' + (stats.total != null ? stats.total : (report.questions || []).length) + '</div><div class="stat-label">总题数</div></div>' +
    '<div class="stat"><div class="stat-value">' + (graded || (stats.total || 0)) + '</div><div class="stat-label">已批改</div></div>' +
    '<div class="stat"><div class="stat-value">' + timeValue + '</div><div class="stat-label">' + timeLabel + '</div></div>';

  const answersHtml = (report.questions || []).map(function (item, idx) {
    const resultIcon = item.correct === true ? icon('check-circle') : item.correct === false ? icon('alert-circle') : icon('info');
    const resultColor = item.correct === true ? 'var(--success)' : item.correct === false ? 'var(--danger)' : 'var(--muted)';
    return '<tr>' +
      '<td class="col-num">' + (idx + 1) + '</td>' +
      '<td>' +
        '<div class="answer-stem">' + mdToHtml(item.stem) + '</div>' +
        '<div class="answer-line">我的答案：<strong>' + richInline(item.userAnswer || '（未作答）') + '</strong>' +
          ' · 参考答案：<strong>' + richInline(item.answer || '—') + '</strong></div>' +
        (item.explanation ? '<div class="explain-box">' + mdToHtml(item.explanation) + '</div>' : '') +
      '</td>' +
      '<td class="col-result" style="color:' + resultColor + '">' + resultIcon + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="card report-hero">' +
      '<div class="score-ring" style="--p:' + pct + ';--ring-color:' + ringColor + '">' +
        '<div class="score-ring-inner">' +
          '<div class="score-ring-value" style="color:' + ringColor + '">' + pct + '%</div>' +
          '<div class="score-ring-label">正确率</div>' +
        '</div>' +
      '</div>' +
      '<div class="report-hero-main">' +
        '<div class="report-hero-title">' + subjectDot(report.subject || '综合') + esc(report.subject || '综合') + ' 练习报告' +
          '<span class="badge badge-primary">' + esc(modeLabel(report.mode)) + '</span>' +
          (search.ok ? '<span class="badge badge-success">' + icon('globe') + '联网已核对</span>' : '<span class="badge badge-warning">' + icon('wifi-off') + '联网检索失败</span>') +
        '</div>' +
        '<div class="report-hero-desc">' + esc(fmtDate(report.createdAt)) +
          (plan.willing ? ' · 当时状态：' + esc(plan.willing) : '') +
          (plan.custom ? ' · 重点：' + esc(plan.custom) : '') + '</div>' +
        '<div class="report-stats">' + statsHtml + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-head card-head-tight"><div class="card-title">' + icon('sparkles') + 'AI 总评</div></div>' +
      (ai.summary
        ? '<div class="ai-summary md">' + mdToHtml(ai.summary) + '</div>'
        : '<p class="muted text-sm">这次没有拿到 AI 的文字总评，可以点「再练一组」重试。</p>') +
    '</div>' +

    ((ai.strengths && ai.strengths.length) || (ai.weaknesses && ai.weaknesses.length)
      ? '<div class="grid grid-2">' +
          (ai.strengths && ai.strengths.length
            ? '<div class="card">' +
                '<div class="card-head card-head-tight"><div class="card-title">' + icon('check-circle') + '做得好的地方</div></div>' +
                '<div class="point-list">' + ai.strengths.map(function (s) {
                  return '<div class="point-item is-good"><div class="point-mark">✓</div><div>' + mdToHtml(s) + '</div></div>';
                }).join('') + '</div></div>'
            : '') +
          (ai.weaknesses && ai.weaknesses.length
            ? '<div class="card">' +
                '<div class="card-head card-head-tight"><div class="card-title">' + icon('target') + '薄弱点</div></div>' +
                '<div class="point-list">' + ai.weaknesses.map(function (w) {
                  return '<div class="point-item is-bad"><div class="point-mark">!</div>' +
                    '<div><div class="point-title">' + mdToHtml(w.knowledgePoint || '待巩固') + '</div>' +
                    (w.evidence ? '<div class="point-evidence">' + mdToHtml(w.evidence) + '</div>' : '') +
                    (w.advice ? '<div class="point-desc">' + mdToHtml(w.advice) + '</div>' : '') + '</div></div>';
                }).join('') + '</div></div>'
            : '') +
        '</div>'
      : '') +

    ((ai.nextSteps && ai.nextSteps.length)
      ? '<div class="card">' +
          '<div class="card-head card-head-tight"><div class="card-title">' + icon('play') + '下一步这么练</div></div>' +
          '<div class="point-list">' + ai.nextSteps.map(function (s, i) {
            return '<div class="point-item"><div class="point-mark">' + (i + 1) + '</div><div>' + mdToHtml(s) + '</div></div>';
          }).join('') + '</div></div>'
      : '') +

    (ai.encouragement
      ? '<div class="card" style="border-color:rgba(59,130,246,0.35)">' +
          '<div class="row" style="align-items:flex-start;gap:11px">' +
            '<div class="gen-status-icon">' + icon('sparkles') + '</div>' +
            '<div><div class="card-title">' + icon('flame') + '说给你听</div>' +
            '<p class="ai-summary mt-4" style="font-size:13px">' + mdToHtml(ai.encouragement) + '</p></div>' +
          '</div></div>'
      : '') +

    '<div class="card">' +
      collapsibleHead('逐题批改（' + (report.questions || []).length + ' 题）', false,
        '<span class="badge badge-success">答对 ' + (stats.correct || 0) + '</span>') +
      '<div class="collapsible-body hidden" style="overflow-x:auto">' +
        '<table class="answer-table"><thead><tr><th class="col-num">#</th><th>题目与作答</th><th class="col-result">结果</th></tr></thead>' +
        '<tbody>' + answersHtml + '</tbody></table>' +
      '</div>' +
    '</div>' +

    (sources.length
      ? '<div class="card">' +
          '<div class="card-head card-head-tight"><div class="card-title">' + icon('globe') + '引用来源</div>' +
          '<span class="card-sub">' + (search.provider ? '搜索服务：' + esc(search.provider) : '') + '</span></div>' +
          '<div class="source-list">' + sources.map(function (s, i) {
            return '<button class="source-item" data-act="open-url" data-url="' + esc(s.url || '') + '">' +
              '<span class="source-index">' + (i + 1) + '</span>' +
              '<span class="grow" style="min-width:0;text-align:left"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.title || s.url || '来源') + '</span>' +
              '<span class="source-url">' + esc(s.url || '') + '</span></span>' +
              icon('external') +
            '</button>';
          }).join('') + '</div></div>'
      : '') +

    (report.raw
      ? '<div class="card">' +
          collapsibleHead('AI 原始输出', false, '') +
          '<div class="collapsible-body hidden"><div class="text-preview" style="max-height:300px">' + esc(report.raw) + '</div></div>' +
        '</div>'
      : '');
}

function modeLabel(mode) {
  return { quiz: '练习批改', report: '学习报告', plan: '学习计划', chat: 'AI 对话' }[mode] || '报告';
}

async function copyReportText() {
  const report = state.reports.find(function (r) { return r.id === state.reportId; });
  if (!report) return;
  const lines = [];
  lines.push('【' + (report.subject || '练习') + '】练习报告 · ' + fmtDate(report.createdAt));
  lines.push('正确率：' + Math.round((Number(report.stats && report.stats.accuracy) || 0) * 100) + '%');
  if (report.ai && report.ai.summary) lines.push('总评：' + report.ai.summary);
  if (report.ai && report.ai.weaknesses && report.ai.weaknesses.length) {
    lines.push('薄弱点：');
    report.ai.weaknesses.forEach(function (w) {
      lines.push('- ' + (w.knowledgePoint || '') + (w.advice ? '：' + w.advice : ''));
    });
  }
  if (report.ai && report.ai.nextSteps && report.ai.nextSteps.length) {
    lines.push('下一步：');
    report.ai.nextSteps.forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('报告已复制到剪贴板', 'success');
  } catch (err) {
    toast('复制失败，可能是系统剪贴板不可用', 'error');
  }
}

/* ============================================================
 * 11. 页面：学习进度
 * ============================================================ */
let progressSaveTimer = null;
let settingsSaveTimer = null;

function scheduleProgressSave() {
  if (progressSaveTimer) clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(async function () {
    if (await storeSet('progress', state.progress)) {
      const hint = document.getElementById('progress-save-hint');
      if (hint) hint.textContent = '已自动保存 · ' + nowTimeStr();
    }
  }, 700);
}

/* ---------- 章节标准化：把「学到往事依依」映射成教材标准目录 + 自动补百分比 ---------- */
const unitNormalizeCache = {};
const unitNormalizePending = {};

const unitNormalizeQueue = [];
let unitNormalizeRunning = false;

function scheduleUnitNormalize(subject, text, opts) {
  const raw = String(text || '').trim();
  if (raw.length < 2) return;
  if (!isConfigured()) return;
  const key = subject + '|' + raw;
  if (unitNormalizeCache[key] || unitNormalizePending[key]) return;
  if (unitNormalizeQueue.some(function (item) { return item.key === key; })) return;
  unitNormalizePending[key] = true;
  unitNormalizeQueue.push({ subject: subject, text: raw, key: key, opts: opts || {} });
  setTimeout(drainUnitNormalizeQueue, 500);
}

function finishUnitNormalize(key) {
  delete unitNormalizePending[key];
  unitNormalizeRunning = false;
  if (unitNormalizeQueue.length) setTimeout(drainUnitNormalizeQueue, 150);
}

function drainUnitNormalizeQueue() {
  if (unitNormalizeRunning) return;
  const item = unitNormalizeQueue.shift();
  if (!item) return;
  unitNormalizeRunning = true;
  runUnitNormalize(item.subject, item.text, item.key, item.opts);
}

function runUnitNormalize(subject, text, key, opts) {
  // 串行执行：一次只跑一个标准化请求，避免多科同时失焦时结果错乱 / 请求互相覆盖
  let settled = false;
  const finish = function () {
    if (settled) return;
    settled = true;
    finishUnitNormalize(key);
  };
  try {
    startAI({
      mode: 'outline',
      messages: [{ role: 'user', content: '我的' + subject + '进度：' + text }],
      context: { subject: subject, grade: state.profile.grade || '八年级', input: text },
      options: { deepThinking: false }
    }, {
      onDone: function (evt) {
        try {
          const result = evt && evt.json ? evt.json : null;
          const entry = state.progress[subject];
          if (!result || !result.matched || !entry) return;
          unitNormalizeCache[key] = result;
          const currentUnit = String(entry.unit || '').trim();
          // 手动输入场景：内容已被改掉就不覆盖；每日登记场景：已有进度也不覆盖
          if (opts.fromDaily) {
            if (currentUnit && currentUnit !== text) return;
          } else if (currentUnit !== text) {
            return;
          }
          let changed = false;
          const standard = String(result.standard || '').trim();
          if (standard && standard !== entry.unit) {
            entry.unit = standard;
            changed = true;
          }
          const percent = result.percent;
          if (percent != null && percent > 0 && !(Number(entry.percent) > 0)) {
            entry.percent = percent;
            changed = true;
          }
          if (!changed) return;
          entry.updatedAt = Date.now();
          storeSet('progress', state.progress);
          // 只更新对应 DOM，不整页重绘，避免打断正在输入的其他科目
          const unitInput = document.querySelector('[data-bind="progress.unit"][data-subject="' + subject + '"]');
          if (unitInput && entry.unit) unitInput.value = entry.unit;
          if (percent != null && percent > 0) {
            $$('[data-bind="progress.percent"][data-subject="' + subject + '"]').forEach(function (inp) {
              inp.value = percent;
            });
            const label = document.querySelector('[data-percent-label="' + subject + '"]');
            if (label) label.textContent = percent + '%';
          }
          toast(subject + ' 已整理为「' + entry.unit + '」' + (percent > 0 ? ' · 进度 ' + percent + '%' : ''), 'success', 3600);
          if (state.route === 'home') render();
        } finally {
          finish();
        }
      },
      onError: function () {
        finish();
      }
    }).catch(function () {
      finish();
    });
  } catch (err) {
    finish();
  }
}

function scheduleSettingsSave() {
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(function () {
    persistDraftSettings(true).then(function () {
      const hint = document.getElementById('settings-save-hint');
      if (hint) hint.textContent = '已自动保存 · ' + nowTimeStr();
    }).catch(function () { /* toast 已提示 */ });
  }, 800);
}

PAGES.progress = function () {
  const today = todayStr();
  return pageHead({
    eyebrow: icon('progress') + ' 学习进度',
    title: '学习进度',
    desc: '记录学到哪了、哪天请假、缺的课怎么补，还可以设置每天的学习安排。',
    actions: '<button class="btn btn-secondary" data-act="nav" data-route="quiz">' + icon('play') + '去练习</button>'
  }) + '<div class="progress-layout">' +
    '<div class="progress-col">' +
      renderProgressCard() +
      renderExamCard() +
      renderPlanCard() +
    '</div>' +
    '<div class="progress-col">' +
      renderLeaveCard(today) +
      renderMakeupCard() +
      renderDailyAskCard() +
    '</div>' +
  '</div>';
};

function renderProgressCard() {
  return '<div class="card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('progress') + '各科进度</div>' +
      '<div class="card-sub">直接写课文 / 章节名，AI 会自动整理成教材标准目录并估算进度</div></div>' +
      '<span class="field-hint" id="progress-save-hint">修改会自动保存</span>' +
    '</div>' +
    SUBJECTS.map(function (sub) {
      const p = state.progress[sub] || {};
      const percent = clamp(Math.round(Number(p.percent) || 0), 0, 100);
      return '<div class="prog-subject-block">' +
        '<div class="prog-subject-row">' +
          '<div class="prog-subject-name">' + subjectDot(sub) + esc(sub) + '</div>' +
          '<div class="prog-subject-inputs">' +
            '<input class="input input-unit" data-bind="progress.unit" data-subject="' + sub + '" value="' + esc(p.unit || '') + '" placeholder="单元 / 章节">' +
            '<input class="input input-note" data-bind="progress.note" data-subject="' + sub + '" value="' + esc(p.note || '') + '" placeholder="备注：哪里薄弱">' +
          '</div>' +
          '<div class="prog-percent">' +
            '<input class="input input-sm" type="number" min="0" max="100" data-bind="progress.percent" data-subject="' + sub + '" value="' + percent + '">' +
            '<span>%</span>' +
          '</div>' +
        '</div>' +
        '<div class="prog-percent-line">' +
          '<input class="range" type="range" min="0" max="100" step="5" data-bind="progress.percent" data-subject="' + sub + '" value="' + percent + '">' +
          '<span class="text-xs muted tabular" data-percent-label="' + sub + '">' + percent + '%</span>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function renderPlanCard() {
  const plans = state.plans || [];
  const weekdayOptions = [{ v: 0, label: '每天' }].concat(WEEKDAYS.map(function (w, i) {
    return { v: i + 1, label: w };
  }));

  return '<div class="card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('calendar') + '自定义学习安排</div>' +
      '<div class="card-sub">固定的学习时段，会出现在首页「今日安排」里</div></div>' +
    '</div>' +
    (plans.length
      ? '<div class="list mb-16">' + plans.map(function (p) {
          return '<div class="list-item">' +
            '<div class="list-icon">' + icon('clock') + '</div>' +
            '<div class="list-main">' +
              '<div class="list-title">' + esc(p.title || ((p.subject || '综合') + ' 学习')) + '</div>' +
              '<div class="list-desc">' + esc(p.date ? p.date : planWeekdayLabel(p.weekday)) + ' · ' + esc(p.time || '—') +
                (p.minutes ? ' · ' + p.minutes + ' 分钟' : '') + ' · ' + esc(p.subject || '综合') +
                (p.note ? ' · ' + esc(p.note) : '') + '</div>' +
            '</div>' +
            '<div class="material-actions">' +
              '<button class="icon-btn is-danger" data-act="delete-plan" data-id="' + esc(p.id) + '" title="删除">' + icon('trash') + '</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="field-hint mb-16">还没有固定安排。比如「周一 19:30 数学 30 分钟」，加一条试试。</p>') +
    '<div class="divider"></div>' +
    '<div class="add-row">' +
      '<div class="field" style="max-width:104px"><label class="field-label">星期</label>' +
        '<select class="select" id="plan-weekday">' + weekdayOptions.map(function (o) {
          return '<option value="' + o.v + '"' + (o.v === weekdayIndex() ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field" style="max-width:104px"><label class="field-label">时间</label>' +
        '<input class="input" type="time" id="plan-time" value="19:30"></div>' +
      '<div class="field" style="max-width:96px"><label class="field-label">科目</label>' +
        '<select class="select" id="plan-subject">' + SUBJECTS.map(function (s) {
          return '<option value="' + s + '">' + s + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label class="field-label">安排内容</label>' +
        '<input class="input" id="plan-title" placeholder="比如：复习二次函数"></div>' +
      '<div class="field" style="max-width:84px"><label class="field-label">时长</label>' +
        '<input class="input" type="number" min="5" id="plan-minutes" value="30"></div>' +
      '<button class="btn btn-primary" data-act="add-plan">' + icon('plus') + '添加</button>' +
    '</div>' +
  '</div>';
}

/* ---------- 考试复习计划 ---------- */
function examDaysLeft(date) {
  if (!date) return null;
  const d = new Date(date + 'T23:59:59');
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function renderExamCard() {
  const exams = state.exams || [];
  const form = state.examForm || { name: '', date: '', subjects: [], note: '' };
  const formHtml =
    '<div class="exam-form">' +
      '<div class="add-row">' +
        '<div class="field" style="max-width:220px"><label class="field-label">考试名称</label>' +
          '<input class="input" id="exam-name" data-bind="examForm.name" value="' + esc(form.name) + '" placeholder="比如：期中考试 / 月考"></div>' +
        '<div class="field" style="max-width:160px"><label class="field-label">考试日期</label>' +
          '<input class="input" type="date" id="exam-date" data-bind="examForm.date" value="' + esc(form.date) + '"></div>' +
      '</div>' +
      '<div class="field mt-12"><label class="field-label">涉及科目（可多选）</label>' +
        '<div class="subject-grid">' + SUBJECTS.map(function (sub) {
          const active = form.subjects.indexOf(sub) >= 0;
          return '<button class="subject-chip' + (active ? ' is-active' : '') + '" data-act="exam-toggle-subject" data-subject="' + sub + '">' +
            subjectDot(sub) + esc(sub) + '</button>';
        }).join('') + '</div>' +
        '<span class="field-hint">考试要考、但你还没学到的内容，AI 会单独标成「未学课程」加进安排</span></div>' +
      '<div class="field mt-12"><label class="field-label">补充说明（可选）</label>' +
        '<input class="input" id="exam-note" data-bind="examForm.note" value="' + esc(form.note) + '" placeholder="比如：数学只考到第 4 章；英语重点作文"></div>' +
      '<div class="row mt-12">' +
        '<button class="btn btn-primary" data-act="exam-create">' + icon('sparkles') + '添加考试并生成复习计划</button>' +
      '</div>' +
    '</div>';

  const listHtml = exams.length
    ? exams.map(renderExamItem).join('')
    : '<p class="field-hint">还没有考试计划。加一场考试，AI 会按你的进度排出每天复习什么，确认后直接进入每日安排。</p>';

  return '<div class="card exam-card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('target') + '考试复习计划</div>' +
      '<div class="card-sub">加考试 → AI 排计划 → 同意 / 部分同意 → 确认后进入每日安排</div></div>' +
    '</div>' +
    (exams.length ? '<div class="exam-list">' + listHtml + '</div>' : listHtml) +
    '<div class="divider"></div>' +
    formHtml +
  '</div>';
}

function renderExamItem(exam) {
  const days = examDaysLeft(exam.date);
  const statusBadge =
    exam.status === 'confirmed'
      ? '<span class="badge badge-success">已加入每日安排</span>'
      : exam.revised
        ? '<span class="badge badge-warning">已按你的意见改好，待确认</span>'
        : exam.status === 'generating'
          ? '<span class="badge badge-primary">正在生成…</span>'
          : '<span class="badge badge-primary">待确认计划</span>';

  const plan = exam.plan || null;
  let body = '';
  if (exam.status === 'generating') {
    body = '<div class="exam-plan-loading"><span class="spinner spinner-sm"></span> AI 正在结合你的进度安排复习内容…</div>';
  } else if (plan && Array.isArray(plan.items) && plan.items.length) {
    const itemsHtml = plan.items.map(function (it) {
      const checked = !exam.agreedIds || exam.agreedIds.indexOf(it.id) >= 0;
      return '<div class="exam-item">' +
        (exam.partial
          ? '<input type="checkbox" class="exam-check" data-act="exam-toggle-item" data-exam="' + esc(exam.id) + '" data-item="' + esc(it.id) + '"' + (checked ? ' checked' : '') + '>'
          : '') +
        '<div class="exam-item-main">' +
          '<div class="exam-item-head">' +
            '<span class="exam-item-date">' + esc(it.date || '未定日期') + '</span>' +
            '<span class="badge">' + esc(it.subject) + '</span>' +
            (it.isNewCourse ? '<span class="badge badge-warning">未学课程</span>' : '') +
            '<span class="exam-item-min">' + (it.minutes || 25) + ' 分钟</span>' +
          '</div>' +
          '<div class="exam-item-title">' + esc(it.title) + '</div>' +
          (it.reason ? '<div class="exam-item-reason">' + esc(it.reason) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    body = (plan.summary ? '<div class="exam-plan-summary">' + mdToHtml(plan.summary) + '</div>' : '') +
      '<div class="exam-items">' + itemsHtml + '</div>' +
      (exam.partial
        ? '<div class="exam-feedback">' +
            '<textarea class="textarea" id="exam-feedback" rows="3" placeholder="说说哪里不同意、想怎么改（比如：数学太多，每天只留一项；周末想多练科学）">' + esc(exam.feedback || '') + '</textarea>' +
            '<div class="row mt-12">' +
              '<button class="btn btn-primary btn-sm" data-act="exam-apply-feedback" data-exam="' + esc(exam.id) + '"' + (exam.revising ? ' disabled' : '') + '>' +
                (exam.revising ? '正在改写…' : '按我的意见改写') + '</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="exam-cancel-partial" data-exam="' + esc(exam.id) + '">取消</button>' +
            '</div>' +
          '</div>'
        : '');
  } else {
    body = '<p class="field-hint">这个考试还没有可用的计划，点「重新生成」让 AI 排一下。</p>';
  }

  const actions = [];
  if (exam.status !== 'generating') {
    if (exam.revised && !exam.partial) {
      actions.push('<button class="btn btn-primary btn-sm" data-act="exam-confirm" data-exam="' + esc(exam.id) + '">' + icon('check') + '确认加入计划</button>');
      actions.push('<button class="btn btn-ghost btn-sm" data-act="exam-regenerate" data-exam="' + esc(exam.id) + '">' + icon('refresh') + '重新生成</button>');
    } else if (!exam.partial && exam.status !== 'confirmed') {
      actions.push('<button class="btn btn-primary btn-sm" data-act="exam-agree-all" data-exam="' + esc(exam.id) + '">' + icon('check') + '同意全部，加入安排</button>');
      actions.push('<button class="btn btn-secondary btn-sm" data-act="exam-partial" data-exam="' + esc(exam.id) + '">' + icon('edit') + '部分同意…</button>');
      actions.push('<button class="btn btn-ghost btn-sm" data-act="exam-regenerate" data-exam="' + esc(exam.id) + '">' + icon('refresh') + '重新生成</button>');
    }
    actions.push('<button class="icon-btn is-danger" data-act="exam-delete" data-exam="' + esc(exam.id) + '" title="删除">' + icon('trash') + '</button>');
  }

  return '<div class="exam-item-card' + (exam.status === 'confirmed' ? ' is-confirmed' : '') + '">' +
    '<div class="exam-item-top">' +
      '<div class="exam-item-name">' + icon('target') + esc(exam.name) +
        (days != null ? '<span class="exam-days">' + (days >= 0 ? '还有 ' + days + ' 天' : '已过期') + '</span>' : '') +
        statusBadge +
      '</div>' +
      '<div class="exam-item-meta">' + esc((exam.subjects || []).join('、')) + (exam.date ? ' · ' + esc(exam.date) : '') + '</div>' +
    '</div>' +
    body +
    (actions.length ? '<div class="row wrap mt-12">' + actions.join('') + '</div>' : '') +
  '</div>';
}

function planWeekdayLabel(value) {
  const n = Number(value);
  if (!n) return '每天';
  return WEEKDAYS[n - 1] || '每天';
}

function renderLeaveCard(today) {
  const leaves = (state.leaves || []).slice().sort(function (a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
  return '<div class="card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('calendar') + '请假登记</div>' +
      '<div class="card-sub">请假当天首页不会催你学习</div></div>' +
    '</div>' +
    '<div class="add-row">' +
      '<div class="field" style="max-width:136px"><label class="field-label">日期</label>' +
        '<input class="input" type="date" id="leave-date" value="' + today + '"></div>' +
      '<div class="field"><label class="field-label">原因</label>' +
        '<input class="input" id="leave-reason" placeholder="比如：发烧请假"></div>' +
      '<button class="btn btn-primary" data-act="add-leave">' + icon('plus') + '登记</button>' +
    '</div>' +
    '<div class="list mt-16">' +
      (leaves.length
        ? leaves.map(function (l) {
            return '<div class="list-item">' +
              '<div class="leave-date">' + esc(l.date || '—') + '</div>' +
              '<div class="list-main"><div class="list-title">' + esc(l.reason || '请假') + '</div>' +
                '<div class="list-desc">' + esc(l.subject || '全部科目') + '</div></div>' +
              '<button class="icon-btn is-danger" data-act="delete-leave" data-id="' + esc(l.id) + '" title="删除">' + icon('trash') + '</button>' +
            '</div>';
          }).join('')
        : '<div class="home-empty-line">' + icon('info') + '<span>没有请假记录。请假会影响每日安排的推导，记得登记。</span></div>') +
    '</div>' +
  '</div>';
}

function renderMakeupCard() {
  const makeups = state.makeups || [];
  return '<div class="card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('target') + '补课需求</div>' +
      '<div class="card-sub">缺了哪几节课？AI 给你排补课计划</div></div>' +
    '</div>' +
    '<div class="add-row">' +
      '<div class="field" style="max-width:96px"><label class="field-label">科目</label>' +
        '<select class="select" id="makeup-subject">' + SUBJECTS.map(function (s) {
          return '<option value="' + s + '">' + s + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label class="field-label">缺了什么</label>' +
        '<input class="input" id="makeup-content" placeholder="比如：第三章 电路连接，两节课没上"></div>' +
      '<button class="btn btn-primary" data-act="add-makeup">' + icon('sparkles') + '生成安排</button>' +
    '</div>' +
    '<div class="list mt-16">' +
      (makeups.length
        ? makeups.map(function (m) {
            return '<div class="makeup-item" data-makeup="' + esc(m.id) + '">' +
              '<div class="makeup-head">' +
                subjectDot(m.subject) +
                '<strong class="text-sm">' + esc(m.subject || '综合') + '</strong>' +
                '<span class="text-xs muted grow">' + esc(m.content || '') + '</span>' +
                '<span class="text-xs muted nowrap">' + esc(fmtDay(m.createdAt)) + '</span>' +
                '<button class="icon-btn is-danger" data-act="delete-makeup" data-id="' + esc(m.id) + '" title="删除">' + icon('trash') + '</button>' +
              '</div>' +
              '<div class="makeup-result" data-makeup-result="' + esc(m.id) + '">' +
                (m.status === 'generating'
                  ? '<span class="row" style="gap:7px"><span class="spinner spinner-sm"></span>正在生成补课安排…</span>'
                  : mdToHtml(m.planText || '还没有生成安排')) +
              '</div>' +
            '</div>';
          }).join('')
        : '<div class="home-empty-line">' + icon('info') + '<span>登记缺课内容后点「生成安排」，AI 会给出补课顺序和检验方法。</span></div>') +
    '</div>' +
  '</div>';
}

function renderDailyAskCard() {
  const learning = state.settings.learning || {};
  const askOn = learning.dailyAsk !== false;
  return '<div class="card">' +
    '<div class="card-head">' +
      '<div><div class="card-title">' + icon('clock') + '每日询问设置</div>' +
      '<div class="card-sub">每天固定时间问你「今天学了什么」</div></div>' +
      '<span class="field-hint" id="settings-save-hint">修改会自动保存</span>' +
    '</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">开启每日询问</div>' +
        '<div class="switch-desc">首页会出现一张登记卡片，登记后当天不再出现</div></div>' +
      '<button class="switch' + (askOn ? ' is-on' : '') + '" data-act="toggle-daily-ask" role="switch" aria-checked="' + (askOn ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="form-grid mt-12">' +
      '<div class="field"><label class="field-label">' + icon('clock') + '询问时间</label>' +
        '<input class="input" type="time" data-bind="settings.learning.askTime" value="' + esc(learning.askTime || '20:30') + '"></div>' +
      '<div class="field"><label class="field-label">' + icon('target') + '默认学习时长（分钟）</label>' +
        '<input class="input" type="number" min="5" max="180" data-bind="settings.learning.dailyMinutes" data-type="number" value="' + esc(learning.dailyMinutes || 40) + '"></div>' +
    '</div>' +
  '</div>';
}

/* ============================================================
 * 12. 页面：资料库
 * ============================================================ */
PAGES.library = function () {
  const tab = state.libraryTab === 'materials' ? 'materials' : 'textbooks';
  return pageHead({
    eyebrow: icon('library') + ' 资料库',
    title: '资料库',
    desc: '内置教材可以随时翻看正文；上传的课件、作业、试卷会成为 AI 的参考资料。',
    actions:
      '<button class="btn btn-secondary" data-act="open-data-folder">' + icon('folder') + '打开数据目录</button>' +
      '<button class="btn btn-primary" data-act="upload-material">' + icon('upload') + '上传材料</button>'
  }) +
  '<div class="lib-tabs">' +
    '<div class="segmented">' +
      '<button class="' + (tab === 'textbooks' ? 'is-active' : '') + '" data-act="lib-tab" data-tab="textbooks">' + icon('bookOpen') + '内置教材</button>' +
      '<button class="' + (tab === 'materials' ? 'is-active' : '') + '" data-act="lib-tab" data-tab="materials">' + icon('folder') + '我的材料（' + state.materials.length + '）</button>' +
    '</div>' +
    (tab === 'materials' ? '<span class="field-hint">' + icon('info') + ' PDF 请截图后再上传</span>' : '') +
  '</div>' +
  (tab === 'textbooks' ? renderTextbookGrid() : renderMaterialList());
};

function renderTextbookGrid() {
  if (!state.textbooks.length) {
    return emptyState({
      icon: 'bookOpen',
      title: '内置教材还没准备好',
      desc: '如果这是第一次启动，教材目录可能还在生成。稍后刷新一下，或者去设置里检查数据目录。',
      actions: '<button class="btn btn-primary" data-act="reload-textbooks">' + icon('refresh') + '重新加载</button>'
    });
  }
  return '<div class="book-grid">' + state.textbooks.map(function (book) {
    const subject = book.subject || '综合';
    const meta = subjectMeta(subject);
    const version = book.version || '';
    return '<div class="book-card">' +
      '<button class="book-open" data-act="read-textbook" data-id="' + esc(book.id) + '">' +
        '<div class="book-cover ' + meta.cls + '">' +
          '<div class="book-cover-title">' + esc(subject) + '</div>' +
          '<div class="book-cover-meta">' + esc(version) + ' · ' + esc(book.grade || '') + '</div>' +
        '</div>' +
        '<div class="book-title">' + esc(book.title || (subject + ' 教材')) + '</div>' +
      '</button>' +
      '<div class="book-meta">' +
        '<span class="badge badge-primary">内置</span>' +
        (book.chars ? '<span class="badge">' + esc(book.chars) + ' 字</span>' : '') +
        '<span class="grow"></span>' +
        '<button class="btn btn-ghost btn-sm" data-act="textbook-toc" data-id="' + esc(book.id) + '">' + icon('list') + '目录</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderMaterialList() {
  const materials = state.materials;
  const uploads =
    '<button class="upload-drop mb-16" data-act="upload-material">' +
      '<div class="upload-drop-icon">' + icon('upload') + '</div>' +
      '<div class="grow" style="text-align:left">' +
        '<div class="upload-drop-title">上传课件、作业或试卷</div>' +
        '<div class="upload-drop-desc">图片和文本都支持。上传后 AI 会在练习和问答时引用它，资料越多，回答越贴合你的课堂进度。</div>' +
      '</div>' +
      '<span class="badge badge-primary">pdf 请截图</span>' +
    '</button>';

  if (!materials.length) {
    return uploads + emptyState({
      icon: 'folder',
      title: '还没有上传材料',
      desc: '把老师发的课件、当天的作业、考过的试卷拍下来上传，AI 就能围绕你真实的学习材料出题和讲解。',
      actions: '<button class="btn btn-primary" data-act="upload-material">' + icon('upload') + '上传第一份材料</button>'
    });
  }

  return uploads + '<div class="list">' + materials.map(function (m) {
    const isImage = !!m.imagePath;
    const ext = isImage ? 'IMG' : 'TXT';
    const sizeText = m.size ? formatSize(m.size) : '';
    return '<div class="material-row">' +
      '<div class="material-icon">' + (isImage ? icon('image') : icon('edit')) + '</div>' +
      '<div class="material-main">' +
        '<div class="material-name">' + esc(m.name || '未命名材料') + '</div>' +
        '<div class="material-desc">' +
          subjectDot(m.subject || '综合') + '<span>' + esc(m.subject || '综合') + '</span>' +
          '<span class="tag">' + esc(materialKindLabel(m.kind)) + '</span>' +
          '<span>' + esc(fmtRelative(m.createdAt)) + '</span>' +
          (sizeText ? '<span>' + esc(sizeText) + '</span>' : '') +
          '<span class="tag">' + ext + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="material-actions">' +
        (m.textLength ? '<button class="icon-btn" data-act="material-toc" data-id="' + esc(m.id) + '" title="查看目录">' + icon('list') + '</button>' : '') +
        '<button class="icon-btn" data-act="preview-material" data-id="' + esc(m.id) + '" title="预览">' + icon('eye') + '</button>' +
        '<button class="icon-btn is-danger" data-act="delete-material" data-id="' + esc(m.id) + '" title="删除">' + icon('trash') + '</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderTocList(toc, titleText) {
  return toc.map(function (s) {
    const indent = '  '.repeat(Math.max(0, Math.min(3, (Number(s.level) || 1) - 1)));
    return '<div class="toc-row">' +
      '<div class="toc-head">' + indent +
        '<span class="toc-id">' + esc(s.id) + '</span> ' +
        '<span class="toc-title">' + esc(s.title) + '</span>' +
        '<span class="toc-chars">' + (s.chars || 0) + ' 字</span>' +
      '</div>' +
      (s.summary ? '<div class="toc-summary">' + esc(s.summary) + '</div>' : '') +
    '</div>';
  }).join('');
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

async function previewMaterial(id) {
  const mat = state.materials.find(function (m) { return m.id === id; });
  if (!mat) {
    toast('材料不存在，可能已经被删除', 'warning');
    return;
  }
  if (mat.imagePath) {
    openModal({
      title: mat.name || '材料预览',
      size: 'wide',
      body:
        '<div class="banner banner-info mb-16">' + icon('image') +
          '<div><div class="banner-title">这是一张图片材料</div>' +
          '<div class="banner-desc">图片保存在数据目录的 <code>' + esc(mat.imagePath) + '</code>，可以用系统看图工具打开。AI 在提问和出题时会读取这张图片。</div></div>' +
        '</div>' +
        '<div class="material-desc" style="justify-content:flex-start">' + subjectDot(mat.subject || '综合') +
          '<span>' + esc(mat.subject || '综合') + '</span><span class="tag">' + esc(materialKindLabel(mat.kind)) + '</span>' +
          '<span>' + esc(fmtDate(mat.createdAt)) + '</span></div>',
      footer:
        '<button class="btn btn-secondary" data-act="open-data-folder">' + icon('folder') + '打开数据目录</button>' +
        '<button class="btn btn-primary" data-act="modal-close">知道了</button>'
    });
    return;
  }
  let text = mat.text || '';
  try {
    const full = await api.materials.readText(id);
    if (full) text = full;
  } catch (err) {
    /* 使用列表里的摘要兜底 */
  }
  openModal({
    title: mat.name || '材料预览',
    size: 'wide',
    body:
      '<div class="row mb-12" style="justify-content:space-between">' +
        '<span class="material-desc" style="justify-content:flex-start">' + subjectDot(mat.subject || '综合') +
          '<span>' + esc(mat.subject || '综合') + '</span><span class="tag">' + esc(materialKindLabel(mat.kind)) + '</span></span>' +
        '<span class="field-hint">' + esc(fmtDate(mat.createdAt)) + '</span>' +
      '</div>' +
      '<div class="text-preview">' + esc(text || '（这份材料没有可读文本）') + '</div>',
    footer: '<button class="btn btn-secondary" data-act="modal-close">关闭</button>'
  });
}

/* ============================================================
 * 13. 页面：AI 助手
 * ============================================================ */
PAGES.assistant = function () {
  const chat = state.chat;
  const model = textOr(state.settings.api.model, '未配置模型');
  return '<div class="assistant">' +
    '<div class="assistant-head">' +
      '<div class="assistant-avatar">' + icon('sparkles') + '</div>' +
      '<div style="min-width:0">' +
        '<div class="assistant-title">AI 助手</div>' +
        '<div class="assistant-sub">' + icon('brain') + '<span>' + esc(model) + '</span>' +
          '<span class="dot-sep"></span><span>先查教材，再联网核对</span></div>' +
      '</div>' +
      '<div class="assistant-badges">' +
        '<span class="badge badge-success" title="联网搜索始终开启，不可关闭">' + icon('globe') + '联网搜索：已开启（强制）</span>' +
        '<span class="badge ' + (chat.deepThinking ? 'badge-primary' : '') + '">' + icon('brain') + '深度思考：' + (chat.deepThinking ? '开' : '关') + '</span>' +
        (chat.messages.length ? '<button class="icon-btn" data-act="chat-clear" title="清空对话">' + icon('trash') + '</button>' : '') +
      '</div>' +
    '</div>' +
    apiGuideBanner() +
    '<div class="chat-scroll" id="chat-scroll">' + renderChatBody() + '</div>' +
    renderComposer() +
  '</div>';
};

PAGES.assistantAfterRender = function () {
  scrollChatBottom();
  const input = document.getElementById('chat-input');
  if (input) {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }
};

function renderChatBody() {
  const chat = state.chat;
  if (!chat.messages.length) {
    return '<div class="chat-welcome">' +
      '<div class="chat-welcome-icon">' + icon('sparkles') + '</div>' +
      '<div class="chat-welcome-title">今天想弄懂点什么？</div>' +
      '<div class="chat-welcome-desc">不会的题、写不出的作文、记不住的知识点，都可以直接问。' +
        'AI 会先翻你的教材和上传的资料，再去网上核对一遍，尽量不说错。</div>' +
      '<div class="chat-suggestions">' +
        DEFAULT_CHAT_SUGGESTIONS.map(function (text) {
          return '<button class="suggestion-chip" data-act="chat-suggest" data-text="' + esc(text) + '">' + esc(text) + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }
  return chat.messages.map(renderChatMessage).join('');
}

function renderChatMessage(msg) {
  const isUser = msg.role === 'user';
  const streaming = msg.status === 'streaming';
  const contentHtml = streaming
    ? '<span class="stream-text">' + esc(msg.content || '') + '</span><span class="msg-cursor"></span>'
    : isUser
      ? '<span class="msg-text">' + esc(msg.content || '') + '</span>'
      : (msg.content ? mdToHtml(msg.content) : (msg.status === 'error' ? esc(msg.error || '出错了') : ''));
  const imagesHtml = (msg.images && msg.images.length)
    ? '<div class="msg-images">' + msg.images.map(function (img) {
        return '<img class="msg-image" src="' + esc(img) + '" alt="附件图片">';
      }).join('') + '</div>'
    : '';
  const reasoningHtml = msg.reasoning
    ? '<div class="reasoning-box">' +
        '<button class="reasoning-head' + (streaming ? ' is-open' : '') + '" data-act="toggle-reasoning">' +
          icon('brain') + '<span>深度思考过程</span>' +
          '<span class="chev">' + icon('chevron') + '</span>' +
        '</button>' +
        '<div class="reasoning-body' + (streaming ? '' : ' hidden') + '">' + esc(msg.reasoning) + '</div>' +
      '</div>'
    : '';
  const searchHtml = msg.search && msg.search.results && msg.search.results.length
    ? '<div class="msg-search">' + icon('globe') + '<span>参考了 ' + msg.search.results.length + ' 条网络资料</span>' +
        msg.search.results.slice(0, 4).map(function (r) {
          return '<button class="msg-cite" data-act="open-url" data-url="' + esc(r.url || '') + '" title="' + esc(r.url || '') + '">' + icon('external') + '来源</button>';
        }).join('') + '</div>'
    : '';

  const tools = [];
  if (!streaming) {
    if (msg.content) {
      tools.push('<button class="msg-tool" data-act="copy-msg" data-id="' + esc(msg.id) + '">' + icon('copy') + '复制</button>');
    }
    if (msg.role === 'assistant') {
      tools.push('<button class="msg-tool" data-act="chat-regenerate">' + icon('refresh') + '重答</button>');
    }
  }

  return '<div class="msg ' + (isUser ? 'msg-user' : '') + '" data-msg="' + esc(msg.id) + '">' +
    '<div class="msg-avatar ' + (isUser ? 'is-user' : '') + '">' + (isUser ? '我' : icon('sparkles')) + '</div>' +
    '<div class="msg-body">' +
      reasoningHtml +
      '<div class="msg-bubble' + (msg.status === 'error' ? ' is-error' : '') + '"><div class="msg-text">' + contentHtml + '</div></div>' +
      imagesHtml +
      searchHtml +
      (tools.length ? '<div class="msg-tools">' + tools.join('') + '</div>' : '') +
    '</div>' +
  '</div>';
}

function renderComposer() {
  const chat = state.chat;
  const images = chat.images.map(function (img, i) {
    return '<div class="attach-thumb"><img src="' + esc(img.dataUrl) + '" alt="' + esc(img.name || '图片') + '">' +
      '<button class="attach-x" data-act="chat-remove-image" data-index="' + i + '" aria-label="移除">' + icon('x') + '</button></div>';
  }).join('');
  const mats = chat.materialIds.length
    ? '<span class="attach-file">' + icon('folder') + '<span>已选 ' + chat.materialIds.length + ' 份资料</span>' +
      '<button class="icon-btn" style="width:20px;height:20px" data-act="chat-clear-materials" aria-label="清除">' + icon('x') + '</button></span>'
    : '';
  const hasContent = String(chat.draft || '').trim() || chat.images.length || chat.materialIds.length;

  return '<div class="composer-wrap">' +
    '<div class="composer">' +
      (images || mats ? '<div class="composer-attachments">' + images + mats + '</div>' : '') +
      '<textarea class="textarea composer-input" id="chat-input" data-bind="chat.draft" rows="1" ' +
        'placeholder="想问点什么？比如：这道题为什么选 B？">' + esc(chat.draft) + '</textarea>' +
      '<div class="composer-bar">' +
        '<button class="composer-tool" data-act="chat-pick-images" title="添加图片">' + icon('image') + '图片</button>' +
        '<button class="composer-tool' + (chat.materialIds.length ? ' is-on' : '') + '" data-act="chat-pick-materials" title="从资料库选材料">' +
          icon('paperclip') + '资料</button>' +
        '<button class="composer-tool' + (chat.deepThinking ? ' is-on' : '') + '" data-act="chat-toggle-deep" title="深度思考会让回答更慢但更细">' +
          icon('brain') + '深度思考</button>' +
        '<button class="composer-tool" data-act="upload-material">' + icon('upload') + '上传</button>' +
        '<span class="composer-spacer"></span>' +
        '<span class="composer-hint"><span class="kbd">Enter</span> 发送 · <span class="kbd">Shift</span>+<span class="kbd">Enter</span> 换行</span>' +
        (chat.streaming
          ? '<button class="composer-send is-stop" data-act="chat-stop" title="停止生成">' + icon('stop') + '</button>'
          : '<button class="composer-send" data-act="chat-send" title="发送"' + (hasContent ? '' : ' disabled') + '>' + icon('send') + '</button>') +
      '</div>' +
    '</div>' +
  '</div>';
}

function scrollChatBottom() {
  const el = document.getElementById('chat-scroll');
  if (el) el.scrollTop = el.scrollHeight;
}

function buildChatMessages() {
  const list = state.chat.messages
    .filter(function (m) { return (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(); })
    .map(function (m) {
      const item = { role: m.role, content: m.content };
      if (m.role === 'user' && m.images && m.images.length) item.images = m.images;
      return item;
    });
  return list;
}

async function sendChat() {
  const chat = state.chat;
  if (chat.streaming) return;
  const text = String(chat.draft || '').trim();
  if (!text && !chat.images.length) {
    toast('先写点什么再发送吧', 'info');
    return;
  }
  if (!isConfigured()) {
    toast('还没有配置 API，请先去设置页填写', 'warning');
    navigate('settings');
    return;
  }

  const userMsg = {
    id: uid('m'),
    role: 'user',
    content: text || '（图片）',
    images: chat.images.map(function (img) { return img.dataUrl; }),
    createdAt: Date.now(),
    status: 'done'
  };
  const aiMsg = {
    id: uid('m'),
    role: 'assistant',
    content: '',
    reasoning: '',
    search: null,
    createdAt: Date.now(),
    status: 'streaming'
  };
  chat.messages.push(userMsg, aiMsg);
  chat.draft = '';
  chat.images = [];
  chat.streaming = true;
  saveChatHistory();
  render();
  scrollChatBottom();
  const inputEl = document.getElementById('chat-input');
  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }

  const req = {
    mode: 'chat',
    messages: buildChatMessages(),
    context: {
      grade: state.profile.grade || '八年级',
      materialIds: chat.materialIds.slice(),
      useTextbooks: true
    },
    options: {
      deepThinking: !!chat.deepThinking,
      webSearch: true
    }
  };

  const job = await startAI(req, {
    onStatus: function (status, statusText) {
      const bubble = document.querySelector('[data-msg="' + aiMsg.id + '"] .msg-bubble');
      if (bubble && !aiMsg.content) {
        bubble.innerHTML = '<div class="msg-status"><span class="spinner spinner-sm"></span>' +
          '<span>' + esc(statusText || '正在思考…') + '</span></div>';
      }
    },
    onSearch: function (evt) {
      aiMsg.search = { ok: !!evt.ok, provider: evt.provider || '', results: evt.results || [], error: evt.error || '' };
    },
    onReasoning: function (reasoning) {
      aiMsg.reasoning = reasoning;
      const box = document.querySelector('[data-msg="' + aiMsg.id + '"] .reasoning-box');
      if (box) {
        const body = box.querySelector('.reasoning-body');
        if (body) body.textContent = reasoning;
      }
    },
    onDelta: function (accumulated) {
      aiMsg.content = accumulated;
      const node = document.querySelector('[data-msg="' + aiMsg.id + '"] .stream-text');
      if (node) {
        node.textContent = accumulated;
      } else {
        const bubble = document.querySelector('[data-msg="' + aiMsg.id + '"] .msg-bubble');
        if (bubble) {
          bubble.innerHTML = '<div class="msg-text"><span class="stream-text">' + esc(accumulated) +
            '</span><span class="msg-cursor"></span></div>';
        }
      }
      scrollChatBottom();
    },
    onDone: function (evt) {
      aiMsg.content = evt.text || aiMsg.content;
      aiMsg.reasoning = evt.reasoning || aiMsg.reasoning;
      aiMsg.search = evt.search || aiMsg.search;
      aiMsg.status = 'done';
      aiMsg.model = evt.model || '';
      chat.streaming = false;
      chat.requestId = null;
      render();
      scrollChatBottom();
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    },
    onError: function (evt) {
      chat.streaming = false;
      chat.requestId = null;
      if (evt.code === 'aborted') {
        aiMsg.status = 'done';
        aiMsg.content = (aiMsg.content || '') + '\n\n（已停止生成）';
      } else {
        aiMsg.status = 'error';
        aiMsg.error = evt.message || '生成失败，请重试';
        aiMsg.content = '';
      }
      render();
    }
  });
  if (job) {
    chat.requestId = job.requestId;
    updateComposerState();
  }
}

function stopChat() {
  const chat = state.chat;
  if (!chat.streaming) return;
  if (chat.requestId) abortAI(chat.requestId);
  chat.streaming = false;
  chat.requestId = null;
  const last = chat.messages[chat.messages.length - 1];
  if (last && last.role === 'assistant' && last.status === 'streaming') {
    last.status = 'done';
    last.content = (last.content || '') + '\n\n（已停止生成）';
  }
  render();
  toast('已停止生成', 'info');
}

function updateComposerState() {
  const sendBtn = document.querySelector('.composer-send');
  if (sendBtn && state.chat.streaming) {
    sendBtn.className = 'composer-send is-stop';
    sendBtn.dataset.act = 'chat-stop';
    sendBtn.innerHTML = icon('stop');
  }
}

async function pickChatImages() {
  try {
    const picked = await api.dialog.pickImages();
    if (!picked || !picked.length) return;
    picked.slice(0, 4).forEach(function (img) {
      if (state.chat.images.length < 4) state.chat.images.push(img);
    });
    if (picked.length > 4) toast('一次最多 4 张图片，多的先不放了', 'info');
    render();
  } catch (err) {
    toast(err && err.message ? err.message : '选择图片失败', 'error');
  }
}

/* ============================================================
 * 14. 页面：设置
 * ============================================================ */
const SETTINGS_TABS = [
  { id: 'api', label: 'API 配置', icon: 'key' },
  { id: 'profile', label: '个人信息', icon: 'user' },
  { id: 'scores', label: '考试成绩', icon: 'report' },
  { id: 'textbook', label: '教材版本', icon: 'bookOpen' },
  { id: 'behavior', label: '行为偏好', icon: 'settings' },
  { id: 'data', label: '数据与关于', icon: 'folder' }
];

PAGES.settings = function () {
  const tab = state.settingsTab || 'api';
  const draftSettings = state.drafts.settings || defaultSettings();
  const nav = SETTINGS_TABS.map(function (t) {
    return '<button class="' + (t.id === tab ? 'is-active' : '') + '" data-act="settings-tab" data-tab="' + t.id + '">' +
      icon(t.icon) + '<span>' + t.label + '</span></button>';
  }).join('');

  const bodies = {
    api: renderSettingsApi,
    profile: renderSettingsProfile,
    scores: renderSettingsScores,
    textbook: renderSettingsTextbook,
    behavior: renderSettingsBehavior,
    data: renderSettingsData
  };
  const body = (bodies[tab] || renderSettingsApi)(draftSettings);

  return pageHead({
    eyebrow: icon('settings') + ' 设置',
    title: '设置',
    desc: '接口、个人信息、成绩和偏好都保存在本机，换设备时记得手动备份。',
    actions: '<span class="api-status ' + (isConfigured() ? 'is-ok' : '') + '">' +
      icon(isConfigured() ? 'check-circle' : 'alert-circle') +
      (isConfigured() ? 'AI 已配置' : 'AI 未配置') + '</span>'
  }) +
  '<div class="settings-layout">' +
    '<nav class="settings-nav">' + nav + '</nav>' +
    '<div class="settings-panel">' + body +
      '<div class="settings-save-bar">' +
        '<span class="save-hint" id="settings-save-hint">' + icon('check') + '修改后点保存生效</span>' +
        '<div class="row">' +
          '<button class="btn btn-secondary" data-act="open-data-folder">' + icon('folder') + '数据目录</button>' +
          '<button class="btn btn-primary" data-act="settings-save">' + icon('check') + '保存设置</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
};

function renderSettingsApi(draft) {
  const apiCfg = draft.api || DEFAULT_SETTINGS.api;
  const search = draft.search || DEFAULT_SETTINGS.search;
  return '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('key') + '模型接口</div>' +
      '<div class="settings-section-desc">支持 DeepSeek、OpenAI 以及任何兼容 OpenAI 协议的服务。Key 只保存在本机配置文件里，所有请求都由主进程发出。</div></div>' +
      '<span class="api-status ' + (isConfigured() ? 'is-ok' : '') + '">' +
        icon(isConfigured() ? 'check-circle' : 'alert-circle') + (isConfigured() ? '已配置' : '未配置') + '</span>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="field span-2"><label class="field-label">' + icon('globe') + 'API 地址（Base URL）</label>' +
        '<input class="input" data-bind="settings.api.baseUrl" value="' + esc(apiCfg.baseUrl) + '" placeholder="https://api.deepseek.com">' +
        '<span class="field-hint">DeepSeek：https://api.deepseek.com　OpenAI：https://api.openai.com/v1</span></div>' +
      '<div class="field span-2"><label class="field-label">' + icon('key') + 'API Key</label>' +
        '<div class="input-group">' +
          '<input class="input" type="password" data-bind="settings.api.apiKey" value="' + esc(apiCfg.apiKey) + '" placeholder="sk-...">' +
          '<button class="icon-btn" data-act="toggle-secret" title="显示 / 隐藏">' + icon('eye') + '</button>' +
        '</div>' +
        '<span class="field-hint">Key 不会上传到任何地方，只用于调用你配置的接口</span></div>' +
      '<div class="field"><label class="field-label">' + icon('assistant') + '主对话模型</label>' +
        '<input class="input" data-bind="settings.api.model" value="' + esc(apiCfg.model) + '" placeholder="deepseek-chat"></div>' +
      '<div class="field"><label class="field-label">' + icon('brain') + '深度思考模型（可选）</label>' +
        '<input class="input" data-bind="settings.api.reasoningModel" value="' + esc(apiCfg.reasoningModel) + '" placeholder="留空则使用主模型"></div>' +
      '<div class="field"><label class="field-label">' + icon('target') + '温度 temperature</label>' +
        '<input class="input" type="number" step="0.1" min="0" max="2" data-bind="settings.api.temperature" data-type="number" value="' + esc(apiCfg.temperature) + '">' +
        '<span class="field-hint">越低越稳定，出题建议 0.3 左右</span></div>' +
      '<div class="field"><label class="field-label">' + icon('layers') + '最大 token</label>' +
        '<input class="input" type="number" min="0" step="256" data-bind="settings.api.maxTokens" data-type="number" value="' + esc(apiCfg.maxTokens) + '" placeholder="0 = 不限制">' +
        '<span class="field-hint">0 = 不限制（不传该参数，长回答不会被截断）</span></div>' +
      '<div class="field"><label class="field-label">' + icon('clock') + '超时（秒）</label>' +
        '<input class="input" type="number" min="20" max="600" data-bind="settings.api.timeoutSec" data-type="number" value="' + esc(apiCfg.timeoutSec) + '">' +
        '<span class="field-hint">网络慢可以调到 180</span></div>' +
    '</div>' +
  '</div>' +
  '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('search') + '联网搜索服务（可选）</div>' +
      '<div class="settings-section-desc">不填也能用：主进程会自动用内置的搜索兜底。填了自己的搜索 Key 结果会更稳定。' +
      '注意：联网搜索始终开启，不能关闭。</div></div>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="field"><label class="field-label">Tavily Key</label>' +
        '<input class="input" data-bind="settings.search.tavilyKey" value="' + esc(search.tavilyKey || '') + '" placeholder="tvly-..."></div>' +
      '<div class="field"><label class="field-label">Serper Key</label>' +
        '<input class="input" data-bind="settings.search.serperKey" value="' + esc(search.serperKey || '') + '" placeholder="..."></div>' +
      '<div class="field"><label class="field-label">博查 Key</label>' +
        '<input class="input" data-bind="settings.search.bochaKey" value="' + esc(search.bochaKey || '') + '" placeholder="..."></div>' +
      '<div class="field"><label class="field-label">搜索服务</label>' +
        '<select class="select" data-bind="settings.ai.searchProvider">' +
          [['auto', '自动选择（推荐）'], ['tavily', 'Tavily'], ['serper', 'Serper'], ['bocha', '博查'], ['bing_html', 'Bing 网页兜底']]
            .map(function (p) {
              return '<option value="' + p[0] + '"' + (p[0] === (draft.ai && draft.ai.searchProvider) ? ' selected' : '') + '>' + p[1] + '</option>';
            }).join('') +
        '</select></div>' +
    '</div>' +
  '</div>';
}

function renderSettingsProfile() {
  const p = state.drafts.profile || defaultProfile();
  return '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('user') + '个人信息</div>' +
      '<div class="settings-section-desc">这些信息会写进 AI 的提示词，让回答更贴合你的年级和考试安排。</div></div>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div class="field"><label class="field-label">' + icon('user') + '昵称 / 姓名</label>' +
        '<input class="input" data-bind="profile.name" value="' + esc(p.name) + '" placeholder="怎么称呼你"></div>' +
      '<div class="field"><label class="field-label">' + icon('bookOpen') + '年级</label>' +
        '<select class="select" data-bind="profile.grade">' + GRADES.map(function (g) {
          return '<option value="' + g + '"' + (g === p.grade ? ' selected' : '') + '>' + g + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label class="field-label">' + icon('home') + '学校</label>' +
        '<input class="input" data-bind="profile.school" value="' + esc(p.school) + '" placeholder="学校名称"></div>' +
      '<div class="field"><label class="field-label">' + icon('layers') + '班级</label>' +
        '<input class="input" data-bind="profile.class" value="' + esc(p.class) + '" placeholder="班级"></div>' +
      '<div class="field"><label class="field-label">' + icon('calendar') + '近期考试名称</label>' +
        '<input class="input" data-bind="profile.examName" value="' + esc(p.examName) + '" placeholder="期中考试 / 月考"></div>' +
      '<div class="field"><label class="field-label">' + icon('calendar') + '考试日期</label>' +
        '<input class="input" type="date" data-bind="profile.examDate" value="' + esc(p.examDate) + '"></div>' +
      '<div class="field span-2"><label class="field-label">' + icon('edit') + '备注</label>' +
        '<textarea class="textarea" data-bind="profile.notes" placeholder="比如：数学几何薄弱，英语听力需要加强">' + esc(p.notes) + '</textarea></div>' +
    '</div>' +
  '</div>';
}

function renderSettingsScores() {
  const scores = state.drafts.scores || defaultScores();
  let total = 0;
  let full = 0;
  SUBJECTS.forEach(function (sub) {
    const entry = scores.subjects[sub];
    if (!entry || entry.skipped) return;
    const s = numOrNull(entry.score);
    const f = numOrNull(entry.full);
    if (s != null && f != null) {
      total += s;
      full += f;
    }
  });
  return '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('report') + '考试成绩</div>' +
      '<div class="settings-section-desc">没考的科目点「跳过」，页面会显示「已跳过 · 暂无成绩」并自动排除统计——' +
      '千万不要填 0，0 分是真实成绩。</div></div>' +
      '<span class="badge badge-primary">总分 ' + total + ' / ' + full + '</span>' +
    '</div>' +
    '<div class="form-grid mb-16">' +
      '<div class="field"><label class="field-label">' + icon('calendar') + '考试名称</label>' +
        '<input class="input" data-bind="settings.scores.examName" value="' + esc(scores.examName) + '" placeholder="比如：八年级上学期月考"></div>' +
      '<div class="field"><label class="field-label">' + icon('calendar') + '考试日期</label>' +
        '<input class="input" type="date" data-bind="settings.scores.examDate" value="' + esc(scores.examDate) + '"></div>' +
    '</div>' +
    '<div class="row-between mb-8"><span class="text-xs muted">科目</span><span class="text-xs muted" style="padding-right:4px">分数 / 满分（跳过的不计入）</span></div>' +
    '<div id="score-rows">' + renderScoreRows(scores, 'settings') + '</div>' +
  '</div>' +
  '<div class="banner banner-info">' + icon('info') +
    '<div class="banner-desc">成绩会作为 AI 出题和讲解的依据（比如数学偏弱就多练基础题）。点右上角「保存设置」后生效。</div></div>';
}

function renderSettingsTextbook() {
  return '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('bookOpen') + '教材版本（固定）</div>' +
      '<div class="settings-section-desc">浙江初中使用的教材版本是固定的，AI 出题和讲解会严格按这些版本检索教材，避免串版本。</div></div>' +
      '<span class="badge badge-primary">只读</span>' +
    '</div>' +
    renderTextbookRules() +
  '</div>' +
  '<div class="card settings-section">' +
    '<div class="settings-section-title mb-12">' + icon('info') + '几条说明</div>' +
    '<div class="point-list">' +
      '<div class="point-item"><div class="point-mark">1</div><div>浙江的《科学》是一门合并课程，一本<b>教科版</b>教材同时覆盖物理、化学、生物，' +
        'AI 回答问题时会把三科内容放在一起考虑。</div></div>' +
      '<div class="point-item"><div class="point-mark">2</div><div>《社会》由<b>道法、历史、地理</b>三科组成，全部使用人教版。' +
        '练习和报告里仍然按三个科目分别记录。</div></div>' +
      '<div class="point-item"><div class="point-mark">3</div><div>语文、英语是人教版，数学是浙教版。' +
        '如果你自己的课本和内置教材不一致，可以在资料库里上传自己的课本照片纠正 AI。</div></div>' +
    '</div>' +
  '</div>';
}

function renderSettingsBehavior(draft) {
  const aiCfg = draft.ai || DEFAULT_SETTINGS.ai;
  const learning = draft.learning || DEFAULT_SETTINGS.learning;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return '<div class="card settings-section">' +
    '<div class="settings-section-title mb-8" style="margin-bottom:6px">' + icon('assistant') + '回答方式</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">流式输出</div>' +
        '<div class="switch-desc">开启后 AI 一边想一边显示，不用等整段写完（默认开启）</div></div>' +
      '<button class="switch' + (aiCfg.stream !== false ? ' is-on' : '') + '" data-act="toggle-setting" data-key="ai.stream" role="switch" aria-checked="' + (aiCfg.stream !== false ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">默认开启深度思考</div>' +
        '<div class="switch-desc">回答会更细，但更慢，也会消耗更多 token</div></div>' +
      '<button class="switch' + (aiCfg.deepThinking ? ' is-on' : '') + '" data-act="toggle-setting" data-key="ai.deepThinking" role="switch" aria-checked="' + (aiCfg.deepThinking ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">联网搜索</div>' +
        '<div class="switch-desc">已开启（强制）：每次回答都会先检索网络，避免用过时知识。</div></div>' +
      '<button class="switch is-on" disabled role="switch" aria-checked="true" title="联网搜索始终开启"></button>' +
    '</div>' +
  '</div>' +
  '<div class="card settings-section">' +
    '<div class="settings-section-title mb-12">' + icon('clock') + '学习节奏</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">每日询问</div>' +
        '<div class="switch-desc">每天问一次「今天上了多少内容」</div></div>' +
      '<button class="switch' + (learning.dailyAsk !== false ? ' is-on' : '') + '" data-act="toggle-setting" data-key="learning.dailyAsk" role="switch" aria-checked="' + (learning.dailyAsk !== false ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">自动生成目录</div>' +
        '<div class="switch-desc">把教材和上传的 MD 文档按章节归档生成目录，AI 先看目录、再按需调取相关章节，不再一次性塞入整篇文档</div></div>' +
      '<button class="switch' + (learning.autoToc !== false ? ' is-on' : '') + '" data-act="toggle-setting" data-key="learning.autoToc" role="switch" aria-checked="' + (learning.autoToc !== false ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="form-grid mt-12">' +
      '<div class="field"><label class="field-label">' + icon('clock') + '询问时间</label>' +
        '<input class="input" type="time" data-bind="settings.learning.askTime" value="' + esc(learning.askTime) + '"></div>' +
      '<div class="field"><label class="field-label">' + icon('target') + '默认练习时长（分钟）</label>' +
        '<input class="input" type="number" min="5" max="180" data-bind="settings.learning.dailyMinutes" data-type="number" value="' + esc(learning.dailyMinutes) + '"></div>' +
    '</div>' +
  '</div>' +
  '<div class="card settings-section">' +
    '<div class="settings-section-title mb-12">' + icon('sun') + '外观与快捷入口</div>' +
    '<div class="switch-row">' +
      '<div><div class="switch-label">深色主题</div>' +
        '<div class="switch-desc">默认使用深色；浅色留作可选</div></div>' +
      '<button class="switch' + (dark ? ' is-on' : '') + '" data-act="theme-toggle" role="switch" aria-checked="' + (dark ? 'true' : 'false') + '"></button>' +
    '</div>' +
    '<div class="row wrap mt-12">' +
      '<button class="btn btn-secondary" data-act="upload-material">' + icon('upload') + '上传学习材料</button>' +
      '<button class="btn btn-secondary" data-act="nav" data-route="library">' + icon('library') + '去资料库</button>' +
      '<button class="btn btn-secondary" data-act="nav" data-route="welcome">' + icon('sparkles') + '重新看引导</button>' +
    '</div>' +
  '</div>';
}

function renderSettingsData() {
  const info = state.appInfo || {};
  const rows = [
    { label: '应用版本', value: info.version || '1.0.0' },
    { label: '平台', value: info.platform || navigator.platform || 'Windows' },
    { label: '运行方式', value: info.packaged ? '安装版' : '开发版' },
    { label: '数据目录', value: info.userDataPath || '—' },
    { label: '本地报告', value: state.reports.length + ' 份' },
    { label: '上传材料', value: state.materials.length + ' 份' },
    { label: '今天日期', value: info.today || todayStr() }
  ];
  return '<div class="card settings-section">' +
    '<div class="settings-section-head">' +
      '<div><div class="settings-section-title">' + icon('folder') + '数据与关于</div>' +
      '<div class="settings-section-desc">所有数据都存在本机的数据目录里，不会上传到服务器。换电脑时把整个目录拷走即可。</div></div>' +
    '</div>' +
    '<div class="data-grid">' + rows.map(function (r) {
      return '<div class="data-item"><div class="data-item-label">' + esc(r.label) + '</div>' +
        '<div class="data-item-value">' + esc(r.value) + '</div></div>';
    }).join('') + '</div>' +
    '<div class="row mt-16">' +
      '<button class="btn btn-primary" data-act="open-data-folder">' + icon('folder') + '打开数据目录</button>' +
    '</div>' +
    '<div class="banner banner-neutral mt-16">' + icon('info') +
      '<div class="banner-desc">备份提示：把 <b>' + esc(info.userDataPath || '数据目录') + '</b> 整个文件夹复制到新电脑的相同位置，就能带走全部设置、成绩和报告。</div></div>' +
  '</div>';
}

/* ============================================================
 * 15. 全局事件委托
 * ============================================================ */
const ACTIONS = Object.create(null);

ACTIONS['nav'] = function (el) {
  navigate(el.dataset.route || 'home');
};

ACTIONS['theme-toggle'] = async function () {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  state.themePreference = next;
  if (state.drafts.settings && state.drafts.settings.ui) state.drafts.settings.ui.theme = next;
  updateSideMeta();
  try {
    await storeSet('uiTheme', next);
    await api.settings.save({ ui: { theme: next } });
    if (state.settings.ui) state.settings.ui.theme = next;
  } catch (err) {
    toast('主题保存失败，重启后可能恢复', 'warning');
  }
  if (state.route === 'settings') {
    const btn = document.querySelector('.switch[data-act="theme-toggle"]');
    if (btn) {
      btn.classList.toggle('is-on', next === 'dark');
      btn.setAttribute('aria-checked', next === 'dark' ? 'true' : 'false');
    }
  }
};

ACTIONS['modal-close'] = function () {
  closeModal();
  state.materialPicker = null;
};

ACTIONS['confirm-ok'] = function () {
  const resolve = confirmResolve;
  confirmResolve = null;
  closeModal();
  if (resolve) resolve(true);
};

ACTIONS['confirm-cancel'] = function () {
  const resolve = confirmResolve;
  confirmResolve = null;
  closeModal();
  if (resolve) resolve(false);
};

ACTIONS['open-url'] = async function (el) {
  const url = el.dataset.url;
  if (!url) return;
  try {
    await api.app.openExternal(url);
  } catch (err) {
    toast(err && err.message ? err.message : '打开链接失败', 'error');
  }
};

ACTIONS['open-data-folder'] = async function () {
  try {
    await api.app.openDataFolder();
  } catch (err) {
    toast(err && err.message ? err.message : '打开数据目录失败', 'error');
  }
};

ACTIONS['toggle-collapse'] = function (el) {
  el.classList.toggle('is-open');
  const parent = el.parentElement;
  if (!parent) return;
  const body = parent.querySelector('.collapsible-body');
  if (body) body.classList.toggle('hidden');
};

/* 欢迎引导 */
ACTIONS['welcome-next'] = function (el) {
  const step = state.welcome.step;
  if (step < 3) {
    state.welcome.step = step + 1;
    render();
    return;
  }
  ACTIONS['welcome-finish']();
};

ACTIONS['welcome-prev'] = function () {
  if (state.welcome.step > 1) {
    state.welcome.step -= 1;
    render();
  }
};

ACTIONS['welcome-skip'] = async function () {
  state.welcomed = true;
  await storeSet('welcomed', true);
  navigate('home');
};

ACTIONS['welcome-finish'] = async function () {
  const draftSettings = state.drafts.settings || defaultSettings();
  const draftProfile = state.drafts.profile || defaultProfile();
  const draftScores = state.drafts.scores || defaultScores();
  const configured = !!(draftSettings && draftSettings.api && String(draftSettings.api.apiKey || '').trim());
  try {
    await api.settings.save(deepCopy(draftSettings));
    state.settings = mergeSettings(draftSettings);
    state.needsApi = !isConfigured();
  } catch (err) {
    toast(err && err.message ? err.message : '保存 API 配置失败', 'error');
    return;
  }
  try {
    await api.profile.save(deepCopy(draftProfile));
    state.profile = mergeProfile(draftProfile);
  } catch (err) {
    toast(err && err.message ? err.message : '保存个人信息失败', 'error');
    return;
  }
  try {
    await api.scores.save(deepCopy(draftScores));
    state.scores = mergeScores(draftScores);
  } catch (err) {
    toast(err && err.message ? err.message : '保存成绩失败', 'error');
    return;
  }
  state.welcomed = true;
  await storeSet('welcomed', true);
  updateSideMeta();
  toast(configured ? '配置完成，开始学习吧' : '先逛逛也行，随时能在设置里配置 API', configured ? 'success' : 'info');
  navigate('home');
};

/* 首页 */
ACTIONS['quick-quiz'] = function (el) {
  const subject = el.dataset.subject || '数学';
  if (state.quiz && state.quiz.job) abortAI(state.quiz.job.requestId);
  state.quiz = null;
  ensureQuizState(subject);
  navigate('quiz');
};

ACTIONS['save-daily'] = async function () {
  const input = document.getElementById('daily-input');
  const text = input ? input.value.trim() : String(state.dailyDraft || '').trim();
  if (!text) {
    toast('写两句再记下来吧，一两句话就够', 'info');
    return;
  }
  const today = todayStr();
  state.dailyLogs[today] = { text: text, minutes: null, createdAt: Date.now() };
  const ok = await storeSet('dailyLogs', state.dailyLogs);
  if (!ok) return;
  state.dailyDraft = '';
  state.dailyEditing = false;
  // 每日登记联动进度：文本里提到的科目，自动整理成标准章节并补进度
  const hitSubjects = SUBJECTS.filter(function (s) { return text.indexOf(s) >= 0; });
  hitSubjects.slice(0, 2).forEach(function (s) {
    scheduleUnitNormalize(s, text, { fromDaily: true });
  });
  toast('记下了，今天辛苦了', 'success');
  render();
};

ACTIONS['edit-daily'] = function () {
  const log = state.dailyLogs[todayStr()];
  if (log) state.dailyDraft = log.text || '';
  state.dailyEditing = true;
  render();
};

/* 练习 */
ACTIONS['quiz-subject'] = function (el) {
  const q = state.quiz;
  if (!q) return;
  q.subject = el.dataset.subject;
  $$('.subject-chip').forEach(function (chip) {
    chip.classList.toggle('is-active', chip.dataset.subject === q.subject);
  });
  const summary = document.querySelector('.quiz-summary-row strong');
  if (summary) summary.textContent = q.subject;
};

ACTIONS['quiz-minutes'] = function (el) {
  const q = state.quiz;
  if (!q) return;
  q.minutes = Number(el.dataset.value) || 20;
  q.minutesCustom = '';
  const customInput = document.querySelector('[data-bind="quiz.minutesCustom"]');
  if (customInput) customInput.value = '';
  $$('[data-act="quiz-minutes"]').forEach(function (pill) {
    pill.classList.toggle('is-active', Number(pill.dataset.value) === q.minutes);
  });
  const hint = el.closest('.quiz-block').querySelector('.quiz-block-hint');
  if (hint) hint.textContent = '按自己的节奏来';
  const summaryRows = $$('.quiz-summary-row strong');
  if (summaryRows[1]) summaryRows[1].textContent = q.minutes + ' 分钟';
};

ACTIONS['quiz-willing'] = function (el) {
  const q = state.quiz;
  if (!q) return;
  q.willing = el.dataset.value;
  q.willingCustom = '';
  const customInput = document.querySelector('[data-bind="quiz.willingCustom"]');
  if (customInput) customInput.value = '';
  $$('[data-act="quiz-willing"]').forEach(function (pill) {
    pill.classList.toggle('is-active', pill.dataset.value === q.willing);
  });
  const hint = el.closest('.quiz-block').querySelector('.quiz-block-hint');
  if (hint) hint.textContent = 'AI 会据此调整难度和语气';
  const summaryRows = $$('.quiz-summary-row strong');
  if (summaryRows[2]) summaryRows[2].textContent = q.willing;
};

ACTIONS['quiz-toggle-textbooks'] = function (el) {
  const q = state.quiz;
  if (!q) return;
  q.useTextbooks = !q.useTextbooks;
  el.classList.toggle('is-on', q.useTextbooks);
  el.setAttribute('aria-checked', q.useTextbooks ? 'true' : 'false');
  const summaryRows = $$('.quiz-summary-row strong');
  if (summaryRows[4]) summaryRows[4].textContent = q.useTextbooks ? '已开启' : '未开启';
};

ACTIONS['quiz-pick-materials'] = function () {
  const q = state.quiz;
  if (!q) return;
  openMaterialPicker(q.materialIds, function (ids) {
    q.materialIds = ids;
    q.selectedMaterialNames = state.materials.filter(function (m) { return ids.indexOf(m.id) >= 0; })
      .map(function (m) { return m.name; }).slice(0, 3);
    render();
  });
};

ACTIONS['quiz-start'] = function () {
  startQuizGeneration();
};

ACTIONS['quiz-cancel'] = function () {
  const q = state.quiz;
  if (!q) return;
  if (q.job) abortAI(q.job.requestId);
  q.job = null;
  if (q.step === 'submitting') {
    q.step = 'answering';
    q.submitting = false;
  } else {
    q.step = 'setup';
  }
  render();
  toast('已取消', 'info');
};

ACTIONS['quiz-retry'] = function () {
  startQuizGeneration();
};

ACTIONS['quiz-back-setup'] = function () {
  const q = state.quiz;
  if (!q) return;
  q.step = 'setup';
  q.error = '';
  render();
};

ACTIONS['quiz-start-exam'] = function () {
  startExamFlow();
};

ACTIONS['quiz-start-practice'] = function () {
  const q = state.quiz;
  if (!q || q.step !== 'ready') return;
  q.examMode = false;
  q.examForced = false;
  q.step = 'answering';
  q.index = 0;
  q.answeringStartedAt = Date.now();
  render();
};

ACTIONS['quiz-exit'] = async function () {
  const ok = await confirmDialog({
    title: '放弃本次练习？',
    message: '已经作答的内容不会保存。',
    confirmText: '放弃',
    danger: true
  });
  if (!ok) return;
  resetQuizFlow();
  render();
};

ACTIONS['quiz-answer'] = function (el) {
  answerCurrentQuestion(el.dataset.value);
};

ACTIONS['quiz-prev'] = function () {
  quizNav(-1);
};

ACTIONS['quiz-next'] = function () {
  quizNav(1);
};

ACTIONS['quiz-goto'] = function (el) {
  const q = state.quiz;
  if (!q) return;
  q.index = clamp(Number(el.dataset.index) || 0, 0, q.questions.length - 1);
  render();
  const view = document.getElementById('view');
  if (view) view.scrollTop = 0;
};

ACTIONS['quiz-submit'] = function () {
  submitQuiz();
};

/* 报告 */
ACTIONS['open-report'] = function (el) {
  state.reportId = el.dataset.id;
  if (state.route !== 'report') {
    navigate('report');
  } else {
    render();
  }
};

ACTIONS['export-report'] = function () {
  copyReportText();
};

/* 学习进度 */
/* ---------- 考试复习计划：生成、反馈改写、确认加入安排 ---------- */
function findExam(id) {
  return (state.exams || []).find(function (e) { return e && e.id === id; });
}

function saveExams() {
  return storeSet('exams', state.exams);
}

function examPlanLocal(exam) {
  const subjects = (exam.subjects && exam.subjects.length ? exam.subjects : ['数学']).slice(0, 4);
  const start = new Date();
  const items = subjects.map(function (sub, i) {
    const d = new Date(start.getTime() + (i % 3) * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return {
      id: 'ep' + (i + 1),
      subject: sub,
      title: '复习 ' + sub + ' 当前进度内容（重做例题 + 3 道同类题）',
      date: y + '-' + m + '-' + day,
      minutes: 25,
      reason: 'AI 计划生成失败，先给基础安排，可以重新生成',
      isNewCourse: false
    };
  });
  return { summary: '本地基础计划：每天一科，重点放在当前进度内容上。', items: items };
}

function applyExamPlan(exam, plan, revised) {
  exam.plan = plan || { summary: '', items: [] };
  exam.agreedIds = (exam.plan.items || []).map(function (it) { return it.id; });
  exam.status = 'draft';
  exam.revised = !!revised;
  exam.revising = false;
  exam.partial = false;
  saveExams();
  render();
}

async function generateExamPlan(exam) {
  exam.status = 'generating';
  exam.revising = false;
  render();
  const finish = function (plan, revised) {
    if (!findExam(exam.id)) return;
    applyExamPlan(exam, plan, revised);
    toast(revised ? '计划已按你的意见改写，确认后加入安排' : '复习计划生成好了，看看是否同意', 'success', 4500);
  };
  if (!isConfigured()) {
    finish(examPlanLocal(exam), false);
    return;
  }
  let settled = false;
  const settle = function (plan, revised) {
    if (settled) return;
    settled = true;
    finish(plan, revised);
  };
  const req = {
    mode: 'examPlan',
    messages: [{ role: 'user', content: '请为考试「' + exam.name + '」制定复习计划。' }],
    context: {
      exam: { name: exam.name, date: exam.date, subjects: exam.subjects, note: exam.note },
      progress: state.progress,
      dailyMinutes: Number(state.settings.learning.dailyMinutes) || 40,
      today: todayStr()
    },
    options: { deepThinking: false }
  };
  try {
    const job = await startAI(req, {
      onDone: function (evt) {
        const json = evt.json || {};
        if (json && Array.isArray(json.items) && json.items.length) settle(json, false);
        else settle(examPlanLocal(exam), false);
      },
      onError: function () {
        settle(examPlanLocal(exam), false);
      }
    });
    if (job) exam.job = job;
  } catch (err) {
    settle(examPlanLocal(exam), false);
  }
}

async function reviseExamPlan(exam) {
  const feedbackEl = document.getElementById('exam-feedback');
  const note = (feedbackEl ? feedbackEl.value : exam.feedback || '').trim();
  exam.feedback = note;
  exam.partial = true;
  const allItems = (exam.plan && exam.plan.items) || [];
  const agreedIds = exam.agreedIds || allItems.map(function (it) { return it.id; });
  const label = function (it) { return (it.date || '') + ' ' + it.subject + '：' + it.title; };
  const agreed = allItems.filter(function (it) { return agreedIds.indexOf(it.id) >= 0; }).map(label);
  const rejected = allItems.filter(function (it) { return agreedIds.indexOf(it.id) < 0; }).map(label);
  if (!note && !rejected.length) {
    toast('先勾掉不同意的条目，或者写一句修改意见', 'info');
    return;
  }
  exam.revising = true;
  render();
  const req = {
    mode: 'examRevise',
    messages: [{ role: 'user', content: '请按我的意见修改复习计划。' }],
    context: {
      exam: { name: exam.name, date: exam.date, subjects: exam.subjects },
      previous: exam.plan,
      feedback: { agreed: agreed, rejected: rejected, note: note }
    },
    options: { deepThinking: false }
  };
  let settled = false;
  const finish = function (plan) {
    if (settled || !findExam(exam.id)) return;
    settled = true;
    applyExamPlan(exam, plan, true);
    toast('已按你的意见改好，确认后加入安排', 'success', 4500);
  };
  try {
    const job = await startAI(req, {
      onDone: function (evt) {
        const json = evt.json || {};
        if (json && Array.isArray(json.items) && json.items.length) finish(json);
        else {
          exam.revising = false;
          render();
          toast('AI 没有给出可用计划，请重试', 'error');
        }
      },
      onError: function () {
        exam.revising = false;
        render();
        toast('改写失败，请重试', 'error');
      }
    });
    if (job) exam.job = job;
  } catch (err) {
    exam.revising = false;
    render();
  }
}

function addExamItemsToPlans(exam, itemIds) {
  const all = (exam.plan && exam.plan.items) || [];
  const ids = Array.isArray(itemIds) && itemIds.length ? itemIds : all.map(function (it) { return it.id; });
  const chosen = all.filter(function (it) { return ids.indexOf(it.id) >= 0; });
  const existing = {};
  (state.plans || []).forEach(function (p) {
    if (p && p.examId === exam.id) existing[p.title] = true;
  });
  let added = 0;
  chosen.forEach(function (it) {
    const title = (it.isNewCourse ? '【新课程】' : '') + it.title;
    if (existing[title]) return;
    state.plans.push({
      id: uid('plan'),
      title: title,
      subject: it.subject,
      weekday: 0,
      date: it.date || '',
      time: '20:00',
      minutes: it.minutes || 25,
      note: '考试复习 · ' + exam.name + (it.isNewCourse ? ' · 未学课程' : ''),
      type: 'exam',
      examId: exam.id,
      createdAt: Date.now()
    });
    added += 1;
  });
  state.plans.sort(function (a, b) { return String(a.time || '').localeCompare(String(b.time || '')); });
  exam.status = 'confirmed';
  exam.confirmedAt = Date.now();
  exam.partial = false;
  exam.revised = false;
  exam.agreedIds = chosen.map(function (it) { return it.id; });
  storeSet('plans', state.plans);
  saveExams();
  render();
  toast('已加入每日安排 ' + added + ' 项', 'success', 4200);
}

ACTIONS['exam-toggle-subject'] = function (el) {
  const sub = el.dataset.subject;
  const form = state.examForm;
  if (!form) return;
  const i = form.subjects.indexOf(sub);
  if (i >= 0) form.subjects.splice(i, 1);
  else form.subjects.push(sub);
  render();
};

ACTIONS['exam-create'] = async function () {
  const form = state.examForm || { name: '', date: '', subjects: [], note: '' };
  const nameEl = $('#exam-name');
  const dateEl = $('#exam-date');
  const noteEl = $('#exam-note');
  if (nameEl) form.name = nameEl.value;
  if (dateEl) form.date = dateEl.value;
  if (noteEl) form.note = noteEl.value;
  const name = String(form.name || '').trim();
  const date = String(form.date || '').trim();
  const note = String(form.note || '').trim();
  const subjects = (form.subjects || []).slice();
  if (!name) {
    toast('先给考试起个名字', 'info');
    return;
  }
  if (!subjects.length) {
    toast('至少选一科吧', 'info');
    return;
  }
  const exam = {
    id: uid('exam'),
    name: name,
    date: date,
    subjects: subjects,
    note: note,
    createdAt: Date.now(),
    status: 'generating',
    plan: null,
    agreedIds: [],
    feedback: '',
    partial: false,
    revised: false,
    revising: false
  };
  state.exams.unshift(exam);
  state.examForm = { name: '', date: '', subjects: [], note: '' };
  await saveExams();
  render();
  generateExamPlan(exam);
};

ACTIONS['exam-agree-all'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  addExamItemsToPlans(exam, null);
};

ACTIONS['exam-partial'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  exam.partial = true;
  exam.agreedIds = ((exam.plan && exam.plan.items) || []).map(function (it) { return it.id; });
  render();
};

ACTIONS['exam-cancel-partial'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  exam.partial = false;
  exam.revising = false;
  render();
};

ACTIONS['exam-toggle-item'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  const id = el.dataset.item;
  exam.agreedIds = exam.agreedIds || [];
  const i = exam.agreedIds.indexOf(id);
  if (el.checked && i < 0) exam.agreedIds.push(id);
  else if (!el.checked && i >= 0) exam.agreedIds.splice(i, 1);
};

ACTIONS['exam-apply-feedback'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  reviseExamPlan(exam);
};

ACTIONS['exam-confirm'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  addExamItemsToPlans(exam, exam.agreedIds);
};

ACTIONS['exam-regenerate'] = function (el) {
  const exam = findExam(el.dataset.exam);
  if (!exam) return;
  generateExamPlan(exam);
};

ACTIONS['exam-delete'] = async function (el) {
  state.exams = (state.exams || []).filter(function (e) { return e.id !== el.dataset.exam; });
  await saveExams();
  render();
  toast('已删除考试计划', 'info');
};

ACTIONS['add-plan'] = async function () {
  const weekday = Number(($('#plan-weekday') || {}).value || 0);
  const time = (($('#plan-time') || {}).value || '19:30').trim();
  const subject = (($('#plan-subject') || {}).value || '数学');
  const title = (($('#plan-title') || {}).value || '').trim();
  const minutes = Number(($('#plan-minutes') || {}).value || 30);
  if (!title && !subject) {
    toast('先写一下安排内容吧', 'info');
    return;
  }
  state.plans.push({
    id: uid('plan'),
    title: title || (subject + ' 学习'),
    subject: subject,
    weekday: weekday,
    time: time,
    minutes: isFinite(minutes) ? clamp(minutes, 5, 240) : 30,
    note: '',
    createdAt: Date.now()
  });
  state.plans.sort(function (a, b) { return String(a.time || '').localeCompare(String(b.time || '')); });
  if (await storeSet('plans', state.plans)) {
    toast('已添加学习安排', 'success');
    render();
  }
};

ACTIONS['delete-plan'] = async function (el) {
  state.plans = state.plans.filter(function (p) { return p.id !== el.dataset.id; });
  if (await storeSet('plans', state.plans)) render();
};

ACTIONS['add-leave'] = async function () {
  const date = (($('#leave-date') || {}).value || '').trim();
  const reason = (($('#leave-reason') || {}).value || '').trim();
  if (!date) {
    toast('先选一个请假日期', 'info');
    return;
  }
  state.leaves.push({
    id: uid('leave'),
    date: date,
    reason: reason || '请假',
    subject: '全部科目',
    createdAt: Date.now()
  });
  if (await storeSet('leaves', state.leaves)) {
    toast('已登记请假：' + date, 'success');
    render();
  }
};

ACTIONS['delete-leave'] = async function (el) {
  state.leaves = state.leaves.filter(function (l) { return l.id !== el.dataset.id; });
  if (await storeSet('leaves', state.leaves)) render();
};

ACTIONS['add-makeup'] = async function () {
  const subject = (($('#makeup-subject') || {}).value || '数学');
  const content = (($('#makeup-content') || {}).value || '').trim();
  if (!content) {
    toast('说说缺了哪几节课的内容吧', 'info');
    return;
  }
  const item = {
    id: uid('mk'),
    subject: subject,
    content: content,
    planText: '',
    status: 'pending',
    createdAt: Date.now()
  };
  state.makeups.unshift(item);
  await storeSet('makeups', state.makeups);
  render();
  generateMakeupPlan(item.id);
};

ACTIONS['delete-makeup'] = async function (el) {
  state.makeups = state.makeups.filter(function (m) { return m.id !== el.dataset.id; });
  if (await storeSet('makeups', state.makeups)) render();
};

ACTIONS['toggle-daily-ask'] = function (el) {
  if (!state.drafts.settings) return;
  const learning = state.drafts.settings.learning;
  learning.dailyAsk = learning.dailyAsk === false;
  el.classList.toggle('is-on', learning.dailyAsk);
  el.setAttribute('aria-checked', learning.dailyAsk ? 'true' : 'false');
  scheduleSettingsSave();
};

/* 资料库 */
ACTIONS['lib-tab'] = function (el) {
  state.libraryTab = el.dataset.tab === 'materials' ? 'materials' : 'textbooks';
  render();
};

ACTIONS['read-textbook'] = function (el) {
  openTextbookReader(el.dataset.id);
};

ACTIONS['preview-material'] = function (el) {
  previewMaterial(el.dataset.id);
};

ACTIONS['material-toc'] = async function (el) {
  const id = el.dataset.id;
  try {
    const toc = await api.materials.toc(id);
    if (!toc || !toc.length) {
      toast('这份材料没有可用的章节（可能是图片材料）', 'info');
      return;
    }
    const mat = (state.materials || []).find(function (m) { return m.id === id; });
    openModal({
      title: '资料目录（自动生成）',
      size: 'wide',
      body:
        '<div class="banner banner-info mb-16">' + icon('list') +
          '<div><div class="banner-title">' + esc(mat ? mat.name : '资料') + ' · 共 ' + toc.length + ' 个章节</div>' +
          '<div class="banner-desc">AI 会先看这份目录，再按需调取相关章节，不会一次性读完整篇文档。</div></div>' +
        '</div>' +
        '<div class="toc-list">' + renderTocList(toc) + '</div>'
    });
  } catch (err) {
    toast(err && err.message ? err.message : '读取目录失败', 'error');
  }
};

ACTIONS['textbook-toc'] = async function (el) {
  const id = el.dataset.id;
  try {
    const toc = await api.textbooks.toc(id);
    if (!toc || !toc.length) {
      toast('这份教材没有可用的章节', 'info');
      return;
    }
    const book = (state.textbooks || []).find(function (b) { return b.id === id; });
    openModal({
      title: '教材目录（自动生成）',
      size: 'wide',
      body:
        '<div class="banner banner-info mb-16">' + icon('bookOpen') +
          '<div><div class="banner-title">' + esc(book ? book.title : '教材') + ' · 共 ' + toc.length + ' 个章节</div>' +
          '<div class="banner-desc">AI 会先看目录，再按需调取章节（例如从 4.4 跳回 4.3 查看定义）。</div></div>' +
        '</div>' +
        '<div class="toc-list">' + renderTocList(toc) + '</div>'
    });
  } catch (err) {
    toast(err && err.message ? err.message : '读取目录失败', 'error');
  }
};

ACTIONS['delete-material'] = async function (el) {
  const id = el.dataset.id;
  const material = state.materials.find(function (m) { return m.id === id; });
  const ok = await confirmDialog({
    title: '删除这份材料？',
    message: '「' + (material ? material.name : '这份材料') + '」会从资料库和磁盘上一起删除，删除后无法恢复。',
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  try {
    await api.materials.remove(id);
    await refreshMaterials();
    toast('已删除', 'success');
    render();
  } catch (err) {
    toast(err && err.message ? err.message : '删除失败', 'error');
  }
};

ACTIONS['reload-textbooks'] = async function () {
  await refreshTextbooks();
  render();
  toast(state.textbooks.length ? '教材列表已刷新' : '还是没找到教材，可能是资源文件缺失', state.textbooks.length ? 'success' : 'warning');
};

ACTIONS['upload-material'] = function () {
  openUploadDialog({
    onDone: function () {
      refreshMaterials().then(function () {
        render();
      });
    }
  });
};

ACTIONS['upload-pick'] = function () {
  pickAndAddMaterial();
};

/* 材料选择器 */
ACTIONS['pick-material'] = function (el) {
  const picker = state.materialPicker;
  if (!picker) return;
  const id = el.dataset.id;
  if (picker.chosen.has(id)) picker.chosen.delete(id);
  else picker.chosen.add(id);
  el.classList.toggle('is-active', picker.chosen.has(id));
  const count = document.getElementById('pick-count');
  if (count) count.textContent = picker.chosen.size;
};

ACTIONS['confirm-material-pick'] = function () {
  const picker = state.materialPicker;
  if (!picker) {
    closeModal();
    return;
  }
  const ids = Array.from(picker.chosen);
  const cb = picker.onConfirm;
  state.materialPicker = null;
  closeModal();
  if (cb) cb(ids);
};

ACTIONS['upload-from-picker'] = function () {
  openUploadDialog({
    onDone: function () {
      refreshMaterials().then(function () {
        render();
        if (state.route === 'library') render();
      });
    }
  });
};

/* 设置 */
ACTIONS['settings-tab'] = function (el) {
  state.settingsTab = el.dataset.tab || 'api';
  render();
};

ACTIONS['settings-save'] = async function () {
  try {
    await persistDraftSettings(true);
    await persistDraftProfile(true);
    await persistDraftScores(true);
    toast('设置已保存', 'success');
    const hint = document.getElementById('settings-save-hint');
    if (hint) hint.textContent = '已保存 · ' + nowTimeStr();
    render();
  } catch (err) {
    /* 各 persist 已 toast */
  }
};

ACTIONS['toggle-secret'] = function (el) {
  const group = el.closest('.input-group');
  const input = group ? group.querySelector('input') : null;
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  el.innerHTML = icon(show ? 'eye-off' : 'eye');
};

ACTIONS['toggle-skip'] = function (el) {
  const subject = el.dataset.subject;
  const scope = el.dataset.scope || 'settings';
  const target = state.drafts.scores;
  if (!target || !target.subjects[subject]) return;
  const entry = target.subjects[subject];
  entry.skipped = !entry.skipped;
  if (entry.skipped) entry.score = null;
  const container = document.getElementById('score-rows');
  if (container) container.innerHTML = renderScoreRows(target, scope);
  if (scope === 'welcome') {
    const hint = document.querySelector('.welcome-body .field-hint');
    if (hint) hint.textContent = '没有考的科目点「跳过」，不要填 0';
  }
};

ACTIONS['toggle-setting'] = function (el) {
  const key = el.dataset.key;
  if (!state.drafts.settings) return;
  const path = key.split('.');
  const current = getPath(state.drafts.settings, path);
  setPath(state.drafts.settings, path, !current);
  el.classList.toggle('is-on', !current);
  el.setAttribute('aria-checked', !current ? 'true' : 'false');
  if (key === 'ai.deepThinking') state.chat.deepThinking = !!getPath(state.drafts.settings, path);
  scheduleSettingsSave();
};

/* AI 助手 */
ACTIONS['chat-send'] = function () {
  // 鼠标点发送时先把输入框最新内容同步进 state，避免失焦事件顺序导致草稿丢失或残留
  const inputEl = document.getElementById('chat-input');
  if (inputEl && typeof inputEl.value === 'string') {
    state.chat.draft = inputEl.value;
  }
  sendChat();
};

ACTIONS['chat-stop'] = function () {
  stopChat();
};

ACTIONS['chat-clear'] = async function () {
  const ok = await confirmDialog({
    title: '清空对话？',
    message: '当前对话记录会被清除，不会影响报告和资料。',
    confirmText: '清空',
    danger: true
  });
  if (!ok) return;
  if (state.chat.requestId) abortAI(state.chat.requestId);
  state.chat.messages = [];
  state.chat.streaming = false;
  state.chat.requestId = null;
  state.chat.images = [];
  saveChatHistory();
  render();
};

ACTIONS['chat-suggest'] = function (el) {
  state.chat.draft = el.dataset.text || '';
  sendChat();
};

ACTIONS['chat-regenerate'] = function () {
  const chat = state.chat;
  if (chat.streaming) return;
  while (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'assistant') {
    chat.messages.pop();
  }
  let lastUser = null;
  for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
    if (chat.messages[i].role === 'user') {
      lastUser = chat.messages[i];
      break;
    }
  }
  if (!lastUser) {
    toast('没有可以重答的问题', 'info');
    return;
  }
  chat.messages = chat.messages.filter(function (m) { return m !== lastUser; });
  chat.draft = lastUser.content === '（图片）' ? '' : lastUser.content;
  chat.images = (lastUser.images || []).map(function (dataUrl, i) {
    return { name: '图片' + (i + 1), dataUrl: dataUrl, size: 0 };
  });
  sendChat();
};

ACTIONS['chat-pick-images'] = function () {
  pickChatImages();
};

ACTIONS['chat-remove-image'] = function (el) {
  const idx = Number(el.dataset.index);
  state.chat.images.splice(idx, 1);
  render();
};

ACTIONS['chat-clear-materials'] = function () {
  state.chat.materialIds = [];
  render();
};

ACTIONS['chat-pick-materials'] = function () {
  openMaterialPicker(state.chat.materialIds, function (ids) {
    state.chat.materialIds = ids;
    render();
  });
};

ACTIONS['chat-toggle-deep'] = function () {
  state.chat.deepThinking = !state.chat.deepThinking;
  render();
  toast(state.chat.deepThinking ? '深度思考已开启，回答会更细但更慢' : '深度思考已关闭', 'info');
};

ACTIONS['copy-msg'] = async function (el) {
  const id = el.dataset.id;
  const msg = state.chat.messages.find(function (m) { return m.id === id; });
  if (!msg) return;
  try {
    await navigator.clipboard.writeText(msg.content || '');
    toast('已复制', 'success');
  } catch (err) {
    toast('复制失败', 'error');
  }
};

ACTIONS['toggle-reasoning'] = function (el) {
  el.classList.toggle('is-open');
  const box = el.closest('.reasoning-box');
  const body = box ? box.querySelector('.reasoning-body') : null;
  if (body) body.classList.toggle('hidden');
};

/* ---- 材料上传 ---- */
async function pickAndAddMaterial() {
  const pick = state.pendingUpload;
  if (!pick) return;
  const vals = pick.getValues ? pick.getValues() : { kind: pick.kind, subject: pick.subject };
  let file = null;
  try {
    file = await api.dialog.pickMaterial();
  } catch (err) {
    toast(err && err.message ? err.message : '打开文件选择器失败', 'error');
    return;
  }
  if (!file) return;
  const ext = String(file.ext || (file.name || '').split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    toast('PDF 暂不支持解析，请截图后再上传', 'warning', 5200);
    return;
  }
  const supported = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'txt', 'md', 'csv', 'json', 'pptx', 'docx', 'xlsx'];
  if (ext && supported.indexOf(ext) === -1) {
    toast('暂不支持 .' + ext + ' 格式：请上传图片、文本，或 .pptx / .docx / .xlsx（会自动转 Markdown）', 'warning', 5600);
    return;
  }
  try {
    const mat = await api.materials.add({
      name: file.name,
      kind: vals.kind || file.kind || 'other',
      subject: vals.subject || '综合',
      dataUrl: file.dataUrl,
      text: file.text,
      ext: ext
    });
    if (file.converted) {
      toast('已把 ' + ext.toUpperCase() + ' 自动转成 Markdown（' + String(file.text || '').length + ' 字）并加入资料库', 'success', 5200);
    } else {
      toast('已上传：' + (mat && mat.name ? mat.name : file.name), 'success');
    }
    await refreshMaterials();
    closeModal();
    const cb = pick.onDone;
    state.pendingUpload = null;
    if (cb) cb(mat);
  } catch (err) {
    toast(err && err.message ? err.message : '上传失败', 'error');
  }
}

/* ---- 绑定 ---- */
function handleBind(el, evt) {
  const bind = el.dataset.bind;
  if (!bind) return;
  const parts = bind.split('.');
  const root = parts[0];
  const path = parts.slice(1);
  const raw = el.type === 'checkbox' ? el.checked : el.value;
  let value = raw;
  if (el.dataset.type === 'number') value = el.value === '' ? null : Number(el.value);

  if (root === 'welcome') {
    const section = path[0];
    const rest = path.slice(1);
    if (section === 'api' && state.drafts.settings) setPath(state.drafts.settings, ['api'].concat(rest), value);
    else if (section === 'profile' && state.drafts.profile) setPath(state.drafts.profile, rest, value);
    else if (section === 'scores') applyScoreBind('welcome', rest, el);
    return;
  }
  if (root === 'settings') {
    if (path[0] === 'scores') {
      applyScoreBind('settings', path.slice(1), el);
      return;
    }
    if (path[0] === 'profile') {
      if (state.drafts.profile) setPath(state.drafts.profile, path.slice(1), value);
      return;
    }
    if (state.drafts.settings) setPath(state.drafts.settings, path, value);
    if (path[0] === 'learning' || path[0] === 'ui' || path[0] === 'ai') scheduleSettingsSave();
    return;
  }
  if (root === 'profile') {
    if (state.drafts.profile) setPath(state.drafts.profile, path, value);
    return;
  }
  if (root === 'quiz') {
    const q = state.quiz;
    if (!q) return;
    if (path[0] === 'answer') {
      answerCurrentQuestion(value == null ? '' : String(value));
      return;
    }
    if (path[0] === 'minutesCustom') {
      q.minutesCustom = el.value;
      q.minutes = Number(el.value) > 0 ? Number(el.value) : q.minutes;
      const summaryRows = $$('.quiz-summary-row strong');
      if (summaryRows[1]) summaryRows[1].textContent = quizMinutes() + ' 分钟';
      $$('[data-act="quiz-minutes"]').forEach(function (pill) { pill.classList.remove('is-active'); });
      const hint = el.closest('.quiz-block').querySelector('.quiz-block-hint');
      if (hint) hint.textContent = '已用自定义时长：' + quizMinutes() + ' 分钟';
      return;
    }
    if (path[0] === 'willingCustom') {
      q.willingCustom = el.value;
      $$('[data-act="quiz-willing"]').forEach(function (pill) { pill.classList.remove('is-active'); });
      const hint = el.closest('.quiz-block').querySelector('.quiz-block-hint');
      if (hint) hint.textContent = '已用自定义意愿：' + (el.value.trim() || q.willing);
      const summaryRows = $$('.quiz-summary-row strong');
      if (summaryRows[2]) summaryRows[2].textContent = quizWilling();
      return;
    }
    setPath(q, path, value);
    if (path[0] === 'count') {
      const summaryRows = $$('.quiz-summary-row strong');
      if (summaryRows[3]) summaryRows[3].textContent = quizCount() + ' 道';
    }
    return;
  }
  if (root === 'chat') {
    if (path[0] === 'draft') {
      // 输入框重绘后旧元素可能延迟触发 change，忽略这类事件，避免发送后草稿又"复活"
      const current = document.getElementById('chat-input');
      if (current && el !== current) return;
      state.chat.draft = String(value || '');
      const btn = document.querySelector('.composer-send');
      if (btn && btn.dataset.act === 'chat-send') {
        const has = String(state.chat.draft).trim() || state.chat.images.length || state.chat.materialIds.length;
        btn.disabled = !has;
      }
    }
    return;
  }
  if (root === 'examForm') {
    if (state.examForm) setPath(state.examForm, path, value);
    return;
  }
  if (root === 'progress') {    const subject = el.dataset.subject;
    if (!subject) return;
    if (!state.progress[subject]) state.progress[subject] = { unit: '', percent: 0, note: '', updatedAt: Date.now() };
    const entry = state.progress[subject];
    if (path[0] === 'percent') {
      const n = clamp(Math.round(Number(value) || 0), 0, 100);
      entry.percent = n;
      entry.updatedAt = Date.now();
      $$('[data-bind="progress.percent"][data-subject="' + subject + '"]').forEach(function (inp) {
        if (inp !== el) inp.value = n;
      });
      const label = document.querySelector('[data-percent-label="' + subject + '"]');
      if (label) label.textContent = n + '%';
    } else if (path[0] === 'unit') {
      entry.unit = String(value || '');
      entry.updatedAt = Date.now();
      // 失焦（change）后自动标准化：口语 → 教材标准目录 + 估算百分比
      if (evt && evt.type === 'change' && entry.unit.trim()) {
        scheduleUnitNormalize(subject, entry.unit);
      }
    } else if (path[0] === 'note') {
      entry.note = String(value || '');
      entry.updatedAt = Date.now();
    }
    scheduleProgressSave();
  }
}

function onDocumentClick(evt) {
  const target = evt.target.closest ? evt.target.closest('[data-act]') : null;
  if (!target || target.disabled) return;
  const act = target.dataset.act;
  const fn = ACTIONS[act];
  if (!fn) return;
  // checkbox 需要保留浏览器默认的勾选行为
  const isCheckbox = target.tagName === 'INPUT' && target.type === 'checkbox';
  if (!isCheckbox) evt.preventDefault();
  try {
    const result = fn(target, evt);
    if (result && typeof result.catch === 'function') {
      result.catch(function (err) {
        console.error('[action ' + act + ']', err);
        toast(err && err.message ? err.message : '操作失败', 'error');
      });
    }
  } catch (err) {
    console.error('[action ' + act + ']', err);
    toast(err && err.message ? err.message : '操作失败', 'error');
  }
}

function onDocumentInput(evt) {
  const el = evt.target;
  if (!el || !el.closest) return;
  const bound = el.closest('[data-bind]');
  if (!bound) return;
  try {
    handleBind(bound, evt);
  } catch (err) {
    console.error('[bind]', err);
  }
}

function onDocumentKeydown(evt) {
  if (evt.key === 'Escape') {
    const modalRoot = document.getElementById('modal-root');
    if (modalRoot && !modalRoot.hidden) {
      evt.preventDefault();
      closeModal();
      state.materialPicker = null;
    }
    return;
  }
  if (evt.key === 'Enter') {
    const active = document.activeElement;
    if (active && active.id === 'chat-input') {
      // Enter 发送；Shift+Enter 换行（中文输入法组字时由 composition 处理，不在这里拦截）
      if (evt.shiftKey || evt.isComposing) return;
      evt.preventDefault();
      sendChat();
      return;
    }
    if ((evt.ctrlKey || evt.metaKey) && state.route === 'quiz' && state.quiz && state.quiz.step === 'answering') {
      evt.preventDefault();
      if (state.quiz.index < state.quiz.questions.length - 1) quizNav(1);
      else submitQuiz();
    }
  }
}

function bindGlobalEvents() {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('change', onDocumentInput);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('hashchange', function () {
    render({ resetScroll: true });
  });
  window.addEventListener('beforeunload', function () {
    state.aiJobs.forEach(function (job) {
      if (job.requestId) {
        try { api.ai.abort(job.requestId); } catch (err) { /* ignore */ }
      }
    });
  });
}

/* 补课安排生成 */
async function generateMakeupPlan(makeupId) {
  const item = state.makeups.find(function (m) { return m.id === makeupId; });
  if (!item) return;
  const grade = state.profile.grade || '八年级';

  if (!isConfigured()) {
    item.planText = buildLocalMakeupPlan(item);
    item.status = 'done';
    await storeSet('makeups', state.makeups);
    render();
    toast('还没有配置 API，先用本地建议顶上', 'info');
    return;
  }

  item.status = 'generating';
  item.planText = '';
  render();

  const req = {
    mode: 'plan',
    messages: [{
      role: 'user',
      content:
        '我是' + grade + '学生，' + item.subject + '缺课了。\n' +
        '缺的内容：' + item.content + '\n' +
        '请帮我安排补课：分几次补、每次多长时间、重点看哪些知识点、用什么方法检验已经掌握了。' +
        '请给出具体、可执行的安排，不要说套话。'
    }],
    context: {
      subject: item.subject,
      grade: grade,
      useTextbooks: true,
      plan: {
        scene: '请假 / 缺课后的补课',
        subject: item.subject,
        missing: item.content,
        available: state.settings && state.settings.learning ? String(state.settings.learning.dailyMinutes || 40) + ' 分钟/天' : '',
        notes: item.note || ''
      }
    },
    options: { deepThinking: false, webSearch: true }
  };

  const job = await startAI(req, {
    onDelta: function (text) {
      const box = document.querySelector('[data-makeup-result="' + item.id + '"]');
      if (box) {
        box.textContent = text;
        box.scrollTop = box.scrollHeight;
      }
    },
    onDone: async function (evt) {
      item.planText = evt.text || '';
      item.status = 'done';
      await storeSet('makeups', state.makeups);
      render();
      toast('补课安排生成好了', 'success');
    },
    onError: function (evt) {
      item.planText = '生成失败：' + (evt.message || '未知错误') + '\n\n' + buildLocalMakeupPlan(item);
      item.status = 'error';
      render();
      toast('AI 生成失败，已换成本地建议', 'warning');
    }
  });
  if (job) item.job = job;
}

function buildLocalMakeupPlan(item) {
  return [
    '先用这份本地建议顶上（配置 API 后 AI 会给更细的安排）：',
    '',
    '1. 先补「' + item.content + '」对应教材章节，通读一遍，把不懂的地方先标出来。',
    '2. 找这几次课的笔记和作业，把课堂练习先做一遍，错题标出来。',
    '3. 分 2–3 次补，每次 30–40 分钟：先看课本 → 再做例题 → 最后合上书自己复述一遍。',
    '4. 检验方法：能不看书画出这一节的知识结构图，并且把课后练习做对 80% 以上。',
    '5. 补完在「练习」里选 ' + item.subject + ' 做一组题，看报告里的薄弱点还有没有这条。'
  ].join('\n');
}

/* ============================================================
 * 16. 启动
 * ============================================================ */
async function boot() {
  const sub = document.getElementById('boot-sub');
  const ready = await waitForApi(12000);
  if (!ready) {
    if (sub) sub.textContent = '接口未就绪，请重启应用后再试';
    return;
  }
  api = window.api;
  bindGlobalEvents();
  try {
    await loadAll();
  } catch (err) {
    console.error('[boot loadAll]', err);
    if (sub) sub.textContent = '数据加载失败，请重启应用';
    toast('数据加载失败，部分功能可能不可用', 'error');
  }
  mountShell();
  subscribeAI();
  state.ready = true;

  const needsWelcome = !state.welcomed && (!isConfigured() || !String(state.profile.name || '').trim());
  const hashRoute = parseHash();
  let initial;
  if (needsWelcome) {
    initial = 'welcome';
    state.welcome.step = 1;
  } else if (hashRoute === 'welcome' || !PAGES[hashRoute]) {
    initial = 'home';
  } else {
    initial = hashRoute;
  }

  const targetHash = '#/' + initial;
  if (location.hash === targetHash) {
    render();
  } else {
    location.hash = targetHash;
  }
  document.title = 'AI 学习助手';
}

boot().catch(function (err) {
  console.error('[boot fatal]', err);
  const sub = document.getElementById('boot-sub');
  if (sub) sub.textContent = '启动失败：' + (err && err.message ? err.message : '未知错误');
});

