'use strict'
// 用户上传材料：优先存进数据库（含图片内容），未提供数据库时回退到原来的文件存储。
const fs = require('fs')
const path = require('path')
const { SUBJECTS } = require('./settings')
const { ensureDir, atomicWriteJson, clone } = require('./store')

const KINDS = {
  handout: '课件 / 讲义',
  homework: '当天作业',
  paper: '试卷照片',
  textbook: '自己的课本',
  other: '其他材料'
}

const IMAGE_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp'
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_TEXT_CHARS = 300000

function now() {
  return Date.now()
}

function randomId(prefix) {
  return prefix + now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function parseDataUrl(dataUrl) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || ''))
  if (!match) return null
  return { mime: match[1].toLowerCase(), base64: match[2] }
}

class MaterialStore {
  constructor(rootDir, options) {
    this.root = rootDir
    this.db = (options && options.db) || null
    if (this.db) return
    // 旧的文件后端（兼容没有数据库的调用方/测试）
    this.uploadsDir = path.join(rootDir, 'uploads')
    this.indexFile = path.join(rootDir, 'index.json')
    ensureDir(this.uploadsDir)
    this.items = this._load()
  }

  // 数据库初始化成功后切换存储后端（之前写入的文件数据已由迁移导入数据库）
  setDb(db) {
    if (!db) return
    this.db = db
    this.items = []
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch (_err) {
      return []
    }
  }

  _save() {
    atomicWriteJson(this.indexFile, this.items)
  }

  _normalize(item) {
    return {
      id: String(item.id),
      name: String(item.name || '未命名材料'),
      kind: KINDS[item.kind] ? item.kind : 'other',
      subject: SUBJECTS.includes(item.subject) ? item.subject : '',
      createdAt: Number(item.createdAt) || now(),
      size: Number(item.size) || 0,
      imagePath: item.imagePath ? String(item.imagePath) : '',
      text: typeof item.text === 'string' ? item.text : '',
      hasFile: Boolean(item.imagePath)
    }
  }

  _rowToItem(row) {
    return {
      id: String(row.id),
      name: String(row.name || '未命名材料'),
      kind: KINDS[row.kind] ? row.kind : 'other',
      subject: SUBJECTS.includes(row.subject) ? row.subject : '',
      createdAt: Number(row.created_at) || now(),
      size: Number(row.size) || 0,
      imagePath: row.image_data ? 'db' : '',
      imageMime: row.image_mime || '',
      imageData: row.image_data || null,
      text: typeof row.text === 'string' ? row.text : '',
      hasFile: Boolean(row.image_data)
    }
  }

  list() {
    if (this.db) {
      return this.db.materialRows().map((row) => {
        const item = this._rowToItem(row)
        const copy = clone(item)
        delete copy.imageData
        if (copy.text) copy.preview = copy.text.slice(0, 120)
        else if (copy.hasFile) copy.preview = '（图片材料）'
        else copy.preview = ''
        copy.textLength = copy.text.length
        delete copy.text
        return copy
      })
    }
    return this.items
      .map((it) => this._normalize(it))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((it) => {
        const copy = clone(it)
        if (copy.text) copy.preview = copy.text.slice(0, 120)
        else if (copy.hasFile) copy.preview = '（图片材料）'
        else copy.preview = ''
        copy.textLength = copy.text.length
        delete copy.text
        return copy
      })
  }

