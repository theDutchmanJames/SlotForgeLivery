// Livery renderer · Help on the spot: the Help here drawer, the guided tours and the keyboard sheet.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
//
// Help here (F1 or the Help button) sits beside the page and shows what you can do on the screen
// you are on, for what you have selected. Each item either does it or points at the control. A tour
// dims the window and walks over the real controls step by step; ? opens every key on one sheet.
'use strict';
let helpOpen = false,
  helpShown = '',
  helpItems = [],
  helpTour = null,
  helpKeysOpen = false,
  helpQueued = false,
  appVersion = '';

// --------------------------------------------------------------------------- Keys
// The one list of keys: the sheet, the drawer and the tool tips all agree with main.js.
const HELP_KEYS = [
  [
    'Tools',
    [
      ['Select', 'V'],
      ['Paint the selected layer', 'B'],
      ['Edit points & curves', 'A'],
      ['Rectangle', 'R'],
      ['Ellipse', 'E'],
      ['Draw a shape', 'P'],
      ['Line / stripes', 'L'],
      ['Text / number', 'T'],
      ['Decal artwork', 'I'],
      ['Pan', 'H']
    ]
  ],
  [
    'Editing',
    [
      ['Undo', 'Ctrl Z'],
      ['Redo', 'Ctrl Shift Z'],
      ['Duplicate', 'Ctrl D'],
      ['Delete', 'Del'],
      ['Nudge', '← ↑ → ↓'],
      ['Nudge further', 'Shift ← ↑ → ↓'],
      ['Save now', 'Ctrl S'],
      ['Let go of the selection', 'Esc']
    ]
  ],
  [
    'Drawing a shape or line',
    [
      ['A corner', '~click'],
      ['A curve', '~click and drag'],
      ['Take back the last point', 'Backspace'],
      ['Finish', 'Enter'],
      ['Finish a line', 'Esc'],
      ['Close a shape', '~click the first point']
    ]
  ],
  [
    'Canvas and help',
    [
      ['Zoom', '~mouse wheel'],
      ['Pan', '~middle-drag'],
      ['Pan', 'Ctrl ~drag'],
      ['Select several', 'Shift ~click'],
      ['More for the selection', '~right-click'],
      ['Help here', 'F1'],
      ['This sheet', '?']
    ]
  ]
];
const keyLabel = name => HELP_KEYS.flatMap(([, list]) => list).find(([label]) => label === name);
// "Ctrl Shift Z" → three keys; a word starting with ~ is a mouse action, written out.
function keyHTML(keys) {
  return keys
    .split(' ')
    .reduce((parts, word) => {
      const last = parts[parts.length - 1];
      if (word.startsWith('~')) parts.push({ text: word.slice(1) });
      else if (last?.text !== undefined && !/^[A-Z]|^[←↑→↓?]/.test(word)) last.text += ' ' + word;
      else parts.push({ key: word });
      return parts;
    }, [])
    .map(p => (p.key ? `<kbd>${e(p.key)}</kbd>` : `<span class="hp-mouse">${e(p.text)}</span>`))
    .join('');
}
const keyRows = list =>
  list
    .map(name => (typeof name === 'string' ? keyLabel(name) : name))
    .filter(Boolean)
    .map(
      ([label, keys]) =>
        `<div class="hp-key"><span>${e(label)}</span><span class="hp-keys">${keyHTML(keys)}</span></div>`
    )
    .join('');

// ------------------------------------------------------------------------ Where you are
const pageShown = id => !!document.getElementById(id) && !document.getElementById(id).hidden;
const firstVisible = selector =>
  [...document.querySelectorAll(selector)].find(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  });
