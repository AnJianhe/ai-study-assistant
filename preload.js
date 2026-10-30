'use strict'
// 安全桥梁：渲染进程只能通过 window.api 访问主进程能力，API Key 永不出主进程。
const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => {
  // IPC 参数必须是可结构化克隆的纯数据：统一做一次 JSON 深拷贝，
  // 避免 Proxy / 函数 / DOM 引用等导致 "An object could not be cloned."
  const safeArgs = args.map((arg) => {
    if (arg === undefined || arg === null || typeof arg !== 'object') return arg
    try {
      return JSON.parse(JSON.stringify(arg))
    } catch (err) {
      return arg
    }
  })
  try {
    return ipcRenderer.invoke(channel, ...safeArgs)
  } catch (err) {
    try {
      ipcRenderer.send('client:error', {
        channel: channel,
        message: String((err && err.message) || err)
      })
    } catch (_ignore) {
      /* 上报失败不影响原错误抛出 */
    }
    throw err
  }
}

const api = {
  app: {
    info: () => invoke('app:info'),
    openDataFolder: () => invoke('app:openDataFolder'),
    openExternal: (url) => invoke('app:openExternal', url)
  },
  settings: {
    get: () => invoke('settings:get'),
    save: (patch) => invoke('settings:save', patch)
  },
  profile: {
    get: () => invoke('profile:get'),
    save: (profile) => invoke('profile:save', profile)
  },
  scores: {
    get: () => invoke('scores:get'),
    save: (scores) => invoke('scores:save', scores)
  },
  materials: {
    list: () => invoke('materials:list'),
    add: (payload) => invoke('materials:add', payload),
    remove: (id) => invoke('materials:remove', id),
    readText: (id) => invoke('materials:readText', id)
  },
  textbooks: {
    list: () => invoke('textbooks:list'),
    read: (id) => invoke('textbooks:read', id)
  },
  bank: {
    list: (subject) => invoke('bank:list', subject)
  },
  ai: {
    start: (req) => invoke('ai:start', req),
    abort: (requestId) => invoke('ai:abort', requestId),
    onEvent: (cb) => {
      const handler = (_event, payload) => {
        try { cb(payload) } catch (err) { console.error('[ai:event] handler error', err) }
      }
      ipcRenderer.on('ai:event', handler)
      return () => ipcRenderer.removeListener('ai:event', handler)
    }
  },
  store: {
    get: (key) => invoke('store:get', key),
    set: (key, value) => invoke('store:set', key, value),
    remove: (key) => invoke('store:remove', key),
    list: (prefix) => invoke('store:list', prefix)
  },
  dialog: {
    pickMaterial: () => invoke('dialog:pickMaterial'),
    pickImages: () => invoke('dialog:pickImages')
  }
}

contextBridge.exposeInMainWorld('api', api)
