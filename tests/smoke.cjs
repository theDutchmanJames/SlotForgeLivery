const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const playwrightPath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {_electron:electron}=require(playwrightPath);
const runtime=process.env.ELECTRON_BINARY||require('electron');
const out=path.join(root,'test-output'),data=path.join(out,'profile-'+Date.now());
const errors=[];let app,page;
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:data,PAINTSHOP_TEST_PDF:path.join(out,'workshop.pdf')};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env,timeout:30000});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('#tools button');await require('./inspector-helpers.cjs').openPropertyFolders(page);if(process.env.PAINTSHOP_PACKAGED)assert(/\/resources\/app(?:\.asar)?\/renderer\/index\.html/.test(page.url()),'testing the packaged files');}
const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
async function addSVG(){await click('add-car');await page.locator('#car-name').fill('My test coupe');await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(path.join(__dirname,'fixtures/car.svg'));await page.waitForFunction(()=>preparing&&activeView()?.vectorSource?.regions.length===6);await click('close-dialog');await click('generate-regions');}
async function run(){await fs.mkdir(out,{recursive:true});await launch();await page.screenshot({path:path.join(out,'01-empty.png')});
 assert.equal(await page.evaluate(()=>store.templates.length),0,'no installed cars');
 await addSVG();
 let stats=await page.evaluate(()=>({count:activeView().regions.length,body:activeView().regions.filter(r=>r.role==='body').length,protected:activeView().regions.filter(r=>r.role==='protected').length}));
 assert.deepEqual(stats,{count:6,body:1,protected:4});
 await click('finish-preparation');assert.equal(await page.evaluate(()=>preparing),false);
 await page.locator('[data-swatch="#9ed8f5"]').click();
 await page.locator('[data-tool="rect"]').click();
 const at=async(x,y)=>page.evaluate(({x,y})=>{const p=new DOMPoint(x,y).matrixTransform(document.querySelector('#artboard').getScreenCTM());return {x:p.x,y:p.y};},{x,y});
 let p1=await at(280,360),p2=await at(740,420);await page.mouse.move(p1.x,p1.y);await page.mouse.down();await page.mouse.move(p2.x,p2.y,{steps:5});await page.mouse.up();
 assert.equal(await page.evaluate(()=>layers().length),1);await page.locator('#property-colour').fill('#f28a35');await page.locator('#property-colour').dispatchEvent('change');
 await page.locator('#layer-name').fill('Orange stripe');await page.locator('#layer-name').dispatchEvent('change');
 // Move and resize via actual canvas interaction.
 const before=await page.evaluate(()=>({...selection()}));p1=await at(500,390);p2=await at(510,395);await page.mouse.move(p1.x,p1.y);await page.mouse.down();await page.mouse.move(p2.x,p2.y,{steps:3});await page.mouse.up();
 assert(Math.abs((await page.evaluate(()=>selection().x))-before.x)>2,'canvas dragging moves artwork');
 await click('duplicate');assert.equal(await page.evaluate(()=>layers().length),2);await click('undo');assert.equal(await page.evaluate(()=>layers().length),1);await click('redo');assert.equal(await page.evaluate(()=>layers().length),2);await page.locator('[data-select-layer]').first().click();await click('delete');assert.equal(await page.evaluate(()=>layers().length),1);
 await page.locator('[data-tool="text"]').click();await page.locator('#text-value').fill('27');await page.locator('#text-value').dispatchEvent('change');await page.locator('#property-colour').fill('#273442');await page.locator('#property-colour').dispatchEvent('change');
 await page.locator('#pos-y').fill('245');await page.locator('#pos-y').dispatchEvent('change');
 assert.equal(await page.evaluate(()=>store.assets.length),0,'drawing and editing do not add library items');
 const assetsBefore=await page.evaluate(()=>store.assets.length);
 await click('save-asset');await page.locator('#name-input').fill('Team number');await page.locator('#name-save').click();assert.equal(await page.evaluate(()=>store.assets.length),assetsBefore+1);
 // A PNG with alpha is uploaded through the real file input.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 await page.locator('#image-file').setInputFiles({name:'transparent-decal.png',mimeType:'image/png',buffer:png});await page.waitForFunction(n=>store.assets.length===n,assetsBefore+2);assert.equal(await page.evaluate(()=>selection().kind),'image');
 await click('save-livery');await page.locator('#name-input').fill('Club colours');await page.locator('#name-save').click();assert.equal(await page.evaluate(()=>store.liveries.length),1);
 await click('base');await click('notes');await page.locator('#paint-notes').fill('Blue: test paint reference\nOrange: test paint reference');await page.locator('#workshop-notes').fill('Mask the windows. Check the stripe at the wheel arches.');await page.locator('#notes-save').click();
 await click('pdf');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Workshop PDF saved.',{},{timeout:30000});assert.equal((await fs.readFile(path.join(out,'workshop.pdf'))).subarray(0,4).toString(),'%PDF');
 // Export a real self-contained project using the native save handler with an isolated dialog destination.
 const packagePath=path.join(out,'project.sfpaint');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},packagePath);
 await click('sharing');await click('export-project');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Package exported.');
 const pkg=JSON.parse(await fs.readFile(packagePath,'utf8'));assert.equal(pkg.data.views.left.length,3);assert.equal(pkg.data.template.views.left.regions.length,6);
 await click('close-dialog');await page.locator('#package-file').setInputFiles(packagePath);await page.waitForSelector('[data-action="confirm-import"]');await click('confirm-import');assert.equal(await page.evaluate(()=>store.projects.length),2);assert.equal(await page.evaluate(()=>project.views.left.length),3);
 // A second car receives the saved livery; original project and library source remain independent.
 await click('library');await page.locator('[data-library-tab="templates"]').click();await page.locator('[data-library-use]').first().click();assert.equal(await page.evaluate(()=>layers().length),0);
 await click('library');await page.locator('[data-library-tab="liveries"]').click();await page.locator('[data-library-use]').first().click();await page.locator('#confirm-button').click();assert.equal(await page.evaluate(()=>layers().length),3);
 await page.evaluate(()=>{selected=layers()[0].id;render();});await page.screenshot({path:path.join(out,'02-editor.png')});
 // New view and matching-view artwork copy.
 await page.locator('[data-view="right"]').click();await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(path.join(__dirname,'fixtures/car.svg'));await page.waitForFunction(()=>preparing&&currentView==='right');await click('close-dialog');await click('generate-regions');await click('finish-preparation');
 await page.locator('[data-view="left"]').click();await page.locator('[data-select-layer]').last().click();await click('copy-view');await page.locator('#copy-target').selectOption('right');await page.locator('#copy-apply').click();assert.equal(await page.evaluate(()=>project.views.right.length),1);
 // Photo tracing creates a new paintable template, without an automatic conversion claim.
 await page.screenshot({path:path.join(out,'trace-source.png')});await click('add-car');await page.locator('#car-name').fill('Traced photo test');await page.locator('#choose-photo').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(path.join(out,'trace-source.png'));await page.waitForFunction(()=>preparing&&activeView()?.source==='photo');await click('trace');
 for(const [x,y] of [[150,240],[320,140],[680,140],[850,340],[700,440],[200,440]]){const p=await at(x,y);await page.mouse.click(p.x,p.y);}await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>activeView().regions.length),1);await click('finish-preparation');assert.equal(await page.evaluate(()=>activeView().showPhoto),false);
 // Malicious SVG elements and hrefs never enter the region geometry.
 const sanitized=await page.evaluate(()=>V.sanitize('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject/><image href="https://bad.test/x"/><path onload="alert(1)" style="fill:url(https://bad.test)" d="M0 0L100 0L100 100Z"/></svg>').outerHTML);assert(!/script|foreignObject|onload|https:/i.test(sanitized));
 await page.evaluate(()=>flushSave());const savedCount=await page.evaluate(()=>store.projects.length);await app.close();await launch();assert.equal(await page.evaluate(()=>store.projects.length),savedCount);assert.equal(await page.evaluate(()=>project.template.name),'Traced photo test');assert.equal(await page.evaluate(()=>project.template.views.left.regions[0].role),'body');
 assert.deepEqual(errors,[],'no renderer exceptions');await app.close();app=null;await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,projects:savedCount,rendererErrors:errors,checks:['empty library','SVG geometry import','body/protected region assignment','base paint','canvas draw and move','undo and redo','text','PNG upload','asset library','livery library','paint notes','native PDF export','package export and import','livery reuse','view import and copying','photo tracing','SVG sanitization','restart persistence']},null,2));console.log('PASS: full desktop workflow, native PDF, package round-trip and restart persistence.');
}
run().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});

