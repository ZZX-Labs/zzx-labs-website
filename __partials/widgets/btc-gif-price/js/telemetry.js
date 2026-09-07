(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCGifPriceTelemetry?.__version>=2)return;

  const CACHE={bpi:null,mempool:null,hashrate:null,lightning:null};
  const TTL={bpi:2200,mempool:15000,hashrate:60000,lightning:60000};
  const LN_STORE="ZZXBTCGifPriceTelemetry.ln.channels.v2";

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }
  function positive(v){
    const n=finite(v);
    return n>0?n:NaN;
  }
  function nonnegative(v){
    const n=finite(v);
    return n>=0?n:NaN;
  }
  function text(v){return String(v??"").trim()}
  function median(values){
    const rows=values.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    const m=Math.floor(rows.length/2);
    return rows.length%2?rows[m]:(rows[m-1]+rows[m])/2;
  }
  function normalizeBase(v){return text(v).replace(/\/+$/g,"")}
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
  function now(){return Date.now()}
  function fresh(name){
    const row=CACHE[name];
    return row&&now()-row.at<TTL[name]?row.value:null;
  }
  function save(name,value){
    CACHE[name]={at:now(),value};
    return value;
  }
  async function json(url,local=false){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:local,
        timeoutMs:8000,
        retries:1
      });
    }
    const r=await fetch(url,{
      cache:local?"no-store":"default",
      credentials:local?"same-origin":"omit"
    });
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }
  async function firstJSON(urls){
    let last=null;
    for(const url of urls){
      try{return {data:await json(url,!/^https?:\/\//i.test(url)),url}}
      catch(error){last=error}
    }
    throw last||new Error("all telemetry endpoints failed");
  }
  function historyRows(payload){
    if(Array.isArray(payload))return payload;
    for(const key of ["history","rows","points","records","changes"]){
      if(Array.isArray(payload?.[key]))return payload[key];
    }
    return [];
  }
  function rowTime(row){
    const raw=row?.t??row?.ts_ms??row?.timestamp??row?.updated_at;
    if(typeof raw==="number")return raw<1e11?raw*1000:raw;
    const ms=Date.parse(String(raw||""));
    return Number.isFinite(ms)?ms:NaN;
  }
  function rowPrice(row){
    return positive(row?.price_usd??row?.price??row?.close??row?.bpi_usd);
  }
  function rowVolume(row){
    return nonnegative(row?.volume_24h_btc??row?.volumeBtc);
  }

  async function loadBPI(force=false){
    if(!force){
      const cached=fresh("bpi");
      if(cached)return cached;
    }
    const latest=await json("/bitcoin/bpi/api/latest.json",true);
    const history=await json("/bitcoin/bpi/api/history-live.json",true)
      .catch(()=>json("/bitcoin/bpi/api/history.json",true))
      .catch(()=>[]);

    const rows=historyRows(history);
    const selected=W.ZZXBPISelection||W.ZZXSelectedBPI||null;
    const price=positive(
      selected?.priceUsd ??
      selected?.price_usd ??
      W.ZZXSelectedPriceUsd ??
      latest?.price_usd ??
      latest?.bpi_usd ??
      latest?.btc_usd
    );
    const volume=nonnegative(
      selected?.volumeBtc ??
      selected?.volume_24h_btc ??
      latest?.volume_24h_btc
    );
    const high=positive(
      selected?.highUsd ??
      selected?.high_24h ??
      latest?.high_24h
    );
    const low=positive(
      selected?.lowUsd ??
      selected?.low_24h ??
      latest?.low_24h
    );

    const end=Date.parse(latest?.updated_at||"")||now();
    const target=end-24*60*60*1000;
    let ref=NaN,dist=Infinity;
    const volumes=[];

    for(const row of rows){
      const p=rowPrice(row);
      const v=rowVolume(row);
      const t=rowTime(row);
      if(Number.isFinite(v))volumes.push(v);
      if(!Number.isFinite(p)||!Number.isFinite(t))continue;
      const d=Math.abs(t-target);
      if(d<dist){dist=d;ref=p}
    }

    const changePct=
      Number.isFinite(price)&&Number.isFinite(ref)&&ref>0&&dist<=6*60*60*1000
        ? (price-ref)/ref*100
        : finite(latest?.change_24h_pct);

    const rangePct=
      Number.isFinite(high)&&Number.isFinite(low)&&low>0
        ? (high-low)/low*100
        : NaN;

    const medianVolume=median(volumes);
    const volumeRatio=
      Number.isFinite(volume)&&Number.isFinite(medianVolume)&&medianVolume>0
        ? volume/medianVolume
        : NaN;

    return save("bpi",{
      source:selected?.label||latest?.source||"ZZX BPI",
      priceUsd:price,
      priceChange24hPct:changePct,
      high24hUsd:high,
      low24hUsd:low,
      priceRangePct:rangePct,
      volume24hBtc:volume,
      volumeMedian24hBtc:medianVolume,
      volumeRatio,
      blockHeight:finite(latest?.block_height),
      updatedAt:latest?.updated_at||new Date().toISOString()
    });
  }

  async function loadMempool(core,force=false){
    if(!force){
      const cached=fresh("mempool");
      if(cached)return cached;
    }
    let last=null;
    for(const base of bases(core)){
      try{
        const [summary,fees]=await Promise.all([
          json(`${base}/mempool`,false),
          json(`${base}/v1/fees/recommended`,false).catch(()=>null)
        ]);
        const vsize=nonnegative(summary?.vsize);
        const blocks=Number.isFinite(vsize)?vsize/4_000_000:NaN;
        return save("mempool",{
          source:base,
          mempoolVMB:Number.isFinite(vsize)?vsize/1_000_000:NaN,
          mempoolBlocks:blocks,
          mempoolTxCount:nonnegative(summary?.count),
          mempoolTotalFeeBtc:Number.isFinite(nonnegative(summary?.total_fee))
            ? nonnegative(summary.total_fee)/1e8
            : NaN,
          fastFeeSatVb:positive(
            fees?.fastestFee ??
            fees?.halfHourFee ??
            fees?.hourFee
          )
        });
      }catch(error){last=error}
    }
    throw last||new Error("mempool telemetry unavailable");
  }

  function hashrateSeries(payload){
    const rows=Array.isArray(payload?.hashrates)
      ? payload.hashrates
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];
    return rows.map(row=>{
      const raw=positive(
        row?.avgHashrate ??
        row?.hashrate ??
        row?.value ??
        row?.avg_hashrate
      );
      if(!Number.isFinite(raw))return NaN;
      return raw>1e9?raw/1e18:raw;
    }).filter(Number.isFinite);
  }

  async function loadHashrate(core,force=false){
    if(!force){
      const cached=fresh("hashrate");
      if(cached)return cached;
    }
    let last=null;
    for(const base of bases(core)){
      for(const path of ["/v1/mining/hashrate/3d","/v1/mining/hashrate/1w"]){
        try{
          const payload=await json(`${base}${path}`,false);
          const values=hashrateSeries(payload);
          let current=values.at(-1);
          if(!Number.isFinite(current)){
            current=positive(W.ZZXMiningStats?.globalHashrateEH);
          }
          const prior=values.length>4
            ? median(values.slice(0,Math.max(1,Math.floor(values.length/3))))
            : values[0];
          const changePct=
            Number.isFinite(current)&&Number.isFinite(prior)&&prior>0
              ? (current-prior)/prior*100
              : NaN;
          return save("hashrate",{
            source:`${base}${path}`,
            hashrateEH:current,
            hashrateChangePct:changePct,
            difficulty:positive(
              payload?.currentDifficulty ??
              payload?.difficulty ??
              W.ZZXMiningStats?.difficulty
            )
          });
        }catch(error){last=error}
      }
    }
    const fallback=positive(W.ZZXMiningStats?.globalHashrateEH);
    if(Number.isFinite(fallback)){
      return save("hashrate",{
        source:"ZZXMiningStats",
        hashrateEH:fallback,
        hashrateChangePct:NaN,
        difficulty:positive(W.ZZXMiningStats?.difficulty)
      });
    }
    throw last||new Error("hashrate telemetry unavailable");
  }

  function unwrap(obj){
    let cur=obj;
    for(let i=0;i<6;i++){
      if(Array.isArray(cur)){cur=cur.at(-1);continue}
      if(!cur||typeof cur!=="object")return {};
      const nested=cur.latest??cur.statistics??cur.stats??cur.network??cur.data;
      if(nested&&nested!==cur){cur=nested;continue}
      return cur;
    }
    return cur&&typeof cur==="object"?cur:{};
  }
  function first(obj,names){
    for(const name of names){
      const v=nonnegative(obj?.[name]);
      if(Number.isFinite(v))return v;
    }
    return NaN;
  }
  function previousLightning(){
    try{
      const row=JSON.parse(W.localStorage.getItem(LN_STORE)||"null");
      return row&&typeof row==="object"?row:null;
    }catch(_){return null}
  }
  function rememberLightning(channels){
    try{
      if(Number.isFinite(channels)){
        W.localStorage.setItem(LN_STORE,JSON.stringify({channels,at:now()}));
      }
    }catch(_){}
  }
  async function loadLightning(core,force=false){
    if(!force){
      const cached=fresh("lightning");
      if(cached)return cached;
    }
    let last=null;
    for(const base of bases(core)){
      for(const path of [
        "/v1/lightning/statistics/latest",
        "/v1/lightning/statistics",
        "/v1/lightning",
        "/v1/lightning/network"
      ]){
        try{
          const payload=await json(`${base}${path}`,false);
          const obj=unwrap(payload);
          const channels=first(obj,["channels","channel_count","channelCount","num_channels","total_channels"]);
          const nodes=first(obj,["nodes","node_count","nodeCount","num_nodes","total_nodes"]);
          const capRaw=first(obj,[
            "capacity_btc","total_capacity_btc","network_capacity_btc",
            "capacity_sats","capacity_sat","total_capacity_sats",
            "total_capacity","totalCapacity","network_capacity","capacity"
          ]);
          let capacity=capRaw;
          const capKeys=Object.keys(obj||{}).join(" ").toLowerCase();
          if(Number.isFinite(capacity)&&capacity>21_000_000&&!capKeys.includes("btc"))capacity/=1e8;

          if(![channels,nodes,capacity].some(Number.isFinite))continue;

          const prev=previousLightning();
          const changePct=
            prev&&Number.isFinite(channels)&&Number.isFinite(prev.channels)&&prev.channels>0
              ? (channels-prev.channels)/prev.channels*100
              : NaN;
          rememberLightning(channels);

          return save("lightning",{
            source:`${base}${path}`,
            lightningChannels:channels,
            lightningNodes:nodes,
            lightningCapacityBtc:capacity,
            lightningChannelChangePct:changePct
          });
        }catch(error){last=error}
      }
    }
    throw last||new Error("Lightning telemetry unavailable");
  }

  async function load(core,{force=false}={}){
    const availability=[];
    const results=await Promise.allSettled([
      loadBPI(force),
      loadMempool(core,force),
      loadHashrate(core,force),
      loadLightning(core,force)
    ]);
    const [bpi,mp,hr,ln]=results.map((row,index)=>{
      const name=["bpi","mempool","hashrate","lightning"][index];
      if(row.status==="fulfilled"){availability.push(name);return row.value}
      return {};
    });
    return Object.freeze({
      ...bpi,...mp,...hr,...ln,
      availability,
      fetchedAt:now()
    });
  }

  W.ZZXBTCGifPriceTelemetry=Object.freeze({
    __version:2,
    load,
    bases
  });
})();
