// Livery renderer · Guided car setup (remake 2026-11, "Guided setup", docs/ui-reference/prepare-2026-11).
// Steps 1–2 are the Add a car window (dialogs-import.js); after a drawing is imported, this
// page takes over: 3 Panels (what gets paint), 4 Parts (group panels under names you choose),
// 5 Size (real size from the scale) and save. The detailed panel editor (Panel Studio) and
// tracing stay available for drawings this page cannot split into panels, and for photos.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const SETUP_COLOURS = ['#4c9aff', '#3ecf8e', '#f2b705', '#a855f7', '#f06b6f', '#2dd4bf', '#e879f9', '#fb923c'],
  SETUP_SUGGESTIONS = ['Body', 'Bonnet', 'Roof', 'Doors', 'Wings', 'Sills', 'Bumpers', 'Number panel', 'Spoiler'],
  SCALE_FACTOR = { '1:32': 32, '1:24': 24, '1:43': 43, HO: 87 },
  SETUP_STEPS = [
    ['The car', 'Name and scale'],
    ['Drawing', 'The file and its view'],
    ['Panels', 'What gets paint'],
    ['Parts', 'Name them'],
    ['Size', 'Real size, then save']
  ];
let setup = null;
const setupKey = r => r.sourceRegionId + ':' + r.contourIndex;

