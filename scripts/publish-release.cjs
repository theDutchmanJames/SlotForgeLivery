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
assert(!releases.some(r=>r.tag_name===tag),'A release already uses this version; never overwrite it automatically');
gh(['release','create',tag,'--draft','--prerelease','--target',process.env.SOURCE_SHA,'--title',`SlotForge Livery ${version} · Public preview`,'--notes-file','RELEASE_NOTES.md']);
for(const name of expected)gh(['release','upload',tag,path.join(dir,name)]);
const release=JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/releases/tags/${tag}`]));
for(const name of expected){const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex');assert.equal(release.assets.find(a=>a.name===name)?.digest,`sha256:${hash}`,`Uploaded asset differs: ${name}`);}
assert.equal(JSON.parse(gh(['api',`repos/${process.env.GH_REPO}/commits/${tag}`])).sha,process.env.SOURCE_SHA,'Release tag must match the tested source');
gh(['release','edit',tag,'--draft=false']);console.log(`Published ${tag} with ${expected.length} verified downloads.`);
