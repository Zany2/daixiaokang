'use strict'
const path = require('path')
const { fallbackCover } = require(path.join(hexo.base_dir, 'lib/site-media'))
const frontMatter = require('hexo-front-matter')
function assignCover(data) {
  // Read authored front matter so a cached/generated cover never becomes an explicit choice.
  const authored = typeof data.raw === 'string' ? frontMatter.parse(data.raw) : data
  const key = data.source || data.slug || data.path || data.title || ''
  let cover = authored.cover
  if (this.config.post_asset_folder) {
    const topImg = data.top_img
    if (topImg && topImg.indexOf('/') === -1 && /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/.test(topImg)) data.top_img = data.path + topImg
    if (typeof cover === 'string' && cover.indexOf('/') === -1) cover = data.path + cover
  }
  if (cover === false) {
    data.cover = false
    data.randomcover = fallbackCover(hexo, key)
  } else {
    data.cover = cover || fallbackCover(hexo, key)
  }
  return data
}
hexo.extend.filter.register('before_post_render', assignCover)
// Cached posts must also refresh generated defaults when the pool or CDN changes.
hexo.extend.filter.register('before_generate', async function () {
  const updates = []
  for (const kind of ['posts', 'pages']) {
    hexo.locals.get(kind).forEach(data => {
      const previousCover = data.cover
      const previousRandom = data.randomcover
      assignCover.call(hexo, data)
      if (data.cover !== previousCover || data.randomcover !== previousRandom) {
        const fields = { cover: data.cover }
        if (data.randomcover !== undefined) fields.randomcover = data.randomcover
        updates.push(data.update(fields))
      }
    })
  }
  await Promise.all(updates)
  hexo.locals.invalidate()
})
