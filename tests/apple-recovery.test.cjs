const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../scripts/validate-apple-recovery.cjs');
const repo='owner/repo',sha='a'.repeat(40);
const record={status:'completed',event:'workflow_dispatch',path:'.github/workflows/native-release.yml',head_repository:{full_name:repo},head_sha:sha};
const jobs=['sources','windows x64','mac x64','linux x64','linux arm64'].map(name=>({name,conclusion:'success'}));
test('Apple recovery accepts only the exact release commit and complete remaining platforms',()=>{
  assert.equal(validate(record,jobs,repo,sha),sha);
  assert.throws(()=>validate(record,jobs,repo,'b'.repeat(40)));
  assert.throws(()=>validate(record,jobs.slice(1),repo,sha));
  assert.throws(()=>validate({...record,status:'in_progress'},jobs,repo,sha));
  assert.throws(()=>validate(record,jobs,'other/repo',sha));
  assert.throws(()=>validate(record,[...jobs,{name:'mac arm64',conclusion:'success'}],repo,sha));
});
