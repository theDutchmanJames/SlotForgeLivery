'use strict';
// Random-click run on a copy of your library. Livery opens on a copy (your own
// library is only read, never opened by the app), and a script clicks, types,
// drags and presses keys at random. It records every error, failed request,
// crash, and window that does not close with Escape, plus buttons that never
// did anything. At the end the copied library must still open and be valid.
//
//   node scripts/monkey.cjs                 20 minutes on a copy of your library
//   MONKEY_MINUTES=60 MONKEY_SEED=7 node scripts/monkey.cjs
//   MONKEY_LIBRARY=empty node scripts/monkey.cjs   start from an empty library
// Writes test-output/monkey/report.md and report.json. Opens a visible window.
const fs = require('node:fs'),
  path = require('node:path');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'test-output', 'monkey'),
  data = path.join(out, 'library'),
  exportDir = path.join(out, 'exports');
const minutes = Number(process.env.MONKEY_MINUTES || 20),
  seed = Number(process.env.MONKEY_SEED || Date.now() % 100000);
const { rng, checkDatabase } = require('../tests/fixtures/library-fuzz.cjs');
const r = rng(seed);
const { SQLiteLibrary } = require('../src/sqlite-library.cjs');

function prepare() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(path.join(out, 'backups'), { recursive: true });
  const mine = path.join(process.env.APPDATA || '', 'SlotForge Paintshop');
  if (process.env.MONKEY_LIBRARY !== 'empty' && fs.existsSync(path.join(mine, 'paintshop-library.sqlite'))) {
    for (const name of ['paintshop-library.sqlite', 'paintshop-library.sqlite.opened'])
      if (fs.existsSync(path.join(mine, name))) fs.copyFileSync(path.join(mine, name), path.join(data, name));
    return 'a copy of your library';
  }
  return 'an empty library';
}
// Files offered whenever Livery asks for one: test drawings, a picture, a
// font, and anything this run exported (so packages travel back in).
function offerFiles() {
  const fixed = [
    path.join(root, 'tests', 'fixtures', 'car.svg'),
    path.join(root, 'tests', 'fixtures', 'line-art.svg'),
    path.join(root, 'tests', 'fixtures', 'car.eps'),
    path.join(root, 'assets', 'icon.png'),
    'C:\\Windows\\Fonts\\arial.ttf'
  ].filter(f => fs.existsSync(f));
  return [...fixed, ...fs.readdirSync(exportDir).map(n => path.join(exportDir, n))];
}

const findings = new Map(); // signature -> { kind, message, count, first trail }
const trail = [];
const note = (kind, message, extra = {}) => {
  const key = kind + ': ' + String(message).slice(0, 300);
  const f = findings.get(key);
  if (f) f.count++;
  else
    findings.set(key, { kind, message: String(message).slice(0, 2000), count: 1, trail: trail.slice(-15), ...extra });
};
const buttons = new Map(); // label -> { clicks, changed }

async function launch() {
  const app = await electron.launch({
    executablePath: process.env.ELECTRON_BINARY || require('electron'),
    args: [root],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
      PAINTSHOP_TEST_DATA: data,
      PAINTSHOP_TEST_BACKUP_DIR: path.join(out, 'backups'),
      SLOTFORGE_NO_UPDATE_CHECK: '1'
    }
  });
  // Native dialogs would stop the run (and pop up on your screen): answer them here.
  await app.evaluate(
    ({ dialog, shell }, { exportsDir }) => {
      let n = 0;
      dialog.showSaveDialog = async (_w, options = {}) => {
        if (Math.random() < 0.2) return { canceled: true };
        const ext = (options.filters?.[0]?.extensions?.[0] || 'bin').replace(/[^\w]/g, '');
        return { canceled: false, filePath: `${exportsDir}\\export-${++n}.${ext}` };
      };
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      dialog.showMessageBox = async (_w, options = {}) => ({ response: options.cancelId ?? 0, checkboxChecked: false });
      dialog.showErrorBox = () => {};
      shell.openExternal = async () => {};
      shell.openPath = async () => '';
      shell.showItemInFolder = () => {};
    },
    { exportsDir: exportDir }
  );
  const page = await app.firstWindow();
  page.on('pageerror', e => note('Error in the window', e.stack || e.message));
  page.on('console', m => {
    if (m.type() === 'error') note('Handled error, shown as a message', m.text());
  });
  page.on('requestfailed', q => note('Failed request', q.url().slice(0, 200) + ' ' + q.failure()?.errorText));
  page.on('crash', () => note('Window crashed', 'renderer crash'));
  page.on('dialog', d => {
    trail.push('browser dialog: ' + d.message().slice(0, 80));
    (r.chance(0.5) ? d.accept() : d.dismiss()).catch(() => {});
  });
  page.on('filechooser', async chooser => {
    const files = offerFiles();
    const pick = chooser.isMultiple() ? files.filter(() => r.chance(0.3)) : [r.pick(files)];
    trail.push('file chooser → ' + pick.map(f => path.basename(f)).join(', '));
    await chooser.setFiles(r.chance(0.15) ? [] : pick).catch(e => note('File chooser', e.message));
  });
  app.on('window', w => {
    if (w !== page) trail.push('new window ' + w.url());
  });
  await page.waitForSelector('#tools button', { state: 'attached', timeout: 60000 });
  // Count DOM changes so a click that changes nothing can be told apart.
  await page.evaluate(() => {
    window.__monkeyChanges = 0;
    new MutationObserver(list => (window.__monkeyChanges += list.length)).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  });
  return { app, page };
}

