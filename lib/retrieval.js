'use strict'
// 本地检索（BM25 近似）：内置教材 + 用户上传材料 → 返回可引用的章节片段，作为 AI 的事实依据。
const { normalizeBaseUrl } = require('./settings')
const { splitSections, buildToc, tocEntries } = require('./sections')

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '也', '就', '都', '而', '及', '这', '那', '我', '你', '他', '她', '它',
  '们', '一个', '这个', '那个', '什么', '怎么', '可以', '不是', '没有', '我们', '你们', '以及', '因为', '所以',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'for', 'with'
])

function tokenize(text) {
  const tokens = []
  const s = String(text || '').toLowerCase()
  const hanRuns = s.replace(/[^\u4e00-\u9fff]+/g, ' ').split(/\s+/).filter(Boolean)
  for (const run of hanRuns) {
    if (run.length === 1) {
      if (!STOPWORDS.has(run)) tokens.push(run)
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        const gram = run.slice(i, i + 2)
        if (!STOPWORDS.has(gram)) tokens.push(gram)
      }
    }
  }
  const words = s.match(/[a-z][a-z0-9+#._-]{1,}/g) || []
  for (const w of words) {
    if (!STOPWORDS.has(w)) tokens.push(w)
  }
  return tokens
}

// 把长文切成 ~420 字的片段，保留紧邻上级标题，方便引用。
function segment(content, chunkSize) {
  const size = chunkSize || 420
  const lines = String(content || '').split(/\r?\n/)
  const chunks = []
  let heading = ''
  let buffer = []
  let bufferLen = 0

  const flush = () => {
    if (!buffer.length) return
    const text = buffer.join('\n').trim()
    if (text) chunks.push({ heading, text })
    buffer = []
    bufferLen = 0
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#{1,4}\s+/.test(trimmed)) {
      flush()
      heading = trimmed.replace(/^#{1,4}\s+/, '')
      continue
    }
    if (!trimmed) {
      if (bufferLen > size) flush()
      continue
    }
    buffer.push(trimmed)
    bufferLen += trimmed.length
    if (bufferLen >= size) {
      const text = buffer.join('\n').trim()
      if (text) chunks.push({ heading, text })
      // 保留最后一段作为重叠，提升上下文连续性
      buffer = buffer.slice(-1)
      bufferLen = buffer.join('').length
    }
  }
  flush()
  return chunks
}

class Retriever {
  constructor(textbookLibrary, materialStore) {
    this.textbooks = textbookLibrary
    this.materials = materialStore
    this._textbookDocs = null
    this._sectionCache = new Map()
  }

  // 章节级归档：每篇文档切成章节（按标题），带 id 方便 AI 按需调用
  _sectionsOf(doc) {
    const key = doc.id
    const hit = this._sectionCache.get(key)
    if (hit) return hit
    const sections = splitSections(doc.content, { docId: doc.id, title: doc.source }).map((sec) =>
      Object.assign(sec, { subject: doc.subject || '', kind: doc.kind || '' })
    )
    this._sectionCache.set(key, sections)
    return sections
  }

  allSections(materialIds) {
    const out = []
    for (const doc of this.textbooks.documents()) {
      out.push(...this._sectionsOf(doc))
    }
    for (const doc of this.materials.documents(materialIds)) {
      out.push(...this._sectionsOf(doc))
    }
    return out
  }

  // 章节级 BM25 检索：返回章节全文（而不是 420 字碎片），标题权重更高
  searchSections(query, options) {
    const opts = options || {}
    const topK = opts.topK || 5
    const subject = opts.subject || ''
    const queryTokens = tokenize(query)
    if (!queryTokens.length) return { results: [], used: 0 }

    const sections = this.allSections(opts.materialIds)
    if (!sections.length) return { results: [], used: 0 }

    const df = new Map()
    const tokenSets = sections.map((sec) => {
      const tf = new Map()
      const tokens = tokenize(sec.title + ' ' + sec.title + ' ' + sec.text + ' ' + (sec.path || ''))
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
      return tf
    })

    const N = sections.length
    const avgLen = sections.reduce((sum, sec) => sum + tokenize(sec.text).length, 0) / N || 1
    const k1 = 1.4
    const b = 0.75

    const scored = sections.map((sec, i) => {
      const tf = tokenSets[i]
      const docLen = tokenize(sec.text).length || 1
      let score = 0
      for (const token of queryTokens) {
        const freq = tf.get(token)
        if (!freq) continue
        const idf = Math.log(1 + (N - (df.get(token) || 1) + 0.5) / ((df.get(token) || 1) + 0.5))
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * docLen / avgLen)))
      }
      if (subject && sec.subject === subject) score *= 1.6
      if (sec.kind === 'material') score *= 1.25
      return { sec, score }
    })

    const results = scored
      .filter((item) => item.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, topK)
      .map((item) => ({
        id: item.sec.id,
        docId: item.sec.docId,
        title: item.sec.title,
        path: item.sec.path,
        docTitle: item.sec.docTitle,
        subject: item.sec.subject,
        kind: item.sec.kind,
        text: item.sec.text,
        chars: item.sec.chars,
        summary: item.sec.summary,
        score: Number(item.score.toFixed(3))
      }))

    return { results, used: sections.length }
  }

  sectionById(id, materialIds) {
    const wanted = String(id || '').trim()
    if (!wanted) return null
    const all = this.allSections(materialIds)
    return all.find((sec) => sec.id === wanted) || null
  }

  // 目录：按文档分组，只含标题/字数/摘要（轻量，适合注入 prompt）
  catalog(materialIds, options) {
    const opts = options || {}
    const maxSectionsPerDoc = opts.maxSectionsPerDoc || 24
    const groups = []
    const push = (doc) => {
      const sections = this._sectionsOf(doc)
      groups.push({
        docId: doc.id,
        title: doc.source,
        kind: doc.kind,
        subject: doc.subject || '',
        sections: tocEntries(sections).slice(0, maxSectionsPerDoc)
      })
    }
    for (const doc of this.textbooks.documents()) push(doc)
    for (const doc of this.materials.documents(materialIds)) push(doc)
    return groups
  }

  // 目录文本（注入 prompt 用）
  catalogText(materialIds, options) {
    const opts = options || {}
    const maxChars = opts.maxChars || 2400
    const docs = this.catalog(materialIds, opts)
    const blocks = []
    let total = 0
    for (const doc of docs) {
      const lines = [`【${doc.kind === 'material' ? '我的材料' : '内置教材'}】${doc.title}`]
      for (const sec of doc.sections) {
        const indent = '  '.repeat(Math.max(0, Math.min(3, sec.level - 1)))
        const line = `${indent}- [${sec.id}] ${sec.title}（${sec.chars}字）`
        if (total + line.length + 1 > maxChars) break
        lines.push(line)
        total += line.length + 1
      }
      if (lines.length > 1) blocks.push(lines.join('\n'))
      if (total >= maxChars) break
    }
    return blocks.join('\n\n')
  }

  textbookDocs() {
    if (this._textbookDocs) return this._textbookDocs
    const docs = []
    for (const doc of this.textbooks.documents()) {
      const chunks = segment(doc.content)
      chunks.forEach((chunk, index) => {
        docs.push({
          id: doc.id + '#' + index,
          source: doc.source,
          subject: doc.subject,
          grade: doc.grade,
          kind: 'textbook',
          heading: chunk.heading,
          text: chunk.text
        })
      })
    }
    this._textbookDocs = docs
    return docs
  }

  materialDocs(materialIds) {
    const docs = []
    for (const doc of this.materials.documents(materialIds)) {
      const chunks = segment(doc.content)
      chunks.forEach((chunk, index) => {
        docs.push({
          id: doc.id + '#' + index,
          source: doc.source,
          subject: doc.subject,
          grade: doc.grade,
          kind: 'material',
          heading: chunk.heading,
          text: chunk.text
        })
      })
    }
    return docs
  }

  // 返回 { results: [{source, heading, text, score}], used: 文档数 }
  search(query, options) {
    const opts = options || {}
    const topK = opts.topK || 6
    const subject = opts.subject || ''
    const queryTokens = tokenize(query)
    if (!queryTokens.length) return { results: [], used: 0 }

    const docs = this.textbookDocs().concat(this.materialDocs(opts.materialIds))
    if (!docs.length) return { results: [], used: 0 }

    const df = new Map()
    const tokenSets = docs.map((doc) => {
      const tf = new Map()
      const tokens = tokenize(doc.heading ? doc.heading + ' ' + doc.text : doc.text)
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
      return tf
    })

    const N = docs.length
    const avgLen = docs.reduce((sum, doc) => sum + tokenize(doc.text).length, 0) / N || 1
    const k1 = 1.4
    const b = 0.75

    const scored = docs.map((doc, i) => {
      const tf = tokenSets[i]
      const docLen = tokenize(doc.text).length || 1
      let score = 0
      for (const token of queryTokens) {
        const freq = tf.get(token)
        if (!freq) continue
        const idf = Math.log(1 + (N - (df.get(token) || 1) + 0.5) / ((df.get(token) || 1) + 0.5))
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * docLen / avgLen)))
      }
      if (subject && doc.subject === subject) score *= 1.6
      if (doc.kind === 'material') score *= 1.25
      return { doc, score }
    })

    const results = scored
      .filter((item) => item.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, topK)
      .map((item) => ({
        id: item.doc.id,
        source: item.doc.source,
        subject: item.doc.subject,
        kind: item.doc.kind,
        heading: item.doc.heading,
        text: item.doc.text,
        score: Number(item.score.toFixed(3))
      }))

    return { results, used: docs.length }
  }

  // 供 prompt 使用的引用块（兼容章节结构：docTitle/path/title）
  buildReferenceBlock(results) {
    if (!results || !results.length) return ''
    const lines = []
    results.forEach((r, i) => {
      const source = r.docTitle || r.source || ''
      const heading = r.path || r.heading || ''
      lines.push(`【资料${i + 1}】来源：${source}${heading ? ' · ' + heading : ''}（${r.kind === 'material' ? '我上传的材料' : '内置教材'}）`)
      if (r.id) lines.push(`章节 id：${r.id}`)
      lines.push(r.text)
      lines.push('')
    })
    return lines.join('\n')
  }

  buildCitationMap(results) {
    return (results || []).map((r, i) => ({
      index: i + 1,
      source: r.docTitle || r.source || '',
      heading: r.path || r.heading || '',
      kind: r.kind || '',
      snippet: String(r.text || '').slice(0, 120)
    }))
  }
}

module.exports = { Retriever, tokenize, segment, normalizeBaseUrl }
