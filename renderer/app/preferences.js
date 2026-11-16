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
  <button id="pref-reset-hints" ${(pref('hintsDismissed', []) || []).length ? '' : 'disabled'}>Show dismissed tips again</button></section>`;
}
function renderStudioPreferences() {
  const content = $('#settings-page .settings-content');
  if (!content || $('#studio-preferences')) return;
  content.insertAdjacentHTML('beforeend', studioPreferencesHTML());
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
