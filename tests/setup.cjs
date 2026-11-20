// The guided car setup: Add a car (steps 1–2) leads to the setup page (3 Panels,
// 4 Parts with your own part names, 5 Size), which saves the car and opens it to paint.
// Also: Cancel, Back, the detailed editor fallback, preparing an existing car again and
// saving it as a new car.
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
const shot = async name => shots && page.screenshot({ path: path.join(shots, `setup-${name}.png`) });
const largest = n =>
  page.evaluate(n => {
    const big = [...setup.entries].sort(
      (a, b) => b.region.bounds.w * b.region.bounds.h - a.region.bounds.w * a.region.bounds.h
    );
    return big.slice(0, n).map(a => a.region.id);
  }, n);

async function run() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: path.join(out, 'profile-setup-' + Date.now()) };
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

  // Steps 1–2: the Add a car window shows the steps.
  await page.locator('#welcome [data-action="add-car"]').click();
  assert.deepEqual(await page.locator('#dialog .setup-st b').allInnerTexts(), [
    'The car',
    'Drawing',
    'Panels',
    'Parts',
    'Size'
  ]);
  assert.equal(await page.locator('#dialog .setup-st.on').count(), 2);
  // The sample car goes through the same import, then the setup page opens on step 3.
  await page.locator('#dialog [data-action="sample-car"]').click();
  await page.waitForSelector('#setup-page:not([hidden]) #setup-canvas');
  assert.equal(await page.locator('.workspace').isVisible(), false);
  assert.equal(await page.locator('#setup-crumb').textContent(), 'Add a car');
  assert(await page.locator('[data-setup-next]').isDisabled(), 'Next needs a panel');

  // Step 3: click panels on the drawing and in the list.
  const [body, glass, other] = await largest(3);
  await page.locator(`#setup-canvas [data-setup-area="${body}"]`).dispatchEvent('click');
  await page.locator(`[data-setup-check="${glass}"]`).check();
  await page.locator(`[data-setup-check="${other}"]`).check();
  await page.locator(`[data-setup-check="${glass}"]`).uncheck();
  assert.match(await page.locator('.setup-sec h4 span').first().innerText(), /^2 of \d+ get paint$/);
  await shot('panels');
  await page.locator('[data-setup-next]').click();

  // Step 4: parts with your own names.
  assert.deepEqual(await page.locator('.setup-part-name').allInnerTexts(), ['Body']);
  await page.locator('#setup-part-name').fill('Roof stripe');
  await page.locator('#setup-new-part button').click();
  assert.equal(await page.locator('.setup-part.on .setup-part-name').innerText(), 'Roof stripe');
  await page.locator(`#setup-canvas [data-setup-area="${other}"]`).dispatchEvent('click');
  await page.locator('[data-setup-suggest="Bonnet"]').click();
  await page.locator('[data-setup-part="Body"]').click();
  assert.equal(await page.locator('.setup-part', { hasText: 'Roof stripe' }).locator('small').innerText(), '1 panel');
  // Removing a part moves its panels to the first part.
  await page.locator('[data-setup-remove-part="Bonnet"]').click();
  assert.deepEqual(await page.locator('.setup-part-name').allInnerTexts(), ['Body', 'Roof stripe']);
  await shot('parts');
  // Back keeps the choices.
  await page.locator('[data-setup-back]').click();
  assert.equal(await page.locator(`[data-setup-check="${other}"]`).isChecked(), true);
  await page.locator('[data-setup-next]').click();
  await page.locator('[data-setup-next]').click();

  // Step 5: the real size from the scale.
  await page.locator('[data-setup-scale="1:24"]').click();
  await page.locator('#setup-real').fill('4420');
  assert.equal(await page.locator('#setup-model').innerText(), '184.2 mm');
  await page.locator('[data-setup-scale="1:32"]').click();
  assert.equal(await page.locator('#setup-model').innerText(), '138.1 mm');
  await shot('size');
  await page.locator('[data-setup-next]').click();

  // Saved: the studio opens with the parts in Layers and the size in millimetres.
  assert(await page.locator('.workspace').isVisible());
  assert.equal(await page.evaluate(() => preparing), false);
  assert.deepEqual(
    await page.evaluate(() =>
      activeView()
        .regions.filter(r => r.role === 'body')
        .map(r => r.partLabel)
        .sort()
    ),
    ['Body', 'Roof stripe']
  );
  assert.equal(await page.evaluate(() => activeView().realWidthMm), 138.1);
  assert.equal(await page.evaluate(() => store.templates[0].views.left.realWidthMm), 138.1, 'the car in the library');
  assert.equal(await page.evaluate(() => store.templates[0].views.left.panelLabels.length), 2);
  assert(await page.locator('#layers-panel', { hasText: 'Roof stripe' }).isVisible());

  // Preparing the car again starts from what was saved; Cancel leaves it as it was.
  await click('prepare');
  await click('setup-car');
  await page.waitForSelector('#setup-page:not([hidden])');
  assert.match(await page.locator('#setup-crumb').textContent(), /^Prepare /);
  assert.equal(await page.locator('[data-setup-check]:checked').count(), 2, 'the saved panels are ticked');
  await page.keyboard.press('Escape');
  assert(await page.locator('.workspace').isVisible());

  // Saving as a new car keeps the first one.
  await click('setup-car');
  await page.locator('[data-setup-step="5"]').click();
  await page.locator('input[name="setup-save"][value="new"]').check();
  await page.locator('#setup-new-name').fill('Sample coupe GT');
  await page.locator('#setup-new-name').dispatchEvent('change');
  await page.locator('[data-setup-next]').click();
  assert.deepEqual(await page.evaluate(() => store.templates.map(t => t.name).sort()), [
    'Sample coupe',
    'Sample coupe GT'
  ]);
  assert.equal(await page.evaluate(() => project.template.name), 'Sample coupe GT');

  // The detailed editor stays available for drawings the page cannot split.
  await click('prepare');
  await click('setup-car');
  await page.locator('[data-setup-detailed]').click();
  assert(await page.locator('#apply-repair').isVisible());
  await click('close-dialog');
  assert.deepEqual(errors, []);
  console.log('PASS: guided setup: steps, panels, own part names, size from scale, save, prepare again, new car.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
