// North-up tracing of the owner-supplied Baidu screenshots. Image 2 aligns at
// (-62, 451) in image 1's pixel coordinates. The 50 m bar measures about 68 px.
export const REFERENCE={metersPerPixel:50/68,origin:[650,650],southOffset:[-62,451]};
const snap=n=>Math.round(n*4)/4;
export function fromReference(u,v){return {x:snap((u-REFERENCE.origin[0])*REFERENCE.metersPerPixel),z:snap((v-REFERENCE.origin[1])*REFERENCE.metersPerPixel)};}
export const distanceFromReference=n=>snap(n*REFERENCE.metersPerPixel);
export const polygon=points=>points.map(([u,v])=>{const p=fromReference(u,v);return[p.x,p.z];});
export const BOUNDS={x0:-600,x1:640,z0:-480,z1:480};
export const CAMPUS_OUTLINE=polygon([[122,36],[729,36],[783,146],[856,259],[964,414],[1024,509],[1207,548],[1215,792],[1241,875],[1190,1002],[1117,1130],[1025,1215],[880,1230],[120,1230],[82,1205],[94,683],[105,404]]);
// Only the oblique diagram covers this parcel across Xidawang Road.
export const WEST_PARCEL=polygon([[-147,77],[35,77],[32,489],[-147,489]]);
export const LANDSCAPE_PATCHES=[
 polygon([[128,536],[306,536],[306,613],[259,613],[256,650],[130,650]]),
 polygon([[145,301],[307,301],[307,386],[153,386]]),
 polygon([[258,920],[403,920],[403,991],[258,991]]),
 polygon([[921,819],[1007,812],[1115,827],[1177,812],[1228,874],[1185,989],[1112,1055],[1083,974],[969,994]]),
 polygon([[1240,564],[1382,560],[1375,670],[1341,797],[1288,929],[1197,1078],[1082,1181],[1131,1080],[1223,936],[1265,871],[1224,791]]),
 polygon([[1014,1060],[1106,1085],[1070,1152],[1014,1190]]),
];
export const LAKE_OUTLINE=polygon([[1032,844],[1050,839],[1072,850],[1082,868],[1076,894],[1062,911],[1041,914],[1025,904],[1037,892],[1045,873],[1037,859]]);
export const PARK_PATHS=[
 polygon([[1254,586],[1312,628],[1341,684],[1304,749],[1306,808],[1264,860],[1280,914],[1230,999],[1162,1085],[1083,1167]]),
 polygon([[1234,683],[1283,677],[1338,684]]),polygon([[1180,809],[1218,840],[1264,860]]),
 polygon([[942,829],[972,901],[1018,923],[1058,931],[1095,915],[1129,835]]),
 polygon([[959,883],[1008,882]]),polygon([[1090,939],[1095,1000],[1142,1046]]),
 polygon([[668,1060],[710,1028],[810,1007],[919,1025],[959,1090],[922,1152],[823,1188],[718,1172],[664,1128],[668,1060]]),
];
export const CROSSINGS=polygon([[104,671],[395,905],[625,905],[625,521],[929,982]]);
export function pointInPolygon(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export const COURT_COLUMNS={basketball:6,'basketball-south':5,tennis:2};
export const COURT_ROWS={basketball:1,'basketball-south':1,tennis:3};
export function courtCells(f) {
 const cols=COURT_COLUMNS[f.id],rows=COURT_ROWS[f.id],cw=f.w/cols,cd=f.d/rows,cells=[];
 for(let ix=0;ix<cols;ix++)for(let iz=0;iz<rows;iz++)cells.push({x:f.x-f.w/2+(ix+.5)*cw,z:f.z-f.d/2+(iz+.5)*cd,w:Math.min(f.id==='tennis'?10.97:15,cw-1.5),d:Math.min(f.id==='tennis'?23.77:28,cd-3)});
 return cells;
}
export const footballPitch=f=>({length:f.d*.58,width:f.w*.68});
export const roadPoints=r=>r.points||[[r.x-r.w/2,r.z],[r.x+r.w/2,r.z]];
export function segmentOverlapsBox(a,b,box,pad=0){
 const lo=[box.x-box.w/2-pad,box.z-box.d/2-pad],hi=[box.x+box.w/2+pad,box.z+box.d/2+pad];let t0=0,t1=1;
 for(let k=0;k<2;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-8){if(a[k]<=lo[k]||a[k]>=hi[k])return false;continue;}let u=(lo[k]-a[k])/d,v=(hi[k]-a[k])/d;if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>=t1)return false;}return true;
}
export function roadOverlapsBox(r,box,pad=0){const points=roadPoints(r);for(let i=1;i<points.length;i++)if(segmentOverlapsBox(points[i-1],points[i],box,(r.width||r.d)/2+pad))return true;return false;}
export function sampleRoad(r,spacing,offset=0){const points=roadPoints(r),out=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.max(1,Math.floor(length/spacing));for(let j=0;j<n;j++){const t=(j+.5)/n;out.push([a[0]+dx*t-dz/length*offset,a[1]+dz*t+dx/length*offset]);}}return out;}
