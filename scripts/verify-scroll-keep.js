'use strict'
// 验证：局部操作触发的重绘不再把页面滚回顶部；切换页面仍回到顶部
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const hash0 = await evaluate(send, `location.hash`)
  if (String(hash0).includes('welcome')) {
    await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('先随便看看')); if(b) b.click(); return true })()`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  // 进入练习页（内容较长，可滚动）
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='练习'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 1200))

  const scrolled = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    v.style.scrollBehavior = 'auto';
    const max = Math.max(0, v.scrollHeight - v.clientHeight);
    const target = Math.min(180, max);
    v.scrollTop = target;
    return { target: target, actual: v.scrollTop, max: max };
  })()`)
  // 点科目 chip 触发局部 render
  await evaluate(send, `(() => { const c=document.querySelector('[data-act="quiz-subject"]'); if(c) c.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 700))
  const after = await evaluate(send, `(() => {
    const v = document.getElementById('view');
    return { scrollTop: v.scrollTop, max: Math.max(0, v.scrollHeight - v.clientHeight) };
  })()`)
  // 切换页面：回到顶部
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='学习进度'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 900))
  const pageTop = await evaluate(send, `document.getElementById('view').scrollTop`)

  let pass = 0
  let fail = 0
  const checks = [
    ['练习页可滚动', scrolled.actual > 0, scrolled],
    ['局部重绘后保持滚动', Math.abs(after.scrollTop - scrolled.actual) <= 2, { before: scrolled.actual, after: after.scrollTop }],
    ['切换页面后回到顶部', pageTop === 0, pageTop]
  ]
  for (const [name, ok, detail] of checks) {
    if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, JSON.stringify(detail)) }
  }
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
