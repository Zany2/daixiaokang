import * as THREE from 'three';
import { OSM_FOOTPRINTS } from './osm-footprints.js';
import { pointInPolygon } from './reference-layout.js';
import { stadiumProfile } from './stadium-shape.js';

const paint=tint=>({tex:'paint',tint});
const stone=paint(0xdad4c1),metal=paint(0x637a77),glass={tex:'paint',tint:0x729798,emissive:.12};
const palettes={cream:[0xe5dfc3,0xf5eedc],red:[0xb86c59,0xdfb99b],gray:[0xb7c0b9,0xe3e5d9],library:[0xb8c3ba,0xe0e4d7],hall:[0xd7d4bb,0xf0e8d6]};
const family=p=>p.shape||'teaching';

// Hundreds of repeated windows share one colored quad mesh. Window frames,
// projecting sills, cornices and stairwells remain batched physical details.
export function createWindowBatch() {
  const positions=[],colors=[],indices=[],color=new THREE.Color();
  return {
    pane(x,y,z,w,h,axis,side,lit,tint) {
      const base=positions.length/3;color.setHex(tint??(lit?0xc7c9aa:0x66858a));
      for(const [u,v]of[[-w/2,0],[w/2,0],[w/2,h],[-w/2,h]]){
        positions.push(axis==='x'?x+u:x,y+v,axis==='x'?z:z+u);colors.push(color.r,color.g,color.b);
      }
      if((axis==='x'&&side>0)||(axis==='z'&&side<0))indices.push(base,base+1,base+2,base,base+2,base+3);
      else indices.push(base,base+2,base+1,base,base+3,base+2);
    },
    mesh() {
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));mesh.name='campus-facade-windows';return mesh;
    },
  };
}

// All structural parts stay inside the original footprint. The same parts
// provide physical surfaces; stepped roofs never leave an invisible flat roof.
export function buildingMassing(p) {
  if(p.id==='library')return [
    {x:p.x,z:p.z,w:p.w,d:p.d,y:0,h:6,podium:true},
    {x:p.x-p.w*.16,z:p.z,w:p.w*.68,d:p.d*.96,y:6,h:p.h-6},
    {x:p.x+p.w*.34,z:p.z+p.d*.12,w:p.w*.32,d:p.d*.72,y:6,h:p.h-10},
    {x:p.x-p.w*.08,z:p.z-p.d*.18,w:p.w*.32,d:p.d*.20,y:p.h,h:1.8,atrium:true},
  ];
  // Roof courts and connecting wings visible in the satellite reference.
  // Open southern passages keep the two courts reachable at ground level.
  if(p.id==='third-teaching')return [
    {x:p.x,z:p.z-p.d*.37,w:p.w,d:p.d*.26,y:0,h:p.h},
    ...[-.44,-.15,.15,.44].map(t=>({x:p.x+p.w*t,z:p.z+p.d*.13,w:p.w*.12,d:p.d*.74,y:0,h:p.h-2})),
    {x:p.x,z:p.z+p.d*.40,w:p.w*.76,d:p.d*.20,y:3.3,h:p.h-5.3},
  ];
  const outline=OSM_FOOTPRINTS[p.id]?.outline;
  if(outline)return outlineMassing(p,outline);
  // The material-science courtyard is visible in the reference. Keep it open
  // down to ground level rather than filling its center with a podium.
  if(p.shape==='courtyard')return [
    {x:p.x-p.w*.37,z:p.z,w:p.w*.26,d:p.d,y:0,h:p.h},
    {x:p.x+p.w*.37,z:p.z,w:p.w*.26,d:p.d,y:0,h:p.h},
    {x:p.x,z:p.z-p.d*.34,w:p.w*.48,d:p.d*.32,y:0,h:p.h},
  ];
  if(p.shape==='teaching-court')return [
    ...[-1,0,1].map(s=>({x:p.x+s*p.w*.41,z:p.z,w:p.w*(s===0?.14:.18),d:p.d,y:0,h:p.h-(s===0?3:0)})),
    {x:p.x,z:p.z-p.d*.39,w:p.w*.68,d:p.d*.22,y:0,h:p.h-2},
    {x:p.x,z:p.z+p.d*.39,w:p.w*.68,d:p.d*.22,y:3.3,h:2},
  ];
  const podium=3.2,parts=[{x:p.x,z:p.z,w:p.w,d:p.d,y:0,h:podium,podium:true}];
  const add=(x,z,w,d,top,extra={})=>parts.push({x:p.x+x,z:p.z+z,w,d,y:podium,h:top-podium,...extra});
  switch(family(p)) {
    case 'library':
      add(-p.w*.37,0,p.w*.26,p.d,p.h);
      add(p.w*.37,0,p.w*.26,p.d,p.h);
      add(0,-p.d*.34,p.w*.48,p.d*.32,p.h);
      add(0,p.d*.16,p.w*.48,p.d*.68,Math.min(7,p.h-3),{atrium:true});break;
    case 'tower':
      add(0,-p.d*.32,p.w*.94,p.d*.36,p.h);
      add(-p.w*.34,p.d*.18,p.w*.26,p.d*.64,p.h*.85);
      add(p.w*.32,p.d*.18,p.w*.30,p.d*.64,Math.max(7,p.h*.5));break;
    case 'research':
      add(-p.w*.025,-p.d*.05,p.w*.81,p.d*.84,p.h);
      add(p.w*.38,p.d*.22,p.w*.24,p.d*.56,Math.max(6,p.h*.48));break;
    case 'administration':
      add(0,0,p.w*.4,p.d*.9,p.h);
      for(const s of [-1,1])add(s*p.w*.35,0,p.w*.3,p.d*.9,p.h-3);break;
    case 'residence':add(0,-p.d*.035,p.w*.96,p.d*.93,p.h);break;
    case 'science':
      add(0,-p.d*.22,p.w*.94,p.d*.56,p.h);
      for(const s of [-1,1])add(s*p.w*.38,p.d*.23,p.w*.24,p.d*.54,p.h-3);break;
    case 'bar':
      add(-p.w*.02,-p.d*.06,p.w*.94,p.d*.88,p.h);break;
    case 'hall':add(0,-p.d*.04,p.w*.9,p.d*.88,p.h);break;
    default:
      add(-p.w*.08,-p.d*.04,p.w*.78,p.d*.92,p.h);
      add(p.w*.39,p.d*.14,p.w*.22,p.d*.72,p.h-2.8);
  }
  return parts;
}

