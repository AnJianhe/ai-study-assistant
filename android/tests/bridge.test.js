'use strict'

// 仅用 Node 内置模块；所有可写文件均模拟在内存中，不接触真实用户数据。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { setImmediate: immediate } = require('node:timers/promises')
const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'android/web/bridge.js'), 'utf8')

function plain(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) }
function fixture(options = {}) {
  const files = options.files || new Map()
  const calls = { network: [], cancelled: [], picks: [], opened: [], localFetch: [] }
  const native = {
    readFile(file) { return files.has(file) ? files.get(file) : null },
    writeFile(file, text) {
      if (options.failWrite && options.failWrite(file, text)) throw new Error('模拟写入失败')
      files.set(file, text)
      return true
    },
    deleteFile(file) {
      if (options.failDelete && options.failDelete(file)) throw new Error('模拟删除失败')
      files.delete(file)
      return true
    },
    listFiles(prefix) { return [...files.keys()].filter((p) => p.startsWith(prefix)) },
    request(id, json) { calls.network.push({ id, value: JSON.parse(json) }); if (options.onRequest) options.onRequest(id, JSON.parse(json), event); return true },
    cancelRequest(id) { calls.cancelled.push(id) },
    pickFiles(id, mode) { calls.picks.push({ id, mode }); if (options.onPick) options.onPick(id, mode, event); return true },
    openExternal(url) { calls.opened.push(url); return true }
  }
  if (!options.fetchAssets) native.readAsset = function (file) { return fs.readFileSync(path.join(root, file), 'utf8') }
  const appLocation = new URL('https://appassets.androidplatform.net/index.html')
  const sandbox = {
    StudyNative: native,
    location: appLocation,
    document: { baseURI: appLocation.href },
    URL, URLSearchParams, Request, Response, Headers, ReadableStream, TextEncoder, TextDecoder,
    AbortController, DOMException, setTimeout, clearTimeout, console,
    fetch: async function (input) {
      const inputUrl = input && input.url ? input.url : String(input)
      calls.localFetch.push(inputUrl)
      const u = new URL(inputUrl, appLocation)
      if (u.origin !== appLocation.origin) throw new Error('测试禁止真实网络')
      const relative = decodeURIComponent(u.pathname.replace(/^\//, ''))
      try { return new Response(fs.readFileSync(path.join(root, relative)), { status: 200 }) } catch (_err) { return new Response('', { status: 404 }) }
    }
  }
  sandbox.window = sandbox
  const context = vm.createContext(sandbox)
  const cache = new Map()
  function loadModule(name) {
    if (cache.has(name)) return cache.get(name).exports
    const file = path.join(root, 'lib', name + '.js')
    const code = fs.readFileSync(file, 'utf8')
    const module = { exports: {} }
    cache.set(name, module)
    const requireModule = (specifier) => specifier.startsWith('./') ? loadModule(specifier.slice(2)) : require(specifier)
    const fn = new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)
    fn(requireModule, module, module.exports)
    return module.exports
  }
  function installCore() {
    sandbox.StudyMobileCore = Object.assign({}, loadModule('settings'), loadModule('sections'), loadModule('retrieval'), loadModule('quizbank'), loadModule('ai'))
  }
  if (!options.coreAfter) installCore()
  new vm.Script(source, { filename: 'bridge.js' }).runInContext(context)
  if (options.coreAfter) installCore()
  function event(type, id, data = {}) { sandbox.__nativeEvent(JSON.stringify(Object.assign({ type, id }, data))) }
  return { window: sandbox, api: sandbox.api, files, calls, event, native }
}
async function nextRequest(f, count = 1) {
  for (let i = 0; i < 20 && f.calls.network.length < count; i++) await immediate()
  assert.ok(f.calls.network.length >= count, '应启动原生请求')
  return f.calls.network[count - 1]
}
async function nextPick(f, count = 1) {
  for (let i = 0; i < 20 && f.calls.picks.length < count; i++) await immediate()
  assert.ok(f.calls.picks.length >= count, '应启动文件选择器')
  return f.calls.picks[count - 1]
}

const image = 'data:image/png;base64,aGVsbG8='

test('暴露 preload 全部接口，设置与用户数据经私有文件持久化', async () => {
  const f = fixture({ coreAfter: true })
  const expected = { app: ['info', 'openDataFolder', 'openExternal'], settings: ['get', 'save'], profile: ['get', 'save'], scores: ['get', 'save'], materials: ['list', 'add', 'remove', 'readText', 'toc'], textbooks: ['list', 'read', 'toc'], bank: ['list'], ai: ['start', 'abort', 'onEvent'], store: ['get', 'set', 'remove', 'list'], dialog: ['pickMaterial', 'pickImages'] }
  for (const [group, methods] of Object.entries(expected)) for (const name of methods) assert.equal(typeof f.api[group][name], 'function', group + '.' + name)
  const info = await f.api.app.info()
  assert.equal(info.platform, 'android')
  assert.equal(info.subjects.length, 7)
  assert.equal((await f.api.settings.get()).api.temperature, 0.3)
  await f.api.settings.save({ api: { baseUrl: ' https://example.com/v1/ ', apiKey: '秘密', model: 'm', temperature: 8 }, ai: { webSearch: false } })
  assert.equal((await f.api.settings.get()).api.baseUrl, 'https://example.com/v1')
  assert.equal((await f.api.settings.get()).api.temperature, 2)
  await f.api.profile.save({ name: ' 同学 ', grade: '九年级' })
  await f.api.scores.save({ subjects: { 数学: { score: 0, full: 100 }, 英语: { skipped: true, score: 0 } } })
  await f.api.store.set('progress', { 数学: { chapter: 2 } })
  await f.api.store.set('__proto__', { safe: true })
  assert.deepEqual(plain(await f.api.store.get('__proto__')), { safe: true })
  assert.deepEqual(plain(await f.api.store.list('pro')), ['progress'])
  assert.equal(await f.api.store.remove('missing'), true)
  const again = fixture({ files: f.files })
  assert.equal((await again.api.settings.get()).api.apiKey, '秘密')
  assert.equal((await again.api.profile.get()).name, '同学')
  assert.equal((await again.api.scores.get()).subjects.数学.score, 0)
  assert.equal((await again.api.scores.get()).subjects.英语.score, null)
  assert.deepEqual(plain(await again.api.store.get('progress')), { 数学: { chapter: 2 } })
  assert.ok([...f.files.keys()].every((p) => !p.startsWith('/') && !p.includes('..') && p.startsWith('data/')))
  assert.deepEqual(f.calls.network, [])
  await f.api.app.openExternal('https://example.com/test')
  assert.deepEqual(f.calls.opened, ['https://example.com/test'])
  await assert.rejects(f.api.app.openExternal('file:///data/settings.json'), /http\/https/)
  await assert.rejects(f.api.app.openExternal('https://user:pass@example.com/'), /无效/)
  await assert.rejects(f.api.app.openDataFolder(), /私有/)
})

test('教材与题库从打包资源实际加载，支持目录、过滤和原始 fetch 回退', async () => {
  for (const fetchAssets of [false, true]) {
    const f = fixture({ fetchAssets })
    const list = await f.api.textbooks.list()
    assert.equal(list.length, 14)
    assert.ok(list.every((x) => x.chars > 100 && x.builtin))
    const book = await f.api.textbooks.read('shuxue-g7')
    assert.equal(book.meta.subject, '数学')
    assert.match(book.content, /数学/)
    assert.ok((await f.api.textbooks.toc('shuxue-g7')).length > 0)
    assert.ok((await f.api.bank.list('数学')).length > 0)
    assert.ok((await f.api.bank.list('数学')).every((q) => q.subject === '数学'))
    assert.ok((await f.api.bank.list()).length > (await f.api.bank.list('数学')).length)
    await assert.rejects(f.api.textbooks.read('不存在'), /教材不存在/)
    assert.equal(f.calls.network.length, 0)
    assert.equal(fetchAssets, f.calls.localFetch.length > 0)
  }
})

test('材料内容、检索目录和图片分文件保存，支持删除与校验', async () => {
  const f = fixture()
  const text = '# 二次函数\n抛物线图像经过原点。'
  const m = await f.api.materials.add({ name: '../数学笔记', subject: '数学', kind: 'handout', text })
  assert.equal(m.hasFile, false)
  assert.equal(await f.api.materials.readText(m.id), text)
  assert.ok((await f.api.materials.toc(m.id)).length > 0)
  const pic = await f.api.materials.add({ name: '截图.png', subject: '数学', dataUrl: image })
  assert.equal(pic.size, 5)
  assert.equal(pic.hasFile, true)
  assert.equal(f.files.get('data/materials/' + pic.imagePath), image)
  assert.ok(!f.files.get('data/materials/index.json').includes(image))
  assert.equal((await f.api.materials.list()).find((x) => x.id === pic.id).preview, '（图片材料）')
  await assert.rejects(f.api.materials.add({ dataUrl: 'data:image/png;base64,!!!!' }), /格式/)
  await assert.rejects(f.api.materials.add({ dataUrl: 'data:image/svg+xml;base64,YQ==' }), /格式/)
  await assert.rejects(f.api.materials.add({ text: 'a'.repeat(300001) }), /过大/)
  await assert.rejects(f.api.materials.add({ text: '   ' }), /内容为空/)
  await assert.rejects(f.api.materials.readText('../../settings.json'), /不存在/)
  assert.equal(await f.api.materials.remove(pic.id), true)
  assert.equal(f.files.has('data/materials/' + pic.imagePath), false)
  assert.equal((await f.api.materials.list()).length, 1)
  await assert.rejects(f.api.materials.remove(pic.id), /不存在/)
})

test('材料索引写入失败回滚图片，损坏数据不会静默覆盖', async () => {
  const f = fixture({ failWrite: (file) => file.endsWith('materials/index.json') })
  await assert.rejects(f.api.materials.add({ dataUrl: image }), /模拟写入失败/)
  assert.equal([...f.files.keys()].filter((p) => p.includes('/uploads/')).length, 0)
  f.files.set('data/store.json', '{坏数据')
  await assert.rejects(f.api.store.get('x'), /格式错误/)
  await assert.rejects(f.api.store.set('x', 1), /格式错误/)
  assert.equal(f.files.get('data/store.json'), '{坏数据')
})

test('选择器结果校验、取消、文件类型、大小及原生错误', async () => {
  const f = fixture()
  let p = f.api.dialog.pickMaterial()
  let pick = await nextPick(f)
  assert.equal(pick.mode, 'material')
  f.event('files', pick.id, { files: [{ name: 'a.md', size: 4, text: '笔记' }] })
  const single = await p
  assert.ok(Array.isArray(single))
  assert.equal(single[0].text, '笔记')
  p = f.api.dialog.pickImages(); pick = await nextPick(f, 2)
  assert.equal(pick.mode, 'images')
  f.event('files', pick.id, { files: [{ name: 'c:\\secret\\a.png', size: 5, dataUrl: image }] })
  assert.equal((await p)[0].name, 'a.png')
  p = f.api.dialog.pickImages(); pick = await nextPick(f, 3)
  f.event('files', pick.id, { files: [] })
  assert.deepEqual(plain(await p), [])
  p = f.api.dialog.pickMaterial(); pick = await nextPick(f, 4)
  f.event('files', pick.id, { files: [{ name: 'ppt.pptx', size: 1, unsupported: true, hint: '无法解析 Office' }] })
  const unsupported = await p
  assert.match(unsupported[0].error, /无法解析 Office/)
  p = f.api.dialog.pickMaterial(); pick = await nextPick(f, 5)
  f.event('files', pick.id, { files: [{ name: 'big.txt', size: 12 * 1024 * 1024 + 1, text: 'a' }] })
  const tooBig = await p
  assert.match(tooBig[0].error, /12MB/)
  p = f.api.dialog.pickMaterial(); pick = await nextPick(f, 6)
  f.event('error', pick.id, { message: '拒绝访问' })
  await assert.rejects(p, /拒绝访问/)
  p = f.api.dialog.pickMaterial(); pick = await nextPick(f, 7)
  f.event('files', pick.id, { files: [] })
  assert.equal(await p, null)
})

test('多选材料逐个校验：不合格的只标记自己，不影响其他文件', async () => {
  const f = fixture({ onPick(id, mode, event) {
    event('files', id, {
      files: [
        { name: '一.md', size: 4, text: '第一份' },
        { name: '坏.pptx', size: 1, unsupported: true, hint: '无法解析 Office' },
        { name: '三.md', size: 4, text: '第三份' }
      ]
    })
  } })
  const list = await f.api.dialog.pickMaterial()
  assert.equal(list.length, 3)
  assert.equal(list[0].text, '第一份')
  assert.match(list[1].error, /无法解析 Office/)
  assert.equal(list[2].text, '第三份')
})

test('网络包装仅发起应用请求，保留本地 fetch，流、状态和非成功响应可读取', async () => {
  const f = fixture()
  const local = await f.window.fetch('assets/textbooks/index.json')
  assert.equal(local.status, 200)
  assert.equal(f.calls.network.length, 0)
  const pending = f.window.fetch('https://model.example/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' }, body: '{"hello":"世界"}' })
  const req = await nextRequest(f)
  assert.equal(req.value.url, 'https://model.example/v1/chat/completions')
  assert.equal(req.value.method, 'POST')
  assert.equal(req.value.headers.authorization, 'Bearer test-secret')
  assert.equal(req.value.body, '{"hello":"世界"}')
  assert.equal(req.value.redirect, 'manual')
  f.event('headers', req.id, { status: 401 })
  const response = await pending
  assert.equal(response.status, 401)
  assert.equal(response.ok, false)
  const text = response.text()
  f.event('chunk', req.id, { text: '{"error":"' })
  f.event('chunk', req.id, { text: '未授权"}' })
  f.event('end', req.id)
  assert.equal(await text, '{"error":"未授权"}')
  assert.deepEqual(plain(await new Response('{"ok":true}').json()), { ok: true })
  const jsonPending = f.window.fetch('https://model.example/json')
  const j = await nextRequest(f, 2)
  f.event('headers', j.id, { status: 200 }); const jsonResponse = await jsonPending
  f.event('chunk', j.id, { text: '{"ok":true}' }); f.event('end', j.id)
  assert.deepEqual(plain(await jsonResponse.json()), { ok: true })
})

