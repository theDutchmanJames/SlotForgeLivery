(function(){
  'use strict';
  const M=window.Model,canvas=document.createElement('canvas'),entries=new Map(),owners=new Map();
  let gl,program,position,uv,matrix,box,textureUniform,failed=false,notification=0,totalBytes=0;
  function notify(){if(notification)return;notification=requestAnimationFrame(()=>{notification=0;window.dispatchEvent(new Event('perspective-ready'));});}
  function init(){
    if(gl)return true;if(failed)return false;
    try{
      gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw new Error('No WebGL');
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;uniform mat3 matrix;uniform vec4 box;varying vec2 tex;void main(){vec3 p=matrix*vec3(position,1.0);gl_Position=vec4(2.0*(p.x-box.x*p.z)/box.z-p.z,p.z-2.0*(p.y-box.y*p.z)/box.w,0.0,p.z);tex=uv;}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 tex;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,tex);}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Cannot link perspective preview');
      position=gl.getAttribLocation(program,'position');uv=gl.getAttribLocation(program,'uv');matrix=gl.getUniformLocation(program,'matrix');box=gl.getUniformLocation(program,'box');textureUniform=gl.getUniformLocation(program,'image');
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(position,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
      canvas.addEventListener('webglcontextlost',ev=>{ev.preventDefault();failed=true;gl=null;entries.clear();owners.clear();totalBytes=0;notify();});return true;
    }catch{failed=true;gl=null;return false;}
  }

  function getSource(l,opts,markup){
    const plain={...l,id:undefined,name:undefined,x:0,y:0,rotation:0,...M.fitValues(),...M.pinchValues(),affine:undefined,projective:undefined,groupPose:undefined,groupId:undefined,groupName:undefined,opacity:1};
    const key=JSON.stringify([plain,!!opts.effects]),owner=(l.id||'draft')+':'+!!opts.effects,previous=owners.get(owner);
    if(previous&&previous!==key){const obsolete=entries.get(previous);if(obsolete){entries.delete(previous);if(obsolete.texture)gl.deleteTexture(obsolete.texture);totalBytes-=obsolete.bytes||0;}}
    owners.delete(owner);owners.set(owner,key);while(owners.size>32)owners.delete(owners.keys().next().value);
    let entry=entries.get(key);
    if(entry){entry.lastUse=performance.now();entries.delete(key);entries.set(key,entry);return entry;}
    const b=M.layerLocalBounds(l),scale=Math.min(2,2048/Math.max(b.w,b.h)),width=Math.max(2,Math.ceil(b.w*scale)),height=Math.max(2,Math.ceil(b.h*scale));const bytes=width*height*4;
    while(entries.size>=16||totalBytes+bytes>48*1024*1024){const oldest=entries.entries().next().value;if(!oldest||performance.now()-oldest[1].lastUse<2000)return {status:'fallback'};entries.delete(oldest[0]);if(oldest[1].texture)gl.deleteTexture(oldest[1].texture);totalBytes-=oldest[1].bytes||0;}
    entry={bounds:b,status:'loading',outputs:new Map(),bytes,lastUse:performance.now()};totalBytes+=bytes;entries.set(key,entry);
    const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${markup(plain)}</svg>`)));
    image.decode().then(()=>{
      if(failed||entries.get(key)!==entry)return;
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      for(const [param,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,param,value);
      entry.texture=texture;entry.status='ready';notify();
    }).catch(()=>{entry.status='failed';notify();});return entry;
  }
  function render(l,m,opts,markup){
    if(!init())return null;const entry=getSource(l,opts,markup);if(entry.status!=='ready')return null;
    const key=JSON.stringify(m);if(entry.outputs.has(key))return entry.outputs.get(key);
    try{
      const b=entry.bounds,corners=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}].map(p=>M.transformPoint(m,p)),bounds=M.boundsOfPoints(corners);
      if(![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite))return null;
      const scale=Math.min(2,2048/Math.max(bounds.w,bounds.h));canvas.width=Math.max(2,Math.ceil(bounds.w*scale));canvas.height=Math.max(2,Math.ceil(bounds.h*scale));gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      // Perspective-correct texture interpolation maps the original editable artwork in one draw.
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([b.x,b.y,0,0,b.x+b.w,b.y,1,0,b.x,b.y+b.h,0,1,b.x+b.w,b.y+b.h,1,1]),gl.DYNAMIC_DRAW);
      const h=M.homogeneous(m),sign=h[6]*(b.x+b.w/2)+h[7]*(b.y+b.h/2)+h[8]<0?-1:1;gl.uniformMatrix3fv(matrix,false,new Float32Array([h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]].map(v=>v*sign)));gl.uniform4f(box,bounds.x,bounds.y,bounds.w,bounds.h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.uniform1i(textureUniform,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      const result={bounds,href:canvas.toDataURL('image/png')};entry.outputs.set(key,result);while(entry.outputs.size>2)entry.outputs.delete(entry.outputs.keys().next().value);return result;
    }catch{return null;}
  }
  window.PerspectivePreview={render,stats:()=>({sources:entries.size,bytes:totalBytes,ready:[...entries.values()].filter(e=>e.status==='ready').length,available:!!gl&&!failed})};
})();
