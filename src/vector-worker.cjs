const {convertVector}=require('./vector-converter.cjs');
process.parentPort.once('message',async({data})=>{
  try { process.parentPort.postMessage({result:await convertVector(data)}); }
  catch(error) { process.parentPort.postMessage({error:error.message || 'Unable to read this vector document.'}); }
});