  add(payload) {
    const data = payload || {}
    const kind = KINDS[data.kind] ? data.kind : 'other'
    const subject = SUBJECTS.includes(data.subject) ? data.subject : ''
    const name = String(data.name || '').trim() || (KINDS[kind] + ' ' + new Date().toLocaleDateString('zh-CN'))
    const item = {
      id: randomId('mat_'),
      name: name.slice(0, 120),
      kind,
      subject,
      createdAt: now(),
      size: 0,
      imageMime: '',
      imageData: null,
      text: ''
    }

    if (data.dataUrl) {
      const parsed = parseDataUrl(data.dataUrl)
      if (!parsed) throw new Error('图片数据格式不正确')
      const ext = IMAGE_MIME[parsed.mime]
      if (!ext) throw new Error('暂不支持该图片格式，请上传 PNG/JPG/WEBP 图片')
      const buf = Buffer.from(parsed.base64, 'base64')
      if (buf.length === 0) throw new Error('图片内容为空')
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('图片过大（超过 12MB），请压缩后再上传')
      item.imageData = buf
      item.imageMime = parsed.mime
      item.size = buf.length
    }

    if (typeof data.text === 'string' && data.text.trim()) {
      if (data.text.length > MAX_TEXT_CHARS) throw new Error('文本内容过大，请拆分后再上传')
      item.text = data.text
      item.size = Math.max(item.size, Buffer.byteLength(data.text, 'utf8'))
    }

    if (!item.imageData && !item.text) throw new Error('材料内容为空（请上传图片或粘贴文本）')

    if (this.db) {
      this.db.insertMaterial(item)
      const out = this._rowToItem(this.db.materialById(item.id))
      delete out.imageData
      return out
    }

    // 旧文件后端
    let imagePath = ''
    if (item.imageData) {
      const ext = IMAGE_MIME[item.imageMime]
      const fileName = item.id + '.' + ext
      fs.writeFileSync(path.join(this.uploadsDir, fileName), item.imageData)
      imagePath = path.join('uploads', fileName)
    }
    this.items.push({
      id: item.id,
      name: item.name,
      kind: item.kind,
      subject: item.subject,
      createdAt: item.createdAt,
      size: item.size,
      imagePath,
      text: item.text
    })
    this._save()
    return clone(this._normalize(this.items[this.items.length - 1]))
  }

  remove(id) {
    if (this.db) {
      if (!this.db.materialById(id)) throw new Error('材料不存在')
      this.db.removeMaterial(id)
      return
    }
    const idx = this.items.findIndex((it) => it.id === id)
    if (idx < 0) throw new Error('材料不存在')
    const [item] = this.items.splice(idx, 1)
    if (item.imagePath) {
      try {
        fs.unlinkSync(path.join(this.root, item.imagePath))
      } catch (_err) {
        /* 文件可能已不存在，忽略 */
      }
    }
    this._save()
  }

  readText(id) {
    if (this.db) {
      const row = this.db.materialById(id)
      if (!row) throw new Error('材料不存在')
      return row.text || ''
    }
    const item = this.items.find((it) => it.id === id)
    if (!item) throw new Error('材料不存在')
    return item.text || ''
  }

  // 自动生成目录：把文本材料按章节归档（Markdown 标题切分）
  toc(id) {
    const text = this.readText(id)
    const name = this.nameOf(id)
    if (!text) return []
    const { splitSections, tocEntries } = require('./sections')
    return tocEntries(splitSections(text, { docId: 'mat:' + id, title: name }))
  }

  nameOf(id) {
    if (this.db) {
      const row = this.db.materialById(id)
      return row ? row.name : ''
    }
    const item = this.items.find((it) => it.id === id)
    return item ? item.name : ''
  }

  imageDataUrl(id) {
    if (this.db) {
      const row = this.db.materialById(id)
      if (!row || !row.image_data) return null
      const mime = row.image_mime || 'image/jpeg'
      return 'data:' + mime + ';base64,' + Buffer.from(row.image_data).toString('base64')
    }
    const item = this.items.find((it) => it.id === id)
    if (!item || !item.imagePath) return null
    const full = path.join(this.root, item.imagePath)
    try {
      const buf = fs.readFileSync(full)
      const ext = path.extname(full).slice(1).toLowerCase()
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext
      return 'data:' + mime + ';base64,' + buf.toString('base64')
    } catch (_err) {
      return null
    }
  }

  // 把指定材料整理成检索文档 / 上下文
  documents(ids) {
    const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null
    const docs = []
    const rows = this.db
      ? this.db.materialRows()
      : this.items.map((it) => ({
          id: it.id,
          name: it.name,
          kind: it.kind,
          subject: it.subject,
          text: it.text
        }))
    for (const row of rows) {
      if (wanted && !wanted.has(row.id)) continue
      if (!row.text) continue
      docs.push({
        id: 'mat:' + row.id,
        source: `我的材料《${row.name}》（${KINDS[row.kind] || '其他'}）`,
        subject: row.subject,
        grade: '',
        kind: 'material',
        content: row.text
      })
    }
    return docs
  }

  imageDataUrls(ids) {
    const wanted = Array.isArray(ids) ? ids : []
    const out = []
    for (const id of wanted) {
      const url = this.imageDataUrl(id)
      if (url) out.push(url)
    }
    return out
  }
}

module.exports = { MaterialStore, KINDS, IMAGE_MIME }
