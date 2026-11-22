'use strict';
// Random library contents and database checks shared by save-fuzz and crash-recovery tests.
const assert = require('node:assert/strict');
const C = (globalThis.StorageCodec = require('../../renderer/storage-codec.js'));

function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    int: n => Math.floor(next() * n),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p
  };
}
const plain = v => JSON.parse(JSON.stringify(v));
const PICTURES = Array.from(
  { length: 5 },
  (_, i) => 'data:image/png;base64,' + Buffer.from('picture-' + i + '-'.repeat(40 * (i + 1))).toString('base64')
);
const FONT = 'data:font/ttf;base64,' + Buffer.from('font'.repeat(300)).toString('base64');
const COLOURS = ['#e64a49', '#1f6feb', '#ffffff', '#111111', '#f2c94c', '#27ae60'];

function makeFuzz(r, prefix = '') {
  let counter = 0;
  const uid = p => p + '-' + prefix + ++counter;
  const region = () => ({
    id: uid('r'),
    name: 'Panel ' + counter,
    role: r.pick(['body', 'body', 'protected', 'detail']),
    markup: `<path d="M${r.int(100)} 0H${100 + r.int(400)}V${r.int(300)}Z"/>`,
    ...(r.chance(0.5) ? { colour: r.pick(COLOURS) } : {})
  });
  const view = () => ({
    bounds: { x: 0, y: 0, w: 1000, h: 600 },
    source: 'svg',
    regions: Array.from({ length: 1 + r.int(4) }, region),
    ...(r.chance(0.3) ? { vectorSource: { markup: '<svg>' + 'x'.repeat(r.pick([10, 1500])) + '</svg>' } } : {})
  });
  const template = () => {
    const views = { left: view() };
    if (r.chance(0.5)) views.right = view();
    if (r.chance(0.3)) views.top = view();
    return { id: uid('car'), name: 'Car ' + counter, scale: r.pick(['1:32', '1:24', 'HO']), views };
  };
  const group = () => ({ groupId: uid('g'), groupName: 'Group ' + counter, groupHidden: r.chance(0.2) });
  const layer = shared => {
    const base = r.chance(0.3)
      ? { id: uid('l'), kind: 'image', href: r.pick(PICTURES), x: r.int(500), y: r.int(300), w: 100, h: 80 }
      : { id: uid('l'), kind: 'rect', fill: r.pick(COLOURS), x: r.int(500), y: r.int(300), w: 50, h: 40 };
    if (shared && r.chance(0.5)) Object.assign(base, shared);
    if (r.chance(0.1)) base.note = 'n'.repeat(1100); // long text is stored as media
    if (r.chance(0.1)) base.opacity = undefined; // dropped on save
    return base;
  };
  const layers = () => {
    const g = r.chance(0.4) ? group() : null;
    return Array.from({ length: r.int(5) }, () => layer(g));
  };
  const project = templates => {
    const t = templates.length && r.chance(0.7) ? structuredClone(r.pick(templates)) : template();
    const views = {};
    for (const v of Object.keys(t.views)) views[v] = layers();
    return { id: uid('p'), name: 'Livery ' + counter, template: t, views, base: r.pick(COLOURS), updated: counter };
  };
  const make = {
    templates: template,
    projects: project,
    liveries: () => ({ id: uid('lv'), name: 'Saved ' + counter, views: { left: layers() } }),
    assets: () =>
      r.chance(0.5)
        ? { id: uid('a'), name: 'Picture ' + counter, type: 'image', data: r.pick(PICTURES) }
        : { id: uid('a'), name: 'Shape ' + counter, type: 'shape', markup: '<rect width="9" height="9"/>' },
    fonts: () => ({
      id: uid('f'),
      name: 'Font ' + counter,
      fontData: { src: FONT, family: 'Fam' + r.int(3), name: 'Font ' + counter }
    })
  };
  // Change a full item in a way the app could.
  const edit = (bucket, item) => {
    const choice = r.int(8);
    if (choice === 0) item.name = 'Renamed ' + ++counter;
    else if (choice === 1) item.notes = r.chance(0.5) ? 'Notes ' + counter : undefined;
    else if (choice === 2 && item.views && bucket !== 'templates') {
      const lists = Object.values(item.views);
      const list = r.pick(lists);
      const op = r.int(5);
      if (op === 0 || !list.length) list.push(layer(r.chance(0.5) && list[0]?.groupId ? pickGroup(list[0]) : null));
      else if (op === 1) list.splice(r.int(list.length), 1);
      else if (op === 2) r.pick(list).fill = r.pick(COLOURS);
      else if (op === 3) list.reverse();
      else {
        // Rename or ungroup a group: every member changes together, or one splits off.
        const l = r.pick(list);
        if (l.groupId)
          for (const m of r.chance(0.5) ? list.filter(x => x.groupId === l.groupId) : [l])
            m.groupName = 'Group ' + ++counter;
        else Object.assign(l, group());
      }
    } else if (choice === 3) {
      const t = bucket === 'templates' ? item : item.template;
      if (t) {
        const v = r.pick(Object.values(t.views));
        if (r.chance(0.3) && v.regions.length > 1) v.regions.pop();
        else if (r.chance(0.3)) v.regions.push(region());
        else r.pick(v.regions).colour = r.pick(COLOURS);
      }
    } else if (choice === 4) item.trashedAt = r.chance(0.5) ? counter : undefined;
    else if (choice === 5 && bucket === 'projects') item.base = r.pick(COLOURS);
    else if (choice === 6 && bucket === 'projects' && r.chance(0.5)) {
      // Add or drop a whole view.
      const names = ['left', 'right', 'top'].filter(n => !item.template.views[n]);
      if (names.length) {
        const n = r.pick(names);
        item.template.views[n] = view();
        item.views[n] = layers();
      } else if (Object.keys(item.template.views).length > 1) {
        const n = r.pick(Object.keys(item.template.views).filter(x => x !== 'left'));
        delete item.template.views[n];
        delete item.views[n];
      }
    } else if (choice === 7 && bucket === 'assets' && item.type === 'image') item.data = r.pick(PICTURES);
    else item.updated = ++counter;
    return item;
  };
  const pickGroup = l => ({ groupId: l.groupId, groupName: l.groupName, groupHidden: l.groupHidden });
  return { make, edit };
}

