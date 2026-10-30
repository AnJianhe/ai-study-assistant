'use strict'
// 主进程：窗口、本地数据、IPC 后端。API Key 与网络请求都留在这里，渲染进程拿不到。
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const { JsonFile, KeyValueStore, ensureDir, clone } = require('./lib/store')
const {
  normalizeSettings,
  normalizeProfile,
  normalizeScores,
  deepMerge,
  TEXTBOOK_VERSIONS,
  SUBJECTS
} = require('./lib/settings')
const { TextbookLibrary } = require('./lib/textbooks')
const { MaterialStore } = require('./lib/materials')
const { Retriever } = require('./lib/retrieval')
const { QuizBank } = require('./lib/quizbank')
const { AiGateway } = require('./lib/ai')

const APP_ROOT = app.getAppPath()
const ASSETS_DIR = path.join(APP_ROOT, 'assets')

// 固定英文数据目录（%APPDATA%\AIStudyAssistant），避免中文路径在个别环境下的兼容问题
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'AIStudyAssistant'))
} catch (err) {
  console.error('[app] 设置数据目录失败，使用默认目录:', err.message)
}

const DATA_DIR = path.join(app.getPath('userData'), 'data')
ensureDir(DATA_DIR)

const DEBUG_LOG = path.join(DATA_DIR, 'debug.log')
function logDebug() {
  try {
    const line = new Date().toISOString() + ' ' + Array.prototype.slice.call(arguments).map(String).join(' ') + '\n'
    fs.appendFileSync(DEBUG_LOG, line, 'utf8')
  } catch (_err) {
    /* 调试日志失败不影响主流程 */
  }
}

const settingsFile = new JsonFile(path.join(DATA_DIR, 'settings.json'), normalizeSettings({}))
const profileFile = new JsonFile(path.join(DATA_DIR, 'profile.json'), normalizeProfile({}))
const scoresFile = new JsonFile(path.join(DATA_DIR, 'scores.json'), normalizeScores({}))
const kvStore = new KeyValueStore(path.join(DATA_DIR, 'store.json'))
const textbooks = new TextbookLibrary(ASSETS_DIR)
const materials = new MaterialStore(path.join(DATA_DIR, 'materials'))
const retriever = new Retriever(textbooks, materials)
const bank = new QuizBank(ASSETS_DIR)

let mainWindow = null

const gateway = new AiGateway({
  getSettings: () => normalizeSettings(settingsFile.read()),
  getProfile: () => normalizeProfile(profileFile.read()),
  getScores: () => normalizeScores(scoresFile.read()),
  retriever,
  materials,
  bank,
  send: (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:event', event)
    }
  }
})

