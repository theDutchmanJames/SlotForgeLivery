'use strict';
// Crash and interruption tests. A child process saves, restores, migrates,
// backs up or exports in a loop and is killed at a random moment, or from inside
// a save at its most delicate point. Afterwards the library must open cleanly and
// hold either the last saved state or the one being saved, never a mix; every
// backup and export on disk must be complete; and nothing half-written may stay.
//
// CRASH_ROUNDS=40 widens the run (default 8 per kind).
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const { SQLiteLibrary } = require('../src/sqlite-library.cjs');
const maintenance = require('../src/maintenance.cjs');
const { rng, plain, makeFuzz, hash, checkDatabase } = require('./fixtures/library-fuzz.cjs');
const C = globalThis.StorageCodec;
const ROUNDS = Number(process.env.CRASH_ROUNDS || 8);
const child = path.join(__dirname, 'fixtures', 'crash-child.cjs');

// Runs the child until it is killed. Returns the announced states.
function crashOnce(mode, dir, seed, { point, after, delay }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (point) Object.assign(env, { CRASH_POINT: point, CRASH_AFTER: String(after) });
    const p = spawn(process.execPath, [child, mode, dir, String(seed)], { env, windowsHide: true });
    const lines = [];
    let buffer = '',
      timer,
      errors = '';
    p.stderr.on('data', d => (errors += d));
    p.stdout.on('data', d => {
      buffer += d;
      const parts = buffer.split('\n');
      buffer = parts.pop();
      for (const line of parts) {
        lines.push(line);
        if (line.startsWith('ready') && !point) timer = setTimeout(() => p.kill('SIGKILL'), delay);
      }
    });
    // A crash point that is never reached still ends the round.
    const limit = setTimeout(() => p.kill('SIGKILL'), point ? 20000 : delay + 20000);
    p.on('error', reject);
    p.on('exit', () => {
      clearTimeout(timer);
      clearTimeout(limit);
      if (buffer) lines.push(buffer);
      const failed = lines.find(l => l.startsWith('error'));
      if (failed) return reject(Error(`${mode} child: ${failed}\n${errors}`));
      resolve(lines);
    });
  });
}
// The states a crash may leave: the last one written completely, or the one being written.
function outcome(lines, before) {
  let saved = before,
    want = null;
  for (const line of lines) {
    const [word, value] = line.split(' ');
    if (word === 'ready' && value) saved = value;
    if (word === 'want') want = value;
    if (word === 'saved') {
      saved = value;
      want = null;
    }
  }
  return { saved, want, ok: [saved, want].filter(Boolean) };
}
// Every third round crashes from inside a save instead of at a random time.
const settings = (r, round, point) =>
  round % 3 === 2 ? { point, after: 1 + r.int(3) } : { delay: 20 + r.int(round % 2 ? 1500 : 300) };
async function openLibrary(dir) {
  const lib = new SQLiteLibrary(path.join(dir, 'library.json'));
  const loaded = await lib.load();
  assert(!loaded.error, 'The library opens after a crash: ' + loaded.error);
  return lib;
}
// Anything left beside the library besides its own files.
function leftovers(dir) {
  return fs.readdirSync(dir).filter(
    n =>
      // A journal SQLite had not finished is not used again; the next save replaces it.
      !/^library\.(json|sqlite|sqlite\.opened|sqlite-journal)$/.test(n) &&
      !/^library\.sqlite\.recovery-[\w-]+$/.test(n) /* restore keeps the replaced library */
  );
}

