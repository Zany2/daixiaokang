'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const media = require('../../lib/site-media')
const root = path.resolve(__dirname, '../..')
function fakeHexo(base = '', siteRoot = '/') {
  const callbacks = {}
  return { base_dir: root + path.sep, source_dir: path.join(root, 'source'), config: { root: siteRoot, url: 'https://site.test' + siteRoot }, theme: { config: { site_media: { base_url: base }, home_cinematic: { random: true } } }, extend: { helper: { register: (name, fn) => { callbacks[name] = fn } }, filter: { register: (name, fn) => { callbacks[name] = fn } } }, callbacks }
}
function runScript(file, hexo) {
  const filename = path.join(root, file)
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { hexo, require: createRequire(filename), console }, { filename })
}
test('complete media catalog has 21 desktop and 4 mobile groups with optimized images', () => {
  const pools = media.catalog(fakeHexo())
  assert.equal(pools.desktop.length, 21)
  assert.equal(pools.mobile.length, 4)
  for (const group of [...pools.desktop, ...pools.mobile]) for (const prop of ['video', 'poster', 'cover', 'thumbnail']) {
    assert.ok(fs.existsSync(path.join(root, 'source', group[prop])), group[prop])
    if (prop !== 'video') assert.match(group[prop], /\.webp$/)
  }
})
test('CDN root changes media paths but keeps emergency fallbacks and external URLs local/unchanged', () => {
  const hexo = fakeHexo('https://cdn.example.test/assets/')
  assert.equal(media.assetUrl(hexo, '/assets/home/pc_01.mp4'), 'https://cdn.example.test/assets/home/pc_01.mp4')
  assert.equal(media.assetUrl(hexo, '/assets/fallback/image.webp'), '/assets/fallback/image.webp')
  assert.equal(media.assetUrl(hexo, 'https://other.test/assets/x.png'), 'https://other.test/assets/x.png')
  assert.equal(media.catalog(hexo).desktop[20].id, 'pc_21')
  assert.match(media.catalog(hexo).mobile[3].poster, /^https:\/\/cdn\.example\.test\/assets\/home\/optimized\/home_mobile_04-background.webp$/)
})
test('missing article cover remains stable, authored cover and false are preserved despite cached covers', () => {
  const hexo = fakeHexo()
  runScript('themes/fomalhaut/scripts/filters/random_cover.js', hexo)
  const render = data => hexo.callbacks.before_post_render.call(hexo, data)
  const a = render({ source: '_posts/test.md', raw: '---\ntitle: Test\n---\nBody', cover: 'https://picsum.photos/old' })
  const b = render({ source: '_posts/test.md', raw: '---\ntitle: Test\n---\nBody', cover: 'https://old-cdn.test/old.webp' })
  assert.equal(a.cover, b.cover)
  assert.match(a.cover, /^\/assets\/home\/optimized\/pc_\d+-cover.webp$/)
  assert.equal(render({ raw: '---\ncover: https://example.test/custom.jpg\n---\n' }).cover, 'https://example.test/custom.jpg')
  const hidden = render({ raw: '---\ncover: false\n---\n', source: 'hidden.md' })
  assert.equal(hidden.cover, false)
  assert.match(hidden.randomcover, /-cover\.webp$/)
})
test('home random pool is unchanged, video and poster always use the same group', () => {
  const hexo = fakeHexo('https://cdn.example.test/assets')
  runScript('themes/fomalhaut/scripts/helpers/home_cinematic.js', hexo)
  const context = { theme: hexo.theme.config, url_for: value => value }
  const pools = hexo.callbacks.home_cinematic_media.call(context)
  assert.equal(pools.desktop.length, 21)
  assert.equal(pools.mobile.length, 4)
  for (const group of [...pools.desktop, ...pools.mobile]) {
    assert.ok(group.video.endsWith('/' + group.id + '.mp4'))
    assert.ok(group.poster.endsWith('/' + group.id + '-background.webp'))
  }
  hexo.theme.config.home_cinematic = { random: false, video: '/assets/home/pc_09.mp4', poster: '/assets/home/pc_09.png' }
  assert.equal(hexo.callbacks.home_cinematic_media.call(context).desktop[0].id, 'pc_09')
})
test('rendered HTML/CSS rewrites owned images only, including subpath hosting', () => {
  const hexo = fakeHexo('https://cdn.example.test/assets', '/blog/')
  runScript('scripts/site-media.js', hexo)
  const rewrite = hexo.callbacks['after_render:html']
  assert.equal(rewrite('<img src="/blog/assets/home/pc_01.png">'), '<img src="https://cdn.example.test/assets/home/pc_01.png">')
  assert.equal(rewrite('<img src="/blog/assets/fallback/avatar.png">'), '<img src="/blog/assets/fallback/avatar.png">')
  assert.equal(rewrite('<img src="https://other.test/assets/a.png">'), '<img src="https://other.test/assets/a.png">')
  assert.equal(hexo.callbacks['after_render:css']('a{background:url(/assets/avatar.png)}'), 'a{background:url(https://cdn.example.test/assets/avatar.png)}')
})

