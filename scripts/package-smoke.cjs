const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
(async()=>{
 const dist=path.resolve('dist',`v${require('../package.json').version}`);
 const candidates=process.platform==='win32'?['win-unpacked/SlotForge Livery.exe']:process.platform==='darwin'?['mac-arm64/SlotForge Livery.app/Contents/MacOS/SlotForge Livery','mac/SlotForge Livery.app/Contents/MacOS/SlotForge Livery']:['linux-unpacked/slotforge-livery','linux-arm64-unpacked/slotforge-livery'];
 const executablePath=candidates.map(p=>path.join(dist,p)).find(p=>fs.existsSync(p));
 assert(executablePath,'Native unpacked application exists');
 const env={...process.env,PAINTSHOP_TEST_DATA:path.resolve('test-output',`packaged-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath,args:[],env,timeout:60000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('#tools button');assert(page.url().includes('app.asar'),'Launch packaged source');
  await page.locator('[data-action="add-car"]').first().click();
  await page.locator('#car-name').fill('Native release verification');
  await page.locator('#choose-svg').click({noWaitAfter:true});
  await page.locator('#car-file').setInputFiles(path.resolve('tests/fixtures/car.eps'));
  await page.waitForFunction(()=>preparing&&activeView()?.vectorSource?.regions.length>0,{},{timeout:45000});
  assert.deepEqual(errors,[]);console.log('PASS: packaged app starts and imports EPS through its bundled converter');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
