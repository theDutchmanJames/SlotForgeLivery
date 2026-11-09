const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const dist=path.resolve(process.env.LIVERY_PACKAGE_DIR||path.join('dist',`v${require('../package.json').version}`));
const candidates=process.platform==='win32'?['win-unpacked/SlotForge Livery.exe']:process.platform==='darwin'?['mac-arm64/SlotForge Livery.app/Contents/MacOS/SlotForge Livery','mac/SlotForge Livery.app/Contents/MacOS/SlotForge Livery']:['linux-unpacked/slotforge-livery','linux-arm64-unpacked/slotforge-livery'];
const executable=candidates.map(p=>path.join(dist,p)).find(p=>fs.existsSync(p));assert(executable,'Native unpacked application exists');
for(const test of ['decal-import.cjs','decal-placement.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,'..','tests',test)],{stdio:'inherit',windowsHide:true,env:{...process.env,ELECTRON_BINARY:executable,PAINTSHOP_PACKAGED:'1'},timeout:120000});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