test('同步原生回调、无正文状态、非法事件和网络失败', async () => {
  const f = fixture({ onRequest(id, _req, event) { event('headers', id, { status: 200 }); event('chunk', id, { text: '同步' }); event('end', id) } })
  const response = await f.window.fetch('https://example.com')
  assert.equal(await response.text(), '同步')
  const other = fixture()
  let pending = other.window.fetch('https://example.com/no-content')
  let req = await nextRequest(other)
  other.event('headers', req.id, { status: 204 }); other.event('end', req.id)
  assert.equal((await pending).body, null)
  pending = other.window.fetch('https://example.com/bad')
  req = await nextRequest(other, 2)
  other.event('chunk', req.id, { text: '不合规' })
  await assert.rejects(pending, /早于响应头/)
  assert.ok(other.calls.cancelled.includes(req.id))
  pending = other.window.fetch('https://example.com/error')
  req = await nextRequest(other, 3)
  other.event('error', req.id, { message: '网络断开' })
  await assert.rejects(pending, /网络断开/)
})

test('网络 Abort 可在响应头前后中止，流取消也通知原生', async () => {
  const f = fixture()
  const before = new AbortController()
  before.abort()
  await assert.rejects(f.window.fetch('https://example.com', { signal: before.signal }), { name: 'AbortError' })
  assert.equal(f.calls.network.length, 0)
  const controller = new AbortController()
  const pending = f.window.fetch('https://example.com', { signal: controller.signal })
  const req = await nextRequest(f)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.ok(f.calls.cancelled.includes(req.id))
  const after = new AbortController()
  const pending2 = f.window.fetch('https://example.com/stream', { signal: after.signal })
  const req2 = await nextRequest(f, 2)
  f.event('headers', req2.id, { status: 200 })
  const res = await pending2
  const reader = res.body.getReader()
  const read = reader.read()
  after.abort()
  await assert.rejects(read, { name: 'AbortError' })
  assert.ok(f.calls.cancelled.includes(req2.id))
  const pending3 = f.window.fetch('https://example.com/cancel')
  const req3 = await nextRequest(f, 3)
  f.event('headers', req3.id, { status: 200 })
  const res3 = await pending3
  await res3.body.cancel()
  assert.ok(f.calls.cancelled.includes(req3.id))
})

