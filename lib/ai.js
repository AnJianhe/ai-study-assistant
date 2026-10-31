'use strict'
// AI 网关：拼接资料、联网检索、调用 OpenAI 兼容接口、流式推送、JSON 兜底。
const { normalizeSettings } = require('./settings')
const {
  baseSystem,
  referenceSection,
  quizInstruction,
  reportInstruction,
  planInstruction,
  chatInstruction,
  outlineInstruction,
  examTimeInstruction,
  examPlanInstruction,
  examReviseInstruction
} = require('./prompts')
const { webSearch, buildSearchQuery } = require('./search')
const { normalizeQuestion } = require('./quizbank')

const REQUEST_TIMEOUT_MS = 300000
const MAX_HISTORY = 20

function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/chat\/completions$/i.test(base)) return base
  if (/\/v\d+$/i.test(base)) return base + '/chat/completions'
  return base + '/v1/chat/completions'
}

function isBadConfig(settings) {
  return !settings.api.baseUrl || !settings.api.apiKey || !settings.api.model
}

function errorCode(status, message) {
  const msg = String(message || '')
  if (status === 401 || status === 403) return 'auth'
  if (/invalid api ?key|unauthorized|authentication/i.test(msg)) return 'auth'
  if (status === 429) return 'network'
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(msg)) return 'network'
  return 'unknown'
}

function truncate(text, max) {
  const s = String(text || '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

// 从模型输出里抽取 JSON（容忍 ```json 围栏、前后说明文字）
function extractJson(text) {
  if (!text) return null
  let source = String(text).trim()
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(source)
  if (fence) source = fence[1].trim()
  try {
    return JSON.parse(source)
  } catch (_err) {
    /* 继续尝试扫描 */
  }
  const start = source.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = source.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch (_err) {
          return null
        }
      }
    }
  }
  return null
}

function normalizeChoiceLetter(value) {
  const m = /^\s*([A-Da-d])\s*(?:[.、．:：)）]|$)/.exec(String(value || ''))
  return m ? m[1].toUpperCase() : ''
}

const UNIT_ALIASES = {
  厘米: 'cm',
  cm: 'cm',
  毫米: 'mm',
  mm: 'mm',
  千米: 'km',
  km: 'km',
  公里: 'km',
  米: 'm',
  m: 'm',
  克: 'g',
  g: 'g',
  千克: 'kg',
  kg: 'kg',
  公斤: 'kg',
  度: '°',
  '°': '°'
}

function judgeAnswer(question, userAnswer) {
  const user = userAnswer === undefined || userAnswer === null ? '' : String(userAnswer).trim()
  if (!user) return false
  const answer = String(question.answer || '').trim()
  if (question.type === 'choice') {
    const ua = normalizeChoiceLetter(user)
    const ca = normalizeChoiceLetter(answer)
    if (ua && ca) return ua === ca
    const idx = (question.options || []).findIndex((opt) => String(opt).trim() === user)
    return idx >= 0 && idx === (question.options || []).findIndex((opt) => String(opt).trim() === answer)
  }

  // 归一化：去标点空格、"方向/大约/是/的"等虚词、统一常见单位（厘米/cm、千米/公里/km…）
  const strip = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s，。；;：:、,.!！?？"'“”‘’()（）\-_/]/g, '')
      .replace(/方向/g, '')
      .replace(/大约|约|左右|大概|应该是|应该|是|的|了|吧|呢/g, '')
  const unitNorm = (s) => {
    let out = s
    Object.keys(UNIT_ALIASES)
      .sort((x, y) => y.length - x.length)
      .forEach((k) => {
        out = out.split(k).join(UNIT_ALIASES[k])
      })
    return out
  }
  const u = unitNorm(strip(user))
  const a = unitNorm(strip(answer))
  if (!a) return false
  if (u === a) return true

  const nums = (s) => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
  const aNums = nums(a)
  const uNums = nums(u)

  // 纯数字答案必须数值一致（避免 "30" 里包含 "0" 被误判为答对）
  if (aNums.length === 1 && /^-?\d+(\.\d+)?$/.test(a)) {
    return uNums.length === 1 && Math.abs(uNums[0] - aNums[0]) < 1e-6
  }

  // 数字 + 单位：数字全部对上就算对（"2厘米" vs "2cm"、"2 厘米"）
  if (aNums.length && uNums.length) {
    const allFound = aNums.every((n) => uNums.some((m) => Math.abs(m - n) < 1e-6))
    if (allFound) return true
  }

  // 包含关系（放宽到 40%，兼容"正北方向""2 厘米"这类多写修饰语的答案）
  if (a.length >= 2 && u.includes(a) && a.length / u.length >= 0.4) return true
  if (u.length >= 2 && a.includes(u) && u.length / a.length >= 0.4) return true
  if (a.length === 1 && (u.startsWith(a) || u.endsWith(a))) return true

  const parts = String(answer)
    .split(/[；;，,、\/|]/)
    .map((p) => unitNorm(strip(p)))
    .filter((p) => p.length >= 1)
  if (parts.length >= 2) {
    const hit = parts.filter((p) => {
      const pNums = nums(p)
      if (pNums.length && !p.replace(/-?\d+(?:\.\d+)?/g, '').trim()) {
        return pNums.every((n) => uNums.includes(n))
      }
      if (p.length >= 2) return u.includes(p)
      return u.startsWith(p) || u.endsWith(p)
    }).length
    return hit / parts.length >= 0.7
  }
  return false
}

