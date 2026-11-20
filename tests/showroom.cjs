// The Showroom: nine stock cars with four prepared views, reached from the Start page, Add a car
// and the ≡ menu; filter by kind; a car's views; Start painting makes a livery straight away on
// the Left side; the car goes into the Garage once per scale and is used again; Esc and Back.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-showroom-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `showroom-${name}.png`) });
const open = () => page.locator('#show-page').isVisible();
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
async function paint(key, scale) {
  await page.locator(`[data-show-pick="${key}"]`).click();
  await page.locator('#show-scale').selectOption(scale);
  await page.locator('#show-start').click();
  await page.waitForFunction(() => project && !document.body.classList.contains('show-open'));
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  await launch();

  // From the Start page: nine cars, the stock car bundle is loaded only now.
  assert.equal(await page.evaluate(() => !!window.STOCK_CARS), false, 'not loaded at start');
  await page.locator('#start-page .st-hero-text [data-action="showroom"]').click();
  await page.waitForSelector('.sr-card');
  assert.equal(await page.locator('.sr-card').count(), 9);
  assert.equal(await page.locator('#start-page').isVisible(), false);
  assert.equal(await page.locator('#show-crumb').isVisible(), true);
  // Filter by kind, choose a car: its views and panels.
  await page.locator('[data-show-kind="formula"]').click();
  assert.equal(await page.locator('.sr-card').count(), 2);
  await page.locator('[data-show-pick="modern-formula"]').click();
  assert.match(await page.locator('.sr-title h2').innerText(), /Modern Formula/i);
  assert.equal(await page.locator('.sr-views .sr-img').count(), 3, 'left, right and top');
  await shot('formula');
  // Esc goes back to the Start page.
  await page.keyboard.press('Escape');
  assert.equal(await open(), false);
  assert(await page.locator('#start-page').isVisible());

  // From Add a car.
  await page.locator('#start-page .st-hero-text [data-action="add-car"]').click();
  await page.locator('#dialog [data-action="showroom"]').click();
  await page.waitForSelector('.sr-card');
  assert.equal(await page.locator('#dialog[open]').count(), 0, 'the Add a car window closes');

  // Start painting: a livery with four prepared views, on the Left side, at the chosen scale.
  await page.locator('[data-show-kind="all"]').click();
  await page.locator('[data-show-pick="gt3"]').click();
  await page.locator('#show-name').fill('Gulf GT3');
  await paint('gt3', '1:24');
  const made = await page.evaluate(() => ({
    name: project.name,
    scale: project.template.scale,
    view: currentView,
    views: Object.keys(project.template.views).sort(),
    painted: Object.values(project.template.views).every(v => v.regions.some(r => r.role === 'body')),
    cars: store.templates.map(t => t.name + ' ' + t.scale)
  }));
  assert.deepEqual(made, {
    name: 'Gulf GT3',
    scale: '1:24',
    view: 'left',
    views: ['angled', 'left', 'right', 'top'],
    painted: true,
    cars: ['GT3 1:24']
  });
  // Studio keys do nothing while the Showroom is open.
  await page.evaluate(() => actions.showroom());
  await page.waitForSelector('.sr-card');
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(() => Object.values(project.views).flat().length), 0, 'T did nothing');
  // The same car at the same scale is used again; another scale is another car in the Garage.
  await paint('gt3', '1:24');
  assert.deepEqual(await page.evaluate(() => store.templates.map(t => t.name + ' ' + t.scale)), ['GT3 1:24']);
  await page.evaluate(() => actions.showroom());
  await page.waitForSelector('.sr-card');
  await paint('gt3', '1:32');
  assert.deepEqual(await page.evaluate(() => store.templates.map(t => t.name + ' ' + t.scale).sort()), [
    'GT3 1:24',
    'GT3 1:32'
  ]);
  // Back (the button) returns to painting; a reopened app keeps the liveries.
  await page.evaluate(() => actions.showroom());
  await page.waitForSelector('.sr-card');
  await page.locator('[data-show-back]').click();
  assert.equal(await open(), false);
  assert(await page.evaluate(() => !!project));
  await page.evaluate(() => flushSave());
  await app.close();
  await launch().catch(async () => page.waitForSelector('#tools button', { state: 'attached' }));
  assert.equal(await page.evaluate(() => store.projects.length), 3);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: showroom: start page, filter, views, Esc, Add a car, start painting, keys, reuse per scale, back, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
