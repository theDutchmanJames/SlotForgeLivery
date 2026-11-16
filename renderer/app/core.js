// Livery renderer · Toasts, view/layer accessors, undo, saving, project and tool switching.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
// Messages stay long enough to read (about 2–7 s by length) and clear when
// the user moves to another section or project. They never block clicks.
function toast(message) {
  message = String(message);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, Math.min(7000, 1800 + message.length * 45));
}
function hideToast() {
  clearTimeout(toast.timer);
  $('#toast').classList.remove('show');
}
function reportError(error) {
  console.error(error);
  toast(error.message || String(error));
}
function activeView() {
  return project?.template.views[currentView];
}
function layers() {
  return project?.views[currentView] || [];
}
function selection() {
  if (multiSelected.size > 1 && multiSelected.has(selected)) return;
  return layers().find(l => l.id === selected);
}
function region() {
  return activeView()?.regions.find(r => r.id === selectedRegion);
}
function snapshot() {
  return M.clone(project);
}
function record() {
  if (project) {
    undo.push(snapshot());
    while (undo.length > undoLimit()) undo.shift();
    redo = [];
  }
}
function changed() {
  if (project) {
    project.updated = new Date().toISOString();
    const i = store.projects.findIndex(p => p.id === project.id);
    if (i >= 0) store.projects[i] = project;
    else store.projects.push(project);
    store.current = project.id;
  }
  scheduleSave();
}
function scheduleSave() {
  clearTimeout(saveTimer);
  if (loadBlocked) {
    $('#save-status').textContent = '● Recovery required — saving paused';
    return;
  }
  $('#save-status').textContent = '● Saving…';
  saveTimer = setTimeout(() => flushSave().catch(() => {}), 350);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (loadBlocked) return;
  savePromise = savePromise
    .catch(() => {})
    .then(async () => {
      try {
        if (window.desktop) await libraryClient.save(store, { keepLoaded: $('#dialog').open });
        else localStorage.setItem('slotforge-paintshop-v1', JSON.stringify(store));
        $('#save-status').textContent = '● Saved on this computer';
      } catch (error) {
        $('#save-status').textContent = '● Save failed — export a backup';
        reportError(error);
        throw error;
      }
    });
  return savePromise;
}
function needsPreparation(view) {
  return !!view && !view.regions.some(r => r.role === 'body');
}
function setProject(p) {
  hideToast();
  project = p;
  store.current = p.id;
  currentView = Object.keys(p.template.views)[0] || 'left';
  selected = null;
  selectedRegion = null;
  preparing = needsPreparation(p.template.views[currentView]);
  drawPoints = [];
  undo = [];
  redo = [];
  defaultPaintSelection();
  fit();
  changed();
  render();
}
function fit() {
  viewBox = { x: 0, y: 0, w: 1000, h: 600 };
  renderCanvas();
}
function setTool(t) {
  if (!project && t !== 'select') return toast('Add your own car first.');
  if (['rect', 'ellipse', 'polygon', 'line'].includes(t)) {
    if (!activeView()?.regions.some(r => r.role === 'body'))
      return toast('Label a paintable area before drawing artwork.');
    preparing = false;
  }
  if (drawPoints.length) toast('Unfinished outline discarded.');
  drawPoints = [];
  penCursor = null;
  closeSnap = false;
  selectedNode = null;
  tool = t;
  if (t === 'line') {
    lineSettings.fill = colour;
    selected = null;
    selectedPaint = null;
    multiSelected.clear();
  }
  if (t === 'polygon') {
    selected = null;
    selectedPaint = null;
    multiSelected.clear();
  }
  renderTools();
  renderCanvas();
  renderInspector();
}
