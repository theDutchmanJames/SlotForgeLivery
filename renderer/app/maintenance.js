// Livery renderer · Automatic backups.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const BACKUP_EVERY = { off: 0, daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 },
  BACKUP_KEEP = [5, 10, 20, 50];
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
  <p class="note">Only Livery's own backup files in that folder are ever removed.</p></section>`;
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
// Runs after start-up and then every 30 minutes while Livery is open. (The update check runs in
// the main process once at start; update-ui.js shows its window and Settings → Updates.)
function startMaintenance() {
  const tick = () => {
    if (backupDue()) runBackup({ automatic: true });
  };
  setTimeout(tick, 4000);
  setInterval(tick, 30 * 60e3);
  startUpdates();
}
// Settings → Updates is drawn by update-ui.js into this holder; settingsSheet() moves it into
// the Settings page (placeUpdateCard), and it keeps updating itself wherever it is.
const updateHolder = document.createElement('div');
function startUpdates() {
  if (!window.UpdateUI || !window.desktop?.updateCheck) return;
  UpdateUI.start({
    settings: updateHolder,
    say: message => toast(message),
    appName: 'Livery',
    keeps: 'your library, cars and liveries stay where they are'
  });
  const card = updateHolder.firstElementChild;
  if (!card) return;
  card.id = 'update-settings';
  card.classList.add('settings-card');
  new MutationObserver(() => refreshSettingsRail()).observe(card, { childList: true, subtree: true });
  placeUpdateCard();
}
function placeUpdateCard() {
  const card = $('#update-settings') || updateHolder.firstElementChild,
    canvas = $('#settings-page .ss-canvas');
  if (card && canvas && card.parentNode !== canvas) {
    canvas.append(card);
    settingsRailEntries();
  }
}
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'backup-every') setBackup({ every: BACKUP_EVERY[el.value] !== undefined ? el.value : 'off' });
  else if (el.id === 'backup-keep') setBackup({ keep: BACKUP_KEEP.includes(Number(el.value)) ? Number(el.value) : 10 });
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
    refreshSettingsRail();
    toast('Backups will be saved in ' + folder + '.');
  } else if (b.id === 'backup-now') {
    b.disabled = true;
    await runBackup();
    b.disabled = false;
  }
});
