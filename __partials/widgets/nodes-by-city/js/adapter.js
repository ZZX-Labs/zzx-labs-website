// __partials/widgets/nodes-by-city/js/adapter.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByCityAdapter?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function clean(value){
    return String(value??"").trim();
  }

  function parseTimestamp(value){
    if(value==null)return NaN;

    const n=finite(value);

    if(Number.isFinite(n)){
      return n>0&&n<2e12?n*1000:n;
    }

    const t=Date.parse(String(value));
    return Number.isFinite(t)?t:NaN;
  }

  function label(city,country){
    const c=clean(city);
    const cc=clean(country).toUpperCase();

    if(c&&cc)return `${c}, ${cc}`;
    return c||cc||"Unknown";
  }

  function row(city,country,count,share){
    const nodes=finite(count);
    let frac=finite(share);

    if(Number.isFinite(frac)&&frac>1)frac/=100;

    if(!(nodes>0))return null;

    return {
      city:clean(city)||"Unknown",
      country:clean(country).toUpperCase(),
      label:label(city,country),
      nodes,
      share:Number.isFinite(frac)?frac:NaN
    };
  }

  function normalizeRows(payload){
    if(!payload)return [];

    const out=[];

    const direct=Array.isArray(payload)
      ? payload
      : null;

    if(direct){
      for(const item of direct){
        if(Array.isArray(item)){
          const r=row(
            item[0],
            item[1],
            item[2],
            item[3]
          );
          if(r)out.push(r);
          continue;
        }

        if(item&&typeof item==="object"){
          const r=row(
            item.city??item.name??item.label,
            item.country??item.country_code??item.cc??item.iso2,
            item.nodes??item.count??item.total??item.value,
            item.share??item.pct??item.percent
          );
          if(r)out.push(r);
        }
      }
      return out;
    }

    const candidates=[
      payload?.top?.cities,
      payload?.cities,
      payload?.data?.cities,
      payload?.results
    ];

    for(const candidate of candidates){
      if(Array.isArray(candidate)){
        const rows=normalizeRows(candidate);
        if(rows.length)return rows;
      }

      if(candidate&&typeof candidate==="object"){
        for(const [key,value] of Object.entries(candidate)){
          if(typeof value==="number"){
            const r=row(key,"",value,NaN);
            if(r)out.push(r);
            continue;
          }

          if(Array.isArray(value)){
            if(value.length>=3){
              const r=row(
                value[0]??key,
                value[1],
                value[2],
                value[3]
              );
              if(r)out.push(r);
            }else if(value.length===2){
              const r=row(key,value[0],value[1],NaN);
              if(r)out.push(r);
            }
            continue;
          }

          if(value&&typeof value==="object"){
            const r=row(
              value.city??value.name??value.label??key,
              value.country??value.country_code??value.cc??value.iso2,
              value.nodes??value.count??value.total??value.value,
              value.share??value.pct??value.percent
            );
            if(r)out.push(r);
          }
        }

        if(out.length)return out;
      }
    }

    return out;
  }

  function fromSnapshotNodes(nodes){
    const map=new Map();

    if(!nodes||typeof nodes!=="object"||Array.isArray(nodes)){
      return [];
    }

    for(const value of Object.values(nodes)){
      let city="";
      let country="";

      if(Array.isArray(value)){
        // Common mirrored snapshot rows carry geolocation in later fields.
        // Scan only for plausible ISO country code and a nearby city string.
        for(let i=0;i<value.length;i++){
          const token=clean(value[i]);

          if(/^[A-Z]{2}$/i.test(token)){
            country=token.toUpperCase();

            for(let j=Math.max(0,i-3);j<i;j++){
              const possible=clean(value[j]);

              if(
                possible &&
                possible.length>1 &&
                !/^[\d.:/+-]+$/.test(possible) &&
                !possible.startsWith("/")
              ){
                city=possible;
              }
            }
          }
        }
      }else if(value&&typeof value==="object"){
        city=clean(
          value.city ??
          value.location?.city ??
          value.geo?.city
        );

        country=clean(
          value.country_code ??
          value.country ??
          value.location?.country_code ??
          value.geo?.country_code
        ).toUpperCase();
      }

      if(!city)continue;

      const key=`${city.toLowerCase()}|${country}`;
      const current=map.get(key)||{
        city,
        country,
        label:label(city,country),
        nodes:0,
        share:NaN
      };

      current.nodes+=1;
      map.set(key,current);
    }

    return [...map.values()];
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

      const key=`${clean(item.city).toLowerCase()}|${clean(item.country).toUpperCase()}`;
      const current=merged.get(key)||{
        city:item.city,
        country:item.country,
        label:item.label,
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

  W.ZZXNodesByCityAdapter=Object.freeze({
    __version:3,
    normalizeRows,
    fromSnapshotNodes,
    networkTotal,
    finalize,
    updated
  });
})();
