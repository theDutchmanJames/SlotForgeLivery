'use strict';
// Disposable synthetic libraries only. No personal app-data path is opened.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {SQLiteLibrary}=require('../src/sqlite-library.cjs');
const {Codec,keyOf,summary}=require('../renderer/storage-codec.js');
const {LibraryStorage}=require('../src/library-storage.cjs');
(async()=>{
  fs.mkdirSync('test-output',{recursive:true});const results=[];
  for(const count of [100,1000,5000]){
    const directory=fs.mkdtempSync(path.resolve('test-output/library-benchmark-'));
    const view={regions:[{id:'panel',role:'body',name:'Body',markup:'<rect width="1000" height="600"/>'}],bounds:{x:0,y:0,w:1000,h:600}};
    const project={id:'p',name:'Active design',template:{id:'t',name:'Test car',views:{left:view}},views:{left:[{id:'l',kind:'rect',fill:'#ffffff',x:300,y:200,w:120,h:80}]}};
    // A shared image used in library items illustrates content deduplication.
    // Keep the largest fixture bounded: 5,000 objects / about 27 MiB of JSON.
    const image='data:image/png;base64,'+Buffer.alloc(4096,7).toString('base64');
    const data={schema:1,templates:[],liveries:[],fonts:[],projects:[project],assets:Array.from({length:count},(_,i)=>({id:'a'+i,name:'Decal '+i,type:'image',src:image,width:64,height:64})),current:'p'};
    const legacy=path.join(directory,'library.json');fs.writeFileSync(legacy,JSON.stringify(data));const lib=new SQLiteLibrary(legacy);
    let start=performance.now();const loaded=await lib.load();assert(!loaded.error,loaded.error);const migrationMs=performance.now()-start;
    lib.close();start=performance.now();const catalog=await lib.load();const reopenMs=performance.now()-start;
    const codec=new Codec(),key=keyOf('projects','p'),before=lib.get(key),oldNodes=new Map(before.nodes);before.value.views.left[0].fill='#abcdef';
    const packed=await codec.pack(key,before.value),changed=packed.nodes.filter(([k,v])=>oldNodes.get(k)!==v).map(([key,data])=>({key,owner:JSON.stringify(['projects','p']),data}));
    const patch={revision:lib.revision(),items:[],nodes:changed,blobs:[],deleteItems:[],deleteNodes:[]};start=performance.now();const saved=lib.commit(patch);const editMs=performance.now()-start;
    const legacyWriter=new LibraryStorage(path.join(directory,'comparison.json'));await legacyWriter.save(data);data.projects[0].views.left[0].fill='#abcdef';start=performance.now();await legacyWriter.save(data);const jsonSaveMs=performance.now()-start;
    assert.equal(saved.changedNodes,1);assert.equal(lib.snapshot().projects[0].views.left[0].fill,'#abcdef');
    results.push({items:count,jsonMiB:+(fs.statSync(legacy).size/1048576).toFixed(2),sqliteMiB:+(fs.statSync(lib.file).size/1048576).toFixed(2),catalogKiB:+(Buffer.byteLength(JSON.stringify(catalog.data))/1024).toFixed(1),migrationMs:+migrationMs.toFixed(1),reopenMs:+reopenMs.toFixed(1),sqliteEditMs:+editMs.toFixed(1),jsonRewriteMs:+jsonSaveMs.toFixed(1),changedNodes:saved.changedNodes,patchBytes:Buffer.byteLength(JSON.stringify(patch))});lib.close();
  }
  fs.writeFileSync('test-output/library-benchmark.json',JSON.stringify(results,null,2));console.table(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
