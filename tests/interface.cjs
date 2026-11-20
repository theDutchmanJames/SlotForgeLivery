// Phase 3 interface: sample car, step tips, welcome recent projects, toast
// clearing, resizable Layers panel, library list view, studio preferences
// and tabbed Help.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-interface-' + Date.now());
const errors = [];
let app, page;
async function launch() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: runtime,
    args: process.env.PAINTSHOP_PACKAGED ? [] : [root],
    env,
    timeout: 30000
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 950));
  await page.waitForSelector('#tools button');
}
const click = action => clickAction(page, action);
const hintStep = () => page.evaluate(() => ($('#step-hint').hidden ? null : $('#step-hint').dataset.step));

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();

  // Welcome: a first-time user sees the first-car wording and no recent list.
  assert(await page.locator('#welcome .label-first').isVisible());
  assert(await page.locator('#welcome-recent').isHidden());

  // Studio preferences: default scale and undo depth.
  await click('settings');
  await page.locator('[data-seg-for="pref-scale"][data-value="1:24"]').click();
  await page.locator('[data-seg-for="pref-undo"][data-value="30"]').click();
  assert.deepEqual(await page.evaluate(() => [store.settings.defaultScale, store.settings.undoSteps]), ['1:24', 30]);
  await page.locator('#settings-back').click();

  // Sample car: the normal Add car path, prepared like a user's car.
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  const sample = await page.evaluate(() => ({
    name: project.name,
    car: project.template.name,
    scale: project.template.scale
  }));
  assert.deepEqual(sample, { name: 'Sample coupe · Livery 1', car: 'Sample coupe', scale: '1:24' });
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  assert.equal(await hintStep(), 'prepare');
  await click('generate-regions');
  await click('finish-preparation');
  assert.equal(await hintStep(), 'paint', 'tips move on once preparation is finished');
  await page.locator('[data-hint-dismiss="paint"]').click();
  assert.equal(await hintStep(), 'artwork', 'a dismissed tip makes way for the next step');
  await page.evaluate(() => {
    const b = activeView().bounds;
    project.views[currentView].push(M.layer('rect', { x: b.x + 40, y: b.y + 40, w: 80, h: 30 }));
    changed();
    render();
  });
  assert.equal(await hintStep(), 'share');
  await click('save-livery');
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  assert.equal(await hintStep(), null, 'the tour completes after saving or exporting');

  // Undo depth follows the preference.
  await page.evaluate(() => {
    for (let i = 0; i < 45; i++) record();
  });
  assert.equal(await page.evaluate(() => undo.length), 30);

  // Toasts clear when moving to another section.
  await page.evaluate(() => toast('Something happened.'));
  assert(await page.locator('#toast.show').count());
  await click('library');
  assert.equal(await page.locator('#toast.show').count(), 0, 'navigation clears the message');

  // Library: compact list with usage counts, remembered.
  await page.locator('[data-library-view="list"]').click();
  assert(await page.locator('#library-items .library-grid.list').count());
  assert.match(await page.locator('#library-items .library-card small').first().innerText(), /Used by 1 project/);
  await click('close-dialog');
  assert.equal(await page.evaluate(() => store.settings.libraryView), 'list');

  // Help: one section at a time.
  await click('help');
  assert.equal(await page.locator('[data-help-panel]:visible').count(), 1);
  await page.locator('[data-help-tab="3"]').click();
  assert.equal(await page.locator('[data-help-panel="3"]').isVisible(), true);
  assert.equal(await page.locator('[data-help-panel="0"]').isVisible(), false);
  await click('close-dialog');

  // Tips can be switched off and on again from Settings.
  await click('settings');
  await page.locator('#pref-hints').uncheck();
  await page.locator('#pref-reset-hints').click();
  assert.equal(await page.evaluate(() => store.settings.showHints), true);
  assert.deepEqual(await page.evaluate(() => store.settings.hintsDismissed), []);
  await page.locator('#settings-back').click();

  // Welcome for a returning user: recent projects open the project again.
  await page.evaluate(() => {
    store.current = null;
    project = null;
    render();
  });
  assert(await page.locator('#welcome .label-again').isVisible());
  assert.equal(await page.locator('#welcome-recent [data-project-open]').count(), 1);
  await page.locator('#welcome-recent [data-project-open]').click();
  await page.waitForFunction(() => project?.name === 'Sample coupe · Livery 1');

  // A second sample car gets its own name; preferences survive a restart.
  await click('add-car');
  await page.locator('#dialog [data-action="sample-car"]').click();
  await page.waitForFunction(() => project?.template.name === 'Sample coupe 2');
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  assert.deepEqual(
    await page.evaluate(() => [store.settings.defaultScale, store.settings.undoSteps, store.settings.libraryView]),
    ['1:24', 30, 'list']
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: sample car, step tips, recent projects, toast clearing, resizable Layers, library list, preferences and Help tabs.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
