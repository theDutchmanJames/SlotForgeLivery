const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../scripts/validate-release-run.cjs'),'utf8');
function validate({omit=true,run='123',status='completed',missing='',changed='',repo='owner/repo'}={}){
 const sha='a'.repeat(40),jobs=['sources','windows x64','linux x64','linux arm64'].filter(name=>name!==missing).map(name=>({name,conclusion:'success'}));let output='';
 const customRequire=name=>name==='node:fs'?{appendFileSync:(_,value)=>output+=value}:name==='node:child_process'?{execFileSync:(command,args)=>{
  if(command==='git')return args[0]==='diff'?changed:'';
  assert.equal(command,'gh');return JSON.stringify(args[1].includes('/jobs?')?{jobs}:{status,event:'workflow_dispatch',path:'.github/workflows/native-release.yml',head_repository:{full_name:repo},head_sha:sha});
 }}:require(name);
 vm.runInNewContext(source,{require:customRequire,process:{env:{OMIT_MACOS:String(omit),RESUME_RUN:run,GH_REPO:'owner/repo',CURRENT_SHA:'b'.repeat(40),GITHUB_OUTPUT:'output'}},console:{log(){}}});return output;
}
test('optional macOS resume still requires a completed exact-source Windows/Linux run',()=>{
 assert.equal(validate(),'sha='+'a'.repeat(40)+'\n');
 for(const missing of ['sources','windows x64','linux x64','linux arm64'])assert.throws(()=>validate({missing}),/no successful/);
 assert.throws(()=>validate({omit:false}),/mac x64/);
 assert.throws(()=>validate({run:''}),/completed source run/);
 assert.throws(()=>validate({status:'in_progress'}),/Wait until/);
 assert.throws(()=>validate({changed:'src/main.cjs'}),/Runtime or licence changed/);
 assert.throws(()=>validate({repo:'other/repo'}));
});
