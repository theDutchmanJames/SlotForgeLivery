'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const maintenance = require('../src/maintenance.cjs');
const pkg = (kind = 'library') => ({ format: 'slotforge-paintshop', version: 1, kind, data: { schema: 1 } });

test('versions compare numerically, ignoring a leading v', () => {
  assert.equal(maintenance.newerVersion('1.10.0', '1.3.0'), true);
  assert.equal(maintenance.newerVersion('v1.3.1', '1.3.0'), true);
  assert.equal(maintenance.newerVersion('1.3.0', '1.3.0'), false);
  assert.equal(maintenance.newerVersion('1.2.9', '1.3.0'), false);
  assert.equal(maintenance.newerVersion('2', '1.9.9'), true);
});

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

test('the update check reads the latest release and only links to the releases page', async () => {
  const fake = release => async (url, options) => {
    assert.match(url, /api\.github\.com\/repos\/theDutchmanJames\/SlotForgeLivery\/releases\/latest$/);
    assert.equal(options.headers['User-Agent'], 'SlotForge-Livery', 'no personal details are sent');
    return { ok: true, json: async () => release };
  };
  const newer = await maintenance.checkForUpdate(
    '1.3.0',
    fake({ tag_name: 'v1.4.0', html_url: 'https://github.com/theDutchmanJames/SlotForgeLivery/releases/tag/v1.4.0' })
  );
  assert.deepEqual(newer, {
    current: '1.3.0',
    latest: '1.4.0',
    newer: true,
    url: 'https://github.com/theDutchmanJames/SlotForgeLivery/releases/tag/v1.4.0'
  });
  const same = await maintenance.checkForUpdate(
    '1.3.0',
    fake({ tag_name: '1.3.0', html_url: 'https://evil.example/x' })
  );
  assert.equal(same.newer, false);
  assert.equal(same.url, maintenance.RELEASES_PAGE + '/latest', 'unexpected links are replaced');
  await assert.rejects(
    maintenance.checkForUpdate('1.3.0', async () => ({ ok: false })),
    /could not reach/
  );
});
