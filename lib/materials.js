'use strict'
// 用户上传材料：图片落盘、文本入库；作为 AI 与检索的参考资料，也是纠正内置教材的依据。
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
  constructor(rootDir) {
    this.root = rootDir
    this.uploadsDir = path.join(rootDir, 'uploads')
    this.indexFile = path.join(rootDir, 'index.json')
    ensureDir(this.uploadsDir)
    this.items = this._load()
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

  list() {
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
      imagePath: '',
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
      const fileName = item.id + '.' + ext
      fs.writeFileSync(path.join(this.uploadsDir, fileName), buf)
      item.imagePath = path.join('uploads', fileName)
      item.size = buf.length
    }

    if (typeof data.text === 'string' && data.text.trim()) {
      if (data.text.length > MAX_TEXT_CHARS) throw new Error('文本内容过大，请拆分后再上传')
      item.text = data.text
      item.size = Math.max(item.size, Buffer.byteLength(data.text, 'utf8'))
    }

    if (!item.imagePath && !item.text) throw new Error('材料内容为空（请上传图片或粘贴文本）')

    this.items.push(item)
    this._save()
    return clone(this._normalize(item))
  }

  remove(id) {
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
    const item = this.items.find((it) => it.id === id)
    if (!item) throw new Error('材料不存在')
    if (item.text) return item.text
    return ''
  }

  imageDataUrl(id) {
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
    for (const item of this.items) {
      if (wanted && !wanted.has(item.id)) continue
      if (item.text) {
        docs.push({
          id: 'mat:' + item.id,
          source: `我的材料《${item.name}》（${KINDS[item.kind] || '其他'}）`,
          subject: item.subject,
          grade: '',
          kind: 'material',
          content: item.text
        })
      }
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
