// __partials/widgets/nodes-by-city/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCityModel?.__version||0)>=4)return;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(value){
    return String(value??"").trim();
  }

  function countryMeta(code,name="",flag=""){
    if(W.ZZXBitnodes?.countryMeta){
      return W.ZZXBitnodes.countryMeta(code,name,flag);
    }

    const iso=clean(code).toUpperCase();
    const valid=/^[A-Z]{2}$/.test(iso);

    let countryName=valid?iso:"Unlocated";
    try{
      if(valid&&typeof Intl?.DisplayNames==="function"){
        countryName=new Intl.DisplayNames(["en"],{type:"region"}).of(iso)||iso;
      }
    }catch(_){}

    const glyph=valid
      ? String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0)))
      : "🏴";

    return {
      code:valid?iso:"--",
      name:valid?(clean(name)||countryName):"Unlocated",
      flag:valid?(clean(flag)||glyph):"🏴",
      located:valid,
      label:valid?`${glyph} ${clean(name)||countryName} · ${iso}`:"🏴 Unlocated · --"
    };
  }

  function makeLabel(city,region,countryName,country){
    return [
      clean(city),
      clean(region),
      clean(countryName),
      clean(country)
    ].filter(Boolean).join(" · ")||"Unknown";
  }

  function fromNodes(snapshot){
    const map=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const city=clean(node?.city);
      const region=clean(node?.region);
      const country=countryMeta(
        node?.country,
        node?.countryName,
        node?.countryFlag
      );

      if(
        !city ||
        !country.located ||
        node?.geoSynthetic===true
      )continue;

      const key=[
        city.toLowerCase(),
        region.toLowerCase(),
        country.code
      ].join("|");

      const row=map.get(key)||{
        city,
        region,
        country:country.code,
        countryName:country.name,
        flag:country.flag,
        nationLabel:country.label,
        label:makeLabel(city,region,country.name,country.code),
        nodes:0
      };

      row.nodes+=1;
      map.set(key,row);
    }

    return [...map.values()];
  }

  function fromAggregate(snapshot){
    const source=snapshot?.byCity;
    if(!source||typeof source!=="object"||Array.isArray(source))return [];

    return Object.entries(source)
      .map(([label,count])=>{
        const nodes=finite(count);
        if(!(nodes>0))return null;

        const raw=clean(label);
        const match=raw.match(/^(.*),\s*([A-Z]{2})$/);
        if(!match)return null;

        const city=clean(match[1]);
        const country=countryMeta(match[2]);

        if(!city||!country.located)return null;

        return {
          city,
          region:"",
          country:country.code,
          countryName:country.name,
          flag:country.flag,
          nationLabel:country.label,
          label:makeLabel(city,"",country.name,country.code),
          nodes
        };
      })
      .filter(Boolean);
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Nodes by City received no normalized snapshot");
    }

    let mode="per-node";
    let rows=fromNodes(snapshot);

    // City-level aggregate labels generally do not preserve region/admin1.
    // Therefore per-node Map Host enrichment is preferred whenever available;
    // aggregate byCity is an honest fallback only when no verified city rows exist.
    if(!rows.length){
      rows=fromAggregate(snapshot);
      mode=rows.length?"aggregate":"unavailable";
    }

    const merged=new Map();

    for(const row of rows){
      const city=clean(row.city);
      const region=clean(row.region);
      const country=countryMeta(
        row.country,
        row.countryName,
        row.flag
      );
      const nodes=finite(row.nodes);

      if(!city||!country.located||!(nodes>0))continue;

      const key=[
        city.toLowerCase(),
        region.toLowerCase(),
        country.code
      ].join("|");

      const current=merged.get(key)||{
        city,
        region,
        country:country.code,
        countryName:country.name,
        flag:country.flag,
        nationLabel:country.label,
        label:makeLabel(city,region,country.name,country.code),
        nodes:0
      };

      current.nodes+=nodes;
      merged.set(key,current);
    }

    rows=[...merged.values()].sort((a,b)=>
      b.nodes-a.nodes ||
      a.countryName.localeCompare(b.countryName) ||
      a.region.localeCompare(b.region) ||
      a.city.localeCompare(b.city)
    );

    const geolocatedTotal=rows.reduce((sum,row)=>sum+row.nodes,0);

    const reachable=finite(
      snapshot?.reachableNodes ??
      snapshot?.reachable_nodes ??
      snapshot?.totalNodes ??
      snapshot?.total_nodes
    );

    const decoded=finite(
      snapshot?.nodeCount ??
      snapshot?.node_count
    );

    const denominator=
      Number.isFinite(reachable)&&reachable>0
        ? reachable
        : Number.isFinite(decoded)&&decoded>0
          ? decoded
          : geolocatedTotal;

    const nationSet=new Set();

    for(const row of rows){
      row.share=denominator>0?row.nodes/denominator:NaN;
      row.geoShare=geolocatedTotal>0?row.nodes/geolocatedTotal:NaN;
      nationSet.add(row.country);
      Object.freeze(row);
    }

    const coverage=denominator>0
      ? Math.min(1,geolocatedTotal/denominator)
      : NaN;

    const unidentified=denominator>0
      ? Math.max(0,denominator-geolocatedTotal)
      : NaN;

    const geographyJoined=finite(snapshot?.geography?.joined);

    return Object.freeze({
      schema:"zzx-nodes-by-city-model-v4",
      mode,
      rows:Object.freeze(rows),
      cityCount:rows.length,
      nationCount:nationSet.size,
      geolocatedTotal,
      reachable:Number.isFinite(reachable)?reachable:null,
      decoded:Number.isFinite(decoded)?decoded:null,
      denominator:Number.isFinite(denominator)?denominator:null,
      coverage:Number.isFinite(coverage)?coverage:null,
      unidentified:Number.isFinite(unidentified)?unidentified:null,
      geographySource:snapshot?.geography?.source||null,
      geographyJoined:Number.isFinite(geographyJoined)?geographyJoined:0,
      top:rows[0]||null
    });
  }

  W.ZZXNodesByCityModel=Object.freeze({
    __version:4,
    build,
    makeLabel,
    countryMeta
  });
})();
