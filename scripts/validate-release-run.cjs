const fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {RESUME_RUN:run,GH_REPO:repo,CURRENT_SHA:current}=process.env;
let sha=current;
const gh=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8'}));
if(run){
 assert(/^\d+$/.test(run),'Run ID must be numeric');
 const record=gh(`repos/${repo}/actions/runs/${run}`);
 assert.equal(record.status,'completed','Wait until the source run finishes');
 assert.equal(record.event,'workflow_dispatch');
 assert.equal(record.path,'.github/workflows/native-release.yml');
 assert.equal(record.head_repository.full_name,repo);
 const jobs=gh(`repos/${repo}/actions/runs/${run}/jobs?per_page=100`).jobs;
 for(const name of ['sources','windows x64','mac x64','mac arm64','linux x64','linux arm64'])assert(jobs.some(j=>j.name===name&&j.conclusion==='success'),`Source run has no successful ${name} job`);
 sha=record.head_sha;assert(/^[a-f0-9]{40}$/.test(sha));
 execFileSync('git',['fetch','--depth=1','origin',sha],{stdio:'inherit'});
 const changed=execFileSync('git',['diff','--name-only',sha,current,'--','src','renderer','assets','package.json','package-lock.json','LICENSE','NOTICE','THIRD-PARTY-NOTICES.txt'],{encoding:'utf8'}).trim();
 assert.equal(changed,'','Runtime or licence changed since the build; run a complete native build');
}
assert(/^[a-f0-9]{40}$/.test(sha));
fs.appendFileSync(process.env.GITHUB_OUTPUT,`sha=${sha}\n`);
console.log(`Publishing only verified artifacts from ${sha}`);
