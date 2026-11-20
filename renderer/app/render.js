// Livery renderer · Top-level render: toolbox, header, canvas and view strip.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function renderTools() {
  $('#paint-preview').checked = store.settings?.paintPreview !== false;
  const ts = [
    ['select', 'Select (V)', 'select'],
    ['paint', 'Paint selected layer (B)', 'paint'],
    ['rect', 'Rectangle (R)', 'rect'],
    ['ellipse', 'Ellipse (E)', 'ellipse'],
    ['polygon', 'Draw shape (P)', 'pen'],
    ['line', 'Line / stripes (L)', 'line'],
    ['text', 'Text / number (T)', 'text'],
    ['image', 'Import decal artwork (I)', 'image'],
    ['hand', 'Pan (H)', 'hand'],
    ['prepare', 'Prepare template', 'car'],
    ['nodes', 'Edit points (A)', 'nodes']
  ];
  $('#tools').innerHTML = ts
    .map(
      ([id, label, ic]) =>
        `<button data-tool="${id}" title="${label}" aria-label="${label}" aria-pressed="${id === tool || (id === 'prepare' && preparing)}">${icon(ic)}</button>`
    )
    .join('');
  $('#tool-label').textContent = preparing
    ? tool === 'polygon'
      ? 'Trace region'
      : 'Prepare template'
    : {
        select: 'Select',
        nodes: 'Edit points',
        paint: 'Body paint',
        rect: 'Rectangle',
        ellipse: 'Ellipse',
        polygon: 'Draw shape',
        line: 'Draw line',
        text: 'Text',
        image: 'Image',
        hand: 'Pan'
      }[tool] || 'Select';
  $('#quick-colour').value = colour;
  $('#base-swatch').style.background = project ? paintChip(M.paintOf(project)) : '#fff';
}
// Recent projects on the welcome screen, newest first.
function renderWelcomeRecent() {
  const box = $('#welcome-recent'),
    recent = project
      ? []
      : store.projects
          .filter(p => !p.trashedAt)
          .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))
          .slice(0, 4);
  box.hidden = !recent.length;
  $('#welcome').classList.toggle('returning', store.templates.length + store.projects.length > 0);
  if (!recent.length) return;
  // Showroom cards with the real preview; rebuilt only when the list changes (render() runs often).
  const signature = recent.map(p => p.id + p.updated + p.name).join('|');
  if (box._signature === signature) return;
  box._signature = signature;
  box.innerHTML = `<span class="eyebrow">Continue where you left off</span><div class="welcome-recent-list">${recent
    .map(
      p =>
        `<button class="welcome-card" data-project-open="${e(p.id)}">${cardPreview(p, 'projects')}<span class="wc-body"><strong>${e(p.name)}</strong><small>${e(p.template?.name || p.storageSummary?.templateName || '')}${p.updated ? ' · ' + new Date(p.updated).toLocaleDateString() : ''}</small></span></button>`
    )
    .join('')}</div>`;
  loadCardPreviews().catch(reportError);
}
function render() {
  renderTools();
  renderHeader();
  renderCanvas();
  renderViews();
  renderInspector();
  renderStepHint();
  renderEntrySwitch();
  fillIcons();
}
function renderHeader() {
  $('#project-name').textContent = project?.name || 'Your next livery starts here';
  $('#project-meta').textContent = project
    ? `${project.template.name} · ${project.template.scale || 'Scale not set'}`
    : '';
  document.body.classList.toggle('no-project', !project);
  document.querySelectorAll('.project-only').forEach(el => (el.hidden = !project));
  document.querySelectorAll('.welcome-only').forEach(el => (el.hidden = !!project));
  $('#prepare-button').classList.toggle('active', preparing);
  $('#prepare-button').setAttribute('aria-pressed', String(preparing));
  $('#prepare-button').hidden = !activeView();
}
function renderCanvas() {
  if (fitFrame) {
    cancelAnimationFrame(fitFrame);
    fitFrame = 0;
  }
  clearZoomSurface();
  // Keep the expensive masked SVG on one composited surface while the camera moves.
  // The model camera still updates on every pointer event; commit it on release.
  if (drag?.kind === 'pan' && viewBox.w === drag.box.w && viewBox.h === drag.box.h) {
    art.classList.add('panning');
    art.style.transform = `translate3d(${(drag.box.x - viewBox.x) * drag.scale}px,${(drag.box.y - viewBox.y) * drag.scale}px,0)`;
    art.style.cursor = 'grabbing';
    renderQuickBar();
    return;
  }
  art.classList.remove('panning');
  art.style.transform = '';
  $('#welcome').hidden = !!project;
  renderWelcomeRecent();
  $('#empty-view').hidden = !project || !!activeView();
  $('#zoom-controls').hidden = !activeView();
  art.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
  $('#zoom-label').textContent = Math.round(100000 / viewBox.w) + '%';
  art.style.cursor =
    drag?.kind === 'pan'
      ? 'grabbing'
      : tool === 'hand'
        ? 'grab'
        : ['rect', 'ellipse', 'polygon', 'line', 'paint'].includes(tool)
          ? 'crosshair'
          : 'default';
  $('#mode-banner').hidden = !preparing;
  $('#mode-banner').textContent =
    tool === 'polygon'
      ? 'Click around a region · Enter to finish · Esc to cancel'
      : 'Prepare template · Select a region and assign its role';
  if (!project) {
    art.innerHTML = '';
    renderRulers();
    renderQuickBar();
    return;
  }
  const canvasParts = V.renderViewParts(project, currentView, {
    id: 'main',
    interactive: true,
    prepare: preparing,
    preview: true,
    live: true,
    effects: store.settings?.paintPreview !== false
  });
  let markup = '';
  const l = selection();
  if (l && !preparing && l.locked) {
    // Locked: show where it is, but offer no handles to move or resize it.
    markup += `<polygon class="selection-box locked" pointer-events="none" points="${M.layerCorners(l)
      .map(p => p.x + ',' + p.y)
      .join(' ')}"/>`;
  } else if (l && !preparing) {
    const matrix = M.layerMatrix(l),
      corner = M.transformPoint(matrix, { x: l.w, y: l.h }),
      r = screenUnits(4);
    markup += `<polygon class="selection-box" points="${M.layerCorners(l)
      .map(p => p.x + ',' + p.y)
      .join(
        ' '
      )}"/><rect data-handle="resize" class="handle" x="${corner.x - r}" y="${corner.y - r}" width="${r * 2}" height="${r * 2}" style="cursor:nwse-resize"/>`;
    if (tool === 'nodes' && l.points)
      markup += pathControls(
        M.mapPathPoints(l.points, p => M.transformPoint(matrix, { x: p.x * l.w, y: p.y * l.h })),
        true
      );
  }

  if (!preparing && !l && artworkSelection().length) {
    const b = M.artworkBounds(artworkSelection()),
      r = screenUnits(5);
    markup += `<rect class="selection-box" pointer-events="none" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
    if (!artworkSelection().some(a => a.locked))
      markup += `<rect data-group-resize="true" class="handle" x="${b.x + b.w - r}" y="${b.y + b.h - r}" width="${r * 2}" height="${r * 2}" style="cursor:nwse-resize"/>`;
  }
  const r = region();
  if (preparing && r) {
    const b = r.bounds;
    markup += `<rect class="selection-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
  }
  if (!preparing && !selection() && paintRegions().length) {
    markup +=
      '<g class="paint-selection" pointer-events="none">' +
      paintRegions()
        .filter(r => r.paintVisible !== false)
        .map(r => V.geometryMarkup(r, 'outline'))
        .join('') +
      '</g>';
  }
  if (tool === 'polygon')
    $('#canvas-hint').textContent = closeSnap
      ? 'Click to close the shape · Drag to adjust the starting curve'
      : 'Click for corners · Drag for curves · Click near the first point to close · Enter to finish';
  if (drawPoints.length) {
    if (tool === 'line') {
      if (drawPoints.length > 1)
        markup += V.layerMarkup(M.lineFromPoints(drawPoints, { ...M.clone(lineSettings), fill: colour }), false, {
          effects: store.settings?.paintPreview !== false
        });
      markup += `<path class="pen-guide" d="${M.pathData(drawPoints, false)}"/>`;
    } else markup += `<path class="trace-preview" d="${M.pathData(drawPoints, closeSnap)}"/>`;
    if (penCursor && !closeSnap && !drag)
      markup += `<path class="pen-guide" d="${M.pathData([drawPoints.at(-1), penCursor], false)}"/>`;
    markup += pathControls(drawPoints, false);
    if (closeSnap)
      markup += `<circle class="close-snap" cx="${drawPoints[0].x}" cy="${drawPoints[0].y}" r="${screenUnits(10)}"/>`;
  }

  if (!art.querySelector('[data-canvas-under]'))
    art.innerHTML =
      '<g data-canvas-under></g><g data-canvas-art></g><g data-canvas-over></g><g data-canvas-selection></g>';
  markup = guidesMarkup() + markup;
  for (const [name, value] of [
    ['under', canvasParts.under],
    ['over', canvasParts.over],
    ['selection', markup]
  ]) {
    const node = art.querySelector('[data-canvas-' + name + ']');
    if (node._markup !== value) {
      node.innerHTML = value;
      node._markup = value;
    }
  }
  const stack = art.querySelector('[data-canvas-art]');
  stack.setAttribute('mask', canvasParts.artMask || 'none');
  stack.setAttribute('opacity', canvasParts.artOpacity || '1');
  const existing = new Map([...stack.children].map(node => [node.dataset.canvasLayer, node]));
  for (const [index, item] of (canvasParts.artItems || []).entries()) {
    let node = existing.get(item.id);
    existing.delete(item.id);
    if (!node) {
      node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      node.dataset.canvasLayer = item.id;
    }
    if (node.getAttribute('transform') !== item.transform) node.setAttribute('transform', item.transform);
    if (node._markup !== item.markup) {
      node.innerHTML = item.markup;
      node._markup = item.markup;
    }
    if (stack.children[index] !== node) stack.insertBefore(node, stack.children[index] || null);
  }
  for (const node of existing.values()) node.remove();
  // Zooming during a pan commits the camera and starts the next movement here.
  if (drag?.kind === 'pan') {
    drag.box = { ...viewBox };
    drag.start = { ...drag.last };
    const rect = art.getBoundingClientRect();
    drag.scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
  }
  renderRulers();
  renderQuickBar();
}
let thumbnailTimer = 0;
function renderViews() {
  // The views as tabs: only the views this car has, then small "Add" buttons for the others.
  const strip = $('#view-strip');
  strip.hidden = !project;
  if (!project) {
    clearTimeout(thumbnailTimer);
    strip.innerHTML = '';
    strip._signature = '';
    renderCompare();
    return;
  }
  const have = M.VIEWS.filter(k => project.template.views[k]),
    missing = M.VIEWS.filter(k => !project.template.views[k]),
    signature = project.id + '|' + have.join() + '|' + missing.join();
  let stale = false;
  if (strip._signature !== signature) {
    strip._signature = signature;
    strip.innerHTML =
      have
        .map(
          k =>
            `<div class="view-slot" data-slot="${k}"><button class="view-tile view-tab" data-view="${k}" title="Edit the ${M.LABELS[k]} view"><span class="thumb"></span><span class="view-name">${M.LABELS[k]}</span></button><button class="remove-view" data-remove-view="${k}" title="Remove the ${M.LABELS[k]} view from this project" aria-label="Remove ${M.LABELS[k]} view">${icon('close')}</button></div>`
        )
        .join('') +
      (missing.length
        ? `<div class="view-add" role="group" aria-label="Add a view"><span class="view-add-label">${icon('plus')}Add view</span>${missing.map(k => `<button class="view-tile view-ghost" data-view="${k}" title="Add a ${M.LABELS[k]} view">${M.LABELS[k]}</button>`).join('')}</div>`
        : '');
    for (const slot of strip.querySelectorAll('.view-slot')) {
      slot._project = project.id;
      paintThumbnail(slot, slot.dataset.slot);
    }
  } else stale = have.length > 0;
  for (const tab of strip.querySelectorAll('.view-tab')) {
    const active = tab.dataset.view === currentView;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'true' : 'false');
  }
  // Existing pictures are redrawn once editing pauses, so a change only pays
  // for the main canvas; each picture is replaced only if it really changed.
  clearTimeout(thumbnailTimer);
  if (stale) thumbnailTimer = setTimeout(refreshThumbnails, 180);
  $('#canvas-hint').textContent =
    tool === 'line'
      ? 'Click for corners · Drag for curves · Enter / Esc / right-click to finish'
      : !activeView()
        ? 'Choose a view under Add view, above the canvas.'
        : preparing
          ? 'Define bodywork and protected areas. Finish preparation to paint.'
          : tool === 'polygon'
            ? 'Click for corners · Drag for curves · Click near the first point to close · Enter to finish'
            : 'Middle-drag or Ctrl + drag to pan · Shift-click to select several · Right-click for more';
  renderCompare();
}
function paintThumbnail(slot, key) {
  const markup = V.standalone(project, key, 'thumb-' + key, {
      preview: true,
      live: true,
      effects: store.settings?.paintPreview !== false
    }),
    thumb = slot.querySelector('.thumb');
  if (thumb && thumb._markup !== markup) {
    thumb.innerHTML = markup;
    thumb._markup = markup;
  }
}
function refreshThumbnails() {
  thumbnailTimer = 0;
  if (!project) return;
  for (const slot of $('#view-strip').querySelectorAll('.view-slot'))
    if (slot._project === project.id && project.template.views[slot.dataset.slot])
      paintThumbnail(slot, slot.dataset.slot);
}
function resetViewSelection(keepMode = false) {
  const hadView = !!activeView();
  if (!activeView()) currentView = M.VIEWS.find(k => project.template.views[k]) || 'left';
  selected = null;
  selectedPaint = null;
  selectedRegion = null;
  selectedNode = null;
  multiSelected.clear();
  drawPoints = [];
  penCursor = null;
  closeSnap = false;
  drag = null;
  tool = 'select';
  if (!keepMode || !hadView) preparing = !!activeView() && !activeView().regions.some(r => r.role === 'body');
  defaultPaintSelection();
}
function removeProjectView(key) {
  if (!project?.template.views[key]) return;
  const owner = project.id,
    count = (project.views[key] || []).length;
  openDialog(
    `Remove ${M.LABELS[key]} view?`,
    `${M.LABELS[key]} will be removed from this project.`,
    `<p>This removes the imported drawing, its prepared areas and ${count} artwork ${count === 1 ? 'layer' : 'layers'} in this view.</p><p>Other views, saved library items and other projects stay unchanged. Use Undo to restore the removed view.</p>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="remove-view-confirm">Remove view</button>`,
    'danger'
  );
  $('#remove-view-confirm').onclick = () => {
    closeDialog();
    if (project?.id !== owner || !project.template.views[key]) return;
    mutate(() => {
      delete project.template.views[key];
      project.views[key] = [];
      if (currentView === key) resetViewSelection();
    });
    toast(`${M.LABELS[key]} view removed. Undo restores its drawing and artwork.`);
  };
}
