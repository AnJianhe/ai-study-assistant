'use strict'
// 主进程自测：不依赖 Electron，验证配置归一化、检索、判分、JSON 解析与流式调用链路。
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { AiGateway, extractJson, judgeAnswer } = require('../lib/ai')
const { Retriever } = require('../lib/retrieval')
const { TextbookLibrary } = require('../lib/textbooks')
const { MaterialStore } = require('../lib/materials')
const { QuizBank } = require('../lib/quizbank')
const { normalizeSettings, normalizeProfile, normalizeScores } = require('../lib/settings')
const { parseBingHtml } = require('../lib/search')
const { segment, tokenize } = require('../lib/retrieval')
const { baseSystem } = require('../lib/prompts')

let passed = 0
let failed = 0
function check(name, condition, detail) {
  if (condition) {
    passed++
    console.log('  PASS', name)
  } else {
    failed++
    console.log('  FAIL', name, detail === undefined ? '' : '→ ' + JSON.stringify(detail))
  }
}

// ---------- 临时资产（不依赖 content-dev 的产出） ----------
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'study-selftest-'))
const assetsDir = path.join(tmpRoot, 'assets')
fs.mkdirSync(path.join(assetsDir, 'textbooks'), { recursive: true })
fs.mkdirSync(path.join(assetsDir, 'quizbank'), { recursive: true })
fs.writeFileSync(
  path.join(assetsDir, 'textbooks', 'index.json'),
  JSON.stringify([{ id: 'science-g8', subject: '科学', grade: '八年级', version: '浙教版', title: '科学测试教材', file: 'science-g8.md' }]),
  'utf8'
)
fs.writeFileSync(
  path.join(assetsDir, 'textbooks', 'science-g8.md'),
  [
    '# 光的折射',
    '## 折射规律',
    '光从空气斜射入水中时，折射角小于入射角。入射角增大，折射角也增大。',
    '## 凸透镜成像',
    '物距大于二倍焦距时成倒立缩小的实像，照相机就是利用这个原理。',
    '## 易错点',
    '光垂直入射时传播方向不改变，折射角等于 0 度，但这不是折射消失。'
  ].join('\n'),
  'utf8'
)
const bankQuestions = [
  { id: 'b1', subject: '科学', grade: '八年级', type: 'choice', stem: '光从空气斜射入水中，折射角与入射角的关系是？', options: ['A. 折射角大于入射角', 'B. 折射角小于入射角', 'C. 相等', 'D. 无法判断'], answer: 'B', explanation: '光从光疏介质进入光密介质，折射角小于入射角。', knowledgePoint: '光的折射', difficulty: 'easy' },
  { id: 'b2', subject: '科学', grade: '八年级', type: 'fill', stem: '照相机镜头成的是____立缩小的实像。', options: [], answer: '倒', explanation: '物距大于二倍焦距时成倒立缩小的实像。', knowledgePoint: '凸透镜成像', difficulty: 'medium' },
  { id: 'b3', subject: '科学', grade: '八年级', type: 'choice', stem: '光垂直射入水中时，折射角是多少度？', options: ['A. 90 度', 'B. 45 度', 'C. 0 度', 'D. 30 度'], answer: 'C', explanation: '垂直入射时方向不改变，折射角为 0 度。', knowledgePoint: '光的折射', difficulty: 'easy' }
]
fs.writeFileSync(path.join(assetsDir, 'quizbank', 'index.json'), JSON.stringify(bankQuestions), 'utf8')

const materialsDir = path.join(tmpRoot, 'materials')
fs.mkdirSync(materialsDir, { recursive: true })
const materials = new MaterialStore(materialsDir)
materials.add({ name: '老师课件-光的折射', kind: 'handout', subject: '科学', text: '今天讲光的折射：光从一种介质斜射入另一种介质时传播方向发生偏折。入射角是入射光线与法线的夹角。' })

const textbooks = new TextbookLibrary(assetsDir)
const retriever = new Retriever(textbooks, materials)
const bank = new QuizBank(assetsDir)