fs.mkdirSync('test-output', { recursive: true });
const root = fs.mkdtempSync(path.resolve('test-output/crash-recovery-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

for (const mode of ['save', 'restore']) {
  test(`killing Livery during a library ${mode} loses nothing and leaves no half-written state`, async () => {
    const dir = path.join(root, mode),
      r = rng(mode === 'save' ? 11 : 23);
    fs.mkdirSync(dir, { recursive: true });
    let state = null;
    for (let round = 0; round < ROUNDS; round++) {
      const how = settings(r, round, mode === 'save' ? 'commit' : 'publish');
      const lines = await crashOnce(mode, dir, 100 + round, how);
      const { ok } = outcome(lines, state);
      const lib = await openLibrary(dir);
      try {
        const data = lib.snapshot(),
          now = hash(data);
        assert(
          ok.includes(now),
          `${mode} round ${round} (${JSON.stringify(how)}): stored state is neither saved nor being saved` +
            `
  stored ${now.slice(0, 8)}, earlier: ${lines.map(l => l.slice(0, 14)).join(', ')}`
        );
        checkDatabase(lib, data, `${mode} round ${round}`);
        state = now;
      } finally {
        lib.close();
      }
      assert.deepEqual(leftovers(dir), [], `${mode} round ${round}: files left behind`);
    }
  });
}

test('killing Livery while it moves an older library to SQLite keeps the original and migrates on the next start', async () => {
  const r = rng(31),
    fuzz = makeFuzz(r);
  for (let round = 0; round < ROUNDS; round++) {
    const dir = path.join(root, 'migrate-' + round);
    fs.mkdirSync(dir, { recursive: true });
    const data = { schema: 1, templates: [], liveries: [], assets: [], fonts: [], projects: [], current: null };
    for (let i = 0; i < 4; i++) {
      const b = r.pick(C.buckets);
      data[b].push(fuzz.make[b](data.templates));
    }
    const original = JSON.stringify(data);
    fs.writeFileSync(path.join(dir, 'library.json'), original);
    const how = round % 2 ? { point: 'publish', after: 1 } : { delay: r.int(120) };
    await crashOnce('save', dir, 200 + round, how);
    assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), original, 'the original file is untouched');
    const lib = await openLibrary(dir);
    try {
      // The migrated library may already carry the child's first saves after it.
      const stored = lib.snapshot();
      if (how.point) assert.equal(hash(stored), hash(plain(data)), `migrate round ${round}: library migrated again`);
      checkDatabase(lib, stored, `migrate round ${round}`);
    } finally {
      lib.close();
    }
    assert.deepEqual(leftovers(dir), [], `migrate round ${round}: files left behind`);
  }
});

test('killing Livery during a backup never leaves a broken backup', async () => {
  const dir = path.join(root, 'backup'),
    r = rng(41),
    announced = new Set();
  fs.mkdirSync(dir, { recursive: true });
  for (let round = 0; round < ROUNDS; round++) {
    const lines = await crashOnce('backup', dir, 300 + round, { delay: 20 + r.int(1500) });
    for (const l of lines) if (/^(want|saved) /.test(l)) announced.add(l.split(' ')[1]);
    for (const name of fs.readdirSync(dir).filter(n => maintenance.BACKUP_PATTERN.test(n))) {
      const backup = await maintenance.readBackup({ folder: dir, name });
      assert(announced.has(hash(backup)), `backup round ${round}: ${name} holds something never written`);
    }
    // Unfinished backups carry their own name and are never listed as backups.
    const listed = (await maintenance.listBackups(dir)).map(b => b.name);
    assert(listed.every(n => maintenance.BACKUP_PATTERN.test(n)));
  }
  // An old unfinished backup is cleared by the next backup.
  const stale = fs.readdirSync(dir).filter(n => n.endsWith('.partial'));
  const old = new Date(Date.now() - 3600e3);
  for (const n of stale) fs.utimesSync(path.join(dir, n), old, old);
  await maintenance.writeBackup(
    { folder: dir, data: { format: 'slotforge-paintshop', version: 1, kind: 'library' }, keep: 3 },
    async () => {}
  );
  assert.deepEqual(
    fs.readdirSync(dir).filter(n => n.endsWith('.partial')),
    [],
    'unfinished backups are cleaned up'
  );
});

test('killing Livery during an export keeps the previous file whole', async () => {
  const dir = path.join(root, 'export'),
    r = rng(51),
    file = path.join(dir, 'Exported livery.sfpaint');
  fs.mkdirSync(dir, { recursive: true });
  let state = null;
  for (let round = 0; round < ROUNDS; round++) {
    const lines = await crashOnce('export', dir, 400 + round, { delay: 20 + r.int(1500) });
    const { ok } = outcome(lines, state);
    if (!fs.existsSync(file)) {
      assert.equal(state, null, 'an exported file never disappears');
      continue;
    }
    const now = hash(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert(ok.includes(now), `export round ${round}: the file is neither the previous nor the new export`);
    state = now;
  }
});
