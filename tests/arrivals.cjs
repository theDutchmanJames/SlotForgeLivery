// Arrivals: a package comes in straight away and the Garage opens on it. A car you have already is
// not added twice; a livery with a name in use is "Name (2)" with yours next to it; one item or the
// whole package can be sent back; the next step fits what came in (open, a new livery on a car,
// use artwork on the open livery); Done ends it; what was kept is still there after a restart.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  data = path.join(out, 'profile-arrivals-' + Date.now()),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const shot = async name => shots && page.screenshot({ path: path.join(shots, `arrivals-${name}.png`) });
const counts = () =>
  page.evaluate(() => ({
    templates: store.templates.length,
    projects: store.projects.map(p => p.name),
    assets: store.assets.length
  }));
// Builds a package in the page from the library, the way Share does, and opens it.
const importPkg = (kind, make, name = 'gulf-tribute.sfpaint') =>
  page.evaluate(
    async ([kind, make, name]) => {
      const lib = await libraryClient.materialize(store, {
        templates: store.templates,
        liveries: [],
        assets: [],
        fonts: [],
        projects: store.projects
      });
      // The page does not run code from text, so each package is one of these recipes.
      const shape = name => ({ id: 'x', name, type: 'shape', layer: M.layer('ellipse', { name, fill: '#f2b705' }) });
      const data = {
        library: () => ({ ...lib, assets: [shape('Sponsor star')] }),
        car: () => ({ ...lib.templates[0], name: 'Porsche 917K' }),
        shape: () => shape('Roundel'),
        livery: () => ({ ...lib.projects[0], name: 'Martini red' })
      }[make]();
      const pkg = { format: 'slotforge-paintshop', version: 1, kind, exported: '2026-11-18T10:00:00.000Z', data };
      await readPackage(new File([JSON.stringify(pkg)], name));
    },
    [kind, make, name]
  );
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
  await page.evaluate(() => mutate(() => (project.name = 'Gulf tribute')));
  await page.evaluate(() => flushSave());
  const before = await counts();

  // The whole library plus a shape comes in: no question first.
  await importPkg('library', 'library');
  await page.waitForSelector('#garage-page .ar-bar');
  assert.equal(await page.locator('#dialog[open]').count(), 0, 'no question first');
  assert.match(
    await page.locator('.ar-bar').innerText(),
    /gulf-tribute\.sfpaint came in[\s\S]*1 livery and 1 piece of artwork[\s\S]*exported/
  );
  let now = await counts();
  assert.equal(now.templates, before.templates, 'the car you have is not added twice');
  assert.deepEqual(now.projects, ['Gulf tribute', 'Gulf tribute (2)']);
  assert.equal(await page.locator('.ar-yours').count(), 1, 'your car is shown as yours');
  assert.equal(await page.locator('.gr-arrivals .gr-n').innerText(), '2');
  // The renamed livery shows yours next to it.
  await page.locator('[data-arrival-pick^="projects:"]').click();
  assert.equal(await page.locator('.ar-cmp > div').count(), 2);
  assert.match(await page.locator('.gr-detail').innerText(), /Same name as yours/i);
  await shot('arrived');
  // Send the new one back: only that one goes.
  await page.locator('[data-arrival-back^="projects:"]').click();
  now = await counts();
  assert.deepEqual(now.projects, ['Gulf tribute']);
  assert.equal(now.assets, before.assets + 1);
  // Send it all back: the library is as it was.
  await page.locator('[data-arrival-back-all]').click();
  assert.deepEqual(await counts(), before);
  assert.match(await page.locator('#garage-page .gr-main').innerText(), /All sent back/i);
  await page.locator('[data-arrival-done]').click();
  assert.equal(await page.locator('.gr-arrivals').count(), 0, 'Done ends Arrivals');
  assert.equal(await page.evaluate(() => garageSection), 'recent');

  // A new car comes in: its next step is a livery on it.
  await importPkg('template', 'car', 'porsche.sfpaint');
  await page.waitForSelector('[data-arrival-new]');
  assert.equal((await counts()).templates, before.templates + 1);
  await page.locator('.ar-bar [data-arrival-new]').click();
  await page.waitForFunction(() => project?.template.name === 'Porsche 917K');
  assert.equal(await page.locator('#garage-page').isVisible(), false);

  // Artwork comes in while a livery is open: use it there.
  const layersBefore = await page.evaluate(() => layers().length);
  await importPkg('asset', 'shape', 'roundel.sfpaint');
  await page.waitForSelector('[data-arrival-use]');
  await page.locator('[data-arrival-use]').click();
  await page.waitForFunction(n => layers().length === n + 1, layersBefore);

  // A livery comes in: open it from Arrivals.
  await importPkg('project', 'livery', 'martini.sfpaint');
  await page.waitForSelector('[data-arrival-open]');
  await page.locator('[data-arrival-open]').click();
  await page.waitForFunction(() => project?.name === 'Martini red');

  // What was kept is still there after a restart.
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  now = await counts();
  assert(now.projects.includes('Martini red') && now.templates === before.templates + 1);
  assert.equal(await page.evaluate(() => garageArrival), null, 'Arrivals is for this session only');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: arrivals: straight in, yours kept, name in use, send back one or all, done, car, artwork, livery, restart.'
  );
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
