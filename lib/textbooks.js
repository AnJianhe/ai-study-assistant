'use strict'
// 内置教材素材：随应用打包（asar 内只读），按科目/年级建立索引。
const fs = require('fs')
const path = require('path')

class TextbookLibrary {
  constructor(assetsDir) {
    this.dir = path.join(assetsDir, 'textbooks')
    this.indexFile = path.join(this.dir, 'index.json')
    this._cache = null
  }

  _index() {
    if (this._cache) return this._cache
    let items = []
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'))
      if (Array.isArray(parsed)) items = parsed
    } catch (err) {
      console.error('[textbooks] 无法读取内置教材索引:', err.message)
    }
    this._cache = items
      .filter((it) => it && it.id && it.file)
      .map((it, i) => ({
        id: String(it.id),
        subject: String(it.subject || ''),
        grade: String(it.grade || ''),
        version: String(it.version || ''),
        title: String(it.title || it.id),
        file: String(it.file),
        order: Number.isFinite(Number(it.order)) ? Number(it.order) : i,
        builtin: true
      }))
      .sort((a, b) => a.order - b.order)
    return this._cache
  }

  list() {
    return this._index().map((meta) => {
      const full = path.join(this.dir, meta.file)
      let chars = 0
      try {
        chars = fs.readFileSync(full, 'utf8').length
      } catch (_err) {
        chars = 0
      }
      return Object.assign({}, meta, { chars })
    })
  }

  read(id) {
    const meta = this._index().find((it) => it.id === id)
    if (!meta) throw new Error('教材不存在：' + id)
    const file = path.join(this.dir, meta.file)
    let content = ''
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch (err) {
      throw new Error('教材文件读取失败：' + err.message)
    }
    return { meta, content }
  }

  // 自动生成目录：按章节归档教材（Markdown 标题切分）
  toc(id) {
    const { meta, content } = this.read(String(id))
    const { splitSections, tocEntries } = require('./sections')
    return tocEntries(splitSections(content, { docId: 'tb:' + meta.id, title: `内置教材《${meta.title}》` }))
  }

  // 给检索用的原始文档
  documents() {
    const docs = []
    for (const meta of this._index()) {
      try {
        const content = fs.readFileSync(path.join(this.dir, meta.file), 'utf8')
        docs.push({
          id: 'tb:' + meta.id,
          source: `内置教材《${meta.title}》`,
          subject: meta.subject,
          grade: meta.grade,
          kind: 'textbook',
          content
        })
      } catch (err) {
        console.error('[textbooks] 读取失败', meta.id, err.message)
      }
    }
    return docs
  }
}

module.exports = { TextbookLibrary }
