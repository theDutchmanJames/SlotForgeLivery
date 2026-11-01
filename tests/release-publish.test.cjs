const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../scripts/publish-release.cjs'),'utf8');
function simulate(existing){
 const sha='a'.repeat(40),digest='sha256:'+crypto.createHash('sha256').update('fixture').digest('hex');
 let release=existing?{id:1,tag_name:'v0.32.0',target_commitish:sha,draft:true,assets:[],...existing}:null,ref=false;
 const calls=[];
 const execFileSync=(command,args)=>{
  assert.equal(command,'gh');calls.push(args);
  if(args[0]==='api'){
   const endpoint=args[1];assert(!endpoint.includes('/releases/tags/'),'Draft lookup must use release ID');
   if(endpoint.endsWith('/releases?per_page=100'))return JSON.stringify(release?[release]:[]);
   if(endpoint.includes('/git/matching-refs/'))return JSON.stringify(ref?[{ref:'refs/tags/v0.32.0'}]:[]);
   if(endpoint.endsWith('/git/refs')){ref=true;return '{}';}
   if(endpoint.includes('/commits/')){assert(ref,'Tag must exist before verification');return JSON.stringify({sha});}
   if(endpoint.endsWith('/releases/1'))return JSON.stringify(release);
   throw Error(`Unexpected endpoint: ${endpoint}`);
  }
  if(args[1]==='create'){assert(ref);release={id:1,tag_name:'v0.32.0',target_commitish:sha,draft:true,assets:[]};}
  else if(args[1]==='upload')release.assets.push({name:require('node:path').basename(args[3]),digest});
  else if(args[1]==='edit')release.draft=false;
  else throw Error('Unexpected gh command');
  return '';
 };
 const customRequire=name=>name==='node:fs'?{statSync:()=>({size:7}),readFileSync:()=>Buffer.from('fixture')}:name==='node:child_process'?{execFileSync}:name==='../package.json'?{version:'0.32.0'}:require(name);
 vm.runInNewContext(source,{require:customRequire,process:{env:{GH_REPO:'owner/repo',SOURCE_SHA:sha}},console:{log(){}}});
 return {release,calls};
}
test('publisher creates the tag, verifies all 20 assets by draft ID, then publishes',()=>{
 const {release,calls}=simulate();assert.equal(release.assets.length,20);assert.equal(release.draft,false);
 assert.equal(calls.at(-1)[1],'edit');
});
test('publisher rejects conflicting draft assets before uploading',()=>{
 assert.throws(()=>simulate({assets:[{name:'SlotForgeLivery-source.tar.gz',digest:'sha256:wrong'}]}),/Existing draft asset differs/);
});
test('publisher never overwrites a published release or a draft from another commit',()=>{
 assert.throws(()=>simulate({draft:false}),/Never overwrite/);
 assert.throws(()=>simulate({target_commitish:'b'.repeat(40)}),/another source commit/);
});
