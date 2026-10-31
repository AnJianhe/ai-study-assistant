'use strict'
// 考试/练习模式 + 考试复习计划的 UI 冒烟（默认端口 9233）
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 1. 学习进度页：考试复习计划卡片
  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '学习进度');
    if (b) b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 1200))
  const progress = await evaluate(send, `(() => {
    const card = document.querySelector('.exam-card');
    const nameInput = document.getElementById('exam-name');
    const dateInput = document.getElementById('exam-date');
    const createBtn = document.querySelector('[data-act="exam-create"]');
    const subjectChips = document.querySelectorAll('[data-act="exam-toggle-subject"]');
    return {
      card: !!card,
      title: card ? card.querySelector('.card-title').innerText.trim() : '',
      nameInput: !!nameInput,
      dateInput: !!dateInput,
      createBtn: !!createBtn,
      subjectChips: subjectChips.length
    };
  })()`)
  console.log('progress page:', JSON.stringify(progress, null, 2))

  // 2. 练习页：设置 -> 生成前检查（需要 API，未配置时应提示）
  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '练习');
    if (b) b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 1000))
  const quiz = await evaluate(send, `(() => ({
    hash: location.hash,
    hasStartExamBtn: !!document.querySelector('[data-act="quiz-start-exam"]'),
    hasReadyList: !!document.querySelector('.quiz-ready-list'),
    text: document.body.innerText.slice(0, 120)
  }))()`)
  console.log('quiz page:', JSON.stringify(quiz, null, 2))

  let pass = 0
  let fail = 0
  const checks = [
    ['进度页出现考试复习计划卡片', progress.card === true],
    ['卡片标题正确', progress.title.includes('考试复习计划')],
    ['考试名称输入框存在', progress.nameInput === true],
    ['考试日期输入框存在', progress.dateInput === true],
    ['生成按钮存在', progress.createBtn === true],
    ['科目多选 chips 7 个', progress.subjectChips === 7]
  ]
  for (const [name, ok] of checks) {
    if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name) }
  }
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
