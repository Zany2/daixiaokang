'use strict';
// Run after npm run build. Uses the real compiled theme CSS and navigation helpers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../..');
const nav = `<nav id="nav" class="show nav_fixed"><span id="blog_name"><a id="site-name" href="/">Zany</a></span>
<div id="menus"><div class="menus_items"><div class="menus_item"><a class="site-page" href="/second">页面二</a></div>
<div class="menus_item"><a class="site-page group" href="javascript:void(0)">更多</a><ul class="menus_item_child"><li><a href="/second">子菜单页面</a></li></ul></div></div>
<center id="name-container"><a id="page-name" href="#">标题</a></center><div id="nav-right"><div id="toggle-menu"><a><i>菜单</i></a></div></div></div></nav>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>导航测试 | Zany</title><link rel="stylesheet" href="/css/index.css"><link rel="stylesheet" href="/css/feedback.css"><link rel="stylesheet" href="/css/site-ui-toggle.css">
<script src="/js/inject/site-ui-toggle.js"></script><script>window.$=()=>({off(){}});</script><script defer src="/nav-helpers.js"></script>
<style>body{min-height:2400px}#test-outside{position:absolute;top:250px;left:20px}#rightside{opacity:1!important;transform:none!important;right:10px!important;bottom:40px!important}
@media(max-width:800px){#nav .menus_items{display:none!important}#nav #toggle-menu{display:block!important}}</style></head><body>
<div id="page-header" class="full_page">${nav}<div id="site-title">首页标题</div></div>
<div id="sidebar"><div id="menu-mask"></div><div id="sidebar-menus"><a href="/second">抽屉页面</a></div></div>
<button id="test-outside">页面空白处</button><div id="rightside"><div id="rightside-config-show"><button>工具</button></div><button id="site-ui-toggle"><i></i>收纳</button></div>
<script>document.querySelector('#toggle-menu').onclick=()=>{document.querySelector('#sidebar-menus').classList.add('open');document.querySelector('#menu-mask').style.display='block';document.body.style.overflow='hidden'};
document.querySelector('#menu-mask').onclick=()=>{document.querySelector('#sidebar-menus').classList.remove('open');document.querySelector('#menu-mask').style.display='none';document.body.style.overflow=''};</script>
</body></html>`;

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/nav-helpers.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(fs.readFileSync(path.join(root, 'source/js/modules/nav.js'), 'utf8').split('/* ------------------------------ 欢迎信息')[0]);
    } else if (['/css/index.css', '/css/feedback.css', '/css/site-ui-toggle.css', '/js/inject/site-ui-toggle.js'].includes(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      const folder = url.pathname === '/css/index.css' ? 'public' : 'source';
      res.end(fs.readFileSync(path.join(root, folder, url.pathname)));
    } else if (url.pathname === '/' || url.pathname === '/second') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
    for (const [touch, motion] of [[false, 'reduce'], [true, 'reduce'], [false, 'no-preference'], [true, 'no-preference']]) {
      const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1366, height: 900 },
        isMobile: touch, hasTouch: touch, reducedMotion: motion });
      console.log('Checking ' + (touch ? 'mobile' : 'desktop') + ', motion=' + motion);
      await context.addInitScript(() => {
        if (localStorage.getItem('site-ui-collapsed') === null) localStorage.setItem('site-ui-collapsed', '1');
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      const expanded = () => page.evaluate(() => document.documentElement.classList.contains('site-nav-peek'));
      const waitClosed = () => page.waitForFunction(() => !document.documentElement.classList.contains('site-nav-peek') && document.querySelector('#nav').inert);
      await waitClosed();
      if (!touch) {
        const height = await page.locator('#nav').evaluate(el => el.getBoundingClientRect().height);
        assert.equal(await page.locator('#site-nav-reveal').evaluate(el => el.getBoundingClientRect().height), height,
          'desktop detection area must match the full navigation height');
        await page.mouse.move(400, height + 2);
        assert.equal(await expanded(), false, 'below the navigation height must not open the menu');
        await page.mouse.move(400, height - 2);
        await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#nav')).opacity) > .99);
        await page.mouse.move(500, 300); await waitClosed();
        if (motion === 'no-preference') {
          await page.waitForTimeout(100);
          const leaving = await page.locator('#nav').evaluate(el => {
            const css = getComputedStyle(el);
            return { opacity: Number(css.opacity), visibility: css.visibility, top: el.getBoundingClientRect().top };
          });
          assert.equal(leaving.visibility, 'visible', 'closing nav stays rendered during the animation');
          assert.ok(leaving.opacity > 0 && leaving.opacity < 1, 'closing nav fades rather than disappearing');
          assert.ok(leaving.top < 0 && leaving.top > -height - 20, 'closing nav slides upward gradually');
        }
      }
      // Temporary navigation uses a solid background, so text must follow its theme.
      async function checkPalette(theme) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        if (touch) await page.locator('#site-nav-reveal').tap();
        else await page.mouse.move(400, 2);
        await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
        const palette = await page.evaluate(() => {
          const probe = document.createElement('span'); probe.style.color = 'var(--font-color)';
          document.body.appendChild(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          return { expected, actual: getComputedStyle(document.querySelector('#site-name')).color };
        });
        assert.equal(palette.actual, palette.expected, theme + ' nav foreground must match the solid nav background');
        if (touch) await page.locator('#test-outside').tap();
        else await page.mouse.move(500, 300);
        await waitClosed();
      }
      await checkPalette('light');
      await checkPalette('dark');
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.evaluate(() => document.querySelector('#page-header').classList.add('guestbook-header'));
      await checkPalette('light');
      await page.evaluate(() => document.querySelector('#page-header').classList.remove('guestbook-header'));
      if (!touch) {
        await page.mouse.move(400, 2);
        await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
        await page.locator('#nav .group').hover();
        await page.locator('#nav .menus_item_child a').hover();
        assert.equal(await expanded(), true, 'submenu remains usable beyond the nav bar');
        await page.mouse.move(500, 300); await waitClosed();
        await page.evaluate(() => { scrollTo(0, 800); document.querySelector('#page-header').classList.add('nav-fixed'); setNavTitleVisible(true); });
        await page.mouse.move(400, 2);
        await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
        await page.evaluate(() => setNavTitleVisible(true));
        assert.equal(await page.locator('#nav .menus_items').evaluate(el => el.inert), false, 'scroll title must not disable menu links');
        assert.equal(await page.locator('#nav').evaluate(el => el.getBoundingClientRect().top), 0);
        await page.locator('#nav .group').hover();
        await page.locator('#nav .menus_item_child a').click();
      } else {
        await page.locator('#site-nav-reveal').tap();
        assert.equal(await expanded(), true);
        await page.locator('#test-outside').tap(); await waitClosed();
        await page.locator('#site-nav-reveal').tap();
        await page.locator('#toggle-menu').tap();
        assert.equal(await page.locator('#sidebar-menus').evaluate(el => el.classList.contains('open')), true);
        await page.locator('#sidebar-menus a').tap();
      }
      await page.waitForURL(base + '/second');
      await waitClosed();
      assert.equal(await page.evaluate(() => localStorage.getItem('site-ui-collapsed')), '1');
      assert.equal(await page.locator('#rightside-config-show').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
      await page.reload(); await waitClosed();
      if (!touch) {
        await page.locator('#site-nav-reveal').focus();
        await page.keyboard.press('Enter');
        assert.equal(await expanded(), true, 'keyboard can reveal navigation');
        assert.equal(await page.locator('#nav').evaluate(el => el.contains(document.activeElement)), true);
        await page.keyboard.press('Escape'); await waitClosed();
        await page.mouse.move(500, 300);
      } else {
        await page.locator('#site-nav-reveal').tap();
        await page.evaluate(() => scrollTo(0, 400)); await waitClosed();
        await page.evaluate(() => scrollTo(0, 0));
      }
      // PJAX replaces the nav but must retain a working trigger and hide it again.
      if (touch) {
        await page.locator('#site-nav-reveal').tap();
        await page.locator('#toggle-menu').tap();
      }
      await page.evaluate(() => {
        document.dispatchEvent(new Event('pjax:send'));
        const nav = document.querySelector('#nav'); nav.replaceWith(nav.cloneNode(true));
        document.dispatchEvent(new Event('pjax:complete'));
      });
      assert.equal(await page.locator('#sidebar-menus').evaluate(el => el.classList.contains('open')), false,
        'PJAX navigation must close the retained mobile drawer');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'navigation must release the drawer scroll lock');
      if (touch) await page.locator('#site-nav-reveal').tap();
      else await page.mouse.move(400, 2);
      await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
      assert.equal(await page.locator('#nav').evaluate(el => el.inert), false);
      // A back-forward cache restore closes transient menus without clearing preferences.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await waitClosed();
      if (touch) await page.locator('#site-nav-reveal').tap();
      else {
        await page.mouse.move(500, 300);
        await page.mouse.move(400, 2);
      }
      await page.waitForFunction(() => document.documentElement.classList.contains('site-nav-peek'));
      await page.evaluate(async () => {
        const previous = document.querySelector('#nav');
        previous.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        document.dispatchEvent(new Event('pjax:send'));
        previous.replaceWith(previous.cloneNode(true));
        document.dispatchEvent(new Event('pjax:complete'));
        document.querySelector('#site-nav-reveal').click();
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      assert.equal(await expanded(), true, 'delayed focus events from a detached nav must not close the new menu');
      // Scrolling while temporarily expanded must remember the latest title/menu state.
      await page.evaluate(() => setNavTitleVisible(true));
      await page.keyboard.press('Escape'); await waitClosed();
      await page.locator('#site-ui-toggle').click();
      assert.equal(await page.locator('#site-nav-reveal').isVisible(), false);
      assert.equal(await page.locator('#nav').evaluate(el => el.inert), false);
      assert.equal(await page.locator('#nav').evaluate(el => el.classList.contains('nav-title-visible')), true,
        'restoring full UI must use the latest scroll state, not the state from before reveal');
      assert.equal(await page.evaluate(() => localStorage.getItem('site-ui-collapsed')), '0');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Site UI browser tests passed: desktop/mobile, full/reduced motion, light/dark/guestbook contrast, hover/dropdowns, touch/drawer/dismissal, refresh, PJAX cleanup, cache restore, stale events and scroll state.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
