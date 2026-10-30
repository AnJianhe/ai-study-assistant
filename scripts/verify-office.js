'use strict'
// 验证 office.js：把测试用 pptx/docx/xlsx 转成 Markdown 并检查关键内容。
const fs = require('fs')
const os = require('os')
const path = require('path')
const { convertToMarkdown } = require('../lib/office')

const dir = path.join(os.tmpdir(), 'office-test')
const cases = [
  { file: 'test.pptx', ext: 'pptx', must: ['光的折射', '折射角小于入射角', '凸透镜成像', '课堂备注'] },
  { file: 'test.docx', ext: 'docx', must: ['一元二次方程复习', '求根公式', '判别式', '两个不等实根'] },
  { file: 'test.xlsx', ext: 'xlsx', must: ['成绩', '语文', '96', '计划', '复习光的折射'] }
]

let pass = 0
let fail = 0
for (const item of cases) {
  const filePath = path.join(dir, item.file)
  try {
    const md = convertToMarkdown(filePath, item.file, item.ext)
    const missing = item.must.filter((m) => !md.includes(m))
    if (missing.length === 0) {
      pass++
      console.log('PASS ' + item.ext + ' 转换成功，' + md.length + ' 字')
      console.log('--- ' + item.file + ' 前 300 字 ---')
      console.log(md.slice(0, 300))
      console.log('')
    } else {
      fail++
      console.log('FAIL ' + item.ext + ' 缺少内容: ' + missing.join(', '))
      console.log(md.slice(0, 500))
    }
  } catch (err) {
    fail++
    console.log('FAIL ' + item.ext + ' 转换异常: ' + err.message)
  }
}

// 旧格式提示
const { legacyHint, canConvert } = require('../lib/office')
if (legacyHint('ppt') && !canConvert('ppt')) {
  pass++
  console.log('PASS 旧格式 .ppt 有明确提示')
} else {
  fail++
  console.log('FAIL 旧格式提示缺失')
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
