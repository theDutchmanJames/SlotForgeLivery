(function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg',M=window.Model,V=window.Vector;
  // Recover the unfilled contours of compound paths. Keep their original Bezier
  // curves and transforms; the preview never modifies the user's template.
  const MAX_AREAS=250;
  const areaKey=r=>r.sourceRegionId+':'+r.contourIndex;
  function simplify(candidates,bounds,preserve=[]){
    const total=candidates.length;
    if(total<=MAX_AREAS)return {candidates,excluded:[],simplification:null};
    const pinned=new Set(preserve.map(areaKey)),area=r=>r.bounds.w*r.bounds.h;
    const required=candidates.filter(r=>pinned.has(areaKey(r)));
    if(required.length>MAX_AREAS)throw new Error('This template already has more than 250 prepared areas. Remove unused areas before preparing more.');
    // Only simplify overloaded drawings. Keep original geometry and stable
    // contour identities; we are filtering selection targets, not rewriting art.
    const minArea=Math.max(12,bounds.w*bounds.h*.001);
    const available=candidates.filter(r=>!pinned.has(areaKey(r))).sort((a,b)=>area(b)-area(a));
    let larger=available.filter(r=>area(r)>=minArea);
    if(!larger.length&&!required.length)larger=available;
    const keep=new Set([...required,...larger.slice(0,MAX_AREAS-required.length)]);
    const selected=candidates.filter(r=>keep.has(r));
    return {candidates:selected,excluded:candidates.filter(r=>!keep.has(r)),simplification:{total,kept:selected.length,ignored:total-selected.length,minArea}};
  }
  function restoreFiltered(candidates,excluded,id,protectedIds=new Set()){
    const added=excluded.find(r=>r.id===id);if(!added)return null;
    let removed;
    if(candidates.length>=MAX_AREAS){
      removed=candidates.filter(r=>!protectedIds.has(r.id)).sort((a,b)=>a.bounds.w*a.bounds.h-b.bounds.w*b.bounds.h)[0];
      if(!removed)throw new Error('All 250 areas are already prepared or selected. Clear the selection or save with fewer prepared areas before adding more.');
    }
    return {added,removed,candidates:[...candidates.filter(r=>r!==removed),added],excluded:[...excluded.filter(r=>r!==added),...(removed?[removed]:[])]};
  }
  function summary(result){const s=result.simplification;return s?`Simplified selection: ${result.candidates.length} of ${s.total} areas available. ${result.excluded.length} smaller areas remain in the drawing. Use Add filtered areas to bring back a detail. Existing prepared areas are kept.`:'';}
  function inspect(view,includeSolids=false,{preserve=[]}={}){
    const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 1000 600');
    svg.style.cssText='position:fixed;left:-20000px;width:1000px;height:600px;visibility:hidden';
    document.body.append(svg);
    const candidates=[],backgrounds=[];
    try{
      for(const region of view.regions){
        const group=document.createElementNS(NS,'g');group.innerHTML=V.sanitize(`<svg xmlns="${NS}">${region.markup}</svg>`).innerHTML;svg.append(group);
        const shapes=[...group.querySelectorAll('path,rect,circle,ellipse,polygon')].filter(n=>!n.closest('defs,clipPath'));
        for(const original of shapes){
          const style=getComputedStyle(original),box=original.getBBox();
          if(style.fill==='none'||!box.width||!box.height)continue;
          const mat=svg.getCTM().inverse().multiply(original.getCTM());
          const transformedBounds=b=>M.boundsOfPoints([[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(mat)));
          const rb=transformedBounds(box);
          // Only classify a white surrounding rectangle as background, never a
          // curved white body silhouette. Its other objects must lie inside it.
          const others=view.regions.filter(r=>r.id!==region.id&&r.role!=='hidden');
          const white=/^rgb\(\s*255,\s*255,\s*255\s*\)$/.test(style.fill);
          const rectLike=['rect','path','polygon'].includes(original.localName)&&Math.abs(original.getTotalLength()-2*(box.width+box.height))<Math.max(box.width,box.height)*.001;
          const encloses=others.length&&others.every(r=>r.bounds.x>=rb.x-.1&&r.bounds.y>=rb.y-.1&&r.bounds.x+r.bounds.w<=rb.x+rb.w+.1&&r.bounds.y+r.bounds.h<=rb.y+rb.h+.1);
          if(white&&rectLike&&encloses&&rb.w*rb.h>view.bounds.w*view.bounds.h*.8){backgrounds.push(region.id);continue;}
          if(region.role==='hidden'||region.recovered)continue;
          if(includeSolids&&original.localName!=='path'){
            candidates.push({...M.clone(region),id:M.uid(),name:`Panel ${candidates.length+1}`,role:'body',colour:undefined,sourceRegionId:region.id,contourIndex:-1});continue;
          }
          if(original.localName!=='path')continue;
          const d=original.getAttribute('d')||'';
          // EPS/PDF conversion emits absolute paths. Relative compound SVG paths
          // are left intact until expanded by the originating vector editor.
          if(/[achlmqstv]/.test(d)){
            if(includeSolids&&(d.match(/[Mm]/g)||[]).length===1)candidates.push({...M.clone(region),id:M.uid(),name:`Panel ${candidates.length+1}`,role:'body',colour:undefined,sourceRegionId:region.id,contourIndex:-1});
            continue;
          }
          const contours=d.match(/M[^M]+/g)||[];
          if(contours.length<2){if(includeSolids)candidates.push({...M.clone(region),id:M.uid(),name:`Panel ${candidates.length+1}`,role:'body',colour:undefined,sourceRegionId:region.id,contourIndex:-1});continue;}
          if(contours.length>1000)throw new Error('This outline has too many contours. Simplify it before recovering panels.');
          for(const [contourIndex,contour] of contours.entries()){
            const probe=document.createElementNS(NS,'path');probe.setAttribute('d',contour);svg.append(probe);
            try{
              const bb=probe.getBBox(),b=transformedBounds(bb),length=probe.getTotalLength();
              if(!length||b.w<2||b.h<2||b.w*b.h<12)continue;
              const epsilon=Math.max(bb.width,bb.height)*.00005;
              let inside=0,empty=0;
              for(let k=0;k<32;k++){
                const at=length*(k+.37)/32,pt=probe.getPointAtLength(at),next=probe.getPointAtLength(Math.min(length,at+length*.0001));
                const dx=next.x-pt.x,dy=next.y-pt.y,n=Math.hypot(dx,dy);if(!n)continue;
                for(const sign of [1,-1]){
                  const point=new DOMPoint(pt.x-sign*dy/n*epsilon,pt.y+sign*dx/n*epsilon);
                  if(probe.isPointInFill(point)){inside++;if(!original.isPointInFill(point))empty++;break;}
                }
              }
              if(inside<8||empty/inside<.9)continue;
              // Preserve ancestor transforms and local clipping definitions by
              // replacing just this path inside a sanitized copy of the region.
              const clone=group.cloneNode(true),originals=[...group.querySelectorAll('path,rect,circle,ellipse,polygon')],clones=[...clone.querySelectorAll('path,rect,circle,ellipse,polygon')];
              const replacement=clones[originals.indexOf(original)];
              for(const node of clones)if(node!==replacement&&!node.closest('defs,clipPath'))node.remove();
              replacement.setAttribute('d',contour);replacement.setAttribute('data-geometry','true');replacement.setAttribute('fill-rule','nonzero');replacement.setAttribute('fill','#ffffff');replacement.setAttribute('stroke','none');
              const id=M.uid();candidates.push({id,name:`Recovered area ${candidates.length+1}`,role:'protected',colour:'#e3e9ee',markup:clone.innerHTML,bounds:b,recovered:true,sourceRegionId:region.id,contourIndex});
            }finally{probe.remove();}
          }
        }
        group.remove();
      }
      const filtered=simplify(candidates,view.bounds,preserve);
      return {...filtered,backgrounds:[...new Set(backgrounds)],sources:[...new Set(filtered.candidates.filter(r=>r.recovered).map(r=>r.sourceRegionId))]};
    }finally{svg.remove();}
  }
  function apply(view,result,selected){
    const next=M.clone(view);
    for(const region of next.regions){
      if(result.backgrounds.includes(region.id))region.role='hidden';
      else if(result.sources.includes(region.id)){region.role='protected';region.colour='#273442';}
    }
    for(const candidate of result.candidates){const r=M.clone(candidate);if(selected.has(r.id)){r.role='body';delete r.colour;}next.regions.push(r);}
    return next;
  }
  window.TemplateRepair={inspect,apply,simplify,summary,restoreFiltered};
})();
