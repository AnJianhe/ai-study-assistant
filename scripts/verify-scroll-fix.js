'use strict'
// 验证修复方案：把 .assistant 的高度约束改成 flex:1 + min-height:0（端口 9230）
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
    const sc = document.getElementById('chat-scroll');
    const assistant = document.querySelector('.assistant');
    if (!sc || !assistant) return { error: 'missing nodes' };
    // 模拟修复：flex:1 + min-height:0 取代 height:100%
    assistant.style.height = 'auto';
    assistant.style.flex = '1 1 auto';
    const long = Array.from({ length: 40 }).map((_, i) => '<p>第 ' + (i + 1) + ' 段测试内容：撑高消息区验证滚动。</p>').join('');
    sc.innerHTML = '<div class="msg"><div class="msg-body"><div class="msg-bubble"><div class="msg-text">' + long + '</div></div></div></div>';
    void sc.offsetHeight;
    const before = sc.scrollTop;
    sc.scrollTop = 300;
    const after = sc.scrollTop;
    return {
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
