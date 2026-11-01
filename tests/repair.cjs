const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
const runtime=process.env.ELECTRON_BINARY||require('electron');
let app,page;
async function run(){
 await fs.mkdir(out,{recursive:true});const env={...process.env,PAINTSHOP_TEST_DATA:path.join(out,'repair-profile-'+Date.now()),PAINTSHOP_TEST_PDF:path.join(out,'repair.pdf')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();await page.waitForSelector('#tools button');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
 async function add(file,name){await click('add-car');await page.locator('#car-name').fill(name);await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(file);await page.waitForFunction(n=>preparing&&project?.template.name===n,name);await click('close-dialog');await click('generate-regions');}
 await add(path.join(__dirname,'fixtures/line-art.svg'),'Line-art test');
 const before=await page.evaluate(()=>JSON.stringify(activeView()));
 await click('repair-template');await page.waitForSelector('#repair-preview');
 assert.equal(await page.locator('[data-repair-check]').count(),3,'three holes found, outer ink excluded');
 assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),before,'preview leaves template untouched');
 await click('close-dialog');assert.equal(await page.evaluate(()=>JSON.stringify(activeView())),before,'cancel is non-destructive');
 await click('repair-template');await page.locator('[data-repair-check]').last().check();await page.locator('#apply-repair').click();
 assert.deepEqual(await page.evaluate(()=>({body:activeView().regions.filter(r=>r.role==='body').length,bg:activeView().regions[0].role,ink:activeView().regions[1].role,recovered:activeView().regions.filter(r=>r.recovered).length})),{body:1,bg:'hidden',ink:'protected',recovered:3});
 // Render real pixels to check body fill, background, window protection, and an
 // original dark island inside the recovered panel (not just matching markup).
 const pixels=await page.evaluate(async()=>{
  project.base='#e5484d';project.views[currentView]=[M.layer('rect',{x:0,y:0,w:1000,h:600,fill:'#9ed8f5'})];
  const src=V.standalone(project,currentView),img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(src)));await img.decode();const c=document.createElement('canvas');c.width=1000;c.height=600;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1000,600);
  const pixel=(x,y)=>[...ctx.getImageData(Math.round(122+x*.84),Math.round(90+y*.84),1,1).data];
  return {background:pixel(20,20),panel:pixel(300,330),window:pixel(400,175),island:pixel(420,300)};
 });assert.equal(pixels.background[3],0);assert.deepEqual(pixels.panel,[158,216,245,255]);assert.deepEqual(pixels.window,[227,233,238,255]);assert.notDeepEqual(pixels.island,pixels.panel);
 await click('undo');assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.recovered).length),0);await click('redo');assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.recovered).length),3);
 await click('finish-preparation');await click('pdf');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Workshop PDF saved.');
 assert(await page.evaluate(()=>V.validateView(activeView()).regions.filter(r=>r.recovered).length===3),'recovery survives package validation');
 if(process.env.REPAIR_EPS){
  await add(process.env.REPAIR_EPS,'Porsche repair test');await click('repair-template');await page.waitForSelector('#repair-preview');
  const info=await page.evaluate(()=>TemplateRepair.inspect(activeView()));assert(info.candidates.length>3);assert(info.backgrounds.length===1);
  await fs.writeFile(path.join(out,'porsche-recovered-areas.json'),JSON.stringify(info.candidates.map(r=>({id:r.id,bounds:r.bounds})),null,2));
  const ids=[...info.candidates].sort((a,b)=>b.bounds.w*b.bounds.h-a.bounds.w*a.bounds.h).slice(0,2).map(r=>r.id);
  // Select by spatial position using the actual preview, not an implementation shortcut.
  for(const original of ids){const b=info.candidates.find(r=>r.id===original).bounds;const p=await page.evaluate(({x,y})=>{const q=new DOMPoint(x,y).matrixTransform(document.querySelector('#repair-preview').getScreenCTM());return {x:q.x,y:q.y};},{x:b.x+b.w*.5,y:b.y+b.h*.5});await page.mouse.click(p.x,p.y);}
  await page.screenshot({path:path.join(out,'05-repair-preview.png')});await page.locator('#apply-repair').click();await click('finish-preparation');await page.locator('[data-swatch="#f28a35"]').click();await page.screenshot({path:path.join(out,'06-repaired-porsche.png')});
  assert(await page.evaluate(()=>activeView().regions.some(r=>r.recovered&&r.role==='body')));
  console.log('Exact user EPS: '+info.candidates.length+' enclosed vector areas recovered; background detected.');
 }
 if(process.env.REPAIR_LIBRARY){
  const library=JSON.parse(await fs.readFile(process.env.REPAIR_LIBRARY,'utf8'));
  await page.evaluate(p=>{setProject(p);preparing=true;render();},library.projects[0]);
  await click('repair-template');await page.waitForSelector('#repair-preview');assert.equal(await page.locator('[data-repair-check]').count(),49,'existing imported/recoloured template can be repaired without reimporting');
  await click('close-dialog');
 }
 assert.deepEqual(errors,[]);await page.evaluate(()=>flushSave());await app.close();app=null;console.log('PASS: repair preview/cancel, exact contours, body mask, protected islands/windows, hidden background, undo/redo, package validation and PDF.');
}
run().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'repair-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
