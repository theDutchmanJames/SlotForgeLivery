// Livery renderer · The pair: two sides of the car next to each other, and layers kept in step.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// "One side", "Left + Right", "Front + Rear" or any two above the canvas. The side you work on is
// the real canvas; the other is drawn live next to it in the same place on screen, and a click
// on it makes that side the one you work on. Sides keep their order: Left is always on the left.
//
// A layer can be on both sides of the pair. Layers that share a `pairLink` are kept in step: the
// side you edit is copied to the others after every change (in the same undo step), mirrored
// (`pairMode` "mirror": the placement and shapes mirror, text and decals stay readable) or the
// same. The spine between the sides has a dot at the height of each linked layer; a dot, or the
// ⇄ in Layers, chooses how a layer goes onto the other side.
'use strict';
const OPPOSITE_SIDE = { left: 'right', right: 'left' };
const PAIR_OPPOSITE = { left: 'right', right: 'left', front: 'rear', rear: 'front' };
const PAIR_MODES = [
  ['mirror', 'Mirrored, in step', 'A mirrored copy that follows every change. Text and decals stay readable.'],
  ['same', 'Same, in step', 'Not mirrored: the same place and shape, and it follows every change.'],
  ['copy', 'A copy, then on its own', 'Copied once; change it freely afterwards.'],
  ['only', 'This side only', 'Not on the other side. A copy that is there now is removed.']
];
let pairSignature = '',
  pairMarksQueued = false,
  pairPopFor = null;

const pairHas = k => !!project?.template.views[k];
const pairOn = () => store.settings?.compareOn === true && !!project && !!activeView() && !preparing && !!compareView();
const pairLabel = k => M.LABELS[k] || k;
// The other side of the pair: the one chosen with the current side, else its natural opposite.
function compareView() {
  if (!project) return null;
  const [a, b] = store.settings?.pairViews || [],
    saved = store.settings?.compareView,
    tries = [currentView === a ? b : currentView === b ? a : null, saved, PAIR_OPPOSITE[currentView], ...M.VIEWS];
  return tries.find(k => k && k !== currentView && pairHas(k)) || null;
}
const compareChoices = () => (project ? M.VIEWS.filter(k => k !== currentView && pairHas(k)) : []);
function choosePair(on, partner = compareView()) {
  setPreference('compareOn', on);
  if (on && partner) {
    setPreference('compareView', partner);
    setPreference('pairViews', [currentView, partner]);
  }
  closePairPop();
  renderCompare();
  window.dispatchEvent(new Event('resize'));
}
// Mirror when the two are opposite sides; the same placement otherwise.
const pairMirrors = (from, to) => PAIR_OPPOSITE[from] === to;

