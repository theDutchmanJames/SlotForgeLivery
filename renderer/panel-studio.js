(function(){
  'use strict';
  const M=window.Model,V=window.Vector;
  const LABELS=M.PART_LABELS;
  const COLOURS=['#e87570','#64b9e5','#e8c65f','#b69ee7','#95a1ad','#69c5a4','#d2a16d','#a2b968'];
  const key=r=>r.sourceRegionId+':'+r.contourIndex;
  function open({project,viewKey,onApply,openDialog,closeDialog,reportError}){
    const $=s=>document.querySelector(s),view=project.template.views[viewKey];let result;
    try{result=TemplateRepair.inspect(view.vectorSource,true,{preserve:[...view.regions,...(view.panelLabels||[])]});}catch(error){reportError(error);return;}
    if(!result.candidates.length){reportError(new Error('No enclosed panels found. Trace a panel or generate all vector regions.'));return;}
    let entries=result.candidates.map((r,i)=>{
      const existing=view.regions.find(a=>key(a)===key(r)),saved=view.panelLabels?.find(a=>key(a)===key(r)),label=saved?.label||existing?.partLabel||'';
      // Older previews saved labels without creating paintable geometry. Recover
      // those assignments when opened; explicit reference-only overrides survive.
      const paintable=typeof saved?.paintable==='boolean'?saved.paintable:existing?existing.role==='body':!!label;
      return {region:r,index:i+1,existing,paintable,included:paintable||!!existing,label};
    });
    let excluded=[...result.excluded];
    let selected=new Set(),filter='all',query='',numbers=false,mode='select',drag=null,space=false;
    const history=[],future=[];let vb={x:0,y:0,w:1000,h:600};
    const snapshot=()=>({settings:entries.map(a=>({...a})),excluded:[...excluded],selected:[...selected]});
    const remember=()=>{history.push(snapshot());if(history.length>60)history.shift();future.length=0;};
    const restore=s=>{entries=s.settings.map(a=>({...a}));excluded=[...s.excluded];selected=new Set(s.selected);refresh();};
    const visible=()=>entries.filter(a=>(filter==='all'||filter==='paintable'&&a.paintable||filter==='unlabelled'&&!a.label||filter===a.label)&&(!query||(`Area ${a.index} ${a.label}`).toLowerCase().includes(query)));
    const colour=a=>a.label?COLOURS[LABELS.indexOf(a.label)]:'#98a5b2';
    function build(){
      const next=M.clone(view);next.vectorSource.regions.forEach(r=>{if(result.backgrounds.includes(r.id))r.role='hidden';});
      const offered=new Set(entries.map(a=>key(a.region)));
      next.regions=view.regions.filter(r=>!r.sourceRegionId||!offered.has(key(r))).map(M.clone);
      for(const a of entries)if(a.included){const r=a.existing?M.clone(a.existing):{...M.clone(a.region),role:'body',colour:undefined,name:`${a.label||'Paintable panel'} ${a.index}`};r.role=a.paintable?'body':'protected';r.partLabel=a.label||undefined;next.regions.push(r);}
      next.panelLabels=[...(view.panelLabels||[]).filter(a=>!offered.has(key(a))),...entries.filter(a=>a.label).map(a=>({sourceRegionId:a.region.sourceRegionId,contourIndex:a.region.contourIndex,label:a.label,paintable:a.paintable}))];return next;
    }
    openDialog('Prepare your car','Select areas, label the parts, and decide what can be painted.',`${result.simplification?`<div class="panel-simplification note"><span id="panel-simplification-message" role="status">${M.escape(TemplateRepair.summary(result))}</span><button id="panel-add-filtered" class="primary" aria-pressed="false">Add filtered areas</button></div>`:''}<div class="panel-workspace"><section class="panel-workbench"><div class="panel-toolbar"><div class="panel-toolgroup"><button id="panel-select" aria-pressed="true" title="Select areas; drag a box to select several">Select</button><button id="panel-pan" title="Drag to pan; hold Space for temporary pan">Pan</button></div><div class="panel-toolgroup"><button id="panel-undo" title="Undo (Ctrl+Z)">↶</button><button id="panel-redo" title="Redo (Ctrl+Shift+Z)">↷</button></div><div class="panel-toolgroup panel-zoom"><button id="panel-minus" aria-label="Zoom out">−</button><span id="panel-zoom-value">100%</span><button id="panel-plus" aria-label="Zoom in">+</button><button id="panel-fit">Fit car</button></div><label class="panel-numbers"><input id="panel-numbers" type="checkbox">Area numbers</label></div><div class="panel-stage"><svg id="repair-preview" viewBox="0 0 1000 600" aria-label="Car preparation canvas"></svg><span class="panel-canvas-tip">Click to toggle areas · Drag a selection box · Wheel to zoom · Middle-drag / Ctrl + drag to pan</span></div><div class="panel-status"><span id="panel-hover-status">Hover over an area to identify it</span><span id="panel-summary"></span></div></section><aside class="panel-sidebar"><div class="panel-batch"><span class="eyebrow">CURRENT SELECTION</span><h3 id="panel-selection-count">0 areas selected</h3><div class="row"><button id="panel-label" class="primary">Label…</button><button id="panel-clear">Clear selection</button></div><div id="panel-label-menu" hidden><p>Apply a label to this selection</p><div class="panel-label-options">${LABELS.map((name,i)=>`<button data-part-label="${name}"><i style="background:${COLOURS[i]}"></i>${name}</button>`).join('')}<button data-part-label="">Remove label</button></div></div><div class="row panel-paint-actions"><button id="panel-paint">Make paintable</button><button id="panel-reference">Reference only</button></div><p class="note">Assigning a label makes the areas paintable and clears the selection for your next group. Use Reference only to exclude an area.</p></div><div class="panel-area-controls"><label for="panel-filter">Show areas</label><select id="panel-filter"><option value="all">All areas</option><option value="paintable">Paintable</option><option value="unlabelled">Unlabelled</option>${LABELS.map(n=>`<option>${n}</option>`).join('')}</select><input id="panel-search" placeholder="Find an area or label…" aria-label="Find an area or label"><div class="row"><button id="panel-select-shown">Select shown</button><button id="panel-invert">Invert shown</button></div></div><div id="repair-choices" class="panel-area-list"></div></aside></div>`,`<span id="repair-count" class="panel-save-summary"></span><button data-action="close-dialog">Cancel</button><button id="apply-repair" class="primary">Save preparation</button>`);
    const dialog=$('#dialog');dialog.classList.add('panel-studio');const svg=$('#repair-preview');
    function draw(){
      const preview=M.clone(project);preview.template.views[viewKey]=build();preview.base='#f4c875';preview.views[viewKey]=[];
      for(const r of preview.template.views[viewKey].regions)if(r.role==='body')delete r.colour;
      const shown=visible(),sorted=[...shown].sort((a,b)=>b.region.bounds.w*b.region.bounds.h-a.region.bounds.w*a.region.bounds.h);
      const overlay=(a,fill,opacity,stroke)=>`<g style="--area-colour:${fill};--area-opacity:${opacity};--area-stroke:${stroke}" class="panel-area-overlay">${V.geometryMarkup(a.region)}</g>`;
      svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      svg.innerHTML=V.renderView(preview,viewKey,{id:'panel-studio'})+sorted.map(a=>`<g data-repair-area="${a.region.id}" class="panel-area-hit">${overlay(a,selected.has(a.region.id)?'#e5484d':colour(a),selected.has(a.region.id)?.58:a.label?.24:0,selected.has(a.region.id)?'#c8323c':a.label?colour(a):'transparent')}</g>`).join('')+(mode==='restore'?excluded.slice().sort((a,b)=>b.bounds.w*b.bounds.h-a.bounds.w*a.bounds.h).map(r=>`<g data-filtered-area="${r.id}" style="opacity:0;pointer-events:fill;cursor:crosshair">${V.geometryMarkup(r,'mask')}</g>`).join(''):'')+(numbers?shown.map(a=>{const b=a.region.bounds;return `<g class="panel-number" pointer-events="none" transform="translate(${b.x+b.w/2} ${b.y+b.h/2}) scale(${vb.w/1000})"><circle r="10"/><text text-anchor="middle" dy="3.5">${a.index}</text></g>`;}).join(''):'')+'<g id="repair-hover" pointer-events="none"></g><rect id="panel-selection-box" class="selection-box" pointer-events="none" hidden/>';
      svg.style.cursor=mode==='pan'||space?'grab':mode==='restore'?'crosshair':'default';$('#panel-zoom-value').textContent=Math.round(100000/vb.w)+'%';
    }
    function list(){
      const list=$('#repair-choices'),scroll=list.scrollTop;
      list.innerHTML=visible().map(a=>`<label class="panel-area-row ${selected.has(a.region.id)?'selected':''}"><input type="checkbox" data-repair-check="${a.region.id}" ${selected.has(a.region.id)?'checked':''}><span class="panel-area-dot" style="background:${colour(a)}"></span><span><b>Area ${a.index}</b><small>${a.label||'Unlabelled'}</small></span><span class="panel-area-state ${a.paintable?'paintable':''}">${a.paintable?'Paintable':'Reference'}</span></label>`).join('')||'<p class="note">No matching areas.</p>';list.scrollTop=scroll;
    }
    function refresh(){
      draw();list();if($('#panel-add-filtered')){const button=$('#panel-add-filtered');button.setAttribute('aria-pressed',String(mode==='restore'));button.textContent=mode==='restore'?'Done adding areas':'Add filtered areas';button.disabled=!excluded.length&&mode!=='restore';$('#panel-simplification-message').textContent=mode==='restore'?`Hover over a filtered area, then click to add it. ${excluded.length} still filtered. Added areas are selected and paintable; label them when ready.`:TemplateRepair.summary({...result,candidates:entries.map(a=>a.region),excluded});}
      $('.panel-canvas-tip').textContent=mode==='restore'?'Hover to highlight · Click to restore · Label your added areas · Middle-drag to pan':'Click to toggle areas · Drag a selection box · Wheel to zoom · Middle-drag / Ctrl + drag to pan';
      const paintCount=entries.filter(a=>a.paintable).length,labelCount=entries.filter(a=>a.label).length;
      $('#panel-selection-count').textContent=`${selected.size} ${selected.size===1?'area':'areas'} selected`;
      for(const id of ['panel-label','panel-clear','panel-paint','panel-reference'])$('#'+id).disabled=!selected.size;
      $('#panel-summary').textContent=`${entries.length} areas · ${paintCount} paintable`;
      $('#repair-count').textContent=`${paintCount} paintable · ${labelCount} labelled · Changes saved only when you finish`;
      $('#panel-undo').disabled=!history.length;$('#panel-redo').disabled=!future.length;
    }
    function highlight(id){const a=entries.find(a=>a.region.id===id);$('#panel-hover-status').textContent=a?`Area ${a.index} · ${a.label||'Unlabelled'} · ${a.paintable?'Paintable':'Reference only'}`:'Hover over an area to identify it';const target=$('#repair-hover');target.innerHTML=a?V.geometryMarkup(a.region,'outline'):'';for(const s of target.querySelectorAll('[data-geometry]')){s.setAttribute('stroke','#e5484d');s.setAttribute('stroke-width','2.5');}}
    function highlightFiltered(id){const r=excluded.find(r=>r.id===id);$('#panel-hover-status').textContent=r?'Filtered area · Click to restore and make paintable':'Hover over a filtered area to restore it';const target=$('#repair-hover');target.innerHTML=r?V.geometryMarkup(r,'outline'):'';for(const shape of target.querySelectorAll('[data-geometry]')){shape.setAttribute('stroke','#e5484d');shape.setAttribute('stroke-width','2.5');}}
    function addFiltered(id){
      const protectedIds=new Set(entries.filter(a=>a.included||a.label||a.existing||selected.has(a.region.id)).map(a=>a.region.id));
      let next;try{next=TemplateRepair.restoreFiltered(entries.map(a=>a.region),excluded,id,protectedIds);}catch(error){reportError(error);return;}
      if(!next)return;remember();entries=entries.filter(a=>a.region!==next.removed);
      const index=Math.max(0,...entries.map(a=>a.index))+1;
      entries.push({region:next.added,index,paintable:true,included:true,label:'',existing:undefined});excluded=next.excluded;
      selected.add(next.added.id);filter='all';query='';$('#panel-filter').value='all';$('#panel-search').value='';refresh();
      if(next.removed)$('#panel-hover-status').textContent='Area restored. An unused area was returned to the filtered details to keep 250 available.';
    }
    function setMode(next){mode=next;$('#panel-select').setAttribute('aria-pressed',String(mode==='select'));$('#panel-pan').setAttribute('aria-pressed',String(mode==='pan'));refresh();}
    if($('#panel-add-filtered'))$('#panel-add-filtered').onclick=()=>setMode(mode==='restore'?'select':'restore');
    function toggle(id){remember();selected.has(id)?selected.delete(id):selected.add(id);$('#panel-label-menu').hidden=true;refresh();}
    function fit(){const shapes=view.vectorSource.regions.filter(r=>r.role!=='hidden'&&!result.backgrounds.includes(r.id));const b=M.boundsOfPoints(shapes.flatMap(r=>[{x:r.bounds.x,y:r.bounds.y},{x:r.bounds.x+r.bounds.w,y:r.bounds.y+r.bounds.h}]));vb={x:b.x-b.w*.08,y:b.y-b.h*.12,w:Math.max(50,b.w*1.16),h:Math.max(30,b.h*1.24)};draw();}
    function zoom(factor,p={x:vb.x+vb.w/2,y:vb.y+vb.h/2}){const w=Math.max(60,Math.min(2500,vb.w/factor)),ratio=w/vb.w;vb={x:p.x-(p.x-vb.x)*ratio,y:p.y-(p.y-vb.y)*ratio,w,h:vb.h*ratio};draw();}
    const point=ev=>new DOMPoint(ev.clientX,ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
    svg.onauxclick=ev=>{if(ev.button===1)ev.preventDefault();};
    svg.onpointerdown=ev=>{if(ev.button!==0&&ev.button!==1)return;ev.preventDefault();const p=point(ev);drag={start:p,client:{x:ev.clientX,y:ev.clientY},vb:{...vb},pan:mode==='pan'||space||ev.button===1||ev.ctrlKey,id:ev.target.closest('[data-repair-area]')?.dataset.repairArea,filtered:ev.target.closest('[data-filtered-area]')?.dataset.filteredArea,add:ev.shiftKey,moved:false};svg.setPointerCapture(ev.pointerId);};
    svg.onpointermove=ev=>{if(!drag){if(mode==='restore')highlightFiltered(ev.target.closest('[data-filtered-area]')?.dataset.filteredArea);else highlight(ev.target.closest('[data-repair-area]')?.dataset.repairArea);return;}if(Math.hypot(ev.clientX-drag.client.x,ev.clientY-drag.client.y)>4)drag.moved=true;if(!drag.moved)return;const p=point(ev);if(drag.pan){vb.x+=drag.start.x-p.x;vb.y+=drag.start.y-p.y;draw();}else{const box=$('#panel-selection-box');box.removeAttribute('hidden');for(const [k,v] of Object.entries({x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),width:Math.abs(p.x-drag.start.x),height:Math.abs(p.y-drag.start.y)}))box.setAttribute(k,v);}};
    svg.onpointerup=ev=>{if(!drag)return;const d=drag,p=point(ev);drag=null;svg.releasePointerCapture(ev.pointerId);if(d.pan)return;if(mode==='restore'){if(!d.moved&&d.filtered)addFiltered(d.filtered);else draw();return;}if(!d.moved){if(d.id)toggle(d.id);return;}remember();if(!d.add)selected.clear();const b={x:Math.min(p.x,d.start.x),y:Math.min(p.y,d.start.y),right:Math.max(p.x,d.start.x),bottom:Math.max(p.y,d.start.y)};for(const a of visible()){const r=a.region.bounds;if(r.x>=b.x&&r.y>=b.y&&r.x+r.w<=b.right&&r.y+r.h<=b.bottom)selected.add(a.region.id);}refresh();};
    svg.onpointercancel=()=>{drag=null;draw();};svg.onpointerleave=()=>{if(!drag){if(mode==='restore')highlightFiltered(null);else highlight(null);}};
    svg.onwheel=ev=>{ev.preventDefault();zoom(ev.deltaY<0?1.15:1/1.15,point(ev));};
    $('#panel-minus').onclick=()=>zoom(1/1.2);$('#panel-plus').onclick=()=>zoom(1.2);$('#panel-fit').onclick=fit;
    $('#panel-numbers').onchange=ev=>{numbers=ev.target.checked;draw();};
    for(const t of ['select','pan'])$('#panel-'+t).onclick=()=>setMode(t);
    $('#panel-clear').onclick=()=>{remember();selected.clear();$('#panel-label-menu').hidden=true;refresh();};
    $('#panel-label').onclick=()=>{$('#panel-label-menu').hidden=!$('#panel-label-menu').hidden;};
    $('#panel-label-menu').onclick=ev=>{const b=ev.target.closest('[data-part-label]');if(!b||!selected.size)return;remember();for(const a of entries)if(selected.has(a.region.id)){a.label=b.dataset.partLabel;if(a.label){a.paintable=true;a.included=true;}}selected.clear();$('#panel-label-menu').hidden=true;refresh();};
    for(const [id,value] of [['panel-paint',true],['panel-reference',false]])$('#'+id).onclick=()=>{remember();for(const a of entries)if(selected.has(a.region.id)){a.paintable=value;a.included=value;}refresh();};
    $('#panel-select-shown').onclick=()=>{remember();selected=new Set(visible().map(a=>a.region.id));refresh();};
    $('#panel-invert').onclick=()=>{remember();for(const a of visible())selected.has(a.region.id)?selected.delete(a.region.id):selected.add(a.region.id);refresh();};
    $('#panel-filter').onchange=ev=>{filter=ev.target.value;refresh();};$('#panel-search').oninput=ev=>{query=ev.target.value.trim().toLowerCase();list();draw();};
    $('#repair-choices').onchange=ev=>{if(ev.target.dataset.repairCheck)toggle(ev.target.dataset.repairCheck);};
    $('#repair-choices').onmouseover=ev=>highlight(ev.target.closest('label')?.querySelector('input')?.dataset.repairCheck);$('#repair-choices').onfocusin=ev=>highlight(ev.target.dataset.repairCheck);$('#repair-choices').onmouseleave=()=>highlight(null);
    $('#panel-undo').onclick=()=>{if(history.length){future.push(snapshot());restore(history.pop());}};$('#panel-redo').onclick=()=>{if(future.length){history.push(snapshot());restore(future.pop());}};
    const keydown=ev=>{if(ev.target.matches('input,select,textarea'))return;if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();$('#panel-'+(ev.shiftKey?'redo':'undo')).click();}else if(ev.code==='Space'){ev.preventDefault();space=true;svg.style.cursor='grab';}};
    const keyup=ev=>{if(ev.code==='Space'){space=false;svg.style.cursor=mode==='pan'?'grab':mode==='restore'?'crosshair':'default';}};
    dialog.addEventListener('keydown',keydown);dialog.addEventListener('keyup',keyup);
    const cleanup=()=>{dialog.classList.remove('panel-studio');dialog.removeEventListener('keydown',keydown);dialog.removeEventListener('keyup',keyup);dialog.removeEventListener('close',onClose);if(dialog._cleanupPanelStudio===cleanup)delete dialog._cleanupPanelStudio;};
    const onClose=()=>{if(!dialog.open)cleanup();};
    dialog._cleanupPanelStudio=cleanup;dialog.addEventListener('close',onClose);
    $('#apply-repair').onclick=()=>{const next=build();closeDialog();onApply(next);};refresh();fit();
  }
  window.PanelStudio={open,LABELS};
})();
