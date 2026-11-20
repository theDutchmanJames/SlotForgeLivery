// Print pack: the pages in groups, ticking and ordering them, the pack's settings (scale, paper,
// crop marks, check bar, plan contents, masks for both sides), one page large, saving one PDF,
// decals left to SlotForge Decals, and the pack remembered with the livery.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { clickAction } = require('./inspector-helpers.cjs');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-pack-' + stamp),
  pdf = path.join(out, 'print-pack-' + stamp + '.pdf'),
  shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
let app, page;
const click = action => clickAction(page, action);
const shot = async name => shots && page.screenshot({ path: path.join(shots, `pack-${name}.png`) });
const queue = () => page.locator('[data-pack-item]').evaluateAll(items => items.map(i => i.dataset.packItem));
async function launch() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: data, PAINTSHOP_TEST_PDF: pdf };
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
  await click('sample-car');
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.evaluate(() => {
    mutate(() => {
      project.base = '#7fb7e2';
      project.views.left.push(M.layer('rect', { name: 'Band', x: 150, y: 330, w: 700, h: 40, fill: '#f28a35' }));
    });
    render();
  });

  // From the Print & export menu. Without a real size, masks ask for it.
  await click('print-pack');
  assert(await page.locator('#pack-page').isVisible());
  assert.equal(await page.locator('.workspace').isVisible(), false);
  assert(await page.locator('[data-pack-real-size]').isVisible(), 'masks need the real size');
  assert.deepEqual(await queue(), ['plan', 'order'], 'the plan and painting order start in the pack');
  // Decals are SlotForge Decals' job: send there, import its sheets.
  assert(await page.locator('#pack-page [data-action="send-decals"]').isVisible());
  assert(await page.locator('[data-pack-import-decals]').isVisible());
  await page.locator('[data-pack-real-size]').click();
  assert(await page.locator('#workshop-panel #real-width').isVisible(), 'the Workshop tab opens on the real size');
  await page.locator('#real-width').fill('138');
  await page.locator('#real-width').dispatchEvent('change');

  await click('print-pack');
  const masks = await page.locator('.pk-group').nth(1).locator('[data-pack-card]').count();
  assert.equal(masks, 2, 'one mask per colour');
  assert.equal((await queue()).length, 4);
  await shot('pack');

  // Ticking and ordering.
  await page.locator('[data-pack-tick="view:left"]').click();
  assert((await queue()).includes('view:left'));
  await page.locator('[data-pack-tick="plan"]').click();
  assert.equal((await queue()).includes('plan'), false);
  const before = await queue();
  await page.locator(`[data-pack-move="${before[0]}"][data-dir="1"]`).click();
  assert.deepEqual((await queue()).slice(0, 2), [before[1], before[0]]);

  // Settings: notes leave the plan; the scale changes the mask size; paper and marks.
  await page.locator('[data-pack-tick="plan"]').click();
  await page.locator('[data-pack-setting="notes"]').uncheck();
  assert.equal(await page.evaluate(() => packPages()[0].html.includes('Workshop notes')), false);
  const size32 = await page.evaluate(
    () =>
      packPages()
        .find(p => p.group === 'masks')
        .html.match(/width="([\d.]+)mm"/)[1]
  );
  await page.locator('[data-pack-scale="1:24"]').click();
  const size24 = await page.evaluate(
    () =>
      packPages()
        .find(p => p.group === 'masks')
        .html.match(/width="([\d.]+)mm"/)[1]
  );
  assert(Math.abs(Number(size24) / Number(size32) - 32 / 24) < 0.01, `1:24 is a third larger: ${size32} → ${size24}`);
  await page.locator('[data-pack-scale="1:32"]').click();
  await page.locator('[data-pack-setting="crop"]').uncheck();
  assert.equal(
    await page.evaluate(() =>
      packPages()
        .find(p => p.group === 'masks')
        .html.includes('class="crop')
    ),
    false
  );
  await page.locator('[data-pack-paper="A3"]').click();
  assert.match(await page.evaluate(() => packCSS()), /@page\{size:A3 portrait/);
  await page.locator('[data-pack-setting="design"]').check();
  assert(await page.locator('[data-pack-card="design:left"]').count());

  // One page large, with its own switch and Previous / Next.
  await page.locator('[data-pack-open="order"]').click();
  assert(await page.locator('.pk-large').isVisible());
  await page.locator('[data-pack-tick-large="order"]').uncheck();
  await page.locator('[data-pack-step="1"]').click();
  await shot('large');
  await page.keyboard.press('Escape');
  assert.equal((await queue()).includes('order'), false);
  await page.locator('[data-pack-tick="order"]').click();

  // One PDF.
  await page.locator('[data-pack-save]').click();
  await page.waitForFunction(() => /Print pack saved/.test(document.querySelector('#toast').textContent), null, {
    timeout: 60000
  });
  const bytes = await fs.readFile(pdf);
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  assert(bytes.length > 20000, 'the PDF has the pages');

  // Remembered with the livery.
  const pack = await page.evaluate(() => packQueue().map(p => p.id));
  await page.evaluate(() => flushSave());
  await app.close();
  await launch();
  await click('print-pack');
  assert.deepEqual(await queue(), pack);
  assert.equal(await page.locator('[data-pack-paper="A3"]').getAttribute('aria-pressed'), 'true');
  await click('studio');
  assert(await page.locator('.workspace').isVisible());
  assert.deepEqual(errors, []);
  await fs.rm(pdf, { force: true });
  console.log('PASS: print pack: groups, ticks, order, settings, one page large, one PDF, remembered per livery.');
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app?.close());
