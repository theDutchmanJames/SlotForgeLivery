// The Garage: cars with their liveries, the detail panel and its actions, status,
// the Trash (put back, delete for good, emptied after 30 days), the library sections
// and Backups with "bring back what's missing".
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-garage-' + stamp),
  backups = path.join(out, 'garage-backups-' + stamp),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const click = action => clickAction(page, action);
const shot = async name => shots && page.screenshot({ path: path.join(shots, `garage-${name}.png`) });
const names = () => page.locator('#garage-page [data-garage-select] strong').allInnerTexts();
async function launch() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: data, PAINTSHOP_TEST_BACKUP_DIR: backups };
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

async function run() {
  await fs.mkdir(backups, { recursive: true });
  await launch();
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  await click('close-dialog');
  await click('generate-regions');
  await click('finish-preparation');
  // A second car and a few more liveries.
  await page.evaluate(() => {
    const t = store.templates[0],
      other = { ...M.clone(t), id: M.uid(), name: 'Club GT' };
    store.templates.push(other);
    for (const [name, base, car] of [
      ['Club night', '#1f3a93', t],
      ['Martini tribute', '#e9e4d8', t],
      ['GT stripes', '#2b8887', other]
    ]) {
      const p = M.newProject(car, name);
      p.base = base;
      store.projects.push(p);
    }
    scheduleSave();
  });

  // The menu's Garage opens the page on Recent.
  await click('projects');
  assert(await page.locator('#garage-page').isVisible());
  assert.equal(await page.locator('.workspace').isVisible(), false);
  assert(await page.locator('#garage-crumb').isVisible());
  assert.equal(await page.locator('#export-button').isVisible(), false, 'the studio actions are hidden');
  assert.equal((await names()).length, 4);
  assert.deepEqual(await page.locator('#garage-page [data-garage-section^="car:"] .gr-text').allInnerTexts(), [
    'Club GT',
    'Sample coupe'
  ]);

  // A car: its liveries, a New livery card and the detail panel.
  await page.locator('[data-garage-section^="car:"]', { hasText: 'Sample coupe' }).click();
  assert.deepEqual((await names()).sort(), ['Club night', 'Martini tribute', 'Sample coupe · Livery 1']);
  assert(await page.locator('#garage-page .gr-new').isVisible());
  await page.locator('[data-garage-select]', { hasText: 'Martini tribute' }).click();
  assert.equal(await page.locator('#garage-name').inputValue(), 'Martini tribute');
  await shot('car');

  // Status and filter.
  await page.locator('[data-garage-status="finished"]').click();
  assert.equal(await page.evaluate(() => store.projects.find(p => p.name === 'Martini tribute').status), 'finished');
  await page.locator('[data-garage-filter="finished"]').click();
  assert.deepEqual(await names(), ['Martini tribute']);
  await page.locator('[data-garage-filter="all"]').click();

  // Rename and duplicate.
  await page.locator('#garage-name').fill('Martini 1971');
  await page.locator('#garage-name').press('Enter');
  await page.locator('#garage-name').blur();
  await page.waitForFunction(() => store.projects.some(p => p.name === 'Martini 1971'));
  await page.locator('[data-garage-duplicate]').click();
  assert((await names()).includes('Martini 1971 copy'));
  assert.equal(await page.locator('#garage-name').inputValue(), 'Martini 1971 copy', 'the copy is selected');

  // Search.
  await page.locator('#garage-search').fill('night');
  assert.deepEqual(await names(), ['Club night']);
  await page.locator('#garage-search').fill('');

  // Trash: move, put back, delete for good.
  await page.locator('#garage-page [data-project-delete]').click();
  assert.equal((await names()).includes('Martini 1971 copy'), false);
  await page.locator('[data-garage-section="trash"]').click();
  assert.equal(await page.locator('.gr-trashed').count(), 1);
  await shot('trash');
  await page.locator('[data-garage-restore]').click();
  assert.equal(await page.locator('.gr-trashed').count(), 0);
  await page.locator('[data-garage-section^="car:"]', { hasText: 'Sample coupe' }).click();
  await page.locator('[data-garage-select]', { hasText: 'Martini 1971 copy' }).click();
  await page.locator('#garage-page [data-project-delete]').click();
  await page.locator('[data-garage-section="trash"]').click();
  await page.locator('[data-garage-purge]').click();
  await page.locator('#dialog .primary').click();
  assert.equal(await page.evaluate(() => store.projects.some(p => p.name === 'Martini 1971 copy')), false);
  // Liveries older than 30 days in the Trash are deleted at start.
  assert.equal(
    await page.evaluate(() => {
      store.projects.find(p => p.name === 'Club night').trashedAt = new Date(Date.now() - 31 * 864e5).toISOString();
      return emptyOldTrash();
    }),
    1
  );

  // Save as design, then the library section shows it.
  await page.locator('[data-garage-section="recent"]').click();
  await page.locator('[data-garage-select]', { hasText: 'GT stripes' }).click();
  await page.locator('[data-garage-design]').click();
  await page.locator('[data-library-tab="liveries"]').click();
  assert.equal(await page.locator('#library-items .library-card').count(), 1);
  assert.match(await page.locator('#library-items .library-card strong').textContent(), /GT stripes/);

  // Use on another car starts a new livery there and opens it.
  await page.locator('[data-garage-section="recent"]').click();
  await page.locator('[data-garage-select]', { hasText: 'GT stripes' }).click();
  await page.locator('[data-garage-other-car]').click();
  await page.locator('#garage-other-apply').click();
  assert(await page.locator('.workspace').isVisible());
  assert.match(await page.evaluate(() => project.name), /GT stripes · Sample coupe/);
  assert.equal(await page.evaluate(() => project.base), '#2b8887');

  // Backups: back up, delete a livery for good, then bring it back.
  await click('projects');
  await page.evaluate(dir => setBackup({ folder: dir }), backups);
  await page.locator('[data-garage-section="backups"]').click();
  await page.locator('[data-garage-backup-now]').click();
  await page.waitForSelector('[data-garage-backup]');
  await page.evaluate(() => {
    store.projects = store.projects.filter(p => p.name !== 'Martini 1971');
    scheduleSave();
    renderGarage();
  });
  await page.locator('[data-garage-backup]').first().click();
  await page.waitForSelector('[data-garage-restore-backup]');
  assert.match(await page.locator('.gr-list').innerText(), /Martini 1971/);
  await shot('backups');
  await page.locator('[data-garage-restore-backup]').click();
  await page.waitForFunction(() => store.projects.some(p => p.name === 'Martini 1971'));
  assert.equal(
    await page.evaluate(() => store.projects.filter(p => p.name === 'Martini 1971').length),
    1,
    'brought back once'
  );

  // Back to the studio from the rail; everything survives a restart.
  await page.locator('#garage-page .gr-back').click();
  assert(await page.locator('.workspace').isVisible());
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  await click('projects');
  await page.locator('[data-garage-section="recent"]').click();
  assert((await names()).includes('Martini 1971'));
  assert.equal(await page.evaluate(() => store.projects.find(p => p.name === 'Martini 1971').status), 'finished');
  assert.deepEqual(errors, []);
  await fs.rm(backups, { recursive: true, force: true });
  console.log(
    'PASS: Garage cars and liveries, details, status, rename, duplicate, Trash, designs, another car, backups.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
