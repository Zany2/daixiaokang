import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';
import { canvasTexture } from '@engine/world/textures.js';
import { ISLAND,PLACES,BUILDINGS } from './layout.js';
import { paintGround,paintCampusMap } from './ground-art.js';
import { buildLabels } from './labels.js';
import { mountCampus,preparePages } from './pages.js';
import { buildingMassing,buildArchitecture,buildStadium,buildGate } from './architecture.js';
import { buildEnvironment } from './environment.js';
import { buildSigns } from './signage.js';

preparePages();

export function build({grid,layer,stage}) {
  const B=new BoxBatch(layer),V=new BoxBatch(layer),planes=[],hotspots=[],boxes=[],signs=[];
  grid.define('campus-base',{tex:{all:'concrete'},skipFace:()=>true,tint:0xe8e5db,map:'#e8e5db'});
  grid.define('campus-collision',{tex:{all:'concrete'},skipFace:()=>true,map:'#c0b7a7'});
  grid.fill(ISLAND.x0,-2,ISLAND.z0,ISLAND.x1,0,ISLAND.z1,'campus-base');
  const width=ISLAND.x1-ISLAND.x0,depth=ISLAND.z1-ISLAND.z0,scale=4;
  const groundTex=canvasTexture(width*scale,depth*scale,ctx=>paintGround(ctx,x=>(x-ISLAND.x0)*scale,z=>(z-ISLAND.z0)*scale,scale,true));
  groundTex.anisotropy=Math.min(8,stage.renderer.capabilities.getMaxAnisotropy());
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshLambertMaterial({map:groundTex,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));
  ground.rotation.x=-Math.PI/2;ground.position.set((ISLAND.x0+ISLAND.x1)/2,.08,(ISLAND.z0+ISLAND.z1)/2);ground.receiveShadow=true;ground.name='campus-ground';planes.push(ground);
  const surround=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),new THREE.MeshLambertMaterial({color:0xe5e6df}));
  surround.rotation.x=-Math.PI/2;surround.position.y=-.75;surround.receiveShadow=true;surround.name='campus-surround';planes.push(surround);
  for(const p of BUILDINGS) {
    if(p.style==='stadium') {
      buildStadium(p,B,planes,signs);
      const bounds=new THREE.Box3(new THREE.Vector3(p.x-p.w/2,0,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,p.h+.5,p.z+p.d/2));
      boxes.push({p,bounds,stadium:true,top:{y:p.h+.5,site:p.id}});
      for(let x=Math.floor(bounds.min.x);x<bounds.max.x;x++)for(let z=Math.floor(bounds.min.z);z<bounds.max.z;z++) {
        const r=((x+.5-p.x)/(p.w/2))**2+((z+.5-p.z)/(p.d/2))**2;
        if(r<1)grid.fill(x,0,z,x+1,2,z+1,'campus-collision');
      }
    } else {
      const parts=buildingMassing(p);buildArchitecture(p,parts,B,signs);
      for(const q of parts) {
        const bounds=new THREE.Box3(new THREE.Vector3(q.x-q.w/2,q.y,q.z-q.d/2),new THREE.Vector3(q.x+q.w/2,q.y+q.h+.22,q.z+q.d/2));
        boxes.push({p,bounds,top:{x0:bounds.min.x,x1:bounds.max.x,z0:bounds.min.z,z1:bounds.max.z,y:bounds.max.y,site:p.id}});
        // Only ground navigation uses coarse blocks; continuous sites above
        // preserve fractional setbacks without hidden voxel ledges on terraces.
        const y0=Math.floor(q.y),y1=Math.min(2,Math.floor(bounds.max.y));
        if(y0<y1)grid.fill(Math.floor(bounds.min.x),y0,Math.floor(bounds.min.z),Math.ceil(bounds.max.x),y1,Math.ceil(bounds.max.z),'campus-collision');
      }
    }
  }
  for(const p of PLACES) {
    if(p.style==='gate')buildGate(p,B,signs);
    hotspots.push({id:p.id,box:new THREE.Box3(new THREE.Vector3(p.x-p.w/2,-.05,p.z-p.d/2),new THREE.Vector3(p.x+p.w/2,Math.max(1.5,p.h+1.8),p.z+p.d/2))});
  }
  const environment=buildEnvironment(B,V,grid,signs);planes.push(...environment.planes,buildSigns(PLACES,signs));
  const labels=buildLabels(PLACES);planes.push(labels);
  return {
    batches:{campus:B,vegetation:V},planes,hotspots,obstacles:environment.obstacles,sites:[createBuildingGround(boxes)],
    seaHole:{x0:-3000,x1:3000,z0:-3000,z1:3000},bakes:environment.bakes,
    named:{labels,drawMap:paintCampusMap,campus:{places:PLACES,buildingCount:BUILDINGS.length,treeCount:environment.treeCount,structuralParts:boxes.length,signCount:signs.length,roofs:boxes.map(b=>({id:b.p.id,x:(b.bounds.min.x+b.bounds.max.x)/2,z:(b.bounds.min.z+b.bounds.max.z)/2,y:b.top.y}))}},
  };
}

