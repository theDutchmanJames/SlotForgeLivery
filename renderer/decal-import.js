(function(){
 'use strict';
 const A=window.DecalArtwork;let serial=0;
 async function open(file){
  const ticket=++serial,owner=project?.id,view=currentView,name=file.name.replace(/\.[^.]+$/,''),ext=file.name.split('.').pop().toLowerCase();
  const live=()=>ticket===serial&&$('#dialog').open&&!!$('#decal-import-marker');
  openDialog('Import decal artwork',file.name,'<p id="decal-import-marker">Reading your artwork…</p>','<button data-action="close-dialog">Cancel</button>');
  try{
   if(['sfsheet','sfdecal'].includes(ext)){
    if(file.size>160e6)throw Error('Choose a Decals export smaller than 160 MB.');
    const raw=JSON.parse(await file.text());if(!live())return;
    const entries=await A.readPackage(raw);if(!live())return;review(entries,{owner,view,name});return;
   }
   let source;
   if(ext==='svg'){if(file.size>12e6)throw Error('Choose an SVG smaller than 12 MB.');source=await file.text();}
   else {
    if(!window.desktop)throw Error('EPS and PDF import require the desktop app.');
    if(file.size>25*1024*1024)throw Error('Choose an EPS or PDF smaller than 25 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());if(!live())return;
    let result=await window.desktop.convertVector({bytes,format:ext,purpose:'decal'});if(!live())return;
    if(!result.svg){
     openDialog('Choose a PDF page',`${result.pages} pages`, `<div id="decal-import-marker" class="field"><label for="decal-pdf-page">Page</label><input id="decal-pdf-page" type="number" min="1" max="${result.pages}" value="1"></div>`,'<button data-action="close-dialog">Cancel</button><button class="primary" id="decal-read-page">Open page</button>');
     $('#decal-read-page').onclick=async()=>{const page=Number($('#decal-pdf-page').value);if(!Number.isInteger(page)||page<1||page>result.pages)return toast('Choose a valid page number.');$('#decal-read-page').disabled=true;try{result=await window.desktop.convertVector({bytes,format:ext,page,purpose:'decal'});if(live())sheet(result.svg,{owner,view,name:name+' · Page '+page});}catch(error){if(live()){reportError(error);$('#decal-read-page').disabled=false;}}};return;
    }
    source=result.svg;
   }
   if(live())sheet(source,{owner,view,name});
  }catch(error){if(live()){closeDialog();reportError(error);}}
 }
 function sheet(source,context){
  const original=A.sanitize(source).svg;let clean=original,boxes=[],drag=null;
  openDialog('Prepare decal artwork','Import the whole graphic, or mark individual decals on a sheet.',`<div id="decal-import-marker" class="decal-toolbar"><label><input id="decal-split" type="checkbox"> Select separate decals</label><label><input id="decal-white-page" type="checkbox"> Remove white page background</label><button id="decal-remove-box" disabled>Undo area</button><button id="decal-fit-sheet">Fit sheet</button><button id="decal-zoom-out" aria-label="Zoom out">−</button><button id="decal-zoom-in" aria-label="Zoom in">+</button></div><p class="note">For an exact transfer of separate decals, choose a <b>.sfsheet</b> or <b>.sfdecal</b> export from Decals. PDF files may have lost their object groups. Here, drag a box tightly around each decal you want. Crops retain vector artwork; overlapping boxes can include the same artwork.</p><div class="decal-sheet-wrap"><svg id="decal-sheet-preview" aria-label="Select separate decals from the sheet"></svg></div><p class="note" id="decal-area-count" role="status"></p>`,'<button data-action="close-dialog">Cancel</button><button class="primary" id="decal-review">Continue</button>');
  $('#dialog').classList.add('decal-import-dialog');const svg=$('#decal-sheet-preview'),vb=A.sanitize(clean).viewBox;let camera=[...vb];
  const point=ev=>{const p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(svg.getScreenCTM().inverse());return{x:Math.max(vb[0],Math.min(vb[0]+vb[2],p.x)),y:Math.max(vb[1],Math.min(vb[1]+vb[3],p.y))};};
  const paint=()=>{svg.setAttribute('viewBox',camera.join(' '));svg.innerHTML=`<svg x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}">${A.markup(clean)}</svg>`+boxes.map((b,i)=>`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#e5484d33" stroke="#e5484d" vector-effect="non-scaling-stroke"/><text x="${b.x}" y="${b.y}" font-size="${camera[2]/60}" fill="#e5484d">${i+1}</text>`).join('')+'<rect id="decal-drag-box" fill="#e5484d33" stroke="#e5484d" vector-effect="non-scaling-stroke"/>';$('#decal-area-count').textContent=$('#decal-split').checked?`${boxes.length} separate decals selected · Drag to add an area · Wheel to zoom`:'The complete graphic will be one vector decal.';$('#decal-remove-box').disabled=!boxes.length;$('#decal-review').disabled=$('#decal-split').checked&&!boxes.length;};
  const zoom=f=>{const w=camera[2]*f,h=camera[3]*f;if(w<vb[2]/20||w>vb[2]*2)return;camera=[camera[0]+(camera[2]-w)/2,camera[1]+(camera[3]-h)/2,w,h];paint();};
  $('#decal-zoom-in').onclick=()=>zoom(.8);$('#decal-zoom-out').onclick=()=>zoom(1.25);$('#decal-fit-sheet').onclick=()=>{camera=[...vb];paint();};
  svg.onwheel=ev=>{ev.preventDefault();const at=point(ev),f=ev.deltaY<0?.8:1.25,w=camera[2]*f,h=camera[3]*f;if(w<vb[2]/20||w>vb[2]*2)return;camera=[at.x+(camera[0]-at.x)*f,at.y+(camera[1]-at.y)*f,w,h];paint();};
  svg.onpointerdown=ev=>{if(ev.button!==0||!$('#decal-split').checked)return;ev.preventDefault();drag=point(ev);svg.setPointerCapture(ev.pointerId);};
  svg.onpointermove=ev=>{if(!drag)return;const p=point(ev),b=rect(drag,p),node=$('#decal-drag-box');for(const [k,v]of Object.entries({x:b.x,y:b.y,width:b.w,height:b.h}))node.setAttribute(k,v);};
  svg.onpointerup=ev=>{if(!drag)return;const b=rect(drag,point(ev));drag=null;svg.releasePointerCapture(ev.pointerId);if(b.w>vb[2]/2000&&b.h>vb[3]/2000){if(boxes.length>=250)toast('Import up to 250 areas at a time.');else boxes.push(b);}paint();};
  svg.onpointercancel=()=>{drag=null;paint();};svg.onlostpointercapture=()=>{if(drag){drag=null;paint();}};
  $('#decal-split').onchange=paint;$('#decal-white-page').onchange=()=>{clean=$('#decal-white-page').checked?A.removePageBackground(original):original;paint();};
  $('#decal-remove-box').onclick=()=>{boxes.pop();paint();};
  $('#decal-review').onclick=()=>{const entries=$('#decal-split').checked?boxes.map((b,i)=>({name:context.name+' · Decal '+(i+1),svg:clean,crop:{...b},selected:true})): [{name:context.name,svg:clean,selected:true}];review(entries,context);};paint();
 }
 function rect(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
 function review(entries,context){
  let page=0,filter='',approvedBatch='';const chosenIds=new Set(entries.slice(0,250).map((_,i)=>i));
  const canPlace=()=>project?.id===context.owner&&currentView===context.view&&activeView()?.regions.some(r=>r.role==='body');
  openDialog('Choose decals to import',`${entries.length} separate ${entries.length===1?'decal':'decals'} · Original vector detail and embedded images are preserved.`,`<div id="decal-import-marker" class="decal-toolbar"><input id="decal-search" placeholder="Find a decal, sheet or page…" aria-label="Find decals"><button id="decal-select-shown">Select shown</button><button id="decal-clear-selection">Clear selection</button></div><p class="note">Each selected decal becomes its own layer or library item. You can move, scale, rotate and fit them individually; their original graphic colours are retained. Text and paths inside imported artwork stay vector graphics, rather than Livery text or point-editing tools.</p><div id="decal-import-items" class="decal-import-items"></div><div class="decal-toolbar"><button id="decal-prev">Previous</button><span id="decal-page"></span><button id="decal-next">Next</button><span id="decal-selection-count" role="status"></span></div><p class="note">Importing to the library leaves your design unchanged. Use each item’s Place button when you need it.</p><label id="decal-batch-placement"><input type="checkbox" id="decal-allow-batch"> <span id="decal-batch-label"></span></label><label><input type="checkbox" id="decal-save-library" checked> Also save placed decals to User Library</label>`,'<button data-action="close-dialog">Cancel</button><button id="decal-place">Place selected on car</button><button class="primary" id="decal-save">Import to library</button>');
  $('#dialog').classList.add('decal-import-dialog');
  const matches=()=>entries.map((entry,index)=>({entry,index})).filter(({entry})=>`${entry.name} ${entry.sheet||''} ${entry.page||''}`.toLowerCase().includes(filter));
  const shown=()=>matches().slice(page*24,page*24+24);
  const selectionKey=()=>[...chosenIds].sort((a,b)=>a-b).join(',');
  const refresh=()=>{const list=matches();page=Math.min(page,Math.max(0,Math.ceil(list.length/24)-1));$('#decal-import-items').innerHTML=shown().map(({entry,index})=>`<label class="decal-import-card"><input type="checkbox" data-decal-choice="${index}" ${chosenIds.has(index)?'checked':''}><span class="decal-card-preview"><svg viewBox="0 0 240 150">${V.layerMarkup({...A.layer(entry.svg,entry.name,Math.min(220,130*A.dimensions(entry.svg,entry.crop)[2]/A.dimensions(entry.svg,entry.crop)[3]),entry.crop),x:10,y:10},false,{effects:false})}</svg></span><strong>${e(entry.name)}</strong><small>${e(entry.sheet||'Vector artwork')}${entry.page?' · Page '+entry.page:''}</small></label>`).join('');$('#decal-page').textContent=`${page+1} / ${Math.max(1,Math.ceil(list.length/24))}`;$('#decal-prev').disabled=!page;$('#decal-next').disabled=(page+1)*24>=list.length;$('#decal-selection-count').textContent=`${chosenIds.size} selected`;$('#decal-save').disabled=!chosenIds.size;const batch=chosenIds.size>1;$('#decal-batch-placement').hidden=!batch||!canPlace();$('#decal-batch-label').textContent=`Place all ${chosenIds.size} selected decals together on this car`;$('#decal-allow-batch').checked=batch&&approvedBatch===selectionKey();$('#decal-save').textContent=`Import ${chosenIds.size} ${chosenIds.size===1?'decal':'decals'} to library`;$('#decal-place').textContent=`Place ${chosenIds.size} ${chosenIds.size===1?'decal':'decals'} on car`;$('#decal-place').disabled=!chosenIds.size||!canPlace()||batch&&approvedBatch!==selectionKey();};
  $('#decal-import-items').onchange=ev=>{const index=Number(ev.target.dataset.decalChoice);if(!Number.isInteger(index))return;if(ev.target.checked&&chosenIds.size>=250){ev.target.checked=false;toast('Import up to 250 decals at a time.');return;}ev.target.checked?chosenIds.add(index):chosenIds.delete(index);refresh();};
  $('#decal-allow-batch').onchange=ev=>{approvedBatch=ev.target.checked?selectionKey():'';refresh();};
  $('#decal-search').oninput=ev=>{filter=ev.target.value.trim().toLowerCase();page=0;refresh();};$('#decal-prev').onclick=()=>{page--;refresh();};$('#decal-next').onclick=()=>{page++;refresh();};$('#decal-clear-selection').onclick=()=>{chosenIds.clear();refresh();};$('#decal-select-shown').onclick=()=>{for(const {index}of shown())if(chosenIds.size<250)chosenIds.add(index);refresh();};
  const apply=place=>{
   if(!chosenIds.size||place&&(!canPlace()||chosenIds.size>1&&approvedBatch!==selectionKey()))return;
   const chosen=[...chosenIds].sort((a,b)=>a-b).map(i=>entries[i]);
   // The same conversion applies to every chosen item, preserving relative sizes.
   const sizes=chosen.map(x=>A.dimensions(x.svg,x.crop)),factor=180/Math.max(...sizes.map(v=>Math.max(v[2],v[3])));
   const imported=chosen.map((x,i)=>A.layer(x.svg,x.name,sizes[i][2]*factor,x.crop));
   const save=!place||$('#decal-save-library').checked;
   if(save)store.assets.push(...imported.map(l=>({id:M.uid(),name:l.name,type:'shape',layer:M.clone(l),description:'Imported from '+context.name})));
   if(place){mutate(()=>{multiSelected.clear();imported.forEach((l,i)=>{l.x=400+(i%5)*20;l.y=240+Math.floor(i/5)*20;layers().push(l);multiSelected.add(l.id);});selectedPaint=null;selected=imported[0].id;preparing=false;tool='select';});}
   else scheduleSave();closeDialog();if(!place)openLibrary('assets');toast(`${imported.length} separate decals added to ${place?'the car'+(save?' and library':''):'your library'}.`);
  };
  $('#decal-save').onclick=()=>{try{apply(false);}catch(error){reportError(error);}};$('#decal-place').onclick=()=>{try{apply(true);}catch(error){reportError(error);}};refresh();
 }
 window.DecalImport={open};
})();