test('真实 AiGateway 的早期错误事件晚于 start 返回，取消尚未启动的请求', async () => {
  const f = fixture()
  const events = []
  const off = f.api.ai.onEvent((evt) => events.push(plain(evt)))
  const start = await f.api.ai.start({ mode: 'chat' })
  assert.equal(events.length, 0)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(events[0].requestId, start.requestId)
  assert.equal(events[0].code, 'no_config')
  const second = await f.api.ai.start({ mode: 'chat' })
  assert.equal(await f.api.ai.abort(second.requestId), true)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(events.some((event) => event.requestId === second.requestId && event.code === 'aborted'))
  off()
})

test('真实 AiGateway 检索私有材料及附件，流式请求只发往配置的接口', async () => {
  const f = fixture({ onRequest(requestId, _request, event) {
    setTimeout(() => {
      event('headers', requestId, { status: 200 })
      event('chunk', requestId, { text: 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' })
      event('chunk', requestId, { text: 'data: [DONE]\n\n' })
      event('end', requestId)
    }, 0)
  } })
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'test-secret', model: 'test-model' }, ai: { webSearch: false, stream: true }, learning: { autoToc: false } })
  const material = await f.api.materials.add({ name: '数学笔记', subject: '数学', text: '# 飞蛙特征\n飞蛙特征是笔记中的内容。' })
  const picture = await f.api.materials.add({ name: '图片', subject: '数学', dataUrl: image })
  const events = []
  const finished = new Promise((resolve, reject) => {
    f.api.ai.onEvent((event) => { events.push(plain(event)); if (event.type === 'done') resolve(event); if (event.type === 'error') reject(new Error(event.message)) })
  })
  const result = await f.api.ai.start({ mode: 'chat', context: { subject: '数学', materialIds: [material.id] }, messages: [{ role: 'user', content: '讲讲飞蛙特征' }] })
  assert.equal(events.length, 0)
  const done = await finished
  assert.equal(done.text, '你好')
  assert.ok(events.some((event) => event.type === 'content' && event.delta === '你好'))
  assert.ok(events.every((event) => event.requestId === result.requestId))
  assert.equal(f.calls.network.length, 1)
  const request = f.calls.network[0].value
  assert.equal(request.url, 'https://model.example/v1/chat/completions')
  assert.equal(request.headers.authorization, 'Bearer test-secret')
  assert.ok(request.body.includes('笔记中的内容'))
  assert.equal(request.body.includes('settings.json'), false)
  const imageDone = new Promise((resolve, reject) => {
    f.api.ai.onEvent((event) => { if (event.type === 'done') resolve(event); if (event.type === 'error') reject(new Error(event.message)) })
  })
  await f.api.ai.start({ mode: 'chat', context: { subject: '数学', materialIds: [picture.id] }, messages: [{ role: 'user', content: '请看图片' }] })
  await imageDone
  assert.equal(f.calls.network.length, 2)
  assert.ok(f.calls.network[1].value.body.includes(image))
})

