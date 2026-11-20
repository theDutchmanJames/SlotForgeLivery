// Phase 5 slotcar features: real size and mm rulers, paint catalogue and My
// paints, painting order in the workshop PDF, true-size PDF, decals for
// SlotForge Decals, photo tracing aids, packages and restart.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-workshop-' + stamp),
  pdf = path.join(out, `workshop-${stamp}.pdf`),
  decals = path.join(out, `workshop-${stamp}.sfdecal`);
const errors = [];
let app, page;
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 950));
  await page.waitForSelector('#tools button', { state: 'attached' });
  await require('./inspector-helpers.cjs').openPropertyFolders(page);
}
const click = action => clickAction(page, action);
const select = id =>
  page.evaluate(id => {
    multiSelected.clear();
    selected = id;
    selectedPaint = null;
    render();
  }, id);
async function waitForFile(file) {
  for (let i = 0; i < 100; i++) {
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.size) return stat;
    await new Promise(r => setTimeout(r, 200));
  }
  throw Error('File was not written: ' + file);
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();
  await page.evaluate(() => (store.settings = { ...store.settings, showHints: false }));
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  await click('generate-regions');
  await click('finish-preparation');
  await page.evaluate(() => {
    selected = null;
    render();
  });

  // Real size: mm per unit, mm rulers and a mm readout for artwork.

  await page.locator('[data-inspector-tab="workshop"]').click();
  await page.locator('#real-width').fill('142');
  await page.locator('#real-width').dispatchEvent('change');
  const mm = await page.evaluate(() => M.mmPerUnit(activeView()));
  assert(mm > 0, 'real size sets millimetres per unit');
  await page.locator('#rulers').check();
  assert.equal(await page.locator('#ruler-corner').innerText(), 'mm');
  const ids = await page.evaluate(() => {
    const b = activeView().bounds,
      band = M.layer('rect', { name: 'Band', x: b.x + 10, y: b.y + b.h * 0.6, w: b.w - 20, h: 30, fill: '#f2f0e8' }),
      number = M.layer('text', { name: 'Number', text: '7', x: b.x + b.w * 0.45, y: b.y + 40, w: 60, h: 60 });
    project.views[currentView].push(band, number);
    changed();
    return { band: band.id, number: number.id };
  });
  await select(ids.band);
  const readout = await page.locator('.mm-readout').innerText();
  const bandMm = await page.evaluate(
    ([id, mm]) => M.artworkBounds([layers().find(l => l.id === id)]).w * mm,
    [ids.band, mm]
  );
  assert(readout.includes(bandMm >= 100 ? bandMm.toFixed(0) : bandMm.toFixed(1)), 'readout in mm: ' + readout);

  // Paint catalogue: choosing a paint sets colour and product; another colour clears it.
  await page.evaluate(() => {
    selected = null;
    render();
  });
  await click('paint-catalogue');
  await page.locator('#paint-search').fill('TS-15');
  await page.locator('[data-paint-pick]').first().click();
  assert.deepEqual(await page.evaluate(() => [project.base, project.paintRef]), ['#1f4fa3', 'Tamiya TS-15 Blue']);
  assert.match(await page.locator('.paint-ref-line').innerText(), /Tamiya TS-15 Blue/);
  await select(ids.number);
  await click('paint-catalogue');
  await page.locator('#paint-brand').selectOption('Humbrol');
  await page.locator('#paint-search').fill('Bright Red');
  await page.locator('[data-paint-pick]').first().click();
  assert.deepEqual(
    await page.evaluate(id => ((l = layers().find(l => l.id === id)) => [l.fill, l.paintRef])(), ids.number),
    ['#c9161f', 'Humbrol 19 Bright Red']
  );
  await page.locator('[data-swatch="#f3d36a"]').click();
  assert.equal(
    await page.evaluate(id => layers().find(l => l.id === id).paintRef, ids.number),
    undefined,
    'a non-catalogue colour clears the product'
  );

  // My paints: add a Revell paint and use it.
  await click('paint-catalogue');
  await page.locator('.paint-add summary').click();
  await page.locator('#my-paint-brand').fill('Revell');
  await page.locator('#my-paint-code').fill('36131');
  await page.locator('#my-paint-name').fill('Fiery red');
  await page.locator('#my-paint-hex').evaluate(el => {
    el.value = '#d0312d';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#my-paint-save').click();
  assert.equal(await page.locator('#paint-brand').inputValue(), 'My paints');
  await page.locator('[data-paint-pick]').first().click();
  assert.equal(
    await page.evaluate(id => layers().find(l => l.id === id).paintRef, ids.number),
    'Revell 36131 Fiery red'
  );

  // Workshop PDF: products and the painting order, lightest first.
  const steps = await page.evaluate(() => paintingSteps().map(s => s.ref || s.colour));
  assert.equal(steps[0], '#f2f0e8', 'the light band is sprayed first');
  assert(steps.includes('Tamiya TS-15 Blue') && steps.includes('Revell 36131 Fiery red'));
  const report = await page.evaluate(() => makeReport());
  assert(report.includes('PAINTING ORDER') && report.includes('Revell 36131 Fiery red'));
  await click('pdf');
  assert((await waitForFile(pdf)).size > 10000, 'workshop PDF written');
  await fs.rm(pdf);

  // True size: the view prints at its real width, masks per colour.
  const html = await page.evaluate(() => trueSizeHTML(project, 'left', { masks: true, design: true }));
  assert(html.includes(`width="142mm"`), 'printed at the real width');
  assert.equal((html.match(/Mask \d+:/g) || []).length, steps.length);
  await page.evaluate(() => {
    selected = null;
    render();
  });
  await click('true-size');
  await page.locator('#true-export').click();
  assert((await waitForFile(pdf)).size > 5000, 'true-size PDF written');

  // Decals: a valid SlotForge Decals pack at real size.
  await click('send-decals');
  await waitForFile(decals);
  const pack = JSON.parse(await fs.readFile(decals, 'utf8'));
  assert.equal(pack.format, 'slotforge-decals');
  assert.equal(pack.decals.length, 2);
  const readable = await page.evaluate(pack => DecalsModel.readPack(pack).decals.map(d => [d.name, d.art.w]), pack);
  const band = readable.find(([name]) => name === 'Band');
  assert(Math.abs(band[1] - bandMm) < 0.01, 'decal keeps its real width in mm');

  // Photo tracing aids on a traced top view.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const g = canvas.getContext('2d');
    g.fillStyle = '#d0d4d8';
    g.fillRect(0, 0, 400, 200);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    addCarDialog('top');
    pendingAdd = { ...pendingAdd, kind: 'photo', key: 'top', name: project.template.name, scale: '1:32' };
    await importCar(new File([blob], 'top.png', { type: 'image/png' }));
  });
  await page.waitForFunction(() => currentView === 'top' && preparing);
  await page.locator('#photo-opacity').evaluate(el => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => activeView().photoOpacity), 0.3);
  assert.match(await page.locator('#artboard').innerHTML(), /opacity="0.3"/);
  await click('centre-guide');
  const centre = await page.evaluate(() => [project.guides.top.x, activeView().photo.x + activeView().photo.w / 2]);
  assert.deepEqual(centre[0], [centre[1]]);

  // Packages keep real size, products and photo opacity; restart keeps My paints.
  const imported = await page.evaluate(() => validateProject(M.clone(project)));
  assert.equal(imported.template.views.left.realWidthMm, 142);
  assert.equal(imported.paintRef, 'Tamiya TS-15 Blue');
  assert.equal(imported.template.views.top.photoOpacity, 0.3);
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  const reopened = await page.evaluate(() => ({
    width: project.template.views.left.realWidthMm,
    ref: project.paintRef,
    mine: store.settings.customPaints.map(p => PaintCatalogue.label(p))
  }));
  assert.deepEqual(reopened, { width: 142, ref: 'Tamiya TS-15 Blue', mine: ['Revell 36131 Fiery red'] });
  assert.deepEqual(errors, []);
  await fs.rm(pdf, { force: true });
  await fs.rm(decals, { force: true });
  console.log(
    'PASS: real size and mm rulers, paint catalogue and My paints, painting order PDF, true-size PDF, Decals pack, photo tracing aids, packages and restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
