(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByCountyModel?.__version>=1)return;

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

  function makeLabel(county,region,country){
    const parts=[
      clean(county),
      clean(region),
      clean(country).toUpperCase()
    ].filter(Boolean);

    return parts.join(", ")||"Unknown";
  }

  function fromNodes(snapshot){
    const map=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const county=clean(node?.county);
      const region=clean(node?.region);
      const country=clean(node?.country).toUpperCase();

      if(!county)continue;

      const key=[
        county.toLowerCase(),
        region.toLowerCase(),
        country
      ].join("|");

      const row=map.get(key)||{
        county,
        region,
        country,
        countryName:displayCountry(country),
        label:makeLabel(county,region,country),
        nodes:0
      };

      row.nodes+=1;
      map.set(key,row);
    }

    return [...map.values()];
  }

  function fromMap(snapshot){
    const source=snapshot?.byCounty;
    if(!source||typeof source!=="object"||Array.isArray(source))return [];

    return Object.entries(source)
      .map(([label,count])=>{
        const nodes=finite(count);
        if(!(nodes>0))return null;

        const parts=clean(label)
          .split(",")
          .map(clean)
          .filter(Boolean);

        let country="";
        let region="";
        let county="";

        if(parts.length>=1){
          const last=parts.at(-1)?.toUpperCase()||"";
          if(/^[A-Z]{2}$/.test(last)){
            country=last;
            parts.pop();
          }
        }

        if(parts.length>=2){
          region=parts.pop();
        }

        county=parts.join(", ")||clean(label);

        return {
          county,
          region,
          country,
          countryName:displayCountry(country),
          label:makeLabel(county,region,country),
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

      const county=clean(row.county);
      const region=clean(row.region);
      const country=clean(row.country).toUpperCase();

      const key=[
        county.toLowerCase(),
        region.toLowerCase(),
        country
      ].join("|");

      const current=merged.get(key)||{
        county:county||"Unknown",
        region,
        country,
        countryName:row.countryName||displayCountry(country),
        label:row.label||makeLabel(county,region,country),
        nodes:0
      };

      current.nodes+=Number(row.nodes);
      merged.set(key,current);
    }

    rows=[...merged.values()]
      .sort((a,b)=>
        b.nodes-a.nodes ||
        a.country.localeCompare(b.country) ||
        a.region.localeCompare(b.region) ||
        a.county.localeCompare(b.county)
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
      schema:"zzx-nodes-by-county-model-v1",
      rows:Object.freeze(rows.map(Object.freeze)),
      countyCount:rows.length,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      top:rows[0]||null
    });
  }

  W.ZZXNodesByCountyModel=Object.freeze({
    __version:1,
    build,
    makeLabel,
    displayCountry
  });
})();
