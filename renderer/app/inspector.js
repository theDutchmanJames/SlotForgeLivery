// Livery renderer · Right-hand inspector: paint, gradients, appearance copy/paste, folders.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function paintTargets() {
  const items = artworkSelection();
  return items.length
    ? items.filter(l => !['image', 'vector'].includes(l.kind))
    : paintRegions().length
      ? paintRegions()
      : [project];
}
function currentPaint() {
  const items = artworkSelection();
  return items.length
    ? M.paintOf(items.find(l => !['image', 'vector'].includes(l.kind)) || items[0])
    : M.paintOf(project, paintRegions()[0]);
}
function setPaintProperty(key, value) {
  for (const target of paintTargets()) {
    target[key] = M.clone(value);
    if (target.role) target.paintVisible = true;
  }
}
function editGradient(fn) {
  const g = M.clone(currentPaint().gradient || M.defaultGradient(currentPaint().fill));
  fn(g);
  g.scope = artworkSelection().length
    ? 'area'
    : selectedPaint?.startsWith('g:')
      ? 'label'
      : paintRegions().length
        ? 'area'
        : 'view';
  setPaintProperty('gradient', M.validateGradient(g));
  setPaintProperty('fillType', 'gradient');
}
function paintChip(p) {
  return p.fillType === 'gradient' ? gradientCSS(p) : p.fill;
}
function gradientCSS(p) {
  const g = p.gradient || M.defaultGradient(p.fill);
  return `linear-gradient(${g.angle + 90}deg,${g.stops.map(s => M.mixColour(p.fill, s.colour, g.strength) + ' ' + s.offset * 100 + '%').join(',')})`;
}
function fillFields(p) {
  const g = p.gradient || M.defaultGradient(p.fill);
  return `<div class="field"><label>Fill</label><div class="segmented"><button data-fill-type="solid" aria-pressed="${p.fillType !== 'gradient'}">Solid</button><button data-fill-type="gradient" aria-pressed="${p.fillType === 'gradient'}">Gradient</button></div></div>${
    p.fillType === 'gradient'
      ? `<div class="gradient-controls"><div class="gradient-preview" style="background:${gradientCSS(p)}"></div>${[
          ['angle', 'Angle', 360, '°', g.angle],
          ['strength', 'Strength', 100, '%', Math.round(g.strength * 100)]
        ]
          .map(
            ([key, label, max, unit, value]) =>
              `<label class="gradient-range" for="gradient-${key}"><span>${label}</span><output data-gradient-output="${key}">${value}${unit}</output><input id="gradient-${key}" data-gradient-key="${key}" type="range" min="0" max="${max}" value="${value}" aria-label="Gradient ${label.toLowerCase()}"></label>`
          )
          .join(
            ''
          )}<div class="gradient-stops">${g.stops.map((stop, i) => `<div class="gradient-stop"><input type="color" data-stop-colour="${i}" value="${stop.colour}" aria-label="Colour stop ${i + 1}"><input type="number" min="0" max="100" data-stop-offset="${i}" value="${Math.round(stop.offset * 100)}" aria-label="Position of colour stop ${i + 1}"><span>%</span><button data-remove-stop="${i}" ${g.stops.length <= 2 ? 'disabled' : ''} title="Remove colour stop ${i + 1}" aria-label="Remove colour stop ${i + 1}">×</button></div>`).join('')}</div><button class="wide" data-add-stop="true" ${g.stops.length >= 8 ? 'disabled' : ''}>+ Add colour stop</button><p class="note">Strength blends these colours with the base colour below. Up to 8 stops.</p></div>`
      : ''
  }`;
}
let gradientDraft = false;
function updateGradientInput(el) {
  editGradient(g => (g[el.dataset.gradientKey] = Number(el.value) / (el.dataset.gradientKey === 'strength' ? 100 : 1)));
  const output = document.querySelector(`[data-gradient-output="${el.dataset.gradientKey}"]`);
  if (output) output.textContent = el.value + (el.dataset.gradientKey === 'angle' ? '°' : '%');
  const preview = document.querySelector('.gradient-preview');
  if (preview) preview.style.background = gradientCSS(currentPaint());
  renderCanvas();
  renderViews();
}
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset.gradientKey) return;
  if (!gradientDraft) {
    record();
    gradientDraft = true;
  }
  updateGradientInput(el);
});
function colourField(value) {
  return `<div class="row"><input type="color" id="property-colour" value="${M.colour(value)}" aria-label="Selected colour"><input id="hex-colour" value="${M.colour(value).toUpperCase()}" maxlength="7" aria-label="Hex colour"></div><div class="palette">${['#9ed8f5', '#f28a35', '#ffffff', '#273442', '#e5484d', '#f3d36a', '#479b81'].map(c => `<button class="swatch" data-swatch="${c}" style="background:${c}" title="${c}" aria-label="Paint ${c}"></button>`).join('')}</div>`;
}
function finishFields(obj) {
  return `<div class="field"><label for="paint-effect">Paint effect</label><select id="paint-effect">${M.EFFECTS.map(k => `<option ${obj.effect === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div><div class="field"><label>Finish</label><div class="segmented">${M.FINISHES.map(k => `<button data-finish="${k}" aria-pressed="${obj.finish === k}">${k}</button>`).join('')}</div></div>`;
}
function renderInspector() {
  const box = $('#inspector');
  rememberInspectorFolders(box);
  box.classList.remove('docked');
  if (!project) {
    box.innerHTML = `<div class="inspector-empty">${icon('palette')}<h3>Your workshop, in colour.</h3><p class="note">Prepare a simple car template, then keep every stripe, shape and decal editable.</p><ol><li>Import vector artwork or a photo</li><li>Define the paintable body</li><li>Add colours and graphics</li><li>Save, share and print</li></ol><div class="separator"></div><h3>Made to be reused</h3><p class="note">Your car templates, liveries and artwork belong in your own library. Share them as a single package.</p><button data-action="help" class="wide">A quick tour ${icon('help')}</button></div>`;
    return;
  }
  if (!activeView()) {
    box.innerHTML =
      '<div class="inspector-empty"><h3>No view imported</h3><p class="note">Add an angle to keep designing this project, or use Undo to restore the removed view.</p><button class="wide" data-action="add-view">Add a view</button></div>';
    return;
  }
  if (tool === 'line') {
    box.innerHTML = `<div class="heading"><span class="section-icon">${icon('line')}</span><div><strong>Draw a line</strong><small>Click points · drag for curves</small></div></div><div class="row"><button data-action="finish-draw" ${drawPoints.length < 2 ? 'disabled' : ''}>Finish line</button><button data-action="cancel-draw" ${!drawPoints.length ? 'disabled' : ''}>Cancel</button></div>${lineFields(lineSettings)}<div class="field"><label for="line-draw-colour">Main colour</label><input id="line-draw-colour" type="color" value="${colour}"></div><p class="note">Click for corners; click-drag for Bézier handles. Enter, Esc or right-click finishes the open line. Cancel discards it. Middle-drag or Ctrl-drag pans.</p>`;
    organiseInspector(box);
    return;
  }
  if (preparing) {
    renderPreparation();
    return;
  }
  if (artworkSelection().length > 1 || (selected?.startsWith('group:') && artworkSelection().length)) {
    renderMultiArtwork(box);
    return;
  }
  const l = selection(),
    parts = l ? [] : paintRegions(),
    part = parts[0],
    mixed = parts.length > 1 && new Set(parts.map(r => r.colour || project.base)).size > 1,
    target = currentPaint();
  box.innerHTML = `<div class="heading"><span class="section-icon">${icon(l?.kind === 'line' ? 'line' : l ? 'rect' : 'paint')}</span><div><strong>${l ? 'Selected artwork' : part ? e(paintSelectionName()) : 'Base paint'}</strong><small>${l ? e(l.name) : part ? parts.length + ' paintable ' + (parts.length === 1 ? 'area' : 'areas') + ' · ' + M.LABELS[currentView] + ' view' : 'Default for areas without their own colour'}</small></div></div>${l ? `<div class="field"><label for="layer-name">Name</label><input id="layer-name" value="${e(l.name)}"></div>` : ''}${l?.kind === 'line' ? lineFields(l) : ''}${l ? fitFields() : ''}${l?.kind === 'text' ? `<div class="field"><label for="text-value">Text / number</label><input id="text-value" value="${e(l.text)}"></div><div class="field"><label for="font-value">Typeface</label><select id="font-value">${fontOptions(l)}</select><button class="wide quiet" data-action="upload-font" style="margin-top:8px">Import font…</button></div>` : ''}${!['image', 'vector'].includes(l?.kind) ? `${fillFields(target)}<div class="field"><label>${mixed ? 'Mixed colours · apply to selected areas' : target.fillType === 'gradient' ? 'Base colour' : 'Colour'}</label>${colourField(target.fill)}</div>${finishFields(target)}` : '<p class="note">Imported artwork keeps its original colours and transparency. Use Position & size and Fit to angled view to place it.</p>'}${l ? `<div class="separator"></div><h3>Position & size</h3><div class="row"><div class="field"><label for="pos-x">X</label><input id="pos-x" data-num="x" type="number" value="${Math.round(l.x)}"></div><div class="field"><label for="pos-y">Y</label><input id="pos-y" data-num="y" type="number" value="${Math.round(l.y)}"></div></div><div class="row"><div class="field"><label for="size-w">${l.kind === 'line' && !l.points ? 'Length' : 'Width'}</label><input id="size-w" data-num="w" type="number" min="2" value="${Math.round(l.w)}"></div><div class="field"><label for="size-h">${l.kind === 'line' && !l.points ? 'Overall thickness' : 'Height'}</label><input id="size-h" data-num="h" type="number" min="2" value="${Math.round(l.h)}"></div></div><div class="row"><div class="field"><label for="rotation">Rotation °</label><input id="rotation" data-num="rotation" type="number" min="-360" max="360" value="${Math.round(l.rotation)}"></div><div class="field"><label for="opacity">Opacity</label><input id="opacity" data-num="opacity" type="number" min="0" max="1" step=".1" value="${l.opacity}"></div></div>${l.kind === 'polygon' || l.kind === 'line' ? `<div class="curve-tools"><button data-action="edit-curve">${icon('nodes')}Edit points & curves</button>${tool === 'nodes' ? `<p class="note">Drag a point to move it. Drag a handle to bend the curve. Alt-drag a point to create handles, or a handle to adjust one side.</p><div class="row"><button data-action="smooth-point" ${selectedNode === null ? 'disabled' : ''}>Smooth point</button><button data-action="corner-point" ${selectedNode === null ? 'disabled' : ''}>Corner point</button></div>` : ''}</div>` : ''}<p class="note">Artwork is clipped to bodywork. Windows and openings stay protected.</p><button class="wide" data-action="copy-view">${icon('copy')}Copy to another view</button>` : `<p class="note">Finish preview gives a subtle visual guide. Your paint effects and finishes are also saved in workshop instructions.</p><button class="wide" data-action="notes">${icon('pdf')}Paint references & notes</button>`}<div class="separator"></div><h3>Layers · ${M.LABELS[currentView]} view</h3><div class="layer-list"><div class="layer-row locked">${icon('eye')}Body details ${icon('lock')}</div>${artworkRows()}${paintLayerRows()}<div class="layer-row ${!selected && !paintRegions().length ? 'active' : ''}"><button class="layer-name" data-action="base">${icon('paint')}Base paint</button></div></div>${l ? `<div class="layer-actions"><button data-action="duplicate" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button><button data-action="delete" title="Delete" aria-label="Delete artwork">${icon('trash')}</button></div><button class="wide" style="margin-top:9px" data-action="save-asset">${icon('folder')}Add to Library</button>` : '<button class="wide" data-action="shapes">' + icon('plus') + 'Add a shape</button>'}${activeView()?.vectorSource ? '<button class="wide quiet" style="margin-top:8px" data-action="repair-template">Edit areas & labels</button>' : ''}`;
  if (parts.length > 1) {
    const mixedAppearance = new Set(parts.map(r => JSON.stringify(M.paintOf(project, r)))).size > 1;
    box
      .querySelector('.heading')
      .insertAdjacentHTML(
        'afterend',
        `<p class="note">${mixedAppearance ? 'Mixed appearances. ' : ''}Changes apply to all ${parts.length} selected areas.</p>`
      );
  }
  if (tool === 'nodes') {
    const controls = box.querySelector('.curve-tools');
    if (controls) box.querySelector('.heading').after(controls);
  }
  dockInspector();
}
const inspectorFolderState = () => store.settings?.inspectorFolders || {};
function rememberInspectorFolders(container) {
  const state = { ...inspectorFolderState() };
  let changed = false;
  for (const el of container.querySelectorAll('[data-inspector-folder]')) {
    const key = el.dataset.inspectorFolder;
    if (state[key] !== el.open) {
      state[key] = el.open;
      changed = true;
    }
  }
  if (changed) {
    store.settings = { ...store.settings, inspectorFolders: state };
    scheduleSave();
  }
}

function organiseInspector(container) {
  const folders = new Map(),
    defaults = {
      paint: true,
      finish: false,
      position: false,
      line: tool === 'line',
      text: true,
      curves: tool === 'nodes',
      reuse: false
    };
  const folder = (key, title) => {
    if (folders.has(key)) return folders.get(key);
    const details = document.createElement('details');
    details.className = 'inspector-folder';
    details.dataset.inspectorFolder = key;
    details.open = inspectorFolderState()[key] ?? defaults[key] ?? false;
    const summary = document.createElement('summary');
    summary.innerHTML = icon('folder') + '<span>' + e(title) + '</span>';
    details.append(summary);
    folders.set(key, details);
    return details;
  };
  for (const node of [...container.children]) {
    if (node.classList.contains('heading')) continue;
    if (node.classList.contains('separator')) {
      node.remove();
      continue;
    }
    if (node.matches('.fit-controls')) {
      node.classList.add('inspector-folder');
      node.dataset.inspectorFolder = 'fit';
      node.open = inspectorFolderState().fit ?? fitPanelOpen;
      fitPanelOpen = node.open;
      const summary = node.querySelector('summary');
      summary.innerHTML = icon('folder') + '<span>Fit to angled view</span>';
      continue;
    }
    let key, title;
    if (node.matches('.line-controls')) {
      key = 'line';
      title = 'Line & stripes';
      node.querySelector('h3')?.remove();
    } else if (node.matches('.curve-tools')) {
      key = 'curves';
      title = 'Points & curves';
    } else if (node.matches('h3') && node.textContent === 'Position & size') {
      node.remove();
      continue;
    } else if (node.querySelector('[data-num]')) {
      key = 'position';
      title = 'Position & size';
    } else if (node.querySelector('#text-value,#font-value')) {
      key = 'text';
      title = 'Text & numbers';
    } else if (node.querySelector('#paint-effect,[data-finish]')) {
      key = 'finish';
      title = 'Paint effect & finish';
    } else if (
      node.matches('.gradient-controls') ||
      node.querySelector('[data-fill-type],#property-colour,#line-draw-colour')
    ) {
      key = 'paint';
      title = 'Colour & gradient';
    } else if (node.matches('[data-action="copy-view"],[data-action="notes"]')) {
      key = 'reuse';
      title = 'Workshop & reuse';
    }
    if (key) {
      const details = folder(key, title);
      if (!details.parentNode) node.before(details);
      details.append(node);
    }
  }
}
document.addEventListener(
  'toggle',
  ev => {
    const el = ev.target;
    if (!el.matches?.('[data-inspector-folder]') || !el.isConnected) return;
    const key = el.dataset.inspectorFolder;
    if (key === 'fit') fitPanelOpen = el.open;
    if (inspectorFolderState()[key] === el.open) return;
    store.settings = { ...store.settings, inspectorFolders: { ...inspectorFolderState(), [key]: el.open } };
    scheduleSave();
  },
  true
);
function copyableAppearance() {
  const items = artworkSelection();
  if (items.length === 1) return { name: items[0].name, style: M.appearanceOf(items[0]) };
  if (items.length) return null;
  const parts = paintRegions(),
    styles = parts.map(r => M.appearanceOf(r, project));
  if (styles.length && styles.some(s => JSON.stringify(s) !== JSON.stringify(styles[0]))) return null;
  return { name: paintSelectionName(), style: styles[0] || M.appearanceOf(project) };
}
function appearanceTargets() {
  const items = artworkSelection(),
    parts = paintRegions();
  return items.length
    ? items.map(item => ({ item, mode: 'layer' }))
    : parts.length
      ? parts.map(item => ({ item, mode: 'panel' }))
      : [{ item: project, mode: 'base' }];
}
function canPasteAppearance() {
  return (
    !!appearanceClipboard &&
    appearanceTargets().some(
      ({ item, mode }) =>
        item &&
        ((mode === 'layer' && appearanceClipboard.style.opacity !== undefined) ||
          (!['image', 'vector'].includes(item.kind) && appearanceClipboard.style.paint))
    )
  );
}
function appearanceButtons() {
  const source = copyableAppearance();
  return `<div class="appearance-buttons"><button data-action="copy-appearance" ${source ? '' : 'disabled'} title="${source ? 'Copy colour, gradient, finish and opacity; lines include stripe settings and text includes typeface.' : 'Select one artwork layer or a paint group with matching appearances.'}">Copy Appearance</button><button data-action="paste-appearance" ${canPasteAppearance() ? '' : 'disabled'} title="${appearanceClipboard ? 'Apply compatible settings from ' + e(appearanceClipboard.name) : 'Copy an appearance first.'}">Paste Appearance</button></div>`;
}
function copyAppearance() {
  const value = copyableAppearance();
  if (!value) return;
  appearanceClipboard = M.clone(value);
  renderInspector();
  toast('Appearance copied from ' + value.name + '.');
}
function pasteAppearance() {
  if (!canPasteAppearance()) return;
  const targets = appearanceTargets();
  mutate(() => targets.forEach(({ item, mode }) => M.applyAppearance(item, appearanceClipboard.style, mode)));
  toast('Appearance pasted.');
}
function dockInspector() {
  const box = document.querySelector('#inspector'),
    children = [...box.children],
    index = children.findIndex(n => n.tagName === 'H3' && n.textContent.startsWith('Layers'));
  if (index < 0) return;
  const props = document.createElement('div'),
    dock = document.createElement('section');
  props.className = 'property-scroll';
  dock.className = 'layers-dock';
  children.forEach((n, i) => {
    if (i === index - 1 && n.classList.contains('separator')) return;
    (i < index ? props : dock).append(n);
  });
  box.replaceChildren(props, dock);
  box.classList.add('docked');
  organiseInspector(props);
  props.querySelector('.heading')?.insertAdjacentHTML('afterend', appearanceButtons());
  const controls = orderButtons();
  if (controls) {
    const actions = dock.querySelector('.layer-actions');
    if (actions) actions.insertAdjacentHTML('beforebegin', controls);
    else dock.insertAdjacentHTML('beforeend', controls);
  }
  const tip = document.createElement('small');
  tip.className = 'layer-order-tip';
  tip.textContent =
    'Shift-click to select several · Ctrl-click in Layers · Top = front · Drag rows to reorder' +
    (orderScope() ? ' · Within this group' : '');
  dock.querySelector('h3')?.after(tip);
}
function renderPreparation() {
  const v = activeView(),
    r = region();
  if (v.vectorSource && !v.regions.length) {
    renderPanelStart();
    return;
  }
  $('#inspector').innerHTML =
    `<div class="heading"><span class="section-icon">${icon('nodes')}</span><div><strong>Prepare template</strong><small>${M.LABELS[currentView]} view · ${v.source === 'photo' ? 'Photo tracing' : 'Vector regions'}</small></div></div><p class="note">Click a region on the car, or choose it below. Mark the body, protect openings, and keep only useful detail lines.</p>${v.photo ? `<label class="checkbox-line"><input id="show-photo" type="checkbox" ${v.showPhoto ? 'checked' : ''}>Show reference photograph</label>` : ''}${v.source !== 'photo' ? `<button class="wide" data-action="repair-template" ${!v.vectorSource && v.regions.some(r => r.recovered) ? 'disabled' : ''}>${icon('paint')}${v.vectorSource ? 'Prepare areas & labels' : 'Recover paintable areas'}</button><p class="note" style="margin-top:8px">${v.vectorSource ? 'Only your selected panels appear below. Reopen the chooser to add or remove panels.' : 'Body missing from a line drawing? Select enclosed panels and turn them into paintable shapes.'}</p>${v.vectorSource ? '<button class="wide quiet" data-action="generate-regions">Generate all vector regions…</button><div class="separator"></div>' : ''}` : ''}<div class="field"><label>Selected region</label><input id="region-name" ${r ? '' : 'disabled'} value="${r ? e(r.name) : 'Select a region'}"></div><div class="role-row">${['body', 'protected', 'detail', 'hidden'].map(role => `<button data-role="${role}" aria-pressed="${r?.role === role}" ${r ? '' : 'disabled'}>${role === 'body' ? 'Body' : role === 'protected' ? 'Protect' : role === 'detail' ? 'Detail' : 'Hide'}</button>`).join('')}</div>${r && r.role !== 'detail' && r.role !== 'hidden' ? `<div class="field"><label for="region-colour">${r.role === 'body' ? 'Part colour (optional override)' : 'Protected area colour'}</label><div class="row"><input id="region-colour" type="color" value="${r.colour || (r.role === 'body' ? project.base : '#58636f')}"><button data-action="region-reset">Reset</button></div></div>` : ''}<div class="region-list">${v.regions.map(a => `<button data-select-region="${a.id}" class="${a.id === selectedRegion ? 'active' : ''}"><span>${e(a.name)}</span><small>${a.partLabel ? e(a.partLabel) + ' · ' : ''}${a.role}</small></button>`).join('')}</div><div class="separator"></div><h3>Trace a new region</h3><select id="trace-role" aria-label="New traced region type">${['body', 'protected', 'detail'].map(k => `<option value="${k}" ${traceRole === k ? 'selected' : ''}>${k === 'body' ? 'Paintable body' : k === 'protected' ? 'Protected area' : 'Detail outline'}</option>`).join('')}</select><button class="wide" data-action="trace" style="margin-top:8px">${icon('pen')}Trace with points</button>${drawPoints.length ? `<div class="row" style="margin-top:8px"><button data-action="finish-draw" ${drawPoints.length < 3 ? 'disabled' : ''}>Finish region</button><button data-action="cancel-draw">Cancel</button></div>` : ''}<p class="note">Click for corners; drag for curves. Click near the first point or press Enter to close. Backspace removes a point; Esc cancels.</p>${r ? `<button class="wide danger" data-action="delete-region">${icon('trash')}Delete selected region</button>` : ''}<div class="separator"></div><button class="wide primary" data-action="finish-preparation">${icon('check')}Save template & start painting</button><button class="wide quiet" style="margin-top:8px" data-action="replace-view">Replace this view…</button><p class="note">Template changes affect this project and the saved template. Other projects keep their own copy.</p>`;
}
