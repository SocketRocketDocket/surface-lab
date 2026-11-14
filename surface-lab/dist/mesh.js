const SurfaceGeometry = (() => {
  const {compile,compileParametric,cross} = SurfaceMath;
  function validateGrid(n,nv){
    if(![n,nv].every(v=>Number.isInteger(v)&&v>=4)||(n+1)*(nv+1)>257*257)
      throw Error('Use at least 5 samples per axis and at most 66,049 samples in total.');
  }
  function sample(spec,n,nv=n) {
    const {shape,domain,formula} = spec;
    if(shape==='implicit')return sampleImplicit(spec,n);
    validateGrid(n,nv);
    const vertices=[], faces=[], quads=[];
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const fn = shape ? compileParametric(formula) : compile(formula);
    if (!domain || domain.length!==4 || !domain.every(Number.isFinite) || domain[0]>=domain[1] || domain[2]>=domain[3])
      throw Error('Each domain maximum must be greater than its minimum.');
    for(let j=0;j<=nv;j++) for(let i=0;i<=n;i++) {
      const x=domain[0]+(domain[1]-domain[0])*i/n;
      const y=domain[2]+(domain[3]-domain[2])*j/nv;
      const p=shape?fn(x,y):[x,y,fn(x,y)];
      if (!p.every(Number.isFinite)) throw Error('Undefined surface at '+(shape?'u':'x')+' = '+x.toFixed(3)+', '+(shape?'v':'y')+' = '+y.toFixed(3)+'. Adjust the equation or domain.');
      vertices.push(p);
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]); max[k]=Math.max(max[k],p[k]);}
    }
    const stride=n+1;
    const tolerance=Math.max(...max.map((v,k)=>v-min[k]))*1e-9;
    const coincides=(a,b)=>vertices[a].every((v,k)=>Math.abs(v-vertices[b][k])<=tolerance);
    const alongU=Array.from({length:stride},(_,i)=>i);
    const alongV=Array.from({length:nv+1},(_,j)=>j);
    const sameU=Boolean(shape)&&alongV.every(j=>coincides(j*stride,j*stride+n));
    const periodicV=Boolean(shape)&&alongU.every(i=>coincides(i,nv*stride+i));
    const collapsedBoundary=Boolean(shape)&&(
      (!periodicV&&[0,nv*stride].some(start=>alongU.every(i=>coincides(start,start+i))))||
      (!sameU&&[0,n].some(start=>alongV.every(j=>coincides(start,start+j*stride))))
    );
    let twist=-1;
    if(periodicV&&!sameU){
      // The Klein bottle identifies (uMax,v) with (uMin, pi-v).
      // A half-turn needs an even number of intervals to share exact vertices.
      if(nv%2 && alongV.every(j=>{
        const phase=(1.5-j/nv)%1;
        const q=fn(domain[0],domain[2]+(domain[3]-domain[2])*phase);
        return vertices[j*stride+n].every((v,k)=>Math.abs(v-q[k])<=tolerance);
      }))return sample(spec,n,nv+1);
      twist=alongV.slice(0,nv).find(offset=>alongV.every(j=>coincides(j*stride+n,((offset-j+nv)%nv)*stride)))??-1;
    }
    const periodicU=sameU||twist>=0;
    const columns=n+(periodicU?0:1), rows=nv+(periodicV?0:1);
    if(periodicU||periodicV){
      for(let j=0;j<rows;j++) for(let i=0;i<columns;i++) vertices[j*columns+i]=vertices[j*stride+i];
      vertices.length=rows*columns;
    }
    const at=(i,j)=>((twist>=0&&i===n?(twist-j+nv)%nv:j%rows)*columns+i%columns);
    for(let j=0;j<nv;j++) for(let i=0;i<n;i++) {
      const a=at(i,j), b=at(i+1,j), c=at(i+1,j+1), d=at(i,j+1);
      quads.push([a,b,c,d]); faces.push([a,b,c],[a,c,d]);
    }
    // An edited equation may open or close a seam independently of its starting preset.
    const radialWall=shape==='catenoid' && formula===SurfaceMath.presets.find(p=>p.id==='catenoid').formula;
    return {vertices,faces,quads,min,max,n,nv,at,columns,rows,shape,periodicU,periodicV,twisted:twist>=0,collapsedBoundary,radialWall};
  }
  function bounds(vertices){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of vertices)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
    return {min,max};
  }
  function sampleImplicit({domain,formula,shape},n){
    if(!Number.isInteger(n)||n<8||n>48)throw Error('Use 8 to 48 intervals per axis for an implicit surface.');
    if(domain?.length!==6||!domain.every(Number.isFinite)||[0,2,4].some(k=>!(domain[k+1]>domain[k])))
      throw Error('Each domain maximum must be greater than its minimum.');
    const fn=SurfaceMath.compileImplicit(formula),origin=[domain[0],domain[2],domain[4]];
    const step=origin.map((v,k)=>(domain[2*k+1]-v)/n);
    const size=n+1,field=new Float64Array(size**3);
    let index=0;
    for(let k=0;k<size;k++)for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const x=origin[0]+i*step[0],y=origin[1]+j*step[1],z=origin[2]+k*step[2];
      const v=fn(x,y,z);
      if(!Number.isFinite(v))throw Error('Undefined field at ('+[x,y,z].map(a=>a.toFixed(3)).join(', ')+'). Adjust the equation or bounds.');
      field[index++]=v;
    }
    const {vertices:solidVertices,faces,caps,surfaceCount}=SurfaceContour.extract(field,[size,size,size],origin,step,true);
    if(!faces.length)throw Error('No surface crossing found. Check the equation, widen the bounds or increase resolution.');
    const vertices=solidVertices.slice(0,surfaceCount);
    // A field gradient gives smooth offsets even next to a very skinny triangle.
    // Fall back to its mesh normal where a derivative is undefined.
    const fieldNormal=p=>{
      const f=fn(...p);
      const g=step.map((s,k)=>{
        const h=s*.001,q=p.slice();q[k]+=h;const hi=fn(...q);
        q[k]=p[k]-h;const lo=fn(...q);
        return Number.isFinite(hi)&&Number.isFinite(lo)?(hi-lo)/(2*h):Number.isFinite(hi)?(hi-f)/h:(f-lo)/h;
      });
      return g.every(Number.isFinite)&&Math.hypot(...g)>0?SurfaceMath.unit(g):null;
    };
    return {shape,n,nv:n,vertices,faces,solidVertices,solidFaces:faces.concat(caps),fieldNormal,...bounds(vertices),solidBounds:bounds(solidVertices)};
  }
  // Keep implicit geometry at its natural proportions, including vertical sheets.
  function transform(mesh,width,relief) {
    const span=mesh.max.map((v,k)=>v-mesh.min[k]);
    const scale=width/Math.max(span[0],span[1]);
    const zScale=mesh.shape==='implicit'?scale:span[2]?relief/span[2]:0;
    return ([x,y,z])=>[(x-(mesh.min[0]+span[0]/2))*scale,(y-(mesh.min[1]+span[1]/2))*scale,(z-mesh.min[2])*zScale];
  }
  // Each edge of a printable boundary has two oppositely wound triangles.
  // For a thickened sheet also recover its oriented rim before offsetting it.
  function implicitEdges(faces,count,closed){
    const edges=new Map();
    for(const [a,b,c] of faces)for(const [i,j] of [[a,b],[b,c],[c,a]]){
      const key=Math.min(i,j)*count+Math.max(i,j),direction=i<j?1:-1,previous=edges.get(key);
      if(previous===undefined)edges.set(key,direction);
      else if(previous===-direction)edges.set(key,0);
      else throw Error('The surface meets itself at this resolution. Adjust the equation, bounds or resolution before printing.');
    }
    const rim=[];
    for(const [key,direction] of edges)if(direction){
      if(closed)throw Error('The filled mesh has an open edge. Adjust the bounds or resolution before printing.');
      const i=Math.floor(key/count),j=key%count;rim.push(direction>0?[i,j]:[j,i]);
    }
    return rim;
  }
  function surfaceShell(points,triangles,boundary,thickness,heightGraph,directions) {
    // Accumulate area-weighted normals after scaling into physical millimeters.
    const normals=points.map(()=>[0,0,0]);
    for(const triangle of triangles) {
      const [a,b,c]=triangle.map(i=>points[i]);
      const normal=cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));
      for(const i of triangle) for(let k=0;k<3;k++) normals[i][k]+=normal[k];
    }
    const count=points.length, vertices=new Array(2*count);
    let lowest=Infinity;
    for(let i=0;i<count;i++) {
      const direction=directions?.[i]??SurfaceMath.unit(normals[i]);
      const offset=direction.map(v=>v*thickness/2);
      vertices[i]=points[i].map((v,k)=>v+offset[k]);
      vertices[count+i]=points[i].map((v,k)=>v-offset[k]);
      lowest=Math.min(lowest,vertices[i][2],vertices[count+i][2]);
    }
    for(const p of vertices) p[2]-=lowest;
    const faces=triangles.slice();
    for(const [a,b,c] of triangles) {
      const original=heightGraph?null:cross(points[b].map((v,k)=>v-points[a][k]),points[c].map((v,k)=>v-points[a][k]));
      for(const layer of [0,count]) {
        const p=vertices[layer+a],q=vertices[layer+b],r=vertices[layer+c];
        const normal=cross(q.map((v,k)=>v-p[k]),r.map((v,k)=>v-p[k]));
        const oriented=heightGraph?normal[2]:normal.reduce((s,v,k)=>s+v*original[k],0);
        if(!(oriented>0)) throw Error('A wall face folds or collapses. Check the equation, reduce wall thickness or adjust the print dimensions.');
      }
      faces.push([a+count,c+count,b+count]);
    }
    for(const [a,b] of boundary) {
      faces.push([b,a,a+count],[b,a+count,b+count]);
    }
    return {vertices,faces,surfaceLift:-lowest};
  }
  function solid(mesh,width,relief,thickness,construction='base') {
    if (![width,relief,thickness].every(v=>Number.isFinite(v)&&v>0)) throw Error('Print dimensions must be positive.');
    if(mesh.shape==='implicit'){
      if(construction==='shell'){
        mesh.rim??=implicitEdges(mesh.faces,mesh.vertices.length,false);
        mesh.normals??=mesh.vertices.map(mesh.fieldNormal);
        return surfaceShell(mesh.vertices.map(transform(mesh,width,relief)),mesh.faces,mesh.rim,thickness,false,mesh.normals);
      }
      if(!mesh.checked){implicitEdges(mesh.solidFaces,mesh.solidVertices.length,true);mesh.checked=true;}
      const convert=transform({shape:mesh.shape,...mesh.solidBounds},width,relief);
      return {vertices:mesh.solidVertices.map(convert),faces:mesh.solidFaces};
    }
    const convert=transform(mesh,width,relief), vertices=mesh.vertices.map(convert), faces=mesh.faces.slice();
    const {n,nv,at,shape}=mesh;
    if(mesh.twisted||mesh.collapsedBoundary) return SurfaceWall.fused(mesh,vertices,width,relief,thickness);
    function bridge(a,b,c,d){faces.push([a,b,c],[a,c,d]);}
    if(!shape) {
      const ring=[];
      for(let i=0;i<n;i++)ring.push(at(i,0));
      for(let j=0;j<nv;j++)ring.push(at(n,j));
      for(let i=n;i>0;i--)ring.push(at(i,nv));
      for(let j=nv;j>0;j--)ring.push(at(0,j));
      if(construction==='shell') return surfaceShell(vertices,mesh.faces,ring.map((a,i)=>[a,ring[(i+1)%ring.length]]),thickness,true);
      for(const p of vertices) p[2]+=thickness;
      // A single fan seals the flat base with identical edge vertices on each rim.
      const bottom=vertices.length;
      for(const id of ring) vertices.push([vertices[id][0],vertices[id][1],0]);
      const center=vertices.push([0,0,0])-1;
      for(let k=0;k<ring.length;k++){
        const next=(k+1)%ring.length;
        bridge(ring[next],ring[k],bottom+k,bottom+next);
        faces.push([center,bottom+next,bottom+k]);
      }
    } else if(mesh.radialWall) {
      const count=vertices.length;
      for(let i=0;i<count;i++){
        const [x,y,z]=vertices[i],r=Math.hypot(x,y);
        if(r<=thickness) throw Error('Reduce the wall thickness so the neck stays open.');
        vertices.push([x*(1-thickness/r),y*(1-thickness/r),z]);
      }
      for(const [a,b,c] of mesh.faces)faces.push([c+count,b+count,a+count]);
      for(let i=0;i<n;i++){
        const a=at(i,0),b=at(i+1,0),c=at(i,nv),d=at(i+1,nv);
        bridge(b,a,a+count,b+count); bridge(c,d,d+count,c+count);
      }
    } else if(!mesh.periodicU || !mesh.periodicV) {
      const boundary=[];
      if(!mesh.periodicU) for(let j=0;j<nv;j++) boundary.push([at(n,j),at(n,j+1)],[at(0,j+1),at(0,j)]);
      if(!mesh.periodicV) for(let i=0;i<n;i++) boundary.push([at(i,0),at(i+1,0)],[at(i+1,nv),at(i,nv)]);
      return surfaceShell(vertices,mesh.faces,boundary,thickness,false);
    } else {
      // Reversing either parameter reverses the surface winding.
      let volume6=0;
      for(const [i,j,k] of faces){
        const a=vertices[i],normal=cross(vertices[j],vertices[k]);
        volume6+=a[0]*normal[0]+a[1]*normal[1]+a[2]*normal[2];
      }
      if(volume6<0) return {vertices,faces:faces.map(([a,b,c])=>[a,c,b])};
    }
    return {vertices,faces};
  }
  function binarySTL(mesh,name) {
    const buffer=new ArrayBuffer(84+mesh.faces.length*50), view=new DataView(buffer);
    new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Surface Lab | '+name+' | mm').slice(0,80));
    view.setUint32(80,mesh.faces.length,true);
    const vertices=mesh.vertices.map(p=>p.map(Math.fround));
    let offset=84;
    for(const face of mesh.faces){
      const [a,b,c]=face.map(i=>vertices[i]);
      const normal=cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));
      const length=Math.hypot(...normal);
      if (!(length>0) || !Number.isFinite(length)) throw Error('The mesh has a collapsed triangle. Adjust the domain or print dimensions.');
      for (const p of [normal.map(v=>v/length),a,b,c]) for(const v of p){view.setFloat32(offset,v,true);offset+=4;}
      offset+=2;
    }
    return buffer;
  }
  return {sample,transform,solid,binarySTL,validateGrid};
})();
