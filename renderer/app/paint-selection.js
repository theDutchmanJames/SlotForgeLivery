// Livery renderer · Paintable label groups and paint selection.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const expandedPaintGroups = new Set();
function paintGroups() {
  const groups = new Map();
  for (const r of activeView()?.regions || []) {
    if (r.role !== 'body') continue;
    const name = r.partLabel || 'Unlabelled';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }
  return [...groups].sort((a, b) => {
    const order = n => (M.PART_LABELS.includes(n) ? M.PART_LABELS.indexOf(n) : 999);
    return order(a[0]) - order(b[0]);
  });
}
function paintRegions(key = selectedPaint) {
  if (!key) return [];
  const all = (activeView()?.regions || []).filter(r => r.role === 'body');
  return key === 'multi'
    ? all.filter(r => multiPaintSelected.has(r.id))
    : key.startsWith('g:')
      ? all.filter(r => (r.partLabel || 'Unlabelled') === key.slice(2))
      : all.filter(r => r.id === key.slice(2));
}
function paintSelectionName() {
  const parts = paintRegions();
  return selectedPaint === 'multi'
    ? parts.length + ' areas selected'
    : selectedPaint?.startsWith('g:')
      ? selectedPaint.slice(2)
      : parts[0]?.name || 'Base paint';
}
function selectPaint(key, add = false) {
  if (add) {
    const ids = new Set(selected ? [] : paintRegions().map(r => r.id)),
      items = paintRegions(key),
      remove = items.length && items.every(r => ids.has(r.id));
    items.forEach(r => (remove ? ids.delete(r.id) : ids.add(r.id)));
    multiPaintSelected.clear();
    ids.forEach(id => multiPaintSelected.add(id));
    selectedPaint = ids.size > 1 ? 'multi' : ids.size ? 'r:' + ids.values().next().value : null;
  } else {
    multiPaintSelected.clear();
    selectedPaint = key;
  }
  selected = null;
  selectedNode = null;
  multiSelected.clear();
  tool = 'select';
  render();
}
function defaultPaintSelection() {
  multiPaintSelected.clear();
  selectedPaint = paintGroups().find(([name]) => name !== 'Unlabelled')?.[0];
  selectedPaint = selectedPaint ? 'g:' + selectedPaint : null;
}
function paintLayerRows() {
  const chosen = new Set(selected ? [] : paintRegions().map(r => r.id));
  return paintGroups()
    .map(([name, regions]) => {
      const key = 'g:' + name,
        open = expandedPaintGroups.has(name),
        visible = regions.some(r => r.paintVisible !== false),
        colours = [...new Set(regions.map(r => paintChip(M.paintOf(project, r))))],
        chip = colours.length === 1 ? colours[0] : 'repeating-linear-gradient(135deg,#96a3b0 0 4px,#e5484d 4px 8px)';
      return `<div class="layer-row paint-group ${regions.every(r => chosen.has(r.id)) ? 'active' : ''}"><button data-paint-expand="${e(name)}" aria-label="${open ? 'Collapse' : 'Expand'} ${e(name)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button><button data-paint-visible="${e(key)}" aria-label="${visible ? 'Hide' : 'Show'} paint on ${e(name)}" style="opacity:${visible ? 1 : 0.35}">${icon('eye')}</button><button class="layer-name" data-paint-select="${e(key)}"><span class="paint-chip" style="background:${chip}"></span><span>${e(name)}</span><small>${regions.length}</small></button></div>${open ? regions.map((r, i) => `<div class="layer-row paint-child ${chosen.has(r.id) ? 'active' : ''}"><button data-paint-visible="r:${r.id}" aria-label="Toggle paint on ${e(r.name)}" style="opacity:${r.paintVisible !== false ? 1 : 0.35}">${icon('eye')}</button><button class="layer-name" data-paint-select="r:${r.id}"><span class="paint-chip" style="background:${paintChip(M.paintOf(project, r))}"></span><span>${e(r.name || 'Area ' + (i + 1))}</span></button></div>`).join('') : ''}`;
    })
    .join('');
}
