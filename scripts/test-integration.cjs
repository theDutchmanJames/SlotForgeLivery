const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// GUI suites drive real windows; a few are sensitive to focus and timing on a
// busy machine. A failed suite is retried once: passing on the retry is
// reported as FLAKY (and recorded), failing twice is a real FAIL.
// Set LIVERY_NO_RETRY=1 to disable the retry.
function runSuite(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'tests', file)], {
      cwd: root,
      env: process.env,
      windowsHide: true
    });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      output += '\nTest exceeded 120 seconds.';
      child.kill();
    }, 120000);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ file, status, signal, output });
    });
  });
}
(async () => {
  await fs.mkdir(path.join(root, 'test-output'), { recursive: true });
  const only = process.argv.slice(2);
  const files = (await fs.readdir(path.join(root, 'tests'))).filter(
    n =>
      n.endsWith('.cjs') &&
      !n.endsWith('.test.cjs') &&
      !['inspector-helpers.cjs', 'pinch-performance.cjs'].includes(n) &&
      (!only.length || only.some(o => n.startsWith(o)))
  );
  const results = [];
  for (const file of files) {
    let result = await runSuite(file);
    if (result.status !== 0 && !process.env.LIVERY_NO_RETRY) {
      const retry = await runSuite(file);
      result =
        retry.status === 0
          ? { ...retry, flaky: true, firstOutput: result.output }
          : { ...retry, firstOutput: result.output };
    }
    results.push(result);
    console.log(`${result.status === 0 ? (result.flaky ? 'FLAKY' : 'PASS') : 'FAIL'} ${file}`);
    if (result.status !== 0) console.log(result.output);
  }
  await fs.writeFile(path.join(root, 'test-output', 'integration-results.json'), JSON.stringify(results, null, 2));
  const flaky = results.filter(r => r.flaky).map(r => r.file);
  console.log(
    `${results.filter(r => r.status === 0).length}/${results.length} integration suites passed.` +
      (flaky.length ? ` Passed on retry (flaky): ${flaky.join(', ')}.` : '')
  );
  if (results.some(r => r.status !== 0)) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