test('AI 只读取明确选中的文字材料，空选择不会泄漏私有资料', async () => {
  const f = fixture({ onRequest(requestId, _request, event) {
    setTimeout(() => {
      event('headers', requestId, { status: 200 })
      event('chunk', requestId, { text: JSON.stringify({ choices: [{ message: { content: '答复' } }] }) })
      event('end', requestId)
    }, 0)
  } })
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'test-key', model: 'm' }, ai: { webSearch: false, stream: false } })
  const selected = await f.api.materials.add({ name: '选择的资料', subject: '数学', text: '# 测试关键点\n测试关键点 ONLY_SELECTED' })
  await f.api.materials.add({ name: '未选择的资料', subject: '数学', text: '# 测试关键点\n测试关键点 NEVER_SEND_PRIVATE' })
  async function ask(ids) {
    const completed = new Promise((resolve, reject) => {
      const off = f.api.ai.onEvent((evt) => { if (evt.type === 'done') { off(); resolve() } else if (evt.type === 'error') { off(); reject(new Error(evt.message)) } })
    })
    await f.api.ai.start({ mode: 'chat', context: { subject: '数学', materialIds: ids }, messages: [{ role: 'user', content: '测试关键点' }] })
    await completed
  }
  await ask([])
  assert.ok(!f.calls.network[0].value.body.includes('NEVER_SEND_PRIVATE'))
  assert.ok(!f.calls.network[0].value.body.includes('ONLY_SELECTED'))
  await ask([selected.id])
  assert.ok(f.calls.network[1].value.body.includes('ONLY_SELECTED'))
  assert.ok(!f.calls.network[1].value.body.includes('NEVER_SEND_PRIVATE'))
})

