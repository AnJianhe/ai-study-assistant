'use strict'
// 主进程：窗口、本地数据、IPC 后端。API Key 与网络请求都留在这里，渲染进程拿不到。
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const { JsonFile, KeyValueStore, ensureDir, clone } = require('./lib/store')
const { StudyDb } = require('./lib/db')
const { migrateLegacyData } = require('./lib/migrate')
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
const { canConvert, convertToMarkdown, legacyHint } = require('./lib/office')

const APP_ROOT = app.getAppPath()
const ASSETS_DIR = path.join(APP_ROOT, 'assets')

// 固定英文数据目录（%APPDATA%\AIStudyAssistant），避免中文路径在个别环境下的兼容问题
// 开发/测试可用 STUDY_USERDATA 环境变量指向独立目录，避免和已安装实例抢单实例锁
try {
  const customData = process.env.STUDY_USERDATA
  app.setPath('userData', customData ? String(customData) : path.join(app.getPath('appData'), 'AIStudyAssistant'))
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

// ---------- 数据库：全部学习数据存一个 .db 文件，便于备份和手机/电脑同步 ----------
// 用 sql.js（WebAssembly），不依赖原生编译，Electron 里不会因 ABI 不匹配崩溃。
const DB_FILE = path.join(DATA_DIR, 'study.db')
let db = null
let dbError = ''

// 旧版 JSON 存储（数据库不可用时的回退）
const jsonSettings = new JsonFile(path.join(DATA_DIR, 'settings.json'), normalizeSettings({}))
const jsonProfile = new JsonFile(path.join(DATA_DIR, 'profile.json'), normalizeProfile({}))
const jsonScores = new JsonFile(path.join(DATA_DIR, 'scores.json'), normalizeScores({}))
const jsonStore = new KeyValueStore(path.join(DATA_DIR, 'store.json'))

function recordRead(key, fallback) {
  if (db) {
    const value = db.get(key)
    return value === null ? clone(fallback) : value
  }
  if (key === 'settings') return jsonSettings.read()
  if (key === 'profile') return jsonProfile.read()
  if (key === 'scores') return jsonScores.read()
  return clone(fallback)
}

function recordWrite(key, data) {
  if (db) {
    db.set(key, data)
    return data
  }
  if (key === 'settings') return jsonSettings.write(data)
  if (key === 'profile') return jsonProfile.write(data)
  if (key === 'scores') return jsonScores.write(data)
  return data
}

const kvStore = {
  get: (key) => (db ? db.get(key) : jsonStore.get(key)),
  set: (key, value) => (db ? db.set(key, value) : jsonStore.set(key, value)),
  remove: (key) => (db ? db.remove(key) : jsonStore.remove(key)),
  list: (prefix) => (db ? db.keys(prefix) : jsonStore.list(prefix))
}

async function initDatabase() {
  try {
    db = await StudyDb.create(DB_FILE)
    const migrated = migrateLegacyData({ db, dataDir: DATA_DIR })
    materials.setDb(db)
    logDebug('[db] 数据库就绪', DB_FILE, JSON.stringify(migrated))
  } catch (err) {
    dbError = err && err.message ? err.message : String(err)
    db = null
    logDebug('[db] 数据库不可用，回退到 JSON 存储:', dbError)
  }
}

const textbooks = new TextbookLibrary(ASSETS_DIR)
const materials = new MaterialStore(path.join(DATA_DIR, 'materials'))
const retriever = new Retriever(textbooks, materials)
const bank = new QuizBank(ASSETS_DIR)

let mainWindow = null

const gateway = new AiGateway({
  getSettings: () => normalizeSettings(recordRead('settings', normalizeSettings({}))),
  getProfile: () => normalizeProfile(recordRead('profile', normalizeProfile({}))),
  getScores: () => normalizeScores(recordRead('scores', normalizeScores({}))),
  getProgress: () => kvStore.get('progress') || {},
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
  // 渲染进程 IPC 参数序列化失败时上报，便于定位 "An object could not be cloned."
  ipcMain.on('client:error', (_event, payload) => {
    logDebug('[client:error]', JSON.stringify(payload))
  })

  ipcMain.handle('app:info', () => ({    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    dataPath: DATA_DIR,
    packaged: app.isPackaged,
    today: new Date().toISOString().slice(0, 10),
    platform: process.platform,
    subjects: SUBJECTS,
    textbookVersions: TEXTBOOK_VERSIONS,
    db: db
      ? { enabled: true, path: DB_FILE, error: '', stats: db.stats() }
      : { enabled: false, path: DB_FILE, error: dbError, stats: null }
  }))

  // ---------- 数据备份 / 迁移（一个 .db 文件带走全部学习数据） ----------
  ipcMain.handle('db:info', () => (db
    ? { enabled: true, path: DB_FILE, error: '', stats: db.stats() }
    : { enabled: false, path: DB_FILE, error: dbError, stats: null }))

  ipcMain.handle('backup:export', async () => {
    if (!db) throw new Error('数据库未启用（当前使用旧版文件存储），无法导出')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    let targetPath = ''
    // 仅本地开发/自动化测试：指定路径时跳过保存对话框（打包版不生效）
    if (!app.isPackaged && process.env.STUDY_TEST_BACKUP_PATH) {
      targetPath = process.env.STUDY_TEST_BACKUP_PATH
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出学习数据（可在手机或另一台电脑导入）',
        defaultPath: path.join(app.getPath('documents'), 'AI学习助手-学习数据-' + stamp + '.db'),
        filters: [{ name: '学习数据', extensions: ['db'] }]
      })
      if (result.canceled || !result.filePath) return null
      targetPath = result.filePath
    }
    db.flush()
    fs.copyFileSync(DB_FILE, targetPath)
    const size = fs.statSync(targetPath).size
    logDebug('[backup] 已导出', targetPath, size)
    return { path: targetPath, size }
  })

  ipcMain.handle('backup:import', async () => {
    if (!db) throw new Error('数据库未启用（当前使用旧版文件存储），无法导入')
    let source = ''
    if (!app.isPackaged && process.env.STUDY_TEST_IMPORT_PATH) {
      source = process.env.STUDY_TEST_IMPORT_PATH
    } else {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择要导入的学习数据（.db）',
        properties: ['openFile'],
        filters: [{ name: '学习数据', extensions: ['db', 'sqlite', 'sqlite3'] }]
      })
      if (result.canceled || !result.filePaths.length) return null
      source = result.filePaths[0]
    }
    const head = Buffer.alloc(16)
    const fd = fs.openSync(source, 'r')
    try {
      fs.readSync(fd, head, 0, 16, 0)
    } finally {
      fs.closeSync(fd)
    }
    if (head.toString('utf8', 0, 15) !== 'SQLite format 3') {
      throw new Error('这个文件不是学习数据数据库（请选择导出的 .db 文件）')
    }
    // 导入前先备份当前数据，出问题还能恢复
    db.checkpoint()
    const backup = DB_FILE + '.bak-' + Date.now()
    if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, backup)
    db.close()
    fs.copyFileSync(source, DB_FILE)
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix) } catch (_err) { /* 不存在则跳过 */ }
    }
    logDebug('[backup] 已导入', source, '旧库备份:', backup)
    // 让新数据生效：短暂延迟后重启应用
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 400)
    return { imported: true, backupPath: backup }
  })

  ipcMain.handle('app:openDataFolder', async () => {
    await shell.openPath(DATA_DIR)
    return true
  })

  ipcMain.handle('app:openExternal', async (_event, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('只允许打开 http/https 链接')
    await shell.openExternal(String(url))
    return true
  })

  ipcMain.handle('settings:get', () => normalizeSettings(recordRead('settings', normalizeSettings({}))))

  ipcMain.handle('settings:save', (_event, patch) => {
    const current = normalizeSettings(recordRead('settings', normalizeSettings({})))
    const next = normalizeSettings(deepMerge(current, patch || {}))
    recordWrite('settings', next)
    return next
  })

  ipcMain.handle('profile:get', () => normalizeProfile(recordRead('profile', normalizeProfile({}))))

  ipcMain.handle('profile:save', (_event, profile) => {
    const next = normalizeProfile(profile || {})
    recordWrite('profile', next)
    return next
  })

  ipcMain.handle('scores:get', () => normalizeScores(recordRead('scores', normalizeScores({}))))

  ipcMain.handle('scores:save', (_event, scores) => {
    const next = normalizeScores(scores || {})
    recordWrite('scores', next)
    return next
  })

  ipcMain.handle('materials:list', () => materials.list())
  ipcMain.handle('materials:add', (_event, payload) => materials.add(payload))
  ipcMain.handle('materials:remove', (_event, id) => {
    materials.remove(String(id))
    return true
  })
  ipcMain.handle('materials:readText', (_event, id) => materials.readText(String(id)))
  ipcMain.handle('materials:toc', (_event, id) => materials.toc(String(id)))

  ipcMain.handle('textbooks:list', () => textbooks.list())
  ipcMain.handle('textbooks:read', (_event, id) => textbooks.read(String(id)))
  ipcMain.handle('textbooks:toc', (_event, id) => textbooks.toc(String(id)))

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

  // 把选中的文件读成渲染层需要的结构（图片转 dataUrl、Office 转 Markdown）
  function buildPickedFile(filePath) {
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
    if (canConvert(ext)) {
      try {
        const text = convertToMarkdown(filePath, name, ext)
        return { name, ext, size: stat.size, text, converted: true }
      } catch (err) {
        throw new Error('自动转换 ' + name + ' 失败：' + (err && err.message ? err.message : String(err)))
      }
    }
    const legacy = legacyHint(ext)
    if (legacy) throw new Error(legacy)
    return {
      name,
      ext,
      size: stat.size,
      unsupported: true,
      hint: 'PDF 暂不支持直接解析：请截图后以图片上传，或复制文本粘贴。Word/PPT/Excel 请上传 .docx/.pptx/.xlsx 自动转 Markdown。'
    }
  }

  ipcMain.handle('dialog:pickMaterial', async () => {
    // 仅本地开发/自动化测试：用环境变量指定文件时跳过系统对话框（打包版不生效）。
    // STUDY_TEST_PICK_FILES 用分号分隔多个文件，方便测试多选排队。
    const testPick = !app.isPackaged
      ? (process.env.STUDY_TEST_PICK_FILES || process.env.STUDY_TEST_PICK_FILE)
      : ''
    if (testPick) {
      return String(testPick).split(';').map((item) => item.trim()).filter(Boolean).map((filePath) => {
        try {
          return buildPickedFile(filePath)
        } catch (err) {
          return {
            name: path.basename(filePath),
            ext: path.extname(filePath).slice(1).toLowerCase(),
            size: 0,
            error: err && err.message ? err.message : String(err)
          }
        }
      })
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要上传的材料（可多选，图片 / 文本 / Office 文档）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
        { name: '文本', extensions: ['txt', 'md', 'markdown', 'csv', 'json', 'log'] },
        { name: 'Office 文档（自动转 Markdown）', extensions: ['pptx', 'docx', 'xlsx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    // 数量不设上限；单个文件读取失败不影响其他文件，把错误挂在对应条目上。
    const files = []
    for (const filePath of result.filePaths) {
      try {
        files.push(buildPickedFile(filePath))
      } catch (err) {
        files.push({
          name: path.basename(filePath),
          ext: path.extname(filePath).slice(1).toLowerCase(),
          size: 0,
          error: err && err.message ? err.message : String(err)
        })
      }
    }
    return files
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

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.study.aiassistant')
    Menu.setApplicationMenu(null)
    await initDatabase()
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

  // 退出前把数据库缓冲区写回文件，保证 .db 是完整可拷贝的
  app.on('before-quit', () => {
    if (db) {
      try { db.closeAndCheckpoint() } catch (_err) { /* 忽略关闭失败 */ }
      db = null
    }
  })
}
