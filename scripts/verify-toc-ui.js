'use strict'
// UI 冒烟：设置页「自动生成目录」开关 + 资料库教材目录弹窗
const { connect, evaluate } = require('./cdp')

async function waitFor(send, expr, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evaluate(send, expr)
    if (v) return v
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const hash0 = await evaluate(send, `location.hash`)
  if (String(hash0).includes('welcome')) {
    await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('先随便看看')); if(b) b.click(); return true })()`)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // 1. 设置页：自动生成目录开关（在「行为偏好」标签里）
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='设置'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 1000))
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="settings-tab"][data-tab="behavior"]'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 900))
  const settingsInfo = await evaluate(send, `(() => {
    const sw = document.querySelector('[data-key="learning.autoToc"]');
    const text = document.body.innerText;
    return { hasSwitch: !!sw, on: sw ? sw.classList.contains('is-on') : null, hasLabel: text.includes('自动生成目录') };
  })()`)
  check('设置页有自动生成目录开关', settingsInfo.hasSwitch === true, settingsInfo)
  check('开关默认开启', settingsInfo.on === true, settingsInfo)
  check('设置页有说明文字', settingsInfo.hasLabel === true, settingsInfo)
  // 切换一下
  await evaluate(send, `(() => { const sw=document.querySelector('[data-key="learning.autoToc"]'); if(sw) sw.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 400))
  const off = await evaluate(send, `(() => { const sw=document.querySelector('[data-key="learning.autoToc"]'); return sw ? sw.classList.contains('is-on') : null })()`)
  check('开关可关闭', off === false, off)
  await evaluate(send, `(() => { const sw=document.querySelector('[data-key="learning.autoToc"]'); if(sw) sw.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 300))

  // 2. 资料库：教材目录
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='资料库'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 1200))
  const lib = await evaluate(send, `(() => ({
    route: location.hash,
    bookCards: document.querySelectorAll('.book-card').length,
    tocButtons: document.querySelectorAll('[data-act="textbook-toc"]').length,
    openButtons: document.querySelectorAll('.book-open').length
  }))()`)
  check('资料库有教材卡片', lib.bookCards > 0, lib)
  check('每本教材都有目录按钮', lib.tocButtons === lib.bookCards && lib.tocButtons > 0, lib)
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="textbook-toc"]'); if(b) b.click(); return true })()`)
  const modal = await waitFor(send, `!!document.querySelector('.modal .toc-list')`, 5000)
  check('点击目录弹出目录列表', !!modal)
  const tocInfo = await evaluate(send, `(() => ({
    rows: document.querySelectorAll('.modal .toc-row').length,
    firstId: (document.querySelector('.modal .toc-id') || {}).innerText || '',
    title: (document.querySelector('.modal .banner-title') || {}).innerText || ''
  }))()`)
  check('目录有章节条目', tocInfo.rows > 0, tocInfo)
  check('目录条目带章节 id', /#\d+/.test(tocInfo.firstId), tocInfo.firstId)
  // 关闭弹窗
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>/关闭|知道了|确定/.test(x.innerText)); if(b) b.click(); else { const c=document.querySelector('.modal-close'); if(c) c.click(); } return true })()`)

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