// ---------- 1. 配置归一化 ----------
console.log('\n[1] 配置与成绩归一化')
const settings = normalizeSettings({ api: { baseUrl: 'https://api.example.com/', model: 'm1', apiKey: 'k' }, ai: { webSearch: false } })
check('baseUrl 去掉尾斜杠', settings.api.baseUrl === 'https://api.example.com', settings.api.baseUrl)
check('联网搜索强制开启', settings.ai.webSearch === true, settings.ai.webSearch)
check('深度思考默认关闭', settings.ai.deepThinking === false)
check('流式默认开启', settings.ai.stream === true)
const scores = normalizeScores({ subjects: { 语文: { skipped: true, score: 0 }, 数学: { score: 96, full: 120 }, 英语: { score: 0, full: 120 } } })
check('跳过科目 score 为 null', scores.subjects['语文'].score === null, scores.subjects['语文'])
check('0 分是真实分数', scores.subjects['英语'].score === 0, scores.subjects['英语'])
check('正常分数保留', scores.subjects['数学'].score === 96)

// ---------- 2. 检索 ----------
console.log('\n[2] 本地检索')
const hit = retriever.search('折射角 入射角', { subject: '科学', topK: 3 })
check('检索命中教材', hit.results.some((r) => r.text.includes('折射角小于入射角')), hit.results.length)
check('检索命中上传材料', hit.results.some((r) => r.kind === 'material'), hit.results.map((r) => r.kind))
check('片段不超过 800 字', hit.results.every((r) => r.text.length <= 800))
check('中文分词 2-gram', tokenize('光的折射').includes('光的'), tokenize('光的折射').slice(0, 6))
check('分段保留标题', segment('# 标题\n内容内容')[0].heading === '标题')

// ---------- 3. JSON 与判分 ----------
console.log('\n[3] JSON 解析与自动判分')
check('代码围栏 JSON', extractJson('```json\n{"a":1}\n```').a === 1)
check('前后文字 JSON', extractJson('好的，结果如下：{"a":{"b":2}} 希望有用').a.b === 2)
check('字符串里的花括号', extractJson('{"s":"}{"}').s === '}{')
check('选择题字母判分', judgeAnswer({ type: 'choice', options: ['A. 1', 'B. 2'], answer: 'B' }, 'B') === true)
check('选择题文本判分', judgeAnswer({ type: 'choice', options: ['A. 1', 'B. 2'], answer: 'B' }, 'B. 2') === true)
check('选择题错误判分', judgeAnswer({ type: 'choice', options: ['A. 1', 'B. 2'], answer: 'B' }, 'A') === false)
check('填空题判分', judgeAnswer({ type: 'fill', answer: '倒' }, '倒') === true)
check('填空多要点判分', judgeAnswer({ type: 'fill', answer: '小于；增大' }, '小于，而且会增大') === true)

// ---------- 4. Bing 解析 ----------
console.log('\n[4] 联网搜索结果解析')
const fakeBing = `<li class="b_algo"><h2><a href="https://example.com/a">浙教版科学八上 光的折射</a></h2><p>光的折射规律：入射角与折射角的关系。</p></li>
<li class="b_algo"><h2><a href="https://example.com/b">凸透镜成像规律</a></h2><p>物距与像距的关系。</p></li>`
const parsed = parseBingHtml(fakeBing)
check('解析出 2 条结果', parsed.length === 2, parsed.length)
check('解析标题', parsed[0].title === '浙教版科学八上 光的折射', parsed[0].title)
check('解析链接', parsed[1].url === 'https://example.com/b')

