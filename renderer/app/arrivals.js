// Livery renderer · Arrivals: a shared package comes in straight away and the Garage shows it.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// No question first: everything in the package is added as your own copies, and the Garage opens
// on Arrivals. A car you have already (the same drawing and panels) is not added twice; the
// liveries that came with it go on your car. A livery or design with a name you use already is
// called "Name (2)", and the details show yours next to it. Each item has its next step (open it,
// a new livery on a car, use the artwork); one item or the whole package can be sent back.
'use strict';
let garageArrival = null,
  arrivalPick = null;
const ARRIVAL_BUCKETS = ['projects', 'templates', 'liveries', 'assets', 'fonts'],
  ARRIVAL_LABEL = { projects: 'livery', templates: 'car', liveries: 'saved design', assets: 'artwork', fonts: 'font' };

// The same car: the same name, scale, views and panels (their role, name and size). The drawing's
// markup is rewritten when a package is checked, so it is not compared character by character.
const carSignature = t =>
  JSON.stringify([
    t.name,
    t.scale || '',
    Object.keys(t.views || {})
      .sort()
      .map(k => [
        k,
        (t.views[k].regions || []).map(r => [
          r.role,
          r.name,
          r.partLabel || '',
          ...['x', 'y', 'w', 'h'].map(n => Math.round(r.bounds?.[n] || 0))
        ])
      ])
  ]);
function arrivalName(bucket, name) {
  const taken = new Set(store[bucket].filter(x => !x.trashedAt).map(x => x.name));
  if (!taken.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
}
// Adds the validated items of a package and opens the Garage on them. Imports run one at a
// time, so the same package dropped twice cannot add its car twice.
let arriving = Promise.resolve();
function arrive(additions, info = {}) {
  const run = arriving.then(() => arriveNow(additions, info));
  arriving = run.catch(() => {});
  return run;
}
async function arriveNow(additions, info) {
  const yours = [],
    carIds = new Map();
  // A car you have already: keep yours. Only cars with the same name are compared.
  const kept = [];
  for (const t of additions.templates) {
    let mine = null;
    for (const x of store.templates.filter(x => x.name === t.name)) {
      const full = await libraryClient.hydrate(store, 'templates', x.id);
      if (full && carSignature(full) === carSignature(t)) {
        mine = full;
        break;
      }
    }
    if (mine) yours.push(mine.id);
    else kept.push(t);
    carIds.set(carSignature(t), mine ? mine.id : t.id);
  }
  additions.templates = kept;
  // Each livery belongs to its own car (by id), not to any car that happens to share the name.
  for (const p of additions.projects) {
    const id = p.template && carIds.get(carSignature(p.template));
    if (id) p.template.id = id;
  }
  const items = [];
  for (const bucket of ARRIVAL_BUCKETS)
    for (const item of additions[bucket] || []) {
      const clash =
        ['projects', 'liveries'].includes(bucket) && store[bucket].find(x => !x.trashedAt && x.name === item.name);
      if (clash) item.name = arrivalName(bucket, item.name);
      store[bucket].push(item);
      // A livery that was in the Trash goes back there, not into Arrivals.
      if (!item.trashedAt) items.push({ bucket, id: item.id, clash: clash ? clash.id : null });
    }
  garageArrival = { file: info.file || 'package', exported: info.exported || null, items, yours };
  arrivalPick = items[0] ? items[0].bucket + ':' + items[0].id : null;
  scheduleSave();
  await flushSave();
  showGarage('arrivals');
  toast(
    items.length
      ? `${arrivalSummary()} came in, as your own copies.`
      : 'Everything in this package is in your library already.'
  );
}
const arrivalItems = () =>
  (garageArrival?.items || []).map(x => ({ ...x, item: store[x.bucket].find(i => i.id === x.id) })).filter(x => x.item);
function arrivalSummary(list = arrivalItems()) {
  const count = b => list.filter(x => x.bucket === b).length;
  const parts = [
    ['templates', 'car', 'cars'],
    ['projects', 'livery', 'liveries'],
    ['liveries', 'saved design', 'saved designs'],
    ['assets', 'piece of artwork', 'pieces of artwork'],
    ['fonts', 'font', 'fonts']
  ]
    .filter(([b]) => count(b))
    .map(([b, one, many]) => `${count(b)} ${count(b) === 1 ? one : many}`);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0] || 'Nothing';
}
// Sends items back: they were only just added, so they are removed, not put in the Trash.
function sendBack(list) {
  const gone = new Set(list.map(x => x.bucket + ':' + x.id));
  for (const bucket of ARRIVAL_BUCKETS) store[bucket] = store[bucket].filter(i => !gone.has(bucket + ':' + i.id));
  if (project && gone.has('projects:' + project.id)) closeOpenProject(project.id);
  garageArrival.items = garageArrival.items.filter(x => !gone.has(x.bucket + ':' + x.id));
  if (arrivalPick && gone.has(arrivalPick))
    arrivalPick = garageArrival.items[0] ? garageArrival.items[0].bucket + ':' + garageArrival.items[0].id : null;
  scheduleSave();
}
function endArrival() {
  garageArrival = null;
  arrivalPick = null;
  if (garageSection === 'arrivals') showGarage('recent');
}

