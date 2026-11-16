'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {SQLiteLibrary}=require('../src/sqlite-library.cjs');
globalThis.StorageCodec=require('../renderer/storage-codec.js');
require('../renderer/library-client.js');
const {LibraryClient}=globalThis;
const empty=()=>({schema:1,templates:[],liveries:[],assets:[],fonts:[],projects:[],current:null});
const view=regions=>({bounds:{x:0,y:0,w:1000,h:600},source:'svg',regions});
const region=(id,role='body')=>({id,name:id,role,markup:'<path d="M0 0H100V100Z"/>'});
async function setup(t,data){
  fs.mkdirSync('test-output',{recursive:true});const dir=fs.mkdtempSync(path.resolve('test-output/library-client-test-')),legacy=path.join(dir,'library.json');
  fs.writeFileSync(legacy,JSON.stringify(data));const lib=new SQLiteLibrary(legacy);t.after(()=>{lib.close();fs.rmSync(dir,{recursive:true,force:true});});
  const desktop={save:p=>lib.commit(p),libraryItem:k=>lib.get(k),libraryMissingMedia:h=>lib.missingMedia(h)};
  const client=new LibraryClient(desktop),store=client.accept(await lib.load());return {lib,client,store};
}
// Regression: after a save the client replaces non-current items with summary
// placeholders. Writing a full item back over a placeholder (Finish preparation
// does this for the car template) must remove the stored records it no longer uses.
test('replacing a placeholder item with a full value drops its stale records',async t=>{
  const template={id:'car',name:'Car',scale:'1:32',views:{left:view([region('panel'),region('window','protected')])}};
  const data={...empty(),templates:[template],projects:[{id:'project',name:'Design',template:structuredClone(template),views:{left:[]}}],current:'project'};
  const {lib,client,store}=await setup(t,data);
  assert(client.isLazy(store.templates[0]),'saved templates load as placeholders');
  const replaced={...template,views:{left:view([region('generated-1'),region('generated-2','detail')])}};
  store.templates[0]=structuredClone(replaced);
  await client.save(store);
  assert.deepEqual(lib.snapshot().templates,[replaced]);
  // A second round through a placeholder baseline must also stay consistent.
  assert(client.isLazy(store.templates[0]));
  const again={...replaced,views:{left:view([region('final')])}};store.templates[0]=structuredClone(again);
  await client.save(store);assert.deepEqual(lib.snapshot().templates,[again]);
});
test('ordinary edits to a loaded item still save only changed records',async t=>{
  const template={id:'car',name:'Car',views:{left:view([region('panel')])}};
  const {lib,client,store}=await setup(t,{...empty(),projects:[{id:'project',name:'Design',template,views:{left:[]}}],current:'project'});
  const project=await client.hydrate(store,'projects','project');project.notes='Edited';
  await client.save(store);const total=lib.db.prepare('SELECT count(*) n FROM nodes WHERE owner=?').get(globalThis.StorageCodec.keyOf('projects','project')).n;assert(client.lastSave.transferredNodes<total,`sent ${client.lastSave.transferredNodes} of ${total} records`);assert.equal(lib.snapshot().projects[0].notes,'Edited');
});
