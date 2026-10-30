'use strict';
// Build first. Exercise generated home content with the compiled theme styles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cheerio = require('cheerio');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../../public');
const $ = cheerio.load(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
assert.equal($('.home-discovery').length, 2);
assert.ok($('.home-feature-slide').length > 1);
const feed = cheerio.load(fs.readFileSync(path.join(root, 'atom.xml'), 'utf8'), { xmlMode: true });
assert.deepEqual($('.home-feature-title').map((i, el) => $(el).text()).get(),
  feed('feed > entry > title').slice(0, 6).map((i, el) => feed(el).text()).get(),
  'carousel uses the latest six published articles, independently of pinned or recommended flags');
assert.equal($('.home-feature-toggle').length, 0, 'no start/pause button');
assert.equal($('.footer-badge[href="https://github.com/Zany2"]').text().includes('GitHub主页'), true);
assert.ok($('.home-category').length > 0);
for (const el of $('.home-discovery a').toArray()) {
  const href = $(el).attr('href');
  assert.ok(href.startsWith('/') && !href.startsWith('//'), 'home links stay on this site');
  const target = path.join(root, decodeURIComponent(href), href.endsWith('/') ? 'index.html' : '');
  assert.ok(fs.existsSync(target), 'home destination exists: ' + href);
}
const animationBootstrap = $('.js-pjax script').toArray().filter(el => $(el).text().includes('data-wow-duration')).map(el => $.html(el)).join('');
const fixture = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/index.css"><link rel="stylesheet" href="/css/home-discovery.css"><link rel="stylesheet" href="/test-wow/animate.min.css">
<style>.layout{padding-top:20px}</style>
<script defer src="/test-wow/wow.min.js"></script><script defer src="/test-wow/wow_init.js"></script>
<script defer src="/js/home-discovery.js"></script></head><body><main class="layout"><div id="recent-posts" class="recent-posts">${$('#recent-posts').html()}</div><aside id="aside-content"></aside></main><button id="outside">页面其他内容</button>${animationBootstrap}</body></html>`;

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
    if (['/test-wow/wow.min.js', '/test-wow/wow_init.js', '/test-wow/animate.min.css'].includes(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(fs.readFileSync(path.resolve(__dirname, '../../node_modules/hexo-butterfly-wowjs/lib', path.basename(url.pathname)))); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const types = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.stack || error.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:' + server.address().port);
      const feature = page.locator('[data-home-feature]');
      await page.locator('.home-feature-controls').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('.home-feature-slide.is-active img').naturalWidth > 1);
      const animation = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.home-discovery'), document.querySelector('.recent-post-item')];
        return nodes.map(el => ({ zoom: el.classList.contains('animate__zoomIn'), duration: el.dataset.wowDuration, delay: el.dataset.wowDelay, offset: el.dataset.wowOffset, iteration: el.dataset.wowIteration }));
      });
      assert.equal(animation[0].zoom, true, 'carousel participates in the article card entrance animation');
      assert.deepEqual(animation[0], animation[2]);
      assert.deepEqual(animation[1], animation[2]);
      await page.waitForTimeout(2300); // Entrance transforms must finish before checking layout.
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      const bounds = await feature.boundingBox();
      const categories = await page.locator('.home-categories').boundingBox();
      assert.ok(categories.y >= bounds.y + bounds.height, 'categories follow the carousel');
      const firstPost = await page.locator('#recent-posts > .recent-post-item').first().boundingBox();
      assert.ok(firstPost.y >= categories.y + categories.height, 'article cards follow both full-width sections');
      const current = () => page.locator('.home-feature-dot[aria-current="true"]').getAttribute('data-slide');
      assert.equal(await current(), '0');
      await page.locator('.home-feature-dot').nth(1).click();
      assert.equal(await current(), '1');
      assert.equal(await page.locator('.home-feature-slide.is-active').evaluate(el => el.inert), false);
      assert.equal(await page.locator('.home-feature-slide:not(.is-active)').first().evaluate(el => el.inert), true);
      await page.locator('.home-feature-dot').nth(1).press('Home');
      assert.equal(await current(), '0');
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        assert.equal(await feature.evaluate(el => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'), true);
      }
      await page.evaluate(() => document.documentElement.dataset.theme = 'light');
      if (mobile) {
        assert.equal(await page.locator('.home-category-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
        await page.locator('#outside').focus();
        await page.waitForTimeout(5200);
        assert.equal(await current(), '0', 'reduced motion pauses autoplay without a playback button');
      } else {
        // Use the actual configured autoplay duration, then pause with mouse hover.
        await page.locator('#outside').focus();
        await page.mouse.move(1200, 850);
        await page.waitForFunction(() => document.querySelector('.home-feature-dot[aria-current="true"]').dataset.slide !== '0', null, { timeout: 7000 });
        await feature.hover();
        const pausedAt = await current();
        await page.waitForTimeout(5200);
        assert.equal(await current(), pausedAt, 'hover pauses autoplay');
      }
      // Mimic PJAX replacing the home container; repeated completion must not duplicate controls.
      await page.evaluate(({ markup, bootstrap }) => {
        document.dispatchEvent(new Event('pjax:send'));
        const original = document.querySelector('#recent-posts');
        const replacement = document.createElement('div');
        replacement.id = 'recent-posts'; replacement.className = 'recent-posts';
        replacement.innerHTML = markup;
        original.replaceWith(replacement);
        const holder = document.createElement('div'); holder.innerHTML = bootstrap;
        for (const source of holder.querySelectorAll('script')) {
          const script = document.createElement('script'); script.textContent = source.textContent;
          document.body.appendChild(script); script.remove();
        }
        document.dispatchEvent(new Event('pjax:complete'));
        document.dispatchEvent(new Event('pjax:complete'));
      }, { markup: $('#recent-posts').html(), bootstrap: animationBootstrap });
      assert.equal(await current(), '0');
      await page.locator('.home-feature-dot').nth(1).click();
      assert.equal(await current(), '1');
      assert.equal(await page.locator('.home-feature-controls').count(), 1);
      await page.waitForTimeout(2300);
      await page.screenshot({ path: path.resolve(__dirname, '../.tmp-home-discovery-' + (mobile ? 'mobile' : 'desktop') + '.png'), fullPage: true });
      assert.deepEqual(errors, []);
      console.log((mobile ? 'Mobile' : 'Desktop') + ': generated content, covers, links, layout, themes, carousel controls and PJAX passed.');
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