// Paints the selection with the first livery colour, or points at the cards when there are none.
// What Help here shows: where you are, what you can do now, what is good to know, a tour and keys.
// An item with run does it; an item with point shows where the control is.
function helpContext() {
  if (settingsOpen)
    return {
      where: 'Settings',
      sub: 'For the whole app',
      can: [{ label: 'Choose light or dark', point: '[data-theme-choice]', tip: 'Also in the ≡ menu.' }],
      know: [
        'Settings are kept as soon as you change them.',
        'The tips in the corner of the canvas can be turned back on here.'
      ],
      keys: ['Help here', 'This sheet']
    };
  if (pageShown('setup-page') && setup) {
    const [title, sub] = SETUP_STEPS[setup.step - 1] || ['', ''];
    const know = {
      1: ['Give the car a name you will know it by in the Garage.', 'The scale sets the real size later on.'],
      2: ['SVG, EPS and PDF drawings keep their panels. A photo is traced point by point.'],
      3: [
        'Click every panel that gets paint. Windows, lights and wheels stay as drawn.',
        'Not sure? Edit areas & labels, under Layers, changes them later.'
      ],
      4: ['Panels with the same name are painted together, like both doors.', 'Free names work too: “Fin”.'],
      5: [
        'Measure the car from bumper to bumper. Masks and decals then print at the right size.',
        'You can skip the size and set it later.'
      ]
    }[setup.step] || ['Follow the steps on top.'];
    return {
      where: 'Add a car',
      sub: `Step ${setup.step} of ${SETUP_STEPS.length} · ${title}${sub ? ': ' + sub.toLowerCase() : ''}`,
      can: [
        { label: 'Go to the next step', point: '[data-setup-next]' },
        { label: 'Leave the setup', point: '[data-setup-cancel]', tip: 'The car keeps what you did so far.' }
      ],
      know,
      keys: []
    };
  }
  if (garageOpen) {
    const section =
      { recent: 'Recent liveries', cars: 'Your cars', trash: 'The Trash', backups: 'Backups' }[garageSection] ||
      (LIBRARY_SECTIONS.includes(garageSection) ? 'Your library' : 'Garage');
    return {
      where: 'Garage',
      sub: section + (garageSelected ? ' · one chosen' : ''),
      can: [
        {
          label: 'Open a livery',
          point: '.gr-main .gr-card, .gr-main .gr-tr',
          tip: 'Double-click it, or choose it and use Open.'
        },
        {
          label: 'Start a new livery',
          point: '[data-garage-new]',
          tip: 'Choose a car first: its details have New livery on this car.'
        },
        { label: 'Add a car', run: () => actions['add-car']() },
        { label: 'See the Trash', point: '.gr-rail', tip: 'Deleted liveries stay in the Trash for 30 days.' }
      ],
      know: [
        'Every livery keeps its own copy of its car, so editing a car never changes a livery you made.',
        `Deleted liveries stay in the Trash for ${TRASH_DAYS} days.`,
        'Backups copy your whole library to a folder you choose.'
      ],
      tour: 'garage',
      keys: ['Help here', 'This sheet']
    };
  }
  if (packOpen)
    return {
      where: 'Print pack',
      sub: 'Choose pages, save one PDF',
      can: [
        { label: 'Choose the pages', point: '.pk-list', tip: 'Tick a page to put it in the pack.' },
        { label: 'Save the PDF', point: '[data-pack-save]' }
      ],
      know: [
        'Masks print at the real size when the view has a real size.',
        entryList().length > 1
          ? 'With All entries on, the ticked pages print once for every car.'
          : 'Add entries to print the same pack for every car.',
        'Decals go to SlotForge Decals: Print & export → Decals.'
      ],
      keys: ['Help here']
    };
  if (!project)
    return {
      where: 'Welcome',
      sub: 'No livery open yet',
      can: [
        { label: 'Try the sample car', run: () => actions['sample-car']() },
        { label: 'Add your own car', run: () => actions['add-car']() },
        { label: 'Open a shared package', run: () => actions.import() },
        { label: 'Go to the Garage', run: () => actions.projects() }
      ],
      know: [
        'Livery starts from a drawing of your car: SVG, EPS, PDF or a photo to trace.',
        'Everything you make stays on this computer. No account is needed.'
      ],
      keys: ['This sheet']
    };
  if (preparing)
    return {
      where: 'Panel Studio',
      sub: 'The car’s panels in detail',
      can: [
        { label: 'Choose a panel', point: '#canvas-wrap', tip: 'Click a panel, then set what it is on the right.' },
        { label: 'Back to painting', run: () => setTool('select') }
      ],
      know: [
        'This is the detailed editor for the panels. Add a car does the same in guided steps.',
        'Only panels marked as body take paint.'
      ],
      keys: ['Finish', 'Take back the last point', 'Undo']
    };
  if (drawPoints.length)
    return {
      where: 'Paint Studio',
      sub: tool === 'line' ? 'Drawing a line' : 'Drawing a shape',
      can: [
        { label: 'Finish it', run: () => finishDrawing() },
        { label: 'Take back the last point', run: () => (drawPoints.pop(), renderCanvas(), renderInspector()) }
      ],
      know: [
        'Click for a corner. Click and drag for a curve.',
        tool === 'line'
          ? 'A line stays open: finish it with Enter, Esc or a right-click.'
          : 'Click the first point to close the shape.'
      ],
      keys: ['A corner', 'A curve', 'Take back the last point', 'Finish']
    };
  const many = multiSelected.size > 1,
    l = selection(),
    base = {
      where: 'Paint Studio',
      tour: 'studio',
      keys: ['Undo', 'Duplicate', 'Delete', 'This sheet']
    };
  if (many)
    return {
      ...base,
      sub: `${multiSelected.size} things selected`,
      can: [
        {
          label: 'Paint them all with a livery colour',
          point: '.lc-rack',
          when: () => liveryColours().length,
          tip: 'Click a card.'
        },
        { label: 'Line them up', point: '[data-align]', tip: 'Several selected: they line up with each other.' },
        { label: 'Group them', run: () => actions['group-artwork']() },
        { label: 'Save them to your library as one', run: () => actions['save-asset']() }
      ],
      know: [
        'Shift-click on the canvas or in Layers adds or removes one.',
        'Colour and finish change all of them at once.'
      ]
    };
  if (l?.kind === 'text')
    return {
      ...base,
      sub: 'Text or a number selected',
      can: [
        {
          label: 'Take the text from the entries',
          point: '[data-text-from]',
          tip: 'Race number, driver or team: one livery, many cars.'
        },
        { label: 'Choose the typeface', point: '#font-value' },
        { label: 'Bend it along the car', point: '#text-bend' },
        { label: 'Paint it with a livery colour', point: '.lc-rack', when: () => liveryColours().length }
      ],
      know: ['Text keeps its letter shapes when you widen it.', 'Bring in your own fonts with Import font.']
    };
  if (l?.kind === 'line')
    return {
      ...base,
      sub: 'A line or stripes selected',
      can: [
        { label: 'Choose a stripe pattern', point: '[data-line-preset]' },
        { label: 'Add a stripe to it', point: '[data-line-add]' },
        { label: 'Change its curve', run: () => actions['edit-curve']() },
        { label: 'Copy it to the other side', point: '[data-action="copy-view"]' }
      ],
      know: [
        'Each stripe has its own colour and width.',
        'Lines are clipped to the bodywork, so they can run over the edge.'
      ],
      keys: ['Edit points & curves', 'Nudge', 'Duplicate', 'Delete']
    };
  if (l && ['image', 'vector'].includes(l.kind))
    return {
      ...base,
      sub: 'Decal artwork selected',
      can: [
        { label: 'Fit it to an angled view', point: '.fit-controls' },
        { label: 'Put it in the right place', point: '#pos-x' },
        { label: 'Send decals to SlotForge Decals', run: () => actions['send-decals']() }
      ],
      know: ['Imported artwork keeps its own colours.', 'Sheets from SlotForge Decals come in one decal at a time.']
    };
  if (l)
    return {
      ...base,
      sub: 'A shape selected',
      can: [
        {
          label: 'Paint it with a livery colour',
          point: '.lc-rack',
          when: () => liveryColours().length,
          tip: 'Click a card. ✎ changes a colour everywhere.'
        },
        { label: 'Give it a gradient', point: '[data-fill-type]' },
        { label: 'Give it a finish', point: '[data-finish]', tip: 'Gloss, satin, matte, metallic or pearl.' },
        { label: 'Copy it to another view', point: '[data-action="copy-view"]' }
      ],
      know: ['Shapes are clipped to the bodywork. Windows stay clear.', 'Drag the corner handle to resize it.'],
      keys: ['Nudge', 'Duplicate', 'Delete', 'More for the selection']
    };
  if (selectedPaint || selectedRegion)
    return {
      ...base,
      sub: 'A panel selected',
      can: [
        {
          label: 'Paint it with a livery colour',
          point: '.lc-rack',
          when: () => liveryColours().length,
          tip: 'Click a card.'
        },
        { label: 'Make this shade a livery colour', point: '.lc-add', tip: 'Then name it, like “Gulf blue”.' },
        { label: 'Choose the real paint', run: () => actions['paint-catalogue']() },
        { label: 'Give it a gradient or a finish', point: '[data-fill-type]' }
      ],
      know: [
        'Panels with the same name are painted together.',
        'Change a livery colour with ✎: everything painted in it follows.'
      ],
      keys: ['Select several', 'Let go of the selection', 'This sheet']
    };
  return {
    ...base,
    sub: 'Nothing selected',
    can: [
      { label: 'Paint the whole car', run: () => actions.base() },
      { label: 'Add stripes', run: () => setTool('line') },
      { label: 'Add a shape or a number board', run: () => actions.shapes() },
      { label: 'Add a race number', run: () => setTool('text') },
      { label: 'Plan the paints and the order', run: () => showInspectorTab('workshop') },
      { label: 'Make the Print pack', run: () => actions['print-pack']() }
    ],
    know: [
      'Click a panel or a shape on the car to select it.',
      entryList().length
        ? `This livery has ${entryList().length} entries: switch cars above the canvas.`
        : 'One livery for several cars? Add entries in the Workshop tab.'
    ],
    keys: ['Select', 'Line / stripes', 'Text / number', 'This sheet']
  };
}