test('final HTML preserves local poster fallbacks in both catalogs after CDN migration', () => {
  const pug = require('pug')
  for (const siteRoot of ['/', '/blog/']) {
    const hexo = fakeHexo('https://cdn.example.test/assets', siteRoot)
    runScript('scripts/site-media.js', hexo)
    runScript('themes/fomalhaut/scripts/helpers/home_cinematic.js', hexo)
    const urlFor = require('hexo-util').url_for.bind(hexo)
    const theme = { ...hexo.theme.config, avatar: { img: '/assets/avatar.png' } }
    const siteHtml = pug.renderFile(path.join(root, 'themes/fomalhaut/layout/includes/site-media.pug'), {
      theme, url_for: urlFor, site_media_config: hexo.callbacks.site_media_config,
      site_media_cover: hexo.callbacks.site_media_cover, site_media_url: hexo.callbacks.site_media_url,
    })
    const home = hexo.callbacks.home_cinematic_media.call({ theme, url_for: urlFor })
    const html = hexo.callbacks['after_render:html'](siteHtml +
      '<script>window.__HOME_CINEMATIC_MEDIA__=' + JSON.stringify(home) + '</script>' +
      '<img src="' + siteRoot + 'assets/home/pc_01.png">')
    const context = { window: {} }
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) vm.runInNewContext(match[1], context)
    for (const catalog of [context.window.__SITE_MEDIA__, context.window.__HOME_CINEMATIC_MEDIA__]) {
      for (const group of [...catalog.desktop, ...catalog.mobile]) {
        assert.ok(group.poster.startsWith('https://cdn.example.test/assets/'))
        assert.ok(group.video.startsWith('https://cdn.example.test/assets/'))
        assert.equal(group.posterFallback, siteRoot + 'assets/home/' + group.id + '.png')
      }
    }
    assert.ok(html.includes('<img src="https://cdn.example.test/assets/home/pc_01.png">'))
  }
})
test('browser catalog resolves saved IDs after CDN switch; fallbacks do not loop', () => {
  const config = { ...media.catalog(fakeHexo('https://cdn.example.test/assets')), fallback: '/assets/fallback/image.webp', avatar: '/assets/fallback/avatar.png', defaults: {} }
  let onError
  const document = { createElement: () => ({}), head: { appendChild: () => {} }, addEventListener: (type, fn) => { if (type === 'error') onError = fn } }
  const window = { __SITE_MEDIA__: config }
  vm.runInNewContext(fs.readFileSync(path.join(root,'source/js/site-media.js'),'utf8'), { window, document, URL, location: { href: 'https://site.test/' } })
  assert.equal(window.SiteMedia.resolve('media:pc_21'), 'url("https://cdn.example.test/assets/home/optimized/pc_21-background.webp")')
  assert.equal(window.SiteMedia.resolve('media:removed'), 'default')
  assert.equal((window.SiteMedia.buttons('desktop').match(/<button /g) || []).length, 21)
  function image(avatar) { return { tagName: 'IMG', src: 'https://broken.test/a.png', dataset: {}, hasAttribute: () => false, closest: () => avatar, classList: { contains: () => false }, removeAttribute: () => {} } }
  const img = image(false)
  onError({ target: img }); assert.equal(img.src, config.fallback)
  img.src = 'https://broken.test/again.png'; onError({ target: img }); assert.equal(img.src, 'https://broken.test/again.png')
  const avatar = image(true); onError({ target: avatar }); assert.equal(avatar.src, config.avatar)
})

