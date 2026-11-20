// Livery renderer · The Workbench layout of the Paint Studio: the menus in the
// top bar, the Layers column on the left, the Selection and Workshop tabs of the
// inspector, the quick bar over a selection and the right-click menu.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
let layersPlaced = false,
  inspectorTab = 'selection',
  lastSelectionKey = null;

// ------------------------------------------------------------------ Menus
// A menu is a .pop-menu with data-opener naming its button. The right-click
// menu is built on demand as #context-menu.
function closeMenus() {
  for (const menu of document.querySelectorAll('.pop-menu:not([hidden])')) {
    if (menu.id === 'context-menu') continue;
    menu.hidden = true;
    document.querySelector(menu.dataset.opener)?.setAttribute('aria-expanded', 'false');
  }
  $('#context-menu')?.remove();
}
function focusFirst(menu) {
  menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
}
function toggleMenu(id) {
  const menu = document.getElementById(id),
    open = menu.hidden;
  closeMenus();
  if (!open) return;
  menu.hidden = false;
  document.querySelector(menu.dataset.opener)?.setAttribute('aria-expanded', 'true');
  focusFirst(menu);
}
document.addEventListener('click', ev => {
  const opener = ev.target.closest('[aria-haspopup="menu"][aria-controls]');
  if (opener) {
    toggleMenu(opener.getAttribute('aria-controls'));
    return;
  }
  const item = ev.target.closest('.pop-menu button');
  // events.js registered its click listener first, so the action has run by now.
  if (item && !item.closest('.theme-switch')) closeMenus();
  else if (!ev.target.closest('.pop-menu')) closeMenus();
  const quickMore = ev.target.closest('[data-quick-more]');
  if (quickMore) {
    const r = quickMore.getBoundingClientRect();
    openContextMenu(r.left, r.bottom + 6);
  }
});
document.addEventListener(
  'keydown',
  ev => {
    const menu = ev.target.closest?.('.pop-menu') || document.querySelector('.pop-menu:not([hidden])');
    if (!menu) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const opener = document.querySelector(menu.dataset.opener || 'none');
      closeMenus();
      opener?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(ev.key) || !menu.contains(document.activeElement)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const items = [...menu.querySelectorAll('button:not([disabled])')],
      i = items.indexOf(document.activeElement);
    items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  },
  true
);
addEventListener('resize', () => {
  // Menus in the top bar stay anchored to their button; a right-click menu would be left behind.
  $('#context-menu')?.remove();
  renderQuickBar();
});
addEventListener('blur', closeMenus);

