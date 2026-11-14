// Translate the mathematical subset of Origin's Settings XML into the editable tuple syntax.
const SurfaceOrigin = (() => {
  const id='[a-zA-Z_][a-zA-Z0-9_]*';
  const identifier=new RegExp('^'+id+'$');
  const replaceNames=(text,names)=>text.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g,key=>names.get(key.toLowerCase())??key);

  function translate(script,coordinates,parameters){
    let rest=script.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\r\n]*/g,' ').trim();
    const globals=new Map(), helpers=new Map(), lines=[];
    const head=new RegExp('^function\\s+double\\s+('+id+')\\s*\\(([^()]*)\\)\\s*','i');
    const declaration=new RegExp('^double\\s+('+id+')\\s*=\\s*([^;{}]+);\\s*','i');
    const binding=(expression)=>{const name='local'+(lines.length+1);lines.push(name+' = '+expression.trim().replace(/\s+/g,' '));return name;};
    function take(pattern,error){
      const m=rest.match(pattern);
      if(!m) throw Error(error);
      rest=rest.slice(m[0].length).trimStart();return m;
    }
    function group(){
      if(rest[0]!=='(') throw Error('Expected a condition in parentheses.');
      let depth=1,i=1;
      while(i<rest.length&&depth){if(rest[i]==='(') depth++;if(rest[i]===')') depth--;i++;}
      if(depth) throw Error('Unclosed condition in Origin helper.');
      const expr=rest.slice(1,i-1);rest=rest.slice(i).trimStart();return expr;
    }
    function returned(depth=0){
      if(depth>24) throw Error('Origin helper branches are too deeply nested.');
      if(rest.startsWith('{')){
        rest=rest.slice(1).trimStart();const expr=returned(depth+1);
        take(/^\}/,'Expected a closing brace after the return.');return expr;
      }
      if(/^if\b/i.test(rest)){
        take(/^if\b/i);const test=group(),yes=returned(depth+1);
        // A return following an if-return is its implicit else branch.
        if(/^else\b/i.test(rest))take(/^else\b/i);
        return 'if('+test+', '+yes+', '+returned(depth+1)+')';
      }
      return take(/^return\s+([^;{}]+);/i,'Expected return or if/else in the Origin helper.')[1];
    }
    while(rest){
      if(head.test(rest)){
        const [,name,args]=take(head),key=name.toLowerCase();
        if(helpers.has(key)) throw Error('Duplicate Origin helper '+name+'.');
        const params=args.trim()?args.split(',').map(a=>a.trim().replace(/^double\s+/i,'').toLowerCase()):[];
        if(!params.every(p=>identifier.test(p))||new Set(params).size!==params.length) throw Error('Invalid helper parameters in '+name+'.');
        take(/^\{/,'Expected an Origin function body.');
        const locals=[];
        while(declaration.test(rest)){const [,n,expr]=take(declaration);locals.push([n.toLowerCase(),expr]);}
        const result=returned();
        take(/^\}\s*;?/,'Unsupported statement after return in '+name+'.');
        helpers.set(key,{params,locals,result});
      }else{
        const [,key,expr]=take(declaration,'Unsupported Origin script. Use numeric double declarations and functions with return or if/else.');
        globals.set(key.toLowerCase(),binding(replaceNames(expr,globals)));
      }
    }
    const names=new Map(globals);
    parameters.forEach((p,i)=>names.set(p.toLowerCase(),['u','v'][i]));
    const tuple=coordinates.map(expression=>{
      const call=expression.match(/^([a-z_][\w]*)\s*\(([\s\S]*)\)$/i);
      const helper=call&&helpers.get(call[1].toLowerCase());
      if(!helper) return replaceNames(expression,names);
      const args=[];let depth=0,start=0;
      for(let i=0;i<call[2].length;i++){
        const c=call[2][i];
        if(c==='(')depth++;if(c===')')depth--;
        if(c===','&&!depth){args.push(call[2].slice(start,i));start=i+1;}
      }
      if(call[2].trim()) args.push(call[2].slice(start));
      if(args.length!==helper.params.length) throw Error('Wrong number of arguments to '+call[1]+'.');
      const scope=new Map(globals);
      helper.params.forEach((p,i)=>scope.set(p,'('+replaceNames(args[i],names)+')'));
      for(const [key,expr] of helper.locals)scope.set(key,binding(replaceNames(expr,scope)));
      return replaceNames(helper.result,scope);
    });
    return [...lines,'('+tuple.join(',\n ')+')'].join('\n');
  }

  function parse(xml,filename){
    if(xml.length>262144) throw Error('Choose a definition smaller than 256 KiB.');
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Document types and custom entities are unsupported.');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length || doc.documentElement.localName!=='Settings')
      throw Error('Expected an Origin 3D parametric Settings XML document.');
    const fields=new Map();
    for(const node of doc.documentElement.children){
      const key=node.getAttribute('Label');
      if(!key)continue;
      if(fields.has(key))throw Error('Duplicate XML field '+key+'.');
      fields.set(key,node.textContent.trim());
    }
    const required=key=>{const s=fields.get(key);if(!s)throw Error('Missing Origin field '+key+'.');return s;};
    const parameters=['str1stParam','str2ndParam'].map(required);
    if(!parameters.every(s=>identifier.test(s))||parameters[0].toLowerCase()===parameters[1].toLowerCase())
      throw Error('Expected two distinct parameter names.');
    const domain=['str1stFrom','str1stTo','str2ndFrom','str2ndTo'].map(key=>SurfaceMath.compile(required(key),[])(0,0));
    if(!domain.every(Number.isFinite)||domain[0]>=domain[1]||domain[2]>=domain[3])throw Error('Invalid Origin parameter limits.');
    const samples=['nCols','nRows'].map(key=>Number(required(key)));
    if(!samples.every(n=>Number.isInteger(n)&&n>=5&&n<=257)) throw Error('Use 5 to 257 samples per axis in the Origin definition.');
    const formula=translate(fields.get('strPrescript')||'',['str1stFormula','str2ndFormula','str3rdFormula'].map(required),parameters);
    SurfaceMath.compileParametric(formula);
    const name=filename.replace(/\.(?:ofp|xml)$/i,'').replace(/^\d+-ParamFunc3D-/i,'').replace(/_/g,' ')||'Imported surface';
    return {id:'imported',name,shape:'parametric',domain,formula,grid:samples.map(n=>n-1),color:'#79baca',relief:40};
  }
  return {parse};
})();
