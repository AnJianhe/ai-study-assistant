'use strict'
// 验证：AI 回答里的括号命令（如 (评分100分)）会被解析、执行，并从正文里隐藏。
const { connect, evaluate } = require('./cdp')

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

async function waitFor(send, expr, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evaluate(send, expr)
    if (v) return v
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 进入 AI 助手
  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="nav"][data-route="assistant"]');
    if (b) b.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('#chat-input')`, 8000)

  // 发一条消息，等 mock 回复（回复里带 (评分92分)）
  const sent = await evaluate(send, `(() => {
    const input = document.querySelector('#chat-input');
    if (!input) return false;
    input.value = '帮我看看这道题';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('[data-act="chat-send"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  check('能发送消息', sent === true, sent)

  const done = await waitFor(send, `(() => {
    const text = document.body.innerText || '';
    return text.includes('最后检查单位是否统一') ? true : '';
  })()`, 60000)
  check('收到 AI 回复', Boolean(done), done)

  const view = await evaluate(send, `(() => {
    const bubbles = Array.from(document.querySelectorAll('.msg-bubble'));
    const last = bubbles[bubbles.length - 1];
    const text = last ? last.innerText : '';
    const badge = document.querySelector('.msg-commands .cmd-badge');
    return {
      bubbleText: text,
      hasRawCommand: /si\\s*vr|sivr/i.test(text),
      badgeText: badge ? badge.innerText.replace(/\\s+/g, ' ').trim() : '',
      badgeClass: badge ? badge.className : ''
    };
  })()`)
  check('正文里看不到原始命令', view.hasRawCommand === false, view)
  check('显示了评分结果', /自评\s*92\s*分/.test(view.badgeText), view)
  check('评分样式按分数分级', /is-good/.test(view.badgeClass), view)

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
