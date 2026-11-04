'use strict'
// 只读查看学习数据库内容（不会修改文件）
const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

async function main() {
  const file = process.argv[2] || path.join(process.env.APPDATA || '', 'AIStudyAssistant', 'data', 'study.db')
  if (!fs.existsSync(file)) {
    console.log('数据库不存在: ' + file)
    process.exit(1)
  }
  const SQL = await initSqlJs({ locateFile: (f) => path.join(__dirname, '..', 'assets', 'vendor', 'sqljs', f) })
  const buf = new Uint8Array(fs.readFileSync(file))
  const db = new SQL.Database(buf)
  try {
    console.log('文件: ' + file + '（' + (buf.length / 1048576).toFixed(1) + ' MB）')
    const kv = db.exec('SELECT key FROM kv ORDER BY key')
    console.log('kv 键: ' + (kv.length ? kv[0].values.map((v) => v[0]).join(', ') : '（空）'))
    const m = db.exec('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM materials')
    console.log('上传材料: ' + m[0].values[0][0] + ' 份，合计 ' + Math.round(m[0].values[0][1] / 1024) + ' KB')

    const readKv = (key) => {
      const rows = db.exec("SELECT value FROM kv WHERE key = '" + key + "'")
      if (!rows.length) return null
      try { return JSON.parse(rows[0].values[0][0]) } catch (_err) { return null }
    }
    const profile = readKv('profile')
    if (profile) console.log('个人信息: ' + (profile.name || '（空）') + ' / ' + (profile.grade || ''))
    const progress = readKv('progress')
    if (progress) console.log('学习进度科目: ' + Object.keys(progress).join('、'))
    const reports = readKv('reports')
    if (Array.isArray(reports)) console.log('历史报告: ' + reports.length + ' 份')
    const chat = readKv('chatHistory')
    if (Array.isArray(chat)) console.log('聊天记录: ' + chat.length + ' 条')
    const settings = readKv('settings')
    if (settings && settings.api) console.log('模型配置: ' + (settings.api.model || '（未设置）') + ' @ ' + (settings.api.baseUrl || ''))
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error('读取失败:', err.message)
  process.exit(1)
})
