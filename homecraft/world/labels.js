import * as THREE from 'three';

// All billboard labels share one atlas and one draw call.
export function buildLabels(places) {
  const compact=innerWidth<700;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d'),positions=[],centers=[],uvs=[],indices=[],priorities=[];
  ctx.textAlign='center';ctx.textBaseline='middle';
  places.forEach((p,i)=>{
    const col=i%4,row=Math.floor(i/4),x=col*256,y=row*64;
    ctx.fillStyle='rgba(242,242,227,.94)';ctx.fillRect(x+8,y+8,240,47);
    ctx.fillStyle=p.style==='red'?'#935344':'#345e60';ctx.fillRect(x+8,y+8,4,47);
    ctx.font=`600 ${p.name.length>8?20:24}px "Microsoft YaHei",sans-serif`;
    ctx.fillText(p.name,x+130,y+31,226);
    const w=Math.max(7,p.name.length*1.05),h=2.2,base=i*4;
    for(const[a,b]of[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]){
      positions.push(a,b,0);centers.push(p.x,Math.max(2,p.h+3.4),p.z);
      const major=['library','olympic','technology','north-ground','south-ground','student-9'].includes(p.id);
      priorities.push(major||(!compact&&['first-teaching','student-service','international','south-gate'].includes(p.id))?1:0);
    }
    const u=col/4,v=1-row/16;
    uvs.push(u,v-1/16,u+1/4,v-1/16,u+1/4,v,u,v);
    indices.push(base,base+1,base+2,base,base+2,base+3);
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('labelCenter',new THREE.Float32BufferAttribute(centers,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.setAttribute('labelPriority',new THREE.Float32BufferAttribute(priorities,1));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.ShaderMaterial({uniforms:{atlas:{value:texture}},transparent:true,depthWrite:false,
    vertexShader:'attribute vec3 labelCenter; attribute float labelPriority; varying vec2 vUv; varying float vVisible; void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(labelCenter,1.);vVisible=labelPriority>.5||-p.z<180.?1.:0.;p.xy+=position.xy*max(1.,-p.z*.014);gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform sampler2D atlas; varying vec2 vUv; varying float vVisible; void main(){vec4 c=texture2D(atlas,vUv);if(c.a<.1||vVisible<.5)discard;gl_FragColor=c;}' });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='campus-place-labels';mesh.frustumCulled=false;mesh.renderOrder=4;return mesh;
}
