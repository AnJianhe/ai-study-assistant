'use strict'
// 轻量 JSON 持久化：所有数据落在 userData/data 下，原子写入，避免半截文件。
const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function atomicWriteJson(file, data) {
  ensureDir(path.dirname(file))
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

class JsonFile {
  constructor(file, fallback) {
    this.file = file
    this.fallback = fallback
    this.cache = undefined
  }

  read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      this.cache = JSON.parse(raw)
      return this.cache
    } catch (_err) {
      return this.cache !== undefined ? this.cache : clone(this.fallback)
    }
  }

  write(data) {
    this.cache = clone(data)
    atomicWriteJson(this.file, this.cache)
    return this.cache
  }
}

// 任意键值存储，单个 store.json；用于前端存进度、计划、日志、报告列表等。
class KeyValueStore {
  constructor(file) {
    this.file = file
    this.data = this._load()
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch (_err) {
      return {}
    }
  }

  _flush() {
    atomicWriteJson(this.file, this.data)
  }

  get(key) {
    return key in this.data ? clone(this.data[key]) : null
  }

  set(key, value) {
    this.data[key] = clone(value)
    this._flush()
    return value
  }

  remove(key) {
    delete this.data[key]
    this._flush()
  }

  list(prefix) {
    const keys = Object.keys(this.data)
    if (!prefix) return keys
    return keys.filter((k) => k.startsWith(prefix))
  }
}

module.exports = { JsonFile, KeyValueStore, ensureDir, atomicWriteJson, clone }