// 目录标准化结果：把 AI 输出规整成前端能直接用的结构（失败时保留学生原话）
function normalizeOutline(raw, ctx) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const original = String((ctx && ctx.input) || '').trim()
  const standard = String(obj.standard || obj.name || obj.standardName || '').trim()
  const matched = obj.matched !== false && standard.length > 0
  const percentRaw = Number(obj.percent)
  const percent = Number.isFinite(percentRaw) ? Math.max(0, Math.min(100, Math.round(percentRaw))) : null
  const orderRaw = Number(obj.order)
  const totalRaw = Number(obj.total)
  return {
    matched,
    standard: matched ? standard : original,
    original,
    chapter: String(obj.chapter || obj.unit || '').trim(),
    order: Number.isFinite(orderRaw) ? orderRaw : null,
    total: Number.isFinite(totalRaw) ? totalRaw : null,
    percent,
    reason: String(obj.reason || '').trim()
  }
}

// 考试/练习建议时长（AI 不可用时按题型本地估算）
function normalizeExamTime(raw, ctx) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const n = Number(obj.minutes)
  const minutes = Number.isFinite(n) ? Math.max(5, Math.min(90, Math.round(n))) : localExamMinutes(ctx)
  return {
    minutes,
    reason: String(obj.reason || '').trim(),
    local: !Number.isFinite(n)
  }
}

function localExamMinutes(ctx) {
  const quiz = (ctx && ctx.quiz) || {}
  const questions = Array.isArray(quiz.questions) ? quiz.questions : []
  let mins = 0
  questions.forEach((q) => {
    const type = q.type === 'choice' ? 'choice' : q.type === 'short' ? 'short' : 'fill'
    mins += type === 'choice' ? 1.5 : type === 'fill' ? 2.5 : 4
  })
  return Math.max(5, Math.min(90, Math.round(mins + 3)))
}

const EXAM_SUBJECTS = ['语文', '数学', '英语', '科学', '道法', '历史', '地理']

// 考试复习计划：summary + 可执行的计划项（能直接加入每日安排）
function normalizeExamPlan(raw, ctx) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const exam = (ctx && ctx.exam) || {}
  const fallbackSubject = (exam.subjects && exam.subjects[0]) || '综合'
  const items = (Array.isArray(obj.items) ? obj.items : [])
    .filter((it) => it && (it.title || it.content || it.task))
    .slice(0, 40)
    .map((it, i) => {
      const subject = EXAM_SUBJECTS.includes(it.subject) ? it.subject : fallbackSubject
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(it.date || '')) ? String(it.date) : ''
      const mins = Number(it.minutes)
      return {
        id: 'ep' + (i + 1),
        subject,
        title: String(it.title || it.content || it.task || '').trim().slice(0, 100),
        date,
        minutes: Number.isFinite(mins) ? Math.max(10, Math.min(120, Math.round(mins))) : 25,
        reason: String(it.reason || '').trim().slice(0, 160),
        isNewCourse: it.isNewCourse === true
      }
    })
  return {
    summary: String(obj.summary || '').trim(),
    items,
    local: false
  }
}

