// Livery renderer · Print pack (remake 2026-11, option B of docs/ui-reference/print-2026-11):
// everything for the bench as page thumbnails in groups (workshop plan, masks at true size,
// pictures). Tick the pages, put them in order, save one PDF. Decals are made in SlotForge
// Decals: the pack sends them there, and Decals sheets come back with Import decal artwork.
// The pack (ticks, order, settings) is remembered per livery in project.printPack.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const PACK_PAPERS = {
    A4: { portrait: [210, 297], css: 'A4' },
    A3: { portrait: [297, 420], css: 'A3' },
    Letter: { portrait: [216, 279], css: 'letter' },
    A2: { portrait: [420, 594], css: 'A2' }
  },
  PACK_SCALES = ['1:24', '1:32', '1:43'],
  PACK_PNG_SIZES = [1000, 2000, 4000];
let packOpen = false,
  packLarge = null;

// ---------------------------------------------------------------- The pack
function packOf(p = project) {
  const pack = p.printPack || {},
    s = pack.settings || {};
  return {
    off: Array.isArray(pack.off) ? pack.off : null,
    order: Array.isArray(pack.order) ? pack.order : [],
    settings: {
      scale: PACK_SCALES.includes(s.scale) ? s.scale : PACK_SCALES.includes(p.template.scale) ? p.template.scale : null,
      paper: ['A4', 'A3', 'Letter'].includes(s.paper) ? s.paper : 'A4',
      crop: s.crop !== false,
      bar: s.bar !== false,
      shopping: s.shopping !== false,
      notes: s.notes !== false,
      bothSides: s.bothSides !== false,
      design: s.design === true,
      pngSize: PACK_PNG_SIZES.includes(s.pngSize) ? s.pngSize : 2000,
      pngEffects: s.pngEffects !== false,
      allEntries: s.allEntries === true
    }
  };
}
function savePack(patch) {
  const pack = packOf();
  project.printPack = {
    off: patch.off ?? pack.off ?? defaultOff(),
    order: patch.order ?? pack.order,
    settings: { ...pack.settings, ...(patch.settings || {}) }
  };
  changed();
}
// View reference pages and pictures start unticked; the plan, painting order and masks are in.
function defaultOff(p = project) {
  return [
    ...Object.keys(p.template.views).map(k => 'view:' + k),
    ...Object.keys(p.template.views).map(k => 'png:' + k)
  ];
}
const packIsOn = (id, pack = packOf()) => !(pack.off ?? defaultOff()).includes(id);
// Real size changes with the scale chosen for the pack (the car was measured at its own scale).
function packMm(view, pack = packOf()) {
  const mm = M.mmPerUnit(view);
  if (!mm) return null;
  const from = SCALE_FACTOR[project.template.scale],
    to = SCALE_FACTOR[pack.settings.scale];
  return from && to ? (mm * from) / to : mm;
}

