// Checks the built portable app and installer for this operating system.
// Windows: silently installs the setup.exe into a temporary folder, starts the
// installed app with an isolated test library, then silently uninstalls it.
// The portable .exe is started until it opens its library. macOS and Linux: confirms the DMG, ZIP,
// AppImage and .deb each contain the application executable.
// Never touches the normal user library: every launch uses PAINTSHOP_TEST_DATA.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const version = require('../package.json').version,
  arch = process.argv[2] || process.arch;
const dist = path.resolve(process.env.LIVERY_PACKAGE_DIR || path.join('dist', `v${version}`));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'livery-installer-'));
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const wait = async (test, ms, what) => {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw Error(`Timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 500));
  }
};

async function launch(executablePath, label) {
  const { _electron: electron } = require('playwright');
  const env = { ...process.env, PAINTSHOP_TEST_DATA: path.join(temp, `data-${label}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [], env, timeout: 60000 });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#tools button', { timeout: 60000 });
    assert.equal(await page.evaluate(() => typeof store), 'object');
  } finally {
    await app.close();
  }
  console.log(`PASS: ${label} starts.`);
}

async function windows() {
  const setup = path.join(dist, `SlotForgeLivery-${version}-windows-${arch}-setup.exe`),
    portable = path.join(dist, `SlotForgeLivery-${version}-windows-${arch}-portable.exe`);
  for (const file of [setup, portable]) assert(fs.statSync(file).size > 0, `Missing ${file}`);
  const target = path.join(temp, 'installed'),
    exe = path.join(target, 'SlotForge Livery.exe'),
    uninstaller = path.join(target, 'Uninstall SlotForge Livery.exe');
  // NSIS requires /D= to be the last argument and unquoted, even with spaces.
  sh(setup, ['/S', `/D=${target}`], { windowsVerbatimArguments: true });
  await wait(() => fs.existsSync(exe) && fs.existsSync(uninstaller), 120000, 'the installed application');
  assert(
    fs.existsSync(path.join(target, 'resources', 'ghostscript', 'bin', 'gswin64c.exe')),
    'Installer includes the EPS converter'
  );
  await launch(exe, 'installed app');
  // The uninstaller copies itself to %TEMP% and returns at once; wait for the removal.
  sh(uninstaller, ['/S']);
  await wait(() => !fs.existsSync(exe), 120000, 'the uninstaller');
  console.log('PASS: setup.exe installs silently, includes the converter and uninstalls cleanly.');
  // The portable .exe is a launcher that unpacks the app and starts it as a
  // child process, so Playwright cannot attach. Instead, wait for the app to
  // create its isolated library, then stop only the process tree we started.
  const data = path.join(temp, 'data-portable'),
    env = { ...process.env, PAINTSHOP_TEST_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(portable, [], { env, stdio: 'ignore', windowsHide: true });
  try {
    await wait(
      () => fs.existsSync(path.join(data, 'paintshop-library.sqlite')),
      120000,
      'the portable app to open its library'
    );
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  }
  console.log('PASS: portable exe starts and opens its library.');
}

function mac() {
  const app = 'SlotForge Livery.app/Contents/MacOS/SlotForge Livery',
    dmg = path.join(dist, `SlotForgeLivery-${version}-mac-${arch}.dmg`),
    zip = path.join(dist, `SlotForgeLivery-${version}-mac-${arch}.zip`);
  const mount = path.join(temp, 'dmg');
  fs.mkdirSync(mount);
  sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
  try {
    assert(fs.existsSync(path.join(mount, app)), 'DMG contains the app');
    assert(fs.lstatSync(path.join(mount, 'Applications')).isSymbolicLink(), 'DMG offers the Applications shortcut');
  } finally {
    sh('hdiutil', ['detach', mount]);
  }
  assert(sh('unzip', ['-l', zip]).includes(app), 'ZIP contains the app');
  console.log('PASS: DMG installer and portable ZIP contain the app.');
}

function linux() {
  const deb = path.join(dist, `SlotForgeLivery-${version}-linux-${arch === 'x64' ? 'amd64' : arch}.deb`),
    appImage = path.join(dist, `SlotForgeLivery-${version}-linux-${arch === 'x64' ? 'x86_64' : arch}.AppImage`);
  assert(/\/slotforge-livery\n/.test(sh('dpkg-deb', ['-c', deb]) + '\n'), '.deb contains the app');
  fs.chmodSync(appImage, 0o755);
  sh(appImage, ['--appimage-extract'], { cwd: temp });
  assert(fs.existsSync(path.join(temp, 'squashfs-root', 'slotforge-livery')), 'AppImage contains the app');
  console.log('PASS: .deb installer and portable AppImage contain the app.');
}

(async () => {
  try {
    if (process.platform === 'win32') await windows();
    else if (process.platform === 'darwin') mac();
    else linux();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
