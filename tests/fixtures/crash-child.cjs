'use strict';
// Child process for crash-recovery.test.cjs. It writes in a loop until it is
// killed, announcing each state before writing it ("want <hash>") and after it
// is safely written ("saved <hash>"). CRASH_POINT kills it from inside a write.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { SQLiteLibrary } = require('../../src/sqlite-library.cjs');
const maintenance = require('../../src/maintenance.cjs');
const { writeFileAtomic } = require('../../src/export-path.cjs');
const { rng, plain, makeFuzz, hash } = require('./library-fuzz.cjs');
const C = globalThis.StorageCodec;
require('../../renderer/library-client.js');
const [mode, dir, seedText] = process.argv.slice(2);
const r = rng(Number(seedText)),
  fuzz = makeFuzz(r, seedText + '.');
const say = line => fs.writeSync(1, line + '\n');
let hookCalls = 0;
const crashAt = name => () => {
  if (process.env.CRASH_POINT === name && ++hookCalls >= Number(process.env.CRASH_AFTER || 1)) {
    say('crashing ' + name);
    process.kill(process.pid, 'SIGKILL');
  }
};
const randomLibrary = () => {
  const data = { schema: 1, templates: [], liveries: [], assets: [], fonts: [], projects: [], current: null };
  for (let i = r.int(6); i >= 0; i--) {
    const b = r.pick(C.buckets);
    data[b].push(fuzz.make[b](data.templates));
  }
  return data;
};
(async () => {
  const legacy = path.join(dir, 'library.json');
  if (mode === 'save' || mode === 'restore') {
    const lib = new SQLiteLibrary(legacy, { beforeCommit: crashAt('commit'), beforePublish: crashAt('publish') });
    const loaded = await lib.load();
    if (loaded.error) throw Error('Could not open: ' + loaded.error);
    const client = new globalThis.LibraryClient({
      save: p => lib.commit(plain(p)),
      libraryItem: k => plain(lib.get(k)),
      libraryMissingMedia: h => lib.missingMedia(h)
    });
    const store = client.accept(plain(loaded));
    let truth = lib.snapshot();
    say('ready ' + hash(truth));
    for (;;) {
      if (mode === 'restore') {
        truth = randomLibrary();
        say('want ' + hash(truth));
        await lib.replace(structuredClone(truth));
        say('saved ' + hash(truth));
        continue;
      }
      // A few random changes, then one save, as the studio does.
      for (let n = 1 + r.int(4); n > 0; n--) {
        const bucket = r.pick(C.buckets),
          list = truth[bucket],
          action = list.length ? r.int(5) : 0,
          i = r.int(list.length);
        if (action <= 1) {
          const value = fuzz.make[bucket](truth.templates);
          // Imports bring many pictures at once.
          if (bucket === 'assets' && r.chance(0.3))
            value.data = 'data:image/png;base64,' + crypto.randomBytes(3e5).toString('base64');
          list.push(value);
          store[bucket].push(structuredClone(value));
        } else if (action <= 3) {
          const id = list[i].id,
            next = fuzz.edit(bucket, structuredClone(list[i]));
          list[i] = next;
          if (action === 2) {
            const live = await client.hydrate(store, bucket, id);
            for (const k of Object.keys(live)) delete live[k];
            Object.assign(live, structuredClone(next));
          } else store[bucket][store[bucket].findIndex(x => x.id === id)] = structuredClone(next);
        } else {
          const [gone] = list.splice(i, 1);
          store[bucket].splice(
            store[bucket].findIndex(x => x.id === gone.id),
            1
          );
        }
      }
      say('want ' + hash(truth));
      await client.save(store);
      say('saved ' + hash(truth));
    }
  }
  if (mode === 'backup') {
    say('ready');
    for (;;) {
      const data = {
        format: 'slotforge-paintshop',
        version: 1,
        kind: 'library',
        library: { pad: crypto.randomBytes(1e5 + r.int(4e6)).toString('base64') }
      };
      say('want ' + hash(data));
      await maintenance.writeBackup({ folder: dir, data, keep: 3 }, async () => {});
      say('saved ' + hash(data));
    }
  }
  if (mode === 'export') {
    const file = path.join(dir, 'Exported livery.sfpaint');
    say('ready');
    for (;;) {
      const data = { format: 'slotforge-paintshop', pad: crypto.randomBytes(1e5 + r.int(4e6)).toString('base64') };
      say('want ' + hash(data));
      await writeFileAtomic(file, JSON.stringify(data));
      say('saved ' + hash(data));
    }
  }
})().catch(e => {
  say('error ' + e.message);
  process.exit(1);
});