// ------------------------------------------------------------------------ Help here
function renderHelp() {
  helpQueued = false;
  const drawer = $('#help-drawer');
  document.body.classList.toggle('help-open', helpOpen);
  $('#help-button')?.setAttribute('aria-pressed', String(helpOpen));
  drawer.hidden = !helpOpen;
  if (!helpOpen) return;
  const c = helpContext(),
    items = (c.can || []).filter(x => (!x.when || x.when()) && (x.run || (x.point && firstVisible(x.point)))),
    shown = JSON.stringify([c.where, c.sub, items.map(x => x.label), c.know]);
  if (shown === helpShown) return;
  helpShown = shown;
  helpItems = items;
  drawer.innerHTML = `<div class="hp-head">${icon('help')}<div class="hp-title"><b>Help here</b><small>${e(c.where)} · ${e(c.sub)}</small></div><button class="hp-close" data-help-close title="Close Help (F1)" aria-label="Close Help">${icon('close')}</button></div><div class="hp-body">${
    items.length
      ? `<h3>What you can do now</h3><div class="hp-can">${items
          .map(
            (x, i) =>
              `<button data-help-do="${i}">${x.run ? icon('play') : icon('target')}<span>${e(x.label)}</span></button>`
          )
          .join('')}</div>`
      : ''
  }${(c.know || []).length ? `<h3>Good to know</h3><ul class="hp-know">${c.know.map(t => `<li>${e(t)}</li>`).join('')}</ul>` : ''}${
    c.tour && HELP_TOURS[c.tour]
      ? `<h3>Take the tour</h3><p class="hp-note">${e(HELP_TOURS[c.tour].about)}</p><button class="primary" data-help-tour="${c.tour}">${icon('target')}Start the tour</button>`
      : ''
  }${c.keys?.length ? `<h3>Keys</h3><div class="hp-keylist">${keyRows(c.keys)}</div><button class="quiet hp-all" data-help-keys>${icon('keyboard')}All keys<kbd>?</kbd></button>` : ''}</div><div class="hp-foot">SlotForge Livery${appVersion ? ' ' + e(appVersion) : ''} · everything stays on this computer</div>`;
}
function queueHelp() {
  if (!helpOpen || helpQueued) return;
  helpQueued = true;
  requestAnimationFrame(renderHelp);
}
function toggleHelp(open = !helpOpen) {
  helpOpen = open;
  helpShown = '';
  setPreference('helpOpen', open);
  renderHelp();
  // Pages and the canvas size themselves to the room beside the drawer.
  window.dispatchEvent(new Event('resize'));
}