// ---------------------------------------------------------------- Pages
// Every page the pack can hold, in their default order. html is the sheet; size is the paper.
function packPages(p = project) {
  const pack = packOf(p),
    s = pack.settings,
    parts = reportParts(p, { shopping: s.shopping, notes: s.notes }),
    pages = [],
    portrait = { paper: s.paper, turn: 'portrait' };
  pages.push({
    id: 'plan',
    group: 'plan',
    title: 'Paints & notes',
    sub: 'Workshop plan',
    html: parts.summary,
    ...portrait
  });
  pages.push({
    id: 'order',
    group: 'plan',
    title: 'Painting order',
    sub: `${paintingSteps(p).length} coats`,
    html: parts.order,
    ...portrait
  });
  for (const [k, html] of Object.entries(parts.views))
    pages.push({ id: 'view:' + k, group: 'plan', title: M.LABELS[k] + ' view', sub: 'Reference', html, ...portrait });
  const sized = M.VIEWS.filter(k => p.template.views[k] && packMm(p.template.views[k], pack));
  if (sized.length) {
    if (s.design)
      for (const k of sized)
        pages.push(maskPage(p, null, [k], pack, 'design:' + k, 'Design at true size', M.LABELS[k]));
    paintingSteps(p).forEach((step, i) => {
      const keys = sized.filter(k => usesColourInView(p, k, step.colour)),
        name = liveryColour(step.colour)?.name || step.ref || step.colour.toUpperCase(),
        sides = keys.filter(k => ['left', 'right'].includes(k)),
        together = s.bothSides && sides.length === 2;
      if (together)
        pages.push(
          maskPage(p, step, sides, pack, 'mask:' + step.colour + ':sides', name, `Coat ${i + 1} · both sides`, i)
        );
      for (const k of keys.filter(k => !(together && sides.includes(k))))
        pages.push(maskPage(p, step, [k], pack, `mask:${step.colour}:${k}`, name, `Coat ${i + 1} · ${M.LABELS[k]}`, i));
    });
  }
  return pages;
}
// A true-size sheet: the mask of one colour (black = sprayed in this coat), or the design.
function maskPage(p, step, keys, pack, id, title, sub, index = 0) {
  const s = pack.settings,
    pieces = keys.map(k => {
      const view = p.template.views[k],
        mm = packMm(view, pack),
        b = view.bounds;
      return { k, b, w: b.w * mm, h: b.h * mm };
    }),
    width = Math.max(...pieces.map(x => x.w)),
    height = pieces.reduce((n, x) => n + x.h, 0) + (pieces.length - 1) * 8 + 30,
    fits = name => {
      const [w, h] = PACK_PAPERS[name].portrait;
      return width <= h - 20 && height <= w - 20;
    },
    paper = fits(s.paper) ? s.paper : ['A4', 'A3', 'A2'].find(fits) || 'A2',
    source = step ? isolateColour(p, step.colour, '#ffffff', '#111111') : p,
    heading = step
      ? `Mask ${index + 1}: ${e(title)}${step.ref ? ' · ' + e(step.ref) : ''} <small>black = sprayed in this coat</small>`
      : `${e(p.name)} · full design`;
  const html = `<section class="sheet ts ts-${paper}">${s.crop ? '<i class="crop tl"></i><i class="crop tr"></i><i class="crop bl"></i><i class="crop br"></i>' : ''}<div class="brand">SLOTFORGE LIVERY · TRUE SIZE${s.scale ? ' · ' + e(s.scale) : ''}</div><h2>${heading}</h2>${pieces
    .map(
      x =>
        `<figure><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.b.x} ${x.b.y} ${x.b.w} ${x.b.h}" width="${x.w}mm" height="${x.h}mm">${V.renderView(source, x.k, { id: `${id.replace(/[^a-z0-9]/gi, '-')}-${x.k}` })}</svg><figcaption>${M.LABELS[x.k]}</figcaption></figure>`
    )
    .join('')}${s.bar ? '<div class="bar"><span></span>50 mm: check this after printing</div>' : ''}</section>`;
  return {
    id,
    group: 'masks',
    title: step ? title : 'Design',
    sub,
    html,
    paper,
    turn: 'landscape',
    bigger: paper !== s.paper ? paper : null
  };
}
const PACK_TS_CSS =
  '.ts{position:relative;page:ts-A4}.ts-A3{page:ts-A3}.ts-A2{page:ts-A2}.ts-Letter{page:ts-Letter}.ts .brand{font-size:10px}.ts h2{font-size:14px;margin:4px 0 8px}.ts h2 small{font-weight:400;color:#596573}.ts figure{margin:0 0 8px}.ts figcaption{font-size:9px;color:#596573}.ts svg{display:block}.ts .bar{display:flex;align-items:center;gap:8px;margin-top:4mm;color:#596573;font-size:10px}.ts .bar span{display:inline-block;width:50mm;height:3mm;background:#1f2a35}.crop{position:absolute;width:6mm;height:6mm;border:0 solid #1f2a35}.crop.tl{left:-6mm;top:-6mm;border-right-width:.3mm;border-bottom-width:.3mm}.crop.tr{right:-6mm;top:-6mm;border-left-width:.3mm;border-bottom-width:.3mm}.crop.bl{left:-6mm;bottom:-6mm;border-right-width:.3mm;border-top-width:.3mm}.crop.br{right:-6mm;bottom:-6mm;border-left-width:.3mm;border-top-width:.3mm}@page ts-A4{size:A4 landscape;margin:10mm}@page ts-A3{size:A3 landscape;margin:10mm}@page ts-A2{size:A2 landscape;margin:10mm}@page ts-Letter{size:letter landscape;margin:10mm}';
function packCSS(paper = packOf().settings.paper) {
  return (
    reportCSS().replace(
      '@page{size:A4 portrait;margin:14mm}',
      `@page{size:${PACK_PAPERS[paper].css} portrait;margin:14mm}`
    ) + PACK_TS_CSS
  );
}
// The ticked pages in the pack's order: the saved order first, new pages after.
function packQueue(pages = packPages(), pack = packOf()) {
  const on = pages.filter(pg => packIsOn(pg.id, pack)),
    rank = id => {
      const i = pack.order.indexOf(id);
      return i < 0 ? 1000 + pages.findIndex(pg => pg.id === id) : i;
    };
  return on.sort((a, b) => rank(a.id) - rank(b.id));
}

// ---------------------------------------------------------------- Drawing
// A page thumbnail: the sheet in its own shadow root, so the print styles stay inside it.
function paperSize(pg) {
  const [w, h] = PACK_PAPERS[pg.paper].portrait;
  return pg.turn === 'landscape' ? [h, w] : [w, h];
}
function fillPaper(host, pg, width) {
  const [w, h] = paperSize(pg),
    px = 96 / 25.4,
    margin = pg.turn === 'landscape' ? 10 : 14,
    scale = width / (w * px);
  host.style.width = width + 'px';
  host.style.height = Math.round(h * px * scale) + 'px';
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${packCSS()}:host{display:block;overflow:hidden;background:#fff;color:#1f2a35}.page{width:${w}mm;height:${h}mm;padding:${margin}mm;box-sizing:border-box;transform:scale(${scale});transform-origin:0 0;overflow:hidden}.sheet{break-after:auto}</style><div class="page">${pg.html}</div>`;
}
function showPack() {
  if (!project) return toast('Open a livery first.');
  if (setup) leaveSetup();
  hideGarage();
  closeDialog();
  closeMenus();
  packOpen = true;
  packLarge = null;
  $('.workspace').hidden = true;
  $('#pack-page').hidden = false;
  document.body.classList.add('pack-open');
  $('#pack-crumb').hidden = false;
  renderPack();
}
function leavePack() {
  if (!packOpen) return;
  packOpen = false;
  $('#pack-page').hidden = true;
  $('#pack-page').replaceChildren();
  $('.workspace').hidden = false;
  document.body.classList.remove('pack-open');
  $('#pack-crumb').hidden = true;
}
const packToggle = (attrs, on, label, sub = '') =>
  `<label class="pk-toggle"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
function packCard(pg, pack) {
  const on = packIsOn(pg.id, pack);
  return `<div class="pk-card ${on ? '' : 'off'}" data-pack-card="${e(pg.id)}"><button class="pk-paper" data-pack-open="${e(pg.id)}" aria-label="See ${e(pg.title)} large"><span class="pk-host" data-pack-host="${e(pg.id)}"></span></button><button class="pk-tick" data-pack-tick="${e(pg.id)}" aria-pressed="${on}" title="${on ? 'In the pack: click to leave it out' : 'Not in the pack: click to add it'}" aria-label="${on ? 'Leave out' : 'Add'} ${e(pg.title)}">${icon('check')}</button><span class="pk-cap">${e(pg.title)}<small>${e(pg.sub)}${pg.bigger ? ` · on ${pg.bigger}` : ''}</small></span></div>`;
}
function renderPack() {
  if (!packOpen) return;
  const page = $('#pack-page'),
    scroll = page.querySelector('.pk-main')?.scrollTop || 0,
    pack = packOf(),
    s = pack.settings,
    pages = packPages(),
    queue = packQueue(pages, pack),
    group = g => pages.filter(pg => pg.group === g),
    sized = Object.values(project.template.views).some(v => M.mmPerUnit(v)),
    views = M.VIEWS.filter(k => project.template.views[k]),
    chip = (attrs, on, label, disabled = false) =>
      `<button class="pk-chip ${on ? 'on' : ''}" ${attrs} aria-pressed="${on}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  if (packLarge && !pages.some(pg => pg.id === packLarge)) packLarge = null;
  const large = packLarge && pages.find(pg => pg.id === packLarge);
  const main = large
    ? `<div class="pk-large"><span class="pk-host" data-pack-host="${e(large.id)}" data-pack-large></span></div>`
    : `<header class="pk-head"><div><span class="pk-eyebrow">Everything for the bench, in one PDF</span><h1>Print pack</h1><p>Tick the pages you want and put them in order on the right.</p></div><button data-action="studio">${icon('back')}Back to painting</button></header>
<div class="pk-bar" role="group" aria-label="Settings for the whole pack"><span class="pk-set"><small>Scale</small>${PACK_SCALES.map(x => chip(`data-pack-scale="${x}"`, s.scale === x, x, !SCALE_FACTOR[project.template.scale])).join('')}</span><span class="pk-set"><small>Paper</small>${['A4', 'A3', 'Letter'].map(x => chip(`data-pack-paper="${x}"`, s.paper === x, x)).join('')}</span>${packToggle('data-pack-setting="crop"', s.crop, 'Crop marks')}${packToggle('data-pack-setting="bar"', s.bar, '50 mm check bar')}${entryList().length > 1 ? packToggle('data-pack-setting="allEntries"', s.allEntries, `All ${entryList().length} entries`, 'the ticked pages for each car') : ''}</div>
<section class="pk-group"><h3><b>Workshop plan</b><small>${group('plan').length} pages</small><span class="pk-gopts">${packToggle('data-pack-setting="shopping"', s.shopping, 'Shopping list')}${packToggle('data-pack-setting="notes"', s.notes, 'Notes')}</span></h3><div class="pk-pages">${group(
        'plan'
      )
        .map(pg => packCard(pg, pack))
        .join('')}</div></section>
<section class="pk-group"><h3><b>Masks at true size</b><small>${sized ? 'one per colour · tick the ones you need' : 'need the real size of a view'}</small>${sized ? `<span class="pk-gopts">${packToggle('data-pack-setting="bothSides"', s.bothSides, 'Both sides on one page')}${packToggle('data-pack-setting="design"', s.design, 'Design page at true size')}</span>` : ''}</h3>${
        sized
          ? `<div class="pk-pages">${group('masks')
              .map(pg => packCard(pg, pack))
              .join('')}</div>`
          : `<div class="pk-note"><span class="pk-note-icon">${icon('ruler')}</span><span><b>Set the real size first</b><small>Masks print at the size of your model. Enter the real width of a view in the Workshop tab.</small></span><button data-pack-real-size>${icon('ruler')}Set the real size</button></div>`
      }</section>
<section class="pk-group"><h3><b>Decals</b><small>made in SlotForge Decals</small></h3><div class="pk-note"><span class="pk-note-icon">${icon('decal')}</span><span><b>Numbers, logos and decals are printed by SlotForge Decals</b><small>Send this livery's decals to Decals at their real size, lay them out and print them there. A sheet made in Decals comes back with Import decal artwork (.sfsheet or .sfdecal).</small></span><span class="pk-note-actions"><button data-action="send-decals">${icon('share')}Send decals to SlotForge Decals</button><button data-pack-import-decals>${icon('import')}Import a Decals sheet…</button></span></div></section>
<section class="pk-group"><h3><b>Pictures</b><small>PNG files, saved separately</small><span class="pk-gopts"><span class="pk-set">${PACK_PNG_SIZES.map(x => chip(`data-pack-png="${x}"`, s.pngSize === x, x + (x === 4000 ? ' px' : ''))).join('')}</span>${packToggle('data-pack-setting="pngEffects"', s.pngEffects, 'Finish preview')}</span></h3><div class="pk-pages">${views
        .map(k => {
          const on = packIsOn('png:' + k, pack);
          return `<div class="pk-card pk-pic ${on ? '' : 'off'}"><span class="pk-paper pk-picture">${V.standalone(project, k, 'pack-png-' + k, { preview: true, effects: s.pngEffects })}</span><button class="pk-tick" data-pack-tick="png:${k}" aria-pressed="${on}" aria-label="${on ? 'Leave out' : 'Add'} the ${M.LABELS[k]} picture">${icon('check')}</button><span class="pk-cap">${M.LABELS[k]} · PNG<small>${s.pngSize} px</small></span></div>`;
        })
        .join(
          ''
        )}</div><button class="pk-save-pictures" data-pack-pictures ${views.some(k => packIsOn('png:' + k, pack)) ? '' : 'disabled'}>${icon('image')}Save the ticked pictures…</button></section>`;
  const side = large
    ? `<section class="pk-sec"><h4>${e(large.title)}</h4><p class="note">${e(large.sub)} · ${large.paper} ${large.turn}${large.bigger ? ` (does not fit ${s.paper})` : ''}. Print at 100 %, not "fit to page"${s.bar && large.group === 'masks' ? ', and check the 50 mm bar' : ''}.</p></section><section class="pk-sec"><h4>This page</h4>${packToggle(`data-pack-tick-large="${e(large.id)}"`, packIsOn(large.id, pack), 'In the pack')}${large.group === 'masks' ? packToggle('data-pack-setting="bothSides"', s.bothSides, 'Both sides on one page') + packToggle('data-pack-setting="crop"', s.crop, 'Crop marks', 'for the whole pack') : ''}${large.group === 'plan' && large.id === 'plan' ? packToggle('data-pack-setting="shopping"', s.shopping, 'Shopping list') + packToggle('data-pack-setting="notes"', s.notes, 'Notes') : ''}</section><section class="pk-sec"><h4>Pages</h4><div class="pk-row"><button data-pack-step="-1">${icon('back')}Previous</button><button data-pack-step="1">Next${icon('chev')}</button></div></section><section class="pk-sec pk-end"><button data-pack-back>${icon('back')}Back to the pack</button></section>`
    : `<section class="pk-sec pk-queue"><h4>In this pack <span>${queue.length} ${queue.length === 1 ? 'page' : 'pages'}</span></h4><ol class="pk-list" aria-label="Pages in the pack, in order">${
        queue
          .map(
            (pg, i) =>
              `<li class="pk-item" draggable="true" data-pack-item="${e(pg.id)}"><span class="pk-grip" aria-hidden="true">⠿</span><span class="pk-item-text"><b>${e(pg.title)}</b><small>${e(pg.sub)}</small></span><span class="pk-move"><button data-pack-move="${e(pg.id)}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move ${e(pg.title)} up" title="Move up">${icon('up')}</button><button data-pack-move="${e(pg.id)}" data-dir="1" ${i < queue.length - 1 ? '' : 'disabled'} aria-label="Move ${e(pg.title)} down" title="Move down">${icon('down')}</button></span></li>`
          )
          .join('') || '<li class="note">Tick pages on the left to add them.</li>'
      }</ol></section><section class="pk-sec pk-end"><button class="primary" data-pack-save ${queue.length ? '' : 'disabled'}>${icon('pdf')}Save the pack as one PDF</button><p class="note">The pack and its settings are remembered for this livery.</p><span class="pk-label">Share</span><button data-action="export-project">${icon('share')}Editable package (.sfpaint)</button></section>`;
  page.innerHTML = `<main class="pk-main ${large ? 'is-large' : ''}">${main}</main><aside class="pk-side" aria-label="${large ? 'This page' : 'In this pack'}">${side}</aside>`;
  for (const host of page.querySelectorAll('[data-pack-host]')) {
    const pg = pages.find(x => x.id === host.dataset.packHost);
    if (!pg) continue;
    if (host.dataset.packLarge !== undefined) {
      const box = page.querySelector('.pk-large').getBoundingClientRect(),
        [w, h] = paperSize(pg);
      fillPaper(host, pg, Math.max(200, Math.min(box.width - 40, ((box.height - 40) * w) / h)));
    } else fillPaper(host, pg, pg.turn === 'landscape' ? 186 : 132);
  }
  page.querySelector('.pk-main').scrollTop = scroll;
}

