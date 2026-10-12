'use strict'
const path = require('path')
const { assetUrl, catalog } = require(path.join(hexo.base_dir, 'lib/site-media'))
hexo.extend.helper.register('home_cinematic_media', function () {
  const config = this.theme.home_cinematic || {}
  const pools = catalog(hexo)
  const media = (group, variant) => ({
    ...group,
    video: this.url_for(group.video), poster: this.url_for(group.poster),
    posterFallback: this.url_for(group.posterFallback || '/assets/fallback/image.webp'),
    position: config.positions && config.positions[group.id] || (variant === 'mobile' ? 'center 35%' : 'center')
  })
  const fallback = (video, poster, variant) => {
    if (typeof video !== 'string' || !video.trim() || typeof poster !== 'string' || !poster.trim()) return []
    const id = path.parse(video.split('?')[0]).name
    const existing = pools[variant].find(group => group.id === id)
    return [media({ id, video: assetUrl(hexo, video), poster: existing ? existing.poster : assetUrl(hexo, poster), posterFallback: existing ? existing.posterFallback : '/assets/fallback/image.webp' }, variant)]
  }
  return {
    desktop: config.random !== false && pools.desktop.length ? pools.desktop.map(group => media(group, 'desktop')) : fallback(config.video, config.poster, 'desktop'),
    mobile: config.random !== false && pools.mobile.length ? pools.mobile.map(group => media(group, 'mobile')) : fallback(config.mobile_video, config.mobile_poster, 'mobile')
  }
})
