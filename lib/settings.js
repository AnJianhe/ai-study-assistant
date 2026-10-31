'use strict'
// 设置 / 档案 / 成绩：默认值、深合并、归一化与校验。
const SUBJECTS = ['语文', '数学', '英语', '科学', '道法', '历史', '地理']

// 用户指定：浙江学生，教材版本固定如下（前端只展示，不允许随意改）。
const TEXTBOOK_VERSIONS = [
  { subject: '语文', version: '人教版', note: '按人教社统编教材' },
  { subject: '数学', version: '浙教版', note: '浙教版初中数学' },
  { subject: '英语', version: '人教版', note: '人教社 Go for it! 体系' },
  { subject: '科学', version: '教科版', note: '浙江初中科学，物理·化学·生物·地理合并为一门' },
  { subject: '社会', version: '人教版', note: '分为道法、历史、地理三科，均为人教版' }
]

const DEFAULT_SETTINGS = {
  api: {
    baseUrl: '',
    apiKey: '',
    model: '',
    reasoningModel: '',
    temperature: 0.3,
    maxTokens: 0,
    timeoutSec: 120
  },
  ai: {
    stream: true,
    deepThinking: false,
    webSearch: true,
    searchProvider: 'auto'
  },
  search: { tavilyKey: '', serperKey: '', bochaKey: '' },
  learning: {
    dailyAsk: true,
    askTime: '20:30',
    dailyMinutes: 40,
    autoToc: true,
    subjects: SUBJECTS.slice()
  },
  ui: { theme: 'dark' }
}

const DEFAULT_PROFILE = {
  name: '',
  grade: '八年级',
  school: '',
  class: '',
  examName: '',
  examDate: '',
  notes: ''
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? clone(base) : patch
  const out = isPlainObject(base) ? Object.assign({}, base) : {}
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

function clone(v) {
  if (v === undefined) return undefined
  return JSON.parse(JSON.stringify(v))
}

function normalizeBaseUrl(raw) {
  let url = String(raw || '').trim()
  if (!url) return ''
  url = url.replace(/\/+$/, '')
  return url
}

function normalizeSettings(input) {
  const merged = deepMerge(DEFAULT_SETTINGS, isPlainObject(input) ? input : {})
  merged.api.baseUrl = normalizeBaseUrl(merged.api.baseUrl)
  merged.api.apiKey = String(merged.api.apiKey || '').trim()
  merged.api.model = String(merged.api.model || '').trim()
  merged.api.reasoningModel = String(merged.api.reasoningModel || '').trim()
  const temp = Number(merged.api.temperature)
  merged.api.temperature = Number.isFinite(temp) ? Math.min(2, Math.max(0, temp)) : 0.3
  const maxTokens = Number(merged.api.maxTokens)
  // 0 = 不限制（不向接口传 max_tokens，由服务端决定上限），避免长回答被截断
  merged.api.maxTokens = Number.isFinite(maxTokens) ? (maxTokens <= 0 ? 0 : Math.min(65536, Math.round(maxTokens))) : 0
  const timeout = Number(merged.api.timeoutSec)
  merged.api.timeoutSec = Number.isFinite(timeout) ? Math.min(600, Math.max(10, Math.round(timeout))) : 120

  merged.ai.stream = merged.ai.stream !== false
  merged.ai.deepThinking = merged.ai.deepThinking === true
  // 联网搜索始终开启（需求硬约束），保存时强制为 true。
  merged.ai.webSearch = true
  const providers = ['auto', 'bing_html', 'tavily', 'serper', 'bocha']
  if (!providers.includes(merged.ai.searchProvider)) merged.ai.searchProvider = 'auto'

  merged.search.tavilyKey = String(merged.search.tavilyKey || '').trim()
  merged.search.serperKey = String(merged.search.serperKey || '').trim()
  merged.search.bochaKey = String(merged.search.bochaKey || '').trim()

  merged.learning.dailyAsk = merged.learning.dailyAsk !== false
  merged.learning.autoToc = merged.learning.autoToc !== false
  if (!/^\d{2}:\d{2}$/.test(merged.learning.askTime)) merged.learning.askTime = '20:30'
  const minutes = Number(merged.learning.dailyMinutes)
  merged.learning.dailyMinutes = Number.isFinite(minutes) ? Math.min(600, Math.max(5, Math.round(minutes))) : 40
  if (!Array.isArray(merged.learning.subjects) || merged.learning.subjects.length === 0) {
    merged.learning.subjects = SUBJECTS.slice()
  } else {
    merged.learning.subjects = merged.learning.subjects.filter((s) => SUBJECTS.includes(s))
    if (merged.learning.subjects.length === 0) merged.learning.subjects = SUBJECTS.slice()
  }
  if (merged.ui.theme !== 'dark') merged.ui.theme = 'light'

  return merged
}

function normalizeProfile(input) {
  const merged = deepMerge(DEFAULT_PROFILE, isPlainObject(input) ? input : {})
  for (const key of Object.keys(merged)) {
    if (typeof merged[key] === 'string') merged[key] = merged[key].trim()
  }
  const grades = ['七年级', '八年级', '九年级']
  if (!grades.includes(merged.grade)) merged.grade = '八年级'
  return merged
}

// 成绩：skipped 表示"明确跳过"（没考/缺考/暂无成绩）；绝不能用 0 表示跳过。
function normalizeScores(input) {
  const src = isPlainObject(input) ? input : {}
  const out = {
    examName: String(src.examName || '').trim(),
    examDate: String(src.examDate || '').trim(),
    subjects: {}
  }
  for (const subject of SUBJECTS) {
    const raw = isPlainObject(src.subjects) && isPlainObject(src.subjects[subject]) ? src.subjects[subject] : {}
    const skipped = raw.skipped === true
    const scoreNum = raw.score === null || raw.score === undefined || raw.score === '' ? null : Number(raw.score)
    const fullNum = raw.full === null || raw.full === undefined || raw.full === '' ? null : Number(raw.full)
    out.subjects[subject] = {
      skipped,
      score: skipped || !Number.isFinite(scoreNum) ? null : scoreNum,
      full: Number.isFinite(fullNum) ? fullNum : null
    }
  }
  return out
}

// 把成绩整理成给模型看的文本：跳过 = 明确没有成绩，而不是 0 分。
function describeScores(scores) {
  if (!scores || !scores.subjects) return '（学生尚未填写校内成绩）'
  const lines = []
  for (const subject of SUBJECTS) {
    const item = scores.subjects[subject]
    if (!item) continue
    if (item.skipped) {
      lines.push(`- ${subject}：已跳过（暂无成绩 / 缺考 / 最近没考），不要当作 0 分，也不要编造分数。`)
    } else if (item.score === null) {
      lines.push(`- ${subject}：未填写`)
    } else {
      const full = item.full ? `（满分 ${item.full}）` : ''
      lines.push(`- ${subject}：${item.score}${full}`)
    }
  }
  const exam = scores.examName ? `考试：${scores.examName}${scores.examDate ? '（' + scores.examDate + '）' : ''}` : ''
  return (exam ? exam + '\n' : '') + lines.join('\n')
}

module.exports = {
  SUBJECTS,
  TEXTBOOK_VERSIONS,
  DEFAULT_SETTINGS,
  DEFAULT_PROFILE,
  deepMerge,
  normalizeSettings,
  normalizeProfile,
  normalizeScores,
  describeScores,
  normalizeBaseUrl,
  clone
}
