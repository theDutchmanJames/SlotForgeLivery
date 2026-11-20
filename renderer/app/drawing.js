// Livery renderer · Layer creation, drawing tools, path editing and preset shapes.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function mutate(fn) {
  record();
  fn();
  changed();
  render();
}
function addLayer(l) {
  if (!activeView()?.regions.some(r => r.role === 'body'))
    return toast('Prepare at least one paintable body region first.');
  mutate(() => {
    layers().push(l);
    chooseArtwork(l.id);
    preparing = false;
    tool = 'select';
  });
}
// A paint product reference travels with the colour when chosen from the
// catalogue; any other colour change clears it, as it no longer matches.
function applyColour(c, ref = null) {
  c = M.colour(c, colour);
  // A livery colour brings its real paint along.
  ref = ref ?? (project ? liveryColour(c)?.ref : null) ?? null;
  colour = c;
  const recent = store.settings?.recentColours || [];
  store.settings = { ...store.settings, recentColours: [c, ...recent.filter(x => x !== c)].slice(0, 8) };
  mutate(() => {
    const items = artworkSelection(),
      parts = paintRegions();
    const setRef = item => {
      if (ref) item.paintRef = ref;
      else delete item.paintRef;
    };
    if (items.length) {
      items
        .filter(l => !['image', 'vector'].includes(l.kind))
        .forEach(l => {
          l.fill = c;
          setRef(l);
        });
    } else if (parts.length) {
      for (const r of parts) {
        r.colour = c;
        r.paintVisible = true;
        setRef(r);
      }
    } else {
      project.base = c;
      setRef(project);
    }
  });
}
// Eyedropper: the system picker samples any pixel on screen. Without it, the
// next canvas click takes the exact paint colour of the shape or panel hit.
let colourPick = null;
function hexFromPicker(value) {
  const rgb = String(value).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return rgb
    ? '#' +
        rgb
          .slice(1, 4)
          .map(n => Number(n).toString(16).padStart(2, '0'))
          .join('')
    : M.colour(String(value).toLowerCase(), null);
}
function usePickedColour(target, value) {
  const c = hexFromPicker(value);
  if (!c) return toast('That colour could not be read.');
  if (target === 'outline') {
    const l = selection();
    if (!l) return;
    mutate(() =>
      Object.assign(l, M.outlineValues({ kind: l.kind, outlineWidth: l.outlineWidth || 2, outlineColour: c }))
    );
  } else applyColour(c);
  toast('Picked ' + c.toUpperCase() + '.');
}
async function pickColour(target) {
  if (window.EyeDropper) {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      return usePickedColour(target, sRGBHex);
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  colourPick = target;
  toast('Click a shape or panel on the canvas to pick its colour. Esc cancels.');
}
function canvasColourAt(ev) {
  const hit = layers().find(l => l.id === ev.target.closest('[data-layer]')?.dataset.layer);
  if (hit) return ['image', 'vector'].includes(hit.kind) ? null : hit.fill;
  const id = ev.target.closest('[data-paint-region]')?.dataset.paintRegion,
    r = id && activeView()?.regions.find(r => r.id === id);
  return r ? M.paintOf(project, r).fill : project.base;
}
function finishDrawing() {
  const isLine = tool === 'line';
  if (drawPoints.length < (isLine ? 2 : 3))
    return toast(isLine ? 'Add at least two points.' : 'Add at least three points.');
  const pts = M.clone(drawPoints);
  record();
  if (preparing) {
    const b = M.pathBounds(pts),
      r = {
        id: M.uid(),
        name:
          (traceRole === 'body' ? 'Body' : traceRole === 'protected' ? 'Protected area' : 'Detail') +
          ' ' +
          (activeView().regions.length + 1),
        role: traceRole,
        markup: `<path data-geometry="true" d="${M.pathData(pts)}"/>`,
        bounds: b
      };
    activeView().regions.push(r);
    selectedRegion = r.id;
    updateBounds();
  } else {
    const l = isLine
      ? M.lineFromPoints(pts, { ...M.clone(lineSettings), id: M.uid(), fill: colour })
      : M.shapeFromPoints(pts, { fill: colour });
    layers().push(l);
    chooseArtwork(l.id);
  }
  drawPoints = [];
  penCursor = null;
  closeSnap = false;
  tool = 'select';
  changed();
  render();
}
function screenUnits(px) {
  const m = art.getScreenCTM();
  return px / Math.max(0.001, Math.hypot(m.a, m.b));
}
function nearStart(ev) {
  if (drawPoints.length < 3) return false;
  const p = new DOMPoint(drawPoints[0].x, drawPoints[0].y).matrixTransform(art.getScreenCTM());
  return Math.hypot(p.x - ev.clientX, p.y - ev.clientY) <= 12;
}
function pathControls(points, editable) {
  const r = screenUnits(4.5);
  return points
    .map((p, i) => {
      let markup = '';
      for (const side of ['in', 'out'])
        if (p[side]) {
          const h = p[side];
          markup += `<line class="curve-arm" x1="${p.x}" y1="${p.y}" x2="${h.x}" y2="${h.y}"/><circle ${editable ? `data-curve-handle="${i}" data-side="${side}"` : ''} class="curve-handle" cx="${h.x}" cy="${h.y}" r="${r}"/>`;
        }
      return (
        markup +
        `<circle ${editable ? `data-point="${i}"` : ''} class="draw-point ${editable && selectedNode === i ? 'active-node' : ''} ${!editable && i === 0 ? 'start-node' : ''}" cx="${p.x}" cy="${p.y}" r="${r}"/>`
      );
    })
    .join('');
}
function changePointType(smooth) {
  const l = selection(),
    i = selectedNode;
  if (!l?.points || i === null || !l.points[i]) return;
  mutate(() => {
    const p = l.points[i];
    if (!smooth) {
      delete p.in;
      delete p.out;
      delete p.smooth;
      return;
    }
    const prev = l.points[l.kind === 'line' ? Math.max(0, i - 1) : (i + l.points.length - 1) % l.points.length],
      next = l.points[l.kind === 'line' ? Math.min(l.points.length - 1, i + 1) : (i + 1) % l.points.length],
      dx = (next.x - prev.x) * l.w,
      dy = (next.y - prev.y) * l.h,
      len = Math.hypot(dx, dy) || 1,
      reach =
        (prev === p
          ? Math.hypot((next.x - p.x) * l.w, (next.y - p.y) * l.h)
          : next === p
            ? Math.hypot((p.x - prev.x) * l.w, (p.y - prev.y) * l.h)
            : Math.min(
                Math.hypot((p.x - prev.x) * l.w, (p.y - prev.y) * l.h),
                Math.hypot((next.x - p.x) * l.w, (next.y - p.y) * l.h)
              )) / 3;
    const x = ((dx / len) * reach) / l.w,
      y = ((dy / len) * reach) / l.h;
    p.in = { x: p.x - x, y: p.y - y };
    p.out = { x: p.x + x, y: p.y + y };
    p.smooth = true;
  });
}

function shapesDialog() {
  openDialog(
    'Add a shape',
    'Start with a familiar shape, then adjust it on the car.',
    `<div class="choice-grid">${[
      ['rect', 'Rectangle / stripe'],
      ['ellipse', 'Roundel'],
      ['diagonal', 'Diagonal band'],
      ['chevron', 'Chevron'],
      ['number-board', 'Number board'],
      ['number-roundel', 'Number roundel'],
      ['chequers', 'Chequered band'],
      ['shield', 'Shield badge'],
      ['star', 'Star']
    ]
      .map(
        ([k, n]) =>
          `<button class="choice-card" data-preset="${k}">${icon(['ellipse', 'number-roundel'].includes(k) ? 'ellipse' : 'rect')}<strong>${n}</strong><small>${['number-board', 'number-roundel', 'chequers'].includes(k) ? 'An editable group: change each part' : 'Editable colour, position and size'}</small></button>`
      )
      .join('')}</div><button data-action="custom-shape">${icon('pen')}Draw my own shape</button>`
  );
}
// Grouped presets are placed at the centre of the car as one editable group.
function addPresetGroup(name, parts) {
  if (!activeView()?.regions.some(r => r.role === 'body'))
    return toast('Prepare at least one paintable body region first.');
  const b = activeView().bounds,
    box = M.boundsOfPoints(
      parts.flatMap(l => [
        { x: l.x, y: l.y },
        { x: l.x + l.w, y: l.y + l.h }
      ])
    ),
    dx = b.x + b.w / 2 - (box.x + box.w / 2),
    dy = b.y + b.h / 2 - (box.y + box.h / 2),
    groupId = M.uid();
  mutate(() => {
    for (const l of parts)
      layers().push({ ...l, x: l.x + dx, y: l.y + dy, groupId, groupName: name, groupHidden: false });
    chooseArtwork('group:' + groupId);
    preparing = false;
    tool = 'select';
  });
}
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5,
    r = i % 2 ? 0.2 : 0.5;
  return { x: 0.5 + r * Math.cos(a), y: 0.52 + r * Math.sin(a) };
});
function addPreset(kind) {
  closeDialog();
  const number = (box, fill) =>
    M.layer('text', { name: 'Race number', text: '27', fill, x: box.x, y: box.y, w: box.w, h: box.h });
  if (kind === 'number-board')
    return addPresetGroup('Number board', [
      M.layer('rect', {
        name: 'Board',
        fill: '#ffffff',
        x: 0,
        y: 0,
        w: 120,
        h: 90,
        outlineWidth: 2,
        outlineColour: '#1f2a35'
      }),
      number({ x: 22, y: 14, w: 76, h: 62 }, '#1f2a35')
    ]);
  if (kind === 'number-roundel')
    return addPresetGroup('Number roundel', [
      M.layer('ellipse', { name: 'Roundel', fill: '#ffffff', x: 0, y: 0, w: 100, h: 100 }),
      number({ x: 22, y: 24, w: 56, h: 52 }, '#1f2a35')
    ]);
  if (kind === 'chequers') {
    const size = 14,
      parts = [M.layer('rect', { name: 'White band', fill: '#ffffff', x: 0, y: 0, w: size * 10, h: size * 3 })];
    for (let row = 0; row < 3; row++)
      for (let col = row % 2; col < 10; col += 2)
        parts.push(
          M.layer('rect', { name: 'Square', fill: '#1f2a35', x: col * size, y: row * size, w: size, h: size })
        );
    return addPresetGroup('Chequered band', parts);
  }
  let l = M.layer(kind === 'ellipse' ? 'ellipse' : 'rect', { fill: colour });
  if (kind === 'shield')
    l = M.layer('polygon', {
      fill: colour,
      name: 'Shield badge',
      w: 90,
      h: 110,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0.55, out: { x: 1, y: 0.85 } },
        { x: 0.5, y: 1, in: { x: 0.85, y: 0.9 }, out: { x: 0.15, y: 0.9 }, smooth: true },
        { x: 0, y: 0.55, in: { x: 0, y: 0.85 } }
      ]
    });
  if (kind === 'star') l = M.layer('polygon', { fill: colour, name: 'Star', w: 100, h: 100, points: STAR_POINTS });
  if (kind === 'ellipse') {
    l.w = 90;
    l.h = 90;
    l.name = 'Roundel';
  }
  if (kind === 'diagonal')
    l = M.layer('polygon', {
      fill: colour,
      name: 'Diagonal stripe',
      points: [
        { x: 0.3, y: 0 },
        { x: 1, y: 0 },
        { x: 0.7, y: 1 },
        { x: 0, y: 1 }
      ]
    });
  if (kind === 'chevron')
    l = M.layer('polygon', {
      fill: colour,
      name: 'Chevron',
      points: [
        { x: 0, y: 0 },
        { x: 0.65, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.65, y: 1 },
        { x: 0, y: 1 },
        { x: 0.35, y: 0.5 }
      ]
    });
  addLayer(l);
}
