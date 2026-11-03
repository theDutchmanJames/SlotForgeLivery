/* Lossless storage representation shared by the renderer and SQLite worker.
 * References are tagged tuples, never magic properties in user objects. */
(function(root){
  'use strict';
  const buckets=['templates','liveries','assets','fonts','projects'];
  const keyOf=(bucket,id)=>JSON.stringify([bucket,id]);
  const own=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
  async function hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
  class Codec{
    constructor(){this.hashes=new Map();this.bytes=0;}
    async digest(text){
      if(this.hashes.has(text))return this.hashes.get(text);
      // JSON encoding also preserves lone UTF-16 surrogates exactly; plain UTF-8
      // would silently replace them and could merge distinct original strings.
      const digest=await hash(JSON.stringify(text));
      // Keep only a bounded cache of immutable bodies, not every imported asset.
      if(text.length<16*1024*1024){if(this.bytes+text.length>24*1024*1024){this.hashes.clear();this.bytes=0;}this.hashes.set(text,digest);this.bytes+=text.length;}
      return digest;
    }
    async pack(owner,value){
      const nodes=new Map(),blobs=new Map(),trail=new Set();
      const visit=async(v,parts,force=false,depth=0,group=null)=>{
        if(depth>128)throw Error('Library objects are nested too deeply.');
        if(v===undefined||v===null)return ['v',null];
        if(typeof v==='string'&&(v.length>=1024||/^data:(image|font)\//.test(v))){const id=await this.digest(v);blobs.set(id,v);return ['b',id];}
        if(typeof v!=='object'){if(!['string','number','boolean'].includes(typeof v))throw Error('Unsupported library value.');return ['v',typeof v==='number'&&!Number.isFinite(v)?null:v];}
        if(trail.has(v))throw Error('Circular library object.');trail.add(v);
        let body;
        if(Array.isArray(v)){
          const groups=new Map(),groupKeys=['groupId','groupName','groupHidden','groupPose'];
          for(const item of v)if(item?.kind&&item.groupId){const fields=Object.fromEntries(groupKeys.filter(k=>item[k]!==undefined).map(k=>[k,item[k]])),signature=JSON.stringify(fields),existing=groups.get(item.groupId);if(!existing)groups.set(item.groupId,{fields,signature});else if(existing.signature!==signature)existing.mixed=true;}
          for(const [id,shared]of groups)if(!shared.mixed)shared.ref=await visit(shared.fields,[...parts,'@group',id],true,depth+1);
          const ids=new Set();body=['a',[]];
          for(let i=0;i<v.length;i++){
            const id=v[i]&&typeof v[i].id==='string'?'id:'+v[i].id:'index:'+i;
            if(ids.has(id))throw Error('Duplicate object identity in library.');ids.add(id);
            body[1].push(await visit(v[i],[...parts,id],false,depth+1,groups.get(v[i]?.groupId)));
          }
        }else{
          body=['o',[]];for(const k of Object.keys(v))if(v[k]!==undefined)body[1].push([k,group?.ref&&Object.hasOwn(group.fields,k)?['f',[group.ref[1],k]]:await visit(v[k],[...parts,k],false,depth+1)]);
        }
        trail.delete(v);
        // Individual library items, project templates, car views, source views,
        // paintable regions and artwork layers have stable, independent rows.
        const separate=force||parts.at(-2)==='views'||!Array.isArray(v)&&(typeof v.id==='string'||['template','vectorSource','layer','settings'].includes(parts.at(-1)));
        if(separate){const key=JSON.stringify([owner,...parts]);nodes.set(key,JSON.stringify(body));return ['r',key];}
        return body;
      };
      const ref=await visit(value,[],true);
      return {root:ref[1],nodes:[...nodes],blobs:[...blobs]};
    }
  }
  function refs(body){
    const nodes=[],blobs=[];
    function visit(v){if(!Array.isArray(v)||v.length!==2)throw Error('Invalid stored object.');const [tag,value]=v;
      if(tag==='r')nodes.push(value);else if(tag==='f'){if(!Array.isArray(value)||value.length!==2||value.some(x=>typeof x!=='string'))throw Error('Invalid group reference.');nodes.push(value[0]);}else if(tag==='b')blobs.push(value);
      else if(tag==='a'){if(!Array.isArray(value))throw Error('Invalid array.');value.forEach(visit);}
      else if(tag==='o'){if(!Array.isArray(value))throw Error('Invalid object.');const keys=new Set();for(const pair of value){if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||keys.has(pair[0]))throw Error('Invalid object key.');keys.add(pair[0]);visit(pair[1]);}}
      else if(tag!=='v'||value!==null&&!['string','number','boolean'].includes(typeof value))throw Error('Invalid stored value.');
    }visit(body);return {nodes,blobs};
  }
  function unpack(key,nodes,blobs){
    const visiting=new Set();
    function node(key,depth){if(depth>128||visiting.has(key)||!nodes.has(key))throw Error('Missing or circular library record.');visiting.add(key);const result=visit(JSON.parse(nodes.get(key)),depth+1);visiting.delete(key);return result;}
    function visit(v,depth){if(depth>128)throw Error('Invalid library depth.');const [tag,value]=v;
      if(tag==='r')return node(value,depth);if(tag==='f'){const fields=node(value[0],depth);if(!fields||!Object.hasOwn(fields,value[1]))throw Error('Missing group property.');return fields[value[1]];}if(tag==='b'){if(!blobs.has(value))throw Error('Missing library media.');return blobs.get(value);}
      if(tag==='v')return value;if(tag==='a')return value.map(x=>visit(x,depth+1));
      if(tag==='o'){const result={};for(const [k,x]of value)own(result,k,visit(x,depth+1));return result;}throw Error('Invalid stored object.');
    }return node(key,0);
  }
  function summary(bucket,item){
    const s={};for(const k of ['id','name','creator','description','scale','updated','type','base','finish','notes','paints'])if(item[k]!==undefined)s[k]=item[k];
    if(bucket==='fonts')s.fontData={name:item.fontData?.name,family:item.fontData?.family};
    s.storageSummary={views:Object.keys(item.template?.views||item.views||{}),templateName:item.template?.name,layerCount:item.layers?.length||Object.values(item.views||{}).reduce((n,v)=>n+(Array.isArray(v)?v.length:0),0)};
    return s;
  }
  function validate(data){
    if(!data||data.schema!==1||!['templates','liveries','assets','projects'].every(k=>Array.isArray(data[k]))||data.fonts!==undefined&&!Array.isArray(data.fonts))throw Error('Invalid library.');
    const view=v=>{if(!v||typeof v!=='object'||!Array.isArray(v.regions))throw Error('Invalid car view.');};
    const template=t=>{if(!t||!t.views||typeof t.views!=='object'||Array.isArray(t.views))throw Error('Invalid car template.');Object.values(t.views).forEach(view);};
    for(const bucket of buckets){const ids=new Set();for(const item of data[bucket]||[]){
      if(!item||typeof item.id!=='string'||!item.id||typeof item.name!=='string'||ids.has(item.id))throw Error('Invalid or duplicate library item.');ids.add(item.id);
      if(bucket==='templates')template(item);
      if(bucket==='projects')template(item.template);
      if(['projects','liveries'].includes(bucket)&&(!item.views||Object.values(item.views).some(v=>!Array.isArray(v))))throw Error('Invalid artwork layers.');
      if(bucket==='fonts'&&(!item.fontData||typeof item.fontData.src!=='string'||typeof item.fontData.family!=='string'))throw Error('Invalid font item.');
      if(bucket==='assets'&&!['shape','group','image'].includes(item.type))throw Error('Invalid artwork item.');
    }}return data;
  }
  const api={Codec,hash,refs,unpack,buckets,keyOf,summary,validate};
  if(typeof module!=='undefined')module.exports=api;else root.StorageCodec=api;
})(globalThis);
