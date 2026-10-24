'use strict'
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')
// base_url mirrors source/assets. Emergency fallbacks always stay local.
function assetUrl(hexo, value) {
  if (typeof value !== 'string' || !value.startsWith('/assets/') || value.startsWith('/assets/fallback/')) return value
  const base = String((hexo.theme.config.site_media || {}).base_url || '').trim().replace(/\/+$/, '')
  return base ? base + value.slice('/assets'.length) : value
}
function catalog(hexo) {
  const directory = path.join(hexo.source_dir, 'assets', 'home')
  const files = fs.existsSync(directory) ? new Set(fs.readdirSync(directory)) : new Set()
  function groups(pattern) {
    return Array.from(files).filter(name => pattern.test(name) && files.has(name.replace(/\.mp4$/, '.png')))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map(name => {
        const id = name.replace(/\.mp4$/, '')
        const original = '/assets/home/' + id + '.png'
        const variant = kind => {
          const relative = '/assets/home/optimized/' + id + '-' + kind + '.webp'
          return assetUrl(hexo, fs.existsSync(path.join(hexo.source_dir, relative.slice(1))) ? relative : original)
        }
        return { id, video: assetUrl(hexo, '/assets/home/' + name), poster: variant('background'), cover: variant('cover'), thumbnail: variant('thumb'), posterFallback: original }
      })
  }
  return { desktop: groups(/^pc_\d+\.mp4$/), mobile: groups(/^home_mobile_\d+\.mp4$/) }
}
function pick(groups, key) {
  if (!groups.length) return null
  return groups.reduce((best, item) => {
    const score = createHash('sha256').update(String(key) + '\0' + item.id).digest().readUInt32BE(0)
    return !best || score > best.score ? { item, score } : best
  }, null).item
}
function fallbackCover(hexo, key) {
  const group = pick(catalog(hexo).desktop, key)
  return group ? group.cover : '/assets/fallback/image.webp'
}
module.exports = { assetUrl, catalog, pick, fallbackCover }