// Everything on screen that can be clicked, with a readable label.
const targets = page =>
  page.evaluate(() => {
    const seen = [];
    const sel =
      'button,a[href],[role=button],[role=tab],[role=menuitem],input,select,textarea,summary,label,[data-action],[tabindex]:not([tabindex="-1"]),.card,li';
    for (const el of document.querySelectorAll(sel)) {
      if (el.disabled || el.closest('[inert],[hidden]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4 || box.bottom < 0 || box.right < 0) continue;
      if (box.top > innerHeight || box.left > innerWidth) continue;
      const x = box.left + box.width / 2,
        y = box.top + box.height / 2;
      const top = document.elementFromPoint(x, y);
      if (!top || (top !== el && !el.contains(top) && !top.contains(el))) continue;
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el.innerText || el.value || '').trim().split('\n')[0].slice(0, 40) ||
        el.id ||
        el.className?.toString?.().slice(0, 40);
      seen.push({ x, y, tag: el.tagName.toLowerCase(), type: el.type || '', label, button: el.tagName === 'BUTTON' });
    }
    return seen;
  });
const KEYS = [
  'Escape',
  'Enter',
  'Delete',
  'Backspace',
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Control+z',
  'Control+y',
  'Control+Shift+z',
  'Control+a',
  'Control+c',
  'Control+v',
  'Control+d',
  'Control+g',
  'F1',
  'Shift+?',
  'v',
  'h',
  'r',
  'e',
  't',
  'p',
  'l',
  'g',
  '+',
  '-',
  '0',
  '1',
  ' ',
  'Home',
  'End',
  'PageDown'
];
const TEXT = ['Monza', '24', '#ff0000', '1:32', '', 'ÆØÅ ✓ 🏁', '-5', '9999', 'a'.repeat(120), '<b>x</b>'];

async function step(page) {
  const choice = r.next();
  if (choice < 0.62) {
    const list = await targets(page);
    if (!list.length) return;
    const t = r.pick(list);
    trail.push(`click ${t.tag}${t.type ? '[' + t.type + ']' : ''} "${t.label}"`);
    const before = await page.evaluate(() => window.__monkeyChanges);
    await page.mouse.click(t.x, t.y, { button: r.chance(0.05) ? 'right' : 'left', clickCount: r.chance(0.05) ? 2 : 1 });
    if (['input', 'textarea'].includes(t.tag) && !['checkbox', 'radio', 'range', 'color', 'file'].includes(t.type)) {
      await page.keyboard.press('Control+a');
      const text = r.pick(TEXT);
      trail.push(`type "${text.slice(0, 20)}"`);
      await page.keyboard.type(text);
      if (r.chance(0.5)) await page.keyboard.press(r.pick(['Enter', 'Tab']));
    }
    if (t.tag === 'select') {
      await page.keyboard.press(r.pick(['ArrowDown', 'ArrowUp']));
      await page.keyboard.press('Enter');
    }
    if (t.button) {
      await page.waitForTimeout(120);
      const changed = (await page.evaluate(() => window.__monkeyChanges)) !== before;
      const b = buttons.get(t.label) || { clicks: 0, changed: 0 };
      b.clicks++;
      if (changed) b.changed++;
      buttons.set(t.label, b);
    }
  } else if (choice < 0.8) {
    const key = r.pick(KEYS);
    trail.push('key ' + key);
    await page.keyboard.press(key);
  } else if (choice < 0.93) {
    // Drag on the artboard, as painting, moving and selecting do.
    const box = await page
      .locator('#canvas-wrap')
      .boundingBox()
      .catch(() => null);
    if (!box || box.width < 10) return;
    const at = () => [box.x + r.next() * box.width, box.y + r.next() * box.height];
    const [x1, y1] = at(),
      [x2, y2] = at();
    trail.push(`drag ${Math.round(x1)},${Math.round(y1)} → ${Math.round(x2)},${Math.round(y2)}`);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 4 + r.int(8) });
    await page.mouse.up();
  } else {
    const box = await page
      .locator('#canvas-wrap')
      .boundingBox()
      .catch(() => null);
    if (!box) return;
    trail.push('scroll');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (r.chance(0.5)) await page.keyboard.down('Control');
    await page.mouse.wheel(0, r.chance(0.5) ? 240 : -240);
    await page.keyboard.up('Control');
  }
}
// Every so often: does Escape close what is open?
async function escapeCheck(page) {
  const open = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('dialog[open],[role=dialog],.popover,.menu.open')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map(
          el =>
            (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) +
            ' ' +
            (el.innerText || '').trim().split('\n')[0].slice(0, 40)
        )
    );
  if (!(await open()).length) return;
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const still = await open();
  if (still.length) {
    for (const s of still) note('Does not close with Escape', s);
    // Get out anyway so the run can go on.
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  }
}

