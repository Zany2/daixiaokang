'use strict';
// Build first. Verifies that local search works without Algolia or another search API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cheerio = require('cheerio');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../../public');
const $ = cheerio.load(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
assert.equal($('#algolia-search').length, 0, 'Algolia dialog is disabled');
assert.equal($('script[src="/js/search/local-search.js"]').length, 1);
assert.equal($('script').toArray().some(el => $(el).text().includes('window.__SEARCH_LAZY__ =')), false);
const configScript = $('script').toArray().find(el => $(el).text().includes('const GLOBAL_CONFIG ='));
assert.ok(configScript, 'generated search configuration exists');
const searchXml = cheerio.load(fs.readFileSync(path.join(root, 'search.xml'), 'utf8'), { xmlMode: true });
const firstEntry = searchXml('entry').first();
const entryTitle = firstEntry.find('title').text();
const contentWords = cheerio.load(firstEntry.find('content').text()).text().match(/[a-zA-Z]{8,}/g) || [];
const contentKeyword = contentWords.find(word => !entryTitle.toLowerCase().includes(word.toLowerCase()));
assert.ok(contentKeyword, 'index includes a searchable word that is absent from the article title');
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/index.css"><script>${$(configScript).text()}</script>
<style>.search-close-button::after{content:'×'}</style>
<script defer src="/js/utils.js"></script><script defer src="/js/search/local-search.js"></script>
<script defer src="/js/modules/shell.js"></script>
</head><body>${$.html($('#search-button'))}${$.html($('#local-search'))}</body></html>`;

async function main() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture); return; }
    let target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404).end(); return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    let indexRequests = 0;
    let failIndex = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname === '/search.xml') indexRequests++; });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (url.pathname === '/search.xml' && failIndex) {
        failIndex = false;
        return route.fulfill({ status: 503, body: 'temporary failure' });
      }
      return route.continue();
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof btf !== 'undefined' && document.querySelector('#search-button > .search')?.dataset.localSearchBound === 'true');
    assert.equal(indexRequests, 0, 'search.xml is loaded on demand');
    assert.equal(await page.locator('#algolia-search').count(), 0, 'Algolia dialog is disabled');
    await page.locator('#search-button > .search').click();
    await page.waitForFunction(() => document.querySelector('#loading-status').textContent.includes('加载失败'));
    await page.keyboard.press('Escape');
    await page.locator('#local-search .search-dialog').waitFor({ state: 'hidden' });
    await page.locator('#search-button > .search').click();
    await page.locator('#local-search-input input').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#loading-status').innerText(), '', 'successful retry clears the earlier failure');
    await page.locator('#local-search-input input').fill('DeerFlow');
    await page.waitForFunction(() => document.querySelectorAll('.local-search__hit-item').length > 0);
    assert.equal(indexRequests, 2);
    assert.match(await page.locator('.local-search__hit-item').first().innerText(), /DeerFlow 2\.0使用指南/);
    assert.equal(await page.locator('.local-search__hit-item').first().locator('.search-keyword').first().innerText(), 'DeerFlow');
    const resultUrl = new URL(await page.locator('.search-result-title').first().getAttribute('href'));
    assert.equal(resultUrl.hostname, '127.0.0.1', 'result links stay on the current origin');
    await page.locator('#local-search-input input').fill(contentKeyword);
    await page.waitForFunction(title => [...document.querySelectorAll('.search-result-title')].some(el => el.textContent === title), entryTitle);
    await page.locator('#local-search-input input').fill('deerflow 使用指南');
    await page.waitForFunction(() => document.querySelectorAll('.local-search__hit-item').length === 1);
    await page.locator('#local-search-input input').fill('');
    await page.waitForFunction(() => !document.querySelector('#local-search-results').textContent);
    const literalQuery = '<img src=x onerror=alert(1)> $&';
    await page.locator('#local-search-input input').fill(literalQuery);
    await page.waitForFunction(() => document.querySelector('#local-search__hits-empty'));
    assert.ok((await page.locator('#local-search__hits-empty').innerText()).endsWith(literalQuery));
    assert.equal(await page.locator('#local-search-results img').count(), 0, 'query is rendered as plain text');
    await page.locator('#local-search-input input').fill('不存在的全局检索词');
    await page.waitForFunction(() => document.querySelector('#local-search__hits-empty'));
    assert.match(await page.locator('#local-search__hits-empty').innerText(), /不存在的全局检索词/);
    await page.locator('#local-search .search-close-button').click();
    await page.locator('#local-search .search-dialog').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      const oldButton = document.getElementById('search-button');
      oldButton.replaceWith(oldButton.cloneNode(true));
      document.dispatchEvent(new Event('pjax:complete'));
    });
    await page.locator('#search-button > .search').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#local-search .search-dialog')).display !== 'none');
    assert.equal(indexRequests, 2, 'the cached local index is reused after PJAX');
    await page.locator('#local-search-input input').fill('DeerFlow');
    await page.waitForFunction(() => document.querySelectorAll('.local-search__hit-item').length > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'search fits the viewport');
    await page.evaluate(() => {
      document.querySelector('#local-search .search-close-button').click();
      document.querySelector('#search-button > .search').click();
    });
    await page.waitForTimeout(700);
    await page.locator('#local-search-input input').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      document.querySelector('#local-search .search-dialog').style.animation = 'none';
      document.querySelector('#search-mask').style.animation = 'none';
    });
    await page.keyboard.press('Escape');
    await page.locator('#local-search .search-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'closing restores page scrolling');
    assert.deepEqual(errors, []);
    console.log((mobile ? 'Mobile' : 'Desktop') + ' local search passed: retry recovery, lazy index/cache, title/body/multiple keywords, literal query, PJAX rebinding, rapid reopen and closing.');
    await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
