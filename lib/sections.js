'use strict'
// 文档归档：把 Markdown 切成章节并生成目录，供检索、AI 按需调用（Agent 式跳转阅读）。
// 设计原则：
// - 每篇文档有稳定 docId（教材 tb:xxx，资料 material id），章节 id = docId#序号
// - 章节按 Markdown 标题切分；无标题文档按段落切成 ~900 字的分段
// - 目录只包含标题/字数/摘要，不占太多 token；全文按需取
const DEFAULT_MAX_SECTION_CHARS = 2600
const FALLBACK_CHUNK_CHARS = 900

function cleanTitle(text) {
  return String(text || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text, max) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  const limit = max || 90
  if (s.length <= limit) return s
  const cut = s.slice(0, limit)
  const dot = cut.lastIndexOf('。')
  if (dot > limit * 0.5) return cut.slice(0, dot + 1)
  return cut + '…'
}

// 按段落把长文切成约 chunk 字的分段（用于没有标题的文档）
function chunkByParagraph(text, chunk) {
  const limit = chunk || FALLBACK_CHUNK_CHARS
  const parts = String(text || '')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  let buf = []
  let len = 0
  for (const part of parts) {
    if (len + part.length > limit && buf.length) {
      out.push(buf.join('\n\n'))
      buf = []
      len = 0
    }
    buf.push(part)
    len += part.length
  }
  if (buf.length) out.push(buf.join('\n\n'))
  return out.length ? out : [String(text || '').trim()].filter(Boolean)
}

/**
 * 把一篇 Markdown 切成章节。
 * @param {string} markdown 原文
 * @param {{docId?:string,title?:string,maxChars?:number}} options
 * @returns {Array<{id,docId,docTitle,level,title,path,text,chars,summary,order}>}
 */
function splitSections(markdown, options) {
  const opts = options || {}
  const docId = String(opts.docId || 'doc')
  const docTitle = String(opts.title || '')
  const maxChars = Number(opts.maxChars) || DEFAULT_MAX_SECTION_CHARS
  const text = String(markdown || '')
  const lines = text.split(/\r?\n/)

  const raw = []
  let headings = [] // [{level,title}]
  let buf = []
  let current = null

  const flush = () => {
    if (!current) return
    current.text = buf.join('\n').trim()
    buf = []
    raw.push(current)
  }

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      flush()
      const level = m[1].length
      const title = cleanTitle(m[2])
      headings = headings.filter((h) => h.level < level)
      headings.push({ level, title, path: '' })
      current = {
        title,
        level,
        path: headings.map((h) => h.title).join(' > ')
      }
    } else {
      buf.push(line)
    }
  }
  flush()

  if (!raw.length) {
    const chunks = chunkByParagraph(text, FALLBACK_CHUNK_CHARS)
    return chunks.map((chunk, i) => ({
      id: docId + '#' + (i + 1),
      docId,
      docTitle,
      level: 1,
      order: i + 1,
      title: chunks.length > 1 ? `${docTitle || '全文'}（${i + 1}）` : docTitle || '全文',
      path: docTitle || '全文',
      text: chunk,
      chars: chunk.length,
      summary: firstSentence(chunk, 90)
    }))
  }

  // 过短章节并入上一节，避免碎片
  const merged = []
  for (const sec of raw) {
    const prev = merged[merged.length - 1]
    if (prev && sec.text.length < 80 && sec.level >= prev.level) {
      prev.text = (prev.text + '\n\n' + sec.title + '\n' + sec.text).trim()
      prev.chars = prev.text.length
      prev.summary = firstSentence(prev.text, 90)
      continue
    }
    merged.push(sec)
  }

  // 超长章节按段落切分，标题加（续）
  const final = []
  for (const sec of merged) {
    if (sec.text.length <= maxChars) {
      final.push(sec)
      continue
    }
    const parts = chunkByParagraph(sec.text, maxChars)
    parts.forEach((part, i) => {
      final.push({
        title: i === 0 ? sec.title : sec.title + '（续' + i + '）',
        level: sec.level,
        path: sec.path,
        text: part,
        chars: part.length,
        summary: firstSentence(part, 90)
      })
    })
  }

  return final.map((sec, i) => ({
    id: docId + '#' + (i + 1),
    docId,
    docTitle,
    level: sec.level,
    order: i + 1,
    title: sec.title,
    path: sec.path || sec.title,
    text: sec.text,
    chars: sec.chars,
    summary: firstSentence(sec.text, 90)
  }))
}

// 生成给 AI 看的目录文本（带 id，方便调用 open_section）
function buildToc(sections, options) {
  const opts = options || {}
  const maxChars = Number(opts.maxChars) || 2600
  const lines = []
  let total = 0
  for (const sec of sections) {
    const indent = '  '.repeat(Math.max(0, Math.min(3, sec.level - 1)))
    const line = `${indent}- [${sec.id}] ${sec.title}（${sec.chars}字）`
    if (total + line.length + 1 > maxChars) {
      lines.push('……（目录过长，其余章节可按需检索）')
      break
    }
    lines.push(line)
    total += line.length + 1
  }
  return lines.join('\n')
}

// 目录的轻量结构（可存入资料元数据）
function tocEntries(sections) {
  return sections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    path: sec.path,
    level: sec.level,
    chars: sec.chars,
    summary: sec.summary
  }))
}

module.exports = {
  splitSections,
  buildToc,
  tocEntries,
  firstSentence,
  cleanTitle,
  DEFAULT_MAX_SECTION_CHARS
}
