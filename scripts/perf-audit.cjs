// Performance audit: builds a heavy library (8 projects × 3 views, a 2 MB
// photo decal and ~40 layers each), restarts Livery on it and times startup,
// saving, rendering, dragging, undo snapshots and opening projects.
// Usage: node scripts/perf-audit.cjs [label]   → test-output/perf-<label>.json
// Opens real windows on screen while it runs.
const fs = require('node:fs/promises'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const runtime = process.env.ELECTRON_BINARY || require('electron');
const out = path.join(root, 'test-output'),
  label = process.argv[2] || 'run',
  data = path.join(out, 'profile-perf-' + Date.now());
const PROJECTS = 8;

async function launch() {
  const env = { ...process.env, PAINTSHOP_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const t0 = Date.now();
  const app = await electron.launch({ executablePath: runtime, args: [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => performance.getEntriesByName('livery:rendered').length, null, {
    timeout: 60000
  });
  const t1 = Date.now();
  const marks = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    marks: Object.fromEntries(performance.getEntriesByType('mark').map(m => [m.name, Math.round(m.startTime)])),
    dcl: Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0)
  }));
  return {
    app,
    page,
    startup: {
      launchToReadyMs: t1 - t0,
      processToNavigationMs: Math.round(marks.origin - t0),
      domContentLoadedMs: marks.dcl,
      ...marks.marks
    }
  };
}

async function seed() {
  const { app, page } = await launch();
  const click = a => page.locator(`[data-action="${a}"]:visible`).first().click();
  // The sample car opens the guided setup; every panel gets paint, then the last step.
  await click('sample-car');
  await page.waitForSelector('#setup-page:not([hidden])');
  await page.evaluate(() => {
    setup.entries.forEach(a => (a.paint = true));
    setup.step = 5;
    renderSetup();
  });
  await page.locator('[data-setup-next]').click();
  await page.waitForFunction(() => project && !preparing && activeView());
  const seeded = await page.evaluate(async count => {
    // A noisy 900×600 PNG stands in for an imported photo decal (≈2 MB).
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 600;
    const g = c.getContext('2d'),
      img = g.createImageData(900, 600);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3 ? 255 : Math.random() * 255) | 0;
    g.putImageData(img, 0, 0);
    const src = c.toDataURL('image/png');
    const base = project;
    base.views.left.push(M.layer('image', { src, x: 300, y: 200, w: 300, h: 200 }));
    for (let i = 0; i < 30; i++)
      base.views.left.push(
        M.layer(i % 3 ? 'rect' : 'ellipse', { x: 100 + i * 25, y: 150 + (i % 5) * 30, w: 120, h: 40, fill: '#e5484d' })
      );
    for (let i = 0; i < 8; i++)
      base.views.left.push(
        M.layer('text', { text: String(10 + i), font: 'Arial', x: 150 + i * 80, y: 260, w: 70, h: 60 })
      );
    for (const k of ['right', 'top']) {
      base.template.views[k] = M.clone(base.template.views.left);
      base.views[k] = base.views.left.map(l => ({ ...M.clone(l), id: M.uid() }));
    }
    for (let i = 1; i < count; i++) {
      const copy = M.clone(base);
      copy.id = M.uid();
      copy.name = 'Perf project ' + i;
      for (const k of Object.keys(copy.views)) copy.views[k] = copy.views[k].map(l => ({ ...l, id: M.uid() }));
      store.projects.push(copy);
    }
    changed();
    const t = performance.now();
    await flushSave();
    return { bulkSaveMs: Math.round(performance.now() - t), imageBytes: src.length, layers: layers().length };
  }, PROJECTS);
  await app.close();
  return seeded;
}

