/* The expression compiler and surface library are also used by the mesh checks. */
const SurfaceMath = (() => {
  const functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    log: Math.log, ln: Math.log, log10: Math.log10, floor: Math.floor, ceil: Math.ceil,
    sinc: x => Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x,
    min: Math.min, max: Math.max, atan2: Math.atan2, hypot: Math.hypot, pow: Math.pow
  };
  function compile(source) {
    const clean = source.trim().replace(/^z\s*=\s*/i, '').toLowerCase()
      .replaceAll('π','pi').replaceAll('²','^2').replaceAll('³','^3').replaceAll('−','-')
      .replaceAll('×','*').replaceAll('÷','/').replaceAll('**','^');
    if (!clean || clean.length > 650) throw Error('Enter an expression of up to 650 characters.');
    const tokens = clean.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[a-z][a-z0-9]*|[^\s]/g) || [];
    let i = 0;
    function atom() {
      const t = tokens[i++];
      if (t === '(') {
        const expr = sum();
        if (tokens[i++] !== ')') throw Error('Add a closing parenthesis.');
        return expr;
      }
      if (t === 'x') return x => x;
      if (t === 'y') return (x,y) => y;
      if (t === 'xy') return (x,y) => x*y;
      if (t === 'pi' || t === 'e') return () => t === 'pi' ? Math.PI : Math.E;
      if (t && /^\d|^\./.test(t) && Number.isFinite(Number(t))) return () => Number(t);
      if (Object.hasOwn(functions,t)) {
        if (tokens[i++] !== '(') throw Error('Use parentheses around function arguments.');
        const first = sum();
        let second;
        if (tokens[i] === ',') { i++; second = sum(); }
        if (tokens[i++] !== ')') throw Error('Check the function parentheses.');
        const binary = ['min','max','atan2','hypot','pow'].includes(t);
        if (binary !== Boolean(second)) throw Error(t + ' takes ' + (binary ? 'two arguments.' : 'one argument.'));
        return second ? (x,y) => functions[t](first(x,y),second(x,y)) : (x,y) => functions[t](first(x,y));
      }
      throw Error(t ? 'Unrecognized term “' + t + '”.' : 'The expression is incomplete.');
    }
    function power() {
      const a = atom();
      if (tokens[i] !== '^') return a;
      i++; const b = unary(); return (x,y) => a(x,y) ** b(x,y);
    }
    function unary() {
      if (tokens[i] === '-') { i++; const a = unary(); return (x,y) => -a(x,y); }
      if (tokens[i] === '+') { i++; return unary(); }
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
        expr = t === '/' ? (x,y) => left(x,y)/right(x,y) : (x,y) => left(x,y)*right(x,y);
      }
      return expr;
    }
    function sum() {
      let expr = product();
      while (tokens[i] === '+' || tokens[i] === '-') {
        const t = tokens[i++], left = expr, right = product();
        expr = t === '+' ? (x,y) => left(x,y)+right(x,y) : (x,y) => left(x,y)-right(x,y);
      }
      return expr;
    }
    const result = sum();
    if (i !== tokens.length) throw Error('Check the expression near “' + tokens[i] + '”.');
    return result;
  }
  const presets = [];
  function add(id,name,category,formula,domain,color,relief=42,shape=null) {
    presets.push({id,name,category,formula,domain,color,relief,shape});
  }
  add('saddle','Hyperbolic paraboloid','Classics','(x^2 - y^2) / 2',[-2,2,-2,2],'#ab82ff',58);
  add('ripple','Radial ripple','Waveforms','sinc(3 * sqrt(x^2 + y^2))',[-3,3,-3,3],'#57d5c7',35);
  add('torus','Torus','Parametric','((R + r cos v) cos u, (R + r cos v) sin u, r sin v)',null,'#f4ae77',30,'torus');
  add('peaks','Peaks','Landscapes','3*(1-x)^2*exp(-x^2-(y+1)^2) - 10*(x/5-x^3-y^5)*exp(-x^2-y^2) - exp(-(x+1)^2-y^2)/3',[-3,3,-3,3],'#7da9ff',55);
  add('catenoid','Catenoid','Parametric','(cosh(v) cos(u), cosh(v) sin(u), v)',null,'#f38fc0',80,'catenoid');
  add('gaussian','Gaussian bell','Classics','exp(-(x^2 + y^2))',[-2,2,-2,2],'#60cfaa',48);
  add('monkey','Monkey saddle','Classics','x^3 - 3*x*y^2',[-1,1,-1,1],'#d094f5',57);
  add('trefoil','Trefoil knot','Parametric','C(u) = (sin u + 2 sin(2u), cos u - 2 cos(2u), -sin(3u))',null,'#ef9c85',44,'trefoil');
  add('eggcrate','Eggcrate','Waveforms','sin(x)^2 + sin(y)^2',[-4,4,-4,4],'#7ab4ef',25);
  add('paraboloid','Elliptic paraboloid','Classics','x^2 + y^2',[-2,2,-2,2],'#89c9a8',50);
  add('plane','Inclined plane','Classics','0.4*x + 0.2*y',[-2,2,-2,2],'#96a6df',32);
  add('twowave','Interference waves','Waveforms','sin(x + y) + cos(2*x - y)',[-3,3,-3,3],'#cf88bc',29);
  add('rosenbrock','Rosenbrock valley','Optimization','(1-x)^2 + 100*(y-x^2)^2',[-1.5,1.5,-0.5,2],'#f6b275',52);
  add('rastrigin','Rastrigin','Optimization','20+x^2+y^2-10*(cos(2*pi*x)+cos(2*pi*y))',[-2,2,-2,2],'#76c9cd',33);
  add('ackley','Ackley','Optimization','-20*exp(-0.2*sqrt((x^2+y^2)/2))-exp((cos(2*pi*x)+cos(2*pi*y))/2)+e+20',[-3,3,-3,3],'#9c92ef',40);
  add('himmelblau','Himmelblau','Optimization','(x^2+y-11)^2 + (x+y^2-7)^2',[-5,5,-5,5],'#e58aa1',55);
  add('booth','Booth','Optimization','(x+2*y-7)^2 + (2*x+y-5)^2',[-5,5,-5,5],'#88bd8e',48);
  const tau = 2*Math.PI;
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit = v => { const l=Math.hypot(...v); return v.map(k=>k/l); };
  function parametric(shape,s,t) {
    const u=tau*s, v=tau*t, cu=Math.cos(u), su=Math.sin(u);
    if(shape === 'torus') {
      const r=2+0.72*Math.cos(v); return [r*cu,r*su,0.72*Math.sin(v)];
    }
    if(shape === 'catenoid') {
      const z=(t*2-1)*1.25, r=Math.cosh(z); return [r*cu,r*su,z];
    }
    const center=[su+2*Math.sin(2*u),cu-2*Math.cos(2*u),-Math.sin(3*u)];
    const tangent=unit([cu+4*Math.cos(2*u),-su+4*Math.sin(2*u),-3*Math.cos(3*u)]);
    const n=unit(cross(tangent,[0,0,1])), b=cross(n,tangent);
    return center.map((p,k)=>p+0.34*(n[k]*Math.cos(v)+b[k]*Math.sin(v)));
  }
  return {compile,presets,cross,unit,parametric};
})();
