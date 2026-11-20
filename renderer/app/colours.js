// Livery renderer · Livery colours (remake 2026-11, "Livery colours", docs/ui-reference/colours-2026-11).
// Each livery has up to 12 named colours (Gulf blue, Race white…), each with an optional real
// paint. Everything painted in a colour's exact hex uses it: changing the colour repaints every
// use, and linking a paint sets that paint on every use. Older designs' team colours become
// livery colours named Colour 1, Colour 2…; project.palette is kept in step for older code.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
function liveryColours(p = project) {
  if (!p) return [];
  if (Array.isArray(p.liveryColours)) return p.liveryColours;
  return M.validatePalette(p.palette).map((hex, i) => ({ name: 'Colour ' + (i + 1), hex }));
}
function setLiveryColours(list, p = project) {
  p.liveryColours = M.validateLiveryColours(list);
  p.palette = p.liveryColours.map(c => c.hex);
}
const liveryColour = hex => liveryColours().find(c => c.hex === String(hex || '').toLowerCase());
function nextColourName(hex) {
  const named = liveryColours().map(c => c.name),
    paint = PaintCatalogue.paints.find(x => x.hex === hex);
  if (paint && !named.includes(paint.name)) return paint.name;
  let n = liveryColours().length + 1;
  while (named.includes('Colour ' + n)) n++;
  return 'Colour ' + n;
}
function addLiveryColour(hex, name = null, ref = null) {
  hex = M.colour(hex, '#ffffff');
  if (liveryColour(hex)) return toast('That colour is already one of this livery’s colours.');
  if (liveryColours().length >= M.PALETTE_SIZE) return toast(`A livery has up to ${M.PALETTE_SIZE} colours.`);
  mutate(() =>
    setLiveryColours([...liveryColours(), { name: name || nextColourName(hex), hex, ...(ref ? { ref } : {}) }])
  );
  toast('Added ' + (name || liveryColour(hex)?.name || hex.toUpperCase()) + ' to the livery colours.');
}
function removeLiveryColour(hex) {
  const c = liveryColour(hex);
  if (!c) return;
  mutate(() => setLiveryColours(liveryColours().filter(x => x.hex !== c.hex)));
  toast(`Removed ${c.name} from the livery colours. Where it was used stays painted.`);
}

// ------------------------------------------------------------------ Uses
// Every place a hex is painted, with a short name; `set` repaints that place.
function colourPlaces(p = project) {
  const places = [],
    add = (label, get, set, refHolder = null) => places.push({ label, get, set, refHolder }),
    stops = (owner, label) =>
      (owner.gradient?.stops || []).forEach((s, i) =>
        add(
          `${label} gradient ${i + 1}`,
          () => s.colour,
          v => (s.colour = v)
        )
      );
  add(
    'Base paint',
    () => p.base,
    v => (p.base = v),
    p
  );
  stops(p, 'Base paint');
  for (const [k, v] of Object.entries(p.template.views))
    for (const r of v?.regions || [])
      if (r.role === 'body' && r.colour) {
        const label = `${r.partLabel || r.name} · ${M.LABELS[k]}`;
        add(
          label,
          () => r.colour,
          x => (r.colour = x),
          r
        );
        stops(r, label);
      }
  for (const [k, list] of Object.entries(p.views))
    for (const l of list || []) {
      if (['image', 'vector'].includes(l.kind)) continue;
      const label = `${l.name} · ${M.LABELS[k]}`;
      add(
        label,
        () => l.fill,
        x => (l.fill = x),
        l
      );
      stops(l, label);
      (l.lineStripes || []).forEach((s, i) =>
        add(
          `${label} stripe ${i + 1}`,
          () => s.colour,
          x => (s.colour = x)
        )
      );
      if (l.outlineColour)
        add(
          `${label} outline`,
          () => l.outlineColour,
          x => (l.outlineColour = x)
        );
      if (l.shadowColour)
        add(
          `${label} shadow`,
          () => l.shadowColour,
          x => (l.shadowColour = x)
        );
    }
  return places;
}
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
function colourUses(hex) {
  return colourPlaces().filter(x => same(x.get(), hex));
}
// Repaints every use of a livery colour, and keeps its name and paint.
function changeLiveryColour(oldHex, patch) {
  const c = liveryColour(oldHex);
  if (!c) return;
  const hex = patch.hex ? M.colour(patch.hex, c.hex) : c.hex;
  if (hex !== c.hex && liveryColour(hex))
    return toast('Another livery colour already has that shade. Use Merge instead.');
  mutate(() => {
    if (hex !== c.hex) for (const place of colourUses(c.hex)) place.set(hex);
    if ('ref' in patch)
      for (const place of colourUses(hex))
        if (place.refHolder) {
          if (patch.ref) place.refHolder.paintRef = patch.ref;
          else delete place.refHolder.paintRef;
        }
    setLiveryColours(
      liveryColours().map(x =>
        x.hex === c.hex
          ? {
              name: patch.name ?? x.name,
              hex,
              ...(('ref' in patch ? patch.ref : x.ref) ? { ref: 'ref' in patch ? patch.ref : x.ref } : {})
            }
          : x
      )
    );
  });
}
// Merging repaints every use of one colour with another and removes the first.
function mergeLiveryColour(fromHex, intoHex) {
  const from = liveryColour(fromHex),
    into = liveryColour(intoHex);
  if (!from || !into) return;
  mutate(() => {
    for (const place of colourUses(from.hex)) {
      place.set(into.hex);
      if (place.refHolder) {
        if (into.ref) place.refHolder.paintRef = into.ref;
        else delete place.refHolder.paintRef;
      }
    }
    setLiveryColours(liveryColours().filter(x => x.hex !== from.hex));
  });
  toast(`${from.name} merged into ${into.name}.`);
}

