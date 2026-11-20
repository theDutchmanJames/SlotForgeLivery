// Livery renderer · The Garage (remake 2026-11, "Parts Room", docs/ui-reference/garage-2026-11):
// one page for your cars and their liveries, the reusable library (saved designs,
// artwork, fonts), the Trash and the backups. Replaces the Projects and User Library
// dialogs; Import & Export stays a dialog reached from here and from the menu.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const TRASH_DAYS = 30,
  LIBRARY_SECTIONS = ['templates', 'liveries', 'assets', 'fonts'];
let garageOpen = false,
  garageSection = 'recent',
  garageSelected = null,
  garageFilter = 'all',
  garageQuery = '',
  garageBackups = null,
  garageBackup = null;

// ------------------------------------------------------------- Liveries and cars
const liveProjects = () => store.projects.filter(p => !p.trashedAt);
const trashedProjects = () => store.projects.filter(p => p.trashedAt);
function projectCarName(p) {
  return p.template?.name || p.storageSummary?.templateName || 'Unknown car';
}
// A livery belongs to the library car it was started from (by id, or by name for older ones).
function projectCarKey(p) {
  const id = p.template?.id || p.storageSummary?.templateId;
  if (id && store.templates.some(t => t.id === id)) return id;
  const name = projectCarName(p);
  return store.templates.find(t => t.name === name)?.id || 'name:' + name;
}
function garageCars() {
  const live = liveProjects(),
    cars = store.templates.map(t => ({ key: t.id, name: t.name, scale: t.scale || '', template: t }));
  for (const p of live) {
    const key = projectCarKey(p);
    if (!cars.some(c => c.key === key))
      cars.push({ key, name: projectCarName(p), scale: p.template?.scale || '', template: null });
  }
  return cars
    .map(c => ({ ...c, projects: live.filter(p => projectCarKey(p) === c.key) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const projectViews = p =>
  Object.keys(p.template?.views || {}).length ? Object.keys(p.template.views) : p.storageSummary?.views || [];
const projectColoursOf = p =>
  p.storageSummary?.colours || StorageCodec.summary('projects', p).storageSummary.colours || [];
const isFinished = p => p.status === 'finished';
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const minutes = Math.round((Date.now() - t) / 60000),
    d = new Date(t),
    today = new Date();
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  if (d.toDateString() === today.toDateString())
    return 'today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (new Date(today - 864e5).toDateString() === d.toDateString()) return 'yesterday';
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  });
}
function colourDots(p) {
  const colours = projectColoursOf(p);
  return colours.length
    ? `<span class="gr-dots" aria-hidden="true">${colours.map(c => `<i style="background:${c}"></i>`).join('')}</span>`
    : '';
}
const statusPill = p =>
  isFinished(p) ? '<span class="gr-pill good">Finished</span>' : '<span class="gr-pill warn">Being painted</span>';

// ------------------------------------------------------------------ Show and hide
function showGarage(section = garageSection) {
  if (setup) leaveSetup();
  leavePack();
  if (settingsOpen) {
    settingsOpen = false;
    themeSettings.cancel();
    $('#settings-page').hidden = true;
    document.body.classList.remove('settings-open');
    $('#settings-crumb').hidden = true;
  }
  closeDialog();
  closeMenus();
  hideToast();
  if (section !== garageSection) {
    garageSelected = null;
    garageQuery = '';
    garageBackup = null;
  }
  garageOpen = true;
  garageSection = section;
  if (LIBRARY_SECTIONS.includes(section)) libraryTab = section;
  $('.workspace').hidden = true;
  $('#garage-page').hidden = false;
  document.body.classList.add('garage-open');
  $('#garage-crumb').hidden = false;
  renderGarage();
}
function hideGarage() {
  if (!garageOpen) return;
  garageOpen = false;
  $('#garage-page').hidden = true;
  $('#garage-page').replaceChildren();
  $('.workspace').hidden = false;
  document.body.classList.remove('garage-open');
  $('#garage-crumb').hidden = true;
}

// ----------------------------------------------------------------------- Drawing
function railItem(attrs, iconName, label, count, active) {
  return `<button class="gr-item ${active ? 'on' : ''}" ${attrs} ${active ? 'aria-current="page"' : ''}>${icon(iconName)}<span class="gr-text">${label}</span>${count === null ? '' : `<span class="gr-n">${count}</span>`}</button>`;
}
function railHTML(cars) {
  const s = garageSection,
    b = backupSettings(),
    last = store.settings?.lastBackup;
  return `${project ? `<button class="gr-item gr-back" data-action="studio">${icon('back')}<span class="gr-text">Back to ${e(project.name)}</span></button>` : ''}${arrivalRailHTML()}${railItem('data-garage-section="recent"', 'clock', 'Recent', liveProjects().length, s === 'recent')}
<span class="gr-label">Cars</span>${cars
    .map(
      c =>
        `<button class="gr-item gr-car ${s === 'car:' + c.key ? 'on' : ''}" data-garage-section="car:${e(c.key)}" ${s === 'car:' + c.key ? 'aria-current="page"' : ''}><span class="gr-th">${c.template ? cardPreview(c.template, 'templates') : icon('car')}</span><span class="gr-text">${e(c.name)}</span><span class="gr-n">${c.projects.length}</span></button>`
    )
    .join(
      ''
    )}${railItem('data-library-tab="templates"', 'car', 'All cars', store.templates.length, s === 'templates')}<button class="gr-item gr-add" data-action="add-car">${icon('plus')}<span class="gr-text">Add a car</span></button>
<span class="gr-label">Reuse</span>${railItem('data-library-tab="liveries"', 'brush', 'Saved designs', store.liveries.length, s === 'liveries')}${railItem('data-library-tab="assets"', 'image', 'Artwork &amp; shapes', store.assets.length, s === 'assets')}${railItem('data-library-tab="fonts"', 'text', 'Fonts', store.fonts.length, s === 'fonts')}
<span class="gr-label">Safe keeping</span>${railItem('data-garage-section="backups"', 'save', 'Backups', null, s === 'backups')}${railItem('data-garage-section="trash"', 'trash', 'Trash', trashedProjects().length, s === 'trash')}
<span class="gr-grow"></span><p class="gr-foot">${b.folder ? `Last backup <b class="${store.settings?.lastBackupError ? 'bad' : 'good'}">${last ? ago(last) : 'never'}</b>${b.every !== 'off' ? ' · ' + (b.every === 'daily' ? 'daily' : 'weekly') : ''}` : 'No backups set up yet'}</p>`;
}
function headHTML(eyebrow, title, meta, buttons = '') {
  return `<header class="gr-head"><div class="gr-title"><span class="gr-eyebrow">${eyebrow}</span><h1>${title}</h1>${meta ? `<div class="gr-meta">${meta}</div>` : ''}</div><div class="gr-head-actions">${buttons}</div></header>`;
}
const garageImportButtons = () =>
  `<button data-action="import" title="Open a shared .sfpaint package or a backup">${icon('import')}Import…</button><button data-action="sharing" title="Share several items, or back up the whole library">${icon('share')}Share…</button>`;
function cardHTML(p, withCar = false) {
  return `<button class="gr-card ${p.id === garageSelected ? 'on' : ''}" data-garage-select="${e(p.id)}" aria-pressed="${p.id === garageSelected}" title="Double-click to open">${cardPreview(p, 'projects')}<span class="gr-card-body"><strong>${e(p.name)}</strong>${withCar ? `<small class="gr-card-car">${e(projectCarName(p))}</small>` : ''}<span class="gr-card-row">${colourDots(p)}<span>${e(ago(p.updated))}</span><span class="gr-grow"></span>${statusPill(p)}</span></span></button>`;
}
function filteredProjects(list) {
  const q = garageQuery.trim().toLowerCase();
  return list
    .filter(p => garageFilter === 'all' || (garageFilter === 'finished') === isFinished(p))
    .filter(p => !q || [p.name, projectCarName(p)].some(v => String(v).toLowerCase().includes(q)))
    .sort((a, b) =>
      (store.settings?.garageSort || 'recent') === 'az'
        ? a.name.localeCompare(b.name)
        : String(b.updated || '').localeCompare(String(a.updated || ''))
    );
}
function toolsHTML(list) {
  const count = f => list.filter(p => f === 'all' || (f === 'finished') === isFinished(p)).length,
    sort = store.settings?.garageSort || 'recent';
  return `<div class="gr-tools">${[
    ['all', 'All'],
    ['painting', 'Being painted'],
    ['finished', 'Finished']
  ]
    .map(
      ([k, label]) =>
        `<button class="gr-chip ${garageFilter === k ? 'on' : ''}" data-garage-filter="${k}" aria-pressed="${garageFilter === k}">${label} <span>${count(k)}</span></button>`
    )
    .join(
      ''
    )}<span class="gr-grow"></span><span class="catalogue-field">${icon('search')}<input id="garage-search" type="search" placeholder="Search liveries…" aria-label="Search liveries" value="${e(garageQuery)}"></span><select id="garage-sort" aria-label="Sort liveries"><option value="recent" ${sort === 'recent' ? 'selected' : ''}>Last edited</option><option value="az" ${sort === 'az' ? 'selected' : ''}>Name A–Z</option></select></div>`;
}
function gridHTML(list, { withCar = false, newCar = null } = {}) {
  const shown = filteredProjects(list);
  return `<div class="gr-grid" id="garage-grid">${shown.map(p => cardHTML(p, withCar)).join('')}${
    newCar
      ? `<button class="gr-card gr-new" data-garage-new="${e(newCar)}"><span class="gr-plus">${icon('plus')}</span><strong>New livery</strong><small>Starts a white car to paint</small></button>`
      : ''
  }${!shown.length && !newCar ? `<div class="gr-empty">${icon(garageQuery ? 'search' : 'projects')}<h3>${garageQuery || garageFilter !== 'all' ? 'No matching liveries' : 'No liveries yet'}</h3><p>${garageQuery || garageFilter !== 'all' ? 'Try another word or filter.' : 'Add a car, then start a livery on it.'}</p></div>` : ''}</div>`;
}
function mainHTML(cars) {
  const s = garageSection;
  if (s === 'arrivals') return arrivalsMainHTML();
  if (s === 'recent')
    return (
      headHTML(
        'Your liveries',
        'Recent',
        `${liveProjects().length} liveries on ${cars.length} ${cars.length === 1 ? 'car' : 'cars'}`,
        `${garageImportButtons()}<button class="primary" data-action="add-car">${icon('carplus')}Add a car</button>`
      ) +
      toolsHTML(liveProjects()) +
      gridHTML(liveProjects(), { withCar: true })
    );
  if (s.startsWith('car:')) {
    const car = cars.find(c => 'car:' + c.key === s),
      views = car.template ? car.template.storageSummary?.views || Object.keys(car.template.views || {}) : [];
    return (
      headHTML(
        `Car${car.scale ? ' · ' + e(car.scale) : ''}${views.length ? ' · ' + views.map(k => M.LABELS[k]).join(', ') : ''}`,
        e(car.name),
        `${car.projects.length} ${car.projects.length === 1 ? 'livery' : 'liveries'}${car.template ? '' : ' · <span class="gr-pill">Not in your library</span>'}`,
        car.template
          ? `<button data-garage-edit-car="${e(car.key)}">${icon('pen')}Edit the car</button><button class="primary" data-garage-new="${e(car.key)}">${icon('plus')}New livery on this car</button>`
          : ''
      ) +
      toolsHTML(car.projects) +
      gridHTML(car.projects, { newCar: car.template ? car.key : null })
    );
  }
  if (LIBRARY_SECTIONS.includes(s)) {
    const kind = LIBRARY_KINDS.find(k => k[0] === s);
    return (
      headHTML(
        'Your library',
        s === 'templates'
          ? 'All cars'
          : s === 'liveries'
            ? 'Saved designs'
            : s === 'assets'
              ? 'Artwork &amp; shapes'
              : 'Fonts',
        e(kind[4]),
        garageImportButtons()
      ) + libraryPageHTML(s)
    );
  }
  if (s === 'trash') {
    const list = trashedProjects().sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)));
    return (
      headHTML(
        'Safe keeping',
        'Trash',
        `Liveries in the Trash are deleted for good ${TRASH_DAYS} days after they were moved here.`,
        list.length ? `<button class="danger" data-garage-empty-trash>${icon('trash')}Empty the Trash</button>` : ''
      ) +
      `<div class="gr-grid">${list
        .map(
          p =>
            `<div class="gr-card gr-trashed">${cardPreview(p, 'projects')}<span class="gr-card-body"><strong>${e(p.name)}</strong><small class="gr-card-car">${e(projectCarName(p))} · moved here ${e(ago(p.trashedAt))}</small><span class="gr-card-row"><button class="sm primary" data-garage-restore="${e(p.id)}">${icon('undo')}Put back</button><button class="sm danger" data-garage-purge="${e(p.id)}">${icon('trash')}Delete for good</button></span></span></div>`
        )
        .join(
          ''
        )}${list.length ? '' : `<div class="gr-empty">${icon('trash')}<h3>The Trash is empty</h3><p>Liveries you remove wait here for ${TRASH_DAYS} days, so you can put them back.</p></div>`}</div>`
    );
  }
  // Backups
  const b = backupSettings();
  return (
    headHTML(
      'Safe keeping',
      'Backups',
      b.folder
        ? `${b.every === 'off' ? 'Only when you back up' : b.every === 'daily' ? 'Every day' : 'Every week'} into <span class="mono">${e(b.folder)}</span> · keeps ${b.keep}`
        : 'Choose a folder in Backup settings, such as a cloud-synced or external drive.',
      `<button data-garage-backup-settings>${icon('settings')}Backup settings</button><button class="primary" data-garage-backup-now ${b.folder ? '' : 'disabled'}>${icon('save')}Back up now</button>`
    ) +
    `<div class="gr-banner ${store.settings?.lastBackupError ? 'bad' : store.settings?.lastBackup ? 'good' : ''}">${icon(store.settings?.lastBackupError ? 'close' : store.settings?.lastBackup ? 'check' : 'save')}<span class="gr-grow"><b>${store.settings?.lastBackupError ? 'The last backup failed' : store.settings?.lastBackup ? 'Your library is backed up' : 'No backup yet'}</b><small>${store.settings?.lastBackupError ? e(store.settings.lastBackupError) : store.settings?.lastBackup ? 'Last backup ' + e(ago(store.settings.lastBackup)) + ' · ' + store.templates.length + ' cars, ' + liveProjects().length + ' liveries, ' + store.assets.length + ' artwork, ' + store.fonts.length + ' fonts' : 'Backups are whole-library packages you can bring back from here.'}</small></span>${b.folder ? `<button class="sm" data-garage-reveal>${icon('folder')}Show in folder</button>` : ''}</div><div class="gr-table" id="garage-backups">${backupRowsHTML()}</div>`
  );
}
function backupRowsHTML() {
  if (!backupSettings().folder) return '';
  if (!garageBackups) return '<p class="note gr-loading">Looking in the backup folder…</p>';
  if (garageBackups.error) return `<p class="note">${e(garageBackups.error)}</p>`;
  if (!garageBackups.length) return '<p class="note">No backups in this folder yet.</p>';
  return `<div class="gr-tr gr-th-row"><span></span><span>Backup</span><span>Made</span><span>Size</span><span></span></div>${garageBackups
    .map(
      x =>
        `<div class="gr-tr ${garageBackup?.name === x.name ? 'on' : ''}"><span class="gr-tico">${icon('save')}</span><span>${e(x.name.replace(/\.sfpaint$/, ''))}</span><span>${e(ago(x.modified))}</span><span class="mono">${x.size < 1048576 ? Math.max(1, Math.round(x.size / 1024)) + ' KB' : (x.size / 1048576).toFixed(1) + ' MB'}</span><span class="gr-tr-acts"><button class="sm ${garageBackup?.name === x.name ? 'primary' : ''}" data-garage-backup="${e(x.name)}">${icon('undo')}Restore…</button></span></div>`
    )
    .join('')}`;
}
function detailHTML(cars) {
  if (garageSection === 'arrivals') return arrivalsDetailHTML();
  const s = garageSection,
    p = garageSelected && liveProjects().find(x => x.id === garageSelected);
  if (p && (s === 'recent' || s.startsWith('car:'))) {
    const views = projectViews(p),
      colours = projectColoursOf(p);
    return `<div class="gr-dpic">${cardPreview(p, 'projects')}</div><div class="gr-dsec"><label class="gr-eyebrow" for="garage-name">Livery</label><input id="garage-name" class="gr-name" value="${e(p.name)}" maxlength="120" aria-label="Livery name"><dl class="gr-kv"><dt>Car</dt><dd>${e(projectCarName(p))}${p.template?.scale ? ' · ' + e(p.template.scale) : ''}</dd><dt>Views</dt><dd>${views.map(k => M.LABELS[k]).join(', ') || '–'}</dd><dt>Edited</dt><dd>${e(ago(p.updated))}</dd></dl><div class="segmented gr-status" role="group" aria-label="Status"><button data-garage-status="painting" aria-pressed="${!isFinished(p)}">Being painted</button><button data-garage-status="finished" aria-pressed="${isFinished(p)}">Finished</button></div></div>${
      colours.length
        ? `<div class="gr-dsec"><span class="gr-eyebrow">Colours</span><div class="gr-swatches">${colours.map(c => `<span style="background:${c}" title="${c.toUpperCase()}"></span>`).join('')}</div></div>`
        : ''
    }<div class="gr-dact"><button class="primary" data-project-open="${e(p.id)}">${icon('brush')}Open in Paint Studio</button><div class="gr-row"><button data-garage-duplicate="${e(p.id)}">${icon('copy')}Duplicate</button><button data-garage-other-car="${e(p.id)}">${icon('car')}Use on another car…</button></div><div class="gr-row"><button data-project-export="${e(p.id)}">${icon('share')}Share…</button><button data-garage-design="${e(p.id)}">${icon('save')}Save as design</button></div><button class="ghost danger" data-project-delete="${e(p.id)}">${icon('trash')}Move to Trash</button></div>`;
  }
  if (s.startsWith('car:')) {
    const car = cars.find(c => 'car:' + c.key === s);
    return `${car.template ? `<div class="gr-dpic">${cardPreview(car.template, 'templates')}</div>` : ''}<div class="gr-dsec"><span class="gr-eyebrow">Car</span><h2>${e(car.name)}</h2><p class="note">${car.template ? 'Every livery keeps its own copy of the car, so editing it here never changes a livery you already made.' : 'This car is not in your library: its liveries carry their own copy.'}</p></div>${car.template ? `<div class="gr-dact"><button class="primary" data-garage-new="${e(car.key)}">${icon('plus')}New livery on this car</button><div class="gr-row"><button data-garage-edit-car="${e(car.key)}">${icon('pen')}Edit details</button><button data-garage-share-car="${e(car.key)}">${icon('share')}Share the car</button></div></div>` : ''}<p class="gr-hint">${icon('projects')}Choose a livery to see its details.</p>`;
  }
  if (LIBRARY_SECTIONS.includes(s)) {
    const kind = LIBRARY_KINDS.find(k => k[0] === s);
    return `<div class="gr-dsec"><span class="gr-eyebrow">About this section</span><p>${e(kind[4])}</p><p class="note">${e(kind[5])}</p><p class="note">${e(kind[6])}</p></div><div class="gr-dact"><button data-action="export-selection">${icon('share')}Share several items…</button></div>`;
  }
  if (s === 'trash')
    return `<div class="gr-dsec"><span class="gr-eyebrow">Trash</span><p>Move to Trash keeps a livery for ${TRASH_DAYS} days. Put it back any time before then.</p><p class="note">Cars, saved designs, artwork and fonts are removed from the library straight away; liveries keep their own copy of what they use.</p></div>`;
  if (s === 'backups') return restoreHTML();
  return `<div class="gr-dsec"><span class="gr-eyebrow">Garage</span><p>Your cars, their liveries and everything you reuse, on this computer.</p></div><p class="gr-hint">${icon('projects')}Choose a livery to see its details. Double-click to open it.</p>`;
}
function restoreHTML() {
  const r = garageBackup;
  if (!r)
    return `<div class="gr-dsec"><span class="gr-eyebrow">Restore</span><p>Choose Restore beside a backup to see what it would bring back.</p><p class="note">Restoring adds the cars, liveries, designs, artwork and fonts you no longer have. Nothing you have now changes.</p></div>`;
  if (r.loading)
    return `<div class="gr-dsec"><span class="gr-eyebrow">Restore</span><p class="note">Reading ${e(r.name)}…</p></div>`;
  if (r.error)
    return `<div class="gr-dsec"><span class="gr-eyebrow">Restore</span><p class="note">${e(r.error)}</p></div>`;
  const names = r.items.map(([bucket, item]) => [
    item.name,
    { templates: 'car', liveries: 'saved design', assets: 'artwork', fonts: 'font', projects: 'livery' }[bucket]
  ]);
  return `<div class="gr-dsec"><span class="gr-eyebrow">Restore ${e(r.name.replace(/\.sfpaint$/, ''))}</span><p><b>Bring back what's missing.</b> Adds what this backup has and your library does not. Nothing you have now changes.</p></div><div class="gr-dsec"><span class="gr-eyebrow">What comes back</span>${
    names.length
      ? `<ul class="gr-list">${names
          .slice(0, 12)
          .map(([n, k]) => `<li><span>${e(n)}</span><small>${k}</small></li>`)
          .join('')}${names.length > 12 ? `<li class="note">and ${names.length - 12} more</li>` : ''}</ul>`
      : '<p class="note">Everything in this backup is already in your library.</p>'
  }</div><div class="gr-dact"><button class="primary" data-garage-restore-backup ${names.length ? '' : 'disabled'}>${icon('undo')}Restore ${names.length} ${names.length === 1 ? 'item' : 'items'}</button></div>`;
}
function renderGarage() {
  if (!garageOpen) return;
  const cars = garageCars();
  if (garageSection.startsWith('car:') && !cars.some(c => 'car:' + c.key === garageSection)) garageSection = 'recent';
  if (garageSection === 'arrivals' && !garageArrival) garageSection = 'recent';
  if (garageSelected && !liveProjects().some(p => p.id === garageSelected)) garageSelected = null;
  const page = $('#garage-page'),
    scroll = page.querySelector('.gr-main')?.scrollTop || 0,
    railScroll = page.querySelector('.gr-rail')?.scrollTop || 0,
    focusId = document.activeElement?.id;
  page.innerHTML = `<aside class="gr-rail" aria-label="Garage sections">${railHTML(cars)}</aside><section class="gr-main ${LIBRARY_SECTIONS.includes(garageSection) ? 'library-dialog' : ''}" aria-label="${e(garageSection)}">${mainHTML(cars)}</section><aside class="gr-detail" aria-label="Details">${detailHTML(cars)}</aside>`;
  page.querySelector('.gr-main').scrollTop = scroll;
  page.querySelector('.gr-rail').scrollTop = railScroll;
  if (LIBRARY_SECTIONS.includes(garageSection)) wireLibraryPage();
  if (garageSection === 'backups' && !garageBackups) loadGarageBackups();
  if (focusId && focusId !== 'garage-name') document.getElementById(focusId)?.focus({ preventScroll: true });
  loadCardPreviews().catch(reportError);
}

