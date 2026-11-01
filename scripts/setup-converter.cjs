// Downloads and extracts a pinned portable converter. Does not run an installer.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const url='https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/gs10080w64.exe';
const sha256='52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50';
(async()=>{
 if(process.platform!=='win32'){
  if(!['darwin','linux'].includes(process.platform))throw new Error('Supported builders: Windows, macOS and Linux.');
  await new Promise((resolve,reject)=>{const p=spawn('bash',[path.join(__dirname,'build-ghostscript.sh')],{cwd:root,stdio:'inherit'});p.on('error',reject);p.on('close',code=>code?reject(new Error('Native converter build failed.')):resolve());});
  return;
 }
 const download=path.join(root,'vendor/downloads/gs10080w64.exe');
 await fs.mkdir(path.dirname(download),{recursive:true});
 let bytes;try{bytes=await fs.readFile(download);}catch{}
 if(!bytes){const response=await fetch(url);if(!response.ok)throw new Error(`Download failed: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Ghostscript download checksum mismatch.');
 await fs.writeFile(download,bytes);
 const seven=process.env.SEVEN_ZIP||'C:/Program Files/7-Zip/7z.exe';
 await new Promise((resolve,reject)=>{const p=spawn(seven,['x',download,'-o'+path.join(root,'vendor/ghostscript'),'-y'],{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('close',code=>code?reject(new Error('7-Zip could not extract the converter.')):resolve());});
 await fs.access(path.join(root,'vendor/ghostscript/bin/gswin64c.exe'));
 console.log('Ghostscript 10.08.0 verified and extracted locally.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
