'use strict'
// Run against npm run server. Set PLAYWRIGHT_MODULE_PATH if Playwright is bundled externally.
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const base = process.env.MEDIA_TEST_URL || 'http://127.0.0.1:4000'

async function ready(page) {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.SiteMedia && typeof window.createWinbox === 'function')
}

async function smoke(browser, variant, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  const providers = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (/picsum\.photos|bing\.biturl|loliapi|jitsu\.top|t\.mwm|image\.thum/.test(request.url())) providers.push(request.url())
  })
  try {
    await ready(page)
    await page.waitForFunction(() => document.querySelector('[data-home-still]').naturalWidth > 1 && document.querySelector('#body-wrap').dataset.homeIntro === 'still')
    const first = await page.evaluate(variant => window.__HOME_CINEMATIC_MEDIA__[variant].id, variant)
    const local = await page.evaluate(() => window.__SITE_MEDIA__)
    assert.equal(local.desktop.length, 30)
    assert.equal(local.mobile.length, 5)
    for (const group of [...local.desktop, ...local.mobile]) for (const field of ['video', 'poster', 'posterFallback', 'cover', 'thumbnail']) assert.ok(group[field].startsWith('/assets/'))
    await page.evaluate(() => createWinbox())
    assert.equal(await page.locator('#meihuaBox button[onclick*="media:pc_"]').count(), 30)
    assert.equal(await page.locator('#meihuaBox button[onclick*="media:home_mobile_"]').count(), 5)
    assert.equal(await page.locator('#meihuaBox .apiBox').count(), 0)
    const id = variant === 'desktop' ? 'pc_30' : 'home_mobile_05'
    await page.locator('#meihuaBox button[onclick="changeBg(\'media:' + id + '\')"]').click()
    await page.waitForFunction(id => localStorage.getItem('blogbg') === 'media:' + id, id)
    const css = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--default-bg'))
    assert.ok(css.includes(id + '-background.webp') && css.includes('/assets/fallback/image.webp'))
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#web_bg')).display), 'block')
    await page.evaluate(() => {
      const picture = document.createElement('picture')
      picture.innerHTML = '<source srcset="/missing-media-source.webp"><img id="media-probe" src="/missing-media-image.webp">'
      document.body.appendChild(picture)
    })
    await page.waitForFunction(() => document.querySelector('#media-probe').src.endsWith('/assets/fallback/image.webp') && document.querySelector('#media-probe').naturalWidth > 0)
    assert.equal(await page.locator('#media-probe').evaluate(img => img.closest('picture').querySelector('source').hasAttribute('srcset')), false)
    await page.screenshot({ path: path.resolve(__dirname, '../../tools/.media-' + variant + '.png') })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(variant => window.__HOME_CINEMATIC_MEDIA__[variant], variant)
    assert.notEqual(await page.evaluate(variant => window.__HOME_CINEMATIC_MEDIA__[variant].id, variant), first)
    assert.equal(await page.evaluate(() => localStorage.getItem('blogbg')), 'media:' + id)
    await page.waitForFunction(() => document.querySelector('#body-wrap').dataset.homeIntro === 'still')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#web_bg')).display), 'block')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#site-cinematic-background')).display), 'none')
    assert.ok(await page.evaluate(id => getComputedStyle(document.querySelector('#web_bg')).backgroundImage.includes(id + '-background.webp'), id))
    await page.evaluate(() => resetBg())
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('custom-site-background')), false)
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#site-cinematic-background')).display), 'block')
    await page.evaluate(() => localStorage.setItem('blogbg', 'url(https://picsum.photos/id/1018/1200/675)'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => localStorage.getItem('blogbg') === 'default')
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('custom-site-background')), false)
    assert.deepEqual(providers, [])
    assert.deepEqual(errors, [])
    console.log(variant + ': local pools, saved backgrounds, responsive fallback, no wallpaper APIs passed.')
  } finally {
    await context.close()
  }
}

async function savedBackgroundWithoutIntro(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const videos = []
  page.on('request', request => { if (/\/assets\/home\/.*\.mp4$/.test(request.url())) videos.push(request.url()) })
  try {
    // Initialize site preferences normally, then test an actual saved selection.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready(page)
    await page.evaluate(() => changeBg('media:pc_30'))
    await page.waitForFunction(() => localStorage.getItem('blogbg') === 'media:pc_30')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    videos.length = 0
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.SiteMedia && typeof window.changeBg === 'function')
    await page.waitForFunction(() => document.querySelector('#body-wrap').dataset.homeIntro === 'still')
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('web_bg')).display), 'block')
    assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('web_bg')).backgroundImage.includes('pc_30-background.webp')))
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    assert.deepEqual(videos, [], 'A saved custom background must not play a hidden intro')
    console.log('desktop: saved background remains visible without a hidden video intro passed.')
  } finally {
    await context.close()
  }
}

