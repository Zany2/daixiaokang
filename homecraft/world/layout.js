import { PLACES, BUILDINGS, FIELDS, ROADS, LAWNS } from './places.js';
import { BOUNDS } from './reference-layout.js';

export { PLACES, BUILDINGS, FIELDS, ROADS, LAWNS };
export const ISLAND = BOUNDS;
const gate=PLACES.find(p=>p.id==='south-gate');
export const SPAWN = { x: gate.at[0], z: gate.at[1], heading: Math.PI };
export const INTRO = { pos: [520,860,1000], portrait: [375,1740,1710], look: [0,0,55] };
export const LIGHT_VOLUME = { min: [BOUNDS.x0,-1,BOUNDS.z0], extent: [BOUNDS.x1-BOUNDS.x0,48,BOUNDS.z1-BOUNDS.z0], size: [124,8,96] };
export const STATIONS = [
  { id:'overview', name:'校园全景', en:'Campus overview', icon:'map', at:[SPAWN.x,SPAWN.z-8], look:[0,0], show:[INTRO.pos,INTRO.look], showPortrait:[INTRO.portrait,INTRO.look] },
  ...PLACES.map(p=>{
    const distance=Math.max(30,Math.max(p.w,p.d)*1.25),height=Math.max(16,p.h||0);
    return {id:p.id,name:p.name,en:p.en,icon:p.icon||'map',at:p.at,look:p.look||[p.x,p.z],
      show:[[p.x+distance*.65,height+distance*.7,p.z+distance],[p.x,height*.3,p.z]],
      showPortrait:[[p.x+distance*1.1,height+distance*1.3,p.z+distance*1.7],[p.x,height*.3,p.z]]};
  }),
];
