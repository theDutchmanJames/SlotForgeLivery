const {test}=require('node:test');const assert=require('node:assert/strict');const M=require('../renderer/model.js');
test('uniform selection scaling preserves projective geometry, stripes and editable children',()=>{
 const items=[M.layer('rect',{x:250,y:210,w:180,h:80,rotation:22,skewX:16,pinchX:.4}),M.layer('line',{x:300,y:320,w:160,h:60,rotation:-12,lineStripes:[{width:8,colour:'#ff0000'},{width:3}],lineGap:4})];
 items.forEach(l=>{l.groupId='test';l.groupPose={x:220,y:180,w:350,h:240,rotation:14,pinchY:-.3,skewY:12};});
 const old=M.clone(items),anchor={x:100,y:150},scaled=M.scaleArtwork(items,1.6,anchor);
 for(let i=0;i<items.length;i++)for(let j=0;j<4;j++){const before=M.layerCorners(items[i])[j],after=M.layerCorners(scaled[i])[j];assert(Math.abs(after.x-(anchor.x+(before.x-anchor.x)*1.6))<1e-7);assert(Math.abs(after.y-(anchor.y+(before.y-anchor.y)*1.6))<1e-7);}
 assert.deepEqual(items,old);assert.deepEqual(scaled.map(l=>l.id),items.map(l=>l.id));assert.equal(scaled[1].lineStripes[0].width,12.8);assert.equal(scaled[1].lineGap,6.4);
 assert.throws(()=>M.scaleArtwork(items,0));assert.throws(()=>M.scaleArtwork(items,NaN));assert.throws(()=>M.scaleArtwork(items,1e6));assert.deepEqual(items,old);
});
test('artwork stacking keeps selected order, grouped elements and scoped child moves',()=>{
 const items=['a','b','c','d','e'].map(id=>({id})),ids=list=>list.map(l=>l.id).join('');
 assert.equal(ids(M.reorderArtwork(items,['b','d'],'front')),'acebd');assert.equal(ids(M.reorderArtwork(items,['b','d'],'back')),'bdace');
 assert.equal(ids(M.reorderArtwork(items,['b','d'],'forward')),'acbed');assert.equal(ids(M.reorderArtwork(items,['b','d'],'backward')),'badce');
 assert.equal(ids(M.reorderArtwork(items,['b'],'drop','d','above')),'acdbe');assert.equal(ids(M.reorderArtwork(items,['d'],'drop','b','below')),'adbce');
 items[1].groupId=items[2].groupId='g';assert.equal(ids(M.reorderArtwork(items,['b','c'],'front')),'adebc');assert.equal(ids(M.reorderArtwork(items,['b','c'],'forward')),'adbce');
 assert.equal(ids(M.reorderArtwork(items,['b'],'front',null,'above','g')),'acbde');assert.equal(ids(M.reorderArtwork(items,['c'],'drop','b','below','g')),'acbde');
 assert.equal(M.reorderArtwork(items,['b'],'drop','missing'),items);assert.equal(new Set(M.reorderArtwork(items,['b','c'],'back').map(l=>l.id)).size,5);
});
test('pinch maps corners, inverts editing coordinates and survives group baking and resizing',()=>{
 const near=(a,b)=>{assert(Math.abs(a.x-b.x)<1e-7);assert(Math.abs(a.y-b.y)<1e-7);};
 const l=M.layer('rect',{x:100,y:200,w:300,h:100,pinchX:.6});const corners=M.layerCorners(l);near(corners[0],{x:100,y:200});near(corners[1],{x:400,y:230});near(corners[2],{x:400,y:270});near(corners[3],{x:100,y:300});
 l.rotation=23;l.skewX=-17;l.pinchY=-.3;l.groupId='g';l.groupPose={x:300,y:300,w:500,h:300,pinchX:-.25,pinchY:.4,skewY:12};
 const matrix=M.layerMatrix(l);for(const p of [{x:0,y:0},{x:300,y:100},{x:44,y:63}])near(M.inversePoint(matrix,M.transformPoint(matrix,p)),p);
 const baked=M.bakeGroupPose(M.clone(l));M.layerCorners(l).forEach((p,i)=>near(p,M.layerCorners(baked)[i]));assert.equal(baked.projective.length,9);assert.equal(baked.groupPose,undefined);const valid=M.validateLayer(baked);M.layerCorners(valid).forEach((p,i)=>near(p,M.layerCorners(baked)[i]));
 const sized=M.clone(l),corner=M.transformPoint(matrix,{x:0,y:0});M.resizeLayer(sized,l,340,140);near(corner,M.transformPoint(M.layerMatrix(sized),{x:0,y:0}));
 const moved=M.clone(l);M.translateLayer(moved,20,-15,true);M.layerCorners(moved).forEach((p,i)=>near(p,{x:M.layerCorners(l)[i].x+20,y:M.layerCorners(l)[i].y-15}));
 assert.throws(()=>M.validateLayer({...baked,projective:[1,0,0,0,1,0,-2,0,1]}),/usable range/);
});
test('open Bézier lines retain controls, independent stroke widths and mirrored stripe order',()=>{
 const l=M.lineFromPoints([{x:100,y:300,out:{x:160,y:300},smooth:false},{x:300,y:180,in:{x:240,y:180},out:{x:360,y:180},smooth:false},{x:500,y:300}],{lineStripes:[{width:3,colour:'#ff0000'},{width:16},{width:3,colour:'#0000ff'}],lineGap:4});
 assert.equal(M.lineThickness(l),30);assert(!M.pathData(l.points,false).endsWith('Z'));const points=M.clone(l.points),h=l.h;M.setLineStyle(l,{stripes:[{width:20}],gap:0,cap:'round'});assert.equal(l.h,h);assert.deepEqual(l.points,points);assert.equal(M.lineThickness(l),20);assert(M.lineSamples(l).length>12);assert.deepEqual(M.validateLayer(l).points,points);
 l.lineStripes=[{width:3,colour:'#ff0000'},{width:16},{width:3,colour:'#0000ff'}];const mirrored=M.mirrorLayer(l);assert.equal(mirrored.lineStripes[0].colour,'#0000ff');assert.equal(mirrored.points[0].out.x,1-l.points[0].out.x);
});
test('editable line bands preserve width ratios and transforms through validation and groups',()=>{
 const l=M.lineFromEndpoints({x:100,y:200},{x:100,y:500},{lineStripes:[{width:3,colour:'#ffffff'},{width:16},{width:3}],lineGap:4,h:30});
 assert.equal(l.rotation,90);assert.equal(l.w,300);
 const m=M.layerMatrix(l),start=M.transformPoint(m,{x:0,y:l.h/2}),end=M.transformPoint(m,{x:l.w,y:l.h/2});
 assert(Math.abs(start.x-100)<1e-8&&Math.abs(start.y-200)<1e-8);assert(Math.abs(end.x-100)<1e-8&&Math.abs(end.y-500)<1e-8);
 l.h=.5;const style=M.lineStyle(l);M.setLineStyle(l,style);const valid=M.validateLayer(l);
 assert.equal(valid.h,.5);assert.deepEqual(M.lineStyle(valid),style);
 const asset=M.groupAsset([l,M.layer('rect')],'Badge'),placed=M.placeGroup(asset);
 assert.deepEqual(placed[0].lineStripes,l.lineStripes);assert.notEqual(placed[0].id,l.id);
 assert.throws(()=>M.validateLayer({...l,lineStripes:[]}),/1 and 5/);assert.throws(()=>M.validateLayer({...l,lineStripes:Array(6).fill({width:1})}),/1 and 5/);
 const mirror=M.mirrorLayer(l);assert.equal(mirror.rotation,-90);assert.deepEqual(mirror.lineStripes,l.lineStripes);
});
test('gradient validation bounds stops and prevents unsafe paint values',()=>{
 assert.throws(()=>M.validateGradient({stops:[]}),/2 and 8/);
 assert.throws(()=>M.validateGradient({stops:Array(9).fill({})}),/2 and 8/);
 const g=M.validateGradient({angle:900,strength:-1,scope:'bad',stops:[{offset:2,colour:'url(https://bad)'},{offset:-1,colour:'#ff0000'}]});
 assert.deepEqual(g,{angle:360,strength:0,scope:'view',stops:[{offset:0,colour:'#ff0000'},{offset:1,colour:'#ffffff'}]});
 assert.equal(M.mixColour('#000000','#ffffff',.5),'#808080');
 assert.equal(M.paintOf({base:'#ffffff',fillType:'gradient',gradient:g},{colour:'#ff0000'}).fillType,'solid');
 const layer=M.layer('rect',{fillType:'gradient',gradient:g});assert.deepEqual(M.validateLayer(layer).gradient,g);
});
test('fitting transforms are reversible and preserve editing geometry',()=>{
 const near=(a,b)=>{assert(Math.abs(a.x-b.x)<1e-8);assert(Math.abs(a.y-b.y)<1e-8);};
 const l=M.layer('rect',{x:170,y:210,w:130,h:65,rotation:23,skewX:30,skewY:-17,scaleX:.7,scaleY:.6,groupId:'g',groupPose:{x:400,y:300,skewX:-20,skewY:13,scaleX:.8,scaleY:.9}}),matrix=M.layerMatrix(l);
 for(const p of [{x:0,y:0},{x:130,y:65},{x:45,y:29}])near(M.inversePoint(matrix,M.transformPoint(matrix,p)),p);
 const baked=M.bakeGroupPose(M.clone(l));M.layerCorners(l).forEach((p,i)=>near(p,M.layerCorners(baked)[i]));assert.equal(baked.groupPose,undefined);
 for(const wholeGroup of [true,false]){const moved=M.clone(l);M.translateLayer(moved,27,-11,wholeGroup);M.layerCorners(l).forEach((p,i)=>near({x:p.x+27,y:p.y-11},M.layerCorners(moved)[i]));}
 const sized=M.clone(l);M.resizeLayer(sized,l,180,95);near(M.layerCorners(sized)[0],M.layerCorners(l)[0]);
 const mirrored=M.mirrorLayer(l);for(const p of [{x:0,y:0},{x:130,y:65},{x:65,y:20}]){const q=M.transformPoint(matrix,p),r=M.transformPoint(M.layerMatrix(mirrored),{x:l.w-p.x,y:p.y});near(r,{x:1000-q.x,y:q.y});}
 const validated=M.validateLayer(l);M.layerCorners(l).forEach((p,i)=>near(p,M.layerCorners(validated)[i]));assert.throws(()=>M.validateLayer({...l,affine:[1,1,1,1]}));assert.equal(M.validateLayer({...l,skewX:1000,scaleY:0}).skewX,60);assert.equal(M.validateLayer({...l,scaleY:0}).scaleY,.25);
 const project=M.newProject({name:'Same view',views:{left:{regions:[],bounds:{x:0,y:0,w:1000,h:600}}}});project.views.left=[l];const applied=M.applyLivery(project,M.liveryFromProject(project,'Fitted'));M.layerCorners(applied.views.left[0]).forEach((p,i)=>near(p,M.layerCorners(l)[i]));
});
test('Bézier controls survive normalisation, validation, grouping and mirroring',()=>{
 const points=[{x:100,y:100,in:{x:60,y:100},out:{x:140,y:100},smooth:true},{x:200,y:200,in:{x:200,y:150},out:{x:200,y:250},smooth:true},{x:80,y:240}];
 const l=M.shapeFromPoints(points),restored=M.mapPathPoints(l.points,p=>({x:l.x+p.x*l.w,y:l.y+p.y*l.h}));
 assert.deepEqual(restored,points);assert.match(M.pathData(points),/C 140 100 200 150 200 200/);assert.match(M.pathData(points),/C 80 240 60 100 100 100 Z$/);
 const valid=M.validateLayer(l);assert.deepEqual(valid.points,l.points);const mirror=M.mirrorLayer(l);assert.equal(mirror.points[0].out.x,1-l.points[0].out.x);assert.equal(mirror.points[0].in.y,l.points[0].in.y);const twice=M.mirrorLayer(mirror);twice.points.forEach((p,i)=>{for(const q of ['in','out',null]){const a=q?p[q]:p,b=q?l.points[i][q]:l.points[i];if(a){assert(Math.abs(a.x-b.x)<1e-12);assert(Math.abs(a.y-b.y)<1e-12);}}});
 const group=M.groupAsset([l,M.layer('rect')],'Curved badge'),placed=M.placeGroup(group);assert.deepEqual(placed[0].points,l.points);placed[0].points[0].out.x=.99;assert.notEqual(group.layers[0].points[0].out.x,.99);
 assert(!M.pathData([{x:0,y:0},{x:10,y:0},{x:10,y:10}]).includes('C'),'legacy corner shapes stay straight');
});
test('group assets retain editable geometry, styles and independent placements',()=>{
 const shapes=[M.layer('rect',{x:100,y:200,w:100,h:40,rotation:90,fill:'#112233'}),M.shapeFromPoints([{x:250,y:210},{x:300,y:250},{x:270,y:280}],{fill:'#445566',opacity:.6}),M.layer('text',{x:230,y:220,w:50,h:30,text:'27',font:'Impact'})];
 const asset=M.groupAsset(shapes,'Club badge'),first=M.placeGroup(asset),second=M.placeGroup(asset),b=M.artworkBounds(first);
 assert(Math.abs(b.x+b.w/2-500)<1e-9);assert(Math.abs(b.y+b.h/2-300)<1e-9);
 assert.equal(new Set(first.map(l=>l.groupId)).size,1);assert.notEqual(first[0].groupId,second[0].groupId);assert.notEqual(first[0].id,second[0].id);
 for(let i=0;i<shapes.length;i++){for(const key of ['kind','w','h','rotation','fill','opacity','text','font','points'])assert.deepEqual(first[i][key],shapes[i][key]);assert(Math.abs(first[i].x-first[0].x-(shapes[i].x-shapes[0].x))<1e-9);}
 first[1].points[0].x=.9;first[0].fill='#ffffff';assert.equal(asset.layers[1].points[0].x,0);assert.equal(shapes[0].fill,'#112233');assert.equal(second[0].fill,'#112233');
 const imported=first.map(M.validateLayer);assert.equal(imported[0].groupId,imported[1].groupId);assert.equal(imported[0].groupName,'Club badge');
 assert.throws(()=>M.groupAsset([],'Empty'));assert.throws(()=>M.groupAsset(Array(251).fill(shapes[0]),'Too many'));
});
test('projects retain independent template snapshots',()=>{const t={id:'t',name:'Car',views:{left:{regions:[]}}};const p=M.newProject(t);t.views.left.regions.push({name:'changed'});assert.equal(p.template.views.left.regions.length,0);});
test('livery fitting preserves image proportions but stretches colour blocks',()=>{const p=M.newProject({name:'Target',views:{left:{bounds:{x:100,y:100,w:600,h:200}}}});const l={base:'#ffffff',finish:'Gloss',effect:'Solid',bounds:{left:{x:0,y:0,w:300,h:200}},views:{left:[M.layer('image',{x:0,y:0,w:100,h:50}),M.layer('rect',{x:0,y:0,w:100,h:50})]}};const out=M.applyLivery(p,l);assert.equal(out.views.left[0].w/out.views.left[0].h,2);assert.equal(out.views.left[1].w,200);assert.equal(p.views.left.length,0);assert.notEqual(out.views.left[0].id,l.views.left[0].id);});
test('mirroring keeps lettering readable and mirrors shape points',()=>{const text=M.layer('text',{x:100,w:100,text:'27',rotation:10});assert.equal(M.mirrorLayer(text).x,800);assert.equal(M.mirrorLayer(text).rotation,10);const s=M.shapeFromPoints([{x:0,y:0},{x:40,y:0},{x:0,y:20}]);assert.equal(M.mirrorLayer(s).points[0].x,1);});
test('packages reject remote image references and unknown layer types',()=>{assert.throws(()=>M.validateLayer({kind:'image',src:'https://example.com/a.png'}));assert.throws(()=>M.validateLayer({kind:'script'}));assert.equal(M.validImage('data:image/svg+xml;base64,PHN2Zz4='),false);});
test('import validation clamps geometry and escapes labels',()=>{const l=M.validateLayer({kind:'rect',w:-5,rotation:9999,fill:'red;url(x)',name:'<script>'});assert.equal(l.w,2);assert.equal(l.rotation,279);assert.equal(l.fill,'#f28a35');assert.equal(M.escape(l.name),'&lt;script&gt;');});
test('livery snapshot retains missing-view artwork',()=>{const p=M.newProject({name:'One view',views:{left:{bounds:{x:0,y:0,w:1000,h:600}}}});const l={base:'#ffffff',finish:'Satin',effect:'Solid',views:{rear:[M.layer('text',{text:'27'})]}};const out=M.applyLivery(p,l);assert.equal(out.views.rear.length,1);assert.equal(out.views.left.length,0);});
test('livery paint follows labels on another car instead of source region order',()=>{
 const source=M.newProject({name:'Source',views:{left:{regions:[{role:'body',partLabel:'Bodywork',colour:'#123456',finish:'Matte'},{role:'body',partLabel:'Wheels',colour:'#222222',effect:'Metallic',paintVisible:false}]}}});
 const target=M.newProject({name:'Target',views:{left:{regions:[{role:'body',partLabel:'Wheels'},{role:'body',partLabel:'Bodywork'},{role:'body',partLabel:'Bodywork'}]}}});
 const saved=M.liveryFromProject(source,'Club'),copy=M.applyLivery(target,{...saved,panelPaints:M.validatePanelPaints(saved.panelPaints)});
 assert.deepEqual(copy.template.views.left.regions.map(r=>r.colour),['#222222','#123456','#123456']);assert.equal(copy.template.views.left.regions[0].paintVisible,false);assert.equal(copy.template.views.left.regions[1].finish,'Matte');assert.equal(target.template.views.left.regions[1].colour,undefined);
});
test('legacy liveries reset old area colour overrides to their new base',()=>{
 const p=M.newProject({name:'Target',views:{left:{regions:[{role:'body',partLabel:'Bodywork',colour:'#abcdef'}]}}});const out=M.applyLivery(p,{base:'#123456',finish:'Gloss',effect:'Solid',views:{}});assert.equal(out.template.views.left.regions[0].colour,undefined);assert.equal(out.base,'#123456');
});