test('联网搜索只传搜索词，配置密钥和资料不进入搜索请求', async () => {
  const f = fixture({ onRequest(requestId, request, event) {
    setTimeout(() => {
      event('headers', requestId, { status: 200 })
      const body = request.url.startsWith('https://cn.bing.com/')
        ? '<li class="b_algo"><h2><a href="https://example.com/ref">参考链接</a></h2><p>搜索结果</p></li>'
        : JSON.stringify({ choices: [{ message: { content: '答复' } }] })
      event('chunk', requestId, { text: body })
      event('end', requestId)
    }, 0)
  } })
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'SECRET_CONFIG', model: 'm' }, ai: { webSearch: true, searchProvider: 'bing_html', stream: false } })
  const material = await f.api.materials.add({ subject: '数学', name: '资料', text: '# 函数\n函数 NEVER_SEND_TO_SEARCH' })
  const done = new Promise((resolve, reject) => f.api.ai.onEvent((evt) => { if (evt.type === 'done') resolve(evt); if (evt.type === 'error') reject(new Error(evt.message)) }))
  await f.api.ai.start({ mode: 'chat', context: { subject: '数学', materialIds: [material.id] }, messages: [{ role: 'user', content: '函数怎么学' }] })
  await done
  const search = f.calls.network.find((req) => req.value.url.startsWith('https://cn.bing.com/'))
  assert.ok(search)
  assert.ok(decodeURIComponent(search.value.url).includes('函数怎么学'))
  assert.ok(!JSON.stringify(search.value).includes('SECRET_CONFIG'))
  assert.ok(!JSON.stringify(search.value).includes('NEVER_SEND_TO_SEARCH'))
  const model = f.calls.network.find((req) => req.value.url.startsWith('https://model.example/'))
  assert.ok(model)
  assert.equal(model.value.headers.authorization, 'Bearer SECRET_CONFIG')
})