// ----------------------------------------------------------------- Changing liveries
// Lazy liveries are loaded before they change, so the change is saved with the whole livery.
async function loadedProject(id) {
  if (project?.id === id) return project;
  return libraryClient.hydrate(store, 'projects', id);
}
function closeOpenProject(id) {
  if (project?.id !== id) return;
  project = null;
  store.current = null;
  undo = [];
  redo = [];
  preparing = false;
  selected = null;
}
async function trashProject(id) {
  const p = await loadedProject(id);
  if (!p) return;
  p.trashedAt = new Date().toISOString();
  closeOpenProject(id);
  if (garageSelected === id) garageSelected = null;
  scheduleSave();
  render();
  renderGarage();
  toast(`“${p.name}” is in the Trash for ${TRASH_DAYS} days.`);
}
// Liveries in the Trash longer than TRASH_DAYS are deleted when Livery starts.
function emptyOldTrash(now = Date.now()) {
  const keep = store.projects.filter(p => !p.trashedAt || now - Date.parse(p.trashedAt) < TRASH_DAYS * 864e5);
  if (keep.length === store.projects.length) return 0;
  const removed = store.projects.length - keep.length;
  store.projects = keep;
  scheduleSave();
  return removed;
}
function chooseCarDialog(p) {
  const cars = store.templates.filter(t => t.id !== projectCarKey(p));
  if (!cars.length) return toast('Add another car first.');
  openDialog(
    'Use this livery on another car',
    'Starts a new livery on the car you choose, with these colours and artwork. Check the placement on each view.',
    `<div class="field"><label for="garage-other-car">Car</label><select id="garage-other-car">${cars
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(t => `<option value="${e(t.id)}">${e(t.name)}${t.scale ? ' · ' + e(t.scale) : ''}</option>`)
      .join('')}</select></div>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="garage-other-apply">Start the livery</button>`
  );
  $('#garage-other-apply').onclick = async () => {
    const t = await libraryClient.hydrate(store, 'templates', $('#garage-other-car').value);
    if (!t) return;
    await FontLibrary.loadAll(p);
    const fresh = M.applyLivery(M.newProject(t, `${p.name} · ${t.name}`), M.liveryFromProject(p, p.name));
    closeDialog();
    setProject(fresh);
    if (!activeView()?.regions.some(r => r.role === 'body')) {
      preparing = true;
      render();
    }
    toast('New livery started on ' + t.name + '. Check the placement on each view.');
  };
}

