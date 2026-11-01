'use strict'
// 验证 mdToHtml：<details> 折叠块、混排列表、分隔线
const { connect, evaluate } = require('./cdp')

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(String(detail).slice(0, 300))) }
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const out = await evaluate(send, `(() => {
    const md = window.__render && window.__render.mdToHtml;
    if (!md) return { error: 'no mdToHtml hook' };
    return {
      details: md('<details><summary>答案</summary>\\n\\n系数 -3/4，次数 2+3=5\\n\\n两组：6xy - 5yx 与 -10x² 与 7x²。\\n</details>'),
      detailsInline: md('先做 3 题：\\n\\n<details>\\n<summary>答案</summary>\\n- 系数 -1\\n- 次数 1\\n</details>'),
      mixed: md('五、马上练 3 题（先做，再展开答案）\\n- -3/4 x²y³ 的系数和次数？\\n- -m 的系数和次数？'),
      hr: md('第一段\\n\\n---\\n\\n第二段'),
      normal: md('普通段落 **加粗** 和 $x^2$')
    };
  })()`)
  if (out.error) {
    console.log('FAIL', out.error)
    process.exit(1)
  }
  check('details 渲染为折叠块', out.details.includes('<details class="md-details">'), out.details)
  check('details 有 summary', out.details.includes('<summary>答案</summary>'), out.details)
  check('details 内容被 Markdown 渲染', out.details.includes('<p>') && out.details.includes('系数 -3/4'), out.details)
  check('不再显示原始 &lt;details 文本', !out.details.includes('&lt;details'), out.details)
  check('details 内部列表渲染', out.detailsInline.includes('<ul>') && out.detailsInline.includes('<li>'), out.detailsInline)
  check('混排列表渲染为 ul', out.mixed.includes('<ul>') && out.mixed.includes('<li>'), out.mixed)
  check('分隔线渲染为 hr', out.hr.includes('<hr class="md-hr">'), out.hr)
  check('普通 Markdown 仍正常', out.normal.includes('<strong>加粗</strong>'), out.normal)

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
  ws.close()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
