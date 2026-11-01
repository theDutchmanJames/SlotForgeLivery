const fs=require('node:fs/promises');const path=require('node:path');
const {execFileSync}=require('node:child_process');
(async()=>{
 const given=process.argv.indexOf('--runtime');
 const runtime=given>=0?path.resolve(process.argv[given+1]):path.dirname(require.resolve('electron/package.json'))+'/dist';
 await fs.access(path.join(runtime,'electron.exe'));
 const out=path.resolve('dist','SlotForge Livery '+require('../package.json').version.split('.').slice(0,2).join('.'));await fs.mkdir(out,{recursive:true});
 await fs.cp(runtime,out,{recursive:true});
 await fs.rename(path.join(out,'electron.exe'),path.join(out,'SlotForge Livery.exe'));
 const editorArg=process.argv.indexOf('--rcedit'),editor=editorArg>=0?path.resolve(process.argv[editorArg+1]):process.env.RCEDIT||require.resolve('electron-winstaller/vendor/rcedit.exe');
 await fs.access(editor);
 execFileSync(editor,[path.join(out,'SlotForge Livery.exe'),'--set-icon',path.resolve('assets/icon.ico')],{windowsHide:true});
 const app=path.join(out,'resources','app');await fs.mkdir(app,{recursive:true});
 for(const file of ['src','renderer','assets','package.json','README.md','LICENSE','NOTICE','THIRD-PARTY-NOTICES.txt','node_modules/mupdf'])await fs.cp(path.resolve(file),path.join(app,file),{recursive:true});
 for(const file of ['bin/gswin64c.exe','bin/gsdll64.dll','doc/COPYING']){const target=path.join(app,'vendor/ghostscript',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.resolve('vendor/ghostscript',file),target);}
 await fs.writeFile(path.join(out,'README-FIRST.txt'),'SlotForge Livery 0.32 preview\r\n\r\nDouble-click SlotForge Livery.exe. Keep this folder together.\r\nEPS and PDF conversion is included and works offline.\r\nYour library is stored in the Windows app-data folder, not in this folder.\r\nUse Import & Export to back up or share your library.\r\n\r\nThis unsigned local test build may trigger a Windows publisher warning.\r\n');
 console.log('Desktop test build: '+path.join(out,'SlotForge Livery.exe'));
})().catch(e=>{console.error(e);process.exitCode=1;});
