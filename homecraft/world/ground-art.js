import { ISLAND, ROADS, LAWNS, FIELDS, PLACES, BUILDINGS } from './layout.js';
import { CAMPUS_OUTLINE, WEST_PARCEL, roadPoints } from './reference-layout.js';
import { PARKING, BIKE_RACKS, PERGOLA } from './details-layout.js';
import { buildingMassing } from './architecture.js';

// The same source geometry paints the walkable ground and the minimap.
export function paintGround(ctx,X,Z,scale,labels=false) {
  ctx.save();ctx.setTransform(scale,0,0,scale,X(0),Z(0));
  ctx.fillStyle='#e5e6df';ctx.fillRect(ISLAND.x0,ISLAND.z0,ISLAND.x1-ISLAND.x0,ISLAND.z1-ISLAND.z0);
  for(const outline of [CAMPUS_OUTLINE,WEST_PARCEL]) {
    ctx.beginPath();outline.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));ctx.closePath();
    ctx.fillStyle='#eeece4';ctx.fill();ctx.strokeStyle='#cccfc1';ctx.lineWidth=.7;ctx.stroke();
  }
  for(const [x,z,w,d] of LAWNS) {
    ctx.fillStyle='#c8d6af';ctx.fillRect(x-w/2,z-d/2,w,d);
    ctx.strokeStyle='#b6c69a';ctx.lineWidth=.3;ctx.strokeRect(x-w/2+.3,z-d/2+.3,w-.6,d-.6);
    ctx.fillStyle='#b7cb99';
    for(let gx=x-w/2+1;gx<x+w/2;gx+=2.8)for(let gz=z-d/2+1;gz<z+d/2;gz+=2.8)ctx.fillRect(gx+Math.sin(gz+gx)*.5,gz,.25,.4);
    if(w>18&&d>12){ctx.fillStyle='#e3dfca';ctx.fillRect(x-1,z-d/2,2,d);ctx.fillRect(x-w/2,z-1,w,2);}
  }
  for(const b of BUILDINGS){ctx.fillStyle='#ddddd1';ctx.fillRect(b.x-b.w/2-1.5,b.z-b.d/2-1.5,b.w+3,b.d+3);}
  const courtyard=PLACES.find(p=>p.id==='materials');
  ctx.fillStyle='#c8d6af';ctx.fillRect(courtyard.x-courtyard.w*.24,courtyard.z-courtyard.d*.18,courtyard.w*.48,courtyard.d*.68);
  ctx.fillStyle='#dfdac6';ctx.fillRect(courtyard.x-1.1,courtyard.z-courtyard.d*.18,2.2,courtyard.d*.68);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const r of ROADS) {
    const points=roadPoints(r),path=()=>{ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));};
    path();ctx.strokeStyle='#d4d0c3';ctx.lineWidth=r.width+3;ctx.stroke();
    path();ctx.strokeStyle=r.primary?'#727a7b':'#858b87';ctx.lineWidth=r.width;ctx.stroke();
    path();ctx.strokeStyle='#e5e4cf';ctx.lineWidth=.16;ctx.setLineDash([2.8,2.2]);ctx.stroke();ctx.setLineDash([]);
    if(labels) {
      const a=points[0],b=points[1],angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
      ctx.save();ctx.translate((a[0]+b[0])/2,(a[1]+b[1])/2);ctx.rotate(angle>Math.PI/2?angle-Math.PI:angle);
      ctx.fillStyle='#f3f0e3';ctx.font='2.2px sans-serif';ctx.textAlign='center';ctx.fillText(r.name,0,-.7);ctx.restore();
    }
  }
  for(const p of PLACES.filter(p=>p.style==='square')) {
    ctx.fillStyle='#d7c3ab';ctx.fillRect(p.x-p.w/2,p.z-p.d/2,p.w,p.d);
    ctx.strokeStyle='#eee7d9';ctx.lineWidth=.18;
    for(let x=p.x-p.w/2;x<=p.x+p.w/2;x+=2.5){ctx.beginPath();ctx.moveTo(x,p.z-p.d/2);ctx.lineTo(x,p.z+p.d/2);ctx.stroke();}
    for(let z=p.z-p.d/2;z<=p.z+p.d/2;z+=2.5){ctx.beginPath();ctx.moveTo(p.x-p.w/2,z);ctx.lineTo(p.x+p.w/2,z);ctx.stroke();}
    ctx.strokeStyle='#9fab8c';ctx.lineWidth=.4;ctx.strokeRect(p.x-p.w/2+.8,p.z-p.d/2+.8,p.w-1.6,p.d-1.6);
    ctx.beginPath();ctx.arc(p.x,p.z,Math.min(p.w,p.d)*.24,0,Math.PI*2);ctx.stroke();
  }
  ctx.strokeStyle='#d4cdb9';ctx.lineWidth=2.4;
  for(const p of BUILDINGS){ctx.beginPath();ctx.moveTo(...p.at);ctx.lineTo(p.x,p.z+p.d/2+.7);ctx.stroke();}
  for(const p of PARKING){ctx.fillStyle='#cfcec0';ctx.fillRect(p.x-1.5,p.z-2.5,3,5);ctx.strokeStyle='#faf4df';ctx.lineWidth=.14;ctx.strokeRect(p.x-1.4,p.z-2.4,2.8,4.8);ctx.fillStyle='#f7f1d9';ctx.font='1.5px sans-serif';ctx.textAlign='center';ctx.fillText('P',p.x,p.z+.5);}
  for(const p of BIKE_RACKS){ctx.fillStyle='#d0d7c4';ctx.fillRect(p.x-p.w/2-.7,p.z-p.d/2-.7,p.w+1.4,p.d+1.4);}
  const g=PERGOLA;ctx.fillStyle='#d8cfb6';ctx.fillRect(g.x-g.w/2-.4,g.z-g.d/2-.4,g.w+.8,g.d+.8);
  for(const f of FIELDS) {
    ctx.save();ctx.translate(f.x,f.z);ctx.fillStyle='#c8c6b7';ctx.fillRect(-f.w/2-1,-f.d/2-1,f.w+2,f.d+2);
    if(f.style==='field'){if(f.d>f.w){ctx.rotate(Math.PI/2);drawField(ctx,f.d,f.w);}else drawField(ctx,f.w,f.d);}
    else drawCourts(ctx,f.w,f.d,f.id==='basketball');ctx.restore();
  }
  // Crossings sit at campus entrances and actual interior junctions.
  for(const [x,z,angle,width] of [[-145,12,0,12],[-48,200,Math.PI/2,8],[47,185,0,8],[47,44,0,8],[154,145,0,7]]) {
    ctx.save();ctx.translate(x,z);ctx.rotate(angle);ctx.fillStyle='#eeeadd';
    for(let i=-3;i<=3;i++)ctx.fillRect(-width/2,i*.9,width,.45);ctx.restore();
  }
  ctx.restore();
}

