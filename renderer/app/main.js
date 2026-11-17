// Livery renderer · Keyboard shortcuts, close handling and startup.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
document.addEventListener('keydown', ev => {
  if (settingsOpen || ev.target.matches('input,textarea,select') || $('#dialog').open) return;
  const mod = ev.ctrlKey || ev.metaKey,
    k = ev.key.toLowerCase();
  if (mod && k === 's') {
    ev.preventDefault();
    flushSave()
      .then(() => toast('Project saved.'))
      .catch(() => {});
    return;
  }
  if (mod && k === 'z') {
    ev.preventDefault();
    actions[ev.shiftKey ? 'redo' : 'undo']();
    return;
  }
  if (mod && k === 'y') {
    ev.preventDefault();
    actions.redo();
    return;
  }
  if (mod && k === 'd') {
    ev.preventDefault();
    actions.duplicate();
    return;
  }
  if (k === 'escape' && tool === 'line' && drawPoints.length >= 2 && !preparing) {
    ev.preventDefault();
    drag = null;
    finishDrawing();
    return;
  }
  if (k === 'escape' && colourPick) {
    colourPick = null;
    toast('Colour picking cancelled.');
    return;
  }
  if (k === 'escape') {
    if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
    drag = null;
    penCursor = null;
    closeSnap = false;
    drawPoints = [];
    selected = null;
    selectedPaint = null;
    selectedRegion = null;
    multiSelected.clear();
    render();
    return;
  }
  if (k === 'enter' && drawPoints.length) {
    ev.preventDefault();
    finishDrawing();
    return;
  }
  if (k === 'backspace' && drawPoints.length) {
    ev.preventDefault();
    drawPoints.pop();
    penCursor = null;
    closeSnap = false;
    renderCanvas();
    renderInspector();
    return;
  }
  if (k === 'delete' || k === 'backspace') {
    ev.preventDefault();
    if (preparing) actions['delete-region']();
    else actions.delete();
    return;
  }
  if (artworkSelection().length && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    ev.preventDefault();
    if (artworkSelection().some(l => l.locked)) return toast('Unlock the layer to move it.');
    const step = ev.shiftKey ? 10 : 1;
    mutate(() =>
      moveArtwork(
        M.clone(artworkSelection()),
        k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0,
        k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0
      )
    );
    return;
  }

  if (!mod) {
    const map = { v: 'select', a: 'nodes', b: 'paint', r: 'rect', e: 'ellipse', p: 'polygon', l: 'line', h: 'hand' };
    if (map[k]) {
      setTool(map[k]);
    }
    if (k === 't' && project && !preparing)
      addLayer(M.layer('text', { text: '27', font: 'Arial', w: 90, h: 75, fill: colour }));
    if (k === 'i') $('#image-file').click();
  }
});
window.addEventListener('beforeunload', () => {
  if (!window.desktop && !loadBlocked)
    try {
      localStorage.setItem('slotforge-paintshop-v1', JSON.stringify(store));
    } catch {}
});
window.desktop?.onClosing(async () => {
  try {
    await flushSave();
    window.desktop.closeReady();
  } catch {
    openDialog(
      'Your changes could not be saved',
      'Export a library backup before closing.',
      `<button class="primary" data-action="export-all">Export backup</button><p class="note" style="margin-top:15px">The previous saved library remains on disk.</p>`,
      `<button data-action="close-dialog">Keep editing</button><button id="close-anyway">Close without latest changes</button>`
    );
    $('#close-anyway').onclick = () => window.desktop.closeReady();
  }
});
async function init() {
  fillIcons();
  document.body.inert = true;
  const welcomeTitle = $('#welcome h1'),
    welcomeText = $('#welcome p'),
    title = welcomeTitle.textContent,
    text = welcomeText.innerHTML;
  welcomeTitle.textContent = 'Opening your library…';
  welcomeText.textContent = 'Preparing your saved designs. Existing libraries are verified before migration.';
  try {
    const result = window.desktop
      ? await window.desktop.load()
      : { data: JSON.parse(localStorage.getItem('slotforge-paintshop-v1') || 'null') };
    if (result.error) {
      loadBlocked = true;
      toast(result.error);
    }
    if (result.data) {
      if (
        result.data.schema !== 1 ||
        !['templates', 'liveries', 'assets', 'projects'].every(k => Array.isArray(result.data[k]))
      )
        throw new Error('Unsupported saved library. Exported backups can be restored from Import & Export.');
      store = libraryClient.accept(result);
      store.fonts ||= [];
      if (!Array.isArray(store.fonts)) throw new Error('Invalid saved font library.');
      project = store.current ? await libraryClient.hydrate(store, 'projects', store.current) : null;
      project ||= null;
      await FontLibrary.loadAll(project);
      currentView = (project ? Object.keys(project.template.views)[0] : null) || 'left';
      preparing = needsPreparation(activeView());
    }
    defaultPaintSelection();
    if (result.warning) toast(result.warning);
    applyStartupPreferences();
    applyTheme();
    render();
  } catch (error) {
    // Keep malformed local data on disk, but never try rendering it again in recovery.
    loadBlocked = true;
    store = M.emptyStore();
    project = null;
    selected = null;
    selectedPaint = null;
    applyTheme();
    render();
    reportError(error);
  }
  welcomeTitle.textContent = title;
  welcomeText.innerHTML = text;
  document.body.inert = false;
  if (loadBlocked) {
    $('#save-status').textContent = '● Recovery required — saving paused';
    openDialog(
      'Library recovery required',
      'The existing saved files have not been overwritten.',
      `<p>Your library could not be read safely. Saving is paused. Use Import &amp; Export to import a known-good backup; it will be saved before normal editing resumes.</p><p class="note">The existing files will be preserved alongside the restored library.</p>`
    );
  }
}
init()
  .then(() => {
    window.desktop?.ready?.();
    startMaintenance();
  })
  .catch(reportError);
