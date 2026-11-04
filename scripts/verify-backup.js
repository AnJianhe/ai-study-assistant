'use strict'
// 验证：数据库导出（生成可迁移的 .db）与导入前的校验
const fs = require('fs')
const path = require('path')
const { connect, evaluate } = require('./cdp')

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

  const target = process.env.STUDY_TEST_BACKUP_PATH
  if (!target) {
    console.log('  跳过：没有配置 STUDY_TEST_BACKUP_PATH')
    ws.close()
    return
  }
  try { fs.unlinkSync(target) } catch (_err) { /* 不存在 */ }

  const result = await evaluate(send, `(async () => window.api.backup.export())()`)
  check('导出接口返回了路径', Boolean(result && result.path), result)
  check('导出文件确实存在', fs.existsSync(target), target)
  const size = fs.existsSync(target) ? fs.statSync(target).size : 0
  check('导出文件非空', size > 0, size)

  const head = Buffer.alloc(16)
  const fd = fs.openSync(target, 'r')
  try { fs.readSync(fd, head, 0, 16, 0) } finally { fs.closeSync(fd) }
  check('导出文件是标准 SQLite 格式', head.toString('utf8', 0, 15) === 'SQLite format 3', head.toString('utf8', 0, 15))

  // 用 sql.js 打开导出的文件，确认两端可读同一份数据
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, '..', 'assets', 'vendor', 'sqljs', f) })
  const disk = new SQL.Database(new Uint8Array(fs.readFileSync(target)))
  try {
    const rows = disk.exec("SELECT key FROM kv WHERE key IN ('settings','profile','progress') ORDER BY key")
    const keys = rows.length ? rows[0].values.map((v) => v[0]) : []
    check('导出的库里有设置/档案/进度', keys.length === 3, keys)
    const mats = disk.exec('SELECT COUNT(*) FROM materials')
    const count = mats.length ? mats[0].values[0][0] : 0
    check('导出的库里有上传材料', count === 1, count)
  } finally {
    disk.close()
  }

  // 导入前的格式校验：给一个非数据库文件应被拒绝（需要测试实例配置导入路径）
  const importPath = process.env.STUDY_TEST_IMPORT_PATH
  if (importPath && fs.existsSync(importPath)) {
    const rejected = await evaluate(send, `(async () => {
      try {
        await window.api.backup.import();
        return 'no-error';
      } catch (err) {
        return String(err && err.message ? err.message : err);
      }
    })()`)
    check('非数据库文件会被拒绝', /不是学习数据数据库/.test(rejected), rejected)
  } else {
    console.log('  跳过：导入校验需要 STUDY_TEST_IMPORT_PATH')
  }

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
  console.log('导出文件: ' + target)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
