'use strict'
// UI 端到端：一次选择多个材料，自动排队逐个处理并入库。
// 需要测试实例设置 STUDY_TEST_PICK_FILES（分号分隔的多个文件路径）。
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

  const picked = await evaluate(send, `(async () => {
    const list = await window.api.dialog.pickMaterial();
    const arr = Array.isArray(list) ? list : (list ? [list] : []);
    return arr.map((f) => f.name);
  })()`)
  if (!Array.isArray(picked) || picked.length < 2) {
    console.log('  跳过：测试实例没有配置多个 STUDY_TEST_PICK_FILES（当前 ' + JSON.stringify(picked) + '）');
    ws.close()
    return
  }
  console.log('  待上传文件: ' + picked.join('、'))

  const before = await evaluate(send, `(async () => (await window.api.materials.list()).length)()`)

  // 打开资料库 → 上传弹窗
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
  await waitFor(send, `!!document.querySelector('.modal #up-ai-name')`, 8000)

  const started = await evaluate(send, `(() => {
    const box = document.getElementById('up-ai-name');
    if (box && !box.checked) box.click();
    const btn = document.querySelector('[data-act="upload-pick"]');
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`)
  check('能触发批量上传', started === 'clicked', started)

  // 等待进度列表出现（刚点击时还在打开文件选择器）
  const appeared = await waitFor(send, `(() => document.querySelectorAll('.up-progress-item').length)()`, 5000)
  check('出现批量进度列表', Boolean(appeared) && appeared === picked.length, appeared)

  // 等待全部处理结束
  const done = await waitFor(send, `(() => {
    const rows = Array.from(document.querySelectorAll('.up-progress-item'));
    if (!rows.length) return '';
    const finished = rows.filter((r) => r.classList.contains('is-done') || r.classList.contains('is-failed'));
    return finished.length === rows.length ? rows.length : '';
  })()`, 60000)
  check('所有文件都处理完成', Boolean(done), done)

  const rows = await evaluate(send, `(() => Array.from(document.querySelectorAll('.up-progress-item')).map((r) => ({
    text: r.innerText.replace(/\\s+/g, ' ').trim(),
    done: r.classList.contains('is-done'),
    failed: r.classList.contains('is-failed')
  })))()`)
  check('进度列表逐个显示结果', Array.isArray(rows) && rows.length === picked.length, rows)
  check('没有文件失败', Array.isArray(rows) && rows.length > 0 && rows.every((r) => r.done && !r.failed), rows)

  const after = await evaluate(send, `(async () => (await window.api.materials.list()).length)()`)
  check('所有文件都进入了资料库', after - before === picked.length, { before, after, count: picked.length })

  // 清理测试材料
  await evaluate(send, `(async () => {
    const list = await window.api.materials.list();
    for (const m of list) {
      if (${JSON.stringify(picked.map((n) => n))}.some((n) => m.name === n || m.name === '科学_光的折射')) {
        await window.api.materials.remove(m.id);
      }
    }
    return true;
  })()`)
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
