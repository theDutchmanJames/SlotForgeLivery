// Livery renderer · Import & Export: packages, validation and package import.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function openSharing() {
  openDialog(
    'Import & Export',
    'Share complete, editable items with another Livery user.',
    `<div class="choice-grid"><button class="choice-card" data-action="import">${icon('import')}<strong>Import a package</strong><small>Add a shared car, livery, project or asset. Imports create independent copies.</small></button><button class="choice-card" data-action="export-selection">${icon('share')}<strong>Export a package</strong><small>Choose cars, liveries and artwork from your library, then share them in one editable file.</small></button></div><div class="row sharing-secondary"><button data-action="upload-image">Import decal artwork or Decals sheet</button><button data-action="export-all">${icon('save')}Back up my whole library</button>${project ? `<button data-action="export-project">${icon('share')}Export current project</button>` : ''}</div><div class="separator"></div><p class="note">The recipient opens Import a package in Livery. Images, custom fonts and editable shapes travel inside the file.</p>`
  );
}
const packageTabs = [
  ['templates', 'My Cars'],
  ['liveries', 'Liveries'],
  ['assets', 'Shapes & Images'],
  ['fonts', 'Fonts'],
  ['projects', 'Projects']
];
let packageChoices = new Set(),
  packageTab = 'templates';