test('深度思考参数不受支持时仅向原模型 URL 重试', async () => {
  let attempts = 0
  const f = fixture({ onRequest(requestId, _request, event) {
    const isFirst = attempts++ === 0
    setTimeout(() => {
      event('headers', requestId, { status: isFirst ? 400 : 200 })
      event('chunk', requestId, { text: isFirst
        ? '{"error":{"message":"unknown parameter reasoning_effort"}}'
        : '{"choices":[{"message":{"content":"重试成功"}}]}' })
      event('end', requestId)
    }, 0)
  } })
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'test-key', model: 'm' }, ai: { webSearch: false, stream: false, deepThinking: true }, learning: { autoToc: false } })
  const done = new Promise((resolve, reject) => f.api.ai.onEvent((evt) => { if (evt.type === 'done') resolve(evt); if (evt.type === 'error') reject(new Error(evt.message)) }))
  await f.api.ai.start({ mode: 'chat', messages: [{ role: 'user', content: '你好' }] })
  assert.equal((await done).text, '重试成功')
  assert.equal(f.calls.network.length, 2)
  assert.equal(f.calls.network[0].value.url, f.calls.network[1].value.url)
  assert.equal(JSON.parse(f.calls.network[0].value.body).reasoning_effort, 'high')
  assert.equal(JSON.parse(f.calls.network[1].value.body).reasoning_effort, undefined)
})

test('超过 12 MiB 的图片及图文总量遭拒，且不会写盘', async () => {
  const f = fixture()
  const full = 'data:image/png;base64,' + 'A'.repeat(16 * 1024 * 1024)
  await assert.rejects(f.api.materials.add({ dataUrl: full + 'AAAA' }), /12MB/)
  await assert.rejects(f.api.materials.add({ dataUrl: full, text: 'x' }), /12MB/)
  await assert.rejects(f.api.ai.start({ messages: [{ role: 'user', content: '', images: [full + 'AAAA'] }] }), /12MB/)
  assert.equal(f.files.size, 0)
  assert.equal(f.calls.network.length, 0)
})

test('删除图片失败保留索引，非法持久化格式不被覆盖', async () => {
  let blocked = false
  const f = fixture({ failDelete: () => blocked })
  const item = await f.api.materials.add({ dataUrl: image })
  blocked = true
  await assert.rejects(f.api.materials.remove(item.id), /删除失败/)
  assert.equal((await f.api.materials.list()).length, 1)
  assert.equal(f.files.get('data/materials/' + item.imagePath), image)
  f.files.set('data/settings.json', '[]')
  await assert.rejects(f.api.settings.save({ ui: { theme: 'light' } }), /格式错误/)
  assert.equal(f.files.get('data/settings.json'), '[]')
})

