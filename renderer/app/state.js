// Livery renderer · Shared globals, icons, library store, settings page and selection state.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const M = window.Model,
  V = window.Vector,
  $ = s => document.querySelector(s),
  e = M.escape;
const icons = {
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  brush:
    'M9.5 13.5 18.4 3.6a2.1 2.1 0 0 1 3 3l-9.9 8.9 M8.5 12.5l4 4 M8.5 14c-2.5-.3-3.8 1.4-3.8 3.2 0 1.3-.8 2.5-2.2 3.3 4.2 1.2 8.3.2 8.3-3.2 0-1.4-.8-2.7-2.3-3.3Z',
  line: 'M4 20L20 4 M3 17l4 4 M17 3l4 4',
  pen: 'M16 3l5 5-10 10-6 1 1-6z M14 5l5 5 M4 20l-1 1',
  car: 'M4 10l2-6h12l2 6 M3 10h18v8H3z M5 18v3 M19 18v3 M6 13h2 M16 13h2 M9 16h6',
  carplus: 'M4 10l2-6h10l2 6 M3 10h15v8H3z M5 18v3 M15 18v3 M19 3v6 M16 6h6',
  projects: 'M4 5h6l2 2h8v14H4z M4 3h14v4',
  folder: 'M3 6h6l2 2h10v12H3z',
  share: 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
  help: 'M9 8a3 3 0 116 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 11-20 0 10 10 0 0120 0',
  save: 'M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-7h10v7',
  pdf: 'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8',
  plus: 'M12 5v14 M5 12h14',
  import: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
  nodes: 'M6 5l12 3-7 11z M4 3h4v4H4z M16 6h4v4h-4z M9 17h4v4H9z',
  undo: 'M8 5l-5 5 5 5 M3 10h11a6 6 0 010 12',
  redo: 'M16 5l5 5-5 5 M21 10H10a6 6 0 000 12',
  select: 'M5 3v17l5-5 4 7 3-2-4-7h7z',
  paint: 'M4 11l8-8 9 9-8 8z M4 11h17 M8 3l5 5 M3 17c-4 5 3 6 0 0',
  rect: 'M4 4h16v16H4z',
  ellipse: 'M21 12a9 7 0 11-18 0 9 7 0 0118 0',
  text: 'M4 4h16 M12 4v17 M8 21h8',
  image: 'M3 3h18v18H3z M3 17l6-7 5 5 3-3 4 5 M16 7h.01',
  hand: 'M7 12V6a1.5 1.5 0 013 0v6-8a1.5 1.5 0 013 0v8-6a1.5 1.5 0 013 0v7-3a1.5 1.5 0 013 0v6c0 4-2 6-6 6H9l-6-8c-1-2 1-3 2-2l2 2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 11-6 0 3 3 0 016 0',
  lock: 'M6 10h12v11H6z M8 10V6a4 4 0 018 0v4',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  close: 'M6 6l12 12 M18 6L6 18',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  eyedropper: 'M15 4l5 5 M17.5 6.5L8 16l-3 1 1-3 9.5-9.5 M3 21l3-3',
  up: 'M5 15l7-7 7 7',
  back: 'M15 5l-7 7 7 7',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M15.5 15.5L20 20',
  down: 'M5 9l7 7 7-7',
  check: 'M4 12l5 5L20 6',
  palette: 'M12 3a9 9 0 100 18h2a2 2 0 001-4 2 2 0 012-3h2a3 3 0 003-3 9 9 0 00-10-8 M7 10h.1 M10 6h.1 M16 7h.1',
  grid: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18'
};
function icon(n) {
  if (n === 'livery')
    return '<svg class="icon livery-icon" viewBox="0 0 256 256" aria-hidden="true"><g style="stroke-width:12"><path d="M101 59L74 139C64 166 80 190 109 190H181"/><path d="M124 59L97 140C92 155 99 167 114 167H181"/><path d="M147 59L119 144H181"/></g></svg>';
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n] || icons.rect}"/></svg>`;
}
function fillIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute('data-icon');
  });
}
let store = M.emptyStore(),
  project = null,
  currentView = 'left',
  tool = 'select',
  selected = null,
  selectedRegion = null,
  preparing = false,
  traceRole = 'body',
  drawPoints = [],
  drag = null,
  viewBox = { x: 0, y: 0, w: 1000, h: 600 },
  colour = '#f28a35',
  undo = [],
  redo = [],
  saveTimer,
  savePromise = Promise.resolve(),
  loadBlocked = false,
  libraryTab = 'templates',
  pendingAdd = null,
  pendingPackage = null;
const libraryClient = new LibraryClient(window.desktop);
const art = $('#artboard');
let settingsOpen = false;
const themeSettings = LiverySettings({
  read: () => store.settings || {},
  save: patch => {
    store.settings = { ...store.settings, ...patch };
    scheduleSave();
  }
});
function showSettings(open = true) {
  closeDialog();
  themeSettings.cancel();
  settingsOpen = open;
  $('.workspace').hidden = open;
  $('.project-bar').hidden = open;
  $('#settings-page').hidden = !open;
  document.querySelectorAll('.app-header nav button').forEach(b => {
    const active = b.dataset.action === (open ? 'settings' : 'studio');
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (open) {
    themeSettings.render();
    renderStudioPreferences();
    settingsSheet();
    $('#settings-back').onclick = () => showSettings(false);
  } else render();
}

let zoomSurface = null,
  zoomTimer = 0;
function clearZoomSurface() {
  clearTimeout(zoomTimer);
  zoomTimer = 0;
  zoomSurface = null;
  art.classList.remove('zooming');
  art.style.transformOrigin = '';
}
let penCursor = null,
  closeSnap = false,
  selectedNode = null;
let selectedPaint = null,
  appearanceClipboard = null,
  libraryDetailsReturn = null;
const multiSelected = new Set(),
  expandedArtworkGroups = new Set();
const multiPaintSelected = new Set();
let fitPanelOpen = false,
  fitDraft = false;
