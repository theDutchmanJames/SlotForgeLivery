// Phase 6 systems: a full editing session at human pace (autosaves land
// between steps, as they do for real users) and automatic backups. (The update
// check has its own suite, update-window.cjs.)
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-systems-' + stamp),
  backups = path.join(out, 'backups-' + stamp);
const errors = [];
let app, page;
async function launch() {
  const env = {
    ...process.env,
    PAINTSHOP_TEST_DATA: data,
    PAINTSHOP_TEST_BACKUP_DIR: backups
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: runtime,
    args: process.env.PAINTSHOP_PACKAGED ? [] : [root],
    env,
    timeout: 30000
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#tools button', { state: 'attached' });
}
const click = action => clickAction(page, action);
const status = () => page.locator('#save-status').innerText();
// Pause like a person would, then confirm the latest autosave succeeded.
async function humanPause(step) {
  await page.waitForTimeout(1400);
  await page.waitForFunction(() => !/Saving/.test($('#save-status').textContent), null, { timeout: 15000 });
  const text = await status();
  assert(!/failed/i.test(text), `save failed after "${step}": ${text}`);
}

async function run() {
  await fs.mkdir(backups, { recursive: true });
  await launch();

  // Human pace: every step leaves time for an autosave before the next one.
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  await humanPause('import the sample car');
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  await humanPause('close the panel chooser');
  await click('generate-regions');
  await humanPause('generate regions');
  await click('finish-preparation');
  await humanPause('finish preparation');
  await page.locator('[data-swatch="#273442"]').click();
  await humanPause('paint the base');
  await click('shapes');
  await page.locator('[data-preset="number-roundel"]').click();
  await humanPause('add a number roundel');
  await page.locator('[data-swatch="#e5484d"]').click();
  await humanPause('colour the roundel');
  await click('save-livery');
  await page.locator('#dialog input').fill('Human pace livery');
  await page.locator('#dialog .primary').click();
  await humanPause('save the livery');
  await page.evaluate(() => actions.undo());
  await humanPause('undo');
  await page.evaluate(() => actions.redo());
  await humanPause('redo');

  // Backups: choose a folder (weekly is suggested), back up now.
  await click('settings');
  await page.locator('#backup-choose').click();
  assert.equal(await page.locator('#backup-folder').inputValue(), backups);
  assert.equal(await page.locator('#backup-every').inputValue(), 'weekly');
  await page.locator('[data-seg-for="backup-keep"][data-value="5"]').click();
  await page.locator('#backup-now').click();
  await page.waitForFunction(() => /Last backup: (?!never)/.test($('#backup-status').textContent));
  let files = (await fs.readdir(backups)).filter(n => n.endsWith('.sfpaint'));
  assert.equal(files.length, 1);
  const backup = JSON.parse(await fs.readFile(path.join(backups, files[0]), 'utf8'));
  assert.deepEqual([backup.format, backup.kind], ['slotforge-paintshop', 'library']);
  assert(
    backup.data.projects.some(p => p.views?.left?.length),
    'the backup holds full projects, not summaries'
  );
  assert(backup.data.liveries.some(l => l.name === 'Human pace livery'));
  // A backup is due once the interval has passed.
  assert.equal(await page.evaluate(() => backupDue()), false, 'not due right after a backup');
  assert.equal(await page.evaluate(() => backupDue(Date.now() + 8 * 24 * 3600e3)), true, 'due a week later');
  await page.locator('#settings-back').click();

  // Settings survive a restart.
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  assert.deepEqual(await page.evaluate(() => store.settings.backup), { every: 'weekly', keep: 5, folder: backups });
  assert.deepEqual(errors, []);
  await fs.rm(backups, { recursive: true, force: true });
  console.log('PASS: editing session at human pace, backups (manual, due, pruning settings) and restart.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
