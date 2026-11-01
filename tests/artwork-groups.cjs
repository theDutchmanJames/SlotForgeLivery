const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'artwork-groups-'+Date.now()),runtime=process.env.ELECTRON_BINARY||require('electron');
let app,page;const errors=[];
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');await require('./inspector-helpers.cjs').openPropertyFolders(page);}
async function at(x,y){return page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.querySelector('#artboard').getScreenCTM());return {x:p.x,y:p.y};},{x,y});}
async function point(x,y){const p=await at(x,y);await page.mouse.click(p.x,p.y);}
async function drag(x,y,xx,yy){const a=await at(x,y),b=await at(xx,yy);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();}
async function named(action,name){await click(action);await page.locator('#name-input').fill(name);await page.locator('#name-save').click();}
async function run(){await fs.mkdir(out,{recursive:true});await launch();
 // Import via the real manual-panel workflow. No initial artwork layer exists.
 await click('add-car');await page.locator('#car-name').fill('Artwork test');await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(path.join(__dirname,'fixtures/car.svg'));await page.waitForSelector('#repair-preview');await page.locator('[data-repair-check]').first().check();await page.locator('#panel-label').click();await page.locator('[data-part-label="Bodywork"]').click();await page.locator('#apply-repair').click();
 assert.equal(await page.evaluate(()=>layers().length),0);
 // A simple click creates a useful sized shape; a drag creates the user's dimensions.
 await page.locator('[data-tool="rect"]').click();await point(320,370);
 assert.deepEqual(await page.evaluate(()=>({count:layers().length,w:selection().w,h:selection().h})),{count:1,w:180,h:100});
 const first=await page.evaluate(()=>selection().id);
 await page.locator('[data-tool="ellipse"]').click();await drag(500,330,600,410);
 const second=await page.evaluate(()=>selection().id);assert.equal(await page.evaluate(()=>layers().length),2);
 await page.locator('#rotation').fill('25');await page.locator('#rotation').dispatchEvent('change');await page.locator('[data-swatch="#9ed8f5"]').click();
 await page.locator('[data-tool="polygon"]').click();for(const p of [[340,260],[440,260],[400,310]])await point(...p);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>selection().kind),'polygon');
 assert.equal(await page.evaluate(()=>store.assets.length),0,'draw and edit do not add library entries');
 // Selecting a tool also works from template mode when paintable areas already exist.
 await click('prepare');await page.locator('[data-tool="rect"]').click();await point(650,370);assert.equal(await page.evaluate(()=>preparing),false);await click('delete');
 // Shift-click layer rows selects separately coloured elements without flattening.
 await page.locator(`[data-select-layer="${first}"]`).click();await page.locator(`[data-select-layer="${second}"]`).click({modifiers:['Shift']});assert.equal(await page.evaluate(()=>artworkSelection().length),2);
 await named('save-asset','Two-tone badge');assert.equal(await page.evaluate(()=>store.assets.length),1);
 const snapshot=await page.evaluate(()=>M.clone(store.assets[0]));assert.equal(snapshot.type,'group');assert.equal(snapshot.layers.length,2);assert.equal(snapshot.layers[1].rotation,25);assert.notEqual(snapshot.layers[0].fill,snapshot.layers[1].fill);
 await page.locator('[data-swatch="#479b81"]').click();assert.deepEqual(await page.evaluate(()=>store.assets[0]),snapshot,'library copy does not track subsequent edits');
 // A placed group has a new identity and exposes its own editable children.
 await click('library');await page.locator('[data-library-tab="assets"]').click();await page.locator('[data-library-use]').first().click();
 const group=await page.evaluate(()=>selected.slice(6));assert.equal(await page.evaluate(()=>artworkSelection().length),2);assert.equal(await page.evaluate(()=>store.assets.length),1);
 await page.locator(`[data-art-expand="${group}"]`).click();const children=await page.evaluate(()=>artworkSelection().map(l=>l.id));await page.locator(`[data-select-layer="${children[0]}"]`).click();await page.locator('[data-swatch="#f3d36a"]').click();
 assert.equal(await page.evaluate(id=>layers().find(l=>l.id===id).fill,children[1]),snapshot.layers[1].fill,'editing one child preserves the other');
 // Saving one child produces a standalone asset, detached from its group.
 await named('save-asset','Single child');assert.equal(await page.evaluate(()=>store.assets[1].layer.groupId),undefined);
 await page.locator(`[data-art-group="${group}"]`).click();const before=await page.evaluate(()=>M.clone(artworkSelection()));
 await page.keyboard.press('ArrowRight');assert(await page.evaluate(old=>artworkSelection().every((l,i)=>l.x===old[i].x+1&&l.y===old[i].y),before));
 const start=await page.evaluate(()=>{const l=artworkSelection()[0];return {x:l.x+l.w/2,y:l.y+l.h/2};});await drag(start.x,start.y,start.x+20,start.y+10);
 assert(await page.evaluate(old=>artworkSelection().every((l,i)=>Math.abs(l.x-old[i].x-21)<1&&Math.abs(l.y-old[i].y-10)<1),before),'canvas drag moves every child equally');
 await page.locator(`[data-art-group-visible="${group}"]`).click();assert.equal(await page.locator(`#artboard [data-layer="${children[0]}"]`).count(),0);await page.locator(`[data-art-group-visible="${group}"]`).click();
 await click('duplicate');assert.notEqual(await page.evaluate(()=>selected.slice(6)),group);assert.equal(await page.evaluate(()=>artworkSelection().length),2);await click('delete');assert.equal(await page.evaluate(id=>layers().filter(l=>l.groupId===id).length,group),2);
 await click('undo');assert.equal(await page.evaluate(()=>layers().length),7);await click('redo');assert.equal(await page.evaluate(()=>layers().length),5);
 await page.locator(`[data-art-group="${group}"]`).click();const ungrouped=await page.evaluate(()=>artworkSelection().map(({groupId,groupName,groupHidden,...l})=>l));await click('ungroup-artwork');assert.deepEqual(await page.evaluate(()=>artworkSelection()),ungrouped);await named('group-artwork','Editable badge');
 await page.screenshot({path:path.join(out,'13-artwork-groups.png')});
 // Export and import a grouped library asset, then place twice with independent IDs.
 const file=path.join(out,'group.sfpaint');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
 await click('library');await page.locator('[data-library-tab="assets"]').click();await page.locator(`[data-library-export="${snapshot.id}"]`).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Package exported.');await click('close-dialog');
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).data.layers.length,2);await page.locator('#package-file').setInputFiles(file);await page.waitForSelector('[data-action="confirm-import"]');await click('confirm-import');await click('close-dialog');
 assert.equal(await page.evaluate(()=>store.assets.length),3);assert.equal(await page.evaluate(()=>store.assets[2].layers[1].rotation),25);
 for(let i=0;i<2;i++){await click('library');await page.locator('[data-library-tab="assets"]').click();await page.locator('[data-library-use]').last().click();}
 assert.equal(await page.evaluate(()=>new Set(layers().filter(l=>l.groupId).map(l=>l.groupId)).size),3);
 const saved=await page.evaluate(()=>M.clone(project.views));await page.evaluate(()=>flushSave());await app.close();await launch();assert.deepEqual(await page.evaluate(()=>project.views),saved);assert.equal(await page.evaluate(()=>store.assets.length),3);assert.equal(await page.locator('[data-art-group]').count(),3);
 assert.deepEqual(errors,[]);await app.close();app=null;console.log('PASS: direct drawing, explicit snapshots, multiselect, editable groups, child editing, group movement/visibility, duplicate/delete/undo, ungroup/regroup, sharing and restart.');
}
run().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(out,'artwork-groups-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