// ----------------------------------------------------------------------- Backups
async function loadGarageBackups() {
  const b = backupSettings();
  if (!b.folder || !window.desktop?.listBackups) {
    garageBackups = [];
    return;
  }
  try {
    garageBackups = await window.desktop.listBackups(b.folder);
  } catch (error) {
    garageBackups = { error: String(error.message || error) };
  }
  const box = $('#garage-backups');
  if (box && garageSection === 'backups') box.innerHTML = backupRowsHTML();
}
const RESTORE_BUCKETS = [
  ['templates', () => validateTemplate],
  ['liveries', () => validateLivery],
  ['assets', () => validateAsset],
  ['fonts', () => validateFontAsset],
  ['projects', () => validateProject]
];
async function openGarageBackup(name) {
  garageBackup = { name, loading: true };
  renderGarage();
  try {
    const pkg = await window.desktop.readBackup({ folder: backupSettings().folder, name });
    const items = [];
    for (const [bucket, validator] of RESTORE_BUCKETS) {
      const have = new Set(store[bucket].map(x => x.id));
      for (const raw of pkg.data?.[bucket] || []) {
        if (!raw || have.has(raw.id) || raw.trashedAt) continue;
        const item = validator()(raw);
        if (typeof raw.id === 'string' && raw.id) item.id = raw.id;
        if (bucket === 'projects' && raw.status === 'finished') item.status = 'finished';
        items.push([bucket, item]);
      }
    }
    if (garageBackup?.name === name) garageBackup = { name, items };
  } catch (error) {
    if (garageBackup?.name === name) garageBackup = { name, error: String(error.message || error) };
  }
  renderGarage();
}
async function restoreGarageBackup() {
  const r = garageBackup;
  if (!r?.items?.length) return;
  const additions = { templates: [], liveries: [], assets: [], fonts: [], projects: [] };
  for (const [bucket, item] of r.items) additions[bucket].push(item);
  await FontLibrary.loadAll(additions);
  for (const [bucket, list] of Object.entries(additions)) store[bucket].push(...list);
  scheduleSave();
  await flushSave();
  garageBackup = null;
  renderGarage();
  toast(`${r.items.length} ${r.items.length === 1 ? 'item' : 'items'} brought back from the backup.`);
}