export function paintCampusMap(ctx, X, Z, scale) {
  paintGround(ctx, X, Z, scale);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, X(0), Z(0));
  for (const p of BUILDINGS) {
    ctx.fillStyle = p.style === 'red' ? '#b87561' : p.style === 'gray' || p.style === 'library' ? '#aab6b0' : '#d4c8a3';
    ctx.strokeStyle = '#77847b'; ctx.lineWidth = .3;
    if (p.style === 'stadium') {
      ctx.beginPath(); ctx.ellipse(p.x, p.z, p.w/2, p.d/2, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    } else {
      for(const q of buildingMassing(p)) {
        ctx.fillStyle=q.atrium?'#89a99a':p.style==='red'?'#ac7563':'#e0d9bc';
        ctx.fillRect(q.x-q.w/2,q.z-q.d/2,q.w,q.d);
        ctx.strokeRect(q.x-q.w/2,q.z-q.d/2,q.w,q.d);
      }
    }
  }
  ctx.fillStyle = '#385c55'; ctx.font = 'bold 3px sans-serif'; ctx.fillText('N ↑', ISLAND.x1-24, ISLAND.z0+24);
  ctx.restore();
}
function oval(ctx, w, h, r) {
  const a = w / 2 - r;
  ctx.beginPath(); ctx.moveTo(-a, -h/2); ctx.lineTo(a,-h/2);
  ctx.arc(a,0,r,-Math.PI/2,Math.PI/2); ctx.lineTo(-a,h/2); ctx.arc(-a,0,r,Math.PI/2,Math.PI*1.5); ctx.closePath();
}
function drawField(ctx, w, d) {
  ctx.fillStyle = '#b66d5e'; oval(ctx, w, d, d/2); ctx.fill();
  ctx.strokeStyle = '#efd7bd'; ctx.lineWidth = .12;
  for (let i=0;i<5;i++) { oval(ctx,w-i*1.1,d-i*1.1,d/2-i*.55);ctx.stroke(); }
  ctx.font='.75px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5e8cb';
  for(let i=0;i<5;i++)ctx.fillText(String(i+1),w*.18,-d/2+.5+i*.55);
  const fw=w-d+8, fd=d-8;
  ctx.fillStyle='#8aa55f';ctx.fillRect(-fw/2,-fd/2,fw,fd);
  ctx.fillStyle='#93ad67';
  for(let i=0;i<8;i+=2)ctx.fillRect(-fw/2+i*fw/8,-fd/2,fw/8,fd);
  ctx.strokeStyle='#f5f0d8';ctx.lineWidth=.17;ctx.strokeRect(-fw/2+.5,-fd/2+.5,fw-1,fd-1);
  ctx.beginPath();ctx.moveTo(0,-fd/2+.5);ctx.lineTo(0,fd/2-.5);ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,3.2,0,Math.PI*2);ctx.stroke();
  for(const s of [-1,1])ctx.strokeRect(s<0?-fw/2+.5:fw/2-5.5,-5,5,10);
  ctx.lineWidth=.1;for(const s of [-1,1]){ctx.beginPath();ctx.arc(s*(fw/2-5.5),0,2,-Math.PI/2,Math.PI/2,s<0);ctx.stroke();}
}
function drawCourts(ctx,w,d,basketball) {
  ctx.fillStyle=basketball?'#b87561':'#77a69a';ctx.fillRect(-w/2,-d/2,w,d);
  const cols=basketball?2:1,rows=basketball?1:3;
  for(let ix=0;ix<cols;ix++)for(let iz=0;iz<rows;iz++) {
    const x=-w/2+ix*w/cols+1,z=-d/2+iz*d/rows+1,cw=w/cols-2,cd=d/rows-2;
    ctx.fillStyle=basketball?'#809d82':'#8db290';ctx.fillRect(x,z,cw,cd);
    ctx.strokeStyle='#f5f1dd';ctx.lineWidth=.12;ctx.strokeRect(x,z,cw,cd);
    ctx.beginPath();ctx.moveTo(x,z+cd/2);ctx.lineTo(x+cw,z+cd/2);ctx.stroke();
    if(basketball){ctx.beginPath();ctx.arc(x+cw/2,z+cd/2,1.4,0,Math.PI*2);ctx.stroke();}
    else{ctx.strokeRect(x+.7,z+1,cw-1.4,cd-2);ctx.beginPath();ctx.moveTo(x+cw/2,z+1);ctx.lineTo(x+cw/2,z+cd-1);ctx.stroke();}
  }
}
