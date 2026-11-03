'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function assertExportTarget(file,userData){
  const directory=await fs.realpath(userData),target=await fs.realpath(file).catch(async e=>{if(e.code!=='ENOENT')throw e;return path.join(await fs.realpath(path.dirname(file)),path.basename(file));});
  const normalize=p=>process.platform==='win32'?p.toLowerCase():p;
  if(normalize(path.dirname(target))===normalize(directory)&&/^paintshop-library\.(?:json|sqlite)(?:$|[.-])/i.test(path.basename(target)))throw Error('Choose a different export location. This file belongs to your saved library or its recovery copies.');
  // Protect the live files even if someone selects a hard-link alias elsewhere.
  const selected=await fs.stat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(selected)for(const name of ['paintshop-library.json','paintshop-library.json.backup','paintshop-library.sqlite']){const live=await fs.stat(path.join(directory,name)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(live&&live.dev===selected.dev&&live.ino===selected.ino)throw Error('This export would overwrite your library. Choose another file.');}
}
module.exports={assertExportTarget};