function createBuildingGround(boxes) {
  const ray=new THREE.Ray(),hit=new THREE.Vector3();
  const inside=(q,x,z)=>x>=q.bounds.min.x-1e-6&&x<=q.bounds.max.x+1e-6&&z>=q.bounds.min.z-1e-6&&z<=q.bounds.max.z+1e-6&&(!q.stadium||((x-q.p.x)/(q.p.w/2))**2+((z-q.p.z)/(q.p.d/2))**2<=1);
  const height=(q,x,z)=>q.stadium?q.p.h-2.1+2.6*Math.sqrt(Math.max(0,1-((x-q.p.x)/(q.p.w/2))**2-((z-q.p.z)/(q.p.d/2))**2)):q.top.y;
  function roofHit(q,r) {
    if(!q.stadium)return (q.top.y-r.origin.y)/r.direction.y;
    const p=q.p,rx=p.w/2,rz=p.d/2,base=p.h-2.1;
    const ox=(r.origin.x-p.x)/rx,oy=(r.origin.y-base)/2.6,oz=(r.origin.z-p.z)/rz;
    const dx=r.direction.x/rx,dy=r.direction.y/2.6,dz=r.direction.z/rz;
    const a=dx*dx+dy*dy+dz*dz,b=2*(ox*dx+oy*dy+oz*dz),c=ox*ox+oy*oy+oz*oz-1,d=b*b-4*a*c;
    if(d<0)return -1;const t=(-b-Math.sqrt(d))/(2*a);
    return r.origin.y+r.direction.y*t>=base?t:-1;
  }
  return {
    levels(x,z,out){for(const q of boxes)if(inside(q,x,z)){q.top.y=height(q,x,z);out.push(q.top);}},
    obstructed(x,z,feet){for(const q of boxes)if(inside(q,x,z)&&feet<height(q,x,z)-.01&&feet+1.8>q.bounds.min.y)return true;return false;},
    collides(x,feet,z){for(const q of boxes)if(inside(q,x,z)&&feet<height(q,x,z)-.01&&feet+1.8>q.bounds.min.y)return true;return false;},
    viewBlock(origin,dir,far){ray.origin.copy(origin);ray.direction.copy(dir);let best=Infinity;for(const q of boxes)if(ray.intersectBox(q.bounds,hit)){const t=hit.distanceTo(origin);if(t<far)best=Math.min(best,t);}return best;},
    pick(r){if(r.direction.y>=0)return null;let best=null;for(const q of boxes){const t=roofHit(q,r);if(t<0)continue;ray.origin.copy(r.origin);ray.direction.copy(r.direction);ray.at(t,hit);if(inside(q,hit.x,hit.z)&&(!best||t<best.t))best={t,point:hit.clone(),site:q.p.id};}return best;},
    spots(){return boxes.map(q=>({x:(q.bounds.min.x+q.bounds.max.x)/2,z:(q.bounds.min.z+q.bounds.max.z)/2}));},
  };
}
export function setup(app){return mountCampus(app);}
