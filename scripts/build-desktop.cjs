// Native installer builder. Never reads or changes collection data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function options(args) {
  const platform = args.shift();
  if (!['windows', 'linux', 'mac'].includes(platform)) throw Error('Choose windows, linux or mac.');
  const result = { platform, quick: false, pause: true, help: false, arch: process.arch };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--quick') result.quick = true;
    else if (arg === '--no-pause') result.pause = false;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--arch') result.arch = args.shift();
    else throw Error(`Unknown option: ${arg}. Use --help for instructions.`);
  }
  if (!result.help && !(platform === 'windows' ? ['x64'] : ['x64', 'arm64']).includes(result.arch)) {
    throw Error(
      platform === 'windows'
        ? 'Windows builds are x64 only. Use --arch x64.'
        : 'Unsupported architecture. Use --arch x64 or --arch arm64.'
    );
  }
  return result;
}

function run(command, args) {
  // npm is a .cmd script on Windows, which Node only starts through a shell.
  const viaShell = process.platform === 'win32' && command === 'npm';
  if (viaShell && args.some(arg => !/^[\w:.=-]+$/.test(arg))) throw Error(`Unsafe npm argument: ${args.join(' ')}`);
  const result = viaShell
    ? spawnSync(`npm ${args.join(' ')}`, { cwd: root, stdio: 'inherit', env: process.env, shell: true })
    : spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw Error(`Could not start ${command}: ${result.error.message}`);
  if (result.status !== 0)
    throw Error(
      `${command} ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ` (exit ${result.status})`}. No successful build is reported.`
    );
}

function build(config) {
  const { platform, arch, quick } = config;
  const label = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }[platform];
  const hostPlatform = { windows: 'win32', mac: 'darwin', linux: 'linux' }[platform];
  if (config.help) {
    console.log(`SlotForge Livery ${label} builder
Run on the target operating system with Node.js >=24 and npm installed.
Normal build: install locked dependencies, run checks and tests, package a portable app and an installer.
  --quick       Reuse matching dependencies and skip checks/tests.
  --arch ARCH   ${platform === 'windows' ? 'x64' : 'x64 or arm64 (default: this machine)'}.
  --no-pause    Do not wait for Enter when launched in a terminal.
  --help        Show these instructions.
Files are written to dist/v<version>/. Nothing is installed automatically.`);
    return;
  }
  if (process.platform !== hostPlatform)
    throw Error(`Run this builder on ${label}. It cannot build these packages on ${process.platform}.`);
  if (arch !== process.arch)
    throw Error('Build on the target architecture so the bundled EPS converter matches the application.');
  if (process.getuid?.() === 0) throw Error('Run the builder as your normal user, without sudo.');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw Error('Node.js 24 or newer is required for the SQLite storage checks and build tools.');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const stampPath = path.join(root, 'node_modules', '.livery-build-dependencies');
  const fingerprint = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'package-lock.json')))
    .update(fs.readFileSync(path.join(root, 'package.json')))
    .update(`${process.platform}/${process.arch}/${major}`)
    .digest('hex');
  const binary = path.join(
    root,
    'node_modules/electron/dist',
    { windows: 'electron.exe', mac: 'Electron.app/Contents/MacOS/Electron', linux: 'electron' }[platform]
  );
  let dependenciesMatch = false;
  try {
    dependenciesMatch =
      fs.readFileSync(stampPath, 'utf8') === fingerprint &&
      fs.existsSync(binary) &&
      fs.existsSync(path.join(root, 'node_modules/electron-builder/cli.js'));
  } catch {}
  console.log(`Building SlotForge Livery ${pkg.version} for ${platform}/${arch}.`);
  if (!quick || !dependenciesMatch) {
    console.log('Installing dependencies from package-lock.json...');
    run('npm', ['ci']);
    if (!fs.existsSync(binary)) run(process.execPath, [path.join(root, 'node_modules/electron/install.js')]);
    if (!fs.existsSync(binary)) throw Error('Electron was not installed for this operating system.');
    fs.writeFileSync(stampPath, fingerprint);
  } else console.log('Reusing dependencies from the previous matching build.');
  if (quick) console.log('Quick build: syntax checks and automated tests are skipped.');
  else {
    run('npm', ['run', 'check']);
    run('npm', ['test']);
  }
  run('npm', ['run', 'setup:converter']);
  const output = path.join(root, 'dist', `v${pkg.version}`);
  // Each platform ships a portable app and an installer. electron-builder uses
  // each Linux package format's native architecture label.
  const files =
    platform === 'windows'
      ? ['portable', 'setup'].map(kind => `SlotForgeLivery-${pkg.version}-windows-${arch}-${kind}.exe`)
      : (platform === 'mac' ? ['dmg', 'zip'] : ['AppImage', 'deb']).map(
          ext =>
            `SlotForgeLivery-${pkg.version}-${platform}-${platform === 'linux' && arch === 'x64' ? (ext === 'deb' ? 'amd64' : 'x86_64') : arch}.${ext}`
        );
  const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join('/');
  const previous = new Map(
    files.map(file => {
      try {
        return [file, signature(fs.statSync(path.join(output, file)))];
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return [file, null];
      }
    })
  );
  const started = Date.now();
  run('npm', ['run', `dist:${platform === 'windows' ? 'win' : platform}`, '--', `--${arch}`, '--publish', 'never']);
  for (const file of files) {
    const stat = fs.statSync(path.join(output, file));
    if (!stat.isFile() || stat.size === 0 || stat.mtimeMs < started - 2000 || previous.get(file) === signature(stat))
      throw Error(`Missing or stale installer: ${file}`);
  }
  const sums =
    files
      .map(
        file =>
          `${crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(output, file)))
            .digest('hex')}  ${file}`
      )
      .join('\n') + '\n';
  fs.writeFileSync(path.join(output, `SHA256SUMS-${platform}-${arch}.txt`), sums);
  console.log(
    `\nReady in ${output}:\n${files.map(file => `  ${file}`).join('\n')}\n  SHA256SUMS-${platform}-${arch}.txt`
  );
  console.log(
    {
      windows:
        'Run the -setup.exe to install, or keep the -portable.exe in any folder and double-click it. Builds are unsigned.',
      mac: 'Open the DMG and drag SlotForge Livery to Applications, or unzip the ZIP and run the app from any folder. Builds use local ad-hoc signing, not Apple notarisation.',
      linux: 'Open the .deb with your package manager, or mark the AppImage executable and run it from any folder.'
    }[platform]
  );
}

if (require.main === module) {
  let config;
  try {
    config = options(process.argv.slice(2));
    build(config);
  } catch (error) {
    console.error(`\nBuild stopped: ${error.message}`);
    process.exitCode = 1;
  }
  if (!process.argv.includes('--no-pause') && !config?.help && process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require('node:readline').createInterface({ input: process.stdin, output: process.stdout });
    readline.question('\nPress Enter to close. ', () => readline.close());
  }
}

module.exports = { options };
