'use strict'
// 极简 CDP 客户端：在测试时后台控制渲染进程（不占用真实鼠标）。
const fs = require('fs')

const PORT = Number(process.env.CDP_PORT || 9222)

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page' && !String(t.url).startsWith('devtools://'))
  if (!page) throw new Error('找不到页面目标: ' + JSON.stringify(targets.map((t) => t.url)))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params: params || {} }))
    })
  }
  return { send, ws, url: page.url }
}

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails
    throw new Error('页面脚本异常: ' + (detail.exception && detail.exception.description ? detail.exception.description : detail.text))
  }
  return res.result ? res.result.value : undefined
}

async function screenshot(send, file) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'))
  return file
}

module.exports = { connect, evaluate, screenshot }