async function cdnFailure(browser) {
  const fs = require('node:fs')
  const vm = require('node:vm')
  const { createRequire } = require('node:module')
  const filename = path.resolve(__dirname, '../../scripts/site-media.js')
  const callbacks = {}
  const origin = 'https://media-cdn.invalid'
  const hexo = {
    config: { root: '/', url: base + '/' }, theme: { config: { site_media: { base_url: origin + '/assets' } } },
    extend: { helper: { register: () => {} }, filter: { register: (name, fn) => { callbacks[name] = fn } } },
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { hexo, require: createRequire(filename) })
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.route(origin + '/**', route => route.abort())
  await page.route(base + '/', async route => {
    const response = await route.fetch()
    // Model the helpers' primary media URLs pointing at the future CDN.
    const html = (await response.text()).replace(/"(video|poster|cover|thumbnail)":"(\/assets\/[^"\s]+)"/g,
      (all, key, url) => '"' + key + '":"' + origin + url + '"')
    await route.fulfill({ response, body: callbacks['after_render:html'](html) })
  })
  try {
    await ready(page)
    const group = await page.evaluate(() => window.__HOME_CINEMATIC_MEDIA__.desktop)
    assert.ok(group.poster.startsWith(origin))
    assert.equal(group.posterFallback, '/assets/home/' + group.id + '.png')
    assert.equal(await page.evaluate(id => window.__SITE_MEDIA__.desktop.find(group => group.id === id).posterFallback, group.id), group.posterFallback)
    await page.waitForFunction(expected => {
      const img = document.querySelector('[data-home-still]')
      return img.src.endsWith(expected) && img.naturalWidth > 1 && document.querySelector('#body-wrap').dataset.homeIntro === 'still'
    }, group.posterFallback)
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    console.log('desktop: CDN outage falls back to the selected original on the website origin passed.')
  } finally {
    await context.close()
  }
}

async function failure(browser, variant, viewport, emergency) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const posters = []
  await page.route('**/assets/home/optimized/*-background.webp*', route => route.abort())
  page.on('request', request => { if (/\/assets\/home\/[^/]+\.png$/.test(request.url())) posters.push(request.url()) })
  if (emergency) await page.route('**/assets/home/*.png', route => route.abort())
  try {
    await ready(page)
    const selected = await page.evaluate(variant => window.__HOME_CINEMATIC_MEDIA__[variant].id, variant)
    const expected = emergency ? '/assets/fallback/image.webp' : '/assets/home/' + selected + '.png'
    await page.waitForFunction(expected => {
      const img = document.querySelector('[data-home-still]')
      return img.src.endsWith(expected) && img.naturalWidth > 1 && document.querySelector('#body-wrap').dataset.homeIntro === 'still'
    }, expected)
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    assert.ok(await page.locator('#site-cinematic-background').evaluate((element, expected) => element.style.backgroundImage.includes(expected), expected))
    assert.equal(posters.length, 1, 'Only the selected group original should be retried')
    console.log(variant + ': broken optimized poster -> ' + (emergency ? 'local emergency image' : 'same-group PNG') + ' passed.')
  } finally {
    await context.close()
  }
}

async function videoFailure(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await context.newPage()
  await page.route('**/assets/home/*.mp4', route => route.abort())
  try {
    await ready(page)
    await page.waitForFunction(() => document.querySelector('#body-wrap').dataset.homeIntro === 'still' && document.querySelector('[data-home-still]').naturalWidth > 1)
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    await page.waitForFunction(() => !document.querySelector('#home-background video').hasAttribute('src'))
    console.log('desktop: video failure restores the selected still and releases video passed.')
  } finally {
    await context.close()
  }
}

async function videoPlayback(browser, variant, viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.addInitScript(() => document.addEventListener('playing', event => {
    if (event.target.tagName === 'VIDEO') window.__mediaPlayed = true
  }, true))
  try {
    await ready(page)
    await page.waitForFunction(() => window.__mediaPlayed)
    await page.evaluate(() => document.getElementById('home-intro-skip').click())
    await page.waitForFunction(() => document.querySelector('#body-wrap').dataset.homeIntro === 'still' && document.querySelector('[data-home-still]').naturalWidth > 1)
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    console.log(variant + ': local video playback and skip to matching still passed.')
  } finally {
    await context.close()
  }
}

async function allPostersFail(browser) {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.route('**/assets/home/optimized/*-background.webp*', route => route.abort())
  await page.route('**/assets/home/*.png', route => route.abort())
  await page.route('**/assets/fallback/image.webp', route => route.abort())
  try {
    await ready(page)
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-home-still]')
      return img.src.endsWith('/assets/fallback/image.webp') && img.complete && !img.naturalWidth && document.querySelector('#home-background').hidden && document.querySelector('#body-wrap').dataset.homeIntro === 'still'
    })
    assert.equal(await page.evaluate(() => document.getElementById('site-info').inert), false)
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('home-intro-pending')), false)
    console.log('desktop: all poster sources fail without blocking content passed.')
  } finally {
    await context.close()
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: process.env.MEDIA_TEST_BROWSER || 'msedge', headless: true })
  try {
    for (const [variant, viewport] of [['desktop', { width: 1440, height: 950 }], ['mobile', { width: 390, height: 844 }]]) {
      await smoke(browser, variant, viewport)
      await failure(browser, variant, viewport, false)
      await failure(browser, variant, viewport, true)
      await videoPlayback(browser, variant, viewport)
    }
    await videoFailure(browser)
    await allPostersFail(browser)
    await savedBackgroundWithoutIntro(browser)
    await cdnFailure(browser)
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
