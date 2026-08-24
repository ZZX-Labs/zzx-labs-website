(() => {
  "use strict";
  const boolKeys=new Set(["rpcserver","txindex","listen","blocksonly","server","daemon","discover","dnsseed","listenonion"]);
  const intKeys=new Set(["prune","dbcache","maxconnections","rpcworkqueue","rpcthreads","maxmempool"]);

  function parse(text) {
    const rows=[],errors=[];
    String(text).replace(/\r/g,"").split("\n").forEach((line,i)=>{
      const raw=line,trim=line.trim();
      if(!trim||trim.startsWith("#")||trim.startsWith(";"))return;
      if(trim.startsWith("[")&&trim.endsWith("]")){rows.push({type:"section",section:trim.slice(1,-1).trim(),line:i+1,raw});return;}
      const eq=trim.indexOf("=");if(eq<1){errors.push({line:i+1,message:"Expected key=value",raw});return;}
      const key=trim.slice(0,eq).trim(),value=trim.slice(eq+1).trim();
      rows.push({type:"option",key,value,line:i+1,raw});
    });
    return {rows,errors};
  }

  function validate(text) {
    const p=parse(text),issues=[...p.errors.map(e=>({level:"error",...e}))],seen=new Map();
    for(const row of p.rows.filter(x=>x.type==="option")) {
      const key=row.key.toLowerCase();
      if(seen.has(key))issues.push({level:"warn",line:row.line,message:`Duplicate option ${row.key}; later values may override earlier ones.`});
      seen.set(key,row);
      if(boolKeys.has(key)&&!["0","1"].includes(row.value))issues.push({level:"error",line:row.line,message:`${row.key} expects 0 or 1.`});
      if(intKeys.has(key)&&(!/^-?\d+$/.test(row.value)||Number(row.value)<0))issues.push({level:"error",line:row.line,message:`${row.key} expects a non-negative integer.`});
      if(key==="prune"&&Number(row.value)>0&&Number(row.value)<550)issues.push({level:"warn",line:row.line,message:"Very small prune target; verify against your Core/Knots version."});
      if(key==="proxy"&&row.value&&!/^[^:\s]+:\d+$/.test(row.value))issues.push({level:"warn",line:row.line,message:"Proxy usually uses host:port syntax."});
    }
    const networkKeys=["testnet","testnet4","signet","regtest"].filter(k=>seen.get(k)?.value==="1");
    if(networkKeys.length>1)issues.push({level:"error",message:`Conflicting networks enabled: ${networkKeys.join(", ")}`});
    if(seen.get("blocksonly")?.value==="1"&&seen.get("txindex")?.value==="1")issues.push({level:"warn",message:"blocksonly=1 with txindex=1 may be intentional, but verify your intended node role."});
    return {valid:!issues.some(x=>x.level==="error"),issues,options:p.rows.filter(x=>x.type==="option").length};
  }

  function diff(a,b) {
    const pa=parse(a).rows.filter(x=>x.type==="option"),pb=parse(b).rows.filter(x=>x.type==="option");
    const ma=new Map(pa.map(x=>[x.key,x.value])),mb=new Map(pb.map(x=>[x.key,x.value]));
    const keys=[...new Set([...ma.keys(),...mb.keys()])].sort();
    return keys.flatMap(k=>{
      if(!ma.has(k))return[{type:"added",key:k,newValue:mb.get(k)}];
      if(!mb.has(k))return[{type:"removed",key:k,oldValue:ma.get(k)}];
      if(ma.get(k)!==mb.get(k))return[{type:"changed",key:k,oldValue:ma.get(k),newValue:mb.get(k)}];
      return[];
    });
  }

  window.BitFigCore=Object.freeze({parse,validate,diff});
})();