// Sweep orthogonal reference outlines into non-overlapping rectangles. This
// preserves recesses and open courts while sharing render and collision data.
function outlineMassing(p,outline){
  const xs=[...new Set(outline.map(q=>q[0]))].sort((a,b)=>a-b),zs=[...new Set(outline.map(q=>q[1]))].sort((a,b)=>a-b),rects=[];
  for(let j=1;j<zs.length;j++){
    let start=null;
    for(let i=1;i<=xs.length;i++){
      const inside=i<xs.length&&pointInPolygon((xs[i-1]+xs[i])/2,(zs[j-1]+zs[j])/2,outline);
      if(inside&&start===null)start=xs[i-1];
      if(!inside&&start!==null){
        const end=xs[i-1],prev=rects.find(r=>r.x0===start&&r.x1===end&&r.z1===zs[j-1]);
        if(prev)prev.z1=zs[j];else rects.push({x0:start,x1:end,z0:zs[j-1],z1:zs[j]});start=null;
      }
    }
  }
  return rects.map(r=>({x:p.x+((r.x0+r.x1)/2-.5)*p.w,z:p.z+((r.z0+r.z1)/2-.5)*p.d,w:(r.x1-r.x0)*p.w,d:(r.z1-r.z0)*p.d,y:0,h:p.h}));
}

