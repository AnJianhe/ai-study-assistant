'use strict'
// 在独立 Electron 进程中，以 390×844 视口和内存模拟桥检查 Android 页面。
// 它不是 Android 真机测试，不访问真实用户数据或外部网络。
const { app, BrowserWindow, ipcMain, session, net } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const assert = require('assert')

const assets = path.resolve(__dirname, '../app/build/generated/studyAssets')
const data = new Map()
const temp = path.join(os.tmpdir(), 'study-android-ui-test-' + process.pid)
fs.mkdirSync(temp, { recursive: true })
app.setPath('userData', temp)

function safeAsset(relative) {
  const full = path.resolve(assets, String(relative))
  return full.startsWith(assets + path.sep) ? full : null
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(win, expression, message, limit = 10000) {
  const until = Date.now() + limit
  let result
  while (Date.now() < until) {
    result = await win.webContents.executeJavaScript(expression)
    if (result) return result
    await pause(80)
  }
  throw new Error(message)
}
async function evaluate(win, code) { return win.webContents.executeJavaScript(code, true) }
async function navigate(win, route) {
  await evaluate(win, `document.querySelector('[data-act="nav"][data-route="${route}"]').click()`)
  await waitFor(win, `location.hash === '#/${route}'`, '页面未打开：' + route)
  await pause(80)
}

app.whenReady().then(async () => {
  ipcMain.on('android-test:asset', (event, relative) => {
    const file = safeAsset(relative)
    try { event.returnValue = file ? fs.readFileSync(file, 'utf8') : null } catch (_err) { event.returnValue = null }
  })
  ipcMain.on('android-test:file', (event, op, key, value) => {
    if (op === 'read') event.returnValue = data.has(key) ? data.get(key) : null
    else if (op === 'write') { data.set(key, value); event.returnValue = true }
    else if (op === 'delete') { data.delete(key); event.returnValue = true }
    else event.returnValue = false
  })
  session.defaultSession.protocol.handle('https', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'appassets.androidplatform.net' || !url.pathname.startsWith('/assets/')) {
      return new Response('测试禁止外部网络', { status: 403 })
    }
    let relative
    try { relative = decodeURIComponent(url.pathname.slice('/assets/'.length)) } catch (_err) { return new Response('', { status: 400 }) }
    const file = safeAsset(relative)
    if (!file || !fs.existsSync(file)) return new Response('', { status: 404 })
    return net.fetch(pathToFileURL(file).href)
  })
  const win = new BrowserWindow({
    show: false, width: 390, height: 844, useContentSize: true,
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), nodeIntegration: false, contextIsolation: false, sandbox: false }
  })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) errors.push(message) })
  await win.loadURL('https://appassets.androidplatform.net/assets/index.html')
  await waitFor(win, `!!document.querySelector('[data-act="welcome-skip"]')`, '欢迎页未启动')
  await evaluate(win, `document.querySelector('[data-act="welcome-skip"]').click()`)
  await waitFor(win, `location.hash === '#/home'`, '跳过引导后未进入学习台')
  const nav = await evaluate(win, `Array.from(document.querySelectorAll('.nav-item')).map(el => ({route:el.dataset.route, text:el.innerText.trim(), width:el.getBoundingClientRect().width, height:el.getBoundingClientRect().height}))`)
  assert.strictEqual(nav.length, 7)
  assert.ok(nav.every((n) => n.text && n.width >= 44 && n.height >= 44), JSON.stringify(nav))
  console.log('PASS：欢迎页和七个手机导航入口')

  for (const route of ['quiz', 'report', 'progress', 'library', 'assistant', 'settings', 'home']) {
    await navigate(win, route)
    const geometry = await evaluate(win, `({width:innerWidth, scroll:document.documentElement.scrollWidth})`)
    assert.ok(geometry.scroll <= geometry.width + 1, `${route} 页面横向溢出: ${JSON.stringify(geometry)}`)
  }
  console.log('PASS：七个页面打开且无整页横向溢出')

  await navigate(win, 'library')
  const books = await evaluate(win, `document.querySelectorAll('.book-card').length`)
  assert.strictEqual(books, 14)
  await evaluate(win, `document.querySelector('[data-act="textbook-toc"]').click()`)
  await waitFor(win, `!!document.querySelector('.modal .toc-row')`, '教材目录未打开')
  await evaluate(win, `document.querySelector('[data-act="modal-close"]').click()`)
  console.log('PASS：内置教材和章节目录')

  const dataResult = await evaluate(win, `(async () => {
    await window.api.store.set('androidTest', { answer: 42 });
    await window.api.scores.save({subjects: {'数学': {score: 0, full: 100}, '语文': {skipped:true, score: 0}}});
    const scores = await window.api.scores.get();
    const item = await window.api.materials.add({name:'测试材料', kind:'handout', subject:'数学', text:'# 分数\\n分数的分母不能为零。'});
    return {saved:await window.api.store.get('androidTest'), scores:scores.subjects, items:(await window.api.materials.list()).length, toc:(await window.api.materials.toc(item.id)).length};
  })()`)
  assert.strictEqual(dataResult.saved.answer, 42)
  assert.strictEqual(dataResult.scores.数学.score, 0)
  assert.strictEqual(dataResult.scores.语文.skipped, true)
  assert.strictEqual(dataResult.scores.语文.score, null)
  assert.ok(dataResult.items && dataResult.toc)
  await evaluate(win, `(async () => { await window.api.settings.save({api:{baseUrl:'https://mock.example', apiKey:'fake-test-key', model:'mock'}, ai:{stream:true,webSearch:false}, learning:{autoToc:false}}) })()`)
  const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  win.webContents.reload()
  await reloaded
  await waitFor(win, `!!document.querySelector('[data-act="nav"][data-route="assistant"]')`, '重启后未加载')
  assert.strictEqual(await evaluate(win, `(async () => (await window.api.store.get('androidTest')).answer)()`), 42)
  console.log('PASS：资料、目录、0 分与跳过、本地重启持久化')

  await navigate(win, 'assistant')
  await evaluate(win, `(() => { const el = document.querySelector('#chat-input'); el.value = '帮我复习分数'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await evaluate(win, `document.querySelector('[data-act="chat-send"]').click()`)
  await waitFor(win, `document.body.innerText.includes('安卓模拟回答')`, '模拟流式聊天未完成')
  const stats = await evaluate(win, `window.__androidTestStats`)
  assert.ok(stats.requests >= 1 && stats.chunks >= 2, JSON.stringify(stats))
  console.log('PASS：使用合成接口的流式聊天')
  if (errors.length) console.log('页面控制台提示（供人工复核）：' + JSON.stringify(errors))
  console.log('安卓页面模拟测试全部通过（非真机）')
  win.destroy()
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
