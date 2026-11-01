const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'studio-profile-'+Date.now());
const runtime=process.env.ELECTRON_BINARY||require('electron');let app,page;const errors=[];
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');}
async function add(file,name){await click('add-car');await page.locator('#car-name').fill(name);await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(file);await page.waitForSelector('#repair-preview');}
async function label(name){await page.locator('#panel-label').click();await page.locator(`[data-part-label="${name}"]`).click();}
async function run(){
 await fs.mkdir(out,{recursive:true});await launch();
 const grid='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">'+Array.from({length:16},(_,i)=>`<rect x="${30+(i%4)*190}" y="${30+Math.floor(i/4)*90}" width="150" height="60" fill="white" stroke="black"/>`).join('')+'</svg>';
 await add({name:'label-grid.svg',mimeType:'image/svg+xml',buffer:Buffer.from(grid)},'Batch labels');
 const before=await page.evaluate(()=>JSON.stringify(activeView()));
 for(let i=0;i<5;i++)await page.locator('[data-repair-check]').nth(i).check();
 await label('Bodywork');assert.equal(await page.locator('[data-repair-check]:checked').count(),0,'label clears selection');
 for(let i=5;i<12;i++)await page.locator('[data-repair-check]').nth(i).check();await label('Windows');
 assert.equal(await page.locator('[data-repair-check]:checked').count(),0);
 assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Bodywork$/}).count(),5);assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Windows$/}).count(),7);
 assert.equal(await page.locator('.panel-area-state.paintable').count(),12,'every labelled group becomes paintable automatically');
 assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),before,'preview edits do not touch saved project');
 await page.locator('#panel-undo').click();assert.equal(await page.locator('[data-repair-check]:checked').count(),7);assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Windows$/}).count(),0);await page.locator('#panel-redo').click();
 await page.locator('#panel-filter').selectOption('Windows');assert.equal(await page.locator('[data-repair-check]').count(),7);await page.locator('#panel-select-shown').click();await label('Lights');
 assert.equal(await page.locator('[data-repair-check]').count(),0,'filter updates when labels change');await page.locator('#panel-filter').selectOption('all');
 // Drag a box around the last row of four areas, then clear only the active selection.
 const corners=await page.evaluate(()=>{const b=TemplateRepair.inspect(activeView().vectorSource,true).candidates.slice(12).map(r=>r.bounds),x=Math.min(...b.map(r=>r.x))-3,y=Math.min(...b.map(r=>r.y))-3,right=Math.max(...b.map(r=>r.x+r.w))+3,bottom=Math.max(...b.map(r=>r.y+r.h))+3,m=document.querySelector('#repair-preview').getScreenCTM();return [[x,y],[right,bottom]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return {x:p.x,y:p.y};});});
 await page.mouse.move(corners[0].x,corners[0].y);await page.mouse.down();await page.mouse.move(corners[1].x,corners[1].y,{steps:5});await page.mouse.up();assert.equal(await page.locator('[data-repair-check]:checked').count(),4,'box selects enclosed areas');await page.locator('#panel-clear').click();
 // Camera controls and actual pan gesture.
 const box=await page.locator('#repair-preview').getAttribute('viewBox');await page.locator('#panel-plus').click();assert.notEqual(await page.locator('#repair-preview').getAttribute('viewBox'),box);await page.locator('#panel-fit').click();assert.equal(await page.locator('#repair-preview').getAttribute('viewBox'),box);
 await page.locator('#panel-pan').click();const bb=await page.locator('#repair-preview').boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.mouse.move(bb.x+bb.width/2+60,bb.y+bb.height/2+25,{steps:4});await page.mouse.up();assert.notEqual(await page.locator('#repair-preview').getAttribute('viewBox'),box);await page.locator('#panel-fit').click();await page.locator('#panel-select').click();
 await page.locator('#panel-numbers').check();assert.equal(await page.locator('.panel-number').count(),16);
 await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.length),12);assert.equal(await page.evaluate(()=>activeView().panelLabels.length),12);assert(await page.evaluate(()=>activeView().regions.filter(r=>r.partLabel==='Bodywork').length===5));
 // A later cancelled batch leaves both labels and paintability unchanged.
 const saved=await page.evaluate(()=>JSON.stringify(activeView()));await click('repair-template');await page.locator('[data-repair-check]').first().check();await label('Tyres');await click('close-dialog');assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),saved);
 await page.evaluate(()=>flushSave());await app.close();await launch();await page.evaluate(()=>{preparing=true;render();});await click('repair-template');assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Bodywork$/}).count(),5);assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Lights$/}).count(),7);await click('close-dialog');
 const pkg=path.join(out,'labelled-panels.sfpaint');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},pkg);await click('sharing');await click('export-project');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Package exported.');await click('close-dialog');await page.locator('#package-file').setInputFiles(pkg);await page.waitForSelector('[data-action="confirm-import"]');await click('confirm-import');await page.evaluate(()=>{preparing=true;render();});await click('repair-template');assert.equal(await page.locator('.panel-area-row small').filter({hasText:/^Lights$/}).count(),7,'labels survive package import');await click('close-dialog');
 if(process.env.REPAIR_EPS){
  await add(process.env.REPAIR_EPS,'Porsche studio');const checks=page.locator('[data-repair-check]');for(let i=0;i<5;i++)await checks.nth(i).check();await label('Bodywork');for(let i=5;i<12;i++)await checks.nth(i).check();await label('Windows');
  await page.screenshot({path:path.join(out,'09-preparation-studio.png')});
  // Check the smallest supported window too: the canvas, sidebar and footer remain usable.
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(1050,720);});await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{const d=document.querySelector('#dialog').getBoundingClientRect(),s=document.querySelector('#repair-preview').getBoundingClientRect(),f=document.querySelector('#apply-repair').getBoundingClientRect(),l=document.querySelector('#repair-choices').getBoundingClientRect();return {fits:d.right<=innerWidth&&d.bottom<=innerHeight,canvas:s.width>500&&s.height>300,footer:f.bottom<=d.bottom,list:l.height>=70};});assert.deepEqual(layout,{fits:true,canvas:true,footer:true,list:true});
  await page.screenshot({path:path.join(out,'10-studio-small.png')});
 }
 assert.deepEqual(errors,[]);await app.close();app=null;console.log('PASS: 5+7 batch labels, automatic paintability, fresh selections, relabel/filter, undo/redo, zoom/pan, cancel, restart, package sharing and responsive layout.');
}
run().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'studio-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
