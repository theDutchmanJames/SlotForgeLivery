'use strict';
// Interface preferences are independent of project paint and exported artwork.
window.LiverySettings = function ({ read, save }) {
  const page = document.querySelector('#settings-page');
  let draft = null;
  const palette = key => {
    if (!Theme.THEMES.some(([k]) => k === key)) key = 'dark';
    const tile = page.querySelector(`[data-theme-pick="${key}"]`);
    if (!tile) return { ...Theme.DEFAULT };
    const css = getComputedStyle(tile);
    return Object.fromEntries(Theme.COLORS.map(([k]) => [k, Theme.hex6(css.getPropertyValue('--' + k)) || Theme.DEFAULT[k]]));
  };
  function setColors(el, colors) {
    for (const [k] of Theme.COLORS) {
      if (colors) el.style.setProperty('--' + k, colors[k]);
      else el.style.removeProperty('--' + k);
    }
    if (colors) el.style.setProperty('--on-accent', Theme.onAccent(colors.accent));
    else el.style.removeProperty('--on-accent');
  }
  function apply(settings = read()) {
    const theme = Theme.THEMES.some(([k]) => k === settings?.theme) ? settings.theme : 'dark';
    const colors = Theme.customOf(settings), root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.tone = (theme === 'custom' ? Theme.isLight(colors.panel) : ['light', 'ocean'].includes(theme)) ? 'light' : 'dark';
    setColors(root, theme === 'custom' ? colors : null);
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeChoice === theme));
    page.querySelectorAll('[data-theme-pick]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themePick === theme));
    const custom = page.querySelector('[data-theme-pick="custom"]');
    if (custom) setColors(custom, colors);
  }
  function preview() {
    apply({ theme: 'custom', customColors: draft });
    const warning = page.querySelector('#theme-warning');
    warning.textContent = Theme.problems(draft).join(' ');
    warning.hidden = !warning.textContent;
  }
  function render() {
    page.innerHTML = `<div class="settings-content"><div class="settings-heading"><div><h1>Settings</h1><p>Make SlotForge Livery feel like your workshop.</p></div><button id="settings-back">Back to Paint Studio</button></div>
      <section class="settings-card"><h2>App theme</h2><p>The same colour choices as SlotForge Timing and Paddock. Saved on this computer; your livery colours stay as you designed them.</p>
      <div class="theme-grid" role="group" aria-label="App theme">${Theme.THEMES.map(([key, name]) => `<button type="button" class="theme-tile" data-theme="${key}" data-theme-pick="${key}" aria-pressed="false"><span class="theme-swatches" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${name}</span></button>`).join('')}</div>
      <button id="edit-theme-colors">Edit custom colours</button><span class="theme-saved" role="status">Theme choices save automatically.</span></section>
      <section id="custom-theme-editor" class="settings-card" hidden><h2>Your own colours</h2><p>Preview changes while choosing. Save applies your Custom theme; Cancel restores your saved theme.</p>
      <div class="theme-start"><label for="theme-copy">Start from</label><select id="theme-copy">${Theme.THEMES.filter(([k]) => k !== 'custom').map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}</select><button id="copy-theme-colors">Copy its colours</button></div>
      <div class="color-grid">${Theme.COLORS.map(([key, name, where]) => `<label class="color-row"><input type="color" data-theme-color="${key}" aria-label="${name}"><span><strong>${name}</strong><small>${where}</small></span></label>`).join('')}</div>
      <p id="theme-warning" class="inline-note" role="status" hidden></p><div class="theme-editor-actions"><button id="cancel-theme-colors">Cancel</button><button class="primary" id="save-theme-colors">Save custom colours</button></div></section></div>`;
    apply();
  }
  function updateInputs() {
    page.querySelectorAll('[data-theme-color]').forEach(input => { input.value = draft[input.dataset.themeColor]; });
    preview();
  }
  function edit() {
    const settings = read();
    draft = settings?.customColors ? Theme.customOf(settings) : palette(settings?.theme || 'dark');
    page.querySelector('#custom-theme-editor').hidden = false;
    page.querySelector('#theme-copy').value = Theme.THEMES.some(([k]) => k === settings?.theme && k !== 'custom') ? settings.theme : 'dark';
    updateInputs();
    page.querySelector('#custom-theme-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function cancel() {
    draft = null;
    const editor = page.querySelector('#custom-theme-editor');
    if (editor) editor.hidden = true;
    apply();
  }
  function choose(theme) {
    cancel();
    if (theme === 'custom' && !read()?.customColors) { edit(); return; }
    save({ theme });
    apply();
  }
  page.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.themePick) choose(b.dataset.themePick);
    if (b.id === 'edit-theme-colors') edit();
    if (b.id === 'copy-theme-colors') { draft = palette(page.querySelector('#theme-copy').value); updateInputs(); }
    if (b.id === 'cancel-theme-colors') cancel();
    if (b.id === 'save-theme-colors' && draft) { save({ theme: 'custom', customColors: { ...draft } }); cancel(); }
  });
  page.addEventListener('input', ev => {
    const key = ev.target.dataset.themeColor, value = Theme.hex6(ev.target.value);
    if (draft && Theme.COLORS.some(([k]) => k === key) && value) { draft[key] = value; preview(); }
  });
  return { apply, render, cancel, choose };
};
