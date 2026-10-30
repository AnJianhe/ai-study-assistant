'use strict'
// Office 文件 → Markdown 自动转换（零依赖）：解析 pptx / docx / xlsx 的 OOXML（本质是 zip + XML）。
// 旧格式 .ppt/.doc/.xls（OLE 二进制）不做解析，明确提示用户另存为新格式或截图。
const fs = require('fs')
const zlib = require('zlib')

const MAX_CHARS = 200000

// ---------- 最小 ZIP 读取（中央目录 + local header + inflateRaw） ----------
function readZip(buf) {
  let eocd = -1
  const min = Math.max(0, buf.length - 65558)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 Office 文件（缺少 zip 结构）')
  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const entries = new Map()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, { method, compSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }

  return {
    names() {
      return Array.from(entries.keys())
    },
    read(name) {
      const entry = entries.get(name)
      if (!entry) return null
      const lp = entry.localOffset
      if (buf.readUInt32LE(lp) !== 0x04034b50) return null
      const nameLen = buf.readUInt16LE(lp + 26)
      const extraLen = buf.readUInt16LE(lp + 28)
      const start = lp + 30 + nameLen + extraLen
      const raw = buf.subarray(start, start + entry.compSize)
      if (entry.method === 0) return Buffer.from(raw)
      if (entry.method === 8) return zlib.inflateRawSync(raw)
      throw new Error('不支持的压缩方式：' + entry.method)
    }
  }
}

// ---------- XML 工具 ----------
function decodeXml(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/\u0000/g, '')
    .trim()
}

function extractRuns(xml, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g')
  const out = []
  let m
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]))
  return out.filter((x) => x)
}

function clip(text) {
  const s = String(text || '').trim()
  if (s.length <= MAX_CHARS) return s
  return s.slice(0, MAX_CHARS) + '\n\n> （内容过长，已截断到 20 万字符）'
}

// ---------- PPTX ----------
function ppSlidePath(slideNumber) {
  return 'ppt/slides/slide' + slideNumber + '.xml'
}

function extractPptx(zip, fileName) {
  const names = zip.names()
  const slideNumbers = names
    .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
  if (!slideNumbers.length) throw new Error('PPTX 里没有找到幻灯片内容')

  const lines = ['# 课件：' + fileName, '> 自动从 PPTX 转换为 Markdown，共 ' + slideNumbers.length + ' 页', '']

  for (const n of slideNumbers) {
    const xml = zip.read(ppSlidePath(n))
    if (!xml) continue
    const xmlText = xml.toString('utf8')
    // 按段落 <a:p> 提取文字，每段一行
    const paragraphs = []
    const paraRe = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g
    let pm
    while ((pm = paraRe.exec(xmlText))) {
      const text = extractRuns(pm[1], 'a:t').join('')
      if (text) paragraphs.push(text)
    }
    if (!paragraphs.length) continue
    lines.push('## 第 ' + n + ' 页')
    for (const para of paragraphs) lines.push(para)
    // 备注（notesSlides 的编号与 slide 编号通常一致，但不保证，做存在性检查）
    const noteXml = zip.read('ppt/notesSlides/notesSlide' + n + '.xml')
    if (noteXml) {
      const noteText = extractRuns(noteXml.toString('utf8'), 'a:t').join('\n')
      if (noteText && noteText.length > 2) {
        lines.push('')
        lines.push('**备注：** ' + noteText.replace(/\n+/g, ' '))
      }
    }
    lines.push('')
  }

  if (lines.length <= 3) throw new Error('PPTX 里没有可提取的文字（可能全是图片，请截图上传）')
  return clip(lines.join('\n'))
}

// ---------- DOCX ----------
function extractDocx(zip, fileName) {
  const xml = zip.read('word/document.xml')
  if (!xml) throw new Error('DOCX 里没有找到正文内容')
  const text = xml.toString('utf8')
  const lines = ['# 文档：' + fileName, '> 自动从 DOCX 转换为 Markdown', '']
  const bodyRe = /<w:(p|tbl)(?:\s[^>]*)?>([\s\S]*?)<\/w:\1>/g
  let m
  while ((m = bodyRe.exec(text))) {
    const kind = m[1]
    const inner = m[2]
    if (kind === 'p') {
      const runs = extractRuns(inner, 'w:t').join('')
      if (!runs) continue
      const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(inner)
      const style = styleMatch ? styleMatch[1] : ''
      if (/^Heading1$/i.test(style)) lines.push('# ' + runs)
      else if (/^Heading2$/i.test(style)) lines.push('## ' + runs)
      else if (/^Heading3$/i.test(style)) lines.push('### ' + runs)
      else if (/^Title$/i.test(style)) lines.push('## ' + runs)
      else lines.push(runs)
      lines.push('')
    } else {
      // 表格：每行一个 markdown 行
      const rowRe = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g
      let rm
      const rows = []
      while ((rm = rowRe.exec(inner))) {
        const cellRe = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g
        let cm
        const cells = []
        while ((cm = cellRe.exec(rm[1]))) cells.push(extractRuns(cm[1], 'w:t').join(' ').trim())
        if (cells.length) rows.push('| ' + cells.join(' | ') + ' |')
      }
      if (rows.length) {
        lines.push(rows[0])
        lines.push('|' + rows[0].split('|').slice(1, -1).map(() => ' --- ').join('|') + '|')
        lines.push.apply(lines, rows.slice(1))
        lines.push('')
      }
    }
  }
  if (lines.length <= 3) throw new Error('DOCX 里没有可提取的文字')
  return clip(lines.join('\n'))
}

