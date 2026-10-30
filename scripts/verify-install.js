'use strict'
// 验证安装版应用（默认连接 9223）的 IPC 能力：教材、题库、配置、材料。
const { connect, evaluate } = require('./cdp')

async function main() {
  const { send, ws } = await connect()
  const result = await evaluate(send, `(async () => {
    const list = await window.api.textbooks.list();
    const one = await window.api.textbooks.read(list[0].id);
    const bank = await window.api.bank.list('科学');
    const info = await window.api.app.info();
    const mats = await window.api.materials.list();
    const settings = await window.api.settings.get();
    return {
      textbooks: list.length,
      firstTitle: list[0].title,
      firstSubject: list[0].subject,
      contentLength: one.content.length,
      bankSci: bank.length,
      version: info.version,
      packaged: info.packaged,
      platform: info.platform,
      materials: mats.length,
      model: settings.api.model,
      webSearch: settings.ai.webSearch,
      deepThinking: settings.ai.deepThinking,
      stream: settings.ai.stream
    };
  })()`)
  console.log(JSON.stringify(result, null, 2))
  ws.close()
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exit(1)
})
