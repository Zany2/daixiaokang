import {fromReference} from './reference-layout.js';

const place=(id,name,en,region,u,v,w,d,h,style='cream',extra={})=>{
  const {x,z}=fromReference(u,v);
  return {id,name,en,region,reference:[u,v],x,z,w,d,h,style,at:[x,z+d/2+5],...extra};
};
export const PLACES=[
  place('south-gate','南门','South Gate','校门与广场',330,807,18,4,5,'gate'),
  place('west-gate','西门','West Gate','校门与广场',648,506,4,18,5,'gate'),
  place('north-gate','北门','North Gate','校门与广场',1331,479,18,4,5,'gate'),
  place('east-gate','东门','East Gate','校门与广场',1379,637,4,18,5,'gate'),
  place('southeast-gate','东南门','Southeast Gate','校门与广场',835,1061,18,4,5,'gate'),
  place('technology','北工大科技园','Science & Technology Park','南侧建筑群',248,735,32,24,34,'red'),
  place('science','科学楼','Science Building','教学科研区',331,684,18,14,15),
  place('information','信息楼','Information Building','教学科研区',477,602,24,16,19),
  place('third-office','第三办公楼','No. 3 Office Building','南侧建筑群',421,729,32,20,34,'red'),
  place('third-teaching','第三教学楼','No. 3 Teaching Building','南侧建筑群',492,853,36,20,22,'red'),
  place('rixin-square','日新广场','Rixin Square','校门与广场',369,762,30,20,0,'square'),
  place('library','图书馆','Library','教学科研区',638,640,40,40,18,'library'),
  place('yifu','逸夫图书馆','Yifu Library','教学科研区',557,613,19,20,12,'gray'),
  place('management','经管楼','Management Building','教学科研区',407,655,20,16,15),
  place('applied-science','数理楼','Applied Sciences','教学科研区',875,578,34,22,22),
  place('materials','材料楼','Materials Science','教学科研区',749,547,34,24,18),
  place('first-teaching','第一教学楼','No. 1 Teaching Building','教学科研区',927,463,40,16,19),
  place('second-teaching','第二教学楼','No. 2 Teaching Building','教学科研区',853,420,24,14,14),
  place('administration','行政楼','Administration','教学科研区',1035,555,30,24,18),
  place('auditorium','礼堂','Auditorium','教学科研区',999,649,32,22,10,'hall'),
  place('sishi-square','实事广场','Shishi Square','校门与广场',1072,501,26,20,0,'square'),
  place('boyue-square','博阅广场','Boyue Square','校门与广场',924,627,20,15,0,'square'),
  place('water-environment','水环楼','Water & Environmental Science','西侧科研区',589,393,24,22,17),
  place('civil-west','建工西楼','Civil Engineering West','西侧科研区',620,439,24,30,22),
  place('foundation','基础楼','Foundation Building','西侧科研区',679,375,28,22,28),
  place('mechanical','机电楼','Mechanical Engineering','西侧科研区',757,323,30,20,19),
  place('international','留学生公寓','International Students Residence','西侧科研区',820,277,32,18,21),
  place('student-1','1号公寓','Student Residence 01','学生生活区',952,401,28,14,16),
  place('student-2','2号公寓','Student Residence 02','学生生活区',1020,427,24,14,18),
  place('student-service','学生服务楼','Student Service Center','学生生活区',1117,460,28,18,15),
  place('student-3','3号公寓','Student Residence 03','学生生活区',1195,490,32,15,19),
  place('student-4','4号公寓','Student Residence 04','学生生活区',1179,523,32,15,17),
  place('hospital','校医院','Campus Hospital','学生生活区',1354,568,22,18,14),
  place('student-11','11号公寓','Student Residence 11','学生生活区',1215,590,46,18,20,'gray'),
  place('student-13','13号公寓','Student Residence 13','学生生活区',1340,628,18,22,19,'gray'),
  place('student-14','14号公寓','Student Residence 14','学生生活区',1320,698,18,26,20,'red'),
  place('student-9','9号公寓','Student Residence 09','学生生活区',702,708,28,16,18),
  place('student-8','8号公寓','Student Residence 08','学生生活区',811,703,38,12,18,'gray'),
  place('student-7','7号公寓','Student Residence 07','学生生活区',857,676,38,12,17,'gray'),
  place('student-12','12号公寓','Student Residence 12','学生生活区',757,751,28,16,18),
  place('student-6','6号公寓','Student Residence 06','学生生活区',649,783,32,16,18),
  place('dining','风味餐厅','Campus Dining','学生生活区',599,736,16,12,8,'hall'),
  place('north-ground','北田径场','North Sports Ground','运动与体育',1155,672,42,82,0,'field',{icon:'court'}),
  place('south-ground','南田径场','South Sports Ground','运动与体育',913,817,42,82,0,'field',{icon:'court'}),
  place('olympic','奥林匹克体育馆','Olympic Sports Center','运动与体育',713,955,52,28,14,'stadium',{icon:'court'}),
  place('olympic-memorial','奥运会纪念馆','Olympic Memorial Hall','运动与体育',843,996,22,12,6,'stadium',{icon:'court'}),
  place('olympic-square','奥运广场','Olympic Square','校门与广场',719,1029,28,16,0,'square'),
  place('tennis','网球场','Tennis Courts','运动与体育',981,860,18,66,0,'court',{icon:'court'}),
  place('basketball','篮球场','Basketball Courts','运动与体育',1040,740,42,28,0,'court',{icon:'court'}),
  place('art','视觉艺术馆','Visual Arts Museum','南侧建筑群',1090,784,16,14,9,'hall'),
  place('fourth-teaching','第四教学楼','No. 4 Teaching Building','南侧建筑群',1200,825,42,24,24,'red'),
  place('art-building','艺术楼','Art Building','南侧建筑群',1082,901,28,20,26,'red'),
  place('energy','能源楼','Energy Building','南侧建筑群',1195,921,34,24,29,'red'),
  place('urban','城市建设楼','Urban Construction','南侧建筑群',942,1006,28,20,26,'red'),
  place('computing','计算机楼','Computer Science','南侧建筑群',1030,990,32,18,26,'red'),
  place('engineering','实训楼','Engineering Training','南侧建筑群',1155,1010,40,20,20,'red'),
];
// Entrances are deliberately on the campus side of boundary gates.
for(const p of PLACES){if(p.style==='gate'){p.at=p.w<p.d?[p.x+8,p.z]:[p.x,p.z+(p.id==='north-gate'?8:-8)];}if(p.style==='square')p.at=[p.x,p.z];if(p.style==='field')p.at=[p.x-p.w/2-5,p.z];}
export const BUILDINGS=PLACES.filter(p=>p.h>0&&p.style!=='gate');
export const FIELDS=PLACES.filter(p=>['field','court'].includes(p.style));
const road=(name,width,points,primary=false)=>({name,width,points,primary});
const ref=(u,v)=>{const p=fromReference(u,v);return[p.x,p.z];};
export const ROADS=[
  road('西大望路',12,[[-145,235.25],[-145,-172.75]],true),
  road('北工大路',12,[[-145,-172.75],ref(1465,545)],true),
  road('东路',10,[ref(1465,545),[174,-71.25],ref(1310,795)],true),
  road('东南路',10,[ref(1310,795),ref(1570,985),ref(1430,1048),ref(850,1092)],true),
  road('南路',12,[[-145,235.25],ref(850,1092)],true),
  road('樱花路',6,[[-110,20],[50,2],[115.5,2]]),
  road('求真路',5.5,[[-100,-113],[-100,24]]),
  road('求实路',8,[[-48,226],[-48,107]]),
  road('博学路',8,[[47,30],[47,218]]),
  road('博雅路',8,[[47,185],[150,185],[150,224],[199,232]]),
  road('奥运路',6,[[126,-96],[118,-85],[118,-5],[145,8],[148,44],[154,143],[156,160]]),
  road('体育场路',8,[[48,44],[115,44]]),
];
export const LAWNS=[
  [-204,-111,12,120],[-162,-145,20,56],[-168,-66,15,20],
  [-79.25,1,14,13],[-73,32,48,24],[-47,-49,42,22],[-111,-40,12,44],[-93,113,30,20],
  [-91,197,20,30],[-27,179,18,34],[7,165,45,20],[11,111,40,12],
  [-8,-104,26,18],[27,-69,28,22],[53,-43,20,24],[29,-108,20,22],
  [74,151,32,34],[189,119,22,28],[290,86,52,74],[301,31,40,36],
];
