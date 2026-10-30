'use strict'
// 安全桥梁：渲染进程只能通过 window.api 访问主进程能力，API Key 永不出主进程。
const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

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