// The steps on top of the Add a car window (steps 1 and 2) and of the setup page.
function setupStepper(active, clickable = false) {
  return `<div class="setup-stepper" role="group" aria-label="Steps">${SETUP_STEPS.map(([title, sub], i) => {
    const n = i + 1,
      state = n < active ? 'done' : n === active || (active === 1 && n === 2) ? 'on' : '',
      attrs = clickable && n >= 3 ? `data-setup-step="${n}"` : 'tabindex="-1" aria-disabled="true"';
    return `${i ? '<span class="setup-line" aria-hidden="true"></span>' : ''}<button type="button" class="setup-st ${state}" ${attrs} ${state === 'on' ? 'aria-current="step"' : ''}><span class="setup-n">${state === 'done' ? icon('check') : n}</span><span><b>${title}</b><small>${sub}</small></span></button>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ Opening
function openSetup(key = currentView, { fresh = false } = {}) {
  const view = project?.template.views[key];
  if (!view) return;
  if (!view.vectorSource) {
    preparing = true;
    render();
    return toast('Photos are prepared by tracing: use Trace with points on the right.');
  }
  let result;
  try {
    result = TemplateRepair.inspect(view.vectorSource, true, {
      preserve: [...view.regions, ...(view.panelLabels || [])]
    });
  } catch (error) {
    reportError(error);
    return;
  }
  if (!result.candidates.length) {
    preparing = true;
    render();
    return toast('This drawing has no separate panels. Trace the body with Trace with points.');
  }
  const entries = result.candidates.map((region, i) => {
    const existing = view.regions.find(a => setupKey(a) === setupKey(region)),
      saved = view.panelLabels?.find(a => setupKey(a) === setupKey(region)),
      label = saved?.label || existing?.partLabel || '';
    const paint =
      typeof saved?.paintable === 'boolean' ? saved.paintable : existing ? existing.role === 'body' : !!label;
    return { region, index: i + 1, existing, paint, label };
  });
  const parts = [...new Set(entries.filter(a => a.paint && a.label).map(a => a.label))],
    factor = SCALE_FACTOR[project.template.scale];
  setup = {
    key,
    step: 3,
    view,
    result,
    entries,
    parts: parts.length ? parts : ['Body'],
    part: parts[0] || 'Body',
    fresh,
    saveAs: 'update',
    newName: project.template.name + ' (copy)',
    scale: project.template.scale || '1:32',
    modelMm: view.realWidthMm || '',
    realMm: view.realWidthMm && factor ? Math.round(view.realWidthMm * factor) : '',
    hover: null,
    vb: null
  };
  setupFit();
  showSetup();
}
function setupFit() {
  const { view, result } = setup,
    shapes = view.vectorSource.regions.filter(r => r.role !== 'hidden' && !result.backgrounds.includes(r.id)),
    b = M.boundsOfPoints(
      shapes.flatMap(r => [
        { x: r.bounds.x, y: r.bounds.y },
        { x: r.bounds.x + r.bounds.w, y: r.bounds.y + r.bounds.h }
      ])
    );
  setup.vb = { x: b.x - b.w * 0.06, y: b.y - b.h * 0.1, w: Math.max(50, b.w * 1.12), h: Math.max(30, b.h * 1.2) };
}
function showSetup() {
  hideGarage();
  leavePack();
  closeDialog();
  closeMenus();
  $('.workspace').hidden = true;
  $('#setup-page').hidden = false;
  document.body.classList.add('setup-open');
  $('#setup-crumb').hidden = false;
  $('#setup-crumb').textContent = setup.fresh ? 'Add a car' : 'Prepare ' + project.template.name;
  renderSetup();
}
function leaveSetup() {
  setup = null;
  $('#setup-page').hidden = true;
  $('#setup-page').replaceChildren();
  $('.workspace').hidden = false;
  document.body.classList.remove('setup-open');
  $('#setup-crumb').hidden = true;
}
// Cancel keeps the car in preparation, as it was before the page opened.
function cancelSetup() {
  if (!setup) return;
  leaveSetup();
  preparing = !activeView()?.regions.some(r => r.role === 'body') || preparing;
  render();
}

// ---------------------------------------------------------------- The view
// The same view Panel Studio builds: chosen panels become paintable regions with their part name.
function setupBuild() {
  const { view, result, entries } = setup,
    next = M.clone(view);
  next.vectorSource.regions.forEach(r => {
    if (result.backgrounds.includes(r.id)) r.role = 'hidden';
  });
  const offered = new Set(entries.map(a => setupKey(a.region)));
  next.regions = view.regions.filter(r => !r.sourceRegionId || !offered.has(setupKey(r))).map(M.clone);
  for (const a of entries)
    if (a.paint || a.existing) {
      const r = a.existing
        ? M.clone(a.existing)
        : { ...M.clone(a.region), role: 'body', colour: undefined, name: `${a.label || 'Panel'} ${a.index}` };
      r.role = a.paint ? 'body' : 'protected';
      r.partLabel = (a.paint ? a.label : a.existing?.partLabel) || undefined;
      next.regions.push(r);
    }
  next.panelLabels = [
    ...(view.panelLabels || []).filter(x => !offered.has(setupKey(x))),
    ...entries
      .filter(a => a.paint && a.label)
      .map(a => ({
        sourceRegionId: a.region.sourceRegionId,
        contourIndex: a.region.contourIndex,
        label: a.label,
        paintable: true
      }))
  ];
  return next;
}
const partColour = name => SETUP_COLOURS[Math.max(0, setup.parts.indexOf(name)) % SETUP_COLOURS.length];
const painted = () => setup.entries.filter(a => a.paint);

// ----------------------------------------------------------------- Drawing
function setupCanvasHTML() {
  const preview = M.clone(project),
    vb = setup.vb;
  preview.template.views[setup.key] = setupBuild();
  preview.base = '#ffffff';
  preview.views[setup.key] = [];
  for (const r of preview.template.views[setup.key].regions) if (r.role === 'body') delete r.colour;
  const sorted = [...setup.entries].sort(
    (a, b) => b.region.bounds.w * b.region.bounds.h - a.region.bounds.w * a.region.bounds.h
  );
  const overlay = a => {
    const fill = a.paint ? (setup.step === 3 ? '#4c9aff' : partColour(a.label || 'Body')) : '#4c9aff',
      opacity = a.paint ? (setup.step === 3 ? 0.42 : 0.7) : 0,
      stroke = a.paint ? fill : 'transparent';
    return `<g data-setup-area="${a.region.id}" class="panel-area-hit"><g style="--area-colour:${fill};--area-opacity:${opacity};--area-stroke:${stroke}" class="panel-area-overlay">${V.geometryMarkup(a.region)}</g></g>`;
  };
  return `<svg id="setup-canvas" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" aria-label="The car drawing: click panels">${V.renderView(preview, setup.key, { id: 'setup' })}${setup.step === 5 ? '' : sorted.map(overlay).join('')}<g id="setup-hover" pointer-events="none"></g></svg>`;
}
function stepHeadHTML(step) {
  const head = {
    3: [
      'Click everything you will paint',
      'Click a panel to add it, click again to leave it as drawn. Windows, lights and wheels usually stay as drawn.'
    ],
    4: [
      'Group the panels into parts',
      'A part is what you paint in one go. Choose a part on the right, then click its panels. One Body is fine too.'
    ],
    5: [
      'How big is the real car?',
      'With the size, rulers read millimetres, and masks and decals print at the size of your model.'
    ]
  }[step];
  return `<div class="setup-q"><div><span class="setup-eyebrow">Step ${step} of 5</span><h2>${head[0]}</h2><p>${head[1]}</p></div>${
    step === 3
      ? `<div class="setup-q-actions"><button data-setup-all>Paint every panel</button><button data-setup-none>Clear</button></div>`
      : ''
  }</div>`;
}
function sideHTML() {
  const s = setup;
  if (s.step === 3) {
    const n = painted().length;
    return `<section class="setup-sec"><h4>Panels <span>${n} of ${s.entries.length} get paint</span></h4><div class="setup-list">${s.entries
      .map(
        a =>
          `<label class="setup-row ${a.paint ? 'on' : ''}" data-setup-row="${a.region.id}"><input type="checkbox" data-setup-check="${a.region.id}" ${a.paint ? 'checked' : ''}><span>Panel ${a.index}</span><small>${a.paint ? (a.label ? e(a.label) : 'gets paint') : 'stays as drawn'}</small></label>`
      )
      .join(
        ''
      )}</div></section><section class="setup-sec"><h4>Is a panel missing?</h4><p class="note">Some drawings keep the body as one outline, or hide small panels. The detailed editor can bring back filtered areas, and you can trace a panel by hand.</p><div class="setup-row-buttons"><button data-setup-detailed>${icon('nodes')}Detailed editor</button><button data-setup-trace>${icon('pen')}Trace by hand</button></div></section>`;
  }
  if (s.step === 4) {
    const count = name => painted().filter(a => (a.label || 'Body') === name).length;
    return `<section class="setup-sec"><h4>Parts <span>click one, then its panels</span></h4><div class="setup-parts">${s.parts
      .map(
        p =>
          `<button class="setup-part ${p === s.part ? 'on' : ''}" data-setup-part="${e(p)}" aria-pressed="${p === s.part}"><span class="setup-dot" style="background:${partColour(p)}"></span><span class="setup-part-name">${e(p)}</span><small>${count(p)} ${count(p) === 1 ? 'panel' : 'panels'}</small>${s.parts.length > 1 ? `<span class="setup-part-remove" data-setup-remove-part="${e(p)}" role="button" aria-label="Remove ${e(p)}" title="Remove this part; its panels go to ${e(s.parts.find(x => x !== p))}">${icon('close')}</span>` : ''}</button>`
      )
      .join(
        ''
      )}</div><form class="setup-new-part" id="setup-new-part"><input id="setup-part-name" maxlength="40" placeholder="New part, e.g. Bonnet" aria-label="New part name"><button type="submit">${icon('plus')}Add</button></form></section><section class="setup-sec"><h4>Suggestions</h4><div class="setup-chips">${SETUP_SUGGESTIONS.filter(
      x => !s.parts.includes(x)
    )
      .map(x => `<button class="setup-chip" data-setup-suggest="${e(x)}">${e(x)}</button>`)
      .join('')}</div></section>`;
  }
  const factor = SCALE_FACTOR[s.scale],
    sideView = ['left', 'right', 'top'].includes(s.key),
    realLabel = sideView ? 'Real car, nose to tail' : 'Real car, side to side',
    inLibrary = !s.fresh;
  return `<section class="setup-sec"><h4>Size <span>${M.LABELS[s.key]} view</span></h4><div class="setup-scales" role="group" aria-label="Scale">${CAR_SCALES.map(
    x =>
      `<button class="setup-chip ${s.scale === x ? 'on' : ''}" data-setup-scale="${x}" aria-pressed="${s.scale === x}">${x}</button>`
  ).join('')}</div>${
    factor
      ? `<div class="setup-calc"><div class="field"><label for="setup-real">${realLabel}</label><span class="setup-input"><input id="setup-real" type="number" min="100" max="20000" step="1" value="${s.realMm}" placeholder="e.g. 4420"><small>mm</small></span></div><span class="setup-eq">÷ ${factor} =</span><div class="field"><label>Your model</label><output id="setup-model" class="setup-out">${s.modelMm ? M.number(s.modelMm).toFixed(1).replace(/\.0$/, '') + ' mm' : '–'}</output></div></div><p class="note">Or measure your body shell: <button class="link-button" data-setup-measure>type the model size</button>.</p>`
      : `<div class="field"><label for="setup-model-mm">Your model (mm)</label><span class="setup-input"><input id="setup-model-mm" type="number" min="1" max="3000" step="0.5" value="${s.modelMm}" placeholder="e.g. 142"><small>mm</small></span></div>`
  }<p class="note">You can skip this and set it later in the Workshop tab.</p></section><section class="setup-sec"><h4>Save as</h4>${
    inLibrary
      ? `<label class="setup-radio ${s.saveAs === 'update' ? 'on' : ''}"><input type="radio" name="setup-save" value="update" ${s.saveAs === 'update' ? 'checked' : ''}><span><b>Update ${e(project.template.name)}</b><small>New liveries use it. Liveries already made keep their copy.</small></span></label><label class="setup-radio ${s.saveAs === 'new' ? 'on' : ''}"><input type="radio" name="setup-save" value="new" ${s.saveAs === 'new' ? 'checked' : ''}><span><b>A new car</b><small>Keeps ${e(project.template.name)} as it is.</small>${s.saveAs === 'new' ? `<input id="setup-new-name" maxlength="180" value="${e(s.newName)}" aria-label="Name of the new car">` : ''}</span></label>`
      : `<div class="setup-radio on"><span><b>A new car: ${e(project.template.name)}</b><small>In your Garage, ready for liveries.</small></span></div>`
  }</section>`;
}
function footHTML() {
  const s = setup,
    next = { 3: 'Next: name the parts', 4: 'Next: size', 5: 'Save the car and start painting' }[s.step];
  return `<div class="setup-foot">${s.step > 3 ? `<button data-setup-back>${icon('back')}Back</button>` : `<button data-setup-cancel>Cancel</button>`}<span class="setup-grow"></span>${
    s.step === 4 ? '<button class="ghost" data-setup-skip>Skip: one Body is fine</button>' : ''
  }<span class="setup-foot-note">${s.step === 5 ? '' : 'Cancel keeps the car, so you can finish it later.'}</span><button class="primary setup-next" data-setup-next ${s.step === 3 && !painted().length ? 'disabled title="Choose at least one panel"' : ''}>${s.step === 5 ? icon('brush') : ''}${next}${s.step < 5 ? icon('chev') : ''}</button></div>`;
}
function renderSetup() {
  if (!setup) return;
  const page = $('#setup-page'),
    listScroll = page.querySelector('.setup-list')?.scrollTop || 0,
    focusId = document.activeElement?.id;
  page.innerHTML = `${setupStepper(setup.step, true)}<div class="setup-body"><main class="setup-main">${stepHeadHTML(setup.step)}<div class="setup-board">${setupCanvasHTML()}${setup.step === 5 ? sizeLineHTML() : `<p class="setup-status" id="setup-status">${setup.step === 3 ? 'Hover a panel to find it in the list.' : `Painting <b>${e(setup.part)}</b>: click its panels.`}</p>`}</div></main><aside class="setup-side">${sideHTML()}</aside></div>${footHTML()}`;
  const list = page.querySelector('.setup-list');
  if (list) list.scrollTop = listScroll;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}
function sizeLineHTML() {
  const s = setup;
  if (!s.modelMm) return '<p class="setup-status">Enter the size on the right, or skip it for now.</p>';
  const model = M.number(s.modelMm).toFixed(1).replace(/\.0$/, '');
  return `<p class="setup-dim"><span></span>${s.realMm ? `${s.realMm} mm real · ` : ''}${model} mm at ${e(s.scale)}<span></span></p>`;
}

// ---------------------------------------------------------------- Saving
function finishSetup() {
  const s = setup;
  if (!painted().length) return toast('Choose at least one panel to paint.');
  record();
  const next = setupBuild();
  if (s.modelMm > 0) next.realWidthMm = M.number(s.modelMm, 0, 1, 3000);
  project.template.views[s.key] = next;
  project.template.scale = s.scale;
  if (s.saveAs === 'new' && !s.fresh) {
    project.template.id = M.uid();
    project.template.name = M.name(s.newName.trim() || project.template.name + ' (copy)');
  } else {
    const i = store.templates.findIndex(t => t.id === project.template.id);
    if (i >= 0) store.templates[i] = { ...store.templates[i], scale: s.scale };
  }
  currentView = s.key;
  selectedRegion = null;
  leaveSetup();
  updateBounds();
  defaultPaintSelection();
  actions['finish-preparation']();
}

// ----------------------------------------------------------------- Events
function setupToggle(id, value) {
  const a = setup.entries.find(x => x.region.id === id);
  if (!a) return;
  if (setup.step === 3) {
    a.paint = value ?? !a.paint;
  } else if (setup.step === 4) {
    if (!a.paint) {
      a.paint = true;
      a.label = setup.part;
    } else a.label = a.label === setup.part && setup.part !== setup.parts[0] ? setup.parts[0] : setup.part;
  }
  renderSetup();
}
function setupAddPart(name) {
  const label = M.partLabel(name);
  if (!label) return;
  if (!setup.parts.includes(label)) setup.parts.push(label);
  setup.part = label;
  renderSetup();
}
document.addEventListener('click', ev => {
  if (!setup) return;
  const area = ev.target.closest('#setup-canvas [data-setup-area]');
  if (area) return setupToggle(area.dataset.setupArea);
  const b = ev.target.closest('#setup-page button, #setup-page [data-setup-remove-part]');
  if (!b) return;
  const d = b.dataset,
    s = setup;
  if (d.setupRemovePart) {
    ev.stopPropagation();
    const keep = s.parts.find(p => p !== d.setupRemovePart);
    for (const a of s.entries) if (a.label === d.setupRemovePart) a.label = keep;
    s.parts = s.parts.filter(p => p !== d.setupRemovePart);
    if (s.part === d.setupRemovePart) s.part = keep;
    renderSetup();
  } else if (d.setupStep) {
    const step = Number(d.setupStep);
    if (step > 3 && !painted().length) return toast('Choose at least one panel to paint.');
    s.step = step;
    renderSetup();
  } else if (d.setupAll !== undefined || d.setupNone !== undefined) {
    for (const a of s.entries) a.paint = d.setupAll !== undefined;
    renderSetup();
  } else if (d.setupPart) {
    s.part = d.setupPart;
    renderSetup();
  } else if (d.setupSuggest) setupAddPart(d.setupSuggest);
  else if (d.setupScale) {
    s.scale = d.setupScale;
    const factor = SCALE_FACTOR[s.scale];
    if (factor && s.realMm) s.modelMm = Math.round((s.realMm / factor) * 10) / 10;
    renderSetup();
  } else if (d.setupMeasure !== undefined) {
    s.scale = 'Other';
    renderSetup();
    $('#setup-model-mm')?.focus();
  } else if (d.setupNext !== undefined) {
    if (s.step === 3) {
      if (!painted().length) return toast('Choose at least one panel to paint.');
      // Panels without a part start in the first part.
      for (const a of painted()) if (!a.label) a.label = s.parts[0];
      for (const a of painted()) if (!s.parts.includes(a.label)) s.parts.push(a.label);
    }
    if (s.step === 5) return finishSetup();
    s.step++;
    renderSetup();
  } else if (d.setupSkip !== undefined) {
    for (const a of painted()) a.label = s.parts[0];
    s.parts = [s.parts[0]];
    s.part = s.parts[0];
    s.step = 5;
    renderSetup();
  } else if (d.setupBack !== undefined) {
    s.step--;
    renderSetup();
  } else if (d.setupCancel !== undefined) cancelSetup();
  else if (d.setupDetailed !== undefined || d.setupTrace !== undefined) {
    // Keep what was chosen so far, then continue in the studio's preparation tools.
    const next = setupBuild(),
      key = s.key;
    record();
    project.template.views[key] = next;
    currentView = key;
    leaveSetup();
    preparing = true;
    changed();
    if (d.setupDetailed !== undefined) {
      render();
      choosePaintablePanels();
    } else {
      tool = 'polygon';
      drawPoints = [];
      render();
    }
  }
});
document.addEventListener('change', ev => {
  if (!setup) return;
  const t = ev.target;
  if (t.dataset.setupCheck) setupToggle(t.dataset.setupCheck, t.checked);
  else if (t.name === 'setup-save') {
    setup.saveAs = t.value;
    renderSetup();
  } else if (t.id === 'setup-new-name') setup.newName = t.value;
});
document.addEventListener('input', ev => {
  if (!setup) return;
  const t = ev.target;
  if (t.id === 'setup-real') {
    setup.realMm = Math.max(0, Math.round(Number(t.value) || 0)) || '';
    const factor = SCALE_FACTOR[setup.scale];
    setup.modelMm = setup.realMm && factor ? Math.round((setup.realMm / factor) * 10) / 10 : '';
    const out = $('#setup-model');
    if (out) out.textContent = setup.modelMm ? String(setup.modelMm).replace(/\.0$/, '') + ' mm' : '–';
    const line = document.querySelector('.setup-board .setup-dim, .setup-board .setup-status');
    if (line) line.outerHTML = sizeLineHTML();
  } else if (t.id === 'setup-model-mm') {
    setup.modelMm = Number(t.value) > 0 ? Number(t.value) : '';
    setup.realMm = '';
  } else if (t.id === 'setup-new-name') setup.newName = t.value;
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'setup-new-part') return;
  ev.preventDefault();
  setupAddPart($('#setup-part-name').value);
});
document.addEventListener('pointerover', ev => {
  if (!setup || setup.step === 5) return;
  const id = ev.target.closest?.('#setup-canvas [data-setup-area], [data-setup-row]')?.dataset;
  const regionId = id?.setupArea || id?.setupRow,
    a = regionId && setup.entries.find(x => x.region.id === regionId),
    hover = $('#setup-hover');
  if (!hover) return;
  hover.innerHTML = a ? V.geometryMarkup(a.region, 'outline') : '';
  for (const shape of hover.querySelectorAll('[data-geometry]')) {
    shape.setAttribute('stroke', '#e5484d');
    shape.setAttribute('stroke-width', '2.5');
    shape.setAttribute('vector-effect', 'non-scaling-stroke');
  }
  const status = $('#setup-status');
  if (status && a)
    status.innerHTML =
      setup.step === 3
        ? `Panel ${a.index} · ${a.paint ? 'gets paint · click to leave it as drawn' : 'stays as drawn · click to paint it'}`
        : a.paint
          ? `Panel ${a.index} · ${e(a.label || setup.parts[0])} · click to make it <b>${e(setup.part)}</b>`
          : `Panel ${a.index} · stays as drawn · click to paint it as <b>${e(setup.part)}</b>`;
  document.querySelectorAll('.setup-row.hover').forEach(r => r.classList.remove('hover'));
  if (a) document.querySelector(`[data-setup-row="${CSS.escape(a.region.id)}"]`)?.classList.add('hover');
});
document.addEventListener(
  'keydown',
  ev => {
    if (!setup || ev.key !== 'Escape' || $('#dialog').open) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelSetup();
  },
  true
);
