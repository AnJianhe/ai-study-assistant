'use strict'
// 合成测试：服务端发完一段内容后挂住连接不结束，
// 应用必须在设置的时间内主动中止并给出明确提示，而不是永远卡在"正在生成"。
const http = require('http')
const { AiGateway } = require('../lib/ai')

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

function makeGateway(port, timeoutSec, events) {
  return new AiGateway({
    getSettings: () => ({
      api: { baseUrl: 'http://127.0.0.1:' + port, apiKey: 'test-key', model: 'mock', timeoutSec: timeoutSec },
      ai: { stream: true, webSearch: false },
      learning: { autoToc: false }
    }),
    getProfile: () => ({}),
    getScores: () => ({}),
    getProgress: () => ({}),
    retriever: stubRetriever,
    materials: { imageDataUrls: () => [] },
    bank: {},
    send: (event) => events.push(event)
  })
}

async function main() {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '开头一点内容' } }] }) + '\n\n')
      // 故意不结束响应：模拟服务端挂住
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const events = []
  const gateway = makeGateway(port, 10, events)
  const startedAt = Date.now()
  await gateway.start('timeout-case', { mode: 'chat', messages: [{ role: 'user', content: '你好' }] })
  const elapsed = Date.now() - startedAt
  const error = events.find((e) => e.type === 'error')

  check('挂住的流最终会结束，不会永久等待', Boolean(error), events.map((e) => e.type))
  check('提示里说明了超时', Boolean(error && /超时/.test(error.message)), error && error.message)
  check('超时归类为网络问题', Boolean(error && error.code === 'network'), error && error.code)
  check('确实在设置的时间内中止（10 秒 + 余量）', elapsed < 20000, elapsed)
  check('挂住期间已经收到的那段内容不会丢', events.some((e) => e.type === 'content'), events.map((e) => e.type))

  // 用户主动停止仍然返回 aborted，而不是超时
  const abortEvents = []
  const gateway2 = makeGateway(port, 120, abortEvents)
  const running = gateway2.start('abort-case', { mode: 'chat', messages: [{ role: 'user', content: '你好' }] })
  await new Promise((r) => setTimeout(r, 800))
  gateway2.abort('abort-case')
  await running
  const aborted = abortEvents.find((e) => e.type === 'error')
  check('用户主动停止仍是「已停止生成」', Boolean(aborted && aborted.code === 'aborted'), aborted && aborted.code)

  server.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
