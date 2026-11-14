// Translate the mathematical subset of Origin's Settings XML into the editable tuple syntax.
const SurfaceOrigin = (() => {
  const id='[a-zA-Z_][a-zA-Z0-9_]*';
  const identifier=new RegExp('^'+id+'$');

  function translate(script,coordinates,parameters){
    let rest=script.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\r\n]*/g,' ').trim();
    const globals=new Map(), declarations=[], helpers=new Map(), lines=[], bindings=new Map();
    const head=new RegExp('^function\\s+double\\s+('+id+')\\s*\\(([^()]*)\\)\\s*','i');
    const declaration=new RegExp('^double\\s+('+id+')\\s*=\\s*([^;{}]+);\\s*','i');
    let length=0;
    function binding(expression){
      const value=expression.trim().replace(/\s+/g,' ');
      if(bindings.has(value))return bindings.get(value);
      const name='local'+(lines.length+1),line=name+' = '+value;
      length+=line.length+1;
      if(length>24576)throw Error('Translated Origin expressions exceed the editor length limit.');
      lines.push(line);bindings.set(value,name);return name;
    }
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
        declarations.push([key.toLowerCase(),expr]);
      }
    }
    const calls=new Map();
    function expand(expression,names,active=[]){
      const words=/\b[a-z_][a-z0-9_]*\b/gi;
      let output='',end=0,word;
      while((word=words.exec(expression))){
        const key=word[0].toLowerCase(),helper=helpers.get(key);
        output+=expression.slice(end,word.index);end=words.lastIndex;
        const opening=helper&&/^\s*\(/.exec(expression.slice(end));
        if(!opening){output+=names.get(key)??word[0];continue;}
        let start=end+opening[0].length,depth=1,i=start;
        const args=[];
        for(;i<expression.length;i++){
          const ch=expression[i];
          if(ch==='(')depth++;
          if(ch===')'&&--depth===0)break;
          if(ch===','&&depth===1){args.push(expression.slice(start,i));start=i+1;}
        }
        if(depth)throw Error('Unclosed call to '+key+'.');
        if(args.length||expression.slice(start,i).trim())args.push(expression.slice(start,i));
        if(args.length!==helper.params.length||args.some(a=>!a.trim()))throw Error('Wrong arguments to '+key+'.');
        if(active.includes(key))throw Error('Recursive Origin helper '+key+' is unsupported.');
        const actual=args.map(arg=>expand(arg.trim(),names,active));
        const call=JSON.stringify([key,...actual]);
        if(!calls.has(call)){
          const scope=new Map(globals),stack=[...active,key];
          helper.params.forEach((param,k)=>scope.set(param,identifier.test(actual[k])?actual[k]:binding(actual[k])));
          for(const [local,expr] of helper.locals)scope.set(local,binding(expand(expr,scope,stack)));
          calls.set(call,binding(expand(helper.result,scope,stack)));
        }
        output+=calls.get(call);end=words.lastIndex=i+1;
      }
      return output+expression.slice(end);
    }
    for(const [key,expr] of declarations)globals.set(key,binding(expand(expr,globals)));
    const names=new Map(globals);
    parameters.forEach((p,i)=>names.set(p.toLowerCase(),['u','v'][i]));
    const tuple=coordinates.map(expression=>expand(expression,names));
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
    SurfaceGeometry.validateGrid(samples[0]-1,samples[1]-1);
    const formula=translate(fields.get('strPrescript')||'',['str1stFormula','str2ndFormula','str3rdFormula'].map(required),parameters);
    SurfaceMath.compileParametric(formula);
    const name=filename.replace(/\.(?:ofp|xml)$/i,'').replace(/^\d+-ParamFunc3D-/i,'').replace(/_/g,' ')||'Imported surface';
    return {id:'imported',name,shape:'parametric',domain,formula,grid:samples.map(n=>n-1),color:'#79baca',relief:40};
  }
  return {parse};
})();
