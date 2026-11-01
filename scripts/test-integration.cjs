const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  await fs.mkdir(path.join(root, 'test-output'), {recursive:true});
  const files = (await fs.readdir(path.join(root, 'tests'))).filter(n => n.endsWith('.cjs') && !n.endsWith('.test.cjs') && !['inspector-helpers.cjs', 'pinch-performance.cjs'].includes(n));
  const results = [];
  for (const file of files) {
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(root, 'tests', file)], { cwd: root, env: process.env, windowsHide: true });
      let output = '';
      child.stdout.on('data', chunk => output += chunk);
      child.stderr.on('data', chunk => output += chunk);
      const timer = setTimeout(() => { output += '\nTest exceeded 90 seconds.'; child.kill(); }, 90000);
      child.on('close', (status, signal) => { clearTimeout(timer); resolve({ file, status, signal, output }); });
    });
    results.push(result);
    console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
    if(result.status !== 0)console.log(result.output);
  }
  await fs.writeFile(path.join(root, 'test-output', 'integration-results.json'), JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => r.status === 0).length}/${results.length} integration suites passed.`);
  if(results.some(r => r.status !== 0))process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
