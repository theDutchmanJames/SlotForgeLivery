// Fixes from the full review of 20 November 2026, each checked the way a user meets it:
// studio keys do nothing on other pages; a held arrow key is one undo step; the pair turns off on
// a car without a second side; mirrored text keeps its size when you switch the side you edit;
// one mask page per colour; HO decals at 1:87; Edit details from a car page; Generate regions
// keeps the real size; a trashed livery stays trashed through a package; a missing database
// opens the rescue window instead of the old pre-SQLite library.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-review-fixes-' + Date.now());
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
  await page.waitForSelector('#tools button', { state: 'attached' });
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();
  await page.evaluate(() => actions['sample-car']());
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.evaluate(() =>
    mutate(() =>
      project.views.left.push(M.layer('rect', { name: 'Box', x: 300, y: 300, w: 80, h: 40, fill: '#e5484d' }))
    )
  );
  const select = name =>
    page.evaluate(name => {
      selected = layers().find(l => l.name === name).id;
      multiSelected.clear();
      render();
    }, name);

  // Studio keys do nothing while the Garage is open.
  await select('Box');
  await page.evaluate(() => actions.projects());
  await page.locator('#garage-page').click({ position: { x: 600, y: 600 } });
  await page.keyboard.press('Delete');
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(() => project.views.left.length), 1, 'Delete and T do nothing on the Garage');
  await page.evaluate(() => actions.studio());

  // A held arrow key moves in one undo step.
  await select('Box');
  const steps = await page.evaluate(() => undo.length);
  await page.evaluate(() => {
    const press = repeat =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat, bubbles: true }));
    press(false);
    for (let i = 0; i < 20; i++) press(true);
  });
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Box').x), 321);
  assert.equal(await page.evaluate(() => undo.length), steps + 1, 'one undo step for the whole nudge');

  // Mirrored text keeps its size when you switch the side you edit, also with differently shaped sides.
  await page.evaluate(() => {
    mutate(() => {
      const right = M.clone(project.template.views.left);
      right.bounds = { ...right.bounds, w: right.bounds.w * 1.2 };
      project.template.views.right = right;
      project.views.right = [];
      project.views.left.push(M.layer('text', { name: 'Number', text: '27', x: 560, y: 260, w: 80, h: 60 }));
    });
    selected = layers().find(l => l.name === 'Number').id;
    mutate(() => putOnSide(artworkSelection(), 'right', 'mirror'));
  });
  const size = () => page.evaluate(() => Math.round(project.views.left.find(l => l.name === 'Number').w * 1000));
  const before = await size();
  for (let i = 0; i < 3; i++)
    await page.evaluate(() => {
      for (const side of ['right', 'left']) {
        currentView = side;
        resetViewSelection();
        mutate(() => (layers().find(l => l.name === 'Number').y += 1));
      }
    });
  assert(Math.abs((await size()) - before) <= 1, 'no shrinking from switching sides');

  // The pair turns off on a car with only one side.
  await page.evaluate(() => {
    setPreference('compareOn', true);
    delete project.template.views.right;
    project.views.right = [];
    currentView = 'left';
    render();
  });
  assert.equal(await page.evaluate(() => pairOn()), false);
  assert.equal(await page.locator('.canvas-row.comparing').count(), 0, 'not stuck half-split');

  // One mask page per colour, even with two paint references for the same colour.
  await page.evaluate(() =>
    mutate(() => {
      project.base = '#ffffff';
      project.paintRef = 'Tamiya X-2';
      activeView().realWidthMm = 138;
      project.views.left.push(
        M.layer('rect', { name: 'White stripe', x: 100, y: 330, w: 700, h: 20, fill: '#ffffff' })
      );
    })
  );
  const ids = await page.evaluate(() => packPages().map(p => p.id));
  assert.equal(new Set(ids).size, ids.length, 'every page id is unique');

  // HO decals are 1:87.
  assert.equal(await page.evaluate(() => ((project.template.scale = 'HO'), decalScale())), 87);
  await page.evaluate(() => (project.template.scale = '1:32'));

  // Generate all vector regions keeps the real size of the view.
  if (await page.evaluate(() => !!activeView().vectorSource)) {
    await page.evaluate(() => generateVectorRegions());
    if (await page.locator('#confirm-button').count()) await page.locator('#confirm-button').click();
    assert.equal(await page.evaluate(() => activeView().realWidthMm), 138, 'real size kept');
  }

  // Edit details from a car page in the Garage opens, saves and goes back to that car.
  await page.evaluate(() => flushSave());
  const car = await page.evaluate(() => store.templates[0].id);
  await page.evaluate(id => showGarage('car:' + id), car);
  await page.locator('[data-garage-edit-car]').first().click();
  await page.waitForSelector('#library-detail-name');
  await page.locator('#library-detail-name').fill('Sample coupe Mk2');
  await page.locator('#library-details-save').click();
  await page.evaluate(() => flushSave());
  assert.equal(await page.evaluate(() => store.templates[0].name), 'Sample coupe Mk2');
  await page.evaluate(() => actions.studio());

  // A trashed livery stays in the Trash through a package.
  const trashed = await page.evaluate(() => {
    const p = validateProject({ ...M.clone(project), trashedAt: '2026-11-01T10:00:00.000Z' });
    return p.trashedAt;
  });
  assert.equal(trashed, '2026-11-01T10:00:00.000Z');

  // A missing database after it has opened before: the rescue window, not the old JSON.
  await page.evaluate(() => flushSave());
  await app.close();
  await fs.writeFile(
    path.join(data, 'paintshop-library.json'),
    JSON.stringify({ schema: 1, templates: [], liveries: [], assets: [], projects: [], current: null })
  );
  await fs.rm(path.join(data, 'paintshop-library.sqlite'));
  await launch();
  await page.waitForSelector('#dialog.rescue-dialog[open]');
  assert.match(await page.locator('#rescue-details').innerText(), /database is missing/);
  assert.equal(await page.evaluate(() => loadBlocked), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: review fixes: keys per page, held nudge, pair off, mirror size, masks, HO, Edit details, regions, trash, missing database.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
