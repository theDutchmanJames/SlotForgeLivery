const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const files=['src','renderer','scripts','tests'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(f=>/\.(?:c?js)$/.test(f)).map(f=>`${dir}/${f}`));
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log('JavaScript syntax checks passed.');
