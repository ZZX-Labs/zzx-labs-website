// __partials/widgets/nodes-by-nation/js/adapter.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByNationAdapter?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(v){
    return String(v??"").trim();
  }

  function parseTimestamp(value){
    if(value==null)return NaN;

    const n=finite(value);

    if(Number.isFinite(n)){
      return n>0&&n<2e12?n*1000:n;
    }

    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function makeRow(code,name,count,share){
    const nodes=finite(count);
    let frac=finite(share);

    if(Number.isFinite(frac)&&frac>1)frac/=100;
    if(!(nodes>0))return null;

    const iso=clean(code).toUpperCase();
    const country=clean(name)||iso||"Unknown";

    return {
      code:iso,
      name:country,
      nodes,
      share:Number.isFinite(frac)?frac:NaN
    };
  }

  function normalizeRows(payload){
    if(!payload)return [];

    const out=[];

    const arr=Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.data)
          ? payload.data
          : null;

    if(arr){
      for(const item of arr){
        if(Array.isArray(item)){
          const r=makeRow(
            item[0],
            item[1],
            item[2],
            item[3]
          );
          if(r)out.push(r);
          continue;
        }

        if(item&&typeof item==="object"){
          const r=makeRow(
            item.code??item.country_code??item.iso2??item.cc,
            item.name??item.country??item.country_name,
            item.nodes??item.count??item.total??item.value,
            item.share??item.pct??item.percent
          );
          if(r)out.push(r);
        }
      }

      return out;
    }

    const maps=[
      payload?.top?.countries,
      payload?.countries,
      payload?.data?.countries
    ];

    for(const map of maps){
      if(!map||typeof map!=="object"||Array.isArray(map))continue;

      for(const [code,value] of Object.entries(map)){
        if(typeof value==="number"){
          const r=makeRow(code,code,value,NaN);
          if(r)out.push(r);
          continue;
        }

        if(Array.isArray(value)){
          const r=makeRow(
            code,
            value[0],
            value[1],
            value[2]
          );
          if(r)out.push(r);
          continue;
        }

        if(value&&typeof value==="object"){
          const r=makeRow(
            value.code??value.country_code??value.iso2??code,
            value.name??value.country??value.country_name??code,
            value.nodes??value.count??value.total??value.value,
            value.share??value.pct??value.percent
          );
          if(r)out.push(r);
        }
      }

      if(out.length)return out;
    }

    return out;
  }

  function fromSnapshotNodes(nodes){
    const counts=new Map();

    if(!nodes||typeof nodes!=="object"||Array.isArray(nodes)){
      return [];
    }

    for(const value of Object.values(nodes)){
      let code="";
      let name="";

      if(Array.isArray(value)){
        // Snapshot schemas vary. Prefer explicit object data when present,
        // otherwise inspect scalar fields for an ISO-2 token.
        for(const item of value){
          if(item&&typeof item==="object"&&!Array.isArray(item)){
            code=clean(
              item.country_code ??
              item.iso2 ??
              item.cc ??
              item.country
            ).toUpperCase();

            name=clean(
              item.country_name ??
              item.name
            );

            if(/^[A-Z]{2}$/.test(code))break;
          }
        }

        if(!/^[A-Z]{2}$/.test(code)){
          for(const item of value){
            const token=clean(item).toUpperCase();
            if(/^[A-Z]{2}$/.test(token)){
              code=token;
              break;
            }
          }
        }
      }else if(value&&typeof value==="object"){
        code=clean(
          value.country_code ??
          value.iso2 ??
          value.cc ??
          value.location?.country_code ??
          value.geo?.country_code
        ).toUpperCase();

        name=clean(
          value.country_name ??
          value.country ??
          value.location?.country_name ??
          value.geo?.country_name
        );
      }

      if(!/^[A-Z]{2}$/.test(code))continue;

      const current=counts.get(code)||{
        code,
        name:name||code,
        nodes:0,
        share:NaN
      };

      current.nodes+=1;
      if(name&&!current.name)current.name=name;
      counts.set(code,current);
    }

    return [...counts.values()];
  }

  function networkTotal(payload,rows){
    const values=[
      payload?.total_nodes,
      payload?.reachable_nodes,
      payload?.counts?.reachable,
      payload?.counts?.total,
      payload?.total,
      payload?.nodes_total
    ].map(finite);

    for(const value of values){
      if(Number.isFinite(value)&&value>0)return value;
    }

    return (rows||[]).reduce(
      (sum,item)=>sum+(Number.isFinite(item.nodes)?item.nodes:0),
      0
    );
  }

  function finalize(rows,total){
    const merged=new Map();

    for(const item of rows||[]){
      if(!(Number(item.nodes)>0))continue;

      const code=clean(item.code).toUpperCase();
      const key=code||clean(item.name).toLowerCase();

      const current=merged.get(key)||{
        code,
        name:item.name||code||"Unknown",
        nodes:0,
        share:NaN
      };

      current.nodes+=Number(item.nodes);
      merged.set(key,current);
    }

    const sorted=[...merged.values()]
      .sort((a,b)=>b.nodes-a.nodes);

    const denominator=Number(total);

    for(const item of sorted){
      item.share=
        Number.isFinite(denominator)&&denominator>0
          ? item.nodes/denominator
          : NaN;
    }

    return sorted;
  }

  function updated(payload){
    return parseTimestamp(
      payload?.generated_at ??
      payload?.updated_at ??
      payload?.timestamp ??
      payload?.ts
    );
  }

  function latestTimestamp(payload){
    const value=
      payload?.timestamp ??
      payload?.ts ??
      payload?.time ??
      payload?.generated_at;

    const n=finite(value);
    return Number.isFinite(n)&&n>0
      ? Math.trunc(n<2e12?n:n/1000)
      : NaN;
  }

  W.ZZXNodesByNationAdapter=Object.freeze({
    __version:3,
    normalizeRows,
    fromSnapshotNodes,
    networkTotal,
    finalize,
    updated,
    latestTimestamp
  });
})();
