'use strict'
const { connect, evaluate } = require('./cdp')

;(async () => {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const r = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    const cs = getComputedStyle(v);
    const main = v.closest('main') || v.parentElement;
    return {
      route: location.hash,
      viewOverflow: cs.overflowY,
      viewScrollHeight: v.scrollHeight,
      viewClientHeight: v.clientHeight,
      mainTag: main ? main.tagName : null,
      mainOverflow: main ? getComputedStyle(main).overflowY : null,
      docScrollingElement: document.scrollingElement ? document.scrollingElement.tagName : null,
      docScrollTop: document.scrollingElement ? document.scrollingElement.scrollTop : null
    };
  })()`)
  console.log(JSON.stringify(r, null, 2))
  ws.close()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
