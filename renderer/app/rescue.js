// Livery renderer · The rescue window: when the library cannot be read at start.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// Nothing has been changed and saving is paused. Three ways out, the safe one first: bring back
// a backup from the backups folder (with what it holds), open a backup file, or start with an
// empty library (the unreadable file is moved aside, never deleted). The details say what went
// wrong and where the files are, with Show the files, Copy the details and Try again.
'use strict';
let loadError = '',
  rescueFolder = null,
  rescueBackups = null,
  rescuePick = null;
const EMPTY_ADDITIONS = () => ({ templates: [], liveries: [], assets: [], fonts: [], projects: [] });
const rescueSize = n => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const rescueWhen = iso =>
  new Date(iso).toLocaleString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

async function rescueWindow(view = 'choose', data = {}) {
  if (!loadBlocked) return;
  if (view === 'choose') return rescueChoose();
  if (view === 'list') return rescueList();
  if (view === 'pick') return rescueShow(data);
}
function rescueOpen(title, subtitle, body, foot = '') {
  openDialog(title, subtitle, body, foot, 'danger');
  $('#dialog').classList.add('rescue-dialog');
}
async function rescueChoose() {
  rescueOpen(
    'Your library could not be read',
    'Livery stopped before it changed anything. Choose how to go on.',
    `<div class="rs-safe"><span>${icon('check')}Your library file is untouched</span><span>${icon('check')}Nothing is saved until you choose</span></div>
<div class="rs-choices"><div class="rs-choice best"><span class="rs-ic">${icon('undo')}</span><span class="rs-grow"><b>Bring back a backup</b><small id="rescue-backups-note">Looking for your backups…</small></span><button class="primary" id="rescue-backups" disabled>Choose a backup</button></div>
<div class="rs-choice"><span class="rs-ic">${icon('import')}</span><span class="rs-grow"><b>Open a backup file</b><small>A .sfpaint library backup from somewhere else: a USB stick, a download.</small></span><button data-action="import" id="rescue-file">Open a file…</button></div>
<div class="rs-choice"><span class="rs-ic">${icon('plus')}</span><span class="rs-grow"><b>Start with an empty library</b><small>The unreadable file is moved aside, not deleted, so it can still be looked at.</small></span><button id="rescue-empty">Start empty</button></div></div>
<details class="rs-details" open><summary>What went wrong, and where the files are</summary><pre id="rescue-details">${e(loadError || 'The library could not be read.')}</pre><div class="rs-row">${window.desktop ? `<button class="sm" id="rescue-reveal">${icon('folder')}Show the files</button>` : ''}<button class="sm" id="rescue-copy">${icon('copy')}Copy the details</button><button class="sm" id="rescue-retry">${icon('redo')}Try again</button></div></details>`
  );
  $('#rescue-empty').onclick = () => rescueEmpty();
  $('#rescue-copy').onclick = () =>
    navigator.clipboard
      .writeText($('#rescue-details').textContent)
      .then(() => toast('The details are copied.'))
      .catch(() => toast('Copying is not allowed here. Select the text instead.'));
  $('#rescue-retry').onclick = () => location.reload();
  if ($('#rescue-reveal')) $('#rescue-reveal').onclick = () => window.desktop.revealLibrary().catch(reportError);
  // The details: the library's files. The backups: the remembered folder.
  if (!window.desktop) {
    $('#rescue-backups-note').textContent = 'Backups are kept by the desktop app.';
    return;
  }
  window.desktop
    .libraryFiles()
    .then(files => {
      const pre = $('#rescue-details');
      if (pre && files.length)
        pre.textContent = `${loadError}\n${files.map(f => `${f.name} · ${rescueSize(f.size)} · last saved ${rescueWhen(f.modified)}`).join('\n')}`;
    })
    .catch(() => {});
  rescueFolder = await window.desktop.knownBackupFolder().catch(() => null);
  rescueBackups = rescueFolder ? await window.desktop.listBackups(rescueFolder).catch(() => []) : null;
  const note = $('#rescue-backups-note'),
    button = $('#rescue-backups');
  if (!note) return;
  button.disabled = false;
  if (!rescueFolder) {
    note.textContent = 'Livery does not know your backups folder. Point at it to see your backups.';
    button.textContent = 'Find my backups…';
    button.onclick = () => rescueFindFolder();
  } else if (!rescueBackups.length) {
    note.textContent = `No backups in ${rescueFolder}. Point at another folder, or open a backup file.`;
    button.textContent = 'Another folder…';
    button.onclick = () => rescueFindFolder();
  } else {
    note.textContent = `Your backups folder has ${rescueBackups.length} ${rescueBackups.length === 1 ? 'backup' : 'backups'}. The newest is from ${rescueWhen(rescueBackups[0].modified)}.`;
    button.onclick = () => rescueList();
  }
}
async function rescueFindFolder() {
  const folder = await window.desktop.chooseBackupFolder().catch(() => null);
  if (!folder) return;
  rescueFolder = folder;
  rescueBackups = await window.desktop.listBackups(folder).catch(() => []);
  if (!rescueBackups.length) return toast('No Livery backups in that folder.');
  rescueList();
}
function rescueList() {
  rescuePick = rescueBackups[0]?.name || null;
  rescueOpen(
    'Choose a backup',
    `From ${rescueFolder}`,
    `<div class="rs-list" role="radiogroup">${rescueBackups
      .map(
        (b, i) =>
          `<label class="rs-backup"><input type="radio" name="rescue-backup" value="${e(b.name)}" ${i === 0 ? 'checked' : ''}><span class="rs-grow"><b>${e(rescueWhen(b.modified))}</b><small class="mono">${e(b.name)} · ${rescueSize(b.size)}</small></span>${i === 0 ? '<span class="rs-chip">newest</span>' : ''}</label>`
      )
      .join('')}</div><p class="note">Next you see what the backup holds, before it becomes your library.</p>`,
    `<button id="rescue-back">Back</button><button class="primary" id="rescue-open-backup">Look inside</button>`
  );
  $('#rescue-back').onclick = () => rescueChoose();
  $('#rescue-open-backup').onclick = async () => {
    const name = document.querySelector('[name="rescue-backup"]:checked')?.value;
    if (!name) return;
    const button = $('#rescue-open-backup');
    button.disabled = true;
    try {
      const pkg = await window.desktop.readBackup({ folder: rescueFolder, name }),
        additions = await packageAdditions(pkg);
      pendingPackage = additions;
      rescueShow({ name, exported: pkg.exported, additions, back: 'list' });
    } catch (error) {
      if (button.isConnected) button.disabled = false;
      toast(error.message || 'That backup could not be read.');
    }
  };
}
// What a backup holds, then "Bring back this backup".
function rescueShow({ name, exported, additions, back = 'choose' }) {
  const n = k => additions[k]?.length || 0,
    parts = [
      ['templates', 'car', 'cars'],
      ['projects', 'livery', 'liveries'],
      ['liveries', 'saved design', 'saved designs'],
      ['assets', 'artwork', 'artwork'],
      ['fonts', 'font', 'fonts']
    ].filter(([k]) => n(k));
  rescueOpen(
    'Bring back this backup?',
    name,
    `<div class="rs-inside"><span class="eyebrow">In this backup</span><div class="rs-row">${
      parts.length
        ? parts.map(([k, one, many]) => `<span class="rs-chip">${n(k)} ${n(k) === 1 ? one : many}</span>`).join('')
        : '<span class="rs-chip">Nothing: it is empty</span>'
    }</div>${exported ? `<small>Made ${e(rescueWhen(exported))}</small>` : ''}</div><p class="note">Your library becomes this backup. The unreadable file is kept next to it, not deleted.</p>`,
    `<button id="rescue-back">Back</button><button class="primary" data-action="confirm-import">Bring back this backup</button>`
  );
  $('#rescue-back').onclick = () => {
    pendingPackage = null;
    back === 'list' ? rescueList() : rescueChoose();
  };
}
function rescueEmpty() {
  pendingPackage = EMPTY_ADDITIONS();
  importConfirmed();
}

// The window cannot be closed with Esc while the library is unreadable; "Saving paused" opens it.
$('#dialog').addEventListener(
  'cancel',
  ev => {
    if ($('#dialog').classList.contains('rescue-dialog') && loadBlocked) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  },
  true
);
$('#save-status').addEventListener('click', () => loadBlocked && rescueWindow());
