(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByCityModel?.__version>=1)return;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(value){
    return String(value??"").trim();
  }

  function displayCountry(code){
    const iso=clean(code).toUpperCase();
    if(!/^[A-Z]{2}$/.test(iso))return iso;

    try{
      if(typeof Intl?.DisplayNames==="function"){
        const names=new Intl.DisplayNames(undefined,{type:"region"});
        return names.of(iso)||iso;
      }
    }catch(_){}

    return iso;
  }

  function makeLabel(city,country){
    const c=clean(city);
    const iso=clean(country).toUpperCase();
    return [c,iso].filter(Boolean).join(", ")||"Unknown";
  }

  function fromNodes(snapshot){
    const map=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const city=clean(node?.city);
      const country=clean(node?.country).toUpperCase();

      if(!city)continue;

      const key=`${city.toLowerCase()}|${country}`;
      const row=map.get(key)||{
        city,
        country,
        countryName:displayCountry(country),
        label:makeLabel(city,country),
        nodes:0
      };

      row.nodes+=1;
      map.set(key,row);
    }

    return [...map.values()];
  }

  function fromMap(snapshot){
    const source=snapshot?.byCity;
    if(!source||typeof source!=="object"||Array.isArray(source))return [];

    return Object.entries(source)
      .map(([label,count])=>{
        const nodes=finite(count);
        if(!(nodes>0))return null;

        const raw=clean(label);
        const match=raw.match(/^(.*),\s*([A-Z]{2})$/);
        const city=match?clean(match[1]):raw;
        const country=match?match[2]:"";

        return {
          city,
          country,
          countryName:displayCountry(country),
          label:makeLabel(city,country),
          nodes
        };
      })
      .filter(Boolean);
  }

  function build(snapshot){
    let rows=fromNodes(snapshot);
    if(!rows.length)rows=fromMap(snapshot);

    const merged=new Map();

    for(const row of rows){
      if(!(Number(row.nodes)>0))continue;

      const key=`${clean(row.city).toLowerCase()}|${clean(row.country).toUpperCase()}`;
      const current=merged.get(key)||{
        city:clean(row.city)||"Unknown",
        country:clean(row.country).toUpperCase(),
        countryName:row.countryName||displayCountry(row.country),
        label:row.label||makeLabel(row.city,row.country),
        nodes:0
      };

      current.nodes+=Number(row.nodes);
      merged.set(key,current);
    }

    rows=[...merged.values()]
      .sort((a,b)=>
        b.nodes-a.nodes ||
        a.country.localeCompare(b.country) ||
        a.city.localeCompare(b.city)
      );

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
      schema:"zzx-nodes-by-city-model-v1",
      rows:Object.freeze(rows.map(Object.freeze)),
      cityCount:rows.length,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      top:rows[0]||null
    });
  }

  W.ZZXNodesByCityModel=Object.freeze({
    __version:1,
    build,
    makeLabel,
    displayCountry
  });
})();
