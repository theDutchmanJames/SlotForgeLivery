const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output'),profile=path.join(out,'settings-'+Date.now());
let app,page;const errors=[];
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');}
const click=id=>page.locator('#'+id).click();
async function color(key,value){await page.locator(`[data-theme-color="${key}"]`).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function run(){
 await fs.mkdir(out,{recursive:true});await launch();
 const svg=await fs.readFile(path.join(__dirname,'fixtures/car.svg'),'utf8');
 await page.evaluate(svg=>{const t={id:M.uid(),name:'Theme test',views:{left:V.importSVG(svg)},scale:'1:32'};setProject(M.newProject(t));preparing=false;const layer=M.layer('rect',{fill:'#aa3300'});project.views.left.push(layer);selected=layer.id;changed();render();},svg);
 const before=await page.evaluate(()=>JSON.stringify(project));
 await page.locator('[data-action="settings"]').click();
 assert.equal(await page.locator('.workspace').isVisible(),false);
 assert.equal(await page.locator('.app-header nav button').last().innerText(),'Settings');
 for(const theme of ['dark','light','midnight','forest','sunset','violet','carbon','ocean']){
   await page.locator(`[data-theme-pick="${theme}"]`).click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
   assert.equal(await page.evaluate(()=>store.settings.theme),theme);
   assert.equal(await page.locator(`[data-theme-pick="${theme}"]`).getAttribute('aria-pressed'),'true');
 }
 // Keyboard artwork commands must not change the hidden project from Settings.
 await page.keyboard.press('Delete');await page.keyboard.press('Control+d');await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>JSON.stringify(project)),before);
 await page.locator('[data-theme-pick="custom"]').click();
 await color('accent','#ffaa00');assert.equal(await page.locator('html').getAttribute('data-theme'),'custom');
 assert.equal(await page.evaluate(()=>store.settings.theme),'ocean','preview is not saved');
 await click('cancel-theme-colors');assert.equal(await page.locator('html').getAttribute('data-theme'),'ocean');
 await click('edit-theme-colors');await page.locator('#theme-copy').selectOption('forest');await click('copy-theme-colors');
 assert.equal(await page.locator('[data-theme-color="bg"]').inputValue(),'#121a16');
 await color('accent','#ffaa00');await color('ink','#121a16');assert(await page.locator('#theme-warning').isVisible());
 await color('ink','#f0f0f0');await click('save-theme-colors');
 assert.equal(await page.evaluate(()=>store.settings.customColors.accent),'#ffaa00');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim()),'#000000');
 await page.screenshot({path:path.join(out,'settings-custom.png')});
 await click('edit-theme-colors');await color('accent','#112233');await page.locator('[data-action="studio"]').click();
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#ffaa00','leaving discards preview');
 assert(await page.locator('.workspace').isVisible());assert.equal(await page.evaluate(()=>JSON.stringify(project)),before);
 await page.locator('[data-action="settings"]').click();await click('edit-theme-colors');await color('accent','#abcdef');
 await page.locator('[data-theme-choice="light"]').click();assert.equal(await page.locator('#custom-theme-editor').isVisible(),false);
 await page.locator('[data-theme-pick="custom"]').click();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#ffaa00');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,720));
 for(const selector of ['[data-action="settings"]','.help-button','[data-theme-choice="light"]'])assert(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
 await page.screenshot({path:path.join(out,'settings-small.png')});
 await page.evaluate(()=>flushSave());await app.close();await launch();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'custom');assert.equal(await page.evaluate(()=>store.settings.customColors.accent),'#ffaa00');
 await page.evaluate(()=>{store.settings={theme:'bad',customColors:{accent:'url(bad)'}};applyTheme();});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.deepEqual(errors,[]);await app.close();app=null;
 console.log('PASS: eight presets, custom live preview/save/cancel, contrast warnings, navigation, artwork isolation, responsive header, persistence and malformed settings.');
}
run().catch(async err=>{console.error(err);if(page)await page.screenshot({path:path.join(out,'settings-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