test('同步选择器回调、文件文本长度与附件格式校验', async () => {
  const f = fixture({ onPick(id, mode, event) {
    event('files', id, { files: mode === 'images' ? [{ name: 'a.jpg', size: 5, dataUrl: image }] : [{ name: 'too-long.txt', size: 300001, text: 'x'.repeat(300001) }] })
  } })
  assert.equal((await f.api.dialog.pickImages())[0].size, 5)
  const tooLong = await f.api.dialog.pickMaterial()
  assert.match(tooLong[0].error, /过大/)
  await assert.rejects(f.api.ai.start({ messages: [{ images: ['data:image/png;base64,%%%'] }] }), /格式/)
})

test('资源读取失败会报告错误且可重试，不损坏其他数据', async () => {
  const f = fixture()
  const read = f.native.readAsset
  f.native.readAsset = () => { throw new Error('模拟资源不可读') }
  await assert.rejects(f.api.textbooks.list(), /无法读取或解析/)
  assert.deepEqual(await f.api.materials.list().then(plain), [])
  f.native.readAsset = read
  assert.equal((await f.api.textbooks.list()).length, 14)
})

test('Request 对象、HEAD 和响应头后网络错误均符合约定', async () => {
  const f = fixture()
  const request = new Request('https://example.com/put', { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '文本' })
  let promise = f.window.fetch(request)
  let sent = await nextRequest(f)
  assert.equal(sent.value.method, 'PUT')
  assert.equal(sent.value.body, '文本')
  f.event('headers', sent.id, { status: 200 })
  const response = await promise
  const read = response.text()
  f.event('chunk', sent.id, { text: '部分' })
  f.event('error', sent.id, { message: '读取中断' })
  await assert.rejects(read, /读取中断/)
  promise = f.window.fetch('https://example.com/head', { method: 'HEAD' })
  sent = await nextRequest(f, 2)
  f.event('headers', sent.id, { status: 200 })
  f.event('end', sent.id)
  assert.equal((await promise).body, null)
  await assert.rejects(f.window.fetch('https://example.com', { method: 'POST', body: new Uint8Array([1, 2]) }), /仅支持 UTF-8 文本/)
})

test('AI 已启动时取消实际网络请求并发送 aborted 事件', async () => {
  const f = fixture()
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'test-key', model: 'm' }, ai: { webSearch: false }, learning: { autoToc: false } })
  let resolveDone
  const done = new Promise((resolve) => { resolveDone = resolve })
  f.api.ai.onEvent((evt) => { if (evt.type === 'error') resolveDone(evt) })
  const task = await f.api.ai.start({ mode: 'chat', messages: [{ role: 'user', content: '你好' }] })
  const request = await nextRequest(f)
  assert.equal(await f.api.ai.abort(task.requestId), true)
  assert.equal((await done).code, 'aborted')
  assert.ok(f.calls.cancelled.includes(request.id))
  assert.equal(await f.api.ai.abort(task.requestId), false)
})

test('安卓网络桥拒绝明文地址及超大请求并给出提示', async () => {
  const f = fixture()
  await assert.rejects(f.window.fetch('http://example.com/v1/chat/completions'), /HTTPS/)
  await assert.rejects(f.window.fetch('https://example.com/v1/chat/completions', {
    method: 'POST', body: 'x'.repeat(32 * 1024 * 1024)
  }), /超过 32 MB/)
  assert.equal(f.calls.network.length, 0)
})

test('AI 出题解析失败时使用真正的内置题库兜底', async () => {
  const f = fixture({ onRequest(requestId, _request, event) {
    setTimeout(() => {
      event('headers', requestId, { status: 200 })
      event('chunk', requestId, { text: JSON.stringify({ choices: [{ message: { content: '非 JSON 输出' } }] }) })
      event('end', requestId)
    }, 0)
  } })
  await f.api.settings.save({ api: { baseUrl: 'https://model.example', apiKey: 'test-key', model: 'm' }, ai: { webSearch: false, stream: false } })
  const done = new Promise((resolve, reject) => f.api.ai.onEvent((evt) => { if (evt.type === 'done') resolve(evt); if (evt.type === 'error') reject(new Error(evt.message)) }))
  await f.api.ai.start({ mode: 'quiz', context: { subject: '数学', grade: '七年级' }, messages: [{ role: 'user', content: '请出题' }] })
  const result = await done
  assert.equal(result.fallback, true)
  assert.ok(result.json.questions.length > 0)
  assert.ok(result.json.questions.every((q) => q.source === '内置题库'))
})