// ------------------------------------------------------------------------ Kept in step
// Copies `items` (of the current view) onto view `to`; returns the copies, in order.
function pairCopies(items, from, to, mirror) {
  return M.mirrorView(items, project.template.views[from].bounds, project.template.views[to].bounds, mirror);
}
// Puts the items of the current side on side `to`. Call inside mutate().
function putOnSide(items, to, mode) {
  if (!items.length || !pairHas(to) || to === currentView) return 0;
  const list = (project.views[to] ||= []),
    partnerOf = l => (l.pairLink ? list.find(x => x.pairLink === l.pairLink) : null);
  if (mode === 'only') {
    const gone = new Set(items.map(partnerOf).filter(Boolean));
    project.views[to] = list.filter(x => !gone.has(x));
    return gone.size;
  }
  const mirror = mode === 'mirror' || (mode === 'copy' && pairMirrors(currentView, to)),
    made = pairCopies(items, currentView, to, mirror);
  items.forEach((l, i) => {
    const old = partnerOf(l),
      n = made[i];
    if (mode === 'copy') {
      delete n.pairLink;
      delete n.pairMode;
    } else {
      l.pairLink ||= M.uid();
      l.pairMode = mode;
      n.pairLink = l.pairLink;
      n.pairMode = mode;
    }
    if (old) {
      n.id = old.id;
      list[list.indexOf(old)] = n;
    } else list.push(n);
  });
  // A copy on its own: the layer is no longer linked to that side.
  if (mode === 'copy') pairTidy();
  pairSignature = '';
  return items.length;
}
// A link lives once per side and on at least two sides; anything else is let go.
function pairTidy() {
  const sides = new Map();
  for (const [k, list] of Object.entries(project.views || {})) {
    const seen = new Set();
    for (const l of list || []) {
      if (!l.pairLink) continue;
      if (seen.has(l.pairLink)) {
        delete l.pairLink;
        delete l.pairMode;
        continue;
      }
      seen.add(l.pairLink);
      if (!sides.has(l.pairLink)) sides.set(l.pairLink, new Set());
      sides.get(l.pairLink).add(k);
    }
  }
  for (const list of Object.values(project.views || {}))
    for (const l of list || [])
      if (l.pairLink && sides.get(l.pairLink)?.size < 2) {
        delete l.pairLink;
        delete l.pairMode;
      }
}
// Runs on every change (core.js changed()): the side being edited is copied to its partners.
function syncPairs() {
  if (!project?.views || !activeView()) return;
  pairTidy();
  const source = layers().filter(l => l.pairLink);
  if (!source.length) return;
  const outlines = Object.entries(project.template.views).map(([k, v]) => [k, v?.bounds]),
    signature = JSON.stringify([currentView, source, outlines]);
  if (signature === pairSignature) return;
  for (const [k, list] of Object.entries(project.views)) {
    if (k === currentView || !list?.length || !pairHas(k)) continue;
    for (const mode of ['mirror', 'same']) {
      const pairs = source
        .filter(l => (l.pairMode || 'mirror') === mode)
        .map(l => [l, list.find(x => x.pairLink === l.pairLink)])
        // A locked layer on the other side stays where it is.
        .filter(([, p]) => p && !p.locked);
      if (!pairs.length) continue;
      const made = pairCopies(
          pairs.map(([l]) => l),
          currentView,
          k,
          mode === 'mirror'
        ),
        groups = new Map();
      for (const [l, p] of pairs)
        if (l.groupId && p.groupId && !groups.has(l.groupId)) groups.set(l.groupId, p.groupId);
      pairs.forEach(([l, p], i) => {
        const n = made[i];
        n.id = p.id;
        n.pairLink = p.pairLink;
        n.pairMode = mode;
        if (p.locked) n.locked = true;
        if (l.groupId) {
          if (!groups.has(l.groupId)) groups.set(l.groupId, n.groupId);
          n.groupId = groups.get(l.groupId);
        }
        list[list.indexOf(p)] = n;
      });
    }
  }
  pairSignature = JSON.stringify([currentView, layers().filter(l => l.pairLink), outlines]);
}
// The sides a layer is on, besides this one.
const pairSidesOf = l =>
  l?.pairLink
    ? Object.entries(project.views)
        .filter(([k, list]) => k !== currentView && (list || []).some(x => x.pairLink === l.pairLink))
        .map(([k]) => k)
    : [];
const pairModeOf = (l, to) => {
  if (!l?.pairLink) return 'only';
  return (project.views[to] || []).some(x => x.pairLink === l.pairLink) ? l.pairMode || 'mirror' : 'only';
};

