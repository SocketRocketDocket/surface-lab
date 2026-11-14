const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../dist',name+'.js'),'utf8');
const {M,G}=vm.runInThisContext(['math','contour','wall','mesh'].map(source).join('\n')+';({M:SurfaceMath,G:SurfaceGeometry})');
const preset=id=>M.presets.find(p=>p.id===id);
const sample=(formula,domain=[-1,1,-1,1,-1,1])=>G.sample({shape:'implicit',formula,domain},16);

// Inspect the actual float32 triangle soup, as a slicer would. Mesh indices alone
// cannot catch cracks or degeneracy caused by rounding coordinates during export.
function inspect(solid){
  const view=new DataView(G.binarySTL(solid,'test')),count=view.getUint32(80,true);
  assert.equal(view.byteLength,84+count*50);assert.ok(count>0);
  const ids=new Map(),edges=new Map(),lo=[Infinity,Infinity,Infinity],hi=lo.map(v=>-v);
  let volume=0;
  for(let i=0;i<count;i++){
    const off=84+50*i+12;
    const tri=[0,1,2].map(j=>[0,1,2].map(k=>view.getFloat32(off+12*j+4*k,true)));
    const [a,b,c]=tri,bc=M.cross(b,c);volume+=a.reduce((s,v,k)=>s+v*bc[k],0)/6;
    const face=tri.map(p=>{
      p.forEach((v,k)=>{assert.ok(Number.isFinite(v));lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);});
      const key=p.join(',');if(!ids.has(key))ids.set(key,ids.size);return ids.get(key);
    });
    for(let k=0;k<3;k++){
      const a=face[k],b=face[(k+1)%3],dir=a<b?1:-1,key=Math.min(a,b)+','+Math.max(a,b);
      assert.notEqual(a,b);
      const prior=edges.get(key);
      if(prior===undefined)edges.set(key,dir);
      else{assert.equal(prior,-dir,'inconsistent winding or an edge shared more than twice');edges.set(key,0);}
    }
  }
  for(const state of edges.values())assert.equal(state,0,'open STL edge');
  assert.equal(lo[2],0);assert.ok(volume>0,'outward winding');
  return {span:hi.map((v,k)=>v-lo[k]),volume};
}

test('implicit evaluator accepts both equation forms, with z inside functions and conditions',()=>{
  for(const f of ['z + 2*y = x^2','z + 2*y - x^2'])assert.equal(M.compileImplicit(f)(3,2,7),2);
  assert.equal(M.compileImplicit('z = if(x == 0, abs(z*y), xz)')(0,-2,3),-3);
  assert.equal(M.compileImplicit('x = z >= 2 ? sin(z) : y')(1,7,0),-6);
  for(const bad of ['x=y=z','x^2 + z^2 == 1','z=','x = mystery(z)'])assert.throws(()=>M.compileImplicit(bad));
});
test('sphere preserves proportions, encloses its analytic volume, and has no box faces',()=>{
  const mesh=G.sample(preset('sphere'),24);
  assert.equal(mesh.faces.length,mesh.solidFaces.length);
  const {span,volume}=inspect(G.solid(mesh,100,15,2));
  assert.deepEqual(span,[100,100,100]);assert.ok(Math.abs(volume/(4*Math.PI*50**3/3)-1)<.01);
});
test('grid-aligned cut fills the selected side and also prints as a freestanding wall',()=>{
  const domain=[-2,2,-1,1,-1,3];
  for(const [formula,height] of [['z=0',25],['0=z',75]]){
    const mesh=sample(formula,domain);
    assert.ok(mesh.vertices.every(p=>p[2]===0));
    const filled=inspect(G.solid(mesh,100,10,2));
    assert.deepEqual(filled.span,[100,50,height]);
    assert.ok(Math.abs(filled.volume-100*50*height)<1e-6);
    assert.deepEqual(inspect(G.solid(mesh,100,10,2,'shell')).span,[100,50,2]);
  }
});
test('oblique cut and curved presets have watertight filled and thickened STL meshes',()=>{
  for(const m of [sample('x+y=z'),G.sample(preset('gyroid'),24),G.sample(preset('hyperboloid'),24)]){
    for(const style of ['base','shell'])inspect(G.solid(m,100,100,2,style));
  }
});
test('invalid bounds, nonfinite fields, and empty contours report actionable errors',()=>{
  assert.throws(()=>sample('z',[-1,1,-1,1,3,2]),/maximum/);
  assert.throws(()=>sample('sqrt(z) = x'),/Undefined field/);
  assert.throws(()=>sample('x^2 + y^2 + z^2 = 9'),/No surface crossing/);
  assert.throws(()=>sample('0 = 0'),/No surface crossing/);
});
test('legacy fused-wall meshing still closes a Klein bottle',()=>{
  inspect(G.solid(G.sample(preset('klein'),24),30,18,3));
});
