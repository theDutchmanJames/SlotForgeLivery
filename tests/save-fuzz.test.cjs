'use strict';
// Random-sequence testing of saves. Thousands of random library actions run
// through the fast save (LibraryClient: only changed records, items unloaded to
// placeholders after each save) and the full save (SQLiteLibrary.replace). After
// every save the stored library must match the truth, the database must stay
// valid (no stale, missing or unreferenced records or media), and the full save
// of the same truth must store exactly the same records.
//
// SAVE_FUZZ_SEEDS=5 SAVE_FUZZ_STEPS=400 widen the run; SAVE_FUZZ_SEED=123 replays one seed.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { SQLiteLibrary } = require('../src/sqlite-library.cjs');
const { rng, plain, makeFuzz, checkDatabase, sameRows } = require('./fixtures/library-fuzz.cjs');
const C = globalThis.StorageCodec;
require('../renderer/library-client.js');
const { LibraryClient } = globalThis;

async function run(seed, steps, dir) {
  const r = rng(seed),
    fuzz = makeFuzz(r);
  const legacy = path.join(dir, 'fast', 'library.json'),
    fullFile = path.join(dir, 'full', 'library.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.mkdirSync(path.dirname(fullFile), { recursive: true });
  let truth = { schema: 1, templates: [], liveries: [], assets: [], fonts: [], projects: [], current: null };
  fs.writeFileSync(legacy, JSON.stringify(truth));
  let lib = new SQLiteLibrary(legacy);
  const full = new SQLiteLibrary(fullFile);
  const open = async () => {
    const client = new LibraryClient({
      save: p => lib.commit(plain(p)),
      libraryItem: k => plain(lib.get(k)),
      libraryMissingMedia: h => lib.missingMedia(h)
    });
    return { client, store: client.accept(plain(await lib.load())) };
  };
  let { client, store } = await open();
  await full.load();
  const history = []; // earlier full versions of items, for undo
  let before = plain(truth),
    revision = client.revision;
  const log = [];
  const where = (bucket, id) => store[bucket].findIndex(x => x.id === id);
  try {
    for (let step = 0; step < steps; step++) {
      const bucket = r.pick([...C.buckets, 'projects', 'projects']),
        list = truth[bucket],
        action = list.length ? r.int(10) : 0;
      const target = list.length ? r.int(list.length) : -1;
      if (action <= 1) {
        const value = fuzz.make[bucket](truth.templates);
        const at = r.int(list.length + 1);
        list.splice(at, 0, value);
        store[bucket].splice(at, 0, structuredClone(value));
        log.push(`add ${bucket} ${value.id} at ${at}`);
      } else if (action <= 4) {
        // Open the item and change it in place, as the studio does.
        const id = list[target].id;
        history.push({ bucket, value: structuredClone(list[target]) });
        const next = fuzz.edit(bucket, structuredClone(list[target]));
        list[target] = next;
        const live = await client.hydrate(store, bucket, id);
        for (const k of Object.keys(live)) delete live[k];
        Object.assign(live, structuredClone(next));
        log.push(`edit ${bucket} ${id}`);
      } else if (action === 5) {
        // Write a new full value over the item without opening it first
        // (Finish preparation, Rebuild, imports replacing a car).
        const id = list[target].id;
        history.push({ bucket, value: structuredClone(list[target]) });
        const next = fuzz.edit(bucket, structuredClone(list[target]));
        list[target] = next;
        store[bucket][where(bucket, id)] = structuredClone(next);
        log.push(`replace ${bucket} ${id}`);
      } else if (action === 6) {
        const [gone] = list.splice(target, 1);
        store[bucket].splice(where(bucket, gone.id), 1);
        if (bucket === 'projects' && truth.current === gone.id) truth.current = store.current = null;
        log.push(`delete ${bucket} ${gone.id}`);
      } else if (action === 7) {
        // Reorder: move one item, loaded or not.
        const to = r.int(list.length);
        const [moved] = list.splice(target, 1);
        list.splice(to, 0, moved);
        const [m] = store[bucket].splice(where(bucket, moved.id), 1);
        store[bucket].splice(to, 0, m);
        log.push(`move ${bucket} ${moved.id} to ${to}`);
      } else if (action === 8) {
        // Undo: bring back an earlier version of an item that still exists.
        const old = history.filter(h => h.bucket === bucket && list.some(x => x.id === h.value.id)).pop();
        if (old) {
          const i = list.findIndex(x => x.id === old.value.id);
          list[i] = structuredClone(old.value);
          if (r.chance(0.5)) store[bucket][where(bucket, old.value.id)] = structuredClone(old.value);
          else {
            const live = await client.hydrate(store, bucket, old.value.id);
            for (const k of Object.keys(live)) delete live[k];
            Object.assign(live, structuredClone(old.value));
          }
          log.push(`undo ${bucket} ${old.value.id}`);
        }
      } else if (bucket === 'projects') {
        const id = r.chance(0.2) ? null : list[target].id;
        truth.current = store.current = id;
        if (id) await client.hydrate(store, 'projects', id);
        log.push(`current ${id}`);
      }
      if (r.chance(0.35) || step === steps - 1) {
        const keepLoaded = r.chance(0.2);
        await client.save(store, { keepLoaded });
        log.push('save' + (keepLoaded ? ' (keep loaded)' : ''));
        const label = `seed ${seed} step ${step}`;
        const expected = plain(truth);
        assert.deepEqual(lib.snapshot(), expected, label + ': fast save stored something else');
        // Bring back previous saved library = the state before the last real change.
        if (client.revision !== revision) {
          assert.deepEqual(lib.snapshot(true), before, label + ': previous saved library');
          before = expected;
          revision = client.revision;
        }
        const fast = checkDatabase(lib, truth, label + ' fast');
        if (r.chance(0.3) || step === steps - 1) {
          await full.replace(structuredClone(truth));
          const slow = checkDatabase(full, truth, label + ' full');
          sameRows(fast.items, slow.items, label + ': fast and full save store different items');
          sameRows(fast.nodes, slow.nodes, label + ': fast and full save store different records');
        }
        if (r.chance(0.1)) {
          // Close and reopen: the next session starts from placeholders again.
          lib.close();
          lib = new SQLiteLibrary(legacy);
          ({ client, store } = await open());
          revision = client.revision;
          log.push('reopen');
        }
      }
    }
  } catch (e) {
    e.message += `\nLast actions:\n  ${log.slice(-12).join('\n  ')}\nReplay: SAVE_FUZZ_SEED=${seed}`;
    throw e;
  } finally {
    lib.close();
    full.close();
  }
}

test('random action sequences save the same through the fast and the full save', async t => {
  fs.mkdirSync('test-output', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('test-output/save-fuzz-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const seeds = process.env.SAVE_FUZZ_SEED
    ? [Number(process.env.SAVE_FUZZ_SEED)]
    : Array.from({ length: Number(process.env.SAVE_FUZZ_SEEDS || 4) }, (_, i) => 1000 + i * 7919);
  const steps = Number(process.env.SAVE_FUZZ_STEPS || 250);
  for (const seed of seeds) await run(seed, steps, path.join(root, String(seed)));
});
