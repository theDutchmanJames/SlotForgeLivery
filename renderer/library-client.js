(function(root){
  'use strict';
  const C=root.StorageCodec;
  // Copy object containers synchronously before any asynchronous work. Immutable
  // image/font strings are shared while the user can continue editing the canvas.
  function copy(v){if(Array.isArray(v))return v.map(copy);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,copy(x)]));return v;}
  function same(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a).filter(k=>a[k]!==undefined);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));}
  class LibraryClient{
    constructor(desktop){this.desktop=desktop;this.codec=new C.Codec();this.placeholders=new WeakSet();this.baselines=new Map();this.known=new Set();this.revision=0;this.enabled=false;}
    accept(result){
      this.enabled=!!result.sqlite;this.revision=result.revision||0;this.baselines.clear();this.known.clear();
      if(this.enabled&&result.metaNodes)this.baselines.set('$meta',{nodes:new Map(result.metaNodes),summary:'{}',position:0});
      if(this.enabled&&result.data)for(const b of C.buckets)for(const [position,item]of (result.data[b]||[]).entries()){this.placeholders.add(item);const key=C.keyOf(b,item.id);this.known.add(key);this.baselines.set(key,{position,summary:JSON.stringify(item)});}
      return result.data;
    }
    isLazy(item){return !!item&&this.placeholders.has(item);}
    async hydrate(store,bucket,id){
      const item=store[bucket].find(x=>x.id===id);if(!this.enabled||!this.isLazy(item))return item;
      const key=C.keyOf(bucket,id),result=await this.desktop.libraryItem(key);
      if(result.revision!==this.revision)throw Error('The saved library changed. Reopen Livery before continuing.');
      // A user may have deleted/replaced the item while its body was loading.
      const index=store[bucket].indexOf(item);if(index<0)return store[bucket].find(x=>x.id===id);
      store[bucket][index]=result.value;
      this.baselines.set(key,{nodes:new Map(result.nodes),summary:JSON.stringify(C.summary(bucket,result.value))});
      return result.value;
    }
    async save(store,{keepLoaded=false}={}){
      if(!this.enabled)return this.desktop.save(copy(store));
      const meta=copy(Object.fromEntries(Object.entries(store).filter(([k])=>!C.buckets.includes(k))));
      const entries=[];for(const bucket of C.buckets)if(store[bucket]){meta[bucket]=[];for(let i=0;i<store[bucket].length;i++){const value=store[bucket][i];entries.push({bucket,key:C.keyOf(bucket,value.id),position:i,value:this.isLazy(value)?null:copy(value),item:value});}}
      const current=new Set(entries.map(x=>x.key)),patch={revision:this.revision,items:[],nodes:[],blobs:[],deleteItems:[...this.known].filter(k=>!current.has(k)),deleteNodes:[]};
      const next=new Map(),media=new Map();
      async function prepare(client,key,bucket,value,position){
        if(bucket!=='$meta'){const test={schema:1,templates:[],liveries:[],assets:[],fonts:[],projects:[]};test[bucket]=[value];C.validate(test);}
        const packed=await client.codec.pack(key,value),baseline=client.baselines.get(key),nodes=new Map(packed.nodes),summary=bucket==='$meta'?{}:C.summary(bucket,value);
        for(const [k,data]of nodes)if(baseline?.nodes?.get(k)!==data)patch.nodes.push({key:k,owner:key,data});
        for(const k of baseline?.nodes?.keys()||[])if(!nodes.has(k))patch.deleteNodes.push(k);
        for(const [hash,data]of packed.blobs)media.set(hash,data);
        if(!baseline||baseline.summary!==JSON.stringify(summary)||baseline.position!==position)patch.items.push({key,bucket,identity:bucket==='$meta'?'':value.id,position,root:packed.root,summary});
        next.set(key,{nodes,summary:JSON.stringify(summary),position});
      }
      await prepare(this,'$meta','$meta',meta,0);
      for(const entry of entries){
        if(entry.value)await prepare(this,entry.key,entry.bucket,entry.value,entry.position);
        else if(!this.known.has(entry.key))throw Error('An unloaded library item cannot be copied. Open it first.');
      }
      // Persist ordering even when an unloaded item shifts after a deletion.
      for(const entry of entries)if(!entry.value){const baseline=this.baselines.get(entry.key);if(baseline?.position!==entry.position){const summary=copy(entry.item);patch.items.push({key:entry.key,bucket:entry.bucket,identity:entry.item.id,position:entry.position,root:JSON.stringify([entry.key]),summary});next.set(entry.key,{...baseline,position:entry.position,summary:JSON.stringify(summary)});}}
      const referenced=[...new Set(patch.nodes.flatMap(n=>C.refs(JSON.parse(n.data)).blobs))];
      const missing=new Set(referenced.length?await this.desktop.libraryMissingMedia(referenced):[]);
      patch.blobs=[...media].filter(([hash])=>missing.has(hash));
      const result=await this.desktop.save(patch);
      this.revision=result.revision;this.known=current;for(const [k,b]of next)this.baselines.set(k,b);for(const k of patch.deleteItems)this.baselines.delete(k);
      if(!keepLoaded)for(const entry of entries){
        if(!entry.value||entry.bucket==='projects'&&store.current===entry.value.id)continue;
        const index=store[entry.bucket].indexOf(entry.item);
        if(index<0||!same(entry.item,entry.value))continue;
        const brief=C.summary(entry.bucket,entry.item);this.placeholders.add(brief);store[entry.bucket][index]=brief;this.baselines.set(entry.key,{summary:JSON.stringify(brief),position:index});
      }
      this.lastSave={...result,transferredNodes:patch.nodes.length,transferredBlobs:patch.blobs.length,bytes:new TextEncoder().encode(JSON.stringify(patch)).length};
      return result;
    }
    async materialize(store,value){
      const revision=this.revision;
      const capture=v=>{if(this.isLazy(v))return v;if(Array.isArray(v))return v.map(capture);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,capture(x)]));return v;};
      const captured=capture(value);
      const expand=async v=>{
        if(this.isLazy(v)){
          for(const bucket of C.buckets)if(store[bucket].includes(v)){const result=await this.desktop.libraryItem(C.keyOf(bucket,v.id));if(result.revision!==revision)throw Error('The library changed during export. Try again.');return result.value;}
          throw Error('The selected library item is no longer available.');
        }
        if(Array.isArray(v)){const out=[];for(const item of v)out.push(await expand(item));return out;}
        if(v&&typeof v==='object'){const out={};for(const [k,x]of Object.entries(v))Object.defineProperty(out,k,{value:await expand(x),enumerable:true,writable:true,configurable:true});return out;}
        return v;
      };
      return expand(captured);
    }

  }
  root.LibraryClient=LibraryClient;
})(globalThis);
