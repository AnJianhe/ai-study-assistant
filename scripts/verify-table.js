'use strict'
// 验证 Markdown 表格渲染（默认端口 9228）
const { connect, evaluate } = require('./cdp')

const SAMPLE = '| 项目 | 判断 |\n| --- | --- |\n| 缺的课 | 4.3 整式、4.4 合并同类项 |\n| 需要时间 | 80-120 分钟 |'

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const html = await evaluate(send, `window.__render.mdToHtml(${JSON.stringify(SAMPLE)})`)
  console.log('table html:', html.slice(0, 260))
  let pass = 0
  let fail = 0
  const checks = [
    ['生成 table', html.includes('<table class="md-table"')],
    ['生成表头', html.includes('<th>项目</th>')],
    ['生成单元格', html.includes('<td>4.3 整式、4.4 合并同类项</td>')],
    ['不再出现原始分隔行', !html.includes('| --- |')]
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
