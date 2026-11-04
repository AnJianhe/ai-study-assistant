'use strict'
// 把明确列出的共享前端和纯业务模块放入 Android 构建目录。
// 只读取项目自带的静态素材，不读取用户数据、配置或密钥。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const android = path.resolve(root, 'android')
const output = path.join(android, 'app', 'build', 'generated', 'studyAssets')
const coreModules = ['settings', 'sections', 'prompts', 'search', 'retrieval', 'quizbank', 'ai']

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8') }
function write(rel, content) {
  const target = path.resolve(output, rel)
  if (!target.startsWith(output + path.sep)) throw new Error('非法目标路径: ' + rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
function copyFile(rel) { write(rel, fs.readFileSync(path.join(root, rel))) }
function copyTree(rel) {
  const dir = path.join(root, rel)
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(rel, item.name)
    if (item.isSymbolicLink()) throw new Error('不允许在静态素材中包含符号链接: ' + next)
    if (item.isDirectory()) copyTree(next)
    else if (item.isFile()) copyFile(next)
  }
}

// 编译时静态包装 CommonJS，不使用 eval/Function，也不打包 Node 运行时。
// quizbank 顶层引用 fs/path；Android 版本注入自己的题库实现，不执行其文件操作。
let core = `(function (global) {
'use strict';
const factories = Object.create(null), cache = Object.create(null);
factories['fs'] = function (module) { module.exports = {
  readFileSync() { throw new Error('Android 请使用资源接口读取题库'); }
}; };
factories['path'] = function (module) { module.exports = {
  join(...parts) { return parts.join('/').replace(/\\/+/g, '/'); }
}; };
`
for (const name of coreModules) {
  core += `factories['lib/${name}.js'] = function (module, exports, require) {\n${read('lib/' + name + '.js')}\n};\n`
}
core += `function load(id) {
  if (cache[id]) return cache[id].exports;
  const factory = factories[id];
  if (!factory) throw new Error('未知内置模块: ' + id);
  const module = { exports: {} }; cache[id] = module;
  function localRequire(name) {
    if (name.startsWith('./')) {
      const prefix = id.slice(0, id.lastIndexOf('/') + 1);
      return load(prefix + name.slice(2) + (name.endsWith('.js') ? '' : '.js'));
    }
    return load(name);
  }
  try { factory(module, module.exports, localRequire); }
  catch (error) { delete cache[id]; throw error; }
  return module.exports;
}
global.StudyMobileCore = Object.freeze(Object.assign({},
  load('lib/settings.js'), load('lib/sections.js'), load('lib/retrieval.js'),
  load('lib/quizbank.js'), load('lib/ai.js')));
})(window);
`
write('mobile-core.js', core)

copyFile('styles.css')
// 手机端的存储和备份方式不同，不能沿用桌面版的目录提示或错误隐私承诺。
let renderer = read('renderer.js')
const replacements = [
  ['Key 不会上传到任何地方，只用于调用你配置的接口', 'Key 会作为认证信息发送至你配置的服务商，请只使用可信的 HTTPS 接口'],
  ['这些信息只用来让 AI 的回答更贴合你的年级和进度，只保存在本机。', '这些信息保存在本机；发起 AI 请求时，相关信息可能发送给你配置的模型服务商，请只填写愿意发送的内容。'],
  ['内置教材可以随时翻看正文；上传的课件、作业、试卷会成为 AI 的参考资料。', '内置教材可以随时翻看；上传的材料可在对话或练习中选作 AI 参考，未选择的材料不会自动发送。'],
  ['AI 会先翻你的教材和上传的资料，再去网上核对一遍，尽量不说错。', 'AI 会参考教材和你本次选中的资料，并按联网设置决定是否搜索。'],
  ['先查教材，再联网核对', '先查教材，再按联网设置核对'],
  ['每天固定时间问你「今天学了什么」', '打开应用时显示每日登记卡；不会发送系统通知'],
  ['Office 文档：.pptx / .docx / .xlsx 会自动转换成 Markdown 文本', '安卓端支持图片、UTF-8 文本和 .pptx / .docx / .xlsx，Office 文件会在本机转换为文本'],
  ['后再给 AI 用。', '；选中后可作为 AI 的参考资料。'],
  ['PDF 暂不支持解析，请先截图再上传。旧版 .ppt / .doc / .xls 请另存为新格式。', 'PDF 和旧版 Office 暂不支持直接解析，请截图或复制文字；单个文件不超过 12 MB，一次多选合计不超过 20 MB。'],
  ["    input.focus();\n    input.selectionStart = input.selectionEnd = input.value.length;", "    // 手机上不主动弹出软键盘；由用户点击输入框。\n    if (document.activeElement === input) input.selectionStart = input.selectionEnd = input.value.length;"],
  ['所有数据都存在本机的数据目录里，不会上传到服务器。换电脑时把整个目录拷走即可。', '资料和设置存储在手机应用私有空间。使用 AI 时，相关个人信息、答案、资料或图片会发送给你配置的模型服务商；开启联网搜索时，关键词会发送给搜索服务商。'],
  ["备份提示：把 <b>' + esc(info.userDataPath || '数据目录') + '</b> 整个文件夹复制到新电脑的相同位置，就能带走全部设置、成绩和报告。", '手机和 Windows 的数据不会自动同步。卸载安卓应用可能删除手机本地数据；当前版本暂不支持导出备份。'],
  ["图片保存在数据目录的 <code>' + esc(mat.imagePath) + '</code>，可以用系统看图工具打开。AI 在提问和出题时会读取这张图片。", '图片保存在手机应用私有空间。选作附件后，图片可能随 AI 请求发送给你配置的模型服务商。'],
  ['询问时间</label>', '询问时间（仅记录，不触发系统通知）</label>']
]
for (const [before, after] of replacements) {
  if (!renderer.includes(before)) throw new Error('桌面前端提示已变化，请检查 Android 提示: ' + before.slice(0, 30))
  renderer = renderer.split(before).join(after)
}
write('renderer.js', renderer)
for (const dir of ['assets/textbooks', 'assets/quizbank', 'assets/vendor/katex']) copyTree(dir)
write('mobile.css', Buffer.concat([
  fs.readFileSync(path.join(android, 'web', 'mobile.css')),
  Buffer.from('\n/* Android 应用私有目录不能直接用文件管理器打开。 */\n[data-act="open-data-folder"] { display: none !important; }\n')
]))
write('mobile-bridge.js', fs.readFileSync(path.join(android, 'web', 'bridge.js')))

let html = read('index.html')
const styleMarker = '  <link rel="stylesheet" href="styles.css" />'
const scriptMarker = '  <script type="module" src="renderer.js"></script>'
if (!html.includes(styleMarker) || !html.includes(scriptMarker)) throw new Error('前端入口结构发生变化，请更新 Android 构建脚本')
html = html.replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
html = html.replace(styleMarker, styleMarker + '\n  <link rel="stylesheet" href="mobile.css" />')
html = html.replace(scriptMarker,
  '  <script src="mobile-core.js"></script>\n  <script src="mobile-bridge.js"></script>\n' + scriptMarker)
// WebView 只加载自身静态资源；跨域访问仅由受限原生联网桥执行。
html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`)
write('index.html', html)
console.log('Android 离线资源已生成：' + output)
