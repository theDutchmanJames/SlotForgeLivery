// Livery renderer · Line/stripe settings and the "Fit to angled view" controls.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const LINE_PRESETS = [
  { id: 'single', name: 'Single', widths: [12], gap: 4 },
  { id: 'double', name: 'Double', widths: [8, 8], gap: 5 },
  { id: 'triple', name: 'Triple', widths: [6, 6, 6], gap: 4 },
  { id: 'pinstripe', name: 'Thick centre', widths: [3, 16, 3], gap: 4 },
  { id: 'offset', name: 'Thick + thin', widths: [16, 4], gap: 4 }
];
let lineSettings = M.layer('line');
function lineTarget() {
  return tool === 'line' ? lineSettings : selection()?.kind === 'line' ? selection() : null;
}
function editLine(fn) {
  const target = lineTarget();
  if (!target) return;
  const scroller = $('#inspector .property-scroll') || $('#inspector'),
    scroll = scroller.scrollTop;
  const apply = () => {
    const style = M.lineStyle(target);
    fn(style);
    M.setLineStyle(target, style);
  };
  if (tool === 'line') {
    apply();
    renderCanvas();
    renderInspector();
  } else mutate(apply);
  ($('#inspector .property-scroll') || $('#inspector')).scrollTop = scroll;
}
function lineFields(l) {
  const style = M.lineStyle(l);
  return `<section class="line-controls"><h3>Line & stripes</h3><div class="line-presets">${LINE_PRESETS.map(p => {
    const total = p.widths.reduce((a, b) => a + b, 0) + p.gap * (p.widths.length - 1);
    let y = 0;
    return `<button data-line-preset="${p.id}" title="${p.name}" aria-label="${p.name} line"><svg viewBox="0 0 100 ${total}" aria-hidden="true">${p.widths
      .map(w => {
        const rect = `<rect x="0" y="${y}" width="100" height="${w}" fill="currentColor"/>`;
        y += w + p.gap;
        return rect;
      })
      .join('')}</svg><span>${p.name}</span></button>`;
  }).join(
    ''
  )}</div><div class="row"><div class="field"><label for="line-total">Overall thickness</label><input id="line-total" type="number" min=".5" max="1000" step=".5" value="${+M.lineThickness(l).toFixed(2)}"></div><div class="field"><label for="line-gap">Gap</label><input id="line-gap" type="number" min="0" max="200" step=".5" value="${+style.gap.toFixed(2)}" ${style.stripes.length === 1 ? 'disabled' : ''}></div></div><div class="field"><label for="line-cap">Ends</label><select id="line-cap"><option value="butt" ${style.cap === 'butt' ? 'selected' : ''}>Flat</option><option value="round" ${style.cap === 'round' ? 'selected' : ''}>Rounded</option></select></div><div class="line-stripes">${style.stripes.map((stripe, i) => `<div class="line-stripe"><label for="stripe-width-${i}">Stripe ${i + 1}</label><input id="stripe-width-${i}" data-line-width="${i}" type="number" min=".5" max="200" step=".5" value="${+stripe.width.toFixed(2)}" aria-label="Stripe ${i + 1} thickness"><input type="color" data-line-colour="${i}" value="${stripe.colour || l.fill}" aria-label="Stripe ${i + 1} colour"><button data-line-inherit="${i}" ${stripe.colour ? '' : 'disabled'} title="Use the main fill for stripe ${i + 1}">Fill</button><button data-line-remove="${i}" ${style.stripes.length === 1 ? 'disabled' : ''} aria-label="Remove stripe ${i + 1}">×</button></div>`).join('')}</div><button data-line-add="true" class="wide" ${style.stripes.length >= 5 ? 'disabled' : ''}>+ Add stripe</button><p class="note">Set each stripe’s thickness and colour. Fill restores the main colour or gradient. Dimensions are canvas units.</p></section>`;
}
const FIT_PRESETS = [
  { id: 'lean-left', name: 'Gentle left', skewX: -15, skewY: 0, scaleX: 1, scaleY: 1 },
  { id: 'lean-right', name: 'Gentle right', skewX: 15, skewY: 0, scaleX: 1, scaleY: 1 },
  { id: 'side-left', name: 'Side left', skewX: 0, skewY: -18, scaleX: 0.72, scaleY: 1 },
  { id: 'side-right', name: 'Side right', skewX: 0, skewY: 18, scaleX: 0.72, scaleY: 1 },
  { id: 'bonnet-left', name: 'Bonnet left', skewX: -28, skewY: 0, scaleX: 1, scaleY: 0.55 },
  { id: 'bonnet-right', name: 'Bonnet right', skewX: 28, skewY: 0, scaleX: 1, scaleY: 0.55 }
];
function mutateFit(fn) {
  const scroll = $('#inspector .property-scroll')?.scrollTop || 0;
  mutate(fn);
  const pane = $('#inspector .property-scroll');
  if (pane) pane.scrollTop = scroll;
}
function fitTarget() {
  return selected?.startsWith('group:') ? artworkSelection()[0]?.groupPose || {} : selection() || {};
}
function applyFit(values) {
  const items = artworkSelection();
  if (!items.length) return;
  const fit = { ...M.fitValues(values), ...M.pinchValues({ ...fitTarget(), ...values }) };
  if (selected?.startsWith('group:')) {
    const b = M.artworkBounds(items.map(l => ({ ...l, groupPose: undefined }))),
      old = items[0].groupPose,
      pose = { ...fit, x: old?.x ?? b.x + b.w / 2, y: old?.y ?? b.y + b.h / 2, w: old?.w ?? b.w, h: old?.h ?? b.h };
    items.forEach(l => (l.groupPose = { ...pose }));
  } else if (items.length === 1) Object.assign(items[0], fit);
}
function fitPreview(p) {
  const m = M.fitMatrix(p);
  m[4] = 44 - m[0] * 22 - m[2] * 12;
  m[5] = 27 - m[1] * 22 - m[3] * 12;
  return `<svg viewBox="0 0 88 56" aria-hidden="true"><rect class="fit-reference" x="22" y="15" width="44" height="24"/><g transform="matrix(${m.join(' ')})"><rect class="fit-surface" width="44" height="24" rx="2"/><path class="fit-stripe" d="M7 0H16L27 24H18Z"/><text x="31" y="17">27</text></g></svg>`;
}
function fitFields() {
  const f = { ...M.fitValues(fitTarget()), ...M.pinchValues(fitTarget()) };
  return `<details class="fit-controls" ${fitPanelOpen ? 'open' : ''}><summary>Fit to angled view</summary><p class="note">Choose a starting angle, then adjust it to follow the car panel.</p><div class="fit-presets">${FIT_PRESETS.map(p => `<button data-fit-preset="${p.id}" title="${p.name}: skew ${p.skewX || p.skewY}°, width ${Math.round(p.scaleX * 100)}%, height ${Math.round(p.scaleY * 100)}%">${fitPreview(p)}<span>${p.name}</span></button>`).join('')}</div>${[
    ['skewX', 'Horizontal skew', -60, 60, 1, '°'],
    ['skewY', 'Vertical skew', -60, 60, 1, '°'],
    ['scaleX', 'Width compression', 25, 150, 1, '%'],
    ['scaleY', 'Height compression', 25, 150, 1, '%']
  ]
    .map(([key, label, min, max, step, unit]) => {
      const value = Math.round(f[key] * (unit === '%' ? 100 : 1));
      return `<div class="fit-field"><label for="fit-${key}">${label}</label><div class="row"><input id="fit-${key}" data-fit-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input data-fit-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} ${unit}"><span>${unit}</span></div></div>`;
    })
    .join(
      ''
    )}<div class="pinch-section"><h3>Pinch the far end</h3><p class="note">Narrow one end to make the artwork recede. 0% keeps both ends equal.</p><div class="pinch-presets">${[
    ['left', 'Left', -0.35, 0],
    ['right', 'Right', 0.35, 0],
    ['top', 'Top', 0, -0.35],
    ['bottom', 'Bottom', 0, 0.35]
  ]
    .map(([id, label, x, y]) => {
      const m = M.pinchMatrix({ pinchX: x, pinchY: y }, { x: 8, y: 5, w: 48, h: 28 }),
        points = [
          { x: 8, y: 5 },
          { x: 56, y: 5 },
          { x: 56, y: 33 },
          { x: 8, y: 33 }
        ].map(p => M.transformPoint(m, p));
      return `<button data-pinch-preset="${id}" title="Pinch ${label.toLowerCase()} end"><svg viewBox="0 0 64 38" aria-hidden="true"><polygon class="fit-surface" points="${points.map(p => p.x + ',' + p.y).join(' ')}"/></svg>${label}</button>`;
    })
    .join('')}</div>${[
    ['pinchX', 'Left (−) / Right (+)'],
    ['pinchY', 'Top (−) / Bottom (+)']
  ]
    .map(
      ([key, label]) =>
        `<div class="fit-field"><label for="fit-${key}">${label}</label><div class="row"><input id="fit-${key}" data-fit-key="${key}" type="range" min="-80" max="80" value="${Math.round(f[key] * 100)}"><input data-fit-key="${key}" type="number" min="-80" max="80" value="${Math.round(f[key] * 100)}" aria-label="${label} pinch %"><span>%</span></div></div>`
    )
    .join(
      ''
    )}<button class="wide quiet" data-action="reset-pinch">Reset pinch</button></div><button class="wide" data-action="reset-fit">Reset all fitting</button><p class="note">100% keeps the original proportions. These are 2D fitting guides; adjust placement to match your view.</p></details>`;
}
let fitFrame = 0;
function scheduleFitCanvas() {
  if (!fitFrame)
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      renderCanvas();
    });
}
window.addEventListener('perspective-ready', () => {
  renderCanvas();
  if (!fitDraft) renderViews();
});
window.addEventListener('mask-preview-ready', () => scheduleFitCanvas());
function updateFitInput(el) {
  const key = el.dataset.fitKey,
    values = { ...M.fitValues(fitTarget()), ...M.pinchValues(fitTarget()) };
  values[key] = Number(el.value) / (key.startsWith('scale') || key.startsWith('pinch') ? 100 : 1);
  applyFit(values);
  document
    .querySelectorAll(`[data-fit-key="${key}"]`)
    .forEach(
      input =>
        (input.value = Math.round(
          { ...M.fitValues(fitTarget()), ...M.pinchValues(fitTarget()) }[key] *
            (key.startsWith('scale') || key.startsWith('pinch') ? 100 : 1)
        ))
    );
  scheduleFitCanvas();
}
document.addEventListener(
  'toggle',
  ev => {
    if (ev.target.matches('.fit-controls')) fitPanelOpen = ev.target.open;
  },
  true
);
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset.fitKey || el.type !== 'range') return;
  if (!fitDraft) {
    record();
    fitDraft = true;
  }
  updateFitInput(el);
});
