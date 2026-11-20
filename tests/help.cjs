// Help on the spot: Help here (F1, the Help button) follows the page and the selection, does
// things or points at them; the Paint Studio and Garage tours walk over the real controls; the
// keyboard sheet (?) lists the keys the app really has; the version comes from the app; an open
// drawer stays open after a restart.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-help-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `help-${name}.png`) });
const sub = () => page.locator('#help-drawer .hp-title small').innerText();
const items = () => page.locator('#help-drawer [data-help-do]').allInnerTexts();
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
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await launch();
  assert.equal(await page.locator('#help-drawer').isVisible(), false);

  // F1 on the welcome screen: what to do first. The version comes from the app.
  await page.keyboard.press('F1');
  await page.waitForSelector('#help-drawer:not([hidden])');
  assert.match(await sub(), /^Start/);
  assert((await items()).includes('Try the sample car'));
  await page.waitForFunction(v => document.querySelector('#help-drawer .hp-foot').textContent.includes(v), version);
  assert.equal(await page.locator('#app-menu .version').textContent(), 'v' + version);
  assert.equal(await page.locator('#help-button').getAttribute('aria-pressed'), 'true');
  // The page makes room for the drawer.
  const [main, drawer] = await page.evaluate(() => [
    document.querySelector('.workspace').getBoundingClientRect().right,
    document.querySelector('#help-drawer').getBoundingClientRect().left
  ]);
  assert(main <= drawer + 1, 'the page ends where the drawer starts');

  // An item that does something: the sample car opens the guided setup, and Help follows.
  await page.locator('#help-drawer [data-help-do]', { hasText: 'Try the sample car' }).click();
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.waitForFunction(() =>
    /Add a car · Step 3 of 5/.test(document.querySelector('#help-drawer small').textContent)
  );
  await shot('setup');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.waitForFunction(() => /Nothing selected/.test(document.querySelector('#help-drawer small').textContent));
  assert((await items()).includes('Make the Print pack'));
  assert(!(await items()).some(x => /livery colour/.test(x)), 'no livery colours yet: nothing to paint with');

  // Text selected: the drawer changes, and an item points at the control.
  await page.evaluate(() => {
    const t = M.layer('text', { name: 'Race number', text: '27', x: 560, y: 260, w: 80, h: 60, fill: '#1f2730' });
    mutate(() => project.views[currentView].push(t));
    selected = t.id;
    multiSelected.clear();
    render();
  });
  await page.waitForFunction(() => /Text or a number/.test(document.querySelector('#help-drawer small').textContent));
  await page.locator('#help-drawer [data-help-do]', { hasText: 'Take the text from the entries' }).click();
  assert.equal(await page.locator('#help-tour .ht-count').innerText(), 'HERE');
  const [ring, control] = await page.evaluate(() => [
    document.querySelector('#help-tour .ht-ring').getBoundingClientRect().toJSON(),
    document.querySelector('[data-text-from]').getBoundingClientRect().toJSON()
  ]);
  assert(
    Math.abs(ring.top + 4 - control.top) < 2 && Math.abs(ring.left + 4 - control.left) < 2,
    'the mark is on the control'
  );
  await shot('point');
  // Esc ends the mark only: the selection stays.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-tour').isVisible(), false);
  assert(await page.evaluate(() => !!selection()), 'Esc for the tour does not let go of the selection');

  // The Paint Studio tour: steps over real controls, Back and Next, arrows, Done.
  await page.evaluate(() => {
    selected = null;
    render();
  });
  await page.locator('[data-help-tour="studio"]').click();
  assert.match(await page.locator('#help-tour .ht-count').innerText(), /TOUR · 1 OF \d/);
  assert.equal(await page.locator('#ht-title').innerText(), 'Tools');
  const total = Number((await page.locator('#help-tour .ht-count').innerText()).match(/OF (\d+)/)[1]);
  assert(total >= 7, 'the studio tour has its steps');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#ht-title').innerText(), 'Layers');
  await page.locator('[data-tour-back]').click();
  assert.equal(await page.locator('#ht-title').innerText(), 'Tools');
  for (let i = 1; i < total; i++) await page.locator('[data-tour-next]').click();
  assert.equal(await page.locator('[data-tour-next]').innerText(), 'Done');
  await shot('tour-last');
  await page.locator('[data-tour-next]').click();
  assert.equal(await page.locator('#help-tour').isVisible(), false);

  // The keyboard sheet: ?, Esc; not while typing; every tool key the toolbox names is listed.
  await page.keyboard.press('?');
  assert(await page.locator('#help-keys .hk-sheet').isVisible());
  const listed = await page.locator('#help-keys section').first().locator('kbd').allInnerTexts();
  const toolKeys = await page.evaluate(() =>
    [...document.querySelectorAll('#tools button')].map(b => (b.title.match(/\(([A-Z])\)$/) || [])[1]).filter(Boolean)
  );
  assert.deepEqual([...toolKeys].sort(), [...listed].sort(), 'the sheet lists the toolbox keys');
  await shot('keys');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-keys').isVisible(), false);
  await page.locator('#help-drawer [data-help-keys]').click();
  assert(await page.locator('#help-keys .hk-sheet').isVisible(), 'All keys opens the sheet');
  await page.locator('[data-keys-close]').click();
  await page.locator('#layer-name').count();
  await page.evaluate(() => {
    selected = layers()[0].id;
    render();
  });
  await page.locator('#layer-name').focus();
  await page.keyboard.press('?');
  assert.equal(await page.locator('#help-keys').isVisible(), false, 'typing ? in a field types it');
  await page.locator('#layer-name').blur();

  // The Garage: its own help and tour.
  await page.evaluate(() => actions.projects());
  await page.waitForFunction(() => /^Garage/.test(document.querySelector('#help-drawer small').textContent));
  await page.locator('[data-help-tour="garage"]').click();
  assert.equal(await page.locator('#ht-title').innerText(), 'Sections');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#garage-page').isVisible(), true, 'Esc ends the tour, not the Garage');
  await page.evaluate(() => actions.studio());

  // An open drawer stays open after a restart; F1 closes it.
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  await page.waitForSelector('#help-drawer:not([hidden])');
  await page.keyboard.press('F1');
  assert.equal(await page.locator('#help-drawer').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: help: drawer per page and selection, do and point, tours, keyboard sheet, version, restart.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
