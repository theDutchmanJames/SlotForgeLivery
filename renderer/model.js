(function (root) {
  'use strict';
  const VIEWS = ['front','top','left','right','rear','angled'];
  const LABELS = { front:'Front',top:'Top',left:'Left',right:'Right',rear:'Rear',angled:'Angled' };
  const FINISHES = ['Matte','Satin','Gloss'];
  const PART_LABELS = ['Bodywork','Windows','Lights','Wheels','Tyres','Trim','Interior','Chassis'];
  const EFFECTS = ['Solid','Metallic','Pearl'];
  const uid = () => globalThis.crypto.randomUUID();
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colour = (v, fallback = '#f28a35') => /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  const number = (v, fallback = 0, min = -10000, max = 10000) => Number.isFinite(Number(v)) ? Math.max(min,Math.min(max,Number(v))) : fallback;
  const BUILTIN_FONTS=['Arial','Impact','Georgia','Verdana','Courier New'];
  function validateFontData(value){
    if(!value||!/^sf-font-[a-f0-9]{64}$/.test(value.family)||typeof value.src!=='string'||value.src.length>14*1024*1024||!/^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.src))throw new Error('Invalid embedded font.');
    return {name:name(value.name,'Imported font'),family:value.family,src:value.src};
  }
  const angle = v => Number.isFinite(Number(v)) ? Number(v) % 360 : 0;
  const name = (v, fallback = 'Untitled') => String(v || fallback).slice(0,180);
  function defaultGradient(fill='#f28a35'){return {angle:0,strength:1,scope:'view',stops:[{offset:0,colour:colour(fill)},{offset:1,colour:'#ffffff'}]};}
  function validateGradient(g){if(!g||!Array.isArray(g.stops)||g.stops.length<2||g.stops.length>8)throw new Error('A gradient needs between 2 and 8 colour stops.');return {angle:number(g.angle,0,0,360),strength:number(g.strength,1,0,1),scope:['view','label','area'].includes(g.scope)?g.scope:'view',stops:g.stops.map(s=>({offset:number(s.offset,0,0,1),colour:colour(s.colour,'#ffffff')})).sort((a,b)=>a.offset-b.offset)};}
  function fillSettings(item){const result={};if(item.fillType!==undefined)result.fillType=item.fillType==='gradient'?'gradient':'solid';if(item.gradient)result.gradient=validateGradient(item.gradient);return result;}
  function paintOf(p,r){return {fill:r?.colour||p.base||p.fill||'#ffffff',fillType:r?.fillType||(r?.colour?'solid':p.fillType||'solid'),gradient:r?.gradient||p.gradient,finish:r?.finish||p.finish||'Gloss',effect:r?.effect||p.effect||'Solid'};}
  // A detached style snapshot: geometry, content, visibility and grouping never enter it.
  function appearanceOf(item,project=null){
    const result={};
    if(item.kind!=='image'){const paint=project?paintOf(project,item):paintOf(item);result.paint={fill:paint.fill,fillType:paint.fillType,finish:paint.finish,effect:paint.effect};if(paint.gradient)result.paint.gradient=clone(paint.gradient);}
    if(item.kind)result.opacity=item.opacity??1;
    if(item.kind==='line')result.line=clone(lineStyle(item));
    if(item.kind==='text'){result.font=item.font||'Arial';if(item.fontData)result.fontData=clone(item.fontData);}
    return result;
  }
  function applyAppearance(item,appearance,mode='layer'){
    if(appearance.paint&&item.kind!=='image'){
      const p=clone(appearance.paint);item[mode==='panel'?'colour':mode==='base'?'base':'fill']=p.fill;
      item.fillType=p.fillType;item.finish=p.finish;item.effect=p.effect;
      delete item.gradient;if(p.gradient)item.gradient=p.gradient;
    }
    if(mode==='layer'&&appearance.opacity!==undefined)item.opacity=appearance.opacity;
    if(item.kind==='line'&&appearance.line)setLineStyle(item,appearance.line);
    if(item.kind==='text'&&appearance.font){item.font=appearance.font;delete item.fontData;if(appearance.fontData)item.fontData=clone(appearance.fontData);}
    return item;
  }
  function mixColour(a,b,t){const channel=(s,i)=>parseInt(colour(s).slice(i,i+2),16);return '#'+[1,3,5].map(i=>Math.round(channel(a,i)*(1-t)+channel(b,i)*t).toString(16).padStart(2,'0')).join('');}
  function emptyStore() { return { schema:1, templates:[], liveries:[], assets:[], fonts:[], projects:[], current:null }; }
  function newProject(template, title) { return { id:uid(), name:name(title,template.name+' · New livery'), template:clone(template), base:'#ffffff', finish:'Gloss', effect:'Solid', views:Object.fromEntries(VIEWS.map(k=>[k,[]])), notes:'', paints:'', updated:new Date().toISOString() }; }
  function layer(kind, props = {}) { return { id:uid(), kind, name:kind === 'text' ? 'Race number' : kind === 'image' ? 'Image decal' : kind === 'polygon' ? 'Custom shape' : kind === 'ellipse' ? 'Roundel' : kind === 'line' ? 'Racing stripe' : 'Colour shape', x:350,y:240,w:200,h:90, rotation:0, fill:'#f28a35',finish:'Gloss',effect:'Solid',opacity:1,visible:true, ...(kind==='line'?{h:12,lineStripes:[{width:12}],lineGap:4,lineCap:'butt'}:{}), ...props }; }
  function validateLayer(item) {
    if (!item || !['rect','ellipse','polygon','text','image','line'].includes(item.kind)) throw new Error('Unsupported artwork in package.');
    const out = layer(item.kind, { id:uid(), name:name(item.name), x:number(item.x), y:number(item.y), w:number(item.w,100,2,10000), h:number(item.h,50,item.kind==='line'?.5:2,10000), rotation:angle(item.rotation), fill:colour(item.fill), opacity:number(item.opacity,1,0,1), visible:item.visible !== false, finish:FINISHES.includes(item.finish)?item.finish:'Gloss',effect:EFFECTS.includes(item.effect)?item.effect:'Solid' });
    if(item.kind==='line'){if(!Array.isArray(item.lineStripes)||item.lineStripes.length<1||item.lineStripes.length>5)throw new Error('A line needs between 1 and 5 stripes.');out.lineStripes=item.lineStripes.map(s=>({width:number(s?.width,12,.000001,10000),...(s?.colour?{colour:colour(s.colour)}:{})}));out.lineGap=number(item.lineGap,4,0,10000);out.lineCap=item.lineCap==='round'?'round':'butt';}
    if (item.kind === 'text') { out.text = String(item.text || '27').slice(0,500); out.font = BUILTIN_FONTS.includes(item.font)?item.font:'Arial';if(item.fontData){out.fontData=validateFontData(item.fontData);out.font=out.fontData.family;} }
    if (item.kind === 'image') { if (!validImage(item.src)) throw new Error('Image must be an embedded PNG, JPEG or WebP.'); out.src=item.src; }
    if (item.kind === 'polygon'||item.kind==='line'&&item.points) { if (!Array.isArray(item.points) || item.points.length < (item.kind==='line'?2:3) || item.points.length > 2000) throw new Error('Invalid custom shape.'); out.points = item.points.map(p=>{const n={x:number(p.x,0,-10,10),y:number(p.y,0,-10,10)};for(const side of ['in','out'])if(p[side])n[side]={x:number(p[side].x,0,-10,10),y:number(p[side].y,0,-10,10)};if(n.in||n.out)n.smooth=p.smooth===true;return n;}); }
    if(typeof item.groupId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(item.groupId)){out.groupId=item.groupId;out.groupName=name(item.groupName,'Grouped artwork');out.groupHidden=item.groupHidden===true;}
    Object.assign(out,fitValues(item),pinchValues(item));
    Object.assign(out,fillSettings(item));
    if(item.affine!==undefined){if(!Array.isArray(item.affine)||item.affine.length!==4||!item.affine.every(v=>Number.isFinite(v)&&Math.abs(v)<=100)||Math.abs(item.affine[0]*item.affine[3]-item.affine[1]*item.affine[2])<1e-6)throw new Error('Invalid artwork transform.');out.affine=[...item.affine];}
    if(item.projective!==undefined){if(!Array.isArray(item.projective)||item.projective.length!==9||!item.projective.every(v=>Number.isFinite(v)&&Math.abs(v)<1e8)||Math.abs(determinant(item.projective))<1e-12)throw new Error('Invalid perspective transform.');out.projective=[...item.projective];}
    if(out.groupId&&item.groupPose)out.groupPose={...fitValues(item.groupPose),...pinchValues(item.groupPose),x:number(item.groupPose.x),y:number(item.groupPose.y),w:number(item.groupPose.w,100,1,10000),h:number(item.groupPose.h,100,1,10000)};
    if(out.projective){const m=homogeneous(layerMatrix(out)),b=layerLocalBounds(out),points=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}],den=points.map(p=>m[6]*p.x+m[7]*p.y+m[8]);if(!den.every(n=>n>1e-8)&&!den.every(n=>n< -1e-8)||points.some(p=>{const q=transformPoint(m,p);return !Number.isFinite(q.x)||!Number.isFinite(q.y)||Math.abs(q.x)>1e8||Math.abs(q.y)>1e8;}))throw new Error('Perspective extends beyond its usable range.');}
    return out;
  }
  function lineStyle(l){const stripes=l.lineStripes||[{width:12}],gap=l.lineGap??4,total=stripes.reduce((sum,s)=>sum+s.width,0)+gap*(stripes.length-1),scale=l.points?1:l.h/Math.max(.5,total);return {stripes:stripes.map(s=>({...s,width:s.width*scale})),gap:gap*scale,cap:l.lineCap||'butt'};}
  function setLineStyle(l,style){const h=style.stripes.reduce((sum,s)=>sum+s.width,0)+style.gap*(style.stripes.length-1);if(!l.points){l.y+=(l.h-h)/2;l.h=h;}l.lineStripes=clone(style.stripes);l.lineGap=style.gap;l.lineCap=style.cap;}
  function lineFromEndpoints(a,b,props={}){const l=layer('line',props),dx=b.x-a.x,dy=b.y-a.y;l.w=Math.max(2,Math.hypot(dx,dy));l.x=(a.x+b.x)/2-l.w/2;l.y=(a.y+b.y)/2-l.h/2;l.rotation=Math.atan2(dy,dx)*180/Math.PI;return l;}
  function pinchValues(v={}){return {pinchX:number(v.pinchX,0,-.8,.8),pinchY:number(v.pinchY,0,-.8,.8)};}
  function homogeneous(m){return m.length===9?m:[m[0],m[2],m[4],m[1],m[3],m[5],0,0,1];}
  function determinant(m){return m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);}
  function inverseMatrix(m){const d=determinant(m);return [(m[4]*m[8]-m[5]*m[7])/d,(m[2]*m[7]-m[1]*m[8])/d,(m[1]*m[5]-m[2]*m[4])/d,(m[5]*m[6]-m[3]*m[8])/d,(m[0]*m[8]-m[2]*m[6])/d,(m[2]*m[3]-m[0]*m[5])/d,(m[3]*m[7]-m[4]*m[6])/d,(m[1]*m[6]-m[0]*m[7])/d,(m[0]*m[4]-m[1]*m[3])/d];}
  function pinchMatrix(v,b){const {pinchX:x,pinchY:y}=pinchValues(v);if(!x&&!y)return [1,0,0,1,0,0];const taper=p=>{const a=Math.abs(p),m=[1,0,0,a/2,1-a,0,a,0,1-a];return p<0?matrixMultiply([-1,0,0,1,1,0],matrixMultiply(m,[-1,0,0,1,1,0])):m;},swap=[0,1,1,0,0,0];let m=x?taper(x):[1,0,0,1,0,0];if(y)m=matrixMultiply(matrixMultiply(swap,matrixMultiply(taper(y),swap)),m);return matrixMultiply([b.w,0,0,b.h,b.x,b.y],matrixMultiply(m,[1/b.w,0,0,1/b.h,-b.x/b.w,-b.y/b.h]));}
  function lineThickness(l){const s=lineStyle(l);return s.stripes.reduce((n,a)=>n+a.width,0)+s.gap*(s.stripes.length-1);}
  function layerLocalBounds(l){if((l.kind==='line'||l.kind==='polygon')&&l.points){const b=pathBounds(mapPathPoints(l.points,p=>({x:p.x*l.w,y:p.y*l.h}))),pad=l.kind==='line'?lineThickness(l)/2:0;return {x:b.x-pad,y:b.y-pad,w:b.w+2*pad,h:b.h+2*pad};}return {x:0,y:0,w:l.w,h:l.h};}
  function lineFromPoints(points,props={}){const b=pathBounds(points);return layer('line',{...props,...b,points:mapPathPoints(points,p=>({x:(p.x-b.x)/b.w,y:(p.y-b.y)/b.h})),rotation:0});}
  // Flatten the centre path finely enough for smooth parallel offset strokes.
  function lineSamples(l){const points=mapPathPoints(l.points,p=>({x:p.x*l.w,y:p.y*l.h})),out=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],c=a.out||a,d=b.in||b;const length=Math.hypot(c.x-a.x,c.y-a.y)+Math.hypot(d.x-c.x,d.y-c.y)+Math.hypot(b.x-d.x,b.y-d.y),steps=a.out||b.in?Math.min(200,Math.max(12,Math.ceil(length/3))):1;for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;const p={x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};if(Math.hypot(p.x-out.at(-1).x,p.y-out.at(-1).y)>.0001)out.push(p);}}return out;}
  function offsetPath(points,offset){if(!offset)return pathData(points,false);return pathData(points.map((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],normal=(a,b)=>{const n=Math.hypot(b.x-a.x,b.y-a.y)||1;return {x:-(b.y-a.y)/n,y:(b.x-a.x)/n};},a=normal(i?prev:p,i?p:next),b=normal(i<points.length-1?p:prev,i<points.length-1?next:p),den=Math.max(.25,1+a.x*b.x+a.y*b.y);return {x:p.x+offset*(a.x+b.x)/den,y:p.y+offset*(a.y+b.y)/den};}),false);}
  function validImage(src) { return typeof src === 'string' && src.length <= 16e6 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(src); }
  function validatePanelPaints(value){const result={};if(!value)return result;for(const k of VIEWS){if(value[k]!==undefined&&!Array.isArray(value[k]))throw new Error('Invalid labelled paint layers.');if((value[k]||[]).length>3500)throw new Error('Too many labelled paint layers.');result[k]=(value[k]||[]).map(r=>({label:PART_LABELS.includes(r.label)?r.label:'',colour:colour(r.colour,'#ffffff'),finish:FINISHES.includes(r.finish)?r.finish:'Gloss',effect:EFFECTS.includes(r.effect)?r.effect:'Solid',visible:r.visible!==false,...fillSettings(r)}));}return result;}
  function liveryFromProject(p, title) { return { id:uid(), name:name(title,p.name), base:p.base,finish:p.finish,effect:p.effect,...fillSettings(p), views:clone(p.views),panelPaints:Object.fromEntries(Object.entries(p.template.views).map(([k,v])=>[k,v.regions.filter(r=>r.role==='body').map(r=>({label:r.partLabel||'',colour:r.colour||p.base,finish:r.finish||p.finish,effect:r.effect||p.effect,visible:r.paintVisible!==false,...fillSettings(paintOf(p,r))}))])),bounds:Object.fromEntries(Object.entries(p.template.views).map(([k,v])=>[k,v.bounds || {x:50,y:50,w:900,h:500}])),notes:p.notes,paints:p.paints,updated:new Date().toISOString() }; }
  function applyLivery(project, livery) {
    const result=clone(project); result.base=colour(livery.base,'#ffffff');result.finish=livery.finish;result.effect=livery.effect;result.notes=livery.notes || '';result.paints=livery.paints || '';delete result.fillType;delete result.gradient;Object.assign(result,fillSettings(livery));
    for (const k of VIEWS) {
      const from=livery.bounds?.[k] || {x:0,y:0,w:1000,h:600}, to=result.template.views[k]?.bounds || from;
      const sx=to.w/Math.max(1,from.w),sy=to.h/Math.max(1,from.h);
      result.views[k]=(livery.views[k] || []).map(l=>{
        const n=bakeGroupPose(clone(l));n.id=uid();const cx=to.x+((n.x+n.w/2)-from.x)*sx,cy=to.y+((n.y+n.h/2)-from.y)*sy;
        const preserve=['text','image','ellipse'].includes(l.kind);n.w=n.w*(preserve?Math.min(sx,sy):sx);n.h=n.h*(preserve?Math.min(sx,sy):sy);n.x=cx-n.w/2;n.y=cy-n.h/2;if(n.kind==='line'&&n.points){const scale=Math.min(sx,sy);n.lineStripes=n.lineStripes.map(s=>({...s,width:s.width*scale}));n.lineGap*=scale;}return n;
      });
      const counts=new Map();for(const r of result.template.views[k]?.regions||[]){if(r.role!=='body')continue;delete r.colour;delete r.finish;delete r.effect;delete r.fillType;delete r.gradient;r.paintVisible=true;const label=r.partLabel||'',matches=(livery.panelPaints?.[k]||[]).filter(p=>p.label===label),i=counts.get(label)||0;counts.set(label,i+1);const paint=matches[i]||matches[0];if(paint){r.colour=colour(paint.colour,'#ffffff');r.finish=paint.finish;r.effect=paint.effect;r.paintVisible=paint.visible!==false;Object.assign(r,fillSettings(paint));}}
    } return result;
  }
  function rotatedPoint(p,c,angle) { const a=angle*Math.PI/180; return {x:c.x+(p.x-c.x)*Math.cos(a)-(p.y-c.y)*Math.sin(a),y:c.y+(p.x-c.x)*Math.sin(a)+(p.y-c.y)*Math.cos(a)}; }
  function boundsOfPoints(points) { const xs=points.map(p=>p.x),ys=points.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(2,Math.max(...xs)-x),h:Math.max(2,Math.max(...ys)-y)}; }
  function fitValues(v={}){return {skewX:number(v.skewX,0,-60,60),skewY:number(v.skewY,0,-60,60),scaleX:number(v.scaleX,1,.25,1.5),scaleY:number(v.scaleY,1,.25,1.5)};}
  // SVG affine matrices: [a,b,c,d,e,f]. One transform drives rendering and all editing handles.
  function matrixMultiply(a,b){if(a.length===9||b.length===9){a=homogeneous(a);b=homogeneous(b);return Array.from({length:9},(_,i)=>[0,1,2].reduce((sum,k)=>sum+a[Math.floor(i/3)*3+k]*b[k*3+i%3],0));}return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
  function transformPoint(m,p){if(m.length===9){const d=m[6]*p.x+m[7]*p.y+m[8];return {x:(m[0]*p.x+m[1]*p.y+m[2])/d,y:(m[3]*p.x+m[4]*p.y+m[5])/d};}return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
  function inversePoint(m,p){if(m.length===9)return transformPoint(inverseMatrix(m),p);const det=m[0]*m[3]-m[1]*m[2],x=p.x-m[4],y=p.y-m[5];return {x:(m[3]*x-m[2]*y)/det,y:(-m[1]*x+m[0]*y)/det};}
  function fitMatrix(v){const f=fitValues(v),x=Math.tan(f.skewX*Math.PI/180),y=Math.tan(f.skewY*Math.PI/180);return [(1+x*y)*f.scaleX,y*f.scaleX,x*f.scaleY,f.scaleY,0,0];}
  function groupMatrix(l){const p=l.groupPose;if(!p)return [1,0,0,1,0,0];const m=fitMatrix(p);m[4]=p.x-m[0]*p.x-m[2]*p.y;m[5]=p.y-m[1]*p.x-m[3]*p.y;return matrixMultiply(m,pinchMatrix(p,{x:p.x-(p.w||100)/2,y:p.y-(p.h||100)/2,w:p.w||100,h:p.h||100}));}
  function layerMatrix(l){const a=(l.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),base=l.affine?[...l.affine,0,0]:[1,0,0,1,0,0];let m=matrixMultiply([c,s,-s,c,0,0],matrixMultiply(fitMatrix(l),base));m[4]=l.x+l.w/2-m[0]*l.w/2-m[2]*l.h/2;m[5]=l.y+l.h/2-m[1]*l.w/2-m[3]*l.h/2;if(l.projective)m=matrixMultiply(m,matrixMultiply([l.w,0,0,l.h,0,0],matrixMultiply(l.projective,[1/l.w,0,0,1/l.h,0,0])));m=matrixMultiply(m,pinchMatrix(l,layerLocalBounds(l)));return matrixMultiply(groupMatrix(l),m);}
  function layerCorners(l){const m=layerMatrix(l),b=layerLocalBounds(l);return [{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}].map(p=>transformPoint(m,p));}
  function artworkBounds(items){return boundsOfPoints(items.flatMap(layerCorners));}
  function bakeGroupPose(l){if(!l.groupPose)return l;const m=layerMatrix(l);if(m.length===9){const b=artworkBounds([l]);l.x=b.x+b.w/2-l.w/2;l.y=b.y+b.h/2-l.h/2;l.projective=matrixMultiply([1/l.w,0,0,1/l.h,-l.x/l.w,-l.y/l.h],matrixMultiply(m,[l.w,0,0,l.h,0,0]));delete l.affine;delete l.groupPose;l.rotation=0;Object.assign(l,fitValues(),pinchValues());return l;}const c=transformPoint(m,{x:l.w/2,y:l.h/2});l.x=c.x-l.w/2;l.y=c.y-l.h/2;l.affine=m.slice(0,4);l.rotation=0;Object.assign(l,fitValues());delete l.groupPose;return l;}
  function translateLayer(l,dx,dy,wholeGroup=false){if(l.groupPose&&!wholeGroup){const g=groupMatrix(l),center={x:l.x+l.w/2,y:l.y+l.h/2},world=transformPoint(g,center),after=inversePoint(g,{x:world.x+dx,y:world.y+dy}),delta={x:after.x-center.x,y:after.y-center.y};l.x+=delta.x;l.y+=delta.y;}else{l.x+=dx;l.y+=dy;if(l.groupPose){l.groupPose.x+=dx;l.groupPose.y+=dy;}}}
  function resizeLayer(l,original,w,h){const corner=transformPoint(layerMatrix(original),{x:0,y:0}),target=inversePoint(groupMatrix(original),corner);l.w=w;l.h=h;const current=transformPoint(layerMatrix({...l,groupPose:undefined}),{x:0,y:0});l.x+=target.x-current.x;l.y+=target.y-current.y;}
  function groupAsset(items,title){if(!items.length||items.length>250)throw new Error('Select between 1 and 250 artwork elements.');const copies=items.map(l=>bakeGroupPose(clone(l))),b=artworkBounds(copies);return {id:uid(),name:name(title,'Grouped artwork'),type:'group',layers:copies.map(n=>{n.id=uid();n.x-=b.x;n.y-=b.y;delete n.groupId;delete n.groupName;delete n.groupHidden;return n;})};}
  function placeGroup(asset,cx=500,cy=300){const b=artworkBounds(asset.layers),groupId=uid();return asset.layers.map(l=>({...clone(l),id:uid(),groupId,groupName:asset.name,groupHidden:false,x:l.x+cx-b.x-b.w/2,y:l.y+cy-b.y-b.h/2}));}
  function mapPathPoints(points,transform){return points.map(p=>{const n={...p,...transform(p)};for(const side of ['in','out'])if(p[side])n[side]=transform(p[side]);return n;});}
  function pathBounds(points){return boundsOfPoints(points.flatMap(p=>[p,...(p.in?[p.in]:[]),...(p.out?[p.out]:[])]));}
  function pathData(points,closed=true){if(!points.length)return '';let d=`M ${points[0].x} ${points[0].y}`;for(let i=1;i<points.length+(closed?1:0);i++){const a=points[i-1],b=points[i%points.length],c=a.out||a,f=b.in||b;d+=a.out||b.in?` C ${c.x} ${c.y} ${f.x} ${f.y} ${b.x} ${b.y}`:` L ${b.x} ${b.y}`;}return d+(closed?' Z':'');}
  function shapeFromPoints(points, props={}) {const b=pathBounds(points);return layer('polygon',{...b,points:mapPathPoints(points,p=>({x:(p.x-b.x)/b.w,y:(p.y-b.y)/b.h})),...props});}
  function mirrorLayer(l) { const n=bakeGroupPose(clone(l));n.id=uid();n.x=1000-n.x-n.w;if(!['image','text'].includes(l.kind)){n.rotation=-n.rotation;n.skewX=-(n.skewX||0);n.skewY=-(n.skewY||0);n.pinchX=-(n.pinchX||0);if(n.projective){const flip=[-1,0,0,1,1,0];n.projective=matrixMultiply(flip,matrixMultiply(n.projective,flip));}if(n.affine){n.affine[1]*=-1;n.affine[2]*=-1;}if(n.points){n.points=mapPathPoints(n.points,p=>({x:1-p.x,y:p.y}));if(n.kind==='line')n.lineStripes.reverse();}}return n; }
  // The array is back-to-front. Groups move as units; a child can be reordered within its group.
  function reorderArtwork(items,ids,action,targetKey=null,side='above',scope=null){
    const chosen=new Set(ids),source=scope?items.filter(l=>l.groupId===scope):items;
    const units=[],seen=new Set();
    for(const l of [...source].reverse()){const key=!scope&&l.groupId?'group:'+l.groupId:l.id;if(seen.has(key))continue;seen.add(key);units.unshift({key,items:!scope&&l.groupId?source.filter(a=>a.groupId===l.groupId):[l]});}
    const selected=u=>u.items.some(l=>chosen.has(l.id));let result=[...units];
    if(action==='front'||action==='back'){const moved=units.filter(selected),rest=units.filter(u=>!selected(u));result=action==='front'?[...rest,...moved]:[...moved,...rest];}
    if(action==='forward'){for(let i=result.length-2;i>=0;i--)if(selected(result[i])&&!selected(result[i+1]))[result[i],result[i+1]]=[result[i+1],result[i]];}
    if(action==='backward'){for(let i=1;i<result.length;i++)if(selected(result[i])&&!selected(result[i-1]))[result[i],result[i-1]]=[result[i-1],result[i]];}
    if(action==='drop'){const target=units.find(u=>u.key===targetKey);if(!target||selected(target))return items;const moved=units.filter(selected),rest=units.filter(u=>!selected(u)),index=rest.findIndex(u=>u.key===targetKey)+(side==='above'?1:0);rest.splice(index,0,...moved);result=rest;}
    if(!units.some(selected))return items;
    const ordered=result.flatMap(u=>u.items);if(!scope)return ordered;
    let index=0;return items.map(l=>l.groupId===scope?ordered[index++]:l);
  }
  const API={BUILTIN_FONTS,validateFontData,VIEWS,LABELS,PART_LABELS,FINISHES,EFFECTS,uid,clone,escape,colour,number,angle,name,emptyStore,newProject,layer,validateLayer,validatePanelPaints,validImage,liveryFromProject,applyLivery,rotatedPoint,boundsOfPoints,artworkBounds,groupAsset,placeGroup,mapPathPoints,pathBounds,pathData,shapeFromPoints,mirrorLayer,fitValues,fitMatrix,matrixMultiply,transformPoint,inversePoint,groupMatrix,layerMatrix,layerCorners,bakeGroupPose,translateLayer,resizeLayer,defaultGradient,validateGradient,fillSettings,paintOf,mixColour,lineStyle,setLineStyle,lineFromEndpoints,pinchValues,pinchMatrix,homogeneous,inverseMatrix,layerLocalBounds,lineThickness,lineFromPoints,lineSamples,offsetPath,reorderArtwork,appearanceOf,applyAppearance};
  if(typeof module!=='undefined')module.exports=API; else root.Model=API;
})(globalThis);
