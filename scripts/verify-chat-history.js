'use strict'
// 验证 AI 对话记录持久化：写入 store 后 reload，再进入 AI 助手页检查是否恢复（端口 9232）
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  await evaluate(send, `window.api.store.set('chatHistory', [
    { id: 'm1', role: 'user', content: '测试消息：持久化验证', createdAt: Date.now(), status: 'done' },
    { id: 'm2', role: 'assistant', content: '收到，这条回复也应该保留。', createdAt: Date.now() + 1000, status: 'done' }
  ])`)
  await evaluate(send, `location.reload()`)
  await new Promise((r) => setTimeout(r, 4000))

  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'AI 助手');
    if (b) b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 1200))

  const info = await evaluate(send, `(() => {
    const msgs = Array.from(document.querySelectorAll('.msg'));
    const text = document.body.innerText || '';
    return {
      msgCount: msgs.length,
      hasUserMsg: text.includes('测试消息：持久化验证'),
      hasAiMsg: text.includes('这条回复也应该保留')
    };
  })()`)
  console.log(JSON.stringify(info, null, 2))
  const pass = info.hasUserMsg && info.hasAiMsg
  console.log(pass ? 'PASS 对话记录持久化生效' : 'FAIL 对话记录未恢复')
  ws.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
