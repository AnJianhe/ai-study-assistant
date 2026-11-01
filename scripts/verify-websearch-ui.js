'use strict'
// UI 冒烟：联网搜索开关（设置页切换 → 侧栏 badge / 首页提示变化）
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

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const hash0 = await evaluate(send, `location.hash`)
  if (String(hash0).includes('welcome')) {
    await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('先随便看看')); if(b) b.click(); return true })()`)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // 设置 → 行为偏好
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='设置'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 900))
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="settings-tab"][data-tab="behavior"]'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 700))
  const before = await evaluate(send, `(() => { const sw=document.querySelector('[data-key="ai.webSearch"]'); return { has: !!sw, on: sw ? sw.classList.contains('is-on') : null } })()`)
  check('设置页有联网搜索开关', before.has === true, before)
  check('默认开启', before.on === true, before)

  // 关闭
  await evaluate(send, `(() => { const sw=document.querySelector('[data-key="ai.webSearch"]'); if(sw) sw.click(); return true })()`)
  const badge = await waitFor(send, `(() => { const el=document.getElementById('net-badge'); return el && el.innerText.includes('已关闭') ? el.innerText : null })()`, 6000)
  check('侧栏提示变为「联网搜索已关闭」', !!badge, badge)

  // 首页 banner
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='学习台'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 800))
  const home = await evaluate(send, `(() => {
    const el = [...document.querySelectorAll('.banner-desc')].find(x => x.innerText.includes('联网搜索'));
    return el ? el.innerText : null;
  })()`)
  check('首页提示变为已关闭', home && home.includes('已关闭'), home)

  // 恢复开启（回到设置）
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='设置'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 800))
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="settings-tab"][data-tab="behavior"]'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 600))
  await evaluate(send, `(() => { const sw=document.querySelector('[data-key="ai.webSearch"]'); if(sw) sw.click(); return true })()`)
  const badge2 = await waitFor(send, `(() => { const el=document.getElementById('net-badge'); return el && el.innerText.includes('已开启') ? el.innerText : null })()`, 6000)
  check('重新开启后恢复「已开启」', !!badge2, badge2)

  // 清理：确保最终是开启状态
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
