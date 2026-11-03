# Building SlotForge Livery

Most users should download a native application from [Releases](https://github.com/theDutchmanJames/SlotForgeLivery/releases). These instructions are for developers and people rebuilding the published source.

## Requirements

- Node.js 24 or newer (GitHub builds use Node 24), npm and Git.
- Build on the operating system and architecture you are targeting. macOS Intel and Apple silicon have separate native builds; no cross-compilation is assumed.
- Windows: 7-Zip in `C:/Program Files/7-Zip/7z.exe`, or set `SEVEN_ZIP` to its executable path.
- macOS: Apple's Command Line Tools (`xcode-select --install`).
- Linux: a C/C++ compiler, GNU make, pkg-config, tar, xz and the normal Electron desktop runtime libraries. On Debian/Ubuntu, install the build tools with `sudo apt install build-essential pkg-config xz-utils`.
- Internet access for locked npm dependencies, Electron, packaging utilities and pinned converter downloads. The installed app works offline.

## Development

```sh
npm ci
npm run setup:converter
npm start
```

The converter setup verifies the upstream Ghostscript archive's SHA-256. On Windows it extracts the official binary without running its installer. On macOS and Linux it builds the same version from source, including its resource files in the executable. Setup writes only inside `vendor/`; it does not install Ghostscript system-wide.

## Native packages

```sh
# Windows (PowerShell)
npm ci
npm run setup:converter
npm run check
npm test
npm run dist:win -- --x64 --publish never

# macOS
bash build-mac.command --no-pause

# Linux
bash build-linux.sh --no-pause
```

The macOS and Linux scripts install locked dependencies, run checks and unit tests, build the converter and package the native application. The `build-mac-quick.command` and `build-linux-quick.sh` variants reuse matching dependencies and skip tests; use them only after a successful full build. `--help` shows options. Build as a normal user, not root.

Output is in `dist/v<version>/`: a Windows portable executable, macOS DMG and ZIP, or Linux AppImage and Debian package. Each package includes its converter. The macOS apps use ad-hoc signing, without Apple notarisation; Windows builds are unsigned. Release checksums identify the uploaded files but are not a publisher signature.

## Tests and artwork

```sh
npm run check
npm test
node scripts/converter-smoke.cjs
node tests/smoke.cjs
node tests/vector-import.cjs
npm run test:integration
```

Desktop tests use Playwright and Electron in isolated `test-output/` profiles. They never use the normal library. Run GUI tests sequentially, because focus and pointer-capture tests require control of their window. On Linux, use `xvfb-run -a` for a virtual display. For the font suites on a non-Windows host, set `TEST_FONT` to a local redistributable TTF/OTF file. Optional `ELECTRON_BINARY` and `PLAYWRIGHT_MODULE` variables override the installed tools.

`scripts/package-smoke.cjs` starts the unpacked native build and imports an EPS through the bundled converters. This catches missing packaged binaries/WASM files as well as startup errors. GitHub runs it on each native platform before publishing. See `TESTING.md` for the earlier detailed review record.

The README demonstration car is original test artwork. It is not installed as a user template. To regenerate the application icon, run `npm run build:icons`.

## Corresponding source and third-party builds

Livery is licensed under **AGPL-3.0-or-later**. Each native release includes:

- `SlotForgeLivery-source.tar.gz`: the exact first-party source, assets, dependency lockfile and build scripts from the tested commit.
- `ghostscript-10.08.0.tar.xz`: the unmodified upstream source distribution, including bundled third-party source and build instructions. The Windows release uses the unmodified `gs10080w64.exe` from the same Artifex release; extraction and checksums are in `scripts/setup-converter.cjs`. Native Unix configure/build commands are in `scripts/build-ghostscript.sh`. Upstream Windows build instructions are in the archive's `doc/src/Make.rst`.
- `mupdf-1.28.1-complete-source.tar.gz`: MuPDF commit `20061bd45183f5a2bff8f43675e4da91e5ac2901` with recursive submodule source. JavaScript/WASM build instructions and scripts are in `platform/wasm/BUILDING.md` and `platform/wasm/tools/`. The app uses the unmodified `mupdf@1.28.1` npm distribution, whose integrity is recorded in `package-lock.json`.
- `MUPDF-SOURCE-REVISIONS.txt`: the converter's recursive submodule revisions.
- `SHA256SUMS-*.txt`: hashes for the installers and source archives.

These sources are available at the same download location as the installers, without an account or fee. Keep the source downloads available when redistributing the binaries and comply with all applicable licences. Third-party components retain their own copyright and licence notices; see `THIRD-PARTY-NOTICES.txt`.

`scripts/collect-sources.sh` reproduces the source archives. `.github/workflows/native-release.yml` checks out an immutable commit, builds on native runners, tests each packaged converter, collects source, and publishes a draft only after verifying all expected assets and hashes. Publishing is opt-in through the workflow's `publish` checkbox. Existing releases are never silently overwritten.

If only publication fails after every build passes, run the workflow again with `publish` enabled and `resume_run` set to the completed run ID. It verifies every native job, rejects changed runtime/licence files, downloads that run's existing artifacts, and resumes an identical draft without overwriting differing assets. The release tag still points to the original tested commit.

## Dependency audit

The release preparation checks `npm audit --omit=dev` separately from build dependencies. The packaging toolchain currently inherits a moderate minimatch glob-complexity advisory. Its globs are maintained repository build configuration, not imported user artwork. No incompatible major override is forced into the packaging toolchain. Sharp was updated to 0.35.5 to address its reported image-library advisories. Recheck the audit when updating tools.