// ---------- XLSX ----------
function extractXlsx(zip, fileName) {
  const sharedXml = zip.read('xl/sharedStrings.xml')
  const shared = []
  if (sharedXml) {
    const text = sharedXml.toString('utf8')
    const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g
    let m
    while ((m = siRe.exec(text))) shared.push(extractRuns(m[1], 't').join(''))
  }

  const sheetFiles = zip
    .names()
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number((/sheet(\d+)/.exec(a) || [])[1] || 0)
      const nb = Number((/sheet(\d+)/.exec(b) || [])[1] || 0)
      return na - nb
    })
  if (!sheetFiles.length) throw new Error('XLSX 里没有找到工作表')

  const lines = ['# 表格：' + fileName, '> 自动从 XLSX 转换为 Markdown（每个工作表最多前 60 行 × 10 列）', '']

  // 读取工作表名称（workbook.xml 中 <sheet name="成绩"> 的顺序通常与 sheetN 一致）
  const sheetNames = []
  const workbookXml = zip.read('xl/workbook.xml')
  if (workbookXml) {
    const wbText = workbookXml.toString('utf8')
    const nameRe = /<sheet\s[^>]*name="([^"]+)"/g
    let nm
    while ((nm = nameRe.exec(wbText))) sheetNames.push(decodeXml(nm[1]))
  }

  sheetFiles.slice(0, 8).forEach((file, index) => {
    lines.push('## ' + (sheetNames[index] || '工作表 ' + (index + 1)))
    const xml = zip.read(file)
    if (!xml) return
    const text = xml.toString('utf8')
    const rows = []
    const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g
    let rm
    while ((rm = rowRe.exec(text)) && rows.length < 60) {
      const cells = []
      const cellRe = /<c(\s[^>]*)?>([\s\S]*?)<\/c>/g
      let cm
      while ((cm = cellRe.exec(rm[1])) && cells.length < 10) {
        const attrs = cm[1] || ''
        const body = cm[2] || ''
        const type = (/t="([^"]+)"/.exec(attrs) || [])[1]
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body)
        const inlineMatch = /<is>([\s\S]*?)<\/is>/.exec(body)
        let value = ''
        if (type === 's' && vMatch) value = shared[Number(vMatch[1])] || ''
        else if (type === 'inlineStr' && inlineMatch) value = extractRuns(inlineMatch[1], 't').join('')
        else if (vMatch) value = decodeXml(vMatch[1])
        cells.push(String(value).replace(/\|/g, '\\|'))
      }
      if (cells.some((c) => c.trim())) rows.push('| ' + cells.join(' | ') + ' |')
    }
    if (rows.length) {
      lines.push(rows[0])
      lines.push('|' + rows[0].split('|').slice(1, -1).map(() => ' --- ').join('|') + '|')
      lines.push.apply(lines, rows.slice(1))
    } else {
      lines.push('（空工作表）')
    }
    lines.push('')
  })
  return clip(lines.join('\n'))
}

// ---------- 入口 ----------
const SUPPORTED = ['pptx', 'docx', 'xlsx']
const LEGACY_HINT = {
  ppt: '旧版 .ppt 是二进制格式，暂不支持直接转换。请用 PowerPoint 另存为 .pptx 后再上传，或直接截图上传。',
  doc: '旧版 .doc 是二进制格式，暂不支持直接转换。请用 Word 另存为 .docx 后再上传，或直接截图上传。',
  xls: '旧版 .xls 是二进制格式，暂不支持直接转换。请用 Excel 另存为 .xlsx 后再上传，或直接截图上传。'
}

function canConvert(ext) {
  return SUPPORTED.indexOf(String(ext || '').toLowerCase()) !== -1
}

function legacyHint(ext) {
  return LEGACY_HINT[String(ext || '').toLowerCase()] || ''
}

// 返回 markdown 文本；失败抛中文错误
function convertToMarkdown(filePath, fileName, ext) {
  const e = String(ext || '').toLowerCase()
  if (SUPPORTED.indexOf(e) === -1) throw new Error('不支持的格式：.' + e)
  const buf = fs.readFileSync(filePath)
  const zip = readZip(buf)
  if (e === 'pptx') return extractPptx(zip, fileName)
  if (e === 'docx') return extractDocx(zip, fileName)
  return extractXlsx(zip, fileName)
}

module.exports = { canConvert, convertToMarkdown, legacyHint, SUPPORTED, readZip, decodeXml }
