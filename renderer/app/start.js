// Livery renderer · The Start page: shown whenever no livery is open.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// First time: "Make it your own", a place to drop a drawing of the car, three ways to start (your
// own car, the sample car, something shared) and how it goes. Coming back: the last livery large
// with what is left to do on it, a new livery on one of your cars, and the other recent liveries.
'use strict';
let startShown = false,
  startSignature = '',
  startLast = null,
  startDropped = null;

const startOpen = () =>
  !project &&
  !loadBlocked &&
  ['garage-page', 'setup-page', 'pack-page', 'settings-page'].every(id => document.getElementById(id).hidden);
const liveRecent = () =>
  store.projects
    .filter(p => !p.trashedAt)
    .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
const sampleCarPicture = () =>
  `<img class="st-sample" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(window.SAMPLE_CAR_SVG || '')}">`;

function renderStart() {
  const page = $('#start-page'),
    on = startOpen();
  document.body.classList.toggle('start-open', on);
  page.hidden = !on;
  startShown = on;
  if (!on) {
    startSignature = '';
    return;
  }
  const recent = liveRecent(),
    signature = JSON.stringify([
      recent.slice(0, 4).map(p => [p.id, p.updated, p.name, p.status]),
      store.templates.map(t => t.id),
      startLast?.id,
      startLast?.updated
    ]);
  if (signature === startSignature) return;
  startSignature = signature;
  page.innerHTML = recent.length ? startBackHTML(recent) : startFirstHTML();
  loadCardPreviews().catch(reportError);
  // The last livery is loaded for its colours, sizes and what is left to do.
  if (recent.length && startLast?.id !== recent[0].id)
    libraryClient
      .hydrate(store, 'projects', recent[0].id)
      .then(p => {
        if (!p || project) return;
        startLast = p;
        renderStart();
      })
      .catch(reportError);
}

// ------------------------------------------------------------------------ First time
function startFirstHTML() {
  return `<div class="st-home"><section class="st-hero"><div class="st-hero-text"><span class="st-eyebrow">From white kit to your colours</span><h1>Make it<br>your own.</h1><p>Start from a drawing of your car. Livery turns its panels into parts you can paint, then plans the paints, masks and decals for your workbench.</p><div class="st-row"><button class="primary st-big" data-action="add-car">${icon('carplus')}Add your car</button><button class="st-big" data-action="sample-car">${icon('car')}Try the sample car</button></div></div><div class="st-drop" id="start-drop" role="group" aria-label="Drop a drawing of your car here"><span class="st-drop-icon">${icon('import')}</span><b>Drop a drawing of your car here</b><span class="st-formats"><span>SVG</span><span>EPS</span><span>PDF</span><span>PNG · JPG photo</span></span><small>A side view works best. A photo is traced by hand.</small><button class="quiet" data-action="add-car">or choose a file…</button></div></section>
<section><span class="st-eyebrow">Three ways to start</span><div class="st-starts">${[
    [
      `<span class="st-pic-icon">${icon('carplus')}</span>`,
      'Your own car',
      'A drawing or a photo. Guided steps: the car, its drawing, the panels that get paint, their names and the real size.',
      `<button class="primary" data-action="add-car">Add your car</button>`
    ],
    [
      sampleCarPicture(),
      'The sample car',
      'A ready coupé at 1:32 to try everything first: livery colours, stripes, numbers and the Print pack.',
      `<button data-action="sample-car">Try it</button>`
    ],
    [
      `<span class="st-pic-icon">${icon('share')}</span>`,
      'Something shared',
      'A .sfpaint package from someone else or a backup of your library. Decal sheets from SlotForge Decals come in on a livery.',
      `<button data-action="import">Open a file</button>`
    ]
  ]
    .map(
      ([pic, title, text, button]) =>
        `<article class="st-start"><div class="st-pic">${pic}</div><div class="st-body"><b>${title}</b><p>${text}</p>${button}</div></article>`
    )
    .join('')}</div></section>
<section><span class="st-eyebrow">How it goes</span><div class="st-how">${[
    ['Add a car', 'Choose the panels that get paint'],
    ['Paint', 'Livery colours, stripes, numbers, decals'],
    ['Plan', 'Real paints, the order, many entries'],
    ['Print', 'The plan, masks at true size, decals']
  ]
    .map(([t, s], i) => `<div><span class="st-n">0${i + 1}</span><b>${t}</b><small>${s}</small></div>`)
    .join('')}</div></section><p class="st-foot">Everything stays on this computer. No account is needed.</p></div>`;
}

