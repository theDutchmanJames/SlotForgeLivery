// Database micro-benchmark: times the library worker's operations on a
// synthetic heavy library (no windows). Usage: node scripts/perf-db.cjs
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { SQLiteLibrary } = require('../src/sqlite-library.cjs');
const C = require('../renderer/storage-codec.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livery-perf-db-'));
const legacy = path.join(dir, 'paintshop-library.json');
const id = () => crypto.randomUUID();
const image = 'data:image/png;base64,' + crypto.randomBytes(1.8e6).toString('base64');
function project(n) {
  const regions = Array.from({ length: 60 }, (_, i) => ({
    id: id(),
    name: 'Region ' + i,
    role: i < 20 ? 'body' : 'detail',
    markup: `<path data-geometry="true" d="M${i} 0L${i + 50} 40L${i} 80Z"/>`,
    bounds: { x: i, y: 0, w: 50, h: 80 }
  }));
  const view = { regions, bounds: { x: 50, y: 50, w: 900, h: 500 }, source: 'vector' };
  const layer = i =>
    i === 0
      ? { id: id(), kind: 'image', src: image, x: 300, y: 200, w: 300, h: 200, rotation: 0, opacity: 1 }
      : { id: id(), kind: 'rect', x: 10 * i, y: 20, w: 100, h: 40, fill: '#e5484d', rotation: 0, opacity: 1 };
  const views = {},
    tviews = {};
  for (const k of ['left', 'right', 'top']) {
    tviews[k] = JSON.parse(JSON.stringify(view));
    views[k] = Array.from({ length: 40 }, (_, i) => layer(i));
  }
  return { id: id(), name: 'Project ' + n, base: '#273442', template: { name: 'Car', views: tviews }, views };
}
const time = (fn, n = 5) => {
  const t = [];
  let value;
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    value = fn(i);
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return { median: +t[n >> 1].toFixed(1), max: +t.at(-1).toFixed(1), value };
};
(async () => {
  const data = { schema: 1, templates: [], liveries: [], assets: [], fonts: [], projects: [], current: null };
  for (let i = 0; i < 8; i++) data.projects.push(project(i));
  data.current = data.projects[0].id;
  const lib = new SQLiteLibrary(legacy);
  fs.writeFileSync(legacy, JSON.stringify(data));
  let s = performance.now();
  await lib.load(); // migrates the JSON library
  const r = { migrateMs: +(performance.now() - s).toFixed(1) };
  lib.close();
  const fresh = new SQLiteLibrary(legacy);
  s = performance.now();
  await fresh.load();
  r.loadMs = +(performance.now() - s).toFixed(1);
  const key = C.keyOf('projects', data.current);
  r.get = time(() => fresh.get(key));
  r.get.value = undefined;
  // A one-layer move, diffed exactly like LibraryClient.save does it.
  const codec = new C.Codec();
  let base = fresh.get(key),
    nodes = new Map(base.nodes);
  const commits = [];
  for (let i = 0; i < 6; i++) {
    base.value.views.left[3].x += 1;
    const packed = await codec.pack(key, base.value);
    const patch = {
      revision: fresh.revision(),
      items: [],
      nodes: packed.nodes.filter(([k, v]) => nodes.get(k) !== v).map(([k, v]) => ({ key: k, owner: key, data: v })),
      blobs: [],
      deleteItems: [],
      deleteNodes: []
    };
    const t = performance.now();
    fresh.commit(patch);
    commits.push(performance.now() - t);
    nodes = new Map(packed.nodes);
  }
  commits.sort((a, b) => a - b);
  r.smallCommit = { median: +commits[3].toFixed(1), max: +commits.at(-1).toFixed(1) };
  s = performance.now();
  await codec.pack(key, base.value);
  r.clientPackMs = +(performance.now() - s).toFixed(1);
  r.missingMedia = time(() => fresh.missingMedia([crypto.createHash('sha256').update('x').digest('hex')]));
  r.snapshot = time(() => fresh.snapshot(), 3);
  r.snapshot.value = undefined;
  r.dbBytes = fs.statSync(fresh.file).size;
  fresh.close();
  console.log(JSON.stringify(r, null, 2));
  fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
