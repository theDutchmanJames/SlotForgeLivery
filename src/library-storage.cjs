const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function validateLibrary(data) {
  if (!data || data.schema !== 1 || !['templates', 'liveries', 'assets', 'projects'].every(k => Array.isArray(data[k]))) {
    throw new Error('Invalid library');
  }
  return data;
}

// All writes run in order. Only a validated primary may replace the fallback.
class LibraryStorage {
  constructor(target, io = fs) { this.target = target; this.io = io; this.queue = Promise.resolve(); this.blocked = false; }
  async read(file) { return validateLibrary(JSON.parse(await this.io.readFile(file, 'utf8'))); }
  async load() {
    try { const data = await this.read(this.target); this.blocked = false; return { data }; }
    catch (primaryError) {
      try {
        const data = await this.read(this.target + '.backup'); this.blocked = false;
        return { data, warning: 'Recovered your previous library backup. The latest file could not be read.' };
      } catch (backupError) {
        if (primaryError.code === 'ENOENT' && backupError.code === 'ENOENT') { this.blocked = false; return { data: null }; }
        this.blocked = true;
        return { data: null, error: 'Your saved library could not be read. It has not been overwritten. Restore an exported backup from Import & Export.' };
      }
    }
  }
  async archive(file, suffix) {
    try { await this.io.copyFile(file, file + '.recovery-' + suffix); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  save(data, { restore = false } = {}) {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (this.blocked && !restore) throw new Error('Restore a valid backup before saving this library.');
      validateLibrary(data);
      const json = JSON.stringify(data);
      if (Buffer.byteLength(json) > 180 * 1024 * 1024) throw new Error('Library is too large. Export unused projects before removing them.');
      await this.io.mkdir(path.dirname(this.target), { recursive: true });
      const suffix = Date.now() + '-' + randomUUID();
      if (restore) {
        await this.archive(this.target, suffix);
        await this.archive(this.target + '.backup', suffix);
      }
      let previous;
      try { previous = JSON.stringify(await this.read(this.target)); }
      catch (error) {
        if (error.code !== 'ENOENT' && !restore) await this.archive(this.target, suffix);
      }
      await this.io.writeFile(this.target + '.tmp', json, 'utf8');
      if (previous !== undefined) {
        await this.io.writeFile(this.target + '.backup.tmp', previous, 'utf8');
        await this.io.rename(this.target + '.backup.tmp', this.target + '.backup');
      }
      await this.io.rename(this.target + '.tmp', this.target);
      this.blocked = false;
      return true;
    });
    this.queue = operation;
    return operation;
  }
}
module.exports = { LibraryStorage, validateLibrary };
