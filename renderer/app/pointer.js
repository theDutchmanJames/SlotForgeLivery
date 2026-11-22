// Livery renderer · Canvas pointer interaction: drawing, dragging, editing.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function canvasPoint(ev, snap = true) {
  const m = art.getScreenCTM().inverse(),
    p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
  if (snap && $('#snap').checked) return { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
  return { x: p.x, y: p.y };
}
art.addEventListener('pointerdown', ev => {
  // Finish a field being typed in (a name, a size) while its artwork is still
  // the selection; this click may select something else.
  if (document.activeElement?.closest?.('#inspector, #layers-panel')) document.activeElement.blur();
  if (zoomSurface) renderCanvas();
  if (!project) return;
  const temporaryPan = ev.button === 1 || (ev.button === 0 && ev.ctrlKey);
  if (ev.button !== 0 && !temporaryPan) return;
  if (colourPick && !temporaryPan) {
    ev.preventDefault();
    const target = colourPick,
      picked = canvasColourAt(ev);
    colourPick = null;
    if (picked) usePickedColour(target, picked);
    else toast('Imported artwork keeps its own colours; pick from a shape or panel.');
    return;
  }
  const p = canvasPoint(ev);
  if (temporaryPan || tool === 'hand') {
    ev.preventDefault();
    penCursor = null;
    closeSnap = false;
    renderCanvas();
    const rect = art.getBoundingClientRect();
    drag = {
      kind: 'pan',
      pointerId: ev.pointerId,
      start: { x: ev.clientX, y: ev.clientY },
      last: { x: ev.clientX, y: ev.clientY },
      box: { ...viewBox },
      scale: Math.min(rect.width / viewBox.w, rect.height / viewBox.h)
    };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    renderCanvas();
    return;
  }
  if (tool === 'polygon' || tool === 'line') {
    const closing = tool === 'polygon' && nearStart(ev);
    if (!closing) {
      if (drawPoints.length >= 2000)
        return toast('This shape has reached 2,000 points. Finish it before drawing another.');
      drawPoints.push(p);
    }
    const index = closing ? 0 : drawPoints.length - 1;
    drag = {
      kind: 'pen',
      index,
      closing,
      startClient: { x: ev.clientX, y: ev.clientY },
      original: M.clone(drawPoints[index])
    };
    closeSnap = closing;
    penCursor = null;
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    renderCanvas();
    renderInspector();
    return;
  }
  if (preparing) {
    selectedRegion = ev.target.closest('[data-region]')?.dataset.region || null;
    renderCanvas();
    renderInspector();
    return;
  }
  if (ev.shiftKey && ['select', 'nodes', 'paint'].includes(tool) && !ev.target.closest('[data-layer]')) {
    const id = ev.target.closest('[data-paint-region]')?.dataset.paintRegion;
    if (id) {
      selectPaint('r:' + id, true);
      return;
    }
  }
  if (tool === 'paint') {
    const id = ev.target.closest('[data-paint-region]')?.dataset.paintRegion;
    if (id) {
      if (!paintRegions().some(r => r.id === id)) selectedPaint = 'r:' + id;
      selected = null;
    }
    applyColour(colour);
    return;
  }

  if (tool === 'rect' || tool === 'ellipse') {
    if (!activeView().regions.some(r => r.role === 'body')) return toast('Define a paintable body first.');
    record();
    const l = M.layer(tool, {
      x: p.x,
      y: p.y,
      w: 2,
      h: 2,
      fill: colour,
      name: tool === 'rect' ? 'Rectangle' : 'Ellipse'
    });
    layers().push(l);
    multiSelected.clear();
    selected = l.id;
    selectedPaint = null;
    drag = { kind: 'draw', start: p };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    renderCanvas();
    renderInspector();
    return;
  }
  if (ev.target.dataset.curveHandle !== undefined && selection()) {
    selectedNode = Number(ev.target.dataset.curveHandle);
    drag = {
      startClient: { x: ev.clientX, y: ev.clientY },
      kind: 'curve-handle',
      index: selectedNode,
      side: ev.target.dataset.side
    };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    renderInspector();
    return;
  }
  if (ev.target.dataset.point !== undefined && selection()) {
    selectedNode = Number(ev.target.dataset.point);
    drag = {
      startClient: { x: ev.clientX, y: ev.clientY },
      kind: ev.altKey ? 'point-handles' : 'point',
      index: selectedNode,
      original: M.clone(selection().points[selectedNode])
    };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.target.dataset.groupResize) {
    drag = {
      kind: 'group-resize',
      startClient: { x: ev.clientX, y: ev.clientY },
      original: M.clone(artworkSelection()),
      bounds: M.artworkBounds(artworkSelection()),
      pointerId: ev.pointerId
    };
    art.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.target.dataset.handle && selection()) {
    drag = { startClient: { x: ev.clientX, y: ev.clientY }, kind: 'resize', start: p, original: M.clone(selection()) };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
    return;
  }
  const hit = layers().find(l => l.id === ev.target.closest('[data-layer]')?.dataset.layer);
  if (hit) {
    const key = hit.groupId && selected !== hit.id && !ev.altKey ? 'group:' + hit.groupId : hit.id;
    if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
      chooseArtwork(key, true);
      render();
      return;
    }
    if (ev.altKey || !artworkSelection().some(l => l.id === hit.id)) chooseArtwork(key);
    else if (artworkSelection().length === 1 && selected !== hit.id) chooseArtwork(key);
    const items = artworkSelection();
    if (items.some(l => l.locked)) {
      toast('This selection contains a locked layer. Unlock it in Layers to move it.');
      render();
      return;
    }
    drag =
      items.length > 1 || selected?.startsWith('group:')
        ? { kind: 'multi-move', start: p, original: M.clone(items) }
        : { kind: 'move', start: p, original: M.clone(hit) };
    drag.startClient = { x: ev.clientX, y: ev.clientY };
    drag.pointerId = ev.pointerId;
    art.setPointerCapture(ev.pointerId);
  } else {
    const id = ev.target.closest('[data-paint-region]')?.dataset.paintRegion,
      wasSelected = id && selectedPaint === 'r:' + id;
    selected = null;
    selectedPaint = null;
    selectedNode = null;
    multiSelected.clear();
    if (id && !wasSelected) {
      selectedPaint = 'r:' + id;
      const r = activeView().regions.find(r => r.id === id);
      expandedPaintGroups.add(r.partLabel || 'Unlabelled');
    }
  }
  renderCanvas();
  renderInspector();
});
art.addEventListener('pointermove', ev => {
  if ((tool === 'polygon' || tool === 'line') && !drag && drawPoints.length) {
    penCursor = canvasPoint(ev);
    closeSnap = tool === 'polygon' && nearStart(ev);
    scheduleFitCanvas();
    return;
  }
  if (!drag) return;
  if (drag.kind === 'pen') {
    if (Math.hypot(ev.clientX - drag.startClient.x, ev.clientY - drag.startClient.y) >= 3) {
      const q = canvasPoint(ev),
        p = drawPoints[drag.index];
      if (p) {
        p.out = { x: q.x, y: q.y };
        p.in = { x: 2 * p.x - q.x, y: 2 * p.y - q.y };
        p.smooth = true;
        scheduleFitCanvas();
      }
    }
    return;
  }
  if (drag.kind === 'pan') {
    drag.last = { x: ev.clientX, y: ev.clientY };
    viewBox = {
      ...drag.box,
      x: drag.box.x - (ev.clientX - drag.start.x) / drag.scale,
      y: drag.box.y - (ev.clientY - drag.start.y) / drag.scale
    };
    scheduleFitCanvas();
    return;
  }
  if (drag.kind !== 'draw' && !drag.recorded) {
    if (Math.hypot(ev.clientX - drag.startClient.x, ev.clientY - drag.startClient.y) < 3) return;
    record();
    drag.recorded = true;
  }
  const p = canvasPoint(ev);
  if (drag.kind === 'group-resize') {
    const b = drag.bounds,
      f = ((p.x - b.x) * b.w + (p.y - b.y) * b.h) / (b.w * b.w + b.h * b.h);
    try {
      replaceScaledArtwork(M.scaleArtwork(drag.original, f, { x: b.x, y: b.y }));
      scheduleFitCanvas();
    } catch {}
    return;
  }
  if (drag.kind === 'multi-move') {
    const d = snapMoveDelta(ev, drag.original);
    moveArtwork(drag.original, d.dx, d.dy);
    scheduleFitCanvas();
    return;
  }
  const l = selection();
  if (!l) return;
  if (drag.kind === 'move') {
    const d = snapMoveDelta(ev, [drag.original]);
    moveArtwork([drag.original], d.dx, d.dy);
  }

  if (drag.kind === 'draw') {
    l.x = Math.min(p.x, drag.start.x);
    l.y = Math.min(p.y, drag.start.y);
    l.w = Math.max(2, Math.abs(p.x - drag.start.x));
    l.h = Math.max(2, Math.abs(p.y - drag.start.y));
    if (ev.shiftKey) l.h = l.w;
  }
  if (drag.kind === 'resize') {
    const a = drag.original,
      q = M.inversePoint(M.layerMatrix(a), p);
    let w = Math.max(2, q.x),
      h = Math.max(2, q.y);
    if (ev.shiftKey || ['image', 'vector', 'text', 'ellipse'].includes(l.kind)) h = (w * a.h) / a.w;
    M.resizeLayer(l, a, w, h);
  }

  if (['point', 'point-handles', 'curve-handle'].includes(drag.kind)) {
    const q = M.inversePoint(M.layerMatrix(l), p),
      pos = { x: q.x / l.w, y: q.y / l.h },
      node = l.points[drag.index];
    if (drag.kind === 'point') {
      const original = drag.original,
        dx = pos.x - original.x,
        dy = pos.y - original.y;
      Object.assign(node, M.mapPathPoints([original], h => ({ x: h.x + dx, y: h.y + dy }))[0]);
    } else if (drag.kind === 'point-handles') {
      node.out = pos;
      node.in = { x: 2 * node.x - pos.x, y: 2 * node.y - pos.y };
      node.smooth = true;
    } else {
      node[drag.side] = pos;
      if (ev.altKey) node.smooth = false;
      if (node.smooth) node[drag.side === 'in' ? 'out' : 'in'] = { x: 2 * node.x - pos.x, y: 2 * node.y - pos.y };
    }
  }
  scheduleFitCanvas();
});
function endDrag(ev) {
  if (!drag) return;
  snapLines = null;
  const kind = drag.kind,
    modified = kind === 'draw' || drag.recorded;
  if (kind === 'pen') {
    const closing = drag.closing;
    if (ev.type === 'pointercancel') {
      if (closing) drawPoints[0] = drag.original;
      else drawPoints.pop();
    }
    drag = null;
    try {
      art.releasePointerCapture(ev.pointerId);
    } catch {}
    closeSnap = false;
    if (closing && ev.type !== 'pointercancel') finishDrawing();
    else {
      renderCanvas();
      renderInspector();
    }
    return;
  }
  if (kind === 'draw' && selection() && selection().w <= 3 && selection().h <= 3) {
    const l = selection();
    l.w = l.kind === 'ellipse' ? 100 : 180;
    l.h = 100;
    l.x = drag.start.x - l.w / 2;
    l.y = drag.start.y - l.h / 2;
  }
  drag = null;
  try {
    art.releasePointerCapture(ev.pointerId);
  } catch {}
  if (kind !== 'pan') {
    if (modified) changed();
    if (kind === 'draw') tool = 'select';
    render();
  } else renderCanvas();
}
art.addEventListener('auxclick', ev => {
  if (ev.button === 1) ev.preventDefault();
});
art.addEventListener('pointerup', endDrag);
art.addEventListener('pointercancel', endDrag);
art.addEventListener('lostpointercapture', ev => {
  if (drag && drag.pointerId === ev.pointerId) endDrag({ type: 'pointercancel', pointerId: ev.pointerId });
});
window.addEventListener('blur', () => {
  if (drag) endDrag({ type: 'pointercancel', pointerId: drag.pointerId });
});
art.addEventListener('pointerleave', () => {
  if (!drag) {
    penCursor = null;
    closeSnap = false;
    renderCanvas();
  }
});
art.addEventListener('contextmenu', ev => {
  if (tool !== 'line' || !project || preparing) return;
  ev.preventDefault();
  if (drawPoints.length >= 2) {
    drag = null;
    finishDrawing();
  }
});
$('#canvas-wrap').addEventListener(
  'wheel',
  ev => {
    if (!project || !activeView()) return;
    ev.preventDefault();
    zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, canvasPoint(ev, false));
  },
  { passive: false }
);
