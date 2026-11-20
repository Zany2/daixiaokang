// The main hall's long roof axis follows the northeast/southwest diagonal in
// the plan. Its rotated ellipse remains inside the place's shared outer bounds.
const profiles=new WeakMap();
export function stadiumProfile(p){
  let shape=profiles.get(p);if(shape)return shape;
  const yaw=p.id==='olympic'?.48:0,c=Math.cos(yaw),s=Math.sin(yaw),a=(p.w/2)**2,b=(p.d/2)**2,k=c*c-s*s;
  shape={yaw,c,s,rx:Math.sqrt((a*c*c-b*s*s)/k),rz:Math.sqrt((b*c*c-a*s*s)/k)};
  profiles.set(p,shape);return shape;
}
export function stadiumRadiusSquared(p,x,z){
  const q=stadiumProfile(p),dx=x-p.x,dz=z-p.z;
  return ((dx*q.c-dz*q.s)/q.rx)**2+((dx*q.s+dz*q.c)/q.rz)**2;
}

// Camera rays must meet the actual rotated body or upper dome, rather than
// the empty corners of its outer rectangle. All temporaries are scalar values.
export function stadiumRayDistance(p,ray){
  const q=stadiumProfile(p),px=ray.origin.x-p.x,pz=ray.origin.z-p.z,base=p.h-2.1;
  const ox=(px*q.c-pz*q.s)/q.rx,oz=(px*q.s+pz*q.c)/q.rz,oy=ray.origin.y;
  const dx=(ray.direction.x*q.c-ray.direction.z*q.s)/q.rx,dz=(ray.direction.x*q.s+ray.direction.z*q.c)/q.rz,dy=ray.direction.y;
  const radius=ox*ox+oz*oz,ey=(oy-base)/2.6,edy=dy/2.6;
  if(oy>=0&&(oy<=base?radius<=1:radius+ey*ey<=1))return 0;
  let best=Infinity;
  const a=dx*dx+dz*dz,b=2*(ox*dx+oz*dz),c=radius-1,d=b*b-4*a*c;
  if(a>1e-14&&d>=0)for(let sign=-1;sign<=1;sign+=2){
    const t=(-b+sign*Math.sqrt(d))/(2*a),y=oy+dy*t;
    if(t>=0&&y>=0&&y<=base)best=Math.min(best,t);
  }
  const da=a+edy*edy,db=b+2*ey*edy,dc=c+ey*ey,dd=db*db-4*da*dc;
  if(da>1e-14&&dd>=0)for(let sign=-1;sign<=1;sign+=2){
    const t=(-db+sign*Math.sqrt(dd))/(2*da);
    if(t>=0&&oy+dy*t>=base)best=Math.min(best,t);
  }
  if(Math.abs(dy)>1e-14){
    const t=-oy/dy;
    if(t>=0&&(ox+dx*t)**2+(oz+dz*t)**2<=1)best=Math.min(best,t);
  }
  return best;
}