// ------------------------------------------------------------------------ The pair on screen
function renderCompare() {
  const pane = $('#compare-pane'),
    row = $('.canvas-row'),
    on = pairOn(),
    partner = on ? compareView() : null;
  renderPairSwitch();
  pane.hidden = !on;
  $('#pair-spine').hidden = !on || !partner;
  row.classList.toggle('comparing', on);
  $('#pair-label').hidden = !on || !partner;
  if (!on) {
    $('#pair-marks').replaceChildren();
    closePairPop();
    return;
  }
  if (!partner) {
    row.classList.remove('pair-after');
    pane.innerHTML = `<div class="compare-empty"><strong>No other side yet</strong><p class="note">Add another view above the canvas to work on two sides next to each other.</p></div>`;
    return;
  }
  // Sides keep their order: the one that comes first in M.VIEWS is on the left.
  row.classList.toggle('pair-after', M.VIEWS.indexOf(partner) < M.VIEWS.indexOf(currentView));
  const mm = project.template.views[partner].realWidthMm,
    here = activeView().realWidthMm;
  $('#pair-label').innerHTML =
    `<b>${e(pairLabel(currentView))}</b><span>you are working here</span>${here ? `<small>${formatMm(here)} mm</small>` : ''}`;
  pane.innerHTML = `<div class="compare-head"><b>${e(pairLabel(partner))}</b>${mm ? `<small>${formatMm(mm)} mm</small>` : ''}<span class="grow"></span><button class="quiet" data-action="mirror-view" title="Put every layer of the ${e(pairLabel(currentView))} on the ${e(pairLabel(partner))}, kept in step">${icon('mirror')}Everything on both sides</button></div><div class="compare-art" data-pair-view="${partner}" title="Click to work on the ${e(pairLabel(partner))}">${V.standalone(project, partner, 'compare-' + partner, { preview: true, live: true, interactive: true, effects: store.settings?.paintPreview !== false })}</div>`;
  queuePairMarks();
}
// One side, the natural pairs this car has, and "With…" for any other two.
function renderPairSwitch() {
  const box = $('#pair-switch');
  if (!project || !activeView() || preparing || compareChoices().length === 0) {
    box.hidden = true;
    return;
  }
  const on = pairOn(),
    partner = compareView(),
    pairs = [
      ['left', 'right'],
      ['front', 'rear']
    ].filter(([a, b]) => pairHas(a) && pairHas(b)),
    isPair = ([a, b]) => on && [a, b].includes(currentView) && [a, b].includes(partner),
    natural = pairs.some(isPair),
    others = compareChoices();
  box.hidden = false;
  box.innerHTML = `<button data-pair="off" aria-pressed="${!on}">One side</button>${pairs
    .map(
      ([a, b]) =>
        `<button data-pair="${a}:${b}" aria-pressed="${isPair([a, b])}">${pairLabel(a)} + ${pairLabel(b)}</button>`
    )
    .join(
      ''
    )}<label class="pair-with ${on && !natural ? 'on' : ''}"><span>${on && !natural ? `${pairLabel(currentView)} +` : 'With'}</span><select id="compare-view" aria-label="The other side next to the canvas">${on && !natural ? '' : '<option value="">…</option>'}${others
    .map(k => `<option value="${k}" ${on && !natural && k === partner ? 'selected' : ''}>${pairLabel(k)}</option>`)
    .join('')}</select></label>`;
}
// The guide across both sides, the spine dots, and the other side's camera.
function queuePairMarks() {
  if (pairMarksQueued) return;
  pairMarksQueued = true;
  requestAnimationFrame(drawPairMarks);
}
function drawPairMarks() {
  pairMarksQueued = false;
  const marks = $('#pair-marks'),
    spine = $('#pair-spine');
  marks.replaceChildren();
  if (!pairOn() || spine.hidden) return;
  const partner = compareView(),
    paneSvg = $('#compare-pane .compare-art svg');
  if (!partner || !paneSvg) return;
  // The other side follows the camera; mirrored for Left and Right.
  const mirror = pairMirrors(currentView, partner);
  paneSvg.setAttribute(
    'viewBox',
    `${mirror ? 1000 - viewBox.x - viewBox.w : viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`
  );
  const rowBox = $('.canvas-row').getBoundingClientRect(),
    spineBox = spine.getBoundingClientRect(),
    centre = (svg, id) => {
      const el = id && svg.querySelector(`[data-layer="${CSS.escape(id)}"]`),
        r = el?.getBoundingClientRect();
      return r && r.height ? r.top + r.height / 2 : null;
    };
  // Spine: one dot per linked layer (one per group), at its height; the selection gets a hollow
  // dot when it is not on the other side yet.
  const chosen = artworkSelection(),
    seen = new Set(),
    dots = [];
  for (const l of layers()) {
    const key = l.groupId || l.id,
      linked = pairModeOf(l, partner) !== 'only',
      picked = chosen.some(c => c.id === l.id);
    if (seen.has(key) || (!linked && !picked)) continue;
    const y = centre(art, l.id);
    if (y === null) continue;
    seen.add(key);
    dots.push({ l, y, linked, picked });
  }
  spine.innerHTML = `<span class="pair-spine-line"></span>${dots
    .filter(d => d.y >= spineBox.top && d.y <= spineBox.bottom)
    .map(
      ({ l, y, linked, picked }) =>
        `<button class="pair-dot ${linked ? 'on' : ''} ${picked ? 'picked' : ''}" style="top:${y - spineBox.top}px" data-pair-dot="${l.id}" title="${e(l.groupId ? l.groupName || 'Group' : l.name)}: ${linked ? `on the ${e(pairLabel(partner))}, ${pairModeOf(l, partner) === 'same' ? 'the same' : 'mirrored'}` : `only on the ${e(pairLabel(currentView))}`}" aria-label="${e(l.name)} on the ${e(pairLabel(partner))}">${linked ? '⇄' : '+'}</button>`
    )
    .join('')}`;
  // Guide: the height of the selection on this side and of its partner on the other side.
  const l = chosen[0],
    y = l && centre(art, l.id);
  if (!l || y === null) return;
  const p = (project.views[partner] || []).find(x => l.pairLink && x.pairLink === l.pairLink),
    py = (p && centre(paneSvg, p.id)) ?? y,
    mmPer = viewMm(),
    b = M.artworkBounds(chosen),
    up = mmPer ? `${formatMm((activeView().bounds.y + activeView().bounds.h - (b.y + b.h / 2)) * mmPer)} mm up` : '',
    line = (box, top, label) => {
      const g = document.createElement('div');
      g.className = 'pair-guide';
      g.style.cssText = `left:${box.left - rowBox.left}px;width:${box.width}px;top:${top - rowBox.top}px`;
      if (label) g.innerHTML = `<span>${e(label)}</span>`;
      marks.append(g);
    };
  line(art.getBoundingClientRect(), y, up);
  line(paneSvg.getBoundingClientRect(), py, p ? (pairModeOf(l, partner) === 'same' ? 'the same' : 'mirrored') : '');
}

