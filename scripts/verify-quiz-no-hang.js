'use strict'
// UI 冒烟：出题过程不能卡在「正在生成内容…」。
// 需要先用 mock 服务 + 独立数据目录启动开发版（见 scripts/run-quiz-ui-test.ps1）。
const { connect, evaluate } = require('./cdp')

const STEP_TIMEOUT_MS = Number(process.env.QUIZ_WAIT_MS || 45000)

async function waitFor(send, expr, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evaluate(send, expr)
    if (v) return v
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 跳过欢迎页
  const onWelcome = await evaluate(send, `location.hash.includes('welcome')`)
  if (onWelcome) {
    await evaluate(send, `(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('先随便看看'));
      if (b) b.click();
      return true;
    })()`)
    await waitFor(send, `location.hash === '#/home'`, 8000)
  }

  // 如果上一次测试停在结果页，先退回设置页
  await evaluate(send, `(() => {
    const back = document.querySelector('[data-act="quiz-back-setup"]');
    if (back) back.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('[data-act="quiz-start"]')`, 8000)

  // 去练习页并开始出题
  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="nav"][data-route="quiz"]');
    if (b) b.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('[data-act="quiz-start"]')`, 8000)

  const started = await evaluate(send, `(() => {
    const btn = document.querySelector('[data-act="quiz-start"]');
    if (!btn || btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`)
  check('能够开始出题', started === 'clicked', started)

  // 等待结束：成功进入 ready，或明确进入 error；不允许长时间停在 generating
  const outcome = await waitFor(
    send,
    `(() => {
      const text = document.body.innerText || '';
      const generating = text.includes('正在生成内容');
      const ready = !!document.querySelector('[data-act="quiz-start-exam"]') || !!document.querySelector('.quiz-ready-list');
      const failed = text.includes('重新生成') && !generating;
      if (ready) return 'ready';
      if (failed) return 'error';
      return '';
    })()`,
    STEP_TIMEOUT_MS
  )

  check('生成流程会结束（不会卡在"正在生成内容"）', Boolean(outcome), outcome)
  if (outcome) console.log('  → 结束状态: ' + outcome)

  if (outcome === 'ready') {
    const info = await evaluate(send, `(() => {
      const text = document.body.innerText || '';
      const readyBtn = document.querySelector('[data-act="quiz-start-exam"]');
      return { hasStartExam: !!readyBtn, text: text.slice(0, 200) };
    })()`)
    check('成功出题后有「开始考试」入口', info.hasStartExam === true, info)
  }

  if (outcome === 'error') {
    const info = await evaluate(send, `(() => {
      const text = document.body.innerText || '';
      const retry = document.querySelector('[data-act="quiz-retry"]');
      return { hasRetry: !!retry, truncatedHint: text.includes('截断'), text: text.slice(0, 260) };
    })()`)
    check('失败时给出可操作的重试入口', info.hasRetry === true, info)
    check('截断场景有明确说明', info.truncatedHint === true, info)
  }

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
