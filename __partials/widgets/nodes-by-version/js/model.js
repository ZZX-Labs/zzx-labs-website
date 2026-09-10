(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByVersionModel?.__version>=2)return;

  function finite(value){const n=Number(value);return Number.isFinite(n)?n:NaN;}
  function text(value){return String(value??"").trim();}

  function countryMeta(code,name="",flag=""){
    if(W.ZZXBitnodes?.countryMeta)return W.ZZXBitnodes.countryMeta(code,name,flag);
    const iso=text(code).toUpperCase();const valid=/^[A-Z]{2}$/.test(iso);
    let n=valid?iso:"Unlocated";try{if(valid&&typeof Intl?.DisplayNames==="function")n=new Intl.DisplayNames(["en"],{type:"region"}).of(iso)||iso;}catch(_){}
    const glyph=valid?String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0))):"🏴";
    return {code:valid?iso:"--",name:valid?(text(name)||n):"Unlocated",flag:valid?(text(flag)||glyph):"🏴",located:valid,label:valid?`${text(flag)||glyph} ${text(name)||n} · ${iso}`:`🏴 Unlocated · --`};
  }

  function family(userAgent){
    const ua=text(userAgent);const lower=ua.toLowerCase();
    if(!ua)return "Unknown";
    if(lower.includes("knots"))return "Bitcoin Knots";
    if(lower.includes("satoshi"))return "Bitcoin Core";
    if(lower.includes("btcd"))return "btcd";
    if(lower.includes("bcoin"))return "bcoin";
    if(lower.includes("libbitcoin"))return "libbitcoin";
    if(lower.includes("bitcoinj"))return "bitcoinj";
    if(lower.includes("nakamoto"))return "Nakamoto";
    return "Other";
  }

  function version(userAgent){
    const ua=text(userAgent);if(!ua)return "Unknown";
    const slashMatch=ua.match(/\/([^:\/]+):([^\/]+)\//);
    if(slashMatch)return text(slashMatch[2])||"Unknown";
    const generic=ua.match(/(?:^|[\s/])v?(\d+(?:\.\d+){1,4}(?:[-+._a-z0-9]*)?)/i);
    return generic?text(generic[1]):"Unknown";
  }

  function globalAgentRows(snapshot){
    const byVersion=snapshot?.byVersion;
    if(byVersion&&typeof byVersion==="object"&&!Array.isArray(byVersion)){
      return Object.entries(byVersion).map(([userAgent,count])=>({userAgent:text(userAgent)||"Unknown",count:finite(count)})).filter(row=>Number.isFinite(row.count)&&row.count>0);
    }
    const counts=new Map();
    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){const ua=text(node?.userAgent)||"Unknown";counts.set(ua,(counts.get(ua)||0)+1);}
    return [...counts.entries()].map(([userAgent,count])=>({userAgent,count}));
  }

  function nationAgentRows(snapshot,agentRows){
    const nodes=Array.isArray(snapshot?.nodes)?snapshot.nodes:[];
    if(nodes.length){
      const rows=new Map();
      for(const node of nodes){
        const ua=text(node?.userAgent)||"Unknown";const c=countryMeta(node?.country,node?.countryName,node?.countryFlag);
        const key=`${ua}\u0000${c.code}`;
        const current=rows.get(key)||{userAgent:ua,family:family(ua),version:version(ua),country:c.code,countryName:c.name,flag:c.flag,nationLabel:c.label,located:c.located,count:0};
        current.count+=1;rows.set(key,current);
      }
      return [...rows.values()];
    }
    return agentRows.map(row=>{const c=countryMeta("");return {userAgent:row.userAgent,family:family(row.userAgent),version:version(row.userAgent),country:c.code,countryName:c.name,flag:c.flag,nationLabel:c.label,located:false,count:row.count};});
  }

  function build(snapshot){
    const agents=globalAgentRows(snapshot);
    const totalObserved=agents.reduce((sum,row)=>sum+row.count,0);
    const reachable=finite(snapshot?.reachableNodes??snapshot?.totalNodes);const decoded=finite(snapshot?.nodeCount);
    const denominator=totalObserved>0?totalObserved:Number.isFinite(decoded)&&decoded>0?decoded:NaN;
    const families=new Map();

    for(const row of agents){
      row.family=family(row.userAgent);row.version=version(row.userAgent);row.share=denominator>0?row.count/denominator:NaN;
      const current=families.get(row.family)||{family:row.family,count:0,agents:0,versions:new Set()};
      current.count+=row.count;current.agents+=1;if(row.version!=="Unknown")current.versions.add(row.version);families.set(row.family,current);
    }
    agents.sort((a,b)=>b.count-a.count||a.family.localeCompare(b.family)||a.userAgent.localeCompare(b.userAgent));

    const rows=nationAgentRows(snapshot,agents);
    for(const row of rows){row.share=denominator>0?row.count/denominator:NaN;}
    rows.sort((a,b)=>b.count-a.count||a.family.localeCompare(b.family)||a.countryName.localeCompare(b.countryName)||a.userAgent.localeCompare(b.userAgent));

    const familyRows=[...families.values()].map(row=>({family:row.family,count:row.count,agents:row.agents,versions:[...row.versions].sort(),share:denominator>0?row.count/denominator:NaN})).sort((a,b)=>b.count-a.count||a.family.localeCompare(b.family));
    const familyCount=name=>familyRows.find(row=>row.family===name)?.count||0;
    const core=familyCount("Bitcoin Core"),knots=familyCount("Bitcoin Knots"),other=Math.max(0,totalObserved-core-knots);
    const coverage=Number.isFinite(reachable)&&reachable>0?Math.min(1,totalObserved/reachable):Number.isFinite(decoded)&&decoded>0?Math.min(1,totalObserved/decoded):NaN;
    const locatedObserved=rows.filter(row=>row.located).reduce((sum,row)=>sum+row.count,0);

    return Object.freeze({
      schema:"zzx-nodes-by-version-model-v2",
      rows:Object.freeze(rows.map(Object.freeze)),
      agents:Object.freeze(agents.map(Object.freeze)),
      families:Object.freeze(familyRows.map(Object.freeze)),
      totalObserved,
      locatedObserved,
      unlocatedObserved:Math.max(0,totalObserved-locatedObserved),
      distinctAgents:agents.length,
      rowCount:rows.length,
      distinctFamilies:familyRows.length,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      core,knots,other,
      coreShare:totalObserved>0?core/totalObserved:null,
      knotsShare:totalObserved>0?knots/totalObserved:null,
      otherShare:totalObserved>0?other/totalObserved:null,
      geographySource:snapshot?.geography?.source||null,
      topAgent:agents[0]||null,
      topFamily:familyRows[0]||null
    });
  }

  W.ZZXNodesByVersionModel=Object.freeze({__version:2,family,version,countryMeta,build});
})();