function browserMedia(config, overrides = {}) {
  const listeners = {}
  const document = { createElement: () => ({}), head: { appendChild: () => {} }, addEventListener: (name, callback) => { listeners[name] = callback }, ...overrides }
  const window = { __SITE_MEDIA__: config }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'source/js/site-media.js'), 'utf8'), { window, document, URL, location: { href: 'https://site.test/blog/' } })
  return { api: window.SiteMedia, listeners }
}

test('local mode uses existing video pairs, original posters and on-site emergency images', () => {
  const hexo = fakeHexo()
  runScript('scripts/site-media.js', hexo)
  const config = hexo.callbacks.site_media_config()
  for (const group of [...config.desktop, ...config.mobile]) {
    for (const field of ['video', 'poster', 'cover', 'thumbnail', 'posterFallback']) {
      assert.ok(group[field].startsWith('/assets/'), group[field])
      assert.ok(fs.existsSync(path.join(root, 'source', group[field])))
    }
    assert.equal(group.posterFallback, '/assets/home/' + group.id + '.png')
  }
  assert.ok(fs.existsSync(path.join(root, 'source', config.cat)))
  assert.equal(config.fallback, '/assets/fallback/image.webp')
  const html = '<img src="/assets/home/pc_01.png">'
  assert.equal(hexo.callbacks['after_render:html'](html), html)
})

