const fs=require('node:fs/promises'),path=require('node:path');
const {_electron:electron}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/screenshots');await fs.mkdir(out,{recursive:true});
 const env={...process.env,PAINTSHOP_TEST_DATA:path.join(root,'test-output',`readme-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:require('electron'),args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1600,1000));
  await page.waitForSelector('#tools button');
  await page.locator('[data-action="add-car"]').first().click();await page.locator('#car-name').fill('Club GT · Demo car');
  await page.locator('#choose-svg').click({noWaitAfter:true});await page.locator('#car-file').setInputFiles(path.join(root,'docs/demo-car.svg'));
  await page.waitForFunction(()=>preparing&&activeView()?.vectorSource?.regions.length>0);
  await page.locator('[data-action="close-dialog"]').first().click();await page.locator('[data-action="generate-regions"]').click();await page.locator('[data-action="finish-preparation"]').click();
  await page.evaluate(()=>{
   project.name='Club GT · Heritage racing';project.base='#2b8887';project.finish='Gloss';project.effect='Metallic';
   project.fillType='gradient';project.gradient={angle:90,strength:.65,scope:'view',stops:[{offset:0,colour:'#69c6ad'},{offset:1,colour:'#196266'}]};
   for(const r of activeView().regions){
    if(r.role==='body')r.partLabel='Bodywork';
    else if(r.role==='protected'){const xml=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${r.markup}</svg>`,'image/svg+xml');const fill=xml.querySelector('[fill]')?.getAttribute('fill');if(/^#[a-f0-9]{6}$/i.test(fill||''))r.colour=fill;}
   }
   const b=activeView().bounds;
   project.views[currentView]=[
    M.layer('rect',{name:'Ivory racing band',x:b.x+b.w*.03,y:b.y+b.h*.6,w:b.w*.94,h:b.h*.12,fill:'#f9efc9'}),
    M.layer('rect',{name:'Coral pinstripe',x:b.x+b.w*.03,y:b.y+b.h*.75,w:b.w*.94,h:b.h*.025,fill:'#ee6657'}),
    M.layer('ellipse',{name:'Number roundel',x:b.x+b.w*.46,y:b.y+b.h*.42,w:b.h*.4,h:b.h*.4,fill:'#f9efc9'}),
    M.layer('text',{name:'Race number 27',text:'27',font:'Arial',x:b.x+b.w*.475,y:b.y+b.h*.50,w:b.h*.32,h:b.h*.29,fill:'#24383d'})
   ]; selected=null;selectedPaint=null;multiSelected.clear();multiPaintSelected.clear();preparing=false;tool='select';store.settings={...store.settings,paintPreview:true};render();
  });
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>{store.settings.theme=theme;applyTheme();render();},theme);
   await page.evaluate(async()=>{await flushSave();document.querySelector('#toast').classList.remove('show');});
   await page.screenshot({path:path.join(out,`studio-${theme}.png`)});
  }
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
