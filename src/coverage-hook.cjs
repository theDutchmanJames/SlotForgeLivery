'use strict';
// Test coverage of the window's own code, for scripts/coverage.cjs. Only active
// when LIVERY_COVERAGE names a folder and the app is not a built copy. Every
// window records which code ran; the record is written out every second
// (V8 resets it on each read, so the pieces are merged afterwards).
const fs = require('node:fs'),
  path = require('node:path');
module.exports = function coverage(app, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const live = new Set();
  let pieces = 0;
  const take = async wc => {
    try {
      const { result } = await wc.debugger.sendCommand('Profiler.takePreciseCoverage');
      const ours = result.filter(s => s.url.startsWith('file:') && s.functions.length);
      if (ours.length)
        fs.writeFileSync(
          path.join(dir, `renderer-${process.pid}-${wc.id}-${++pieces}.json`),
          JSON.stringify({ result: ours })
        );
    } catch {
      /* The window closed in between. */
    }
  };
  const start = async wc => {
    try {
      await wc.debugger.sendCommand('Profiler.enable');
      await wc.debugger.sendCommand('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
    } catch {}
  };
  app.on('web-contents-created', (_, wc) => {
    try {
      wc.debugger.attach('1.3');
    } catch {
      return;
    }
    live.add(wc);
    start(wc);
    // A reload starts a new page: keep what the old one ran, then record again.
    wc.on('did-start-navigation', ({ isSameDocument, isMainFrame }) => {
      if (isMainFrame && !isSameDocument) take(wc);
    });
    wc.on('did-navigate', () => start(wc));
    wc.once('destroyed', () => live.delete(wc));
  });
  setInterval(() => {
    for (const wc of live) if (!wc.isDestroyed()) take(wc);
  }, 1000).unref();
  app.on('before-quit', () => {
    for (const wc of live) if (!wc.isDestroyed()) take(wc);
  });
};
