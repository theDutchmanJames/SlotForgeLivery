// Garage paths the coverage map showed no test ran: applying a saved livery
// (and cancelling it, and undoing it), using a font from the Garage, a car
// without paintable panels opening in preparation, artwork refused on such a
// car, a Garage item used with no car open, and a backup that fails or meets a
// library that changed while it was being written (manual and automatic).
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fontFile = process.env.TEST_FONT || 'C:/Windows/Fonts/AGENCYR.TTF';
(async () => {
  const stamp = Date.now(),
    backups = path.join(root, 'test-output', 'garage-paths-backups-' + stamp);
  await fs.mkdir(backups, { recursive: true });
  const env = {
    ...process.env,
    PAINTSHOP_TEST_DATA: path.join(root, 'test-output', 'garage-paths-' + stamp),
    PAINTSHOP_TEST_BACKUP_DIR: backups
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.ELECTRON_BINARY || require('electron'),
    args: process.env.PAINTSHOP_PACKAGED ? [] : [root],
    env
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await page.waitForSelector('#tools button', { state: 'attached' });
    const toast = text => page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout: 10000 });
    const use = async (tab, id) => {
      await page.evaluate(tab => openLibrary(tab), tab);
      await page.locator(`[data-library-use="${id}"]`).click();
    };

    // No car open: Garage items that need one say so.
    assert.equal(await page.evaluate(() => project), null, 'a new profile has no car open');
    await page.evaluate(() => {
      store.liveries.push({ id: 'saved', name: 'Saved stripes', views: { left: [] } });
    });
    await use('liveries', 'saved');
    await toast('Open or create a car project first.');

    // A car with two layers is saved as a livery; the car then gets other artwork.
    await page.evaluate(() => {
      store.liveries = store.liveries.filter(l => l.id !== 'saved');
      const v = V.importSVG(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>'
      );
      setProject(M.newProject({ id: M.uid(), name: 'Garage car', views: { left: v } }));
      currentView = 'left';
      preparing = false;
      addLayer(M.layer('rect', { name: 'Stripe', x: 100, y: 100, w: 600, h: 60, fill: '#e64a49' }));
      addLayer(M.layer('rect', { name: 'Band', x: 100, y: 300, w: 600, h: 60, fill: '#1f6feb' }));
      const livery = M.liveryFromProject(project, 'Two bands');
      livery.id = 'two-bands';
      store.liveries.push(livery);
      mutate(() => {
        project.views.left = [M.layer('rect', { name: 'Only', x: 0, y: 0, w: 50, h: 50, fill: '#111111' })];
      });
      changed();
    });
    const names = () => page.evaluate(() => layers().map(l => l.name));
    assert.deepEqual(await names(), ['Only']);
    // Cancel keeps the artwork.
    await use('liveries', 'two-bands');
    await page.waitForSelector('#confirm-button');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await names(), ['Only'], 'cancel leaves the artwork alone');
    // Apply replaces it, and Undo brings it back.
    await use('liveries', 'two-bands');
    await page.locator('#confirm-button').click();
    await toast('Livery applied.');
    assert.deepEqual(await names(), ['Stripe', 'Band']);
    assert.equal(await page.evaluate(() => document.body.classList.contains('garage-open')), false);
    await page.keyboard.press('Control+z');
    assert.deepEqual(await names(), ['Only'], 'undo restores the artwork from before');

    // A font from the Garage: with text selected it changes the typeface,
    // otherwise it adds a text layer in that font.
    await page.locator('#font-file').setInputFiles(fontFile);
    await page.waitForFunction(() => store.fonts.length === 1);
    const font = await page.evaluate(() => ({ id: store.fonts[0].id, family: store.fonts[0].fontData.family }));
    await page.evaluate(() => {
      selected = null;
      render();
    });
    const before = (await names()).length;
    await use('fonts', font.id);
    await page.waitForFunction(n => layers().length === n + 1, before);
    assert.equal(await page.evaluate(() => selection().kind), 'text');
    assert.equal(await page.evaluate(() => selection().font), font.family);
    await page.evaluate(() => mutate(() => (selection().font = 'Arial')));
    await use('fonts', font.id);
    await page.waitForFunction(f => selection()?.font === f, font.family);
    assert.equal((await names()).length, before + 1, 'a selected text only changes typeface');

    // A car without paintable panels opens in preparation, and artwork is refused on it.
    await page.evaluate(() => {
      const v = V.importSVG(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>'
      );
      v.regions.forEach(r => (r.role = 'protected'));
      store.templates.push({ id: 'bare', name: 'Bare car', views: { left: v } });
      store.assets.push({
        id: 'star',
        name: 'Star',
        type: 'shape',
        layer: M.layer('rect', { x: 0, y: 0, w: 40, h: 40, fill: '#f2c94c' })
      });
    });
    await use('templates', 'bare');
    await page.waitForFunction(() => preparing === true);
    assert.equal(await page.evaluate(() => project.template.name), 'Bare car');
    await use('assets', 'star');
    await toast('Prepare at least one paintable body region first.');
    assert.equal(await page.evaluate(() => layers().length), 0);

    // Backups: a failure is reported and remembered; a library that changed
    // during the backup asks you to try again, or retries by itself later.
    await page.evaluate(dir => setBackup({ folder: dir }), backups);
    const failWith = message =>
      app.evaluate(({ ipcMain }, message) => {
        ipcMain.removeHandler('backup:write');
        ipcMain.handle('backup:write', () => {
          throw new Error(message);
        });
      }, message);
    await failWith('The disk is full.');
    assert.equal(await page.evaluate(() => runBackup()), null);
    await toast('Backup failed:');
    assert.match(await page.evaluate(() => store.settings.lastBackupError), /disk is full/);
    await failWith('The library changed during export. Try again.');
    await page.evaluate(() => runBackup());
    await toast('The library changed while it was being backed up.');
    const retry = await page.evaluate(async () => {
      const delays = [],
        real = window.setTimeout;
      window.setTimeout = (fn, ms, ...rest) => {
        delays.push(ms);
        return real(fn, ms, ...rest);
      };
      try {
        await runBackup({ automatic: true });
      } finally {
        window.setTimeout = real;
      }
      return delays;
    });
    assert(retry.includes(2 * 60 * 1000), 'an automatic backup tries again in two minutes: ' + retry);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: apply/cancel/undo a saved livery, fonts from the Garage, cars without panels, no car open, failed and retried backups.'
    );
  } finally {
    await app.close();
    await fs.rm(backups, { recursive: true, force: true });
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
