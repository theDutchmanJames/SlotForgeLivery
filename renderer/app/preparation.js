// Livery renderer · Template preparation: repair, bounds, panel choice and region generation.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function renderPanelStart() {
  $('#inspector').innerHTML =
    `<div class="heading"><span class="section-icon">${icon('paint')}</span><div><strong>Choose your panels</strong><small>${M.LABELS[currentView]} view · Vector artwork</small></div></div><p class="note">Select areas in the preparation workspace, label the car parts, and choose which panels can be painted.</p><button class="wide primary" data-action="repair-template">${icon('paint')}Prepare areas & labels</button><p class="note" style="margin-top:10px">Label areas in groups to make them paintable. Use Reference only for areas you want to exclude.</p><div class="separator"></div><h3>Other preparation tools</h3><button class="wide" data-action="generate-regions">Generate all vector regions</button><p class="note" style="margin-top:8px">Optional: make every object available for Body, Protect, Detail or Hide assignments.</p><select id="trace-role" aria-label="New traced region type"><option value="body">Paintable body</option><option value="protected">Protected area</option><option value="detail">Detail outline</option></select><button class="wide quiet" style="margin-top:8px" data-action="trace">${icon('pen')}Trace with points</button>${drawPoints.length ? `<div class="row" style="margin-top:8px"><button data-action="finish-draw">Finish region</button><button data-action="cancel-draw">Cancel</button></div>` : ''}<p class="note" style="margin-top:8px">For open or incomplete outlines, trace a panel manually. Enter finishes the shape.</p><div class="separator"></div><button class="wide quiet" data-action="replace-view">Replace this view…</button>`;
}
function repairTemplate() {
  if (drawPoints.length) return toast('Finish or cancel your outline first.');
  const view = activeView();
  if (view.vectorSource) return choosePaintablePanels();
  if (view.regions.some(r => r.recovered))
    return toast('Areas have already been recovered. Select a region and change its Body / Protect role.');
  const result = TemplateRepair.inspect(view),
    chosen = new Set();
  let restoring = false;
  if (!result.candidates.length)
    return openDialog(
      'No enclosed panels found',
      'This drawing does not contain recoverable compound outlines.',
      `<p>Use <b>Trace with points</b> to create the body outline, or import an expanded vector illustration. Recovery works with enclosed holes in filled outlines, such as your EPS line drawings.</p>`
    );
  openDialog(
    'Recover paintable areas',
    'Click the body panels you want to paint. Click again to deselect.',
    `<p class="note">Coral areas will become paintable. Leave windows, tyres and lights unselected to protect them. The surrounding background will be hidden; the original curves and linework are kept.</p>${result.simplification ? `<div class="note panel-simplification"><span id="repair-simplification-message" role="status">${e(TemplateRepair.summary(result))}</span><button id="repair-add-filtered" class="primary" aria-pressed="false">Add filtered areas</button></div>` : ''}<svg id="repair-preview" viewBox="0 0 1000 600" aria-label="Select paintable car panels"></svg><div id="repair-choices" class="repair-choices"></div><p id="repair-count" class="note"></p>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="apply-repair" disabled>Use selected areas</button>`
  );
  const refresh = () => {
    if ($('#repair-add-filtered')) {
      const b = $('#repair-add-filtered');
      b.textContent = restoring ? 'Done adding areas' : 'Add filtered areas';
      b.setAttribute('aria-pressed', String(restoring));
      b.disabled = !result.excluded.length && !restoring;
      $('#repair-simplification-message').textContent = restoring
        ? 'Hover over a filtered area, then click to restore it as paintable.'
        : TemplateRepair.summary(result);
    }
    const preview = M.clone(project);
    preview.template.views[currentView] = TemplateRepair.apply(view, result, chosen);
    preview.base = '#ed7877';
    preview.views[currentView] = [];
    $('#repair-preview').innerHTML =
      V.renderView(preview, currentView, { id: 'repair-preview' }) +
      result.candidates
        .map(
          r =>
            `<g data-repair-area="${r.id}" style="opacity:0;cursor:pointer;pointer-events:fill">${V.geometryMarkup(r)}</g>`
        )
        .join('') +
      (restoring
        ? result.excluded
            .slice()
            .sort((a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h)
            .map(
              r =>
                `<g data-filtered-area="${r.id}" style="opacity:0;cursor:crosshair;pointer-events:fill">${V.geometryMarkup(r, 'mask')}</g>`
            )
            .join('')
        : '') +
      '<g id="repair-hover" pointer-events="none"></g>';
    $('#repair-choices').innerHTML = result.candidates
      .map(
        (r, i) =>
          `<label><input type="checkbox" data-repair-check="${r.id}" ${chosen.has(r.id) ? 'checked' : ''}>Area ${i + 1}</label>`
      )
      .join('');
    $('#repair-count').textContent =
      `${chosen.size} of ${result.candidates.length} areas selected · You can change Body / Protect assignments afterwards.`;
    $('#apply-repair').disabled = !chosen.size;
    $('#apply-repair').textContent = chosen.size
      ? `Use ${chosen.size} selected ${chosen.size === 1 ? 'area' : 'areas'}`
      : 'Use selected areas';
  };
  const highlight = id => {
    const r = [...result.candidates, ...result.excluded].find(c => c.id === id),
      target = $('#repair-hover');
    if (!target) return;
    target.innerHTML = r ? V.geometryMarkup(r, 'outline') : '';
    for (const shape of target.querySelectorAll('[data-geometry]')) {
      shape.setAttribute('stroke', '#e5484d');
      shape.setAttribute('stroke-width', '2.5');
    }
  };
  const toggle = id => {
    chosen.has(id) ? chosen.delete(id) : chosen.add(id);
    refresh();
  };
  $('#repair-preview').onclick = ev => {
    if (restoring) {
      const id = ev.target.closest('[data-filtered-area]')?.dataset.filteredArea;
      if (!id) return;
      try {
        const next = TemplateRepair.restoreFiltered(result.candidates, result.excluded, id, chosen);
        if (next) {
          result.candidates = next.candidates;
          result.excluded = next.excluded;
          result.sources = [...new Set(result.candidates.filter(r => r.recovered).map(r => r.sourceRegionId))];
          chosen.add(next.added.id);
          refresh();
        }
      } catch (error) {
        reportError(error);
      }
      return;
    }
    const id = ev.target.closest('[data-repair-area]')?.dataset.repairArea;
    if (id) toggle(id);
  };
  if ($('#repair-add-filtered'))
    $('#repair-add-filtered').onclick = () => {
      restoring = !restoring;
      refresh();
    };
  $('#repair-preview').onpointermove = ev =>
    highlight(
      restoring
        ? ev.target.closest('[data-filtered-area]')?.dataset.filteredArea
        : ev.target.closest('[data-repair-area]')?.dataset.repairArea
    );
  $('#repair-preview').onpointerleave = () => highlight(null);
  $('#repair-choices').onchange = ev => {
    const id = ev.target.dataset.repairCheck;
    if (id) toggle(id);
  };
  $('#repair-choices').onmouseover = ev =>
    highlight(ev.target.closest('label')?.querySelector('input')?.dataset.repairCheck);
  $('#repair-choices').onfocusin = ev => highlight(ev.target.dataset.repairCheck);
  $('#repair-choices').onmouseleave = () => highlight(null);
  $('#apply-repair').onclick = () => {
    if (!chosen.size) return;
    record();
    project.template.views[currentView] = TemplateRepair.apply(view, result, chosen);
    selectedRegion = [...chosen][0];
    tool = 'select';
    updateBounds();
    closeDialog();
    changed();
    render();
    toast(`${chosen.size} paintable areas recovered. Save the template when ready.`);
  };
  refresh();
}
function updateBounds() {
  const v = activeView(),
    body = v.regions.filter(r => r.role === 'body');
  if (body.length)
    v.bounds = M.boundsOfPoints(
      body.flatMap(r => [
        { x: r.bounds.x, y: r.bounds.y },
        { x: r.bounds.x + r.bounds.w, y: r.bounds.y + r.bounds.h }
      ])
    );
}
function choosePaintablePanels() {
  PanelStudio.open({
    project,
    viewKey: currentView,
    openDialog,
    closeDialog,
    reportError,
    onApply: next => {
      record();
      project.template.views[currentView] = next;
      selectedRegion = null;
      updateBounds();
      defaultPaintSelection();
      if (next.regions.some(r => r.role === 'body')) actions['finish-preparation']();
      else {
        preparing = true;
        changed();
        render();
        toast('Draft saved. Label an area to make it paintable.');
      }
    }
  });
}
function generateVectorRegions() {
  const view = activeView();
  if (!view?.vectorSource) return;
  const run = () => {
    record();
    const existing = M.clone(view.regions);
    const generated = M.clone(view.vectorSource);
    const selectedSources = new Set(existing.filter(r => r.contourIndex === -1).map(r => r.sourceRegionId));
    generated.regions = generated.regions.filter(r => !selectedSources.has(r.id));
    if (existing.length) {
      for (const r of generated.regions)
        if (r.role === 'body') {
          r.role = 'protected';
          delete r.colour;
        }
    }
    generated.regions.push(...existing);
    project.template.views[currentView] = generated;
    selectedRegion = null;
    changed();
    render();
    toast('All vector objects are now available as regions.');
  };
  if (view.regions.length)
    confirmAction(
      'Generate all vector regions?',
      'This adds the original vector objects to your region list. Your chosen panels and artwork are kept.',
      run,
      'Generate regions'
    );
  else run();
}
