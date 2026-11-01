'use strict'
// 复现：AI 助手输入后按回车发送，检查输入框是否清空
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')
  const hash0 = await evaluate(send, `location.hash`)
  if (String(hash0).includes('welcome')) {
    await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('先随便看看')); if(b) b.click(); return true })()`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  // 进入 AI 助手
  await evaluate(send, `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='AI 助手'); if(b) b.click(); return location.hash })()`)
  await new Promise((r) => setTimeout(r, 1000))

  const before = await evaluate(send, `(() => {
    const ta = document.getElementById('chat-input');
    if (!ta) return { error: 'no input' };
    ta.focus();
    ta.value = '测试 键盘回车';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return { value: ta.value, msgCount: document.querySelectorAll('.msg').length };
  })()`)
  console.log('before:', JSON.stringify(before))

  // 模拟 Enter（与真实键盘一致：在 textarea 上触发 keydown，冒泡到 document）
  await evaluate(send, `(() => {
    const ta = document.getElementById('chat-input');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    return true;
  })()`)

  await new Promise((r) => setTimeout(r, 2500))
  const after = await evaluate(send, `(() => {
    const ta = document.getElementById('chat-input');
    return {
      value: ta ? ta.value : null,
      msgCount: document.querySelectorAll('.msg').length,
      lastUserText: (document.querySelector('.msg-user .msg-text') || {}).innerText || ''
    };
  })()`)
  console.log('after:', JSON.stringify(after))
  const pass = after.value === '' && after.msgCount >= before.msgCount + 1
  console.log(pass ? 'PASS 回车发送后输入框已清空' : 'FAIL 回车发送后输入框未清空')
  ws.close()
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
