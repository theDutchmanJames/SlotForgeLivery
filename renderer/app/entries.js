// Livery renderer · Entries (rework 2026-11, "Entry list", docs/ui-reference/numbers-2026-11): one
// livery, many cars. Each entry has a race number, driver and team (and an optional number
// colour). Text layers say where their text comes from (typed, number, driver, team); showing an
// entry writes its values into those layers, so the canvas, exports and packages need nothing new.
// The Print pack and the decals for SlotForge Decals can go out for every entry.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const ENTRY_FIELDS = { number: 'Race number', driver: 'Driver', team: 'Team' };
const entryList = (p = project) => (Array.isArray(p?.entries) ? p.entries : []);
function activeEntry(p = project) {
  const list = entryList(p);
  return list.find(x => x.id === p.activeEntry) || list[0] || null;
}
function fieldLayers(p = project) {
  return Object.values(p.views)
    .flat()
    .filter(l => l.kind === 'text' && M.TEXT_FIELDS.includes(l.textFrom));
}
const entryLabel = x => (x.number ? '#' + x.number : 'No number') + (x.driver ? ' · ' + x.driver : '');
// Writes an entry's values into the text layers that show them.
function applyEntryTo(p, entry) {
  if (!entry) return p;
  for (const l of fieldLayers(p)) {
    l.text = entry[l.textFrom] || '—';
    if (l.textFrom === 'number') {
      if (entry.numberColour) {
        if (!l.fieldFill) l.fieldFill = l.fill;
        l.fill = entry.numberColour;
      } else if (l.fieldFill) {
        l.fill = l.fieldFill;
        delete l.fieldFill;
      }
    }
  }
  p.activeEntry = entry.id;
  return p;
}
const withEntry = (p, entry) => applyEntryTo(M.snapshotCopy(p), entry);
function showEntry(id) {
  const entry = entryList().find(x => x.id === id);
  if (!entry || !project) return;
  mutate(() => applyEntryTo(project, entry));
}
function setEntries(list) {
  project.entries = M.validateEntries(list);
  if (!project.entries.some(x => x.id === project.activeEntry)) project.activeEntry = project.entries[0]?.id;
  applyEntryTo(project, activeEntry());
}

