import * as THREE from 'three';
import { buildingMassing } from './architecture.js';
import { rng,canvasTexture } from '@engine/world/textures.js';
import { BUILDINGS,FIELDS,PLACES,ROADS,LAWNS } from './places.js';
import { CAMPUS_OUTLINE,WEST_PARCEL,BOUNDS,LANDSCAPE_PATCHES,LAKE_OUTLINE,PARK_PATHS,pointInPolygon,roadOverlapsBox,sampleRoad,courtCells,footballPitch,fromReference } from './reference-layout.js';
import { PARKING,BIKE_RACKS,PERGOLA,BENCHES } from './details-layout.js';

const paint=tint=>({tex:'paint',tint}),metal=paint(0x536d65),stone=paint(0xd5d2be);
const overlap=(a,b,pad=0)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;

export function buildEnvironment(B,V,grid,signs) {
  const obstacles=[],bakes=[],fenceVertices=[],fenceUvs=[],fenceIndices=[],wheels=[];
  const foot=(x,z,w,d)=>obstacles.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,level:0});
  const reserved=[...PARKING.map(p=>({...p,w:3,d:5})),...BIKE_RACKS,PERGOLA];
  const masses=BUILDINGS.flatMap(p=>p.style==='stadium'?[p]:buildingMassing(p));
  const clear=(x,z,w,d,roads=true)=>!masses.some(p=>overlap({x,z,w,d},p,.7))&&!pointInPolygon(x,z,LAKE_OUTLINE)&&!FIELDS.some(p=>overlap({x,z,w,d},p,.5))&&(!roads||!ROADS.some(p=>roadOverlapsBox(p,{x,z,w,d},.3)))&&!PLACES.some(p=>Math.hypot(x-p.at[0],z-p.at[1])<2.2+Math.max(w,d)/3);
  const random=rng(1960),trees=[];
  const tree=(x,z)=>{if(trees.length<520&&x>BOUNDS.x0+4&&x<BOUNDS.x1-4&&z>BOUNDS.z0+4&&z<BOUNDS.z1-4&&clear(x,z,3,3)&&!PARK_PATHS.some(points=>roadOverlapsBox({points,width:3.1},{x,z,w:3,d:3},.8))&&!reserved.some(p=>overlap({x,z,w:3,d:3},p,.6))&&!trees.some(t=>Math.hypot(x-t[0],z-t[1])<6))trees.push([x,z]);};
  for(const patch of LANDSCAPE_PATCHES){const xs=patch.map(p=>p[0]),zs=patch.map(p=>p[1]);for(let x=Math.min(...xs)+3;x<Math.max(...xs);x+=15)for(let z=Math.min(...zs)+3;z<Math.max(...zs);z+=15)if(pointInPolygon(x,z,patch))tree(x+(random()-.5)*4,z+(random()-.5)*4);}
  for(const[cx,cz,w,d]of LAWNS)for(let x=cx-w/2+3;x<cx+w/2;x+=12)for(let z=cz-d/2+3;z<cz+d/2;z+=12)tree(x+(random()-.5)*2,z+(random()-.5)*2);
  for(const r of ROADS)for(const side of [-1,1])for(const [x,z] of sampleRoad(r,32,side*(r.width/2+4)))tree(x,z);
  trees.forEach(([x,z],i)=>{
    const h=3+random()*1.7,w=4.2+random()*1.2,color=[0x83a36a,0x92ab73,0x749867,0xa4b781][i%4];
    V.box(x,.05,z,.37,h,.37,{tex:'log'});
    if(i%5===0) {
      for(let j=0;j<3;j++)V.box(x,h-.6+j*1.05,z,w*(1-j*.24)*.7,1.3,w*(1-j*.24)*.7,{tex:'hedge',tint:color});
    } else {
      V.box(x,h-.5,z,w,1.6,w*.85,{tex:'hedge',tint:color});
      V.box(x+.45,h+.85,z-.25,w*.74,1.4,w*.69,{tex:'hedge',tint:color});
      V.box(x-.5,h+.5,z+.2,w*.66,1.25,w*.7,{tex:'hedge',tint:color});
    }
    B.box(x,.09,z,1.2,.08,1.2,paint(0xa4ae95));
    grid.fill(Math.floor(x),0,Math.floor(z),Math.floor(x)+1,3,Math.floor(z)+1,'campus-collision');
  });
  function bench(x,z,ry=0) {
    B.at(x,0,z,ry,()=>{
      for(let i=0;i<4;i++)B.box(0,.45,-.25+i*.16,2,.1,.12,{tex:'oak'});
      for(const y of [.8,1.04])B.box(0,y,-.33,2,.16,.1,{tex:'oak'});
      for(const s of [-1,1]){B.box(s*.73,0,0,.1,.5,.6,metal);B.box(s*.73,.5,-.33,.08,.65,.08,metal);B.box(s*.9,.7,0,.1,.08,.5,metal);}
    });foot(x,z,ry? .85:2.1,ry?2.1:.85);
  }
  function planter(x,z,w=2.3,d=1) {
    B.box(x,.08,z,w,.4,d,stone);V.box(x,.48,z,w-.22,.55,d-.22,{tex:'hedge',tint:0x8ba36a});
    for(let i=0;i<5;i++)V.box(x-w*.36+i*w*.18,1.03,z,.18,.14,.18,paint(i%2?0xe1c69a:0xc59ca1));
    foot(x,z,w,d);
  }
  for(const{x,z}of BENCHES)if(clear(x,z,2.4,1.2)){bench(x,z);if(clear(x+3,z,2.3,1.2))planter(x+3,z);}
  for(const p of PLACES.filter(p=>p.style==='square')) {
    for(const s of [-1,1]) {
      const x=p.x+s*(p.w/2-1.8),z=p.z+p.d/2-1;
      if(clear(x,z,2.2,1,false))planter(x,z);
    }
  }
  // A small shaded seating court, with open aisles between its four posts.
  const g=PERGOLA;
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    B.box(g.x+sx*(g.w/2-.25),0,g.z+sz*(g.d/2-.25),.22,2.85,.22,{tex:'wood_panel'});
    foot(g.x+sx*(g.w/2-.25),g.z+sz*(g.d/2-.25),.3,.3);
  }
  for(const s of [-1,1])B.box(g.x,2.75,g.z+s*g.d/2,g.w+.4,.22,.22,{tex:'oak'});
  for(let x=-g.w/2;x<=g.w/2;x+=.65)B.box(g.x+x,2.95,g.z,.12,.18,g.d+.7,{tex:'oak'});
  bench(g.x,g.z-1.2);planter(g.x+g.w/2+1,g.z,1.1,3);

  for(const rack of BIKE_RACKS) {
    for(const s of [-1,1]){B.box(rack.x+s*rack.w/2,0,rack.z-.7,.12,2.5,.12,metal);foot(rack.x+s*rack.w/2,rack.z-.7,.2,.2);}
    B.box(rack.x,2.5,rack.z,rack.w+.4,.12,rack.d+.3,{tex:'paint',tint:0xadc5bb});
    for(let i=0;i<6;i++) {
      const x=rack.x-3.2+i*1.25,z=rack.z;
      B.box(x,0,z,.07,.6,1.6,metal);
      B.box(x,.6,z,1,.08,.08,paint([0x637f88,0xc59e67,0x8b9b70][i%3]));
      B.box(x-.22,.5,z,.075,.5,.08,metal,{rz:-.5});B.box(x+.2,.55,z,.07,.55,.08,metal,{rz:.6});
      B.box(x+.39,.45,z,.07,.8,.08,metal,{rz:.15});B.box(x+.36,1.16,z,.1,.07,.38,metal);
      B.box(x-.2,1.04,z,.35,.09,.18,paint(0x485951));
      wheels.push([x-.47,.34,z],[x+.47,.34,z]);
    }
    foot(rack.x,rack.z,rack.w,1.2);
  }
  for(const p of PARKING)if(p.occupied) {
    B.box(p.x,.35,p.z,1.65,.65,3.3,paint(p.color));B.box(p.x,.97,p.z-.15,1.4,.5,1.9,glass());
    B.box(p.x,1.47,p.z-.15,1.42,.12,1.85,paint(p.color));
    for(const sx of [-1,1])for(const sz of [-1,1])B.box(p.x+sx*.81,.16,p.z+sz*1.02,.2,.4,.55,paint(0x394c48));
    for(const s of [-1,1]){B.box(p.x+s*.52,.7,p.z+1.67,.32,.14,.05,paint(0xe7dfb7));B.box(p.x+s*.52,.7,p.z-1.67,.32,.14,.05,paint(0xb77861));}
    foot(p.x,p.z,1.85,3.6);
  }
  function lamp(x,z,height=4.2) {
    if(BUILDINGS.some(p=>overlap({x,z,w:.4,d:.4},p,.5)))return;
    B.box(x,.05,z,.36,.18,.36,stone);B.box(x,.2,z,.12,height,.12,metal);
    B.box(x,height,z,.95,.12,.35,metal);B.box(x,height-.08,z,.7,.08,.27,{tex:'paint',tint:0xffe2a8,emissive:.9});
    if(Math.abs(x%24)<5)bakes.push({id:`street-${x}-${z}`,position:[x,height-.2,z],power:1.5,radius:9,direction:[0,-1,0]});
  }
  for(const r of ROADS)for(const [x,z] of sampleRoad(r,44,r.width/2+1.1))if(clear(x,z,.5,.5,false))lamp(x,z);
  for(const p of PLACES) {
    const x=p.at[0]+1.5,z=p.at[1];
    B.box(x,0,z,.12,1.65,.12,metal);B.box(x,1.2,z,1.25,.5,.12,paint(0x426f63));
    signs.push({id:p.id,x,y:1.45,z:z+.067,w:1.22,h:.45});
  }
  // Waste sorting bins placed beside seating, away from station landing points.
  for(const{x,z}of BENCHES.map(p=>({x:p.x+4.8,z:p.z})))if(clear(x,z,1.1,.7)) {
    for(const s of [-1,1]){B.box(x+s*.28,0,z,.48,.9,.55,paint(s<0?0x688f8e:0x8d9d72));B.box(x+s*.28,.9,z,.52,.13,.6,metal);B.box(x+s*.28,.62,z+.29,.26,.1,.03,paint(0xd6ddc6));}foot(x,z,1.1,.7);
  }
  const flag=fromReference(527,240);B.box(flag.x,.08,flag.z,1.6,.2,1.6,stone);B.box(flag.x,.28,flag.z,.1,7.5,.1,metal);B.box(flag.x+.8,6.3,flag.z,1.5,.95,.055,paint(0xb96852));foot(flag.x,flag.z,1.6,1.6);

  // A static ornamental lake: visible shore stones and non-walkable water,
  // without changing the engine's swimming or pool implementation.
  const lx=LAKE_OUTLINE.map(p=>p[0]),lz=LAKE_OUTLINE.map(p=>p[1]);
  for(let x=Math.floor(Math.min(...lx));x<Math.max(...lx);x++)for(let z=Math.floor(Math.min(...lz));z<Math.max(...lz);z++)if(pointInPolygon(x+.5,z+.5,LAKE_OUTLINE))grid.fill(x,0,z,x+1,1,z+1,'campus-collision');
  for(let i=0;i<LAKE_OUTLINE.length;i++){
    const a=LAKE_OUTLINE[i],b=LAKE_OUTLINE[(i+1)%LAKE_OUTLINE.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    B.box((a[0]+b[0])/2,.08,(a[1]+b[1])/2,.6,.3,length+.3,stone,{ry:Math.atan2(dx,dz)});
    if(i%3===0)for(let j=0;j<5;j++)V.box(a[0]+j*.22,.1,a[1]-.6,.08,.8+(j%3)*.25,.08,paint(0x7b9865));
  }

  function fence(x0,z0,x1,z1,height=2.6) {
    const length=Math.hypot(x1-x0,z1-z0),base=fenceVertices.length/3;
    fenceVertices.push(x0,.15,z0,x1,.15,z1,x1,height,z1,x0,height,z0);
    fenceUvs.push(0,0,length*1.5,0,length*1.5,height*1.5,0,height*1.5);fenceIndices.push(base,base+1,base+2,base,base+2,base+3);
    const steps=Math.ceil(length/3);
    for(let i=0;i<=steps;i++)B.box(x0+(x1-x0)*i/steps,0,z0+(z1-z0)*i/steps,.07,height+.1,.07,metal);
    foot((x0+x1)/2,(z0+z1)/2,Math.abs(x1-x0)+.1,Math.abs(z1-z0)+.1);
  }
  for(const f of FIELDS.filter(p=>p.style==='court')) {
    const x0=f.x-f.w/2,z0=f.z-f.d/2,x1=f.x+f.w/2,z1=f.z+f.d/2;
    fence(x0,z0,x1,z0);fence(x0,z0,x0,z1);fence(x1,z0,x1,z1);
    fence(x0,z1,f.x-1.2,z1);fence(f.x+1.2,z1,x1,z1);
    for(const cell of courtCells(f)) {
      const {x:cx,z:cz,w:cw,d:cd}=cell;
      if(f.id==='tennis')fence(cx-cw/2,cz,cx+cw/2,cz,.95);
      else for(const side of [-1,1]) {
        const z=cz+side*(cd/2+.5),toward=-side;
        B.box(cx,0,z,.13,3.05,.13,metal);B.box(cx,2.75,z+toward*.15,1.4,.85,.1,stone);
        B.box(cx,2.85,z+toward*.21,.75,.45,.04,paint(0xa3b9aa));B.box(cx,2.63,z+toward*.58,.55,.07,.6,paint(0xaf704d));
        for(const sx of [-1,1])B.box(cx+sx*.23,2.28,z+toward*.58,.04,.35,.5,stone);
      }
    }
  }
  for(const f of FIELDS.filter(p=>p.style==='field')) {
    const length=footballPitch(f).length;
    for(const side of [-1,1]) {
      const z=f.z+side*length/2,back=z+side*1.2;
      for(const dx of [-3,3]){B.box(f.x+dx,0,z,.1,2.1,.1,stone);B.box(f.x+dx,0,back,.08,1.9,.08,stone);}
      B.box(f.x,2,z,6,.1,.1,stone);fence(f.x-3,back,f.x+3,back,1.9);
      for(const dx of [-3,3])fence(f.x+dx,z,f.x+dx,back,1.9);
    }
    const x=f.x-f.w/2-1.5;
    for(let row=0;row<3;row++)B.box(x-row*.45,.1+row*.25,f.z+14,.4,.2,22,paint(row%2?0xc7bda1:0xe2dac3));
    foot(x-.45,f.z+14,1.3,22);
    for(const z of [f.z-f.d*.3,f.z+f.d*.3]) {
      const lx=f.x+f.w/2+2;lamp(lx,z,8);
      B.box(lx,7.8,z,2,.5,.4,{tex:'paint',tint:0xe9deb1,emissive:.6});
      bakes.push({id:`field-${f.id}-${z}`,position:[lx,7.6,z],power:2.8,radius:25,direction:[-.6,-1,0]});
    }
  }
  // Decorative rails follow the irregular land parcels; gates remain open.
  for(const outline of [CAMPUS_OUTLINE,WEST_PARCEL])for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),steps=Math.ceil(length/10);
    for(let j=0;j<steps;j++) {
      const x=a[0]+dx*(j+.5)/steps,z=a[1]+dz*(j+.5)/steps;
      if(PLACES.some(p=>p.style==='gate'&&Math.hypot(x-p.x,z-p.z)<14)||BUILDINGS.some(p=>overlap({x,z,w:1,d:1},p,1)))continue;
      B.box(x,0,z,.22,1.1,.22,stone);B.box(x,.75,z,.09,.1,length/steps-.2,metal,{ry:Math.atan2(dx,dz)});
    }
  }
  const planes=[];
  if(fenceVertices.length) {
    const tex=canvasTexture(32,32,ctx=>{ctx.clearRect(0,0,32,32);ctx.strokeStyle='#b8c8ae';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-16,0);ctx.lineTo(16,32);ctx.moveTo(0,0);ctx.lineTo(32,32);ctx.moveTo(16,0);ctx.lineTo(48,32);ctx.moveTo(-16,32);ctx.lineTo(16,0);ctx.moveTo(0,32);ctx.lineTo(32,0);ctx.moveTo(16,32);ctx.lineTo(48,0);ctx.stroke();},{pixelated:false});
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(fenceVertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(fenceUvs,2));geometry.setIndex(fenceIndices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({map:tex,alphaTest:.35,side:THREE.DoubleSide}));mesh.name='campus-court-fences';planes.push(mesh);
  }
  if(wheels.length) {
    const mesh=new THREE.InstancedMesh(new THREE.TorusGeometry(.3,.045,4,12),new THREE.MeshLambertMaterial({color:0x435e56}),wheels.length),matrix=new THREE.Matrix4();
    wheels.forEach(([x,y,z],i)=>{matrix.makeTranslation(x,y,z);mesh.setMatrixAt(i,matrix);});mesh.name='campus-bicycle-wheels';mesh.castShadow=true;planes.push(mesh);
  }
  return {obstacles,bakes,planes,treeCount:trees.length};
}
function glass(){return {tex:'paint',tint:0x6f8f92};}
