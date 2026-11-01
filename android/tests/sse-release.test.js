'use strict'
// 合成响应验证：服务端发送 [DONE] 但不关闭时应释放读取器，异常时也要释放。
const assert = require('assert')
const { AiGateway } = require('../../lib/ai')

async function run(chunks, shouldThrow, expectedCancels) {
  const originalFetch = global.fetch
  const gateway = new AiGateway({ send() {} })
  let canceled = 0
  let position = 0
  const reader = {
    async read() {
      if (position >= chunks.length) return { done: true }
      return { done: false, value: new TextEncoder().encode(chunks[position++]) }
    },
    async cancel() { canceled++ }
  }
  global.fetch = async () => ({ ok: true, status: 200, body: { getReader: () => reader } })
  try {
    const promise = gateway._callModel({
      settings: { api: { baseUrl: 'https://mock.example', apiKey: 'test-key', maxTokens: 0 } },
      model: 'mock', messages: [], deepThinking: false, temperature: 0.3,
      stream: true, requestId: 'test', controller: new AbortController(), silent: false
    })
    if (shouldThrow) await assert.rejects(promise, /模拟错误/)
    else await promise
    assert.strictEqual(canceled, expectedCancels)
  } finally { global.fetch = originalFetch }
}

;(async () => {
  await run(['data: [DONE]\n\n'], false, 1)
  await run(['data: {"error":{"message":"模拟错误"}}\n\n'], true, 1)
  await run(['data: {"choices":[{"delta":{"content":"好"}}]}\n\n'], false, 0)
  console.log('PASS：SSE 提前完成、错误和正常结束的连接释放')
})().catch((error) => { console.error(error); process.exitCode = 1 })
