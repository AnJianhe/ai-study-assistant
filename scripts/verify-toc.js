'use strict'
// 验证：章节归档 + 目录生成 + 章节检索 + chat 模式工具循环（open_section）
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { splitSections, buildToc } = require('../lib/sections')
const { Retriever } = require('../lib/retrieval')
const { TextbookLibrary } = require('../lib/textbooks')
const { MaterialStore } = require('../lib/materials')
const { AiGateway } = require('../lib/ai')
const { QuizBank } = require('../lib/quizbank')
const { normalizeSettings, normalizeProfile, normalizeScores } = require('../lib/settings')

const assets = path.join(__dirname, '..', 'assets')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toc-verify-'))
const materials = new MaterialStore(tmp)
const textbooks = new TextbookLibrary(assets)
const retriever = new Retriever(textbooks, materials)
const bank = new QuizBank(assets)

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

async function main() {
  // 1. 章节切分
  const md = fs.readFileSync(path.join(assets, 'textbooks', 'shuxue-g8.md'), 'utf8')
  const sections = splitSections(md, { docId: 'tb:shuxue-g8', title: '内置教材《数学八年级》' })
  check('章节切分有多个章节', sections.length >= 5, sections.length)
  check('章节 id 格式 tb:shuxue-g8#n', sections[0].id === 'tb:shuxue-g8#1', sections[0].id)
  check('章节有标题', sections.every((s) => s.title && s.title.length > 0))
  check('章节有摘要', sections.every((s) => typeof s.summary === 'string'))
  const toc = buildToc(sections, { maxChars: 4000 })
  check('目录包含章节 id', toc.includes('[tb:shuxue-g8#1]'), toc.slice(0, 120))
  check('目录含合并同类项或代数章节', /合并同类项|整式|一元二次|分式/.test(toc), toc.slice(0, 400))

  // 2. 章节检索
  const found = retriever.searchSections('合并同类项 系数 次数', { topK: 5, subject: '数学' })
  check('章节检索有结果', found.results.length > 0, found.results.length)
  check('检索结果带章节 id', found.results.every((r) => r.id && r.id.includes('#')), found.results[0])
  check('检索结果带全文', found.results.every((r) => r.text && r.text.length > 10))
  const byId = retriever.sectionById(found.results[0].id)
  check('按 id 能取回章节', byId && byId.id === found.results[0].id)

  // 3. 目录文本
  const catalog = retriever.catalogText([], { maxChars: 3000 })
  check('目录文本包含教材', catalog.includes('内置教材'), catalog.slice(0, 80))
  check('目录文本含章节编号', /\[tb:[a-z]+-g[78]#\d+\]/.test(catalog))

  // 4. chat 工具循环
  const targetId = found.results[0].id
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let payload = {}
      try { payload = JSON.parse(body) } catch (e) {}
      const messages = payload.messages || []
      const isFirst = messages.length <= 2
      const text = isFirst
        ? JSON.stringify({ tool: 'open_section', id: targetId })
        : '这是最终答案：系数与次数要分清。'
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n')
      for (const chunk of text.match(/[\s\S]{1,60}/g)) send({ choices: [{ delta: { content: chunk } }] })
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
    getProfile: () => normalizeProfile({ grade: '八年级' }),
    getScores: () => normalizeScores({}),
    getProgress: () => ({}),
    retriever,
    materials,
    bank,
    send: (e) => events.push(e)
  })
  gw.start('req_toc', {
    mode: 'chat',
    messages: [{ role: 'user', content: '合并同类项里的系数和次数怎么区分？' }],
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
  check('工具循环完成', done.type === 'done', done)
  check('最终文本为第二轮答案', done.text === '这是最终答案：系数与次数要分清。', done.text)
  const toolEvents = events.filter((e) => e.type === 'tool')
  check('收到 tool 事件（正在查看章节）', toolEvents.length === 1, toolEvents)
  check('tool 事件带章节标题', toolEvents[0] && toolEvents[0].id === targetId, toolEvents[0])

  server.close()
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
