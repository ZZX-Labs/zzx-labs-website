(() => {
  "use strict";

  function intervals(blocks) {
    const sorted=[...blocks].sort((a,b)=>a.height-b.height);
    const out=[];
    for(let i=1;i<sorted.length;i++) {
      const seconds=Number(sorted[i].timestamp)-Number(sorted[i-1].timestamp);
      if(Number.isFinite(seconds))out.push({
        fromHeight:sorted[i-1].height,toHeight:sorted[i].height,
        fromTimestamp:sorted[i-1].timestamp,toTimestamp:sorted[i].timestamp,
        seconds
      });
    }
    return out;
  }

  function quantile(sorted,q) {
    if(!sorted.length)return null;
    const pos=(sorted.length-1)*q,base=Math.floor(pos),rest=pos-base;
    return sorted[base+1]!==undefined?sorted[base]+rest*(sorted[base+1]-sorted[base]):sorted[base];
  }

  function stats(values) {
    const a=values.filter(Number.isFinite);
    if(!a.length)return null;
    const sorted=[...a].sort((x,y)=>x-y);
    const mean=a.reduce((s,v)=>s+v,0)/a.length;
    const variance=a.reduce((s,v)=>s+(v-mean)**2,0)/a.length;
    return {
      n:a.length,mean,median:quantile(sorted,.5),stddev:Math.sqrt(variance),
      min:sorted[0],max:sorted.at(-1),p10:quantile(sorted,.1),p25:quantile(sorted,.25),
      p75:quantile(sorted,.75),p90:quantile(sorted,.9),
      below600:a.filter(v=>v<600).length/a.length,
      above600:a.filter(v=>v>600).length/a.length,
      meanDeltaFrom600:mean-600
    };
  }

  function rolling(values,width) {
    const w=Math.max(2,Math.floor(Number(width)||10));
    return values.map((_,i)=>{
      const s=values.slice(Math.max(0,i-w+1),i+1);
      return s.reduce((a,b)=>a+b,0)/s.length;
    });
  }

  async function fetchJson(url) {
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async function fetchText(url) {
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return (await r.text()).trim();
  }

  async function fetchRecentEsplora(base,count) {
    const api=String(base).replace(/\/+$/,"");
    const tip=Number(await fetchText(`${api}/blocks/tip/height`));
    if(!Number.isFinite(tip))throw new Error("Invalid tip height.");
    const need=Math.max(2,Math.floor(count)+1);
    const blocks=[];
    let start=tip;

    while(blocks.length<need && start>=0) {
      const batch=await fetchJson(`${api}/blocks/${start}`);
      if(!Array.isArray(batch)||!batch.length)break;
      for(const b of batch) {
        if(!blocks.some(x=>x.height===b.height))blocks.push({height:Number(b.height),timestamp:Number(b.timestamp),hash:b.id});
      }
      const min=Math.min(...batch.map(b=>Number(b.height)));
      start=min-1;
    }
    return blocks.sort((a,b)=>a.height-b.height).slice(-need);
  }

  window.BitAgeCore=Object.freeze({intervals,stats,rolling,fetchRecentEsplora});
})();
