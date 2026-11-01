// Runs only in the short-lived converter process, never in the renderer.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const LIMIT = 25 * 1024 * 1024;
async function convertVector({ bytes, format, page = null }) {
  if (!['eps', 'pdf'].includes(format) || !(bytes instanceof Uint8Array) || bytes.length > LIMIT || !bytes.length) throw new Error('Choose an EPS or PDF file smaller than 25 MB.');
  if (page !== null && (!Number.isInteger(page) || page < 1 || page > 500)) throw new Error('Choose a valid page number.');
  let input = Buffer.from(bytes), temp;
  try {
    if (format === 'eps') {
      if (!input.subarray(0,4).equals(Buffer.from([0xc5,0xd0,0xd3,0xc6])) && !input.subarray(0,32).toString().startsWith('%!PS')) throw new Error('This file does not contain EPS/PostScript artwork.');
      temp = await fs.mkdtemp(path.join(os.tmpdir(), 'slotforge-vector-'));
      const source = path.join(temp,'source.eps'), output = path.join(temp,'converted.pdf');
      await fs.writeFile(source,input);
      const { ghostscriptPath } = require('./converter-path.cjs');
      const gs = ghostscriptPath();
      await new Promise((resolve,reject) => {
        const child = spawn(gs,['-dSAFER','-dBATCH','-dNOPAUSE','-dQUIET','-dEPSCrop','-sDEVICE=pdfwrite',`-sOutputFile=${output}`,'-f',source],{
          cwd:temp,windowsHide:true,stdio:['ignore','ignore','pipe'],
          env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:temp,TMP:temp,TMPDIR:temp,HOME:temp}
        });
        let failure = null;
        const stop = message => { failure = new Error(message); child.kill(); };
        const timeout = setTimeout(()=>stop('EPS conversion took too long. Simplify the illustration and try again.'),20000);
        const sizeCheck = setInterval(async()=>{try{if((await fs.stat(output)).size>50*1024*1024)stop('Converted EPS is too large. Simplify it first.');}catch{}},200);
        child.stderr.on('data',()=>{});
        child.once('error',error=>{clearTimeout(timeout);clearInterval(sizeCheck);reject(new Error(error.code==='ENOENT'?'The EPS converter is missing. Rebuild or reinstall this preview.':'Could not start the EPS converter.'));});
        child.once('close',code=>{clearTimeout(timeout);clearInterval(sizeCheck);if(failure)reject(failure);else if(code!==0)reject(new Error('This EPS could not be converted. Re-export it as a standard EPS or SVG.'));else resolve();});
      });
      if ((await fs.stat(output)).size > 50*1024*1024) throw new Error('Converted EPS is too large.');
      input = await fs.readFile(output);
    } else if (!input.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a PDF document.');
    const mupdf = await import('mupdf');
    let doc, sheet, buffer, writer, device;
    try {
      doc = mupdf.Document.openDocument(input,'application/pdf');
      if(doc.needsPassword())throw new Error('This PDF is password protected. Export an unlocked copy first.');
      const pages = doc.countPages();
      if(!pages || pages>500)throw new Error('Use a document with between 1 and 500 pages.');
      if(page===null && pages>1)return {pages};
      const chosen=page??1;
      if(chosen>pages)throw new Error(`This document has ${pages} pages.`);
      sheet=doc.loadPage(chosen-1);buffer=new mupdf.Buffer();
      writer=new mupdf.DocumentWriter(buffer,'svg','text=path');
      device=writer.beginPage(sheet.getBounds());sheet.run(device,mupdf.Matrix.identity);writer.endPage();device=null;writer.close();
      const svg=buffer.asString();
      if(svg.length>5e6)throw new Error('This page contains too much detail. Simplify it before importing.');
      // Raster images and shading cannot be made into independently paintable regions.
      if(/<(?:image|pattern|linearGradient|radialGradient)\b/.test(svg))throw new Error('This artwork contains bitmap images or gradients. Export a flat vector-only version, or use a PNG/JPG with Trace a photograph.');
      return {pages,page:chosen,svg};
    } finally {device?.destroy();writer?.destroy();buffer?.destroy();sheet?.destroy();doc?.destroy();}
  } finally {if(temp)await fs.rm(temp,{recursive:true,force:true});}
}
module.exports={convertVector};
