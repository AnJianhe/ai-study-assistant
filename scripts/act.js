'use strict'
// 在渲染进程执行一段表达式（调试/测试用），随后截图。
// 用法：node scripts/act.js "document.querySelector('#x').click(); 'ok'"
const { connect, evaluate, screenshot } = require('./cdp')

async function main() {
  const expr = process.argv.slice(2).join(' ')
  if (!expr) {
    console.error('缺少表达式参数')
    process.exit(2)
  }
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const out = await evaluate(send, expr)
  console.log('RESULT: ' + (typeof out === 'string' ? out : JSON.stringify(out)))
  await new Promise((r) => setTimeout(r, 1200))
  await screenshot(send, 'scripts/out-latest.png')
  console.log('[screenshot] scripts/out-latest.png')
  ws.close()
}

main().catch((err) => {
  console.error('执行失败:', err.message)
  process.exit(1)
})
