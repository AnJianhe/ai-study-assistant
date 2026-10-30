'use strict'
// 验证：学习进度注入、补课上下文传递是否生效（不依赖 Electron / 网络）
const fs = require('fs')
const os = require('os')
const path = require('path')

const { TextbookLibrary } = require('../lib/textbooks')
const { MaterialStore } = require('../lib/materials')
const { Retriever } = require('../lib/retrieval')
const { QuizBank } = require('../lib/quizbank')
const { AiGateway } = require('../lib/ai')
const { normalizeSettings, normalizeProfile, normalizeScores } = require('../lib/settings')

const assets = path.join(__dirname, '..', 'assets')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-fix-'))
const materials = new MaterialStore(tmp)
const retriever = new Retriever(new TextbookLibrary(assets), materials)
const bank = new QuizBank(assets)

const profile = normalizeProfile({ name: '小林', grade: '八年级' })
const scores = normalizeScores({})
const progress = {
  数学: { unit: '4.4 合并同类项', percent: 0, note: '同类项容易混' },
  科学: { unit: '3.3 平面地图', percent: 20, note: '' }
}

const gateway = new AiGateway({
  getSettings: () => normalizeSettings({}),
  getProfile: () => profile,
  getScores: () => scores,
  getProgress: () => progress,
  retriever,
  materials,
  bank,
  send: () => {}
})

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, detail || '') }
}

const emptyRetrieval = { results: [], used: 0 }
const noSearch = { ok: false, results: [], provider: '', error: 'offline' }

console.log('[1] 学习进度注入')
const quizSys = gateway._buildSystem('quiz', { subject: '数学', quizPlan: { minutes: 15, willing: '想学' } }, profile, scores, emptyRetrieval, noSearch)
check('系统提示包含学习进度小节', quizSys.includes('学习进度'))
check('包含数学进度章节', quizSys.includes('4.4 合并同类项'), quizSys.slice(0, 200))
check('包含数学进度备注', quizSys.includes('同类项容易混'))
check('出题范围提示存在', quizSys.includes('出题范围'))
check('quiz 指令带当前进度', quizSys.includes('学到「4.4 合并同类项」'))

console.log('[2] 补课上下文传递')
const planSys = gateway._buildSystem('plan', {
  subject: '数学',
  plan: { scene: '请假 / 缺课后的补课', subject: '数学', missing: '第三章 电路连接', available: '40 分钟/天', notes: '' }
}, profile, scores, emptyRetrieval, noSearch)
check('补课科目为数学', planSys.includes('科目：数学'), planSys.slice(-600))
check('补课缺课内容正确', planSys.includes('第三章 电路连接'))
check('补课可投入时间', planSys.includes('40 分钟/天'))

console.log('[3] 其他模式也能拿到进度')
const chatSys = gateway._buildSystem('chat', {}, profile, scores, emptyRetrieval, noSearch)
check('chat 系统提示也含进度', chatSys.includes('4.4 合并同类项'))

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
