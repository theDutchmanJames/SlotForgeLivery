const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const name = 'ghostscript-10.08.0.tar.xz';
const digest = 'c20492bc8ebb96c87fa2e52a0926e1cda8cde95d66145e018ac713fed5da38cf';
(async () => {
  const destination = path.resolve(__dirname, '../vendor/sources', name);
  await fs.mkdir(path.dirname(destination), {recursive:true});
  let data;
  try { data = await fs.readFile(destination); } catch (e) { if(e.code !== 'ENOENT') throw e; }
  if (!data) {
    const response = await fetch(`https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/${name}`);
    if (!response.ok) throw Error(`Source download failed: ${response.status}`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (crypto.createHash('sha256').update(data).digest('hex') !== digest) throw Error('Converter source checksum mismatch.');
  await fs.writeFile(destination, data);
  console.log(`Verified ${name}`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
