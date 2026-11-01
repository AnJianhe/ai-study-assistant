'use strict'
// 合成数据测试：图文消息中的文字应参与本地教材检索和联网搜索。
const assert = require('assert')
const { AiGateway } = require('../../lib/ai')

async function check(content, images, expected) {
  let retrievalQuery = ''
  let searchUrl = ''
  const originalFetch = global.fetch
  const events = []
  global.fetch = async (url) => {
    searchUrl = String(url)
    return { ok: true, status: 200, text: async () => '<li class="b_algo"><h2><a href="https://example.com/reference">参考资料</a></h2><p>模拟结果</p></li>' }
  }
  try {
    const gateway = new AiGateway({
      getSettings: () => ({ api: { baseUrl: 'https://example.com', apiKey: 'test-key', model: 'mock' }, ai: { webSearch: true, stream: false }, learning: { autoToc: false } }),
      getProfile: () => ({ grade: '八年级' }),
      getScores: () => ({}),
      getProgress: () => ({}),
      materials: { imageDataUrls: () => [] },
      retriever: {
        searchSections(query) { retrievalQuery = query; return { results: [], used: 0 } },
        buildReferenceBlock() { return '' },
        buildCitationMap() { return [] },
        catalogText() { return '' }
      },
      bank: { pick: () => [] },
      send: (event) => events.push(event)
    })
    gateway._callModel = async () => ({ text: '模拟回答', reasoning: '', usage: null })
    await gateway.start('test', { mode: 'chat', messages: [{ role: 'user', content, images }] })
    assert.strictEqual(retrievalQuery, expected)
    assert.ok(searchUrl, '应发起模拟的联网检索')
    const searchQuery = new URL(searchUrl).searchParams.get('q')
    assert.ok(searchQuery.includes(expected.slice(0, 50)), '搜索词应包含实际文本')
    assert.ok(!searchQuery.includes('[object Object]'), '搜索词不应是对象字符串')
    assert.ok(events.some((event) => event.type === 'done'), '应产生完成事件')
  } finally { global.fetch = originalFetch }
}

;(async () => {
  await check('图片里的分数怎么约分？', ['data:image/png;base64,AA=='], '图片里的分数怎么约分？')
  await check('没有图片的分数问题', [], '没有图片的分数问题')
  await check('', ['data:image/png;base64,AA=='], '请看我上传的图片材料。')
  console.log('PASS：图文消息、本地检索、模拟联网搜索及无图片回归')
})().catch((error) => { console.error(error); process.exitCode = 1 })