// 保证窗口一定落在某个显示器的可用区域内：窗口跑到屏幕外会导致"界面点不了"
function ensureWindowVisible(win) {
  try {
    const bounds = win.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const area = display.workArea
    const width = Math.min(bounds.width, area.width)
    const height = Math.min(bounds.height, area.height)
    let x = bounds.x
    let y = bounds.y
    if (x + width > area.x + area.width) x = area.x + area.width - width
    if (y + height > area.y + area.height) y = area.y + area.height - height
    if (x < area.x) x = area.x
    if (y < area.y) y = area.y
    if (x !== bounds.x || y !== bounds.y || width !== bounds.width || height !== bounds.height) {
      win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
      logDebug('[window] 窗口位置已校正:', JSON.stringify(win.getBounds()))
    }
  } catch (err) {
    logDebug('[window] 可见性校正失败:', err.message)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    center: true,
    show: false,
    title: 'AI学习助手',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    ensureWindowVisible(mainWindow)
    mainWindow.show()
    ensureWindowVisible(mainWindow)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logDebug('[renderer:' + level + ']', message, '(' + sourceId + ':' + line + ')')
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[window] 页面加载失败:', code, description, url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  if (!app.isPackaged) {
    if (process.env.STUDY_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
    try {
      mainWindow.webContents.debugger.attach('1.3')
      mainWindow.webContents.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.exceptionThrown') {
          const detail = params.exceptionDetails || {}
          const ex = detail.exception || {}
          logDebug('[exception]', ex.description || detail.text || JSON.stringify(detail).slice(0, 500))
        } else if (method === 'Runtime.consoleAPICalled') {
          const args = (params.args || [])
            .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
            .join(' ')
          logDebug('[console.' + params.type + ']', args.slice(0, 800))
        } else if (method === 'Log.entryAdded') {
          logDebug('[log]', params.entry && (params.entry.level + ' ' + params.entry.text))
        }
      })
      mainWindow.webContents.debugger.sendCommand('Runtime.enable').catch(() => {})
      mainWindow.webContents.debugger.sendCommand('Log.enable').catch(() => {})
    } catch (err) {
      logDebug('[debugger] attach 失败:', err.message)
    }
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const diag = await mainWindow.webContents.executeJavaScript(`(function(){
            const appEl = document.getElementById('app');
            return {
              ready: document.readyState,
              hasApi: typeof window.api,
              apiKeys: window.api ? Object.keys(window.api).join(',') : '',
              appClass: appEl ? appEl.className : '(none)',
              appHTMLLen: appEl ? appEl.innerHTML.length : -1,
              sidebar: Boolean(document.querySelector('.sidebar')),
              text: (document.body.innerText || '').slice(0, 300)
            };
          })()`)
          logDebug('[diag]', JSON.stringify(diag))
        } catch (err) {
          logDebug('[diag] 诊断脚本失败:', err.message)
        }
      }, 3000)
    })
  }
}

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: Object.assign({}, details.responseHeaders, {
        'Content-Security-Policy': [
          "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' data:; font-src 'self' data:;"
        ]
      })
    })
  })
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    dataPath: DATA_DIR,
    packaged: app.isPackaged,
    today: new Date().toISOString().slice(0, 10),
    platform: process.platform,
    subjects: SUBJECTS,
    textbookVersions: TEXTBOOK_VERSIONS
  }))

  ipcMain.handle('app:openDataFolder', async () => {
    await shell.openPath(DATA_DIR)
    return true
  })

  ipcMain.handle('app:openExternal', async (_event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('只允许打开 http/https 链接')
    await shell.openExternal(String(url))
    return true
  })

  ipcMain.handle('settings:get', () => normalizeSettings(settingsFile.read()))

  ipcMain.handle('settings:save', (_event, patch) => {
    const current = normalizeSettings(settingsFile.read())
    const next = normalizeSettings(deepMerge(current, patch || {}))
    settingsFile.write(next)
    return next
  })

  ipcMain.handle('profile:get', () => normalizeProfile(profileFile.read()))

  ipcMain.handle('profile:save', (_event, profile) => {
    const next = normalizeProfile(profile || {})
    profileFile.write(next)
    return next
  })

  ipcMain.handle('scores:get', () => normalizeScores(scoresFile.read()))

  ipcMain.handle('scores:save', (_event, scores) => {
    const next = normalizeScores(scores || {})
    scoresFile.write(next)
    return next
  })

  ipcMain.handle('materials:list', () => materials.list())
  ipcMain.handle('materials:add', (_event, payload) => materials.add(payload))
  ipcMain.handle('materials:remove', (_event, id) => {
    materials.remove(String(id))
    return true
  })
  ipcMain.handle('materials:readText', (_event, id) => materials.readText(String(id)))

  ipcMain.handle('textbooks:list', () => textbooks.list())
  ipcMain.handle('textbooks:read', (_event, id) => textbooks.read(String(id)))

  ipcMain.handle('bank:list', (_event, subject) => bank.list(subject))

  ipcMain.handle('store:get', (_event, key) => kvStore.get(String(key)))
  ipcMain.handle('store:set', (_event, key, value) => kvStore.set(String(key), value))
  ipcMain.handle('store:remove', (_event, key) => {
    kvStore.remove(String(key))
    return true
  })
  ipcMain.handle('store:list', (_event, prefix) => kvStore.list(prefix ? String(prefix) : undefined))

  ipcMain.handle('ai:start', (_event, req) => {
    const requestId = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    // 立刻返回 id，结果通过 ai:event 流式推送
    gateway.start(requestId, req || {}).catch((err) => {
      console.error('[ai] 未捕获错误:', err)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:event', {
          requestId,
          type: 'error',
          code: 'unknown',
          message: err && err.message ? err.message : String(err)
        })
      }
    })
    return { requestId }
  })

  ipcMain.handle('ai:abort', (_event, requestId) => gateway.abort(String(requestId)))

  ipcMain.handle('dialog:pickMaterial', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要上传的材料（图片 / 文本）',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
        { name: '文本', extensions: ['txt', 'md', 'markdown', 'csv', 'json', 'log'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const name = path.basename(filePath)
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
    const textExts = ['txt', 'md', 'markdown', 'csv', 'json', 'log']
    if (stat.size > 12 * 1024 * 1024 && imageExts.includes(ext)) {
      throw new Error('图片超过 12MB，请压缩后再上传')
    }
    if (imageExts.includes(ext)) {
      const buf = fs.readFileSync(filePath)
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext
      return {
        name,
        ext,
        size: stat.size,
        dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64')
      }
    }
    if (textExts.includes(ext)) {
      const text = fs.readFileSync(filePath, 'utf8')
      if (text.length > 300000) throw new Error('文本超过 30 万字符，请拆分后再上传')
      return { name, ext, size: stat.size, text }
    }
    return {
      name,
      ext,
      size: stat.size,
      unsupported: true,
      hint: 'PDF / Word / PPT 暂不支持直接解析：请截图后以图片上传，或复制文本粘贴。'
    }
  })

  ipcMain.handle('dialog:pickImages', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
    })
    if (result.canceled || !result.filePaths.length) return []
    const out = []
    for (const filePath of result.filePaths.slice(0, 6)) {
      const stat = fs.statSync(filePath)
      if (stat.size > 12 * 1024 * 1024) {
        throw new Error(path.basename(filePath) + ' 超过 12MB，请压缩后再上传')
      }
      const ext = path.extname(filePath).slice(1).toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext
      const buf = fs.readFileSync(filePath)
      out.push({
        name: path.basename(filePath),
        size: stat.size,
        dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64')
      })
    }
    return out
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.study.aiassistant')
    Menu.setApplicationMenu(null)
    applyContentSecurityPolicy()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
