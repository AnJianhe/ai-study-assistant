'use strict'
// 验证报告解析修复：mock 返回 {stats, ai:{...}, questions} 包装结构时，
// 主进程应正确采用 AI 的分析、逐题解释，并用本地判分决定对错。
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-fix-'))
const materials = new MaterialStore(tmp)
const retriever = new Retriever(new TextbookLibrary(assets), materials)
const bank = new QuizBank(assets)

const packaged = {
  stats: { total: 2, correct: 1, accuracy: 0.5 },
  ai: {
    summary: 'AI 写的总评：这两题一错一对。',
    strengths: ['方向判断对'],
    weaknesses: [{ knowledgePoint: '长度测量', evidence: '第2题选A', advice: '记五条规范' }],
    nextSteps: ['重做刻度尺题'],
    encouragement: '加油'
  },
  questions: [
    { id: 'q1', correct: true, knowledgePoint: '方向', explanation: 'AI 批改解释：答对了' },
    { id: 'q2', correct: false, knowledgePoint: '长度测量', explanation: 'AI 批改解释：应选B' }
  ]
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n')
    const text = JSON.stringify(packaged)
    for (const chunk of text.match(/[\s\S]{1,60}/g)) send({ choices: [{ delta: { content: chunk } }] })
    send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
    res.write('data: [DONE]\n\n')
    res.end()
  })
})

function waitDone(events) {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      const done = events.find((e) => e.type === 'done')
      if (done) {
        clearInterval(t)
        resolve(done)
      }
    }, 30)
    setTimeout(() => {
      clearInterval(t)
      resolve(events.find((e) => e.type === 'done') || { type: 'timeout' })
    }, 15000)
  })
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const settings = normalizeSettings({
    api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'k', model: 'm', temperature: 0.3, maxTokens: 0, timeoutSec: 30 },
    ai: { stream: true, deepThinking: false, webSearch: true, searchProvider: 'tavily' },
    search: {}
  })
  const events = []
  const gw = new AiGateway({
    getSettings: () => settings,
    getProfile: () => normalizeProfile({ grade: '八年级' }),
    getScores: () => normalizeScores({}),
    getProgress: () => ({}),
    retriever,
    materials,
    bank,
    send: (e) => events.push(e)
  })
  const questions = [
    { id: 'q1', type: 'fill', stem: 'A 在 B 的什么方向', answer: '正北', knowledgePoint: '方向', explanation: '出题解析' },
    { id: 'q2', type: 'choice', stem: '刻度尺怎么读', options: ['A. 必须对零', 'B. 视线垂直'], answer: 'B', knowledgePoint: '长度测量', explanation: '出题解析' }
  ]
  gw.start('req_rep', {
    mode: 'report',
    messages: [{ role: 'user', content: '帮我批改' }],
    context: { subject: '科学', quiz: { questions, answers: { q1: '正北方向', q2: 'A' } } }
  })
  const done = await waitDone(events)
  const json = done.json || {}
  const checks = [
    ['done 收到', done.type === 'done'],
    ['AI 总评被采用', (json.ai || {}).summary === packaged.ai.summary],
    ['AI 优势被采用', JSON.stringify((json.ai || {}).strengths) === JSON.stringify(packaged.ai.strengths)],
    ['AI 薄弱点被采用', ((json.ai || {}).weaknesses || [])[0] && json.ai.weaknesses[0].knowledgePoint === '长度测量'],
    ['逐题用 AI 批改解释', (json.questions || [])[1] && json.questions[1].explanation === 'AI 批改解释：应选B'],
    ['本地判分：正北方向 判对', (json.questions || [])[0] && json.questions[0].correct === true],
    ['本地判分：选A 判错', (json.questions || [])[1] && json.questions[1].correct === false],
    ['非兜底', done.fallback === false]
  ]
  let pass = 0
  let fail = 0
  for (const [name, ok] of checks) {
    if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name) }
  }
  server.close()
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
