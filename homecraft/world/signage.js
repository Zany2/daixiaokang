import * as THREE from 'three';

// Repeated wayfinding posts and facade plaques reuse the same adaptive atlas cells.
export function buildSigns(places,signs) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=THREE.MathUtils.ceilPowerOfTwo(Math.ceil(places.length/4)*64);
  const rows=canvas.height/64,ctx=canvas.getContext('2d'),index=new Map(),vertices=[],uvs=[],indices=[];
  places.forEach((p,i)=>{
    index.set(p.id,i);const x=i%4*256,y=Math.floor(i/4)*64;
    ctx.fillStyle='#386b64';ctx.fillRect(x,y,256,64);
    ctx.fillStyle='#ece9d5';ctx.fillRect(x+7,y+8,3,48);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${p.style==='gate'?19:25}px "Microsoft YaHei",sans-serif`;
    ctx.fillText(p.style==='gate'?`北京工业大学 · ${p.name}`:p.name,x+132,y+32,229);
  });
  for(const sign of signs) {
    const i=index.get(sign.id);if(i===undefined)continue;
    const base=vertices.length/3,c=Math.cos(sign.ry||0),s=Math.sin(sign.ry||0);
    for(const [x,y]of[[-sign.w/2,-sign.h/2],[sign.w/2,-sign.h/2],[sign.w/2,sign.h/2],[-sign.w/2,sign.h/2]])vertices.push(sign.x+x*c,sign.y+y,sign.z-x*s);
    const u=i%4/4,v=1-Math.floor(i/4)/rows;
    uvs.push(u,v-1/rows,u+.25,v-1/rows,u+.25,v,u,v);indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({map:texture,polygonOffset:true,polygonOffsetFactor:-1}));
  mesh.name='campus-facade-signs';return mesh;
}