// ----------------------------------------------------------------------- Events
document.addEventListener('click', async ev => {
  const b = ev.target.closest('#garage-page button, #dialog button');
  if (!b || b.disabled || (!garageOpen && !b.id?.startsWith('garage'))) return;
  const d = b.dataset;
  try {
    if (d.garageSection) {
      garageSelected = null;
      garageQuery = '';
      showGarage(d.garageSection);
    } else if (d.garageSelect) {
      garageSelected = d.garageSelect === garageSelected ? garageSelected : d.garageSelect;
      renderGarage();
    } else if (d.garageFilter) {
      garageFilter = d.garageFilter;
      renderGarage();
    } else if (d.garageNew) {
      const t = await libraryClient.hydrate(store, 'templates', d.garageNew);
      if (!t) return;
      libraryTab = 'templates';
      useLibrary(t.id);
    } else if (d.garageEditCar || d.garageShareCar) {
      const id = d.garageEditCar || d.garageShareCar,
        t = await libraryClient.hydrate(store, 'templates', id);
      if (!t) return;
      libraryTab = 'templates';
      if (d.garageEditCar) editLibraryDetails(id);
      else await exportPackage('template', t, t.name);
    } else if (d.garageStatus) {
      const p = await loadedProject(garageSelected);
      if (!p) return;
      if (d.garageStatus === 'finished') p.status = 'finished';
      else delete p.status;
      scheduleSave();
      renderGarage();
    } else if (d.garageDuplicate) {
      const p = await loadedProject(d.garageDuplicate);
      if (!p) return;
      const copy = { ...M.clone(p), id: M.uid(), name: M.name(p.name + ' copy'), updated: new Date().toISOString() };
      delete copy.status;
      delete copy.trashedAt;
      store.projects.push(copy);
      garageSelected = copy.id;
      scheduleSave();
      renderGarage();
      toast('Duplicated as “' + copy.name + '”.');
    } else if (d.garageOtherCar) {
      const p = await loadedProject(d.garageOtherCar);
      if (p) chooseCarDialog(p);
    } else if (d.garageDesign) {
      const p = await loadedProject(d.garageDesign);
      if (!p) return;
      store.liveries.push(M.liveryFromProject(p, p.name));
      scheduleSave();
      renderGarage();
      toast('Saved as a design. Use it on any car from Saved designs.');
    } else if (d.garageRestore) {
      const p = await loadedProject(d.garageRestore);
      if (!p) return;
      delete p.trashedAt;
      scheduleSave();
      renderGarage();
      toast('“' + p.name + '” is back with its car.');
    } else if (d.garagePurge || d.garageEmptyTrash !== undefined) {
      const ids = d.garagePurge ? [d.garagePurge] : trashedProjects().map(p => p.id);
      confirmAction(
        d.garagePurge ? 'Delete this livery for good?' : `Empty the Trash?`,
        d.garagePurge
          ? 'It cannot be put back afterwards. Its car stays in your library.'
          : `${ids.length} ${ids.length === 1 ? 'livery is' : 'liveries are'} deleted for good. This cannot be undone.`,
        () => {
          store.projects = store.projects.filter(p => !ids.includes(p.id));
          scheduleSave();
          showGarage('trash');
        },
        d.garagePurge ? 'Delete for good' : 'Empty the Trash',
        'danger'
      );
    } else if (d.garageBackupNow !== undefined) {
      b.disabled = true;
      await runBackup();
      garageBackups = null;
      renderGarage();
    } else if (d.garageBackupSettings !== undefined) {
      showSettings();
      document.querySelector('[data-settings-section="backup-settings"]')?.click();
    } else if (d.garageReveal !== undefined) {
      await window.desktop.revealBackup({ folder: backupSettings().folder, name: garageBackups?.[0]?.name });
    } else if (d.garageBackup) {
      await openGarageBackup(d.garageBackup);
    } else if (d.garageRestoreBackup !== undefined) {
      b.disabled = true;
      await restoreGarageBackup();
    }
  } catch (error) {
    reportError(error);
  }
});
document.addEventListener('dblclick', ev => {
  const card = ev.target.closest('#garage-page [data-garage-select]');
  if (!card) return;
  document.querySelector(`#garage-page [data-project-open="${CSS.escape(card.dataset.garageSelect)}"]`)?.click();
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'garage-search') return;
  garageQuery = ev.target.value;
  const cars = garageCars(),
    car = cars.find(c => 'car:' + c.key === garageSection),
    grid = $('#garage-grid');
  if (grid)
    grid.outerHTML =
      garageSection === 'recent'
        ? gridHTML(liveProjects(), { withCar: true })
        : gridHTML(car?.projects || [], { newCar: car?.template ? car.key : null });
  loadCardPreviews().catch(reportError);
});
document.addEventListener('change', async ev => {
  if (ev.target.id === 'garage-sort') {
    setPreference('garageSort', ev.target.value);
    renderGarage();
  } else if (ev.target.id === 'garage-name') {
    const value = ev.target.value.trim(),
      p = value && (await loadedProject(garageSelected));
    if (!p) return renderGarage();
    p.name = M.name(value);
    if (project?.id === p.id) renderHeader();
    scheduleSave();
    renderGarage();
  }
});
