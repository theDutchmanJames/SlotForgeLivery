const path = require('node:path');
const fs = require('node:fs');
function ghostscriptPath() {
  const name = process.platform === 'win32' ? 'gswin64c.exe' : 'gs';
  const bundled = process.resourcesPath && path.join(process.resourcesPath, 'ghostscript', 'bin', name);
  if (bundled && fs.existsSync(bundled)) return bundled;
  return path.resolve(__dirname, '../vendor/ghostscript/bin', name);
}
module.exports = { ghostscriptPath };
