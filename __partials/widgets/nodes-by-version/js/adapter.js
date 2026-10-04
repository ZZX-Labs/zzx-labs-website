// __partials/widgets/nodes-by-version/js/adapter.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesByVersionAdapter?.__version>=3)return;

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

  function makeRow(label,count){
    const name=clean(label);
    const nodes=finite(count);

    if(!name||!(nodes>0))return null;

    return {
      label:name,
      count:nodes,
      share:NaN
    };
  }

  function pushMap(out,map){
    if(!map||typeof map!=="object"||Array.isArray(map))return;

    for(const [label,value] of Object.entries(map)){
      if(typeof value==="number"){
        const row=makeRow(label,value);
        if(row)out.push(row);
        continue;
      }

      if(value&&typeof value==="object"){
        const row=makeRow(
          value.label ??
          value.user_agent ??
          value.ua ??
          value.version ??
          value.name ??
          label,
          value.count ??
          value.nodes ??
          value.value ??
          value.total
        );
        if(row)out.push(row);
      }
    }
  }

  function pushArray(out,arr){
    if(!Array.isArray(arr))return;

    for(const item of arr){
      if(Array.isArray(item)&&item.length>=2){
        const row=makeRow(item[0],item[1]);
        if(row)out.push(row);
        continue;
      }

      if(item&&typeof item==="object"){
        const row=makeRow(
          item.label ??
          item.user_agent ??
          item.ua ??
          item.version ??
          item.name,
          item.count ??
          item.nodes ??
          item.value ??
          item.total
        );
        if(row)out.push(row);
      }
    }
  }

  function fromSnapshotNodes(nodes){
    const counts=new Map();

    if(!nodes||typeof nodes!=="object"||Array.isArray(nodes)){
      return [];
    }

    for(const value of Object.values(nodes)){
      let ua="";

      if(Array.isArray(value)){
        ua=clean(value[1]);
      }else if(value&&typeof value==="object"){
        ua=clean(
          value.user_agent ??
          value.agent ??
          value.subver ??
          value.version
        );
      }

      if(!ua)continue;
      counts.set(ua,(counts.get(ua)||0)+1);
    }

    return [...counts.entries()].map(([label,count])=>({
      label,
      count,
      share:NaN
    }));
  }

  function normalizeRows(payload){
    if(!payload)return [];

    const out=[];

    const maps=[
      payload?.top?.agents,
      payload?.agents,
      payload?.user_agents,
      payload?.versions,
      payload?.data?.user_agents,
      payload?.data?.versions
    ];

    for(const map of maps){
      if(Array.isArray(map)){
        pushArray(out,map);
      }else{
        pushMap(out,map);
      }

      if(out.length)return out;
    }

    const arrays=[
      payload?.results,
      Array.isArray(payload?.data)?payload.data:null
    ];

    for(const arr of arrays){
      pushArray(out,arr);
      if(out.length)return out;
    }

    if(payload?.nodes){
      return fromSnapshotNodes(payload.nodes);
    }

    if(payload?.data?.nodes){
      return fromSnapshotNodes(payload.data.nodes);
    }

    return out;
  }

  function total(payload,rows){
    const values=[
      payload?.total_nodes,
      payload?.reachable_nodes,
      payload?.counts?.reachable,
      payload?.counts?.total,
      payload?.total,
      payload?.count
    ].map(finite);

    for(const value of values){
      if(Number.isFinite(value)&&value>0)return value;
    }

    return (rows||[]).reduce(
      (sum,item)=>sum+(Number.isFinite(item.count)?item.count:0),
      0
    );
  }

  function height(payload){
    return finite(
      payload?.latest_height ??
      payload?.latestHeight ??
      payload?.block_height ??
      payload?.height
    );
  }

  function updated(payload){
    return parseTimestamp(
      payload?.generated_at ??
      payload?.updated_at ??
      payload?.timestamp ??
      payload?.ts ??
      payload?.time
    );
  }

  function latestTimestamp(payload){
    const n=finite(
      payload?.timestamp ??
      payload?.ts ??
      payload?.time
    );

    if(!Number.isFinite(n)||n<=0)return NaN;
    return Math.trunc(n<2e12?n:n/1000);
  }

  function finalize(rows,networkTotal){
    const merged=new Map();

    for(const row of rows||[]){
      if(!row?.label||!(Number(row.count)>0))continue;

      const key=String(row.label);
      const current=merged.get(key)||{
        label:key,
        count:0,
        share:NaN
      };

      current.count+=Number(row.count);
      merged.set(key,current);
    }

    const sorted=[...merged.values()]
      .sort((a,b)=>b.count-a.count);

    const denominator=Number(networkTotal);

    for(const row of sorted){
      row.share=
        Number.isFinite(denominator)&&denominator>0
          ? row.count/denominator
          : NaN;
    }

    return sorted;
  }

  function family(label){
    const s=clean(label).toLowerCase();

    if(s.includes("knots"))return "Bitcoin Knots";
    if(s.includes("/satoshi:")||s.includes("bitcoin core"))return "Bitcoin Core";
    if(s.includes("btcd"))return "btcd";
    if(s.includes("bcoin"))return "bcoin";
    if(s.includes("libbitcoin"))return "libbitcoin";
    return "Other / Unknown";
  }

  W.ZZXNodesByVersionAdapter=Object.freeze({
    __version:3,
    normalizeRows,
    fromSnapshotNodes,
    total,
    height,
    updated,
    latestTimestamp,
    finalize,
    family
  });
})();
