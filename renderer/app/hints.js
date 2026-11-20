// Livery renderer · Step-by-step tips in the corner of the canvas.
// Classic script: shares top-level names with the other renderer/app/*.js files.
// Load order is fixed in index.html.
'use strict';
// Each step is shown until its condition is met or the user dismisses it.
const HINT_STEPS = [
  {
    id: 'prepare',
    title: 'Choose the panels',
    text: 'Click the panels you want to paint and give them a name. <b>Add a car</b> does this in guided steps.',
    when: () => preparing
  },
  {
    id: 'paint',
    title: 'Choose your colours',
    text: 'Click a panel on the car, or <b>Base paint</b> in Layers, then click a livery colour on the right.',
    when: () =>
      !preparing &&
      (project.base || '#ffffff').toLowerCase() === '#ffffff' &&
      !Object.values(project.template.views).some(v => v?.regions.some(r => r.colour))
  },
  {
    id: 'artwork',
    title: 'Add stripes, numbers and decals',
    text: 'Use the tools on the left: <b>R</b> rectangle, <b>E</b> ellipse, <b>L</b> line, <b>T</b> text, <b>I</b> decal artwork.',
    when: () => !preparing && !Object.values(project.views).some(list => list?.length)
  },
  {
    id: 'share',
    title: 'Take it to the workshop',
    text: '<b>Print &amp; export → Print pack</b> makes the plan, masks and pictures. <b>F1</b> shows help for what you are doing.',
    when: () => !preparing && !(pref('hintsDone', []) || []).includes('share')
  }
];
function currentHint() {
  if (!project || !activeView() || pref('showHints', true) === false || drawPoints.length) return null;
  const dismissed = pref('hintsDismissed', []) || [];
  const index = HINT_STEPS.findIndex(step => !dismissed.includes(step.id) && step.when());
  return index < 0 ? null : { ...HINT_STEPS[index], number: index + 1 };
}
function renderStepHint() {
  const box = $('#step-hint'),
    hint = currentHint();
  box.hidden = !hint;
  if (!hint) return;
  if (box.dataset.step === hint.id) return;
  box.dataset.step = hint.id;
  box.innerHTML = `<span class="step-count">Step ${hint.number} of ${HINT_STEPS.length}</span><strong>${hint.title}</strong><p>${hint.text}</p><div class="step-actions"><button data-hint-dismiss="${hint.id}">Got it</button><button data-hint-off="true" class="quiet">Hide tips</button></div>`;
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.hintDismiss) {
    setPreference('hintsDismissed', [...new Set([...(pref('hintsDismissed', []) || []), b.dataset.hintDismiss])]);
    renderStepHint();
  } else if (b.dataset.hintOff) {
    setPreference('showHints', false);
    renderStepHint();
    toast('Tips hidden. Turn them back on in Settings.');
  } else if (['save-livery', 'pdf', 'png', 'print-pack'].includes(b.dataset.action) && project) {
    // Reaching the last step completes the tour.
    if (!(pref('hintsDone', []) || []).includes('share'))
      setPreference('hintsDone', [...(pref('hintsDone', []) || []), 'share']);
    renderStepHint();
  }
});
