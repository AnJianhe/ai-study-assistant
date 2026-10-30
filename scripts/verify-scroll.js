'use strict'
// 验证 AI 助手页滚动布局（默认端口 9230）
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  // 进入 AI 助手页
  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'AI 助手');
    if (b) b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 1200))

  const info = await evaluate(send, `(() => {
    const sc = document.getElementById('chat-scroll');
    if (!sc) return { error: 'no chat-scroll' };
    // 注入长内容模拟一条很长的 AI 回复（含表格）
    const long = Array.from({ length: 40 }).map((_, i) => '<p>第 ' + (i + 1) + ' 段测试内容：这一行用来撑高消息区，验证滚动是否正常。</p>').join('') +
      '<table class="md-table"><thead><tr><th>项目</th><th>判断</th></tr></thead><tbody><tr><td>缺的课</td><td>4.3 整式、4.4 合并同类项</td></tr></tbody></table>';
    sc.innerHTML = '<div class="msg"><div class="msg-body"><div class="msg-bubble"><div class="msg-text">' + long + '</div></div></div></div>';
    const before = sc.scrollTop;
    sc.scrollTop = 200;
    const after = sc.scrollTop;
    const view = document.querySelector('.view');
    const assistant = document.querySelector('.assistant');
    return {
      scrollHeight: sc.scrollHeight,
      clientHeight: sc.clientHeight,
      canScroll: after > before,
      afterTop: after,
      overflowY: getComputedStyle(sc).overflowY,
      viewOverflow: view ? getComputedStyle(view).overflow : null,
      viewHeight: view ? Math.round(view.getBoundingClientRect().height) : null,
      assistantHeight: assistant ? Math.round(assistant.getBoundingClientRect().height) : null,
      chatRight: Math.round(sc.getBoundingClientRect().right),
      tableWidth: (() => { const t = sc.querySelector('.md-table'); return t ? Math.round(t.getBoundingClientRect().width) : null; })(),
      scrollWidth: sc.scrollWidth,
      clientWidth: sc.clientWidth
    };
  })()`)
  console.log(JSON.stringify(info, null, 2))
  ws.close()
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
