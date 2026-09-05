// Shared Lightning network provider used by lightning + lightning-detail.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXLightningNetworkProvider?.__version>=3)return;

  function normalizeBase(value){
    return String(value||"").trim().replace(/\/+$/g,"");
  }

  function bases(core){
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  function isExternal(url){
    return /^https?:\/\//i.test(String(url||""));
  }

  async function getJSON(url){
    const local=!isExternal(url);

    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:10000,
        retries:1
      });
    }

    if(W.ZZXAPI?.fetchRaw){
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:local,
        cache:"no-store",
        credentials:local?"same-origin":"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{
      cache:"no-store",
      credentials:local?"same-origin":"omit"
    });

    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function unwrap(payload){
    let cur=payload;

    for(let i=0;i<6;i++){
      if(Array.isArray(cur)){
        if(!cur.length)return {};
        cur=cur[cur.length-1];
        continue;
      }

      if(!cur||typeof cur!=="object")return {};

      const nested=
        cur.latest ??
        cur.statistics ??
        cur.stats ??
        cur.network ??
        cur.data;

      if(nested && nested!==cur){
        cur=nested;
        continue;
      }

      return cur;
    }

    return cur&&typeof cur==="object"?cur:{};
  }

  function first(obj,names){
    for(const name of names){
      const value=finite(obj?.[name]);
      if(Number.isFinite(value))return {name,value};
    }
    return {name:"",value:NaN};
  }

  function normalizeCapacity(obj){
    const picked=first(obj,[
      "capacity_btc",
      "total_capacity_btc",
      "network_capacity_btc",
      "capacity_sats",
      "capacity_sat",
      "total_capacity_sats",
      "total_capacity",
      "totalCapacity",
      "network_capacity",
      "capacity",
      "totalLiquidity"
    ]);

    if(!Number.isFinite(picked.value)||picked.value<0){
      return {btc:NaN,sats:NaN,raw:NaN,field:picked.name,assumption:"unavailable"};
    }

    const name=picked.name.toLowerCase();
    let btc;

    if(name.includes("btc")){
      btc=picked.value;
    }else if(name.includes("sat")){
      btc=picked.value/1e8;
    }else{
      // Lightning capacity in BTC is far below Bitcoin's 21M cap.
      // Values above 21M therefore cannot sensibly be BTC and are
      // treated as satoshis. Smaller unlabelled values are treated as BTC.
      btc=picked.value>21_000_000 ? picked.value/1e8 : picked.value;
    }

    return {
      btc,
      sats:btc*1e8,
      raw:picked.value,
      field:picked.name,
      assumption:name.includes("btc")
        ?"explicit BTC field"
        :name.includes("sat")
          ?"explicit satoshi field"
          :picked.value>21_000_000
            ?"unlabelled value normalized as satoshis"
            :"unlabelled value normalized as BTC"
    };
  }

  function normalize(payload){
    const obj=unwrap(payload);
    const capacity=normalizeCapacity(obj);

    const nodes=first(obj,[
      "nodes",
      "node_count",
      "nodeCount",
      "num_nodes",
      "total_nodes"
    ]);

    const channels=first(obj,[
      "channels",
      "channel_count",
      "channelCount",
      "num_channels",
      "total_channels"
    ]);

    const updated=(
      obj.updated_at ??
      obj.updatedAt ??
      obj.timestamp ??
      obj.time ??
      null
    );

    let updatedMs=NaN;
    if(updated!=null){
      const numeric=finite(updated);
      if(Number.isFinite(numeric)){
        updatedMs=numeric<2e12?numeric*1000:numeric;
      }else{
        updatedMs=Date.parse(String(updated));
      }
    }

    const n=nodes.value;
    const c=channels.value;
    const cap=capacity.btc;

    const avgChannelBTC=
      Number.isFinite(cap)&&Number.isFinite(c)&&c>0
        ? cap/c
        : NaN;

    const avgNodeBTC=
      Number.isFinite(cap)&&Number.isFinite(n)&&n>0
        ? cap/n
        : NaN;

    const channelsPerNode=
      Number.isFinite(c)&&Number.isFinite(n)&&n>0
        ? c/n
        : NaN;

    // An undirected Lightning channel links two node endpoints.
    // 2E/V therefore gives the network's mean channel degree.
    const meanDegree=
      Number.isFinite(c)&&Number.isFinite(n)&&n>0
        ? 2*c/n
        : NaN;

    return {
      capacityBTC:cap,
      capacitySats:capacity.sats,
      capacityField:capacity.field,
      capacityAssumption:capacity.assumption,
      nodes:Number.isFinite(n)?n:NaN,
      channels:Number.isFinite(c)?c:NaN,
      avgChannelBTC,
      avgNodeBTC,
      channelsPerNode,
      meanDegree,
      updatedMs
    };
  }

  async function load(core){
    let lastError=null;

    for(const base of bases(core)){
      const candidates=[
        `${base}/v1/lightning/statistics/latest`,
        `${base}/v1/lightning/statistics`,
        `${base}/v1/lightning`,
        `${base}/v1/lightning/network`
      ];

      for(const url of candidates){
        try{
          const payload=await getJSON(url);
          const model=normalize(payload);

          if(
            Number.isFinite(model.capacityBTC) ||
            Number.isFinite(model.nodes) ||
            Number.isFinite(model.channels)
          ){
            return {
              ...model,
              source:url,
              fetchedAt:Date.now()
            };
          }
        }catch(error){
          lastError=error;
        }
      }
    }

    throw lastError||new Error("Lightning network statistics unavailable");
  }

  W.ZZXLightningNetworkProvider=Object.freeze({
    __version:3,
    bases,
    normalizeCapacity,
    normalize,
    load
  });
})();
