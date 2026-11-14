// A conforming six-tetrahedron split gives adjacent cubes the same face diagonal.
const SurfaceContour=(()=>{
  const tetrahedra=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
  // All six tetrahedra have positive orientation. Determine triangle winding once
  // using a reference tetrahedron, independently of plot aspect ratio or field scale.
  const ref=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
  const cases=Array.from({length:16},(_,mask)=>{
    const neg=[],pos=[],tri=[];
    for(let i=0;i<4;i++)((mask>>i)&1?neg:pos).push(i);
    if(!neg.length||!pos.length)return tri;
    if(neg.length===2){
      const [i,j]=neg,[s,t]=pos,a=[i,s],b=[i,t],c=[j,t],d=[j,s];
      tri.push([a,b,c],[a,c,d]);
    }else{
      const [one,many]=neg.length===1?[neg,pos]:[pos,neg];
      tri.push(many.map(i=>[one[0],i]));
    }
    for(const edges of tri){
      const [a,b,c]=edges.map(([i,j])=>ref[i].map((v,k)=>(v+ref[j][k])/2));
      const cross=SurfaceMath.cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));
      if(cross.reduce((s,v,k)=>s+v*(ref[pos[0]][k]-ref[neg[0]][k]),0)<0)edges.reverse();
    }
    return tri;
  });
  function extract(field,[nx,ny,nz],origin,step,cap=false){
    const stride=nx*ny,total=field.length;
    const point=i=>[i%nx,Math.floor(i/nx)%ny,Math.floor(i/stride)].map((v,k)=>origin[k]+v*step[k]);
    const vertices=[],faces=[],caps=[],edges=new Map(),nodes=new Map();
    function node(i){
      if(!nodes.has(i))nodes.set(i,vertices.push(point(i))-1);
      return nodes.get(i);
    }
    function crossing(i,j){
      if(i>j){const swap=i;i=j;j=swap;}
      const key=i*total+j;
      if(edges.has(key))return edges.get(key);
      const a=Math.abs(field[i]),b=Math.abs(field[j]);
      // The ratio stays finite even when the sum of two finite values would overflow.
      const ratio=a<b?a/b:b/a,t=a<b?ratio/(1+ratio):1/(1+ratio);
      // Near-node crossings would otherwise collapse when STL rounds to float32.
      let index;
      if(cap&&t<=1e-5)index=node(i);
      else if(cap&&t>=1-1e-5)index=node(j);
      else{
        const p=point(i),q=point(j);
        index=vertices.push(p.map((v,k)=>v+(q[k]-v)*t))-1;
      }
      edges.set(key,index);return index;
    }
    function face(list,a,b,c){
      if(a!==b&&b!==c&&a!==c)list.push([a,b,c]);
    }
    const offsets=[0,1,nx,nx+1,stride,stride+1,stride+nx,stride+nx+1];
    const tets=tetrahedra.map(t=>t.map(k=>offsets[k]));
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const base=z*stride+y*nx+x,negative=field[base]<0;
      if(offsets.every(d=>(field[base+d]<0)===negative))continue;
      for(const tet of tets){
        let mask=0;for(let k=0;k<4;k++)if(field[base+tet[k]]<0)mask|=1<<k;
        for(const tri of cases[mask]){
          const ids=tri.map(([i,j])=>crossing(base+tet[i],base+tet[j]));
          face(faces,...ids);
        }
      }
      if(cap&&faces.length>200000)throw Error('Too many crossings for this mesh. Reduce the resolution or narrow the domain.');
    }
    const surfaceCount=vertices.length;
    if(cap&&faces.length){
      // Clip each outward-facing box triangle to the negative side. Use exactly
      // the same grid nodes, diagonals and edge intersections as the surface.
      function clip(a,b,c){
        const polygon=[];
        for(const [i,j] of [[a,b],[b,c],[c,a]]){
          if(field[i]<0)polygon.push(node(i));
          if((field[i]<0)!==(field[j]<0))polygon.push(crossing(i,j));
        }
        for(let k=2;k<polygon.length;k++)face(caps,polygon[0],polygon[k-1],polygon[k]);
      }
      const dims=[nx,ny,nz],strides=[1,nx,stride];
      for(let k=0;k<3;k++){
        const u=(k+1)%3,v=(k+2)%3;
        for(const side of [0,1])for(let j=0;j<dims[v]-1;j++)for(let i=0;i<dims[u]-1;i++){
          const a=side*(dims[k]-1)*strides[k]+i*strides[u]+j*strides[v];
          const b=a+strides[u],d=a+strides[v],c=b+strides[v];
          if(side){clip(a,b,c);clip(a,c,d);}else{clip(a,c,b);clip(a,d,c);}
        }
      }
    }
    return {vertices,faces,caps,surfaceCount};
  }
  return {extract};
})();
