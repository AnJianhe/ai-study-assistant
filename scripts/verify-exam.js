'use strict'
// 验证考试相关三个 AI 模式：建议时长 / 生成复习计划 / 按反馈改写
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { AiGateway } = require('../lib/ai')
const { TextbookLibrary } = require('../lib/textbooks')
const { MaterialStore } = require('../lib/materials')
const { Retriever } = require('../lib/retrieval')
const { QuizBank } = require('../lib/quizbank')
const { normalizeSettings, normalizeProfile, normalizeScores } = require('../lib/settings')

const assets = path.join(__dirname, '..', 'assets')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-verify-'))
const materials = new MaterialStore(tmp)
const retriever = new Retriever(new TextbookLibrary(assets), materials)
const bank = new QuizBank(assets)

const REPLIES = {
  time: JSON.stringify({ minutes: 25, reason: '5 道题按每题 3 分钟再留检查时间' }),
  plan: JSON.stringify({
    summary: '先补当前进度，再练综合题。',
    items: [
      { subject: '数学', title: '复习 4.4 合并同类项（重做例题+3 道同类题）', date: '2026-11-01', minutes: 25, reason: '当前进度', isNewCourse: false },
      { subject: '科学', title: '复习第 3 章 地球与地图（重点：等高线判读）', date: '2026-11-02', minutes: 30, reason: '考试要考但还没学', isNewCourse: true }
    ]
  }),
  revise: JSON.stringify({
    summary: '按你的意见：数学减量，周末加科学。',
    items: [
      { subject: '数学', title: '复习 4.4 合并同类项（只做 2 道例题）', date: '2026-11-01', minutes: 15, reason: '按你要求减量', isNewCourse: false },
      { subject: '科学', title: '周末专项：等高线判读 10 题', date: '2026-11-02', minutes: 40, reason: '按你要求加科学', isNewCourse: false }
    ]
  })
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let payload = {}
    try { payload = JSON.parse(body) } catch (e) {}
    const system = (payload.messages && payload.messages[0] && payload.messages[0].content) || ''
    let text = REPLIES.plan
    if (system.includes('估算建议总时长')) text = REPLIES.time
    else if (system.includes('按学生反馈修改复习计划')) text = REPLIES.revise
    else if (system.includes('制定可执行的复习计划')) text = REPLIES.plan
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n')
    for (const chunk of text.match(/[\s\S]{1,80}/g)) send({ choices: [{ delta: { content: chunk } }] })
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
    res.write('data: [DONE]\n\n')
    res.end()
  })
})

function waitDone(events) {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      const done = events.find((e) => e.type === 'done')
      const err = events.find((e) => e.type === 'error')
      if (done || err) {
        clearInterval(t)
        resolve(done || err)
      }
    }, 25)
    setTimeout(() => { clearInterval(t); resolve(events.find((e) => e.type === 'done') || events.find((e) => e.type === 'error') || { type: 'timeout' }) }, 15000)
  })
}

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const settings = normalizeSettings({
    api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'k', model: 'm', temperature: 0.3, maxTokens: 0, timeoutSec: 30 },
    ai: { stream: true, deepThinking: false, webSearch: true, searchProvider: 'tavily' },
    search: {}
  })
  const make = () => {
    const events = []
    const gw = new AiGateway({
      getSettings: () => settings,
      getProfile: () => normalizeProfile({ grade: '八年级' }),
      getScores: () => normalizeScores({}),
      getProgress: () => ({ 数学: { unit: '4.4 合并同类项', percent: 45 } }),
      retriever, materials, bank,
      send: (e) => events.push(e)
    })
    return { gw, events }
  }

  // 1. 建议时长
  const t = make()
  t.gw.start('r1', {
    mode: 'examTime',
    messages: [{ role: 'user', content: '建议时长' }],
    context: { subject: '数学', quiz: { questions: [{ type: 'choice' }, { type: 'choice' }, { type: 'short' }], stats: { choice: 2, fill: 0, short: 1 } }, plannedMinutes: 20 }
  })
  const tDone = await waitDone(t.events)
  check('examTime 完成', tDone.type === 'done', tDone)
  check('examTime 返回 25 分钟', tDone.json && tDone.json.minutes === 25, tDone.json)
  check('examTime 非本地兜底', tDone.fallback === false, tDone.fallback)

  // 2. 生成复习计划
  const p = make()
  p.gw.start('r2', {
    mode: 'examPlan',
    messages: [{ role: 'user', content: '生成计划' }],
    context: {
      exam: { name: '期中考试', date: '2026-11-10', subjects: ['数学', '科学'], note: '' },
      progress: { 数学: { unit: '4.4 合并同类项', percent: 45 } },
      dailyMinutes: 40,
      today: '2026-10-31'
    }
  })
  const pDone = await waitDone(p.events)
  check('examPlan 完成', pDone.type === 'done', pDone)
  check('examPlan 含 2 项', pDone.json && pDone.json.items.length === 2, pDone.json && pDone.json.items.length)
  check('examPlan 标记未学课程', pDone.json && pDone.json.items[1].isNewCourse === true, pDone.json && pDone.json.items[1])
  check('examPlan 日期保留', pDone.json && pDone.json.items[0].date === '2026-11-01', pDone.json && pDone.json.items[0].date)
  check('examPlan 非兜底', pDone.fallback === false)

  // 3. 按反馈改写
  const r = make()
  const previous = pDone.json
  r.gw.start('r3', {
    mode: 'examRevise',
    messages: [{ role: 'user', content: '按反馈改写' }],
    context: {
      exam: { name: '期中考试', date: '2026-11-10', subjects: ['数学', '科学'] },
      previous,
      feedback: { agreed: ['数学第一项'], rejected: ['科学第二项'], note: '数学减量，周末加科学' }
    }
  })
  const rDone = await waitDone(r.events)
  check('examRevise 完成', rDone.type === 'done', rDone)
  check('改写后数学 15 分钟', rDone.json && rDone.json.items[0].minutes === 15, rDone.json && rDone.json.items[0].minutes)
  check('改写后科学 40 分钟', rDone.json && rDone.json.items[1].minutes === 40, rDone.json && rDone.json.items[1].minutes)

  // 4. 无 API 时可回退本地（用 no-config gateway）
  const noCfg = make()
  noCfg.gw.deps = null
  // 直接调用本地兜底：通过 export 的函数
  const { normalizeExamPlan, normalizeExamTime } = require('../lib/ai')
  check('normalizeExamTime 兜底为整数', typeof normalizeExamTime({}, { quiz: { questions: [{ type: 'choice' }] } }).minutes === 'number')
  const local = normalizeExamPlan({}, { exam: { subjects: ['数学'] } })
  check('normalizeExamPlan 空输入不崩', Array.isArray(local.items))

  server.close()
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
