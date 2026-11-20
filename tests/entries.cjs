// Entries: one livery, many cars. Text layers take their text from the shown entry (race
// number, driver, team); the switcher above the canvas; the Entries window (add, paste a list,
// edit, own number colour, order, delete); typing in a bound text layer edits the entry; the
// Print pack for all entries and decals for all entries; packages and restart keep them.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-entries-' + stamp),
  pdf = path.join(out, `entries-${stamp}.pdf`),
  decals = path.join(out, `entries-${stamp}.sfdecal`),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const click = action => clickAction(page, action);
const shot = async name => shots && page.screenshot({ path: path.join(shots, `entries-${name}.png`) });
const texts = () =>
  page.evaluate(() =>
    layers()
      .filter(l => l.kind === 'text')
      .map(l => l.text)
  );
async function launch() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: data, PAINTSHOP_TEST_PDF: pdf, PAINTSHOP_TEST_DECALS: decals };
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
const select = name =>
  page.evaluate(name => {
    selected = layers().find(l => l.name === name).id;
    multiSelected.clear();
    render();
  }, name);

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();
  await click('sample-car');
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.evaluate(() => {
    mutate(() => {
      activeView().realWidthMm = 138;
      project.views.left.push(
        M.layer('text', { name: 'Race number', text: '27', x: 560, y: 260, w: 80, h: 60, fill: '#1f2730' }),
        M.layer('text', { name: 'Driver', text: 'J. de Vries', x: 300, y: 360, w: 200, h: 24, fill: '#ffffff' })
      );
    });
  });
  assert.equal(await page.locator('#entry-switch').isVisible(), false, 'no switcher without entries');

  // Text comes from: the first field makes the first entry from the text.
  await select('Race number');
  await page.locator('[data-text-from="number"]').click();
  assert.deepEqual(await page.evaluate(() => entryList().map(x => x.number)), ['27']);
  await select('Driver');
  await page.locator('[data-text-from="driver"]').click();
  assert.equal(await page.evaluate(() => entryList()[0].driver), 'J. de Vries');
  assert(await page.locator('#entry-switch').isVisible());

  // Entries window: paste a list, add one.
  await click('entries');
  await page.locator('[data-entry-paste-open]').click();
  await page
    .locator('#entries-paste-text')
    .fill('28, S. Bakker, Gulf Racing\n31; M. Jansen; Gulf Racing\n\n44\tR. Smit\tGulf Racing');
  await page.locator('#entries-paste-add').click();
  assert.deepEqual(await page.evaluate(() => entryList().map(x => x.number)), ['27', '28', '31', '44']);
  await page.locator('[data-entry-add]').click();
  assert.equal(await page.evaluate(() => entryList().at(-1).number), '45', 'the next number');
  await page.locator('#entries-body tbody tr:last-child [data-entry-delete]').click();
  // Edit a driver and give #31 its own number colour.
  await page.locator('[data-entry-field="driver"]').nth(1).fill('Sanne Bakker');
  await page.locator('[data-entry-field="driver"]').nth(1).dispatchEvent('change');
  const id31 = await page.evaluate(() => entryList()[2].id);
  await page.locator(`[data-entry-colour-on="${id31}"]`).check();
  await page.locator(`[data-entry-colour="${id31}"]`).evaluate(el => {
    el.value = '#e5484d';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.locator('.en-car').count(), 4);
  await shot('window');
  await click('close-dialog');

  // The switcher shows each car.
  await page.locator('#entry-switch [data-entry-show]').nth(1).click();
  assert.deepEqual(await texts(), ['28', 'Sanne Bakker']);
  await page.locator('#entry-switch [data-entry-show]').nth(2).click();
  assert.deepEqual(await texts(), ['31', 'M. Jansen']);
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Race number').fill), '#e5484d', 'own colour');
  await page.locator('#entry-switch [data-entry-show]').nth(0).click();
  assert.equal(
    await page.evaluate(() => layers().find(l => l.name === 'Race number').fill),
    '#1f2730',
    'back to the livery colour'
  );
  await click('undo');
  assert.deepEqual(await texts(), ['31', 'M. Jansen'], 'switching is undoable');
  await click('redo');
  await shot('switcher');

  // Typing in a bound text layer edits the shown entry.
  await select('Driver');
  await page.locator('#text-value').fill('Jan de Vries');
  await page.locator('#text-value').press('Enter');
  assert.equal(await page.evaluate(() => activeEntry().driver), 'Jan de Vries');
  // Typed text unbinds and keeps the text.
  await page.locator('[data-text-from="typed"]').click();
  assert.equal(await page.evaluate(() => selection().textFrom), undefined);
  assert.equal(await page.evaluate(() => selection().text), 'Jan de Vries');
  await click('undo');
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Driver').textFrom), 'driver');

  // Print pack: the ticked pages for each entry.
  await click('print-pack');
  await page.locator('[data-pack-tick="plan"]').click();
  await page.locator('[data-pack-tick="order"]').click();
  await page.locator('[data-pack-tick="view:left"]').click();
  await page.locator('[data-pack-setting="allEntries"]').check();
  await page.locator('[data-pack-save]').click();
  await page.waitForFunction(() => /Print pack saved/.test(document.querySelector('#toast').textContent), null, {
    timeout: 60000
  });
  const bytes = await fs.readFile(pdf);
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  assert((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length >= 4, 'one view page per entry');
  await click('studio');

  // Decals for all entries: every entry's decals, named by number.
  await click('entries');
  await page.locator('[data-entries-decals]').click();
  await page.waitForFunction(() => /for 4 entries/.test(document.querySelector('#toast').textContent), null, {
    timeout: 30000
  });
  const pack = JSON.parse(await fs.readFile(decals, 'utf8'));
  assert(pack.decals.some(d => d.name.startsWith('#44 ')));
  assert.equal(await page.evaluate(() => activeEntry().number), '27', 'the shown entry is kept');
  await click('close-dialog');

  // Packages and a restart keep the entries and fields.
  const imported = await page.evaluate(() => validateProject(M.clone(project)));
  assert.equal(imported.entries.length, 4);
  assert.equal(
    Object.values(imported.views)
      .flat()
      .filter(l => l.textFrom).length,
    2
  );
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  assert.deepEqual(await page.evaluate(() => entryList().map(x => x.number)), ['27', '28', '31', '44']);
  assert(await page.locator('#entry-switch').isVisible());
  assert.deepEqual(errors, []);
  await fs.rm(pdf, { force: true });
  await fs.rm(decals, { force: true });
  console.log(
    'PASS: entries: fields, switcher, window, paste, colours, typing, print pack and decals for all, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
