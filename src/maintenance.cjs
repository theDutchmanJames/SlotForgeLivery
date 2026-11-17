// Automatic library backups and the update check, run in the main process.
// Neither sends any user data anywhere: backups are written to a folder the
// user chose, and the update check is a plain request for the latest release.
const fs = require('node:fs/promises');
const path = require('node:path');

const BACKUP_PATTERN = /^Livery backup \d{4}-\d{2}-\d{2} \d{4}\.sfpaint$/;
const RELEASES_API = 'https://api.github.com/repos/theDutchmanJames/SlotForgeLivery/releases/latest';
const RELEASES_PAGE = 'https://github.com/theDutchmanJames/SlotForgeLivery/releases';

function backupName(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `Livery backup ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}.sfpaint`;
}
async function assertFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Choose a backup folder first.');
  const stat = await fs.stat(folder).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('The backup folder is no longer available. Choose it again in Settings.');
}
// Writes one backup and keeps only the newest `keep` automatic backups. Only
// files named exactly like Livery's own backups are ever removed.
async function writeBackup({ folder, data, keep = 10 }, assertTarget) {
  await assertFolder(folder);
  if (data?.format !== 'slotforge-paintshop' || data.version !== 1 || data.kind !== 'library')
    throw new Error('Invalid backup');
  const text = JSON.stringify(data);
  if (text.length > 180 * 1024 * 1024) throw new Error('The library exceeds 180 MB; export it in parts instead.');
  const file = path.join(folder, backupName());
  await assertTarget(file);
  await fs.writeFile(file, text);
  const limit = Math.min(100, Math.max(1, Math.round(Number(keep) || 10)));
  const ours = (await fs.readdir(folder)).filter(name => BACKUP_PATTERN.test(name)).sort();
  const removed = ours.slice(0, Math.max(0, ours.length - limit));
  for (const name of removed) await fs.unlink(path.join(folder, name)).catch(() => {});
  return { file, removed: removed.length };
}
// "1.3.0" < "1.10.0"; a leading "v" is ignored.
function newerVersion(latest, current) {
  const parts = v =>
    String(v || '')
      .replace(/^v/i, '')
      .split('.')
      .map(n => parseInt(n, 10) || 0);
  const a = parts(latest),
    b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}
async function checkForUpdate(current, fetcher) {
  const release = process.env.PAINTSHOP_TEST_UPDATE
    ? JSON.parse(process.env.PAINTSHOP_TEST_UPDATE)
    : await fetcher(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SlotForge-Livery' }
      }).then(r => {
        if (!r.ok) throw new Error('The update check could not reach GitHub.');
        return r.json();
      });
  const latest = String(release?.tag_name || '').replace(/^v/i, '');
  if (!/^\d+(\.\d+){0,3}$/.test(latest)) throw new Error('No release information found.');
  const url = String(release.html_url || '');
  return {
    current,
    latest,
    newer: newerVersion(latest, current),
    url: url.startsWith(RELEASES_PAGE + '/') ? url : RELEASES_PAGE + '/latest'
  };
}
module.exports = { BACKUP_PATTERN, RELEASES_PAGE, backupName, writeBackup, newerVersion, checkForUpdate };
