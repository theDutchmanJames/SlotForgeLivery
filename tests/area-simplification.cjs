const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');let app,page;
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
(async()=>{
 const env={...process.env,PAINTSHOP_TEST_DATA:path.join(out,'simplification-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();await page.waitForSelector('#tools button');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const stats=await page.evaluate(()=>{
   const hole=(x,y,w,h)=>`M${x} ${y}V${y+h}H${x+w}V${y}Z`;
   const small=Array.from({length:320},(_,i)=>hole(20+(i%25)*35,330+Math.floor(i/25)*18,12,12)).join(' ');
   const source=`<svg xmlns="http://www.w3.org/2000/svg"><path fill="black" d="M0 0H1000V600H0Z ${hole(50,50,800,240)} ${small}"/></svg>`;
   window.originalDetailed=V.importSVG(source);const before=JSON.stringify(originalDetailed),result=TemplateRepair.inspect(originalDetailed,true);
   const v={...M.clone(originalDetailed),regions:[],vectorSource:M.clone(originalDetailed)};
   setProject(M.newProject({id:M.uid(),name:'Detailed outline',views:{left:v}}));preparing=true;render();
   window.repairResult=result;
   return {before,after:JSON.stringify(originalDetailed),count:result.candidates.length,simplification:result.simplification};
 });
 assert.equal(stats.before,stats.after);assert.equal(stats.count,1);assert.equal(stats.simplification.total,321);assert.equal(stats.simplification.ignored,320);
 const before=await page.evaluate(()=>JSON.stringify(activeView()));await click('repair-template');
 assert.equal(await page.locator('[data-repair-check]').count(),1);assert.match(await page.locator('.panel-simplification').innerText(),/320 smaller areas/);
 await click('close-dialog');assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),before);
 await click('repair-template');await page.locator('[data-repair-check]').first().check();await page.locator('#panel-label').click();await page.locator('[data-part-label="Bodywork"]').click();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions[0].partLabel),'Bodywork');assert.equal(await page.evaluate(()=>preparing),false);
 const markup=await page.evaluate(()=>activeView().vectorSource.regions[0].markup);assert.equal(markup,JSON.parse(stats.before).regions[0].markup,'original detailed artwork survives');
 // Previously prepared small areas stay present when the chooser is simplified.
 await page.evaluate(()=>{const src=activeView().vectorSource.regions[0];activeView().panelLabels.push({sourceRegionId:src.id,contourIndex:2,label:'Lights',paintable:true});});
 await click('repair-template');assert.equal(await page.locator('[data-repair-check]').count(),2);await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.partLabel==='Lights').length),1);
 await page.evaluate(()=>{const copy=V.validateView(activeView());if(copy.panelLabels.length!==2)throw new Error('Labels did not survive validation');});
 // Direct recovery after Generate all regions uses the same simplification.
 await page.evaluate(()=>{project.template.views.left=M.clone(originalDetailed);preparing=true;render();});await click('repair-template');assert.equal(await page.locator('[data-repair-check]').count(),1);await page.locator('[data-repair-check]').check();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.recovered&&r.role==='body').length),1);
 // Homogeneous details still produce a bounded selection, and simple drawings stay untouched.
 const caps=await page.evaluate(()=>{const list=Array.from({length:300},(_,i)=>({id:String(i),sourceRegionId:'s',contourIndex:i,bounds:{x:i,y:0,w:5,h:5}})),bounds={w:1000,h:600};const crowded=TemplateRepair.simplify(list,bounds),simple=TemplateRepair.simplify(list.slice(0,20),bounds);return {crowded:crowded.candidates.length,simple:simple.candidates.length,notice:simple.simplification};});assert.deepEqual(caps,{crowded:250,simple:20,notice:null});
 if(process.env.DETAIL_EPS){
   await click('add-car');await page.locator('#car-name').fill('Detailed front view');await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(process.env.DETAIL_EPS);
   await page.waitForSelector('#repair-preview',{timeout:30000});const count=await page.locator('[data-repair-check]').count();assert(count>0&&count<=250);const note=await page.locator('.panel-simplification').innerText();assert.match(note,/599/);
   const hood=await page.evaluate(()=>{const p=new DOMPoint(500,260).matrixTransform(document.querySelector('#repair-preview').getScreenCTM());return {x:p.x,y:p.y};});await page.mouse.click(hood.x,hood.y);assert.equal(await page.locator('[data-repair-check]:checked').count(),1,'hood remains selectable');await page.locator('#panel-label').click();await page.locator('[data-part-label="Bodywork"]').click();await page.screenshot({path:path.join(out,'simplified-front-preview.png')});
   await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>preparing),false);assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.role==='body').length),1);
   await page.evaluate(()=>flushSave());console.log(note);
 }
 assert.deepEqual(errors,[]);await app.close();app=null;
 console.log('PASS: automatic detail filtering, bounded candidates, unchanged simple drawings, original geometry, cancellation, labels, reopening, sharing validation and legacy recovery.');
})().catch(async error=>{console.error(error);if(app)await app.close().catch(()=>{});process.exitCode=1;});
