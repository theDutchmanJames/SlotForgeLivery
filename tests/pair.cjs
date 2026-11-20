// The pair: Left + Right next to each other, both worked on by a click, Left always on the left;
// a layer put on the other side (mirrored or the same) stays in step in one undo step; a copy on
// its own and "this side only"; the spine dots, the guide, Layers ⇄, Put it on another side,
// Everything on both sides; duplicates and deletes let go of the link; packages and restart.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-pair-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `pair-${name}.png`) });
const side = k => page.evaluate(k => project.views[k].map(l => ({ ...l })), k);
const find = (k, name) => page.evaluate(([k, name]) => project.views[k].find(l => l.name === name), [k, name]);
const select = name =>
  page.evaluate(name => {
    selected = layers().find(l => l.name === name).id;
    multiSelected.clear();
    render();
  }, name);
async function pop(mode) {
  await page.waitForFunction(() => document.querySelector('.pair-dot.picked'));
  await page.locator('.pair-dot.picked').click();
  await page.locator(`#pair-pop input[value="${mode}"]`).check();
  await page.locator('#pair-apply').click();
  assert.equal(await page.locator('#pair-pop').count(), 0);
}
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
  await page.waitForSelector('#tools button');
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
  await page.evaluate(() => {
    setPreference('showHints', false);
    mutate(() => {
      project.template.views.right = M.clone(project.template.views.left);
      project.views.right = [];
      activeView().realWidthMm = 138;
      project.views.left.push(
        M.layer('rect', { name: 'Stripe', x: 120, y: 330, w: 300, h: 30, fill: '#f28a35' }),
        M.layer('text', { name: 'Number', text: '27', x: 570, y: 265, w: 70, h: 60, fill: '#1f2730' })
      );
    });
  });

  // One side by default; Left + Right puts the Right next to the canvas, Left on the left.
  assert.equal(await page.locator('#compare-pane').isVisible(), false);
  await page.locator('#pair-switch [data-pair="left:right"]').click();
  assert(await page.locator('#compare-pane .compare-art svg').isVisible());
  assert.equal(await page.locator('#pair-label').isVisible(), true);
  const order = () => page.evaluate(() => getComputedStyle($('#canvas-wrap')).order);
  assert.equal(await order(), '1', 'the Left is on the left');
  const [canvas, pane] = await page.evaluate(() => [
    $('#canvas-wrap').getBoundingClientRect().width,
    $('#compare-pane').getBoundingClientRect().width
  ]);
  assert(Math.abs(canvas - pane) < 3, 'both sides have the same size');

  // A layer only on the Left gets a hollow dot; put it on the Right, mirrored and in step.
  await select('Stripe');
  await page.waitForFunction(() => document.querySelector('.pair-dot.picked:not(.on)'));
  await pop('mirror');
  let [l, r] = [await find('left', 'Stripe'), await find('right', 'Stripe')];
  assert(l.pairLink && l.pairLink === r.pairLink && r.pairMode === 'mirror');
  const expected = await page.evaluate(() => {
    const b = project.template.views.left.bounds,
      s = layers().find(l => l.name === 'Stripe');
    return M.mirrorView([s], b, b)[0].x;
  });
  assert.equal(Math.round(r.x), Math.round(expected), 'mirrored onto the other side');
  assert(await page.locator('.pair-dot.on').count(), 'the spine shows the linked layer');
  assert((await page.locator('#pair-marks .pair-guide').count()) === 2, 'a guide on both sides');
  assert(await page.locator('[data-pair-open]').count(), 'Layers shows ⇄');
  await shot('linked');

  // Change it on the Left: the Right follows, in one undo step.
  await page.evaluate(() => mutate(() => (layers().find(l => l.name === 'Stripe').y -= 40)));
  assert.equal(Math.round((await find('right', 'Stripe')).y), 290);
  await page.evaluate(() => actions.undo());
  assert.equal(Math.round((await find('right', 'Stripe')).y), 330, 'undo takes both back');
  await page.evaluate(() => actions.redo());

  // The same, in step: same place, not mirrored.
  await select('Stripe');
  await pop('same');
  [l, r] = [await find('left', 'Stripe'), await find('right', 'Stripe')];
  assert.equal(r.pairMode, 'same');
  assert.equal(Math.round(r.x), Math.round(l.x));

  // Work on the Right by clicking it: it moves to the canvas but stays on the right.
  await page.locator('#compare-pane .compare-art').click({ position: { x: 20, y: 60 } });
  assert.equal(await page.evaluate(() => currentView), 'right');
  assert.equal(await order(), '3', 'the Right stays on the right');
  await page.evaluate(() => mutate(() => (layers().find(l => l.name === 'Stripe').fill = '#3ecf8e')));
  assert.equal((await find('left', 'Stripe')).fill, '#3ecf8e', 'an edit on the Right goes to the Left');
  // A click on a layer of the other side selects it there.
  const hit = await page.evaluate(() => {
    const el = $('#compare-pane [data-layer]'),
      b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, id: el.dataset.layer };
  });
  await page.mouse.click(hit.x, hit.y);
  assert.equal(await page.evaluate(() => currentView), 'left');
  assert.equal(await page.evaluate(() => selected), hit.id, 'the clicked layer is selected');

  // A copy on its own: not linked any more.
  await select('Stripe');
  await pop('copy');
  assert.equal((await find('left', 'Stripe')).pairLink, undefined);
  assert.equal((await find('right', 'Stripe')).pairLink, undefined);
  await page.evaluate(() => mutate(() => (layers().find(l => l.name === 'Stripe').y = 100)));
  assert.notEqual(Math.round((await find('right', 'Stripe')).y), 100);
  // This side only: the copy on the Right is removed.
  await select('Stripe');
  await pop('mirror');
  assert.equal((await side('right')).filter(x => x.name === 'Stripe').length, 2, 'the copy on its own stays');
  await select('Stripe');
  await pop('only');
  assert.equal(
    (await side('right')).filter(x => x.name === 'Stripe' && x.pairLink).length,
    0,
    'the linked one is gone'
  );
  assert.equal((await side('right')).filter(x => x.name === 'Stripe').length, 1);
  assert.equal((await find('left', 'Stripe')).pairLink, undefined);

  // Put it on another side (the dialog), the text stays readable.
  await select('Number');
  await page.evaluate(() => actions['copy-view']());
  await page.locator('#copy-target').selectOption('right');
  assert.equal(await page.locator('[name="copy-mode"]:checked').inputValue(), 'mirror');
  await page.locator('#copy-apply').click();
  const num = await find('right', 'Number');
  assert.equal(num.text, '27');
  assert.equal(num.rotation, 0, 'text is not flipped');
  // Duplicating a linked layer lets go of the link for the copy; deleting one side keeps the other.
  await select('Number');
  await page.evaluate(() => actions.duplicate());
  assert.equal((await side('left')).filter(x => x.pairLink).length, 1);
  await page.evaluate(() => {
    currentView = 'right';
    resetViewSelection();
    selected = layers().find(l => l.name === 'Number').id;
    render();
    actions.delete();
    currentView = 'left';
    resetViewSelection();
    render();
  });
  assert.equal((await side('left')).filter(x => x.name.startsWith('Number')).length, 2, 'the Left keeps its number');
  assert.equal(
    (await side('left')).some(x => x.pairLink),
    false,
    'nothing linked to a deleted layer'
  );

  // Everything on both sides, from the other side's header.
  await page.locator('#compare-pane [data-action="mirror-view"]').click();
  await page.locator('#mirror-apply').click();
  const [left, right] = [await side('left'), await side('right')];
  assert.equal(right.length, left.length);
  assert(
    left.every(x => right.some(y => y.pairLink === x.pairLink)),
    'every layer is linked'
  );
  await shot('everything');

  // Packages and a restart keep the links and the pair.
  const imported = await page.evaluate(() => validateProject(M.clone(project)));
  assert.equal(imported.views.right.filter(x => x.pairLink).length, right.length);
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  assert(await page.locator('#compare-pane').isVisible(), 'the pair is remembered');
  await page.evaluate(() => mutate(() => (layers()[0].x += 10)));
  const [a, b] = [await side('left'), await side('right')];
  assert.equal(b.find(x => x.pairLink === a[0].pairLink).pairMode, 'mirror');
  await page.locator('#pair-switch [data-pair="off"]').click();
  assert.equal(await page.locator('#compare-pane').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: pair: two sides, click to work, in step (mirror, same), copy, only, guide, dialog, everything, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
