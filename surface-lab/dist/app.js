(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const paths={
    cube:'M12 3 21 8v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5.8l9 5',
    library:'M3 4h6v7H3z M14 4h7v7h-7z M3 15h6v6H3z M14 15h7v6h-7z',
    path:'M4 18 9 9l6 6 5-11 M3 18h2v2H3z M8 7h2v2H8z M14 14h2v2h-2z M19 3h2v2h-2z',
    book:'M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z M12 6v14',
    download:'M12 3v12 M7 10l5 5 5-5 M4 15v5h16v-5',
    chevron:'m6 9 6 6 6-6',expand:'M9 4H4v5 M15 4h5v5 M4 15v5h5 M15 20h5v-5',
    reset:'M4 10a8 8 0 1 1 1.5 8 M4 4v6h6',plus:'M12 5v14 M5 12h14',minus:'M5 12h14',
    sliders:'M4 6h7m4 0h5 M4 12h3m4 0h9 M4 18h10m4 0h2 M11 3.5v5 M7 9.5v5 M14 15.5v5',
    mouse:'M7 10V8a5 5 0 0 1 10 0v7a5 5 0 0 1-10 0z M12 4v5',
    mesh:'m3 18 9-14 9 14z M7 12h10 M7 12l5 6 5-6',arrow:'M4 12h15 M14 7l5 5-5 5',
    close:'M5 5l14 14 M19 5 5 19',check:'m5 12 4 4L19 6'
  };
  function icon(name){return '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24"><path d="'+paths[name]+'"/></svg>';}
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  const {presets,compile}=SurfaceMath,{sample,solid,binarySTL}=SurfaceGeometry, draw=SurfaceRender.draw;
  const camera={az:-.67,el:.43,zoom:1};
  const colors=[['Violet','#ab82ff'],['Seafoam','#57d5c7'],['Apricot','#f4ae77'],['Blue','#7da9ff'],['Rose','#f38fc0']];
  let spec,presetId,color,mesh,printMesh,valid=true,mode='surface',result,fn,optimizing=false,redrawId=0,toastTimer;
  const number=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(v);
  const integer=v=>new Intl.NumberFormat('en-US').format(v);
  const value=id=>$(id).valueAsNumber;
  const config=()=>({width:value('width'),relief:value('relief'),base:value('base'),construction:$('construction').value});
  const preset=()=>presets.find(p=>p.id===presetId);
  function name(){return preset()?.name||'Custom surface';}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  function fieldError(id,message){$(id).textContent=message||'';$(id).hidden=!message;}
  function meshSolid(){const c=config();return solid(mesh,c.width,c.relief,c.base,c.construction);}
  function updateFaceCount(){
    const displayed=mode==='print'?printMesh:mesh;
    $('faceCount').textContent=displayed?integer(displayed.faces.length)+' triangles':'Adjust print settings';
  }
  function drawMain(){
    if(!mesh)return;
    const c=config(), previewPrint=mode==='print'&&valid;
    draw($('plot'),mesh,{...camera,...c,color,mode,base:previewPrint&&printMesh&&!spec.shape?c.base:0,solid:previewPrint?printMesh:null,path:result?.path,fn});
  }
  function redraw(){cancelAnimationFrame(redrawId);redrawId=requestAnimationFrame(drawMain);}
  function resetCamera(){Object.assign(camera,{az:-.67,el:.43,zoom:1});$('view').value='orbit';redraw();}
  function resetStart() {
    if(spec.shape||!spec.domain)return;
    const [a,b,c,d]=spec.domain;
    for (const [id,min,max] of [['startX',a,b],['startY',c,d]]){
      $(id).min=min;$(id).max=max;$(id).value=Number((min+(max-min)*.67).toPrecision(6));
    }
  }
  function clearResult(){result=null;$('optResult').textContent='';}
  function updateTitle(){
    $('plotName').textContent=name();
    $('plotType').textContent=spec.shape?'PARAMETRIC SURFACE':'EXPLICIT SURFACE';
    document.querySelector('.surface-tag>span').style.background=color;
    for(const card of document.querySelectorAll('.preset-card')){
      const chosen=card.dataset.id===presetId;
      card.classList.toggle('chosen',chosen);card.setAttribute('aria-pressed',chosen);
    }
  }
  function colorControls(){
    $('swatches').replaceChildren();
    const choices=colors.some(([,v])=>v===color)?colors:[...colors.slice(0,4),['Preset color',color]];
    for(const [label,v] of choices){
      const b=document.createElement('button');b.className='swatch'+(v===color?' chosen':'');
      b.style.setProperty('--swatch',v);b.style.background=v;b.title=label;b.setAttribute('aria-label',label+' surface color');
      b.setAttribute('aria-pressed',v===color);b.onclick=()=>{color=v;colorControls();updateTitle();redraw();};$('swatches').append(b);
    }
  }
  function domainControls(){
    $('domainInputs').replaceChildren();
    $('domainHint').textContent=spec.shape?'PARAMETERS':'MIN / MAX';
    if(spec.shape){
      const p=document.createElement('p');p.className='param-note';
      p.textContent=spec.shape==='catenoid'?'u ∈ [0, 2π]   ·   v ∈ [−1.25, 1.25]':'u, v ∈ [0, 2π]';
      $('domainInputs').append(p);return;
    }
    for(const [idx,axis] of ['x','y'].entries()){
      const row=document.createElement('div');row.className='number-pair';
      row.innerHTML='<span>'+axis+'</span><input type="number" step="any" aria-label="'+axis.toUpperCase()+' minimum"><span class="to">→</span><input type="number" step="any" aria-label="'+axis.toUpperCase()+' maximum">';
      [...row.querySelectorAll('input')].forEach((input,k)=>{input.value=spec.domain[idx*2+k];input.oninput=()=>{spec.domain[idx*2+k]=input.valueAsNumber;refresh();if(valid)resetStart();};});
      $('domainInputs').append(row);
    }
  }
  function refresh(){
    clearResult();valid=false;
    try{
      mesh=sample(spec,value('resolution'));
      fn=spec.shape?null:compile(spec.formula);valid=true;
      $('expression').setAttribute('aria-invalid','false');
      refreshPrintMesh();
    }catch(err){
      fieldError('error',err.message);$('expression').setAttribute('aria-invalid','true');
      $('faceCount').textContent='Last valid preview';
    }
    $('exportButton').disabled=!valid;$('runOpt').disabled=!valid||Boolean(spec.shape);
    $('resValue').textContent=$('resolution').value+' × '+$('resolution').value;
    $('resolution').style.setProperty('--fill',((value('resolution')-16)/112*100)+'%');
    updateTitle();redraw();
  }
  function refreshPrintMesh(){
    try{printMesh=meshSolid();fieldError('error','');}
    catch(err){printMesh=null;fieldError('error',err.message+' Open Export STL to adjust the settings.');}
    updateFaceCount();
  }
  function choose(p){
    presetId=p.id;spec={...p,domain:p.domain?.slice()};color=p.color;
    $('expression').value=spec.formula;
    $('expression').rows=p.shape?Math.min(8,Math.max(3,p.formula.split('\n').length+1)):p.formula.length>55?2:1;
    $('expression').classList.toggle('parametric-expression',Boolean(p.shape));
    $('parametricHelp').hidden=!p.shape;
    $('exprType').textContent=p.shape?'r(u, v)':'z = f(x, y)';
    $('width').value=100;$('relief').value=p.relief;$('base').value=2;$('resolution').value=64;$('construction').value='base';
    domainControls();colorControls();resetStart();resetCamera();refresh();setOptimizer(optimizing);
  }
  $('expression').oninput=()=>{
    spec.formula=$('expression').value;
    const original=presets.find(p=>p.id===spec.id);
    presetId=original?.formula===spec.formula?original.id:null;
    refresh();
  };
  $('resolution').oninput=refresh;
  $('resetControls').onclick=()=>{choose(presets.find(p=>p.id===spec.id)||presets[0]);toast('Preset defaults restored');};
  function setOptimizer(active){
    optimizing=active;$('studioNav').classList.toggle('active',!active);$('optimizerNav').classList.toggle('active',active);
    $('editorPane').hidden=active;$('optimizerPane').hidden=!active;
    $('controlsTitle').innerHTML=icon(active?'path':'sliders')+(active?'Surface optimizer':'Surface controls');
    if(active&&spec.shape)$('optResult').textContent='Select a height graph from the preset library to search its x and y domain.';
    if(active&&!valid)$('optResult').textContent='Correct the equation or domain in Studio to run a search.';
  }
  $('studioNav').onclick=()=>setOptimizer(false);$('optimizerNav').onclick=()=>setOptimizer(true);
  $('optForm').onsubmit=e=>{
    e.preventDefault();if(!valid||spec.shape)return;
    try{
      result=SurfaceOptimize.search(fn,spec.domain,[value('startX'),value('startY')],$('method').value,$('goal').value);
      const answer=document.createElement('strong');answer.textContent='z = '+Number(result.z.toPrecision(7));
      $('optResult').replaceChildren(answer,document.createTextNode('x = '+number(result.x)+'  ·  y = '+number(result.y)+'  ·  '+result.reason+' ('+result.iterations+' iterations)'));
      redraw();
    }catch(err){$('optResult').textContent=err.message;}
  };
  ['method','goal','startX','startY'].forEach(id=>$(id).oninput=()=>{clearResult();redraw();});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',el===b);});
    if(valid)updateFaceCount();
    redraw();
  });
  const thumbMeshes=new Map();
  function thumb(canvas,p){
    if(!thumbMeshes.has(p.id))thumbMeshes.set(p.id,sample(p,p.shape?32:26));
    draw(canvas,thumbMeshes.get(p.id),{mini:true,color:p.color,relief:p.relief,el:p.shape==='torus'?.61:.43});
  }
  function renderCards(container,items){
    container.replaceChildren();
    if(!items.length){const p=document.createElement('p');p.className='empty';p.textContent='No matching surfaces.';container.append(p);return;}
    for(const p of items){
      const card=document.createElement('button');card.className='preset-card';card.dataset.id=p.id;card.style.setProperty('--tint',p.color+'14');
      card.innerHTML='<div class="preset-image"><canvas aria-hidden="true"></canvas><span class="chosen-mark">'+icon('check')+'</span></div><div class="card-info"><span class="card-name">'+p.name+'</span><span class="card-category">'+p.category+'</span></div>';
      card.onclick=()=>{if($('libraryDialog').open)$('libraryDialog').close();choose(p);};
      container.append(card);thumb(card.querySelector('canvas'),p);
    }
    updateTitle();
  }
  for(const cat of [...new Set(presets.map(p=>p.category))])$('category').add(new Option(cat,cat));
  function filterLibrary(){
    const query=$('search').value.trim().toLowerCase(), category=$('category').value;
    renderCards($('allCards'),presets.filter(p=>(category==='All categories'||p.category===category)&&(p.name+' '+p.category+' '+p.formula).toLowerCase().includes(query)));
  }
  function openLibrary(){$('libraryDialog').showModal();filterLibrary();$('search').focus();}
  $('libraryNav').onclick=openLibrary;$('browseButton').onclick=openLibrary;$('search').oninput=filterLibrary;$('category').onchange=filterLibrary;
  $('guideButton').onclick=()=>$('guideDialog').showModal();
  for(const d of document.querySelectorAll('dialog')){
    d.querySelector('.close').onclick=()=>d.close();
    d.addEventListener('click',e=>{if(e.target!==d)return;const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();});
  }
  let savedPrintSettings;
  function showConstructionFields(){
    const shell=!spec.shape&&$('construction').value==='shell';
    const closed=mesh.periodicU&&mesh.periodicV;
    $('constructionLabel').hidden=Boolean(spec.shape);
    $('shellHint').hidden=!shell;
    $('thicknessLabel').hidden=Boolean(spec.shape)&&closed;
    $('base').disabled=$('thicknessLabel').hidden;
    $('thicknessName').textContent=mesh.radialWall?'Radial wall':spec.shape||shell?'Wall thickness':'Base thickness';
    $('widthName').textContent=shell?'Graph XY span':'Longest XY side';
  }
  function updateExport(){
    try{
      if(!$('exportForm').checkValidity())throw Error('Enter print dimensions within the indicated ranges.');
      const c=config(),m=meshSolid(), min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
      for(const p of m.vertices)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
      $('dimensions').textContent=max.map((v,k)=>number(v-min[k])).join(' × ')+' mm';
      $('fileSize').textContent=integer(m.faces.length)+' faces · '+number((84+50*m.faces.length)/1e6)+' MB';
      draw($('exportCanvas'),mesh,{mini:true,...c,color,solid:m,base:!spec.shape?c.base:0});
      fieldError('exportError','');$('download').disabled=false;return m;
    }catch(err){
      fieldError('exportError',err.message);$('download').disabled=true;$('dimensions').textContent='—';$('fileSize').textContent='—';
      const canvas=$('exportCanvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      return null;
    }
  }
  $('exportButton').onclick=()=>{
    if(!valid)return;
    savedPrintSettings=config();$('exportName').textContent=name();
    showConstructionFields();
    $('exportDialog').showModal();updateExport();
  };
  for(const id of ['width','relief','base'])$(id).oninput=updateExport;
  $('construction').onchange=()=>{showConstructionFields();updateExport();};
  $('exportDialog').addEventListener('close',()=>{
    if(!savedPrintSettings)return;
    for(const [id,v] of Object.entries(savedPrintSettings))$(id).value=v;
    $('base').disabled=false;refreshPrintMesh();redraw();
  });
  $('exportForm').onsubmit=e=>{
    e.preventDefault();const m=updateExport();if(!m)return;
    try{
      const file=binarySTL(m,name());const url=URL.createObjectURL(new Blob([file],{type:'model/stl'}));
      const shell=!spec.shape&&$('construction').value==='shell';
      const suffix=shell?'-shell-'+value('base')+'mm':'';
      const a=document.createElement('a');a.href=url;a.download=(presetId||'custom-surface')+'-'+value('width')+'mm'+suffix+'.stl';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      savedPrintSettings=config();$('exportDialog').close();toast('STL export ready · '+integer(m.faces.length)+' triangles');
    }catch(err){fieldError('exportError',err.message);}
  };
  function zoom(f){camera.zoom=Math.max(.4,Math.min(3,camera.zoom*f));redraw();}
  $('zoomIn').onclick=()=>zoom(1.15);$('zoomOut').onclick=()=>zoom(1/1.15);$('resetView').onclick=resetCamera;
  function orbit(dx,dy){camera.az+=dx;camera.el=Math.max(-1.48,Math.min(1.56,camera.el+dy));$('view').value='orbit';redraw();}
  const canvas=$('plot');let drag=null;
  canvas.onpointerdown=e=>{if(!e.isPrimary)return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag||!e.isPrimary)return;orbit((e.clientX-drag[0])*.009,(e.clientY-drag[1])*.007);drag=[e.clientX,e.clientY];};
  canvas.onlostpointercapture=()=>drag=null;
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-Math.sign(e.deltaY)*.08));},{passive:false});
  canvas.onkeydown=e=>{
    const actions={ArrowLeft:()=>orbit(-.08,0),ArrowRight:()=>orbit(.08,0),ArrowUp:()=>orbit(0,.08),ArrowDown:()=>orbit(0,-.08),'+':()=>zoom(1.1),'=':()=>zoom(1.1),'-':()=>zoom(1/1.1),'0':resetCamera};
    if(Object.hasOwn(actions,e.key)){e.preventDefault();actions[e.key]();}
  };
  $('view').onchange=()=>{const angles={orbit:[-.67,.43],top:[0,Math.PI/2],front:[0,0],iso:[-Math.PI/4,.61548]};[camera.az,camera.el]=angles[$('view').value];redraw();};
  $('fullscreen').onclick=async()=>{
    const v=$('viewport');if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(v.classList.contains('expanded')){v.classList.remove('expanded');return;}
    try{await v.requestFullscreen();}catch{v.classList.add('expanded');}
  };
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('viewport').classList.remove('expanded');});
  new ResizeObserver(redraw).observe(canvas);
  new ResizeObserver(()=>document.querySelectorAll('.preset-card canvas').forEach(c=>thumb(c,presets.find(p=>p.id===c.closest('button').dataset.id)))).observe($('cards'));
  choose(presets[0]);renderCards($('cards'),presets.slice(0,5));
})();
