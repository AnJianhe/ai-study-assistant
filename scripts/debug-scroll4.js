'use strict'
const { connect, evaluate } = require('./cdp')

;(async () => {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const r = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    const sb = getComputedStyle(v).scrollBehavior;
    v.style.scrollBehavior = 'auto';
    v.scrollTop = 180;
    const a = v.scrollTop;
    v.scrollTo(0, 0);
    const b = v.scrollTop;
    v.scrollTo(0, 120);
    return { scrollBehavior: sb, afterAssign: a, afterScrollTo0: b, afterScrollTo120: v.scrollTop, max: v.scrollHeight - v.clientHeight };
  })()`)
  await new Promise((r1) => setTimeout(r1, 400))
  const later = await evaluate(send, `document.getElementById('view').scrollTop`)
  console.log(JSON.stringify({ r, later }, null, 2))
  ws.close()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
