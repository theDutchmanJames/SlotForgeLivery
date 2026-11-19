// The update window (update-check.cjs + update-ui.js, shared with SlotForge Circuit): a newer
// release opens it with What's new, Skip and Download; Download saves this copy's file in the
// Downloads folder; Settings → Updates shows the version and Check now brings it back; Skip
// keeps it away until a newer version. GitHub is replaced by a fake answer in the main process.
// LIVERY_UI_SHOTS=<folder> also saves pictures of the window in the dark and light themes.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  stamp = Date.now(),
  data = path.join(out, 'profile-update-' + stamp),
  downloads = path.join(out, 'downloads-' + stamp);
const shots = process.env.LIVERY_UI_SHOTS;
const errors = [];
const BYTES = 'a pretend Livery installer';
const SHA = crypto.createHash('sha256').update(BYTES).digest('hex');
const name = tag => `SlotForgeLivery-${tag.slice(1)}-windows-x64-setup.exe`;
let app, page;

// What the check at start does (it is off in automated runs, so the test calls check()).
async function release(tag) {
  await app.evaluate(
    async (_, { tag, bytes, sha, folder }) => {
      const u = globalThis.liveryUpdateCheck;
      const file = `SlotForgeLivery-${tag.slice(1)}-windows-x64-setup.exe`;
      u.edition = { platform: 'win32', arch: 'x64' };
      u.downloads = folder;
      u.fetch = async url =>
        url.includes('/releases/download/')
          ? {
              ok: true,
              status: 200,
              body: {
                getReader: () => {
                  const parts = [Buffer.from(bytes)];
                  return { read: async () => (parts.length ? { done: false, value: parts.shift() } : { done: true }) };
                }
              }
            }
          : {
              ok: true,
              status: 200,
              text: async () =>
                JSON.stringify({
                  tag_name: tag,
                  draft: false,
                  prerelease: false,
                  published_at: '2026-12-01T00:00:00Z',
                  body: "Intro.\n\n## What's new\n\n- **Pit Board:** a calmer studio.\n\n## Verification\n\n- tests passed",
                  assets: [
                    { name: file, size: Buffer.byteLength(bytes), digest: 'sha256:' + sha },
                    { name: 'SlotForgeLivery-source.tar.gz', size: 10 }
                  ]
                })
            };
      await u.check();
    },
    { tag, bytes: BYTES, sha: SHA, folder: downloads }
  );
}
const dialog = () =>
  page.evaluate(() => {
    const d = document.getElementById('update-dialog');
    return (
      d && {
        open: d.open,
        title: d.querySelector('h2')?.textContent,
        news: d.querySelector('.update-news')?.textContent,
        text: d.textContent,
        buttons: [...d.querySelectorAll('.dialog-actions button')].map(b => b.textContent)
      }
    );
  });
const isOpen = () => page.evaluate(() => !!document.getElementById('update-dialog')?.open);
const shot = async file => shots && page.screenshot({ path: path.join(shots, file + '.png') });

async function run() {
  await fs.mkdir(downloads, { recursive: true });
  if (shots) await fs.mkdir(shots, { recursive: true });
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
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.waitForSelector('#tools button');
  await page.waitForFunction(() => window.UpdateUI && performance.getEntriesByName('livery:rendered').length);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000));

  // A newer release opens the window by itself.
  await release('v9.9.0');
  await page.waitForFunction(() => document.getElementById('update-dialog')?.open, null, { timeout: 10000 });
  let d = await dialog();
  assert.equal(d.title, 'Livery 9.9.0');
  assert.match(d.news, /Pit Board: a calmer studio\./);
  assert.doesNotMatch(d.news, /tests passed/, 'the Verification section is not shown');
  assert.match(d.text, /You have version 1\.\d+\.\d+/);
  assert.match(d.text, /Windows · installer/, 'the window says which copy this is');
  assert.match(d.text, new RegExp(name('v9.9.0').replace(/\./g, '\\.')), 'the download is named');
  assert.doesNotMatch(d.text, /null|undefined/, `stray words in the window: ${d.text}`);
  assert.deepEqual(d.buttons, ['Skip this version', 'Download']);
  await shot('update-window-dark');
  if (shots) {
    await page.evaluate(() => themeSettings.choose('light'));
    await shot('update-window-light');
    await page.evaluate(() => themeSettings.choose('dark'));
  }

  // Download: saved in the Downloads folder and checked; Show in folder is offered.
  await page.locator('#update-download').click();
  await page.waitForSelector('#update-show', { timeout: 10000 });
  assert.equal(await fs.readFile(path.join(downloads, name('v9.9.0')), 'utf8'), BYTES);
  assert.deepEqual(
    (await fs.readdir(downloads)).filter(n => n.endsWith('.part')),
    [],
    'no part file is left behind'
  );
  d = await dialog();
  assert.match(d.text, /Saved in Downloads/);
  assert.match(d.text, /your library, cars and liveries stay where they are/);
  await shot('update-saved');
  // Esc closes it for this session.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('update-dialog').open);
  await page.waitForTimeout(400);
  assert.equal(await isOpen(), false, 'a closed window does not come back by itself');

  // Settings → Updates: the versions, in the side list too. (A restart forgets the download.)
  await app.evaluate(() => (globalThis.liveryUpdateCheck.download = { state: 'idle' }));
  await page.locator('[data-action="settings"]:visible').first().click();
  await page.waitForSelector('#update-settings .ss-pill');
  assert.match(await page.locator('#update-settings').textContent(), /Version 9\.9\.0 is available/);
  assert.match(
    await page.locator('[data-settings-section="update-settings"] .ss-status').textContent(),
    /9\.9\.0 is available/
  );
  await page.locator('[data-settings-section="update-settings"]').click();
  await page.waitForTimeout(600);
  await shot('update-settings');

  // Check now shows the window again; Skip keeps it away until a newer version.
  await page.locator('#update-check-now').click();
  await page.waitForFunction(() => document.getElementById('update-dialog')?.open, null, { timeout: 10000 });
  await page.locator('#update-skip').click();
  await page.waitForFunction(() => !document.getElementById('update-dialog').open);
  await page.locator('#settings-back').click();
  await page.reload();
  await page.waitForFunction(() => window.UpdateUI && performance.getEntriesByName('livery:rendered').length);
  await release('v9.9.0');
  await page.waitForTimeout(800);
  assert.equal(await isOpen(), false, 'a skipped version came back');
  await release('v9.9.1');
  await page.waitForFunction(
    () => document.getElementById('update-dialog')?.open && /9\.9\.1/.test($('#update-dialog h2').textContent),
    null,
    { timeout: 10000 }
  );
  await page.keyboard.press('Escape');

  // The saved state stays in the profile, never in the library.
  const saved = JSON.parse(await fs.readFile(path.join(data, 'update-check.json'), 'utf8'));
  assert.equal(saved.skipped, '9.9.0');
  assert.equal(saved.latest.version, '9.9.1');
  assert.deepEqual(errors, []);
  console.log("PASS: update window: What's new, Download into Downloads, Settings, Check now, Skip, newer version.");
}
run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await fs.rm(downloads, { recursive: true, force: true });
    await fs.rm(data, { recursive: true, force: true }).catch(() => {});
  });
