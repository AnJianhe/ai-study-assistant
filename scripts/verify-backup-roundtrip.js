'use strict'
// 端到端：导出 → 改数据 → 导入 → 重启后数据恢复原样
const fs = require('fs')
const { connect, evaluate } = require('./cdp')

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

async function waitPort(timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://127.0.0.1:' + (process.env.CDP_PORT || 9222) + '/json')
      if (res.ok) {
        const targets = await res.json()
        if (targets.some((t) => t.type === 'page')) return true
      }
    } catch (_err) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  if (!process.env.STUDY_TEST_IMPORT_PATH || !fs.existsSync(process.env.STUDY_TEST_IMPORT_PATH)) {
    console.log('  跳过：需要 STUDY_TEST_IMPORT_PATH 指向一个已导出的 .db')
    return
  }
  const original = '导入前名字_' + Date.now()

  let { send, ws } = await connect()
  await send('Runtime.enable')
  await evaluate(send, `(async () => { await window.api.profile.save({ name: ${JSON.stringify(original)}, grade: '八年级' }); return true; })()`)
  const saved = await evaluate(send, `(async () => (await window.api.profile.get()).name)()`)
  check('先写入一个可识别的名字', saved === original, saved)

  // 导出这份数据
  const exported = await evaluate(send, `(async () => window.api.backup.export())()`)
  check('导出成功', Boolean(exported && exported.path), exported)
  ws.close()

  // 改坏数据，模拟"另一台设备上的不同数据"
  ;({ send, ws } = await connect())
  await send('Runtime.enable')
  await evaluate(send, `(async () => { await window.api.profile.save({ name: '被改掉的名字', grade: '九年级' }); return true; })()`)
  const changed = await evaluate(send, `(async () => (await window.api.profile.get()).name)()`)
  check('数据确实被改掉了', changed === '被改掉的名字', changed)

  // 导入刚导出的数据库（会触发应用重启）。
  // 应用只认启动时配置的导入路径，所以把导出的库覆盖到那个位置。
  const importPath = process.env.STUDY_TEST_IMPORT_PATH
  fs.copyFileSync(exported.path, importPath)
  const imported = await evaluate(send, `(async () => {
    try { return await window.api.backup.import(); }
    catch (err) { return { error: String(err && err.message ? err.message : err) }; }
  })()`)
  check('导入接口接受合法数据库', Boolean(imported && imported.imported), imported)
  ws.close()

  // 等待应用重启后重新连接
  await new Promise((r) => setTimeout(r, 3000))
  const up = await waitPort(40000)
  check('应用已重启并重新可用', up)

  const again = await connect()
  await again.send('Runtime.enable')
  const restored = await evaluate(again.send, `(async () => (await window.api.profile.get()).name)()`)
  check('导入后数据恢复为导出的那一份', restored === original, restored)
  again.ws.close()

  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
