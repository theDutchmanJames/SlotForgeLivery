// Livery renderer · Notes, workshop PDF and PNG export.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function notesDialog() {
  if (!project) return;
  openDialog(
    'Workshop notes',
    'These details are included in the PDF and saved livery.',
    `<div class="field"><label for="paint-notes">Paint references</label><textarea id="paint-notes" placeholder="e.g. Body blue: brand and product code\nOrange stripe: brand and product code">${e(project.paints)}</textarea></div><div class="field"><label for="workshop-notes">Masking, decals and application notes</label><textarea id="workshop-notes" style="min-height:150px" placeholder="Record your intended painting order, masking boundaries and decal placement notes…">${e(project.notes)}</textarea></div><p class="note">Screen and print colours are approximate. Use the actual paint reference for your workshop decisions.</p>`,
    `<button data-action="close-dialog">Cancel</button><button id="notes-save" class="primary">Save notes</button>`
  );
  $('#notes-save').onclick = () => {
    const paints = $('#paint-notes').value,
      notes = $('#workshop-notes').value;
    mutate(() => {
      project.paints = paints;
      project.notes = notes;
    });
    closeDialog();
  };
}
function reportPaint(c) {
  const swatch = colour => `<span class="swatch" style="background:${colour}"></span>${colour.toUpperCase()}`;
  return (
    swatch(c.fill) +
    (c.fillType === 'gradient' && c.gradient
      ? `<br>Gradient · ${c.gradient.angle}° · ${Math.round(c.gradient.strength * 100)}% strength<br>${c.gradient.stops.map(s => swatch(s.colour) + ' at ' + Math.round(s.offset * 100) + '%').join('<br>')}`
      : '')
  );
}
function makeReport() {
  const p = project,
    used = new Map(),
    add = (name, paint) => used.set(name + JSON.stringify(paint), { name, ...paint });
  add('Base paint', M.paintOf(p));
  for (const k of M.VIEWS)
    for (const l of p.views[k])
      if (!['image', 'vector'].includes(l.kind)) {
        add(l.name, M.paintOf(l));
        if (l.kind === 'line')
          l.lineStripes.forEach((s, i) => {
            if (s.colour) add(l.name + ' · stripe ' + (i + 1), { ...M.paintOf(l), fill: s.colour, fillType: 'solid' });
          });
      }
  for (const v of Object.values(p.template.views))
    for (const r of v.regions) if (r.role === 'body') add(r.partLabel || r.name, M.paintOf(p, r));
  const css =
    '@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#1f2a35;margin:0}h1{font-size:26px;margin:8px 0}h2{font-size:18px;margin:18px 0 8px}small,p{color:#596573;line-height:1.6}.brand{font-size:11px;letter-spacing:2px;color:#d84149}header{border-bottom:3px solid #d84149;padding-bottom:14px}.sheet{break-after:page}.sheet:last-child{break-after:auto}.car{height:105mm;width:100%;background:#f3f5f7;margin:14px 0;border:1px solid #dce2e8}.car svg{width:100%;height:100%}table{border-collapse:collapse;width:100%;font-size:11px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.swatch{display:inline-block;width:20px;height:14px;border:1px solid #bbb;vertical-align:middle;margin-right:8px}pre{white-space:pre-wrap;font:12px/1.7 Arial;color:#333;overflow-wrap:anywhere}.note{font-size:10px;color:#777}.art-list{font-size:11px;line-height:1.7}';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><title>${e(p.name)}</title><style>${css}</style></head><body><section class="sheet"><header><div class="brand">SLOTFORGE LIVERY · WORKSHOP PLAN</div><h1>${e(p.name)}</h1><p>${e(p.template.name)} · ${e(p.template.scale)} · ${new Date().toLocaleDateString()}</p></header><h2>Paint & finish references</h2><table><tr><th>Use</th><th>Colour</th><th>Effect</th><th>Finish</th></tr>${[...used.values()].map(c => `<tr><td>${e(c.name)}</td><td>${reportPaint(c)}</td><td>${e(c.effect)}</td><td>${e(c.finish)}</td></tr>`).join('')}</table><h2>Paint products</h2><pre>${e(p.paints || 'No product references entered.')}</pre><h2>Workshop notes</h2><pre>${e(p.notes || 'No additional notes entered.')}</pre><p class="note">Reference plan only. Views are not printed at actual scale and are not cutting or decal-wrap templates. Printed colours and illustrative finishes are approximate.</p></section>${M.VIEWS.filter(
    k => p.template.views[k]
  )
    .map(
      k =>
        `<section class="sheet"><header><div class="brand">SLOTFORGE LIVERY · ${M.LABELS[k].toUpperCase()} VIEW</div><h2>${e(p.name)}</h2><small>${e(p.template.name)}</small></header><div class="car">${V.standalone(p, k, 'report-' + k)}</div><h2>Artwork placement</h2><div class="art-list">${
          p.views[k]
            .filter(l => l.visible !== false)
            .map(
              l =>
                `${e(l.name)}${['image', 'vector'].includes(l.kind) ? ' · ' + l.kind + ' decal' : ` · ${e(l.effect)} / ${e(l.finish)}`}`
            )
            .join('<br>') || 'Base paint only.'
        }</div><p class="note">${M.LABELS[k]} view · Design reference, not actual size. Check placement against the physical shell.</p></section>`
    )
    .join('')}</body></html>`;
}
async function preparePrintableReport(html) {
  // PDF vector compositing does not preserve the additive coverage at mesh seams.
  // Rasterise only views using perspective, at a resolution above 300 dpi on A4.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const svg of doc.querySelectorAll('.car > svg')) {
    if (!svg.querySelector('[id^="warp-"],style')) continue;
    svg.setAttribute('width', '3000');
    svg.setAttribute('height', '1800');
    const source = new XMLSerializer().serializeToString(svg),
      img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 1800;
    canvas.getContext('2d').drawImage(img, 0, 0, 3000, 1800);
    const output = doc.createElement('img');
    output.src = canvas.toDataURL('image/png');
    output.alt = 'Workshop design view';
    output.style.cssText = 'width:100%;height:100%;object-fit:contain';
    svg.replaceWith(output);
  }
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
async function rasterSVG(source, width, height) {
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas;
}
async function pngArtwork(projectSnapshot, key, effects = false) {
  const source = V.standalone(projectSnapshot, key, 'png-export', { effects }),
    canvas = await rasterSVG(source, 1000, 600),
    pixels = canvas.getContext('2d').getImageData(0, 0, 1000, 600).data;
  let left = 1000,
    top = 600,
    right = -1,
    bottom = -1;
  for (let y = 0; y < 600; y++)
    for (let x = 0; x < 1000; x++)
      if (pixels[(y * 1000 + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left) throw new Error('This view has no visible artwork to export.');
  // One source pixel of transparent margin keeps antialiased outlines inside the crop.
  return { source, bounds: { x: left - 1, y: top - 1, w: right - left + 3, h: bottom - top + 3 } };
}
async function renderPNG(artwork, size) {
  const b = artwork.bounds,
    scale = size / Math.max(b.w, b.h),
    width = Math.max(1, Math.round(b.w * scale)),
    height = Math.max(1, Math.round(b.h * scale));
  const doc = new DOMParser().parseFromString(artwork.source, 'image/svg+xml'),
    svg = doc.documentElement;
  svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  return rasterSVG(new XMLSerializer().serializeToString(svg), width, height);
}
function exportPNGDialog() {
  if (!project || !Object.keys(project.template.views).length) return toast('Add a car view before exporting.');
  const snapshot = M.clone(project),
    views = M.VIEWS.filter(k => snapshot.template.views[k]),
    initial = views.includes(currentView) ? currentView : views[0];
  openDialog(
    'Export transparent PNG',
    'A freestanding image of one car view, cropped to the visible artwork.',
    `<div class="row"><div class="field"><label for="png-view">Car view</label><select id="png-view">${views.map(k => `<option value="${k}" ${k === initial ? 'selected' : ''}>${M.LABELS[k]}</option>`).join('')}</select></div><div class="field"><label for="png-size">Longest edge</label><select id="png-size">${[1000, 2000, 3000, 4000].map(n => `<option value="${n}" ${n === 2000 ? 'selected' : ''}>${n} px</option>`).join('')}</select></div></div><label class="checkbox-line"><input id="png-effects" type="checkbox" ${store.settings?.paintPreview !== false ? 'checked' : ''}>Include paint finish preview</label><div class="png-preview" id="png-preview"></div><p class="note" id="png-info" role="status">Preparing preview…</p><p class="note">The checkerboard shows transparency. Canvas, selection outlines and photo tracing guides are excluded. Backgrounds drawn into the imported artwork remain part of it.</p>`,
    `<button data-action="close-dialog">Cancel</button><button id="png-save" class="primary" disabled>Save PNG</button>`
  );
  const button = $('#png-save'),
    preview = $('#png-preview'),
    info = $('#png-info');
  let sequence = 0,
    prepared = null,
    saving = false;
  const refresh = async () => {
    const ticket = ++sequence;
    button.disabled = true;
    prepared = null;
    try {
      const key = $('#png-view').value,
        effects = $('#png-effects').checked,
        size = Number($('#png-size').value),
        artwork = await pngArtwork(snapshot, key, effects);
      const canvas = await renderPNG(artwork, Math.min(size, 1000));
      if (ticket !== sequence || !button.isConnected) return;
      preview.replaceChildren(canvas);
      prepared = { key, size, artwork };
      const b = artwork.bounds,
        scale = size / Math.max(b.w, b.h);
      info.textContent = `${Math.round(b.w * scale)} × ${Math.round(b.h * scale)} pixels · Transparent PNG`;
      button.disabled = saving;
    } catch (error) {
      if (ticket === sequence && button.isConnected) {
        preview.replaceChildren();
        info.textContent = error.message;
      }
    }
  };
  for (const id of ['png-view', 'png-size', 'png-effects']) $('#' + id).onchange = refresh;
  button.onclick = async () => {
    if (!prepared || saving) return;
    saving = true;
    button.disabled = true;
    const job = prepared,
      ticket = sequence,
      current = () => button.isConnected && $('#dialog').open && ticket === sequence;
    try {
      const canvas = await renderPNG(job.artwork, job.size),
        name = snapshot.name + '-' + M.LABELS[job.key];
      if (!current()) return;
      if (window.desktop) {
        if (await window.desktop.exportPNG({ name, dataURL: canvas.toDataURL('image/png') })) {
          if (current()) closeDialog();
          toast('Transparent PNG saved.');
        }
      } else {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!current()) return;
        download(blob, name + '.png');
        closeDialog();
        toast('Transparent PNG downloaded.');
      }
    } catch (error) {
      reportError(error);
    } finally {
      saving = false;
      if (button.isConnected) button.disabled = !prepared;
    }
  };
  refresh();
}
async function exportPDF() {
  if (!project) return;
  if (!Object.values(project.template.views).some(v => v.regions.some(r => r.role === 'body')))
    return toast('Prepare a paintable body before exporting.');
  toast('Preparing your workshop PDF…');
  const html = await preparePrintableReport(makeReport());
  if (window.desktop) {
    if (await window.desktop.exportPDF({ name: project.name, html })) toast('Workshop PDF saved.');
  } else {
    download(new Blob([html], { type: 'text/html' }), project.name + '-workshop.html');
    toast('Workshop report downloaded. Open it and choose Print → Save as PDF.');
  }
}
