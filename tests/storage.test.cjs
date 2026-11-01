const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LibraryStorage } = require('../src/library-storage.cjs');
const empty = () => ({ schema: 1, templates: [], liveries: [], assets: [], projects: [], current: null });
async function fixture(t, io = fs) {
  await fs.mkdir(path.resolve('test-output'), {recursive:true});
  const dir = await fs.mkdtemp(path.resolve('test-output/storage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'library.json');
  return { dir, target, storage: new LibraryStorage(target, io) };
}
test('failed replacement after fallback recovery preserves the good backup', async t => {
  const io = { ...fs, rename: async () => { throw Object.assign(new Error('Locked'), { code: 'EPERM' }); } };
  const { target, storage } = await fixture(t, io), good = empty();
  await fs.writeFile(target, 'broken json'); await fs.writeFile(target + '.backup', JSON.stringify(good));
  assert.deepEqual((await storage.load()).data, good);
  await assert.rejects(storage.save(good), /Locked/);
  assert.deepEqual(JSON.parse(await fs.readFile(target + '.backup', 'utf8')), good);
  assert.equal(await fs.readFile(target, 'utf8'), 'broken json');
  assert.deepEqual((await new LibraryStorage(target).load()).data, good);
});
test('recovery blocks ordinary saves and archives originals before restoring', async t => {
  const { target, storage, dir } = await fixture(t);
  await fs.writeFile(target, 'corrupt primary'); await fs.writeFile(target + '.backup', 'corrupt backup');
  assert((await storage.load()).error); await assert.rejects(storage.save(empty()), /Restore/);
  const restored = { ...empty(), assets: [{ name: 'Recovered' }] };
  await storage.save(restored, { restore: true });
  assert.equal(storage.blocked, false); assert.deepEqual((await new LibraryStorage(target).load()).data, restored);
  const archives = (await fs.readdir(dir)).filter(n => n.includes('.recovery-'));
  assert.equal(archives.length, 2);
  assert.deepEqual((await Promise.all(archives.map(n => fs.readFile(path.join(dir,n),'utf8')))).sort(), ['corrupt backup','corrupt primary']);
  await storage.save(empty()); assert.deepEqual(JSON.parse(await fs.readFile(target + '.backup','utf8')), restored);
});
test('failed restore keeps recovery blocked and original files intact', async t => {
  const io = { ...fs, rename: async () => { throw new Error('Replacement failed'); } };
  const { target, storage } = await fixture(t, io); await fs.writeFile(target,'corrupt');
  await storage.load(); await assert.rejects(storage.save(empty(), { restore: true }), /Replacement failed/);
  assert.equal(storage.blocked,true); assert.equal(await fs.readFile(target,'utf8'),'corrupt');
});
test('missing or structurally invalid primary can recover the valid fallback', async t => {
  const { target, storage } = await fixture(t); await fs.writeFile(target + '.backup',JSON.stringify(empty()));
  assert.deepEqual((await storage.load()).data,empty());
  await fs.writeFile(target,JSON.stringify({schema:1,projects:[]}));
  assert.deepEqual((await storage.load()).data,empty());
});
test('ordered saves preserve the previous successful library and reject invalid input', async t => {
  const { target, storage } = await fixture(t); const first={...empty(),current:'first'},second={...empty(),current:'second'};
  await Promise.all([storage.save(first),storage.save(second)]);
  assert.deepEqual((await storage.load()).data,second);
  assert.deepEqual(JSON.parse(await fs.readFile(target+'.backup','utf8')),first);
  await assert.rejects(storage.save({schema:1,projects:[]}),/Invalid library/);
  assert.deepEqual((await storage.load()).data,second);
});
