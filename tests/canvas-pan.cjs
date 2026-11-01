const path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output','pan-surface-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
    await page.evaluate(()=>{
      const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M30 100H970V500H30Z"/><path fill="black" d="M300 200H400V300H300Z"/></svg>');
      setProject(M.newProject({name:'Pan surface',views:{left:v}}));currentView='left';preparing=false;selectedPaint=null;tool='hand';
      layers().push(M.layer('rect',{x:40,y:150,w:800,h:200,fill:'#e64a49'}));viewBox={x:350,y:100,w:650,h:390};render();
    });
    const before=await page.evaluate(()=>({project:JSON.stringify(project),undo:undo.length,camera:art.getAttribute('viewBox')}));
    const b=await page.locator('#artboard').boundingBox();await page.mouse.move(b.x+300,b.y+200);await page.mouse.down();await page.mouse.move(b.x+420,b.y+280,{steps:8});
    const during=await page.evaluate(()=>({camera:art.getAttribute('viewBox'),transform:art.style.transform,pan:art.classList.contains('panning'),point:new DOMPoint(500,300).matrixTransform(art.getScreenCTM()).toJSON()}));
    assert.equal(during.camera,before.camera,'SVG camera stays fixed during pan');assert(during.pan);assert(during.transform.includes('translate3d'));
    const shot1=await page.locator('#canvas-wrap').screenshot();await page.mouse.up();const shot2=await page.locator('#canvas-wrap').screenshot();
    const after=await page.evaluate(()=>({project:JSON.stringify(project),undo:undo.length,camera:art.getAttribute('viewBox'),transform:art.style.transform,pan:art.classList.contains('panning'),point:new DOMPoint(500,300).matrixTransform(art.getScreenCTM()).toJSON()}));
    assert.equal(after.project,before.project);assert.equal(after.undo,before.undo);assert.notEqual(after.camera,before.camera);assert.equal(after.transform,'');assert(!after.pan);assert(Math.abs(after.point.x-during.point.x)<.01&&Math.abs(after.point.y-during.point.y)<.01,'No jump when camera commits');
    const pixels=await page.evaluate(async images=>{
      const frames=[];for(const src of images){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);frames.push(ctx.getImageData(0,0,c.width,c.height).data);}
      let changed=0;for(let i=0;i<frames[0].length;i+=4)if([0,1,2].some(j=>Math.abs(frames[0][i+j]-frames[1][i+j])>15))changed++;return changed/(frames[0].length/4);
    },[shot1,shot2].map(b=>'data:image/png;base64,'+b.toString('base64')));
    assert(pixels<.01,'Offscreen content and clipping stay intact while panning: '+pixels);
    // Zoom while held rebases the camera; another movement must continue from there.
    await page.mouse.move(b.x+300,b.y+200);await page.mouse.down();await page.mouse.move(b.x+340,b.y+220);
    await page.mouse.wheel(0,-120);const zoomed=await page.evaluate(()=>({w:viewBox.w,start:{...drag.start}}));await page.mouse.move(b.x+370,b.y+240);await page.mouse.up();assert.equal(await page.evaluate(()=>viewBox.w),zoomed.w);
    for(const end of ['Escape','pointercancel','lostpointercapture','blur']){
      await page.mouse.move(b.x+300,b.y+200);await page.mouse.down();await page.mouse.move(b.x+350,b.y+230);
      if(end==='Escape')await page.keyboard.press('Escape');else await page.evaluate(end=>{if(end==='blur')window.dispatchEvent(new Event('blur'));else art.dispatchEvent(new PointerEvent(end,{pointerId:drag.pointerId}));},end);
      assert(await page.evaluate(()=>!drag&&!art.classList.contains('panning')&&!art.style.transform),end+' clears pan surface');await page.mouse.up();
    }
    assert.deepEqual(errors,[]);console.log('PASS: fixed vector camera during drag, matching pixels on release, offscreen content, masks, unchanged design/undo, held zoom, Escape/cancel/capture loss/blur cleanup.');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