// ------------------------------------------------------------------------ Coming back
// What is left to do on a livery, most useful first; at most three.
function startTodo(p) {
  if (!p?.template) return [];
  const list = [],
    colours = liveryColours(p),
    unpainted = colours.filter(c => !c.ref),
    sizeless = Object.keys(p.template.views).filter(k => !p.template.views[k].realWidthMm),
    names = xs => (xs.length > 2 ? `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more` : xs.join(' and '));
  if (!colours.length) list.push(['colours', 'Name the colours of this livery', 'Colours']);
  else if (unpainted.length)
    list.push(['paints', `Choose real paints for ${names(unpainted.map(c => c.name))}`, 'Paints']);
  if (sizeless.length)
    list.push([`size:${sizeless[0]}`, `Set the real size of the ${M.LABELS[sizeless[0]]} view`, 'Size']);
  if (p.status !== 'finished') list.push(['pack', 'Make the Print pack', 'Print pack']);
  return list.slice(0, 3);
}
function startBackHTML(recent) {
  const last = recent[0],
    full = startLast?.id === last.id ? startLast : null,
    colours = full ? liveryColours(full) : [],
    entries = full?.entries?.length || 0,
    unpainted = colours.filter(c => !c.ref).length,
    todo = startTodo(full),
    cars = garageCars().filter(c => c.template),
    others = recent.slice(1, 4);
  return `<div class="st-home"><header class="st-head"><div><span class="st-eyebrow">Welcome back</span><h1>Pick up where you left off</h1><p class="st-note">Drop a drawing of a car anywhere on this page to add it.</p></div><span class="st-grow"></span><button data-action="projects">${icon('projects')}Garage</button><button class="primary" data-action="add-car">${icon('carplus')}Add a car</button></header>
<div class="st-back"><article class="st-cont"><button class="st-cont-pic" data-project-open="${e(last.id)}" aria-label="Continue ${e(last.name)}">${cardPreview(last, 'projects')}<span class="st-status ${isFinished(last) ? 'good' : ''}">${isFinished(last) ? 'Finished' : 'Being painted'}</span></button><div class="st-cont-body"><div class="st-grow"><b>${e(last.name)}</b><small>${e(projectCarName(last))}${last.template?.scale ? ' · ' + e(last.template.scale) : ''}${last.updated ? ' · edited ' + e(ago(last.updated)) : ''}</small><span class="st-chips">${colours
    .slice(0, 5)
    .map(c => `<span class="st-chip"><span class="st-dot" style="background:${e(c.hex)}"></span>${e(c.name)}</span>`)
    .join(
      ''
    )}${entries ? `<span class="st-chip">${entries} entries</span>` : ''}${unpainted ? `<span class="st-chip warn">${unpainted} ${unpainted === 1 ? 'colour' : 'colours'} without a paint</span>` : ''}</span></div><button class="primary st-big" data-project-open="${e(last.id)}">Continue</button></div></article>
<aside class="st-side"><section class="st-box"><span class="st-eyebrow">Next on this livery</span>${
    full
      ? todo.length
        ? todo
            .map(
              ([id, text, label], i) =>
                `<div class="st-todo"><span class="st-n">${i + 1}</span><span class="st-grow">${e(text)}</span><button data-start-todo="${e(id)}">${label}</button></div>`
            )
            .join('')
        : `<p class="st-note">Nothing left: it is finished. Start a new livery on one of your cars below.</p>`
      : `<p class="st-note">Looking at the livery…</p>`
  }</section>${
    cars.length
      ? `<section class="st-box"><span class="st-eyebrow">A new livery on one of your cars</span>${cars
          .slice(0, 4)
          .map(
            c =>
              `<div class="st-car"><span class="st-mini">${cardPreview(c.template, 'templates')}</span><span class="st-grow"><b>${e(c.name)}</b><small>${c.projects.length} ${c.projects.length === 1 ? 'livery' : 'liveries'}</small></span><button data-start-new="${e(c.key)}">New livery</button></div>`
          )
          .join('')}</section>`
      : ''
  }</aside></div>${
    others.length
      ? `<section><span class="st-eyebrow">Recent</span><div class="st-recent">${others
          .map(
            p =>
              `<button class="st-card" data-project-open="${e(p.id)}">${cardPreview(p, 'projects')}<span class="st-card-body"><b>${e(p.name)}</b><small>${e(projectCarName(p))} · ${e(ago(p.updated))}</small></span></button>`
          )
          .join(
            ''
          )}<button class="st-card st-all" data-action="projects">All ${recent.length} in the Garage →</button></div></section>`
      : ''
  }</div>`;
}
// Opens a livery, then does one thing in it.
async function openThen(id, then) {
  const p = await libraryClient.hydrate(store, 'projects', id);
  if (!p) return;
  await FontLibrary.loadAll(p);
  setProject(p);
  then();
}

