/* The expression compiler and surface library are also used by the mesh checks. */
const SurfaceMath = (() => {
  const functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    log: Math.log, ln: Math.log, log10: Math.log10, floor: Math.floor, ceil: Math.ceil,
    sinc: x => Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x,
    min: Math.min, max: Math.max, atan2: Math.atan2, hypot: Math.hypot, pow: Math.pow,
    rmod: (x,y) => x%y
  };
  function compile(source,parameters=['x','y'],locals=Object.create(null)) {
    const clean = (parameters.length===2 && parameters[0]==='x'?source.trim().replace(/^z\s*=\s*/i,''):source.trim()).toLowerCase()
      .replaceAll('π','pi').replaceAll('²','^2').replaceAll('³','^3').replaceAll('−','-')
      .replaceAll('×','*').replaceAll('÷','/').replaceAll('**','^');
    if (!clean || clean.length > 8192) throw Error('Enter an expression of up to 8192 characters.');
    const tokens = clean.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[a-z_][a-z0-9_]*|<=|>=|==|!=|&&|\|\||[^\s]/g) || [];
    let i = 0;
    function atom() {
      const t = tokens[i++];
      if (t === '(') {
        const expr = conditional();
        if (tokens[i++] !== ')') throw Error('Add a closing parenthesis.');
        return expr;
      }
      if (t && t === parameters[0]) return x => x;
      if (t && t === parameters[1]) return (x,y,z) => y;
      if (parameters.length===3 && t===parameters[2]) return (x,y,z)=>z;
      if (t === parameters[0]+parameters[1]) return (x,y,z)=>x*y;
      if (parameters.length===3 && t==='xz') return (x,y,z)=>x*z;
      if (parameters.length===3 && t==='yz') return (x,y,z)=>y*z;
      if (parameters.length===3 && t==='xyz') return (x,y,z)=>x*y*z;
      if (Object.hasOwn(locals,t)) return () => locals[t];
      if (t === 'pi' || t === 'e') return () => t === 'pi' ? Math.PI : Math.E;
      if (t && /^\d|^\./.test(t) && Number.isFinite(Number(t))) return () => Number(t);
      if (t==='if' || t==='piecewise') {
        if(tokens[i++]!=='(') throw Error('Use if(condition, true value, false value).');
        const test=conditional();
        if(tokens[i++]!==',') throw Error('Add the true and false values to the conditional.');
        const yes=conditional();
        if(tokens[i++]!==',') throw Error('Add a false value to the conditional.');
        const no=conditional();
        if(tokens[i++]!==')') throw Error('Check the conditional parentheses.');
        return (x,y,z)=>test(x,y,z)?yes(x,y,z):no(x,y,z);
      }
      if (Object.hasOwn(functions,t)) {
        if (tokens[i++] !== '(') throw Error('Use parentheses around function arguments.');
        const first = conditional();
        let second;
        if (tokens[i] === ',') { i++; second = conditional(); }
        if (tokens[i++] !== ')') throw Error('Check the function parentheses.');
        const binary = ['min','max','atan2','hypot','pow','rmod'].includes(t);
        if (binary !== Boolean(second)) throw Error(t + ' takes ' + (binary ? 'two arguments.' : 'one argument.'));
        return second ? (x,y,z) => functions[t](first(x,y,z),second(x,y,z)) : (x,y,z) => functions[t](first(x,y,z));
      }
      throw Error(t ? 'Unrecognized term “' + t + '”.' : 'The expression is incomplete.');
    }
    function power() {
      const a = atom();
      if (tokens[i] !== '^') return a;
      i++; const b = unary(); return (x,y,z) => a(x,y,z) ** b(x,y,z);
    }
    function unary() {
      if (tokens[i] === '-') { i++; const a = unary(); return (x,y,z) => -a(x,y,z); }
      if (tokens[i] === '+') { i++; return unary(); }
      if (tokens[i] === '!') { i++; const a=unary(); return (x,y,z)=>Number(!a(x,y,z)); }
      return power();
    }
    function product() {
      let expr = unary();
      while (i < tokens.length) {
        const t = tokens[i];
        const implicit = t === '(' || /^[a-z]/.test(t);
        if (!implicit && t !== '*' && t !== '/') break;
        if (!implicit) i++;
        const left = expr, right = unary();
        expr = t === '/' ? (x,y,z) => left(x,y,z)/right(x,y,z) : (x,y,z) => left(x,y,z)*right(x,y,z);
      }
      return expr;
    }
    function sum() {
      let expr = product();
      while (tokens[i] === '+' || tokens[i] === '-') {
        const t = tokens[i++], left = expr, right = product();
        expr = t === '+' ? (x,y,z) => left(x,y,z)+right(x,y,z) : (x,y,z) => left(x,y,z)-right(x,y,z);
      }
      return expr;
    }
    const relations={'<':(a,b)=>a<b,'>':(a,b)=>a>b,'<=':(a,b)=>a<=b,'>=':(a,b)=>a>=b};
    const equality={'==':(a,b)=>a===b,'!=':(a,b)=>a!==b};
    function compare(next,operations){
      let expr=next();
      while(Object.hasOwn(operations,tokens[i])){
        const op=operations[tokens[i++]],left=expr,right=next();
        expr=(x,y,z)=>Number(op(left(x,y,z),right(x,y,z)));
      }
      return expr;
    }
    const relational=()=>compare(sum,relations);
    const equal=()=>compare(relational,equality);
    function and(){
      let expr=equal();
      while(tokens[i]==='&&'){i++;const left=expr,right=equal();expr=(x,y,z)=>Number(Boolean(left(x,y,z)&&right(x,y,z)));}
      return expr;
    }
    function conditional(){
      let test=and();
      while(tokens[i]==='||'){i++;const left=test,right=and();test=(x,y,z)=>Number(Boolean(left(x,y,z)||right(x,y,z)));}
      if(tokens[i]!=='?') return test;
      i++;const yes=conditional();
      if(tokens[i++]!==':') throw Error('Add a colon and a false value after the question mark.');
      const no=conditional();return (x,y,z)=>test(x,y,z)?yes(x,y,z):no(x,y,z);
    }
    const result = conditional();
    if (i !== tokens.length) throw Error('Check the expression near “' + tokens[i] + '”.');
    return result;
  }
  function compileImplicit(source) {
    // Only a single, top-level equals sign separates the sides. Comparisons
    // inside a piecewise expression belong to the ordinary expression parser.
    let depth=0,split=-1;
    for(let i=0;i<source.length;i++){
      const c=source[i];
      if(c==='(')depth++;
      else if(c===')')depth--;
      else if(c==='='&&depth===0&&source[i+1]!=='='&&!/[<>=!]/.test(source[i-1]||' ')){
        if(split>=0)throw Error('Enter one equation, with a single = between its two sides.');
        split=i;
      }
    }
    const vars=['x','y','z'];
    if(split<0){
      if(/[<>=!]/.test(source)&&!/[?:]|\b(?:if|piecewise)\s*\(/i.test(source))
        throw Error('Use a single = for an implicit equation, or enter an expression equal to zero.');
      return compile(source,vars);
    }
    const left=compile(source.slice(0,split),vars),right=compile(source.slice(split+1),vars);
    return (x,y,z)=>left(x,y,z)-right(x,y,z);
  }
  function compileParametric(source) {
    if(source.length>24576) throw Error('Use up to 24576 characters for a parametric surface.');
    const parameters=['u','v'], locals=Object.create(null), steps=[];
    let expression=source.trim();
    // Leading assignments give long formulas readable names. Evaluate each once per sample.
    const assignment=/^([a-z][a-z0-9]*)\s*=\s*([^;\n]+)(?:;|\n)\s*/i;
    let match;
    while((match=expression.match(assignment))){
      const name=match[1].toLowerCase();
      if(['u','v','uv','pi','e','if','piecewise'].includes(name)||Object.hasOwn(functions,name)||Object.hasOwn(locals,name))
        throw Error('Choose a different name for “'+name+'”.');
      const evaluate=compile(match[2],parameters,locals);
      steps.push({name,evaluate});locals[name]=0;
      expression=expression.slice(match[0].length).trim();
    }
    expression=expression.replace(/^r\s*\(\s*u\s*,\s*v\s*\)\s*=\s*/i,'').trim();
    if(!expression.startsWith('(')||!expression.endsWith(')'))
      throw Error('Enter three coordinates as (x, y, z), using u and v.');
    const tuple=expression.slice(1,-1),parts=[];
    let start=0,depth=0;
    for(let i=0;i<tuple.length;i++){
      if(tuple[i]==='(') depth++;
      if(tuple[i]===')' && --depth<0) throw Error('Check the coordinate parentheses.');
      if(tuple[i]===',' && depth===0){parts.push(tuple.slice(start,i));start=i+1;}
    }
    parts.push(tuple.slice(start));
    if(depth!==0 || parts.length!==3 || parts.some(s=>!s.trim()))
      throw Error('Enter three coordinates as (x, y, z), using u and v.');
    const coordinates=parts.map((part,k)=>{
      try{return compile(part,parameters,locals);}
      catch(err){throw Error('Coordinate '+['x','y','z'][k]+': '+err.message);}
    });
    return (u,v)=>{
      for(const step of steps) locals[step.name]=step.evaluate(u,v);
      return coordinates.map(evaluate=>evaluate(u,v));
    };
  }
  const presets = [];
  function add(id,name,category,formula,domain,color,relief=42,shape=null) {
    presets.push({id,name,category,formula,domain,color,relief,shape});
  }
  add('saddle','Hyperbolic paraboloid','Classics','(x^2 - y^2) / 2',[-2,2,-2,2],'#ab82ff',58);
  add('ripple','Radial ripple','Waveforms','sinc(3 * sqrt(x^2 + y^2))',[-3,3,-3,3],'#57d5c7',35);
  const tau=2*Math.PI;
  add('torus','Torus','Parametric','major = 2\nminor = 0.72\n((major + minor*cos(v))*cos(u), (major + minor*cos(v))*sin(u), minor*sin(v))',[0,tau,0,tau],'#f4ae77',30,'torus');
  add('peaks','Peaks','Landscapes','3*(1-x)^2*exp(-x^2-(y+1)^2) - 10*(x/5-x^3-y^5)*exp(-x^2-y^2) - exp(-(x+1)^2-y^2)/3',[-3,3,-3,3],'#7da9ff',55);
  add('catenoid','Catenoid','Parametric','(cosh(v)*cos(u), cosh(v)*sin(u), v)',[0,tau,-1.25,1.25],'#f38fc0',80,'catenoid');
  add('gaussian','Gaussian bell','Classics','exp(-(x^2 + y^2))',[-2,2,-2,2],'#60cfaa',48);
  add('monkey','Monkey saddle','Classics','x^3 - 3*x*y^2',[-1,1,-1,1],'#d094f5',57);
  add('trefoil','Trefoil knot','Parametric',[
    'radius = 0.34','cx = sin(u) + 2*sin(2*u)','cy = cos(u) - 2*cos(2*u)','cz = -sin(3*u)',
    'dx = cos(u) + 4*cos(2*u)','dy = -sin(u) + 4*sin(2*u)','dz = -3*cos(3*u)',
    'h = hypot(dx,dy)','length = hypot(h,dz)','a = radius*cos(v)','b = radius*sin(v)/length',
    '(cx + (a*dy - b*dx*dz)/h, cy - (a*dx + b*dy*dz)/h, cz + b*h)'
  ].join('\n'),[0,tau,0,tau],'#ef9c85',44,'trefoil');
  add('eggcrate','Eggcrate','Waveforms','sin(x)^2 + sin(y)^2',[-4,4,-4,4],'#7ab4ef',25);
  add('paraboloid','Elliptic paraboloid','Classics','x^2 + y^2',[-2,2,-2,2],'#89c9a8',50);
  add('plane','Inclined plane','Classics','0.4*x + 0.2*y',[-2,2,-2,2],'#96a6df',32);
  add('twowave','Interference waves','Waveforms','sin(x + y) + cos(2*x - y)',[-3,3,-3,3],'#cf88bc',29);
  add('rosenbrock','Rosenbrock valley','Optimization','(1-x)^2 + 100*(y-x^2)^2',[-1.5,1.5,-0.5,2],'#f6b275',52);
  add('rastrigin','Rastrigin','Optimization','20+x^2+y^2-10*(cos(2*pi*x)+cos(2*pi*y))',[-2,2,-2,2],'#76c9cd',33);
  add('ackley','Ackley','Optimization','-20*exp(-0.2*sqrt((x^2+y^2)/2))-exp((cos(2*pi*x)+cos(2*pi*y))/2)+e+20',[-3,3,-3,3],'#9c92ef',40);
  add('himmelblau','Himmelblau','Optimization','(x^2+y-11)^2 + (x+y^2-7)^2',[-5,5,-5,5],'#e58aa1',55);
  add('booth','Booth','Optimization','(x+2*y-7)^2 + (2*x+y-5)^2',[-5,5,-5,5],'#88bd8e',48);
  add('klein','Klein bottle','Parametric',[
    'radius = 4*(1-cos(u)/2)','first = u >= 0 && u < pi',
    'cx = 6*cos(u)*(1+sin(u))','cy = 16*sin(u)',
    '(cx + if(first, radius*cos(u)*cos(v), radius*cos(v+pi)), cy + if(first, radius*sin(u)*cos(v), 0), radius*sin(v))'
  ].join('\n'),[0,tau,0,tau],'#79baca',40,'parametric');
  add('sphere','Sphere','Implicit','x^2 + y^2 + z^2 = 1',[-1.2,1.2,-1.2,1.2,-1.2,1.2],'#7da9ff',100,'implicit');
  add('gyroid','Gyroid','Implicit','sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x) = 0',[-Math.PI,Math.PI,-Math.PI,Math.PI,-Math.PI,Math.PI],'#57d5c7',100,'implicit');
  add('hyperboloid','One-sheet hyperboloid','Implicit','x^2 + y^2 - z^2 = 1',[-2,2,-2,2,-1.5,1.5],'#f38fc0',100,'implicit');
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit = v => { const l=Math.hypot(...v); return v.map(k=>k/l); };
  return {compile,compileImplicit,compileParametric,presets,cross,unit};
})();
