'use strict'
const path = require('path')
const fs = require('fs')
const media = require('../lib/site-media')
const urlFor = require('hexo-util').url_for.bind(hexo)
hexo.extend.helper.register('site_media_url', value => urlFor(media.assetUrl(hexo, value)))
hexo.extend.helper.register('site_media_cover', key => urlFor(media.fallbackCover(hexo, key)))
hexo.extend.helper.register('site_media_config', () => {
  const pools = media.catalog(hexo)
  for (const group of [...pools.desktop, ...pools.mobile]) {
    for (const key of ['video', 'poster', 'cover', 'thumbnail', 'posterFallback']) group[key] = urlFor(group[key])
  }
  const fallback = urlFor('/assets/fallback/image.webp')
  const background = (groups, index) => groups.length ? groups[index % groups.length].poster : fallback
  const cats = ['/assets/decorations/cat.svg', '/assets/decorations/cat-original.png']
    .filter(value => fs.existsSync(path.join(hexo.source_dir, value.slice(1))))
    .map(value => urlFor(media.assetUrl(hexo, value)))
  return {
    ...pools,
    fallback,
    avatar: urlFor('/assets/fallback/avatar.png'),
    cat: urlFor(media.assetUrl(hexo, '/assets/decorations/cat.svg')),
    cats,
    defaults: {
      desktop: background(pools.desktop, 0), desktopDark: background(pools.desktop, 5),
      mobile: background(pools.mobile, 0), mobileDark: background(pools.mobile, 1)
    }
  }
})
// Explicit third-party URLs are kept; only local assets are migrated to the configured origin.
const rewriteAssets = text => {
  if (!(hexo.theme.config.site_media || {}).base_url) return text
  const root = hexo.config.root || '/'
  return text.replace(/(["'(=\s])([^"'()<>\s]*\/assets\/[^"'()<>\s]+\.(?:png|jpe?g|gif|webp|svg|avif|mp4)(?:\?[^"'()<>\s]*)?)/gi, (all, prefix, value) => {
    const localPrefix = root.replace(/\/$/, '') + '/assets/'
    if (!value.startsWith(localPrefix) && !value.startsWith('/assets/')) return all
    const local = '/assets/' + value.split('/assets/')[1]
    if (local.startsWith('/assets/fallback/')) return all
    return prefix + media.assetUrl(hexo, local)
  })
}
// Helpers already resolve runtime media URLs. Preserve script contents so local
// posterFallback URLs in serialized catalogs cannot migrate to the CDN.
const rewriteHtmlAssets = text => text.split(/(<script\b[^>]*>[\s\S]*?<\/script\s*>)/gi)
  .map((part, index) => index % 2 ? part : rewriteAssets(part)).join('')
hexo.extend.filter.register('after_render:html', rewriteHtmlAssets, 30)
hexo.extend.filter.register('after_render:css', rewriteAssets, 30)
