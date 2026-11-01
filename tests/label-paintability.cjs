const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'label-paintability-'+Date.now());
const runtime=process.env.ELECTRON_BINARY||require('electron');let app,page;
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function run(){
 await fs.mkdir(out,{recursive:true});const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();await page.waitForSelector('#tools button');
 const source=await fs.readFile(path.join(__dirname,'fixtures/car.svg'),'utf8');
 await page.evaluate(source=>{const src=V.importSVG(source);setProject(M.newProject({id:M.uid(),name:'Label test',views:{left:{...src,regions:[],vectorSource:src}}}));preparing=true;render();},source);
 await click('repair-template');await page.locator('[data-repair-check]').first().check();await page.locator('#panel-label').click();await page.locator('[data-part-label="Bodywork"]').click();
 assert.equal(await page.locator('.panel-area-state.paintable').count(),1);
 await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.role==='body').length),1);
 // Explicit Reference only persists despite the label, including across validation.
 await click('repair-template');await page.locator('[data-repair-check]').first().check();await page.locator('#panel-reference').click();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>activeView().regions.length),0);
 await page.evaluate(()=>{project.template.views.left=V.validateView(activeView());changed();render();});await click('repair-template');assert.equal(await page.locator('.panel-area-state.paintable').count(),0,'saved override respected');
 await page.locator('[data-repair-check]').first().check();await page.locator('#panel-label').click();await page.locator('[data-part-label="Wheels"]').click();assert.equal(await page.locator('.panel-area-state.paintable').count(),1,'labelling again makes paintable');await page.locator('#apply-repair').click();
 if(process.env.PAINTABILITY_LIBRARY){
  const lib=JSON.parse(await fs.readFile(process.env.PAINTABILITY_LIBRARY,'utf8'));const p=lib.projects.find(p=>p.template.name==='Test');assert(p,'user test project available');
  const key=Object.keys(p.template.views).find(k=>p.template.views[k].panelLabels?.length);assert(key,'saved labels available');const count=p.template.views[key].panelLabels.length;
  await page.evaluate(({p,key})=>{setProject(p);currentView=key;preparing=true;render();},{p,key});
  const before=await page.evaluate(()=>JSON.stringify(activeView()));await click('repair-template');assert.equal(await page.locator('.panel-area-state.paintable').count(),count,'old labelled areas automatically recovered');await click('close-dialog');assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),before,'recovery still respects cancel');
  await click('repair-template');await page.locator('#apply-repair').click();assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.role==='body').length),count);assert.equal(await page.evaluate(()=>preparing),false);await page.locator('[data-swatch="#f28a35"]').click();
  await page.screenshot({path:path.join(out,'11-labelled-car-painted.png')});
  const pixels=await page.evaluate(async()=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(V.standalone(project,currentView))));await img.decode();const c=document.createElement('canvas');c.width=1000;c.height=600;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1000,600);const data=ctx.getImageData(0,0,1000,600).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]===242&&data[i+1]===138&&data[i+2]===53&&data[i+3]===255)count++;return count;});assert(pixels>5000,'recovered body regions actually receive paint');console.log(`Recovered ${count} previously labelled areas in the user's Test car; rendered body paint verified.`);
 }
 await app.close();app=null;console.log('PASS: automatic paintability, explicit overrides, relabelling, validation and saved-label recovery.');
}
run().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'label-paintability-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
