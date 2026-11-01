'use strict'
// 仅用于桌面 Electron 中的移动页面模拟；所有数据与响应都是内存中的合成数据。
const { ipcRenderer } = require('electron')
const files = new Map()
const stats = { requests: 0, chunks: 0 }
function event(id, type, extra) {
  if (typeof window.__nativeEvent === 'function') window.__nativeEvent(JSON.stringify(Object.assign({ id, type }, extra || {})))
}
window.__androidTestStats = stats
window.StudyNative = {
  readAsset(path) { return ipcRenderer.sendSync('android-test:asset', path) },
  readFile(path) { return ipcRenderer.sendSync('android-test:file', 'read', path) },
  writeFile(path, text) { return ipcRenderer.sendSync('android-test:file', 'write', path, text) },
  deleteFile(path) { return ipcRenderer.sendSync('android-test:file', 'delete', path) },
  listFiles() { return '[]' },
  request(id, json) {
    stats.requests++
    const req = JSON.parse(json)
    if (req.url !== 'https://mock.example/v1/chat/completions') {
      setTimeout(() => event(id, 'error', { message: '测试拒绝非模拟地址' }), 0)
      return true
    }
    const body = JSON.parse(req.body)
    setTimeout(() => event(id, 'headers', { status: 200 }), 5)
    if (body.stream) {
      const chunks = ['安卓', '模拟回答']
      chunks.forEach((text, index) => setTimeout(() => {
        stats.chunks++
        event(id, 'chunk', { text: 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n' })
      }, 30 + index * 35))
      setTimeout(() => { event(id, 'chunk', { text: 'data: [DONE]\n\n' }); event(id, 'end') }, 110)
    } else {
      setTimeout(() => { event(id, 'chunk', { text: JSON.stringify({ choices: [{ message: { content: '安卓模拟回答' } }] }) }); event(id, 'end') }, 25)
    }
    return true
  },
  cancelRequest() { return true },
  openExternal() { return true },
  pickFiles(id) { setTimeout(() => event(id, 'files', { files: [] }), 0); return true }
}
