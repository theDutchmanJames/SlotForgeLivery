const path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output','mask-preview-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
    await page.evaluate(()=>{
      const source=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><path fill="white" d="M40 100Q500 0 960 100V500H40Z"/><path fill="black" d="M350 200H450V300H350Z"/></svg>');
      const body={...M.clone(source.regions[0]),id:M.uid(),role:'body',sourceRegionId:source.regions[0].id,contourIndex:-1};
      const v={...M.clone(source),regions:[body],vectorSource:source};
      setProject(M.newProject({name:'Mask preview',views:{left:v}}));currentView='left';preparing=false;selectedPaint=null;
      layers().push(M.layer('rect',{x:0,y:0,w:1000,h:600,fill:'#ff0000'}));render();
      window.originalDesign=JSON.stringify(project);
    });
    await page.waitForSelector('#artboard [data-preview-mask]',{state:'attached',timeout:15000});
    const pixels=await page.evaluate(async()=>{
      const render=async svg=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();const c=document.createElement('canvas');c.width=1500;c.height=900;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;};
      const vector=V.standalone(project,currentView,'export'),preview=V.standalone(project,currentView,'main',{preview:true});
      const a=await render(vector),b=await render(preview);let changed=0;
      for(let i=0;i<a.length;i+=4)if([0,1,2,3].some(j=>Math.abs(a[i+j]-b[i+j])>15))changed++;
      return {changed:changed/(a.length/4),vectorOnly:!vector.includes('data-preview-mask'),cached:preview.includes('data-preview-mask'),unchanged:JSON.stringify(project)===originalDesign};
    });
    assert(pixels.changed<.005,JSON.stringify(pixels));assert(pixels.vectorOnly&&pixels.cached&&pixels.unchanged);
    const reuse=await page.evaluate(()=>{const revision=MaskPreview.revision(),href=art.querySelector('[data-preview-mask] image').getAttribute('href');activeView().regions[0].colour='#123456';renderCanvas();return {revision:MaskPreview.revision()===revision,href:art.querySelector('[data-preview-mask] image').getAttribute('href')===href};});assert(reuse.revision&&reuse.href);
    const oldHref=await page.evaluate(()=>art.querySelector('[data-preview-mask] image').getAttribute('href'));
    await page.evaluate(()=>{activeView().regions[0].paintVisible=false;renderCanvas();});
    await page.waitForFunction(old=>art.querySelector('[data-preview-mask] image')?.getAttribute('href')!==old&&!!art.querySelector('[data-preview-mask]'),oldHref);
    // All-hidden masks must be transparent; showing the panel reuses its previous snapshot.
    assert(await page.evaluate(async()=>{const image=new Image();image.src=art.querySelector('[data-preview-mask] image').getAttribute('href');await image.decode();const c=document.createElement('canvas');c.width=10;c.height=6;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,10,6);return !ctx.getImageData(0,0,10,6).data.some((n,i)=>i%4===3&&n); }));
    await page.evaluate(()=>{activeView().regions[0].paintVisible=true;renderCanvas();});
    assert.equal(await page.evaluate(()=>art.querySelector('[data-preview-mask] image').getAttribute('href')),oldHref);
    await page.evaluate(()=>{preparing=true;renderCanvas();});assert.equal(await page.locator('#artboard [data-preview-mask]').count(),0);
    assert(await page.evaluate(()=>MaskPreview.stats().entries<=2));
    // A failed decoder must leave the working vector representation available.
    assert(await page.evaluate(async()=>{const native=Image.prototype.decode;Image.prototype.decode=()=>Promise.reject(new Error('test'));try{const markup='<defs><mask id="failure"/></defs>';const first=MaskPreview.render(markup,'failure','failure');await new Promise(r=>setTimeout(r,0));return first===markup&&MaskPreview.render(markup,'failure','failure')===markup;}finally{Image.prototype.decode=native;}}));
    assert.deepEqual(errors,[]);console.log('PASS: cached/vector pixels match, occlusion and alpha preserved, paint reuses cache, hidden panels invalidate, preparation/exports stay vector, model unchanged, bounded cache and decoder fallback.');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
