'use strict'
// 演示/验证脚本：打开「上传学习材料」弹窗并截图，确认 AI 自动命名复选框存在。
const { connect, evaluate, screenshot } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  await send('Page.enable')

  await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="nav"][data-route="library"]');
    if (b) b.click();
    return location.hash;
  })()`)
  await new Promise((r) => setTimeout(r, 900))

  const clicked = await evaluate(send, `(() => {
    const b = document.querySelector('[data-act="upload-material"]');
    if (!b) return false;
    b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 700))

  const info = await evaluate(send, `(() => {
    const box = document.getElementById('up-ai-name');
    const title = document.querySelector('.ai-name-title');
    const desc = document.querySelector('.ai-name-desc');
    return {
      hash: location.hash,
      modalOpen: !!document.querySelector('.modal'),
      checkbox: !!box,
      checked: box ? box.checked : null,
      title: title ? title.innerText : '',
      desc: desc ? desc.innerText : ''
    };
  })()`)

  if (!(info.modalOpen && info.checkbox)) {
    console.error('没能打开上传弹窗或找不到复选框', JSON.stringify(info))
    process.exitCode = 1
    ws.close()
    return
  }
  const file = await screenshot(send, 'scripts/out-upload-ai-name.png')
  console.log(JSON.stringify(info, null, 2))
  console.log('截图：' + file)
  ws.close()
}

main().catch((err) => {
  console.error('失败:', err.message)
  process.exitCode = 1
})
