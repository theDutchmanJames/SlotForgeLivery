const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
(async()=>{
 const dist=path.resolve(process.env.LIVERY_PACKAGE_DIR||path.join('dist',`v${require('../package.json').version}`));
 const candidates=process.platform==='win32'?['win-unpacked/SlotForge Livery.exe']:process.platform==='darwin'?['mac-arm64/SlotForge Livery.app/Contents/MacOS/SlotForge Livery','mac/SlotForge Livery.app/Contents/MacOS/SlotForge Livery']:['linux-unpacked/slotforge-livery','linux-arm64-unpacked/slotforge-livery'];
 const executablePath=candidates.map(p=>path.join(dist,p)).find(p=>fs.existsSync(p));
 assert(executablePath,'Native unpacked application exists');
 const env={...process.env,PAINTSHOP_TEST_DATA:path.resolve('test-output',`packaged-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
 const original={schema:1,templates:[],liveries:[],assets:[{id:'migration-shape',name:'Preserved shape',type:'shape',layer:{id:'shape',kind:'rect',fill:'#123456',x:20,y:20,w:40,h:30}}],fonts:[],projects:[],current:null};
 fs.mkdirSync(env.PAINTSHOP_TEST_DATA,{recursive:true});const legacy=path.join(env.PAINTSHOP_TEST_DATA,'paintshop-library.json'),originalBytes=JSON.stringify(original);fs.writeFileSync(legacy,originalBytes);
 let app=await electron.launch({executablePath,args:[],env,timeout:60000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('#tools button');assert(page.url().includes('app.asar'),'Launch packaged source');
  assert.equal(await page.evaluate(()=>libraryClient.enabled),true,'Packaged SQLite worker starts');
  assert.deepEqual(await page.evaluate(()=>window.desktop.librarySnapshot()),original,'Packaged migration preserves existing content');
  assert.equal(await page.locator('.version').innerText(),`v${require('../package.json').version}`,'Official version label is packaged');
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-theme-pick="forest"]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'forest');
  await page.locator('#edit-theme-colors').click();
  await page.locator('[data-theme-color="accent"]').evaluate(el=>{el.value='#ffaa00';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#save-theme-colors').click();
  assert.equal(await page.evaluate(()=>store.settings.customColors.accent),'#ffaa00');
  await page.locator('#settings-back').click();
  await page.locator('[data-action="add-car"]').first().click();
  await page.locator('#car-name').fill('Native release verification');
  await page.locator('#choose-svg').click({noWaitAfter:true});
  await page.locator('#car-file').setInputFiles(path.resolve('tests/fixtures/car.eps'));
  await page.waitForFunction(()=>preparing&&activeView()?.vectorSource?.regions.length>0,{},{timeout:45000});
  await page.evaluate(()=>flushSave());assert.equal(fs.readFileSync(legacy,'utf8'),originalBytes,'Migration original remains unchanged');assert(fs.existsSync(path.join(env.PAINTSHOP_TEST_DATA,'paintshop-library.sqlite')));
  assert.deepEqual(errors,[]);await app.close();app=await electron.launch({executablePath,args:[],env,timeout:60000});const reopened=await app.firstWindow();await reopened.waitForSelector('#tools button');assert.equal(await reopened.evaluate(()=>project.template.name),'Native release verification');assert.equal(await reopened.evaluate(()=>store.assets[0].name),'Preserved shape');
  console.log('PASS: packaged SQLite migration/worker/save/reopen, themes and bundled EPS import');
 }finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
