'use strict';
// Coverage map: which lines of Livery's own code the tests never run.
//   node scripts/coverage.cjs            unit tests and all app suites (opens windows, ~30 min)
//   node scripts/coverage.cjs --unit     unit tests only
//   node scripts/coverage.cjs --report   rebuild the report from the last run
//   node scripts/coverage.cjs garage pair   unit tests plus the named app suites
// Writes test-output/coverage/index.html and coverage.json.
// The app suites run slower while coverage is recorded; timing checks may fail.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process'),
  { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, 'test-output', 'coverage'),
  raw = path.join(out, 'raw');
const args = process.argv.slice(2);
// Generated data is not code to test. The preload and the worker threads cannot
// be recorded this way (their logic lives in modules that are measured).
const SKIP = /^(renderer\/(stock-cars|sample-car)\.js|src\/(coverage-hook|preload|library-worker|vector-worker)\.cjs)$/;
const AREAS = [
  [
    'Saving and the library',
    /^(src\/(sqlite|library|maintenance|export-path)|renderer\/(library-client|storage-codec)|renderer\/app\/(library|maintenance|storage))/
  ],
  ['Imports and sharing', /(sharing|arrivals|decal-import|vector|import|rescue)/],
  ['Startup and updates', /(main\.cjs|preload|update|startup|start\.js|settings)/],
  ['Studio', /.*/]
];
function run(command, argv, env) {
  return new Promise(resolve => {
    const child = spawn(command, argv, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('close', code => resolve(code));
  });
}
function unitFiles() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return pkg.scripts.test.split(/\s+/).filter(x => x.startsWith('tests/'));
}
// V8 ranges are nested; applying them widest first leaves each character with
// the count of the innermost range around it.
function charStates(length, functions) {
  const state = new Int8Array(length).fill(-1);
  const ranges = functions
    .flatMap(f => f.ranges)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) state.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(length, r.endOffset));
  return state;
}
function relative(url) {
  if (!url.startsWith('file:')) return null;
  let file;
  try {
    file = fileURLToPath(url.split('?')[0]);
  } catch {
    return null;
  }
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (rel.startsWith('..') || !/^(src|renderer)\//.test(rel) || SKIP.test(rel) || !/\.c?js$/.test(rel)) return null;
  return rel;
}
function collect() {
  const files = new Map(); // rel -> { source, covered: Uint8Array (0 unknown, 1 missed, 2 ran), functions: Map }
  const sources = new Map();
  const list = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).map(n => path.join(dir, n)) : []);
  for (const file of [...list(path.join(raw, 'node')), ...list(path.join(raw, 'renderer'))]) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const script of data.result || []) {
      const rel = relative(script.url);
      if (!rel) continue;
      if (!sources.has(rel)) sources.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
      const source = sources.get(rel);
      if (!files.has(rel)) files.set(rel, { covered: new Uint8Array(source.length), functions: new Map() });
      const entry = files.get(rel),
        state = charStates(source.length, script.functions);
      for (let i = 0; i < state.length; i++)
        if (state[i] === 1) entry.covered[i] = 2;
        else if (state[i] === 0 && entry.covered[i] === 0) entry.covered[i] = 1;
      for (const f of script.functions) {
        const r = f.ranges[0];
        if (!f.functionName || !r) continue;
        const key = r.startOffset;
        entry.functions.set(key, {
          name: f.functionName,
          ran: entry.functions.get(key)?.ran || r.count > 0
        });
      }
    }
  }
  return { files, sources };
}
const quiet = line => {
  const t = line.trim();
  return !t || /^(\/\/|\/\*|\*)/.test(t) || /^[\]\)\};,]+$/.test(t) || /^(else|try|finally)\s*\{?$/.test(t);
};
function analyse({ files, sources }) {
  const all = [];
  const walk = dir =>
    fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .flatMap(d => (d.isDirectory() ? walk(dir + '/' + d.name) : [dir + '/' + d.name]));
  for (const rel of [...walk('src'), ...walk('renderer')].filter(r => /\.c?js$/.test(r) && !SKIP.test(r))) {
    const source = sources.get(rel) || fs.readFileSync(path.join(root, rel), 'utf8'),
      lines = source.split('\n'),
      entry = files.get(rel);
    let offset = 0;
    const missed = [];
    let code = 0;
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n],
        start = offset;
      offset += line.length + 1;
      if (quiet(line)) continue;
      code++;
      if (!entry) {
        missed.push(n + 1);
        continue;
      }
      let ran = false,
        miss = false;
      for (let i = start; i < start + line.length; i++) {
        if (/\s/.test(source[i])) continue;
        if (entry.covered[i] === 2) ran = true;
        else if (entry.covered[i] === 1) miss = true;
      }
      if (miss && !ran) missed.push(n + 1);
    }
    const functions = entry ? [...entry.functions.values()] : [];
    all.push({
      file: rel,
      area: AREAS.find(([, re]) => re.test(rel))[0],
      loaded: !!entry,
      lines: code,
      missed,
      percent: code ? Math.round((1000 * (code - missed.length)) / code) / 10 : 100,
      neverCalled: functions.filter(f => !f.ran).map(f => f.name),
      source: lines
    });
  }
  return all;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function blocks(missed) {
  const out = [];
  for (const n of missed) {
    const last = out.at(-1);
    if (last && n - last[1] <= 2) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}
function html(report) {
  const total = report.reduce((n, f) => n + f.lines, 0),
    missed = report.reduce((n, f) => n + f.missed.length, 0);
  const areas = AREAS.map(([name]) => {
    const files = report.filter(f => f.area === name),
      lines = files.reduce((n, f) => n + f.lines, 0),
      miss = files.reduce((n, f) => n + f.missed.length, 0);
    return { name, files, lines, miss, percent: lines ? Math.round((1000 * (lines - miss)) / lines) / 10 : 100 };
  });
  const bar = p => `<span class="bar"><i style="width:${p}%"></i></span>`;
  const detail = f => {
    const parts = blocks(f.missed)
      .map(([a, b]) => {
        const from = Math.max(1, a - 1),
          to = Math.min(f.source.length, b + 1),
          rows = [];
        for (let n = from; n <= to; n++)
          rows.push(
            `<tr class="${f.missed.includes(n) ? 'miss' : ''}"><td>${n}</td><td><code>${esc(f.source[n - 1])}</code></td></tr>`
          );
        return `<table class="src">${rows.join('')}</table>`;
      })
      .join('');
    return `<details><summary><b>${esc(f.file)}</b> <span class="pct">${f.percent}%</span> ${bar(f.percent)} <span class="dim">${f.missed.length} of ${f.lines} lines never run${f.loaded ? '' : ' · never loaded'}</span></summary>${
      f.neverCalled.length
        ? `<p class="dim">Never called: ${f.neverCalled.slice(0, 40).map(esc).join(', ')}${f.neverCalled.length > 40 ? ' …' : ''}</p>`
        : ''
    }${parts}</details>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Livery coverage map</title><style>
:root{--bg:#f6f5f2;--fg:#1d1d1b;--dim:#6b6a66;--card:#fff;--line:#e3e1dc;--miss:#fde3e1;--ok:#2f8f5b;--bad:#c8463d}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#ecebe8;--dim:#9a9893;--card:#1f1f1f;--line:#333;--miss:#4a2422;--ok:#4cc38a;--bad:#ef6b5f}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px 16px}
h1{margin:0 0 4px}h2{margin:28px 0 8px}.dim{color:var(--dim)}.pct{display:inline-block;width:54px;text-align:right;font-variant-numeric:tabular-nums}
.bar{display:inline-block;width:120px;height:8px;border-radius:4px;background:var(--miss);vertical-align:middle;overflow:hidden}.bar i{display:block;height:100%;background:var(--ok)}
.areas{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.area{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.area b{font-size:22px;display:block}details{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:6px 0;padding:6px 10px}summary{cursor:pointer}
table.src{border-collapse:collapse;width:100%;margin:8px 0;font:12px/1.4 ui-monospace,Consolas,monospace}table.src td{padding:0 6px;white-space:pre-wrap;word-break:break-all}
table.src td:first-child{color:var(--dim);text-align:right;width:44px;user-select:none}tr.miss{background:var(--miss)}
</style></head><body><main><h1>Livery coverage map</h1><p class="dim">${new Date().toLocaleString('en-GB')} · ${total - missed} of ${total} lines run by the tests (${Math.round((1000 * (total - missed)) / total) / 10}%). Red lines never ran in any test. Files are sorted by how much is left untested.</p>
<div class="areas">${areas.map(a => `<div class="area">${esc(a.name)}<b>${a.percent}%</b>${bar(a.percent)} <span class="dim">${a.miss} lines never run</span></div>`).join('')}</div>
${areas
  .map(
    a =>
      `<h2>${esc(a.name)}</h2>${a.files
        .sort((x, y) => y.missed.length - x.missed.length)
        .map(detail)
        .join('')}`
  )
  .join('')}
</main></body></html>`;
}
(async () => {
  const reportOnly = args.includes('--report'),
    unitOnly = args.includes('--unit'),
    suites = args.filter(a => !a.startsWith('--'));
  if (!reportOnly) {
    fs.rmSync(raw, { recursive: true, force: true });
    fs.mkdirSync(path.join(raw, 'node'), { recursive: true });
    const env = { NODE_V8_COVERAGE: path.join(raw, 'node'), LIVERY_COVERAGE: path.join(raw, 'renderer') };
    console.log('Unit tests with coverage…');
    await run(process.execPath, ['--test', ...unitFiles()], env);
    if (!unitOnly) {
      console.log('App suites with coverage…');
      await run(process.execPath, [path.join(root, 'scripts', 'test-integration.cjs'), ...suites], {
        ...env,
        LIVERY_NO_RETRY: '1'
      });
    }
  }
  const report = analyse(collect());
  fs.writeFileSync(
    path.join(out, 'coverage.json'),
    JSON.stringify(
      report.map(({ source, ...f }) => f),
      null,
      1
    )
  );
  fs.writeFileSync(path.join(out, 'index.html'), html(report));
  const total = report.reduce((n, f) => n + f.lines, 0),
    missed = report.reduce((n, f) => n + f.missed.length, 0);
  console.log(`Coverage: ${total - missed}/${total} lines (${Math.round((1000 * (total - missed)) / total) / 10}%).`);
  for (const f of report.sort((a, b) => b.missed.length - a.missed.length).slice(0, 15))
    console.log(`  ${String(f.percent).padStart(5)}%  ${String(f.missed.length).padStart(4)} missed  ${f.file}`);
  console.log('Report: ' + path.join(out, 'index.html'));
})();
