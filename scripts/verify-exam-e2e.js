'use strict'
// 端到端冒烟：练习 ready 页 -> 开始考试 -> 倒计时；考试计划 -> 生成 -> 部分同意 -> 改写 -> 确认加入
const { connect, evaluate } = require('./cdp')

async function waitFor(send, expr, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evaluate(send, expr)
    if (v) return v
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)) }
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 跳过欢迎页
  const hash0 = await evaluate(send, `location.hash`)
  if (String(hash0).includes('welcome')) {
    await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('先随便看看')); if(b) b.click(); return true })()`)
    await new Promise((r) => setTimeout(r, 1200))
  }

  // 进入练习页并出题
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='练习'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 1000))
  const clicked = await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('开始出题')); if(!b) return 'no-btn'; b.click(); return 'clicked' })()`)
  check('点击开始出题', clicked === 'clicked', clicked)

  const ready = await waitFor(send, `!!document.querySelector('[data-act="quiz-start-exam"]')`, 25000)
  check('题目生成后进入 ready 页（有开始考试按钮）', !!ready)
  const readyInfo = await evaluate(send, `(() => ({
    hasPractice: !!document.querySelector('[data-act="quiz-start-practice"]'),
    hasReadyList: !!document.querySelector('.quiz-ready-list'),
    items: document.querySelectorAll('.quiz-ready-item').length
  }))()`)
  check('ready 页有直接练习按钮', readyInfo.hasPractice === true)
  check('ready 页列出题目', readyInfo.hasReadyList === true && readyInfo.items > 0, readyInfo)

  // 开始考试
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="quiz-start-exam"]'); if(b) b.click(); return true })()`)
  const examBar = await waitFor(send, `!!document.getElementById('exam-countdown')`, 20000)
  check('考试模式出现倒计时', !!examBar)
  const countdown = await evaluate(send, `(() => { const el=document.getElementById('exam-countdown'); return el ? el.textContent.trim() : null })()`)
  check('倒计时显示时间', /^\d+:\d{2}$/.test(String(countdown)), countdown)
  const examModeState = await evaluate(send, `(() => ({ examBar: !!document.getElementById('exam-bar'), hint: document.querySelector('.exam-bar-hint') ? document.querySelector('.exam-bar-hint').innerText : '' }))()`)
  check('考试条包含提醒说明', examModeState.examBar && examModeState.hint.includes('10%'), examModeState)

  // 等待 2 秒确认倒计时在走
  const c1 = await evaluate(send, `document.getElementById('exam-countdown') ? document.getElementById('exam-countdown').textContent.trim() : ''`)
  await new Promise((r) => setTimeout(r, 2500))
  const c2 = await evaluate(send, `document.getElementById('exam-countdown') ? document.getElementById('exam-countdown').textContent.trim() : ''`)
  check('倒计时在减少', c1 !== c2, { c1, c2 })

  // 放弃考试，切到进度页做考试计划
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="quiz-exit"]'); if (b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 800))
  const modalOk = await evaluate(send, `(() => { const root=document.querySelector('.modal-root'); if(!root || root.hidden) return 'no-modal'; const b=[...root.querySelectorAll('button')].find(x=>x.innerText.includes('放弃')); if(!b) return 'no-btn'; b.click(); return 'ok' })()`)
  await new Promise((r) => setTimeout(r, 800))
  void modalOk

  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='学习进度'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1000))
  const examCard = await evaluate(send, `!!document.querySelector('.exam-card')`)
  check('进度页有考试复习计划卡片', examCard === true)

  // 填考试表单并生成（用 input 事件同步 data-bind；科目 chip 会触发重绘，需逐个重新查询）
  await evaluate(send, `(() => {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal('exam-name', '测试期中考试');
    setVal('exam-date', '2027-01-15');
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 400))
  await evaluate(send, `(() => { const chips=[...document.querySelectorAll('[data-act="exam-toggle-subject"]')]; const math=chips.find(c=>c.innerText.includes('数学')); if(math) math.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 500))
  await evaluate(send, `(() => { const chips=[...document.querySelectorAll('[data-act="exam-toggle-subject"]')]; const sci=chips.find(c=>c.innerText.includes('科学')); if(sci) sci.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 500))
  const formValues = await evaluate(send, `(() => ({
    name: document.getElementById('exam-name') ? document.getElementById('exam-name').value : '',
    date: document.getElementById('exam-date') ? document.getElementById('exam-date').value : ''
  }))()`)
  check('重绘后表单值保留', formValues.name === '测试期中考试' && formValues.date === '2027-01-15', formValues)
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="exam-create"]'); if(b) b.click(); return true })()`)
  const planReady = await waitFor(send, `!!document.querySelector('.exam-item-card .exam-item')`, 25000)
  check('AI 生成复习计划并展示条目', !!planReady)
  const planInfo = await evaluate(send, `(() => ({
    items: document.querySelectorAll('.exam-item-card .exam-item').length,
    hasNewCourse: document.body.innerText.includes('未学课程'),
    hasAgreeAll: !!document.querySelector('[data-act="exam-agree-all"]'),
    hasPartial: !!document.querySelector('[data-act="exam-partial"]')
  }))()`)
  check('计划包含未学课程标记', planInfo.hasNewCourse === true, planInfo)
  check('有「同意全部」和「部分同意」按钮', planInfo.hasAgreeAll && planInfo.hasPartial, planInfo)

  // 部分同意：取消第一个勾选 + 填反馈 + 改写
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="exam-partial"]'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 600))
  const checks = await evaluate(send, `(() => {
    const boxes = [...document.querySelectorAll('.exam-check')];
    if (!boxes.length) return 'no-checkbox';
    boxes[0].click();
    const fb = document.getElementById('exam-feedback');
    if (fb) fb.value = '第一项不要，数学减量';
    return 'ok';
  })()`)
  check('部分同意模式出现勾选框', checks === 'ok', checks)
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="exam-apply-feedback"]'); if(b) b.click(); return true })()`)
  const revised = await waitFor(send, `!!document.querySelector('[data-act="exam-confirm"]')`, 25000)
  check('AI 改写后出现「确认加入计划」', !!revised)

  // 确认加入
  await evaluate(send, `(() => { const b=document.querySelector('[data-act="exam-confirm"]'); if(b) b.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1200))
  const confirmed = await evaluate(send, `(() => ({
    confirmedBadge: document.body.innerText.includes('已加入每日安排'),
    planRows: [...document.querySelectorAll('.list-item .list-desc')].filter(x => x.innerText.includes('考试复习')).length
  }))()`)
  check('确认后显示已加入每日安排', confirmed.confirmedBadge === true, confirmed)
  check('每日安排里出现考试复习项', confirmed.planRows > 0, confirmed)

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
