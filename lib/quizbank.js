'use strict'
// 内置题库：AI 输出不可用（解析失败/未配置）时的兜底出题来源。
const fs = require('fs')
const path = require('path')

class QuizBank {
  constructor(assetsDir) {
    this.file = path.join(assetsDir, 'quizbank', 'index.json')
    this._cache = null
  }

  all() {
    if (this._cache) return this._cache
    let items = []
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (Array.isArray(parsed)) items = parsed
    } catch (err) {
      console.error('[quizbank] 读取失败:', err.message)
    }
    this._cache = items.filter((q) => q && q.stem && String(q.stem).trim())
    return this._cache
  }

  list(subject) {
    const all = this.all()
    if (!subject) return all
    return all.filter((q) => q.subject === subject)
  }

  pick(subject, grade, count, seed) {
    const wanted = Number(count) || 5
    let pool = this.list(subject)
    if (!pool.length) pool = this.all()
    if (!pool.length) return []
    if (grade) {
      const gradePool = pool.filter((q) => !q.grade || q.grade === grade)
      if (gradePool.length >= 2) pool = gradePool
    }
    const shuffled = shuffle(pool, seed)
    return shuffled.slice(0, wanted).map((q, i) => normalizeQuestion(q, i))
  }
}

function hashCode(str) {
  let h = 0
  const s = String(str || '')
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return h
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(list, seed) {
  const rnd = mulberry32(hashCode(seed) || Date.now())
  const arr = list.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function normalizeQuestion(q, index) {
  const type = q.type === 'choice' ? 'choice' : q.type === 'short' ? 'short' : 'fill'
  return {
    id: 'bank-' + (q.id || index + 1),
    type,
    stem: String(q.stem || '').trim(),
    options: type === 'choice' && Array.isArray(q.options) ? q.options.map(String) : [],
    answer: String(q.answer === undefined ? '' : q.answer).trim(),
    explanation: String(q.explanation || '').trim(),
    knowledgePoint: String(q.knowledgePoint || q.subject || '').trim(),
    difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    subject: q.subject || '',
    grade: q.grade || '',
    source: '内置题库'
  }
}

module.exports = { QuizBank, normalizeQuestion }
