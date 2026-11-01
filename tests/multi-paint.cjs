const path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output','multi-paint-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
  await page.evaluate(()=>{const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">'+[0,1,2,3].map(i=>`<rect x="${50+i*230}" y="100" width="180" height="300" fill="white"/>`).join('')+'</svg>');v.regions.forEach((r,i)=>{r.role='body';r.partLabel=i<2?'Bodywork':i===2?'Lights':'Trim';});setProject(M.newProject({name:'Multi-paint',views:{left:v,right:M.clone(v)}}));currentView='left';preparing=false;selectedPaint=null;render();});
  await require('./inspector-helpers.cjs').openPropertyFolders(page);
  const ids=await page.evaluate(()=>activeView().regions.map(r=>r.id));
  const area=async i=>{const p=await page.evaluate(i=>{const b=activeView().regions[i].bounds,p=new DOMPoint(b.x+b.w/2,b.y+b.h/2).matrixTransform(art.getScreenCTM());return {x:p.x,y:p.y};},i);await page.mouse.click(p.x,p.y);};
  const shiftArea=async i=>{await page.keyboard.down('Shift');try{await area(i);}finally{await page.keyboard.up('Shift');}};
  const chosen=()=>page.evaluate(()=>paintRegions().map(r=>r.id));
  await area(0);await shiftArea(2);assert.deepEqual(await chosen(),[ids[0],ids[2]]);
  assert.equal(await page.locator('#inspector .heading strong').textContent(),'2 areas selected');
  const undoBefore=await page.evaluate(()=>undo.length);await page.locator('[data-swatch="#479b81"]').click();
  assert.deepEqual(await page.evaluate(()=>activeView().regions.map(r=>r.colour||project.base)),['#479b81','#ffffff','#479b81','#ffffff']);assert.equal(await page.evaluate(()=>undo.length),undoBefore+1);
  await page.locator('[data-finish="Matte"]').click();await page.locator('#paint-effect').selectOption('Metallic');
  assert.deepEqual(await page.evaluate(()=>activeView().regions.map(r=>[r.finish,r.effect])),[['Matte','Metallic'],[undefined,undefined],['Matte','Metallic'],[undefined,undefined]]);
  await page.locator('[data-fill-type="gradient"]').click();await page.locator('[data-stop-colour="0"]').fill('#e5484d');await page.locator('[data-stop-colour="0"]').dispatchEvent('change');
  assert(await page.evaluate(()=>{const r=activeView().regions;return JSON.stringify(r[0].gradient)===JSON.stringify(r[2].gradient)&&r[0].gradient!==r[2].gradient&&!r[1].gradient&&!r[3].gradient;}));
  await shiftArea(0);assert.deepEqual(await chosen(),[ids[2]]);await shiftArea(2);assert.deepEqual(await chosen(),[]);
  // Label rows toggle all their members; individual selections are deduplicated.
  await page.locator('[data-paint-select="g:Bodywork"]').click();await page.locator('[data-paint-select="g:Lights"]').click({modifiers:['Control']});assert.deepEqual(await chosen(),ids.slice(0,3));
  await page.locator('[data-paint-select="g:Bodywork"]').click({modifiers:['Shift']});assert.deepEqual(await chosen(),[ids[2]]);
  if(await page.locator('[data-paint-expand="Bodywork"]').getAttribute('aria-expanded')!=='true')await page.locator('[data-paint-expand="Bodywork"]').click();await page.locator(`[data-paint-select="r:${ids[0]}"]`).click({modifiers:['Control']});assert.deepEqual(await chosen(),[ids[0],ids[2]]);
  assert.equal(await page.locator('.paint-child.active').count(),1);
  await area(0);assert.deepEqual(await chosen(),[ids[0]],'Plain click replaces multi-selection');await shiftArea(2);
  const previous=await page.evaluate(()=>activeView().regions.map(r=>r.colour));await page.locator('[data-swatch="#f28a35"]').click();await page.locator('[data-action="undo"]').click();assert.deepEqual(await page.evaluate(()=>activeView().regions.map(r=>r.colour)),previous);
  await page.locator('[data-action="redo"]').click();assert.deepEqual(await page.evaluate(()=>activeView().regions.map(r=>r.colour)),['#f28a35',undefined,'#f28a35',undefined]);
  await area(0);await shiftArea(2);await page.locator('[data-tool="paint"]').click();await page.evaluate(()=>colour='#273442');await area(0);assert.deepEqual(await page.evaluate(()=>activeView().regions.map(r=>r.colour)),['#273442',undefined,'#273442',undefined]);assert.equal((await chosen()).length,2,'Bucket painting preserves the chosen areas');
  await page.locator('[data-tool="select"]').click();const empty=await page.evaluate(()=>new DOMPoint(20,20).matrixTransform(art.getScreenCTM()).toJSON());await page.mouse.click(empty.x,empty.y);assert.deepEqual(await chosen(),[],'Empty canvas deselects all areas');
  // Deselecting and view changes cannot leave stale area IDs as edit targets.
  await page.keyboard.press('Escape');assert.deepEqual(await chosen(),[]);await page.locator('[data-view="right"]').click();assert.equal(await page.evaluate(()=>selectedPaint),'g:Bodywork');assert(await page.evaluate(()=>multiPaintSelected.size===0));
  // Existing multi-artwork editing still works; switching to parts clears it.
  await page.evaluate(()=>{layers().push(M.layer('rect',{x:150,y:200,w:50,h:50}),M.layer('ellipse',{x:450,y:200,w:50,h:50}));render();});
  const artIds=await page.evaluate(()=>layers().map(l=>l.id));await page.locator(`[data-select-layer="${artIds[0]}"]`).click();await page.locator(`[data-select-layer="${artIds[1]}"]`).click({modifiers:['Control']});await page.locator('[data-swatch="#f3d36a"]').click();assert.deepEqual(await page.evaluate(()=>layers().map(l=>l.fill)),['#f3d36a','#f3d36a']);
  await page.locator('[data-paint-select="g:Trim"]').click({modifiers:['Shift']});assert.equal(await page.evaluate(()=>artworkSelection().length),0);assert.equal((await chosen()).length,1);
  assert.deepEqual(errors,[]);console.log('PASS: Shift canvas selection, Ctrl/Shift label and area rows, shared colour/gradient/finish/effect, independent gradient objects, toggling, replace selection, atomic undo/redo, view reset and artwork compatibility.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
