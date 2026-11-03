'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
class SQLiteService{
  constructor(legacy){this.legacy=legacy;this.pending=new Map();this.sequence=0;this.worker=null;this.queue=Promise.resolve();this.failed=null;}
  request(op,data){
    if(this.failed)return Promise.reject(this.failed);
    if(!this.worker){
      try{this.worker=new Worker(path.join(__dirname,'library-worker.cjs'),{workerData:{legacy:this.legacy}});}catch(e){return Promise.reject(e);}
      const fail=e=>{this.failed=e;for(const p of this.pending.values())p.reject(e);this.pending.clear();};
      this.worker.on('error',fail);this.worker.on('exit',()=>fail(Error('The library worker stopped. Reopen Livery before saving.')));
      this.worker.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.value);if(!this.pending.size)this.worker.unref();});
      this.worker.unref();
    }
    const id=++this.sequence;this.worker.ref();
    const promise=new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{this.worker.postMessage({id,op,data});}catch(e){this.pending.delete(id);reject(e);if(!this.pending.size)this.worker.unref();}});
    this.queue=promise;return promise;
  }
  load(){return this.request('load');}
  get(key){return this.request('get',key);}
  preview(key){return this.request('preview',key);}
  thumbnail(data){return this.request('thumbnail',data);}
  missingMedia(hashes){return this.request('missing-media',hashes);}
  save(patch){return this.request('commit',patch);}
  restore(data){return this.request('restore',data);}
  snapshot(){return this.request('snapshot');}
}
module.exports={SQLiteService};
