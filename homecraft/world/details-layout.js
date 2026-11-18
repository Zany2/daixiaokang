// Shared positions keep markings and street furniture aligned.
export const PARKING=[-120,-102,-84,-66,-48,-30,42,60,78,102].map((z,i)=>({x:-153,z,occupied:i%3!==1,color:[0xd9ddd2,0x7e9b9f,0xb9aaa0][i%3]}));
export const BIKE_RACKS=[{x:-35,z:42,w:8.5,d:2.8},{x:40,z:84,w:8.5,d:2.8}];
export const PERGOLA={x:-71,z:33,w:10,d:5};
