(function(){
  'use strict';
  const M=window.Model,loaded=new Map();
  function bytes(data){return Uint8Array.from(atob(data.src.split(',')[1]),c=>c.charCodeAt(0));}
  async function family(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return 'sf-font-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
  async function load(value){
    const data=M.validateFontData(value);
    let entry=loaded.get(data.family);
    if(entry){if(entry.src!==data.src)throw new Error('Conflicting embedded font data.');return entry.promise;}
    const promise=(async()=>{
      const buffer=bytes(data);
      if(await family(buffer)!==data.family)throw new Error('The embedded font is damaged. Import the original font file again.');
      const face=new FontFace(data.family,buffer,{weight:'normal',style:'normal'});
      try{await face.load();}catch{throw new Error('This font could not be loaded. Choose a valid TTF, OTF, WOFF or WOFF2 file.');}
      document.fonts.add(face);return data;
    })();
    loaded.set(data.family,{src:data.src,promise});
    try{return await promise;}catch(error){loaded.delete(data.family);throw error;}
  }
  async function importFile(file){
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['ttf','otf','woff','woff2'].includes(ext))throw new Error('Choose a TTF, OTF, WOFF or WOFF2 font.');
    if(!file.size||file.size>10*1024*1024)throw new Error('Choose a font smaller than 10 MB.');
    const buffer=await file.arrayBuffer(),raw=new Uint8Array(buffer),signature=String.fromCharCode(...raw.slice(0,4));
    const format=signature==='OTTO'?'otf':signature==='wOFF'?'woff':signature==='wOF2'?'woff2':signature==='true'||raw[0]===0&&raw[1]===1&&raw[2]===0&&raw[3]===0?'ttf':null;
    if(!format)throw new Error('This file does not contain a supported font. Font collections are not supported.');
    let binary='';for(let i=0;i<raw.length;i+=32768)binary+=String.fromCharCode(...raw.subarray(i,i+32768));
    const data={name:M.name(file.name.replace(/\.[^.]+$/,'')),family:await family(buffer),src:`data:font/${format};base64,${btoa(binary)}`};
    await load(data);return data;
  }
  async function loadAll(value){
    const fonts=new Map();
    function add(data){const existing=fonts.get(data.family);if(existing&&existing.src!==data.src)throw new Error('Conflicting embedded font data.');fonts.set(data.family,data);}
    function visit(item){if(!item||typeof item!=='object')return;if(item.fontData)add(item.fontData);if(item.family&&item.src?.startsWith('data:font/'))add(item);for(const [key,child] of Object.entries(item))if(key!=='fontData'&&child&&typeof child==='object')visit(child);}
    visit(value);await Promise.all([...fonts.values()].map(load));
  }
  // Embedded CSS also works in isolated SVG images, PNGs and perspective textures.
  function style(value){const data=M.validateFontData(value);return `<style>@font-face{font-family:'${data.family}';src:url('${data.src}');font-weight:normal;font-style:normal;}</style>`;}
  window.FontLibrary={importFile,load,loadAll,style};
})();