// ------------------------------------------------------------------------ In the Garage
function arrivalRailHTML() {
  if (!garageArrival) return '';
  const n = arrivalItems().length;
  return `<button class="gr-item gr-arrivals ${garageSection === 'arrivals' ? 'on' : ''}" data-garage-section="arrivals" ${garageSection === 'arrivals' ? 'aria-current="page"' : ''}>${icon('import')}<span class="gr-text">Arrivals</span><span class="gr-n">${n}</span></button>`;
}
function arrivalPicture(x) {
  if (x.bucket === 'fonts')
    return `<span class="ar-font" style="font-family:'${String(x.item.family || x.item.name).replace(/[^\w \-]/g, '')}'">Aa 27</span>`;
  return cardPreview(x.item, x.bucket);
}
function arrivalCard(x) {
  const key = x.bucket + ':' + x.id,
    where =
      x.bucket === 'projects'
        ? `${projectCarName(x.item)} · ${garageArrival.yours.includes(projectCarKey(x.item)) ? 'on your car' : garageArrival.items.some(a => a.bucket === 'templates' && a.id === projectCarKey(x.item)) ? 'with its car' : 'a livery'}`
        : { templates: 'A car', liveries: 'Saved designs', assets: 'Artwork & shapes', fonts: 'Fonts' }[x.bucket];
  return `<button class="gr-card ar-card ${arrivalPick === key ? 'on' : ''}" data-arrival-pick="${e(key)}" aria-pressed="${arrivalPick === key}">${arrivalPicture(x)}<span class="ar-ribbon">${x.clash ? 'New · name in use' : 'New'}</span><span class="gr-card-body"><strong>${e(x.item.name)}</strong><small class="gr-card-car">${e(where)}</small></span></button>`;
}
function arrivalsMainHTML() {
  const list = arrivalItems(),
    yours = garageArrival.yours.map(id => store.templates.find(t => t.id === id)).filter(Boolean),
    onlyCar = list.length === 1 && list[0].bucket === 'templates';
  return `<div class="ar-bar"><span class="ar-pkg">.sfpaint</span><span class="gr-grow"><b>${e(garageArrival.file)} came in</b><small>${list.length ? e(arrivalSummary(list)) + ', as your own copies' : 'Nothing new: all of it is yours already'}${garageArrival.exported ? ' · exported ' + e(new Date(garageArrival.exported).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</small></span>${list.length ? `<button data-arrival-back-all>${icon('undo')}Send ${list.length === 1 ? 'it' : 'it all'} back</button>` : ''}${onlyCar ? `<button class="primary" data-arrival-new="${e(list[0].id)}">${icon('plus')}New livery on it</button>` : `<button class="primary" data-arrival-done>${icon('check')}Done</button>`}</div>${headHTML('Just arrived', 'Arrivals', '')}<div class="gr-grid ar-grid">${list.map(arrivalCard).join('')}${yours
    .map(
      t =>
        `<div class="gr-card ar-card ar-yours">${cardPreview(t, 'templates')}<span class="ar-ribbon">Yours</span><span class="gr-card-body"><strong>${e(t.name)}</strong><small class="gr-card-car">The car was yours already: not added twice</small></span></div>`
    )
    .join(
      ''
    )}${list.length ? '' : `<div class="gr-empty">${icon('check')}<h3>All sent back</h3><p>Nothing new from this package is left in your library.</p></div>`}</div>`;
}
function arrivalsDetailHTML() {
  const x = arrivalItems().find(a => a.bucket + ':' + a.id === arrivalPick);
  if (!x)
    return `<div class="gr-dsec"><span class="gr-eyebrow">Arrivals</span><p>Choose something that came in to see what you can do with it.</p></div>`;
  const key = x.bucket + ':' + x.id,
    mine = x.clash && store[x.bucket].find(i => i.id === x.clash),
    next = {
      projects: `<button class="primary" data-project-open="${e(x.id)}" data-arrival-open>${icon('brush')}Open in Paint Studio</button>`,
      templates: `<button class="primary" data-arrival-new="${e(x.id)}">${icon('plus')}New livery on this car</button>`,
      liveries: project
        ? `<button class="primary" data-arrival-use="${e(key)}">${icon('brush')}Use on ${e(project.name)}</button>`
        : '',
      assets: project
        ? `<button class="primary" data-arrival-use="${e(key)}">${icon('image')}Use on ${e(project.name)}</button>`
        : '',
      fonts: ''
    }[x.bucket];
  return `<div class="gr-dsec"><span class="gr-eyebrow">Arrived · ${e(ARRIVAL_LABEL[x.bucket])}</span><h2>${e(x.item.name)}</h2></div>${
    mine
      ? `<div class="gr-dsec"><h3 class="ar-h3">Same name as yours</h3><div class="ar-cmp"><div>${cardPreview(mine, x.bucket)}<small>Yours · ${e(mine.name)}${mine.updated ? ' · ' + e(ago(mine.updated)) : ''}</small></div><div>${cardPreview(x.item, x.bucket)}<small>Arrived · ${e(x.item.name)}</small></div></div><p class="note">Both are kept: the new one is called ${e(x.item.name)}.</p></div>`
      : ''
  }<div class="gr-dact">${next}<button data-arrival-back="${e(key)}">${icon('undo')}Send ${mine ? 'the new one' : 'it'} back</button></div>${
    x.bucket === 'fonts'
      ? '<p class="note">Fonts are offered in the Typeface list of every text layer.</p>'
      : !project && ['liveries', 'assets'].includes(x.bucket)
        ? '<p class="note">Open a livery to use this on it. It waits in your library.</p>'
        : ''
  }`;
}

