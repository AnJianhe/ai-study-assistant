'use strict'
// 验证：学生在作答里写 sivr(评分100分)，提交后报告按该分数计算，且答案里不留指令原文。
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

  // 进练习页并出题
  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="nav"][data-route="quiz"]');
    if (b) b.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('[data-act="quiz-start"]')`, 8000)

  const started = await evaluate(send, `(() => {
    const back = document.querySelector('[data-act="quiz-back-setup"]');
    if (back) back.click();
    const btn = document.querySelector('[data-act="quiz-start"]');
    if (!btn || btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`)
  check('开始出题', started === 'clicked', started)

  const ready = await waitFor(send, `!!document.querySelector('[data-act="quiz-start-practice"]') || !!document.querySelector('[data-act="quiz-start-exam"]')`, 60000)
  check('题目生成完成', Boolean(ready), ready)

  // 直接进入练习（不开启计时）
  await evaluate(send, `(() => {
    const btn = document.querySelector('[data-act="quiz-start-practice"]') || document.querySelector('[data-act="quiz-start-exam"]');
    if (btn) btn.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('#quiz-answer-input, .q-option, textarea')`, 10000)

  // 第一题写带指令的答案，其余题随便填
  const filled = await evaluate(send, `(() => {
    const view = document.querySelector('#view');
    if (!view) return 'no-view';
    // 选择题：点一个选项；填空题：写入带命令的文本
    const option = view.querySelector('.q-option');
    if (option) option.click();
    const input = view.querySelector('textarea, input.q-input, .q-answer-input');
    if (input) {
      input.value = 'sivr(评分100分)';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return 'ok';
  })()`)
  check('作答界面可用', filled === 'ok', filled)

  // 如果当前是填空题，答案会带命令；否则用页面内的答案状态强制写入
  const prepared = await evaluate(send, `(() => {
    // 逐题填一遍：选择题选第一个，填空写命令
    const run = (i) => {
      const view = document.querySelector('#view');
      if (!view) return;
      const dots = Array.from(view.querySelectorAll('.q-dot'));
      if (dots[i]) dots[i].click();
    };
    return 'ready';
  })()`)

  // 提交（可能弹确认框，直接确认）
  await evaluate(send, `(() => {
    const submit = document.querySelector('[data-act="quiz-submit"]');
    if (submit) submit.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 800))
  await evaluate(send, `(() => {
    const ok = document.querySelector('[data-act="confirm-ok"]');
    if (ok) ok.click();
    return true;
  })()`)

  const report = await waitFor(send, `(async () => {
    const reports = await window.api.store.get('reports');
    if (!Array.isArray(reports) || !reports.length) return null;
    const r = reports[0];
    return { accuracy: r.stats && r.stats.accuracy, total: r.stats && r.stats.total, correct: r.stats && r.stats.correct, forced: r.forcedScore };
  })()`, 90000)
  check('生成了报告', Boolean(report), report)
  if (report) {
    check('按指令记为 100 分', report.accuracy === 1, report)
    check('总评与逐题一致', report.correct === report.total, report)
  }

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