// ------------------------------------------------------------------------ Choosing per layer
function openPairPop(anchor, to = compareView()) {
  const items = artworkSelection();
  if (!items.length || !to) return;
  closePairPop();
  const first = items[0],
    now = pairModeOf(first, to),
    pick = now === 'only' ? (pairMirrors(currentView, to) ? 'mirror' : 'same') : now,
    name = items.length > 1 || first.groupId ? first.groupName || `${items.length} layers` : first.name,
    pop = document.createElement('div');
  pairPopFor = { to };
  pop.id = 'pair-pop';
  pop.className = 'pair-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `${name} on the ${pairLabel(to)}`);
  pop.innerHTML = `<b>${e(name)} on the ${e(pairLabel(to))}</b><p class="note">${now === 'only' ? `Only on the ${e(pairLabel(currentView))} now.` : `On both sides now, ${now === 'same' ? 'the same' : 'mirrored'}.`}</p><div class="pair-modes" role="radiogroup">${PAIR_MODES.map(
    ([id, label, note]) =>
      `<label class="${id === pick ? 'on' : ''}"><input type="radio" name="pair-mode" value="${id}" ${id === pick ? 'checked' : ''}><span><b>${label}</b><small>${note}</small></span></label>`
  ).join(
    ''
  )}</div><div class="pair-pop-foot"><button data-pair-cancel>Cancel</button><button class="primary" id="pair-apply">${now === 'only' ? `Put it on the ${e(pairLabel(to))}` : 'Apply'}</button></div>`;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(),
    w = pop.offsetWidth,
    h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  pop.style.top = Math.max(60, Math.min(innerHeight - h - 8, r.bottom + 8)) + 'px';
  pop.querySelector('input:checked').focus();
}
function closePairPop() {
  pairPopFor = null;
  document.getElementById('pair-pop')?.remove();
}
function applyPairPop() {
  const to = pairPopFor?.to,
    mode = document.querySelector('#pair-pop input[name="pair-mode"]:checked')?.value,
    items = artworkSelection();
  closePairPop();
  if (!to || !mode || !items.length) return;
  let count = 0;
  mutate(() => (count = putOnSide(items, to, mode)));
  toast(
    mode === 'only'
      ? `Only on the ${pairLabel(currentView)} now.`
      : mode === 'copy'
        ? `Copied to the ${pairLabel(to)}: change it there on its own.`
        : `On the ${pairLabel(to)} too, kept in step${count > 1 ? ` (${count} layers)` : ''}.`
  );
}
// Clicking the other side makes it the side you work on, with what was clicked selected.
function workOnSide(k, layerId) {
  if (!pairHas(k)) return;
  closePairPop();
  currentView = k;
  resetViewSelection();
  const l = layerId && layers().find(x => x.id === layerId);
  if (l && !l.locked) chooseArtwork(l.id);
  render();
}

