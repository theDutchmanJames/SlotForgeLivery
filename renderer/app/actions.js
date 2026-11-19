// Livery renderer · The data-action command map.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const actions = {
  'close-dialog': closeDialog,
  help: helpDialog,
  studio: () => showSettings(false),
  settings: () => showSettings(),
  projects: () => {
    if (settingsOpen) showSettings(false);
    openProjects();
  },
  library: () => {
    if (settingsOpen) showSettings(false);
    openLibrary();
  },
  sharing: () => {
    if (settingsOpen) showSettings(false);
    openSharing();
  },
  'add-car': () => addCarDialog(),
  'sample-car': () => trySampleCar().catch(reportError),
  'mirror-view': () => mirrorWholeSide(),
  'paint-catalogue': () => openPaintCatalogue(),
  'true-size': () => trueSizeDialog(),
  'send-decals': () => sendToDecals().catch(reportError),
  'centre-guide': () => addCentreGuide(),
  'add-view': () => project && addCarDialog(currentView || 'left'),
  import: () => $('#package-file').click(),
  'confirm-import': importConfirmed,
  'export-selection': () => openPackageExport(),
  'export-all': () => exportPackage('library', store, 'SlotForge Livery Library'),
  'export-project': () => project && exportPackage('project', project, project.name),
  rename: () => project && askName('Name this project', project.name, n => mutate(() => (project.name = n))),
  'save-livery': () => {
    if (!project) return toast('Create a project first.');
    askName('Save a reusable livery', project.name, n => {
      store.liveries.push(M.liveryFromProject(project, n));
      scheduleSave();
      toast('Livery saved to your library.');
    });
  },
  'copy-appearance': copyAppearance,
  'paste-appearance': pasteAppearance,
  'reset-fit': () => mutateFit(() => applyFit({ ...M.fitValues(), ...M.pinchValues() })),
  'reset-pinch': () => mutateFit(() => applyFit({ ...M.fitValues(fitTarget()), ...M.pinchValues() })),
  'save-asset': saveArtworkAsset,
  'edit-curve': () => {
    const l = selection();
    if (l?.kind === 'line' && !l.points)
      mutate(() => {
        const style = M.lineStyle(l);
        l.points = [
          { x: 0, y: 0.5 },
          { x: 1, y: 0.5 }
        ];
        M.setLineStyle(l, style);
      });
    setTool('nodes');
  },
  'smooth-point': () => changePointType(true),
  'corner-point': () => changePointType(false),
  'scale-artwork': () => scaleSelectedArtwork(Number($('#group-scale').value) / 100),
  'upload-image': () => $('#image-file').click(),
  'upload-font': () => $('#font-file').click(),
  pdf: exportPDF,
  png: exportPNGDialog,
  notes: notesDialog,
  shapes: shapesDialog,
  base: () => {
    selected = null;
    selectedPaint = null;
    tool = 'paint';
    render();
  },
  prepare: () => {
    if (!activeView()) return toast('Add a view first.');
    preparing = !preparing;
    selected = null;
    selectedRegion = activeView()?.regions[0]?.id || null;
    drawPoints = [];
    tool = 'select';
    render();
  },
  'repair-template': repairTemplate,
  'generate-regions': generateVectorRegions,
  trace: () => {
    tool = 'polygon';
    drawPoints = [];
    render();
  },
  'finish-draw': finishDrawing,
  'cancel-draw': () => {
    drawPoints = [];
    penCursor = null;
    closeSnap = false;
    render();
  },
  'finish-preparation': () => {
    if (drawPoints.length) return toast('Finish or cancel your outline first.');
    if (!activeView().regions.some(r => r.role === 'body'))
      return toast('Mark or trace at least one paintable body region.');
    updateBounds();
    activeView().showPhoto = false;
    project.template.updated = new Date().toISOString();
    const i = store.templates.findIndex(t => t.id === project.template.id);
    if (i >= 0)
      store.templates[i] = {
        ...M.clone(project.template),
        name: store.templates[i].name,
        scale: store.templates[i].scale,
        ...libraryMetadata(store.templates[i])
      };
    else store.templates.push(M.clone(project.template));
    preparing = false;
    tool = 'select';
    selectedRegion = null;
    changed();
    render();
    toast('Car template saved to your library.');
  },
  'replace-view': () =>
    confirmAction(
      'Replace this view?',
      'Its geometry and artwork will be replaced. Other views are kept.',
      () => addCarDialog(currentView, true),
      'Choose new image',
      'danger'
    ),
  'delete-region': () => {
    if (region())
      mutate(() => {
        activeView().regions = activeView().regions.filter(r => r.id !== selectedRegion);
        selectedRegion = null;
        updateBounds();
      });
  },
  'region-reset': () => {
    if (region()) mutate(() => delete region().colour);
  },
  'custom-shape': () => {
    closeDialog();
    setTool('polygon');
  },
  undo: () => {
    if (undo.length) {
      redo.push(snapshot());
      project = undo.pop();
      selected = null;
      selectedRegion = null;
      drawPoints = [];
      resetViewSelection(true);
      changed();
      render();
    }
  },
  redo: () => {
    if (redo.length) {
      undo.push(snapshot());
      project = redo.pop();
      selected = null;
      selectedRegion = null;
      drawPoints = [];
      resetViewSelection(true);
      changed();
      render();
    }
  },
  'group-artwork': groupArtwork,
  'ungroup-artwork': ungroupArtwork,
  duplicate: duplicateArtwork,
  delete: () => {
    const ids = new Set(artworkSelection().map(l => l.id));
    if (ids.size)
      mutate(() => {
        project.views[currentView] = layers().filter(l => !ids.has(l.id));
        selected = null;
        multiSelected.clear();
      });
  },
  'layer-up': () => reorder('forward'),
  'layer-down': () => reorder('backward'),
  'layer-front': () => reorder('front'),
  'layer-back': () => reorder('back'),
  'copy-view': () => {
    const l = selection();
    if (!l) return;
    openDialog(
      'Copy artwork to another view',
      'Placement is a starting point. Check it against the destination body.',
      `<div class="field"><label for="copy-target">Destination view</label><select id="copy-target">${M.VIEWS.filter(
        k => k !== currentView
      )
        .map(
          k =>
            `<option value="${k}" ${(currentView === 'left' && k === 'right') || (currentView === 'right' && k === 'left') ? 'selected' : ''}>${M.LABELS[k]}${project.template.views[k] ? '' : ' (no template yet)'}</option>`
        )
        .join(
          ''
        )}</select></div><label class="checkbox-line"><input id="copy-mirror" type="checkbox" checked>Mirror placement for the opposite side</label><p class="note">Text and images remain readable. Shapes can mirror; no automatic wrapping between views is performed.</p>`,
      `<button data-action="close-dialog">Cancel</button><button class="primary" id="copy-apply">Copy artwork</button>`
    );
    $('#copy-apply').onclick = () => {
      const k = $('#copy-target').value,
        mirror = $('#copy-mirror').checked;
      mutate(() => {
        const n = stripGroup(mirror ? M.mirrorLayer(l) : { ...M.clone(l), id: M.uid() });
        project.views[k].push(n);
      });
      closeDialog();
      toast('Artwork copied to ' + M.LABELS[k] + '.');
    };
  },
  fit,
  'zoom-in': () => zoom(1.2),
  'zoom-out': () => zoom(1 / 1.2)
};