async function measure() {
  const { app, page, startup } = await launch();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const results = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const time = async (fn, n = 5) => {
      const t = [];
      for (let i = 0; i < n; i++) {
        const s = performance.now();
        await fn(i);
        t.push(performance.now() - s);
      }
      t.sort((a, b) => a - b);
      return { median: +t[n >> 1].toFixed(1), max: +t.at(-1).toFixed(1) };
    };
    // Time each IPC call the library client makes.
    const ipc = {},
      real = libraryClient.desktop;
    libraryClient.desktop = Object.fromEntries(
      Object.keys(real).map(key => [
        key,
        typeof real[key] !== 'function'
          ? real[key]
          : async (...args) => {
              const s = performance.now();
              try {
                return await real[key](...args);
              } finally {
                (ipc[key] ||= []).push(+(performance.now() - s).toFixed(1));
              }
            }
      ])
    );
    await frame();
    const r = { dom: document.querySelectorAll('*').length, artboardNodes: art.querySelectorAll('*').length };
    r.render = await time(() => render());
    r.renderCanvas = await time(() => renderCanvas());
    r.renderViews = await time(() => renderViews());
    r.renderInspector = await time(() => renderInspector());
    // Where renderViews spends its time: building markup vs. the DOM work.
    const thumbs = Object.keys(project.template.views);
    r.thumbMarkup = await time(() =>
      thumbs.map(k => V.standalone(project, k, 'thumb-' + k, { preview: true, effects: true }))
    );
    r.thumbMarkupBytes = thumbs.reduce(
      (n, k) => n + V.standalone(project, k, 'thumb-' + k, { preview: true, effects: true }).length,
      0
    );
    r.templateSignature = await time(() => thumbs.map(k => JSON.stringify(project.template.views[k])));
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    // Per-part cost of render() after a real change (caches invalidated).
    const parts = [
      'renderTools',
      'renderHeader',
      'renderCanvas',
      'renderViews',
      'renderInspector',
      'renderStepHint',
      'fillIcons',
      'renderCompare',
      'renderRulers',
      // Inside the inspector (nested, so these overlap the totals above).
      'afterInspector',
      'renderWorkshop',
      'placeLayers',
      'liveryColourCards',
      'colourUses',
      'artworkRows',
      'paintLayerRows',
      'orderButtons',
      'renderQuickBar',
      'renderEntrySwitch',
      'renderStart',
      'queueHelp'
    ].filter(n => typeof window[n] === 'function');
    const spent = Object.fromEntries(parts.map(n => [n, 0])),
      saved = {};
    for (const n of parts) {
      saved[n] = window[n];
      window[n] = (...a) => {
        const s = performance.now();
        try {
          return saved[n](...a);
        } finally {
          spent[n] += performance.now() - s;
        }
      };
    }
    const probe = layers().find(l => l.kind === 'rect');
    for (let i = 0; i < 5; i++) {
      probe.x += 1;
      render();
    }
    for (const n of parts) window[n] = saved[n];
    r.renderAfterChange = Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, +(v / 5).toFixed(1)]));
    r.renderToFrame = await time(async () => {
      render();
      await frame();
    });
    r.undoSnapshot = await time(() => record(), 10);
    undo = [];
    // A small edit followed by its autosave (what happens after every change).
    const target = layers().find(l => l.kind === 'rect');
    r.editAndSave = await time(async i => {
      selected = target.id;
      mutate(() => (target.x += 1 + i));
      await flushSave();
    });
    r.lastSave = libraryClient.lastSave;
    // Dragging a layer: pointer moves through the real handlers.
    selected = target.id;
    render();
    await frame();
    const node = art.querySelector(`[data-layer="${target.id}"]`);
    const box = node.getBoundingClientRect(),
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const ev = (type, dx) =>
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
          clientX: x + dx,
          clientY: y
        })
      );
    ev('pointerdown', 0);
    const moves = [];
    for (let i = 1; i <= 20; i++) {
      const s = performance.now();
      art.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          buttons: 1,
          isPrimary: true,
          clientX: x + i * 3,
          clientY: y
        })
      );
      await frame();
      moves.push(performance.now() - s);
    }
    ev('pointerup', 60);
    moves.sort((a, b) => a - b);
    r.dragFrame = { median: +moves[10].toFixed(1), max: +moves.at(-1).toFixed(1) };
    const ds = performance.now();
    await flushSave();
    r.saveAfterDrag = +(performance.now() - ds).toFixed(1);
    // Switch to another project (hydrates it from the database).
    const other = store.projects.find(p => p.id !== project.id);
    const os = performance.now();
    const loaded = await libraryClient.hydrate(store, 'projects', other.id);
    const hydrated = performance.now() - os;
    setProject(loaded);
    await frame();
    r.openProject = { hydrateMs: +hydrated.toFixed(1), totalMs: +(performance.now() - os).toFixed(1) };
    await flushSave();
    // Library page with its thumbnails.
    const ls = performance.now();
    document.querySelector('[data-action="projects"]')?.click();
    await frame();
    r.openProjectsPage = +(performance.now() - ls).toFixed(1);
    r.ipc = ipc;
    libraryClient.desktop = real;
    return r;
  });
  const stat = async f => (await fs.stat(f).catch(() => null))?.size;
  const file = path.join(data, 'paintshop-library.sqlite');
  results.dbBytes = await stat(file);
  await app.close();
  return { startup, ...results, errors };
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const seeded = await seed();
  const cold = await measure();
  const warm = await measure();
  const report = { label, seeded, cold, warmStartup: warm.startup, warmSave: warm.editAndSave };
  await fs.writeFile(path.join(out, `perf-${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await fs.rm(data, { recursive: true, force: true });
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
