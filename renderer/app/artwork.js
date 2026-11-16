// Livery renderer · Artwork selection, grouping, scaling, fonts and asset previews.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function moveArtwork(originals, dx, dy) {
  const ids = new Set(originals.map(l => l.id));
  for (const original of originals) {
    const l = layers().find(l => l.id === original.id);
    if (!l) continue;
    const complete =
        original.groupId &&
        layers()
          .filter(a => a.groupId === original.groupId)
          .every(a => ids.has(a.id)),
      copy = M.clone(original);
    M.translateLayer(copy, dx, dy, !!complete);
    l.x = copy.x;
    l.y = copy.y;
    if (copy.groupPose) l.groupPose = copy.groupPose;
  }
}
function artworkSelection() {
  if (selected?.startsWith('group:')) return layers().filter(l => l.groupId === selected.slice(6));
  if (multiSelected.size > 1 && multiSelected.has(selected)) return layers().filter(l => multiSelected.has(l.id));
  return layers().filter(l => l.id === selected);
}
function chooseArtwork(key, add = false) {
  selectedNode = null;
  const items = key?.startsWith('group:')
    ? layers().filter(l => l.groupId === key.slice(6))
    : layers().filter(l => l.id === key);
  if (add) {
    const ids = new Set(artworkSelection().map(l => l.id)),
      remove = items.every(l => ids.has(l.id));
    items.forEach(l => (remove ? ids.delete(l.id) : ids.add(l.id)));
    multiSelected.clear();
    ids.forEach(id => multiSelected.add(id));
    selected = [...ids][0] || null;
  } else {
    multiSelected.clear();
    selected = key;
  }
  selectedPaint = null;
  tool = 'select';
}
function artworkRows() {
  const chosen = new Set(artworkSelection().map(l => l.id)),
    seen = new Set();
  const row = (l, child = false) =>
    `<div class="layer-row ${child ? 'artwork-child' : ''} ${chosen.has(l.id) ? 'active' : ''}" draggable="true" data-sort-key="${l.id}" data-sort-parent="${child ? l.groupId : ''}"><span class="layer-grip" aria-hidden="true">⠿</span><button data-visible="${l.id}" aria-label="Toggle ${e(l.name)}" style="opacity:${l.visible !== false ? 1 : 0.35}">${icon('eye')}</button><button class="layer-name" data-select-layer="${l.id}">${e(l.name)}</button><button class="layer-lock ${l.locked ? 'on' : ''}" data-lock-layer="${l.id}" aria-pressed="${!!l.locked}" aria-label="${l.locked ? 'Unlock' : 'Lock'} ${e(l.name)}" title="${l.locked ? 'Locked: click to unlock' : 'Lock so it cannot be moved on the canvas'}">${icon('lock')}</button></div>`;
  return [...layers()]
    .reverse()
    .map(l => {
      if (!l.groupId) return row(l);
      if (seen.has(l.groupId)) return '';
      seen.add(l.groupId);
      const members = layers().filter(a => a.groupId === l.groupId),
        open = expandedArtworkGroups.has(l.groupId);
      return `<div class="layer-row ${members.every(a => chosen.has(a.id)) ? 'active' : ''}" draggable="true" data-sort-key="group:${l.groupId}" data-sort-parent=""><span class="layer-grip" aria-hidden="true">⠿</span><button data-art-expand="${l.groupId}" aria-label="${open ? 'Collapse' : 'Expand'} ${e(l.groupName)}">${open ? '▾' : '▸'}</button><button data-art-group-visible="${l.groupId}" aria-label="Toggle ${e(l.groupName)}" style="opacity:${l.groupHidden ? 0.35 : 1}">${icon('eye')}</button><button class="layer-name" data-art-group="${l.groupId}">${icon('folder')}${e(l.groupName || 'Grouped artwork')} <small>${members.length}</small></button></div>${
        open
          ? [...members]
              .reverse()
              .map(a => row(a, true))
              .join('')
          : ''
      }`;
    })
    .join('');
}
// Copy every layer of this side onto the opposite side, mirrored and fitted
// to that side's bodywork. Groups stay groups.
const OPPOSITE_SIDE = { left: 'right', right: 'left' };
function mirrorWholeSide() {
  const target = OPPOSITE_SIDE[currentView],
    source = layers();
  if (!target) return toast('Mirroring works between the left and right views.');
  if (!project.template.views[target])
    return toast(`Add the ${M.LABELS[target]} view first, then mirror this side onto it.`);
  if (!source.length) return toast('This side has no artwork to mirror yet.');
  const existing = project.views[target]?.length || 0;
  openDialog(
    `Mirror to the ${M.LABELS[target]} view`,
    'Every layer is mirrored and fitted to the other side. Check the result against its panels.',
    `<p>${source.length} layer${source.length === 1 ? '' : 's'} from the ${M.LABELS[currentView]} view.</p>${existing ? `<label class="checkbox-line"><input id="mirror-replace" type="checkbox" checked>Replace the ${existing} existing layer${existing === 1 ? '' : 's'} on the ${M.LABELS[target]} view</label>` : ''}<p class="note">Text, images and decals stay readable; shapes, stripes and fitting are mirrored.</p>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="mirror-apply">Mirror artwork</button>`
  );
  $('#mirror-apply').onclick = () => {
    const replace = $('#mirror-replace')?.checked !== false,
      mirrored = M.mirrorView(source, activeView().bounds, project.template.views[target].bounds);
    closeDialog();
    mutate(() => {
      project.views[target] = replace ? mirrored : [...(project.views[target] || []), ...mirrored];
      currentView = target;
      selected = null;
      multiSelected.clear();
    });
    toast(`Mirrored ${mirrored.length} layer${mirrored.length === 1 ? '' : 's'} to the ${M.LABELS[target]} view.`);
  };
}
// Alignment works on units: a fully selected group moves as one block.
function alignmentUnits() {
  const items = artworkSelection(),
    ids = new Set(items.map(l => l.id)),
    units = new Map();
  for (const l of items) {
    const complete =
        l.groupId &&
        layers()
          .filter(a => a.groupId === l.groupId)
          .every(a => ids.has(a.id)),
      key = complete ? 'group:' + l.groupId : l.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(l);
  }
  return [...units.values()];
}
function alignArtwork(mode) {
  const units = alignmentUnits();
  if (!units.length) return;
  if (units.flat().some(l => l.locked)) return toast('Unlock the selected layers to align them.');
  if ((mode === 'across' || mode === 'down') && units.length < 3)
    return toast('Select at least three items to space them evenly.');
  const boxes = units.map(u => M.artworkBounds(u)),
    target = units.length > 1 ? M.artworkBounds(units.flat()) : activeView().bounds,
    moves = M.alignmentMoves(boxes, mode, target);
  mutate(() => units.forEach((u, i) => moveArtwork(M.clone(u), moves[i].dx, moves[i].dy)));
}
function alignFields(count) {
  const modes = [
    ['left', 'Left'],
    ['centre', 'Centre'],
    ['right', 'Right'],
    ['top', 'Top'],
    ['middle', 'Middle'],
    ['bottom', 'Bottom']
  ];
  return `<div class="align-controls"><div class="align-grid">${modes.map(([mode, label]) => `<button data-align="${mode}" title="Align ${label.toLowerCase()}">${label}</button>`).join('')}</div>${count >= 3 ? '<div class="row"><button data-align="across">Space across</button><button data-align="down">Space down</button></div>' : ''}<p class="note">${count > 1 ? 'Aligns the selected items with each other.' : 'Aligns to the car body. Select several items to align them with each other.'}</p></div>`;
}
function renderMultiArtwork(box) {
  const items = artworkSelection(),
    group = selected?.startsWith('group:'),
    b = M.artworkBounds(items),
    name = group ? items[0].groupName : `${items.length} shapes selected`;
  box.innerHTML = `<div class="heading"><span class="section-icon">${icon('folder')}</span><div><strong>${e(name)}</strong><small>${items.length} separate editable elements</small></div></div>${group ? fitFields() : ''}<p class="note">Drag the selection to move it together. Expand a group in Layers to edit its individual elements.</p>${group ? `<div class="field"><label for="art-group-name">Group name</label><input id="art-group-name" value="${e(name)}"></div>` : ''}${items.some(l => !['image', 'vector'].includes(l.kind)) ? `${fillFields(currentPaint())}<div class="field"><label>Base colour · selected shapes</label>${colourField(currentPaint().fill)}</div>${finishFields(currentPaint())}` : ''}<details class="inspector-folder" open><summary>Align & distribute</summary>${alignFields(alignmentUnits().length)}</details><details class="inspector-folder" open><summary>Scale selection</summary><div class="row"><div class="field"><label for="group-width">Width</label><input id="group-width" type="number" min="2" value="${Number(b.w.toFixed(2))}"></div><div class="field"><label for="group-height">Height</label><input id="group-height" type="number" min="2" value="${Number(b.h.toFixed(2))}"></div></div><div class="row"><input id="group-scale" type="number" min="1" max="10000" value="100" aria-label="Scale percent"><span>%</span><button data-action="scale-artwork">Apply</button></div><p class="note">Proportions stay linked. Drag the selection’s corner to resize all elements together.</p></details><div class="row"><button data-action="${group ? 'ungroup-artwork' : 'group-artwork'}">${group ? 'Ungroup' : 'Group selection'}</button><button data-action="duplicate">${icon('copy')}Duplicate</button></div><button class="wide primary" style="margin-top:10px" data-action="save-asset">${icon('folder')}Add to Library</button><p class="note" style="margin-top:8px">The library copy keeps each shape, colour, rotation and position separately.</p><div class="separator"></div><h3>Layers · ${M.LABELS[currentView]} view</h3><div class="layer-list"><div class="layer-row locked">${icon('lock')}Body details</div>${artworkRows()}${paintLayerRows()}<div class="layer-row"><button data-action="base" class="layer-name">Base paint</button></div></div><div class="layer-actions"><button data-action="delete">${icon('trash')}Delete selection</button><button data-action="save-asset">Add to Library</button></div><p class="note">Shift-click layers or shapes to select several.</p>`;
  dockInspector();
}
function replaceScaledArtwork(copies) {
  const byId = new Map(copies.map(l => [l.id, l]));
  project.views[currentView] = layers().map(l => byId.get(l.id) || l);
}
function scaleSelectedArtwork(factor) {
  const copies = M.scaleArtwork(artworkSelection(), factor);
  mutate(() => replaceScaledArtwork(copies));
}
function stripGroup(l) {
  M.bakeGroupPose(l);
  delete l.groupId;
  delete l.groupName;
  delete l.groupHidden;
  return l;
}
function saveArtworkAsset() {
  const items = artworkSelection();
  if (!items.length) return;
  const grouped = items.length > 1 || selected?.startsWith('group:'),
    copies = M.clone(items);
  askName('Add to Library', grouped ? items[0].groupName || 'Grouped artwork' : items[0].name, n => {
    store.assets.push(
      grouped ? M.groupAsset(copies, n) : { id: M.uid(), name: n, type: 'shape', layer: stripGroup(copies[0]) }
    );
    scheduleSave();
    toast('Added an independent copy to your library.');
  });
}
function groupArtwork() {
  const items = artworkSelection();
  if (items.length < 2) return;
  const ids = items.map(l => l.id);
  askName('Group selection', 'Grouped artwork', name =>
    mutate(() => {
      const groupId = M.uid();
      layers()
        .filter(l => ids.includes(l.id))
        .forEach(l => {
          M.bakeGroupPose(l);
          l.groupId = groupId;
          l.groupName = name;
          l.groupHidden = false;
        });
      const list = layers(),
        last = list.findLastIndex(l => l.groupId === groupId),
        members = list.filter(l => l.groupId === groupId),
        index = list.slice(0, last + 1).filter(l => l.groupId !== groupId).length,
        rest = list.filter(l => l.groupId !== groupId);
      rest.splice(index, 0, ...members);
      project.views[currentView] = rest;
      chooseArtwork('group:' + groupId);
    })
  );
}
function ungroupArtwork() {
  const items = artworkSelection();
  if (!items.length) return;
  mutate(() => {
    items.forEach(stripGroup);
    multiSelected.clear();
    items.forEach(l => multiSelected.add(l.id));
    selected = items[0].id;
  });
}
function duplicateArtwork() {
  const items = artworkSelection();
  if (!items.length) return;
  const grouped = selected?.startsWith('group:'),
    groups = new Map();
  mutate(() => {
    const copies = items.map(l => {
      const copy = M.clone(l);
      copy.id = M.uid();
      M.translateLayer(copy, 15, 15, true);
      copy.name += ' copy';
      if (copy.groupId) {
        if (!groups.has(copy.groupId)) groups.set(copy.groupId, M.uid());
        copy.groupId = groups.get(copy.groupId);
      }
      return copy;
    });
    layers().push(...copies);
    multiSelected.clear();
    if (grouped) selected = 'group:' + copies[0].groupId;
    else {
      copies.forEach(l => multiSelected.add(l.id));
      selected = copies[0].id;
    }
  });
}
function fontOptions(layer) {
  const fonts = [...(store.fonts || [])];
  if (layer.fontData && !fonts.some(f => f.fontData.family === layer.fontData.family))
    fonts.push({ name: layer.fontData.name, fontData: layer.fontData });
  return (
    `<optgroup label="Built-in">${M.BUILTIN_FONTS.map(f => `<option value="${e(f)}" ${layer.font === f && !layer.fontData ? 'selected' : ''}>${e(f)}</option>`).join('')}</optgroup>` +
    (fonts.length
      ? `<optgroup label="My fonts">${fonts.map(f => `<option value="${f.fontData.family}" ${layer.fontData?.family === f.fontData.family ? 'selected' : ''}>${e(f.name)}</option>`).join('')}</optgroup>`
      : '')
  );
}
function fontPreview(item) {
  return `<div style="font-family:'${item.fontData.family}';font-size:42px;font-weight:normal">Aa 27</div>`;
}
function useFont(item) {
  const data = { ...M.clone(item.fontData), name: item.name },
    l = selection();
  if (l?.kind === 'text')
    mutate(() => {
      l.font = data.family;
      l.fontData = data;
    });
  else if (project && activeView()?.regions.some(r => r.role === 'body'))
    addLayer(
      M.layer('text', {
        name: item.name + ' text',
        text: '27',
        font: data.family,
        fontData: data,
        w: 120,
        h: 80,
        fill: colour
      })
    );
  else toast('This font is ready in the text typeface menu. Open a prepared car to use it.');
}
async function importFonts(files) {
  const owner = project?.id,
    layerId = selection()?.kind === 'text' ? selection().id : null,
    libraryContext = $('#dialog').open ? $('#library-items') : null,
    fromLibrary = !!libraryContext;
  const candidates = [];
  for (const file of files) candidates.push(await FontLibrary.importFile(file));
  const imported = [];
  for (const fontData of candidates) {
    let item = store.fonts.find(f => f.fontData.family === fontData.family);
    if (!item) {
      item = { id: M.uid(), name: fontData.name, fontData, updated: new Date().toISOString() };
      store.fonts.push(item);
    }
    if (libraryClient.isLazy(item)) item = await libraryClient.hydrate(store, 'fonts', item.id);
    imported.push(item);
  }
  scheduleSave();
  if (imported.length === 1 && owner === project?.id && layerId === selection()?.id && layerId && !fromLibrary)
    useFont(imported[0]);
  if (fromLibrary && libraryContext.isConnected && $('#dialog').open) openLibrary('fonts');
  else render();
  toast(imported.length === 1 ? 'Font ready in My fonts.' : imported.length + ' fonts ready in My fonts.');
}
function assetPreview(a) {
  if (a.type === 'image') return `<img src="${e(a.src)}" alt="">`;
  const items = a.type === 'group' ? a.layers : [a.layer],
    b = M.artworkBounds(items),
    pad = Math.max(b.w, b.h) * 0.08;
  return `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}">${items.map(l => V.layerMarkup(l, false, { preview: true })).join('')}</svg>`;
}
