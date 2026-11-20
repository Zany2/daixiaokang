import {fromReference} from './reference-layout.js';
const at=(u,v)=>fromReference(u,v);
// Furniture is anchored to the same north-up plan as paving and buildings.
export const PARKING=[190,247,310,370,432,490,562,622,710,778,846].map((v,i)=>({...at(87,v),occupied:i%3!==1,color:[0xd9ddd2,0x7e9b9f,0xb9aaa0][i%3]}));
export const BIKE_RACKS=[{...at(465,677),w:8.5,d:2.8},{...at(572,1048),w:8.5,d:2.8}];
export const PERGOLA={...at(190,575),w:10,d:5};
export const BENCHES=[[173,594],[291,570],[446,792],[994,906],[1092,864],[1270,726],[1233,958]].map(([u,v])=>at(u,v));
