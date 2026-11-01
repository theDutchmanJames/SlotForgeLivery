(function () {
  'use strict';
  const M=window.Model, NS='http://www.w3.org/2000/svg';
  const allowed=new Set(['svg','g','defs','clipPath','path','rect','circle','ellipse','polygon','polyline','line','text','tspan']);
  const attrs=new Set(['d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','points','transform','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','fill-opacity','stroke-opacity','font-size','font-family','font-weight','text-anchor','viewBox']);
  const leaves=new Set(['path','rect','circle','ellipse','polygon','polyline','line','text']);
  const paintAttrs=['fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','font-size','font-family','font-weight','text-anchor'];
  function safeValue(key,value) { if (/url\s*\(|[<>]|javascript:|data:|expression|@import|\\/i.test(value)) return null; if (value.length>350000)return null;return value; }
  function sanitize(text) {
    if(typeof text!=='string' || text.length>5e6)throw new Error('Use an SVG smaller than 5 MB.');
    const source=new DOMParser().parseFromString(text,'image/svg+xml');
    if(source.querySelector('parsererror') || source.documentElement.localName!=='svg')throw new Error('This file is not a valid SVG illustration.');
    let count=0; const out=document.createElementNS(NS,'svg');
    const ids=new Map([...source.querySelectorAll('[id]')].map(n=>[n.id,n]));
    const prefix='v'+M.uid().replace(/[^a-zA-Z0-9]/g,'')+'-',mapped=new Map([...ids.keys()].map((id,i)=>[id,prefix+i]));
    function copy(el,parent,trail=[]) {
      if(trail.length>30)throw new Error('This SVG has too many nested references. Expand its symbols first.');
      if(el.localName==='use'){
        const href=el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
        const target=href.startsWith('#')?ids.get(href.slice(1)):null;
        if(!target || !['g',...leaves].includes(target.localName))throw new Error('An SVG symbol could not be expanded. Expand symbols in your vector editor first.');
        if(trail.includes(target))throw new Error('This SVG contains a circular reference.');
        const wrapper=source.createElementNS(NS,'g');
        for(const a of el.attributes)if(attrs.has(a.name)||a.name==='style'||a.name==='clip-path')wrapper.setAttribute(a.name,a.value);
        const shift=source.createElementNS(NS,'g');shift.setAttribute('transform',`translate(${Number(el.getAttribute('x'))||0} ${Number(el.getAttribute('y'))||0})`);
        shift.append(target.cloneNode(true));wrapper.append(shift);copy(wrapper,parent,[...trail,target]);return;
      }
      if(!allowed.has(el.localName))return;
      if(++count>3500)throw new Error('This SVG has too many objects. Simplify it to fewer than 3,500 objects first.');
      const n=document.createElementNS(NS,el.localName);
      if(mapped.has(el.id))n.setAttribute('id',mapped.get(el.id));
      const clipping=el.getAttribute('clip-path')||(el.getAttribute('style')||'').match(/(?:^|;)\s*clip-path\s*:\s*([^;]+)/)?.[1];
      if(clipping&&clipping!=='none'){
        const ref=clipping.trim().match(/^url\(\s*#([a-zA-Z0-9_.:-]+)\s*\)$/);
        if(!ref||ids.get(ref[1])?.localName!=='clipPath')throw new Error('Only local SVG clipping paths are supported.');
        n.setAttribute('clip-path',`url(#${mapped.get(ref[1])})`);
      }
      if(el.localName==='clipPath'){
        if(el.getAttribute('clipPathUnits')==='objectBoundingBox')throw new Error('Expand bounding-box clipping paths before importing this SVG.');
        n.setAttribute('clipPathUnits','userSpaceOnUse');
      }
      for(const a of el.attributes)if(attrs.has(a.name)){const v=safeValue(a.name,a.value);if(v!==null)n.setAttribute(a.name,v);}
      // Inline presentation properties are supported; classes/stylesheets and external references are deliberately not executed.
      for(const part of (el.getAttribute('style')||'').split(';')){const pos=part.indexOf(':');if(pos<0)continue;const k=part.slice(0,pos).trim(),v=safeValue(k,part.slice(pos+1).trim());if(attrs.has(k)&&v!==null)n.setAttribute(k,v);}
      if(el.localName==='text'||el.localName==='tspan') { for(const child of el.childNodes) { if(child.nodeType===3)n.appendChild(document.createTextNode(child.textContent));else if(child.nodeType===1)copy(child,n,trail); } }
      else for(const child of el.children)copy(child,n,trail);
      parent.appendChild(n);
    }
    for(const child of source.documentElement.children)copy(child,out);
    for(const k of ['viewBox','width','height','fill','stroke'])if(source.documentElement.hasAttribute(k)){const v=safeValue(k,source.documentElement.getAttribute(k));if(v!==null)out.setAttribute(k,v);}
    return out;
  }
  function importSVG(text) {
    const svg=sanitize(text);svg.style.cssText='position:fixed;left:-20000px;top:0;width:1000px;height:600px;visibility:hidden';document.body.append(svg);
    try {
      const shapes=[...svg.querySelectorAll('*')].filter(n=>leaves.has(n.localName)&&!n.closest('defs,clipPath') && !(n.localName!=='text' && n.closest('text')));
      if(!shapes.length)throw new Error('No editable vector shapes found. Embedded photographs and SVG references are not car geometry.');
      const raw=[];
      const rootCTM=svg.getCTM();
      for(const [i,el] of shapes.entries()) {
        let bb;try{bb=el.getBBox();}catch{continue;}
        if(bb.width===0 && bb.height===0)continue;
        const mat=rootCTM.inverse().multiply(el.getCTM());
        const corners=[[bb.x,bb.y],[bb.x+bb.width,bb.y],[bb.x,bb.y+bb.height],[bb.x+bb.width,bb.y+bb.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(mat));
        const b=M.boundsOfPoints(corners),copy=el.cloneNode(true);copy.removeAttribute('id');
        for(const k of paintAttrs){let node=el;while(node&&!node.hasAttribute(k)&&node!==svg)node=node.parentElement; if(node?.hasAttribute(k))copy.setAttribute(k,node.getAttribute(k));}
        copy.setAttribute('data-geometry','true');
        // Filled PostScript paths close implicitly, even when no Z is emitted.
        const closed=!['line','polyline','text'].includes(el.localName)&&(el.localName!=='path'||/[zZ]/.test(el.getAttribute('d')||'')||copy.getAttribute('fill')!=='none');
        if(closed&&el.localName==='path'&&copy.getAttribute('fill')!=='none'){
          let d=copy.getAttribute('d')||'';
          // MuPDF emits absolute coordinates; close each implicitly filled contour
          // so Livery's added outline includes the original closing edges.
          if(!/[achlmqstv]/.test(d))d=d.replace(/([^zZ\s])\s*M/g,'$1 Z M');
          if(!/[zZ]\s*$/.test(d))d+=' Z';copy.setAttribute('d',d);
        }
        let branch=copy;
        for(let ancestor=el.parentElement;ancestor&&ancestor!==svg;ancestor=ancestor.parentElement){const wrap=ancestor.cloneNode(false);wrap.removeAttribute('id');wrap.append(branch);branch=wrap;}
        const dependencies=new Map();
        function collectClips(node,depth=0){if(depth>20)throw new Error('SVG clipping is too complex.');for(const item of [node,...node.querySelectorAll('[clip-path]')]){const ref=item.getAttribute('clip-path')?.match(/^url\(#([^)]*)\)$/)?.[1];if(ref&&!dependencies.has(ref)){const clip=[...svg.querySelectorAll('clipPath')].find(c=>c.id===ref);if(clip){dependencies.set(ref,clip);collectClips(clip,depth+1);}}}}
        collectClips(branch);
        const serialize=n=>new XMLSerializer().serializeToString(n);
        const markup=(dependencies.size?`<defs>${[...dependencies.values()].map(serialize).join('')}</defs>`:'')+serialize(branch);
        raw.push({id:M.uid(),name:`${closed?'Region':'Detail'} ${i+1}`,role:closed?'protected':'detail',markup,bounds:b,area:b.w*b.h,closed,fill:copy.getAttribute('fill')||'#596573'});
      }
      if(!raw.length)throw new Error('No visible geometry was found.');
      const bounds=M.boundsOfPoints(raw.flatMap(r=>[{x:r.bounds.x,y:r.bounds.y},{x:r.bounds.x+r.bounds.w,y:r.bounds.y+r.bounds.h}]));
      const s=Math.min(850/bounds.w,420/bounds.h),tx=(1000-bounds.w*s)/2-bounds.x*s,ty=(600-bounds.h*s)/2-bounds.y*s;
      const largest=raw.filter(r=>r.closed).sort((a,b)=>b.area-a.area)[0];if(largest)largest.role='body';
      const regions=raw.map(r=>({id:r.id,name:r.name,role:r.role,colour:r.role==='protected'&&/^(black|#000000|#000|#111|#111111|#222|#222222|#333|#333333)$/i.test(r.fill)?'#273442':undefined,markup:`<g transform="translate(${tx} ${ty}) scale(${s})">${r.markup}</g>`,bounds:{x:r.bounds.x*s+tx,y:r.bounds.y*s+ty,w:r.bounds.w*s,h:r.bounds.h*s}}));
      return {regions,bounds:{x:bounds.x*s+tx,y:bounds.y*s+ty,w:bounds.w*s,h:bounds.h*s},source:'svg',photo:null,showPhoto:false};
    } finally {svg.remove();}
  }
  const geometryCache=new Map(),geometryToken='geometry-'+M.uid()+'-';let geometryBytes=0;
  function geometryMarkup(region,mode='display',base='#fff') {
    const key=JSON.stringify([region.markup,mode,mode==='original'?null:region.role,mode==='display'?(region.colour||base):null]);
    let markup=geometryCache.get(key);
    if(markup===undefined){
      markup=buildGeometryMarkup(region,mode,base);geometryCache.set(key,markup);geometryBytes+=2*(key.length+markup.length);
      while(geometryCache.size>1024||geometryBytes>16*1024*1024){const first=geometryCache.keys().next().value;geometryBytes-=2*(first.length+geometryCache.get(first).length);geometryCache.delete(first);}
    }
    return markup.replaceAll(geometryToken,'clip-'+(++renderId)+'-');
  }
  function buildGeometryMarkup(region,mode,base) {
    const doc=new DOMParser().parseFromString(`<svg xmlns="${NS}">${region.markup}</svg>`,'image/svg+xml');
    // A region appears in masks, outlines and library previews. Give each copy its own IDs.
    const idMap=new Map([...doc.querySelectorAll('[id]')].map((n,i)=>[n.id,`${geometryToken}${i}`]));
    for(const n of doc.querySelectorAll('[id]'))n.id=idMap.get(n.id);
    for(const n of doc.querySelectorAll('[clip-path]')){const ref=n.getAttribute('clip-path').match(/^url\(#([^)]*)\)$/)?.[1];if(idMap.has(ref))n.setAttribute('clip-path',`url(#${idMap.get(ref)})`);}
    for(const el of doc.querySelectorAll('[data-geometry]')) {
      if(mode==='original')continue;
      el.removeAttribute('opacity');el.removeAttribute('fill-opacity');el.removeAttribute('stroke-opacity');
      if(mode==='mask'){el.setAttribute('fill',region.role==='body'?'white':'black');el.setAttribute('stroke','none');}
      else if(mode==='outline'){el.setAttribute('fill','none');el.setAttribute('stroke','#273442');el.setAttribute('stroke-width','1.2');el.setAttribute('vector-effect','non-scaling-stroke');}
      else {el.setAttribute('fill',region.role==='body'?(region.colour||base):region.role==='protected'?(region.colour||'#58636f'):'none');el.setAttribute('stroke','#273442');el.setAttribute('stroke-width',region.role==='detail'?'1':'1.4');el.setAttribute('vector-effect','non-scaling-stroke');}
    }
    return new XMLSerializer().serializeToString(doc.documentElement).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
  }
  // Paint is generated in the displayed coordinate system, outside imported transforms.
  function paintServer(p,b,effects=false) {
    const id='paint-'+(++renderId),g=p.gradient;let defs='',fill=M.colour(p.fill),overlays=[];
    if(p.fillType==='gradient'&&g){const a=g.angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),span=(Math.abs(dx)*b.w+Math.abs(dy)*b.h)/2,cx=b.x+b.w/2,cy=b.y+b.h/2;
      defs+=`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx-dx*span}" y1="${cy-dy*span}" x2="${cx+dx*span}" y2="${cy+dy*span}">${g.stops.map(s=>`<stop offset="${s.offset}" stop-color="${M.mixColour(fill,s.colour,g.strength)}"/>`).join('')}</linearGradient>`;fill=`url(#${id})`;}
    if(effects){
      const shine=p.finish==='Gloss'?.14:p.finish==='Satin'?.065:0;
      if(shine){defs+=`<linearGradient id="${id}-shine" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".35" stop-color="white" stop-opacity="${shine}"/><stop offset=".55" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="${shine/3}"/></linearGradient>`;overlays.push(`url(#${id}-shine)`);}
      if(p.effect==='Metallic'||p.finish==='Matte'){const alpha=p.effect==='Metallic'?.12:.025;defs+=`<pattern id="${id}-grain" width="11" height="13" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".4" fill="white" opacity="${alpha}"/><circle cx="7.3" cy="4.2" r=".3" fill="black" opacity="${alpha/2}"/><circle cx="3.5" cy="8.4" r=".35" fill="white" opacity="${alpha}"/><circle cx="9.2" cy="11.5" r=".45" fill="white" opacity="${alpha}"/></pattern>`;overlays.push(`url(#${id}-grain)`);}
      if(p.effect==='Pearl'){defs+=`<linearGradient id="${id}-pearl" x2="1" y2="1"><stop stop-color="#a6dfff" stop-opacity=".18"/><stop offset=".5" stop-color="#ffdcf0" stop-opacity=".08"/><stop offset="1" stop-color="#fff5b5" stop-opacity=".18"/></linearGradient>`;overlays.push(`url(#${id}-pearl)`);}
    }
    return {defs,fill,overlays};
  }
  function warpedLayer(l,interactive,opts,m){
    if(opts.preview&&window.PerspectivePreview){
      const cached=window.PerspectivePreview.render(l,m,opts,plain=>layerMarkup(plain,false,{effects:opts.effects}));
      if(cached){const b=cached.bounds;return `<g ${interactive?`data-layer="${l.id}"`:''}><image data-perspective-preview="true" href="${cached.href}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="${l.opacity??1}" pointer-events="none"/>${interactive?`<g opacity="0">${warpedLayer(l,false,{...opts,preview:false,mesh:2},m)}</g>`:''}</g>`;}
    }
    const id='warp-'+(++renderId),b=M.layerLocalBounds(l),plain={...l,x:0,y:0,rotation:0,...M.fitValues(),...M.pinchValues(),affine:undefined,projective:undefined,groupPose:undefined,opacity:1};
    const content=layerMarkup(plain,false,opts),corners=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}].map(p=>M.transformPoint(m,p));
    let defs=`<g id="${id}-source">${content}</g><clipPath id="${id}-edge" clipPathUnits="userSpaceOnUse"><polygon points="${corners.map(p=>p.x+','+p.y).join(' ')}"/></clipPath>`,tiles='';
    const n=opts.mesh||(opts.preview?3:12);
    function triangle(a,b,c,index){const A=M.transformPoint(m,a),B=M.transformPoint(m,b),C=M.transformPoint(m,c),source=[b.x-a.x,b.y-a.y,c.x-a.x,c.y-a.y,a.x,a.y],det=source[0]*source[3]-source[1]*source[2],inv=[source[3]/det,-source[1]/det,-source[2]/det,source[0]/det,(source[2]*source[5]-source[3]*source[4])/det,(source[1]*source[4]-source[0]*source[5])/det],dest=[B.x-A.x,B.y-A.y,C.x-A.x,C.y-A.y,A.x,A.y],affine=M.matrixMultiply(dest,inv),clip=id+'-'+index;
      defs+=`<clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><polygon shape-rendering="crispEdges" points="${[A,B,C].map(p=>p.x+','+p.y).join(' ')}"/></clipPath>`;
      tiles+=`<g style="mix-blend-mode:plus-lighter" clip-path="url(#${clip})"><use href="#${id}-source" transform="matrix(${affine.join(' ')})"/></g>`;
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a={x:b.x+b.w*x/n,y:b.y+b.h*y/n},c={x:b.x+b.w*(x+1)/n,y:b.y+b.h*(y+1)/n},B={x:c.x,y:a.y},D={x:a.x,y:c.y};triangle(a,B,c,(y*n+x)*2);triangle(a,c,D,(y*n+x)*2+1);}
    return `<defs>${defs}</defs><g ${interactive?`data-layer="${l.id}"`:''} opacity="${l.opacity??1}" style="isolation:isolate" clip-path="url(#${id}-edge)">${tiles}</g>`;
  }
  const artworkCache=new Map();let artworkBytes=0;
  // Loaded perspective textures replace the temporary vector preview.
  window.addEventListener('perspective-ready',()=>{artworkCache.clear();artworkBytes=0;});
  function layerMarkup(l,interactive=false,opts={}) {
    if(!opts.preview)return buildLayerMarkup(l,interactive,opts);
    const key=JSON.stringify([l,interactive,opts]);
    let entry=artworkCache.get(key);
    if(entry){artworkCache.delete(key);artworkCache.set(key,entry);return entry.markup;}
    const markup=buildLayerMarkup(l,interactive,opts),bytes=2*(key.length+markup.length);
    if(bytes<=16*1024*1024){
      artworkCache.set(key,{markup,bytes});artworkBytes+=bytes;
      while(artworkCache.size>256||artworkBytes>16*1024*1024){const first=artworkCache.keys().next().value;artworkBytes-=artworkCache.get(first).bytes;artworkCache.delete(first);}
    }
    return markup;
  }
  function buildLayerMarkup(l,interactive=false,opts={}) {
    if(l.visible===false||l.groupHidden===true)return '';
    const matrix=M.layerMatrix(l);if(matrix.length===9)return warpedLayer(l,interactive,opts,matrix);
    const e=M.escape;let shape='';
    if(l.kind==='rect')shape=`<rect width="${l.w}" height="${l.h}"/>`;
    if(l.kind==='ellipse')shape=`<ellipse cx="${l.w/2}" cy="${l.h/2}" rx="${l.w/2}" ry="${l.h/2}"/>`;
    if(l.kind==='polygon')shape=`<path d="${M.pathData(M.mapPathPoints(l.points,p=>({x:p.x*l.w,y:p.y*l.h})))}"/>`;
    if(l.kind==='text')shape=`<text x="${l.w/2}" y="${l.h*.8}" text-anchor="middle" font-family="${e(l.fontData?.family||l.font||'Arial')}" font-weight="${l.fontData?'400':'700'}" font-size="${l.h}" textLength="${l.w}" lengthAdjust="spacingAndGlyphs">${e(l.text)}</text>`;
    if(l.kind==='image')shape=`<image width="${l.w}" height="${l.h}" href="${e(l.src)}" preserveAspectRatio="xMidYMid meet"/>`;
    if(l.kind==='line'){
      const style=M.lineStyle(l),samples=l.points?M.lineSamples(l):null,total=M.lineThickness(l);let y=0;
      shape=style.stripes.map(stripe=>{const paint=paintServer({...M.paintOf(l),...(stripe.colour?{fill:stripe.colour,fillType:'solid'}:{})},{x:0,y:0,w:l.w,h:l.h},opts.effects),offset=y+stripe.width/2-total/2;
        const rect=samples?`<path d="${offset?M.offsetPath(samples,offset):M.pathData(M.mapPathPoints(l.points,p=>({x:p.x*l.w,y:p.y*l.h})),false)}" fill="none" stroke="currentColor" stroke-width="${stripe.width}" stroke-linecap="${style.cap}" stroke-linejoin="round"/>`:`<rect y="${y}" width="${l.w}" height="${stripe.width}" rx="${style.cap==='round'?Math.min(stripe.width,l.w)/2:0}"/>`;
        y+=stripe.width+style.gap;
        const painted=fill=>samples?rect.replace('stroke="currentColor"',`stroke="${fill}"`):`<g fill="${fill}">${rect}</g>`;
        return `<defs>${paint.defs}</defs>${painted(paint.fill)}${paint.overlays.map(fill=>`<g pointer-events="none">${painted(fill)}</g>`).join('')}`;
      }).join('');
      return `<g ${interactive?`data-layer="${l.id}"`:''} transform="matrix(${M.layerMatrix(l).join(' ')})" opacity="${l.opacity??1}">${shape}</g>`;
    }
    const paint=paintServer(M.paintOf(l),{x:0,y:0,w:l.w,h:l.h},opts.effects&&l.kind!=='image');
    return `${l.fontData&&!opts.preview?window.FontLibrary.style(l.fontData):''}<defs>${paint.defs}</defs><g ${interactive?`data-layer="${l.id}"`:''} transform="matrix(${M.layerMatrix(l).join(' ')})" fill="${paint.fill}" opacity="${l.opacity??1}">${shape}${paint.overlays.map(fill=>`<g pointer-events="none" fill="${fill}">${shape}</g>`).join('')}</g>`;
  }
  const maskCache=new Map();let maskBytes=0;
  function bodyMasks(v,id,bodies,protectedRegions,reference,preview=false){
    // Paint colours do not change clipping geometry. Cache independently of paint.
    const geometry=r=>[r.id,r.role,r.markup,r.bounds,r.sourceRegionId,r.contourIndex];
    const signature=JSON.stringify([!!v.vectorSource,bodies.map(geometry),protectedRegions.map(geometry),reference.map(geometry),v.vectorSource?.regions.map(r=>r.id)]);
    const display=markup=>preview&&window.MaskPreview?window.MaskPreview.render(markup,id,signature):markup;
    const cached=maskCache.get(id);if(cached?.signature===signature)return display(cached.markup);
    const order=new Map((v.vectorSource?.regions||[]).map((r,i)=>[r.id,i]));
    // Imported bounds are conservative; include touching edges to avoid seams.
    const overlaps=(a,b)=>!a||!b||a.x<=b.x+b.w&&b.x<=a.x+a.w&&a.y<=b.y+b.h&&b.y<=a.y+a.h;
    const perPanel=v.vectorSource?bodies.map((body,i)=>{
      const sourceIndex=body.contourIndex===-1?(order.get(body.sourceRegionId)??-1):-1;
      return {id:`${id}-panel-${i}`,body,blockers:reference.filter(r=>r.role!=='detail'&&(sourceIndex<0||order.get(r.id)>sourceIndex)&&overlaps(body.bounds,r.bounds))};
    }):[];
    const blockers=[...new Set(perPanel.flatMap(p=>p.blockers))],ids=new Map(blockers.map((r,i)=>[r,`${id}-blocker-${i}`]));
    const defs=blockers.map(r=>`<g id="${ids.get(r)}">${geometryMarkup({...r,role:'protected'},'mask')}</g>`).join('');
    const panelMasks=perPanel.map(p=>`<mask id="${p.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><rect width="1000" height="600" fill="black"/>${geometryMarkup(p.body,'mask')}${p.blockers.map(r=>`<use href="#${ids.get(r)}"/>`).join('')}</mask>`).join('');
    const markup=`<defs>${defs}${panelMasks}<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><rect width="1000" height="600" fill="black"/>${v.vectorSource?perPanel.map(p=>`<rect width="1000" height="600" fill="white" mask="url(#${p.id})"/>`).join(''):bodies.map(r=>geometryMarkup(r,'mask')).join('')}${protectedRegions.map(r=>geometryMarkup(r,'mask')).join('')}</mask></defs>`;
    if(cached)maskBytes-=cached.bytes;
    const bytes=2*(signature.length+markup.length);maskCache.set(id,{signature,markup,bytes});maskBytes+=bytes;
    while(maskCache.size>8||maskBytes>16*1024*1024){const first=maskCache.keys().next().value;maskBytes-=maskCache.get(first).bytes;maskCache.delete(first);}
    return display(markup);
  }
  function renderViewRaw(project,key,opts={}) {
    const v=project?.template.views[key];if(!v)return '';
    const id='mask-'+(opts.id||key),regions=v.regions.filter(r=>r.role!=='hidden'&&(opts.prepare||r.role!=='body'||r.paintVisible!==false));
    const bodies=regions.filter(r=>r.role==='body'),protectedRegions=regions.filter(r=>r.role==='protected');
    const selectedSources=new Set(regions.filter(r=>r.contourIndex===-1&&r.role!=='hidden').map(r=>r.sourceRegionId));
    const reference=(v.vectorSource?.regions||[]).filter(r=>r.role!=='hidden'&&!selectedSources.has(r.id));
    const mask=bodyMasks(v,id,bodies,protectedRegions,reference,opts.preview&&opts.id==='main'&&!opts.prepare&&!!v.vectorSource);
    const photo=opts.prepare&&v.photo&&v.showPhoto?`<image href="${M.escape(v.photo.src)}" x="${v.photo.x}" y="${v.photo.y}" width="${v.photo.w}" height="${v.photo.h}" opacity=".65"/>`:'';
    const base=bodies.map(r=>{
      const paint=M.paintOf(project,r),scope=paint.gradient?.scope;
      const peers=scope==='label'&&r.partLabel?bodies.filter(a=>a.partLabel===r.partLabel):[r];
      const bounds=scope==='view'?v.bounds:M.boundsOfPoints(peers.flatMap(a=>[{x:a.bounds.x,y:a.bounds.y},{x:a.bounds.x+a.bounds.w,y:a.bounds.y+a.bounds.h}]));
      const server=paintServer(paint,bounds,opts.effects),maskId='fill-mask-'+(++renderId);
      return `<defs>${server.defs}<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600">${geometryMarkup(r,'mask')}</mask></defs><g ${opts.prepare?`data-region="${r.id}"`:opts.interactive?`data-paint-region="${r.id}"`:''}><g mask="url(#${maskId})" pointer-events="none"><rect width="1000" height="600" fill="${server.fill}"/>${server.overlays.map(fill=>`<rect x="${r.bounds.x}" y="${r.bounds.y}" width="${r.bounds.w}" height="${r.bounds.h}" fill="${fill}"/>`).join('')}</g><g opacity="0" pointer-events="fill">${geometryMarkup(r,'display',project.base)}</g></g>`;
    }).join('');
    const art=opts.staticOnly?'':`<g mask="url(#${id})">${(project.views[key]||[]).map(l=>layerMarkup(l,opts.interactive&&!opts.prepare,opts)).join('')}</g>`;
    const top=regions.map(r=>`<g ${opts.prepare?`data-region="${r.id}"`:''}>${geometryMarkup(r,r.role==='body'?'outline':'display',project.base)}</g>`).join('');
    const hits=opts.prepare?regions.map(r=>`<g data-region="${r.id}" style="cursor:pointer;opacity:0;pointer-events:all">${geometryMarkup(r,'display')}</g>`).join(''):'';
    const referenceArt=reference.map(r=>geometryMarkup(r,'original')).join('');
    const referenceDetails=reference.filter(r=>r.role==='detail').map(r=>geometryMarkup(r,'original')).join('');
    const opacity=opts.prepare&&v.showPhoto?'opacity=".5"':'',under=mask+photo+`<g ${opacity}>`+referenceArt+(v.vectorSource?`<g mask="url(#${id})">${base}</g>`:base)+'</g>',over=`<g ${opacity}><g pointer-events="${opts.prepare?'auto':'none'}">`+top+referenceDetails+'</g></g>'+hits;
    return opts.parts?{under,over,art} :under+art+over;
  }
  const viewCache=new Map();
  function renderViewParts(project,key,opts={}){
    const v=project?.template.views[key];if(!v)return {under:'',over:'',art:''};
    const slot=opts.id||key,signature=JSON.stringify([v,M.paintOf(project),!!opts.prepare,!!opts.interactive,!!opts.effects,opts.preview&&slot==='main'?window.MaskPreview?.revision():0]);
    let cached=viewCache.get(slot);
    if(!cached||cached.signature!==signature){cached={signature,...renderViewRaw(project,key,{...opts,parts:true,staticOnly:true})};viewCache.set(slot,cached);while(viewCache.size>8)viewCache.delete(viewCache.keys().next().value);}
    const artMask='url(#mask-'+slot+')',artOpacity=opts.prepare&&v.showPhoto?'.5':'1';
    const artItems=(project.views[key]||[]).map(l=>{
      // Ordinary movement is a translation, including skewed/pinched layers.
      // Group poses already operate in world coordinates and keep their full matrix.
      const local=l.groupPose?l:{...l,x:0,y:0},transform=l.groupPose?'':`translate(${l.x} ${l.y})`;
      return {id:l.id,transform,markup:layerMarkup(local,opts.interactive&&!opts.prepare,opts)};
    });
    const art=`<g opacity="${artOpacity}" mask="${artMask}">${artItems.map(item=>`<g transform="${item.transform}">${item.markup}</g>`).join('')}</g>`;
    return {under:cached.under,over:cached.over,art,artItems,artMask,artOpacity};
  }
  function renderView(project,key,opts={}){if(!opts.preview)return renderViewRaw(project,key,opts);const p=renderViewParts(project,key,opts);return p.under+p.art+p.over;}
  function standalone(project,key,id='preview',opts={}) {return `<svg xmlns="${NS}" viewBox="0 0 1000 600">${renderView(project,key,{...opts,id})}</svg>`;}
  function validateView(v,sourceOnly=false) {
    if(!v||!Array.isArray(v.regions)||v.regions.length>3500)throw new Error('Invalid car template.');
    const regions=v.regions.map(r=>{
      if(!['body','protected','detail','hidden'].includes(r.role))throw new Error('Invalid template region.');
      const clean=sanitize(`<svg xmlns="${NS}">${r.markup}</svg>`);for(const el of clean.querySelectorAll('*'))if(leaves.has(el.localName)&&!el.closest('defs,clipPath'))el.setAttribute('data-geometry','true');
      const b=r.bounds||{};return {id:M.uid(),name:M.name(r.name,'Region'),role:r.role,colour:r.colour?M.colour(r.colour,'#ffffff'):undefined,recovered:r.recovered===true,sourceRegionId:typeof r.sourceRegionId==='string'?r.sourceRegionId:undefined,contourIndex:Number.isInteger(r.contourIndex)?r.contourIndex:undefined,markup:clean.innerHTML,bounds:{x:M.number(b.x),y:M.number(b.y),w:M.number(b.w,100,1,10000),h:M.number(b.h,100,1,10000)}};
    });
    const b=v.bounds||{x:50,y:50,w:900,h:500};let photo=null;
    if(v.photo){if(!M.validImage(v.photo.src))throw new Error('Invalid reference photo.');photo={src:v.photo.src,x:M.number(v.photo.x),y:M.number(v.photo.y),w:M.number(v.photo.w,900,1,10000),h:M.number(v.photo.h,500,1,10000)};}
    let vectorSource,panelLabels=[];
    regions.forEach((r,i)=>{const original=v.regions[i];if(M.PART_LABELS.includes(original.partLabel))r.partLabel=original.partLabel;if(M.FINISHES.includes(original.finish))r.finish=original.finish;if(M.EFFECTS.includes(original.effect))r.effect=original.effect;r.paintVisible=original.paintVisible!==false;Object.assign(r,M.fillSettings(original));});
    if(v.vectorSource&&!sourceOnly){vectorSource=validateView(v.vectorSource,true);const ids=new Map(v.vectorSource.regions.map((r,i)=>[r.id,vectorSource.regions[i].id]));for(const r of regions)if(r.sourceRegionId){if(!ids.has(r.sourceRegionId))throw new Error('Invalid panel reference.');r.sourceRegionId=ids.get(r.sourceRegionId);}
      if(v.panelLabels){if(!Array.isArray(v.panelLabels)||v.panelLabels.length>250)throw new Error('Invalid panel labels.');panelLabels=v.panelLabels.map(a=>{if(!ids.has(a.sourceRegionId)||!Number.isInteger(a.contourIndex)||a.contourIndex< -1||a.contourIndex>1000||!M.PART_LABELS.includes(a.label))throw new Error('Invalid panel label.');return {sourceRegionId:ids.get(a.sourceRegionId),contourIndex:a.contourIndex,label:a.label,paintable:typeof a.paintable==='boolean'?a.paintable:undefined};});}
    }
    return {regions,bounds:{x:M.number(b.x),y:M.number(b.y),w:M.number(b.w,900,1,10000),h:M.number(b.h,500,1,10000)},source:v.source==='photo'?'photo':'svg',photo,showPhoto:!!photo,vectorSource,panelLabels};
  }
  let renderId=0;
  window.Vector={importSVG,sanitize,geometryMarkup,layerMarkup,renderView,renderViewParts,standalone,validateView};
})();
