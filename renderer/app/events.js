// Livery renderer · Zoom, click/change delegation and file inputs.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function zoom(factor, point = { x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 }) {
  if (!drag && !zoomSurface) {
    const rect = art.getBoundingClientRect();
    zoomSurface = { box: { ...viewBox }, width: rect.width, height: rect.height };
  }
  const next = Math.max(200, Math.min(2500, viewBox.w / factor)),
    ratio = next / viewBox.w;
  viewBox = {
    x: point.x - (point.x - viewBox.x) * ratio,
    y: point.y - (point.y - viewBox.y) * ratio,
    w: next,
    h: next * 0.6
  };
  if (!zoomSurface || drag) {
    renderCanvas();
    return;
  }
  // Scale the existing composited surface during wheel bursts, then commit the
  // vector camera once scrolling pauses. Include SVG's centred letterboxing.
  const s = zoomSurface,
    scale = Math.min(s.width / s.box.w, s.height / s.box.h),
    f = s.box.w / viewBox.w;
  const x = ((s.width - s.box.w * scale) / 2) * (1 - f) + (s.box.x - viewBox.x) * scale * f;
  const y = ((s.height - s.box.h * scale) / 2) * (1 - f) + (s.box.y - viewBox.y) * scale * f;
  art.classList.add('zooming');
  art.style.transformOrigin = '0 0';
  art.style.transform = `translate3d(${x}px,${y}px,0) scale(${f})`;
  $('#zoom-label').textContent = Math.round(100000 / viewBox.w) + '%';
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => renderCanvas(), 160);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  try {
    if (b.dataset.linePreset) {
      const preset = LINE_PRESETS.find(p => p.id === b.dataset.linePreset);
      if (preset)
        editLine(s => {
          const old = s.stripes;
          s.stripes = preset.widths.map((width, i) => ({
            width,
            ...(old[i]?.colour ? { colour: old[i].colour } : {})
          }));
          s.gap = preset.gap;
        });
      return;
    }
    if (b.dataset.lineAdd) {
      editLine(s => {
        if (s.stripes.length < 5) s.stripes.push({ width: 4 });
      });
      return;
    }
    if (b.dataset.lineRemove !== undefined) {
      editLine(s => {
        if (s.stripes.length > 1) s.stripes.splice(Number(b.dataset.lineRemove), 1);
      });
      return;
    }
    if (b.dataset.lineInherit !== undefined) {
      editLine(s => delete s.stripes[Number(b.dataset.lineInherit)].colour);
      return;
    }
    if (b.dataset.fillType) {
      mutate(() => {
        if (b.dataset.fillType === 'gradient') editGradient(() => {});
        else setPaintProperty('fillType', 'solid');
      });
      return;
    }
    if (b.dataset.addStop) {
      mutate(() =>
        editGradient(g => {
          if (g.stops.length >= 8) return;
          let index = 0;
          for (let i = 1; i < g.stops.length - 1; i++)
            if (g.stops[i + 1].offset - g.stops[i].offset > g.stops[index + 1].offset - g.stops[index].offset)
              index = i;
          const a = g.stops[index],
            z = g.stops[index + 1];
          g.stops.splice(index + 1, 0, {
            offset: (a.offset + z.offset) / 2,
            colour: M.mixColour(a.colour, z.colour, 0.5)
          });
        })
      );
      return;
    }
    if (b.dataset.removeStop !== undefined) {
      mutate(() =>
        editGradient(g => {
          if (g.stops.length > 2) g.stops.splice(Number(b.dataset.removeStop), 1);
        })
      );
      return;
    }
    if (b.dataset.pinchPreset) {
      const p = { left: [-0.35, 0], right: [0.35, 0], top: [0, -0.35], bottom: [0, 0.35] }[b.dataset.pinchPreset];
      if (p) mutateFit(() => applyFit({ ...M.fitValues(fitTarget()), pinchX: p[0], pinchY: p[1] }));
      return;
    }
    if (b.dataset.fitPreset) {
      const preset = FIT_PRESETS.find(p => p.id === b.dataset.fitPreset);
      if (preset) mutateFit(() => applyFit(preset));
      return;
    }
    if (b.dataset.themeChoice) {
      themeSettings.choose(b.dataset.themeChoice);
      return;
    }
    if (b.dataset.action) {
      const result = actions[b.dataset.action]?.();
      if (result?.catch) result.catch(reportError);
      return;
    }
    if (b.dataset.tool) {
      const t = b.dataset.tool;
      if (t === 'prepare') actions.prepare();
      else if (t === 'image') $('#image-file').click();
      else if (t === 'text')
        addLayer(M.layer('text', { name: 'Race number', text: '27', font: 'Arial', w: 90, h: 75, fill: colour }));
      else setTool(t);
      return;
    }
    if (b.dataset.removeView) {
      removeProjectView(b.dataset.removeView);
      return;
    }
    if (b.dataset.view) {
      const k = b.dataset.view;
      if (project.template.views[k]) {
        currentView = k;
        resetViewSelection();
        fit();
        render();
      } else addCarDialog(k);
      return;
    }
    if (b.dataset.paletteAdd) {
      const c = b.dataset.paletteAdd;
      if ((project.palette || []).includes(c)) return toast('That colour is already a team colour.');
      mutate(() => (project.palette = M.validatePalette([...(project.palette || []), c])));
      toast('Added ' + c.toUpperCase() + ' to team colours.');
      return;
    }
    if (b.dataset.eyedropper) {
      await pickColour(b.dataset.eyedropper);
      return;
    }
    if (b.dataset.align) {
      alignArtwork(b.dataset.align);
      return;
    }
    if (b.dataset.swatch || b.dataset.pickColour) {
      applyColour(b.dataset.swatch || b.dataset.pickColour);
      return;
    }
    if (b.dataset.paintSelect) {
      selectPaint(b.dataset.paintSelect, ev.shiftKey || ev.ctrlKey || ev.metaKey);
      return;
    }
    if (b.dataset.paintExpand) {
      const name = b.dataset.paintExpand;
      expandedPaintGroups.has(name) ? expandedPaintGroups.delete(name) : expandedPaintGroups.add(name);
      renderInspector();
      return;
    }
    if (b.dataset.paintVisible) {
      mutate(() => {
        const parts = paintRegions(b.dataset.paintVisible),
          visible = parts.some(r => r.paintVisible !== false);
        for (const r of parts) r.paintVisible = !visible;
      });
      return;
    }
    if (b.dataset.finish) {
      mutate(() => setPaintProperty('finish', b.dataset.finish));
      return;
    }
    if (b.dataset.selectLayer) {
      chooseArtwork(b.dataset.selectLayer, ev.shiftKey || ev.ctrlKey || ev.metaKey);
      render();
      return;
    }
    if (b.dataset.artGroup) {
      chooseArtwork('group:' + b.dataset.artGroup, ev.shiftKey || ev.ctrlKey || ev.metaKey);
      render();
      return;
    }
    if (b.dataset.artExpand) {
      const id = b.dataset.artExpand;
      expandedArtworkGroups.has(id) ? expandedArtworkGroups.delete(id) : expandedArtworkGroups.add(id);
      renderInspector();
      return;
    }
    if (b.dataset.artGroupVisible) {
      mutate(() => {
        const members = layers().filter(l => l.groupId === b.dataset.artGroupVisible),
          hide = !members.every(l => l.groupHidden);
        members.forEach(l => (l.groupHidden = hide));
      });
      return;
    }
    if (b.dataset.lockLayer) {
      mutate(() => {
        const l = layers().find(a => a.id === b.dataset.lockLayer);
        if (l.locked) delete l.locked;
        else l.locked = true;
      });
      return;
    }
    if (b.dataset.visible) {
      mutate(() => {
        const l = layers().find(a => a.id === b.dataset.visible);
        l.visible = !l.visible;
      });
      return;
    }
    if (b.dataset.role) {
      mutate(() => {
        region().role = b.dataset.role;
        delete region().colour;
        updateBounds();
      });
      return;
    }
    if (b.dataset.selectRegion) {
      selectedRegion = b.dataset.selectRegion;
      renderCanvas();
      renderInspector();
      return;
    }
    if (b.dataset.pageKind) {
      const step = Number(b.dataset.pageStep);
      if (b.dataset.pageKind === 'library') {
        libraryPage += step;
        renderLibraryItems();
      } else if (b.dataset.pageKind === 'package') {
        packagePage += step;
        renderPackageItems();
      } else {
        projectPage += step;
        openProjects();
      }
      return;
    }
    if (b.dataset.libraryTab) {
      openLibrary(b.dataset.libraryTab);
      return;
    }
    if (b.dataset.libraryUse) {
      const tab = libraryTab,
        item = await libraryClient.hydrate(store, tab, b.dataset.libraryUse);
      if (!item || !b.isConnected || tab !== libraryTab) return;
      await FontLibrary.loadAll(item);
      if (b.isConnected && tab === libraryTab) useLibrary(b.dataset.libraryUse);
      return;
    }
    if (b.dataset.libraryEdit) {
      const tab = libraryTab;
      await libraryClient.hydrate(store, tab, b.dataset.libraryEdit);
      if (b.isConnected && tab === libraryTab) editLibraryDetails(b.dataset.libraryEdit);
      return;
    }
    if (b.dataset.libraryExport) {
      const a = store[libraryTab].find(a => a.id === b.dataset.libraryExport);
      exportPackage(
        { templates: 'template', liveries: 'livery', assets: 'asset', fonts: 'font' }[libraryTab],
        a,
        a.name
      ).catch(reportError);
      return;
    }
    if (b.dataset.libraryDelete) {
      const tab = libraryTab,
        id = b.dataset.libraryDelete;
      confirmAction(
        'Remove library item?',
        'Existing projects keep their own copy of this item.',
        () => {
          store[tab] = store[tab].filter(a => a.id !== id);
          scheduleSave();
          openLibrary(tab);
        },
        'Remove item'
      );
      return;
    }
    if (b.dataset.projectOpen) {
      const p = await libraryClient.hydrate(store, 'projects', b.dataset.projectOpen);
      if (!p || !b.isConnected) return;
      await FontLibrary.loadAll(p);
      if (!b.isConnected) return;
      closeDialog();
      setProject(p);
      return;
    }
    if (b.dataset.projectExport) {
      const p = store.projects.find(p => p.id === b.dataset.projectExport);
      exportPackage('project', p, p.name).catch(reportError);
      return;
    }
    if (b.dataset.projectDelete) {
      const id = b.dataset.projectDelete;
      confirmAction(
        'Delete this project?',
        'Its car template and saved library items will remain available.',
        () => {
          store.projects = store.projects.filter(p => p.id !== id);
          if (project?.id === id) {
            project = null;
            store.current = null;
            undo = [];
            redo = [];
            preparing = false;
            selected = null;
          }
          scheduleSave();
          render();
          openProjects();
        },
        'Delete project'
      );
      return;
    }
    if (b.dataset.preset) {
      addPreset(b.dataset.preset);
      return;
    }
  } catch (error) {
    reportError(error);
  }
});
document.addEventListener('change', async ev => {
  const el = ev.target;
  try {
    if (el.id === 'line-draw-colour') {
      colour = el.value;
      lineSettings.fill = colour;
      renderTools();
      renderCanvas();
      renderInspector();
      return;
    }
    if (el.id === 'line-total') {
      editLine(s => {
        const total = s.stripes.reduce((sum, a) => sum + a.width, 0) + s.gap * (s.stripes.length - 1),
          scale = M.number(el.value, 12, 0.5, 1000) / total;
        s.stripes.forEach(a => (a.width *= scale));
        s.gap *= scale;
      });
      return;
    }
    if (el.id === 'line-gap') {
      editLine(s => (s.gap = M.number(el.value, 4, 0, 200)));
      return;
    }
    if (el.id === 'line-cap') {
      editLine(s => (s.cap = el.value === 'round' ? 'round' : 'butt'));
      return;
    }
    if (el.dataset.lineWidth !== undefined) {
      editLine(s => (s.stripes[Number(el.dataset.lineWidth)].width = M.number(el.value, 12, 0.5, 200)));
      return;
    }
    if (el.dataset.lineColour !== undefined) {
      editLine(s => (s.stripes[Number(el.dataset.lineColour)].colour = M.colour(el.value)));
      return;
    }
    if (el.id === 'paint-preview') {
      store.settings = { ...store.settings, paintPreview: el.checked };
      scheduleSave();
      renderCanvas();
      renderViews();
      return;
    }
    if (el.dataset.gradientKey) {
      if (!gradientDraft) record();
      updateGradientInput(el);
      gradientDraft = false;
      changed();
      render();
      return;
    }
    if (el.dataset.stopColour !== undefined) {
      mutate(() => editGradient(g => (g.stops[Number(el.dataset.stopColour)].colour = M.colour(el.value))));
      return;
    }
    if (el.dataset.stopOffset !== undefined) {
      mutate(() =>
        editGradient(g => (g.stops[Number(el.dataset.stopOffset)].offset = M.number(el.value, 0, 0, 100) / 100))
      );
      return;
    }
    if (el.dataset.fitKey) {
      const scroll = $('#inspector .property-scroll')?.scrollTop || 0;
      if (!fitDraft) record();
      updateFitInput(el);
      fitDraft = false;
      if (fitFrame) {
        cancelAnimationFrame(fitFrame);
        fitFrame = 0;
      }
      changed();
      render();
      const pane = $('#inspector .property-scroll');
      if (pane) pane.scrollTop = scroll;
      return;
    }
    if (el.id === 'quick-colour') {
      colour = el.value;
      if (tool === 'line') {
        lineSettings.fill = colour;
        renderInspector();
      } else if (project && !preparing) applyColour(colour);
      return;
    }
    if (el.id === 'grid') {
      $('#canvas-wrap').classList.toggle('grid', el.checked);
      return;
    }
    if (el.id === 'property-colour' || el.id === 'hex-colour') {
      if (!/^#[0-9a-f]{6}$/i.test(el.value)) {
        toast('Enter a six-digit hex colour, such as #F28A35.');
        renderInspector();
        return;
      }
      applyColour(el.value);
      return;
    }
    if ((el.id === 'outline-width' || el.id === 'outline-colour') && selection()) {
      const width = M.number($('#outline-width')?.value, 0, 0, 500),
        colour = M.colour($('#outline-colour')?.value, '#ffffff');
      mutate(() => {
        const l = selection();
        delete l.outlineWidth;
        delete l.outlineColour;
        Object.assign(l, M.outlineValues({ kind: l.kind, outlineWidth: width, outlineColour: colour }));
      });
      return;
    }
    if (el.id === 'paint-effect') {
      mutate(() => setPaintProperty('effect', el.value));
      return;
    }
    if (el.id === 'group-width' || el.id === 'group-height') {
      const b = M.artworkBounds(artworkSelection());
      scaleSelectedArtwork(Number(el.value) / (el.id === 'group-width' ? b.w : b.h));
      return;
    }
    if (el.dataset.num && selection()) {
      const k = el.dataset.num;
      mutate(
        () =>
          (selection()[k] =
            k === 'rotation'
              ? M.angle(el.value)
              : M.number(
                  el.value,
                  k === 'opacity' ? 1 : 0,
                  k === 'w' || k === 'h' ? 2 : k === 'opacity' ? 0 : -10000,
                  k === 'opacity' ? 1 : 10000
                ))
      );
      return;
    }
    if (el.id === 'layer-name') {
      mutate(() => (selection().name = M.name(el.value)));
      return;
    }
    if (el.id === 'art-group-name') {
      mutate(() => artworkSelection().forEach(l => (l.groupName = M.name(el.value))));
      return;
    }
    if (el.id === 'text-value') {
      mutate(() => (selection().text = el.value.slice(0, 500)));
      return;
    }
    if (el.id === 'font-value') {
      const font = (store.fonts || []).find(f => f.fontData.family === el.value);
      if (font) {
        const loaded = await libraryClient.hydrate(store, 'fonts', font.id);
        await FontLibrary.loadAll(loaded);
        useFont(loaded);
      } else if (M.BUILTIN_FONTS.includes(el.value))
        mutate(() => {
          selection().font = el.value;
          delete selection().fontData;
        });
      return;
    }
    if (el.id === 'region-name') {
      mutate(() => (region().name = M.name(el.value)));
      return;
    }
    if (el.id === 'region-colour') {
      mutate(() => (region().colour = el.value));
      return;
    }
    if (el.id === 'trace-role') {
      traceRole = el.value;
      return;
    }
    if (el.id === 'show-photo') {
      activeView().showPhoto = el.checked;
      changed();
      renderCanvas();
      return;
    }
  } catch (error) {
    reportError(error);
  }
});
$('#car-file').onchange = async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file)
    try {
      await importCar(file);
    } catch (error) {
      reportError(error);
    }
};
$('#dialog').addEventListener('cancel', ev => {
  if (libraryDetailsReturn) {
    ev.preventDefault();
    closeDialog();
    return;
  }
  pendingAdd = null;
});
$('#font-file').onchange = async ev => {
  const files = [...ev.target.files];
  ev.target.value = '';
  if (files.length)
    try {
      await importFonts(files);
    } catch (error) {
      reportError(error);
    }
};
$('#image-file').onchange = async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file)
    try {
      await addImage(file);
    } catch (error) {
      reportError(error);
    }
};
$('#package-file').onchange = async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file)
    try {
      await readPackage(file);
    } catch (error) {
      reportError(error);
    }
};
$('#home-link').onclick = ev => {
  ev.preventDefault();
  actions.projects();
};

// Right-click a team colour to remove it from the design's palette.
document.addEventListener('contextmenu', ev => {
  const b = ev.target.closest('[data-team-colour]');
  if (!b || !project) return;
  ev.preventDefault();
  const c = b.dataset.teamColour;
  mutate(() => (project.palette = (project.palette || []).filter(x => x !== c)));
  toast('Removed ' + c.toUpperCase() + ' from team colours.');
});
