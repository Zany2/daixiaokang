import { ISLAND, ROADS, LAWNS, FIELDS, PLACES, BUILDINGS } from './layout.js';
import { CAMPUS_OUTLINE, WEST_PARCEL, LANDSCAPE_PATCHES, PARK_PATHS, LAKE_OUTLINE, CROSSINGS, roadPoints, courtCells, footballPitch } from './reference-layout.js';
import { PARKING, BIKE_RACKS, PERGOLA } from './details-layout.js';
import { buildingMassing } from './architecture.js';
import { stadiumProfile } from './stadium-shape.js';

const trace=(ctx,points,close=false)=>{ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));if(close)ctx.closePath();};
export function paintGround(ctx,X,Z,scale,labels=false) {
 ctx.save();ctx.setTransform(scale,0,0,scale,X(0),Z(0));
 ctx.fillStyle='#e4e7df';ctx.fillRect(ISLAND.x0,ISLAND.z0,ISLAND.x1-ISLAND.x0,ISLAND.z1-ISLAND.z0);
 for(const outline of [CAMPUS_OUTLINE,WEST_PARCEL]){trace(ctx,outline,true);ctx.fillStyle='#eae7dd';ctx.fill();ctx.strokeStyle='#c6cdbb';ctx.lineWidth=1;ctx.stroke();}
 for(const outline of LANDSCAPE_PATCHES){trace(ctx,outline,true);ctx.fillStyle='#b6cc9d';ctx.fill();ctx.strokeStyle='#d5dbbf';ctx.lineWidth=1.2;ctx.stroke();}
 for(const[x,z,w,d]of LAWNS){
  ctx.fillStyle='#bacc9e';ctx.fillRect(x-w/2,z-d/2,w,d);ctx.strokeStyle='#adbf91';ctx.lineWidth=.35;ctx.strokeRect(x-w/2+.4,z-d/2+.4,w-.8,d-.8);
  ctx.fillStyle='#afc394';for(let gx=x-w/2+1;gx<x+w/2;gx+=4)for(let gz=z-d/2+1;gz<z+d/2;gz+=4)ctx.fillRect(gx+Math.sin(gz+gx)*.5,gz,.4,.5);
  if(w>18&&d>12){ctx.fillStyle='#e3deca';ctx.fillRect(x-1.2,z-d/2,2.4,d);ctx.fillRect(x-w/2,z-1.2,w,2.4);}
 }
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const path of PARK_PATHS){trace(ctx,path);ctx.strokeStyle='#9eb28f';ctx.lineWidth=4.6;ctx.stroke();ctx.strokeStyle='#e4dfcc';ctx.lineWidth=3.1;ctx.stroke();}
 for(const b of BUILDINGS){
  ctx.fillStyle='#dbd9cb';ctx.fillRect(b.x-b.w/2-1.8,b.z-b.d/2-1.8,b.w+3.6,b.d+3.6);
  if(b.shape==='courtyard'||b.shape==='teaching-court'){
   ctx.fillStyle='#b7c99d';ctx.fillRect(b.x-b.w*.24,b.z-b.d*.17,b.w*.48,b.d*.65);
   ctx.fillStyle='#e3dcc5';ctx.fillRect(b.x-1.5,b.z-b.d*.17,3,b.d*.65);
   ctx.beginPath();ctx.ellipse(b.x,b.z+b.d*.15,b.w*.14,b.d*.15,0,0,Math.PI*2);ctx.strokeStyle='#e5dcc3';ctx.lineWidth=2;ctx.stroke();
  }
 }
 for(const r of ROADS){
  const points=roadPoints(r),path=()=>trace(ctx,points);
  path();ctx.strokeStyle='#cecbbd';ctx.lineWidth=r.width+3.5;ctx.stroke();
  path();ctx.strokeStyle=r.primary?'#747e7e':'#969b91';ctx.lineWidth=r.width;ctx.stroke();
  path();ctx.strokeStyle='#e8e4ca';ctx.lineWidth=r.primary?.25:.16;ctx.setLineDash(r.primary?[4,3]:[2.5,3]);ctx.stroke();ctx.setLineDash([]);
  if(labels){const a=points[0],b=points[1],angle=Math.atan2(b[1]-a[1],b[0]-a[0]);ctx.save();ctx.translate((a[0]+b[0])/2,(a[1]+b[1])/2);ctx.rotate(angle>Math.PI/2?angle-Math.PI:angle);ctx.fillStyle='#f4f1e3';ctx.font='3px sans-serif';ctx.textAlign='center';ctx.fillText(r.name,0,-.6);ctx.restore();}
 }
 for(const p of PLACES.filter(p=>p.style==='square')){
  ctx.fillStyle='#d7c3aa';ctx.fillRect(p.x-p.w/2,p.z-p.d/2,p.w,p.d);ctx.strokeStyle='#ede5d6';ctx.lineWidth=.18;
  for(let x=p.x-p.w/2;x<=p.x+p.w/2;x+=3){ctx.beginPath();ctx.moveTo(x,p.z-p.d/2);ctx.lineTo(x,p.z+p.d/2);ctx.stroke();}
  for(let z=p.z-p.d/2;z<=p.z+p.d/2;z+=3){ctx.beginPath();ctx.moveTo(p.x-p.w/2,z);ctx.lineTo(p.x+p.w/2,z);ctx.stroke();}
  ctx.strokeStyle='#a1ad91';ctx.lineWidth=.5;ctx.strokeRect(p.x-p.w/2+1,p.z-p.d/2+1,p.w-2,p.d-2);
 }
 ctx.strokeStyle='#ded4bd';ctx.lineWidth=2.8;
 for(const p of BUILDINGS){ctx.beginPath();ctx.moveTo(...p.at);ctx.lineTo(p.x,p.z+p.d/2+1);ctx.stroke();}
 for(const p of PARKING){ctx.fillStyle='#cecebf';ctx.fillRect(p.x-1.5,p.z-2.5,3,5);ctx.strokeStyle='#f7f0dd';ctx.lineWidth=.15;ctx.strokeRect(p.x-1.4,p.z-2.4,2.8,4.8);}
 for(const p of BIKE_RACKS){ctx.fillStyle='#cad3c1';ctx.fillRect(p.x-p.w/2-.7,p.z-p.d/2-.7,p.w+1.4,p.d+1.4);}
 const g=PERGOLA;ctx.fillStyle='#d7ccb4';ctx.fillRect(g.x-g.w/2-.4,g.z-g.d/2-.4,g.w+.8,g.d+.8);
 for(const f of FIELDS){
  ctx.fillStyle='#c5c3b4';ctx.fillRect(f.x-f.w/2-1,f.z-f.d/2-1,f.w+2,f.d+2);
  if(f.style==='field'){ctx.save();ctx.translate(f.x,f.z);ctx.rotate(Math.PI/2);drawField(ctx,f);ctx.restore();}
  else drawCourts(ctx,f);
 }
 trace(ctx,LAKE_OUTLINE,true);ctx.fillStyle='#79afb0';ctx.fill();ctx.strokeStyle='#d8d1b8';ctx.lineWidth=1.5;ctx.stroke();
 ctx.save();ctx.clip();ctx.strokeStyle='#acd1c5';ctx.lineWidth=.35;
 const lake=PLACES.find(p=>p.id==='moon-lake');for(let z=lake.z-lake.d/2;z<lake.z+lake.d/2;z+=3.5){ctx.beginPath();ctx.ellipse(lake.x,z,9,1.5,0,0,Math.PI);ctx.stroke();}ctx.restore();
 for(const[x,z]of CROSSINGS){ctx.save();ctx.translate(x,z);ctx.fillStyle='#eee9da';for(let i=-3;i<=3;i++)ctx.fillRect(-3.5,i*.8,7,.4);ctx.restore();}
 ctx.restore();
}
export function paintCampusMap(ctx,X,Z,scale){
 paintGround(ctx,X,Z,scale);ctx.save();ctx.setTransform(scale,0,0,scale,X(0),Z(0));
 for(const p of BUILDINGS){
  ctx.fillStyle=p.style==='red'?'#b87561':p.style==='gray'||p.style==='library'?'#a6b8b3':'#d9ceb1';ctx.strokeStyle='#7f8e81';ctx.lineWidth=.35;
  if(p.style==='stadium'){const q=stadiumProfile(p);ctx.beginPath();ctx.ellipse(p.x,p.z,q.rx,q.rz,-q.yaw,0,Math.PI*2);ctx.fill();ctx.stroke();}
  else for(const q of buildingMassing(p)){ctx.fillStyle=q.atrium?'#8bada6':p.style==='red'?'#b57762':'#dad4b9';ctx.fillRect(q.x-q.w/2,q.z-q.d/2,q.w,q.d);ctx.strokeRect(q.x-q.w/2,q.z-q.d/2,q.w,q.d);}
 }
 ctx.fillStyle='#385c55';ctx.font='bold 7px sans-serif';ctx.fillText('N ↑',ISLAND.x1-60,ISLAND.z0+38);
 ctx.lineWidth=1;ctx.strokeStyle='#385c55';ctx.beginPath();ctx.moveTo(ISLAND.x1-125,ISLAND.z1-25);ctx.lineTo(ISLAND.x1-75,ISLAND.z1-25);ctx.stroke();ctx.font='5px sans-serif';ctx.fillText('≈ 50 m',ISLAND.x1-124,ISLAND.z1-31);ctx.restore();
}
function oval(ctx,w,h,r){const a=w/2-r;ctx.beginPath();ctx.moveTo(-a,-h/2);ctx.lineTo(a,-h/2);ctx.arc(a,0,r,-Math.PI/2,Math.PI/2);ctx.lineTo(-a,h/2);ctx.arc(-a,0,r,Math.PI/2,Math.PI*1.5);ctx.closePath();}
function drawField(ctx,f){
 const w=f.d,d=f.w,pitch=footballPitch(f),fw=pitch.length,fd=pitch.width;
 ctx.fillStyle='#b46b59';oval(ctx,w,d,d/2);ctx.fill();ctx.strokeStyle='#f0dbc5';ctx.lineWidth=.17;
 for(let i=0;i<8;i++){const inset=1.1+i*.85;oval(ctx,w-inset*2,d-inset*2,d/2-inset);ctx.stroke();}
 ctx.font='1.4px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f3e3c9';for(let i=0;i<8;i++)ctx.fillText(String(i+1),w*.17,-d/2+1.6+i*.85);
 ctx.fillStyle='#7ca16c';ctx.fillRect(-fw/2,-fd/2,fw,fd);ctx.fillStyle='#8aaa72';for(let i=0;i<10;i+=2)ctx.fillRect(-fw/2+i*fw/10,-fd/2,fw/10,fd);
 ctx.strokeStyle='#f3f0dc';ctx.lineWidth=.24;ctx.strokeRect(-fw/2,-fd/2,fw,fd);ctx.beginPath();ctx.moveTo(0,-fd/2);ctx.lineTo(0,fd/2);ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,Math.min(9.15,fd*.14),0,Math.PI*2);ctx.stroke();
 for(const side of[-1,1]){const end=side*fw/2;ctx.strokeRect(side<0?end:end-16.5,-Math.min(20.16,fd*.36),16.5,Math.min(40.32,fd*.72));ctx.strokeRect(side<0?end:end-5.5,-9.16,5.5,18.32);ctx.beginPath();ctx.arc(end-side*11,0,.35,0,Math.PI*2);ctx.fill();}
}
function drawCourts(ctx,f){
 const tennis=f.id==='tennis';ctx.fillStyle=tennis?'#79a29a':'#b37d68';ctx.fillRect(f.x-f.w/2,f.z-f.d/2,f.w,f.d);
 for(const q of courtCells(f)){
  const x=q.x-q.w/2,z=q.z-q.d/2,w=q.w,d=q.d;ctx.fillStyle=tennis?'#87ad8d':'#769b85';ctx.fillRect(x,z,w,d);ctx.strokeStyle='#f4efda';ctx.lineWidth=.16;ctx.strokeRect(x,z,w,d);
  ctx.beginPath();ctx.moveTo(x,z+d/2);ctx.lineTo(x+w,z+d/2);ctx.stroke();
  if(tennis){ctx.strokeRect(x+1.25,z,w-2.5,d);ctx.strokeRect(x,z+d*.25,w,d*.5);ctx.beginPath();ctx.moveTo(q.x,z+d*.25);ctx.lineTo(q.x,z+d*.75);ctx.stroke();}
  else{ctx.beginPath();ctx.arc(q.x,q.z,1.8,0,Math.PI*2);ctx.stroke();for(const side of[-1,1]){const end=q.z+side*d/2;ctx.strokeRect(q.x-2.45,side<0?end:end-5.8,4.9,5.8);ctx.beginPath();ctx.arc(q.x,end-side*1.575,Math.min(6.75,w*.43),side>0?Math.PI:0,side>0?Math.PI*2:Math.PI);ctx.stroke();}}
 }
}
