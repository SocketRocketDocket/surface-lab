const SurfaceRender = (() => {
  const rgb=h=>[1,3,5].map(k=>parseInt(h.slice(k,k+2),16));
  function draw(canvas,mesh,options={}) {
    const rect=canvas.getBoundingClientRect(), w=rect.width,h=rect.height;
    if(w<1 || h<1) return;
    const dpi=Math.min(window.devicePixelRatio || 1,2);
    if(canvas.width!==Math.round(w*dpi)||canvas.height!==Math.round(h*dpi)){
      canvas.width=Math.round(w*dpi); canvas.height=Math.round(h*dpi);
    }
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpi,0,0,dpi,0,0);ctx.clearRect(0,0,w,h);
    const mini=options.mini, az=options.az??-0.67, el=options.el??0.43;
    const sinA=Math.sin(az),cosA=Math.cos(az),sinE=Math.sin(el),cosE=Math.cos(el);
    const width=options.width||100, relief=options.relief??42,base=options.base||0;
    const printable=Boolean(options.solid);
    const convert=SurfaceGeometry.transform(mesh,width,relief);
    const vertices=(printable?options.solid.vertices:mesh.vertices.map(convert)).map(([x,y,z])=>[x/width,y/width,(z-(relief+base)/2)/width]);
    function raw(x,y,z){
      const depth=-x*sinA+y*cosA;
      return [x*cosA+y*sinA, -(depth*sinE+z*cosE),depth*cosE-z*sinE];
    }
    const coords=vertices.map(p=>raw(...p));
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(const [x,y] of coords){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
    const zoom=options.zoom||1;
    // A stable camera scale keeps orbiting and comparing surfaces predictable.
    const scale=(mini ? Math.min(w*.79/Math.max(.4,xmax-xmin),h*.76/Math.max(.2,ymax-ymin)) :
      Math.min(w*.66/1.4,h*.74/Math.max(.85,(relief+base)/width*.84+.52)))*zoom;
    const ox=w*.5-scale*(xmin+xmax)/2, oy=h*(mini?.5:.54)-scale*(ymin+ymax)/2;
    const screen=p=>[ox+p[0]*scale,oy+p[1]*scale,p[2]];
    const pts=coords.map(screen);
    function line(p,q,color,weight=1) {
      ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();
    }
    if(!mini&&options.grid!==false){
      const floor=-(relief+base)/(2*width)-.025;
      const floorPoint=(x,y)=>screen(raw(x,y,floor));
      for(let i=-8;i<=8;i++){
        const c=i/10,opacity=i===0?.28:.10;
        line(floorPoint(c,-.8),floorPoint(c,.8),'rgba(156,164,162,'+opacity+')',.7);
        line(floorPoint(-.8,c),floorPoint(.8,c),'rgba(156,164,162,'+opacity+')',.7);
      }
      ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';
      const axis=(a,b,name,color)=>{
        const p=screen(raw(...a)),q=screen(raw(...b));line(p,q,color,.85);
        ctx.fillStyle=color;ctx.fillText(name,q[0]+5,q[1]-5);
      };
      axis([-.72,0,floor],[.85,0,floor],'X','#bb8180');
      axis([0,-.72,floor],[0,.85,floor],'Y','#8caa88');
      axis([0,0,floor],[0,0,Math.max(.52,relief/width*.6)],'Z','#9c99c4');
    }
    const color=rgb(options.color||'#ac85ff'), light=[-.47,-.38,.79];
    const polygons=printable?options.solid.faces:mesh.quads;
    const sorted=polygons.map(ids=>[ids,ids.reduce((s,j)=>s+pts[j][2],0)/ids.length]).sort((a,b)=>b[1]-a[1]);
    ctx.lineJoin='round';
    for(const [ids] of sorted){
      const [i,j,k]=ids,a=vertices[i],b=vertices[j],c=vertices[k];
      const normal=SurfaceMath.cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));
      const len=Math.hypot(...normal)||1;
      const incidence=normal.reduce((s,v,k)=>s+v*light[k],0)/len;
      const elev=Math.max(0,Math.min(1,a[2]*width/relief+.5));
      const diffuse=(.30+.46*Math.abs(incidence)+.24*elev);
      const face=color.map((v,k)=>Math.min(255,Math.round(v*diffuse*(k===0?.72+elev*.30:k===1?.64+elev*.39:1.04)+Math.max(0,incidence)*11)));
      ctx.beginPath();ctx.moveTo(...pts[i].slice(0,2));
      for(let n=1;n<ids.length;n++) ctx.lineTo(pts[ids[n]][0],pts[ids[n]][1]);ctx.closePath();
      if(options.mode==='wire'){
        ctx.fillStyle='rgb(32,30,38)';ctx.fill();ctx.strokeStyle='rgba('+color.join(',')+',.83)';ctx.lineWidth=.8;
      } else {
        ctx.fillStyle='rgb('+face.join(',')+')';ctx.fill();
        const meshLines=(options.lines!==false && !printable);
        ctx.strokeStyle=meshLines?'rgba(39,24,53,'+(mini?.45:.65)+')':ctx.fillStyle;
        ctx.lineWidth=meshLines?(mini?.52:.72):.7;
      }
      ctx.stroke();
    }
    if(options.path?.length && !mesh.shape){
      const lift=printable?(options.solid.surfaceLift??base):0;
      const points=options.path.map(([x,y])=>{const p=convert([x,y,options.fn(x,y)]);return screen(raw(p[0]/width,p[1]/width,(p[2]+lift-(relief+base)/2)/width));});
      ctx.strokeStyle='#ddff97';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...points[0].slice(0,2));
      for(const p of points.slice(1))ctx.lineTo(p[0],p[1]);ctx.stroke();
      const p=points.at(-1);ctx.fillStyle='#d4ff89';ctx.strokeStyle='#262a24';ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    if(!mini){
      const center=[34,h-30];
      for(const [v,label,c] of [[[1,0,0],'x','#d18b8b'],[[0,1,0],'y','#96b98e'],[[0,0,1],'z','#a6a0da']]){
        const p=raw(...v),end=[center[0]+p[0]*18,center[1]+p[1]*18];
        line(center,end,c,1.4);ctx.fillStyle=c;ctx.textAlign='center';ctx.font='9px monospace';ctx.fillText(label,center[0]+p[0]*25,center[1]+p[1]*25+3);
      }
    }
  }
  return {draw};
})();
