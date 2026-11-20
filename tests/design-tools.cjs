// Phase 4 design tools: text bend/spacing, shadows, rulers and guides, smart
// snapping, grouped presets, mirroring a whole side and the side-by-side pane.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-design-' + Date.now());
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
  await require('./inspector-helpers.cjs').openPropertyFolders(page);
}
const click = action => clickAction(page, action);
const screen = (x, y) =>
  page.evaluate(([x, y]) => new DOMPoint(x, y).matrixTransform(art.getScreenCTM()).toJSON(), [x, y]);
const layerById = id => page.evaluate(id => layers().find(l => l.id === id), id);
async function prepareCurrentView() {
  await require('./inspector-helpers.cjs').clickAction(page, 'close-dialog');
  await click('generate-regions');
  await click('finish-preparation');
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();
  await page.evaluate(() => (store.settings = { ...store.settings, showHints: false }));
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  await prepareCurrentView();
  // Add the right view through the normal Add view path.
  await page.evaluate(async () => {
    addCarDialog('right');
    pendingAdd = { ...pendingAdd, kind: 'svg', key: 'right', name: project.template.name, scale: '1:32' };
    await importCar(new File([window.SAMPLE_CAR_SVG], 'right.svg', { type: 'image/svg+xml' }));
  });
  await page.waitForFunction(() => currentView === 'right' && preparing);
  await prepareCurrentView();
  await page.locator('[data-view="left"]').first().click();
  await page.waitForFunction(() => currentView === 'left' && !preparing);

  // Text: bend, letter spacing, shadow.
  const textId = await page.evaluate(() => {
    const b = activeView().bounds,
      t = M.layer('text', { name: 'Sponsor', text: 'LIVERY', x: b.x + 60, y: b.y + b.h * 0.6, w: 160, h: 40 });
    project.views[currentView].push(t);
    selected = t.id;
    changed();
    render();
    return t.id;
  });
  await page.locator('#text-bend').evaluate(el => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal((await layerById(textId)).textBend, 0.4);
  assert(
    (await page.locator(`#artboard [data-layer="${textId}"]`).evaluate(el => el.outerHTML)).includes('<textPath'),
    'bent text follows a path'
  );
  await page.evaluate(() => actions.undo());
  assert.equal((await layerById(textId)).textBend, undefined, 'one undo step per bend drag');
  await page.evaluate(id => {
    actions.redo();
    selected = id;
    render();
  }, textId);
  await page.locator('[data-text-fit="space"]').click();
  assert.equal((await layerById(textId)).textFit, 'space');
  assert.match(
    await page.locator(`#artboard [data-layer="${textId}"]`).evaluate(el => el.outerHTML),
    /lengthAdjust="spacing"/
  );
  await page.locator('#shadow-x').fill('3');
  await page.locator('#shadow-x').dispatchEvent('change');
  await page.locator('#shadow-y').fill('2');
  await page.locator('#shadow-y').dispatchEvent('change');
  const shadowed = await layerById(textId);
  assert.deepEqual([shadowed.shadowX, shadowed.shadowY, shadowed.shadowColour], [3, 2, '#000000']);
  assert.match(
    await page.locator(`#artboard [data-layer="${textId}"]`).evaluate(el => el.outerHTML),
    /translate\(3 2\)/
  );

  // Rulers and guides: drag one out of the top ruler, then back to remove it.
  await page.locator('#rulers').check();
  assert(await page.locator('#ruler-top').isVisible());
  const ruler = await page.locator('#ruler-top').boundingBox();
  const target = await screen(500, 300);
  await page.mouse.move(target.x, ruler.y + 9);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  const guides = await page.evaluate(() => project.guides.left.y);
  assert.equal(guides.length, 1);
  assert(Math.abs(guides[0] - 300) < 2, 'guide placed where it was dropped: ' + guides[0]);
  const guideLine = await screen(700, guides[0]);
  await page.mouse.move(guideLine.x, guideLine.y);
  await page.mouse.down();
  await page.mouse.move(guideLine.x, ruler.y + 9, { steps: 6 });
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => project.guides.left.y), [], 'dropping on the ruler removes it');

  // Smart snapping: a dragged shape snaps its centre to the car's centre line.
  const boxId = await page.evaluate(() => {
    const b = activeView().bounds,
      r = M.layer('rect', { name: 'Snap me', x: b.x + 40, y: b.y + b.h * 0.3, w: 50, h: 20 });
    project.views[currentView].push(r);
    selected = r.id;
    changed();
    render();
    return r.id;
  });
  await page.locator('#snap').check();
  const before = await page.evaluate(id => M.artworkBounds([layers().find(l => l.id === id)]), boxId),
    car = await page.evaluate(() => activeView().bounds);
  const grab = await screen(before.x + before.w / 2, before.y + before.h / 2),
    drop = await screen(car.x + car.w / 2 + 3, before.y + before.h / 2 + 37);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 8 });
  assert(await page.locator('#artboard .snap-line').count(), 'a snap line shows while dragging');
  await page.mouse.up();
  const after = await page.evaluate(id => M.artworkBounds([layers().find(l => l.id === id)]), boxId);
  assert(Math.abs(after.x + after.w / 2 - (car.x + car.w / 2)) < 1e-6, 'centre snapped to the car centre line');
  assert.equal(await page.locator('#artboard .snap-line').count(), 0, 'snap lines clear on release');
  await page.locator('#snap').uncheck();

  // Grouped presets.
  for (const [preset, name, count] of [
    ['number-board', 'Number board', 2],
    ['number-roundel', 'Number roundel', 2],
    ['chequers', 'Chequered band', 16]
  ]) {
    await page.evaluate(() => {
      selected = null;
      multiSelected.clear();
      render();
    });
    await click('shapes');
    await page.locator(`[data-preset="${preset}"]`).click();
    const group = await page.evaluate(() => artworkSelection().map(l => l.groupName));
    assert.equal(group.length, count, preset + ' parts');
    assert(
      group.every(n => n === name),
      preset + ' is one group'
    );
  }
  await page.evaluate(() => {
    selected = null;
    render();
  });
  await click('shapes');
  await page.locator('[data-preset="star"]').click();
  assert.equal(await page.evaluate(() => selection().points.length), 10);

  // Mirror the whole left side onto the right view.
  const leftLayers = await page.evaluate(() => layers().length);
  await page.evaluate(() => actions['mirror-view']());
  await page.locator('#mirror-apply').click();
  const mirrored = await page.evaluate(() => ({
    view: currentView,
    count: project.views.right.length,
    groups: new Set(project.views.right.filter(l => l.groupId).map(l => l.groupId)).size,
    linked: project.views.right.every(l => l.pairLink && l.pairMode === 'mirror'),
    text: project.views.right.find(l => l.name === 'Sponsor')
  }));
  assert.deepEqual([mirrored.view, mirrored.count, mirrored.groups], ['left', leftLayers, 3]);
  assert(mirrored.linked, 'every layer is on both sides, kept in step');
  assert.equal(mirrored.text.shadowX, -3, 'shadow mirrored');
  assert.equal(mirrored.text.textBend, 0.4, 'text stays readable and keeps its bend');
  await page.evaluate(() => actions.undo());
  assert.equal(await page.evaluate(() => project.views.right.length), 0, 'undo removes the mirrored copy');
  await page.evaluate(() => actions.redo());

  // The pair: the other side, live, next to the canvas; clicking it works on that side.
  await page.locator('#pair-switch [data-pair="left:right"]').click();
  assert(await page.locator('#compare-pane').isVisible());
  assert(await page.locator('#compare-pane .compare-art svg').count());
  await page.locator('#compare-pane .compare-art').click({ position: { x: 20, y: 60 } });
  assert.equal(await page.evaluate(() => currentView), 'right', 'a click works on the other side');
  await page.locator('#compare-pane .compare-art').click({ position: { x: 20, y: 60 } });
  assert.equal(await page.evaluate(() => currentView), 'left');

  // Guides travel in packages and survive a restart, as do the new text fields.
  await page.evaluate(() => {
    project.guides = { left: { x: [123], y: [45] } };
    changed();
  });
  const imported = await page.evaluate(() => validateProject(M.clone(project)));
  assert.deepEqual(imported.guides, { left: { x: [123], y: [45] } });
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  const reopened = await page.evaluate(() => ({
    guides: project.guides,
    text: project.views.left.find(l => l.name === 'Sponsor'),
    rulers: $('#rulers').checked,
    compare: !$('#compare-pane').hidden
  }));
  assert.deepEqual(reopened.guides, { left: { x: [123], y: [45] } });
  assert.deepEqual([reopened.text.textBend, reopened.text.textFit, reopened.text.shadowX], [0.4, 'space', 3]);
  assert(reopened.rulers && reopened.compare, 'rulers and side by side are remembered');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: text bend/spacing, shadows, rulers and guides, smart snapping, grouped presets, whole-side mirror, side by side, packages and restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
