'use strict'
// SQLite 数据层（sql.js / WebAssembly 版）：全部学习数据落在一个标准 .db 文件里，
// 备份、换设备、手机/电脑同步都只需搬这一个文件。
// 用 WASM 而不是原生模块：不依赖编译工具链，Electron 里不会出现 ABI 不匹配崩溃，
// 生成的文件也能被安卓端的系统 SQLite 直接打开。
const fs = require('fs')
const path = require('path')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  subject TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  text TEXT,
  image_mime TEXT,
  image_data BLOB,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

class StudyDb {
  // 用 StudyDb.create 构造（需要等待 WASM 初始化）
  constructor(sqlDb, file) {
    this.db = sqlDb
    this.file = file
    this._saveTimer = null
    this._dirty = false
  }

  static async create(file, options) {
    const opts = options || {}
    const initSqlJs = require('sql.js')
    const wasmDir = opts.wasmDir || path.join(__dirname, '..', 'assets', 'vendor', 'sqljs')
    const SQL = await initSqlJs({
      locateFile: (name) => path.join(wasmDir, name)
    })
    fs.mkdirSync(path.dirname(file), { recursive: true })
    let buffer = null
    if (fs.existsSync(file)) {
      try {
        buffer = new Uint8Array(fs.readFileSync(file))
      } catch (_err) {
        buffer = null
      }
    }
    let sqlDb
    try {
      sqlDb = buffer ? new SQL.Database(buffer) : new SQL.Database()
    } catch (_err) {
      // 文件损坏时从空库开始，原文件保留不动（便于人工恢复）
      sqlDb = new SQL.Database()
    }
    sqlDb.exec(SCHEMA)
    return new StudyDb(sqlDb, file)
  }

  // ---------- 内部查询工具 ----------
  _one(sql, params) {
    const stmt = this.db.prepare(sql)
    try {
      if (params) stmt.bind(params)
      if (!stmt.step()) return null
      return stmt.getAsObject()
    } finally {
      stmt.free()
    }
  }

  _all(sql, params) {
    const stmt = this.db.prepare(sql)
    const rows = []
    try {
      if (params) stmt.bind(params)
      while (stmt.step()) rows.push(stmt.getAsObject())
    } finally {
      stmt.free()
    }
    return rows
  }

  _run(sql, params) {
    this.db.run(sql, params || [])
    this._dirty = true
    this._scheduleSave()
  }

  // ---------- 保存（防抖：连续写入合并成一次落盘） ----------
  _scheduleSave() {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      try {
        this.flush()
      } catch (_err) {
        /* 下次写入会重试 */
      }
    }, 600)
  }

  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    const data = this.db.export()
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, Buffer.from(data))
    fs.renameSync(tmp, this.file)
    this._dirty = false
  }

  // 兼容旧调用名
  checkpoint() {
    this.flush()
  }

  close() {
    try {
      this.flush()
    } catch (_err) {
      /* 关闭时写盘失败不阻塞退出 */
    }
    try {
      this.db.close()
    } catch (_err) {
      /* 已关闭 */
    }
  }

  closeAndCheckpoint() {
    this.close()
  }

  // ---------- 通用键值 ----------
  get(key) {
    const row = this._one('SELECT value FROM kv WHERE key = ?', [String(key)])
    if (!row) return null
    try {
      return JSON.parse(row.value)
    } catch (_err) {
      return null
    }
  }

  has(key) {
    return Boolean(this._one('SELECT 1 AS n FROM kv WHERE key = ?', [String(key)]))
  }

  set(key, value) {
    this._run(
      'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [String(key), JSON.stringify(value === undefined ? null : value), Date.now()]
    )
    return value
  }

  remove(key) {
    this._run('DELETE FROM kv WHERE key = ?', [String(key)])
  }

  keys(prefix) {
    const rows = prefix
      ? this._all('SELECT key FROM kv WHERE key LIKE ? ORDER BY key', [String(prefix) + '%'])
      : this._all('SELECT key FROM kv ORDER BY key')
    return rows.map((r) => r.key)
  }

  // ---------- 上传材料 ----------
  materialRows() {
    return this._all('SELECT * FROM materials ORDER BY created_at DESC').map((row) => {
      // sql.js 的 BLOB 取出来是 Uint8Array，统一转 Buffer 便于写文件/转 base64
      if (row.image_data) row.image_data = Buffer.from(row.image_data)
      return row
    })
  }

  materialById(id) {
    const row = this._one('SELECT * FROM materials WHERE id = ?', [String(id)])
    if (row && row.image_data) row.image_data = Buffer.from(row.image_data)
    return row || null
  }

  insertMaterial(item) {
    this._run(
      'INSERT INTO materials (id, name, kind, subject, created_at, size, text, image_mime, image_data, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        String(item.id),
        String(item.name || '未命名材料'),
        String(item.kind || 'other'),
        String(item.subject || ''),
        Number(item.createdAt) || Date.now(),
        Number(item.size) || 0,
        item.text ? String(item.text) : null,
        item.imageMime ? String(item.imageMime) : null,
        item.imageData ? new Uint8Array(Buffer.from(item.imageData)) : null,
        Date.now()
      ]
    )
  }

  removeMaterial(id) {
    const before = this._one('SELECT COUNT(*) AS n FROM materials WHERE id = ?', [String(id)])
    this._run('DELETE FROM materials WHERE id = ?', [String(id)])
    return Boolean(before && before.n > 0)
  }

  // ---------- 元信息 ----------
  getMeta(key) {
    const row = this._one('SELECT value FROM meta WHERE key = ?', [String(key)])
    return row ? row.value : null
  }

  setMeta(key, value) {
    this._run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [String(key), value === undefined ? null : String(value)]
    )
  }

  stats() {
    const kv = this._one('SELECT COUNT(*) AS n FROM kv')
    const mats = this._one("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(COALESCE(text, '')) + LENGTH(COALESCE(image_data, ''))), 0) AS bytes FROM materials")
    return {
      kvCount: kv ? kv.n : 0,
      materialCount: mats ? mats.n : 0,
      materialBytes: mats ? mats.bytes : 0,
      path: this.file
    }
  }
}

module.exports = { StudyDb, SCHEMA }
