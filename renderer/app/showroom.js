// Livery renderer · The Showroom: nine SlotForge stock cars to paint when you have no drawing.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// The cars (renderer/stock-cars.js, built by scripts/build-stock-cars.cjs) are loaded the first
// time the Showroom opens; a car is checked like an imported car when you start painting it. Every car has a left, right,
// top and angled view with its panels already named, so a livery starts without setup. The car
// goes into your Garage the first time you paint it (once per scale), and is used again after that.
'use strict';
let showOpen = false,
  showCars = null,
  showPick = null,
  showKind = 'all';
const SHOW_KINDS = [
  ['all', 'All'],
  ['gt', 'GT & touring'],
  ['prototype', 'Prototypes'],
  ['formula', 'Formula'],
  ['rally', 'Rally & stock']
];
const showKindName = kind => SHOW_KINDS.find(k => k[0] === kind)?.[1] || '';

function loadStockCars() {
  if (showCars) return Promise.resolve(showCars);
  const ready = () => {
    // Shown as they are (our own bundled file); checked like an imported car when painted.
    showCars = window.STOCK_CARS || [];
    return showCars;
  };
  if (window.STOCK_CARS) return Promise.resolve(ready());
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'stock-cars.js';
    script.onload = () => resolve(ready());
    script.onerror = () => reject(Error('The stock cars could not be loaded.'));
    document.head.append(script);
  });
}
// Pictures of a car's views, drawn once and shown as images (not as live drawings in the page).
const showPictures = new Map();
function showPicture(car, view) {
  const key = car.key + ':' + view;
  if (!showPictures.has(key)) {
    const svg = V.standalone(M.newProject(car.template), view, 'show-' + car.key + '-' + view, { preview: true });
    showPictures.set(key, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
  }
  return `<img class="sr-img" src="${showPictures.get(key)}" alt="">`;
}

// ------------------------------------------------------------------------ Show and leave
async function showShowroom() {
  if (setup) leaveSetup();
  hideGarage();
  leavePack();
  if (settingsOpen) showSettings(false);
  closeDialog();
  closeMenus();
  showOpen = true;
  $('.workspace').hidden = true;
  $('#show-page').hidden = false;
  document.body.classList.add('show-open');
  $('#show-crumb').hidden = false;
  $('#show-page').innerHTML = '<div class="sr-loading"><h1>Opening the Showroom…</h1></div>';
  try {
    await loadStockCars();
  } catch (error) {
    leaveShowroom();
    return reportError(error);
  }
  if (!showOpen) return;
  showPick ||= showCars[0]?.key;
  renderShowroom();
}
function leaveShowroom() {
  if (!showOpen) return;
  showOpen = false;
  $('#show-page').hidden = true;
  $('#show-page').replaceChildren();
  $('.workspace').hidden = false;
  document.body.classList.remove('show-open');
  $('#show-crumb').hidden = true;
  render();
}

// ------------------------------------------------------------------------ Drawing
function renderShowroom() {
  if (!showOpen || !showCars) return;
  const page = $('#show-page'),
    scroll = page.querySelector('.sr-main')?.scrollTop || 0,
    shown = showCars.filter(c => showKind === 'all' || c.kind === showKind),
    car = showCars.find(c => c.key === showPick) || showCars[0],
    views = Object.keys(car.template.views),
    panels = k => car.template.views[k].regions.filter(r => r.role === 'body').length,
    // What you typed stays while the same car is chosen.
    same = page.dataset.pick === car.key,
    typedName = same ? page.querySelector('#show-name')?.value : null,
    typedScale = same ? page.querySelector('#show-scale')?.value : null,
    scale =
      typedScale ||
      (store.settings?.defaultScale && store.settings.defaultScale !== 'Other' ? store.settings.defaultScale : '1:32'),
    name =
      typedName ??
      M.nextLiveryName(
        car.template.name,
        store.projects.map(p => p.name)
      );
  page.innerHTML = `<main class="sr-main"><header class="sr-head"><div><span class="sr-eyebrow">No drawing of your own? Start from one of ours</span><h1>Showroom</h1><p>Nine race cars, each with a left and right side, the top and a front three-quarter view, ready to paint.</p></div><button data-show-back>${icon('back')}${project ? 'Back to painting' : 'Back'}</button></header>
<div class="sr-kinds" role="group" aria-label="Kind of car">${SHOW_KINDS.map(
    ([k, label]) =>
      `<button data-show-kind="${k}" aria-pressed="${showKind === k}">${label}${k === 'all' ? ' ' + showCars.length : ''}</button>`
  ).join('')}</div>
<div class="sr-grid">${shown
    .map(
      c =>
        `<button class="sr-card ${c.key === car.key ? 'on' : ''}" data-show-pick="${c.key}" aria-pressed="${c.key === car.key}"><span class="sr-pic">${showPicture(c, 'angled')}</span><span class="sr-card-body"><b>${e(c.template.name)}</b><span class="sr-chip">${showKindName(c.kind)}</span></span></button>`
    )
    .join('')}</div></main>
<aside class="sr-side" aria-label="${e(car.template.name)}"><div class="sr-big">${showPicture(car, 'angled')}</div><div class="sr-side-body"><div class="sr-title"><h2>${e(car.template.name)}</h2><span class="sr-chip sf">SlotForge</span></div><div class="sr-views">${[
    'left',
    'right',
    'top'
  ]
    .filter(k => views.includes(k))
    .map(k => `<div><span class="sr-pic">${showPicture(car, k)}</span><small>${M.LABELS[k]}</small></div>`)
    .join(
      ''
    )}</div><p class="sr-note">${panels('left')} panels on each side, ${panels('top')} on top and ${panels('angled')} in the angled view, already named: paint them straight away. Glass, wheels and lights keep their colours.</p>
<div class="field"><label for="show-name">Livery name</label><input id="show-name" maxlength="180" value="${e(name)}"></div>
<div class="field"><label for="show-scale">Scale of your model</label><select id="show-scale">${CAR_SCALES.map(s => `<option ${s === scale ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
<button class="primary sr-start" id="show-start">${icon('brush')}Start painting</button><p class="sr-note">The car is added to your Garage the first time you paint it.</p></div></aside>`;
  page.dataset.pick = car.key;
  page.querySelector('.sr-main').scrollTop = scroll;
}

// ------------------------------------------------------------------------ Start painting
async function startStockCar() {
  const car = showCars?.find(c => c.key === showPick);
  if (!car) return;
  const scale = $('#show-scale').value,
    name =
      $('#show-name').value.trim() ||
      M.nextLiveryName(
        car.template.name,
        store.projects.map(p => p.name)
      ),
    wanted = carSignature({ ...car.template, scale });
  // The same car at the same scale is used again; otherwise it is added to the Garage.
  let template = null;
  for (const x of store.templates.filter(t => t.name === car.template.name)) {
    const full = await libraryClient.hydrate(store, 'templates', x.id);
    if (full && carSignature(full) === wanted) {
      template = full;
      break;
    }
  }
  if (!template) {
    template = { ...validateTemplate(car.template), scale };
    store.templates.push(template);
  }
  leaveShowroom();
  setProject(M.newProject(template, name));
  // A side is where most liveries start.
  if (project.template.views.left) {
    currentView = 'left';
    resetViewSelection();
    fit();
    render();
  }
  toast(`${name}: the panels are ready to paint.`);
}

// ------------------------------------------------------------------------ Events
document.addEventListener('click', ev => {
  const b = ev.target.closest('#show-page button');
  if (!b || !showOpen) return;
  if (b.dataset.showPick) {
    showPick = b.dataset.showPick;
    renderShowroom();
  } else if (b.dataset.showKind) {
    showKind = b.dataset.showKind;
    if (!showCars.some(c => c.key === showPick && (showKind === 'all' || c.kind === showKind)))
      showPick = showCars.find(c => showKind === 'all' || c.kind === showKind)?.key || showPick;
    renderShowroom();
  } else if (b.hasAttribute('data-show-back')) leaveShowroom();
  else if (b.id === 'show-start') {
    b.disabled = true;
    startStockCar().catch(error => {
      if (b.isConnected) b.disabled = false;
      reportError(error);
    });
  }
});
document.addEventListener('keydown', ev => {
  if (showOpen && ev.key === 'Escape' && !$('#dialog').open && !ev.target.matches?.('input,select,textarea'))
    leaveShowroom();
});