(async () => {
  const source = prepare();
  console.log(`Random-click run: ${minutes} min on ${source}, seed ${seed}.`);
  let { app, page } = await launch();
  const end = Date.now() + minutes * 60e3;
  let actions = 0,
    restarts = 0;
  while (Date.now() < end) {
    try {
      if (page.isClosed()) throw Error('closed');
      await step(page);
      actions++;
      if (actions % 40 === 0) await escapeCheck(page);
      if (actions % 500 === 0) console.log(`  ${actions} actions, ${findings.size} findings`);
      await page.waitForTimeout(20 + r.int(120));
    } catch (e) {
      const closed = page.isClosed() || /closed|Target page|has been closed/i.test(e.message);
      if (!closed) {
        note('Run error', e.message.split('\n')[0]);
        continue;
      }
      trail.push('Livery window closed');
      note('Window closed during the run', 'The window closed (a Close or Quit button, or a crash).');
      await app.close().catch(() => {});
      if (++restarts > 20) break;
      ({ app, page } = await launch());
    }
  }
  await app.close().catch(() => {});
  // The copy must still be a valid library after all of that.
  let library = 'not checked';
  try {
    const lib = new SQLiteLibrary(path.join(data, 'paintshop-library.json'));
    const loaded = await lib.load();
    if (loaded.error) throw Error(loaded.error);
    const snapshot = lib.snapshot();
    checkDatabase(lib, snapshot, 'library after the run');
    library = `opens and is valid (${['templates', 'projects', 'liveries', 'assets', 'fonts'].map(b => snapshot[b].length + ' ' + b).join(', ')})`;
    lib.close();
  } catch (e) {
    library = 'PROBLEM: ' + e.message;
    note('Library after the run', e.message);
  }
  const silent = [...buttons]
    .filter(([, b]) => b.clicks >= 3 && b.changed === 0)
    .map(([label, b]) => ({ label, clicks: b.clicks }));
  const list = [...findings.values()].sort((a, b) => b.count - a.count);
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify({ seed, minutes, actions, restarts, library, findings: list, silent }, null, 1)
  );
  const md = [
    `# Random-click run`,
    ``,
    `${actions} actions in ${minutes} minutes on ${source} (seed ${seed}), ${restarts} restarts.`,
    `Library afterwards: ${library}.`,
    ``,
    `## Findings (${list.length})`,
    ...list.map(
      f =>
        `\n### ${f.kind} ×${f.count}\n\n\`\`\`\n${f.message}\n\`\`\`\nLast actions before it:\n${f.trail.map(t => '- ' + t).join('\n')}`
    ),
    ``,
    `## Buttons that never changed anything (clicked 3+ times)`,
    ...silent.map(s => `- "${s.label}" ×${s.clicks}`)
  ].join('\n');
  fs.writeFileSync(path.join(out, 'report.md'), md);
  console.log(`Done: ${actions} actions, ${list.length} findings, library ${library}.`);
  console.log('Report: ' + path.join(out, 'report.md'));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
