import { BOUNDS } from './reference-layout.js';

// Search the enlarged campus at 2 m resolution, validating every edge against
// the engine's original 25 cm collision grid. Short and narrow routes retain
// the engine search; no shared-engine changes or raised search limits are needed.
export function connectCampusRoutes(nav) {
  const direct=nav.findPath.bind(nav),step=2,cols=Math.floor((BOUNDS.x1-BOUNDS.x0)/step),rows=Math.floor((BOUNDS.z1-BOUNDS.z0)/step),count=cols*rows;
  const state=new Uint8Array(count),edges=new Uint8Array(count);
  const point=k=>({x:BOUNDS.x0+(k%cols+.5)*step,z:BOUNDS.z0+(Math.floor(k/cols)+.5)*step});
  const valid=k=>{if(!state[k]){const p=point(k);state[k]=nav.canStand(p.x,p.z)?1:2;}return state[k]===1;};
  const clear=(a,b)=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.2);for(let i=0;i<=n;i++)if(!nav.canStand(a.x+(b.x-a.x)*i/Math.max(1,n),a.z+(b.z-a.z)*i/Math.max(1,n)))return false;return true;};
  function anchor(p) {
    const cx=Math.floor((p.x-BOUNDS.x0)/step),cz=Math.floor((p.z-BOUNDS.z0)/step),candidates=[];
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){const x=cx+dx,z=cz+dz;if(x<0||x>=cols||z<0||z>=rows)continue;const k=x+z*cols;if(valid(k)){const q=point(k);candidates.push({k,q,d:Math.hypot(q.x-p.x,q.z-p.z)});}}
    candidates.sort((a,b)=>a.d-b.d);return candidates.find(c=>clear(p,c.q))?.k;
  }
  const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  nav.findPath=(start,goal)=>{
    const end=nav.nearestStand(goal.x,goal.z);if(!end)return null;
    if(clear(start,end))return [end];
    if(Math.hypot(start.x-end.x,start.z-end.z)<45){const path=direct(start,end);if(path)return path;}
    const sk=anchor(start),gk=anchor(end);if(sk===undefined||gk===undefined)return direct(start,end);
    const scores=new Float32Array(count).fill(Infinity),parent=new Int32Array(count).fill(-1),closed=new Uint8Array(count),heap=[];
    const heuristic=k=>Math.hypot(k%cols-gk%cols,Math.floor(k/cols)-Math.floor(gk/cols));
    function push(k,f){let i=heap.length;heap.push({k,f});while(i){const j=(i-1)>>1;if(heap[j].f<=f)break;heap[i]=heap[j];i=j;}heap[i]={k,f};}
    function pop(){const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out.k;}
    scores[sk]=0;push(sk,heuristic(sk));
    while(heap.length) {
      const k=pop();if(closed[k])continue;if(k===gk){const route=[end];for(let n=k;n!==sk;n=parent[n])route.push(point(n));route.push(point(sk));route.reverse();const out=[];let at=start,i=0;while(i<route.length){let j=i+1;while(j<route.length&&clear(at,route[j]))j++;out.push(route[j-1]);at=route[j-1];i=j;}return out;}
      closed[k]=1;const x=k%cols,z=Math.floor(k/cols),a=point(k);
      for(let d=0;d<8;d++) {
        const [dx,dz]=directions[d],nx=x+dx,nz=z+dz;if(nx<0||nx>=cols||nz<0||nz>=rows)continue;
        const nk=nx+nz*cols;if(closed[nk]||!valid(nk))continue;
        // Cache only validated edges. Invalid candidates are inexpensive to reject.
        if(!(edges[k]&(1<<d))){if(!clear(a,point(nk)))continue;edges[k]|=1<<d;}
        const cost=scores[k]+(d<4?1:Math.SQRT2);if(cost>=scores[nk])continue;
        scores[nk]=cost;parent[nk]=k;push(nk,cost+heuristic(nk));
      }
    }
    return direct(start,end);
  };
}
