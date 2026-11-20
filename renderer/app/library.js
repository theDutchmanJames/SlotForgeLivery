// Livery renderer · Theme, User Library and Projects.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function applyTheme() {
  themeSettings.apply();
}
// The kinds of library item: rail label, icon, search word and what the page is (Page Note).
const LIBRARY_KINDS = [
  [
    'templates',
    'My Cars',
    'car',
    'cars',
    'A car is a prepared template: the drawing of each view with its paintable panels.',
    'Every project keeps its own copy, so editing a car here never changes a livery you already made.',
    'New project starts a livery on this car.'
  ],
  [
    'liveries',
    'Liveries',
    'brush',
    'liveries',
    'A livery is a saved design: the colours, artwork and finish of one project.',
    'Apply it to another project on the same car to start from it.',
    'Save current stores the open project as a livery.'
  ],
  [
    'assets',
    'Shapes & Images',
    'image',
    'shapes & images',
    'Reusable artwork: shapes, groups, images and imported decals.',
    'Placing an item adds an independent copy to the view you have open.',
    'Place puts it on the current view.'
  ],
  [
    'fonts',
    'Fonts',
    'text',
    'fonts',
    'Fonts imported into Livery, without installing them on your computer.',
    'TTF, OTF, WOFF or WOFF2, up to 10 MB each. Text keeps its font when an entry is removed.',
    "Choose one in a text layer's font list."
  ]
];
// Page Note: what a page is, a line more, and where you use it (SlotForge Restyle).
function pageNote(iconName, lead, more, use) {
  return `<div class="sn"><span class="sn-tile">${icon(iconName)}</span><p class="sn-lead">${e(lead)}</p><p class="sn-more">${e(more)}</p><p class="sn-use">${icon('back')}<span>${e(use)}</span></p></div>`;
}
// The library sections (All cars, Saved designs, Artwork & shapes, Fonts) are part of the
// Garage page (garage.js); this opens one of them.
function openLibrary(tab = libraryTab) {
  libraryPage = 0;
  libraryTab = tab;
  showGarage(tab);
}
// The toolbar and item list of a library section, drawn by renderGarage().
function libraryPageHTML(tab) {
  const kind = LIBRARY_KINDS.find(k => k[0] === tab) || LIBRARY_KINDS[0],
    add =
      tab === 'templates'
        ? ['add-car', 'Add a car']
        : tab === 'assets'
          ? ['upload-image', 'Import artwork']
          : tab === 'fonts'
            ? ['upload-font', 'Import font']
            : ['save-livery', 'Save the open livery'];
  return `<div class="lib-page kind-${tab}"><div class="library-toolbar"><div class="row library-controls catalogue-toolbar"><button class="primary" data-action="${add[0]}" ${tab === 'liveries' && !project ? 'disabled title="Open a livery first"' : ''}>${icon('plus')}${add[1]}</button><div class="catalogue-controls"><span class="catalogue-field">${icon('search')}<input id="library-search" type="search" placeholder="Search ${kind[3]}…" aria-label="Search library"></span><select id="library-sort" aria-label="Sort library"><option value="az">Name A–Z</option><option value="za">Name Z–A</option><option value="recent">Recently added</option></select><div class="segmented library-view-toggle" role="group" aria-label="Library layout">${[
    'grid',
    'list'
  ]
    .map(
      v =>
        `<button data-library-view="${v}" aria-pressed="${(store.settings?.libraryView || 'grid') === v}">${v === 'grid' ? 'Cards' : 'List'}</button>`
    )
    .join(
      ''
    )}</div></div></div><p id="library-count" class="note" role="status"></p></div><div id="library-items"></div></div>`;
}
function wireLibraryPage() {
  $('#library-search').oninput = () => {
    libraryPage = 0;
    renderLibraryItems();
  };
  $('#library-sort').onchange = () => {
    libraryPage = 0;
    renderLibraryItems();
  };
  renderLibraryItems();
}
let libraryPage = 0,
  packagePage = 0,
  projectPage = 0;