function packageItems() {
  const query = $('#package-search').value.toLowerCase().trim();
  return store[packageTab]
    .filter(a => !a.trashedAt && a.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function openPackageExport() {
  packagePage = 0;
  packageChoices = new Set();
  packageTab = 'templates';
  openDialog(
    'Export a package',
    'Choose the items to share. Their editable elements, images and custom fonts are included.',
    `<div class="library-toolbar"><div class="tabs">${packageTabs.map(([key, name]) => `<button data-package-tab="${key}">${name} <small>${store[key].length}</small></button>`).join('')}</div><div class="row library-controls"><input id="package-search" placeholder="Find items to share…" aria-label="Find items to share"><button id="package-select-shown">Select shown</button><button id="package-clear">Clear all</button></div><p class="note">Selections stay selected when you change tabs or search. A project includes its own car template.</p></div><div id="package-items"></div>`,
    `<div class="package-summary"><label for="package-name">Package name</label><input id="package-name" value="My Livery collection" maxlength="100"><small id="package-count" role="status"></small></div><button data-action="sharing">Back</button><button id="package-export" class="primary" disabled>${icon('share')}Export package</button>`
  );
  $('#dialog').classList.add('package-dialog');
  $('#package-search').oninput = () => {
    packagePage = 0;
    renderPackageItems();
  };
  document.querySelectorAll('[data-package-tab]').forEach(
    b =>
      (b.onclick = () => {
        packageTab = b.dataset.packageTab;
        packagePage = 0;
        renderPackageItems();
      })
  );
  $('#package-select-shown').onclick = () => {
    pageSlice(packageItems(), packagePage).forEach(a => packageChoices.add(packageTab + ':' + a.id));
    renderPackageItems();
  };
  $('#package-clear').onclick = () => {
    packageChoices.clear();
    renderPackageItems();
  };
  $('#package-export').onclick = exportChosenPackage;
  renderPackageItems();
}
// live: the preview stays on screen (shares on-screen image URLs); leave it
// off for markup that will be rasterised.
function packagePreview(a, key, index, live = false) {
  return key === 'templates'
    ? previewTemplate(a, 'package-' + index)
    : key === 'assets'
      ? assetPreview(a)
      : key === 'fonts'
        ? fontPreview(a)
        : key === 'projects'
          ? V.standalone(a, Object.keys(a.template.views)[0], 'package-' + index, { preview: true, live })
          : `<span class="livery-colour" style="background:${M.colour(a.base, '#ffffff')}"></span>`;
}
function updatePackageCount() {
  const counts = packageTabs
    .map(([k, n]) => {
      const count = store[k].filter(a => packageChoices.has(k + ':' + a.id)).length;
      const names = {
        templates: ['car', 'cars'],
        liveries: ['livery', 'liveries'],
        assets: ['artwork item', 'artwork items'],
        projects: ['project', 'projects'],
        fonts: ['font', 'fonts']
      }[k];
      return count ? `${count} ${names[count === 1 ? 0 : 1]}` : '';
    })
    .filter(Boolean);
  $('#package-count').textContent = counts.length ? counts.join(' · ') : 'No items selected';
  $('#package-export').disabled = !packageChoices.size;
}
function renderPackageItems() {
  document
    .querySelectorAll('[data-package-tab]')
    .forEach(b => b.classList.toggle('active', b.dataset.packageTab === packageTab));
  const items = packageItems();
  packagePage = Math.min(packagePage, Math.max(0, Math.ceil(items.length / LIBRARY_PAGE_SIZE) - 1));
  $('#package-items').innerHTML = items.length
    ? '<div class="library-grid">' +
      pageSlice(items, packagePage)
        .map(a => {
          const key = packageTab + ':' + a.id;
          return (
            '<label class="library-card package-card ' +
            (packageChoices.has(key) ? 'selected' : '') +
            '"><div class="package-check"><input type="checkbox" data-package-item="' +
            e(key) +
            '" ' +
            (packageChoices.has(key) ? 'checked' : '') +
            '><span>' +
            e(a.name) +
            '</span></div>' +
            cardPreview(a, packageTab) +
            '<small>Editable library item</small></label>'
          );
        })
        .join('') +
      '</div>' +
      paging(items, packagePage, 'package')
    : '<div class="empty-library"><h3>No matching items</h3><p>Try another category or search.</p></div>';
  document.querySelectorAll('[data-package-item]').forEach(
    c =>
      (c.onchange = () => {
        c.checked ? packageChoices.add(c.dataset.packageItem) : packageChoices.delete(c.dataset.packageItem);
        c.closest('.package-card').classList.toggle('selected', c.checked);
        updatePackageCount();
      })
  );
  updatePackageCount();
  loadCardPreviews().catch(reportError);
}
async function exportChosenPackage() {
  if (!packageChoices.size) return;
  const button = $('#package-export');
  button.disabled = true;
  try {
    const data = Object.fromEntries(
      packageTabs.map(([key]) => [key, store[key].filter(a => packageChoices.has(key + ':' + a.id))])
    );
    await exportPackage('library', data, M.name($('#package-name').value, 'Livery collection'));
  } catch (error) {
    reportError(error);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}
async function exportPackage(kind, data, name) {
  data = await libraryClient.materialize(store, data);
  const pkg = {
    format: 'slotforge-paintshop',
    version: 1,
    kind,
    exported: new Date().toISOString(),
    data: M.clone(data)
  };
  if (new Blob([JSON.stringify(pkg, null, 2)]).size > 180 * 1024 * 1024)
    throw new Error('Package exceeds 180 MB. Export fewer items at a time.');
  if (window.desktop) {
    if (await window.desktop.exportPackage({ name, data: pkg })) toast('Package exported.');
  } else {
    download(new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }), name + '.sfpaint');
    toast('Package downloaded.');
  }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function validateTemplate(t, allowEmpty = false) {
  if (!t || !t.views || typeof t.views !== 'object') throw new Error('Missing car views.');
  const views = {};
  for (const k of M.VIEWS) if (t.views[k]) views[k] = V.validateView(t.views[k]);
  if (allowEmpty !== true && !Object.keys(views).length) throw new Error('Car needs at least one view.');
  return {
    id: M.uid(),
    name: M.name(t.name, 'Imported car'),
    scale: M.name(t.scale, ''),
    views,
    creator: M.name(t.creator, ''),
    description: String(t.description || '').slice(0, 2000),
    updated: new Date().toISOString()
  };
}
function validateLivery(l) {
  if (!l || !l.views) throw new Error('Missing livery artwork.');
  const views = {};
  for (const k of M.VIEWS) {
    if (l.views[k] && !Array.isArray(l.views[k])) throw new Error('Invalid livery layers.');
    views[k] = (l.views[k] || []).map(M.validateLayer);
  }
  const bounds = {};
  for (const k of M.VIEWS) {
    const b = l.bounds?.[k] || { x: 0, y: 0, w: 1000, h: 600 };
    bounds[k] = {
      x: M.number(b.x),
      y: M.number(b.y),
      w: M.number(b.w, 1000, 1, 10000),
      h: M.number(b.h, 600, 1, 10000)
    };
  }
  return {
    id: M.uid(),
    name: M.name(l.name, 'Imported livery'),
    ...libraryMetadata(l),
    base: M.colour(l.base, '#ffffff'),
    ...(M.paintRef(l.paintRef) ? { paintRef: M.paintRef(l.paintRef) } : {}),
    finish: M.FINISHES.includes(l.finish) ? l.finish : 'Gloss',
    effect: M.EFFECTS.includes(l.effect) ? l.effect : 'Solid',
    ...M.fillSettings(l),
    panelPaints: M.validatePanelPaints(l.panelPaints),
    palette: M.validatePalette(l.palette),
    ...(l.liveryColours ? { liveryColours: M.validateLiveryColours(l.liveryColours) } : {}),
    ...(l.entries?.length ? { entries: M.validateEntries(l.entries) } : {}),
    views,
    bounds,
    notes: String(l.notes || '').slice(0, 12000),
    paints: String(l.paints || '').slice(0, 12000),
    updated: new Date().toISOString()
  };
}
function validateAsset(a) {
  if (!a || !['image', 'shape', 'group'].includes(a.type)) throw new Error('Unsupported library asset.');
  if (a.type === 'image') {
    if (!M.validImage(a.src)) throw new Error('Invalid image asset.');
    return {
      id: M.uid(),
      name: M.name(a.name),
      ...libraryMetadata(a),
      type: 'image',
      src: a.src,
      width: M.number(a.width, 240, 1, 20000),
      height: M.number(a.height, 100, 1, 20000)
    };
  }
  if (a.type === 'group') {
    if (!Array.isArray(a.layers) || !a.layers.length) throw new Error('A group needs at least one editable element.');
    return { ...M.groupAsset(a.layers.map(M.validateLayer), a.name), ...libraryMetadata(a) };
  }
  return {
    id: M.uid(),
    name: M.name(a.name),
    ...libraryMetadata(a),
    type: 'shape',
    layer: stripGroup(M.validateLayer(a.layer))
  };
}
function validateFontAsset(a) {
  return { id: M.uid(), name: M.name(a.name), ...libraryMetadata(a), fontData: M.validateFontData(a.fontData) };
}
function validateProject(p) {
  const t = validateTemplate(p.template, true),
    l = validateLivery(p);
  return { ...l, template: t, guides: M.validateGuides(p.guides), id: M.uid() };
}
async function readPackage(file) {
  if (file.size > 180 * 1024 * 1024) throw new Error('Package exceeds the 180 MB import limit.');
  const pkg = JSON.parse(await file.text());
  if (pkg.format !== 'slotforge-paintshop' || pkg.version !== 1)
    throw new Error('This is not a supported Livery package.');
  const additions = { templates: [], liveries: [], assets: [], fonts: [], projects: [] };
  const map = {
    template: ['templates', validateTemplate],
    livery: ['liveries', validateLivery],
    asset: ['assets', validateAsset],
    project: ['projects', validateProject],
    font: ['fonts', validateFontAsset]
  };
  if (pkg.kind === 'library') {
    for (const [key, fn] of [
      ['templates', validateTemplate],
      ['liveries', validateLivery],
      ['assets', validateAsset],
      ['projects', validateProject],
      ['fonts', validateFontAsset]
    ]) {
      if (key === 'fonts' && pkg.data?.fonts === undefined) continue;
      if (!Array.isArray(pkg.data?.[key])) throw new Error('Invalid library package.');
      additions[key] = pkg.data[key].map(fn);
    }
  } else {
    const spec = map[pkg.kind];
    if (!spec) throw new Error('Unknown package type.');
    additions[spec[0]].push(spec[1](pkg.data));
  }
  await FontLibrary.loadAll(additions);
  pendingPackage = additions;
  openDialog(
    'Import this package?',
    'All items are added as independent copies. Existing items are kept.',
    `<div class="import-info"><strong>${e(file.name)}</strong><p style="margin:12px 0 0">${Object.entries(additions)
      .filter(([k, v]) => v.length)
      .map(([k, v]) => `${v.length} ${k}`)
      .join(
        ' · '
      )}</p></div><p class="note" style="margin-top:15px">Artwork is checked before import. Scripts and external resources are excluded; vector decals retain supported gradients, clipping and embedded images.</p>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" data-action="confirm-import">Import items</button>`,
    'confirm'
  );
  pendingPackage = additions;
}
async function importConfirmed() {
  const a = pendingPackage;
  if (!a) return;
  const recovering = loadBlocked,
    next = recovering ? M.clone(store) : null,
    button = document.querySelector('[data-action="confirm-import"]');
  if (recovering) for (const k of Object.keys(a)) next[k].push(...a[k]);
  if (button) button.disabled = true;
  try {
    if (recovering) {
      clearTimeout(saveTimer);
      await savePromise.catch(() => {});
      if (window.desktop) {
        const restored = await window.desktop.restore(next);
        libraryClient.accept(restored);
      } else {
        const old = localStorage.getItem('slotforge-paintshop-v1');
        if (old) localStorage.setItem('slotforge-paintshop-recovery-' + Date.now(), old);
        localStorage.setItem('slotforge-paintshop-v1', JSON.stringify(next));
      }
      store = next;
      project = store.projects.find(p => p.id === project?.id) || null;
      loadBlocked = false;
    } else for (const k of Object.keys(a)) store[k].push(...a[k]);
    pendingPackage = null;
    closeDialog();
    if (a.projects.length) setProject(store.projects.find(p => p.id === a.projects[0].id));
    else
      openLibrary(
        a.templates.length ? 'templates' : a.liveries.length ? 'liveries' : a.fonts?.length ? 'fonts' : 'assets'
      );
    scheduleSave();
    await flushSave();
    toast(
      recovering
        ? 'Backup restored and saved. Previous files were preserved.'
        : 'Items imported. Your existing library was kept.'
    );
  } catch (error) {
    reportError(error);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
