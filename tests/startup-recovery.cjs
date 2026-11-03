const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),profile=path.join(root,'test-output','startup-recovery-'+Date.now());let app;
(async()=>{const env={...process.env,PAINTSHOP_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});const page=await app.firstWindow();await page.waitForSelector('#tools button');await page.evaluate(()=>flushSave());const before=await fs.readFile(path.join(profile,'paintshop-library.sqlite'),'utf8');
 // Replace only the native dialog response; cause a real renderer failure.
 await app.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBox=async(_,options)=>{global.recoveryMessage=options;return new Promise(()=>{});};BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer();});
 const started=Date.now();let message;while(Date.now()-started<5000){message=await app.evaluate(()=>global.recoveryMessage);if(message)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(message.title,'Livery could not load');assert.deepEqual(message.buttons,['Restart Livery','Close']);assert.match(await fs.readFile(path.join(profile,'startup-errors.log'),'utf8'),/Renderer exited:/);assert.equal(await fs.readFile(path.join(profile,'paintshop-library.sqlite'),'utf8'),before);
 await app.close();app=null;console.log('PASS: renderer failure surfaces native recovery controls, writes diagnostics, preserves saved library and can close.');
})().catch(async e=>{console.error(e);if(app)await app.close().catch(()=>{});process.exitCode=1;});
