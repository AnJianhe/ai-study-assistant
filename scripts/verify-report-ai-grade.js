'use strict'
// 验证：报告逐题对错以 AI 判定为准（AI 说对就显示对），本地判分只在 AI 没给布尔值时兜底
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-grade-'))
const materials = new MaterialStore(tmp)
const retriever = new Retriever(new TextbookLibrary(assets), materials)
const bank = new QuizBank(assets)

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

async function main() {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const reply = JSON.stringify({
        stats: { total: 2, correct: 1, accuracy: 0.5 },
        ai: { summary: 'AI 判定：第 1 题对。', strengths: ['基础扎实'], weaknesses: [], nextSteps: [], encouragement: '继续。' },
        questions: [
          { id: 'q1', correct: true, knowledgePoint: '课文常识', explanation: 'AI 说这题答对了。' },
          { id: 'q2', correct: false, knowledgePoint: '修辞', explanation: 'AI 说这题答错了。' }
        ]
      })
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n')
      for (const chunk of reply.match(/[\s\S]{1,60}/g)) send({ choices: [{ delta: { content: chunk } }] })
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const settings = normalizeSettings({
    api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'k', model: 'm', temperature: 0.3, maxTokens: 0, timeoutSec: 30 },
    ai: { stream: true, deepThinking: false, webSearch: false, searchProvider: 'auto' },
    search: {},
    learning: { autoToc: true }
  })
  const events = []
  const gw = new AiGateway({
    getSettings: () => settings,
    getProfile: () => normalizeProfile({ grade: '七年级' }),
    getScores: () => normalizeScores({}),
    getProgress: () => ({}),
    retriever, materials, bank,
    send: (e) => events.push(e)
  })
  // q1：本地判分必错（用户答 nll，标准答案 于漪）→ AI 判对
  // q2：本地判分必对（选择 A）→ AI 判错
  gw.start('req_grade', {
    mode: 'report',
    messages: [{ role: 'user', content: '批改这组练习' }],
    context: {
      subject: '语文',
      quiz: {
        questions: [
          { id: 'q1', type: 'fill', stem: '《往事依依》的作者是？', answer: '于漪', knowledgePoint: '课文常识', explanation: '' },
          { id: 'q2', type: 'choice', stem: '下列修辞判断正确的是？', options: ['A. 比喻','B. 拟人'], answer: 'A', knowledgePoint: '修辞', explanation: '' }
        ],
        answers: { q1: 'nll', q2: 'A' }
      }
    }
  })
  const done = await new Promise((resolve) => {
    const t = setInterval(() => {
      const d = events.find((e) => e.type === 'done')
      const err = events.find((e) => e.type === 'error')
      if (d || err) { clearInterval(t); resolve(d || err) }
    }, 30)
    setTimeout(() => { clearInterval(t); resolve(events.find((e) => e.type === 'done') || events.find((e) => e.type === 'error') || { type: 'timeout' }) }, 20000)
  })
  const json = done.json || {}
  const qs = json.questions || []
  check('报告完成', done.type === 'done', done)
  check('AI 说对的题（本地会判错）显示为对', qs[0] && qs[0].correct === true, qs[0])
  check('AI 说错的题（本地会判对）显示为错', qs[1] && qs[1].correct === false, qs[1])
  check('统计按 AI 判定重算（1/2）', json.stats && json.stats.correct === 1 && json.stats.total === 2, json.stats)
  check('AI 的解析被采用', qs[0] && qs[0].explanation === 'AI 说这题答对了。', qs[0] && qs[0].explanation)

  server.close()
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
