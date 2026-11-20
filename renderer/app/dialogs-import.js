// Livery renderer · Dialog helpers, Help, Add car, and car/image import.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
// kind: '' for an ordinary window; 'confirm' (a question), 'alert' (a message) or 'danger'
// (cannot be undone) draws it as a Flag Dialog with a ? / i / ! badge (renderer/restyle.css).
function openDialog(title, subtitle, body, foot = '', kind = '') {
  libraryDetailsReturn = null;
  const dlg = $('#dialog');
  dlg._cleanupPanelStudio?.();
  dlg.classList.remove(
    'panel-studio',
    'library-dialog',
    'package-dialog',
    'decal-import-dialog',
    'flag-dialog',
    'flag-confirm',
    'flag-alert',
    'flag-danger',
    'projects-dialog',
    'help-dialog',
    'monitor-dialog',
    'setup-dialog',
    'colour-dialog',
    'paint-dialog'
  );
  if (kind) dlg.classList.add('flag-dialog', 'flag-' + kind);
  $('#dialog-content').innerHTML =
    `<div class="dialog-head"><div><h2>${e(title)}</h2><p>${e(subtitle)}</p></div><button data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>${foot ? `<div class="dialog-foot">${foot}</div>` : ''}`;
  if (!dlg.open) dlg.showModal();
}
function closeDialog() {
  if (libraryDetailsReturn) {
    const back = libraryDetailsReturn;
    libraryDetailsReturn = null;
    back();
    return;
  }
  $('#dialog').close();
  pendingPackage = null;
  pendingAdd = null;
}
function askName(title, initial, onSave) {
  openDialog(
    title,
    'Choose a name you will recognise in your library.',
    `<label class="field">Name<input id="name-input" value="${e(initial)}" maxlength="180"></label>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="name-save">Save</button>`
  );
  $('#name-save').onclick = () => {
    const n = $('#name-input').value.trim();
    if (!n) return;
    closeDialog();
    onSave(n);
  };
  $('#name-input').focus();
  $('#name-input').select();
  $('#name-input').onkeydown = ev => {
    if (ev.key === 'Enter') $('#name-save').click();
  };
}
function confirmAction(title, description, fn, label = 'Continue', kind = 'confirm') {
  openDialog(
    title,
    description,
    '<p class="note">The current project is saved locally. Export a package if you want an additional backup.</p>',
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="confirm-button">${e(label)}</button>`,
    kind
  );
  $('#confirm-button').onclick = () => {
    closeDialog();
    fn();
  };
}
function addCarDialog(view = null, replace = false) {
  startDropped = null;
  pendingAdd = { view, replace, owner: project?.id };
  openDialog(
    view ? `${replace ? 'Replace' : 'Add'} ${M.LABELS[view]} view` : 'Add a car',
    view
      ? 'Choose the drawing or photo of this view. Next you choose what gets paint.'
      : 'Name the car and choose its drawing. Next you choose what gets paint.',
    `${setupStepper(1)}<div class="row"><div class="field" style="flex:2"><label for="car-name">Car / template name</label><input id="car-name" value="${view ? e(project.template.name) : ''}" placeholder="e.g. My Porsche 911" maxlength="180" ${view ? 'readonly' : ''}></div><div class="field" style="flex:1"><label for="car-scale">Scale</label><select id="car-scale">${CAR_SCALES.map(s => `<option ${(view ? project?.template.scale : store.settings?.defaultScale || project?.template.scale) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div><div class="field"><label for="car-view">View in this image</label><select id="car-view" ${view ? 'disabled' : ''}>${M.VIEWS.map(k => `<option value="${k}" ${k === (view || 'left') ? 'selected' : ''}>${M.LABELS[k]}</option>`).join('')}</select></div><div class="choice-grid"><button class="choice-card" id="choose-svg">${icon('nodes')}<strong>Import vector artwork</strong><small>SVG, EPS or PDF. Click the panels you want to paint. Create all vector regions only if you need them.</small></button><button class="choice-card" id="choose-photo">${icon('image')}<strong>Trace a photograph</strong><small>PNG, JPG or WebP. Trace the silhouette and important features with points to create a flat template.</small></button></div>${view ? '' : `<p class="note sample-note">No artwork to hand? <button class="link-button" data-action="sample-car">Try the sample car</button></p>`}<p class="note">SVG, EPS and PDF drawings are converted on this computer. A scan or photo is traced by hand.</p>`
  );
  $('#dialog').classList.add('setup-dialog');
  const choose = kind => {
    const n = $('#car-name').value.trim();
    if (!n) {
      $('#car-name').focus();
      return toast('Give your car a name first.');
    }
    pendingAdd = { ...pendingAdd, name: n, scale: $('#car-scale').value, key: $('#car-view').value, kind };
    // A drawing dropped on the Start page is used as it is.
    if (startDropped) {
      const file = startDropped;
      startDropped = null;
      return importCar(file).catch(reportError);
    }
    $('#car-file').accept =
      kind === 'svg'
        ? '.svg,.eps,.pdf,image/svg+xml,application/pdf,application/postscript'
        : 'image/png,image/jpeg,image/webp';
    $('#car-file').click();
  };
  $('#choose-svg').onclick = () => choose('svg');
  $('#choose-photo').onclick = () => choose('photo');
}
// A ready-made car so new users can try the whole flow before preparing their own.
async function trySampleCar() {
  const used = new Set(store.templates.map(t => t.name));
  let name = 'Sample coupe',
    n = 2;
  while (used.has(name)) name = 'Sample coupe ' + n++;
  // Use the normal Add car path, so the sample is prepared exactly like a user's car.
  addCarDialog();
  pendingAdd = { ...pendingAdd, name, scale: pref('defaultScale', '1:32'), key: 'left', kind: 'svg' };
  await importCar(new File([window.SAMPLE_CAR_SVG], 'sample-car.svg', { type: 'image/svg+xml' }));
}
async function fileData(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Please use an image smaller than 10 MB.');
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  if (!M.validImage(data)) throw new Error('Use PNG, JPEG or WebP images.');
  const img = new Image();
  img.src = data;
  await img.decode();
  return { src: data, width: img.naturalWidth, height: img.naturalHeight };
}
function importIsCurrent(p) {
  return pendingAdd === p && $('#dialog').open && p.owner === project?.id;
}
async function importCar(file) {
  if (!pendingAdd) return;
  const p = pendingAdd;
  let view;
  if (p.kind === 'svg') {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['eps', 'pdf'].includes(ext)) {
      await importVectorDocument(file, p);
      return;
    }
    if (ext !== 'svg') throw new Error('Choose an SVG, EPS or PDF illustration.');
    if (file.size > 5e6) throw new Error('Use an SVG smaller than 5 MB.');
    const text = await file.text();
    if (!importIsCurrent(p)) return;
    view = V.importSVG(text);
  } else {
    const im = await fileData(file);
    if (!importIsCurrent(p)) return;
    const s = Math.min(850 / im.width, 440 / im.height);
    view = {
      regions: [],
      bounds: { x: (1000 - im.width * s) / 2, y: (600 - im.height * s) / 2, w: im.width * s, h: im.height * s },
      source: 'photo',
      showPhoto: true,
      photo: {
        src: im.src,
        x: (1000 - im.width * s) / 2,
        y: (600 - im.height * s) / 2,
        w: im.width * s,
        h: im.height * s
      }
    };
  }
  finishCarImport(p, view);
}
async function importVectorDocument(file, p, page = null) {
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose an EPS or PDF smaller than 25 MB.');
    openDialog(
      'Preparing vector artwork',
      file.name,
      `<div class="import-info"><strong>Converting ${page ? 'page ' + page : 'your illustration'}…</strong><p class="note">This happens on your computer. Curves and outlines become selectable template regions.</p></div>`,
      `<button data-action="close-dialog">Cancel import</button>`
    );
    const result = await window.desktop.convertVector({
      format: file.name.split('.').pop().toLowerCase(),
      bytes: new Uint8Array(await file.arrayBuffer()),
      page
    });
    if (!importIsCurrent(p)) return;
    if (!result.svg) {
      openDialog(
        'Choose a page',
        file.name,
        `<p>This document has ${result.pages} pages. Import the page containing the view you want to prepare.</p><div class="field"><label for="vector-page">Page number</label><input id="vector-page" type="number" min="1" max="${result.pages}" step="1" value="1"></div><p class="note">You can import another page later as another view.</p>`,
        `<button data-action="close-dialog">Cancel</button><button class="primary" id="import-vector-page">Import page</button>`
      );
      $('#import-vector-page').onclick = () => {
        const value = Number($('#vector-page').value);
        if (!Number.isInteger(value) || value < 1 || value > result.pages)
          return toast(`Choose a page from 1 to ${result.pages}.`);
        importVectorDocument(file, p, value).catch(reportError);
      };
      return;
    }
    finishCarImport(p, V.importSVG(result.svg));
  } catch (error) {
    if (importIsCurrent(p)) {
      addCarDialog(p.view, p.replace);
      $('#car-name').value = p.name;
      $('#car-scale').value = p.scale;
      $('#car-view').value = p.key;
    }
    throw error;
  }
}
function finishCarImport(p, view) {
  if (!importIsCurrent(p)) return;
  if (p.kind === 'svg') view = { ...view, regions: [], vectorSource: M.clone(view) };
  if (p.view) {
    record();
    project.template.views[p.key] = view;
    if (p.replace) project.views[p.key] = [];
  } else {
    const template = {
      id: M.uid(),
      name: p.name,
      scale: p.scale,
      views: { [p.key]: view },
      creator: '',
      description: '',
      updated: new Date().toISOString()
    };
    store.templates.push(M.clone(template));
    setProject(
      M.newProject(
        template,
        M.nextLiveryName(
          template.name,
          store.projects.map(p => p.name)
        )
      )
    );
  }
  currentView = p.key;
  preparing = true;
  selected = null;
  selectedRegion = view.regions.find(r => r.role === 'body')?.id || null;
  tool = 'select';
  drawPoints = [];
  closeDialog();
  pendingAdd = null;
  fit();
  changed();
  render();
  if (p.kind === 'svg') openSetup(p.key, { fresh: !p.view });
  else toast('Photograph added. Trace a body outline to begin.');
}
async function addImage(file) {
  if (/\.(svg|eps|pdf|sfsheet|sfdecal)$/i.test(file.name)) return window.DecalImport.open(file);
  const im = await fileData(file),
    asset = {
      id: M.uid(),
      name: file.name.replace(/\.[^.]+$/, ''),
      type: 'image',
      src: im.src,
      width: im.width,
      height: im.height
    };
  store.assets.push(asset);
  scheduleSave();
  if (project) {
    const w = Math.min(240, im.width),
      h = (w * im.height) / im.width;
    addLayer(M.layer('image', { name: asset.name, src: im.src, x: 500 - w / 2, y: 300 - h / 2, w, h }));
    toast('Image added to your artwork and library.');
  } else {
    toast('Image saved to your library.');
    openLibrary('assets');
  }
}
function previewTemplate(t, id) {
  const p = M.newProject(t);
  return V.standalone(p, Object.keys(t.views)[0], id);
}
