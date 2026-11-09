const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const D=require('../renderer/decals/model.js');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'test-output','decal-placement-'+Date.now());
let app,page;const errors=[];
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');}
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function place(name){await page.evaluate(()=>openLibrary('assets'));await page.locator('#library-search').fill(name);await page.locator('[data-library-use]').first().click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);}
(async()=>{
 const fixture={format:'slotforge-decals-sheets',version:1,sheets:[{project:{...D.project('Separate badges'),items:Array.from({length:31},(_,i)=>D.item('svg',{name:i===0?'Dutch Motorsport':i===1?'Forge Racing':'Other badge '+i,svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text x="0" y="20">${i===0?'DUTCH':i===1?'FORGE':'BADGE '+i}</text></svg>`}))}}]};
 const source=process.env.DECAL_PLACEMENT_SHEET?await fs.readFile(process.env.DECAL_PLACEMENT_SHEET):Buffer.from(JSON.stringify(fixture));
 await launch();await page.evaluate(()=>{const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>');setProject(M.newProject({id:M.uid(),name:'Library placement',views:{left:v}}));preparing=false;addLayer(M.layer('rect',{name:'Existing design',fill:'#123456'}));});
 const before=await page.evaluate(()=>M.clone(layers()));
 await page.locator('#image-file').setInputFiles({name:'Separate badges.sfsheet',mimeType:'application/json',buffer:source});await page.waitForSelector('#decal-save');
 assert(await page.locator('#decal-place').isDisabled(),'batch placement must be an explicit choice');assert(await page.locator('#decal-save').evaluate(b=>b.classList.contains('primary')));
 await page.locator('#decal-allow-batch').check();assert(await page.locator('#decal-place').isEnabled());await page.locator('[data-decal-choice]').first().uncheck();assert(await page.locator('#decal-place').isDisabled(),'changing selection resets batch confirmation');await page.locator('[data-decal-choice]').first().check();
 await page.locator('#decal-save').click();assert.deepEqual(await page.evaluate(()=>layers()),before,'library import must not change the car');await click('close-dialog');await page.evaluate(()=>flushSave());await app.close();await launch();
 await place('Dutch Motorsport');assert.equal(await page.evaluate(()=>layers().length),before.length+1);assert(await page.evaluate(()=>selection().svg.includes('DUTCH')&&!selection().svg.includes('FORGE')));assert.equal(await page.evaluate(()=>artworkSelection().length),1);
 const dutch=await page.evaluate(()=>M.clone(selection()));await place('Forge Racing');assert.equal(await page.evaluate(()=>layers().length),before.length+2);assert(await page.evaluate(()=>selection().svg.includes('FORGE')&&!selection().svg.includes('DUTCH')));assert.deepEqual(await page.evaluate(id=>layers().find(l=>l.id===id),dutch.id),dutch);
 await click('undo');assert.equal(await page.evaluate(()=>layers().length),before.length+1);await click('redo');assert.equal(await page.evaluate(()=>layers().length),before.length+2);
 await page.evaluate(()=>flushSave());await app.close();await launch();await place('Dutch Motorsport');assert.equal(await page.evaluate(()=>layers().length),before.length+3);assert.equal(await page.evaluate(()=>artworkSelection().length),1);
 await page.screenshot({path:path.join(root,'test-output','decal-placement-verified.png')});assert.deepEqual(errors,[]);await app.close();app=null;
 console.log('PASS: sheet import leaves design unchanged, explicit batch placement, independent library placement after restart, existing artwork preserved, undo/redo.');
})().catch(async e=>{console.error(e);if(app)await app.close().catch(()=>{});process.exitCode=1;});
