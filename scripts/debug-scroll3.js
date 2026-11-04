'use strict'
const { connect, evaluate } = require('./cdp')

;(async () => {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const info = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    const p = document.querySelector('.page');
    const cs = (el) => el ? { tag: el.tagName, overflowY: getComputedStyle(el).overflowY, height: getComputedStyle(el).height, display: getComputedStyle(el).display, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
    const vp = p ? p.scrollTop : null;
    if (p) p.scrollTop = 180;
    const afterPage = p ? p.scrollTop : null;
    if (p) p.scrollTop = vp;
    v.scrollTop = 180;
    return { route: location.hash, view: cs(v), page: cs(p), afterPageSet: afterPage, afterViewSet: v.scrollTop };
  })()`)
  console.log(JSON.stringify(info, null, 2))
  ws.close()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
