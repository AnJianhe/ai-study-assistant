'use strict'
// 验证：关闭联网搜索时，请求跳过搜索并如实告知（provider=off）
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-verify-'))
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
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n')
      send({ choices: [{ delta: { content: '这是关闭联网搜索后的回答。' } }] })
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const run = async (webSearch) => {
    const settings = normalizeSettings({
      api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'k', model: 'm', temperature: 0.3, maxTokens: 0, timeoutSec: 30 },
      ai: { stream: true, deepThinking: false, webSearch: webSearch, searchProvider: 'auto' },
      search: {},
      learning: { autoToc: true }
    })
    const events = []
    const gw = new AiGateway({
      getSettings: () => settings,
      getProfile: () => normalizeProfile({ grade: '八年级' }),
      getScores: () => normalizeScores({}),
      getProgress: () => ({}),
      retriever, materials, bank,
      send: (e) => events.push(e)
    })
    gw.start('req_ws_' + webSearch, {
      mode: 'chat',
      messages: [{ role: 'user', content: '简单介绍一下这是哪本书。' }],
      context: { subject: '数学' }
    })
    const done = await new Promise((resolve) => {
      const t = setInterval(() => {
        const d = events.find((e) => e.type === 'done')
        const err = events.find((e) => e.type === 'error')
        if (d || err) { clearInterval(t); resolve(d || err) }
      }, 30)
      setTimeout(() => { clearInterval(t); resolve(events.find((e) => e.type === 'done') || events.find((e) => e.type === 'error') || { type: 'timeout' }) }, 20000)
    })
    return { done, events }
  }

  // 1. 关闭时
  const off = await run(false)
  check('关闭时请求完成', off.done.type === 'done', off.done)
  check('关闭时 search.provider = off', off.done.search && off.done.search.provider === 'off', off.done.search)
  check('关闭时 search.ok = false', off.done.search && off.done.search.ok === false, off.done.search)
  check('关闭时给出关闭提示', off.done.search && String(off.done.search.error || '').includes('已关闭'), off.done.search && off.done.search.error)
  check('关闭时仍能正常回答', off.done.text === '这是关闭联网搜索后的回答。', off.done.text)
  check('关闭时没有 searching 状态（无联网）', !off.events.some((e) => e.type === 'status' && e.status === 'searching'), off.events.filter((e) => e.type === 'status'))

  // 2. 设置归一化保留关闭
  const merged = normalizeSettings({ ai: { webSearch: false } })
  check('设置保存后 webSearch 仍为 false', merged.ai.webSearch === false, merged.ai.webSearch)
  const merged2 = normalizeSettings({ ai: {} })
  check('默认 webSearch 为 true', merged2.ai.webSearch === true, merged2.ai.webSearch)

  server.close()
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
