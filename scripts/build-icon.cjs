const fs=require('node:fs/promises'),path=require('node:path');
const sharp=require(process.env.SHARP_MODULE||'sharp');
(async()=>{
 const sizes=[16,24,32,48,64,128,256],images=await Promise.all(sizes.map(size=>sharp(path.resolve('assets/icon.svg')).resize(size,size).png().toBuffer()));
 await fs.writeFile('assets/icon.png',await sharp(path.resolve('assets/icon.svg')).resize(1024,1024).png().toBuffer());
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,i)=>{const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;});
 await fs.writeFile('assets/icon.ico',Buffer.concat([header,...images]));console.log('App icons generated at '+sizes.join(', ')+' px.');
})().catch(e=>{console.error(e);process.exitCode=1;});
