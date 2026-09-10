// __partials/widgets/nodes-by-nation/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByNationModel?.__version||0)>=4)return;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(value){
    return String(value??"").trim();
  }

  function meta(code,name="",flag=""){
    if(W.ZZXBitnodes?.countryMeta){
      return W.ZZXBitnodes.countryMeta(code,name,flag);
    }

    const iso=clean(code).toUpperCase();
    const valid=/^[A-Z]{2}$/.test(iso);
    let label=valid?iso:"Unlocated";

    try{
      if(valid&&typeof Intl?.DisplayNames==="function"){
        label=new Intl.DisplayNames(["en"],{type:"region"}).of(iso)||iso;
      }
    }catch(_){}

    const glyph=valid
      ? String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0)))
      : "🏴";

    return {
      code:valid?iso:"--",
      name:valid?(clean(name)||label):"Unlocated",
      flag:valid?(clean(flag)||glyph):"🏴",
      located:valid
    };
  }

  function fromNodes(snapshot){
    const counts=new Map();

    for(const node of Array.isArray(snapshot?.nodes)?snapshot.nodes:[]){
      const country=meta(
        node?.country,
        node?.countryName,
        node?.countryFlag
      );

      if(!country.located||node?.geoSynthetic===true)continue;

      const current=counts.get(country.code)||{
        ...country,
        nodes:0
      };

      current.nodes+=1;
      counts.set(country.code,current);
    }

    return [...counts.values()];
  }

  function fromAggregate(snapshot){
    const source=snapshot?.byNation;
    if(!source||typeof source!=="object"||Array.isArray(source))return [];

    return Object.entries(source)
      .map(([code,count])=>{
        const country=meta(code);
        const nodes=finite(count);

        return country.located&&nodes>0
          ? {...country,nodes}
          : null;
      })
      .filter(Boolean);
  }

  function chooseRows(snapshot){
    const nodeRows=fromNodes(snapshot);
    const aggregateRows=fromAggregate(snapshot);

    const nodeTotal=nodeRows.reduce((sum,row)=>sum+row.nodes,0);
    const aggregateTotal=aggregateRows.reduce((sum,row)=>sum+row.nodes,0);

    // Both are derived from the same shared normalized snapshot. Prefer whichever
    // representation contains more verified located rows; never combine them,
    // which would double-count the same node population.
    if(aggregateTotal>nodeTotal)return {
      rows:aggregateRows,
      mode:"aggregate"
    };

    return {
      rows:nodeRows,
      mode:nodeRows.length?"per-node":"unavailable"
    };
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Nodes by Nation received no normalized snapshot");
    }

    const selected=chooseRows(snapshot);
    const merged=new Map();

    for(const row of selected.rows){
      const country=meta(row.code,row.name,row.flag);
      const nodes=finite(row.nodes);

      if(!country.located||!(nodes>0))continue;

      const current=merged.get(country.code)||{
        ...country,
        nodes:0
      };

      current.nodes+=nodes;
      merged.set(country.code,current);
    }

    const rows=[...merged.values()].sort((a,b)=>
      b.nodes-a.nodes ||
      a.name.localeCompare(b.name) ||
      a.code.localeCompare(b.code)
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

    for(const row of rows){
      row.share=denominator>0?row.nodes/denominator:NaN;
      row.geoShare=geolocatedTotal>0?row.nodes/geolocatedTotal:NaN;
      row.label=`${row.flag} ${row.name} · ${row.code}`;
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
      schema:"zzx-nodes-by-nation-model-v4",
      mode:selected.mode,
      rows:Object.freeze(rows),
      nationCount:rows.length,
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

  W.ZZXNodesByNationModel=Object.freeze({
    __version:4,
    build,
    countryMeta:meta
  });
})();
