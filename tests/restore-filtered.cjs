const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'restore-filtered-'+Date.now());let app,page;
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();await page.waitForSelector('#tools button');}
(async()=>{
 await launch();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{
   const hole=(x,y,w,h)=>`M${x} ${y}V${y+h}H${x+w}V${y}Z`,small=Array.from({length:320},(_,i)=>hole(20+(i%25)*35,330+Math.floor(i/25)*18,12,12)).join(' ');
   const original=V.importSVG(`<svg xmlns="http://www.w3.org/2000/svg"><path fill="black" d="M0 0H1000V600H0Z ${hole(50,50,800,240)} ${small}"/></svg>`);
   setProject(M.newProject({id:M.uid(),name:'Restore details',views:{left:{...M.clone(original),regions:[],vectorSource:original}}}));preparing=true;render();
 });
 const original=await page.evaluate(()=>JSON.stringify(activeView()));await click('repair-template');await page.locator('#panel-add-filtered').click();
 assert.equal(await page.locator('[data-filtered-area]').count(),320);
 await page.locator('[data-filtered-area]').first().hover();assert(await page.locator('#repair-hover [data-geometry]').count());
 await page.locator('[data-filtered-area]').first().click();assert.equal(await page.locator('[data-repair-check]').count(),2);assert.equal(await page.locator('[data-repair-check]:checked').count(),1);
 await page.locator('#panel-label').click();await page.locator('[data-part-label="Lights"]').click();
 await page.locator('#panel-undo').click();await page.locator('#panel-undo').click();assert.equal(await page.locator('[data-repair-check]').count(),1);
 await page.locator('#panel-redo').click();await page.locator('#panel-redo').click();assert.equal(await page.locator('[data-repair-check]').count(),2);
 await click('close-dialog');assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),original,'cancel discards restored details');
 await click('repair-template');await page.locator('#panel-add-filtered').click();await page.locator('[data-filtered-area]').first().click();await page.locator('#panel-label').click();await page.locator('[data-part-label="Lights"]').click();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions[0].partLabel),'Lights');const detail=await page.evaluate(()=>M.clone(activeView().regions[0]));
 await click('repair-template');assert.equal(await page.locator('[data-repair-check]').count(),2,'restored small area survives reopening');await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions[0].markup),detail.markup);assert.equal(await page.evaluate(()=>V.validateView(activeView()).regions[0].partLabel),'Lights');
 await page.evaluate(()=>flushSave());await app.close();await launch();await click('repair-template');assert.equal(await page.locator('[data-repair-check]').count(),2);await click('close-dialog');
 // The legacy recovery chooser can restore the same original contour.
 await page.evaluate(()=>{project.template.views.left=M.clone(activeView().vectorSource);preparing=true;render();});await click('repair-template');await page.locator('#repair-add-filtered').click();await page.locator('[data-filtered-area]').first().click();assert.equal(await page.locator('[data-repair-check]').count(),2);await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.recovered&&r.role==='body').length),1);
 const capacity=await page.evaluate(()=>{const all=Array.from({length:251},(_,i)=>({id:String(i),bounds:{w:i+1,h:2}})),active=all.slice(0,250),excluded=all.slice(250),next=TemplateRepair.restoreFiltered(active,excluded,'250',new Set(['0']));let blocked=false;try{TemplateRepair.restoreFiltered(active,excluded,'250',new Set(active.map(r=>r.id)));}catch{blocked=true;}return {count:next.candidates.length,kept:next.candidates.some(r=>r.id==='0'),added:next.candidates.some(r=>r.id==='250'),filtered:next.excluded[0].id,blocked};});assert.deepEqual(capacity,{count:250,kept:true,added:true,filtered:'1',blocked:true});
 if(process.env.DETAIL_EPS){
   await click('add-car');await page.locator('#car-name').fill('Restore mirror detail');await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(process.env.DETAIL_EPS);await page.waitForSelector('#panel-add-filtered',{timeout:30000});await page.locator('#panel-add-filtered').click();
   const target=await page.evaluate(()=>{const result=TemplateRepair.inspect(activeView().vectorSource,true),mirror=result.excluded.filter(r=>r.bounds.x>700&&r.bounds.y>140&&r.bounds.y<225).sort((a,b)=>b.bounds.w*b.bounds.h-a.bounds.w*a.bounds.h)[0];if(!mirror)throw new Error('No filtered mirror detail found');return {index:result.excluded.indexOf(mirror),bounds:mirror.bounds,contour:mirror.contourIndex};});
   // Locate the regenerated candidate by its stable contour identity.
   const found=await page.evaluate(target=>{const nodes=[...document.querySelectorAll('[data-filtered-area]')];return nodes.map(n=>({id:n.dataset.filteredArea,b:n.getBBox()})).find(a=>Math.abs(a.b.x-target.bounds.x)<.1&&Math.abs(a.b.y-target.bounds.y)<.1)?.id;},target);
   if(!found)throw new Error('Mirror detail overlay not found');await page.locator(`[data-filtered-area="${found}"]`).click();await page.locator('#panel-label').click();await page.locator('[data-part-label="Bodywork"]').click();await page.locator('#panel-add-filtered').click();await page.screenshot({path:path.join(out,'restored-mirror.png')});await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.partLabel==='Bodywork').length),1);
   console.log('Restored mirror bounds:',JSON.stringify(target.bounds));
 }
 assert.deepEqual(errors,[]);await app.close();app=null;console.log('PASS: exact filtered-area restoration, hover, selection, labelling, undo/redo, cancellation, reopen/restart, sharing, capacity protection and both preparation workflows.');
})().catch(async error=>{console.error(error);if(app)await app.close().catch(()=>{});process.exitCode=1;});
