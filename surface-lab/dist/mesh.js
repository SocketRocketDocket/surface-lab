const SurfaceGeometry = (() => {
  const {compile,compileParametric,cross} = SurfaceMath;
  function sample(spec,n) {
    const {shape,domain,formula} = spec;
    if (!Number.isInteger(n) || n<4 || n>256) throw Error('Choose a resolution between 4 and 256.');
    const vertices=[], faces=[], quads=[];
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const fn = shape ? compileParametric(formula) : compile(formula);
    if (!domain || domain.length!==4 || !domain.every(Number.isFinite) || domain[0]>=domain[1] || domain[2]>=domain[3])
      throw Error('Each domain maximum must be greater than its minimum.');
    for(let j=0;j<=n;j++) for(let i=0;i<=n;i++) {
      const x=domain[0]+(domain[1]-domain[0])*i/n;
      const y=domain[2]+(domain[3]-domain[2])*j/n;
      const p=shape?fn(x,y):[x,y,fn(x,y)];
      if (!p.every(Number.isFinite)) throw Error('Undefined surface at '+(shape?'u':'x')+' = '+x.toFixed(3)+', '+(shape?'v':'y')+' = '+y.toFixed(3)+'. Adjust the equation or domain.');
      vertices.push(p);
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]); max[k]=Math.max(max[k],p[k]);}
    }
    const stride=n+1;
    const tolerance=Math.max(...max.map((v,k)=>v-min[k]))*1e-9;
    const coincides=(a,b)=>vertices[a].every((v,k)=>Math.abs(v-vertices[b][k])<=tolerance);
    const indices=Array.from({length:stride},(_,i)=>i);
    const periodicU=Boolean(shape)&&indices.every(j=>coincides(j*stride,j*stride+n));
    const periodicV=Boolean(shape)&&indices.every(i=>coincides(i,n*stride+i));
    const columns=n+(periodicU?0:1), rows=n+(periodicV?0:1);
    if(periodicU||periodicV){
      for(let j=0;j<rows;j++) for(let i=0;i<columns;i++) vertices[j*columns+i]=vertices[j*stride+i];
      vertices.length=rows*columns;
    }
    const at=(i,j)=>(j%rows)*columns+i%columns;
    for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
      const a=at(i,j), b=at(i+1,j), c=at(i+1,j+1), d=at(i,j+1);
      quads.push([a,b,c,d]); faces.push([a,b,c],[a,c,d]);
    }
    // An edited equation may open or close a seam independently of its starting preset.
    const radialWall=shape==='catenoid' && formula===SurfaceMath.presets.find(p=>p.id==='catenoid').formula;
    return {vertices,faces,quads,min,max,n,at,columns,rows,shape,periodicU,periodicV,radialWall};
  }
  // Fit X and Y with one scale factor. Relief is independently specified in mm.
  function transform(mesh,width,relief) {
    const span=mesh.max.map((v,k)=>v-mesh.min[k]);
    const scale=width/Math.max(span[0],span[1]);
    const zScale=span[2] ? relief/span[2] : 0;
    return ([x,y,z])=>[(x-(mesh.min[0]+span[0]/2))*scale,(y-(mesh.min[1]+span[1]/2))*scale,(z-mesh.min[2])*zScale];
  }
  function surfaceShell(points,triangles,boundary,thickness,heightGraph) {
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
      const direction=SurfaceMath.unit(normals[i]);
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
    const convert=transform(mesh,width,relief), vertices=mesh.vertices.map(convert), faces=mesh.faces.slice();
    const {n,at,shape}=mesh;
    function bridge(a,b,c,d){faces.push([a,b,c],[a,c,d]);}
    if(!shape) {
      const ring=[];
      for(let i=0;i<n;i++)ring.push(at(i,0));
      for(let j=0;j<n;j++)ring.push(at(n,j));
      for(let i=n;i>0;i--)ring.push(at(i,n));
      for(let j=n;j>0;j--)ring.push(at(0,j));
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
        const a=at(i,0),b=at(i+1,0),c=at(i,n),d=at(i+1,n);
        bridge(b,a,a+count,b+count); bridge(c,d,d+count,c+count);
      }
    } else if(!mesh.periodicU || !mesh.periodicV) {
      const boundary=[];
      for(let i=0;i<n;i++){
        if(!mesh.periodicU) boundary.push([at(n,i),at(n,i+1)],[at(0,i+1),at(0,i)]);
        if(!mesh.periodicV) boundary.push([at(i,0),at(i+1,0)],[at(i+1,n),at(i,n)]);
      }
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
  return {sample,transform,solid,binarySTL};
})();
