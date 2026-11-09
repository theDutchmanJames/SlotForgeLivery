// Adapted from SlotForge Decals (AGPL-3.0-or-later), November 2026.
(function(){
 'use strict';const DM=window.DecalsModel;
 function arc(length,degrees){const angle=DM.number(degrees,-300,300,'Text bend');if(!angle)return null;length=DM.number(length,.001,1000000,'Text length');const a=Math.abs(angle)*Math.PI/180,r=length/a,x=r*Math.sin(a/2),y=Math.sign(angle)*r*(1-Math.cos(a/2));return `M ${-x} ${y} A ${r} ${r} 0 ${Math.abs(angle)>180?1:0} ${angle>0?1:0} ${x} ${y}`;}
 function data(contours,map=p=>p){return contours.map(c=>{if(!c.nodes.length)return '';const xy=p=>map(p).join(' '),nodes=c.nodes;let d='M '+xy(nodes[0].p);for(let n=1;n<nodes.length+(c.closed?1:0);n++){const prev=nodes[n-1],next=nodes[n%nodes.length];d+=' C '+xy(prev.o)+' '+xy(next.i)+' '+xy(next.p);}return d+(c.closed?' Z':'');}).join(' ');}
 const Finishing={arc},PathTools={data};const E=DM.esc,NS='http://www.w3.org/2000/svg';
 const tags=new Set('svg g defs path rect circle ellipse polygon polyline line text tspan textPath clipPath mask linearGradient radialGradient stop pattern image use style symbol title desc'.split(' '));
 const attributes=new Set('id d x y x1 y1 x2 y2 cx cy r rx ry width height points transform fill fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity fill-opacity stroke-opacity font-size font-family font-weight font-style text-anchor dominant-baseline letter-spacing viewBox preserveAspectRatio clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits gradientUnits gradientTransform offset stop-color stop-opacity spreadMethod patternUnits patternContentUnits patternTransform href xmlns xmlns:xlink style class vector-effect startOffset paint-order overflow color display visibility'.split(' '));
 function checkedCSS(css){
  return css.replace(/@font-face\s*\{[^}]*\}/gi,rule=>{
   const sheet=new CSSStyleSheet();sheet.replaceSync(rule);const style=sheet.cssRules[0]?.style;
   const family=style?.getPropertyValue('font-family').replace(/["']/g,'').trim(),src=style?.getPropertyValue('src').trim();
   if(!family||!/^[-a-zA-Z0-9_ ]{1,100}$/.test(family)||!/^url\(["']?data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z\d+/=]+["']?\)$/.test(src)||[...style].some(k=>!['font-family','src','font-style','font-weight'].includes(k)))throw Error('Use an embedded TTF, OTF, WOFF or WOFF2 font.');
   return '';
  });
 }
 function sanitize(source){
  if(typeof source!=='string'||source.length>12e6)throw Error('SVG exceeds the 12 MB artwork limit.');if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG document entities are not supported. Re-export as a plain SVG.');
  const doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=doc.documentElement;if(doc.querySelector('parsererror')||svg.localName!=='svg')throw Error('This file is not a valid SVG.');
  const elements=[svg,...svg.querySelectorAll('*')];if(elements.length>20000)throw Error('SVG exceeds 20,000 objects. Simplify it or import a high-resolution PNG.');
  for(const el of elements){if(el.namespaceURI!==NS||!tags.has(el.localName))throw Error(`SVG feature “${el.localName}” is not supported. Expand it in a vector editor or use a PNG.`);
   if(el.localName==='style'){const css=checkedCSS(el.textContent);if(/@|expression|javascript|\\|<|>/.test(css)||[...css.matchAll(/url\((.*?)\)/gi)].some(m=>!/^['"]?#[\w:.-]+['"]?$/.test(m[1].trim())))throw Error('SVG stylesheet uses unsupported or external resources.');}
   for(const a of [...el.attributes]){const key=a.localName;let val=a.value;if(key==='href'&&el.localName==='image'&&/^data:image\/(png|jpeg|webp);base64,/.test(val)){val=val.replace(/\s/g,'');a.value=val;}if(key.startsWith('on')||!attributes.has(a.name)&&!attributes.has(key)){el.removeAttributeNode(a);continue;}
    if(key==='href'){if(!/^#[\w:.-]+$/.test(val)&&!(el.localName==='image'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z\d+/=]+$/.test(val)))throw Error('SVG contains a linked image or resource. Embed it before importing.');}
    else if(/javascript:|expression\s*\(|@import|\\/i.test(val)||[...val.matchAll(/url\((.*?)\)/gi)].some(m=>!/^['"]?#[\w:.-]+['"]?$/.test(m[1].trim())))throw Error('SVG contains an unsupported resource reference.');
   }
  }
  const drawingCSS=new Set('fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity opacity font-size font-family font-weight font-style text-anchor dominant-baseline letter-spacing clip-path clip-rule mask stop-color stop-opacity vector-effect display visibility paint-order color transform transform-origin transform-box'.split(' '));
  const checkStyle=style=>{for(const property of style)if(!drawingCSS.has(property))throw Error(`SVG CSS property “${property}” is not supported. Expand the artwork or export a plain SVG.`);};
  for(const el of elements){if(el.hasAttribute('style'))checkStyle(el.style);if(el.localName==='style'){const sheet=new CSSStyleSheet();sheet.replaceSync(el.textContent);for(const rule of sheet.cssRules){if(!rule.style)throw Error('Unsupported SVG CSS rule.');if(rule.type!==5)checkStyle(rule.style);}}}
  const ids=new Map([...svg.querySelectorAll('[id]')].map(e=>[e.id,e]));
  let referenceWork=0;function check(el,trail=[],depth=0){if(++referenceWork>50000)throw Error('SVG expands to too many symbol references. Expand or simplify its symbols.');if(depth>30)throw Error('SVG references are too deeply nested. Expand its symbols first.');for(const u of (el.localName==='use'?[el]:el.querySelectorAll('use'))){const id=(u.getAttribute('href')||u.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').slice(1),target=ids.get(id);if(!target||trail.includes(id))throw Error('SVG has a missing or circular symbol reference.');check(target,[...trail,id],depth+1);}}
  check(svg);
  let vb=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);if(vb.length!==4||vb.some(v=>!Number.isFinite(v))||vb[2]<=0||vb[3]<=0){const w=parseFloat(svg.getAttribute('width')),h=parseFloat(svg.getAttribute('height'));if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('SVG needs a valid viewBox or width and height.');vb=[0,0,w,h];svg.setAttribute('viewBox',vb.join(' '));}
  const physical=v=>{const m=String(v||'').match(/^([\d.]+)\s*(mm|cm|in|pt)$/);return m?Number(m[1])*({mm:1,cm:10,in:25.4,pt:25.4/72}[m[2]]):null;};
  const widthMm=physical(svg.getAttribute('width')),heightMm=physical(svg.getAttribute('height'));
  svg.setAttribute('xmlns',NS);return{svg:new XMLSerializer().serializeToString(svg),viewBox:vb,widthMm,heightMm,complexity:elements.length,mixed:!!svg.querySelector('image')};
 }
 const svgCache=new Map();let svgCacheBytes=0;
 function svgBody(source,prefix){const key=prefix+source;if(svgCache.has(key))return svgCache.get(key);const doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=doc.documentElement;const ids=new Map([...svg.querySelectorAll('[id]')].map((n,j)=>[n.id,prefix+'-'+j]));for(const n of [svg,...svg.querySelectorAll('*')]){if(n.id)n.id=ids.get(n.id)||prefix;for(const a of [...n.attributes]){let val=a.value;val=val.replace(/url\(\s*['"]?#([\w:.-]+)['"]?\s*\)/g,(m,id)=>`url(#${ids.get(id)||id})`);if(a.localName==='href'&&val.startsWith('#'))val='#'+(ids.get(val.slice(1))||val.slice(1));n.setAttributeNS(a.namespaceURI,a.name,val);}if(n.localName==='style')n.textContent=n.textContent.replace(/#([\w-]+)/g,(m,id)=>ids.has(id)?'#'+ids.get(id):m);}
  // Font faces are document-wide even inside SVG. Keep each decal's embedded fonts isolated.
  const fontNames=new Map();for(const style of svg.querySelectorAll('style')){const css=new CSSStyleSheet();css.replaceSync(style.textContent);for(const rule of css.cssRules)if(rule.type===5){const family=rule.style.getPropertyValue('font-family').replace(/["']/g,'').trim();fontNames.set(family,prefix+'-font-'+fontNames.size);}}
  const fontList=value=>value.split(',').map(name=>fontNames.get(name.trim().replace(/["']/g,''))||name).join(',');
  if(fontNames.size)for(const node of [svg,...svg.querySelectorAll('*')]){if(node.hasAttribute('font-family'))node.setAttribute('font-family',fontList(node.getAttribute('font-family')));if(node.style?.fontFamily)node.style.fontFamily=fontList(node.style.fontFamily);if(node.localName==='style'){const css=new CSSStyleSheet();css.replaceSync(node.textContent);for(const rule of css.cssRules)if(rule.style?.fontFamily)rule.style.fontFamily=fontList(rule.style.fontFamily);node.textContent=[...css.cssRules].map(r=>r.cssText).join('');}}
  svg.setAttribute('id',prefix+'-root');
  for(const style of svg.querySelectorAll('style')){const css=new CSSStyleSheet();css.replaceSync(style.textContent);style.textContent=[...css.cssRules].map(rule=>{if(rule.type===5)return rule.cssText;if(!rule.selectorText)return '';const selector=rule.selectorText.split(',').map(s=>s.trim()===':root'||s.trim()==='svg'?'#'+prefix+'-root':'#'+prefix+'-root '+s.trim()).join(',');return selector+'{'+rule.style.cssText+'}';}).join('');}
  svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.style.removeProperty('width');svg.style.removeProperty('height');svg.setAttribute('preserveAspectRatio','none');const value=new XMLSerializer().serializeToString(svg);while(svgCache.size&&(svgCacheBytes+key.length+value.length>16e6||svgCache.size>=100)){const oldest=svgCache.keys().next().value;svgCacheBytes-=oldest.length+svgCache.get(oldest).length;svgCache.delete(oldest);}if(key.length+value.length<=16e6){svgCache.set(key,value);svgCacheBytes+=key.length+value.length;}return value;}
 let measureId=0;
 function textBox(i){
  const svg=document.createElementNS(NS,'svg'),t=document.createElementNS(NS,'text');svg.style.cssText='position:absolute;left:-9999px;visibility:hidden';
  for(const [key,value]of Object.entries({'font-family':i.font||'Arial','font-size':100,'font-weight':i.bold?700:400,'font-style':i.italic?'italic':'normal','letter-spacing':i.spacing||0}))t.setAttribute(key,String(value));
  t.textContent=i.text||' ';svg.append(t);document.body.append(svg);
  try{let advance;if(i.curve){advance=Math.max(.001,t.getComputedTextLength());const id='text-measure-'+(++measureId),path=document.createElementNS(NS,'path'),defs=document.createElementNS(NS,'defs'),tp=document.createElementNS(NS,'textPath');path.id=id;path.setAttribute('d',Finishing.arc(advance,i.curve));defs.append(path);svg.prepend(defs);tp.setAttribute('href','#'+id);tp.setAttribute('startOffset','50%');tp.setAttribute('text-anchor','middle');tp.textContent=i.text||' ';t.replaceChildren(tp);}
   const b=t.getBBox();return{x:b.x,y:b.y,w:Math.max(b.width,1),h:Math.max(b.height,1),...(advance?{advance}:{})};
  }finally{svg.remove();}
 }
 function bendText(i,value){const old=i.textBounds||textBox(i),w=i.w,h=i.h,k=h/old.h;i.curve=DM.number(value,-300,300,'Text bend');const b=textBox(i);i.textBounds=b;i.w=b.w*k;i.h=b.h*k;i.x+=(w-i.w)/2;i.y+=(h-i.h)/2;for(const pos of Object.values(i.carPositions||{})){pos.x+=(w-i.w)/2;pos.y+=(h-i.h)/2;}}

 function body(i,prefix='a',mode='all'){
  const content=rawBody(i,prefix,mode);
  return i.flipX||i.flipY?`<g data-mirror="true" transform="translate(${i.flipX?i.w:0} ${i.flipY?i.h:0}) scale(${i.flipX?-1:1} ${i.flipY?-1:1})">${content}</g>`:content;
 }
 function rawBody(i,prefix='a',mode='all'){
  const sw=i.strokeWidth||0,fill=E(i.fill||'#111827'),stroke=E(i.stroke||'#111827'),common=`fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`,x=sw/2,y=sw/2,w=Math.max(.01,i.w-sw),h=Math.max(.01,i.h-sw);
  switch(i.kind){
   case 'rect':return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(i.radius||0,w/2,h/2)}" ${common}/>`;
   case 'ellipse':return `<ellipse cx="${i.w/2}" cy="${i.h/2}" rx="${w/2}" ry="${h/2}" ${common}/>`;
   case 'path':return [true,false].map(closed=>{const contours=i.pathContours.filter(c=>c.closed===closed);return contours.length?`<path d="${PathTools.data(contours,p=>[x+p[0]*Math.max(.001,i.w-sw),y+p[1]*Math.max(.001,i.h-sw)])}" fill="${closed?fill:'none'}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`:'';}).join('');
   case 'polygon':return `<polygon points="${i.points.map(([a,b])=>[x+a*(i.w-2*x),y+b*(i.h-2*y)].join(',')).join(' ')}" ${common} stroke-linejoin="round"/>`;
   case 'triangle':return `<path d="M ${i.w/2} ${y} L ${i.w-x} ${i.h-y} L ${x} ${i.h-y} Z" ${common} stroke-linejoin="round"/>`;
   case 'line':return `<rect width="${i.w}" height="${i.h}" fill="${fill}"/>`;
   case 'stripe':return `<rect width="${i.w}" height="${i.h*.42}" fill="${fill}"/><rect y="${i.h*.58}" width="${i.w}" height="${i.h*.42}" fill="${E(i.fill2||'#245cc3')}"/>`;
   case 'text':{const b=i.textBounds&&(!i.curve||i.textBounds.advance)?i.textBounds:textBox(i),id=prefix+'-text-curve';const path=i.curve?Finishing.arc(b.advance,i.curve):null;const lettering=path?`<defs><path id="${E(id)}" d="${path}"/></defs>`:'';const contents=path?`<textPath href="#${E(id)}" startOffset="50%" text-anchor="middle">${E(i.text||' ')}</textPath>`:E(i.text||' ');return `<g transform="translate(${x} ${y}) scale(${w/b.w} ${h/b.h}) translate(${-b.x} ${-b.y})">${lettering}<text x="0" y="0" font-family="${E(i.font||'Arial')}" font-size="100" font-weight="${i.bold?'700':'400'}" font-style="${i.italic?'italic':'normal'}" letter-spacing="${i.spacing||0}" fill="${fill}" stroke="${stroke}" stroke-width="${sw*b.h/h}" stroke-linejoin="round" paint-order="stroke fill">${contents}</text></g>`;}
   case 'svg':return `<svg width="${i.w}" height="${i.h}" overflow="hidden">${svgBody(i.svg,prefix)}</svg>`;
   case 'image':return `<image href="${E(i.src)}" width="${i.w}" height="${i.h}" preserveAspectRatio="none"/>`;
   case 'slice':return `<defs><clipPath id="${prefix}-slice"><rect width="${i.w}" height="${i.h}"/></clipPath></defs><g clip-path="url(#${prefix}-slice)"><g transform="scale(${i.w/i.baseW} ${i.h/i.baseH})">${i.children.filter(c=>mode!=='white'||DM.hasWhite(c)).map((c,j)=>element(c,prefix+'s'+j,mode)).join('')}</g></g>`;
   case 'group':return `<g transform="scale(${i.w/i.baseW} ${i.h/i.baseH})">${i.children.filter(c=>mode!=='white'||i.ink!=='colour'||DM.hasWhite(c)).map((c,j)=>element(c,prefix+'c'+j,mode==='white'&&i.ink!=='colour'?'all':mode)).join('')}</g>`;
   default:return '';
  }
 }
 function element(i,prefix='a',mode='colour'){if(mode==='colour'&&i.ink==='white-only')return '';return `<g transform="translate(${i.x+i.w/2} ${i.y+i.h/2}) rotate(${i.rotation||0}) translate(${-i.w/2} ${-i.h/2})" opacity="${i.opacity??1}">${body(i,prefix,mode)}</g>`;}
 const fontsCSS=fonts=>fonts.map(f=>`@font-face{font-family:'${f.family}';src:url('${f.data}');}`).join('');
 function standalone(i,fonts=[]){const b=DM.bounds({...i,x:0,y:0});return `<svg xmlns="${NS}" width="${b.w}mm" height="${b.h}mm" viewBox="${b.x} ${b.y} ${b.w} ${b.h}"><style>${fontsCSS(fonts)}</style>${element({...i,x:0,y:0},'preview','all')}</svg>`;}
 const url=svg=>'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));
 function sheet(p,page,proof=false,white=false,dimensions,preview=false){const s=dimensions||DM.size(p);let content=p.items.filter(i=>i.page===page&&(white?DM.hasWhite(i):proof||preview||i.ink!=='white-only')).map((i,j)=>element(proof&&i.ink==='white-only'?{...i,fill:'#bf36a8',stroke:'#bf36a8'}:i,`p${page}i${j}`,white?'white':proof||preview?'all':'colour')).join('');if(proof){const bars=DM.proofBars(p);content+=`<path d="M 10 ${s.h-8} h ${bars.x} m ${-bars.x} -2 v 4 m ${bars.x} -4 v 4 M ${s.w-8} 10 v ${bars.y} m -2 ${-bars.y} h 4 m -4 ${bars.y} h 4" fill="none" stroke="#333" stroke-width=".2"/><text x="10" y="${s.h-15}" font-size="2.5" fill="#333">${bars.x} mm horizontal · ${bars.y} mm vertical</text><text x="10" y="${s.h-11}" font-size="2.5" fill="#333">PRINT AT ACTUAL SIZE / 100%</text><rect x="${p.margin}" y="${p.margin}" width="${s.w-p.margin*2}" height="${s.h-p.margin*2}" fill="none" stroke="#999" stroke-width=".15" stroke-dasharray="1 1"/>`;}
 return `<svg xmlns="${NS}" width="${s.w}mm" height="${s.h}mm" viewBox="0 0 ${s.w} ${s.h}"><style>${fontsCSS(p.fonts)}</style>${content}</svg>`;}
 async function masks(p,dimensions){const s=dimensions||DM.size(p),width=Math.round(s.w/25.4*600),height=Math.round(s.h/25.4*600),out=[];for(let page=0;page<p.pages;page++){if(!p.items.some(i=>i.page===page&&DM.hasWhite(i))){out.push(null);continue;}const img=new Image();img.src=url(sheet(p,page,false,true,dimensions));await img.decode();const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,width,height);const rgba=ctx.getImageData(0,0,width,height).data,stride=Math.ceil(width/8),bits=new Uint8Array(stride*height);bits.fill(255);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=128)bits[y*stride+(x>>3)]&=~(128>>(x&7));let binary='';for(let n=0;n<bits.length;n+=8192)binary+=String.fromCharCode(...bits.subarray(n,n+8192));out.push({width,height,bits:btoa(binary)});c.width=c.height=1;}return out;}
 function printHTML(p,proof=false,dimensions){const s=dimensions||DM.size(p);return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;"><style>@page{size:${s.w}mm ${s.h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:${s.w}mm;height:${s.h}mm;overflow:hidden;break-after:page}section:last-child{break-after:auto}svg{display:block}${fontsCSS(p.fonts)}</style></head><body>${Array.from({length:p.pages},(_,page)=>`<section>${sheet(p,page,proof,false,dimensions)}</section>`).join('')}</body></html>`;}
 const loadedFonts=new Map();let pinnedFonts=new Set();
 function trimFonts(required=new Set()){let bytes=[...loadedFonts.values()].reduce((n,f)=>n+f.data.length,0);for(const [family,f]of loadedFonts){if(loadedFonts.size<=48&&bytes<=24e6)break;if(pinnedFonts.has(family)||required.has(family))continue;document.fonts.delete(f.face);loadedFonts.delete(family);bytes-=f.data.length;}}
 function pinFonts(fonts){pinnedFonts=new Set(fonts.map(f=>f.family));trimFonts();}
 async function loadFonts(fonts){for(const f of fonts){const old=loadedFonts.get(f.family);if(old?.data===f.data){loadedFonts.delete(f.family);loadedFonts.set(f.family,old);continue;}const face=new FontFace(f.family,`url(${f.data})`);await face.load();if(old)document.fonts.delete(old.face);document.fonts.add(face);loadedFonts.set(f.family,{face,data:f.data});}trimFonts(new Set(fonts.map(f=>f.family)));}
 function inspectItems(items){for(const i of items){if(i.kind==='svg')i.svg=sanitize(i.svg).svg;if(['group','slice'].includes(i.kind))inspectItems(i.children);}return items;}
 window.DecalsArt={svgBody,sanitize,body,element,textBox,bendText,standalone,url,sheet,masks,printHTML,loadFonts,pinFonts,inspectItems};
})();
