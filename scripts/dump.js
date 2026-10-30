'use strict'
// 导出当前页面结构（调试用）：文本、按钮、输入框 + 截图。
const { connect, evaluate, screenshot } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  await send('Page.enable')
  const info = await evaluate(send, `(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const buttons = [...document.querySelectorAll('button')].map((b, i) => ({
      i,
      text: (b.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      disabled: b.disabled,
      rect: rect(b)
    }));
    const inputs = [...document.querySelectorAll('input, textarea, select')].map((el, i) => ({
      i,
      tag: el.tagName,
      type: el.type,
      placeholder: el.placeholder || '',
      value: el.value ? String(el.value).slice(0, 30) : '',
      rect: rect(el)
    }));
    const nav = [...document.querySelectorAll('a, [role="button"], .nav-item, .sidebar a')].map((el) => ({
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
      href: el.getAttribute('href') || ''
    })).filter((x) => x.text);
    return {
      hash: location.hash,
      title: document.title,
      text: (document.body.innerText || '').slice(0, 1500),
      buttons,
      inputs,
      nav
    };
  })()`)
  console.log(JSON.stringify(info, null, 2))
  await screenshot(send, 'scripts/out-dump.png')
  console.log('\n[screenshot] scripts/out-dump.png')
  ws.close()
}

main().catch((err) => {
  console.error('dump 失败:', err.message)
  process.exit(1)
})
