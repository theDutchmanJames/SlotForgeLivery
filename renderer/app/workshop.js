// Livery renderer · Slotcar workshop features: real-world size, paint
// catalogue, painting order and masking steps, true-size printing and
// sending decals to SlotForge Decals.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';

// ---------------------------------------------------------------- Real size
// Each view stores how wide the car is on the real shell (mm). Sizes and the
// rulers then read in millimetres for that view.
const viewMm = (view = activeView()) => M.mmPerUnit(view);
function formatMm(value) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}
function realSizeFields() {
  const v = activeView(),
    mm = v?.realWidthMm || '';
  return `<div class="field real-size-controls"><label for="real-width">Real width of this view (mm)</label><input id="real-width" type="number" min="1" max="3000" step="0.5" value="${mm}" placeholder="e.g. 142 for a 1:32 shell"><p class="note">Measure the real body nose to tail (or side to side for front, rear and top views). Sizes and rulers then show millimetres, and true-size printing becomes available.</p></div>`;
}
function mmReadout(l) {
  const mm = viewMm();
  if (!mm) return '';
  const b = M.artworkBounds([l]);
  return `<p class="note mm-readout">≈ ${formatMm(b.w * mm)} × ${formatMm(b.h * mm)} mm on the real car</p>`;
}
document.addEventListener('change', ev => {
  if (ev.target.id !== 'real-width' || !project) return;
  const value = Number(ev.target.value);
  mutate(() => {
    if (value > 0) activeView().realWidthMm = M.number(value, 0, 1, 3000);
    else delete activeView().realWidthMm;
  });
  toast(value > 0 ? `Real width set: ${formatMm(value)} mm.` : 'Real size cleared.');
});

