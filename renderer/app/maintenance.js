// Livery renderer · Automatic backups and the update check.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const BACKUP_EVERY = { off: 0, daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 },
  BACKUP_KEEP = [5, 10, 20, 50],
  UPDATE_EVERY = 24 * 3600e3;
const backupSettings = () => ({ every: 'off', keep: 10, folder: '', ...(store.settings?.backup || {}) });
function setBackup(patch) {
  setPreference('backup', { ...backupSettings(), ...patch });
}
function when(iso) {
  return iso ? new Date(iso).toLocaleString() : 'never';
}
function maintenanceSettingsHTML() {
  const b = backupSettings(),
    desktop = !!window.desktop?.writeBackup;
  return `<section class="settings-card" id="backup-settings"><h2>Automatic backups</h2><p>Livery saves a copy of your whole library into a folder you choose, such as a cloud-synced or external drive. Backups import like any package.</p>
  <div class="pref-grid"><div class="field"><label>Backup folder</label><div class="row"><input id="backup-folder" value="${e(b.folder)}" readonly placeholder="No folder chosen"><button id="backup-choose" ${desktop ? '' : 'disabled'}>Choose…</button></div></div>
  <div class="field"><label for="backup-every">How often</label><select id="backup-every">${Object.keys(BACKUP_EVERY)
    .map(
      k =>
        `<option value="${k}" ${b.every === k ? 'selected' : ''}>${k === 'off' ? 'Off' : k === 'daily' ? 'Every day' : 'Every week'}</option>`
    )
    .join('')}</select></div>
  <div class="field"><label for="backup-keep">Keep the newest</label><select id="backup-keep">${BACKUP_KEEP.map(n => `<option value="${n}" ${b.keep === n ? 'selected' : ''}>${n} backups</option>`).join('')}</select></div></div>
  <div class="row"><button id="backup-now" ${desktop && b.folder ? '' : 'disabled'}>Back up now</button><span class="note" id="backup-status">Last backup: ${e(when(store.settings?.lastBackup))}${store.settings?.lastBackupError ? ' · ' + e(store.settings.lastBackupError) : ''}</span></div>
  <p class="note">Only Livery's own backup files in that folder are ever removed.</p></section>
  <section class="settings-card" id="update-settings"><h2>Updates</h2><p>Livery can ask GitHub whether a newer version has been released. Nothing about you or your designs is sent.</p>
  <label class="pref-row" for="update-check"><input type="checkbox" id="update-check" ${store.settings?.updateCheck !== false ? 'checked' : ''}><span><strong>Check for updates once a day</strong><small>Shows a small notice in the header when a new version is available.</small></span></label>
  <div class="row"><button id="update-now" ${window.desktop?.checkForUpdate ? '' : 'disabled'}>Check now</button><span class="note" id="update-status">${e(store.settings?.updateStatus || '')}</span></div></section>`;
}
// Builds the same package as Import & Export → Back up my whole library.
async function runBackup({ automatic = false } = {}) {
  const b = backupSettings();
  if (!window.desktop?.writeBackup || !b.folder || loadBlocked) return null;
  try {
    const data = await libraryClient.materialize(store, store);
    const result = await window.desktop.writeBackup({
      folder: b.folder,
      keep: b.keep,
      data: {
        format: 'slotforge-paintshop',
        version: 1,
        kind: 'library',
        exported: new Date().toISOString(),
        data: M.clone(data)
      }
    });
    store.settings = { ...store.settings, lastBackup: new Date().toISOString() };
    delete store.settings.lastBackupError;
    scheduleSave();
    if (!automatic) toast('Library backed up.');
    return result;
  } catch (error) {
    store.settings = { ...store.settings, lastBackupError: String(error.message || error).slice(0, 200) };
    scheduleSave();
    toast('Backup failed: ' + (error.message || error));
    return null;
  } finally {
    const status = $('#backup-status');
    if (status)
      status.textContent =
        'Last backup: ' +
        when(store.settings?.lastBackup) +
        (store.settings?.lastBackupError ? ' · ' + store.settings.lastBackupError : '');
  }
}
function backupDue(now = Date.now()) {
  const b = backupSettings(),
    every = BACKUP_EVERY[b.every] || 0,
    last = Date.parse(store.settings?.lastBackup || '') || 0;
  return !!(every && b.folder && now - last >= every);
}
async function checkUpdates({ manual = false } = {}) {
  if (!window.desktop?.checkForUpdate) return null;
  try {
    const result = await window.desktop.checkForUpdate();
    const status = result.newer
      ? `Version ${result.latest} is available.`
      : `You have the latest version (${result.current}).`;
    store.settings = { ...store.settings, lastUpdateCheck: new Date().toISOString(), updateStatus: status };
    scheduleSave();
    showUpdateBadge(result.newer ? result : null);
    if (manual) toast(status);
    return result;
  } catch (error) {
    if (manual) toast(error.message || String(error));
    return null;
  } finally {
    const el = $('#update-status');
    if (el) el.textContent = store.settings?.updateStatus || '';
  }
}
function showUpdateBadge(result) {
  const badge = $('#update-badge');
  badge.hidden = !result;
  if (!result) return;
  badge.textContent = `Update ${result.latest}`;
  badge.title = `Livery ${result.latest} is available. Open the download page.`;
  badge.dataset.url = result.url;
}
// Runs after start-up and then every 30 minutes while Livery is open.
function startMaintenance() {
  const tick = () => {
    if (backupDue()) runBackup({ automatic: true });
    const lastCheck = Date.parse(store.settings?.lastUpdateCheck || '') || 0;
    if (store.settings?.updateCheck !== false && Date.now() - lastCheck >= UPDATE_EVERY) checkUpdates();
  };
  setTimeout(tick, 4000);
  setInterval(tick, 30 * 60e3);
}
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'backup-every') setBackup({ every: BACKUP_EVERY[el.value] !== undefined ? el.value : 'off' });
  else if (el.id === 'backup-keep') setBackup({ keep: BACKUP_KEEP.includes(Number(el.value)) ? Number(el.value) : 10 });
  else if (el.id === 'update-check') setPreference('updateCheck', el.checked);
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.id === 'backup-choose') {
    const folder = await window.desktop.chooseBackupFolder();
    if (!folder) return;
    setBackup({ folder });
    $('#backup-folder').value = folder;
    $('#backup-now').disabled = false;
    if (backupSettings().every === 'off') {
      setBackup({ every: 'weekly' });
      $('#backup-every').value = 'weekly';
    }
    toast('Backups will be saved in ' + folder + '.');
  } else if (b.id === 'backup-now') {
    b.disabled = true;
    await runBackup();
    b.disabled = false;
  } else if (b.id === 'update-now') {
    b.disabled = true;
    await checkUpdates({ manual: true });
    b.disabled = false;
  } else if (b.id === 'update-badge' && b.dataset.url) {
    window.desktop?.openReleasePage(b.dataset.url).catch(reportError);
  }
});