export function buildArchitecture(p,parts,B,signs,windows) {
  const type=family(p),[body,trim]=palettes[p.style]||palettes.cream;
  for(const [i,q] of parts.entries()) {
    const top=q.y+q.h;
    B.box(q.x,q.y,q.z,q.w,q.h,q.d,q.atrium?glass:{tex:p.style==='red'?'white_brick':'plaster',tint:q.podium?0xc8cabc:body});
    B.box(q.x,top,q.z,q.w+.12,.22,q.d+.12,paint(q.atrium?0x8baba5:0xa4aea5));
    if(!q.atrium) {
      for(const s of [-1,1]) {
        B.box(q.x,top+.22,q.z+s*(q.d/2-.12),q.w,.48,.22,paint(trim));
        B.box(q.x+s*(q.w/2-.12),top+.22,q.z,.22,.48,q.d,paint(trim));
      }
      facade(p,q,B,body,trim,type,i,windows,parts);
    } else {
      for(let x=-q.w/2+.5;x<q.w/2;x+=1.5)B.box(q.x+x,top+.24,q.z,.09,.08,q.d,metal);
      for(let z=-q.d/2;z<=q.d/2;z+=2.5)B.box(q.x,top+.24,q.z+z,q.w,.08,.09,metal);
    }
    if(!q.podium&&!q.atrium&&q.w>12&&q.d>8&&i<4)roofEquipment(p,q,B,i);
  }
  if(OSM_FOOTPRINTS[p.id]&&p.id!=='library'){
    const q=parts.reduce((a,b)=>Math.abs(b.x-p.x)<Math.abs(a.x-p.x)?b:a);
    entrance({...p,x:q.x,z:q.z,w:q.w,d:q.d},B,signs,type);
  }else entrance(p.shape==='courtyard'?{...p,z:p.z-p.d*.68}:p,B,signs,type);
  if(type==='research'||type==='tower') {
    const q=parts[1],z=q.z+q.d/2+.1,w=Math.min(4,q.w*.28);
    B.box(q.x,3.3,z,w,p.h-3.4,.18,glass);
    for(let y=3.4;y<p.h;y+=1.6)B.box(q.x,y,z+.12,w,.09,.1,stone);
    for(const s of [-1,1])B.box(q.x+s*(w/2+.12),3.3,z,.22,p.h-3.4,.35,stone);
  }
  if(type==='residence')residenceDetails(p,parts[1],B,trim);
  if(type==='hall') {
    const q=parts[1];
    for(let x=-q.w/2+1;x<q.w/2;x+=1.3)B.box(q.x+x,q.y+q.h+.3,q.z,.22,.5,q.d*.8,stone);
    if(p.id==='dining')for(let x=-p.w/2+1;x<p.w/2;x+=2)B.box(p.x+x,2.8,p.z+p.d/2+.6,1,.15,1.1,paint(x<0?0x799581:0xd1b38e));
  }
  if(p.id==='hospital') {
    const z=p.z+p.d/2+.12;
    B.box(p.x+3,3.65,z,.45,1.8,.12,paint(0xb86050));B.box(p.x+3,4.3,z,1.6,.45,.12,paint(0xb86050));
  }
}

function facade(p,q,B,body,trim,type,partIndex,windows,parts) {
  if(q.podium)return;
  const floors=Math.max(1,Math.round(q.h/3.4)),step=q.h/floors;
  const seed=p.id.split('').reduce((n,c)=>n+c.charCodeAt(0),0)+partIndex;
  // Paired panes and projecting sills give depth without four frame boxes per window.
  for(const side of [-1,1]) {
    for(let floor=0;floor<floors;floor++) {
      const y=q.y+floor*step+.8,wh=Math.min(1.65,step*.56);
      for(const axis of ['x','z']) {
        const width=axis==='x'?q.w:q.d,count=Math.max(1,Math.floor((width-1)/6.4)),pitch=(width-1)/count;
        const cw=Math.min(2.5,pitch*.64);
        for(let j=0;j<count;j++) {
          const a=-width/2+.5+pitch*(j+.5),lit=(j+floor*3+seed)%7===0;
          const x=axis==='x'?q.x+a:q.x+side*(q.w/2+.045),z=axis==='x'?q.z+side*(q.d/2+.045):q.z+a;
          if(parts.some(r=>r!==q&&x>r.x-r.w/2&&x<r.x+r.w/2&&z>r.z-r.d/2&&z<r.z+r.d/2&&y>=r.y&&y+wh<=r.y+r.h))continue;
          windows.pane(x,y,z,cw,wh,axis,side,lit);
          if(axis==='x'&&side===1) {
            if(j%4===0)B.box(x,y-.12,z+.075,cw+.22,.13,.28,paint(trim));
            if(j%3===0)windows.pane(x,y,z+.07,.055,wh,'x',1,false,0xd2dbcf);
          }
        }
      }
      B.box(q.x,q.y+floor*step+.35,q.z+side*(q.d/2+.07),q.w,.15,.22,paint(trim));
    }
    // Corner piers, downpipes and a tall stairwell break up identical window grids.
    B.box(q.x+side*(q.w/2-.3),q.y,q.z+q.d/2+.08,.24,q.h,.2,paint(trim));
    if(q.w>8)B.box(q.x+side*(q.w/2-.55),q.y,q.z-q.d/2-.08,.11,q.h,.11,metal);
  }
  if(type==='teaching'&&!q.podium&&partIndex===1) {
    const x=q.x-q.w*.34;
    B.box(x,q.y+.3,q.z+q.d/2+.14,1.6,q.h-.7,.12,glass);
    for(let y=q.y+1;y<q.y+q.h;y+=1.5)B.box(x,y,q.z+q.d/2+.23,1.7,.08,.08,stone);
  }
}