// ------------------------------------------------------------------------ Tours
const HELP_TOURS = {
  studio: {
    about: 'A short walk past the parts of the Paint Studio, on your own livery.',
    steps: [
      {
        at: '#tools',
        title: 'Tools',
        text: 'Select, paint, shapes, lines, text and decal artwork. Point at a tool to see its key.'
      },
      {
        at: '#layers-panel',
        title: 'Layers',
        text: 'Everything on this side of the car. Click to select, Shift-click for several.'
      },
      {
        at: '#canvas-wrap',
        title: 'The car',
        text: 'Click a panel or a shape to select it. Wheel to zoom, middle-drag to pan, right-click for more.'
      },
      { at: '#view-strip', title: 'Views', text: 'Each side of the car is its own view. Switch between them here.' },
      {
        at: '#entry-switch',
        title: 'Entries',
        text: 'One livery, many cars: show each car with its own number and driver.'
      },
      {
        at: '.inspector-column',
        title: 'What you selected',
        text: 'Colour, finish, size and place of what you selected. Livery colours: change one and everything painted in it follows.'
      },
      {
        at: '#tab-workshop',
        title: 'Workshop',
        text: 'Real paints, the painting order, real size, entries and notes for this livery.'
      },
      {
        at: '#export-button',
        title: 'Print & export',
        text: 'The Print pack with plan and masks, pictures, and decals for SlotForge Decals.'
      },
      { at: '#help-button', title: 'Help here', text: 'Help follows what you are doing. Press ? to see every key.' }
    ]
  },
  garage: {
    about: 'Where your cars, liveries, library, Trash and backups are.',
    steps: [
      {
        at: '.gr-rail',
        title: 'Sections',
        text: 'Recent liveries, your cars, the library you reuse, the Trash and backups.'
      },
      { at: '.gr-tools', title: 'Find and add', text: 'Search and filter what is shown, or add something new.' },
      { at: '.gr-main', title: 'Your liveries', text: 'Click one to see its details. Double-click to open it.' },
      {
        at: '.gr-detail',
        title: 'Details',
        text: 'What you can do with what you chose: open, share, or move it to the Trash.'
      },
      { at: '#help-button', title: 'Help here', text: 'Help follows what you are doing. Press ? to see every key.' }
    ]
  }
};
function startTour(id) {
  const steps = (HELP_TOURS[id]?.steps || []).filter(s => firstVisible(s.at));
  if (!steps.length) return toast('Nothing to show here yet.');
  helpTour = { id, steps, at: 0 };
  drawTour();
}
// A single mark from Help here: points at one control.
function pointAt(item) {
  const el = firstVisible(item.point);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  helpTour = { id: 'point', steps: [{ at: item.point, title: item.label, text: item.tip || 'Here.' }], at: 0 };
  drawTour();
}
function endTour() {
  helpTour = null;
  $('#help-tour').hidden = true;
  $('#help-tour').replaceChildren();
}
function drawTour() {
  const box = $('#help-tour');
  if (!helpTour) return endTour();
  const step = helpTour.steps[helpTour.at],
    el = firstVisible(step.at);
  if (!el) return helpTour.at < helpTour.steps.length - 1 ? (helpTour.at++, drawTour()) : endTour();
  const r = el.getBoundingClientRect(),
    single = helpTour.steps.length === 1,
    last = helpTour.at === helpTour.steps.length - 1;
  box.hidden = false;
  box.innerHTML = `<div class="ht-ring" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px"></div><div class="ht-coach" role="dialog" aria-modal="true" aria-labelledby="ht-title"><span class="ht-count">${single ? 'Here' : `Tour · ${helpTour.at + 1} of ${helpTour.steps.length}`}</span><b id="ht-title">${e(step.title)}</b><p>${e(step.text)}</p><div class="ht-row">${single ? '' : `<button data-tour-back ${helpTour.at ? '' : 'disabled'}>Back</button>`}<span class="ht-grow"></span>${single ? '' : '<span class="ht-esc">Esc ends</span>'}<button class="primary" data-tour-next>${single ? 'Got it' : last ? 'Done' : 'Next'}</button></div></div>`;
  placeCoach(box.querySelector('.ht-coach'), r);
  box.querySelector('[data-tour-next]').focus();
}
// Beside the control when there is room, else below or above it, else inside its top corner.
function placeCoach(coach, r) {
  const w = coach.offsetWidth,
    h = coach.offsetHeight,
    vw = innerWidth,
    vh = innerHeight,
    gap = 16,
    clampY = y => Math.max(8, Math.min(vh - h - 8, y)),
    clampX = x => Math.max(8, Math.min(vw - w - 8, x));
  let x, y;
  if (r.right + gap + w < vw - 8 && r.width < vw * 0.5) [x, y] = [r.right + gap, clampY(r.top)];
  else if (r.left - gap - w > 8 && r.width < vw * 0.5) [x, y] = [r.left - gap - w, clampY(r.top)];
  else if (r.bottom + gap + h < vh - 8) [x, y] = [clampX(r.left), r.bottom + gap];
  else if (r.top - gap - h > 8) [x, y] = [clampX(r.left), r.top - gap - h];
  else [x, y] = [clampX(r.left + 20), clampY(r.top + 20)];
  coach.style.left = x + 'px';
  coach.style.top = y + 'px';
}

