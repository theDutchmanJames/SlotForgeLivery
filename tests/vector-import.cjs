const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {convertVector}=require('../src/vector-converter.cjs');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output');
const runtime=process.env.ELECTRON_BINARY||require('electron');
let app,page;
async function run(){
 await fs.mkdir(out,{recursive:true});
 const eps=await fs.readFile(path.join(__dirname,'fixtures/car.eps'));
 const converted=await convertVector({bytes:eps,format:'eps'});
 assert.equal(converted.pages,1);assert(converted.svg.includes('font_'),'EPS text is retained as outlines');
 const dos=Buffer.alloc(30);dos.writeUInt32LE(0xc6d3d0c5,0);dos.writeUInt32LE(30,4);dos.writeUInt32LE(eps.length,8);dos.writeUInt16LE(0xffff,28);
 assert((await convertVector({bytes:Buffer.concat([dos,eps]),format:'eps'})).svg.includes('<path'),'DOS binary EPS wrapper supported');
 await assert.rejects(convertVector({bytes:Buffer.from('not EPS'),format:'eps'}),/EPS/);
 await assert.rejects(convertVector({bytes:Buffer.from('not PDF'),format:'pdf'}),/PDF/);
 await assert.rejects(convertVector({bytes:Buffer.from('%!PS\nmissing_operator\n'),format:'eps'}),/could not be converted/);
 // Ghostscript must deny writes outside the per-import temporary folder.
 const sentinel=path.join(out,'eps-must-not-write.txt');await fs.rm(sentinel,{force:true});
 const unsafe=Buffer.from(`%!PS\n(${sentinel.replaceAll('\\','/')}) (w) file (denied) writestring\nshowpage\n`);
 await assert.rejects(convertVector({bytes:unsafe,format:'eps'}),/could not be converted/);await assert.rejects(fs.access(sentinel));
 const mupdf=await import('mupdf'),pdf=new mupdf.PDFDocument();
 for(const content of ['0 0 0 rg 10 10 200 100 re f','q 40 30 150 80 re W n 0.8 0.8 0.8 rg 10 10 250 150 re f Q 0 0 0 rg 80 60 40 30 re f'])pdf.insertPage(-1,pdf.addPage([0,0,300,200],0,{},content));
 const buf=pdf.saveToBuffer(''),pdfPath=path.join(out,'two-views.pdf');await fs.writeFile(pdfPath,buf.asUint8Array());buf.destroy();pdf.destroy();
 const pdfBytes=await fs.readFile(pdfPath);assert.equal((await convertVector({bytes:pdfBytes,format:'pdf'})).pages,2);
 await assert.rejects(convertVector({bytes:pdfBytes,format:'pdf',page:3}),/2 pages/);
 const second=await convertVector({bytes:pdfBytes,format:'pdf',page:2});assert(second.svg.includes('clipPath'));
 const raster=new mupdf.PDFDocument();raster.insertPage(-1,raster.addPage([0,0,100,100],0,{},'q 100 0 0 100 0 0 cm BI /W 1 /H 1 /BPC 8 /CS /RGB /F /AHx ID FF0000> EI Q'));
 const rasterBuf=raster.saveToBuffer('');await assert.rejects(convertVector({bytes:rasterBuf.asUint8Array(),format:'pdf'}),/bitmap/);rasterBuf.destroy();raster.destroy();
 const env={...process.env,PAINTSHOP_TEST_DATA:path.join(out,'vector-profile-'+Date.now()),PAINTSHOP_TEST_PDF:path.join(out,'vector-workshop.pdf')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({executablePath:runtime,args:process.env.PAINTSHOP_PACKAGED?[]:[root],env,timeout:30000});page=await app.firstWindow();await page.waitForSelector('#tools button');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
 const upload=async(file,name)=>{await click('add-car');await page.locator('#car-name').fill(name);await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(file);};
 await upload(path.join(__dirname,'fixtures/car.eps'),'EPS coupe');await page.waitForFunction(()=>preparing&&activeView()?.vectorSource?.regions.length===7,{},{timeout:30000});await click('close-dialog');await click('generate-regions');
 assert.equal(await page.evaluate(()=>activeView().regions.filter(r=>r.role==='body').length),1);
 assert(await page.evaluate(()=>activeView().regions.find(r=>r.role==='body').bounds.w>800),'implicit-closed EPS silhouette is the body');
 await click('finish-preparation');await page.locator('[data-swatch="#9ed8f5"]').click();
 await page.screenshot({path:path.join(out,'03-eps-import.png')});
 await click('pdf');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Workshop PDF saved.',{},{timeout:30000});
 await upload(pdfPath,'PDF page two');await page.waitForSelector('#vector-page');await page.locator('#vector-page').fill('2');await page.locator('#import-vector-page').click();await page.waitForFunction(()=>project?.template.name==='PDF page two'&&preparing);await click('close-dialog');await click('generate-regions');
 const checks=await page.evaluate(()=>{
  const view=activeView(),body=view.regions.find(r=>r.role==='body');
  const safe=V.validateView(view),svg=V.geometryMarkup(safe.regions.find(r=>r.role==='body'));
  const doc=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+svg+'</svg>','image/svg+xml');
  const clips=[...doc.querySelectorAll('[clip-path]')];
  const refsValid=clips.every(n=>!!doc.getElementById(n.getAttribute('clip-path').slice(5,-1)));
  return {regions:view.regions.length,clip:body.markup.includes('clipPath'),refsValid,markedClip:!!doc.querySelector('clipPath [data-geometry]')};
 });assert.deepEqual(checks,{regions:2,clip:true,refsValid:true,markedClip:false});
 await click('finish-preparation');await page.screenshot({path:path.join(out,'04-pdf-import.png')});
 // EPS/PDF paths persist in the same self-contained package schema as SVG.
 const destination=path.join(out,'vector-project.sfpaint');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},destination);
 await click('sharing');await click('export-project');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Package exported.');await click('close-dialog');
 await page.locator('#package-file').setInputFiles(destination);await page.waitForSelector('[data-action="confirm-import"]');await click('confirm-import');
 assert(await page.evaluate(()=>activeView().regions.some(r=>r.markup.includes('clipPath'))));
 // Invalid documents return to the import form without changing the open project.
 await upload({name:'broken.eps',mimeType:'application/postscript',buffer:Buffer.from('bad')},'Broken import');await page.waitForFunction(()=>document.querySelector('#car-name')?.value==='Broken import');assert.equal(await page.evaluate(()=>project.template.name),'PDF page two');
 await click('close-dialog');
 // Reject cycles and external clip references; expand local <use> safely.
 const validation=await page.evaluate(()=>{
  let cycle=false,external=false;
  try{V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="a"><use href="#a"/></g></defs><use href="#a"/></svg>');}catch{cycle=true;}
  try{V.sanitize('<svg xmlns="http://www.w3.org/2000/svg"><path clip-path="url(https://example.com/x)" d="M0 0L10 0L10 10Z"/></svg>');}catch{external=true;}
  const local=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="p" d="M0 0L100 0L100 100Z"/></defs><use href="#p" x="20"/></svg>');
  return {cycle,external,count:local.regions.length};
 });assert.deepEqual(validation,{cycle:true,external:true,count:1});
 assert.deepEqual(errors,[]);await page.evaluate(()=>flushSave());await app.close();app=null;
 console.log('PASS: EPS, binary EPS, native IPC conversion, text outlines, PDF page selection, clipping/package round-trip, PDF export, malformed/raster rejection and restricted PostScript writes.');
}
run().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'vector-failure.png')}).catch(()=>{});if(app)await app.close().catch(()=>{});process.exitCode=1;});