function roofEquipment(p,q,B,index) {
  const y=q.y+q.h+.24;
  const x=q.x-q.w*.23,z=q.z-q.d*.15;
  B.box(x,y,z,1.7,.8,1.3,paint(0xc4cbbf));
  for(let k=-.5;k<=.5;k+=.25)B.box(x+k,y+.15,z+.68,.08,.48,.06,metal);
  B.box(x,y+.8,z,1.9,.12,1.5,metal);
  if(index===1&&q.w>10) {
    B.box(q.x+q.w*.3,y,q.z-q.d*.22,2.4,1.25,2,paint(0xd2d6c8));
    B.box(q.x+q.w*.3,y+1.25,q.z-q.d*.22,2.7,.14,2.2,stone);
    B.box(q.x+q.w*.3,y+.15,q.z-q.d*.22+1.01,.7,.95,.06,metal);
  }
  if((p.id.length+index)%3===0&&q.w>10) {
    for(let i=0;i<3;i++) {
      B.box(q.x-1.5+i*1.5,y+.15,q.z+q.d*.2,1.25,.12,1.6,paint(0x52787c),{rx:-.16});
      B.box(q.x-1.5+i*1.5,y,q.z+q.d*.2,.12,.2,1,metal);
    }
  } else if(q.w>12) {
    B.box(q.x+1,y+.03,q.z+q.d*.13,3,.18,1.5,glass);
    for(const dx of [-1.5,0,1.5])B.box(q.x+1+dx,y+.2,q.z+q.d*.13,.07,.07,1.5,stone);
  }
}

function residenceDetails(p,q,B,trim) {
  const z=q.z+q.d/2+.12,x=q.x+q.w*.32;
  B.box(x,3.3,z,1.8,p.h-3.5,.18,glass);
  for(let y=4;y<p.h-1;y+=3) {
    // Alternating service balconies and condenser housings stay inside the podium footprint.
    B.box(q.x-q.w*.3,y,z,2,.15,.55,stone);
    B.box(q.x-q.w*.3,y+.15,z+.2,2,.55,.12,metal);
    B.box(x,y,z+.12,1.9,.15,.15,stone);
    if(q.w>15) {
      B.box(q.x+q.w*.08,y+.35,z+.15,.75,.45,.38,paint(0xd8ddcb));
      for(const dx of [-.22,0,.22])B.box(q.x+q.w*.08+dx,y+.4,z+.36,.05,.3,.04,metal);
    }
  }
  for(let y=3.5;y<p.h;y+=3)B.box(q.x,y,q.z-q.d/2-.08,q.w,.18,.2,paint(trim));
}

function entrance(p,B,signs,type) {
  const z=p.z+p.d/2,w=type==='library'?Math.min(12,p.w*.5):Math.min(6,p.w*.48);
  B.box(p.x,0,z+.09,w,2.75,.18,glass);
  for(let x=-w/2;x<=w/2;x+=w/3)B.box(p.x+x,0,z+.22,.08,2.8,.08,metal);
  B.box(p.x,1.25,z+.24,w,.08,.06,stone);
  B.box(p.x,2.9,z+.6,w+1,.22,1.5,paint(type==='research'?0xaabcb4:0xe1dfcf));
  for(const s of [-1,1]) {
    B.box(p.x+s*(w/2+.3),0,z+.9,.22,2.9,.22,stone);
    B.box(p.x+s*(w/2+1),0,z+.7,.8,.4,.8,stone);
    B.box(p.x+s*(w/2+1),.4,z+.7,.7,.65,.7,{tex:'hedge',tint:0x8da578});
  }
  // A shallow, walkable threshold and two door pulls; the entrance remains outdoors.
  B.box(p.x,.08,z+.7,w+.8,.12,1.7,stone);
  for(const s of [-1,1])B.box(p.x+s*.2,1,z+.3,.04,.4,.08,metal);
  signs.push({id:p.id,x:p.x,y:3.45,z:z+.28,w:Math.min(p.w*.74,Math.max(4,p.name.length*.65)),h:.65});
}

