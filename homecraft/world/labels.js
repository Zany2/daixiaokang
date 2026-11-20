import * as THREE from 'three';

// One adaptive atlas and one draw call. Screen-space selection avoids label
// collisions; all places remain available through the searchable directory.
export function buildLabels(places) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=THREE.MathUtils.ceilPowerOfTwo(Math.ceil(places.length/4)*64);
  const rows=canvas.height/64,ctx=canvas.getContext('2d'),positions=[],centers=[],uvs=[],indices=[];
  const visible=new Float32Array(places.length*4),projected=new THREE.Vector3();
  const priority=['library','olympic','north-ground','south-ground','first-teaching','third-teaching','fourth-teaching','technology','south-gate'];
  const labels=places.map((p,i)=>({p,i,x:0,y:0,w:0,h:0,shown:false,rank:priority.includes(p.id)?priority.indexOf(p.id):100+i})).sort((a,b)=>a.rank-b.rank);
  ctx.textAlign='center';ctx.textBaseline='middle';
  places.forEach((p,i)=>{
    const col=i%4,row=Math.floor(i/4),x=col*256,y=row*64;
    ctx.fillStyle='rgba(242,242,227,.94)';ctx.fillRect(x+8,y+8,240,47);
    ctx.fillStyle=p.style==='red'?'#935344':'#345e60';ctx.fillRect(x+8,y+8,4,47);
    ctx.font=`600 ${p.name.length>8?26:32}px "Microsoft YaHei",sans-serif`;ctx.fillText(p.name,x+130,y+31,226);
    const base=i*4;
    for(const[a,b]of[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){
      positions.push(a,b,0);centers.push(p.x,Math.max(2,p.h+4),p.z);
    }
    const u=col/4,v=1-row/rows;
    uvs.push(u,v-1/rows,u+.25,v-1/rows,u+.25,v,u,v);indices.push(base,base+1,base+2,base,base+2,base+3);
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('labelCenter',new THREE.Float32BufferAttribute(centers,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  const visibility=new THREE.BufferAttribute(visible,1),sizes=new THREE.BufferAttribute(new Float32Array(places.length*8),2);geometry.setAttribute('labelVisible',visibility);geometry.setAttribute('labelSize',sizes);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.ShaderMaterial({uniforms:{atlas:{value:texture},viewport:{value:new THREE.Vector2(1,1)}},transparent:true,depthWrite:false,
    vertexShader:'attribute vec3 labelCenter; attribute float labelVisible; attribute vec2 labelSize; uniform vec2 viewport; varying vec2 vUv; varying float vVisible; void main(){vUv=uv;vVisible=labelVisible;vec4 clip=projectionMatrix*modelViewMatrix*vec4(labelCenter,1.);clip.xy+=position.xy*labelSize*2./viewport*clip.w;gl_Position=clip;}',
    fragmentShader:'uniform sampler2D atlas; varying vec2 vUv; varying float vVisible; void main(){vec4 c=texture2D(atlas,vUv);if(c.a<.1||vVisible<.5)discard;gl_FragColor=c;}' });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='campus-place-labels';mesh.frustumCulled=false;mesh.renderOrder=4;
  mesh.userData.layout=labels;
  mesh.userData.update=(camera,width,height)=>{
    if(!mesh.visible)return;
    const compact=width<700,h=compact?28:32;
    material.uniforms.viewport.value.set(width,height);visible.fill(0);
    for(const label of labels)label.shown=false;
    for(const label of labels){
      const p=label.p;projected.set(p.x,Math.max(2,p.h+4),p.z).project(camera);
      if(projected.z< -1||projected.z>1)continue;
      const distance=camera.position.distanceToSquared(projected.set(p.x,p.h+4,p.z));
      if(label.rank>=100&&distance>260*260)continue;
      projected.project(camera);label.x=(projected.x+1)*width/2;label.y=(1-projected.y)*height/2;label.w=Math.max(58,p.name.length*(compact?10:11)+18);label.h=h;
      if(label.x<label.w/2+8||label.x>width-label.w/2-8||label.y<120||label.y>height-(compact?245:165))continue;
      let overlap=false;
      for(const other of labels)if(other.shown&&Math.abs(label.x-other.x)<(label.w+other.w)/2+7&&Math.abs(label.y-other.y)<h+5){overlap=true;break;}
      if(overlap)continue;
      label.shown=true;
      for(let j=0;j<4;j++){visible[label.i*4+j]=1;sizes.setXY(label.i*4+j,label.w,h);}
    }
    visibility.needsUpdate=true;sizes.needsUpdate=true;
  };
  return mesh;
}