// ------------------------------------------------------------------------ Dropping a file
const CAR_FILES = /\.(svg|eps|pdf|png|jpe?g|webp)$/i;
function dropOnStart(file) {
  if (/\.(sfpaint|json)$/i.test(file.name)) return readPackage(file);
  if (/\.(sfsheet|sfdecal)$/i.test(file.name))
    return toast('Open a livery first, then bring the decals in with Decal artwork (I).');
  if (!CAR_FILES.test(file.name)) return toast('Livery reads SVG, EPS, PDF, PNG, JPG and WebP drawings.');
  const photo = /\.(png|jpe?g|webp)$/i.test(file.name);
  addCarDialog();
  startDropped = file;
  $('#car-name').value = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .slice(0, 180);
  $(photo ? '#choose-svg' : '#choose-photo').disabled = true;
  $('#dialog-content .dialog-body').insertAdjacentHTML(
    'afterbegin',
    `<p class="inline-note st-dropped">Using <b>${e(file.name)}</b>. Check the name and scale, then choose <b>${photo ? 'Trace a photograph' : 'Import vector artwork'}</b>.</p>`
  );
}

// ------------------------------------------------------------------------ Events
document.addEventListener('click', ev => {
  const b = ev.target.closest('#start-page button');
  if (!b) return;
  if (b.dataset.startNew) {
    libraryClient
      .hydrate(store, 'templates', b.dataset.startNew)
      .then(t => {
        if (!t) return;
        libraryTab = 'templates';
        useLibrary(t.id);
      })
      .catch(reportError);
  } else if (b.dataset.startTodo) {
    const id = startLast?.id,
      todo = b.dataset.startTodo;
    if (!id) return;
    openThen(id, () => {
      if (todo === 'pack') return actions['print-pack']();
      if (todo.startsWith('size:')) {
        currentView = todo.slice(5);
        resetViewSelection();
        render();
      }
      showInspectorTab('workshop');
    }).catch(reportError);
  }
});
for (const type of ['dragenter', 'dragover'])
  document.addEventListener(type, ev => {
    if (!startShown || !ev.dataTransfer?.types?.includes('Files')) return;
    ev.preventDefault();
    $('#start-drop')?.classList.add('over');
  });
document.addEventListener('dragleave', ev => {
  if (!ev.relatedTarget) $('#start-drop')?.classList.remove('over');
});
document.addEventListener('drop', ev => {
  if (!startShown) return;
  ev.preventDefault();
  $('#start-drop')?.classList.remove('over');
  const file = ev.dataTransfer?.files?.[0];
  if (file) Promise.resolve(dropOnStart(file)).catch(reportError);
});
// The Start page comes back when another page closes with no livery open.
for (const id of ['garage-page', 'setup-page', 'pack-page', 'settings-page'])
  new MutationObserver(() => renderStart()).observe(document.getElementById(id), {
    attributes: true,
    attributeFilter: ['hidden']
  });
// ≡ → Start page: the open livery is saved and closed.
async function goToStart() {
  if (project) await flushSave().catch(() => {});
  if (settingsOpen) showSettings(false);
  hideGarage();
  leavePack();
  if (setup) leaveSetup();
  closeDialog();
  if (project) closeOpenProject(project.id);
  startLast = null;
  startSignature = '';
  multiSelected.clear();
  scheduleSave();
  render();
}
