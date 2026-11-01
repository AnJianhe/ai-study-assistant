'use strict'
// 完全模拟搜索请求：取消后不允许重试备用搜索服务或开始模型请求。
const assert = require('assert')
const { AiGateway } = require('../../lib/ai')
const { webSearch } = require('../../lib/search')

async function main() {
  const original = global.fetch
  const calls = []
  global.fetch = (url, options) => {
    calls.push(String(url))
    return new Promise((_resolve, reject) => {
      const abort = () => { const err = new Error('cancelled'); err.name = 'AbortError'; reject(err) }
      if (options.signal.aborted) abort()
      else options.signal.addEventListener('abort', abort, { once: true })
    })
  }
  try {
    const controller = new AbortController()
    const pending = webSearch('合成关键词', { ai: { searchProvider: 'tavily' }, search: { tavilyKey: 'fake', serperKey: 'fake' } }, controller.signal)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.strictEqual(calls.length, 1, '取消后不应访问备用服务')

    const events = []
    const gateway = new AiGateway({
      getSettings: () => ({ api: { baseUrl: 'https://model.example', apiKey: 'fake', model: 'mock' }, ai: { webSearch: true }, search: { tavilyKey: 'fake', serperKey: 'fake' } }),
      getProfile: () => ({}), getScores: () => ({}), getProgress: () => ({}),
      retriever: { searchSections: () => ({ results: [], used: 0 }) },
      materials: { imageDataUrls: () => [] }, bank: {}, send: (e) => events.push(e)
    })
    const job = gateway.start('cancel-test', { mode: 'chat', messages: [{ role: 'user', content: '模拟问题' }] })
    assert.strictEqual(gateway.abort('cancel-test'), true)
    await job
    assert.strictEqual(calls.length, 2, '取消后不应继续访问备用搜索或模型')
    assert.ok(events.some((e) => e.type === 'error' && e.code === 'aborted'))
    console.log('PASS：停止时取消搜索且不向备用提供方继续发送关键词')
  } finally { global.fetch = original }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
