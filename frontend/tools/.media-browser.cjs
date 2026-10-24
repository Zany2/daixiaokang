'use strict'
const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/daixk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
 for (const [variant,viewport] of [['desktop',{width:1440,height:950}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport,reducedMotion:'reduce'})
  const page=await context.newPage();const errors=[];const external=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('request',req=>{if(/picsum\.photos|bing\.biturl|loliapi|jitsu\.top|t\.mwm|image\.thum/.test(req.url()))external.push(req.url())})
  await page.goto('http://localhost:4000/',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.SiteMedia && typeof window.createWinbox==='function')
  const before=await page.evaluate(()=>({desktop:window.__SITE_MEDIA__.desktop.length,mobile:window.__SITE_MEDIA__.mobile.length,selected:window.__HOME_CINEMATIC_MEDIA__,covers:[...document.querySelectorAll('.article-cover')].map(x=>x.dataset.lazySrc||x.src)}))
  assert.equal(before.desktop,21);assert.equal(before.mobile,4)
  for(const cover of before.covers)assert.match(cover,/\/assets\/home\/optimized\/pc_\d+-cover.webp$/)
  assert.ok(before.selected[variant])
  await page.evaluate(()=>createWinbox())
  assert.equal(await page.locator('#meihuaBox button[onclick*="media:pc_"]').count(),21)
  assert.equal(await page.locator('#meihuaBox button[onclick*="media:home_mobile_"]').count(),4)
  const id=variant==='desktop'?'pc_21':'home_mobile_04'
  await page.locator('#meihuaBox button[onclick="changeBg(\'media:'+id+'\')"]').click()
  await page.waitForFunction(id=>localStorage.getItem('blogbg')==='media:'+id,id)
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#web_bg')).display),'block')
  assert.match(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--default-bg')),new RegExp(id+'-background.webp'))
  // Real broken image events must resolve once to the website's own small placeholder.
  await page.evaluate(()=>{let img=document.createElement('img');img.id='media-probe';document.body.appendChild(img);img.src='/missing-media-test.webp'})
  await page.waitForFunction(()=>document.querySelector('#media-probe').src.endsWith('/assets/fallback/image.webp') && document.querySelector('#media-probe').naturalWidth>0)
  await page.screenshot({path:'frontend/tools/.media-'+variant+'.png',fullPage:false})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__HOME_CINEMATIC_MEDIA__ && Object.keys(window.__HOME_CINEMATIC_MEDIA__).length)
  const after=await page.evaluate(variant=>window.__HOME_CINEMATIC_MEDIA__[variant].id,variant)
  assert.notEqual(after,before.selected[variant].id)
  assert.equal(await page.evaluate(()=>localStorage.getItem('blogbg')),'media:'+id)
  assert.deepEqual(external,[],'Default page/panel must not request external wallpaper providers')
  assert.deepEqual(errors,[])
  console.log(variant+': covers, random pool, 25 background buttons, background switch, local failure fallback, saved choice and refresh no-repeat passed.')
  await context.close()
 }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)})
