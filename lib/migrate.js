'use strict'
// 旧版 JSON 数据 → 数据库的一次性迁移。
// 只读取旧文件、写入数据库，绝不删除或改写原有 JSON 与图片，迁移失败也能原样回退。
const fs = require('fs')
const path = require('path')

const KINDS = { handout: true, homework: true, paper: true, textbook: true, other: true }

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (_err) {
    return fallback
  }
}

function imageMimeFromExt(ext) {
  const lower = String(ext || '').toLowerCase()
  if (lower === 'jpg' || lower === 'jpeg') return 'image/jpeg'
  if (lower === 'png') return 'image/png'
  if (lower === 'webp') return 'image/webp'
  if (lower === 'gif') return 'image/gif'
  if (lower === 'bmp') return 'image/bmp'
  return ''
}

function migrateLegacyData({ db, dataDir }) {
  if (db.getMeta('migratedAt')) {
    return { migrated: false, reason: 'already', kv: 0, materials: 0 }
  }
  const result = { migrated: true, kv: 0, materials: 0, imageBytes: 0, errors: [] }
  const read = (name) => readJson(path.join(dataDir, name), null)

  // 固定键：设置 / 档案 / 成绩
  for (const key of ['settings', 'profile', 'scores']) {
    const value = read(key + '.json')
    if (value && typeof value === 'object') {
      db.set(key, value)
      result.kv++
    }
  }

  // store.json：进度、报告、计划、聊天记录等按原键名存
  const store = readJson(path.join(dataDir, 'store.json'), {})
  if (store && typeof store === 'object' && !Array.isArray(store)) {
    for (const key of Object.keys(store)) {
      db.set(key, store[key])
      result.kv++
    }
  }

  // 上传材料（含图片内容一并进库，之后就可以整库搬迁）
  const index = readJson(path.join(dataDir, 'materials', 'index.json'), [])
  if (Array.isArray(index)) {
    for (const item of index) {
      if (!item || !item.id) continue
      try {
        const imagePath = item.imagePath ? path.join(dataDir, 'materials', item.imagePath) : ''
        let imageData = null
        let mime = ''
        if (imagePath && fs.existsSync(imagePath)) {
          imageData = fs.readFileSync(imagePath)
          mime = imageMimeFromExt(path.extname(imagePath).slice(1))
          result.imageBytes += imageData.length
        }
        db.insertMaterial({
          id: String(item.id),
          name: String(item.name || '未命名材料'),
          kind: KINDS[item.kind] ? item.kind : 'other',
          subject: String(item.subject || ''),
          createdAt: Number(item.createdAt) || Date.now(),
          size: Number(item.size) || (imageData ? imageData.length : 0),
          text: typeof item.text === 'string' ? item.text : '',
          imageMime: mime,
          imageData: imageData
        })
        result.materials++
      } catch (err) {
        result.errors.push(String(item.id) + ': ' + (err && err.message))
      }
    }
  }

  db.setMeta('migratedAt', new Date().toISOString())
  db.setMeta('migratedFrom', 'json-v1')
  return result
}

module.exports = { migrateLegacyData }
