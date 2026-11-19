// Livery renderer · Studio preferences on the Settings page.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
const CAR_SCALES = ['1:32', '1:24', '1:43', 'HO', 'Other'],
  UNDO_CHOICES = [30, 60, 120, 200];
const pref = (key, fallback) => store.settings?.[key] ?? fallback;
function undoLimit() {
  return UNDO_CHOICES.includes(pref('undoSteps')) ? pref('undoSteps') : 60;
}
function setPreference(key, value) {
  store.settings = { ...store.settings, [key]: value };
  scheduleSave();
}
function preferenceToggle(id, label, note, checked) {
  return `<label class="pref-row" for="${id}"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span><strong>${label}</strong><small>${note}</small></span></label>`;
}
function studioPreferencesHTML() {
  return `<section class="settings-card" id="studio-preferences"><h2>Studio</h2><p>How the Paint Studio starts and behaves. Saved on this computer.</p>
  <div class="pref-grid"><div class="field"><label for="pref-scale">Scale for new cars</label><select id="pref-scale">${CAR_SCALES.map(s => `<option ${pref('defaultScale', '1:32') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div class="field"><label for="pref-undo">Undo steps</label><select id="pref-undo">${UNDO_CHOICES.map(n => `<option value="${n}" ${undoLimit() === n ? 'selected' : ''}>${n}</option>`).join('')}</select><small class="note">More steps use more memory with large images.</small></div></div>
  ${preferenceToggle('pref-preview', 'Finish preview', 'Show subtle gloss, metallic and pearl cues on the canvas.', pref('paintPreview', true) !== false)}
  ${preferenceToggle('pref-snap', 'Snap on start', 'Start with Snap switched on.', pref('snapDefault', false))}
  ${preferenceToggle('pref-grid', 'Grid on start', 'Start with the Grid visible.', pref('gridDefault', false))}
  ${preferenceToggle('pref-hints', 'Step-by-step tips', 'Show the next step in the corner of the canvas.', pref('showHints', true) !== false)}
  <button id="pref-reset-hints" data-row-label="Tips you closed" ${(pref('hintsDismissed', []) || []).length ? '' : 'disabled'}>Show dismissed tips again</button></section>`;
}
function renderStudioPreferences() {
  const content = $('#settings-page .settings-content');
  if (!content || $('#studio-preferences')) return;
  content.insertAdjacentHTML('beforeend', studioPreferencesHTML() + maintenanceSettingsHTML());
}
// Snap and Grid follow their start-up preference once per launch.
function applyStartupPreferences() {
  $('#snap').checked = !!pref('snapDefault', false);
  $('#grid').checked = !!pref('gridDefault', false);
  $('#canvas-wrap').classList.toggle('grid', $('#grid').checked);
  $('#rulers').checked = pref('showRulers', false) === true;
}
document.addEventListener('change', ev => {
  const el = ev.target;
  if (!el.closest?.('#studio-preferences')) return;
  if (el.id === 'pref-scale') setPreference('defaultScale', CAR_SCALES.includes(el.value) ? el.value : '1:32');
  if (el.id === 'pref-undo') {
    setPreference('undoSteps', Number(el.value));
    while (undo.length > undoLimit()) undo.shift();
  }
  if (el.id === 'pref-preview') setPreference('paintPreview', el.checked);
  if (el.id === 'pref-snap') setPreference('snapDefault', el.checked);
  if (el.id === 'pref-grid') setPreference('gridDefault', el.checked);
  if (el.id === 'pref-hints') setPreference('showHints', el.checked);
  toast('Preference saved.');
});
document.addEventListener('click', ev => {
  if (ev.target.closest('#pref-reset-hints')) {
    setPreference('hintsDismissed', []);
    setPreference('showHints', true);
    $('#pref-hints').checked = true;
    ev.target.closest('#pref-reset-hints').disabled = true;
    toast('Tips will show again.');
  }
});

// Settings as a Double Rail + Settings Sheet (SlotForge Restyle). The page's own markup is
// rearranged after it is drawn: controls are moved, never rebuilt, so their ids and handlers stay.
// The rail is the table of contents: a click scrolls to the section, and it shows where you are.
const SETTINGS_SECTIONS = [
  ['theme-settings', 'App theme', 'palette'],
  ['studio-preferences', 'Studio', 'brush'],
  ['backup-settings', 'Automatic backups', 'save'],
  ['update-settings', 'Updates', 'import']
];
function settingsStatus(id) {
  if (id === 'theme-settings') {
    const key = store.settings?.theme || 'dark';
    return (Theme.THEMES.find(([k]) => k === key) || [key, key])[1];
  }
  if (id === 'studio-preferences') return `Scale ${pref('defaultScale', '1:32')} · ${undoLimit()} undo steps`;
  if (id === 'backup-settings') {
    const b = backupSettings();
    return b.every === 'off' ? 'Off' : `${b.every === 'daily' ? 'Every day' : 'Every week'} · keep ${b.keep}`;
  }
  // Updates (update-ui.js): the newest-version pill, such as 'You have the latest version'.
  return document.querySelector('#update-settings .ss-pill')?.textContent || '';
}
// Sections that are not there (Updates outside the desktop app) have no entry in the side list.
function settingsRailEntries() {
  document
    .querySelectorAll('#settings-page [data-settings-section]')
    .forEach(t => (t.hidden = !document.getElementById(t.dataset.settingsSection)));
}
function refreshSettingsRail() {
  document.querySelectorAll('#settings-page [data-settings-section]').forEach(b => {
    const status = b.querySelector('.ss-status');
    if (status) status.textContent = settingsStatus(b.dataset.settingsSection);
  });
  // Keep each segmented choice in step with its list, also when code set the list.
  document.querySelectorAll('#settings-page .ss-seg > button').forEach(b => {
    b.setAttribute('aria-pressed', String(document.getElementById(b.dataset.segFor)?.value === b.dataset.value));
  });
}
// A list of up to five short options becomes a segmented choice; the list stays, hidden.
function segmentSelect(select) {
  const seg = document.createElement('span');
  seg.className = 'ss-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', select.labels?.[0]?.textContent || select.getAttribute('aria-label') || '');
  for (const option of select.options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.segFor = select.id;
    b.dataset.value = option.value;
    b.textContent = option.textContent.replace(/ backups$/, '');
    b.setAttribute('aria-pressed', String(option.value === select.value));
    b.onclick = () => {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    };
    seg.append(b);
  }
  select.classList.add('ss-hidden');
  select.after(seg);
}
function settingsSheet() {
  const page = $('#settings-page'),
    content = page?.querySelector('.settings-content');
  if (!content || content.classList.contains('ss-done')) return;
  content.classList.add('ss-done');
  const canvas = document.createElement('div');
  canvas.className = 'ss-canvas';
  for (const section of content.querySelectorAll(':scope > section.settings-card')) {
    const title = section.querySelector(':scope > h2'),
      intro = title?.nextElementSibling?.matches('p') ? title.nextElementSibling : null;
    intro?.classList.add('ss-intro');
    const sheet = document.createElement('div');
    sheet.className = 'ss-sheet';
    [...section.children].filter(c => c !== title && c !== intro).forEach(c => sheet.append(c));
    sheet.querySelectorAll(':scope > .pref-grid').forEach(g => g.replaceWith(...g.children));
    for (const child of [...sheet.children]) {
      if (child.matches('.theme-grid, .color-grid, .theme-start')) child.classList.add('ss-stack');
      else if (child.matches('p.note, p.inline-note')) child.classList.add('ss-note');
      else child.classList.add('ss-row');
      if (child.matches('button')) {
        // A loose button becomes a row: what it does on the left, the button on the right.
        const row = document.createElement('div');
        row.className = 'ss-row ss-button-row';
        child.classList.remove('ss-row');
        child.before(row);
        row.append(
          Object.assign(document.createElement('span'), {
            className: 'ss-t',
            textContent: child.dataset.rowLabel || ''
          }),
          child
        );
      }
    }
    sheet.querySelectorAll('select').forEach(s => s.options.length <= 5 && s.id !== 'theme-copy' && segmentSelect(s));
    section.append(sheet);
    canvas.append(section);
  }
  const back = content.querySelector('#settings-back');
  const rail = document.createElement('div');
  rail.className = 'ss-rail';
  rail.setAttribute('aria-label', 'Settings sections');
  rail.innerHTML =
    '<div class="ss-railtitle">Settings</div><span class="lib-label">Livery</span>' +
    SETTINGS_SECTIONS.map(
      ([id, name, ic]) =>
        `<button type="button" class="ss-tab" data-settings-section="${id}">${icon(ic)}<span class="ss-tabtext"><span>${e(name)}</span><small class="ss-status"></small></span></button>`
    ).join('') +
    '<div class="ss-tools"></div>';
  if (back) {
    back.classList.add('ss-tool');
    back.innerHTML = icon('back') + '<span>Back to Paint Studio</span>';
    rail.querySelector('.ss-tools').append(back);
  }
  content.querySelector('.settings-heading')?.remove();
  content.replaceChildren(rail, canvas);
  placeUpdateCard();
  settingsRailEntries();
  refreshSettingsRail();
  const tabs = [...rail.querySelectorAll('[data-settings-section]')];
  const mark = id => tabs.forEach(t => t.classList.toggle('active', t.dataset.settingsSection === id));
  tabs.forEach(
    t =>
      (t.onclick = () => {
        mark(t.dataset.settingsSection);
        $('#' + t.dataset.settingsSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
  );
  canvas.onscroll = () => {
    // At the bottom the last sections can never reach the top: then the middle of the view counts.
    const atEnd = canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 2,
      top = canvas.getBoundingClientRect().top + (atEnd ? canvas.clientHeight / 2 : 90);
    let current = SETTINGS_SECTIONS[0][0];
    for (const [id] of SETTINGS_SECTIONS)
      if ($('#' + id) && $('#' + id).getBoundingClientRect().top <= top) current = id;
    mark(current);
  };
  mark(SETTINGS_SECTIONS[0][0]);
}
document.addEventListener('change', ev => {
  if (ev.target.closest?.('#settings-page')) setTimeout(refreshSettingsRail);
});
document.addEventListener('click', ev => {
  if (ev.target.closest?.('#settings-page .theme-grid')) setTimeout(refreshSettingsRail);
});
