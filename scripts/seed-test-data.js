'use strict'
// 写入端到端测试用的数据（mock API + 档案 + 成绩），仅在开发测试时使用。
const fs = require('fs')
const os = require('os')
const path = require('path')

const dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'AIStudyAssistant', 'data')
fs.mkdirSync(dataDir, { recursive: true })

const settings = {
  api: {
    baseUrl: 'http://127.0.0.1:18080',
    apiKey: 'mock-key',
    model: 'mock-chat',
    reasoningModel: 'mock-reasoner',
    temperature: 0.3,
    maxTokens: 1024,
    timeoutSec: 60
  },
  ai: { stream: true, deepThinking: false, webSearch: true, searchProvider: 'auto' },
  search: { tavilyKey: '', serperKey: '', bochaKey: '' },
  learning: { dailyAsk: true, askTime: '20:30', dailyMinutes: 40, subjects: ['语文', '数学', '英语', '科学', '道法', '历史', '地理'] },
  ui: { theme: 'light' }
}

const profile = {
  name: '小林',
  grade: '八年级',
  school: '杭州某中学',
  class: '八（3）班',
  examName: '2026 学年第一学期期中考试',
  examDate: '2026-10-20',
  notes: '科学偏弱，数学几何还不错，做题容易粗心。'
}

const scores = {
  examName: '2026 学年第一学期期中考试',
  examDate: '2026-10-20',
  subjects: {
    语文: { score: 96, full: 120, skipped: false },
    数学: { score: 82, full: 120, skipped: false },
    英语: { skipped: true, score: null, full: 120 },
    科学: { score: 78, full: 160, skipped: false },
    道法: { skipped: true, score: null, full: 100 },
    历史: { score: 88, full: 100, skipped: false },
    地理: { score: 92, full: 100, skipped: false }
  }
}

fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
fs.writeFileSync(path.join(dataDir, 'profile.json'), JSON.stringify(profile, null, 2), 'utf8')
fs.writeFileSync(path.join(dataDir, 'scores.json'), JSON.stringify(scores, null, 2), 'utf8')
console.log('测试数据已写入:', dataDir)