function addDaysISO(base, days) {
  const d = new Date(base.getTime() + days * 86400000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localExamPlan(ctx) {
  const exam = (ctx && ctx.exam) || {}
  const subjects = (Array.isArray(exam.subjects) && exam.subjects.length ? exam.subjects : ['数学']).slice(0, 4)
  const start = new Date()
  const items = subjects.map((sub, i) => ({
    id: 'ep' + (i + 1),
    subject: sub,
    title: '复习 ' + sub + ' 当前进度内容（重做例题 + 3 道同类题）',
    date: addDaysISO(start, i % 3),
    minutes: 25,
    reason: 'AI 计划生成失败，先按每天一科给出基础安排，可以重新生成',
    isNewCourse: false
  }))
  return {
    summary: '本地基础计划：每天一科，重点放在当前进度内容上；可以重新生成更细的版本。',
    items,
    local: true
  }
}

function normalizeQuiz(raw, ctx) {  const obj = raw || {}
  const list = Array.isArray(obj.questions) ? obj.questions : Array.isArray(raw) ? raw : []
  const questions = []
  for (const item of list) {
    if (!item || !String(item.stem || '').trim()) continue
    const type = item.type === 'choice' ? 'choice' : item.type === 'short' ? 'short' : 'fill'
    const options = type === 'choice'
      ? (Array.isArray(item.options) ? item.options.map((o) => String(o).trim()).filter(Boolean) : [])
      : []
    if (type === 'choice' && options.length < 2) continue
    questions.push({
      id: 'q' + (questions.length + 1),
      type,
      stem: String(item.stem).trim(),
      options,
      answer: String(item.answer === undefined || item.answer === null ? '' : item.answer).trim(),
      explanation: String(item.explanation || '').trim(),
      knowledgePoint: String(item.knowledgePoint || ctx.subject || '').trim(),
      difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium'
    })
    if (questions.length >= 8) break
  }
  return { title: String(obj.title || (ctx.subject ? ctx.subject + ' 练习' : '练习')), questions }
}

function fallbackQuiz(bank, ctx) {
  const plan = ctx.quizPlan || {}
  const minutes = Number(plan.minutes) || 20
  const count = Number(plan.count) || (minutes <= 10 ? 3 : minutes <= 15 ? 4 : minutes <= 20 ? 5 : 6)
  const questions = bank.pick(ctx.subject, ctx.grade, count, ctx.subject + ':' + Date.now())
  return { title: (ctx.subject || '综合') + ' · 内置题库练习', questions }
}

function normalizeReport(raw, ctx, localStats) {
  const outer = raw || {}
  // 兼容两种模型输出：
  // 1) 扁平结构 {summary, strengths, weaknesses, ...}
  // 2) 包装结构 {stats, ai:{summary, strengths, ...}, questions:[...]}（前端提示词要求的格式）
  const obj = outer.ai && typeof outer.ai === 'object' ? outer.ai : outer
  const list = (value, fallback) => (Array.isArray(value) && value.length ? value.map(String).filter(Boolean) : fallback)
  const weaknesses = Array.isArray(obj.weaknesses)
    ? obj.weaknesses
        .filter((w) => w && (typeof w === 'string' || w.knowledgePoint || w.advice))
        .map((w) =>
          typeof w === 'string'
            ? { knowledgePoint: w, evidence: '', advice: '' }
            : {
                knowledgePoint: String(w.knowledgePoint || '未命名知识点'),
                evidence: String(w.evidence || ''),
                advice: String(w.advice || '')
              }
        )
    : []
  const summary = String(obj.summary || outer.summary || '').trim() || localReport(ctx, localStats).summary
  return {
    summary,
    strengths: list(obj.strengths || outer.strengths, []),
    weaknesses: weaknesses.length ? weaknesses : localReport(ctx, localStats).weaknesses,
    nextSteps: list(obj.nextSteps || outer.nextSteps, []),
    encouragement: String(obj.encouragement || '').trim() || localReport(ctx, localStats).encouragement
  }
}

function localReport(ctx, stats, aiText) {
  const quiz = ctx.quiz || {}
  const questions = quiz.questions || []
  const answers = quiz.answers || {}
  const total = stats.total
  const correct = stats.correct
  const wrong = questions.filter((q) => !judgeAnswer(q, answers[q.id]))
  const points = []
  for (const q of wrong) {
    const point = q.knowledgePoint || '相关知识点'
    if (points.includes(point)) continue
    points.push(point)
  }
  const accuracy = total ? correct / total : 0
  // AI 返回了文字但没按 JSON 输出时，直接把它的分析作为总评，避免只剩通用模板
  const rawText = String(aiText || '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
  const looksJson = /^\s*[[{]/.test(rawText) || rawText.includes('"questions"') || rawText.includes('"weaknesses"')
  let summary = ''
  if (rawText && rawText.length > 20 && !looksJson) {
    summary = rawText.slice(0, 400)
  } else if (total === 0) {
    summary = '这次练习没有提交有效作答，建议重新做一遍，才能看到真实的掌握情况。'
  } else if (accuracy >= 0.85) {
    summary = `这次 ${total} 道题做对 ${correct} 道，准确率 ${Math.round(accuracy * 100)}%，整体掌握得不错。`
  } else if (accuracy >= 0.6) {
    summary = `这次 ${total} 道题做对 ${correct} 道，准确率 ${Math.round(accuracy * 100)}%，基础还可以，但有几处知识点需要补。`
  } else {
    summary = `这次 ${total} 道题做对 ${correct} 道，准确率 ${Math.round(accuracy * 100)}%，说明这些知识点还没真正掌握，不用着急，我们一步一步补。`
  }
  return {
    summary,
    strengths: correct > 0 ? ['做对的题说明你对相关概念已经有基本印象'] : [],
    weaknesses: points.slice(0, 3).map((point) => ({
      knowledgePoint: point,
      evidence: '这次练习中出现了错误',
      advice: '对照本次练习的解析把错题重做一遍，再找 2 道同类题巩固'
    })),
    nextSteps: points.length
      ? [
          '先复习：' + points.slice(0, 2).join('、'),
          '再做：每类错题各找 2 道同类题，写完对照解析',
          '睡前用 3 分钟复述今天的知识点'
        ]
      : ['保持节奏，明天换一个科目做一次短练习', '把今天的知识点用自己的话讲一遍'],
    encouragement: accuracy >= 0.85 ? '稳定发挥，继续保持这种节奏。' : '错题不是失败，是下一次考试前最值钱的信息。'
  }
}

function localPlan(ctx) {
  const plan = ctx.plan || {}
  const subject = plan.subject || '综合'
  const missing = plan.missing || '这次缺课的内容'
  return [
    `## 现状判断`,
    `你在 ${subject} 上缺少「${missing}」这一块。信息里没有更细的缺课范围，先按一个单元的量来安排；如果实际缺得更多，把内容补进来我会重新排。`,
    '',
    '## 补课顺序',
    `1. 先补概念：${subject}这节课的核心概念和公式，看课本例题。`,
    '2. 再补方法：把老师课件里的例题自己重做一遍，卡住的地方标记出来。',
    '3. 最后补练习：做 3-5 道基础题 + 1 道中档题，错题当天订正。',
    '',
    '## 每天做什么（约 30-40 分钟）',
    '- 第 1 天：读课本对应章节 + 整理笔记（20 分钟），做 2 道例题（15 分钟）',
    '- 第 2 天：重做课件例题 + 3 道基础题（35 分钟）',
    '- 第 3 天：1 道综合题 + 错题订正（30 分钟）',
    '',
    '## 检查点',
    '- 能不看书写出这一节的核心公式/概念',
    '- 能做对 4/5 的基础题',
    '- 能把错题原因说清楚（是概念不懂、还是计算错）',
    '',
    '> 提示：以上是按通用节奏给的模板。上传老师课件或作业后，我可以把内容换成你实际缺的那部分。'
  ].join('\n')
}

class AiGateway {
  constructor(deps) {
    this.deps = deps // { getSettings, getProfile, getScores, retriever, materials, bank, send }
    this.aborts = new Map()
  }

  abort(requestId) {
    const controller = this.aborts.get(requestId)
    if (controller) {
      controller.abort()
      this.aborts.delete(requestId)
      return true
    }
    return false
  }

  _send(requestId, event) {
    this.deps.send(Object.assign({ requestId }, event))
  }

  _status(requestId, status, text) {
    this._send(requestId, { type: 'status', status, text })
  }

  async start(requestId, req) {
    const settings = normalizeSettings(this.deps.getSettings())
    const profile = this.deps.getProfile()
    const scores = this.deps.getScores()
    const mode = ['chat', 'quiz', 'report', 'plan', 'outline', 'examTime', 'examPlan', 'examRevise'].includes(req && req.mode)
      ? req.mode
      : 'chat'
    const ctx = Object.assign({}, (req && req.context) || {}, { mode })

    if (isBadConfig(settings)) {
      this._send(requestId, {
        type: 'error',
        code: 'no_config',
        message: '还没有配置 API：请到「设置」填写接口地址、API Key 和模型名。'
      })
      return
    }

    const controller = new AbortController()
    this.aborts.set(requestId, controller)

    const useDeepThinking = Boolean((req && req.options && req.options.deepThinking) ?? settings.ai.deepThinking)
    const model = useDeepThinking ? settings.api.reasoningModel || settings.api.model : settings.api.model
    this._send(requestId, { type: 'start', mode, model })

    try {
      const userMessages = this._buildMessages(req, ctx)
      const lastUser = userMessages.filter((m) => m.role === 'user').pop()
      const queryText = (lastUser && String(lastUser.content || '')) || ''
      const searchQuery = buildSearchQuery(this._searchTopic(mode, ctx, queryText), {
        subject: ctx.subject,
        grade: (profile && profile.grade) || ctx.grade
      })

      // 联网搜索始终开启；与本地检索并行（目录标准化/考试计划等轻任务跳过，省时省 token）
      const skipSearch =
        mode === 'outline' || mode === 'examTime' || mode === 'examPlan' || mode === 'examRevise'
      let searchPromise = null
      if (!skipSearch) {
        this._status(requestId, 'searching', '正在联网检索最新资料（联网搜索已开启）…')
        searchPromise = webSearch(searchQuery, settings)
      }
      this._status(requestId, 'retrieving', skipSearch ? '正在对照教材目录…' : '正在翻阅内置教材与你的上传材料…')
      let retrieval = { results: [], used: 0 }
      try {
        retrieval = this.deps.retriever.search(this._retrievalQuery(mode, ctx, queryText), {
          topK: skipSearch ? 3 : mode === 'report' ? 4 : 6,
          subject: ctx.subject || '',
          materialIds: ctx.materialIds
        })
      } catch (err) {
        console.error('[ai] 本地检索失败:', err.message)
      }

      const search = skipSearch
        ? { ok: true, provider: 'skipped', results: [], error: '' }
        : await searchPromise.catch((err) => ({
            ok: false,
            provider: '',
            results: [],
            error: err && err.message ? err.message : String(err)
          }))

      this._send(requestId, {
        type: 'search',
        ok: Boolean(search.ok),
        provider: search.provider || '',
        results: search.results || [],
        error: search.error || ''
      })

      const systemPrompt = this._buildSystem(mode, ctx, profile, scores, retrieval, search)
      const messages = [{ role: 'system', content: systemPrompt }].concat(userMessages)
      this._status(requestId, 'writing', '正在生成内容…')

      const outcome = await this._callModel({
        settings,
        model,
        messages,
        deepThinking: useDeepThinking,
        temperature: mode === 'quiz' || mode === 'report' ? 0.35 : settings.api.temperature,
        stream: settings.ai.stream !== false,
        requestId,
        controller
      })

      if (outcome.aborted) {
        this._send(requestId, { type: 'error', code: 'aborted', message: '已停止生成' })
        return
      }

      const text = outcome.text || ''
      const reasoning = outcome.reasoning || ''
      const doneEvent = {
        type: 'done',
        text,
        reasoning,
        search: { ok: Boolean(search.ok), provider: search.provider || '', results: search.results || [] },
        citations: this.deps.retriever.buildCitationMap(retrieval.results),
        usage: outcome.usage || null,
        json: null,
        fallback: false
      }

      if (mode === 'quiz') {
        const parsed = normalizeQuiz(extractJson(text), ctx)
        if (parsed.questions.length) {
          doneEvent.json = parsed
        } else {
          doneEvent.json = fallbackQuiz(this.deps.bank, ctx)
          doneEvent.fallback = true
        }
      } else if (mode === 'report') {
        const localStats = this._localGrade(ctx)
        const parsed = extractJson(text)
        const aiReport = parsed ? normalizeReport(parsed, ctx, localStats) : localReport(ctx, localStats, text)
        // AI 的逐题批改（解释/知识点）合并进题目明细；对错仍以本地判分为准
        const aiById = {}
        if (parsed && Array.isArray(parsed.questions)) {
          parsed.questions.forEach((item, i) => {
            if (item) aiById[String(item.id || 'q' + (i + 1))] = item
          })
        }
        const gradedQuestions = (ctx.quiz && ctx.quiz.questions ? ctx.quiz.questions : []).map((q) => {
          const userAnswer = (ctx.quiz.answers || {})[q.id]
          const aiItem = aiById[String(q.id)] || {}
          return Object.assign({}, q, {
            userAnswer: userAnswer === undefined || userAnswer === null ? '' : userAnswer,
            correct: judgeAnswer(q, userAnswer),
            knowledgePoint: String(aiItem.knowledgePoint || q.knowledgePoint || '').trim(),
            explanation: String(aiItem.explanation || q.explanation || '').trim()
          })
        })
        doneEvent.json = {
          stats: localStats,
          questions: gradedQuestions,
          ai: aiReport
        }
        doneEvent.fallback = !parsed
      } else if (mode === 'plan') {
        doneEvent.text = text || localPlan(ctx)
        doneEvent.fallback = !text
      } else if (mode === 'outline') {
        doneEvent.json = normalizeOutline(extractJson(text), ctx)
        doneEvent.fallback = !doneEvent.json.matched
      } else if (mode === 'examTime') {
        doneEvent.json = normalizeExamTime(extractJson(text), ctx)
        doneEvent.fallback = doneEvent.json.local
      } else if (mode === 'examPlan' || mode === 'examRevise') {
        const parsed = extractJson(text)
        doneEvent.json = parsed ? normalizeExamPlan(parsed, ctx) : localExamPlan(ctx)
        doneEvent.fallback = !parsed
      }

      this._send(requestId, doneEvent)
    } catch (err) {
      if (err && err.name === 'AbortError') {
        this._send(requestId, { type: 'error', code: 'aborted', message: '已停止生成' })
      } else {
        const message = err && err.message ? err.message : String(err)
        this._send(requestId, {
          type: 'error',
          code: errorCode(err && err.status, message),
          message
        })
      }
    } finally {
      this.aborts.delete(requestId)
    }
  }

  _searchTopic(mode, ctx, lastText) {
    if (mode === 'chat') return lastText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 80)
    if (mode === 'quiz') return `${ctx.subject || '本学科'} ${ctx.quizPlan && ctx.quizPlan.custom ? ctx.quizPlan.custom : '核心知识点'}`
    if (mode === 'outline') return `教材目录 ${ctx.subject || ''} ${String(ctx.input || '').slice(0, 40)}`
    if (mode === 'examTime') return `练习时长建议 ${ctx.subject || ''} ${((ctx.quiz && ctx.quiz.questions) || []).length} 道题`
    if (mode === 'examPlan' || mode === 'examRevise') {
      const exam = ctx.exam || {}
      return `考试复习计划 ${(exam.name || '')} ${(exam.subjects || []).join(' ')}`
    }
    if (mode === 'report') {
      const stems = (ctx.quiz && ctx.quiz.questions ? ctx.quiz.questions : []).slice(0, 3).map((q) => q.stem).join(' ')
      return `${ctx.subject || ''} ${stems}`.slice(0, 80)
    }
    const plan = ctx.plan || {}
    return `${plan.subject || ''} ${plan.missing || ''} 补课`.slice(0, 80)
  }

  _retrievalQuery(mode, ctx, lastText) {
    if (mode === 'chat') return lastText.slice(0, 400)
    if (mode === 'quiz') {
      const plan = ctx.quizPlan || {}
      return [ctx.subject, (this.deps.getProfile() || {}).grade, plan.custom || '核心知识点 例题 易错点'].filter(Boolean).join(' ')
    }
    if (mode === 'outline') {
      return [ctx.subject, ctx.input, '教材目录 单元 课文'].filter(Boolean).join(' ').slice(0, 200)
    }
    if (mode === 'examTime') {
      return [ctx.subject, '考试题型 时间分配'].filter(Boolean).join(' ').slice(0, 120)
    }
    if (mode === 'examPlan' || mode === 'examRevise') {
      const exam = ctx.exam || {}
      return [(exam.subjects || []).join(' '), exam.name, '复习 知识点'].filter(Boolean).join(' ').slice(0, 200)
    }
    if (mode === 'report') {
      return (ctx.quiz && ctx.quiz.questions ? ctx.quiz.questions : []).slice(0, 4).map((q) => q.knowledgePoint + ' ' + q.stem).join(' ').slice(0, 400)
    }
    const plan = ctx.plan || {}
    return [plan.subject, plan.missing, '知识点 复习'].filter(Boolean).join(' ')
  }

  _buildSystem(mode, ctx, profile, scores, retrieval, search) {
    // 学生自己填写的学习进度：每次请求都注入，保证出题/讲解/补课按实际进度来
    let progress = {}
    try {
      if (typeof this.deps.getProgress === 'function') {
        const raw = this.deps.getProgress()
        if (raw && typeof raw === 'object') progress = raw
      }
    } catch (_err) {
      progress = {}
    }
    const enrichedCtx = Object.assign({}, ctx, { progress })
    const parts = [baseSystem({ profile, scores, progress })]
    parts.push(referenceSection(this.deps.retriever.buildReferenceBlock(retrieval.results), search))
    if (mode === 'quiz') parts.push(quizInstruction(enrichedCtx))
    else if (mode === 'report') parts.push(reportInstruction(enrichedCtx))
    else if (mode === 'plan') parts.push(planInstruction(enrichedCtx))
    else if (mode === 'outline') parts.push(outlineInstruction(enrichedCtx))
    else if (mode === 'examTime') parts.push(examTimeInstruction(enrichedCtx))
    else if (mode === 'examPlan') parts.push(examPlanInstruction(enrichedCtx))
    else if (mode === 'examRevise') parts.push(examReviseInstruction(enrichedCtx))
    else parts.push(chatInstruction(enrichedCtx))
    return parts.filter(Boolean).join('\n\n')
  }

  _buildMessages(req, ctx) {
    const raw = Array.isArray(req && req.messages) ? req.messages : []
    const history = raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY)
    if (!history.length) history.push({ role: 'user', content: '你好，请简单介绍一下你能怎么帮我学习。' })

    const materialImages = ctx.materialIds && this.deps.materials
      ? this.deps.materials.imageDataUrls(ctx.materialIds).slice(0, 4)
      : []

    return history.map((m, index) => {
      const isLast = index === history.length - 1
      const images = []
      if (isLast && Array.isArray(m.images)) {
        for (const url of m.images.slice(0, 4)) {
          if (typeof url === 'string' && url.startsWith('data:image/')) images.push(url)
        }
      }
      if (isLast && materialImages.length) images.push(...materialImages)
      let content = truncate(m.content, 12000)
      if (m.role === 'user' && isLast && images.length) {
        content = content || '请看我上传的图片材料。'
      }
      if (images.length) {
        return {
          role: m.role,
          content: [{ type: 'text', text: content }].concat(
            images.map((url) => ({ type: 'image_url', image_url: { url } }))
          )
        }
      }
      return { role: m.role, content }
    })
  }

  _localGrade(ctx) {
    const quiz = ctx.quiz || {}
    const questions = quiz.questions || []
    const answers = quiz.answers || {}
    let correct = 0
    const details = []
    for (const q of questions) {
      const userAnswer = answers[q.id]
      const ok = judgeAnswer(q, userAnswer)
      if (ok) correct++
      details.push({ id: q.id, correct: ok })
    }
    return {
      total: questions.length,
      correct,
      accuracy: questions.length ? Number((correct / questions.length).toFixed(3)) : 0,
      details
    }
  }

  async _callModel(options) {
    const { settings, model, messages, deepThinking, temperature, stream, requestId, controller } = options
    const url = chatCompletionsUrl(settings.api.baseUrl)

    const body = {
      model,
      messages,
      stream: Boolean(stream),
      temperature
    }
    // maxTokens = 0 表示不限制：不传该参数，交给服务端默认上限，避免长回答被截断
    if (Number(settings.api.maxTokens) > 0) body.max_tokens = Number(settings.api.maxTokens)
    if (deepThinking) body.reasoning_effort = 'high'

    const doFetch = async (payload) => {
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + settings.api.apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
        return res
      } finally {
        clearTimeout(timer)
      }
    }

    let response = await doFetch(body)
    // 某些兼容服务不认识 reasoning_effort，遇到 400 时去掉该参数重试一次
    if (!response.ok && deepThinking && response.status === 400) {
      const retryText = await response.text().catch(() => '')
      if (/reasoning_effort|unsupported|unknown parameter|extra inputs/i.test(retryText)) {
        const retryBody = Object.assign({}, body)
        delete retryBody.reasoning_effort
        response = await doFetch(retryBody)
        if (!response.ok) throw await this._errorFromResponse(response)
      } else {
        throw this._errorFromBody(response.status, retryText)
      }
    } else if (!response.ok) {
      throw await this._errorFromResponse(response)
    }

    if (!stream) {
      const data = await response.json()
      const choice = (data.choices && data.choices[0]) || {}
      const message = choice.message || {}
      return {
        text: message.content || '',
        reasoning: message.reasoning_content || message.reasoning || '',
        usage: data.usage || null
      }
    }

    const textParts = []
    const reasoningParts = []
    let usage = null
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finished = false

    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          finished = true
          break
        }
        let json
        try {
          json = JSON.parse(data)
        } catch (_err) {
          continue
        }
        if (json.usage) usage = json.usage
        if (json.error) {
          throw this._errorFromBody(200, json.error.message || JSON.stringify(json.error))
        }
        const choice = json.choices && json.choices[0]
        if (!choice) continue
        const delta = choice.delta || choice.message || {}
        const reasoningDelta = delta.reasoning_content || delta.reasoning || ''
        if (reasoningDelta) {
          reasoningParts.push(reasoningDelta)
          this._send(requestId, { type: 'reasoning', delta: reasoningDelta })
        }
        const contentDelta = delta.content
        if (contentDelta) {
          const piece = typeof contentDelta === 'string' ? contentDelta : ''
          if (piece) {
            textParts.push(piece)
            this._send(requestId, { type: 'content', delta: piece })
          }
        }
      }
    }

    return { text: textParts.join(''), reasoning: reasoningParts.join(''), usage }
  }

  _errorFromBody(status, bodyText) {
    let message = String(bodyText || '').slice(0, 500)
    try {
      const parsed = JSON.parse(bodyText)
      message = (parsed.error && (parsed.error.message || parsed.error.msg)) || parsed.message || message
    } catch (_err) {
      /* 保留原始文本 */
    }
    const err = new Error(message || '请求失败')
    err.status = status
    return err
  }

  async _errorFromResponse(response) {
    const bodyText = await response.text().catch(() => '')
    return this._errorFromBody(response.status, bodyText)
  }
}

module.exports = {
  AiGateway,
  extractJson,
  judgeAnswer,
  normalizeQuiz,
  normalizeOutline,
  normalizeExamTime,
  normalizeExamPlan,
  chatCompletionsUrl,
  localReport,
  localPlan
}
