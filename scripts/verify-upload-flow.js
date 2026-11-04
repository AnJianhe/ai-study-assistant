'use strict'
// UI 端到端：上传资料时勾选「AI 自动生成文件名」，
// 用合成文件替换系统文件对话框，验证材料名和类型由 AI 结果决定。
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

  // 测试实例通过 STUDY_TEST_PICK_FILE 让主进程直接返回指定文件，
  // 不需要操作真实的系统文件对话框。
  const testFile = await evaluate(send, `(async () => {
    const f = await window.api.dialog.pickMaterial();
    return f ? { name: f.name, ext: f.ext, hasText: typeof f.text === 'string' } : null;
  })()`)
  if (!testFile) {
    console.log('  跳过：测试实例没有配置 STUDY_TEST_PICK_FILE');
    ws.close();
    return;
  }
  console.log('  测试文件: ' + testFile.name + '（文本: ' + testFile.hasText + '）');

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

  // 确保勾选，然后上传
  const started = await evaluate(send, `(() => {
    const box = document.getElementById('up-ai-name');
    if (box && !box.checked) box.click();
    const btn = document.querySelector('[data-act="upload-pick"]');
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
  })()`)
  check('能触发上传', started === 'clicked', started)

  // 等材料入库（AI 正常时用 mock 返回的名字；AI 不可用时回退原文件名）
  const expectFallback = process.env.EXPECT_FALLBACK === '1';
  const expectedName = expectFallback ? testFile.name : '科学_光的折射';
  const material = await waitFor(send, `(async () => {
    const list = await window.api.materials.list();
    const hit = list.find((m) => m.name === ${JSON.stringify(expectedName)});
    return hit ? { name: hit.name, kind: hit.kind, subject: hit.subject } : null;
  })()`, 30000)

  check(expectFallback ? 'AI 不可用时用原文件名' : '材料名使用 AI 生成的「科目_知识点」', Boolean(material && material.name === expectedName), material)
  if (!expectFallback) {
    check('材料类型按识别结果自动选择（试卷）', Boolean(material && material.kind === 'paper'), material)
    check('科目按识别结果自动选择（科学）', Boolean(material && material.subject === '科学'), material)
  } else {
    check('AI 不可用时回退原文件名', Boolean(material && material.name === testFile.name), material)
  }

  // 收尾：删掉测试材料，避免污染测试数据
  if (material) {
    await evaluate(send, `(async () => {
      const list = await window.api.materials.list();
      const hit = list.find((m) => m.name === ${JSON.stringify(expectedName)});
      if (hit) await window.api.materials.remove(hit.id);
      return true;
    })()`)
  }
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
