**SlotForge Livery 1.2.0 — A library built to grow**

**From White Kits to your Design Concept**

## What's new

- **SQLite library storage:** templates, projects, views, paintable areas, layers and groups are stored as separate records. Ordinary saves update changed records instead of rewriting the whole library.
- **Less duplication:** identical images, fonts and large vector strings share storage while designs remain independently editable.
- **Lighter browsing:** library items load when needed, with cached thumbnails and 32 items per page.
- **Verified migration:** existing JSON libraries are migrated automatically on first launch. Livery reconstructs and compares the complete library before switching; the original JSON and backup remain untouched.
- **Safer saving and recovery:** transactions protect interrupted writes, stale saves are rejected, and exports cannot overwrite the library files.
- **SlotForge branding:** theme-aware logos in the header and footer.

Your editable shapes, groups, custom fonts, paintable labels and existing `.sfpaint` packages continue to work. PDF and transparent PNG exports remain available.

## Updating safely

Export a library backup before updating. Your data stays in the existing `SlotForge Paintshop` user-data folder; no database installation or account is needed.

After migration, new work is saved to SQLite. **The preserved JSON is a migration snapshot, not an ongoing backup.** An older Livery version will not see subsequent SQLite changes. Export compatible `.sfpaint` packages from this version before downgrading.

The 180 MiB whole-library save limit has been removed. The existing **180 MiB package import/export limit** still applies; share selected items in smaller packages for larger collections.

## Downloads

- **Windows Intel/AMD:** `SlotForgeLivery-1.2.0-windows-x64.exe` — download and run; portable, no installation required.
- **Ubuntu/Debian Intel/AMD:** `SlotForgeLivery-1.2.0-linux-amd64.deb`.
- **Other Linux Intel/AMD:** `SlotForgeLivery-1.2.0-linux-x86_64.AppImage` — mark executable in file properties.
- **Linux ARM64:** choose the `arm64.deb` or `arm64.AppImage`.

macOS downloads are deferred for this release because the hosted Mac builds did not complete in this run. Choose an application download, not a source archive, to run Livery. See the README for installation instructions.

Windows builds are unsigned. EPS and vector-PDF conversion are included and work offline.

## Verification

Local verification passed 46 storage/model tests, 34 desktop integration suites and four release checks, plus packaged Windows migration/save/reopen and EPS import. A disposable copy of an existing personal library migrated exactly. Native release downloads are published only after their build and packaged smoke checks pass.

GitHub Actions passed native builds, storage tests, packaged migration/save/reopen and EPS import on **Windows x64, Linux x64 and Linux ARM64**. The matching source archives and checksums also passed. No unverified Mac installers are included.

## Licence and sources

Livery uses **GNU AGPL version 3 or later**, including the current Ghostscript and MuPDF converters. No purchase or account is required. Corresponding source archives, build instructions and `SHA256SUMS-*.txt` files accompany the downloads.
