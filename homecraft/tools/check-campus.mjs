// Campus-specific navigation, content and interaction checks against a local server.
// Usage: node tools/check-campus.mjs http://127.0.0.1:4175/
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BUILDINGS, FIELDS, PLACES, ROADS } from '../world/places.js';
import { roadOverlapsBox } from '../world/reference-layout.js';
import { INTRO } from '../world/layout.js';

const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.d+b.d)/2;
assert.equal(new Set(PLACES.map(p=>p.id)).size, PLACES.length, 'Place ids must be unique');
for(const [i,a] of BUILDINGS.entries()) {
  for(const b of BUILDINGS.slice(i+1)) assert.ok(!overlaps(a,b), `${a.id} overlaps ${b.id}`);
  for(const r of ROADS) assert.ok(!roadOverlapsBox(r,a), `${a.id} overlaps road ${r.name}`);
}
for(const f of FIELDS) {
  for(const b of BUILDINGS)assert.ok(!overlaps(f,b),`${f.id} overlaps ${b.id}`);
  for(const r of ROADS)assert.ok(!roadOverlapsBox(r,f),`${f.id} overlaps road ${r.name}`);
}
const url=process.argv[2]||readFileSync(new URL('./.serve-url',import.meta.url),'utf8').trim();
const out=fileURLToPath(new URL('./.check/',import.meta.url));mkdirSync(out,{recursive:true});
const args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
let browser;
try { browser=await chromium.launch({channel:'chrome',args}); }
catch { browser=await chromium.launch({args}); }
try {
  for(const view of [
    {name:'campus-desktop',viewport:{width:1440,height:900}},
    {name:'campus-mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2},
  ]) {
    const context=await browser.newContext(view),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>window.__home&&document.querySelector('#campus-ui.ready'),null,{timeout:60000});
    const settleOverview=()=>page.waitForFunction(({pos,look})=>{
      const c=__home.stage.camera.position;
      const direction=__home.stage.camera.getWorldDirection(c.clone());
      const target=c.clone().set(...look).sub(c).normalize();
      return Math.hypot(c.x-pos[0],c.y-pos[1],c.z-pos[2])<.1&&direction.dot(target)>.99999;
    },{pos:view.hasTouch?INTRO.portrait:INTRO.pos,look:INTRO.look},{timeout:20000});
    await settleOverview();
    await page.screenshot({path:`${out}${view.name}.png`});
    const structure=await page.evaluate(async()=>{
      const {BUILDINGS}=await import('@world/layout.js'),{buildingMassing}=await import('@world/architecture.js'),THREE=await import('three');
      const ground=__home.world.ground,failures=[];let samples=0;
      for(const p of BUILDINGS) {
        const parts=p.style==='stadium'?[{x:p.x,z:p.z,w:p.w,d:p.d,y:0,h:p.h+.28}]:buildingMassing(p);
        for(const q of parts) {
          if(q.x-q.w/2<p.x-p.w/2-.01||q.x+q.w/2>p.x+p.w/2+.01||q.z-q.d/2<p.z-p.d/2-.01||q.z+q.d/2>p.z+p.d/2+.01)failures.push(`${p.id}: part outside footprint`);
          const covering=parts.filter(a=>Math.abs(q.x-a.x)<=a.w/2+.001&&Math.abs(q.z-a.z)<=a.d/2+.001);
          const expected=Math.max(...covering.map(a=>a.y+a.h+.22));
          const top=ground.topAt(q.x,q.z),ray=new THREE.Ray(new THREE.Vector3(q.x,80,q.z),new THREE.Vector3(0,-1,0)),pick=ground.pick(ray);
          if(!top||Math.abs(top.y-expected)>.02||!ground.collides(q.x,top.y-.6,q.z)||!pick||Math.abs(pick.point.y-expected)>.02)failures.push(`${p.id}: unsupported or mismatched roof`);
          // Verify body clearance on exposed roof interiors rather than narrow
          // overlaps at the centers of stepped wings.
          if(p.style!=='stadium') {
            const inset=.65;
            for(const [sx,sz] of [[0,0],[-1,-1],[1,1]]) {
              const x=q.x+sx*Math.max(0,q.w/2-inset),z=q.z+sz*Math.max(0,q.d/2-inset);
              const coveringParts=parts.filter(a=>Math.abs(x-a.x)<a.w/2+.4&&Math.abs(z-a.z)<a.d/2+.4);
              if(coveringParts.some(a=>a.y+a.h>q.y+q.h+.05))continue;
              const roof=ground.topAt(x,z);
              if(roof&&Math.abs(roof.y-(q.y+q.h+.22))<.02&&!ground.canStand(x,z,roof.y))failures.push(`${p.id}: roof interior is blocked`);
            }
          }
          samples++;
        }
      }
      for(const id of ['tennis','basketball']) {
        const p=__home.world.campus.places.find(p=>p.id===id);
        if(!__home.nav.findPath({x:p.x,z:p.z+p.d/2+3},{x:p.x,z:p.z+4}))failures.push(`${id}: fence entrance blocked`);
      }
      return {samples,failures};
    });
    assert.deepEqual(structure.failures,[], 'Visual geometry, landing surfaces and court entrances must agree');
    const stats=await page.evaluate(()=>__home.stats());
    assert.ok(stats.calls<=stats.budget.calls&&stats.triangles<=stats.budget.triangles,'Campus must stay inside its rendering budget');
    const destinations=await page.evaluate(async()=>{
      const {STATIONS,SPAWN}=await import('@world/layout.js'),nav=__home.nav;
      return STATIONS.map(s=>{
        const route=nav.findPath(SPAWN,{x:s.at[0],z:s.at[1]});let from=SPAWN,clear=true;
        for(const to of route||[]) {
          const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.2));
          for(let i=0;i<=steps;i++)if(!nav.canStand(from.x+(to.x-from.x)*i/steps,from.z+(to.z-from.z)*i/steps))clear=false;
          from=to;
        }
        return {id:s.id,stand:nav.canStand(...s.at),route:!!route,clear};
      });
    });
    assert.deepEqual(destinations.filter(d=>!d.stand||!d.route||!d.clear),[], 'All stations must be walkable and connected');
    for(const p of PLACES) {
      await page.evaluate(id=>__home.go(id),p.id);
      assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,`${p.id} card must open`);
      assert.ok((await page.locator('#panel').innerText()).includes(p.name));
      await page.locator('#panel .close').click();
    }
    await page.locator('[data-campus="overview"]').click();
    await page.locator('[data-campus="directory"]').click();
    await page.locator('.campus-search input').fill('图书馆');
    assert.equal(await page.locator('.campus-place-row:visible').count(),2);
    await page.locator('[data-place="library"]').click();
    await page.locator('#panel .campus-card h3').click();
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,'Clicking card content must keep it open');
    await page.screenshot({path:`${out}${view.name}-story.png`});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),false);
    await page.locator('[data-campus="labels"]').click();
    assert.equal(await page.evaluate(()=>__home.world.labels.visible),false);
    await page.locator('[data-campus="labels"]').click();
    await page.locator('[data-campus="overview"]').click();
    await settleOverview();
    // A real pointer/touch click on a projected building must open its card.
    const point=await page.evaluate(async()=>{
      const THREE=await import('three'),{PLACES}=await import('@world/layout.js');
      const p=PLACES.find(p=>p.id==='technology');
      const v=new THREE.Vector3(p.x,p.h*.7,p.z).project(__home.stage.camera);
      return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};
    });
    if(view.hasTouch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,'Clicking a building must open a card');
    assert.ok((await page.locator('#panel').innerText()).includes('北工大科技园'));
    await page.locator('#panel .close').click();
    await page.evaluate(()=>__home.go('overview'));
    await page.locator('#panel details summary').click();
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,'Expanding the reference map must keep its card open');
    await page.locator('#panel img.campus-reference').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#panel img.campus-reference')?.naturalWidth>0);
    await page.locator('#panel .close').click();
    await page.locator('[data-campus="overview"]').click();
    await page.locator('[data-campus="walk"]').click();
    assert.equal(await page.evaluate(()=>__home.rig.showcaseActive),false);
    const start=await page.evaluate(()=>({x:__home.player.pos.x,z:__home.player.pos.z}));
    await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
    const end=await page.evaluate(()=>({x:__home.player.pos.x,z:__home.player.pos.z}));
    assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>.1,'Walking must move the player');
    await page.keyboard.press('m');assert.equal(await page.locator('#bigmap').isVisible(),true);
    await page.screenshot({path:`${out}${view.name}-map.png`});await page.keyboard.press('Escape');
    await page.evaluate(()=>{__home.setTimeMode('night');__home.setWeatherMode('rain');});
    await page.waitForTimeout(600);await page.screenshot({path:`${out}${view.name}-night.png`});
    assert.deepEqual(errors,[]);
    console.log(`${view.name}: ${structure.samples} roof samples, court entrances, ${destinations.length} connected stations, ${PLACES.length} cards, search, building click, walking, map and weather passed (${stats.calls} calls, ${stats.triangles} triangles)`);
    await context.close();
  }
} finally { await browser.close(); }
