const path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output','canvas-reuse-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.ELECTRON_BINARY||require('electron'),args:process.env.PAINTSHOP_PACKAGED?[]:[root],env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#tools button');
    await page.evaluate(()=>{
      const v=V.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/></svg>');
      setProject(M.newProject({name:'Canvas reuse',views:{left:v}}));currentView='left';preparing=false;selectedPaint=null;
      layers().push(M.layer('text',{text:'31',x:250,y:200,w:100,h:70,pinchX:.3}),M.layer('rect',{x:450,y:200,w:160,h:80,fillType:'gradient',gradient:M.defaultGradient('#ff0000'),effect:'Pearl'}));render();
    });
    await page.waitForFunction(()=>art.querySelector('[data-perspective-preview]'));
    const results=await page.evaluate(()=>{
      renderCanvas();const stack=art.querySelector('[data-canvas-art]'),nodes=[...stack.children],images=[...stack.querySelectorAll('image')],paint=nodes[1].firstChild,href=images[0].getAttribute('href');
      for(let i=0;i<20;i++){viewBox.x++;renderCanvas();}
      const pan=nodes.every((n,i)=>n===stack.children[i])&&paint===nodes[1].firstChild&&images[0]===stack.querySelector('image');
      layers()[0].x+=40;renderCanvas();const move=images[0]===stack.querySelector('image')&&stack.querySelector('image').getAttribute('href')===href&&nodes[0].getAttribute('transform')==='translate(290 200)'&&paint===nodes[1].firstChild;
      layers()[1].effect='Metallic';renderCanvas();const effect=nodes[1].firstChild!==paint&&!!nodes[1].querySelector('pattern')&&images[0]===stack.querySelector('image');
      layers().reverse();renderCanvas();const reorder=stack.children[0]===nodes[1]&&stack.children[1]===nodes[0];
      layers()[0].visible=false;renderCanvas();const hidden=!stack.children[0].children.length;
      layers()[0].visible=true;renderCanvas();const shown=!!stack.children[0].children.length;
      record();layers().splice(0,1);renderCanvas();const removed=stack.children.length===1&&stack.children[0]===nodes[0];
      actions.undo();const undoRestored=stack.children.length===2;
      const ids=[...document.querySelectorAll('[id]')].map(n=>n.id),uniqueIds=ids.length===new Set(ids).size;
      return {pan,move,effect,reorder,hidden,shown,removed,undoRestored,uniqueIds};
    });
    assert(Object.values(results).every(Boolean),JSON.stringify(results));
    const b=await page.locator('#artboard').boundingBox();await page.mouse.move(b.x+100,b.y+100);await page.mouse.down({button:'middle'});
    const redraws=await page.evaluate(async()=>{
      const original=renderCanvas;let count=0;renderCanvas=()=>{count++;original();};
      try{for(let i=0;i<25;i++)art.dispatchEvent(new PointerEvent('pointermove',{clientX:200+i,clientY:200,buttons:4,bubbles:true}));await new Promise(r=>requestAnimationFrame(r));return count;}finally{renderCanvas=original;}
    });
    await page.mouse.up({button:'middle'});assert.equal(redraws,1,'Pointer bursts produce one canvas update per animation frame');assert.deepEqual(errors,[]);
    console.log('PASS: pan retains artwork DOM, pinched movement reuses its image, effects invalidate, stacking/hide/delete/undo stay correct, unique SVG IDs, one redraw per pointer frame.');
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
