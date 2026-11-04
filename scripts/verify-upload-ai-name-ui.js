'use strict'
// UI 冒烟：上传资料的「由 AI 自动生成描述性文件名」复选框。
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
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 打开上传弹窗
  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="nav"][data-route="library"]');
    if (b) b.click();
    return true;
  })()`)
  await waitFor(send, `!!document.querySelector('[data-act="upload-material"]')`, 8000)
  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="upload-material"]');
    if (b) b.click();
    return true;
  })()`)
  const opened = await waitFor(send, `!!document.querySelector('.modal #up-ai-name')`, 8000)
  check('上传弹窗里有「AI 自动生成文件名」复选框', Boolean(opened), opened)

  const state = await evaluate(send, `(() => {
    const box = document.getElementById('up-ai-name');
    const row = document.querySelector('.ai-name-row');
    const title = document.querySelector('.ai-name-title');
    const desc = document.querySelector('.ai-name-desc');
    return {
      checked: box ? box.checked : null,
      type: box ? box.type : '',
      rowText: row ? row.innerText : '',
      title: title ? title.innerText : '',
      desc: desc ? desc.innerText : '',
      hasKind: !!document.getElementById('up-kind'),
      hasSubject: !!document.getElementById('up-subject')
    };
  })()`)
  check('复选框默认勾选', state.checked === true, state)
  check('标题说明了功能', /AI.*自动生成描述性文件名/.test(state.title), state.title)
  check('说明里有命名格式', /科目_知识点/.test(state.desc), state.desc)
  check('说明里提到自动判断材料类型', /课件|试卷|作业/.test(state.desc), state.desc)
  check('保留原有的类型和科目选择', state.hasKind && state.hasSubject, state)

  // 取消勾选再勾选，确认可以正常切换
  const toggled = await evaluate(send, `(() => {
    const box = document.getElementById('up-ai-name');
    box.click();
    const off = box.checked;
    box.click();
    return { off: off, on: box.checked };
  })()`)
  check('可以取消勾选', toggled.off === false, toggled)
  check('可以重新勾选', toggled.on === true, toggled)

  // 关掉弹窗，恢复页面状态
  await evaluate(send, `(() => {
    const b = document.querySelector('.modal [data-act="modal-close"]');
    if (b) b.click();
    return true;
  })()`)

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
