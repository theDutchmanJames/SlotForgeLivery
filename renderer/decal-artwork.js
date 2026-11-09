(function(){
 'use strict';
 const M=window.Model,A=window.DecalsArt,D=window.DecalsModel,NS='http://www.w3.org/2000/svg';
 const cache=new Map();let bytes=0,sequence=0;
 function sanitize(source){
  if(cache.has(source)){const value=cache.get(source);cache.delete(source);cache.set(source,value);return value;}
  const clean=A.sanitize(source);cache.set(source,clean);bytes+=source.length+clean.svg.length;
  while(bytes>24e6&&cache.size>1){const key=cache.keys().next().value;bytes-=key.length+cache.get(key).svg.length;cache.delete(key);}return clean;
 }
 function markup(source,box){return A.svgBody(box?crop(source,box):sanitize(source).svg,'decal-'+(++sequence));}
 function dimensions(source,box){if(box){validateCrop(source,box);return [box.x,box.y,box.w,box.h];}return sanitize(source).viewBox;}
 function layer(source,name,width=240,box){const clean=sanitize(source),v=dimensions(source,box),h=width*v[3]/v[2];if(width<.01||h<.01||width>10000||h>10000)throw Error('This decal is too small or too large to import at this scale. Import it separately.');return M.layer('vector',{name:M.name(name,'Vector decal'),svg:clean.svg,...(box?{crop:{...box}}:{}),w:width,h,x:500-width/2,y:300-h/2});}
 function validateCrop(source,box){
  const clean=sanitize(source),[x,y,w,h]=clean.viewBox;
  if(!box||![box.x,box.y,box.w,box.h].every(Number.isFinite)||box.w<=0||box.h<=0||box.x<x-.01||box.y<y-.01||box.x+box.w>x+w+.01||box.y+box.h>y+h+.01)throw Error('Select an area inside the sheet.');
  return box;
 }
 function crop(source,box){
  validateCrop(source,box);const clean=sanitize(source);
  const doc=new DOMParser().parseFromString(clean.svg,'image/svg+xml'),svg=doc.documentElement;
  svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);svg.setAttribute('width',String(box.w));svg.setAttribute('height',String(box.h));svg.setAttribute('overflow','hidden');
  return new XMLSerializer().serializeToString(svg);
 }
 function removePageBackground(source){
  const clean=sanitize(source),doc=new DOMParser().parseFromString(clean.svg,'image/svg+xml'),svg=document.importNode(doc.documentElement,true);
  const [x,y,w,h]=clean.viewBox;svg.style.position='absolute';svg.style.left='-100000px';svg.setAttribute('width',w);svg.setAttribute('height',h);document.body.append(svg);
  try{
   // Remove only a first, solid white shape covering the page. White artwork stays.
   const first=[...svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,image,use')].find(n=>!n.closest('defs,clipPath,mask,pattern,symbol'));
   const d=first?.getAttribute('d')||'',b0=first?.getBBox(),rectangular=first?.localName==='rect'||first?.localName==='path'&&/^[MmLlHhVvZz+\-.\deE,\s]+$/.test(d)&&/[zZ]\s*$/.test(d)&&Math.abs(first.getTotalLength()-2*(b0.width+b0.height))<.01;
   if(first&&rectangular&&getComputedStyle(first).fill==='rgb(255, 255, 255)'&&getComputedStyle(first).opacity==='1'){
    const b=first.getBBox(),m=svg.getCTM().inverse().multiply(first.getCTM()),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([a,b])=>new DOMPoint(a,b).matrixTransform(m));
    const bb=M.boundsOfPoints(points);const inverse=m.inverse(),inside=[[x+w*.001,y+h*.001],[x+w*.999,y+h*.001],[x+w*.999,y+h*.999],[x+w*.001,y+h*.999],[x+w/2,y+h/2]].every(([a,b])=>first.isPointInFill(new DOMPoint(a,b).matrixTransform(inverse)));if(inside&&bb.x<=x+.01&&bb.y<=y+.01&&bb.x+bb.w>=x+w-.01&&bb.y+bb.h>=y+h-.01)first.remove();
   }
  }finally{svg.remove();svg.style.removeProperty('position');svg.style.removeProperty('left');if(!svg.getAttribute('style'))svg.removeAttribute('style');}
  return sanitize(new XMLSerializer().serializeToString(svg)).svg;
 }
 async function readPackage(raw){
  let sheets;
  if(raw?.format==='slotforge-decals-sheet'&&[1,2].includes(raw.version))sheets=[D.validateProject(raw.project)];
  else if(raw?.format==='slotforge-decals-sheets'&&raw.version===1&&Array.isArray(raw.sheets)&&raw.sheets.length&&raw.sheets.length<=100)sheets=raw.sheets.map(s=>D.validateProject(s.project));
  else if(raw?.format==='slotforge-decals'){
   const pack=D.readPack(raw);sheets=[D.validateProject({...D.project('Decal pack'),fonts:pack.fonts,items:pack.decals.map(d=>({...d.art,name:d.name,page:0}))})];
  }else throw Error('Choose a supported .sfsheet or .sfdecal file exported by SlotForge Decals.');
  if(sheets.reduce((n,p)=>n+p.items.length,0)>2000)throw Error('Import up to 2,000 decals at a time. Export a smaller selection from Decals.');
  // Validate the complete selection before producing any importable objects.
  for(const p of sheets)A.inspectItems(p.items);
  const entries=[];
  for(const p of sheets){
   await A.loadFonts(p.fonts);
   for(const item of p.items){
    const fonts=D.fontsFor([item],p.fonts),svg=sanitize(A.standalone(item,fonts)).svg;
    entries.push({name:item.name,sheet:p.name,page:item.page+1,svg,selected:true});
   }
  }
  if(!entries.length)throw Error('This file contains no decals.');return entries;
 }
 window.DecalArtwork={sanitize,markup,layer,crop,dimensions,removePageBackground,readPackage};
})();
