'use strict'
// 验证修复：.page 在 AI 助手页需要 flex:1 + min-height:0，.assistant 用 flex:1（端口 9230）
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  await evaluate(send, `(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'AI 助手');
    if (b) b.click();
    return true;
  })()`)
  await new Promise((r) => setTimeout(r, 800))

  const result = await evaluate(send, `(() => {
    const page = document.getElementById('page-root');
    const assistant = document.querySelector('.assistant');
    const sc = document.getElementById('chat-scroll');
    if (!page || !assistant || !sc) return { error: 'missing' };
    // 模拟修复样式
    page.style.flex = '1 1 auto';
    page.style.minHeight = '0';
    page.style.display = 'flex';
    page.style.flexDirection = 'column';
    assistant.style.height = 'auto';
    assistant.style.flex = '1 1 auto';
    assistant.style.minHeight = '0';
    const long = Array.from({ length: 40 }).map((_, i) => '<p>第 ' + (i + 1) + ' 段测试内容：撑高消息区验证滚动。</p>').join('');
    sc.innerHTML = '<div class="msg"><div class="msg-body"><div class="msg-bubble"><div class="msg-text">' + long + '</div></div></div></div>';
    void sc.offsetHeight;
    const before = sc.scrollTop;
    sc.scrollTop = 300;
    const after = sc.scrollTop;
    return {
      pageHeight: Math.round(page.getBoundingClientRect().height),
      assistantHeight: Math.round(assistant.getBoundingClientRect().height),
      viewHeight: Math.round(document.querySelector('.view').getBoundingClientRect().height),
      scrollClientHeight: sc.clientHeight,
      scrollHeight: sc.scrollHeight,
      beforeTop: before,
      afterTop: after,
      canScroll: after > before
    };
  })()`)
  console.log(JSON.stringify(result, null, 2))
  ws.close()
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
