'use strict'
// 验证渲染：公式（KaTeX）+ 轻量 Markdown（默认端口 9226）
const { connect, evaluate } = require('./cdp')

const SAMPLE_MATH = '计算：$(-2)^3+(-3)\\times(-2)$ 的结果是（ ）'
const SAMPLE_MD = '## 标题\n\n- 第一点\n- 第二点\n\n**重点**\n\n> 引用一句话'

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  const ready = await evaluate(send, `(() => ({ katex: typeof window.katex, render: typeof window.__render }))()`)
  console.log('环境:', JSON.stringify(ready))

  const mathHtml = await evaluate(send, `window.__render.mdToHtml(${JSON.stringify(SAMPLE_MATH)})`)
  const mdHtml = await evaluate(send, `window.__render.mdToHtml(${JSON.stringify(SAMPLE_MD)})`)
  const inlineHtml = await evaluate(send, `window.__render.richInline(${JSON.stringify('A. $-14$')})`)

  const checks = [
    ['KaTeX 已加载', ready.katex === 'object'],
    ['渲染函数可用', ready.render === 'object'],
    ['公式被 KaTeX 渲染', mathHtml.includes('class="katex')],
    ['保留 MathML 语义（无障碍/可复制）', mathHtml.includes('<math')],
    ['标题渲染为 h4', mdHtml.includes('<h4>')],
    ['列表渲染为 ul', mdHtml.includes('<ul>')],
    ['粗体渲染', mdHtml.includes('<strong>')],
    ['引用渲染为 blockquote', mdHtml.includes('<blockquote>')],
    ['行内公式渲染', inlineHtml.includes('class="katex')]
  ]

  let pass = 0
  let fail = 0
  for (const [name, ok] of checks) {
    if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name) }
  }
  console.log('\n公式样例输出片段:', mathHtml.slice(0, 160))
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
