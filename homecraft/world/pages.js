import { PLACES, STATIONS, INTRO } from './layout.js';
import { STORIES } from './stories.js';
import * as THREE from 'three';
import { connectCampusRoutes } from './navigation.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photo = p => `<figure><img src="${escape(p.src)}" alt="${escape(p.caption)}" loading="lazy" decoding="async">${p.caption?`<figcaption>${escape(p.caption)}</figcaption>`:''}</figure>`;
const categories = [...new Set(PLACES.map(p=>p.region))];

export function preparePages() {
  const pages=document.getElementById('pages');
  if(!pages)return;
  pages.innerHTML=`<h1 class="plain-title">北工大 · 校园漫游</h1>
    <article class="page" data-station="overview" data-icon="map"><h2>校园全景</h2><div class="about campus-card">
      <p class="campus-eyebrow">BEIJING UNIVERSITY OF TECHNOLOGY</p><h3>回到平乐园。</h3>
      <p>沿着熟悉的路，重新走进校园。教学楼、宿舍、操场，还有留在每个转角的回忆。</p>
      <div class="campus-card-stats"><span><b>${PLACES.length}</b> 个地点</span><span><b>${categories.length}</b> 个区域</span><span><b>自由</b> 漫游</span></div>
      <h4>开始探索</h4><p>点击建筑查看地点；也可以打开地点目录，直接前往。走近地点时，按 F 阅读介绍。按 M 打开地图，按 V 切换第一人称，双击空格开始飞行。</p>
      <p class="campus-note">场景依据提供的校园示意图搭建，布局、建筑高度和不可见部分为近似还原。地点介绍与个人故事将陆续补充。</p>
      <details><summary>查看参考地图</summary><img class="campus-reference" src="assets/campus-reference.jpg" alt="北京工业大学平乐园校区参考地图" loading="lazy" decoding="async"></details>
      <p><a class="campus-site-link" href="https://daixiaokang.com/">返回个人网站 ↗</a></p>
    </div></article>`;
  for(const p of PLACES) {
    const story=STORIES[p.id]||{},entries=story.entries||[],article=document.createElement('article');
    article.className='page';article.dataset.station=p.id;article.dataset.icon=p.icon||'map';
    article.innerHTML=`<h2>${escape(p.name)}</h2><div class="about campus-card">
      <p class="campus-eyebrow">${escape(p.en.toUpperCase())}</p><span class="campus-region">${escape(p.region)}</span>
      <h3>${escape(p.name)}</h3><p>${escape(story.intro||p.description||`校园里的${p.name}。停留一会儿，看看这里的建筑与风景。`)}</p>
      <div class="campus-story-heading"><h4>在这里的故事</h4><span>${entries.length?`${entries.length} 篇回忆`:'待续'}</span></div>
      ${entries.length?entries.map(e=>`<section class="campus-memory"><h4>${escape(e.title)}</h4>${e.date?`<p class="campus-memory-date">${escape(e.date)}</p>`:''}${(e.paragraphs||[]).map(t=>`<p>${escape(t)}</p>`).join('')}${(e.photos||[]).map(photo).join('')}</section>`).join(''):'<div class="campus-empty-story"><span aria-hidden="true">✎</span><p>这里的回忆，还在慢慢整理。<br>等下一次，讲给你听。</p></div>'}
      <p class="campus-note">按 Esc 或关闭卡片，继续逛校园。</p></div>`;
    pages.append(article);
  }
}

