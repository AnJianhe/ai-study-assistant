'use strict'
// 联网搜索（始终开启）：优先用户自配的搜索 API，未配置时用 Bing 网页检索兜底。
// 结果只作为 AI 的参考资料，失败必须如实上报，绝不假装搜索成功。
const { normalizeBaseUrl } = require('./settings')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const TIMEOUT_MS = 12000

function decodeEntities(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
}

function stripTags(text) {
  return decodeEntities(String(text || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function truncate(text, max) {
  const s = String(text || '').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

async function fetchText(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, Object.assign({
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    }, init || {}))
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- Bing HTML ----------
function parseBingHtml(html) {
  const results = []
  const blocks = String(html).split(/<li class="b_algo"/).slice(1)
  for (const raw of blocks) {
    const block = raw.slice(0, 12000)
    const linkMatch = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
    if (!linkMatch) continue
    const url = decodeEntities(linkMatch[1])
    const title = stripTags(linkMatch[2])
    if (!title || !/^https?:\/\//.test(url)) continue
    const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block)
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : ''
    if (results.some((r) => r.url === url)) continue
    results.push({ title: truncate(title, 120), url, snippet: truncate(snippet, 220) })
    if (results.length >= 6) break
  }
  return results
}

async function searchBingHtml(query) {
  const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=zh-Hans&ensearch=0&count=10'
  const res = await fetchText(url)
  if (!res.ok) throw new Error('Bing 返回 HTTP ' + res.status)
  const results = parseBingHtml(res.text)
  if (results.length) return results
  return searchBingRss(query)
}

async function searchBingRss(query) {
  const url = 'https://cn.bing.com/search?format=rss&q=' + encodeURIComponent(query) + '&setlang=zh-Hans'
  const res = await fetchText(url)
  if (!res.ok) throw new Error('Bing RSS 返回 HTTP ' + res.status)
  const results = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRe.exec(res.text))) {
    const block = match[1]
    const title = stripTags((/<title>([\s\S]*?)<\/title>/.exec(block) || [])[1])
    const link = decodeEntities((/<link>([\s\S]*?)<\/link>/.exec(block) || [])[1] || '').trim()
    const desc = stripTags((/<description>([\s\S]*?)<\/description>/.exec(block) || [])[1])
    if (!title || !/^https?:\/\//.test(link)) continue
    if (results.some((r) => r.url === link)) continue
    results.push({ title: truncate(title, 120), url: link, snippet: truncate(desc, 220) })
    if (results.length >= 6) break
  }
  return results
}

// ---------- 第三方搜索 API ----------
async function searchTavily(query, key) {
  const res = await fetchText('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: 6, search_depth: 'basic', include_answer: false })
  })
  if (!res.ok) throw new Error('Tavily HTTP ' + res.status)
  const data = JSON.parse(res.text)
  return (data.results || []).slice(0, 6).map((r) => ({
    title: truncate(r.title, 120),
    url: r.url,
    snippet: truncate(r.content, 220)
  }))
}

async function searchSerper(query, key) {
  const res = await fetchText('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 6 })
  })
  if (!res.ok) throw new Error('Serper HTTP ' + res.status)
  const data = JSON.parse(res.text)
  return (data.organic || []).slice(0, 6).map((r) => ({
    title: truncate(r.title, 120),
    url: r.link,
    snippet: truncate(r.snippet, 220)
  }))
}

async function searchBocha(query, key) {
  const res = await fetchText('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ query, count: 6, summary: false })
  })
  if (!res.ok) throw new Error('博查 HTTP ' + res.status)
  const data = JSON.parse(res.text)
  const pages = (data.data && data.data.webPages && data.data.webPages.value) || []
  return pages.slice(0, 6).map((r) => ({
    title: truncate(r.name, 120),
    url: r.url,
    snippet: truncate(r.snippet, 220)
  }))
}

function resolveProvider(settings) {
  const ai = settings.ai || {}
  const search = settings.search || {}
  const configured = []
  if (search.tavilyKey) configured.push('tavily')
  if (search.serperKey) configured.push('serper')
  if (search.bochaKey) configured.push('bocha')
  const chosen = ai.searchProvider || 'auto'
  if (chosen && chosen !== 'auto') {
    if (chosen === 'bing_html') return ['bing_html']
    return [chosen].concat(configured.filter((p) => p !== chosen), ['bing_html'])
  }
  return configured.concat(['bing_html'])
}

async function runProvider(provider, query, settings) {
  const search = settings.search || {}
  if (provider === 'tavily') {
    if (!search.tavilyKey) throw new Error('未配置 Tavily Key')
    return searchTavily(query, search.tavilyKey)
  }
  if (provider === 'serper') {
    if (!search.serperKey) throw new Error('未配置 Serper Key')
    return searchSerper(query, search.serperKey)
  }
  if (provider === 'bocha') {
    if (!search.bochaKey) throw new Error('未配置博查 Key')
    return searchBocha(query, search.bochaKey)
  }
  return searchBingHtml(query)
}

// 主入口：依次尝试可用 provider，全部失败返回 ok:false
async function webSearch(query, settings) {
  const q = String(query || '').trim()
  if (!q) return { ok: false, provider: '', results: [], error: '搜索关键词为空' }
  const providers = resolveProvider(settings)
  const errors = []
  for (const provider of providers) {
    try {
      const results = await runProvider(provider, q, settings)
      if (results && results.length) {
        return { ok: true, provider, results, error: '' }
      }
      errors.push(provider + '：未返回结果')
    } catch (err) {
      errors.push(provider + '：' + (err && err.message ? err.message : String(err)))
    }
  }
  return { ok: false, provider: providers.join('→'), results: [], error: errors.join('；') }
}

function buildSearchQuery(rawQuery, context) {
  const ctx = context || {}
  const parts = []
  const subject = String(ctx.subject || '').trim()
  const grade = String(ctx.grade || '').trim()
  if (subject) parts.push(subject)
  if (grade) parts.push(grade)
  const cleaned = String(rawQuery || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  parts.push(cleaned.slice(0, 50))
  if (subject && !/知识点|教材|课文|公式|考点/.test(cleaned)) parts.push('知识点')
  return parts.filter(Boolean).join(' ').slice(0, 90)
}

module.exports = {
  webSearch,
  buildSearchQuery,
  searchBingHtml,
  parseBingHtml,
  stripTags,
  decodeEntities,
  normalizeBaseUrl
}
