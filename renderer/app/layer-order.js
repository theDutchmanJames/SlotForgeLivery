// Livery renderer · Layer reordering and drag-and-drop in the Layers list.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function orderScope() {
  const items = artworkSelection();
  return !selected?.startsWith('group:') &&
    items.length &&
    items[0].groupId &&
    items.every(l => l.groupId === items[0].groupId) &&
    items.length < layers().filter(l => l.groupId === items[0].groupId).length
    ? items[0].groupId
    : null;
}
function reordered(action, target = null, side = 'above', scope = orderScope()) {
  return M.reorderArtwork(
    layers(),
    artworkSelection().map(l => l.id),
    action,
    target,
    side,
    scope
  );
}
function commitOrder(next) {
  if (next.every((l, i) => l.id === layers()[i]?.id)) return;
  const scroll = $('#inspector .layer-list')?.scrollTop || 0;
  mutate(() => (project.views[currentView] = next));
  const list = $('#inspector .layer-list');
  if (list) list.scrollTop = scroll;
}
function reorder(action) {
  commitOrder(reordered(action));
}
function orderButtons() {
  if (!artworkSelection().length) return '';
  return `<div class="order-buttons">${[
    ['layer-front', 'front', 'Bring to front'],
    ['layer-back', 'back', 'Send to back'],
    ['layer-up', 'forward', 'Bring forward'],
    ['layer-down', 'backward', 'Send backward']
  ]
    .map(
      ([action, key, label]) =>
        `<button data-action="${action}" ${reordered(key).every((l, i) => l.id === layers()[i].id) ? 'disabled' : ''} title="${label}${orderScope() ? ' within this group' : ''}">${icon(key === 'front' || key === 'forward' ? 'up' : 'down')}${label}</button>`
    )
    .join('')}</div>`;
}
let layerDrag = null;
function clearLayerDrop() {
  document
    .querySelectorAll('.layer-drop-above,.layer-drop-below,.layer-dragging')
    .forEach(n => n.classList.remove('layer-drop-above', 'layer-drop-below', 'layer-dragging'));
}
document.addEventListener('dragstart', ev => {
  const row = ev.target.closest('[data-sort-key]');
  if (!row || !project) return;
  const key = row.dataset.sortKey,
    scope = row.dataset.sortParent || null,
    items = artworkSelection(),
    ids = key.startsWith('group:')
      ? layers()
          .filter(l => l.groupId === key.slice(6))
          .map(l => l.id)
      : [key];
  if (!ids.every(id => items.some(l => l.id === id)) || (scope && items.some(l => l.groupId !== scope)))
    chooseArtwork(key);
  layerDrag = { scope, ids: artworkSelection().map(l => l.id), projectId: project.id, view: currentView };
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', key);
  row.classList.add('layer-dragging');
});
document.addEventListener('dragover', ev => {
  if (!layerDrag) return;
  document
    .querySelectorAll('.layer-drop-above,.layer-drop-below')
    .forEach(n => n.classList.remove('layer-drop-above', 'layer-drop-below'));
  const row = ev.target.closest('[data-sort-key]');
  if (!row || (row.dataset.sortParent || null) !== layerDrag.scope) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  const b = row.getBoundingClientRect(),
    side = ev.clientY < b.y + b.height / 2 ? 'above' : 'below';
  row.classList.add('layer-drop-' + side);
});
document.addEventListener('drop', ev => {
  if (!layerDrag) return;
  ev.preventDefault();
  const row = ev.target.closest('[data-sort-key]'),
    state = layerDrag;
  layerDrag = null;
  const side = row?.classList.contains('layer-drop-above') ? 'above' : 'below';
  clearLayerDrop();
  if (
    !row ||
    project?.id !== state.projectId ||
    currentView !== state.view ||
    (row.dataset.sortParent || null) !== state.scope
  )
    return;
  commitOrder(M.reorderArtwork(layers(), state.ids, 'drop', row.dataset.sortKey, side, state.scope));
  renderInspector();
});
document.addEventListener('dragend', () => {
  layerDrag = null;
  clearLayerDrop();
  render();
});
