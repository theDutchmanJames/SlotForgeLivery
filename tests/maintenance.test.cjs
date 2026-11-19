'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const maintenance = require('../src/maintenance.cjs');
const pkg = (kind = 'library') => ({ format: 'slotforge-paintshop', version: 1, kind, data: { schema: 1 } });

test('backups are written as library packages and only Livery backups are pruned', async t => {
  fs.mkdirSync('test-output', { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('test-output/backups-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const old = ['Livery backup 2026-01-01 0900.sfpaint', 'Livery backup 2026-01-02 0900.sfpaint'];
  for (const name of old) fs.writeFileSync(path.join(dir, name), '{}');
  fs.writeFileSync(path.join(dir, 'My own notes.sfpaint'), 'keep me');
  const checked = [];
  const result = await maintenance.writeBackup({ folder: dir, data: pkg(), keep: 2 }, file => checked.push(file));
  assert.equal(path.dirname(result.file), dir);
  assert.match(path.basename(result.file), maintenance.BACKUP_PATTERN);
  assert.deepEqual(checked, [result.file], 'the target is checked against the live library first');
  assert.equal(result.removed, 1);
  const left = fs.readdirSync(dir).sort();
  assert(!left.includes(old[0]), 'the oldest backup is removed');
  assert(left.includes(old[1]) && left.includes('My own notes.sfpaint'), 'other files are never touched');
  assert.equal(JSON.parse(fs.readFileSync(result.file, 'utf8')).kind, 'library');
  await assert.rejects(
    maintenance.writeBackup({ folder: dir, data: pkg('project') }, () => {}),
    /Invalid backup/
  );
  await assert.rejects(
    maintenance.writeBackup({ folder: 'relative/folder', data: pkg() }, () => {}),
    /Choose a backup/
  );
  await assert.rejects(
    maintenance.writeBackup({ folder: path.join(dir, 'missing'), data: pkg() }, () => {}),
    /no longer available/
  );
});
