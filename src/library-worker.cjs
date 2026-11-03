'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {SQLiteLibrary}=require('./sqlite-library.cjs');
const library=new SQLiteLibrary(workerData.legacy);
let queue=Promise.resolve();
parentPort.on('message',job=>{
  queue=queue.then(async()=>{
    try{
      let value;
      switch(job.op){
        case 'load':value=await library.load();break;
        case 'get':value=library.get(job.data);break;
        case 'preview':value=library.preview(job.data);break;
        case 'thumbnail':value=library.thumbnail(job.data);break;
        case 'missing-media':value=library.missingMedia(job.data);break;
        case 'commit':value=library.commit(job.data);break;
        case 'snapshot':value=library.snapshot();break;
        case 'restore':value=await library.replace(job.data);break;
        default:throw Error('Unknown library operation.');
      }
      parentPort.postMessage({id:job.id,value});
    }catch(e){parentPort.postMessage({id:job.id,error:e.message});}
  });
});
