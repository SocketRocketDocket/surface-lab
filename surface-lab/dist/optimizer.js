const SurfaceOptimize = (() => {
  function search(fn,domain,start,method,goal) {
    const low=[domain[0],domain[2]], span=[domain[1]-domain[0],domain[3]-domain[2]];
    const clamp=v=>Math.max(0,Math.min(1,v));
    const limit=p=>p.map(clamp);
    const actual=p=>p.map((v,k)=>low[k]+v*span[k]);
    const sign=goal==='max'?-1:1;
    const val=p=>{const f=sign*fn(...actual(p)); return Number.isFinite(f)?f:Infinity;};
    let p=limit(start.map((v,k)=>(v-low[k])/span[k]));
    if(!Number.isFinite(val(p))) throw Error('Choose a starting point with a finite value.');
    const path=[actual(p)];
    let iterations=0, reason='Iteration limit';
    function record(q) { p=q; path.push(actual(q)); }
    if(method==='grid'){
      let reach=1, left=[0,0], right=[1,1];
      for(let level=0;level<5;level++){
        let best=p, score=val(best);
        for(let a=0;a<=24;a++) for(let b=0;b<=24;b++){
          const q=[left[0]+a*(right[0]-left[0])/24,left[1]+b*(right[1]-left[1])/24], f=val(q);
          if(f<score){score=f;best=q;}
        }
        record(best); iterations++; reach=reach*2/24;
        left=p.map(v=>clamp(v-reach));right=p.map(v=>clamp(v+reach));
      }
      reason='Grid refined';
    } else if(method==='simplex'){
      let tri=[p,...[0,1].map(k=>p.map((v,j)=>j===k?clamp(v+(v>0.9?-0.07:0.07)):v))];
      for(;iterations<240;iterations++){
        tri.sort((a,b)=>val(a)-val(b));
        const [a,b,c]=tri, mid=a.map((v,k)=>(v+b[k])/2);
        if (Math.max(...tri.map(q=>Math.hypot(q[0]-a[0],q[1]-a[1])))<1e-7){reason='Converged';break;}
        const reflect=limit(mid.map((v,k)=>2*v-c[k]));
        if (val(reflect)<val(a)){
          const expand=limit(mid.map((v,k)=>v+2*(reflect[k]-v)));
          tri[2]=val(expand)<val(reflect)?expand:reflect;
        } else if(val(reflect)<val(b)){tri[2]=reflect;}
        else {
          const outside=val(reflect)<val(c), end=outside?reflect:c;
          const contract=mid.map((v,k)=>(v+end[k])/2);
          if(val(contract)<=val(end))tri[2]=contract;
          else tri=[a,...[b,c].map(q=>a.map((v,k)=>(v+q[k])/2))];
        }
        record(tri.reduce((a,b)=>val(a)<=val(b)?a:b));
      }
    } else {
      for(;iterations<1500;iterations++){
        const gradient=[0,1].map(k=>{
          const a=p.slice(),b=p.slice();a[k]=clamp(p[k]-1e-5);b[k]=clamp(p[k]+1e-5);
          return (val(b)-val(a))/(b[k]-a[k]);
        });
        const mag=Math.hypot(...gradient);
        if(!Number.isFinite(mag)){reason='Undefined gradient';break;}
        if(mag<1e-9){reason='Stationary point';break;}
        let step=0.1, q, improved=false;
        for(let trial=0;trial<32;trial++,step/=2){
          q=limit(p.map((v,k)=>v-step*gradient[k]/mag));
          if(val(q)<val(p)){improved=true;break;}
        }
        if(!improved){reason='No improving step';break;}
        record(q);
      }
    }
    const [x,y]=actual(p);
    return {x,y,z:fn(x,y),iterations,path,reason};
  }
  return {search};
})();
