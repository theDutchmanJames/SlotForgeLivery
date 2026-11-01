const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const profile=path.join(root,'test-output','review-interactions-'+Date.now()),env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
  await page.evaluate(()=>{window.eventTrace=[];for(const name of ['pointerdown','pointerup','gotpointercapture','lostpointercapture'])art.addEventListener(name,e=>eventTrace.push([name,e.pointerId,e.buttons,e.isTrusted,drag?.kind,art.hasPointerCapture(e.pointerId)]),true);window.addEventListener('blur',()=>eventTrace.push(['blur',drag?.kind]));});
  const seed=()=>page.evaluate(()=>{const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>');setProject(M.newProject({name:'Interrupted gestures',views:{left:v}}));preparing=false;layers().push(M.layer('rect',{x:300,y:200,w:200,h:100}));chooseArtwork(layers()[0].id);render();});
  for(const end of ['blur','lostpointercapture','Escape']){
   await seed();const start=await page.evaluate(()=>new DOMPoint(400,250).matrixTransform(art.getScreenCTM()).toJSON());await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+50,start.y+20);
   assert.equal(await page.evaluate(()=>drag?.kind),'move',end+' '+JSON.stringify(await page.evaluate(()=>window.eventTrace)));
   if(end==='Escape')await page.keyboard.press('Escape');else await page.evaluate(end=>{if(end==='blur')window.dispatchEvent(new Event('blur'));else art.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:drag.pointerId}));},end);
   const saved=await page.evaluate(()=>({drag:!!drag,layer:M.clone(layers()[0]),undo:undo.length}));assert.equal(saved.drag,false,end+' finishes the drag');assert.equal(saved.undo,1);assert.notEqual(saved.layer.x,300);
   await page.mouse.move(start.x+100,start.y+40);await page.mouse.up();assert.deepEqual(await page.evaluate(()=>layers()[0]),saved.layer,end+' cannot leave sticky movement');
   await page.evaluate(()=>flushSave());const data=JSON.parse(await fs.readFile(path.join(profile,'paintshop-library.json'),'utf8'));assert.deepEqual(data.projects.find(p=>p.id===data.current).views.left[0],saved.layer,'Interrupted movement persists');
   await page.evaluate(()=>actions.undo());assert.equal(await page.evaluate(()=>layers()[0].x),300);
  }
  // A cancelled pen gesture discards only its in-progress anchor and releases capture.
  await seed();await page.evaluate(()=>setTool('polygon'));const start=await page.evaluate(()=>new DOMPoint(350,250).matrixTransform(art.getScreenCTM()).toJSON());await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+30,start.y+20);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert(await page.evaluate(()=>!drag&&drawPoints.length===0));await page.mouse.up();
  // Snap controls drawing coordinates, never the wheel's pointer anchor.
  await page.evaluate(()=>{setTool('select');$('#snap').checked=true;viewBox={x:200,y:100,w:200,h:120};renderCanvas();});
  const error=await page.evaluate(()=>{const screen=new DOMPoint(273,143).matrixTransform(art.getScreenCTM()),event=new WheelEvent('wheel',{clientX:screen.x,clientY:screen.y,deltaY:120,bubbles:true,cancelable:true}),point=new DOMPoint(event.clientX,event.clientY).matrixTransform(art.getScreenCTM().inverse());art.dispatchEvent(event);const after=new DOMPoint(point.x,point.y).matrixTransform(art.getScreenCTM());return Math.hypot(after.x-event.clientX,after.y-event.clientY);});assert(error<.01,'Snap must not shift zoom anchor: '+error);
  // Slow font decoding must not reopen a dismissed library or replace a newer dialog.
  const font=await fs.readFile(process.env.TEST_FONT||'C:/Windows/Fonts/AGENCYR.TTF');
  const cancelled=await page.evaluate(async base64=>{
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),data=await FontLibrary.importFile(new File([bytes],'review.ttf')),original=FontLibrary.importFile;
   try{
    for(const next of ['closed','help']){
     openLibrary('fonts');let release;FontLibrary.importFile=()=>new Promise(r=>release=r);const task=importFonts([{}]);closeDialog();if(next==='help')helpDialog();release(data);await task;
     if(next==='closed'&&$('#dialog').open)return false;if(next==='help'&&$('#dialog h2').textContent!=='A quick tour')return false;closeDialog();
    }return store.fonts.length===1;
   }finally{FontLibrary.importFile=original;}
  },font.toString('base64'));assert(cancelled,'Font import keeps the current dialog and deduplicates the library');
  await app.evaluate(({ipcMain})=>{global.pngRequests=0;ipcMain.removeHandler('png:save');ipcMain.handle('png:save',()=>{global.pngRequests++;return true;});});
  await page.evaluate(()=>exportPNGDialog());await page.waitForFunction(()=>document.querySelector('#png-save')?.disabled===false);
  const pngCancelled=await page.evaluate(async()=>{
   const original=renderPNG;let release,calls=0;renderPNG=()=>{calls++;return new Promise(r=>release=r);};
   try{const button=$('#png-save'),job=button.onclick();await button.onclick();closeDialog();helpDialog();const canvas=document.createElement('canvas');release(canvas);await job;return calls===1&&$('#dialog h2').textContent==='A quick tour';}
   finally{renderPNG=original;closeDialog();}
  });assert(pngCancelled,'Cancelled PNG render cannot close the newer dialog or start a duplicate job');assert.equal(await app.evaluate(()=>global.pngRequests),0,'No save dialog after cancellation');
  assert.deepEqual(errors,[]);console.log('PASS: interrupted edits save and undo atomically, pen cleanup, Snap-independent zoom, delayed font imports respect navigation, cancelled/duplicate PNG renders do not save or close newer dialogs.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
