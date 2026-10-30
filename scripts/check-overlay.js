'use strict'
// 诊断：检查页面覆盖层、pointer-events 与点击命中元素（默认端口 9224）
const { connect, evaluate } = require('./cdp')

const EXPR = `(() => {
  const fixed = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    return s.position === 'fixed' && b.width > 300 && b.height > 300
  })
  const info = (el) => {
    const s = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    return { id: el.id, cls: String(el.className).slice(0, 40), pe: s.pointerEvents, z: s.zIndex, display: s.display, opacity: s.opacity, hidden: el.hidden, rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  }
  const hit = (x, y) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    return { tag: el.tagName, cls: String(el.className).slice(0, 60), id: el.id, text: (el.innerText || '').slice(0, 30) }
  }
  return {
    hash: location.hash,
    viewport: [innerWidth, innerHeight],
    bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
    appPointerEvents: (() => { const a = document.getElementById('app'); return a ? getComputedStyle(a).pointerEvents : null })(),
    fixedOverlays: fixed.map(info),
    toast: document.getElementById('toast-root') ? info(document.getElementById('toast-root')) : null,
    modal: document.getElementById('modal-root') ? info(document.getElementById('modal-root')) : null,
    hitTopLeft: hit(200, 200),
    hitCenter: hit(innerWidth / 2, innerHeight / 2),
    hitButton: (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '继续')
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      const cx = Math.round(r.x + r.width / 2)
      const cy = Math.round(r.y + r.height / 2)
      return { center: [cx, cy], hit: hit(cx, cy), btnPe: getComputedStyle(btn).pointerEvents }
    })(),
    activeElement: document.activeElement ? document.activeElement.tagName : null
  }
})()`

async function main() {
  const { send, ws } = await connect()
  const result = await evaluate(send, EXPR)
  console.log(JSON.stringify(result, null, 2))
  ws.close()
}

main().catch((err) => {
  console.error('诊断失败:', err.message)
  process.exit(1)
})