// --------------------------------------------------------- Paint matches
// Distance between two colours as people see them (CIE76 in Lab), for "closest paints".
function labOf(hex) {
  const lin = v => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92),
    [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255)),
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047,
    y = r * 0.2126 + g * 0.7152 + b * 0.0722,
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883,
    f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function colourDistance(a, b) {
  const [l1, a1, b1] = labOf(M.colour(a, '#000000')),
    [l2, a2, b2] = labOf(M.colour(b, '#000000'));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
const closeness = d => (d < 6 ? 'very close' : d < 14 ? 'close' : d < 26 ? 'similar' : 'far');
function closestPaints(hex, count = 3) {
  return allPaints()
    .map((p, index) => ({ ...p, index, distance: colourDistance(hex, p.hex) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}
// Paints you have: kept on this computer, by their label ("Tamiya TS-23 Light Blue").
const ownedPaints = () => new Set(store.settings?.ownedPaints || []);
function setOwned(label, owned) {
  const set = ownedPaints();
  if (owned) set.add(label);
  else set.delete(label);
  setPreference('ownedPaints', [...set].slice(0, 1000));
}
// The paints this livery uses that you do not have yet.
function shoppingList(p = project) {
  const owned = ownedPaints(),
    refs = new Map();
  for (const c of liveryColours(p)) if (c.ref && !owned.has(c.ref)) refs.set(c.ref, c.name);
  for (const step of paintingSteps(p))
    if (step.ref && !owned.has(step.ref) && !refs.has(step.ref)) refs.set(step.ref, '');
  return [...refs].map(([ref, colourName]) => ({ ref, colourName }));
}

// ---------------------------------------------------------- Colour cards
// The livery's colours in the Colour folder: click to paint, ✎ to edit.
function liveryColourCards(current) {
  const list = liveryColours(),
    counts = new Map(list.map(c => [c.hex, colourUses(c.hex).length]));
  return `<div class="lc-rack" role="group" aria-label="Livery colours">${list
    .map(c => {
      const dark = labOf(c.hex)[0] < 55;
      return `<div class="lc-card ${same(c.hex, current) ? 'on' : ''}"><button class="lc-paint" data-pick-colour="${c.hex}" data-team-colour="${c.hex}" title="Paint the selection ${e(c.name)}. Right-click to remove it from the livery colours." aria-label="Paint with ${e(c.name)}"><span class="lc-top ${dark ? 'dark' : ''}" style="background:${c.hex}"><small>${counts.get(c.hex) || 0}×</small></span><span class="lc-body"><b>${e(c.name)}</b><small>${c.ref ? e(c.ref.replace(/^(Tamiya|Humbrol|Revell|Zero Paints)\s+/, '')) : 'no paint yet'}</small></span></button><button class="lc-edit" data-colour-edit="${c.hex}" title="Edit ${e(c.name)}" aria-label="Edit ${e(c.name)}">${icon('pen')}</button></div>`;
    })
    .join('')}${
    list.length < M.PALETTE_SIZE
      ? `<button class="lc-card lc-add" data-palette-add="${M.colour(current)}" title="Make ${M.colour(current).toUpperCase()} a livery colour" aria-label="Add the current colour to the livery colours">${icon('plus')}<span>New colour</span></button>`
      : ''
  }</div>`;
}

// ---------------------------------------------------------- Colour editor
function colourEditor(hex) {
  const c = liveryColour(hex);
  if (!c) return;
  const uses = colourUses(c.hex),
    matches = closestPaints(c.hex, 3),
    owned = ownedPaints(),
    others = liveryColours().filter(x => x.hex !== c.hex);
  openDialog(
    c.name,
    `Used ${uses.length} ${uses.length === 1 ? 'time' : 'times'} on this livery. Changing it repaints every use.`,
    `<div class="lc-edit-grid"><div class="field"><label for="colour-name">Name</label><input id="colour-name" maxlength="40" value="${e(c.name)}"></div><div class="field"><label for="colour-hex">Colour</label><div class="row"><input id="colour-hex-picker" type="color" value="${c.hex}" aria-label="Pick the colour"><input id="colour-hex" maxlength="7" value="${c.hex.toUpperCase()}" aria-label="Hex colour"></div></div></div>
<div class="field"><label>Used on</label><div class="lc-uses">${
      uses.length
        ? uses
            .slice(0, 14)
            .map(u => `<span>${e(u.label)}</span>`)
            .join('') + (uses.length > 14 ? `<span>and ${uses.length - 14} more</span>` : '')
        : '<span class="note">Not used yet</span>'
    }</div></div>
<div class="field"><label>The real paint${c.ref ? '' : ' · closest to this colour'}</label>${c.ref ? `<div class="lc-match on"><span class="lc-sw" style="background:${allPaints().find(p => PaintCatalogue.label(p) === c.ref)?.hex || c.hex}"></span><span><b>${e(c.ref)}</b><small>${owned.has(c.ref) ? 'You have it' : 'On the shopping list'}</small></span><button class="quiet" data-colour-unlink="${c.hex}">Remove</button></div>` : ''}${matches
      .filter(m => PaintCatalogue.label(m) !== c.ref)
      .map(
        m =>
          `<button class="lc-match" data-colour-paint="${m.index}" data-colour-for="${c.hex}"><span class="lc-sw" style="background:${m.hex}"></span><span><b>${e(PaintCatalogue.label(m))}</b><small>${e(m.finish || m.brand)}${owned.has(PaintCatalogue.label(m)) ? ' · you have it' : ''}${m.custom ? ' · my paint' : ''}</small></span><span class="lc-close">${closeness(m.distance)}</span></button>`
      )
      .join(
        ''
      )}<button class="lc-browse" data-colour-browse="${c.hex}">${icon('search')}Browse all paints…</button></div>
${others.length ? `<div class="field"><label for="colour-merge">Merge into another colour</label><div class="row"><select id="colour-merge">${others.map(x => `<option value="${x.hex}">${e(x.name)}</option>`).join('')}</select><button id="colour-merge-go">Merge</button></div><p class="note">Repaints every use with that colour and removes ${e(c.name)}.</p></div>` : ''}`,
    `<button class="danger quiet" id="colour-remove">Remove colour</button><span class="dialog-foot-note"></span><button data-action="close-dialog">Cancel</button><button class="primary" id="colour-save">Done</button>`
  );
  $('#dialog').classList.add('colour-dialog');
  const sync = from => {
    const v = from.value;
    if (from.id === 'colour-hex-picker') $('#colour-hex').value = v.toUpperCase();
    else if (/^#[0-9a-f]{6}$/i.test(v)) $('#colour-hex-picker').value = v.toLowerCase();
  };
  $('#colour-hex-picker').oninput = ev => sync(ev.target);
  $('#colour-hex').oninput = ev => sync(ev.target);
  $('#colour-save').onclick = () => {
    const name = $('#colour-name').value.trim() || c.name,
      next = $('#colour-hex').value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(next)) return toast('Use a colour like #7FB7E2.');
    closeDialog();
    changeLiveryColour(c.hex, { name, hex: next.toLowerCase() });
  };
  $('#colour-remove').onclick = () => {
    closeDialog();
    removeLiveryColour(c.hex);
  };
  if ($('#colour-merge-go'))
    $('#colour-merge-go').onclick = () => {
      const into = $('#colour-merge').value;
      closeDialog();
      mergeLiveryColour(c.hex, into);
    };
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b || !project) return;
  const d = b.dataset;
  if (d.colourEdit) colourEditor(d.colourEdit);
  else if (d.colourPaint) {
    const paint = allPaints()[Number(d.colourPaint)];
    if (!paint) return;
    closeDialog();
    changeLiveryColour(d.colourFor, { ref: PaintCatalogue.label(paint) });
    toast(`${liveryColour(d.colourFor)?.name || 'The colour'} is painted with ${PaintCatalogue.label(paint)}.`);
  } else if (d.colourUnlink) {
    closeDialog();
    changeLiveryColour(d.colourUnlink, { ref: undefined });
  } else if (d.colourBrowse) openPaintCatalogue({ forColour: d.colourBrowse });
});

// ------------------------------------------------------- Workshop plan
// The livery colours with their paints, then what to buy, for the workshop PDF.
function liveryColoursHTML(p = project) {
  const list = liveryColours(p),
    owned = ownedPaints(),
    shop = shoppingList(p);
  if (!list.length && !shop.length) return '';
  return `${
    list.length
      ? `<h2>Livery colours</h2><table><tr><th>Colour</th><th>Shade</th><th>Paint</th><th></th></tr>${list
          .map(
            c =>
              `<tr><td>${e(c.name)}</td><td><span class="swatch" style="background:${c.hex}"></span>${c.hex.toUpperCase()}</td><td>${e(c.ref || '—')}</td><td>${c.ref ? (owned.has(c.ref) ? 'Have' : 'To buy') : ''}</td></tr>`
          )
          .join('')}</table>`
      : ''
  }${shop.length ? `<h2>Shopping list</h2><table><tr><th>Paint</th><th>For</th></tr>${shop.map(s => `<tr><td>${e(s.ref)}</td><td>${e(s.colourName || 'this livery')}</td></tr>`).join('')}</table>` : ''}`;
}
