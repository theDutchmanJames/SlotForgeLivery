const { app, BrowserWindow, ipcMain, dialog, utilityProcess } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.join(__dirname, '..');
let mainWindow;
let rendererReady=false, startupTimer, recoveryOpen=false;
async function recoverWindow(reason){
  if(recoveryOpen||!mainWindow||mainWindow.isDestroyed())return;
  recoveryOpen=true;rendererReady=false;clearTimeout(startupTimer);
  await fs.appendFile(path.join(app.getPath('userData'),'startup-errors.log'),new Date().toISOString()+' '+reason+'\n').catch(()=>{});
  const result=await dialog.showMessageBox(mainWindow,{type:'error',title:'Livery could not load',message:'The Livery interface stopped responding.',detail:'Your saved library is still on this computer. Restart Livery to try loading it again. Any unsaved changes may be lost.',buttons:['Restart Livery','Close'],defaultId:0,cancelId:1});
  if(result.response===0)app.relaunch();mainWindow.closing=true;mainWindow.destroy();
}
const { SQLiteService } = require('./sqlite-service.cjs');
const { assertExportTarget } = require('./export-path.cjs');
let converting = false;
ipcMain.handle('vector:convert', async (_, payload) => {
  if(converting)throw new Error('Please wait for the current import to finish.');
  if(!payload || !['eps','pdf'].includes(payload.format) || !(payload.bytes instanceof Uint8Array) || payload.bytes.length>25*1024*1024)throw new Error('Choose an EPS or PDF file smaller than 25 MB.');
  converting=true;
  try {return await new Promise((resolve,reject)=>{
    const child=utilityProcess.fork(path.join(__dirname,'vector-worker.cjs'),[],{serviceName:'Livery vector import',stdio:'pipe'});
    let done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);child.kill();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('Vector import timed out. Simplify the artwork and try again.')),30000);
    child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
    child.on('message',message=>finish(message.error?new Error(message.error):null,message.result));
    child.on('exit',()=>finish(new Error('The vector converter stopped. Try a simpler EPS or PDF.')));
    child.postMessage(payload);
  });}finally{converting=false;}
});
app.setName('SlotForge Livery');
// Keep the established storage path so the rename preserves libraries and settings.
app.setPath('userData', process.env.PAINTSHOP_TEST_DATA || path.join(app.getPath('appData'), 'SlotForge Paintshop'));
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => { if(mainWindow){ if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus(); } });
const dataPath = () => path.join(app.getPath('userData'), 'paintshop-library.json');
function safeWindow(options = {}) {
  const win = new BrowserWindow({ ...options, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, ...(options.webPreferences || {}) } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  return win;
}
const libraryStorage = new SQLiteService(dataPath());
ipcMain.handle('library:load', async () => {
  // Verified first-run migration may legitimately take longer than normal UI
  // startup. The worker remains off the main thread and originals stay intact.
  clearTimeout(startupTimer);
  try { return await libraryStorage.load(); }
  finally { if(!rendererReady)startupTimer=setTimeout(()=>recoverWindow('Renderer did not finish opening the library.'),20000); }
});
ipcMain.handle('library:save', (_, data) => libraryStorage.save(data));
ipcMain.handle('library:restore', (_, data) => libraryStorage.restore(data));
ipcMain.handle('library:item', (_, key) => libraryStorage.get(key));
ipcMain.handle('library:preview', (_, key) => libraryStorage.preview(key));
ipcMain.handle('library:thumbnail', (_, data) => libraryStorage.thumbnail(data));
ipcMain.handle('library:missing-media', (_, hashes) => libraryStorage.missingMedia(hashes));
ipcMain.handle('library:snapshot', () => libraryStorage.snapshot());
ipcMain.handle('package:save', async (_, { name, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Export library package', defaultPath: name.replace(/[<>:"/\\|?*]/g, '-').slice(0,100) + '.sfpaint', filters: [{ name: 'SlotForge Livery package', extensions: ['sfpaint'] }] });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath,app.getPath('userData'));
  await fs.writeFile(result.filePath, JSON.stringify(data, null, 2));
  return true;
});
ipcMain.handle('png:save', async (_, { name, dataURL }) => {
  if(typeof dataURL!=='string'||dataURL.length>100*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataURL))throw new Error('Invalid PNG image');
  const bytes=Buffer.from(dataURL.slice(22),'base64');
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG image');
  const result=await dialog.showSaveDialog(mainWindow,{title:'Export transparent PNG',defaultPath:String(name||'Livery').replace(/[<>:"/\\|?*]/g,'-').slice(0,100)+'.png',filters:[{name:'PNG image',extensions:['png']}]});
  if(result.canceled)return false;
  await assertExportTarget(result.filePath,app.getPath('userData'));
  await fs.writeFile(result.filePath,bytes);return true;
});
ipcMain.handle('pdf:save', async (_, { name, html }) => {
  if (typeof html !== 'string' || html.length > 100 * 1024 * 1024) throw new Error('Invalid report');
  const result = process.env.PAINTSHOP_TEST_PDF ? { filePath: process.env.PAINTSHOP_TEST_PDF } : await dialog.showSaveDialog(mainWindow, { title: 'Export workshop PDF', defaultPath: name.replace(/[<>:"/\\|?*]/g, '-').slice(0,100) + '.pdf', filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath,app.getPath('userData'));
  const win = safeWindow({ show: false, width: 1100, height: 800 });
  const temp = path.join(app.getPath('userData'), 'workshop-report.html');
  try {
    await fs.writeFile(temp, html);
    await win.loadFile(temp);
    await win.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i => i.decode().catch(() => {}))])');
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, margins: { top: .35, bottom: .35, left: .35, right: .35 } });
    await fs.writeFile(result.filePath, pdf);
    return true;
  } finally { win.destroy(); await fs.unlink(temp).catch(() => {}); }
});
app.whenReady().then(() => {
  mainWindow = safeWindow({ width: 1560, height: 1000, minWidth: 1050, minHeight: 720, icon: path.join(root, 'assets', process.platform==='win32'?'icon.ico':'icon.png'), backgroundColor: '#171b21', title: 'SlotForge Livery', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  startupTimer=setTimeout(()=>{if(!rendererReady)recoverWindow('Renderer did not signal ready within 20 seconds.');},20000);
  ipcMain.on('app:ready',()=>{rendererReady=true;clearTimeout(startupTimer);});
  mainWindow.webContents.on('render-process-gone',(_,details)=>recoverWindow('Renderer exited: '+details.reason));
  mainWindow.loadFile(path.join(root, 'renderer', 'index.html')).catch(error=>recoverWindow('Page load failed: '+error.message));
  mainWindow.on('close', e => {
    if (!mainWindow.closing && rendererReady) { e.preventDefault(); mainWindow.webContents.send('app:closing'); }
  });
  ipcMain.on('app:close-ready', async () => { await libraryStorage.queue.catch(() => {}); if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.closing = true;mainWindow.close();} });
});
app.on('window-all-closed', () => app.quit());
