'use strict'
// 合成测试：上传材料时 AI 自动命名 + 自动识别材料类型的解析逻辑。
const http = require('http')
const { AiGateway, normalizeMaterialMeta } = require('../lib/ai')

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

const stubRetriever = {
  searchSections: () => ({ results: [], used: 0 }),
  buildReferenceBlock: () => '',
  buildCitationMap: () => [],
  catalogText: () => ''
}

async function main() {
  // 1) 名称清洗
  const clean = normalizeMaterialMeta({ name: '科学_光的折射', kind: 'handout', subject: '科学' }, { fileName: 'IMG_2034.jpg' })
  check('保留正常的「科目_知识点」', clean.name === '科学_光的折射', clean)
  check('识别出材料类型', clean.kind === 'handout', clean.kind)
  check('识别出科目', clean.subject === '科学', clean.subject)

  const withExt = normalizeMaterialMeta({ name: '数学_二次函数.png', kind: 'paper' }, {})
  check('去掉误带的扩展名', withExt.name === '数学_二次函数', withExt.name)

  const messy = normalizeMaterialMeta({ name: '语文 古诗鉴赏/背诵 资料', kind: 'OTHER' }, {})
  check('空格和标点换成下划线', messy.name === '语文_古诗鉴赏_背诵_资料', messy.name)
  check('类型大小写不敏感', messy.kind === 'other', messy.kind)

  const long = normalizeMaterialMeta({ name: '数学'.repeat(50) }, {})
  check('过长名称被截断', long.name.length <= 40, long.name.length)

  const bad = normalizeMaterialMeta({ name: '科学_电路', kind: 'unknown-kind', subject: '物理' }, {})
  check('非法类型不采用', bad.kind === '', bad.kind)
  check('非法科目不采用', bad.subject === '', bad.subject)

  const empty = normalizeMaterialMeta(null, { fileName: '老师发的课件.pptx' })
  check('没有可用结果时回退原文件名', empty.name === '老师发的课件.pptx', empty.name)
  check('回退时标记为非 AI 命名', empty.ai === false, empty.ai)

  // 2) 端到端：模型返回 JSON → done 事件带 json
  let receivedSystem = ''
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        receivedSystem = String((payload.messages && payload.messages[0] && payload.messages[0].content) || '')
      } catch (_err) { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({ name: '科学_光的折射', kind: 'paper', subject: '科学', reason: '有题号和答题栏' })
          }
        }]
      }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const events = []
  const gateway = new AiGateway({
    getSettings: () => ({
      api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'test-key', model: 'mock', timeoutSec: 20 },
      ai: { stream: false, webSearch: true },
      learning: { autoToc: false }
    }),
    getProfile: () => ({ grade: '八年级' }),
    getScores: () => ({}),
    getProgress: () => ({}),
    retriever: stubRetriever,
    materials: { imageDataUrls: () => [] },
    bank: {},
    send: (event) => events.push(event)
  })
  await gateway.start('meta-case', {
    mode: 'materialMeta',
    messages: [{ role: 'user', content: '请为这份学习材料起名。' }],
    context: { fileName: 'IMG_2034.jpg', subject: '数学', kindLabel: '课件 / 讲义', text: '1. 光的折射规律……' }
  })
  const done = events.find((e) => e.type === 'done')
  check('拿到完成事件', Boolean(done), events.map((e) => e.type))
  check('返回洗好的文件名', Boolean(done && done.json && done.json.name === '科学_光的折射'), done && done.json)
  check('返回材料类型', Boolean(done && done.json && done.json.kind === 'paper'), done && done.json && done.json.kind)
  check('提示词里带上了文件名和正文', /IMG_2034\.jpg/.test(receivedSystem) && /光的折射规律/.test(receivedSystem), receivedSystem.slice(0, 120))
  const realSearch = events.find((e) => e.type === 'search' && e.provider && e.provider !== 'skipped')
  check('该模式不会真的联网搜索', !realSearch, realSearch)

  server.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
