'use strict'
// 验证：连点左上角 logo 5 下会启动本机的「违纪扣分助手」（127.0.0.1:8787）
const { connect, evaluate } = require('./cdp')

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

async function portOpen() {
  const net = require('net')
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: 8787 })
    socket.setTimeout(700)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(false))
  })
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  check('测试前工具未运行', !(await portOpen()))

  // 只点 4 下：不应触发
  const four = await evaluate(send, `(() => {
    const logo = document.querySelector('.brand-mark');
    if (!logo) return 'no-logo';
    for (let i = 0; i < 4; i += 1) logo.click();
    return 'ok';
  })()`)
  check('找到 logo', four === 'ok', four)
  await new Promise((r) => setTimeout(r, 1500))
  check('点 4 下不会启动', !(await portOpen()))

  // 再连点 5 下：应启动
  const five = await evaluate(send, `(() => {
    const logo = document.querySelector('.brand-mark');
    for (let i = 0; i < 5; i += 1) logo.click();
    return 'ok';
  })()`)
  check('连点 5 下', five === 'ok', five)

  let up = false
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    if (await portOpen()) { up = true; break }
  }
  check('违纪扣分助手已启动（8787 就绪）', up)

  if (up) {
    const body = await fetch('http://127.0.0.1:8787/').then((r) => r.text()).catch(() => '')
    check('页面能访问', /违纪|扣分|纪律/.test(body), body.slice(0, 80))
  }

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
