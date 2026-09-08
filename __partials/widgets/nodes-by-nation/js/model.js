(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByNationModel?.__version>=1)return;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(value){
    return String(value??"").trim();
  }

  function displayName(code){
    const iso=clean(code).toUpperCase();
    if(!/^[A-Z]{2}$/.test(iso))return clean(code)||"Unknown";

    try{
      if(typeof Intl?.DisplayNames==="function"){
        const names=new Intl.DisplayNames(undefined,{type:"region"});
        const label=names.of(iso);
        if(label&&label!==iso)return label;
      }
    }catch(_){}

    return iso;
  }

  function fromMap(snapshot){
    const map=snapshot?.byNation;
    if(!map||typeof map!=="object"||Array.isArray(map))return [];

    return Object.entries(map)
      .map(([code,count])=>({
        code:clean(code).toUpperCase(),
        name:displayName(code),
        nodes:finite(count)
      }))
      .filter(row=>Number.isFinite(row.nodes)&&row.nodes>0);
  }

  function fromNodes(snapshot){
    const counts=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const code=clean(
        node?.country ??
        node?.countryCode ??
        node?.country_code
      ).toUpperCase();

      if(!/^[A-Z]{2}$/.test(code))continue;
      counts.set(code,(counts.get(code)||0)+1);
    }

    return [...counts.entries()].map(([code,nodes])=>({
      code,
      name:displayName(code),
      nodes
    }));
  }

  function build(snapshot){
    let rows=fromMap(snapshot);
    if(!rows.length)rows=fromNodes(snapshot);

    const merged=new Map();

    for(const row of rows){
      const code=clean(row.code).toUpperCase();
      if(!code)continue;

      const key=code;
      const current=merged.get(key)||{
        code,
        name:row.name||displayName(code),
        nodes:0
      };

      current.nodes+=Number(row.nodes)||0;
      merged.set(key,current);
    }

    rows=[...merged.values()]
      .filter(row=>row.nodes>0)
      .sort((a,b)=>b.nodes-a.nodes||a.code.localeCompare(b.code));

    const geolocatedTotal=rows.reduce((sum,row)=>sum+row.nodes,0);
    const reachable=finite(snapshot?.reachableNodes??snapshot?.totalNodes);
    const decoded=finite(snapshot?.nodeCount);

    const denominator=
      Number.isFinite(reachable)&&reachable>0
        ? reachable
        : Number.isFinite(decoded)&&decoded>0
          ? decoded
          : geolocatedTotal;

    for(const row of rows){
      row.share=
        Number.isFinite(denominator)&&denominator>0
          ? row.nodes/denominator
          : NaN;
      row.geoShare=
        geolocatedTotal>0
          ? row.nodes/geolocatedTotal
          : NaN;
    }

    const coverage=
      Number.isFinite(denominator)&&denominator>0
        ? Math.min(1,geolocatedTotal/denominator)
        : NaN;

    const unidentified=
      Number.isFinite(denominator)&&denominator>0
        ? Math.max(0,denominator-geolocatedTotal)
        : NaN;

    return Object.freeze({
      schema:"zzx-nodes-by-nation-model-v1",
      rows:Object.freeze(rows.map(Object.freeze)),
      nationCount:rows.length,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      top:rows[0]||null
    });
  }

  W.ZZXNodesByNationModel=Object.freeze({
    __version:1,
    displayName,
    build
  });
})();
