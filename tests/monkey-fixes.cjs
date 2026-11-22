// Fixes from the random-click run of 22 November 2026: typing a name and then
// clicking other artwork on the car renames the artwork you were editing (not
// the one you clicked) and no longer throws while the inspector is rebuilt; a
// file that is not a package gets a plain message instead of a JSON error.
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: path.join(root, 'test-output', 'monkey-fixes-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.ELECTRON_BINARY || require('electron'),
    args: process.env.PAINTSHOP_PACKAGED ? [] : [root],
    env
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    await page.waitForSelector('#tools button', { state: 'attached' });
    await page.evaluate(() => {
      const v = V.importSVG(
        '<svg xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M30 100H970V500H30Z"/></svg>'
      );
      setProject(M.newProject({ name: 'Names', views: { left: v } }));
      currentView = 'left';
      preparing = false;
      tool = 'select';
      const a = M.layer('rect', { name: 'First', x: 100, y: 150, w: 200, h: 200, fill: '#e64a49' }),
        b = M.layer('rect', { name: 'Second', x: 600, y: 150, w: 200, h: 200, fill: '#1f6feb' });
      layers().push(a, b);
      selected = a.id;
      viewBox = { x: 0, y: 0, w: 1000, h: 600 };
      render();
    });
    await page.locator('#layer-name').fill('Renamed first');
    // Click the second box on the car while the name field still has focus.
    const point = await page.evaluate(() => {
      const p = new DOMPoint(700, 250).matrixTransform(art.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(point.x, point.y);
    const names = await page.evaluate(() => ({ names: layers().map(l => l.name), selected: selection()?.name }));
    assert.deepEqual(names.names, ['Renamed first', 'Second'], 'the name goes to the artwork that was being edited');
    assert.equal(names.selected, 'Second');
    // Rebuilding the inspector while a changed field has focus does not throw or rename anything.
    await page.locator('#layer-name').fill('Not applied');
    await page.evaluate(() => {
      selected = layers()[0].id;
      renderInspector();
    });
    assert.deepEqual(await page.evaluate(() => layers().map(l => l.name)), ['Renamed first', 'Second']);
    // A file that is not a package.
    const file = path.join(root, 'test-output', 'not-a-package.sfpaint');
    await fs.writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await page.locator('#package-file').setInputFiles(file);
    await page.waitForFunction(() => /not a Livery package/i.test(document.body.innerText), null, { timeout: 10000 });
    // A drag that starts on selected text (its target is a text node).
    await page.evaluate(() => {
      const text = document.createTextNode('dragged text');
      document.body.append(text);
      text.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
      text.remove();
    });
    assert.deepEqual(errors, []);
    console.log('PASS: names reach the artwork being edited, safe inspector rebuild, plain message for non-packages.');
  } finally {
    await app.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
