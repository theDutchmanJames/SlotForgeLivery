// Automatic library backups, run in the main process. Backups are written to a
// folder the user chose; nothing is sent anywhere. (The update check is update-check.cjs.)
const fs = require('node:fs/promises');
const path = require('node:path');

const { writeFileAtomic } = require('./export-path.cjs');

const BACKUP_PATTERN = /^Livery backup \d{4}-\d{2}-\d{2} \d{4}\.sfpaint$/;
// Unfinished backups: the current form (see writeFileAtomic) and the older one.
const PARTIAL_PATTERN =
  /^(?:\.Livery backup \d{4}-\d{2}-\d{2} \d{4}\.sfpaint\.[\w-]+|Livery backup \d{4}-\d{2}-\d{2} \d{4}\.sfpaint)\.partial$/;

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
  await writeFileAtomic(file, text);
  const limit = Math.min(100, Math.max(1, Math.round(Number(keep) || 10)));
  const names = await fs.readdir(folder);
  // A backup interrupted by a crash leaves its unfinished file behind; it was never a backup.
  for (const name of names.filter(name => PARTIAL_PATTERN.test(name))) {
    const stat = await fs.stat(path.join(folder, name)).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > 10 * 60 * 1000) await fs.unlink(path.join(folder, name)).catch(() => {});
  }
  const ours = names.filter(name => BACKUP_PATTERN.test(name)).sort();
  const removed = ours.slice(0, Math.max(0, ours.length - limit));
  for (const name of removed) await fs.unlink(path.join(folder, name)).catch(() => {});
  return { file, removed: removed.length };
}
// The Garage lists Livery's own backups in the chosen folder, newest first.
async function listBackups(folder) {
  await assertFolder(folder);
  const names = (await fs.readdir(folder)).filter(name => BACKUP_PATTERN.test(name));
  const list = [];
  for (const name of names) {
    const stat = await fs.stat(path.join(folder, name)).catch(() => null);
    if (stat?.isFile()) list.push({ name, size: stat.size, modified: stat.mtime.toISOString() });
  }
  return list.sort((a, b) => b.name.localeCompare(a.name));
}
// Reads one of those backups for Restore. Only a file named like Livery's own backups,
// directly inside the chosen folder, can be read.
async function readBackup({ folder, name }) {
  await assertFolder(folder);
  if (typeof name !== 'string' || path.basename(name) !== name || !BACKUP_PATTERN.test(name))
    throw new Error('That is not a Livery backup.');
  const file = path.join(folder, name),
    stat = await fs.stat(file);
  if (stat.size > 180 * 1024 * 1024) throw new Error('The backup exceeds 180 MB.');
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  if (data?.format !== 'slotforge-paintshop' || data.version !== 1 || data.kind !== 'library')
    throw new Error('That is not a Livery backup.');
  return data;
}
module.exports = { BACKUP_PATTERN, backupName, writeBackup, listBackups, readBackup };
