(function(){
  'use strict';
  const entries=new Map(),width=3000,height=1800;let revision=0;
  function render(markup,id,key){
    let entry=entries.get(key);
    if(!entry){
      entry={status:'loading'};entries.set(key,entry);
      // Only the active canvas uses this cache. Keep at most two geometry snapshots.
      while(entries.size>2)entries.delete(entries.keys().next().value);
      build(markup,id,key,entry);
    }else{entries.delete(key);entries.set(key,entry);}
    if(entry.status!=='ready')return markup;
    return `<defs><mask id="${id}" data-preview-mask="true" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><image href="${entry.href}" x="0" y="0" width="1000" height="600"/></mask></defs>`;
  }
  async function build(markup,id,key,entry){
    let canvas;
    try{
      const source=new Image();
      source.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 600">${markup}<rect width="1000" height="600" fill="white" mask="url(#${id})"/></svg>`)));
      await source.decode();if(entries.get(key)!==entry)return;
      canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(source,0,0);
      const href=canvas.toDataURL('image/png'),image=new Image();image.src=href;await image.decode();
      if(entries.get(key)!==entry)return;
      Object.assign(entry,{status:'ready',href,image});revision++;
      window.dispatchEvent(new Event('mask-preview-ready'));
    }catch{entry.status='failed';} // Retain the original vector mask if preview generation fails.
    finally{if(canvas){canvas.width=1;canvas.height=1;}}
  }
  window.MaskPreview={render,revision:()=>revision,stats:()=>({entries:entries.size,ready:[...entries.values()].filter(e=>e.status==='ready').length,pixelsPerMask:width*height})};
})();