export function buildStadium(p,B,planes,signs) {
  const original=p,shape=stadiumProfile(p);
  p={...p,x:0,z:0,w:shape.rx*2,d:shape.rz*2};
  const bodyHeight=p.h-2.1;
  const mesh=(geometry,material,x,y,z,sx,sy,sz)=>{
    const m=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial(material));m.position.set(original.x+x*shape.c+z*shape.s,y,original.z-x*shape.s+z*shape.c);m.rotation.y=shape.yaw;m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;m.userData.placeId=p.id;planes.push(m);return m;
  };
  mesh(new THREE.CylinderGeometry(1,1,bodyHeight,64),{color:0x7c9998},p.x,bodyHeight/2,p.z,p.w/2,1,p.d/2);
  mesh(new THREE.CylinderGeometry(1,1,.45,64),{color:0xe4e5d8},p.x,bodyHeight+.225,p.z,p.w/2*1.035,1,p.d/2*1.035);
  mesh(new THREE.SphereGeometry(1,64,12,0,Math.PI*2,0,Math.PI/2),{color:0xd3d9ce},p.x,bodyHeight,p.z,p.w/2,2.6,p.d/2);
  mesh(new THREE.CylinderGeometry(1,1,.12,48),{color:0x799e9b},p.x,p.h+.52,p.z,p.w*.19,1,p.d*.19);
  B.at(original.x,0,original.z,shape.yaw,()=>{
  for(let a=0;a<Math.PI*2;a+=Math.PI/32) {
    const x=p.x+Math.sin(a)*p.w*.503,z=p.z+Math.cos(a)*p.d*.503;
    B.box(x,.4,z,.28,bodyHeight-.4,.34,stone,{ry:a});
  }
  // Radial roof seams are thin batched bars following the dome in short segments.
  for(let a=0;a<Math.PI*2;a+=Math.PI/12)for(let j=0;j<5;j++) {
    const r0=.39+j*.12,r1=r0+.12,rm=(r0+r1)/2;
    const y0=bodyHeight+2.6*Math.sqrt(1-r0*r0),y1=bodyHeight+2.6*Math.sqrt(1-r1*r1);
    const dx=Math.sin(a)*p.w/2*(r1-r0),dz=Math.cos(a)*p.d/2*(r1-r0),length=Math.hypot(dx,dz);
    B.box(p.x+Math.sin(a)*p.w/2*rm,(y0+y1)/2+.035,p.z+Math.cos(a)*p.d/2*rm,.065,.07,length,paint(0xa3b1a7),{ry:a,rx:Math.atan2(y0-y1,length)});
  }
  for(const s of [-1,1])B.box(p.x+s*5,0,p.z+p.d/2+.5,.4,3.1,.4,stone);
  B.box(p.x,3.1,p.z+p.d/2+.5,11,.3,2,stone);
  B.box(p.x,0,p.z+p.d/2,7,2.8,.3,glass);
  });
  const entry=p.d/2+.65;
  signs.push({id:p.id,x:original.x+entry*shape.s,y:3.7,z:original.z+entry*shape.c,w:9,h:.75,ry:shape.yaw});
}

export function buildGate(p,B,signs) {
  const ry=p.w<p.d?Math.PI/2:0;
  B.at(p.x,0,p.z,ry,()=>{
    for(const x of [-5.7,5.7]) {
      B.box(x,0,0,.9,4.5,.95,stone);B.box(x,4.5,0,1.25,.25,1.25,paint(0x8c9d92));
      B.box(x,1.2,.49,.55,2,.06,metal);
    }
    B.box(0,4.45,0,12.6,.45,1.35,stone);
    B.box(0,3.5,.1,10.4,.8,.3,paint(0x396a65));
    // Guard booth, glazing, roof lip and retractable barrier off the walking lane.
    B.box(-8,0,0,2.6,2.7,2.5,paint(0xddd9c8));B.box(-8,1,-.1,2.7,1.15,1.8,glass);
    B.box(-8,2.7,0,3,.25,2.9,metal);B.box(-8,0,1.3,.85,2.2,.08,metal);
    B.box(4.6,0,0,.35,1.15,.4,metal);
    for(let x=1.2;x<=4.6;x+=.55)B.box(x,1.05,0,.55,.16,.15,paint(x%1.1<.55?0xb66f52:0xede8d6));
    for(const x of [-3.2,-2,2,3.2])B.box(x,0,1.1,.12,.85,.12,metal);
    for(const x of [-4.7,4.7])B.box(x,0,-1.5,1.4,.35,1.2,stone);
  });
  signs.push({id:p.id,text:`北京工业大学 · ${p.name}`,x:p.x+Math.sin(ry)*.28,y:3.9,z:p.z+Math.cos(ry)*.28,w:9.7,h:.72,ry});
}
