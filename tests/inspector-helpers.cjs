// Existing editing regressions exercise the property controls with their folders open.
// layer-order-folders.cjs separately verifies collapsed defaults and saved folder state.
exports.openPropertyFolders = async page =>
  page.evaluate(() => {
    store.settings = {
      ...store.settings,
      inspectorFolders: {
        ...store.settings?.inspectorFolders,
        paint: true,
        finish: true,
        position: true,
        line: true,
        text: true,
        curves: true,
        reuse: true,
        outline: true,
        align: true,
        shadow: true,
        realsize: true
      }
    };
    document.querySelectorAll('[data-inspector-folder]').forEach(el => {
      if (el.dataset.inspectorFolder !== 'fit') el.open = true;
    });
    renderInspector();
  });

// Clicks a [data-action] button. A button in a closed menu or in the Workshop tab
// is revealed first through the opener its container names (data-opener).
exports.clickAction = async (page, action) => {
  // The User Library is part of the Garage page (≡ → Garage → a library section), and the
  // Garage is left for the studio rather than closed like a dialog.
  if (action === 'library') return page.evaluate(() => actions.library());
  if (
    action === 'close-dialog' &&
    !(await page.locator('#dialog[open]').count()) &&
    (await page.locator('#garage-page').isVisible())
  )
    return page.evaluate(() => actions.studio());
  // After a drawing is imported the guided setup page opens; Cancel keeps the car in preparation.
  if (
    action === 'close-dialog' &&
    !(await page.locator('#dialog[open]').count()) &&
    (await page.locator('#setup-page').isVisible())
  )
    return page.evaluate(() => cancelSetup());
  const target = `[data-action="${action}"]:visible`;
  if (!(await page.locator(target).count()))
    await page.evaluate(a => {
      const holders = [...document.querySelectorAll(`[data-action="${a}"]`)]
        .map(b => b.closest('[data-opener]'))
        .filter(Boolean);
      // The Workshop tab is drawn only when it opens, so its buttons may not exist yet.
      const opener = holders[0]
        ? document.querySelector(holders[0].dataset.opener)
        : document.querySelector('.inspector-tabs:not([hidden]) #tab-workshop');
      opener?.click();
    }, action);
  try {
    return await page.locator(target).first().click({ timeout: 15000 });
  } catch (error) {
    // A picture of the moment helps to see what covered or hid the button.
    await page
      .screenshot({ path: require('node:path').join(__dirname, '..', 'test-output', `click-${action}-failed.png`) })
      .catch(() => {});
    throw error;
  }
};

// The Light and Dark switch is in the top right corner of the top bar.
exports.chooseTone = async (page, tone) => {
  await page.locator(`.tb-theme [data-theme-choice="${tone}"]`).click();
};

// After a drawing is imported, the guided setup opens; tests of the detailed panel editor
// (Panel Studio) continue there through its Detailed editor button.
exports.detailedEditor = async (page, options = {}) => {
  await page.waitForFunction(
    () =>
      document.querySelector('#repair-preview') || document.querySelector('#setup-page:not([hidden]) #setup-canvas'),
    null,
    options
  );
  if (await page.locator('#setup-page').isVisible()) await page.locator('[data-setup-detailed]').click();
  return page.waitForSelector('#repair-preview', options);
};

// A package comes in straight away and the Garage opens on Arrivals. With `open`, the first
// livery that came in is opened in the Paint Studio (what tests did after importing before).
exports.arrived = async (page, { open = true } = {}) => {
  await page.waitForSelector('#garage-page .ar-bar');
  if (!open || !(await page.locator('[data-arrival-pick^="projects:"]').count())) return;
  await page.locator('[data-arrival-pick^="projects:"]').first().click();
  await page.locator('[data-arrival-open]').click();
  await page.waitForFunction(() => !!project && document.querySelector('#garage-page').hidden);
};
