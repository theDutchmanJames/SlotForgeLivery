// Recover only the missing Apple silicon job; every other platform must already pass.
const assert=require('node:assert/strict');
function validate(record,jobs,repo,tagSha){
  assert.equal(record.status,'completed','Stop the stalled workflow before recovery');
  assert.equal(record.event,'workflow_dispatch');
  assert.equal(record.path,'.github/workflows/native-release.yml');
  assert.equal(record.head_repository.full_name,repo);
  assert.match(record.head_sha,/^[a-f0-9]{40}$/);
  assert.equal(record.head_sha,tagSha,'Release tag must match the original build');
  for(const name of ['sources','windows x64','mac x64','linux x64','linux arm64'])
    assert(jobs.some(j=>j.name===name&&j.conclusion==='success'),`Missing successful ${name} job`);
  assert(!jobs.some(j=>j.name==='mac arm64'&&j.conclusion==='success'),'Use normal resume when all platforms passed');
  return record.head_sha;
}
if(require.main===module){
  const fs=require('node:fs'),{execFileSync}=require('node:child_process');
  const {SOURCE_RUN:run,GH_REPO:repo}=process.env;
  assert.match(run||'',/^\d+$/);
  const gh=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8'}));
  const record=gh(`repos/${repo}/actions/runs/${run}`);
  assert.match(record.head_branch,/^v\d+\.\d+\.\d+$/);
  const version=record.head_branch.slice(1),tagSha=gh(`repos/${repo}/commits/${record.head_branch}`).sha;
  const sha=validate(record,gh(`repos/${repo}/actions/runs/${run}/jobs?per_page=100`).jobs,repo,tagSha);
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`sha=${sha}\nversion=${version}\n`);
  console.log(`Recovering Apple silicon from ${sha}; preserving the four tested native builds.`);
}
module.exports={validate};