// ------------------------------------------------------------------------ Keyboard sheet
function toggleKeys(open = !helpKeysOpen) {
  helpKeysOpen = open;
  const sheet = $('#help-keys');
  sheet.hidden = !open;
  if (!open) return sheet.replaceChildren();
  sheet.innerHTML = `<div class="hk-sheet" role="dialog" aria-modal="true" aria-labelledby="hk-title"><div class="hk-head"><h2 id="hk-title">Keyboard</h2><span class="hk-hint">Press <kbd>?</kbd> to open, <kbd>Esc</kbd> to close</span><button class="hp-close" data-keys-close aria-label="Close">${icon('close')}</button></div><div class="hk-cols">${HELP_KEYS.map(
    ([group, list]) => `<section><h4>${e(group)}</h4>${keyRows(list)}</section>`
  ).join('')}</div><p class="hk-note">Tool keys work on the canvas, not while you type in a field.</p></div>`;
  sheet.querySelector('[data-keys-close]').focus();
}

// ------------------------------------------------------------------------ Events
document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (ev.target.id === 'help-keys') return toggleKeys(false);
  if (!b) return;
  if (b.hasAttribute('data-help-close')) toggleHelp(false);
  else if (b.dataset.helpDo !== undefined) {
    const item = helpItems[Number(b.dataset.helpDo)];
    if (!item) return;
    if (item.run) {
      item.run();
      queueHelp();
    } else pointAt(item);
  } else if (b.dataset.helpTour) startTour(b.dataset.helpTour);
  else if (b.hasAttribute('data-help-keys')) toggleKeys(true);
  else if (b.hasAttribute('data-keys-close')) toggleKeys(false);
  else if (b.hasAttribute('data-tour-next')) {
    if (helpTour && helpTour.at < helpTour.steps.length - 1) {
      helpTour.at++;
      drawTour();
    } else endTour();
  } else if (b.hasAttribute('data-tour-back') && helpTour?.at) {
    helpTour.at--;
    drawTour();
  }
});
// Captured before the app's own keys, so Esc ends a tour without also letting go of the selection.
window.addEventListener(
  'keydown',
  ev => {
    const typing = ev.target.matches?.('input,textarea,select,[contenteditable]');
    if (helpTour) {
      const go = { Escape: 'end', ArrowRight: 'next', ArrowLeft: 'back' }[ev.key];
      if (!go) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (go === 'end') endTour();
      else if (go === 'next') $('#help-tour [data-tour-next]')?.click();
      else $('#help-tour [data-tour-back]')?.click();
      return;
    }
    if (helpKeysOpen && (ev.key === 'Escape' || (ev.key === '?' && !typing))) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return toggleKeys(false);
    }
    if (ev.key === 'F1') {
      ev.preventDefault();
      return toggleHelp();
    }
    if (ev.key === '?' && !typing && !ev.ctrlKey && !ev.metaKey && !$('#dialog').open) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      toggleKeys(true);
    }
  },
  true
);
window.addEventListener('resize', () => {
  if (helpTour) drawTour();
});
// Help here follows the page: the pages redraw themselves, and the studio calls queueHelp().
new MutationObserver(queueHelp).observe(document.body, { attributes: true, attributeFilter: ['class'] });
for (const id of ['garage-page', 'setup-page', 'pack-page', 'settings-page'])
  new MutationObserver(queueHelp).observe(document.getElementById(id), { childList: true });

// The version comes from the app, so it is never out of date.
function startHelp() {
  window.desktop
    ?.version?.()
    .then(v => {
      appVersion = String(v || '');
      const tag = document.querySelector('#app-menu .version');
      if (tag && appVersion) tag.textContent = 'v' + appVersion;
      helpShown = '';
      queueHelp();
    })
    .catch(() => {});
  if (pref('helpOpen', false)) toggleHelp(true);
}
