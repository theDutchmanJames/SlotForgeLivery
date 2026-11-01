const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const version=require('../package.json').version,tag=`v${version}`,dir=path.resolve('release-assets');
const gh=args=>execFileSync('gh',args,{encoding:'utf8'});
const expected=['SlotForgeLivery-source.tar.gz','ghostscript-10.08.0.tar.xz','mupdf-1.28.1-complete-source.tar.gz','BUILDING.md','MUPDF-SOURCE-REVISIONS.txt','SHA256SUMS-sources.txt'];
for(const [platform,arch,exts] of [['windows','x64',['exe']],['mac','x64',['dmg','zip']],['mac','arm64',['dmg','zip']],['linux','x64',['AppImage','deb']],['linux','arm64',['AppImage','deb']]]){
 expected.push(`SHA256SUMS-${platform}-${arch}.txt`);
 for(const ext of exts)expected.push(`SlotForgeLivery-${version}-${platform}-${platform==='linux'&&arch==='x64'?(ext==='deb'?'amd64':'x86_64'):arch}.${ext}`);
}
for(const name of expected)assert(fs.statSync(path.join(dir,name)).size>0,`Missing/empty release asset: ${name}`);
const releases=JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/releases?per_page=100`]));
let release=releases.find(r=>r.tag_name===tag);
if(release){assert(release.draft,'Never overwrite a published release');assert.equal(release.target_commitish,process.env.SOURCE_SHA,'Draft belongs to another source commit');}
// Draft releases do not necessarily create a tag, and the by-tag REST endpoint
// only resolves published releases. Pin the tag explicitly and use the draft ID.
const refs=JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/git/matching-refs/tags/${tag}`]));
if(!refs.some(r=>r.ref===`refs/tags/${tag}`))gh(['api',`repos/${process.env.GH_REPO}/git/refs`,'--method','POST','-f',`ref=refs/tags/${tag}`,'-f',`sha=${process.env.SOURCE_SHA}`]);
assert.equal(JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/commits/${tag}`])).sha,process.env.SOURCE_SHA,'Release tag must match the tested source');
if(!release){
 gh(['release','create',tag,'--draft','--prerelease','--verify-tag','--target',process.env.SOURCE_SHA,'--title',`SlotForge Livery ${version} · Public preview`,'--notes-file','RELEASE_NOTES.md']);
 release=JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/releases?per_page=100`])).find(r=>r.tag_name===tag);
}
assert(release?.draft,'Expected a draft release');
for(const name of expected){
 const file=path.join(dir,name),old=release.assets.find(a=>a.name===name);
 if(old)assert.equal(old.digest,`sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`,`Existing draft asset differs: ${name}`);
}
for(const name of expected)if(!release.assets.some(a=>a.name===name))gh(['release','upload',tag,path.join(dir,name)]);
release=JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/releases/${release.id}`]));
for(const name of expected){const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex');assert.equal(release.assets.find(a=>a.name===name)?.digest,`sha256:${hash}`,`Uploaded asset differs: ${name}`);}
assert.equal(JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/commits/${tag}`])).sha,process.env.SOURCE_SHA,'Release tag must match the tested source');
gh(['release','edit',tag,'--draft=false']);console.log(`Published ${tag} with ${expected.length} verified downloads.`);
