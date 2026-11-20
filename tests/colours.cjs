// Livery colours: named colours with a real paint; changing one repaints every use,
// linking a paint sets it on every use; merge and remove; choosing a paint for the
// selection adds a livery colour; paints you have and the shopping list (also in the
// workshop plan); older team colours become livery colours; packages and restart keep them.
const path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-colours-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const click = action => clickAction(page, action);
const shot = async name => shots && page.screenshot({ path: path.join(shots, `colours-${name}.png`) });
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
  await launch();
  await click('sample-car');
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  // An older design: team colours only, painted in three places.
  await page.evaluate(() => {
    mutate(() => {
      project.base = '#7fb7e2';
      project.views.left.push(
        M.layer('rect', { name: 'Band', x: 150, y: 330, w: 700, h: 40, fill: '#f28a35' }),
        M.layer('rect', { name: 'Stripe', x: 150, y: 380, w: 700, h: 8, fill: '#7fb7e2' })
      );
      delete project.liveryColours;
      project.palette = ['#7fb7e2', '#f28a35'];
    });
    selected = null;
    selectedPaint = null;
    render();
  });
  assert.deepEqual(
    await page.locator('#inspector .lc-body b').allInnerTexts(),
    ['Colour 1', 'Colour 2'],
    'team colours become livery colours'
  );
  assert.equal(await page.locator('#inspector .lc-card').first().locator('.lc-top small').innerText(), '2×');

  // Edit: rename and change the shade; every use follows.
  await page.locator('[data-colour-edit="#7fb7e2"]').click();
  await page.locator('#colour-name').fill('Gulf blue');
  await page.locator('#colour-hex').fill('#6aa6d6');
  await page.locator('#colour-save').click();
  assert.equal(await page.evaluate(() => project.base), '#6aa6d6');
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Stripe').fill), '#6aa6d6');
  assert.deepEqual(await page.evaluate(() => project.palette), ['#6aa6d6', '#f28a35'], 'team colours stay in step');
  assert.equal(await page.evaluate(() => liveryColours()[0].name), 'Gulf blue');
  await click('undo');
  assert.equal(await page.evaluate(() => project.base), '#7fb7e2', 'one undo restores every use');
  await click('redo');

  // A real paint from the closest matches: set on every use.
  await page.locator('[data-colour-edit="#6aa6d6"]').click();
  assert((await page.locator('[data-colour-paint]').count()) >= 3);
  await shot('editor');
  await page.locator('[data-colour-paint]').first().click();
  const ref = await page.evaluate(() => liveryColours()[0].ref);
  assert(ref, 'the colour has a paint');
  assert.equal(await page.evaluate(() => project.paintRef), ref);
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Stripe').paintRef), ref);
  // Painting with a livery colour brings its paint along.
  await page.evaluate(() => {
    selected = layers().find(l => l.name === 'Band').id;
    render();
  });
  await page.locator('[data-team-colour="#6aa6d6"]').click();
  assert.equal(await page.evaluate(() => selection().paintRef), ref);
  await click('undo');

  // Browse all paints, with "also use the paint's colour".
  await page.locator('[data-colour-edit="#f28a35"]').click();
  await page.locator('[data-colour-browse]').click();
  await page.locator('#paint-search').fill('TS-56');
  await page.locator('#paint-use-colour').check();
  const paintHex = await page.evaluate(() => PaintCatalogue.paints.find(p => p.code === 'TS-56').hex);
  await page.locator('[data-paint-pick]').first().click();
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Band').fill), paintHex);
  assert.match(await page.evaluate(() => liveryColours()[1].ref), /TS-56/);

  // Paints you have, and the shopping list.
  await click('paint-catalogue');
  await page.locator('#paint-search').fill('TS-56');
  await page.locator('.pc-tin [data-paint-own]').first().click();
  assert.equal(await page.locator('.pc-tin [data-paint-own]').first().getAttribute('aria-pressed'), 'true');
  assert.deepEqual(
    await page.evaluate(() => shoppingList().map(s => s.ref)),
    [ref],
    'only the paint you do not have is on the list'
  );
  await shot('catalogue');
  await click('close-dialog');
  assert.match(await page.evaluate(() => makeReport()), /Shopping list/);
  await page.locator('[data-inspector-tab="workshop"]').click();
  assert.equal(await page.locator('#workshop-panel .ws-colour').count(), 2);
  await page.locator('[data-inspector-tab="selection"]').click();

  // Choosing a paint for the selection adds it as a livery colour.
  await page.evaluate(() => {
    selected = layers().find(l => l.name === 'Stripe').id;
    render();
  });
  await click('paint-catalogue');
  await page.locator('#paint-brand').selectOption('All');
  await page.locator('#paint-search').fill('TS-26');
  await page.locator('[data-paint-pick]').first().click();
  assert.equal(await page.evaluate(() => liveryColours().length), 3);
  assert.match(await page.evaluate(() => liveryColours()[2].ref), /TS-26/);

  // Merge and remove.
  const white = await page.evaluate(() => liveryColours()[2].hex);
  await page.locator(`[data-colour-edit="${white}"]`).click();
  await page.locator('#colour-merge').selectOption('#6aa6d6');
  await page.locator('#colour-merge-go').click();
  assert.equal(await page.evaluate(() => liveryColours().length), 2);
  assert.equal(await page.evaluate(() => layers().find(l => l.name === 'Stripe').fill), '#6aa6d6');
  const orange = await page.evaluate(() => liveryColours()[1].hex);
  await page.locator(`[data-team-colour="${orange}"]`).first().click({ button: 'right' });
  assert.equal(await page.evaluate(() => liveryColours().length), 1);
  assert.equal(await page.evaluate(() => project.palette.length), 1);
  await click('undo');

  // Packages and a restart keep the colours.
  const imported = await page.evaluate(() => validateProject(M.clone(project)).liveryColours);
  assert.deepEqual(
    imported.map(c => c.name),
    ['Gulf blue', 'Colour 2']
  );
  const design = await page.evaluate(() => M.applyLivery(M.newProject(project.template), M.liveryFromProject(project)));
  assert.equal(design.liveryColours.length, 2, 'a saved design carries its colours');
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  assert.deepEqual(await page.evaluate(() => liveryColours().map(c => c.name)), ['Gulf blue', 'Colour 2']);
  assert.equal(await page.evaluate(() => ownedPaints().size), 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: livery colours: names, repaint every use, paints, have and buy, merge, remove, packages, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