export function mountCampus({ rig, stage, world, player, nav }) {
  connectCampusRoutes(nav);
  const root=document.createElement('div');root.id='campus-ui';
  root.innerHTML=`<header class="campus-header"><span class="campus-wordmark" aria-hidden="true">北<br>工</span><div><p>平乐园 · BEIJING</p><h1>北工大<span>校园漫游</span></h1><small>沿着熟悉的路，找回校园里的故事。</small></div></header>
    <nav class="campus-toolbar" aria-label="校园工具"><button type="button" data-campus="overview">↗ 全校鸟瞰</button><button type="button" data-campus="directory" aria-expanded="false" aria-controls="campus-directory">⌕ 地点目录 <span>${PLACES.length}</span></button><button type="button" data-campus="labels" aria-pressed="true">地点名称</button><a href="https://daixiaokang.com/" aria-label="返回个人网站">个人网站 ↗</a></nav>
    <aside id="campus-directory" aria-label="校园地点目录" hidden><div class="campus-directory-head"><div><p>EXPLORE THE CAMPUS</p><h2>想去哪里？</h2></div><button type="button" data-campus="close-directory" aria-label="关闭地点目录">×</button></div>
      <label class="campus-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索建筑、广场或操场" aria-label="搜索校园地点"></label>
      <div class="campus-filters" role="group" aria-label="按区域筛选"><button type="button" data-region="all" aria-pressed="true">全部</button>${categories.map(c=>`<button type="button" data-region="${escape(c)}" aria-pressed="false">${escape(c)}</button>`).join('')}</div>
      <div class="campus-results" role="list">${PLACES.map((p,i)=>`<button type="button" class="campus-place-row" role="listitem" data-place="${p.id}" data-region-name="${p.region}" data-search="${escape((p.name+' '+p.en).toLowerCase())}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${p.name}</strong><small>${p.region}</small></div><b aria-hidden="true">↗</b></button>`).join('')}</div><p class="campus-no-results" hidden>没有找到这个地点，换个名字试试。</p>
    </aside>
    <div class="campus-mode"><span class="campus-status-dot"></span><strong>校园鸟瞰</strong><span class="campus-mode-copy">点击建筑，打开一段回忆</span></div>
    <div class="campus-welcome"><span>从一张地图，走回一座校园。</span><button type="button" data-campus="walk">开始漫游 <b>→</b></button></div>`;
  document.body.append(root);
  const directory=root.querySelector('#campus-directory'),directoryButton=root.querySelector('[data-campus="directory"]'),query=root.querySelector('input'),rows=[...root.querySelectorAll('[data-place]')],status=root.querySelector('.campus-mode strong'),copy=root.querySelector('.campus-mode-copy'),welcome=root.querySelector('.campus-welcome');
  let region='all',started=false;
  stage.camera.far=2600;stage.camera.updateProjectionMatrix();
  // Ensure every destination remains reachable after later footprint edits.
  for(const s of STATIONS){const at=nav.nearestStand(...s.at);if(at&&nav.canStand(at.x,at.z))s.at=[at.x,at.z];}
  function setDirectory(open){directory.hidden=!open;directoryButton.setAttribute('aria-expanded',String(open));if(open)query.focus();}
  function filter(){const term=query.value.trim().toLowerCase();let count=0;for(const row of rows){const visible=(region==='all'||row.dataset.regionName===region)&&(!term||row.dataset.search.includes(term));row.hidden=!visible;if(visible)count++;}root.querySelector('.campus-no-results').hidden=count>0;}
  function overview(){document.querySelector('#panel .close')?.click();rig.recenter(player);rig.showcase(...(innerWidth<700?[INTRO.portrait,INTRO.look]:[INTRO.pos,INTRO.look]));welcome.hidden=false;setDirectory(false);}
  function visit(id){window.__home?.go(id);welcome.hidden=true;setDirectory(false);}
  root.addEventListener('click',e=>{
    const target=e.target.closest('button');if(!target)return;
    if(target.dataset.place){visit(target.dataset.place);return;}
    if(target.dataset.region){region=target.dataset.region;for(const b of root.querySelectorAll('[data-region]'))b.setAttribute('aria-pressed',String(b===target));filter();return;}
    switch(target.dataset.campus){
      case'overview':overview();break;
      case'directory':setDirectory(directory.hidden);break;
      case'close-directory':setDirectory(false);directoryButton.focus();break;
      case'labels':world.labels.visible=!world.labels.visible;target.setAttribute('aria-pressed',String(world.labels.visible));break;
      case'walk':rig.skipIntro();rig.recenter(player);rig.set(.1,.45,22);welcome.hidden=true;break;
    }
  });
  query.addEventListener('input',filter);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setDirectory(false);});
  // Select the nearest visible footprint directly, including in the distant overview.
  // Keep the engine's drag, pinch and ground navigation intact.
  const canvas=stage.renderer.domElement,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
  const bounds=PLACES.map(p=>({id:p.id,box:new THREE.Box3(new THREE.Vector3(p.x-p.w/2,0,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,Math.max(1,p.h+.7),p.z+p.d/2))}));
  let press=null;
  function pickPlace(x,y){
    const rect=canvas.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,stage.camera);
    let id=null,distance=Infinity;
    for(const b of bounds)if(raycaster.ray.intersectBox(b.box,hit)){const d=hit.distanceToSquared(raycaster.ray.origin);if(d<distance){id=b.id;distance=d;}}
    return id;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(press){press=null;return;}
    if(e.button!==0||document.querySelector('#panel')?.open)return;
    press={id:e.pointerId,x:e.clientX,y:e.clientY,place:pickPlace(e.clientX,e.clientY)};
  },true);
  canvas.addEventListener('pointermove',e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>8)press=null;},true);
  canvas.addEventListener('pointerup',e=>{
    const start=press;press=null;
    if(start?.id===e.pointerId&&start.place){e.stopImmediatePropagation();visit(start.place);}
  },true);
  canvas.addEventListener('pointercancel',()=>{press=null;},true);
  addEventListener('resize',()=>{if(rig.showcaseActive&&!document.querySelector('#panel')?.open)overview();});
  return {
    update(){
      if(!started&&window.__home){started=true;rig.recenter(player);rig.showcase(...(innerWidth<700?[INTRO.portrait,INTRO.look]:[INTRO.pos,INTRO.look]));rig.update(1,player);root.classList.add('ready');}
      if(rig.showcaseActive){stage.setClearance(Math.max(420,Math.hypot(stage.camera.position.x-48,stage.camera.position.y,stage.camera.position.z-30)*1.2));status.textContent='校园鸟瞰';copy.textContent='点击建筑，打开一段回忆';}
      else{status.textContent=player.flying?'空中漫游':'步行漫游';copy.textContent=innerWidth<700?'轻触地面移动 · 拖动调整视角':'WASD 移动 · 拖动旋转 · 双击空格飞行';welcome.hidden=true;}
    },
    overview,
  };
}
