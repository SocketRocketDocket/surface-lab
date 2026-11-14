// An unsigned distance field lets the two sides of a twisted surface meet at its crossing.
const SurfaceWall=(()=>{
  const cache=new WeakMap();
  const squared=(x,y,z)=>x*x+y*y+z*z;
  function segment(px,py,pz,x,y,z,length2){
    const t=length2?Math.max(0,Math.min(1,(px*x+py*y+pz*z)/length2)):0;
    return squared(px-t*x,py-t*y,pz-t*z);
  }
  function fused(mesh,points,width,relief,thickness){
    const key=[width,relief,thickness].join(',');
    if(cache.get(mesh)?.key===key)return cache.get(mesh).solid;
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
    const span=hi.map((v,k)=>v-lo[k]),radius=thickness/2;
    const step=Math.min(thickness/2.5,Math.max(...span)/60);
    const dims=span.map(v=>Math.ceil((v+thickness)/step)+5);
    const [nx,ny,nz]=dims,stride=nx*ny,total=stride*nz;
    if(total>5000000||Math.max(...dims)>1024)throw Error('Increase wall thickness or reduce the print dimensions for the fused wall.');
    const origin=lo.map(v=>v-radius-2*step);
    const band=radius+1.75*step;
    const field=new Float32Array(total).fill(band*band);
    for(const [ia,ib,ic] of mesh.faces){
      const a=points[ia],b=points[ib],c=points[ic];
      const [ex,ey,ez]=b.map((v,k)=>v-a[k]),[fx,fy,fz]=c.map((v,k)=>v-a[k]);
      const [gx,gy,gz]=c.map((v,k)=>v-b[k]);
      const ee=squared(ex,ey,ez),ff=squared(fx,fy,fz),gg=squared(gx,gy,gz),ef=ex*fx+ey*fy+ez*fz;
      const normal=SurfaceMath.cross([ex,ey,ez],[fx,fy,fz]),area2=squared(...normal);
      if(!area2)continue;
      const low=a.map((v,k)=>Math.max(0,Math.ceil((Math.min(v,b[k],c[k])-band-origin[k])/step)));
      const high=a.map((v,k)=>Math.min(dims[k]-1,Math.floor((Math.max(v,b[k],c[k])+band-origin[k])/step)));
      for(let z=low[2];z<=high[2];z++)for(let y=low[1];y<=high[1];y++){
        const py=origin[1]+y*step-a[1],pz=origin[2]+z*step-a[2];
        for(let x=low[0];x<=high[0];x++){
          const px=origin[0]+x*step-a[0],de=px*ex+py*ey+pz*ez,df=px*fx+py*fy+pz*fz;
          const s=ff*de-ef*df,t=ee*df-ef*de;
          let d;
          if(s>=0&&t>=0&&s+t<=area2){
            const h=px*normal[0]+py*normal[1]+pz*normal[2];d=h*h/area2;
          }else d=Math.min(segment(px,py,pz,ex,ey,ez,ee),segment(px,py,pz,fx,fy,fz,ff),segment(px-ex,py-ey,pz-ez,gx,gy,gz,gg));
          const id=z*stride+y*nx+x;if(d<field[id])field[id]=d;
        }
      }
    }
    const threshold=radius*radius,epsilon=threshold*1e-5;
    for(let i=0;i<total;i++){const d=field[i]-threshold;field[i]=Math.abs(d)<epsilon?epsilon:d;}
    const {vertices,faces}=SurfaceContour.extract(field,dims,origin,[step,step,step]);
    if(!faces.length)throw Error('The wall could not be sampled at these print dimensions.');
    const floor=vertices.reduce((z,p)=>Math.min(z,p[2]),Infinity);
    for(const p of vertices)p[2]-=floor;
    const solid={vertices,faces};cache.set(mesh,{key,solid});return solid;
  }
  return {fused};
})();
