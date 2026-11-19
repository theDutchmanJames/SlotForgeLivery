'use strict';
// Livery's settings for the shared update check (update-check.cjs, from SlotForge Circuit).
// Livery's release files are named by electron-builder's artifactName in package.json:
// "SlotForgeLivery-X.Y.Z-windows-x64-setup.exe", "-windows-x64-portable.exe", "-mac-arm64.dmg",
// "-linux-x86_64.AppImage", "-linux-amd64.deb". Circuit names them differently, so Livery
// passes its own name ends (after "SlotForgeLivery-X.Y.Z-") for each kind of copy.
const LIVERY = {
  appName: 'Livery',
  artifactPrefix: 'SlotForgeLivery',
  userAgent: 'SlotForge-Livery',
  fileNames: (kind, arch) =>
    ({
      setup: [`windows-${arch}-setup.exe`],
      portable: [`windows-${arch}-portable.exe`],
      mac: [`mac-${arch}.dmg`],
      appimage: [`linux-${arch === 'x64' ? 'x86_64' : arch}.AppImage`],
      deb: [`linux-${arch === 'x64' ? 'amd64' : arch}.deb`]
    })[kind]
};
module.exports = { LIVERY };