// ------------------------------------------------------------ Paint catalogue
function customPaints() {
  return (store.settings?.customPaints || []).filter(p => p && /^#[0-9a-f]{6}$/i.test(p.hex));
}
function allPaints() {
  return [...PaintCatalogue.paints, ...customPaints().map(p => ({ ...p, custom: true }))];
}
// The paint reference on whatever the colour field currently edits.
function currentPaintRef() {
  const items = artworkSelection(),
    parts = paintRegions();
  if (items.length) return items[0].paintRef;
  if (parts.length) return parts[0].paintRef;
  return project?.paintRef;
}
function paintRefLine() {
  const ref = currentPaintRef();
  return `<div class="paint-ref-line">${ref ? `<span title="Paint product">${icon('paint')}${e(ref)}</span>` : '<span class="note">No paint product chosen</span>'}<button class="quiet" data-action="paint-catalogue">Choose paint…</button></div>`;
}
let paintBrand = 'All';
function openPaintCatalogue() {
  if (!project) return;
  openDialog(
    'Paint catalogue',
    'Pick the paint you will use. The colour and product name go into your workshop PDF.',
    `<div class="row paint-filter"><input id="paint-search" placeholder="Search code or name…" aria-label="Search paints"><select id="paint-brand" aria-label="Brand">${['All', ...PaintCatalogue.BRANDS, 'My paints'].map(b => `<option ${b === paintBrand ? 'selected' : ''}>${b}</option>`).join('')}</select></div><div id="paint-list" class="paint-list"></div><details class="paint-add"><summary>Add one of my paints</summary><div class="row"><div class="field"><label for="my-paint-brand">Brand</label><input id="my-paint-brand" list="paint-brands" placeholder="e.g. Revell"><datalist id="paint-brands">${PaintCatalogue.BRANDS.map(b => `<option value="${b}">`).join('')}</datalist></div><div class="field"><label for="my-paint-code">Code</label><input id="my-paint-code" placeholder="e.g. 36131"></div></div><div class="row"><div class="field" style="flex:2"><label for="my-paint-name">Name</label><input id="my-paint-name" placeholder="e.g. Fiery red"></div><div class="field"><label for="my-paint-hex">Colour</label><input id="my-paint-hex" type="color" value="${M.colour(currentPaint().fill)}"></div></div><button id="my-paint-save">Add to My paints</button></details><p class="note">Screen colours are approximate. Check against the maker's chart or a painted test card.</p>`,
    `<button data-action="close-dialog">Close</button>`
  );
  $('#paint-search').oninput = renderPaintList;
  $('#paint-brand').onchange = () => {
    paintBrand = $('#paint-brand').value;
    renderPaintList();
  };
  $('#my-paint-save').onclick = () => {
    const paint = {
      brand: M.name($('#my-paint-brand').value.trim(), 'My paint').slice(0, 40),
      code: $('#my-paint-code').value.trim().slice(0, 30),
      name: $('#my-paint-name').value.trim().slice(0, 60),
      hex: M.colour($('#my-paint-hex').value, '#ffffff')
    };
    if (!paint.code && !paint.name) return toast('Give the paint a code or a name.');
    setPreference('customPaints', [...customPaints(), paint].slice(0, 300));
    paintBrand = 'My paints';
    $('#paint-brand').value = 'My paints';
    renderPaintList();
    toast('Added ' + PaintCatalogue.label(paint) + ' to My paints.');
  };
  renderPaintList();
}
function renderPaintList() {
  const query = ($('#paint-search')?.value || '').toLowerCase(),
    list = allPaints()
      .map((p, index) => ({ ...p, index }))
      .filter(p => (paintBrand === 'All' ? true : paintBrand === 'My paints' ? p.custom : p.brand === paintBrand))
      .filter(p => PaintCatalogue.label(p).toLowerCase().includes(query));
  $('#paint-list').innerHTML = list.length
    ? list
        .map(
          p =>
            `<button class="paint-pick" data-paint-pick="${p.index}" title="${e(PaintCatalogue.label(p))}"><span class="paint-dot" style="background:${p.hex}"></span><span class="paint-text"><strong>${e(p.code || '—')} ${e(p.name)}</strong><small>${e(p.brand)}${p.finish ? ' · ' + e(p.finish) : ''}</small></span>${p.custom ? `<span class="paint-remove" data-paint-remove="${p.index - PaintCatalogue.paints.length}" title="Remove from My paints" aria-label="Remove">×</span>` : ''}</button>`
        )
        .join('')
    : `<p class="note">${paintBrand === 'My paints' || ['Revell', 'Zero Paints'].includes(paintBrand) ? 'No paints here yet. Add the products you use below.' : 'No matching paints.'}</p>`;
}
document.addEventListener('click', ev => {
  const remove = ev.target.closest('[data-paint-remove]');
  if (remove) {
    ev.stopPropagation();
    const i = Number(remove.dataset.paintRemove);
    setPreference(
      'customPaints',
      customPaints().filter((_, n) => n !== i)
    );
    renderPaintList();
    return;
  }
  const pick = ev.target.closest('[data-paint-pick]');
  if (!pick) return;
  const paint = allPaints()[Number(pick.dataset.paintPick)];
  if (!paint) return;
  closeDialog();
  applyColour(paint.hex, PaintCatalogue.label(paint));
  toast('Paint chosen: ' + PaintCatalogue.label(paint) + '.');
});

// ---------------------------------------------- Painting order and masking
const lightness = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// One step per distinct paint, lightest first: light colours are sprayed
// before darker ones are masked and sprayed over them.
function paintingSteps(p = project) {
  const steps = new Map(),
    add = (hex, ref, use) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
      const colour = hex.toLowerCase(),
        key = colour + '|' + (ref || ''),
        step = steps.get(key) || { colour, ref: ref || '', uses: [] };
      if (!step.uses.includes(use)) step.uses.push(use);
      steps.set(key, step);
    };
  add(p.base, p.paintRef, 'Base colour (whole body)');
  for (const [k, v] of Object.entries(p.template.views))
    for (const r of v?.regions || [])
      if (r.role === 'body' && r.colour && r.paintVisible !== false)
        add(r.colour, r.paintRef, `${r.partLabel || r.name} (${M.LABELS[k]})`);
  for (const [k, list] of Object.entries(p.views))
    for (const l of list || []) {
      if (l.visible === false || ['image', 'vector'].includes(l.kind)) continue;
      add(l.fill, l.paintRef, `${l.name} (${M.LABELS[k]})`);
      if (l.kind === 'line')
        l.lineStripes.forEach((s, i) => s.colour && add(s.colour, '', `${l.name} stripe ${i + 1} (${M.LABELS[k]})`));
      const outline = M.outlineValues(l),
        shadow = M.shadowValues(l);
      if (outline.outlineColour) add(outline.outlineColour, '', `${l.name} outline (${M.LABELS[k]})`);
      if (shadow.shadowColour) add(shadow.shadowColour, '', `${l.name} shadow (${M.LABELS[k]})`);
    }
  return [...steps.values()].sort((a, b) => lightness(b.colour) - lightness(a.colour));
}
// A copy of the design where only `colour` keeps its paint; everything else
// is blank, and decals are hidden. `ink` replaces the colour (black masks).
function isolateColour(p, colour, blank = '#e4e8ec', ink = null) {
  const c = M.clone(p),
    keep = hex => String(hex || '').toLowerCase() === colour;
  const paint = hex => (keep(hex) ? ink || hex : blank);
  c.base = paint(c.base);
  delete c.fillType;
  delete c.gradient;
  for (const v of Object.values(c.template.views))
    for (const r of v?.regions || [])
      if (r.role === 'body') {
        r.colour = paint(r.colour || p.base);
        r.fillType = 'solid';
        delete r.gradient;
        r.paintVisible = true;
      }
  for (const list of Object.values(c.views))
    for (const l of list || []) {
      if (['image', 'vector'].includes(l.kind)) {
        l.visible = false;
        continue;
      }
      l.fill = paint(l.fill);
      l.fillType = 'solid';
      delete l.gradient;
      if (l.lineStripes) l.lineStripes = l.lineStripes.map(s => (s.colour ? { ...s, colour: paint(s.colour) } : s));
      if (l.outlineColour) l.outlineColour = paint(l.outlineColour);
      if (l.shadowColour) l.shadowColour = paint(l.shadowColour);
      l.finish = 'Satin';
      l.effect = 'Solid';
    }
  return c;
}
function usesColourInView(p, k, colour) {
  const iso = isolateColour(p, colour, '#000001');
  return (
    String(iso.base) === colour ||
    (iso.template.views[k]?.regions || []).some(r => r.role === 'body' && r.colour === colour) ||
    (iso.views[k] || []).some(
      l =>
        l.visible !== false &&
        [l.fill, l.outlineColour, l.shadowColour, ...(l.lineStripes || []).map(s => s.colour)].includes(colour)
    )
  );
}
function paintingOrderHTML(p = project) {
  const steps = paintingSteps(p),
    views = M.VIEWS.filter(k => p.template.views[k]),
    decals = Object.values(p.views)
      .flat()
      .filter(l => ['image', 'vector'].includes(l.kind) && l.visible !== false);
  return `<section class="sheet"><header><div class="brand">SLOTFORGE LIVERY · PAINTING ORDER</div><h2>${e(p.name)}</h2><p>Spray the lightest colour first. Before each later step, mask everything that already has its final colour. The pictures show what each step sprays.</p></header>${steps
    .map(
      (s, i) =>
        `<div class="step"><div class="step-title"><span class="step-no">${i + 1}</span><span class="swatch" style="background:${s.colour}"></span><strong>${e(s.ref || s.colour.toUpperCase())}</strong>${s.ref ? `<small>${s.colour.toUpperCase()}</small>` : '<small>No paint product chosen</small>'}</div><p>${i === 0 ? 'Spray' : 'Mask the earlier colours, then spray'}: ${s.uses.map(e).join(', ')}.</p><div class="step-views">${views
          .filter(k => usesColourInView(p, k, s.colour))
          .map(
            k =>
              `<figure>${V.standalone(isolateColour(p, s.colour, lightness(s.colour) > 0.6 ? '#8e98a3' : '#e4e8ec'), k, `step-${i}-${k}`)}<figcaption>${M.LABELS[k]}</figcaption></figure>`
          )
          .join('')}</div></div>`
    )
    .join(
      ''
    )}${decals.length ? `<div class="step"><div class="step-title"><span class="step-no">${steps.length + 1}</span><strong>Decals</strong></div><p>Apply after the final colour, then seal with clear coat: ${[...new Set(decals.map(l => l.name))].map(e).join(', ')}.</p></div>` : ''}</section>`;
}
const PAINTING_ORDER_CSS =
  '.step{break-inside:avoid;border-top:1px solid #dce2e8;padding:10px 0}.step-title{display:flex;align-items:center;gap:8px}.step-title small{color:#596573}.step-no{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#1f2a35;color:#fff;font-weight:700;font-size:11px}.step-views{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.step-views figure{margin:0;background:#f3f5f7;border:1px solid #dce2e8}.step-views svg{width:100%;height:42mm;display:block}.step-views figcaption{font-size:10px;color:#596573;padding:2px 6px}';

