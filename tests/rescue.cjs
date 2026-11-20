// The rescue window: an unreadable library opens one window with three ways out. Bring back a
// backup from the remembered backups folder (what it holds first), open a backup file, or start
// with an empty library; the original file is never changed. Esc does not close it; Saving paused
// opens it again; the details show the error and the files. Pointing at a backups folder once
// remembers it outside the library.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `rescue-${name}.png`) });
const broken = { schema: 1, templates: [], liveries: [], assets: [], projects: [{ id: 'broken' }], current: 'broken' };
const backup = name => ({
  format: 'slotforge-paintshop',
  version: 1,
  kind: 'library',
  exported: '2026-11-19T21:14:00.000Z',
  data: {
    templates: [],
    liveries: [],
    projects: [],
    fonts: [],
    assets: [{ name, type: 'shape', layer: { kind: 'rect', x: 0, y: 0, w: 100, h: 60, fill: '#f2b705' } }]
  }
});
async function profile(name, { folder = null } = {}) {
  const dir = path.join(out, `profile-rescue-${name}-${stamp}`),
    backups = path.join(dir, 'my backups');
  await fs.mkdir(backups, { recursive: true });
  await fs.writeFile(path.join(backups, 'Livery backup 2026-11-19 2114.sfpaint'), JSON.stringify(backup('Newest')));
  await fs.writeFile(path.join(backups, 'Livery backup 2026-11-10 1947.sfpaint'), JSON.stringify(backup('Older')));
  await fs.writeFile(path.join(dir, 'paintshop-library.json'), JSON.stringify(broken));
  if (folder) await fs.writeFile(path.join(dir, 'backup-folder.json'), JSON.stringify({ folder: backups }));
  return { dir, backups };
}
async function launch(dir, extra = {}) {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: dir, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: runtime,
    args: process.env.PAINTSHOP_PACKAGED ? [] : [root],
    env,
    timeout: 30000
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await page.waitForSelector('#tools button', { state: 'attached' });
}
const rescueOpen = () => page.locator('#dialog.rescue-dialog[open]').count();

async function run() {
  await fs.mkdir(out, { recursive: true });

  // 1. The backups folder is remembered: bring back the newest backup.
  const one = await profile('backup', { folder: true });
  await launch(one.dir);
  await page.waitForSelector('#dialog.rescue-dialog[open]');
  assert.equal(await page.evaluate(() => loadBlocked), true);
  assert.match(await page.locator('#save-status').innerText(), /saving paused/);
  await page.waitForFunction(() => !document.querySelector('#rescue-backups').disabled);
  assert.match(await page.locator('#rescue-backups-note').innerText(), /2 backups/);
  await page.waitForFunction(() =>
    /paintshop-library\.json/.test(document.querySelector('#rescue-details').textContent)
  );
  assert.match(await page.locator('#rescue-details').innerText(), /could not be validated/);
  await shot('choose');
  await page.keyboard.press('Escape');
  assert.equal(await rescueOpen(), 1, 'Esc does not close it');
  // Saving paused opens it again.
  await page.evaluate(() => closeDialog());
  await page.locator('#save-status').click();
  await page.waitForSelector('#dialog.rescue-dialog[open]');
  await page.waitForFunction(() => !document.querySelector('#rescue-backups').disabled);
  await page.locator('#rescue-backups').click();
  assert.equal(await page.locator('.rs-backup').count(), 2);
  assert.equal(
    await page.locator('[name="rescue-backup"]:checked').inputValue(),
    'Livery backup 2026-11-19 2114.sfpaint'
  );
  await page.locator('#rescue-open-backup').click();
  await page.waitForSelector('.rs-inside');
  assert.match(await page.locator('.rs-inside').innerText(), /1 artwork/);
  await shot('inside');
  await page.locator('#rescue-back').click();
  await page.locator('.rs-backup').nth(0).click();
  await page.locator('#rescue-open-backup').click();
  await page.waitForSelector('.rs-inside');
  await page.locator('[data-action="confirm-import"]').click();
  await page.waitForFunction(() => !loadBlocked);
  assert.equal(await rescueOpen(), 0);
  assert.equal(await page.evaluate(() => store.assets[0].name), 'Newest');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(one.dir, 'paintshop-library.json'), 'utf8')), broken);
  await app.close();
  await launch(one.dir);
  assert.equal(await page.evaluate(() => loadBlocked), false);
  assert.equal(await rescueOpen(), 0, 'after a rescue the library opens normally');
  assert.equal(await page.evaluate(() => store.assets[0].name), 'Newest');
  await app.close();

  // 2. No folder known: point at it once (remembered), look at a backup file, or start empty.
  const two = await profile('empty');
  await launch(two.dir, { PAINTSHOP_TEST_BACKUP_DIR: two.backups });
  await page.waitForSelector('#dialog.rescue-dialog[open]');
  await page.waitForFunction(() => !document.querySelector('#rescue-backups').disabled);
  assert.match(await page.locator('#rescue-backups-note').innerText(), /does not know your backups folder/);
  await page.locator('#rescue-backups').click();
  await page.waitForSelector('.rs-backup');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(two.dir, 'backup-folder.json'), 'utf8')), {
    folder: two.backups
  });
  await page.locator('#rescue-back').click();
  // A backup file from somewhere else: what it holds first.
  const file = path.join(out, `rescue-file-${stamp}.sfpaint`);
  await fs.writeFile(file, JSON.stringify(backup('From a stick')));
  await page.locator('#package-file').setInputFiles(file);
  await page.waitForSelector('.rs-inside');
  assert.match(await page.locator('#dialog').innerText(), /rescue-file-/);
  await page.locator('#rescue-back').click();
  await page.waitForSelector('#rescue-empty');
  // Start empty: an empty library, the unreadable file kept.
  await page.locator('#rescue-empty').click();
  await page.waitForFunction(() => !loadBlocked);
  assert.equal(await page.evaluate(() => store.assets.length + store.projects.length + store.templates.length), 0);
  assert(await page.locator('#start-page').isVisible(), 'the Start page, ready for a first car');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(two.dir, 'paintshop-library.json'), 'utf8')), broken);
  await app.close();
  await launch(two.dir);
  assert.equal(await rescueOpen(), 0);
  assert.deepEqual(errors, []);
  await fs.rm(file, { force: true });
  console.log(
    'PASS: rescue: remembered backups, Esc, Saving paused, look inside, bring back, find folder, file, start empty, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
