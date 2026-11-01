// Existing editing regressions exercise the property controls with their folders open.
// layer-order-folders.cjs separately verifies collapsed defaults and saved folder state.
exports.openPropertyFolders=async page=>page.evaluate(()=>{store.settings={...store.settings,inspectorFolders:{...store.settings?.inspectorFolders,paint:true,finish:true,position:true,line:true,text:true,curves:true,reuse:true}};document.querySelectorAll('[data-inspector-folder]').forEach(el=>{if(el.dataset.inspectorFolder!=='fit')el.open=true;});renderInspector();});