test('empty and incomplete media pools still produce local defaults under subpath hosting', () => {
  const os = require('node:os')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-media-'))
  try {
    const home = path.join(temp, 'assets/home')
    fs.mkdirSync(home, { recursive: true })
    fs.writeFileSync(path.join(home, 'pc_01.mp4'), '')
    fs.writeFileSync(path.join(home, 'pc_02.png'), '')
    const hexo = fakeHexo('', '/blog/')
    hexo.source_dir = temp
    runScript('scripts/site-media.js', hexo)
    const config = hexo.callbacks.site_media_config()
    assert.equal(config.desktop.length, 0)
    assert.equal(config.mobile.length, 0)
    for (const value of Object.values(config.defaults)) assert.equal(value, '/blog/assets/fallback/image.webp')
    assert.equal(config.avatar, '/blog/assets/fallback/avatar.png')
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('saved owned URLs migrate to current catalog while old wallpaper APIs return to local defaults', () => {
  const config = { ...media.catalog(fakeHexo()), defaults: {}, fallback: '/assets/fallback/image.webp' }
  const { api } = browserMedia(config)
  for (const saved of ['url(https://old.test/assets/home/pc_03.png)', 'url("/blog/assets/home/optimized/pc_03-background.webp")']) {
    assert.equal(api.resolve(saved), 'url("/assets/home/optimized/pc_03-background.webp")')
  }
  for (const saved of ['url(https://picsum.photos/id/1018/1200/675)', 'url(https://bing.biturl.top/?resolution=1920)', 'url(https://t.mwm.moe/pc)']) assert.equal(api.resolve(saved), 'default')
  assert.equal(api.resolve('url(https://my-photo.test/photo.png)'), 'url(https://my-photo.test/photo.png)')
  assert.equal(api.withFallback('media:pc_03'), 'url("/assets/home/optimized/pc_03-background.webp"), url("/assets/fallback/image.webp")')
  assert.equal(api.withFallback('url("/assets/home/pc_03.png")'), 'url("/assets/home/pc_03.png"), url("/assets/fallback/image.webp")')
  assert.equal(api.withFallback('#aabbcc'), '#aabbcc')
})

test('responsive and lazy images cannot select a broken source again after local fallback', () => {
  const config = { desktop: [], mobile: [], defaults: {}, fallback: '/assets/fallback/image.webp', avatar: '/assets/fallback/avatar.png' }
  const { listeners } = browserMedia(config)
  const removed = []
  const sourceRemoved = []
  const picture = { querySelectorAll: () => [{ removeAttribute: name => sourceRemoved.push(name) }] }
  const img = { tagName: 'IMG', src: 'https://broken.test/image.webp', dataset: {}, hasAttribute: () => false, closest: selector => selector === 'picture' ? picture : null, classList: { contains: () => false }, removeAttribute: name => removed.push(name) }
  listeners.error({ target: img })
  assert.equal(img.src, config.fallback)
  assert.equal(img.loading, 'eager')
  assert.ok(removed.includes('srcset') && removed.includes('data-lazy-src') && removed.includes('data-srcset'))
  assert.deepEqual(sourceRemoved, ['srcset', 'data-srcset'])
  img.src = 'https://site.test/assets/fallback/image.webp'
  listeners.error({ target: img })
  assert.equal(img.src, 'https://site.test/assets/fallback/image.webp')
})

function backgroundSettings(saved = 'default') {
  const config = { ...media.catalog(fakeHexo()), defaults: {}, fallback: '/assets/fallback/image.webp' }
  const pending = new Map()
  const storage = new Map([['blogbg', saved]])
  const style = { innerText: '' }
  const classes = new Set()
  const context = {
    window: { SiteMedia: browserMedia(config).api },
    document: { getElementById: () => style, documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }, dispatchEvent: () => {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    checkImgExists: url => new Promise((resolve, reject) => pending.set(url, { resolve, reject })),
    fomalNotify: () => {}, Event: class {},
  }
  vm.createContext(context)
  const text = fs.readFileSync(path.join(root, 'source/js/modules/settings.js'), 'utf8')
  vm.runInContext(text.slice(text.indexOf('function isValidBgVal('), text.indexOf('// 切换链接对应的背景')), context)
  return { context, pending, storage, style, classes, url: id => '/assets/home/optimized/' + id + '-background.webp' }
}

test('restoring a saved background restores visibility and resets release the cinematic layer', async () => {
  const state = backgroundSettings('media:pc_21')
  assert.ok(state.classes.has('custom-site-background'))
  assert.ok(state.style.innerText.includes('pc_21-background.webp'))
  state.pending.get(state.url('pc_21')).reject(new Error('unavailable'))
  await Promise.resolve()
  assert.equal(state.storage.get('blogbg'), 'default')
  assert.ok(!state.classes.has('custom-site-background'))
  state.context.setBg('#aabbcc')
  assert.ok(state.classes.has('custom-site-background'))
  state.context.resetBg_()
  assert.ok(!state.classes.has('custom-site-background'))
})

test('slower previous background selections cannot overwrite the latest choice or a reset', async () => {
  const state = backgroundSettings()
  state.context.changeBg('media:pc_01')
  state.context.changeBg('media:pc_02')
  state.pending.get(state.url('pc_02')).resolve()
  await Promise.resolve()
  state.pending.get(state.url('pc_01')).resolve()
  await Promise.resolve()
  assert.equal(state.storage.get('blogbg'), 'media:pc_02')
  assert.ok(state.style.innerText.includes('pc_02-background.webp'))
  state.context.changeBg('media:pc_03')
  state.storage.set('blogbg', 'default')
  state.context.resetBg_()
  state.pending.get(state.url('pc_03')).resolve()
  await Promise.resolve()
  assert.equal(state.storage.get('blogbg'), 'default')
  assert.ok(!state.style.innerText.includes('pc_03-background.webp'))
})

test('failed startup background probes cannot reset a subsequently selected local background', async () => {
  const state = backgroundSettings('media:pc_01')
  state.context.changeBg('media:pc_02')
  state.pending.get(state.url('pc_02')).resolve()
  await Promise.resolve()
  state.pending.get(state.url('pc_01')).reject(new Error('old image unavailable'))
  await Promise.resolve()
  assert.equal(state.storage.get('blogbg'), 'media:pc_02')
  assert.ok(state.style.innerText.includes('pc_02-background.webp'))
})
