/* Android WebView 适配层：先于 renderer.js 加载。无 Node.js 和第三方依赖。 */
(function (window) {
  'use strict'

  const native = window.StudyNative
  if (!native) throw new Error('缺少 StudyNative 安卓接口')
  const originalFetch = window.fetch && window.fetch.bind(window)
  const networkRequests = new Map()
  const pickRequests = new Map()
  const aiJobs = new Map()
  const aiListeners = new Set()
  const MAX_BYTES = 12 * 1024 * 1024
  const MAX_TEXT = 300000
  const kinds = { handout: '课件 / 讲义', homework: '当天作业', paper: '试卷照片', textbook: '自己的课本', other: '其他材料' }
  const imageTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' }
  let sequence = 0

  function core() {
    if (!window.StudyMobileCore) throw new Error('缺少 StudyMobileCore，请先加载移动核心')
    return window.StudyMobileCore
  }
  function id(prefix) {
    sequence += 1
    const random = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    return prefix + Date.now().toString(36) + '_' + sequence.toString(36) + '_' + random
  }
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  }
  function safePath(path) {
    if (typeof path !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error('无效的应用私有文件名')
    }
    return path
  }
  function readFile(path) {
    const value = native.readFile(safePath(path))
    return value == null ? null : String(value)
  }
  function writeFile(path, text) {
    if (native.writeFile(safePath(path), String(text)) === false) throw new Error('应用私有文件写入失败')
  }
  function deleteFile(path) {
    if (native.deleteFile(safePath(path)) === false) throw new Error('应用私有文件删除失败')
  }
  function readJson(path, fallback) {
    const raw = readFile(path)
    if (raw === null) return clone(fallback)
    try { return JSON.parse(raw) } catch (_err) { throw new Error('应用私有数据格式错误：' + path) }
  }
  function writeJson(path, value) { writeFile(path, JSON.stringify(value)) }
  function record(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('应用私有数据格式错误：' + name)
    return value
  }
  function abortError() {
    if (typeof DOMException === 'function') return new DOMException('请求已取消', 'AbortError')
    const err = new Error('请求已取消')
    err.name = 'AbortError'
    return err
  }
  function cancelNative(requestId) {
    try { native.cancelRequest(requestId) } catch (_err) { /* 原请求仍以取消状态结束 */ }
  }

  // 仅转发当前 fetch 的 URL、方法、请求头和文本正文；原生端必须禁止自动重定向。
  async function mobileFetch(input, init) {
    const inputUrl = input && typeof input === 'object' && 'url' in input ? input.url : String(input)
    const base = (window.document && window.document.baseURI) || (window.location && window.location.href)
    const url = new URL(inputUrl, base)
    const location = window.location
    const isLocal = !/^https?:$/.test(url.protocol) || (location && url.origin === location.origin && location.origin !== 'null')
    if (isLocal) {
      if (!originalFetch) throw new TypeError('当前环境不支持本地资源 fetch')
      return originalFetch(input, init)
    }
    if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('安卓端仅支持不含账号信息的 HTTPS 接口地址')
    if (init && init.body != null && typeof init.body !== 'string' && !(typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams)) {
      throw new TypeError('安卓网络桥仅支持 UTF-8 文本请求体')
    }
    const req = new Request(input && typeof input === 'object' && 'url' in input ? input : url.href, init)
    const type = (req.headers.get('content-type') || '').toLowerCase()
    if (req.body && /^(?:image\/|audio\/|video\/|multipart\/|application\/octet-stream)/.test(type)) {
      throw new TypeError('安卓网络桥仅支持 UTF-8 文本请求体')
    }
    if (req.signal.aborted) throw abortError()
    const body = req.body ? await req.text() : null
    if (req.signal.aborted) throw abortError()
    const headers = {}
    req.headers.forEach((value, key) => { headers[key] = value })
    const requestId = id('net_')
    const encoder = new TextEncoder()
    const requestJson = JSON.stringify({ url: req.url, method: req.method, headers, body, redirect: 'manual' })
    if (encoder.encode(requestJson).length > 32 * 1024 * 1024) {
      throw new Error('本次请求内容超过 32 MB，请减少图片或资料后重试。')
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, controller: null, response: false, signal: req.signal, onAbort: null, noBody: false, method: req.method }
      entry.onAbort = function () {
        if (!networkRequests.has(requestId)) return
        networkRequests.delete(requestId)
        req.signal.removeEventListener('abort', entry.onAbort)
        cancelNative(requestId)
        const err = abortError()
        if (entry.response) {
          if (entry.controller && !entry.noBody) { try { entry.controller.error(err) } catch (_err) {} }
        } else reject(err)
      }
      entry.stream = new ReadableStream({
        start(controller) { entry.controller = controller },
        cancel() {
          if (!networkRequests.has(requestId)) return
          networkRequests.delete(requestId)
          req.signal.removeEventListener('abort', entry.onAbort)
          cancelNative(requestId)
        }
      })
      entry.encoder = encoder
      networkRequests.set(requestId, entry)
      req.signal.addEventListener('abort', entry.onAbort, { once: true })
      if (req.signal.aborted) { entry.onAbort(); return }
      try {
        const accepted = native.request(requestId, requestJson)
        if (accepted === false) throw new Error('原生网络请求未启动')
      } catch (err) {
        if (!networkRequests.has(requestId)) return
        networkRequests.delete(requestId)
        req.signal.removeEventListener('abort', entry.onAbort)
        if (entry.response && !entry.noBody) entry.controller.error(err)
        else if (!entry.response) reject(err)
      }
    })
  }
  window.fetch = mobileFetch

  // 原生接口统一事件入口。无效或已结束的 id 直接丢弃。
  window.__nativeEvent = function (json) {
    let event
    try { event = typeof json === 'string' ? JSON.parse(json) : json } catch (_err) { return }
    if (!event || typeof event.id !== 'string') return
    const requestId = event.id
    const picker = pickRequests.get(requestId)
    if (picker && (event.type === 'files' || event.type === 'error')) {
      pickRequests.delete(requestId)
      if (event.type === 'error') picker.reject(new Error(String(event.message || '选择文件失败')))
      else picker.resolve(Array.isArray(event.files) ? event.files : [])
      return
    }
    const entry = networkRequests.get(requestId)
    if (!entry) return
    const finish = function () {
      networkRequests.delete(requestId)
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
    const fail = function (err) {
      finish()
      if (entry.response) {
        if (!entry.noBody) { try { entry.controller.error(err) } catch (_err) {} }
      } else entry.reject(err)
    }
    if (event.type === 'headers') {
      if (entry.response) { fail(new TypeError('原生网络响应头重复')); cancelNative(requestId); return }
      try {
        const status = Number(event.status)
        if (!Number.isInteger(status) || status < 200 || status > 599) throw new TypeError('原生网络响应状态无效')
        entry.noBody = entry.method === 'HEAD' || status === 204 || status === 205 || status === 304
        const options = { status }
        if (event.headers && typeof event.headers === 'object') options.headers = event.headers
        const response = new Response(entry.noBody ? null : entry.stream, options)
        entry.response = true
        entry.resolve(response)
      } catch (err) { fail(err); cancelNative(requestId) }
    } else if (event.type === 'chunk') {
      if (!entry.response) { fail(new TypeError('原生网络数据早于响应头')); cancelNative(requestId); return }
      if (!entry.noBody) {
        try { entry.controller.enqueue(entry.encoder.encode(String(event.text == null ? '' : event.text))) }
        catch (err) { fail(err); cancelNative(requestId) }
      }
    } else if (event.type === 'end') {
      if (!entry.response) { fail(new TypeError('原生网络响应缺少响应头')); return }
      finish()
      if (!entry.noBody) { try { entry.controller.close() } catch (_err) {} }
    } else if (event.type === 'error') {
      fail(new TypeError(String(event.message || '网络请求失败')))
    }
  }

  async function asset(path) {
    safePath(path)
    if (typeof native.readAsset === 'function') {
      const text = native.readAsset(path)
      if (text != null) return String(text)
    }
    if (!originalFetch) throw new Error('无法读取应用内置资源：' + path)
    const response = await originalFetch(path)
    if (!response.ok) throw new Error('无法读取应用内置资源：' + path)
    return response.text()
  }
  async function assetArray(path) {
    let parsed
    try { parsed = JSON.parse(await asset(path)) } catch (_err) { throw new Error('无法读取或解析应用内置资源：' + path) }
    if (!Array.isArray(parsed)) throw new Error('内置资源格式错误：' + path)
    return parsed
  }

  class MobileTextbooks {
    constructor(items, contents) { this.items = items; this.contents = contents }
    list() { return this.items.map((meta) => Object.assign({}, meta, { chars: this.contents[meta.id].length })) }
    read(id) {
      const meta = this.items.find((item) => item.id === String(id))
      if (!meta) throw new Error('教材不存在：' + id)
      return { meta: clone(meta), content: this.contents[meta.id] }
    }
    toc(id) {
      const { meta, content } = this.read(id)
      return core().tocEntries(core().splitSections(content, { docId: 'tb:' + meta.id, title: '内置教材《' + meta.title + '》' }))
    }
    documents() {
      return this.items.map((meta) => ({ id: 'tb:' + meta.id, source: '内置教材《' + meta.title + '》', subject: meta.subject, grade: meta.grade, kind: 'textbook', content: this.contents[meta.id] }))
    }
  }
  let textbookPromise = null
  function loadTextbooks() {
    if (!textbookPromise) {
      textbookPromise = (async function () {
        const raw = await assetArray('assets/textbooks/index.json')
        const items = raw.filter((item) => item && item.id && item.file).map((item, index) => {
          const file = String(item.file)
          if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.md$/i.test(file) || file.includes('..')) throw new Error('教材文件名无效')
          return { id: String(item.id), subject: String(item.subject || ''), grade: String(item.grade || ''), version: String(item.version || ''), title: String(item.title || item.id), file, order: Number.isFinite(Number(item.order)) ? Number(item.order) : index, builtin: true }
        }).sort((a, b) => a.order - b.order)
        if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('教材编号重复')
        const contents = Object.create(null)
        await Promise.all(items.map(async (meta) => { contents[meta.id] = await asset('assets/textbooks/' + meta.file) }))
        return new MobileTextbooks(items, contents)
      })().catch((err) => { textbookPromise = null; throw err })
    }
    return textbookPromise
  }

  function hashCode(str) { let h = 0; for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return h }
  function shuffle(items, seed) {
    let n = hashCode(seed) || Date.now()
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      n = (n + 0x6d2b79f5) | 0
      let t = Math.imul(n ^ (n >>> 15), 1 | n)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      const j = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  class MobileBank {
    constructor(items) { this.items = items.filter((q) => q && q.stem && String(q.stem).trim()) }
    all() { return this.items }
    list(subject) { return subject ? this.items.filter((q) => q.subject === subject) : this.items }
    pick(subject, grade, count, seed) {
      let pool = this.list(subject)
      if (!pool.length) pool = this.all()
      if (grade) { const matching = pool.filter((q) => !q.grade || q.grade === grade); if (matching.length >= 2) pool = matching }
      return shuffle(pool, seed).slice(0, Number(count) || 5).map((q, i) => core().normalizeQuestion(q, i))
    }
  }
  let bankPromise = null
  function loadBank() {
    if (!bankPromise) bankPromise = assetArray('assets/quizbank/index.json').then((items) => new MobileBank(items)).catch((err) => { bankPromise = null; throw err })
    return bankPromise
  }

  function byteLength(text) { return new TextEncoder().encode(text).length }
  function imageInfo(value) {
    const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(String(value || ''))
    if (!match) throw new Error('图片数据格式不正确')
    const mime = match[1].toLowerCase()
    if (!imageTypes[mime]) throw new Error('暂不支持该图片格式，请上传 PNG/JPG/WEBP 图片')
    const data = match[2]
    if (data.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('图片过大（超过 12MB），请压缩后再上传')
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('图片数据格式不正确')
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
    const size = (data.length / 4) * 3 - padding
    if (!size) throw new Error('图片内容为空')
    if (size > MAX_BYTES) throw new Error('图片过大（超过 12MB），请压缩后再上传')
    return { size, ext: imageTypes[mime] }
  }
  function validText(text) {
    if (text.length > MAX_TEXT) throw new Error('文本内容过大，请拆分后再上传')
    if (byteLength(text) > MAX_BYTES) throw new Error('材料过大（超过 12MB）')
  }
  const materialIndex = 'data/materials/index.json'
  function materialItems() {
    const items = readJson(materialIndex, [])
    if (!Array.isArray(items)) throw new Error('应用私有数据格式错误：' + materialIndex)
    return items
  }
  function materialFile(item) {
    const path = String(item.imagePath || '')
    if (!/^uploads\/mat_[A-Za-z0-9_]+\.data$/.test(path)) throw new Error('材料图片路径无效')
    return 'data/materials/' + path
  }
  function normalizeMaterial(item) {
    return { id: String(item.id), name: String(item.name || '未命名材料'), kind: Object.prototype.hasOwnProperty.call(kinds, item.kind) ? item.kind : 'other', subject: core().SUBJECTS.includes(item.subject) ? item.subject : '', createdAt: Number(item.createdAt) || Date.now(), size: Number(item.size) || 0, imagePath: item.imagePath ? String(item.imagePath) : '', text: typeof item.text === 'string' ? item.text : '', hasFile: Boolean(item.imagePath) }
  }
  function findMaterial(items, materialId) {
    const item = items.find((it) => it.id === String(materialId))
    if (!item) throw new Error('材料不存在')
    return item
  }
  const materials = {
    list() {
      return materialItems().map(normalizeMaterial).sort((a, b) => b.createdAt - a.createdAt).map((item) => {
        item.preview = item.text ? item.text.slice(0, 120) : item.hasFile ? '（图片材料）' : ''
        item.textLength = item.text.length
        delete item.text
        return item
      })
    },
    add(payload) {
      const data = payload || {}
      const kind = Object.prototype.hasOwnProperty.call(kinds, data.kind) ? data.kind : 'other'
      const subject = core().SUBJECTS.includes(data.subject) ? data.subject : ''
      const item = { id: id('mat_'), name: (String(data.name || '').trim() || kinds[kind] + ' ' + new Date().toLocaleDateString('zh-CN')).slice(0, 120), kind, subject, createdAt: Date.now(), size: 0, imagePath: '', text: '' }
      if (data.dataUrl) {
        const image = imageInfo(data.dataUrl)
        item.imagePath = 'uploads/' + item.id + '.data'
        item.size = image.size
      }
      if (typeof data.text === 'string' && data.text.trim()) {
        validText(data.text)
        const textBytes = byteLength(data.text)
        if (item.size + textBytes > MAX_BYTES) throw new Error('材料过大（超过 12MB）')
        item.text = data.text
        item.size = Math.max(item.size, textBytes)
      }
      if (!item.imagePath && !item.text) throw new Error('材料内容为空（请上传图片或粘贴文本）')
      const items = materialItems()
      if (item.imagePath) writeFile(materialFile(item), data.dataUrl)
      try { writeJson(materialIndex, items.concat([item])) } catch (err) {
        if (item.imagePath) { try { deleteFile(materialFile(item)) } catch (_err) {} }
        throw err
      }
      return normalizeMaterial(item)
    },
    remove(materialId) {
      const items = materialItems()
      const item = findMaterial(items, materialId)
      const file = item.imagePath ? materialFile(item) : null
      writeJson(materialIndex, items.filter((it) => it.id !== item.id))
      if (file) {
        try { if (readFile(file) !== null) deleteFile(file) } catch (err) {
          try { writeJson(materialIndex, items) } catch (_err) {}
          throw err
        }
      }
      return true
    },
    readText(materialId) { return findMaterial(materialItems(), materialId).text || '' },
    toc(materialId) {
      const item = findMaterial(materialItems(), materialId)
      if (!item.text) return []
      return core().tocEntries(core().splitSections(item.text, { docId: 'mat:' + item.id, title: item.name }))
    },
    imageDataUrl(materialId) {
      const item = materialItems().find((it) => it.id === String(materialId))
      if (!item || !item.imagePath) return null
      return readFile(materialFile(item))
    },
    imageDataUrls(ids) { return (Array.isArray(ids) ? ids : []).map((materialId) => this.imageDataUrl(materialId)).filter(Boolean) },
    documents(ids) {
      // 未明确选择材料时绝不静默把私有文字带进模型提示词。
      if (!Array.isArray(ids) || !ids.length) return []
      const wanted = new Set(ids)
      return materialItems().filter((item) => wanted.has(item.id) && item.text).map((item) => ({ id: 'mat:' + item.id, source: '我的材料《' + item.name + '》（' + (kinds[item.kind] || '其他') + '）', subject: item.subject, grade: '', kind: 'material', content: item.text }))
    }
  }

  function pickedFile(file, imageOnly) {
    if (!file || typeof file !== 'object') throw new Error('选择的文件无效')
    const name = String(file.name || '未命名文件').split(/[\\/]/).pop()
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
    const size = Number(file.size) || 0
    if (size < 0 || size > MAX_BYTES) throw new Error(name + ' 超过 12MB，请压缩后再上传')
    if (file.unsupported) throw new Error(String(file.hint || '暂不支持解析该文件，请截图或复制文本后上传'))
    const out = { name, ext, size }
    if (file.dataUrl) {
      const info = imageInfo(file.dataUrl)
      out.size = info.size
      out.dataUrl = String(file.dataUrl)
    } else if (!imageOnly && typeof file.text === 'string') {
      validText(file.text)
      out.text = file.text
      if (['docx', 'pptx', 'xlsx'].includes(ext)) out.converted = true
    } else throw new Error(imageOnly ? '请选择支持的图片' : '暂不支持解析该文件，请截图或复制文本后上传')
    return out
  }
  function pick(mode) {
    return new Promise((resolve, reject) => {
      const requestId = id('pick_')
      pickRequests.set(requestId, { resolve, reject })
      try {
        if (native.pickFiles(requestId, mode) === false) throw new Error('文件选择器未启动')
      } catch (err) { if (pickRequests.delete(requestId)) reject(err) }
    })
  }

  // 多选时逐个校验：单个文件不合格只标记它自己，不影响同一批里的其他文件。
  function pickedFiles(files, imageOnly, max) {
    const raw = Array.isArray(files) ? files : []
    const list = max > 0 ? raw.slice(0, max) : raw
    return list.map((file) => {
      try {
        return pickedFile(file, imageOnly)
      } catch (err) {
        return {
          name: String((file && file.name) || '未命名文件').split(/[\\/]/).pop(),
          ext: String((file && file.name) || '').split('.').pop().toLowerCase(),
          size: 0,
          error: err && err.message ? err.message : '文件不可用'
        }
      }
    })
  }

  function getStore() { return record(readJson('data/store.json', {}), 'store.json') }
  const store = {
    get(key) { const data = getStore(); return Object.prototype.hasOwnProperty.call(data, String(key)) ? clone(data[String(key)]) : null },
    set(key, value) {
      const data = getStore()
      Object.defineProperty(data, String(key), { value: clone(value), writable: true, enumerable: true, configurable: true })
      writeJson('data/store.json', data)
      return value
    },
    remove(key) { const data = getStore(); delete data[String(key)]; writeJson('data/store.json', data); return true },
    list(prefix) { const keys = Object.keys(getStore()); return prefix ? keys.filter((key) => key.startsWith(String(prefix))) : keys }
  }
  const dataApi = {
    settings: {
      get() { return core().normalizeSettings(record(readJson('data/settings.json', {}), 'settings.json')) },
      save(patch) { const next = core().normalizeSettings(core().deepMerge(this.get(), patch || {})); writeJson('data/settings.json', next); return next }
    },
    profile: {
      get() { return core().normalizeProfile(record(readJson('data/profile.json', {}), 'profile.json')) },
      save(profile) { const next = core().normalizeProfile(profile || {}); writeJson('data/profile.json', next); return next }
    },
    scores: {
      get() { return core().normalizeScores(record(readJson('data/scores.json', {}), 'scores.json')) },
      save(scores) { const next = core().normalizeScores(scores || {}); writeJson('data/scores.json', next); return next }
    }
  }

  let gatewayPromise = null
  function emitAI(event) {
    if (event && (event.type === 'done' || event.type === 'error')) aiJobs.delete(event.requestId)
    for (const listener of Array.from(aiListeners)) { try { listener(event) } catch (_err) { /* 一个监听器不能影响其他任务 */ } }
  }
  function loadGateway() {
    if (!gatewayPromise) gatewayPromise = Promise.all([loadTextbooks(), loadBank()]).then(([textbooks, bank]) => {
      const retriever = new (core().Retriever)(textbooks, materials)
      return new (core().AiGateway)({ getSettings: () => dataApi.settings.get(), getProfile: () => dataApi.profile.get(), getScores: () => dataApi.scores.get(), getProgress: () => store.get('progress') || {}, retriever, materials, bank, send: emitAI })
    }).catch((err) => { gatewayPromise = null; throw err })
    return gatewayPromise
  }
  function startAI(req) {
    const messages = req && Array.isArray(req.messages) ? req.messages : []
    for (const message of messages) {
      if (message && Array.isArray(message.images)) {
        for (const image of message.images) {
          if (typeof image === 'string' && image.startsWith('data:image/')) imageInfo(image)
        }
      }
    }
    const request = clone(req || {})
    const requestId = id('req_')
    const job = { cancelled: false, gateway: null }
    aiJobs.set(requestId, job)
    // 宏任务确保 renderer await start 后有机会先登记 requestId。
    setTimeout(async function () {
      try {
        const gateway = await loadGateway()
        if (job.cancelled) return
        job.gateway = gateway
        await gateway.start(requestId, request)
      } catch (err) {
        if (!job.cancelled) emitAI({ requestId, type: 'error', code: 'unknown', message: err && err.message ? err.message : String(err) })
      } finally { if (aiJobs.get(requestId) === job) aiJobs.delete(requestId) }
    }, 0)
    return { requestId }
  }
  function abortAI(requestId) {
    const key = String(requestId)
    const job = aiJobs.get(key)
    if (!job) return false
    if (job.gateway) return job.gateway.abort(key)
    job.cancelled = true
    aiJobs.delete(key)
    setTimeout(() => emitAI({ requestId: key, type: 'error', code: 'aborted', message: '已停止生成' }), 0)
    return true
  }
  // preload.js 的每个调用均返回 Promise；保持异步错误语义。
  const call = (fn) => (...args) => Promise.resolve().then(() => fn(...args))
  window.api = {
    app: {
      info: call(() => ({ version: '1.3.5-android.1', userDataPath: '安卓应用私有目录', dataPath: '应用私有目录/data', packaged: true, today: new Date().toISOString().slice(0, 10), platform: 'android', subjects: clone(core().SUBJECTS), textbookVersions: clone(core().TEXTBOOK_VERSIONS) })),
      openDataFolder: call(() => { throw new Error('安卓应用私有数据目录不能直接打开') }),
      openExternal: call((value) => {
        const url = String(value || '')
        if (!/^https?:\/\//i.test(url)) throw new Error('只允许打开 http/https 链接')
        const parsed = new URL(url)
        if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error('链接地址无效')
        if (native.openExternal(parsed.href) === false) throw new Error('打开链接失败')
        return true
      })
    },
    settings: { get: call(() => dataApi.settings.get()), save: call((v) => dataApi.settings.save(v)) },
    profile: { get: call(() => dataApi.profile.get()), save: call((v) => dataApi.profile.save(v)) },
    scores: { get: call(() => dataApi.scores.get()), save: call((v) => dataApi.scores.save(v)) },
    materials: { list: call(() => materials.list()), add: call((v) => materials.add(v)), remove: call((v) => materials.remove(String(v))), readText: call((v) => materials.readText(String(v))), toc: call((v) => materials.toc(String(v))) },
    textbooks: { list: async () => (await loadTextbooks()).list(), read: async (v) => (await loadTextbooks()).read(String(v)), toc: async (v) => (await loadTextbooks()).toc(String(v)) },
    bank: { list: async (subject) => clone((await loadBank()).list(subject)) },
    ai: { start: call(startAI), abort: call(abortAI), onEvent(listener) { if (typeof listener !== 'function') throw new TypeError('监听器必须为函数'); aiListeners.add(listener); return () => aiListeners.delete(listener) } },
    store: { get: call((v) => store.get(v)), set: call((k, v) => store.set(k, v)), remove: call((v) => store.remove(v)), list: call((v) => store.list(v)) },
    dialog: { pickMaterial: async () => { const files = await pick('material'); return files.length ? pickedFiles(files, false) : null }, pickImages: async () => pickedFiles((await pick('images')).slice(0, 6), true, 6) }
  }
})(window)
