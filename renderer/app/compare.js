// Livery renderer · A second view of the car next to the canvas.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
// The pane shows another prepared view, live, so stripes and numbers can be
// lined up across sides. It is read-only; click its title to edit that view.
function compareChoices() {
  return project ? M.VIEWS.filter(k => k !== currentView && project.template.views[k]) : [];
}
function compareView() {
  const choices = compareChoices(),
    saved = store.settings?.compareView;
  if (choices.includes(saved)) return saved;
  const opposite = { left: 'right', right: 'left', front: 'rear', rear: 'front' }[currentView];
  return choices.includes(opposite) ? opposite : choices[0] || null;
}
function renderCompare() {
  const pane = $('#compare-pane'),
    on = store.settings?.compareOn === true && !!project && !!activeView() && !preparing;
  $('#compare').checked = store.settings?.compareOn === true;
  pane.hidden = !on;
  $('.canvas-row').classList.toggle('comparing', on);
  if (!on) return;
  const key = compareView();
  if (!key) {
    pane.innerHTML = `<div class="compare-empty"><strong>No other view yet</strong><p class="note">Add another angle below to see it here, side by side.</p></div>`;
    return;
  }
  pane.innerHTML = `<div class="compare-head"><select id="compare-view" aria-label="View shown side by side">${compareChoices()
    .map(k => `<option value="${k}" ${k === key ? 'selected' : ''}>${M.LABELS[k]} view</option>`)
    .join(
      ''
    )}</select><button data-view="${key}" title="Edit the ${M.LABELS[key]} view">Edit</button></div><div class="compare-art">${V.standalone(project, key, 'compare-' + key, { preview: true, live: true, effects: store.settings?.paintPreview !== false })}</div>`;
}
document.addEventListener('change', ev => {
  if (ev.target.id === 'compare') {
    setPreference('compareOn', ev.target.checked);
    renderCompare();
  } else if (ev.target.id === 'compare-view') {
    setPreference('compareView', ev.target.value);
    renderCompare();
  }
});