// ---------------------------------------------------------------- Saving
async function savePackPDF() {
  const queue = packQueue();
  if (!queue.length) return toast('Tick at least one page.');
  toast('Preparing your print pack…');
  // All entries: the same ticked pages, once for each entry, in the entries' order.
  const pack = packOf(),
    runs = pack.settings.allEntries && entryList().length > 1 ? entryList().map(x => withEntry(project, x)) : [project],
    body = runs
      .map((p, i) => {
        const html = packQueue(packPages(p), pack)
          .map(pg => pg.html)
          .join('');
        // Each entry's drawings get their own ids, so one entry never borrows another's.
        return runs.length > 1 ? html.replace(/(id="|url\(#|href="#)([^"')]+)/g, '$1e' + i + '-$2') : html;
      })
      .join('');
  const html = await preparePrintableReport(reportDocument(project.name + ' print pack', packCSS(), body));
  if (window.desktop) {
    if (await window.desktop.exportPDF({ name: project.name + ' print pack', html })) toast('Print pack saved.');
  } else {
    download(new Blob([html], { type: 'text/html' }), project.name + '-print-pack.html');
    toast('Print pack downloaded. Open it and choose Print → Save as PDF.');
  }
}
async function savePackPictures() {
  const pack = packOf(),
    keys = M.VIEWS.filter(k => project.template.views[k] && packIsOn('png:' + k, pack)),
    snapshot = M.clone(project);
  for (const k of keys) {
    const canvas = await renderPNG(await pngArtwork(snapshot, k, pack.settings.pngEffects), pack.settings.pngSize),
      name = snapshot.name + '-' + M.LABELS[k];
    if (window.desktop) {
      if (!(await window.desktop.exportPNG({ name, dataURL: canvas.toDataURL('image/png') }))) return;
    } else download(await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), name + '.png');
  }
  toast(keys.length === 1 ? 'Picture saved.' : `${keys.length} pictures saved.`);
}

// ---------------------------------------------------------------- Events
function packSetOrder(ids) {
  savePack({ order: ids });
  renderPack();
}
document.addEventListener('click', async ev => {
  if (!packOpen) return;
  const b = ev.target.closest('#pack-page button');
  if (!b || b.disabled) return;
  const d = b.dataset,
    pack = packOf();
  try {
    if (d.packTick) {
      const off = new Set(pack.off ?? defaultOff());
      off.has(d.packTick) ? off.delete(d.packTick) : off.add(d.packTick);
      savePack({ off: [...off] });
      renderPack();
    } else if (d.packOpen) {
      packLarge = d.packOpen;
      renderPack();
    } else if (d.packBack !== undefined) {
      packLarge = null;
      renderPack();
    } else if (d.packStep) {
      const pages = packPages(),
        i = pages.findIndex(pg => pg.id === packLarge);
      packLarge = pages[(i + Number(d.packStep) + pages.length) % pages.length].id;
      renderPack();
    } else if (d.packScale || d.packPaper || d.packPng) {
      savePack({
        settings: d.packScale
          ? { scale: d.packScale }
          : d.packPaper
            ? { paper: d.packPaper }
            : { pngSize: Number(d.packPng) }
      });
      renderPack();
    } else if (d.packMove) {
      const ids = packQueue().map(pg => pg.id),
        i = ids.indexOf(d.packMove),
        j = i + Number(d.dir);
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      packSetOrder(ids);
    } else if (d.packSave !== undefined) await savePackPDF();
    else if (d.packPictures !== undefined) await savePackPictures();
    else if (d.packRealSize !== undefined) {
      leavePack();
      render();
      showInspectorTab('workshop');
      $('#real-width')?.focus();
    } else if (d.packImportDecals !== undefined) {
      leavePack();
      render();
      $('#image-file').click();
    }
  } catch (error) {
    reportError(error);
  }
});
document.addEventListener('change', ev => {
  if (!packOpen) return;
  const t = ev.target;
  if (t.dataset.packSetting) {
    savePack({ settings: { [t.dataset.packSetting]: t.checked } });
    renderPack();
  } else if (t.dataset.packTickLarge) {
    const off = new Set(packOf().off ?? defaultOff());
    t.checked ? off.delete(t.dataset.packTickLarge) : off.add(t.dataset.packTickLarge);
    savePack({ off: [...off] });
    renderPack();
  }
});
// Drag pages into order in the list.
let packDrag = null;
document.addEventListener('dragstart', ev => {
  const item = ev.target.closest?.('[data-pack-item]');
  if (!item) return;
  packDrag = item.dataset.packItem;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', packDrag);
});
document.addEventListener('dragover', ev => {
  if (packDrag && ev.target.closest?.('[data-pack-item]')) ev.preventDefault();
});
document.addEventListener('drop', ev => {
  const target = ev.target.closest?.('[data-pack-item]');
  if (!packDrag || !target) return;
  ev.preventDefault();
  const ids = packQueue()
      .map(pg => pg.id)
      .filter(id => id !== packDrag),
    r = target.getBoundingClientRect(),
    at = ids.indexOf(target.dataset.packItem) + (ev.clientY > r.top + r.height / 2 ? 1 : 0);
  ids.splice(at < 0 ? ids.length : at, 0, packDrag);
  packDrag = null;
  packSetOrder(ids);
});
document.addEventListener('dragend', () => (packDrag = null));
document.addEventListener(
  'keydown',
  ev => {
    if (!packOpen || $('#dialog').open) return;
    if (ev.key === 'Escape' && packLarge) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      packLarge = null;
      renderPack();
    } else if (
      packLarge &&
      ['ArrowLeft', 'ArrowRight'].includes(ev.key) &&
      !ev.target.closest?.('input,select,textarea')
    ) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      document.querySelector(`[data-pack-step="${ev.key === 'ArrowLeft' ? -1 : 1}"]`)?.click();
    }
  },
  true
);
addEventListener('resize', () => packLarge && renderPack());
