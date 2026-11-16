// Livery renderer · Dialog helpers, Help, Add car, and car/image import.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function openDialog(title, subtitle, body, foot = '') {
  libraryDetailsReturn = null;
  const dlg = $('#dialog');
  dlg._cleanupPanelStudio?.();
  dlg.classList.remove('panel-studio', 'library-dialog', 'package-dialog', 'decal-import-dialog');
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
function confirmAction(title, description, fn, label = 'Continue') {
  openDialog(
    title,
    description,
    '<p class="note">The current project is saved locally. Export a package if you want an additional backup.</p>',
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="confirm-button">${e(label)}</button>`
  );
  $('#confirm-button').onclick = () => {
    closeDialog();
    fn();
  };
}
function addCarDialog(view = null, replace = false) {
  pendingAdd = { view, replace, owner: project?.id };
  openDialog(
    view ? `${replace ? 'Replace' : 'Add'} ${M.LABELS[view]} view` : 'Add your own car',
    'Choose an illustration or a photograph. Your library is entirely yours.',
    `<div class="row"><div class="field" style="flex:2"><label for="car-name">Car / template name</label><input id="car-name" value="${view ? e(project.template.name) : ''}" placeholder="e.g. My Porsche 911" maxlength="180" ${view ? 'readonly' : ''}></div><div class="field" style="flex:1"><label for="car-scale">Scale</label><select id="car-scale">${CAR_SCALES.map(s => `<option ${(view ? project?.template.scale : store.settings?.defaultScale || project?.template.scale) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div><div class="field"><label for="car-view">View in this image</label><select id="car-view" ${view ? 'disabled' : ''}>${M.VIEWS.map(k => `<option value="${k}" ${k === (view || 'left') ? 'selected' : ''}>${M.LABELS[k]}</option>`).join('')}</select></div><div class="choice-grid"><button class="choice-card" id="choose-svg">${icon('nodes')}<strong>Import vector artwork</strong><small>SVG, EPS or PDF. Click the panels you want to paint. Create all vector regions only if you need them.</small></button><button class="choice-card" id="choose-photo">${icon('image')}<strong>Trace a photograph</strong><small>PNG, JPG or WebP. Trace the silhouette and important features with points to create a flat template.</small></button></div>${view ? '' : `<p class="note sample-note">No artwork to hand? <button class="link-button" data-action="sample-car">Try the sample car</button></p>`}<div class="inline-note">SVG · EPS · PDF. Use flat vector artwork with clear body outlines. EPS and PDF are converted locally; bitmap scans need photo tracing.</div><p class="note">Photo tracing is manual. No AI conversion or 3D reconstruction is implied. Each view is prepared independently.</p>`
  );
  const choose = kind => {
    const n = $('#car-name').value.trim();
    if (!n) {
      $('#car-name').focus();
      return toast('Give your car a name first.');
    }
    pendingAdd = { ...pendingAdd, name: n, scale: $('#car-scale').value, key: $('#car-view').value, kind };
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
  toast(p.kind === 'svg' ? 'Choose the panels you want to paint.' : 'Photograph added. Trace a body outline to begin.');
  if (p.kind === 'svg') choosePaintablePanels();
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

function helpDialog() {
  openDialog(
    'A quick tour',
    'SlotForge Livery · v1.3.0',
    helpTabs(
      `<div class="help-grid"><div><h3>1. Bring your own car</h3><p>Import SVG, EPS or vector PDF artwork, or a PNG/JPG/WebP photograph. Choose a page for multi-page PDFs. Select a view. Each view is independent; an angled photo does not generate other angles.</p><h3>2. Prepare the template</h3><p>For vector files, click the panels you want to paint in the chooser. Only selected panels become editable regions. Reopen Choose paintable panels to adjust the selection. Generate all vector regions is an optional preparation tool for detailed Body, Protect, Detail and Hide assignments. Photos use manual point tracing. Press Enter to close a traced shape.</p><h3>3. Paint & personalise</h3><p>Paint the base, drag rectangles and ellipses, draw curved shapes, add numbers or import SVG/EPS/PDF decals and transparent PNG images with Import decal artwork (I). Import a .sfsheet or .sfdecal file from SlotForge Decals to choose separate decals. For PDF or SVG sheets, enable Select separate decals and draw crop boxes. Imported vector graphics retain their original appearance; their internal text and paths are not Livery editing tools. Use Line (L) to draw open Bézier lines: click for corners, click-drag for curve handles, then Enter, Esc, right-click or Finish line to finish without closing the path. Use Cancel to discard the draft. Choose a stripe preset, then edit thickness, gaps, individual colours and flat/rounded ends. Each line remains an editable layer, and Add to Library saves its stripe settings. Shift-click car areas or shapes on the canvas to add or remove them from a selection. Shift-click or Ctrl-click rows in Layers also selects several; click a label row to select its areas together. Colour, gradient, finish and paint effect controls apply to every selected paintable area or shape. Ctrl-drag continues to pan the canvas. Select and drag artwork to move it; use its bottom-right handle to resize. Click for a corner or click-drag for smooth curve handles. Click near the starting point to close the shape. Use Edit points & curves (A) to adjust anchors and handles later. Open Fit to angled view for skew, compression and pinch controls. Pinch Left, Right, Top or Bottom to narrow the far end; use the sliders for the amount. Reset pinch keeps the skew; Reset all fitting clears both. Groups fit together while retaining editable elements. Scale a group or multi-selection with its corner handle, linked Width/Height or Scale percentage. Line widths and spacing scale with the group. Fine-tune size and rotation in the inspector. Copy Appearance takes a snapshot of one layer’s styling; Paste Appearance applies compatible paint, finish, opacity, line stripe or typeface settings to the selected layers. It keeps their content and fitting, and supports Undo.</p></div><div><h3>4. Reuse & share</h3><p>Shapes stay in your project until you click Add to Library. Shift-click shapes or layer rows to save several as an editable group. Expand a group in Layers to edit its children. Import TTF, OTF, WOFF or WOFF2 files through User Library → Fonts, or Import font beside the text typeface menu. Fonts stay inside Livery and travel with text in shared designs. Apply a saved livery to another car, then adjust the fit. Export .sfpaint packages or a complete library backup. Imports never overwrite existing items.</p><h3>5. Take it to the workshop</h3><p>Add paint product references and notes, then export a PDF. Export PNG saves a cropped, transparent image of a chosen view at 1,000–4,000 pixels, with optional paint finish preview. Matte, satin, gloss, metallic and pearl have optional subtle on-screen cues. Toggle Finish preview above the canvas. Choose Solid or Gradient for paint and shapes; gradients support 2–8 colour stops, positions, angle and strength. PDFs include the gradient colours and paint instructions without the preview sheen. The PDF is a reference, not a calibrated cutting pattern.</p><h3>Keyboard shortcuts</h3><p><span class="shortcut">V</span> Select · <span class="shortcut">A</span> Edit points & curves<br><span class="shortcut">R</span> Rectangle · <span class="shortcut">E</span> Ellipse<br><span class="shortcut">P</span> Polygon · <span class="shortcut">L</span> Line<br><span class="shortcut">T</span> Text<br><span class="shortcut">H</span> Pan · wheel to zoom · middle-drag or Ctrl + left-drag to pan<br><span class="shortcut">Ctrl Z</span> Undo · <span class="shortcut">Ctrl Shift Z</span> Redo<br><span class="shortcut">Ctrl D</span> Duplicate · <span class="shortcut">Delete</span> Remove<br><span class="shortcut">Ctrl S</span> Save project<br><span class="shortcut">Arrows</span> Nudge · <span class="shortcut">Shift</span> + arrows for bigger steps<br><span class="shortcut">Esc</span> Cancel colour picking</p><p>Inspector extras: <strong>Outline</strong> for shapes and text, <strong>Align</strong> to the car or to each other, the eyedropper beside each colour, and <strong>Team colours</strong> saved with your design (right-click a team colour to remove it). Lock a layer in Layers to stop it moving on the canvas.</p><p>Design tools: switch on <strong>Rulers</strong> and drag a guide out of a ruler (drag it back to remove it). With <strong>Snap</strong> on, moved artwork snaps to guides, the car's centre line and panel edges. Text can <strong>bend</strong> and keep its letter shapes while you widen it; shapes and text can have a hard <strong>shadow</strong>. <strong>Add a shape</strong> includes number boards, roundels, chequers, a shield and a star. <strong>Mirror whole side</strong> (Workshop &amp; reuse) copies the left side to the right, and <strong>Side by side</strong> shows another view next to the canvas.</p><p>Workshop: set the <strong>Real size</strong> of a view to see millimetres, choose real paints from the <strong>Paint catalogue</strong> (add Revell, Zero Paints or others under My paints), <strong>Print at true size</strong> for masking templates, and <strong>Send decals to SlotForge Decals</strong>. The workshop PDF lists the painting order, lightest colour first.</p></div></div><div class="inline-note">Your library is stored on this computer. Use Import & Export → Back up my library for a portable copy. No account, cloud upload or API key is needed.</div>`
    )
  );
  showHelpTab(0);
}
// Help is shown as tabs: one per section of the original tour text.
function helpTabs(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'),
    note = doc.querySelector('.inline-note')?.outerHTML || '',
    sections = [];
  for (const h of doc.querySelectorAll('h3')) {
    const body = [];
    for (let n = h.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) body.push(n.outerHTML);
    sections.push({ title: h.textContent.replace(/^d+.s*/, ''), body: body.join('') });
  }
  return `<div class="help-tabs" role="tablist">${sections.map((x, i) => `<button role="tab" data-help-tab="${i}">${e(x.title)}</button>`).join('')}</div>${sections.map((x, i) => `<section class="help-panel" role="tabpanel" data-help-panel="${i}" hidden><h3>${e(x.title)}</h3>${x.body}</section>`).join('')}${note}<p class="note">Tip: step-by-step hints appear in the corner of the canvas. Turn them on or off in Settings.</p>`;
}
function showHelpTab(index) {
  document
    .querySelectorAll('[data-help-tab]')
    .forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.helpTab) === index)));
  document.querySelectorAll('[data-help-panel]').forEach(p => (p.hidden = Number(p.dataset.helpPanel) !== index));
}
