// The Start page: shown whenever no livery is open, instead of the empty Paint Studio. First time:
// how to start, a drawing dropped on it starts Add a car with that file. Coming back (≡ → Start
// page): the last livery with what is left to do, a new livery on a car, the other recent ones.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-start-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `start-${name}.png`) });
const startVisible = () => page.locator('#start-page').isVisible();
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
  await page.waitForSelector('#start-page .st-home');
}
// Drops a file on the Start page the way the system does.
const drop = (name, text) =>
  page.evaluate(
    ([name, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text === 'SAMPLE' ? window.SAMPLE_CAR_SVG : text], name));
      const target = document.querySelector('#start-drop') || document.querySelector('#start-page');
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      const over = target.id !== 'start-drop' || target.classList.contains('over');
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return over;
    },
    [name, text]
  );

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();

  // First time: a page of its own, no empty tools.
  assert(await startVisible());
  assert.equal(await page.locator('.workspace').isVisible(), false, 'the Paint Studio is out of the way');
  assert.equal(await page.locator('#start-page .st-start').count(), 3);
  assert.equal(await page.locator('#start-page .st-cont').count(), 0);
  await shot('first');

  // Files dropped on it: a decal sheet needs a livery; a drawing starts Add a car with that file.
  await drop('logos.sfdecal', '{}');
  await page.waitForFunction(() => /Open a livery first/.test(document.querySelector('#toast').textContent));
  assert(await drop('my_porsche-911.svg', 'SAMPLE'), 'the drop area lights up');
  await page.waitForSelector('#dialog[open] .st-dropped');
  assert.equal(await page.locator('#car-name').inputValue(), 'my porsche 911');
  assert.equal(await page.locator('#choose-photo').isDisabled(), true, 'a drawing is not a photo');
  await page.locator('#dialog [data-action="close-dialog"]').first().click();
  assert(await startVisible());
  // Add a car the normal way does not keep a file dropped before.
  await page.locator('#start-page .st-hero-text [data-action="add-car"]').click();
  assert.equal(await page.locator('#dialog .st-dropped').count(), 0);
  assert.equal(await page.evaluate(() => startDropped), null);
  await page.locator('#dialog [data-action="close-dialog"]').first().click();

  // The sample car, then back to the Start page from the menu.
  await page.locator('#start-page .st-sample-note [data-action="sample-car"]').click();
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.evaluate(() =>
    mutate(() => {
      project.name = 'Gulf tribute';
      project.liveryColours = [
        { name: 'Gulf blue', hex: '#7fb7e2', ref: 'Tamiya X-14' },
        { name: 'Gulf orange', hex: '#f28a35' }
      ];
    })
  );
  assert.equal(await startVisible(), false);
  await clickAction(page, 'start-page');
  await page.waitForFunction(() => document.querySelector('#start-page .st-todo'));
  assert.equal(await page.evaluate(() => project), null, 'the livery is closed');
  assert.match(await page.locator('#start-page .st-cont-body b').innerText(), /Gulf tribute/);
  const todo = await page.locator('#start-page .st-todo .st-grow').allInnerTexts();
  assert.deepEqual(todo, [
    'Choose real paints for Gulf orange',
    'Set the real size of the Left view',
    'Make the Print pack'
  ]);
  assert.match(await page.locator('#start-page .st-chips').innerText(), /1 colour without a paint/);
  assert.equal(await page.locator('#start-page [data-start-new]').count(), 1, 'a new livery on the sample car');
  await shot('back');

  // A to-do opens the livery where it is done.
  await page.locator('[data-start-todo^="size:"]').click();
  await page.waitForFunction(() => project?.name === 'Gulf tribute');
  assert(await page.locator('#workshop-panel').isVisible(), 'the Workshop tab, with the real size');
  assert(await page.locator('#real-width').isVisible());

  // A new livery on a car from the Start page.
  await clickAction(page, 'start-page');
  await page.waitForSelector('#start-page [data-start-new]');
  const before = await page.evaluate(() => store.projects.length);
  await page.locator('#start-page [data-start-new]').click();
  await page.waitForFunction(n => store.projects.length === n + 1 && project, before);

  // Recent liveries, and the Garage: closing it with no livery open comes back here.
  await clickAction(page, 'start-page');
  await page.waitForSelector('#start-page .st-recent');
  assert.equal(await page.locator('#start-page .st-recent [data-project-open]').count(), 1);
  await page.locator('#start-page .st-all').click();
  assert(await page.locator('#garage-page').isVisible());
  assert.equal(await startVisible(), false);
  await page.evaluate(() => actions.studio());
  await page.waitForFunction(() => !document.querySelector('#start-page').hidden);
  await page.locator('#start-page .st-cont-body [data-project-open]').click();
  await page.waitForFunction(() => !!project);
  assert.equal(await startVisible(), false);

  // A dropped drawing goes straight into the guided setup, without a file picker.
  await clickAction(page, 'start-page');
  await page.waitForSelector('#start-page .st-home');
  await drop('Porsche 917K.svg', 'SAMPLE');
  await page.waitForSelector('#dialog[open] .st-dropped');
  await page.locator('#choose-svg').click();
  await page.waitForSelector('#setup-page:not([hidden])');
  assert.equal(await startVisible(), false);
  assert.equal(await page.evaluate(() => project.template.name), 'Porsche 917K', 'named after the file');
  assert.deepEqual(errors, []);
  console.log('PASS: start: first time, drops, back from the menu, to-dos, new livery, recent, Garage.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
