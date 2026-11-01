const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'test-output','recovery-ui-'+Date.now()),target=path.join(profile,'paintshop-library.json');
let app,page;
async function launch(){
  const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
  page=await app.firstWindow();await page.waitForSelector('#tools button');
}
(async()=>{
  await fs.mkdir(profile,{recursive:true});
  const malformed={schema:1,templates:[],liveries:[],assets:[],projects:[{id:'broken'}],current:'broken'};
  await fs.writeFile(target,JSON.stringify(malformed));await launch();
  assert.equal(await page.evaluate(()=>loadBlocked),true);
  assert.match(await page.locator('#save-status').innerText(),/saving paused/);
  await page.evaluate(async()=>{
    closeDialog();const pkg={format:'slotforge-paintshop',version:1,kind:'library',data:{templates:[],liveries:[],projects:[],assets:[{name:'Recovered rectangle',type:'shape',layer:M.layer('rect')}]}};
    await readPackage(new File([JSON.stringify(pkg)],'recovery.sfpaint'));
  });
  await app.evaluate(()=>{const fs=process.getBuiltinModule('fs/promises');global.originalRename=fs.rename;fs.rename=async()=>{throw new Error('Simulated restore failure');};});
  await page.evaluate(()=>importConfirmed());
  assert.equal(await page.evaluate(()=>loadBlocked),true);
  assert.equal(await page.evaluate(()=>store.assets.length),0);
  assert.equal(await page.evaluate(()=>!!pendingPackage),true);
  assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),malformed);
  await app.evaluate(()=>{process.getBuiltinModule('fs/promises').rename=global.originalRename;});
  await page.evaluate(()=>importConfirmed());
  assert.equal(await page.evaluate(()=>loadBlocked),false);
  assert.equal(JSON.parse(await fs.readFile(target,'utf8')).assets[0].name,'Recovered rectangle');
  await app.close();await launch();
  assert.equal(await page.evaluate(()=>store.assets[0].name),'Recovered rectangle');
  assert.equal(await page.evaluate(()=>loadBlocked),false);
  await app.close();app=null;
  console.log('PASS: malformed startup remains usable, failed restore keeps originals and paused state, retry persists, restart and native shutdown succeed.');
})().catch(async error=>{console.error(error);if(app)await app.close().catch(()=>{});process.exitCode=1;});
