'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {SQLiteLibrary}=require('../src/sqlite-library.cjs');
const C=require('../renderer/storage-codec.js');
const empty=()=>({schema:1,templates:[],liveries:[],assets:[],fonts:[],projects:[],current:null});
const media='data:image/png;base64,'+Buffer.alloc(2048,37).toString('base64');
function fixture(){
  const view={bounds:{x:0,y:0,w:1000,h:600},source:'svg',regions:[{id:'panel',name:'Door',role:'body',partLabel:'Bodywork',markup:'<path d="M0 0H100V100Z"/>',paint:{fill:'#123456'}},{id:'window',role:'protected',markup:'<rect width="30" height="20"/>'}]};
  const template={id:'car',name:'Car',views:{left:view},scale:'1:32'};
  const layers=[{id:'stripe',kind:'line',points:[{x:0,y:0,out:{x:.1,y:.2}},{x:1,y:1}],lineStripes:[{width:3},{width:12},{width:3}],groupId:'badge',groupName:'Badge',groupPose:{pinchX:.2},fill:'#ff0000'},{id:'decal',kind:'image',src:media,groupId:'badge',groupName:'Badge',opacity:.7}];
  return {...empty(),templates:[template],assets:[{id:'image',name:'Decal',type:'image',src:media,width:10,height:10},{id:'group',name:'Editable badge',type:'group',layers:structuredClone(layers)}],projects:[{id:'project',name:'Design',template:structuredClone(template),views:{left:structuredClone(layers)},base:'#fff000',notes:'Keep this',customFutureField:{nested:['retained',17]}}],liveries:[{id:'livery',name:'Reusable',views:{left:structuredClone(layers)}}],fonts:[{id:'font',name:'Custom font',fontData:{family:'sf-font-test',name:'Custom',src:'data:font/ttf;base64,'+Buffer.alloc(2048,38).toString('base64')}}],current:'project',settings:{theme:'custom',customColors:{bg:'#181818'}}};
}
async function setup(t,data,options,filename='library.json'){fs.mkdirSync('test-output',{recursive:true});const dir=fs.mkdtempSync(path.resolve('test-output/sqlite-test-')),legacy=path.join(dir,filename);if(data)fs.writeFileSync(legacy,JSON.stringify(data));const lib=new SQLiteLibrary(legacy,options);t.after(()=>{lib.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,legacy,lib};}
test('migration is lossless, preserves original bytes, and splits views, panels and layers',async t=>{
  const original=fixture(),{lib,legacy}=await setup(t,original),bytes=fs.readFileSync(legacy);const result=await lib.load();assert.equal(result.sqlite,true);assert.deepEqual(lib.snapshot(),original);assert.deepEqual(fs.readFileSync(legacy),bytes);
  const counts=lib.db.prepare('SELECT owner,count(*) count FROM nodes GROUP BY owner').all();assert(counts.find(x=>x.owner===C.keyOf('projects','project')).count>=7);
  assert.equal(lib.db.prepare('SELECT count(*) count FROM blobs').get().count,2,'repeated decal bytes stored once, plus font');
  assert(!JSON.stringify(result.data).includes(media));assert(!result.data.projects[0].template);assert.equal(result.data.projects[0].storageSummary.templateName,'Car');
  lib.close();assert.equal((await lib.load()).sqlite,true);assert.deepEqual(lib.snapshot(),original);
});
test('valid fallback migrates without changing either original file',async t=>{
  const {lib,legacy}=await setup(t);fs.writeFileSync(legacy,'broken');fs.writeFileSync(legacy+'.backup',JSON.stringify(fixture()));const result=await lib.load();assert.match(result.warning,/backup/);assert.deepEqual(lib.snapshot(),fixture());assert.equal(fs.readFileSync(legacy,'utf8'),'broken');assert.deepEqual(JSON.parse(fs.readFileSync(legacy+'.backup','utf8')),fixture());
});
test('failed publication never replaces JSON and retries cleanly',async t=>{
  let fail=true;const data=fixture(),{lib,legacy,dir}=await setup(t,data,{beforePublish(){if(fail)throw Error('injected publication failure');}});
  assert.match((await lib.load()).error,/publication failure/);assert(!fs.existsSync(lib.file));assert.deepEqual(JSON.parse(fs.readFileSync(legacy)),data);assert(!fs.readdirSync(dir).some(n=>n.includes('.migration-')));
  fail=false;assert.equal((await lib.load()).sqlite,true);assert.deepEqual(lib.snapshot(),data);
});
test('existing bad SQLite blocks stale JSON fallback and ordinary writes',async t=>{
  const {lib}=await setup(t,fixture());fs.writeFileSync(lib.file,'broken sqlite');assert((await lib.load()).error);assert.throws(()=>lib.commit({}),/Restore/);assert.equal(fs.readFileSync(lib.file,'utf8'),'broken sqlite');
});
test('unsupported schema never overwrites a newer database',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();lib.db.exec('PRAGMA user_version=99');lib.close();const before=fs.readFileSync(lib.file);assert.match((await lib.load()).error,/Unsupported/);assert.deepEqual(fs.readFileSync(lib.file),before);
});
test('malformed library cannot be migrated or replace a valid one',async t=>{
  const bad={...empty(),projects:[{id:'broken',name:'Broken'}]}, {lib,legacy}=await setup(t,bad);assert((await lib.load()).error);assert(!fs.existsSync(lib.file));assert.deepEqual(JSON.parse(fs.readFileSync(legacy)),bad);
  await assert.rejects(lib.replace(bad),/template/);
});
test('small edit updates one layer; previous revision and independent template survive',async t=>{
  const original=fixture(),{lib}=await setup(t,original);await lib.load();const next=structuredClone(original);next.projects[0].views.left[0].fill='#abcdef';
  const result=lib.commit(await lib.fullPatch(next));assert.equal(result.changedNodes,1);assert.deepEqual(lib.snapshot(true),original);assert.deepEqual(lib.snapshot(),next);assert.deepEqual(lib.snapshot().templates,original.templates);
  const revision=lib.revision();assert.equal(lib.commit(await lib.fullPatch(next)).changedNodes,0);assert.equal(lib.revision(),revision);
});
test('multi-panel edit rolls back completely after injected disk/commit failure',async t=>{
  let fail=false;const original=fixture(),{lib}=await setup(t,original,{beforeCommit(){if(fail)throw Error('injected write failure');}});await lib.load();const revision=lib.revision(),next=structuredClone(original);next.projects[0].template.views.left.regions.forEach(x=>x.colour='#abcdef');
  fail=true;
  const patch=await lib.fullPatch(next);assert.throws(()=>lib.commit(patch),/write failure/);assert.equal(lib.revision(),revision);assert.deepEqual(lib.snapshot(),original);
  fail=false;lib.commit(patch);assert.deepEqual(lib.snapshot(),next);assert.deepEqual(lib.snapshot(true),original);
});
test('stale writers are rejected without losing the winning edit',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();const next=lib.snapshot();next.settings.theme='light';const first=await lib.fullPatch(next),stale=await lib.fullPatch(fixture());lib.commit(first);assert.throws(()=>lib.commit(stale),/another session/);assert.deepEqual(lib.snapshot(),next);
});
test('removal, reordered layers and later reuse preserve media and previous state',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();const next=lib.snapshot();next.assets=[];next.projects[0].views.left.reverse();lib.commit(await lib.fullPatch(next));assert.deepEqual(lib.snapshot(),next);assert(lib.db.prepare('SELECT count(*) count FROM blobs').get().count>=1);
  const wiped=empty();lib.commit(await lib.fullPatch(wiped));assert.deepEqual(lib.snapshot(true),next);const nextEmpty={...wiped,settings:{theme:'light'}};lib.commit(await lib.fullPatch(nextEmpty));assert.equal(lib.db.prepare('SELECT count(*) count FROM blobs').get().count,0);lib.commit(await lib.fullPatch(fixture()));assert.deepEqual(lib.snapshot(),fixture());
});
test('corrupt media and object checksums are reported without changing files',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();const hash=lib.db.prepare('SELECT hash FROM blobs LIMIT 1').get().hash;lib.db.prepare('UPDATE blobs SET data=? WHERE hash=?').run(Buffer.from('bad'),hash);assert.throws(()=>lib.snapshot(),/media.*damaged/);
  const key=lib.db.prepare("SELECT key FROM nodes WHERE owner<> '$meta' LIMIT 1").get().key;lib.db.prepare('UPDATE nodes SET data=? WHERE key=?').run('["v",null]',key);assert.throws(()=>lib.snapshot(),/damaged/);
});
test('dangling and cross-project references fail inside the transaction',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();const before=lib.snapshot(),patch=await lib.fullPatch(before);const root=patch.nodes.find(n=>n.owner===C.keyOf('projects','project'));root.data=JSON.stringify(['r','missing']);assert.throws(()=>lib.commit(patch),/Missing/);assert.deepEqual(lib.snapshot(),before);
});
test('restore preserves broken SQLite and JSON as recovery evidence',async t=>{
  const {lib,legacy,dir}=await setup(t);fs.writeFileSync(legacy,'old broken json');fs.writeFileSync(lib.file,'old broken sqlite');assert((await lib.load()).error);await lib.replace(fixture());assert.deepEqual(lib.snapshot(),fixture());assert.equal(fs.readFileSync(legacy,'utf8'),'old broken json');const archive=fs.readdirSync(dir).find(n=>n.includes('.sqlite.recovery-'));assert.equal(fs.readFileSync(path.join(dir,archive),'utf8'),'old broken sqlite');
});
test('thumbnail cache is separate, revision checked and invalidated by edits',async t=>{
  const {lib}=await setup(t,fixture());await lib.load();const key=C.keyOf('templates','car'),revision=lib.revision();assert(lib.preview(key).value);assert(lib.thumbnail({key,data:media,revision}));assert.equal(lib.preview(key).thumbnail,media);const next=lib.snapshot();next.templates[0].name='Changed';lib.commit(await lib.fullPatch(next));assert(lib.preview(key).value);assert.equal(lib.thumbnail({key,data:media,revision}),false);
});
test('codec round-trips reserved-looking properties, Unicode and absent fonts',async t=>{
  const data=fixture();delete data.fonts;data.extra=JSON.parse('{"__proto__":{"text":"安全"},"constructor":["r","fake"],"tag":{"$ref":"fake"}}');const {lib}=await setup(t,data);assert.equal((await lib.load()).sqlite,true);assert.deepEqual(lib.snapshot(),data);assert.equal({}.text,undefined);
});
test('duplicate ids reject migration instead of silently merging library entries',async t=>{
  const data=fixture();data.templates.push(structuredClone(data.templates[0]));const {lib,legacy}=await setup(t,data);assert((await lib.load()).error);assert(!fs.existsSync(lib.file));assert.deepEqual(JSON.parse(fs.readFileSync(legacy)),data);
});
test('long strings preserve distinct lone UTF-16 surrogates exactly',async t=>{
  const data=fixture();data.projects[0].extra=['x'.repeat(2048)+'\ud800','x'.repeat(2048)+'\ud801'];const {lib}=await setup(t,data);assert.equal((await lib.load()).sqlite,true);assert.deepEqual(lib.snapshot(),data);
});
test('export destinations cannot overwrite live libraries or recovery copies',async t=>{
  const {assertExportTarget}=require('../src/export-path.cjs'),{lib,legacy,dir}=await setup(t,fixture(),undefined,'paintshop-library.json');await lib.load();
  await assert.rejects(assertExportTarget(legacy,dir),/library/);await assert.rejects(assertExportTarget(lib.file,dir),/library/);await assert.rejects(assertExportTarget(lib.file+'.recovery-example',dir),/library/);
  const alias=path.join(dir,'export.sfpaint');fs.linkSync(lib.file,alias);await assert.rejects(assertExportTarget(alias,dir),/overwrite/);await assertExportTarget(path.join(dir,'safe.sfpaint'),dir);
});
test('group properties have one record while divergent legacy fields remain lossless',async t=>{
  const data=fixture();data.projects[0].views.left[1].groupPose={pinchX:.2};const {lib}=await setup(t,data);await lib.load();const next=lib.snapshot();next.projects[0].views.left.forEach(l=>l.groupName='Renamed');assert.equal(lib.commit(await lib.fullPatch(next)).changedNodes,1);assert.deepEqual(lib.snapshot(),next);
  next.projects[0].views.left[1].groupName='Different legacy value';lib.commit(await lib.fullPatch(next));assert.deepEqual(lib.snapshot(),next);
});
test('terminating a writer mid-transaction rolls back on reopen',async t=>{
  const {Worker}=require('node:worker_threads'),{lib}=await setup(t,fixture());await lib.load();const before=lib.snapshot();lib.close();
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData);db.exec("BEGIN IMMEDIATE; UPDATE nodes SET data='corrupted unfinished write';");parentPort.postMessage('written');setInterval(()=>{},1000);`,{eval:true,workerData:lib.file});
  await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});await worker.terminate();assert.equal((await lib.load()).sqlite,true);assert.deepEqual(lib.snapshot(),before);
});
test('publication cannot overwrite a database created during migration',async t=>{
  let file;const {lib,legacy}=await setup(t,fixture(),{beforePublish(){fs.writeFileSync(file,'another process owns this file');}});file=lib.file;assert((await lib.load()).error);assert.equal(fs.readFileSync(file,'utf8'),'another process owns this file');assert.deepEqual(JSON.parse(fs.readFileSync(legacy)),fixture());
});