// ------------------------------------------------------------------------ Events
document.addEventListener('click', ev => {
  const b = ev.target.closest('#garage-page button');
  if (!b || !garageOpen || garageSection !== 'arrivals') return;
  const d = b.dataset;
  if (d.arrivalPick) {
    arrivalPick = d.arrivalPick;
    renderGarage();
  } else if (d.arrivalBack || b.hasAttribute('data-arrival-back-all')) {
    const list = d.arrivalBack ? arrivalItems().filter(x => x.bucket + ':' + x.id === d.arrivalBack) : arrivalItems();
    const n = list.length;
    sendBack(list);
    renderGarage();
    flushSave().catch(reportError);
    toast(
      n === 1 ? `${list[0].item.name} was sent back.` : `${n} items were sent back. Your own library is as it was.`
    );
  } else if (b.hasAttribute('data-arrival-done')) endArrival();
  else if (d.arrivalNew) {
    libraryClient
      .hydrate(store, 'templates', d.arrivalNew)
      .then(t => {
        if (!t) return;
        garageArrival = null;
        libraryTab = 'templates';
        useLibrary(t.id);
      })
      .catch(reportError);
  } else if (d.arrivalUse) {
    const [bucket, id] = d.arrivalUse.split(':');
    libraryClient
      .hydrate(store, bucket, id)
      .then(async item => {
        if (!item) return;
        await FontLibrary.loadAll(item);
        libraryTab = bucket;
        useLibrary(id);
      })
      .catch(reportError);
  }
});
