const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'panels-profile-'+Date.now());
const runtime=process.env.ELECTRON_BINARY||require('electron');
let app,page;const errors=[];
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile,PAINTSHOP_TEST_PDF:path.join(out,'panels.pdf')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');}
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function add(file,name){await click('add-car');await page.locator('#car-name').fill(name);await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(file);await page.waitForSelector('#repair-preview');}
async function run(){
 await fs.mkdir(out,{recursive:true});await launch();await add(path.join(__dirname,'fixtures/car.svg'),'Panel car');
 assert.equal(await page.evaluate(()=>activeView().regions.length),0,'import does not generate regions');assert.equal(await page.locator('[data-repair-check]').count(),5,'simple filled shapes selectable');
 await click('close-dialog');assert.equal(await page.locator('.region-list').count(),0,'no empty object list in the starting inspector');
 await page.evaluate(()=>flushSave());await app.close();await launch();assert(await page.evaluate(()=>preparing&&activeView().vectorSource&&activeView().regions.length===0),'unfinished import resumes preparation');
 await click('repair-template');await page.locator('[data-repair-check]').first().check();await page.locator('#panel-paint').click();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions.length),1,'only chosen panel generated');assert.equal(await page.evaluate(()=>preparing),false);assert.equal(await page.locator('.paint-group').count(),1);
 await click('repair-template');assert.equal(await page.locator('.panel-area-state.paintable').count(),1,'paintability retained');await click('close-dialog');assert.equal(await page.evaluate(()=>activeView().regions.length),1);
 // Inspect actual rendered pixels: body artwork clips around untouched windows
 // and wheels. A window can also be deliberately chosen without the large body
 // source hiding it or subtracting it from the paint mask.
 const colours=await page.evaluate(async()=>{
  const check=async(v)=>{project.template.views[currentView]=v;project.views[currentView]=[M.layer('rect',{x:0,y:0,w:1000,h:600,fill:'#f28a35'})];
    const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(V.standalone(project,currentView))));await img.decode();const c=document.createElement('canvas');c.width=1000;c.height=600;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1000,600);const b=v.vectorSource.regions[1].bounds;return [...ctx.getImageData(Math.round(b.x+b.w*.7),Math.round(b.y+b.h*.7),1,1).data];};
  const original=M.clone(activeView()),windowCandidate=TemplateRepair.inspect(original.vectorSource,true).candidates[1];
  const protectedPixel=await check(M.clone(original));const selected=M.clone(original);selected.regions=[{...windowCandidate,role:'body',colour:undefined}];const selectedPixel=await check(selected);project.template.views[currentView]=original;project.views[currentView]=[];
  return {protectedPixel,selectedPixel};
 });assert.notDeepEqual(colours.protectedPixel,[242,138,53,255]);assert.deepEqual(colours.selectedPixel,[242,138,53,255]);
 const dest=path.join(out,'panels.sfpaint');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},dest);
 await click('sharing');await click('export-project');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Package exported.');await click('close-dialog');
 await page.locator('#package-file').setInputFiles(dest);await page.waitForSelector('[data-action="confirm-import"]');await click('confirm-import');
 await page.evaluate(()=>{preparing=true;render();});await click('repair-template');assert.equal(await page.locator('.panel-area-state.paintable').count(),1,'source references survive package import');await click('close-dialog');
 await click('generate-regions');await page.locator('#confirm-button').click();assert.equal(await page.evaluate(()=>activeView().regions.length),6);assert.equal(await page.evaluate(()=>!!activeView().vectorSource),false,'explicit button enables all vector regions');
 await click('undo');assert.equal(await page.evaluate(()=>activeView().regions.length),1);assert(await page.evaluate(()=>!!activeView().vectorSource));
 if(process.env.REPAIR_EPS){
  await add(process.env.REPAIR_EPS,'Porsche panel selection');assert.equal(await page.evaluate(()=>activeView().regions.length),0);
  const boxes=await page.evaluate(()=>TemplateRepair.inspect(activeView().vectorSource,true).candidates.sort((a,b)=>b.bounds.w*b.bounds.h-a.bounds.w*a.bounds.h).slice(0,2).map(r=>r.bounds));
  for(const b of boxes){const p=await page.evaluate(b=>{const p=new DOMPoint(b.x+b.w/2,b.y+b.h/2).matrixTransform(document.querySelector('#repair-preview').getScreenCTM());return {x:p.x,y:p.y};},b);await page.mouse.click(p.x,p.y);}
  await page.locator('#panel-paint').click();await page.screenshot({path:path.join(out,'07-panel-first-import.png')});await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.length),2);
  assert.equal(await page.evaluate(()=>preparing),false);await page.locator('[data-swatch="#f28a35"]').click();await page.screenshot({path:path.join(out,'08-panel-first-editor.png')});
  await click('pdf');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Workshop PDF saved.');
 }
 assert.deepEqual(errors,[]);await page.evaluate(()=>flushSave());await app.close();app=null;console.log('PASS: panel-first SVG/EPS import, no automatic regions, draft restart, selection/edit/cancel, paint clipping, package round-trip, explicit generation, undo and PDF.');
}
run().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'panels-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
