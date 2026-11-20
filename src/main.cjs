const { app, BrowserWindow, Menu, ipcMain, dialog, utilityProcess, net, shell } = require('electron');
const maintenance = require('./maintenance.cjs');
const { UpdateCheck } = require('./update-check.cjs');
const { LIVERY } = require('./update-names.cjs');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.join(__dirname, '..');
let mainWindow;
let rendererReady = false,
  closeAsked = false,
  startupTimer,
  recoveryOpen = false;
async function recoverWindow(reason) {
  if (recoveryOpen || !mainWindow || mainWindow.isDestroyed()) return;
  recoveryOpen = true;
  rendererReady = false;
  clearTimeout(startupTimer);
  await fs
    .appendFile(
      path.join(app.getPath('userData'), 'startup-errors.log'),
      new Date().toISOString() + ' ' + reason + '\n'
    )
    .catch(() => {});
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Livery could not load',
    message: 'The Livery interface stopped responding.',
    detail:
      'Your saved library is still on this computer. Restart Livery to try loading it again. Any unsaved changes may be lost.',
    buttons: ['Restart Livery', 'Close'],
    defaultId: 0,
    cancelId: 1
  });
  if (result.response === 0) app.relaunch();
  mainWindow.closing = true;
  mainWindow.destroy();
}
const { SQLiteService } = require('./sqlite-service.cjs');
const { assertExportTarget } = require('./export-path.cjs');
let converting = false;
ipcMain.handle('vector:convert', async (_, payload) => {
  if (converting) throw new Error('Please wait for the current import to finish.');
  if (
    !payload ||
    !['eps', 'pdf'].includes(payload.format) ||
    !(payload.bytes instanceof Uint8Array) ||
    payload.bytes.length > 25 * 1024 * 1024
  )
    throw new Error('Choose an EPS or PDF file smaller than 25 MB.');
  converting = true;
  try {
    return await new Promise((resolve, reject) => {
      const child = utilityProcess.fork(path.join(__dirname, 'vector-worker.cjs'), [], {
        serviceName: 'Livery vector import',
        stdio: 'pipe'
      });
      let done = false;
      const finish = (error, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.kill();
        error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(
        () => finish(new Error('Vector import timed out. Simplify the artwork and try again.')),
        30000
      );
      child.stdout?.on('data', () => {});
      child.stderr?.on('data', () => {});
      child.on('message', message => finish(message.error ? new Error(message.error) : null, message.result));
      child.on('exit', () => finish(new Error('The vector converter stopped. Try a simpler EPS or PDF.')));
      child.postMessage(payload);
    });
  } finally {
    converting = false;
  }
});
app.setName('SlotForge Livery');
// Keep the established storage path so the rename preserves libraries and settings.
app.setPath('userData', process.env.PAINTSHOP_TEST_DATA || path.join(app.getPath('appData'), 'SlotForge Paintshop'));
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
const dataPath = () => path.join(app.getPath('userData'), 'paintshop-library.json');
function safeWindow(options = {}) {
  const win = new BrowserWindow({
    ...options,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, ...(options.webPreferences || {}) }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  return win;
}
const libraryStorage = new SQLiteService(dataPath());
// The library opens in its worker while the window is still being created;
// the first load request picks up that result. Later loads (after a
// recovery reload) read the database again.
let earlyLoad = null;
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('library:load', async () => {
  // Verified first-run migration may legitimately take longer than normal UI
  // startup. The worker remains off the main thread and originals stay intact.
  clearTimeout(startupTimer);
  try {
    const pending = earlyLoad || libraryStorage.load();
    earlyLoad = null;
    return await pending;
  } finally {
    if (!rendererReady)
      startupTimer = setTimeout(() => recoverWindow('Renderer did not finish opening the library.'), 20000);
  }
});
ipcMain.handle('library:save', (_, data) => libraryStorage.save(data));
ipcMain.handle('library:restore', (_, data) => libraryStorage.restore(data));
ipcMain.handle('library:item', (_, key) => libraryStorage.get(key));
ipcMain.handle('library:preview', (_, key) => libraryStorage.preview(key));
ipcMain.handle('library:thumbnail', (_, data) => libraryStorage.thumbnail(data));
ipcMain.handle('library:missing-media', (_, hashes) => libraryStorage.missingMedia(hashes));
ipcMain.handle('library:snapshot', () => libraryStorage.snapshot());
ipcMain.handle('package:save', async (_, { name, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export library package',
    defaultPath: name.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100) + '.sfpaint',
    filters: [{ name: 'SlotForge Livery package', extensions: ['sfpaint'] }]
  });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath, app.getPath('userData'));
  await fs.writeFile(result.filePath, JSON.stringify(data));
  return true;
});
// Automatic backups: the user picks a folder; Livery writes dated .sfpaint
// library packages there and prunes only its own older backups.
// The backups folder is also remembered outside the library, so the rescue window can find the
// backups when the library itself cannot be read.
const backupMemo = () => path.join(app.getPath('userData'), 'backup-folder.json');
function rememberBackupFolder(folder) {
  if (typeof folder === 'string' && folder) fs.writeFile(backupMemo(), JSON.stringify({ folder })).catch(() => {});
}
ipcMain.handle('backup:choose-folder', async () => {
  if (process.env.PAINTSHOP_TEST_BACKUP_DIR) {
    rememberBackupFolder(process.env.PAINTSHOP_TEST_BACKUP_DIR);
    return process.env.PAINTSHOP_TEST_BACKUP_DIR;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for automatic backups',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled) rememberBackupFolder(result.filePaths[0]);
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('backup:known-folder', async () => {
  try {
    const { folder } = JSON.parse(await fs.readFile(backupMemo(), 'utf8'));
    await fs.access(folder);
    return folder;
  } catch {
    return null;
  }
});
ipcMain.handle('backup:write', async (_, payload) => {
  const result = await maintenance.writeBackup(payload, file => assertExportTarget(file, app.getPath('userData')));
  rememberBackupFolder(payload?.folder);
  return result;
});
// The Garage's Backups list, Restore and Show in folder; only Livery's own backup files.
ipcMain.handle('backup:list', async (_, folder) => {
  const list = await maintenance.listBackups(folder);
  rememberBackupFolder(folder);
  return list;
});
// The library's own files, for the rescue window's details and Show the files.
const libraryFiles = async () => {
  const dir = app.getPath('userData'),
    names = (await fs.readdir(dir).catch(() => [])).filter(n => /^paintshop-library./.test(n)),
    list = [];
  for (const name of names) {
    const stat = await fs.stat(path.join(dir, name)).catch(() => null);
    if (stat?.isFile()) list.push({ name, size: stat.size, modified: stat.mtime.toISOString() });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
};
ipcMain.handle('library:files', () => libraryFiles());
ipcMain.handle('library:reveal', async () => {
  const list = await libraryFiles(),
    main = list.find(f => f.name.endsWith('.sqlite')) || list[0];
  if (main) shell.showItemInFolder(path.join(app.getPath('userData'), main.name));
  else await shell.openPath(app.getPath('userData'));
});
ipcMain.handle('backup:read', (_, payload) => maintenance.readBackup(payload || {}));
ipcMain.handle('backup:reveal', async (_, { folder, name } = {}) => {
  const list = await maintenance.listBackups(folder);
  const entry = list.find(b => b.name === name) || list[0];
  if (entry) shell.showItemInFolder(path.join(folder, entry.name));
  else await shell.openPath(folder);
});
// The update check (shared with SlotForge Circuit, see docs/update-check.md): once when Livery
// starts, and when Check now is clicked in Settings. A newer version opens a window with What's
// new, Skip and Download; Download saves this copy's file in Downloads and never runs it.
// Livery's names and release file names are in update-names.cjs.
let updateCheck = null,
  updateTimer = null;
function startUpdateCheck() {
  // Development copies, test profiles and SLOTFORGE_NO_UPDATE_CHECK only check when asked.
  const automated = !!process.env.PAINTSHOP_TEST_DATA;
  updateCheck = new UpdateCheck({
    profile: app.getPath('userData'),
    current: app.getVersion(),
    homepage: require('../package.json').homepage,
    ...LIVERY,
    fetch: (url, init) => net.fetch(url, init),
    automatic: app.isPackaged && !automated && !process.env.SLOTFORGE_NO_UPDATE_CHECK,
    edition: {
      platform: process.platform,
      arch: process.arch,
      portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
      appImage: !!process.env.APPIMAGE
    },
    downloads: app.getPath('downloads'),
    onChange: () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:changed');
    }
  });
  // The integration tests replace GitHub with a fake answer through this.
  if (automated) globalThis.liveryUpdateCheck = updateCheck;
  updateTimer = setTimeout(() => void updateCheck.startupCheck(), 5 * 1000);
  updateTimer.unref();
}
ipcMain.handle('update:action', async (event, action, payload) => {
  // Only Livery's own page may ask.
  const page = pathToFileURL(path.join(root, 'renderer', 'index.html')).href;
  if (!updateCheck || String(event.senderFrame?.url || '').split(/[?#]/)[0] !== page) return { error: 'Unknown page.' };
  try {
    if (action === 'status') return { ok: true, value: updateCheck.status() };
    if (action === 'check') return { ok: true, value: await updateCheck.check() };
    if (action === 'enable') return { ok: true, value: updateCheck.setEnabled(payload?.enabled) };
    if (action === 'skip') return { ok: true, value: updateCheck.skip(payload?.version) };
    if (action === 'download') {
      // Not awaited: progress and the result reach the window through update:changed.
      updateCheck.startDownload().catch(() => {});
      return { ok: true, value: updateCheck.status() };
    }
    if (action === 'cancel') return { ok: true, value: updateCheck.cancelDownload() };
    if (action === 'show') {
      shell.showItemInFolder(updateCheck.downloadedFile());
      return { ok: true, value: { shown: true } };
    }
    if (action === 'open') {
      await shell.openExternal(updateCheck.releaseUrl());
      return { ok: true, value: { opened: true } };
    }
    throw Error('Unknown update action.');
  } catch (e) {
    return { error: e.message, code: e.code };
  }
});
app.on('will-quit', () => {
  clearTimeout(updateTimer);
  updateCheck?.stop(); // abandons a check or download in progress
});
// A SlotForge Decals pack (.sfdecal) of livery artwork at its real size.
ipcMain.handle('decals:save', async (_, { name, data }) => {
  if (data?.format !== 'slotforge-decals' || data.version !== 1 || !Array.isArray(data.decals))
    throw new Error('Invalid decal pack');
  const text = JSON.stringify(data);
  if (text.length > 160 * 1024 * 1024) throw new Error('The decal pack exceeds 160 MB.');
  const result = process.env.PAINTSHOP_TEST_DECALS
    ? { filePath: process.env.PAINTSHOP_TEST_DECALS }
    : await dialog.showSaveDialog(mainWindow, {
        title: 'Send decals to SlotForge Decals',
        defaultPath:
          String(name || 'Livery decals')
            .replace(/[<>:"/\\|?*]/g, '-')
            .slice(0, 100) + '.sfdecal',
        filters: [{ name: 'SlotForge Decals pack', extensions: ['sfdecal'] }]
      });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath, app.getPath('userData'));
  await fs.writeFile(result.filePath, text);
  return true;
});
ipcMain.handle('png:save', async (_, { name, dataURL }) => {
  if (
    typeof dataURL !== 'string' ||
    dataURL.length > 100 * 1024 * 1024 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataURL)
  )
    throw new Error('Invalid PNG image');
  const bytes = Buffer.from(dataURL.slice(22), 'base64');
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('Invalid PNG image');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export transparent PNG',
    defaultPath:
      String(name || 'Livery')
        .replace(/[<>:"/\\|?*]/g, '-')
        .slice(0, 100) + '.png',
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath, app.getPath('userData'));
  await fs.writeFile(result.filePath, bytes);
  return true;
});
ipcMain.handle('pdf:save', async (_, { name, html }) => {
  if (typeof html !== 'string' || html.length > 100 * 1024 * 1024) throw new Error('Invalid report');
  const result = process.env.PAINTSHOP_TEST_PDF
    ? { filePath: process.env.PAINTSHOP_TEST_PDF }
    : await dialog.showSaveDialog(mainWindow, {
        title: 'Export workshop PDF',
        defaultPath: name.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100) + '.pdf',
        filters: [{ name: 'PDF document', extensions: ['pdf'] }]
      });
  if (result.canceled) return false;
  await assertExportTarget(result.filePath, app.getPath('userData'));
  const win = safeWindow({ show: false, width: 1100, height: 800 });
  const temp = path.join(
    app.getPath('userData'),
    `workshop-report-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  );
  try {
    await fs.writeFile(temp, html);
    await win.loadFile(temp);
    await win.webContents.executeJavaScript(
      'Promise.all([document.fonts.ready,...Array.from(document.images).map(i => i.decode().catch(() => {}))])'
    );
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 }
    });
    await fs.writeFile(result.filePath, pdf);
    return true;
  } finally {
    win.destroy();
    await fs.unlink(temp).catch(() => {});
  }
});
// No default menu: it brought Reload (Ctrl+R, which skips the last save) and the developer tools.
// macOS keeps an app and an Edit menu so copy and paste work in text fields.
function appMenu() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { role: 'windowMenu' }
  ]);
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(appMenu());
  earlyLoad = libraryStorage.load();
  startUpdateCheck();
  earlyLoad.catch(() => {});
  mainWindow = safeWindow({
    width: 1560,
    height: 1000,
    minWidth: 1050,
    minHeight: 720,
    icon: path.join(root, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#171b21',
    title: 'SlotForge Livery',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') }
  });
  startupTimer = setTimeout(() => {
    if (!rendererReady) recoverWindow('Renderer did not signal ready within 20 seconds.');
  }, 20000);
  ipcMain.on('app:ready', () => {
    rendererReady = true;
    clearTimeout(startupTimer);
  });
  mainWindow.webContents.on('render-process-gone', (_, details) => recoverWindow('Renderer exited: ' + details.reason));
  mainWindow
    .loadFile(path.join(root, 'renderer', 'index.html'))
    .catch(error => recoverWindow('Page load failed: ' + error.message));
  mainWindow.on('close', e => {
    if (!mainWindow.closing && rendererReady) {
      e.preventDefault();
      mainWindow.webContents.send('app:closing');
      closeAsked = true;
    }
  });
  // Closing waits for the last save; a window that stops answering after you closed it still closes.
  // ("Keep editing" after a failed save leaves it open: that window still answers.)
  mainWindow.on('unresponsive', () => {
    if (closeAsked && !mainWindow.isDestroyed()) {
      mainWindow.closing = true;
      mainWindow.destroy();
    }
  });
  ipcMain.on('app:close-ready', async () => {
    await libraryStorage.queue.catch(() => {});
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.closing = true;
      mainWindow.close();
    }
  });
});
app.on('window-all-closed', () => app.quit());
