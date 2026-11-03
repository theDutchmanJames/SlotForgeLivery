'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const C=require('../renderer/storage-codec.js');
const APP_ID=0x53464c56,VERSION=1;
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const encoded=value=>JSON.stringify(value);
const itemDigest=x=>digest(encoded([x.key,x.bucket,x.identity,x.position,x.root,x.summary]));
class SQLiteLibrary{
  constructor(legacy,options={}){this.legacy=legacy;this.file=legacy.replace(/\.json$/i,'.sqlite');this.options=options;this.db=null;this.blocked=false;this.codec=new C.Codec();}
  open(file=this.file,create=false){
    if(!create&&!fs.existsSync(file))throw Error('The library database is missing.');
    const db=new DatabaseSync(file,{timeout:5000});
    try{
      db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      if(create){
        db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE state(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
          CREATE TABLE items(key TEXT PRIMARY KEY,bucket TEXT NOT NULL,identity TEXT NOT NULL,position INTEGER NOT NULL,root TEXT NOT NULL,summary TEXT NOT NULL,checksum TEXT NOT NULL) STRICT;
          CREATE INDEX item_listing ON items(bucket,position);
          CREATE TABLE nodes(key TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES items(key) ON DELETE CASCADE,data TEXT NOT NULL,checksum TEXT NOT NULL) STRICT;
          CREATE INDEX node_owner ON nodes(owner);
          CREATE TABLE blobs(hash TEXT PRIMARY KEY,data BLOB NOT NULL) STRICT;
          CREATE TABLE blob_refs(node TEXT NOT NULL REFERENCES nodes(key) ON DELETE CASCADE,hash TEXT NOT NULL REFERENCES blobs(hash),PRIMARY KEY(node,hash)) STRICT;
          CREATE TABLE previous_items(key TEXT PRIMARY KEY,value TEXT) STRICT;
          CREATE TABLE previous_nodes(key TEXT PRIMARY KEY,value TEXT) STRICT;
          CREATE TABLE previous_blobs(hash TEXT PRIMARY KEY REFERENCES blobs(hash)) STRICT;
          CREATE TABLE thumbnails(item TEXT PRIMARY KEY REFERENCES items(key) ON DELETE CASCADE,data TEXT NOT NULL) STRICT;
          INSERT INTO state VALUES('revision','0');
          PRAGMA application_id=${APP_ID};PRAGMA user_version=${VERSION};COMMIT;`);
      }
      if(db.prepare('PRAGMA application_id').get().application_id!==APP_ID||db.prepare('PRAGMA user_version').get().user_version!==VERSION)throw Error('Unsupported Livery database. Keep this file and use a compatible app.');
      return db;
    }catch(e){db.close();throw e;}
  }
  revision(){return Number(this.db.prepare("SELECT value FROM state WHERE key='revision'").get().value);}
  missingMedia(hashes){if(!Array.isArray(hashes)||hashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))throw Error('Invalid media references.');const query=this.db.prepare('SELECT 1 FROM blobs WHERE hash=?');return hashes.filter(h=>!query.get(h));}
  async load(){
    try{
      let warning;
      if(!fs.existsSync(this.file)){
        let original;
        try{original=C.validate(JSON.parse(fs.readFileSync(this.legacy,'utf8')));}
        catch(error){
          try{original=C.validate(JSON.parse(fs.readFileSync(this.legacy+'.backup','utf8')));warning='Recovered the previous JSON library backup and migrated it to SQLite. Original files were preserved.';}
          catch(backupError){if(error.code!=='ENOENT'||backupError.code!=='ENOENT')throw Error('Your original library could not be validated. It has not been overwritten. Restore an exported backup.');}
        }
        await this.replace(original||{schema:1,templates:[],liveries:[],assets:[],fonts:[],projects:[],current:null},false);
      }else this.db=this.open();
      if(this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Library database integrity check failed.');
      this.blocked=false;return {...this.catalog(),warning};
    }catch(e){this.db?.close();this.db=null;this.blocked=true;return {data:null,error:e.message};}
  }
  catalog(){
    const metaResult=this.get('$meta'),data={...metaResult.value};
    for(const b of C.buckets)if(Array.isArray(data[b]))data[b]=[];
    for(const row of this.db.prepare("SELECT * FROM items WHERE bucket<>'$meta' ORDER BY position,key").iterate()){
      if(itemDigest(row)!==row.checksum)throw Error('Library metadata is damaged.');
      if(!C.buckets.includes(row.bucket)||!Array.isArray(data[row.bucket]))throw Error('Invalid library category.');
      data[row.bucket].push(JSON.parse(row.summary));
    }
    return {data,revision:this.revision(),sqlite:true,metaNodes:metaResult.nodes};
  }
  readRows(key,previous=false){
    const item=this.db.prepare('SELECT * FROM items WHERE key=?').get(key);
    if(!item)throw Error('This library item no longer exists.');
    if(itemDigest(item)!==item.checksum)throw Error('Library metadata is damaged.');
    const rows=this.db.prepare('SELECT * FROM nodes WHERE owner=?').all(key),nodes=new Map(),blobs=new Map();
    for(const row of rows){if(digest(row.data)!==row.checksum)throw Error('A library object is damaged.');nodes.set(row.key,row.data);}
    for(const row of rows)for(const hash of C.refs(JSON.parse(row.data)).blobs)if(!blobs.has(hash)){
      const value=this.db.prepare('SELECT data FROM blobs WHERE hash=?').get(hash);
      if(!value||digest(value.data)!==hash)throw Error('Library media is missing or damaged.');blobs.set(hash,JSON.parse(Buffer.from(value.data).toString('utf8')));
    }
    return {item,nodes,blobs};
  }
  get(key){const {item,nodes,blobs}=this.readRows(key);return {value:C.unpack(item.root,nodes,blobs),nodes:[...nodes],revision:this.revision()};}
  preview(key){const saved=this.db.prepare('SELECT data FROM thumbnails WHERE item=?').get(key);return saved?{thumbnail:saved.data,revision:this.revision()}:{value:this.get(key).value,revision:this.revision()};}
  thumbnail({key,data,revision}){if(revision!==this.revision())return false;if(typeof data!=='string'||data.length>512*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))throw Error('Invalid library thumbnail.');this.db.prepare('INSERT INTO thumbnails VALUES(?,?) ON CONFLICT(item) DO UPDATE SET data=excluded.data').run(key,data);return true;}
  snapshot(previous=false){
    if(!previous){const data=this.get('$meta').value;for(const row of this.db.prepare("SELECT key,bucket FROM items WHERE bucket<>'$meta' ORDER BY position,key").iterate())data[row.bucket].push(this.get(row.key).value);return C.validate(data);}
    const items=new Map(this.db.prepare('SELECT * FROM items').all().map(x=>[x.key,x]));
    const nodes=new Map(this.db.prepare('SELECT * FROM nodes').all().map(x=>[x.key,x]));
    for(const [table,map]of [['previous_items',items],['previous_nodes',nodes]])for(const row of this.db.prepare(`SELECT * FROM ${table}`).iterate()){if(row.value===null)map.delete(row.key);else map.set(row.key,JSON.parse(row.value));}
    const bodies=new Map([...nodes].map(([key,row])=>{if(digest(row.data)!==row.checksum)throw Error('Previous library object is damaged.');return [key,row.data];})),blobs=new Map();
    for(const row of nodes.values())for(const hash of C.refs(JSON.parse(row.data)).blobs)if(!blobs.has(hash)){const b=this.db.prepare('SELECT data FROM blobs WHERE hash=?').get(hash);if(!b||digest(b.data)!==hash)throw Error('Previous media is damaged.');blobs.set(hash,JSON.parse(Buffer.from(b.data).toString('utf8')));}
    if(!items.has('$meta'))throw Error('No previous saved library is available.');
    const data=C.unpack(items.get('$meta').root,bodies,blobs);
    for(const row of [...items.values()].filter(x=>x.bucket!=='$meta').sort((a,b)=>a.position-b.position||a.key.localeCompare(b.key)))data[row.bucket].push(C.unpack(row.root,bodies,blobs));
    return C.validate(data);
  }
  async fullPatch(data){
    C.validate(data);const items=[],nodes=[],blobs=new Map(),meta={...data};
    for(const b of C.buckets)if(data[b])meta[b]=[];
    const add=async(key,bucket,value,position)=>{const packed=await this.codec.pack(key,value);items.push({key,bucket,identity:bucket==='$meta'?'':value.id,position,root:packed.root,summary:bucket==='$meta'?{}:C.summary(bucket,value)});for(const [k,v]of packed.nodes)nodes.push({key:k,owner:key,data:v});for(const [k,v]of packed.blobs)blobs.set(k,v);};
    await add('$meta','$meta',meta,0);
    for(const b of C.buckets)for(let i=0;i<(data[b]||[]).length;i++)await add(C.keyOf(b,data[b][i].id),b,data[b][i],i);
    const keys=new Set(items.map(i=>i.key)),nodeKeys=new Set(nodes.map(i=>i.key));
    return {revision:this.revision(),items,nodes,blobs:[...blobs],deleteItems:this.db.prepare('SELECT key FROM items').all().filter(x=>!keys.has(x.key)).map(x=>x.key),deleteNodes:this.db.prepare('SELECT key FROM nodes').all().filter(x=>!nodeKeys.has(x.key)).map(x=>x.key)};
  }
  commit(patch){
    if(this.blocked||!this.db)throw Error('Restore a valid backup before saving this library.');
    if(!patch||!Number.isSafeInteger(patch.revision)||!['items','nodes','blobs','deleteItems','deleteNodes'].every(k=>Array.isArray(patch[k])))throw Error('Invalid library transaction.');
    const db=this.db;
    db.exec('BEGIN IMMEDIATE');
    try{
      if(this.revision()!==patch.revision)throw Error('The library changed in another session. Reopen it before saving.');
      const itemGet=db.prepare('SELECT * FROM items WHERE key=?'),nodeGet=db.prepare('SELECT * FROM nodes WHERE key=?');
      const items=patch.items.filter(x=>{const old=itemGet.get(x.key);return !old||old.summary!==encoded(x.summary)||old.root!==x.root||old.position!==x.position;});
      const nodes=patch.nodes.filter(x=>nodeGet.get(x.key)?.data!==x.data);
      const deleteItems=patch.deleteItems.filter(k=>itemGet.get(k)),deleteNodes=new Set(patch.deleteNodes.filter(k=>nodeGet.get(k)));
      for(const key of deleteItems)for(const n of db.prepare('SELECT key FROM nodes WHERE owner=?').all(key))deleteNodes.add(n.key);
      if(!items.length&&!nodes.length&&!deleteItems.length&&!deleteNodes.size){db.exec('COMMIT');return {revision:this.revision(),changedNodes:0};}
      db.exec('DELETE FROM previous_blobs;DELETE FROM previous_items;DELETE FROM previous_nodes;');
      const remember=(table,key,old)=>db.prepare(`INSERT OR IGNORE INTO ${table}(key,value) VALUES(?,?)`).run(key,old?encoded(old):null);
      for(const x of items)remember('previous_items',x.key,itemGet.get(x.key));
      for(const key of deleteItems)remember('previous_items',key,itemGet.get(key));
      for(const key of new Set([...nodes.map(n=>n.key),...deleteNodes])){
        const old=nodeGet.get(key);remember('previous_nodes',key,old);
        if(old)for(const hash of C.refs(JSON.parse(old.data)).blobs)db.prepare('INSERT OR IGNORE INTO previous_blobs VALUES(?)').run(hash);
      }
      for(const [hash,value]of patch.blobs){if(typeof value!=='string'||value.length>32*1024*1024||digest(encoded(value))!==hash)throw Error('Invalid library media.');db.prepare('INSERT OR IGNORE INTO blobs VALUES(?,?)').run(hash,Buffer.from(encoded(value)));}
      for(const x of items){
        if(!['$meta',...C.buckets].includes(x.bucket)||x.key!==(x.bucket==='$meta'?'$meta':C.keyOf(x.bucket,x.identity))||!Number.isSafeInteger(x.position)||x.position<0)throw Error('Invalid library item identity.');
        const summary=encoded(x.summary);db.prepare('INSERT INTO items VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET position=excluded.position,root=excluded.root,summary=excluded.summary,checksum=excluded.checksum').run(x.key,x.bucket,x.identity,x.position,x.root,summary,itemDigest({...x,summary}));
      }
      for(const key of deleteNodes)db.prepare('DELETE FROM nodes WHERE key=?').run(key);
      for(const key of deleteItems)db.prepare('DELETE FROM items WHERE key=?').run(key);
      for(const x of nodes){
        if(typeof x.data!=='string'||x.data.length>32*1024*1024||JSON.parse(x.key)[0]!==x.owner)throw Error('Invalid library object.');
        C.refs(JSON.parse(x.data));
        db.prepare('INSERT INTO nodes VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,checksum=excluded.checksum').run(x.key,x.owner,x.data,digest(x.data));
        db.prepare('DELETE FROM blob_refs WHERE node=?').run(x.key);
        for(const hash of new Set(C.refs(JSON.parse(x.data)).blobs))db.prepare('INSERT INTO blob_refs VALUES(?,?)').run(x.key,hash);
      }
      // Validate affected graphs inside the same transaction; no dangling or
      // cross-project references can be committed, even after a failed import.
      const owners=new Set([...items.map(x=>x.key),...nodes.map(x=>x.owner),...patch.deleteNodes.map(k=>JSON.parse(k)[0])]);
      for(const owner of owners)db.prepare('DELETE FROM thumbnails WHERE item=?').run(owner);
      for(const owner of owners)if(itemGet.get(owner)){
        const row=itemGet.get(owner),all=db.prepare('SELECT key,data FROM nodes WHERE owner=?').all(owner),map=new Map(all.map(n=>[n.key,n.data])),seen=new Set();
        const check=(key,trail=new Set())=>{if(trail.has(key)||!map.has(key))throw Error('Missing or circular library record.');if(seen.has(key))return;seen.add(key);const next=new Set(trail);next.add(key);for(const ref of C.refs(JSON.parse(map.get(key))).nodes)check(ref,next);};
        check(row.root);if(seen.size!==map.size)throw Error('Unreferenced library record.');
      }
      if(!itemGet.get('$meta'))throw Error('Missing library metadata.');
      const metadata=this.get('$meta').value;if(metadata.schema!==1||!['templates','liveries','assets','projects'].every(b=>Array.isArray(metadata[b])&&!metadata[b].length))throw Error('Invalid library metadata.');
      this.options.beforeCommit?.();
      db.prepare("UPDATE state SET value=? WHERE key='revision'").run(String(patch.revision+1));
      db.exec('DELETE FROM blobs WHERE hash NOT IN (SELECT hash FROM blob_refs) AND hash NOT IN (SELECT hash FROM previous_blobs);COMMIT;');
      return {revision:patch.revision+1,changedNodes:nodes.length,changedItems:items.length};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  async replace(data,restore=true){
    C.validate(data);fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.migration-'+crypto.randomUUID(),old=this.db,blocked=this.blocked;let oldClosed=false;
    const closeOld=()=>{if(old&&!oldClosed){old.close();oldClosed=true;}};
    try{
      this.db=this.open(temp,true);this.blocked=false;this.commit(await this.fullPatch(data));
      assert.deepStrictEqual(this.snapshot(),JSON.parse(JSON.stringify(data)),'SQLite migration did not preserve the complete library.');
      this.db.close();this.db=null;this.options.beforePublish?.();
      if(restore&&fs.existsSync(this.file)){
        closeOld();fs.copyFileSync(this.file,this.file+'.recovery-'+crypto.randomUUID(),fs.constants.COPYFILE_EXCL);
        fs.renameSync(temp,this.file);
      }else{fs.linkSync(temp,this.file);fs.unlinkSync(temp);closeOld();}
      this.db=this.open();this.blocked=false;return this.catalog();
    }catch(e){
      if(this.db&&this.db!==old)this.db.close();
      closeOld();
      // A publication failure after closing the old connection must leave a
      // usable recovery state, never a closed DatabaseSync masquerading as open.
      this.db=null;try{if(fs.existsSync(this.file))this.db=this.open();}catch{}
      this.blocked=blocked||!this.db;throw e;
    }
    finally{try{fs.unlinkSync(temp);}catch{/* An interrupted staging file is never used as the live library. */}}
  }
  close(){this.db?.close();this.db=null;}
}
module.exports={SQLiteLibrary};
