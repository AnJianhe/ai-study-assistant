'use strict'
const { connect, evaluate } = require('./cdp')

;(async () => {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const set = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    const before = v.scrollTop;
    v.scrollTop = 180;
    return { route: location.hash, before: before, afterSet: v.scrollTop, max: v.scrollHeight - v.clientHeight };
  })()`)
  await new Promise((r) => setTimeout(r, 300))
  const later = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    return { after300ms: v.scrollTop, pageScroll: (document.querySelector('.page') || {}).scrollTop };
  })()`)
  console.log(JSON.stringify({ set, later }, null, 2))
  ws.close()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
