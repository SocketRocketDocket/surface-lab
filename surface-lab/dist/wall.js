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
    const position=i=>[i%nx,Math.floor(i/nx)%ny,Math.floor(i/stride)];
    const vertices=[],faces=[],edges=new Map();
    function crossing(i,j){
      const id=Math.min(i,j)*total+Math.max(i,j);
      if(edges.has(id))return edges.get(id);
      const a=position(i),b=position(j),t=field[i]/(field[i]-field[j]);
      const index=vertices.length;
      vertices.push(a.map((v,k)=>origin[k]+(v+t*(b[k]-v))*step));edges.set(id,index);
      return index;
    }
    function face(a,b,c,outward){
      const p=vertices[a],q=vertices[b],r=vertices[c];
      const normal=SurfaceMath.cross(q.map((v,k)=>v-p[k]),r.map((v,k)=>v-p[k]));
      faces.push(normal.reduce((s,v,k)=>s+v*outward[k],0)>0?[a,b,c]:[a,c,b]);
    }
    const offsets=[0,1,nx,nx+1,stride,stride+1,stride+nx,stride+nx+1];
    const tetrahedra=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const base=z*stride+y*nx+x,negative=field[base]<0;
      if(offsets.every(d=>(field[base+d]<0)===negative))continue;
      for(const cell of tetrahedra){
        const inside=[],outside=[];
        for(const k of cell){const i=base+offsets[k];(field[i]<0?inside:outside).push(i);}
        if(!inside.length||!outside.length)continue;
        const p=position(inside[0]),out=position(outside[0]).map((v,k)=>v-p[k]);
        if(inside.length===2){
          const [i,j]=inside,[s,t]=outside,a=crossing(i,s),b=crossing(i,t),c=crossing(j,t),d=crossing(j,s);
          face(a,b,c,out);face(a,c,d,out);
        }else{
          const single=inside.length===1?inside:outside,other=single===inside?outside:inside;
          face(...other.map(i=>crossing(single[0],i)),out);
        }
      }
    }
    if(!faces.length)throw Error('The wall could not be sampled at these print dimensions.');
    const floor=vertices.reduce((z,p)=>Math.min(z,p[2]),Infinity);
    for(const p of vertices)p[2]-=floor;
    const solid={vertices,faces};cache.set(mesh,{key,solid});return solid;
  }
  return {fused};
})();
