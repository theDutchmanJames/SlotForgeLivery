// Livery renderer · Rulers, guides and smart snapping.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
// Rulers and guides are shown together; guides are stored per view in the
// project as artboard coordinates: project.guides[view] = { x: [...], y: [...] }.
const RULER_SIZE = 18;
let snapLines = null,
  guideDrag = null;
const rulersOn = () => !!project && !!activeView() && store.settings?.showRulers === true;
function viewGuides(create = false) {
  if (!project) return { x: [], y: [] };
  const all = project.guides || (create ? (project.guides = {}) : {});
  return all[currentView] || (create ? (all[currentView] = { x: [], y: [] }) : { x: [], y: [] });
}
// Lines that moving artwork can snap to: guides, the car's edges and centre,
// and the edges and centres of paintable panels.
function snapTargets() {
  const v = activeView(),
    x = [],
    y = [];
  if (!v) return { x, y };
  const add = b => {
    x.push(b.x, b.x + b.w / 2, b.x + b.w);
    y.push(b.y, b.y + b.h / 2, b.y + b.h);
  };
  add(v.bounds);
  v.regions.filter(r => r.role === 'body' && r.bounds).forEach(r => add(r.bounds));
  if (rulersOn()) {
    const g = viewGuides();
    x.push(...g.x);
    y.push(...g.y);
  }
  return { x, y };
}
// With Snap on, a moved selection snaps to the nearest target line; axes
// without a nearby line fall back to the 10-unit grid.
function snapMoveDelta(ev, originals) {
  const p = canvasPoint(ev);
  let dx = p.x - drag.start.x,
    dy = p.y - drag.start.y;
  snapLines = null;
  if (!$('#snap').checked || !originals.length) return { dx, dy };
  const raw = canvasPoint(ev, false),
    rx = raw.x - drag.start.x,
    ry = raw.y - drag.start.y,
    b = M.artworkBounds(originals),
    s = M.smartSnap({ x: b.x + rx, y: b.y + ry, w: b.w, h: b.h }, snapTargets(), screenUnits(7));
  if (s.x !== null) dx = rx + s.dx;
  if (s.y !== null) dy = ry + s.dy;
  if (s.x !== null || s.y !== null) snapLines = { x: s.x, y: s.y };
  return { dx, dy };
}
function guidesMarkup() {
  let markup = '';
  const far = 5000;
  if (rulersOn()) {
    const g = viewGuides(),
      hit = screenUnits(6);
    for (const [axis, list] of [
      ['x', g.x],
      ['y', g.y]
    ])
      list.forEach((value, i) => {
        const [x1, y1, x2, y2] = axis === 'x' ? [value, -far, value, far] : [-far, value, far, value];
        markup += `<g class="guide" data-guide="${axis}:${i}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="guide-hit" stroke-width="${hit}"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="guide-line" stroke-width="${screenUnits(1)}"/></g>`;
      });
  }
  if (snapLines) {
    const w = screenUnits(1);
    if (snapLines.x !== null)
      markup += `<line class="snap-line" x1="${snapLines.x}" y1="${-far}" x2="${snapLines.x}" y2="${far}" stroke-width="${w}"/>`;
    if (snapLines.y !== null)
      markup += `<line class="snap-line" x1="${-far}" y1="${snapLines.y}" x2="${far}" y2="${snapLines.y}" stroke-width="${w}"/>`;
  }
  return markup;
}
function rulerStep(pxPerUnit) {
  return [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => s * pxPerUnit >= 60) || 1000;
}
function renderRulers() {
  const show = rulersOn();
  // SVG elements have no .hidden property, so toggle the attribute itself.
  for (const id of ['#ruler-top', '#ruler-left', '#ruler-corner']) $(id).toggleAttribute('hidden', !show);
  $('#canvas-wrap').classList.toggle('with-rulers', show);
  if (!show) return;
  const wrap = $('#canvas-wrap').getBoundingClientRect(),
    m = art.getScreenCTM();
  if (!m || !wrap.width) return;
  // With a real size set, rulers read millimetres from the car's own edge.
  const mm = M.mmPerUnit(activeView()),
    bounds = activeView().bounds;
  $('#ruler-corner').textContent = mm ? 'mm' : '';
  const draw = (svg, horizontal) => {
    const length = horizontal ? wrap.width : wrap.height,
      pxPerUnit = horizontal ? m.a : m.d,
      scale = mm ? pxPerUnit / mm : pxPerUnit,
      offset =
        (horizontal ? m.e - wrap.left : m.f - wrap.top) + (mm ? (horizontal ? bounds.x : bounds.y) * pxPerUnit : 0),
      step = rulerStep(scale),
      minor = step / (String(step).startsWith('25') ? 5 : step % 5 === 0 ? 5 : 2),
      from = Math.floor((RULER_SIZE - offset) / scale / minor) * minor,
      to = (length - offset) / scale;
    let ticks = '';
    // A hidden or collapsing canvas reports a zero scale, which would make the
    // tick range infinite. Draw nothing then, and never more than 2,000 ticks.
    if (!(scale > 1e-3) || !Number.isFinite(from) || !Number.isFinite(to) || (to - from) / minor > 2000) {
      svg.innerHTML = '';
      return;
    }
    for (let u = from; u <= to; u += minor) {
      const pos = Math.round(u * scale + offset) + 0.5,
        major = Math.abs(u / step - Math.round(u / step)) < 1e-6,
        size = major ? RULER_SIZE - 4 : 5;
      if (pos < RULER_SIZE) continue;
      ticks += horizontal
        ? `<line x1="${pos}" y1="${RULER_SIZE}" x2="${pos}" y2="${RULER_SIZE - size}"/>`
        : `<line y1="${pos}" x1="${RULER_SIZE}" y2="${pos}" x2="${RULER_SIZE - size}"/>`;
      if (major)
        ticks += horizontal
          ? `<text x="${pos + 3}" y="9">${Math.round(u)}</text>`
          : `<text x="9" y="${pos + 3}" transform="rotate(-90 9 ${pos + 3})">${Math.round(u)}</text>`;
    }
    svg.setAttribute('viewBox', horizontal ? `0 0 ${length} ${RULER_SIZE}` : `0 0 ${RULER_SIZE} ${length}`);
    svg.innerHTML = ticks;
  };
  draw($('#ruler-top'), true);
  draw($('#ruler-left'), false);
}
// Drag from the top ruler for a horizontal guide, from the left ruler for a
// vertical one. Dropping a guide back on a ruler removes it.
function startGuideDrag(ev, axis, index) {
  ev.preventDefault();
  ev.stopImmediatePropagation();
  record();
  const g = viewGuides(true);
  if (index === null) {
    const p = canvasPoint(ev, false);
    g[axis].push(axis === 'x' ? p.x : p.y);
    index = g[axis].length - 1;
  }
  guideDrag = { axis, index, pointerId: ev.pointerId, target: ev.target };
  ev.target.setPointerCapture?.(ev.pointerId);
  renderCanvas();
}
function overRuler(ev, axis) {
  const wrap = $('#canvas-wrap').getBoundingClientRect();
  return axis === 'y' ? ev.clientY < wrap.top + RULER_SIZE : ev.clientX < wrap.left + RULER_SIZE;
}
document.addEventListener('pointerdown', ev => {
  if (!rulersOn() || ev.button !== 0) return;
  if (ev.target.closest('#ruler-top')) startGuideDrag(ev, 'y', null);
  else if (ev.target.closest('#ruler-left')) startGuideDrag(ev, 'x', null);
});
// Capture phase on the artboard, so a guide is dragged instead of the artwork below it.
art.addEventListener(
  'pointerdown',
  ev => {
    const guide = ev.target.closest('[data-guide]');
    if (!guide || !rulersOn() || ev.button !== 0) return;
    const [axis, index] = guide.dataset.guide.split(':');
    startGuideDrag(ev, axis, Number(index));
  },
  true
);
document.addEventListener('pointermove', ev => {
  if (!guideDrag || ev.pointerId !== guideDrag.pointerId) return;
  const p = canvasPoint(ev);
  viewGuides(true)[guideDrag.axis][guideDrag.index] = guideDrag.axis === 'x' ? p.x : p.y;
  renderCanvas();
});
document.addEventListener('pointerup', ev => {
  if (!guideDrag || ev.pointerId !== guideDrag.pointerId) return;
  const { axis, index } = guideDrag;
  guideDrag = null;
  if (overRuler(ev, axis)) {
    viewGuides(true)[axis].splice(index, 1);
    toast('Guide removed.');
  }
  changed();
  renderCanvas();
});
