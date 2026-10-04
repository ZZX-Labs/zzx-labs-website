// __partials/widgets/nodes-by-county/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByCountyModel?.__version||0)>=4)return;

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

  function label(county,region,countryName,country,admin1Code="",admin2Code=""){
    return [
      clean(county),
      clean(admin2Code),
      clean(region),
      clean(admin1Code),
      clean(countryName),
      clean(country)
    ].filter(Boolean).join(" · ")||"Unknown";
  }

  function fromNodes(snapshot){
    const map=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const county=clean(node?.county);
      const region=clean(node?.region);
      const admin1Code=clean(node?.admin1Code);
      const admin2Code=clean(node?.admin2Code);

      const country=countryMeta(
        node?.country,
        node?.countryName,
        node?.countryFlag
      );

      if(
        !county ||
        !country.located ||
        node?.geoSynthetic===true
      )continue;

      const key=[
        county.toLowerCase(),
        region.toLowerCase(),
        country.code
      ].join("|");

      const row=map.get(key)||{
        county,
        region,
        admin1Code,
        admin2Code,
        country:country.code,
        countryName:country.name,
        flag:country.flag,
        nationLabel:country.label,
        label:label(
          county,
          region,
          country.name,
          country.code,
          admin1Code,
          admin2Code
        ),
        nodes:0
      };

      row.nodes+=1;

      if(!row.admin1Code&&admin1Code)row.admin1Code=admin1Code;
      if(!row.admin2Code&&admin2Code)row.admin2Code=admin2Code;

      map.set(key,row);
    }

    return [...map.values()];
  }

  function fromAggregate(snapshot){
    const source=snapshot?.byCounty;
    if(!source||typeof source!=="object"||Array.isArray(source))return [];

    return Object.entries(source)
      .map(([rawLabel,count])=>{
        const nodes=finite(count);
        if(!(nodes>0))return null;

        const parts=clean(rawLabel)
          .split(",")
          .map(clean)
          .filter(Boolean);

        if(parts.length<2)return null;

        const rawCountry=parts.at(-1);
        const country=countryMeta(rawCountry);
        if(!country.located)return null;

        parts.pop();

        const region=parts.length>1?parts.pop():"";
        const county=parts.join(", ");

        if(!county)return null;

        return {
          county,
          region,
          admin1Code:"",
          admin2Code:"",
          country:country.code,
          countryName:country.name,
          flag:country.flag,
          nationLabel:country.label,
          label:label(county,region,country.name,country.code),
          nodes
        };
      })
      .filter(Boolean);
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Nodes by County received no normalized snapshot");
    }

    let mode="per-node";
    let rows=fromNodes(snapshot);

    // byCounty is a fallback only: it may lose admin1/admin2 codes. Prefer the
    // address-joined per-node Map Host representation whenever any verified
    // county rows are available.
    if(!rows.length){
      rows=fromAggregate(snapshot);
      mode=rows.length?"aggregate":"unavailable";
    }

    const merged=new Map();

    for(const row of rows){
      const county=clean(row.county);
      const region=clean(row.region);
      const admin1Code=clean(row.admin1Code);
      const admin2Code=clean(row.admin2Code);

      const country=countryMeta(
        row.country,
        row.countryName,
        row.flag
      );

      const nodes=finite(row.nodes);

      if(!county||!country.located||!(nodes>0))continue;

      const key=[
        county.toLowerCase(),
        region.toLowerCase(),
        country.code
      ].join("|");

      const current=merged.get(key)||{
        county,
        region,
        admin1Code,
        admin2Code,
        country:country.code,
        countryName:country.name,
        flag:country.flag,
        nationLabel:country.label,
        label:label(
          county,
          region,
          country.name,
          country.code,
          admin1Code,
          admin2Code
        ),
        nodes:0
      };

      current.nodes+=nodes;
      if(!current.admin1Code&&admin1Code)current.admin1Code=admin1Code;
      if(!current.admin2Code&&admin2Code)current.admin2Code=admin2Code;

      merged.set(key,current);
    }

    rows=[...merged.values()].sort((a,b)=>
      b.nodes-a.nodes ||
      a.countryName.localeCompare(b.countryName) ||
      a.region.localeCompare(b.region) ||
      a.county.localeCompare(b.county)
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

    const regions=new Set();
    const nations=new Set();

    for(const row of rows){
      row.share=denominator>0?row.nodes/denominator:NaN;
      row.geoShare=geolocatedTotal>0?row.nodes/geolocatedTotal:NaN;

      if(row.region){
        regions.add(`${row.country}|${row.region.toLowerCase()}`);
      }
      nations.add(row.country);

      row.label=label(
        row.county,
        row.region,
        row.countryName,
        row.country,
        row.admin1Code,
        row.admin2Code
      );

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
      schema:"zzx-nodes-by-county-model-v4",
      mode,
      rows:Object.freeze(rows),
      countyCount:rows.length,
      regionCount:regions.size,
      nationCount:nations.size,
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

  W.ZZXNodesByCountyModel=Object.freeze({
    __version:4,
    build,
    makeLabel:label,
    countryMeta
  });
})();
