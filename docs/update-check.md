# The update check

Livery uses the same update check as every SlotForge app, built first in SlotForge Circuit
(`..\Circuit\docs\update-check-handoff.md` has the full description, the behaviour and the safety rules).
Added to Livery on 2026-11-19, replacing the old daily check and the **Update** button in the header.

**What it does:** about 5 seconds after Livery starts, it asks GitHub once for the latest release. If it is
newer, a window shows its **What's new** section, with **Skip this version** and **Download**. Download saves
the file for this copy in the Downloads folder, checks its size and SHA-256 and never runs it. Closing the
window hides it until the next start. **Settings → Updates** shows the versions, has **Check now** and the
switch for the check at start.

## The files

| File                            | Copied from Circuit                      | Livery's change                                                    |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `src/update-check.cjs`          | `desktop/update-check.cjs`               | the `fileNames` option (below); Circuit's names stay the default   |
| `renderer/update-ui.js`         | `app/update-ui.js`                       | `const desktop = root.desktop;` (Livery's preload is `window.desktop`) |
| `renderer/update-window.css`    | `app/update-window.css`                  | none                                                               |
| `tests/update-check.test.cjs`   | `desktop/update-check.test.cjs`          | the `require` path                                                 |
| `src/update-names.cjs`          | (Livery's own)                           | Livery's names and release file names                              |
| `tests/update-livery.test.cjs`  | (Livery's own)                           | every kind of copy finds its file among real Livery release names  |
| `tests/update-window.cjs`       | Circuit's interface test, as a Playwright suite | the window, Download, Settings, Check now, Skip                |

The wiring is in `src/main.cjs` (`startUpdateCheck()`, the `update:action` handler, which answers only
Livery's own `index.html`), `src/preload.cjs` (`updateCheck`, `onUpdateChange`) and
`renderer/app/maintenance.js` (`startUpdates()`). The Settings section is drawn by `update-ui.js` into a
holder and moved into the Settings page by `settingsSheet()` (`placeUpdateCard()`); the side list shows its
newest-version pill as the status. The Restyle basics the window relies on (`.dialog-heading`,
`.dialog-actions`, `.ss-t`, `.ss-ctl`, `.ss-pill`, `input.ss-switch`, `--ui-focus`, `--font-numbers`, …) are at
the end of `renderer/restyle.css`.

## Livery's release file names

Livery's electron-builder `artifactName`s differ from Circuit's, so `update-names.cjs` passes its own:

| This copy            | File it downloads                                                   |
| -------------------- | ------------------------------------------------------------------- |
| Windows installer    | `SlotForgeLivery-X.Y.Z-windows-x64-setup.exe`                       |
| Windows portable app | `SlotForgeLivery-X.Y.Z-windows-x64-portable.exe`                    |
| macOS                | `SlotForgeLivery-X.Y.Z-mac-arm64.dmg` or `-mac-x64.dmg`             |
| Linux AppImage       | `SlotForgeLivery-X.Y.Z-linux-x86_64.AppImage` (`-linux-arm64.AppImage`) |
| Linux .deb           | `SlotForgeLivery-X.Y.Z-linux-amd64.deb` (`-linux-arm64.deb`)        |

If `artifactName` in `package.json` changes, change `update-names.cjs` too; `tests/update-livery.test.cjs`
fails until both agree.

## Checks at start

Only packaged copies check by themselves. Development copies (`npm start`), test profiles
(`PAINTSHOP_TEST_DATA`) and `SLOTFORGE_NO_UPDATE_CHECK=1` check only when **Check now** is clicked.
The saved state is `update-check.json` in the profile folder, never in the library.

The release notes need a `## What's new` section: see [releases/README.md](releases/README.md).
