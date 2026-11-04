'use strict'
// 验证：数据库模式下，界面读到的设置/档案/成绩/进度/材料是否正确
const { connect, evaluate } = require('./cdp')

function check(name, ok, detail) {
  if (ok) console.log('  PASS ' + name)
  else {
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' ' + JSON.stringify(detail)))
    process.exitCode = 1
  }
}

async function main() {
  const { send, ws } = await connect()
  await send('Runtime.enable')

  const info = await evaluate(send, `(async () => window.api.app.info())()`)
  check('数据库已启用', Boolean(info.db && info.db.enabled), info.db)
  check('报告了数据规模', Boolean(info.db && info.db.stats && info.db.stats.materialCount === 1), info.db && info.db.stats)

  const data = await evaluate(send, `(async () => {
    const [settings, profile, scores, progress, materials, reports] = await Promise.all([
      window.api.settings.get(),
      window.api.profile.get(),
      window.api.scores.get(),
      window.api.store.get('progress'),
      window.api.materials.list(),
      window.api.store.get('reports')
    ]);
    return {
      apiKey: settings.api && settings.api.apiKey ? 'yes' : 'no',
      model: settings.api.model,
      name: profile.name,
      grade: profile.grade,
      mathScore: scores.subjects && scores.subjects['数学'] ? scores.subjects['数学'].score : null,
      progress: progress,
      materialCount: materials.length,
      materialName: materials[0] ? materials[0].name : '',
      materialKind: materials[0] ? materials[0].kind : '',
      reportCount: Array.isArray(reports) ? reports.length : -1
    };
  })()`)
  check('设置读到了数据库里的配置', data.apiKey === 'yes' && data.model === 'mock', data)
  check('个人信息正确', data.name === '测试同学' && data.grade === '八年级', data)
  check('成绩正确', data.mathScore === 95, data)
  check('学习进度正确', data.progress && data.progress['数学'] === '4.4 合并同类项', data.progress)
  check('上传材料正确', data.materialCount === 1 && data.materialName === '测试课件' && data.materialKind === 'handout', data)
  check('报告列表正确', data.reportCount === 1, data.reportCount)

  // 写入后再读，确认写库生效
  const roundTrip = await evaluate(send, `(async () => {
    await window.api.store.set('dbTestKey', { ok: 1, at: 'roundtrip' });
    const back = await window.api.store.get('dbTestKey');
    await window.api.store.remove('dbTestKey');
    return back;
  })()`)
  check('写入/读取/删除 都正常', Boolean(roundTrip && roundTrip.ok === 1), roundTrip)

  ws.close()
  console.log('\n结果：' + (process.exitCode ? '有失败项' : '全部通过'))
}

main().catch((err) => {
  console.error('验证失败:', err.message)
  process.exitCode = 1
})
