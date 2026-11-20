// Phase 2 editing tools: outlines, layer lock, align/distribute, eyedropper
// fallback, team and recent colours, package validation and restart.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-editing-' + Date.now());
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
  await page.waitForSelector('#tools button');
  await require('./inspector-helpers.cjs').openPropertyFolders(page);
}
const click = action => clickAction(page, action);
const canvasPoint = (x, y) =>
  page.evaluate(
    ([x, y]) => new DOMPoint(x, y).matrixTransform(document.querySelector('#artboard').getScreenCTM()).toJSON(),
    [x, y]
  );
const layerById = id => page.evaluate(id => layers().find(l => l.id === id), id);
const boundsOf = list =>
  page.evaluate(list => list.map(id => M.artworkBounds([layers().find(l => l.id === id)])), list);
const select = (id, many = []) =>
  page.evaluate(
    ([id, many]) => {
      multiSelected.clear();
      many.forEach(x => multiSelected.add(x));
      selected = id;
      render();
    },
    [id, many]
  );

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();
  await click('add-car');
  await page.locator('#car-name').fill('Editing tools coupe');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#choose-svg').click()]);
  await chooser.setFiles(path.join(__dirname, 'fixtures/car.svg'));
  await page.waitForFunction(() => preparing && activeView()?.vectorSource?.regions.length === 6);
  await click('close-dialog');
  await click('generate-regions');
  await click('finish-preparation');
  const ids = await page.evaluate(() => {
    const b = activeView().bounds,
      a = M.layer('rect', { name: 'Band A', x: b.x + 20, y: b.y + 30, w: 80, h: 40, fill: '#112233' }),
      c = M.layer('rect', { name: 'Band C', x: b.x + 300, y: b.y + 80, w: 60, h: 30, fill: '#445566' }),
      t = M.layer('text', { name: 'Number', text: '7', x: b.x + 150, y: b.y + 50, w: 70, h: 60, fill: '#ffffff' });
    project.views[currentView] = [a, c, t];
    changed();
    return { a: a.id, c: c.id, t: t.id };
  });
  await select(ids.t);

  // Outline on text: inspector controls, SVG output, undo/redo.
  await page.locator('#outline-width').fill('3');
  await page.locator('#outline-width').dispatchEvent('change');
  await page.locator('#outline-colour').evaluate(el => {
    el.value = '#e5484d';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const t = await layerById(ids.t);
  assert.deepEqual([t.outlineWidth, t.outlineColour], [3, '#e5484d']);
  const markup = await page.locator(`#artboard [data-layer="${ids.t}"]`).evaluate(el => el.outerHTML);
  assert.match(markup, /stroke="#e5484d" stroke-width="6" paint-order="stroke"/, 'outline drawn behind the fill');
  await page.evaluate(() => actions.undo());
  assert.equal((await layerById(ids.t)).outlineColour, '#ffffff', 'undo restores the previous outline colour');
  await page.evaluate(() => actions.redo());
  assert.equal((await layerById(ids.t)).outlineColour, '#e5484d');

  // Lock: no canvas pick, no nudge, no handles; unlock restores.
  await page.locator(`[data-lock-layer="${ids.a}"]`).click();
  assert.equal((await layerById(ids.a)).locked, true);
  await select(null);
  const [boxA] = await boundsOf([ids.a]);
  const screenA = await canvasPoint(boxA.x + boxA.w / 2, boxA.y + boxA.h / 2);
  await page.mouse.click(screenA.x, screenA.y);
  assert.notEqual(await page.evaluate(() => selected), ids.a, 'locked artwork is not picked on the canvas');
  await select(ids.a);
  assert.equal(await page.locator('#artboard [data-handle="resize"]').count(), 0, 'no resize handle when locked');
  const before = (await layerById(ids.a)).x;
  await page.keyboard.press('ArrowRight');
  assert.equal((await layerById(ids.a)).x, before, 'locked artwork ignores nudging');
  await page.locator(`[data-lock-layer="${ids.a}"]`).click();
  assert.equal((await layerById(ids.a)).locked, undefined);
  await page.keyboard.press('ArrowRight');
  assert.equal((await layerById(ids.a)).x, before + 1, 'unlocked artwork nudges by 1');

  // Align and distribute three items, then undo.
  await select(ids.a, [ids.a, ids.c, ids.t]);
  const original = await boundsOf([ids.a, ids.c, ids.t]);
  await page.locator('[data-align="top"]').click();
  const tops = (await boundsOf([ids.a, ids.c, ids.t])).map(b => b.y);
  assert(
    tops.every(y => Math.abs(y - tops[0]) < 1e-6),
    'tops aligned: ' + tops
  );
  await page.locator('[data-align="across"]').click();
  const xs = (await boundsOf([ids.a, ids.c, ids.t])).sort((p, q) => p.x - q.x);
  assert(Math.abs(xs[1].x - (xs[0].x + xs[0].w) - (xs[2].x - (xs[1].x + xs[1].w))) < 1e-6, 'equal gaps');
  await page.evaluate(() => {
    actions.undo();
    actions.undo();
  });
  assert.deepEqual(await boundsOf([ids.a, ids.c, ids.t]), original, 'undo restores positions');

  // A single item centres on the car body.
  await select(ids.c);
  await page.locator('[data-align="centre"]').click();
  const [boxC] = await boundsOf([ids.c]);
  const car = await page.evaluate(() => activeView().bounds);
  assert(Math.abs(boxC.x + boxC.w / 2 - (car.x + car.w / 2)) < 1e-6, 'single item centred on the car');

  // Team colours and recent colours.
  await page.locator('[data-swatch="#f3d36a"]').click();
  assert.equal((await layerById(ids.c)).fill, '#f3d36a');
  assert.equal(await page.evaluate(() => store.settings.recentColours[0]), '#f3d36a');
  await page.locator('[data-palette-add]').click();
  assert.deepEqual(await page.evaluate(() => project.palette), ['#f3d36a']);
  await page.locator('[data-swatch="#479b81"]').click();
  await page.locator('[data-team-colour="#f3d36a"]').click();
  assert.equal((await layerById(ids.c)).fill, '#f3d36a', 'team swatch applies its colour');
  await page.locator('[data-palette-add]').click();
  assert.match(await page.locator('#toast').textContent(), /already a team colour/);
  await page.locator('[data-swatch="#479b81"]').click();
  await page.locator('[data-palette-add]').click();
  await page.locator('[data-team-colour="#f3d36a"]').click({ button: 'right' });
  assert.deepEqual(await page.evaluate(() => project.palette), ['#479b81'], 'right-click removes a team colour');

  // Eyedropper fallback: without the system picker, the next canvas click picks.
  await page.evaluate(() => {
    window.EyeDropper = undefined;
  });
  await select(ids.t);
  await page.locator('[data-eyedropper="fill"]').click();
  const [pickFrom] = await boundsOf([ids.c]);
  const screenC = await canvasPoint(pickFrom.x + pickFrom.w / 2, pickFrom.y + pickFrom.h / 2);
  await page.mouse.click(screenC.x, screenC.y);
  assert.equal((await layerById(ids.t)).fill, '#479b81', 'picked the colour of the shape under the cursor');
  assert.equal(await page.evaluate(() => selected), ids.t, 'picking does not change the selection');

  // Packages keep outlines, locks and team colours; restart keeps them too.
  await page.locator(`[data-lock-layer="${ids.a}"]`).click();
  const imported = await page.evaluate(() => validateProject(M.clone(project)));
  const importedLayers = Object.values(imported.views).flat();
  const importedText = importedLayers.find(l => l.kind === 'text');
  assert.deepEqual([importedText.outlineWidth, importedText.outlineColour], [3, '#e5484d']);
  assert.deepEqual(imported.palette, ['#479b81']);
  assert(
    importedLayers.some(l => l.locked),
    'lock survives package validation'
  );
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  const reopened = await page.evaluate(() => ({
    palette: project.palette,
    text: layers().find(l => l.kind === 'text'),
    locked: layers().some(l => l.locked),
    recent: store.settings.recentColours
  }));
  assert.deepEqual(reopened.palette, ['#479b81']);
  assert.equal(reopened.text.outlineWidth, 3);
  assert(reopened.locked);
  assert(reopened.recent.includes('#f3d36a'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: outlines, layer lock, align/distribute, eyedropper fallback, team/recent colours, packages and restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
