// The Workbench layout of the Paint Studio: the app menu and the Print & export
// menu, the Layers column, the view tabs, the Selection and Workshop tabs, the
// quick bar over a selection and the right-click menu.
const path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const click = action => clickAction(page, action);
const visible = selector => page.locator(selector).isVisible();
const shot = async name => shots && page.screenshot({ path: path.join(shots, `workbench-${name}.png`) });

async function run() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: path.join(out, 'profile-workbench-' + Date.now()) };
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

  // Welcome: no project parts, no Layers column, no tabs.
  assert.equal(await visible('#layers-panel'), false);
  assert.equal(await visible('.inspector-tabs'), false);
  assert.equal(await visible('#view-strip'), false);
  assert.equal(await visible('#export-button'), false);

  // The app menu: opens, moves with the arrow keys, closes with Escape and on an outside click.
  await page.locator('#app-menu-button').click();
  assert.equal(await page.locator('#app-menu-button').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await page.locator('#app-menu > button').allInnerTexts(), [
    'Garage',
    'Add a car',
    'Import & Export',
    'Settings',
    'Help & shortcuts'
  ]);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'projects');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'add-car');
  await page.keyboard.press('Escape');
  assert.equal(await visible('#app-menu'), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'app-menu-button');
  await page.locator('#app-menu-button').click();
  await page.mouse.click(700, 500);
  assert.equal(await visible('#app-menu'), false, 'an outside click closes the menu');
  // A menu item runs its action and closes the menu.
  await page.locator('#app-menu-button').click();
  await page.locator('#app-menu [data-action="help"]').click();
  assert.equal(await page.locator('#dialog').getAttribute('class'), 'help-dialog');
  assert.equal(await visible('#app-menu'), false);
  await click('close-dialog');

  // A prepared car: Layers on the left, view tabs above the canvas, both inspector tabs.
  await click('sample-car');
  await page.waitForFunction(() => project && preparing && activeView()?.vectorSource);
  await click('close-dialog');
  assert.equal(await visible('#layers-panel'), false, 'no Layers column while preparing');
  assert.equal(await visible('.inspector-tabs'), false);
  await click('generate-regions');
  await click('finish-preparation');
  assert(await visible('#layers-panel .layer-list'));
  assert.equal(await page.locator('#layers-panel .lp-view').innerText(), 'Left view');
  assert(await visible('.inspector-tabs'));
  assert.deepEqual(await page.locator('#view-strip .view-tab').evaluateAll(t => t.map(b => b.dataset.view)), ['left']);
  assert.deepEqual(await page.locator('#view-strip .view-ghost').evaluateAll(t => t.map(b => b.dataset.view)), [
    'front',
    'top',
    'right',
    'rear',
    'angled'
  ]);
  assert.equal(await page.locator('#view-strip .view-tab').getAttribute('aria-current'), 'true');
  assert.equal(await page.locator('#project-meta').innerText(), 'Sample coupe · 1:32');

  // Team colours show in the Layers column and paint the selection.
  await page.evaluate(() => {
    project.palette = ['#f28a35'];
    render();
  });
  await page.locator('[data-layer-team="#f28a35"]').click();
  assert.equal(await page.evaluate(() => project.base), '#f28a35', 'a team colour paints the base');

  // Workshop tab: everything about the whole livery.
  await page.locator('[data-inspector-tab="workshop"]').click();
  assert(await visible('#workshop-panel #real-width'));
  assert.equal(await visible('#inspector'), false);
  assert(await visible('#workshop-panel [data-action="mirror-view"]'));
  assert((await page.locator('#workshop-panel .ws-paint:not(.ws-colour)').count()) >= 1);
  assert.match(await page.locator('#workshop-panel .ws-paint:not(.ws-colour)').first().innerText(), /#F28A35|lightest/);
  await page.locator('#real-width').fill('142');
  await page.locator('#real-width').dispatchEvent('change');
  assert(await page.evaluate(() => M.mmPerUnit(activeView()) > 0));
  assert.match(await page.locator('#workshop-panel .ws-pill').innerText(), /millimetres/);
  await shot('workshop');
  await page.locator('#tab-workshop').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#tab-selection').getAttribute('aria-selected'), 'true');
  assert(await visible('#inspector'));

  // Choosing something to paint brings the Selection tab back.
  await page.locator('[data-inspector-tab="workshop"]').click();
  await click('shapes');
  await page.locator('[data-preset="number-roundel"]').click();
  assert.equal(await page.locator('#tab-selection').getAttribute('aria-selected'), 'true');

  // Quick bar over the selection.
  assert(await visible('#quick-bar'));
  assert.equal(await page.locator('#quick-bar .qb-name').innerText(), 'Number roundel');
  const bar = await page.locator('#quick-bar').boundingBox(),
    wrap = await page.locator('#canvas-wrap').boundingBox();
  assert(bar.x >= wrap.x && bar.x + bar.width <= wrap.x + wrap.width && bar.y >= wrap.y, 'quick bar inside the canvas');
  const count = await page.evaluate(() => layers().length);
  await page.locator('#quick-bar [data-action="duplicate"]').click();
  assert.equal(await page.evaluate(() => layers().length), count * 2, 'duplicate from the quick bar');
  await click('undo');
  assert.equal(await page.evaluate(() => layers().length), count);
  await shot('quick-bar');

  // Right-click menu on the artwork, then on empty paint.
  const roundel = await page.evaluate(() => {
    const r = document.querySelector('#artboard [data-layer]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(roundel.x, roundel.y, { button: 'right' });
  assert(await visible('#context-menu'));
  assert(await page.locator('#context-menu [data-action="delete"]').isVisible());
  await shot('context-menu');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#context-menu').count(), 0);
  await page.mouse.click(roundel.x, roundel.y, { button: 'right' });
  await page.locator('#context-menu [data-action="save-asset"]').click();
  assert.equal(await page.locator('#context-menu').count(), 0, 'the menu closes after an action');
  if (await page.locator('#dialog[open]').count()) await click('close-dialog');
  // A layer row has the same menu.
  await page.locator('#layers-panel [data-art-group]').first().click({ button: 'right' });
  assert(await page.locator('#context-menu [data-action="layer-back"]').isVisible());
  await page.locator('#context-menu [data-action="delete"]').click();
  assert.equal(await page.evaluate(() => layers().length), 0, 'delete from the right-click menu');
  assert.equal(await visible('#quick-bar'), false, 'no quick bar without a selection');
  await click('undo');

  // Print & export menu.
  await page.locator('#export-button').click();
  assert.deepEqual(await page.locator('#export-menu > button b').allInnerTexts(), [
    'Workshop plan',
    'Print at true size',
    'Picture',
    'Decals',
    'Share this project'
  ]);
  await page.locator('#export-menu [data-action="png"]').click();
  assert(await page.locator('#png-save').isVisible());
  await click('close-dialog');

  // Status bar toggles stay real checkboxes.
  await page.locator('#rulers').check();
  assert(await visible('#ruler-top'));
  await page.locator('#rulers').uncheck();

  // Settings: the crumb says where you are; the menu leads back.
  await click('settings');
  assert(await visible('#settings-crumb'));
  assert.equal(await visible('#project-name'), false);
  await page.locator('#settings-back').click();
  assert(await visible('#project-name'));

  // A narrow window keeps everything inside.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1050, 720));
  await page.waitForTimeout(200);
  for (const selector of ['#app-menu-button', '#export-button', '#layers-panel', '.inspector-tabs', '#zoom-controls'])
    assert(
      await page.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.x >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
      }),
      selector + ' fits a 1050 × 720 window'
    );
  await shot('narrow');
  assert.deepEqual(errors, []);
  console.log('PASS: menus, Layers column, view tabs, Selection and Workshop tabs, quick bar, right-click menu.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
