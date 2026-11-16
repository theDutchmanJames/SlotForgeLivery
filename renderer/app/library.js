// Livery renderer · Theme, User Library and Projects.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function applyTheme() {
  themeSettings.apply();
}
function openLibrary(tab = libraryTab) {
  libraryPage = 0;
  libraryTab = tab;
  openDialog(
    'User Library',
    'Browse your cars, liveries, artwork and fonts. Choose an item to use it, or export a selection to share.',
    `<div class="library-toolbar"><div class="tabs">${[
      ['templates', 'My Cars'],
      ['liveries', 'Liveries'],
      ['assets', 'Shapes & Images'],
      ['fonts', 'Fonts']
    ]
      .map(
        ([k, n]) =>
          `<button data-library-tab="${k}" class="${k === tab ? 'active' : ''}">${n} <small>${store[k].length}</small></button>`
      )
      .join(
        ''
      )}</div><div class="row library-controls"><input id="library-search" placeholder="Search ${tab === 'templates' ? 'cars' : tab === 'liveries' ? 'liveries' : tab === 'fonts' ? 'fonts' : 'shapes & images'}…" aria-label="Search library"><select id="library-sort" aria-label="Sort library"><option value="az">Name A–Z</option><option value="za">Name Z–A</option><option value="recent">Recently added</option></select><div class="segmented library-view-toggle" role="group" aria-label="Library layout">${['grid', 'list'].map(v => `<button data-library-view="${v}" aria-pressed="${(store.settings?.libraryView || 'grid') === v}">${v === 'grid' ? 'Cards' : 'List'}</button>`).join('')}</div><button data-action="${tab === 'templates' ? 'add-car' : tab === 'assets' ? 'upload-image' : tab === 'fonts' ? 'upload-font' : 'save-livery'}" ${tab === 'liveries' && !project ? 'disabled' : ''}>${icon('plus')}${tab === 'templates' ? 'Add car' : tab === 'assets' ? 'Import artwork' : tab === 'fonts' ? 'Import font' : 'Save current'}</button></div><p id="library-count" class="note" role="status"></p>${tab === 'fonts' ? '<p class="note">TTF, OTF, WOFF or WOFF2 · Up to 10 MB per font · Existing text keeps its font when a library entry is removed.</p>' : ''}</div><div id="library-items"></div>`,
    `<span class="dialog-foot-note">Share several items in one editable .sfpaint package.</span><button data-action="export-selection">${icon('share')}Export a package</button><button data-action="close-dialog">Done</button>`
  );
  $('#dialog').classList.add('library-dialog');
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
    ? '<div class="library-paging"><button data-page-kind="' +
        kind +
        '" data-page-step="-1" ' +
        (!page ? 'disabled' : '') +
        '>Previous</button><span>Page ' +
        (page + 1) +
        ' of ' +
        pages +
        '</span><button data-page-kind="' +
        kind +
        '" data-page-step="1" ' +
        (page >= pages - 1 ? 'disabled' : '') +
        '>Next</button></div>'
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
  return '<div class="library-preview">' + packagePreview(item, bucket, item.id) + '</div>';
}
async function loadCardPreviews() {
  const targets = [...document.querySelectorAll('[data-preview-id]')];
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
    p.template
      ? p.template.id === template.id || p.template.name === template.name
      : p.storageSummary?.templateName === template.name
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
          return (
            '<article class="library-card">' +
            cardPreview(a, libraryTab) +
            '<strong>' +
            e(a.name) +
            '</strong><small>' +
            detail +
            '</small><button class="library-edit" data-library-edit="' +
            e(a.id) +
            '">' +
            icon('pen') +
            'Edit Details</button><div class="row"><button data-library-use="' +
            e(a.id) +
            '" class="primary">' +
            (libraryTab === 'templates'
              ? 'New project'
              : libraryTab === 'liveries'
                ? 'Apply'
                : libraryTab === 'fonts'
                  ? 'Use font'
                  : 'Place') +
            '</button><button data-library-export="' +
            e(a.id) +
            '" title="Export item" aria-label="Export ' +
            e(a.name) +
            '">' +
            icon('share') +
            '</button><button data-library-delete="' +
            e(a.id) +
            '" title="Remove from library" aria-label="Remove ' +
            e(a.name) +
            '">' +
            icon('trash') +
            '</button></div></article>'
          );
        })
        .join('') +
      '</div>' +
      paging(items, libraryPage, 'library')
    : '<div class="empty-library">' +
      icon('folder') +
      '<h3>' +
      (query ? 'No matching items' : 'Ready for your first item') +
      '</h3><p>Everything you create or upload can be reused here.</p></div>';
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
  const query = $('#library-search').value,
    sort = $('#library-sort').value,
    scroll = $('#library-items').scrollTop;
  const back = () => {
    openLibrary(tab);
    $('#library-search').value = query;
    $('#library-sort').value = sort;
    renderLibraryItems();
    $('#library-items').scrollTop = scroll;
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
    useFont(item);
    return;
  }
  if (libraryTab === 'liveries') {
    confirmAction(
      'Apply this livery?',
      `“${item.name}” will replace this project’s current artwork. You can undo this change.`,
      () => {
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
function openProjects() {
  projectPage = Math.min(projectPage, Math.max(0, Math.ceil(store.projects.length / LIBRARY_PAGE_SIZE) - 1));
  openDialog(
    'Your projects',
    'Saved locally, with their own car template and editable artwork.',
    '<button data-action="add-car" class="primary">' +
      icon('plus') +
      'New car project</button><div class="library-grid">' +
      pageSlice(store.projects, projectPage)
        .map(
          p =>
            '<article class="library-card">' +
            cardPreview(p, 'projects') +
            '<strong>' +
            e(p.name) +
            '</strong><small>' +
            e(p.template?.name || p.storageSummary?.templateName || '') +
            '<br>' +
            new Date(p.updated).toLocaleDateString() +
            '</small><div class="row"><button data-project-open="' +
            e(p.id) +
            '" class="primary">Open</button><button data-project-export="' +
            e(p.id) +
            '" aria-label="Export project">' +
            icon('share') +
            '</button><button data-project-delete="' +
            e(p.id) +
            '" aria-label="Delete project">' +
            icon('trash') +
            '</button></div></article>'
        )
        .join('') +
      '</div>' +
      paging(store.projects, projectPage, 'projects') +
      (!store.projects.length ? '<p class="empty-library">Your saved designs will appear here.</p>' : '')
  );
  loadCardPreviews().catch(reportError);
}