// ------------------------------------------------------- Inspector tabs
function inspectorTabsUsable() {
  return !!project && !!activeView() && !preparing;
}
function showInspectorTab(tab) {
  inspectorTab = tab;
  syncInspectorTabs();
  if (tab === 'workshop') renderWorkshop();
}
function syncInspectorTabs() {
  const usable = inspectorTabsUsable(),
    tab = usable ? inspectorTab : 'selection';
  $('.inspector-tabs').hidden = !usable;
  for (const b of document.querySelectorAll('[data-inspector-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.inspectorTab === tab));
    b.tabIndex = b.dataset.inspectorTab === tab ? 0 : -1;
  }
  $('#inspector').hidden = tab !== 'selection';
  $('#workshop-panel').hidden = tab !== 'workshop';
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-inspector-tab]');
  if (b) showInspectorTab(b.dataset.inspectorTab);
});
document.addEventListener('keydown', ev => {
  const b = ev.target.closest?.('[data-inspector-tab]');
  if (!b || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  ev.preventDefault();
  const next = b.dataset.inspectorTab === 'selection' ? 'workshop' : 'selection';
  showInspectorTab(next);
  document.querySelector(`[data-inspector-tab="${next}"]`).focus();
});
// Runs after every inspector render: the Layers column, the tabs and the Workshop tab.
function afterInspector() {
  // Choosing something new to paint brings the Selection tab forward.
  const key = [selected, selectedPaint, [...multiSelected].join()].join('|');
  if (lastSelectionKey !== null && key !== lastSelectionKey && (selected || selectedPaint)) inspectorTab = 'selection';
  lastSelectionKey = key;
  if (!layersPlaced) {
    if (project && activeView() && !preparing) placeLayers(standaloneLayers());
    else {
      $('#layers-panel').hidden = true;
      $('#layers-panel').replaceChildren();
    }
  }
  syncInspectorTabs();
  renderWorkshop();
}

// ---------------------------------------------------------- Layers column
// While a line is being drawn the inspector has no Layers part, so it is built here.
function standaloneLayers() {
  const dock = document.createElement('section');
  dock.className = 'layers-dock';
  dock.innerHTML = `<h3>Layers</h3><div class="layer-list"><div class="layer-row locked">${icon('eye')}Body details ${icon('lock')}</div>${artworkRows()}${paintLayerRows()}<div class="layer-row ${!selected && !paintRegions().length ? 'active' : ''}"><button class="layer-name" data-action="base">${icon('paint')}Base paint</button></div></div>`;
  return dock;
}
function placeLayers(dock) {
  layersPlaced = true;
  const panel = $('#layers-panel'),
    scroll = panel.querySelector('.layer-list')?.scrollTop || 0,
    team = project?.palette || [];
  const h3 = dock.querySelector('h3');
  if (h3)
    h3.outerHTML = `<div class="lp-head"><h3>Layers</h3><span class="lp-view">${M.LABELS[currentView]} view</span></div>`;
  dock
    .querySelector('.layer-list')
    ?.insertAdjacentHTML(
      'afterend',
      `<div class="lp-team"><div class="lp-group"><span>Team colours</span><span>${team.length}</span></div>${
        team.length
          ? `<div class="lp-team-list">${team.map(c => `<button class="lp-colour" data-pick-colour="${c}" data-layer-team="${c}" title="Paint the selection ${c.toUpperCase()}. Right-click to remove it from the team colours."><span class="lp-swatch" style="background:${c}"></span>${c.toUpperCase()}</button>`).join('')}</div>`
          : '<p class="note">Add colours with + beside the swatches under Colour.</p>'
      }</div>`
    );
  panel.replaceChildren(dock);
  panel.hidden = false;
  const list = panel.querySelector('.layer-list');
  if (list) list.scrollTop = scroll;
}

// -------------------------------------------------------- Workshop tab
const ORDINAL = n =>
  n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
function workshopRow(action, ic, title, text) {
  return `<button class="ws-row" data-action="${action}"><span class="ws-icon">${icon(ic)}</span><span class="ws-text"><b>${title}</b><small>${text}</small></span>${icon('chev')}</button>`;
}
function renderWorkshop() {
  const box = $('#workshop-panel');
  if (box.hidden || !project || !activeView()) return;
  const v = activeView(),
    steps = paintingSteps(),
    other = OPPOSITE_SIDE[currentView],
    views = Object.keys(project.template.views).length,
    focusId = document.activeElement?.id;
  box.innerHTML = `<div class="heading"><span class="section-icon">${icon('car')}</span><div><strong>${e(project.name)}</strong><small>${e(project.template.name)} · ${e(project.template.scale || 'Scale not set')} · ${views} ${views === 1 ? 'view' : 'views'}</small></div></div>
<section class="ws-section"><h4>Real size · ${M.LABELS[currentView]} view</h4>${realSizeFields()}<span class="ws-pill ${v.realWidthMm ? 'good' : ''}">${v.realWidthMm ? 'Sizes, rulers and true-size prints use millimetres' : 'Not set yet: true-size printing and decals need it'}</span></section>
<section class="ws-section"><h4>Both sides</h4>${other ? workshopRow('mirror-view', 'mirror', `Mirror this side to the ${M.LABELS[other]}`, `Copies every layer of the ${M.LABELS[currentView]} view, mirrored and fitted`) : `<p class="note">Mirroring works between the left and right views. To copy one layer, select it and use Copy to another view.</p>`}</section>
<section class="ws-section"><h4>Paints in this livery <span class="ws-count">${steps.length}</span></h4>${steps
    .map(
      (s, i) =>
        `<div class="ws-paint"><span class="ws-swatch" style="background:${s.colour}"></span><span class="ws-text"><b>${s.ref ? e(s.ref) : s.colour.toUpperCase()}</b><small>${ORDINAL(i + 1)}${i === 0 && steps.length > 1 ? ', lightest' : ''} · ${e(s.uses.slice(0, 2).join(', '))}${s.uses.length > 2 ? ` and ${s.uses.length - 2} more` : ''}${s.ref ? '' : ' · no paint chosen'}</small></span></div>`
    )
    .join(
      ''
    )}<p class="note">The order the workshop plan prints: lightest first. To choose a real paint, select a colour and use Choose paint… under Colour.</p></section>
<section class="ws-section"><h4>Workshop</h4>${workshopRow('notes', 'note', 'Notes', project.notes ? e(project.notes.split('\n')[0].slice(0, 70)) : 'Paint references, masking and decal notes')}${workshopRow('true-size', 'ruler', 'Print at true size', 'Masks and the design at the real size')}${workshopRow('send-decals', 'decal', 'Decals', 'Numbers and logos to SlotForge Decals')}${workshopRow('pdf', 'pdf', 'Workshop plan', 'PDF with the painting order, paints and notes')}</section>`;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
}

// ------------------------------------------------------------- Quick bar
// A small bar above the selected artwork with the most used actions.
function renderQuickBar() {
  const bar = $('#quick-bar');
  if (!bar) return;
  const items = project && activeView() && !preparing ? artworkSelection() : [];
  if (!items.length || drag || drawPoints.length || !['select', 'nodes'].includes(tool) || settingsOpen) {
    bar.hidden = true;
    return;
  }
  const one = items.length === 1 ? items[0] : null,
    paintable = items.find(l => !['image', 'vector'].includes(l.kind)),
    name = selected?.startsWith('group:') ? items[0].groupName || 'Group' : one ? one.name : items.length + ' selected',
    same = action => reordered(action).every((l, i) => l.id === layers()[i]?.id),
    html = `${paintable ? `<span class="qb-chip" style="background:${paintChip(M.paintOf(paintable))}"></span>` : ''}<span class="qb-name">${e(name)}</span><span class="qb-div"></span><button data-action="duplicate" title="Duplicate (Ctrl+D)" aria-label="Duplicate">${icon('copy')}</button><button data-action="layer-up" title="Bring forward" aria-label="Bring forward" ${same('forward') ? 'disabled' : ''}>${icon('up')}</button><button data-action="layer-down" title="Send backward" aria-label="Send backward" ${same('backward') ? 'disabled' : ''}>${icon('down')}</button>${one ? `<button data-action="copy-view" title="Copy to another view" aria-label="Copy to another view">${icon('mirror')}</button>` : ''}<button data-action="delete" title="Delete (Del)" aria-label="Delete">${icon('trash')}</button><span class="qb-div"></span><button data-quick-more title="More (or right-click the artwork)" aria-label="More actions">${icon('more')}</button>`;
  if (bar._html !== html) {
    bar.innerHTML = html;
    bar._html = html;
  }
  bar.hidden = false;
  const ctm = art.getScreenCTM();
  if (!ctm) return;
  const b = M.artworkBounds(items),
    point = (x, y) => new DOMPoint(x, y).matrixTransform(ctm),
    a = point(b.x, b.y),
    z = point(b.x + b.w, b.y + b.h),
    wrap = $('#canvas-wrap').getBoundingClientRect(),
    w = bar.offsetWidth,
    h = bar.offsetHeight;
  let x = (a.x + z.x) / 2 - wrap.left - w / 2,
    y = Math.min(a.y, z.y) - wrap.top - h - 14;
  if (y < 8) y = Math.max(a.y, z.y) - wrap.top + 14;
  x = Math.max(8, Math.min(wrap.width - w - 8, x));
  y = Math.max(8, Math.min(wrap.height - h - 8, y));
  bar.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}

// ------------------------------------------------------- Right-click menu
function openContextMenu(x, y) {
  closeMenus();
  if (!project || !activeView()) return;
  const items = artworkSelection(),
    one = items.length === 1 ? items[0] : null,
    rows = [],
    add = (attrs, ic, label, { key = '', disabled = false, danger = false } = {}) =>
      rows.push(
        `<button role="menuitem" ${attrs} ${disabled ? 'disabled' : ''} class="${danger ? 'danger' : ''}">${icon(ic)}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`
      ),
    act = name => `data-action="${name}"`;
  add(act('copy-appearance'), 'copy', 'Copy appearance', { disabled: !copyableAppearance() });
  add(act('paste-appearance'), 'paste', 'Paste appearance', { disabled: !canPasteAppearance() });
  rows.push('<hr>');
  if (items.length) {
    add(act('duplicate'), 'copy', 'Duplicate', { key: 'Ctrl D' });
    if (one) add(act('copy-view'), 'mirror', 'Copy to another view…');
    add(act('layer-front'), 'up', 'Bring to front', {
      disabled: reordered('front').every((l, i) => l.id === layers()[i]?.id)
    });
    add(act('layer-back'), 'down', 'Send to back', {
      disabled: reordered('back').every((l, i) => l.id === layers()[i]?.id)
    });
    rows.push('<hr>');
    if (one) add(`data-lock-layer="${one.id}"`, 'lock', one.locked ? 'Unlock' : 'Lock');
    add(act('save-asset'), 'folder', 'Add to library');
    rows.push('<hr>');
    add(act('delete'), 'trash', 'Delete', { key: 'Del', danger: true });
  } else {
    add(act('paint-catalogue'), 'paint', 'Choose paint…');
    add(act('shapes'), 'plus', 'Add a shape…');
    if (activeView().vectorSource) add(act('repair-template'), 'nodes', 'Edit areas & labels…');
  }
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'pop-menu context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', items.length ? 'Selected artwork' : 'Paint');
  menu.innerHTML = rows.join('');
  document.body.append(menu);
  const w = menu.offsetWidth,
    h = menu.offsetHeight;
  menu.style.left = Math.max(6, Math.min(innerWidth - w - 6, x)) + 'px';
  menu.style.top = Math.max(6, Math.min(innerHeight - h - 6, y)) + 'px';
  focusFirst(menu);
}
document.addEventListener('contextmenu', ev => {
  // A right-click that already did something (finishing a line, removing a team colour) opens no menu.
  if (ev.defaultPrevented || !project || !activeView() || preparing || drawPoints.length) return;
  const onCanvas = ev.target.closest('#artboard'),
    row = ev.target.closest('#layers-panel [data-select-layer], #layers-panel [data-art-group]');
  if (!row && (!onCanvas || !['select', 'nodes', 'paint'].includes(tool))) return;
  ev.preventDefault();
  const hitId = row ? row.dataset.selectLayer : ev.target.closest('[data-layer]')?.dataset.layer,
    hit = hitId && layers().find(l => l.id === hitId),
    group = row?.dataset.artGroup;
  if (group || hit) {
    const key = group ? 'group:' + group : hit.groupId && !ev.altKey && !row ? 'group:' + hit.groupId : hit.id,
      ids = new Set(artworkSelection().map(l => l.id)),
      wanted = group ? layers().filter(l => l.groupId === group) : [hit];
    if (!wanted.every(l => ids.has(l.id))) {
      chooseArtwork(key);
      render();
    }
  } else if (onCanvas) {
    const id = ev.target.closest('[data-paint-region]')?.dataset.paintRegion;
    if (id && selectedPaint !== 'r:' + id && !paintRegions().some(r => r.id === id)) {
      selected = null;
      selectedPaint = 'r:' + id;
      multiSelected.clear();
      render();
    } else if (!id && artworkSelection().length) {
      selected = null;
      multiSelected.clear();
      render();
    }
  }
  openContextMenu(ev.clientX, ev.clientY);
});
