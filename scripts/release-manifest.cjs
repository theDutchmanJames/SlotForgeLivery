const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const platform=process.argv[2],arch=process.argv[3],version=require('../package.json').version;
if(!['windows','mac','linux'].includes(platform)||!['x64','arm64'].includes(arch))throw Error('Choose platform and architecture');
const dir=path.resolve('dist',`v${version}`);
// Each platform ships a portable app and an installer.
const names=platform==='windows'?['portable','setup'].map(kind=>`SlotForgeLivery-${version}-windows-${arch}-${kind}.exe`):(platform==='mac'?['dmg','zip']:['AppImage','deb']).map(ext=>`SlotForgeLivery-${version}-${platform}-${platform==='linux'&&arch==='x64'?(ext==='deb'?'amd64':'x86_64'):arch}.${ext}`);
const sums=names.map(name=>{const file=path.join(dir,name);if(!fs.statSync(file).size)throw Error(`Empty installer: ${name}`);return `${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${name}`;}).join('\n')+'\n';
fs.writeFileSync(path.join(dir,`SHA256SUMS-${platform}-${arch}.txt`),sums);console.log(sums);
