// Exercises the bundled binary and WASM converter on each native build host.
const assert=require('node:assert/strict');
const {convertVector}=require('../src/vector-converter.cjs');
(async()=>{
 const eps=Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 200 100\n0.8 0.1 0.2 setrgbcolor\n10 10 moveto 190 10 lineto 190 90 lineto 10 90 lineto closepath fill\nshowpage\n%%EOF\n');
 const converted=await convertVector({bytes:eps,format:'eps'});
 assert.equal(converted.pages,1);assert.match(converted.svg,/<svg/);assert.match(converted.svg,/<path/);
 console.log('PASS: native EPS → PDF → editable SVG');
})().catch(e=>{console.error(e);process.exitCode=1;});
