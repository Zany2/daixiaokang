// Campus-specific navigation, content and interaction checks against a local server.
// Usage: node tools/check-campus.mjs http://127.0.0.1:4175/
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BUILDINGS, FIELDS, PLACES, ROADS } from '../world/places.js';
import { roadOverlapsBox, BOUNDS } from '../world/reference-layout.js';
import { INTRO } from '../world/layout.js';

const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.d+b.d)/2;
assert.equal(new Set(PLACES.map(p=>p.id)).size, PLACES.length, 'Place ids must be unique');
for(const p of PLACES) {
  assert.ok(p.x-p.w/2>BOUNDS.x0&&p.x+p.w/2<BOUNDS.x1&&p.z-p.d/2>BOUNDS.z0&&p.z+p.d/2<BOUNDS.z1,`${p.id}: footprint must fit inside navigation bounds`);
}
const north=PLACES.find(p=>p.id==='north-ground'),south=PLACES.find(p=>p.id==='south-ground'),lake=PLACES.find(p=>p.id==='moon-lake');
assert.ok(north.z+north.d/2<south.z-south.d/2&&north.d>north.w&&south.d>south.w,'The north and south tracks must remain separate north-south ovals');
assert.ok(lake.x>south.x+south.w/2,'Moon Lake must remain east of the south track');
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
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>window.__home&&document.querySelector('#campus-ui.ready'),null,{timeout:60000});
    const settleOverview=()=>page.waitForFunction(({look})=>{
      const pos=__home.world.campus.overviewPosition;
      const c=__home.stage.camera.position;
      const direction=__home.stage.camera.getWorldDirection(c.clone());
      const target=c.clone().set(...look).sub(c).normalize();
      return Math.hypot(c.x-pos[0],c.y-pos[1],c.z-pos[2])<.1&&direction.dot(target)>.99999;
    },{look:INTRO.look},{timeout:20000});
    await settleOverview();
    assert.equal(await page.locator('#portalButton').isVisible(),false,'The campus must not show the portal entry');
    for(const href of ['https://daixiaokang.com/','https://www.bjut.edu.cn/']){
      const link=page.locator(`.campus-site-links a[href="${href}"]`);
      assert.equal(await link.isVisible(),true,'Both website entries must stay visible');
      assert.equal(await link.getAttribute('target'),'_blank','Website links must preserve the campus tab');
    }
    await page.waitForFunction(()=>__home.world.labels.geometry.attributes.labelVisible.array.some(v=>v>0));
    const shownLabels=await page.evaluate(()=>__home.world.labels.userData.layout.filter(l=>l.shown).map(l=>({id:l.p.id,x:l.x,y:l.y,w:l.w,h:l.h})));
    assert.ok(shownLabels.length>=3,'Overview labels must remain visible');
    for(const [i,a] of shownLabels.entries())for(const b of shownLabels.slice(i+1))assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.y-b.y)>=(a.h+b.h)/2,'Visible labels must not overlap');
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
      for(const id of ['tennis','basketball','basketball-south']) {
        const p=__home.world.campus.places.find(p=>p.id===id);
        if(!__home.nav.findPath({x:p.x,z:p.z+p.d/2+3},{x:p.x,z:p.z+4}))failures.push(`${id}: fence entrance blocked`);
      }
      const {OSM_FOOTPRINTS}=await import('@world/osm-footprints.js');
      for(const p of BUILDINGS.filter(p=>(p.shape==='courtyard'||p.shape==='teaching-court')&&!OSM_FOOTPRINTS[p.id])) {
        const x=p.x+(p.shape==='teaching-court'?p.w*.22:0),z=p.z+p.d*.1;
        if(!__home.nav.canStand(x,z)||!__home.nav.findPath({x:p.at[0],z:p.at[1]},{x,z}))failures.push(`${p.id}: courtyard must remain open and reachable`);
      }
      const {fromReference}=await import('@world/reference-layout.js'),water=fromReference(1060,878);
      if(__home.nav.canStand(water.x,water.z))failures.push('moon-lake: navigation must avoid ornamental water');
      const third=BUILDINGS.find(p=>p.id==='third-teaching');
      for(const t of [-.295,0,.295]){
        const x=third.x+t*third.w,z=third.z+third.d*.12;
        if(!__home.nav.canStand(x,z)||!__home.nav.findPath({x:third.at[0],z:third.at[1]},{x,z}))failures.push('third-teaching: courtyard passages must remain open');
      }
      // Compare rotated stadium roof samples and camera hits with visible meshes.
      const {stadiumProfile}=await import('@world/stadium-shape.js');
      for(const p of BUILDINGS.filter(p=>p.style==='stadium')){
        const q=stadiumProfile(p),meshes=__home.world.campus.stadiumMeshes.filter(m=>m.userData.placeId===p.id);
        for(let i=0;i<12;i++){
          const a=i*Math.PI/6,lx=Math.cos(a)*q.rx*.7,lz=Math.sin(a)*q.rz*.7,x=p.x+lx*q.c+lz*q.s,z=p.z-lx*q.s+lz*q.c;
          const r=new THREE.Raycaster(new THREE.Vector3(x,55,z),new THREE.Vector3(0,-1,0)),hits=r.intersectObjects(meshes,false),top=ground.topAt(x,z),block=__home.world.viewBlock(r.ray.origin,r.ray.direction,100);
          if(!hits.length||!top||Math.abs(hits[0].point.y-top.y)>.08||Math.abs(block-hits[0].distance)>.08)failures.push(`${p.id}: rotated roof, camera and visible mesh disagree`);
        }
        const origin=new THREE.Vector3(p.x+p.w*.43,55,p.z+p.d*.43),dir=new THREE.Vector3(0,-1,0);
        if(ground.topAt(origin.x,origin.z)||Number.isFinite(__home.world.viewBlock(origin,dir,100)))failures.push(`${p.id}: empty stadium corner blocks the camera`);
        const bodyRay=new THREE.Raycaster(new THREE.Vector3(p.x+p.w/2+5,5,p.z),new THREE.Vector3(-1,0,0)),hits=bodyRay.intersectObjects(meshes,false),block=__home.world.viewBlock(bodyRay.ray.origin,bodyRay.ray.direction,p.w+20);
        if(!hits.length||!Number.isFinite(block)||Math.abs(block-hits[0].distance)>.08)failures.push(`${p.id}: stadium wall no longer protects the camera`);
      }
      const {drawMapImage}=await import('@engine/ui/minimap.js');let marker;
      const map=drawMapImage(__home.world.grid,[],(ctx,X,Z)=>{marker=[Math.round(X(water.x)),Math.round(Z(water.z))];ctx.fillStyle='#ff00ff';ctx.fillRect(marker[0]-2,marker[1]-2,5,5);});
      if(map.width>2048||map.height>2048)failures.push('map: backing image exceeds mobile canvas budget');
      const color=map.getContext('2d').getImageData(...marker,1,1).data;
      if(color[0]!==255||color[1]!==0||color[2]!==255)failures.push('map: world coordinates no longer match the backing image');
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
    assert.equal(await page.locator('#portalButton').isVisible(),false,'Opening a location card must not restore portal controls');
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
    assert.ok((await page.locator('#panel').innerText()).includes(PLACES.find(p=>p.id==='technology').name));
    await page.locator('#panel .close').click();
    // Empty courtyard ground must not select the surrounding bounding rectangle.
    await page.evaluate(async()=>{
      const {PLACES}=await import('@world/layout.js'),p=PLACES.find(p=>p.id==='materials');
      __home.rig.showcase([p.x,450,p.z+.01],[p.x,0,p.z]);
    });
    await page.waitForFunction(()=>Math.abs(__home.stage.camera.position.y-450)<.1);
    const courtyard=await page.evaluate(async()=>{
      const THREE=await import('three'),{PLACES}=await import('@world/layout.js'),p=PLACES.find(p=>p.id==='materials');
      const point=(x,z)=>{const v=new THREE.Vector3(x,.1,z).project(__home.stage.camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
      return {empty:point(p.x,p.z+p.d*.1),wall:point(p.x-p.w*.37,p.z)};
    });
    await page.mouse.click(courtyard.empty.x,courtyard.empty.y);
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),false,'Courtyard ground must remain selectable without opening the building card');
    await page.mouse.click(courtyard.wall.x,courtyard.wall.y);
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,'The actual courtyard wing must open its card');
    assert.ok((await page.locator('#panel').innerText()).includes('材料楼'));
    await page.locator('#panel .close').click();
    await page.evaluate(()=>__home.go('overview'));
    await page.locator('#panel details summary').click();
    assert.equal(await page.locator('#panel').evaluate(p=>p.open),true,'Expanding the reference map must keep its card open');
    const references=page.locator('#panel img.campus-reference');
    assert.equal(await references.count(),2,'The stitched plan and original building diagram must both be available');
    for(let i=0;i<await references.count();i++) {
      await references.nth(i).scrollIntoViewIfNeeded();
      await references.nth(i).evaluate(img=>new Promise((resolve,reject)=>{if(img.complete&&img.naturalWidth)return resolve();img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});}));
    }
    await page.locator('#panel .close').click();
    await page.locator('[data-campus="overview"]').click();
    await page.locator('[data-campus="walk"]').click();
    assert.equal(await page.evaluate(()=>__home.rig.showcaseActive),false);
    const descent=await page.evaluate(async()=>{
      const failures=[];let frames=0,distance;
      do{
        await new Promise(requestAnimationFrame);
        const {stage,player}=__home;
        distance=stage.camera.position.distanceTo(player.pos);
        if(stage.camera.far<distance||stage.scene.fog.near<distance)failures.push({frame:frames,distance,far:stage.camera.far,fogNear:stage.scene.fog.near});
        frames++;
      }while(distance>40&&frames<180);
      return {failures,frames,distance};
    });
    assert.deepEqual(descent.failures,[],'Campus must stay visible throughout the descent from overview to walking');
    assert.ok(descent.distance<40,'Starting a walk must finish behind the player');
    await page.screenshot({path:`${out}${view.name}-walk.png`});
    const start=await page.evaluate(()=>({x:__home.player.pos.x,z:__home.player.pos.z}));
    await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
    const end=await page.evaluate(()=>({x:__home.player.pos.x,z:__home.player.pos.z}));
    assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>.1,'Walking must move the player');
    await page.keyboard.press('m');assert.equal(await page.locator('#bigmap').isVisible(),true);
    await page.screenshot({path:`${out}${view.name}-map.png`});await page.keyboard.press('Escape');
    // Resizing between tall and landscape displays must refit the whole campus.
    for(const viewport of [{width:320,height:1000},{width:844,height:390}]){
      await page.setViewportSize(viewport);await page.locator('[data-campus="overview"]').click();await settleOverview();
      const clipped=await page.evaluate(async()=>{
        const THREE=await import('three'),{BOUNDS}=await import('@world/reference-layout.js'),outside=[];
        for(const x of [BOUNDS.x0,BOUNDS.x1])for(const z of [BOUNDS.z0,BOUNDS.z1]){
          const v=new THREE.Vector3(x,0,z).project(__home.stage.camera);
          if(Math.abs(v.x)>.94||Math.abs(v.y)>.76||v.z>1)outside.push([v.x,v.y,v.z]);
        }return outside;
      });
      assert.deepEqual(clipped,[],`The overview must fit at ${viewport.width}x${viewport.height}`);
      const interfaceOverlaps=await page.evaluate(()=>{
        const selectors=['.campus-header','.campus-toolbar','.campus-welcome','#minimap','#corner','.campus-mode'];
        const boxes=selectors.map(selector=>({selector,element:document.querySelector(selector)})).filter(q=>q.element?.checkVisibility()).map(q=>({selector:q.selector,rect:q.element.getBoundingClientRect()})),overlaps=[];
        for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
          const a=boxes[i],b=boxes[j];
          if(a.rect.left<b.rect.right&&a.rect.right>b.rect.left&&a.rect.top<b.rect.bottom&&a.rect.bottom>b.rect.top)overlaps.push(`${a.selector} / ${b.selector}`);
        }
        const toolbar=document.querySelector('.campus-toolbar').getBoundingClientRect();
        for(const control of document.querySelectorAll('.campus-toolbar button,.campus-toolbar a')){
          const rect=control.getBoundingClientRect();
          if(rect.left<Math.max(0,toolbar.left)||rect.right>Math.min(innerWidth,toolbar.right))overlaps.push(`Clipped toolbar control: ${control.textContent.trim()}`);
        }
        const header=document.querySelector('.campus-header').getBoundingClientRect();
        for(const link of document.querySelectorAll('.campus-site-links a')){
          const rect=link.getBoundingClientRect();
          if(rect.left<header.left||rect.right>Math.min(innerWidth,header.right)||rect.bottom>header.bottom)overlaps.push(`Clipped website entry: ${link.textContent.trim()}`);
        }
        return overlaps;
      });
      assert.deepEqual(interfaceOverlaps,[],`Overview controls must not overlap at ${viewport.width}x${viewport.height}`);
      await page.screenshot({path:`${out}${view.name}-${viewport.width}x${viewport.height}.png`});
    }
    await page.setViewportSize(view.viewport);
    await page.evaluate(()=>{__home.setTimeMode('night');__home.setWeatherMode('rain');});
    await page.waitForTimeout(600);await page.screenshot({path:`${out}${view.name}-night.png`});
    assert.deepEqual(errors,[]);
    console.log(`${view.name}: ${structure.samples} roof samples, court entrances, ${destinations.length} connected stations, ${PLACES.length} cards, search, building click, walking, map and weather passed (${stats.calls} calls, ${stats.triangles} triangles)`);
    await context.close();
  }
} finally { await browser.close(); }
