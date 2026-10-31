'use strict'
// 本地 mock：OpenAI 兼容 /chat/completions（SSE），用于端到端测试，不参与正式发布。
const http = require('http')

const PORT = Number(process.env.MOCK_PORT || 18080)

const QUIZ = {
  title: '光的折射 · 15 分钟小练',
  questions: [
    {
      id: 'q1',
      type: 'choice',
      stem: '光从空气斜射入水中时，折射角与入射角的大小关系是？',
      options: ['A. 折射角大于入射角', 'B. 折射角小于入射角', 'C. 折射角等于入射角', 'D. 无法确定'],
      answer: 'B',
      explanation: '光从光疏介质（空气）进入光密介质（水）时，折射光线向法线偏折，折射角小于入射角。',
      knowledgePoint: '光的折射规律',
      difficulty: 'easy'
    },
    {
      id: 'q2',
      type: 'choice',
      stem: '一束光垂直射到水面上，入射角为 0°，则折射角为？',
      options: ['A. 0°', 'B. 30°', 'C. 45°', 'D. 90°'],
      answer: 'A',
      explanation: '光垂直入射时传播方向不改变，入射角、折射角都为 0°。',
      knowledgePoint: '光的折射规律',
      difficulty: 'easy'
    },
    {
      id: 'q3',
      type: 'fill',
      stem: '光从水中斜射入空气中时，折射角____入射角（填"大于"或"小于"）。',
      answer: '大于',
      explanation: '从光密介质（水）到光疏介质（空气），折射角大于入射角。',
      knowledgePoint: '光的折射规律',
      difficulty: 'medium'
    },
    {
      id: 'q4',
      type: 'choice',
      stem: '我们看到水中的筷子"折断"了，这是因为？',
      options: ['A. 光沿直线传播', 'B. 光的反射', 'C. 光的折射', 'D. 光的色散'],
      answer: 'C',
      explanation: '筷子反射的光从水传入空气时发生折射，人眼逆着折射光线看，看到筷子的虚像位置偏上，像"折断"。',
      knowledgePoint: '生活中的折射现象',
      difficulty: 'medium'
    }
  ]
}

const REPORT = {
  summary: '这次练习你对折射规律的基本方向判断比较稳，但介质互换时的结论还需要再确认。',
  strengths: ['入射角与折射角的大小判断准确（第 1、2 题）', '能联系生活现象（第 4 题判断正确）'],
  weaknesses: [
    {
      knowledgePoint: '光的折射规律（水→空气）',
      evidence: '第 3 题填空答成"小于"，方向判断反了',
      advice: '记住口诀"疏入密，折向法线；密入疏，折离法线"，并用两条光线图各画 3 遍'
    }
  ],
  nextSteps: [
    '重看教材"光的折射"一节，把空气↔水两个方向的折射光路图各画一遍',
    '做 3 道"水中看物体"的解释题，要求写出"光从…射入…发生折射"',
    '明天用 10 分钟做一次同类小练'
  ],
  encouragement: '你已经抓住了折射的主干，剩下的是把方向记牢——画图比背句子更管用。'
}

function modeOf(system) {
  if (!system) return 'chat'
  if (system.includes('出一套短练习')) return 'quiz'
  if (system.includes('批改并生成个性化学习报告')) return 'report'
  if (system.includes('补课 / 学习安排建议')) return 'plan'
  if (system.includes('估算建议总时长')) return 'examTime'
  if (system.includes('制定可执行的复习计划')) return 'examPlan'
  if (system.includes('按学生反馈修改复习计划')) return 'examRevise'
  return 'chat'
}

function answerFor(system) {
  const mode = modeOf(system)
  if (mode === 'quiz') return JSON.stringify(QUIZ, null, 2)
  if (mode === 'report') return JSON.stringify(REPORT, null, 2)
  if (mode === 'examTime') return JSON.stringify({ minutes: 15, reason: '4 道题，按每题 2 分钟再留检查时间' })
  if (mode === 'examPlan') {
    return JSON.stringify({
      summary: '先补当前进度，再练综合题。',
      items: [
        { subject: '数学', title: '复习 4.4 合并同类项（重做例题 + 3 道同类题）', date: new Date().toISOString().slice(0, 10), minutes: 25, reason: '当前进度，考试必考', isNewCourse: false },
        { subject: '科学', title: '复习第 3 章 地球与地图（重点：等高线判读）', date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), minutes: 30, reason: '考试要考但还没学', isNewCourse: true }
      ]
    })
  }
  if (mode === 'examRevise') {
    return JSON.stringify({
      summary: '按你的意见：数学减量，周末加科学。',
      items: [
        { subject: '数学', title: '复习 4.4 合并同类项（只做 2 道例题）', date: new Date().toISOString().slice(0, 10), minutes: 15, reason: '按你要求减量', isNewCourse: false },
        { subject: '科学', title: '周末专项：等高线判读 10 题', date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), minutes: 40, reason: '按你要求加科学', isNewCourse: false }
      ]
    })
  }
  if (mode === 'plan') {
    return ['## 现状判断', '你缺的主要是「光的折射」这一节。', '', '## 补课顺序', '1. 先看课本折射规律', '2. 重做课件例题', '', '## 每天做什么', '- 第 1 天：读课本 + 画折射光路图（30 分钟）', '', '## 检查点', '- 能独立画出空气↔水的折射光路图'].join('\n')
  }
  return '你好，我是你的 AI 学习助手。你可以让我出几道题、讲讲错题，或者根据缺课内容排补课计划。'
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found' } }))
    return
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    let payload = {}
    try {
      payload = JSON.parse(body)
    } catch (_err) {
      /* ignore */
    }
    const system = (payload.messages && payload.messages[0] && payload.messages[0].content) || ''
    const answer = answerFor(String(system))
    console.log('[mock] model=' + payload.model + ' stream=' + payload.stream + ' mode=' + modeOf(String(system)))

    if (!payload.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 80 }
      }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    const send = (obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n')
    send({ choices: [{ delta: { reasoning_content: '先判断题型，再结合教材知识点作答。' } }] })
    const chunks = answer.match(/[\s\S]{1,40}/g) || []
    let i = 0
    const timer = setInterval(() => {
      if (i >= chunks.length) {
        clearInterval(timer)
        send({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 80 } })
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      send({ choices: [{ delta: { content: chunks[i] } }] })
      i++
    }, 12)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('[mock] listening http://127.0.0.1:' + PORT)
})