// "Everything on both sides": every layer of this side on the other one, kept in step.
function mirrorWholeSide() {
  const target = (pairOn() && compareView()) || PAIR_OPPOSITE[currentView];
  if (!target) return toast('Choose two sides above the canvas first.');
  if (!pairHas(target)) return toast(`Add the ${pairLabel(target)} view first, then put this side on it.`);
  const source = layers();
  if (!source.length) return toast('This side has no artwork yet.');
  const mode = pairMirrors(currentView, target) ? 'mirror' : 'same',
    own = (project.views[target] || []).filter(x => !x.pairLink || !source.some(l => l.pairLink === x.pairLink));
  openDialog(
    `Everything on the ${pairLabel(target)} too`,
    `Every layer of the ${pairLabel(currentView)} goes onto the ${pairLabel(target)}, ${mode === 'mirror' ? 'mirrored' : 'the same'}, and stays in step.`,
    `<p>${source.length} layer${source.length === 1 ? '' : 's'} from the ${pairLabel(currentView)} view. Text and decals stay readable.</p>${own.length ? `<label class="checkbox-line"><input id="mirror-replace" type="checkbox" checked>Remove the ${own.length} layer${own.length === 1 ? '' : 's'} the ${pairLabel(target)} has of its own</label>` : ''}<p class="note">Change either side afterwards and the other follows. Choose per layer with the dots between the sides.</p>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="mirror-apply">Put on both sides</button>`
  );
  $('#mirror-apply').onclick = () => {
    const replace = $('#mirror-replace')?.checked !== false;
    closeDialog();
    let count = 0;
    mutate(() => {
      if (replace && own.length) project.views[target] = project.views[target].filter(x => !own.includes(x));
      count = putOnSide(layers(), target, mode);
    });
    toast(`${count} layer${count === 1 ? ' is' : 's are'} on the ${pairLabel(target)} too, kept in step.`);
  };
}
// Copy to another view: any side, with the same choices as the spine.
function copyToViewDialog() {
  const items = artworkSelection();
  if (!items.length) return;
  const targets = compareChoices(),
    first = (pairOn() && compareView()) || PAIR_OPPOSITE[currentView],
    to = targets.includes(first) ? first : targets[0];
  if (!to) return toast('Add another view first.');
  const choice = k =>
    pairModeOf(items[0], k) === 'only' ? (pairMirrors(currentView, k) ? 'mirror' : 'same') : pairModeOf(items[0], k);
  openDialog(
    'Put it on another side',
    'Placement is fitted to the other side’s bodywork. Check it there.',
    `<div class="field"><label for="copy-target">Side</label><select id="copy-target">${targets.map(k => `<option value="${k}" ${k === to ? 'selected' : ''}>${pairLabel(k)}</option>`).join('')}</select></div><div class="pair-modes" role="radiogroup">${PAIR_MODES.map(
      ([id, label, note]) =>
        `<label><input type="radio" name="copy-mode" value="${id}" ${id === choice(to) ? 'checked' : ''}><span><b>${label}</b><small>${note}</small></span></label>`
    ).join('')}</div>`,
    `<button data-action="close-dialog">Cancel</button><button class="primary" id="copy-apply">Apply</button>`
  );
  $('#copy-target').onchange = () => {
    const pick = choice($('#copy-target').value);
    document.querySelectorAll('[name="copy-mode"]').forEach(r => (r.checked = r.value === pick));
  };
  $('#copy-apply').onclick = () => {
    const k = $('#copy-target').value,
      mode = document.querySelector('[name="copy-mode"]:checked').value;
    mutate(() => putOnSide(items, k, mode));
    closeDialog();
    toast(mode === 'only' ? `Removed from the ${pairLabel(k)}.` : `On the ${pairLabel(k)} too.`);
  };
}

// ------------------------------------------------------------------------ Events
document.addEventListener('click', ev => {
  const pop = document.getElementById('pair-pop');
  if (pop && !pop.contains(ev.target) && !ev.target.closest('[data-pair-dot],[data-pair-open]')) closePairPop();
  const b = ev.target.closest('button');
  if (b?.dataset.pair) {
    if (b.dataset.pair === 'off') return choosePair(false);
    const [a, c] = b.dataset.pair.split(':');
    if (![a, c].includes(currentView)) workOnSide(a);
    return choosePair(true, currentView === a ? c : a);
  }
  if (b?.dataset.pairDot) {
    const l = layers().find(x => x.id === b.dataset.pairDot);
    if (!l) return;
    if (!artworkSelection().some(x => x.id === l.id)) {
      chooseArtwork(l.id);
      render();
    }
    return openPairPop(document.querySelector(`[data-pair-dot="${CSS.escape(l.id)}"]`) || b);
  }
  if (b?.dataset.pairOpen) {
    if (!artworkSelection().some(x => x.id === b.dataset.pairOpen)) {
      chooseArtwork(b.dataset.pairOpen);
      render();
    }
    return pairOn() ? openPairPop(b) : copyToViewDialog();
  }
  if (b?.hasAttribute('data-pair-cancel')) return closePairPop();
  if (b?.id === 'pair-apply') return applyPairPop();
  const side = ev.target.closest('#compare-pane .compare-art');
  if (side) workOnSide(side.dataset.pairView, ev.target.closest('[data-layer]')?.dataset.layer);
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'compare-view' && ev.target.value) choosePair(true, ev.target.value);
  if (ev.target.name === 'pair-mode')
    document
      .querySelectorAll('#pair-pop .pair-modes label')
      .forEach(l => l.classList.toggle('on', l.contains(ev.target)));
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && document.getElementById('pair-pop')) {
    ev.stopImmediatePropagation();
    closePairPop();
  }
});
window.addEventListener('resize', () => pairOn() && queuePairMarks());