// ---------- 5. mock OpenAI 服务 + 流式全链路 ----------
function createMockServer() {
  const quizJson = JSON.stringify({
    title: '光的折射小练',
    questions: [
      { id: 'q1', type: 'choice', stem: '光从空气斜射入水中，折射角与入射角的关系？', options: ['A. 折射角大于入射角', 'B. 折射角小于入射角', 'C. 相等', 'D. 无关'], answer: 'B', explanation: '从光疏到光密，折射角小于入射角。', knowledgePoint: '光的折射', difficulty: 'easy' },
      { id: 'q2', type: 'fill', stem: '光垂直射入水中时，折射角为____度。', answer: '0', explanation: '垂直入射方向不改变。', knowledgePoint: '光的折射', difficulty: 'medium' }
    ]
  })
  const reportJson = JSON.stringify({
    summary: '这次练习掌握了折射的基本规律。',
    strengths: ['选择题判断准确'],
    weaknesses: [{ knowledgePoint: '光的折射', evidence: '概念题有犹豫', advice: '重看教材折射规律一段' }],
    nextSteps: ['做 2 道折射作图题'],
    encouragement: '继续用画图法辅助判断，会很稳。'
  })
  const chatText = '你好！我是你的学习助手，可以帮你练题、讲题、安排补课。'

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      let payload = {}
      try { payload = JSON.parse(body) } catch (_e) { /* ignore */ }
      const system = (payload.messages && payload.messages[0] && payload.messages[0].content) || ''
      const mode = String(payload.model || '')
      let answer = chatText
      if (mode === 'bad-json') answer = '抱歉，我这次没能给出题目。'
      else if (system.includes('出一套短练习')) answer = quizJson
      else if (system.includes('批改并生成个性化学习报告')) answer = reportJson
      else if (mode === 'empty-json') answer = '抱歉，我这次没能给出题目。'

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const send = (obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n')
      // 先来一段 reasoning（验证深度思考通道）
      send({ choices: [{ delta: { reasoning_content: '先判断题型，再核对教材。' } }] })
      const chunks = answer.match(/[\s\S]{1,24}/g) || []
      for (const chunk of chunks) {
        send({ choices: [{ delta: { content: chunk } }] })
      }
      send({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function waitForDone(events, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const done = events.find((e) => e.type === 'done')
    const error = events.find((e) => e.type === 'error')
    if (done || error) return done || error
    await new Promise((r) => setTimeout(r, 50))
  }
  return { type: 'timeout' }
}

async function main() {
  const mock = await createMockServer()
  const baseSettings = {
    api: { baseUrl: 'http://127.0.0.1:' + mock.port, apiKey: 'test-key', model: 'mock-model', temperature: 0.3, maxTokens: 1024, timeoutSec: 60 },
    ai: { stream: true, deepThinking: false, webSearch: true, searchProvider: 'tavily' },
    search: { tavilyKey: '', serperKey: '', bochaKey: '' }
  }
  const profile = normalizeProfile({ name: '小林', grade: '八年级' })
  const scoresData = normalizeScores({ subjects: { 科学: { score: 82, full: 100 }, 语文: { skipped: true } } })

  function makeGateway(currentSettings) {
    const events = []
    const gateway = new AiGateway({
      getSettings: () => normalizeSettings(currentSettings),
      getProfile: () => profile,
      getScores: () => scoresData,
      retriever,
      materials,
      bank,
      send: (event) => events.push(event)
    })
    return { gateway, events }
  }

  // 5.1 流式 quiz
  console.log('\n[5] 流式调用（mock OpenAI 兼容服务）')
  const q = makeGateway(baseSettings)
  const reqId = 'req_test_quiz'
  q.gateway.start(reqId, {
    mode: 'quiz',
    messages: [{ role: 'user', content: '来几道光的折射的题' }],
    context: { subject: '科学', grade: '八年级', quizPlan: { minutes: 15, willing: '想学', count: 2 } }
  })
  const quizDone = await waitForDone(q.events, 15000)
  check('quiz 收到 done', quizDone.type === 'done', quizDone.type)
  check('quiz JSON 解析出 2 题', quizDone.json && quizDone.json.questions.length === 2, quizDone.json && quizDone.json.questions.length)
  check('quiz 选择题答案保留', quizDone.json && quizDone.json.questions[0].answer === 'B')
  check('quiz 非兜底', quizDone.fallback === false)
  check('收到 reasoning 事件', q.events.some((e) => e.type === 'reasoning'))
  check('收到联网搜索状态事件', q.events.some((e) => e.type === 'status' && e.status === 'searching'))
  const searchEvent = q.events.find((e) => e.type === 'search')
  check('收到联网搜索事件且带 provider', Boolean(searchEvent && typeof searchEvent.ok === 'boolean' && 'provider' in searchEvent), searchEvent)
  check('有引用来源', Array.isArray(quizDone.citations) && quizDone.citations.length > 0, quizDone.citations && quizDone.citations.length)
  check('有 usage', quizDone.usage && quizDone.usage.prompt_tokens === 100, quizDone.usage)

  // 5.2 report
  const r = makeGateway(baseSettings)
  const reportQuestions = [
    { id: 'q1', type: 'choice', options: ['A. 大于', 'B. 小于'], answer: 'B', stem: '折射角与入射角关系', knowledgePoint: '光的折射' },
    { id: 'q2', type: 'fill', answer: '0', stem: '垂直入射折射角', knowledgePoint: '光的折射' }
  ]
  r.gateway.start('req_test_report', {
    mode: 'report',
    messages: [{ role: 'user', content: '帮我批改' }],
    context: { subject: '科学', quiz: { questions: reportQuestions, answers: { q1: 'B', q2: '30' } } }
  })
  const reportDone = await waitForDone(r.events, 15000)
  check('report 收到 done', reportDone.type === 'done', reportDone.type)
  check('report 本地判分 1 对 1 错', reportDone.json && reportDone.json.stats.correct === 1, reportDone.json && reportDone.json.stats)
  check('report 准确率 0.5', reportDone.json && reportDone.json.stats.accuracy === 0.5)
  check('report AI 摘要', reportDone.json && reportDone.json.ai.summary.includes('折射'))
  check('report 弱点结构完整', reportDone.json && reportDone.json.ai.weaknesses[0].advice.length > 0)
  check('report 逐题标注对错', reportDone.json && reportDone.json.questions[1].correct === false)

  // 5.3 JSON 失败 → 题库兜底
  const badSettings = Object.assign({}, baseSettings, {
    api: Object.assign({}, baseSettings.api, { model: 'bad-json' })
  })
  const f = makeGateway(badSettings)
  f.gateway.start('req_test_fallback', {
    mode: 'quiz',
    messages: [{ role: 'user', content: '出题' }],
    context: { subject: '科学', grade: '八年级', quizPlan: { minutes: 15, willing: '一般', count: 2 } }
  })
  const fallbackDone = await waitForDone(f.events, 15000)
  check('兜底仍是 done', fallbackDone.type === 'done', fallbackDone.type)
  check('题库兜底题目数 2', fallbackDone.json && fallbackDone.json.questions.length === 2, fallbackDone.json && fallbackDone.json.questions.length)
  check('兜底标记 fallback', fallbackDone.fallback === true, fallbackDone.fallback)

  // 5.4 未配置 API
  const n = makeGateway({ api: { baseUrl: '', apiKey: '', model: '' } })
  n.gateway.start('req_test_nocfg', { mode: 'chat', messages: [{ role: 'user', content: 'hi' }] })
  const noCfg = await waitForDone(n.events, 3000)
  check('未配置 API 返回 no_config', noCfg.type === 'error' && noCfg.code === 'no_config', noCfg)

  // 5.5 系统提示词包含教材版本与成绩跳过语义
  const sys = baseSystem({ profile, scores: scoresData })
  check('系统提示包含数学浙教版', sys.includes('浙教版'))
  check('系统提示包含科学合并说明', sys.includes('合并'))
  check('系统提示包含跳过语义', sys.includes('已跳过'))
  check('系统提示禁止编造', sys.includes('不要编造'))

  mock.server.close()
  console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('自测异常:', err)
  process.exit(1)
})