const LIBRARY_PAGE_SIZE = 32;
function pageSlice(items, page) {
  return items.slice(page * LIBRARY_PAGE_SIZE, (page + 1) * LIBRARY_PAGE_SIZE);
}
function paging(items, page, kind) {
  const pages = Math.ceil(items.length / LIBRARY_PAGE_SIZE);
  return pages > 1
    ? `<div class="library-paging"><span role="status">Page ${page + 1} of ${pages}</span><button class="icon-button ghost sm" data-page-kind="${kind}" data-page-step="-1" aria-label="Previous page" title="Previous page" ${!page ? 'disabled' : ''}>${icon('back')}</button><button class="icon-button ghost sm page-next" data-page-kind="${kind}" data-page-step="1" aria-label="Next page" title="Next page" ${page >= pages - 1 ? 'disabled' : ''}>${icon('back')}</button></div>`
    : '';
}
function cardPreview(item, bucket) {
  if (libraryClient.isLazy(item))
    return (
      '<div class="library-preview" data-preview-bucket="' +
      bucket +
      '" data-preview-id="' +
      e(item.id) +
      '"><small>Loading preview…</small></div>'
    );
  return '<div class="library-preview">' + packagePreview(item, bucket, item.id, true) + '</div>';
}
// Pictures being loaded: a second call while the first runs does not load them twice.
const previewsLoading = new WeakSet();
async function loadCardPreviews() {
  const targets = [...document.querySelectorAll('[data-preview-id]')].filter(el => !previewsLoading.has(el));
  targets.forEach(el => previewsLoading.add(el));
  // Two thumbnails at a time prevents large imports from flooding the canvas renderer.
  async function next() {
    while (targets.length) {
      const el = targets.shift();
      if (!el.isConnected) continue;
      const bucket = el.dataset.previewBucket,
        id = el.dataset.previewId,
        key = StorageCodec.keyOf(bucket, id);
      try {
        const result = await window.desktop.libraryPreview(key);
        if (!el.isConnected) continue;
        let thumbnail = result.thumbnail;
        if (!thumbnail) {
          const item = result.value;
          await FontLibrary.loadAll(bucket === 'fonts' ? null : item);
          const markup =
              bucket === 'fonts'
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140">' +
                  FontLibrary.style(item.fontData) +
                  '<text x="24" y="90" font-family="' +
                  e(item.fontData.family) +
                  '" font-size="48" fill="#333">Aa 27</text></svg>'
                : packagePreview(item, bucket, 'thumb'),
            holder = document.createElement('div');
          holder.innerHTML = markup;
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 140;
          const context = canvas.getContext('2d');
          const svg = holder.querySelector('svg'),
            img = holder.querySelector('img');
          if (svg) {
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('width', '240');
            svg.setAttribute('height', '140');
            const raster = await rasterSVG(new XMLSerializer().serializeToString(svg), 240, 140);
            context.drawImage(raster, 0, 0);
          } else if (img) {
            await img.decode();
            const scale = Math.min(240 / img.naturalWidth, 140 / img.naturalHeight);
            context.drawImage(
              img,
              (240 - img.naturalWidth * scale) / 2,
              (140 - img.naturalHeight * scale) / 2,
              img.naturalWidth * scale,
              img.naturalHeight * scale
            );
          } else {
            context.fillStyle = item.base || '#657384';
            context.fillRect(10, 10, 220, 120);
            context.fillStyle = '#fff';
            context.font = '36px sans-serif';
            context.fillText(bucket === 'fonts' ? 'Aa 27' : 'Livery', 30, 86);
          }
          thumbnail = canvas.toDataURL('image/png');
          await window.desktop.libraryThumbnail({ key, data: thumbnail, revision: result.revision });
        }
        if (el.isConnected) {
          const image = document.createElement('img');
          image.src = thumbnail;
          image.alt = '';
          el.replaceChildren(image);
        }
      } catch (error) {
        if (el.isConnected) {
          el.textContent = 'Preview unavailable';
          el.title = error.message;
        }
      }
    }
  }
  await Promise.all([next(), next()]);
}
// How many projects were started from this car (matched by template id or name).
function carUsage(template) {
  const count = store.projects.filter(p =>
    p.trashedAt
      ? false
      : p.template
        ? p.template.id === template.id || p.template.name === template.name
        : p.storageSummary?.templateId === template.id || p.storageSummary?.templateName === template.name
  ).length;
  return count ? `Used by ${count} project${count === 1 ? '' : 's'}` : 'Not used yet';
}
function renderLibraryItems() {
  const query = $('#library-search')?.value.toLowerCase() || '',
    items = store[libraryTab].filter(a =>
      [a.name, a.creator, a.description].some(value =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      )
    ),
    sort = $('#library-sort')?.value || 'az';
  if (sort === 'recent') items.reverse();
  else items.sort((a, b) => a.name.localeCompare(b.name) * (sort === 'za' ? -1 : 1));
  libraryPage = Math.min(libraryPage, Math.max(0, Math.ceil(items.length / LIBRARY_PAGE_SIZE) - 1));
  $('#library-count').textContent = items.length + ' of ' + store[libraryTab].length + ' items';
  $('#library-items').innerHTML = items.length
    ? `<div class="library-grid ${store.settings?.libraryView === 'list' ? 'list' : ''}">` +
      pageSlice(items, libraryPage)
        .map(a => {
          const info = a.storageSummary || StorageCodec.summary(libraryTab, a).storageSummary;
          const detail =
            libraryTab === 'templates'
              ? [e(a.scale), (info.views || []).map(k => M.LABELS[k]).join(' · '), carUsage(a)]
                  .filter(Boolean)
                  .join(' · ')
              : libraryTab === 'liveries'
                ? info.layerCount + ' artwork layers · ' + e(a.finish)
                : libraryTab === 'fonts'
                  ? 'Imported font · embedded in designs'
                  : a.type === 'image'
                    ? 'Image · transparent PNG supported'
                    : a.type === 'group'
                      ? info.layerCount + ' editable elements'
                      : 'Editable artwork';
          const use =
            libraryTab === 'templates'
              ? 'New project'
              : libraryTab === 'liveries'
                ? 'Apply'
                : libraryTab === 'fonts'
                  ? 'Use font'
                  : 'Place';
          return `<article class="library-card showroom">${cardPreview(a, libraryTab)}<div class="lc-body"><strong>${e(a.name)}</strong><small>${detail}</small></div><div class="row lc-foot"><button data-library-use="${e(a.id)}" class="primary sm">${use}</button><button class="library-edit sm" data-library-edit="${e(a.id)}" title="Edit details">${icon('pen')}Edit</button><button class="icon-button sm" data-library-export="${e(a.id)}" title="Export item" aria-label="Export ${e(a.name)}">${icon('share')}</button><button class="icon-button sm danger" data-library-delete="${e(a.id)}" title="Remove from library" aria-label="Remove ${e(a.name)}">${icon('trash')}</button></div></article>`;
        })
        .join('') +
      '</div>' +
      paging(items, libraryPage, 'library')
    : `<div class="empty-library"><span class="empty-tile">${icon(query ? 'search' : (LIBRARY_KINDS.find(k => k[0] === libraryTab) || LIBRARY_KINDS[0])[2])}</span><h3>${query ? 'No matching items' : 'Ready for your first item'}</h3><p>${query ? 'Try another word, or clear the search.' : 'Everything you create or upload can be reused here. Use the button above to add the first one.'}</p></div>`;
  loadCardPreviews().catch(reportError);
}
function libraryMetadata(item) {
  return {
    creator: String(item.creator || '')
      .trim()
      .slice(0, 180),
    description: String(item.description || '').slice(0, 2000)
  };
}
function editLibraryDetails(id) {
  const tab = libraryTab,
    item = store[tab].find(a => a.id === id);
  if (!item) return;
  // Opened from a library list or from a car page in the Garage.
  const section = garageOpen ? garageSection : null,
    query = $('#library-search')?.value ?? '',
    sort = $('#library-sort')?.value,
    scroll = $('#library-items')?.scrollTop || 0;
  const back = () => {
    if (section && !LIBRARY_SECTIONS.includes(section)) return showGarage(section);
    openLibrary(tab);
    if ($('#library-search')) $('#library-search').value = query;
    if (sort && $('#library-sort')) $('#library-sort').value = sort;
    renderLibraryItems();
    if ($('#library-items')) $('#library-items').scrollTop = scroll;
  };
  const field = (id, label, value, max = 180) =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" maxlength="${max}" value="${e(value || '')}"></div>`;
  const area = (id, label, value, max) =>
    `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" maxlength="${max}">${e(value || '')}</textarea></div>`;
  openDialog(
    'Edit library details',
    item.name,
    field('library-detail-name', 'Name', item.name) +
      (tab === 'templates' ? field('library-detail-scale', 'Scale', item.scale) : '') +
      field('library-detail-creator', 'Creator (optional)', item.creator) +
      area('library-detail-description', 'Description (optional)', item.description, 2000) +
      (tab === 'liveries'
        ? area('library-detail-paints', 'Paint references', item.paints, 12000) +
          area('library-detail-notes', 'Workshop notes', item.notes, 12000)
        : '') +
      '<p class="note">These details belong to the library copy. Existing projects keep their own copy.</p>',
    '<button id="library-details-cancel">Cancel</button><button id="library-details-save" class="primary">Save details</button>'
  );
  libraryDetailsReturn = back;
  $('#library-details-cancel').onclick = closeDialog;
  $('#library-detail-name').required = true;
  $('#library-detail-name').focus();
  $('#library-details-save').onclick = () => {
    const input = $('#library-detail-name'),
      name = input.value.trim();
    input.setCustomValidity(name ? '' : 'Enter a name.');
    if (!input.reportValidity()) return;
    item.name = M.name(name);
    Object.assign(
      item,
      libraryMetadata({
        creator: $('#library-detail-creator').value,
        description: $('#library-detail-description').value
      })
    );
    if (tab === 'templates') item.scale = $('#library-detail-scale').value.trim().slice(0, 180);
    if (tab === 'liveries') {
      item.paints = $('#library-detail-paints').value.slice(0, 12000);
      item.notes = $('#library-detail-notes').value.slice(0, 12000);
    }
    item.updated = new Date().toISOString();
    // A save while the window was open may have put a light copy in the library: put this one back.
    const at = store[tab].findIndex(a => a.id === id);
    if (at >= 0 && store[tab][at] !== item) store[tab][at] = item;
    scheduleSave();
    closeDialog();
    toast('Library details saved.');
  };
  $('#library-detail-name').oninput = () => $('#library-detail-name').setCustomValidity('');
}
function useLibrary(id) {
  const item = store[libraryTab].find(a => a.id === id);
  if (!item) return;
  if (libraryTab === 'templates') {
    setProject(
      M.newProject(
        item,
        M.nextLiveryName(
          item.name,
          store.projects.map(p => p.name)
        )
      )
    );
    closeDialog();
    if (!activeView()?.regions.some(r => r.role === 'body')) {
      preparing = true;
      render();
    }
    return;
  }
  if (!project) return toast('Open or create a car project first.');
  if (libraryTab === 'fonts') {
    closeDialog();
    hideGarage();
    useFont(item);
    return;
  }
  if (libraryTab === 'liveries') {
    confirmAction(
      'Apply this livery?',
      `“${item.name}” will replace this project’s current artwork. You can undo this change.`,
      () => {
        hideGarage();
        record();
        project = M.applyLivery(project, item);
        selected = null;
        tool = 'select';
        preparing = false;
        changed();
        render();
        toast('Livery applied. Check placement on each view.');
      },
      'Apply livery'
    );
    return;
  }
  if (!activeView()?.regions.some(r => r.role === 'body'))
    return toast('Prepare at least one paintable body region first.');
  closeDialog();
  hideGarage();
  if (item.type === 'group') {
    mutate(() => {
      const placed = M.placeGroup(item);
      layers().push(...placed);
      preparing = false;
      chooseArtwork('group:' + placed[0].groupId);
    });
  } else if (item.type === 'image') {
    const w = 240,
      h = (w * item.height) / item.width;
    addLayer(M.layer('image', { name: item.name, src: item.src, x: 500 - w / 2, y: 300 - h / 2, w, h }));
  } else {
    const l = stripGroup(M.clone(item.layer));
    l.name = item.name;
    l.id = M.uid();
    l.x = 500 - l.w / 2;
    l.y = 300 - l.h / 2;
    addLayer(l);
  }
}
// Projects are the liveries in the Garage (garage.js).
function openProjects() {
  showGarage('recent');
}