// --------------------------------------------------------- Text comes from
function textFromField(l) {
  const from = l.textFrom || 'typed';
  // text-style-controls puts it in the Text & numbers folder (organiseInspector).
  return `<div class="field text-from text-style-controls"><label>Text comes from</label><div class="segmented">${[
    ['typed', 'Typed text'],
    ['number', 'Race number'],
    ['driver', 'Driver'],
    ['team', 'Team']
  ]
    .map(([k, label]) => `<button data-text-from="${k}" aria-pressed="${from === k}">${label}</button>`)
    .join('')}</div>${
    from === 'typed'
      ? ''
      : `<p class="note">Shows each entry's ${ENTRY_FIELDS[from].toLowerCase()}. ${entryList().length} ${entryList().length === 1 ? 'entry' : 'entries'}: <button class="link-button" data-action="entries">edit the entries</button>.</p>`
  }</div>`;
}
function setTextFrom(field) {
  const l = selection();
  if (!l || l.kind !== 'text') return;
  mutate(() => {
    if (field === 'typed') {
      delete l.textFrom;
      if (l.fieldFill) {
        l.fill = l.fieldFill;
        delete l.fieldFill;
      }
      return;
    }
    if (!entryList().length)
      setEntries([
        {
          number: field === 'number' ? l.text : '',
          driver: field === 'driver' ? l.text : '',
          team: field === 'team' ? l.text : ''
        }
      ]);
    l.textFrom = field;
    const entry = activeEntry();
    if (!entry[field] && l.text && l.text !== '—') entry[field] = l.text.slice(0, field === 'number' ? 12 : 80);
    applyEntryTo(project, entry);
  });
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-text-from]');
  if (b) setTextFrom(b.dataset.textFrom);
  const show = ev.target.closest('[data-entry-show]');
  if (show) {
    showEntry(show.dataset.entryShow);
    if (show.closest('#dialog')) renderEntriesDialog();
  }
});
// Typing in a text layer that shows an entry field changes that entry.
document.addEventListener(
  'change',
  ev => {
    if (ev.target.id !== 'text-value') return;
    const l = selection();
    if (!l?.textFrom || !activeEntry()) return;
    ev.stopImmediatePropagation();
    const value = ev.target.value.trim();
    mutate(() => {
      activeEntry()[l.textFrom] = value.slice(0, l.textFrom === 'number' ? 12 : 80);
      applyEntryTo(project, activeEntry());
    });
  },
  true
);

// ------------------------------------------------------------ The switcher
// Above the canvas: which entry the canvas shows.
function renderEntrySwitch() {
  const box = $('#entry-switch');
  if (!box) return;
  const list = project && activeView() && !preparing ? entryList() : [];
  box.hidden = !list.length;
  if (!list.length) return (box.innerHTML = '');
  const shown = activeEntry(),
    html = `<span class="es-label">Showing</span>${list
      .map(
        x =>
          `<button class="es-entry ${x.id === shown?.id ? 'on' : ''}" data-entry-show="${e(x.id)}" aria-pressed="${x.id === shown?.id}" title="${e(entryLabel(x))}${x.team ? ' · ' + e(x.team) : ''}"><b>${e(x.number || '–')}</b>${x.driver ? `<span>${e(x.driver)}</span>` : ''}</button>`
      )
      .join(
        ''
      )}<button class="es-list" data-action="entries" title="All entries" aria-label="All entries">${icon('list')}</button>`;
  if (box._html !== html) {
    box.innerHTML = html;
    box._html = html;
  }
}

// --------------------------------------------------------- Entries window
function openEntries() {
  if (!project) return;
  openDialog(
    'Entries',
    'Each entry is this livery with its own race number and names.',
    `<div class="en-shell"><div class="en-main"><div class="en-tools"><button class="primary" data-entry-add>${icon('plus')}Add entry</button><button data-entry-paste-open>${icon('import')}Paste a list…</button></div><div id="entries-body"></div></div><aside class="en-side" id="entries-side"></aside></div>`,
    `<button data-action="close-dialog">Done</button>`
  );
  $('#dialog').classList.add('entries-dialog');
  renderEntriesDialog();
}
function renderEntriesDialog() {
  const body = $('#entries-body');
  if (!body) return;
  const list = entryList(),
    shown = activeEntry(),
    fields = fieldLayers(),
    count = f => fields.filter(l => l.textFrom === f).length;
  body.innerHTML = list.length
    ? `<table class="en-table"><thead><tr><th></th><th>No.</th><th>Driver</th><th>Team</th><th>Number colour</th><th></th></tr></thead><tbody>${list
        .map(
          (x, i) =>
            `<tr class="${x.id === shown?.id ? 'on' : ''}"><td class="en-move"><button data-entry-move="${e(x.id)}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">${icon('up')}</button><button data-entry-move="${e(x.id)}" data-dir="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">${icon('down')}</button></td><td><input class="en-number" data-entry-field="number" data-entry-id="${e(x.id)}" value="${e(x.number)}" maxlength="12" aria-label="Race number"></td><td><input data-entry-field="driver" data-entry-id="${e(x.id)}" value="${e(x.driver)}" maxlength="80" aria-label="Driver"></td><td><input data-entry-field="team" data-entry-id="${e(x.id)}" value="${e(x.team)}" maxlength="80" aria-label="Team"></td><td class="en-colour"><label class="checkbox-line"><input type="checkbox" data-entry-colour-on="${e(x.id)}" ${x.numberColour ? 'checked' : ''}>Own</label>${x.numberColour ? `<input type="color" data-entry-colour="${e(x.id)}" value="${x.numberColour}" aria-label="Number colour">` : '<small>same</small>'}</td><td><button class="icon-button ghost" data-entry-delete="${e(x.id)}" aria-label="Delete ${e(entryLabel(x))}" title="Delete">${icon('trash')}</button></td></tr>`
        )
        .join('')}</tbody></table><div class="en-cars">${list
        .map(
          x =>
            `<button class="en-car ${x.id === shown?.id ? 'on' : ''}" data-entry-show="${e(x.id)}" title="Show ${e(entryLabel(x))} on the canvas"><span class="en-pic">${V.standalone(withEntry(project, x), currentView, 'entry-' + x.id, { preview: true })}</span><b>${e(entryLabel(x))}</b><small>${e(x.team || '')}</small></button>`
        )
        .join('')}</div>`
    : `<div class="en-empty">${icon('list')}<h3>No entries yet</h3><p>Add an entry for each car: its race number, driver and team. Then choose "Text comes from" on a text layer.</p></div>`;
  body.insertAdjacentHTML(
    'afterbegin',
    `<div class="en-paste" id="entries-paste" hidden><label for="entries-paste-text">One entry per line: number, driver, team</label><textarea id="entries-paste-text" placeholder="27, J. de Vries, Gulf Racing&#10;28, S. Bakker, Gulf Racing"></textarea><div class="row"><button class="primary" id="entries-paste-add">Add these entries</button><button id="entries-paste-cancel">Cancel</button></div><p class="note">From a club spreadsheet or SlotForge Timing: commas, semicolons or tabs between the columns.</p></div>`
  );
  $('#entries-side').innerHTML = `<h4>Fields on the car</h4><p>${['number', 'driver', 'team']
    .map(f => `${ENTRY_FIELDS[f]}: ${count(f)} ${count(f) === 1 ? 'place' : 'places'}`)
    .join(
      '<br>'
    )}</p><p class="note">Choose "Text comes from" on a text layer to add a field.</p><h4>Print and decals</h4><p class="note">The Print pack can print every entry (All entries in its settings). Decals for SlotForge Decals can go as one set per entry.</p><button data-entries-decals ${list.length && fields.length ? '' : 'disabled'}>${icon('share')}Decals for all entries</button><button data-action="print-pack">${icon('print')}Open the Print pack</button>`;
}
// One entry per line: number, driver, team (commas, semicolons or tabs).
function parseEntries(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [number = '', driver = '', team = ''] = line.split(/\s*[,;\t]\s*/);
      return { number, driver, team };
    })
    .filter(x => x.number || x.driver || x.team);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('#dialog button');
  if (!b || !$('#dialog').classList.contains('entries-dialog') || !project) return;
  const d = b.dataset;
  try {
    if (d.entryAdd !== undefined) {
      const list = entryList(),
        last = Number(list.at(-1)?.number);
      mutate(() =>
        setEntries([
          ...list,
          {
            number: Number.isFinite(last) && list.length ? String(last + 1) : '1',
            driver: '',
            team: list.at(-1)?.team || ''
          }
        ])
      );
      renderEntriesDialog();
      document.querySelector('#entries-body tbody tr:last-child [data-entry-field="driver"]')?.focus();
    } else if (d.entryPasteOpen !== undefined) {
      $('#entries-paste').hidden = false;
      $('#entries-paste-text').focus();
    } else if (b.id === 'entries-paste-cancel') $('#entries-paste').hidden = true;
    else if (b.id === 'entries-paste-add') {
      const added = parseEntries($('#entries-paste-text').value);
      if (!added.length) return toast('Type one entry per line: number, driver, team.');
      mutate(() => setEntries([...entryList(), ...added]));
      renderEntriesDialog();
      toast(`${added.length} ${added.length === 1 ? 'entry' : 'entries'} added.`);
    } else if (d.entryDelete) {
      mutate(() => setEntries(entryList().filter(x => x.id !== d.entryDelete)));
      renderEntriesDialog();
    } else if (d.entryMove) {
      const list = [...entryList()],
        i = list.findIndex(x => x.id === d.entryMove),
        j = i + Number(d.dir);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      mutate(() => setEntries(list));
      renderEntriesDialog();
    } else if (d.entriesDecals !== undefined) await sendDecalsForAllEntries();
  } catch (error) {
    reportError(error);
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (!project || !t.closest?.('#dialog.entries-dialog')) return;
  const id = t.dataset.entryId || t.dataset.entryColour || t.dataset.entryColourOn;
  if (!id) return;
  const list = entryList().map(x => ({ ...x })),
    entry = list.find(x => x.id === id);
  if (!entry) return;
  if (t.dataset.entryField) entry[t.dataset.entryField] = t.value;
  else if (t.dataset.entryColour) entry.numberColour = t.value;
  else if (t.dataset.entryColourOn) {
    if (t.checked)
      entry.numberColour =
        fieldLayers().find(l => l.textFrom === 'number')?.fieldFill ||
        fieldLayers().find(l => l.textFrom === 'number')?.fill ||
        '#e5484d';
    else delete entry.numberColour;
  }
  mutate(() => setEntries(list));
  // After the blur that fired this change, so the input is not replaced while it loses focus.
  setTimeout(renderEntriesDialog);
});

// ------------------------------------------------------- Decals, every entry
async function sendDecalsForAllEntries() {
  const list = entryList();
  if (!list.length) return;
  const keep = project.activeEntry,
    items = [];
  try {
    for (const entry of list) {
      applyEntryTo(project, entry);
      for (const item of decalItems()) {
        const name = `${entry.number ? '#' + entry.number + ' ' : ''}${item.name}`.slice(0, 160);
        items.push({ ...item, name, art: { ...item.art, name, y: item.art.y + items.length * 2 } });
      }
    }
  } catch (error) {
    return toast(error.message);
  } finally {
    applyEntryTo(project, list.find(x => x.id === keep) || list[0]);
    render();
  }
  const pack = DecalsModel.pack(items, []);
  if (window.desktop?.exportDecals) {
    if (await window.desktop.exportDecals({ name: project.name + ' decals, all entries', data: pack }))
      toast(`Saved ${pack.decals.length} decals for ${list.length} entries for SlotForge Decals.`);
  } else
    download(new Blob([JSON.stringify(pack)], { type: 'application/json' }), project.name + ' all entries.sfdecal');
}