function tables(lib) {
  const rows = sql => lib.db.prepare(sql).all();
  return {
    items: rows('SELECT key,bucket,identity,position,root,summary FROM items ORDER BY key'),
    nodes: rows('SELECT key,owner,data FROM nodes ORDER BY key'),
    blobs: rows('SELECT hash FROM blobs ORDER BY hash').map(x => x.hash),
    refs: rows('SELECT node,hash FROM blob_refs ORDER BY node,hash')
  };
}
// Database-wide invariants, beyond what a commit checks for the items it touches.
function checkDatabase(lib, truth, label) {
  assert.equal(lib.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', label);
  assert.deepEqual(lib.db.prepare('PRAGMA foreign_key_check').all(), [], label + ': foreign keys');
  const t = tables(lib);
  const byOwner = new Map();
  for (const n of t.nodes) {
    if (!byOwner.has(n.owner)) byOwner.set(n.owner, new Map());
    byOwner.get(n.owner).set(n.key, n.data);
  }
  const referenced = new Set();
  for (const item of t.items) {
    const nodes = byOwner.get(item.key) || new Map(),
      seen = new Set();
    const walk = key => {
      assert(nodes.has(key), `${label}: ${item.key} misses record ${key}`);
      if (seen.has(key)) return;
      seen.add(key);
      const r = C.refs(JSON.parse(nodes.get(key)));
      r.nodes.forEach(walk);
      r.blobs.forEach(h => referenced.add(h));
    };
    walk(item.root);
    assert.equal(seen.size, nodes.size, `${label}: ${item.key} keeps ${nodes.size - seen.size} unused records`);
    byOwner.delete(item.key);
  }
  assert.equal(byOwner.size, 0, `${label}: records without an item`);
  const refs = new Set(t.refs.map(x => x.node + ' ' + x.hash));
  for (const n of t.nodes)
    for (const h of new Set(C.refs(JSON.parse(n.data)).blobs))
      assert(refs.has(n.key + ' ' + h), `${label}: media reference missing for ${n.key}`);
  assert.equal(refs.size, t.refs.length);
  const previous = new Set(
    lib.db
      .prepare('SELECT hash FROM previous_blobs')
      .all()
      .map(x => x.hash)
  );
  for (const h of t.blobs)
    assert(referenced.has(h) || previous.has(h), `${label}: media ${h.slice(0, 8)} is kept but unused`);
  for (const h of referenced) assert(t.blobs.includes(h), `${label}: media ${h.slice(0, 8)} is missing`);
  // The Garage lists summaries without loading items; they must match the item.
  for (const b of C.buckets)
    truth[b].forEach((value, position) => {
      const row = t.items.find(i => i.key === C.keyOf(b, value.id));
      assert(row, `${label}: ${b} ${value.id} missing`);
      assert.equal(row.position, position, `${label}: ${b} ${value.id} position`);
      assert.deepEqual(JSON.parse(row.summary), plain(C.summary(b, value)), `${label}: ${b} ${value.id} summary`);
    });
  return t;
}

// The library header's key order differs between the two saves; its value is
// compared by the snapshot. Everything else must be stored identically.
function sameRows(fast, slow, label) {
  const keyed = rows =>
    new Map(rows.filter(x => x.key !== '$meta' && x.owner !== '$meta').map(x => [x.key, JSON.stringify(x)]));
  const a = keyed(fast),
    b = keyed(slow);
  for (const [k, v] of a) assert.equal(v, b.get(k), `${label}: ${k}`);
  for (const k of b.keys()) assert(a.has(k), `${label}: fast save lacks ${k}`);
}

// Key order does not matter: the same library always hashes the same.
const canon = v =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, canon(v[k])])
        )
      : v;
const hash = v =>
  require('node:crypto')
    .createHash('sha256')
    .update(JSON.stringify(canon(plain(v))))
    .digest('hex');
module.exports = { hash, rng, plain, makeFuzz, tables, checkDatabase, sameRows };
