const path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output','canvas-zoom-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
 try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
 await page.evaluate(()=>{const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>');setProject(M.newProject({name:'Zoom test',views:{left:v}}));currentView='left';selectedPaint=null;preparing=false;tool='select';layers().push(M.layer('rect',{x:100,y:100,w:800,h:400,fill:'#e64a49'}));render();});
 const before=await page.evaluate(()=>({project:JSON.stringify(project),undo:undo.length}));
 for(const [width,height] of [[1740,1000],[1280,1200]]){
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);await page.waitForTimeout(100);
  for(const delta of [-120,120]){
   const state=await page.evaluate(delta=>{fit();const original=art.getAttribute('viewBox'),node=art.querySelector('[data-canvas-art]').firstChild;const point={x:370,y:240},screen=new DOMPoint(point.x,point.y).matrixTransform(art.getScreenCTM());for(let i=0;i<5;i++)art.dispatchEvent(new WheelEvent('wheel',{deltaY:delta,clientX:screen.x,clientY:screen.y,bubbles:true,cancelable:true}));const mapped=new DOMPoint(point.x,point.y).matrixTransform(art.getScreenCTM());return {fixed:art.getAttribute('viewBox')===original,sameNode:node===art.querySelector('[data-canvas-art]').firstChild,active:!!zoomSurface,point:mapped.toJSON(),anchorError:Math.hypot(mapped.x-screen.x,mapped.y-screen.y),camera:{...viewBox}};},delta);
   assert(state.fixed&&state.sameNode&&state.active);assert(state.anchorError<1,JSON.stringify(state));
   await page.waitForFunction(()=>!zoomSurface);
   const settled=await page.evaluate(()=>({point:new DOMPoint(370,240).matrixTransform(art.getScreenCTM()).toJSON(),transform:art.style.transform,camera:art.getAttribute('viewBox')}));
   assert.equal(settled.transform,'');assert(Math.hypot(settled.point.x-state.point.x,settled.point.y-state.point.y)<.01,'No camera jump after zoom settles');assert.equal(settled.camera,`${state.camera.x} ${state.camera.y} ${state.camera.w} ${state.camera.h}`);
  }
 }
 // Wheel input over margins still works when the SVG surface is scaled down.
 assert(await page.evaluate(()=>{fit();zoom(.5);const old=viewBox.w,rect=$('#canvas-wrap').getBoundingClientRect();$('#canvas-wrap').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:rect.x+3,clientY:rect.y+3,bubbles:true,cancelable:true}));return viewBox.w<old;}));
 await page.evaluate(()=>fit());assert(await page.evaluate(()=>!zoomSurface&&!art.style.transform&&viewBox.w===1000));
 // Editing immediately after wheel input commits the camera before hit-testing.
 const interaction=await page.evaluate(()=>{zoom(1.12);const layer=art.querySelector('[data-layer]'),rect=layer.getBoundingClientRect();layer.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,button:0,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,bubbles:true}));const result={kind:drag?.kind,settled:!zoomSurface&&!art.style.transform};art.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));return result;});assert.equal(interaction.kind,'move');assert(interaction.settled);
 const canvas=await page.locator('#canvas-wrap').boundingBox(),oldWidth=await page.evaluate(()=>viewBox.w);await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.wheel(0,-120);await page.waitForFunction(w=>viewBox.w<w,oldWidth);await page.waitForFunction(()=>!zoomSurface);
 const after=await page.evaluate(()=>({project:JSON.stringify(project),undo:undo.length}));assert.deepEqual(after,before);assert.deepEqual(errors,[]);
 console.log('PASS: wheel zoom reuses surface, pointer anchor and settled camera match in both aspect ratios, margins receive zoom, Fit resets, immediate editing works, project/history unchanged.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
