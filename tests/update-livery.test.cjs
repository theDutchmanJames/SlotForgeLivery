'use strict';
// Livery's names for the shared update check: each kind of copy finds its own file among the
// files of a Livery release (v1.4.0's download names, as version 1.5.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/update-check.cjs');
const { LIVERY } = require('../src/update-names.cjs');

const NAMES = [
  'SlotForgeLivery-1.5.0-linux-amd64.deb',
  'SlotForgeLivery-1.5.0-linux-arm64.AppImage',
  'SlotForgeLivery-1.5.0-linux-arm64.deb',
  'SlotForgeLivery-1.5.0-linux-x86_64.AppImage',
  'SlotForgeLivery-1.5.0-mac-arm64.dmg',
  'SlotForgeLivery-1.5.0-mac-arm64.zip',
  'SlotForgeLivery-1.5.0-mac-x64.dmg',
  'SlotForgeLivery-1.5.0-mac-x64.zip',
  'SlotForgeLivery-1.5.0-windows-x64-portable.exe',
  'SlotForgeLivery-1.5.0-windows-x64-setup.exe',
  'SlotForgeLivery-source.tar.gz',
  'SHA256SUMS-windows-x64.txt'
];
const latest = U.release(
  {
    tag_name: 'v1.5.0',
    assets: NAMES.map(name => ({ name, size: 1000 }))
  },
  LIVERY.artifactPrefix
);

test('every kind of Livery copy finds its own release file', () => {
  const pick = edition => U.fileFor(latest, edition, LIVERY.artifactPrefix, LIVERY.fileNames)?.name;
  assert.equal(pick({ platform: 'win32', arch: 'x64' }), 'SlotForgeLivery-1.5.0-windows-x64-setup.exe');
  assert.equal(
    pick({ platform: 'win32', arch: 'x64', portable: true }),
    'SlotForgeLivery-1.5.0-windows-x64-portable.exe'
  );
  assert.equal(pick({ platform: 'darwin', arch: 'arm64' }), 'SlotForgeLivery-1.5.0-mac-arm64.dmg');
  assert.equal(pick({ platform: 'darwin', arch: 'x64' }), 'SlotForgeLivery-1.5.0-mac-x64.dmg');
  assert.equal(pick({ platform: 'linux', arch: 'x64', appImage: true }), 'SlotForgeLivery-1.5.0-linux-x86_64.AppImage');
  assert.equal(
    pick({ platform: 'linux', arch: 'arm64', appImage: true }),
    'SlotForgeLivery-1.5.0-linux-arm64.AppImage'
  );
  assert.equal(pick({ platform: 'linux', arch: 'x64' }), 'SlotForgeLivery-1.5.0-linux-amd64.deb');
  assert.equal(pick({ platform: 'linux', arch: 'arm64' }), 'SlotForgeLivery-1.5.0-linux-arm64.deb');
  // Windows on ARM has no Livery build: no file, so no window (Settings still shows the version).
  assert.equal(pick({ platform: 'win32', arch: 'arm64' }), undefined);
});

test('the source archive and checksum lists are never offered as a download', () => {
  assert(latest.assets.every(a => a.name.startsWith('SlotForgeLivery-1.5.0-')));
});

test('package.json names the release files the way the update check expects', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.build.nsis.artifactName, 'SlotForgeLivery-${version}-windows-${arch}-setup.${ext}');
  assert.equal(pkg.build.portable.artifactName, 'SlotForgeLivery-${version}-windows-${arch}-portable.${ext}');
  assert.equal(pkg.build.mac.artifactName, 'SlotForgeLivery-${version}-mac-${arch}.${ext}');
  assert.equal(pkg.build.linux.artifactName, 'SlotForgeLivery-${version}-linux-${arch}.${ext}');
  assert.equal(pkg.homepage, 'https://github.com/theDutchmanJames/SlotForgeLivery');
});
