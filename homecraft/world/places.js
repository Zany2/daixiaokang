import {fromReference,distanceFromReference,polygon} from './reference-layout.js';

// Pixel footprints use the stitched north-up plan. Heights are approximate m.
// Stable ids connect geometry, navigation, cards and the owner's future stories.
const place=(id,name,en,region,u,v,pw,pd,h,style='cream',shape='teaching',extra={})=>{
 const {x,z}=fromReference(u,v),w=distanceFromReference(pw),d=distanceFromReference(pd);
 return {id,name,en,region,reference:[u,v],x,z,w,d,h,style,shape,at:[x,z+d/2+5],...extra};
};
const G='校门与广场',T='教学科研区',S='南侧建筑群',W='西侧科研区',D='学生生活区',F='运动与体育',E='东侧教学区';
export const PLACES=[
 place('south-gate','南门','South Gate',G,330,1224,26,6,5,'gate'),
 place('west-gate','西门','West Gate',G,99,671,6,26,5,'gate'),
 place('north-gate','北门','North Gate',G,614,35,26,6,5,'gate'),
 place('east-gate','东门','East Gate',G,904,337,6,26,5,'gate'),
 place('southeast-gate','东南门','Southeast Gate',G,1024,1212,26,6,5,'gate'),
 place('technology','国际交流中心','International Exchange Center',S,155,1130,124,174,34,'red','tower',{description:'位于校园西南侧的国际文化交流中心。位置参考百度地图，红砖高层及低层配楼参考校园示意图。'}),
 place('science','科学楼','Science Building',T,327,1023,167,64,18,'cream','science'),
 place('information','信息楼','Information Building',T,214,461,169,99,21,'cream','courtyard'),
 place('third-office','第三办公楼','No. 3 Office Building',S,327,1133,174,76,34,'red','tower'),
 place('third-teaching','第三教学楼','No. 3 Teaching Building',T,510,640,196,56,23,'cream','bar'),
 place('rixin-square','日新广场','Rixin Square',G,325,1192,145,32,0,'square'),
 place('library','逸夫图书馆','Yifu Library',T,330,752,110,252,22,'library','library'),
 place('yifu','图书馆西侧楼','Library West Side Building',T,185,705,108,59,15,'gray','bar',{description:'逸夫图书馆西侧建筑区域。体量按百度截图定位，具体名称与用途待进一步核对。'}),
 place('management','经管楼','Management Building',T,164,953,110,76,18,'cream','courtyard'),
 place('applied-science','数理楼','Applied Sciences',T,420,439,132,75,23,'cream','courtyard'),
 place('materials','材料楼','Materials Science',T,423,235,170,79,21,'cream','courtyard'),
 place('first-teaching','第一教学楼','No. 1 Teaching Building',T,221,235,174,79,21,'cream','courtyard'),
 place('second-teaching','第二教学楼','No. 2 Teaching Building',T,655,212,188,60,18,'cream','bar'),
 place('administration','行政楼','Administration',T,563,325,65,76,21,'cream','administration'),
 place('auditorium','礼堂','Auditorium',T,496,495,191,27,11,'hall','hall'),
 place('sishi-square','实事广场','Shishi Square',G,527,254,30,42,0,'square'),
 place('boyue-square','博阅广场','Boyue Square',G,435,542,48,29,0,'square'),
 place('water-environment','水环楼','Water & Environmental Science',W,-82,379,111,65,19,'cream','bar',{inferred:true}),
 place('civil-west','建工西楼','Civil Engineering West',W,-63,455,148,56,24,'cream','courtyard',{inferred:true}),
 place('foundation','基础楼','Foundation Building',W,-72,294,128,74,30,'cream','tower',{inferred:true}),
 place('mechanical','机电楼','Mechanical Engineering',W,-67,208,139,61,21,'cream','bar',{inferred:true}),
 place('international','留学生公寓','International Students Residence',W,-59,122,143,60,24,'cream','residence',{inferred:true}),
 place('student-1','1号公寓','Student Residence 01',D,223,67,171,39,20,'cream','residence'),
 place('student-2','2号公寓','Student Residence 02',D,388,67,100,42,21,'cream','residence'),
 place('student-service','学生服务楼','Student Service Center',D,387,131,100,61,18,'cream','courtyard'),
 place('student-3','3号公寓','Student Residence 03',D,508,67,102,44,21,'cream','residence'),
 place('student-4','4号公寓','Student Residence 04',D,508,137,102,62,19,'cream','residence'),
 place('hospital','校医院','Campus Hospital',D,638,95,135,80,15,'cream','courtyard'),
 place('student-11','11号公寓','Student Residence 11',D,854,398,128,54,22,'gray','residence'),
 place('student-13','13号公寓','Student Residence 13',D,816,303,96,44,21,'gray','residence'),
 place('student-14','14号公寓','Student Residence 14',D,856,487,129,43,22,'red','residence'),
 place('student-9','9号公寓','Student Residence 09',D,451,717,89,64,20,'cream','residence'),
 place('student-8','8号公寓','Student Residence 08',D,561,715,108,49,20,'gray','residence'),
 place('student-7','7号公寓','Student Residence 07',D,560,775,108,42,19,'gray','residence'),
 place('student-12','12号公寓','Student Residence 12',D,560,825,108,42,20,'cream','residence'),
 place('student-6','6号公寓','Student Residence 06',D,514,1010,90,82,20,'cream','residence'),
 place('dining','风味餐厅','Campus Dining',D,504,875,198,40,9,'hall','hall'),
 place('north-ground','北田径场','North Sports Ground',F,701,379,132,250,0,'field','field',{icon:'court'}),
 place('south-ground','南田径场','South Sports Ground',F,748,751,143,238,0,'field','field',{icon:'court'}),
 place('olympic','奥林匹克体育馆','Olympic Sports Center',F,817,1100,236,165,19,'stadium','stadium',{icon:'court'}),
 place('olympic-memorial','奥运会纪念馆','Olympic Memorial Hall',F,1046,1116,55,60,8,'stadium','stadium',{icon:'court'}),
 place('olympic-square','奥运广场','Olympic Square',G,817,1213,225,26,0,'square'),
 place('tennis','网球场','Tennis Courts',F,840,785,42,134,0,'court','court',{icon:'court'}),
 place('basketball','北篮球场','North Basketball Courts',F,701,587,125,61,0,'court','court',{icon:'court'}),
 place('art','视觉艺术馆','Visual Arts Museum',E,923,569,160,39,12,'hall','bar'),
 place('fourth-teaching','第四教学楼','No. 4 Teaching Building',E,1021,653,264,116,25,'red','teaching-court'),
 place('art-building','艺术楼','Art Building',E,982,760,128,70,25,'red','bar'),
 place('energy','能源楼','Energy Building',E,1114,772,124,57,28,'red','research'),
 place('urban','城市建设楼','Urban Construction',S,465,1144,58,79,27,'red','bar'),
 place('computing','计算机楼','Computer Science',T,184,804,112,86,24,'red','courtyard',{description:'按百度截图中计算机学院的位置放置于逸夫图书馆西侧；建筑立面颜色参考原校园示意图。'}),
 place('engineering','实训楼','Engineering Training',E,1112,1020,120,84,22,'red','courtyard'),
 place('student-5','5号公寓','Student Residence 05',D,514,948,91,28,20,'cream','residence'),
 place('student-10','10号公寓','Student Residence 10',D,600,995,35,144,20,'gray','residence'),
 place('swimming','游泳馆','Swimming Hall',F,561,418,65,72,12,'hall','hall',{icon:'court'}),
 place('table-tennis','乒乓球馆','Table Tennis Hall',F,640,749,22,155,9,'hall','bar',{icon:'court'}),
 place('basketball-south','南篮球场','South Basketball Courts',F,778,946,228,65,0,'court','court',{icon:'court'}),
 place('moon-lake','月亮湖','Moon Lake','花园与绿地',1052,878,65,76,0,'water','water',{description:'南操场东侧、软件学院西北侧的小湖。水岸形状、周边绿地和园路参考百度截图。'}),
 place('software','软件学院','Software School',E,1150,904,115,45,23,'red','bar'),
 place('archives','档案馆','University Archives',S,555,1145,101,78,15,'cream','courtyard'),
];
for(const p of PLACES){
 if(p.style==='gate')p.at=p.w<p.d?[p.x+(p.id==='east-gate'?-10:10),p.z]:[p.x,p.z+(p.id==='north-gate'?10:-10)];
 if(p.style==='square')p.at=[p.x,p.z];
 if(p.style==='field')p.at=[p.x-p.w/2-6,p.z];
 if(p.style==='water'){const q=fromReference(1006,900);p.at=[q.x,q.z];}
 if(p.inferred)p.description='位于西大望路另一侧，位置及体量参考校园示意图，部分楼体轮廓结合公开地图核对；布局与高度仍为近似值。';
}
export const BUILDINGS=PLACES.filter(p=>p.h>0&&p.style!=='gate');
export const FIELDS=PLACES.filter(p=>['field','court'].includes(p.style));
const road=(name,width,points,primary=false)=>({name,width,points:polygon(points),primary});
export const ROADS=[
 road('西大望路',17,[[64,12],[62,514],[56,899],[53,1205],[70,1243]],true),
 road('北工大路',14,[[64,19],[749,19],[794,135],[867,249],[979,401],[1035,466],[1100,523],[1424,526]],true),
 road('双龙路',15,[[70,1243],[1008,1243],[1095,1209]],true),
 road('东侧沿线',14,[[1095,1209],[1183,1100],[1268,973],[1344,821],[1400,653],[1418,543]],true),
 road('校内西路',4.5,[[111,48],[108,401],[101,522],[100,670],[91,899],[81,1080],[81,1213]]),
 road('思源路',5.5,[[131,180],[756,174]]),
 road('学子路',5,[[328,53],[328,393],[333,515],[329,596]]),
 road('教学区横路',4,[[133,286],[613,281]]),
 road('樱花路',5,[[108,399],[508,392]]),
 road('北操场西路',5,[[614,252],[614,509]]),
 road('中轴路',7,[[102,525],[337,525],[623,518],[786,520],[979,520]]),
 road('科学楼西路',4.5,[[254,533],[255,891]]),
 road('科学楼东路',5,[[395,531],[395,902],[423,914],[423,1080],[423,1191]]),
 road('求实路',5,[[625,538],[625,1195]]),
 road('日新路',7,[[92,907],[397,905],[625,900],[746,895],[910,860]]),
 road('博雅路',5,[[639,1001],[940,982],[1090,937],[1215,937]]),
 road('科学楼南路',4,[[226,1087],[620,1087]]),
 road('东区路',5,[[790,529],[843,657],[898,797],[971,978],[1022,1196]]),
 road('东侧园路',4.5,[[979,537],[1203,537],[1205,788],[1238,871],[1230,997],[1165,1128],[1040,1208]]),
 road('南门路',6,[[330,1177],[330,1241]]),
 road('西区科研路',5,[[19,91],[19,482]]),
];
export const LAWNS=[
 [172,576,76,64],[287,570,38,62],[212,340,113,67],[407,572,27,61],
 [461,571,40,59],[517,570,37,61],[573,571,45,60],
 [447,788,90,61],[443,671,80,12],[322,962,128,47],
 [323,1066,134,19],[325,1196,141,15],[1035,963,79,49],
 [1283,607,82,69],[1301,735,62,68],[1247,962,45,54],
 [-83,348,109,11],[-76,161,110,12],
].map(([u,v,w,d])=>{const p=fromReference(u,v);return[p.x,p.z,distanceFromReference(w),distanceFromReference(d)];});
