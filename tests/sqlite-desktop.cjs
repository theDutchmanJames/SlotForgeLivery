'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'test-output','sqlite-desktop-'+Date.now());
let app,page;const errors=[];
async function launch(){const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');}
(async()=>{
 await launch();
 await page.evaluate(async()=>{
  const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>'),t={id:'template',name:'SQLite car',views:{left:v}};
  store.templates.push(t);setProject(M.newProject(t));project.id='active';project.views.left=[M.layer('rect',{id:'layer',fill:'#123456'})];store.projects=[project];changed();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const src=canvas.toDataURL();
  for(let i=0;i<1200;i++)store.assets.push({id:'asset-'+i,name:'Decal '+String(i).padStart(4,'0'),type:'image',src,width:2,height:2});
  for(let i=0;i<80;i++)store.projects.push({...M.newProject(t),id:'other-'+i,name:'Inactive '+i});
  await flushSave();
 });
 const before=await page.evaluate(()=>window.desktop.librarySnapshot());
 await app.close();await launch();
 const initial=await page.evaluate(()=>({assets:store.assets.length,lazyAssets:store.assets.filter(x=>libraryClient.isLazy(x)).length,lazyProjects:store.projects.filter(x=>libraryClient.isLazy(x)).length,project:project.id}));
 assert.deepEqual(initial,{assets:1200,lazyAssets:1200,lazyProjects:80,project:'active'});
 const edit=await page.evaluate(async()=>{mutate(()=>layers()[0].fill='#abcdef');await flushSave();return libraryClient.lastSave;});
 assert(edit.transferredNodes<=3,JSON.stringify(edit));assert.equal(edit.transferredBlobs,0);assert(edit.bytes<12000,JSON.stringify(edit));
 await page.evaluate(()=>openLibrary('assets'));assert.equal(await page.locator('.library-card').count(),32);await page.waitForFunction(()=>document.querySelectorAll('[data-preview-id] img').length===32);
 assert.equal(await page.evaluate(()=>store.assets.filter(x=>libraryClient.isLazy(x)).length),1200,'thumbnail browsing does not hydrate library objects');
 await page.locator('[data-page-kind="library"][data-page-step="1"]').click();assert.equal(await page.locator('.library-card strong').first().innerText(),'Decal 0032');
 await page.locator('#library-search').fill('1199');assert.equal(await page.locator('.library-card').count(),1);await page.locator('[data-library-use="asset-1199"]').click();await page.waitForFunction(()=>layers().length===2);assert.match(await page.evaluate(()=>layers()[1].src),/^data:image\/png/);
 await page.evaluate(()=>flushSave());assert(await page.evaluate(()=>libraryClient.isLazy(store.assets.at(-1))),'clean item returns to metadata after placement');
 // A library deletion cannot remove the same image still used by the project.
 await page.evaluate(async()=>{store.assets=[];scheduleSave();await flushSave();store.settings.theme='light';scheduleSave();await flushSave();});
 const saved=await page.evaluate(()=>window.desktop.librarySnapshot());assert.equal(saved.assets.length,0);assert.equal(saved.projects[0].views.left[1].src,before.assets[0].src);
 // Hold the IPC save after capture, edit again, then save both in order.
 const concurrent=await page.evaluate(async()=>{
  const desktop=libraryClient.desktop;let release;const gate=new Promise(r=>release=r);let submitted;
  const started=new Promise(r=>submitted=r);libraryClient.desktop={...desktop,save:async p=>{submitted();await gate;return desktop.save(p);}};
  layers()[0].fill='#111111';changed();clearTimeout(saveTimer);const first=flushSave();await started;layers()[0].fill='#222222';changed();clearTimeout(saveTimer);release();await first;libraryClient.desktop=desktop;await flushSave();return (await desktop.librarySnapshot()).projects[0].views.left[0].fill;
 });assert.equal(concurrent,'#222222');
 // Group fields have their own row; the layers still reconstruct independently.
 const grouped=await page.evaluate(async()=>{project.views.left=[M.layer('rect',{id:'a',groupId:'g',groupName:'Badge'}),M.layer('ellipse',{id:'b',groupId:'g',groupName:'Badge'})];changed();await flushSave();for(const l of layers())l.groupName='Renamed badge';changed();await flushSave();return libraryClient.lastSave;});
 assert(grouped.transferredNodes<=2,JSON.stringify(grouped));
 await page.evaluate(async()=>{const all=await libraryClient.materialize(store,store);if(all.projects.some(p=>!p.template))throw Error('Backup contains placeholders');await flushSave();});
 await app.close();await launch();assert.deepEqual(await page.evaluate(()=>layers().map(l=>[l.id,l.groupName])),[['a','Renamed badge'],['b','Renamed badge']]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'test-output/sqlite-desktop-metrics.json'),JSON.stringify({initial,edit,grouped},null,2));await app.close();app=null;
 console.log('PASS: 1,200-item lazy library; 80 inactive projects; bounded cards/thumbnails; search/place/delete; targeted saves; edits during saves; group records; full backup and restart.');
})().catch(async e=>{console.error(e);if(app)await app.close().catch(()=>{});process.exitCode=1;});
