// Approximate inverse of the diagram's oblique ground projection, in pixels.
// Anchors are ground-contact estimates, not roof-label positions or survey data.
export function fromReference(u,v) {
  return {x:Math.round(((u-900)/4+(v-630)/2)*4)/4,z:Math.round(((v-630)/2-(u-900)/4)*4)/4};
}
export const BOUNDS={x0:-224,x1:352,z0:-196,z1:264};
const polygon=points=>points.map(([u,v])=>{const p=fromReference(u,v);return[p.x,p.z];});
export const CAMPUS_OUTLINE=polygon([[166,738],[983,326],[1465,545],[1378,690],[1310,795],[1490,912],[1610,985],[1435,1054],[862,1105]]);
export const WEST_PARCEL=polygon([[487,405],[806,225],[940,300],[622,466]]);
export const COURT_COLUMNS={basketball:2,tennis:1};
export const COURT_ROWS={basketball:1,tennis:3};
export const roadPoints=r=>r.points||[[r.x-r.w/2,r.z],[r.x+r.w/2,r.z]];
export function segmentOverlapsBox(a,b,box,pad=0) {
  const lo=[box.x-box.w/2-pad,box.z-box.d/2-pad],hi=[box.x+box.w/2+pad,box.z+box.d/2+pad];
  let t0=0,t1=1;
  for(let k=0;k<2;k++) {
    const d=b[k]-a[k];if(Math.abs(d)<1e-8){if(a[k]<=lo[k]||a[k]>=hi[k])return false;continue;}
    let u=(lo[k]-a[k])/d,v=(hi[k]-a[k])/d;if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>=t1)return false;
  }
  return true;
}
export function roadOverlapsBox(r,box,pad=0) {
  const points=roadPoints(r);for(let i=1;i<points.length;i++)if(segmentOverlapsBox(points[i-1],points[i],box,(r.width||r.d)/2+pad))return true;return false;
}
export function sampleRoad(r,spacing,offset=0) {
  const points=roadPoints(r),out=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.max(1,Math.floor(length/spacing));
    for(let j=0;j<n;j++){const t=(j+.5)/n;out.push([a[0]+dx*t-dz/length*offset,a[1]+dz*t+dx/length*offset]);}
  }
  return out;
}