test('edited polygons include extended anchors and Bezier controls in their bounds',()=>{
 const l=M.shapeFromPoints([{x:300,y:200},{x:500,y:200},{x:400,y:350}]);l.points[1].x=1.5;l.points[0].out={x:-.5,y:-.5};
 const b=M.layerLocalBounds(l);assert(b.x<0);assert(b.y<0);assert.equal(b.x+b.w,300);
});
test('rotation round trips preserve orientation beyond a complete turn',()=>{
 for(const angle of [-450,-720,450,9999]){const l=M.layer('rect',{rotation:angle}),copy=M.validateLayer(l);const p={x:17,y:42};const a=M.transformPoint(M.layerMatrix(l),p),b=M.transformPoint(M.layerMatrix(copy),p);assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);}
});
test('livery fitting scales curved stripe widths and gaps with the car',()=>{
 const view=(w,h)=>({regions:[],bounds:{x:0,y:0,w,h}}),p=M.newProject({name:'Large',views:{left:view(800,400)}});
 p.views.left=[M.lineFromPoints([{x:0,y:0},{x:800,y:400}],{lineStripes:[{width:20},{width:8}],lineGap:4})];
 const target=M.newProject({name:'Small',views:{left:view(400,200)}}),copy=M.applyLivery(target,M.liveryFromProject(p)).views.left[0];
 assert.equal(copy.w,400);assert.deepEqual(copy.lineStripes,[{width:10},{width:4}]);assert.equal(copy.lineGap,2);assert.equal(p.views.left[0].lineStripes[0].width,20);
});

test('custom font data survives layer validation and appearance copying',()=>{
 const data={name:'My font',family:'sf-font-'+ 'a'.repeat(64),src:'data:font/ttf;base64,AAEAAAAA'},l=M.layer('text',{text:'27',font:data.family,fontData:data}),copy=M.validateLayer(l);
 assert.deepEqual(copy.fontData,data);assert.equal(copy.font,data.family);
 const target=M.layer('text');M.applyAppearance(target,M.appearanceOf(copy));assert.deepEqual(target.fontData,data);
 M.applyAppearance(target,M.appearanceOf(M.layer('text',{font:'Arial'})));assert.equal(target.fontData,undefined);assert.equal(target.font,'Arial');
 assert.throws(()=>M.validateFontData({...data,src:'https://example.com/font.ttf'}));assert.throws(()=>M.validateFontData({...data,family:"bad';color:red"}));
});