// -------------------------------------------------------- True-size printing
// Masks (one page per colour, the sprayed areas solid black) and the full
// design, printed at the real size set for the view, with a 50 mm check bar.
function trueSizeDialog() {
  if (!project || !activeView()) return;
  // M.mmPerUnit, not viewMm: viewMm(undefined) would fall back to the active view.
  const views = M.VIEWS.filter(k => M.mmPerUnit(project.template.views[k]));
  if (!views.length)
    return toast('Set the real width of a view first (Workshop & reuse → Real size), then print at true size.');
  openDialog(
    'Print at true size',
    'Masking templates and the design at the real size of your car, for cutting tape or checking decals.',
    `<div class="rvpage"><div class="rvsettings"><details class="inspector-folder rvfold" open><summary>Pages</summary><div class="rvfields"><div class="field"><label for="true-view">View</label><select id="true-view">${views.map(k => `<option value="${k}" ${k === currentView ? 'selected' : ''}>${M.LABELS[k]} view · ${formatMm(project.template.views[k].realWidthMm)} mm wide</option>`).join('')}</select></div><label class="checkbox-line"><input id="true-masks" type="checkbox" checked>One masking template per colour</label><label class="checkbox-line"><input id="true-design" type="checkbox" checked>The full design</label></div></details><p class="note">Print at 100% (no "fit to page"). Measure the 50 mm bar to check the scale.</p></div><section class="rvpreview"><header class="rvprevhead"><div><strong>Preview</strong><span>The pages of the PDF</span></div></header><div class="ts-pages" id="true-preview"></div><p class="note rvprevnote" id="true-info" role="status"></p></section></div>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="true-export">Save PDF</button>`
  );
  $('#dialog').classList.add('monitor-dialog');
  // The preview draws the same pages the PDF will hold, small.
  const refresh = () => {
    const key = $('#true-view').value,
      pages = trueSizePages(project, key, { masks: $('#true-masks').checked, design: $('#true-design').checked }),
      b = project.template.views[key].bounds;
    $('#true-preview').innerHTML = pages.length
      ? pages
          .map(
            (pg, i) =>
              `<figure class="ts-page"><svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" aria-hidden="true">${V.renderView(pg.project, key, { id: 'true-preview-' + i })}</svg><figcaption>${e(pg.title)}</figcaption></figure>`
          )
          .join('')
      : '<p class="note">Choose masks, the design, or both.</p>';
    $('#true-info').textContent = pages.length
      ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${trueSizePaper(project, key)} · preview, not to scale`
      : '';
  };
  for (const id of ['true-view', 'true-masks', 'true-design']) $('#' + id).onchange = refresh;
  refresh();
  $('#true-export').onclick = async () => {
    const key = $('#true-view').value,
      masks = $('#true-masks').checked,
      design = $('#true-design').checked;
    if (!masks && !design) return toast('Choose masks, the design, or both.');
    closeDialog();
    const html = await preparePrintableReport(trueSizeHTML(project, key, { masks, design }));
    if (window.desktop) {
      if (await window.desktop.exportPDF({ name: project.name + ' true size', html })) toast('True-size PDF saved.');
    } else download(new Blob([html], { type: 'text/html' }), project.name + '-true-size.html');
  };
}
// The pages of a true-size PDF: the full design and one mask per colour. The PDF and the
// preview in the Print at true size window both draw this list.
function trueSizePages(p, key, { masks = true, design = true } = {}) {
  const pages = [];
  if (design) pages.push({ title: p.name + ' · full design', project: p, id: 'true-design' });
  if (masks)
    paintingSteps(p)
      .filter(s => usesColourInView(p, key, s.colour))
      .forEach((s, i) =>
        pages.push({
          title: `Mask ${i + 1}: ${s.ref || s.colour.toUpperCase()} (black = sprayed in this step)`,
          project: isolateColour(p, s.colour, '#ffffff', '#111111'),
          id: 'true-mask-' + i
        })
      );
  return pages;
}
function trueSizePaper(p, key) {
  const view = p.template.views[key],
    mm = M.mmPerUnit(view),
    width = view.bounds.w * mm,
    height = view.bounds.h * mm;
  return width <= 270 && height <= 180
    ? 'A4 landscape'
    : width <= 400 && height <= 270
      ? 'A3 landscape'
      : 'A2 landscape';
}
function trueSizeHTML(p, key, { masks = true, design = true } = {}) {
  const view = p.template.views[key],
    mm = M.mmPerUnit(view),
    b = view.bounds,
    width = b.w * mm,
    height = b.h * mm,
    page = trueSizePaper(p, key),
    sheet = (title, project, id) =>
      `<section class="sheet"><div class="brand">SLOTFORGE LIVERY · TRUE SIZE · ${M.LABELS[key].toUpperCase()} VIEW</div><h2>${e(title)}</h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${width}mm" height="${height}mm">${V.renderView(project, key, { id })}</svg><div class="bar"><span></span>50 mm · ${e(p.template.name)} · ${formatMm(width)} × ${formatMm(height)} mm</div></section>`;
  const pages = trueSizePages(p, key, { masks, design }).map(pg => sheet(pg.title, pg.project, pg.id));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><title>${e(p.name)} true size</title><style>@page{size:${page};margin:10mm}body{font:11px Arial,sans-serif;color:#1f2a35;margin:0}.sheet{break-after:page}.sheet:last-child{break-after:auto}.brand{font-size:10px;letter-spacing:2px;color:#d84149}h2{font-size:14px;margin:4px 0 8px}svg{display:block}.bar{display:flex;align-items:center;gap:8px;margin-top:6mm;color:#596573}.bar span{display:inline-block;width:50mm;height:3mm;background:#1f2a35}</style></head><body>${pages.join('')}</body></html>`;
}

// ------------------------------------------------------ SlotForge Decals
// Text, images, decals and shapes become SVG decals at their real size.
function decalScale() {
  const n = Number(String(project?.template.scale || '').split(':')[1]);
  return Number.isFinite(n) && n > 0 ? n : 32;
}
function decalUnits() {
  const chosen = artworkSelection().length ? artworkSelection() : layers().filter(l => l.visible !== false);
  const units = new Map();
  for (const l of chosen) {
    const key = l.groupId && chosen.filter(a => a.groupId === l.groupId).length > 1 ? 'g:' + l.groupId : l.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(l);
  }
  return [...units.values()];
}
function decalsPack() {
  const mm = viewMm();
  if (!mm) throw Error('Set the real width of this view first, so decals keep their real size.');
  const units = decalUnits();
  if (!units.length) throw Error('Add artwork to this view first.');
  const decals = units.map((unit, i) => {
    const b = M.artworkBounds(unit),
      name = unit[0].groupId && unit.length > 1 ? unit[0].groupName : unit[0].name,
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${unit.map(l => V.layerMarkup({ ...l, locked: false }, false, {})).join('')}</svg>`;
    return {
      name: M.name(name, 'Livery decal').slice(0, 160),
      tags: 'livery',
      creator: '',
      scale: decalScale(),
      art: {
        ...DecalsModel.item('svg'),
        name: M.name(name, 'Livery decal').slice(0, 160),
        svg,
        x: 5,
        y: 5 + i * 2,
        w: Math.max(0.1, b.w * mm),
        h: Math.max(0.1, b.h * mm)
      }
    };
  });
  return DecalsModel.pack(decals, []);
}
async function sendToDecals() {
  if (!project) return;
  let pack;
  try {
    pack = decalsPack();
  } catch (error) {
    return toast(error.message);
  }
  if (window.desktop?.exportDecals) {
    if (await window.desktop.exportDecals({ name: project.name + ' decals', data: pack }))
      toast(`Saved ${pack.decals.length} decal${pack.decals.length === 1 ? '' : 's'} for SlotForge Decals.`);
  } else download(new Blob([JSON.stringify(pack)], { type: 'application/json' }), project.name + '.sfdecal');
}

// ------------------------------------------------------- Photo tracing aids
document.addEventListener('input', ev => {
  if (ev.target.id !== 'photo-opacity' || !activeView()?.photo) return;
  activeView().photoOpacity = M.number(ev.target.value, 65, 10, 100) / 100;
  const output = ev.target.previousElementSibling;
  if (output?.tagName === 'OUTPUT') output.textContent = Math.round(activeView().photoOpacity * 100) + '%';
  renderCanvas();
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'photo-opacity') changed();
});
function addCentreGuide() {
  const v = activeView();
  if (!v) return;
  const b = v.photo || v.bounds,
    x = b.x + b.w / 2;
  mutate(() => {
    const g = viewGuides(true);
    if (!g.x.some(value => Math.abs(value - x) < 0.5)) g.x.push(x);
  });
  setPreference('showRulers', true);
  $('#rulers').checked = true;
  renderCanvas();
  toast('Centre guide added. Drag it to adjust, or back onto the ruler to remove it.');
}
