(function(){
  "use strict";
  const W=window;
  if(W.ZZXLiveBPI?.__version>=4)return;

  const CYCLE_MS=2500;
  const FX_TTL_MS=60_000;
  const CONFIG_TTL_MS=5*60_000;
  const ALL_ORIGINS="https://api.allorigins.win/raw?url=";
  const state={
    running:false,timer:null,busy:false,
    config:null,configAt:0,fx:{USD:1},fxAt:0,
    due:new Map(),markets:new Map(),health:new Map(),
    snapshot:null,history:new Map()
  };

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};
  const nonnegative=v=>{const n=finite(v);return n>=0?n:NaN};
  const localUrl=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;

  async function fetchJSON(url,{timeoutMs=7000,external=false}={}){
    const target=external?url:localUrl(url);
    const ctl=new AbortController();
    const timer=W.setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const r=await fetch(target,{cache:"no-store",credentials:external?"omit":"same-origin",signal:ctl.signal});
      if(!r.ok){const e=new Error(`HTTP ${r.status} ${target}`);e.status=r.status;throw e}
      return await r.json();
    }finally{W.clearTimeout(timer)}
  }

  async function fetchExternal(url){
    const prefix=String(W.ZZX_BPI_PROXY_PREFIX||"").trim();
    if(prefix){
      try{return await fetchJSON(prefix+encodeURIComponent(url),{external:true})}catch(_){}
    }
    try{return await fetchJSON(url,{external:true})}
    catch(first){
      const status=Number(first?.status);
      if(Number.isFinite(status)&&status>0&&status<500&&status!==408&&status!==429)throw first;
      return await fetchJSON(ALL_ORIGINS+encodeURIComponent(url),{external:true,timeoutMs:9000});
    }
  }

  function value(obj,...keys){for(const k of keys){if(obj&&obj[k]!=null&&obj[k]!=="")return obj[k]}return null}
  function market(cfg,price,volume,high=null,low=null){
    const p=positive(price),v=nonnegative(volume);
    if(!Number.isFinite(p))throw new Error("non-positive price");
    if(!Number.isFinite(v))throw new Error("invalid BTC volume");
    return {exchange:cfg.id,label:cfg.label||cfg.id,quote:String(cfg.quote||"USD").toUpperCase(),native_price:p,volume_24h_btc:v,high_24h_native:positive(high),low_24h_native:positive(low)};
  }

  function parse(cfg,payload){
    const a=cfg.adapter;
    if(a==="coinbase_exchange")return market(cfg,payload.price,payload.volume);
    if(a==="kraken"){const row=Object.values(payload?.result||{})[0]||{};return market(cfg,row?.c?.[0],row?.v?.[1],row?.h?.[1],row?.l?.[1])}
    if(a==="gemini"){const v=payload?.volume||{};return market(cfg,payload.last,v.BTC||v.btc||payload.volume,payload.high,payload.low)}
    if(a==="bitstamp")return market(cfg,payload.last,payload.volume,payload.high,payload.low);
    if(a==="bitfinex")return market(cfg,payload?.[6],payload?.[7],payload?.[8],payload?.[9]);
    if(a==="binance_24h")return market(cfg,payload.lastPrice,payload.volume,payload.highPrice,payload.lowPrice);
    if(a==="bitflyer")return market(cfg,payload.ltp,payload.volume_by_product);
    if(a==="coincheck")return market(cfg,payload.last,payload.volume,payload.high,payload.low);
    if(a==="upbit"){const r=payload?.[0]||{};return market(cfg,r.trade_price,r.acc_trade_volume_24h,r.high_price,r.low_price)}
    if(a==="bithumb"){const r=payload?.data||{};return market(cfg,r.closing_price,r.units_traded_24H,r.max_price,r.min_price)}
    if(a==="btcmarkets")return market(cfg,payload.lastPrice,payload.volume24h,payload.high24h,payload.low24h);
    if(a==="independent_reserve")return market(cfg,payload.LastPrice,payload.DayVolumeXbt,payload.DayHighestPrice,payload.DayLowestPrice);
    if(a==="bitso"){const r=payload?.payload||{};return market(cfg,r.last,r.volume,r.high,r.low)}
    if(a==="btcturk"){const r=payload?.data?.[0]||{};return market(cfg,r.last,r.volume,r.high,r.low)}
    if(a==="bitkub"){const r=Object.values(payload||{})[0]||{};return market(cfg,r.last,r.baseVolume,r.high24hr,r.low24hr)}
    if(a==="indodax"){const r=payload?.ticker||{};return market(cfg,r.last,r.vol_btc,r.high,r.low)}
    if(a==="luno")return market(cfg,payload.last_trade,payload.rolling_24_hour_volume);
    if(a==="valr")return market(cfg,payload.lastTradedPrice,payload.baseVolume,payload.highPrice,payload.lowPrice);
    if(a==="cexio")return market(cfg,payload.last,payload.volume,payload.high,payload.low);
    if(a==="mercado_bitcoin"){const r=payload?.ticker||{};return market(cfg,r.last,r.vol,r.high,r.low)}
    if(a==="whitebit"){const r=Object.values(payload||{})[0]||payload||{};return market(cfg,r.last_price,r.base_volume||r.volume,r.high,r.low)}
    if(a==="bitbank"){const r=payload?.data||payload||{};return market(cfg,r.last,r.vol,r.high,r.low)}
    if(a==="zaif")return market(cfg,payload.last,payload.volume,payload.high,payload.low);
    if(a==="gmo_coin"){const r=payload?.data?.[0]||{};return market(cfg,r.last,r.volume,r.high,r.low)}
    if(a==="coinone"){const rows=payload?.tickers||payload?.ticker||payload?.data||[];const r=Array.isArray(rows)?rows[0]||{}:rows;return market(cfg,value(r,"last","last_price","close"),value(r,"target_volume","volume","yesterday_last_volume"),value(r,"high","high_price"),value(r,"low","low_price"))}
    if(a==="korbit")return market(cfg,payload.last,payload.volume,payload.high,payload.low);
    if(a==="buda"){const r=payload?.ticker||{};const last=Array.isArray(r.last_price)?r.last_price[0]:r.last_price;const vol=Array.isArray(r.volume)?r.volume[0]:r.volume;return market(cfg,last,vol)}
    if(a==="bitvavo"){const r=Array.isArray(payload)?payload[0]||{}:payload||{};return market(cfg,r.last,r.volume,r.high,r.low)}
    if(a==="paymium")return market(cfg,value(payload,"price","last","midpoint","vwap"),payload.volume,payload.high,payload.low);
    if(a==="max_exchange"){const r=payload?.ticker||payload||{};return market(cfg,r.last,r.volume,r.high,r.low)}
    if(a==="bitopro"){const r=payload?.data||payload||{};return market(cfg,value(r,"lastPrice","last_price","last"),value(r,"volume24hr","volume24h","volume"),value(r,"high24hr","high24h","high"),value(r,"low24hr","low24h","low"))}
    if(a==="novadax"){const rows=payload?.data||[];const r=rows.find(x=>String(x?.symbol||"").replace("_","").toUpperCase()==="BTCBRL")||rows[0]||{};return market(cfg,value(r,"lastPrice","last_price","last"),value(r,"amount24h","baseVolume","volume"),value(r,"high24h","high"),value(r,"low24h","low"))}
    if(a==="coindcx"){const rows=Array.isArray(payload)?payload:payload?.data||[];const r=rows.find(x=>String(x?.market||x?.symbol||"").replaceAll("_","").toUpperCase()==="BTCINR")||{};return market(cfg,value(r,"last_price","lastPrice","last"),value(r,"volume","base_volume","baseVolume"),value(r,"high","high24h"),value(r,"low","low24h"))}
    if(a==="coins_ph")return market(cfg,value(payload,"lastPrice","last_price","last"),value(payload,"volume","baseVolume","base_volume"),value(payload,"highPrice","high24h","high"),value(payload,"lowPrice","low24h","low"));
    throw new Error(`unsupported adapter ${a}`);
  }

  function normalize(row){
    const q=row.quote;
    const rate=q==="USD"?1:positive(state.fx[q]);
    if(!Number.isFinite(rate))throw new Error(`missing FX ${q}`);
    const usd=row.native_price/rate;
    if(!(Number.isFinite(usd)&&usd>0))throw new Error(`invalid USD price ${q}`);
    row.price_usd=usd;
    const hi=positive(row.high_24h_native),lo=positive(row.low_24h_native);
    row.high_24h_usd=Number.isFinite(hi)?hi/rate:usd;
    row.low_24h_usd=Number.isFinite(lo)?lo/rate:usd;
    row.updated_at=new Date().toISOString();
    return row;
  }


  const PRICE_BAND_MIN_PCT=7.5;
  const PRICE_BAND_MAX_PCT=20;
  const PRICE_MAD_MULTIPLIER=8;
  const VOLUME_MEDIAN_MULTIPLIER=100;
  const VOLUME_FLOOR_BTC=100000;
  const VOLUME_HARD_CEILING_BTC=1000000;

  function median(values){
    const rows=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!rows.length)return NaN;
    const mid=Math.floor(rows.length/2);
    return rows.length%2?rows[mid]:(rows[mid-1]+rows[mid])/2;
  }

  function sanity(rows){
    const prices=rows.map(r=>positive(r.price_usd)).filter(Number.isFinite);
    const center=median(prices);
    if(!Number.isFinite(center))return {accepted:[],quarantined:[],center:NaN,madPct:NaN,bandPct:NaN,medianVolume:NaN,volumeLimit:VOLUME_FLOOR_BTC};

    const deviations=prices.map(p=>Math.abs(p-center));
    const mad=median(deviations);
    const madPct=prices.length>=3&&Number.isFinite(mad)&&center>0?mad/center*100:0;
    const bandPct=prices.length<3
      ? PRICE_BAND_MAX_PCT
      : Math.min(PRICE_BAND_MAX_PCT,Math.max(PRICE_BAND_MIN_PCT,PRICE_MAD_MULTIPLIER*madPct));

    const plausibleVolumes=[];
    for(const row of rows){
      const price=positive(row.price_usd);
      if(!Number.isFinite(price))continue;
      const dev=Math.abs(price-center)/center*100;
      if(dev<=bandPct){
        const vol=positive(row.volume_24h_btc);
        if(Number.isFinite(vol))plausibleVolumes.push(vol);
      }
    }

    const medianVolume=median(plausibleVolumes);
    const volumeLimit=Math.min(
      VOLUME_HARD_CEILING_BTC,
      Math.max(
        VOLUME_FLOOR_BTC,
        Number.isFinite(medianVolume)?medianVolume*VOLUME_MEDIAN_MULTIPLIER:VOLUME_FLOOR_BTC
      )
    );

    const accepted=[],quarantined=[];
    for(const source of rows){
      const row={...source};
      const price=positive(row.price_usd);
      const volume=nonnegative(row.volume_24h_btc);
      const reasons=[];
      let deviation=NaN;

      if(!Number.isFinite(price))reasons.push("invalid_price");
      else{
        deviation=(price-center)/center*100;
        if(Math.abs(deviation)>bandPct)reasons.push("price_consensus_outlier");
      }

      if(!Number.isFinite(volume))reasons.push("invalid_volume");
      else if(volume>volumeLimit)reasons.push("volume_outlier");

      row.consensus_price_usd=center;
      row.consensus_deviation_pct=Number.isFinite(deviation)?deviation:null;
      row.consensus_price_band_pct=bandPct;
      row.volume_sanity_limit_btc=volumeLimit;
      row.index_eligible=!reasons.length;
      row.exclusion_reason=reasons.length?reasons.join(","):null;
      row.weight=0;

      (reasons.length?quarantined:accepted).push(row);
    }

    return {accepted,quarantined,center,madPct,bandPct,medianVolume,volumeLimit};
  }

  function calc(rows){
    const weighted=rows.filter(r=>positive(r.price_usd)>0&&positive(r.volume_24h_btc)>0);
    const total=weighted.reduce((a,r)=>a+r.volume_24h_btc,0);
    if(weighted.length&&total>0){
      const price=weighted.reduce((a,r)=>a+r.price_usd*r.volume_24h_btc,0)/total;
      const high=weighted.reduce((a,r)=>a+(Number.isFinite(r.high_24h_usd)?r.high_24h_usd:r.price_usd)*r.volume_24h_btc,0)/total;
      const low=weighted.reduce((a,r)=>a+(Number.isFinite(r.low_24h_usd)?r.low_24h_usd:r.price_usd)*r.volume_24h_btc,0)/total;
      return {price,volume:total,weighted:weighted.length,high,low};
    }
    const valid=rows.filter(r=>positive(r.price_usd)>0);
    if(!valid.length)return {price:NaN,volume:0,weighted:0,high:NaN,low:NaN};
    return {
      price:valid.reduce((a,r)=>a+r.price_usd,0)/valid.length,volume:0,weighted:0,
      high:valid.reduce((a,r)=>a+(Number.isFinite(r.high_24h_usd)?r.high_24h_usd:r.price_usd),0)/valid.length,
      low:valid.reduce((a,r)=>a+(Number.isFinite(r.low_24h_usd)?r.low_24h_usd:r.price_usd),0)/valid.length
    };
  }

  function pushHistory(source,price,volume){
    if(!(Number.isFinite(price)&&price>0))return;
    const list=state.history.get(source)||[];
    const prev=list.at(-1)?.price;
    const change=Number.isFinite(prev)?price-prev:null;
    list.push({t:Date.now(),open:price,high:price,low:price,close:price,price,volume_24h_btc:Number.isFinite(volume)?volume:null,change,change_pct:Number.isFinite(prev)&&prev!==0?change/prev*100:null});
    const max=(source==="bpi"||source==="global-bpi")?34560:7200;
    if(list.length>max)list.splice(0,list.length-max);
    state.history.set(source,list);
  }

  function publish(){
    const rows=[...state.markets.values()].filter(r=>Date.now()-new Date(r.updated_at).getTime()<30_000);
    const cfg=state.config?.exchanges?.sources||{};

    const checked=sanity(rows);
    const accepted=checked.accepted;
    const quarantined=checked.quarantined;

    if(accepted.length<2)return;

    const policyAllowed=accepted.filter(r=>{
      const policy=cfg?.[r.exchange]||{};
      const status=String(policy.status||"");
      return policy.enabled!==false&&!status.startsWith("quarantined-");
    });

    const core=policyAllowed.filter(r=>cfg?.[r.exchange]?.include_in_bpi===true);
    const coreIndex=calc(core.length?core:policyAllowed);
    const globalIndex=calc(policyAllowed);

    if(!Number.isFinite(globalIndex.price)&&!Number.isFinite(coreIndex.price))return;

    for(const r of quarantined){
      const prev=state.health.get(r.exchange)||{};
      state.health.set(r.exchange,{
        ...prev,
        ok:true,
        index_eligible:false,
        quarantined:true,
        exclusion_reason:r.exclusion_reason,
        consensus_deviation_pct:r.consensus_deviation_pct,
        updated_at:new Date().toISOString()
      });
    }

    const acceptedByExchange=new Map(accepted.map(r=>[r.exchange,r]));
    const exchanges={};

    for(const raw of rows){
      const acceptedRow=acceptedByExchange.get(raw.exchange);
      const isEligible=!!acceptedRow && policyAllowed.some(r=>r.exchange===raw.exchange);
      exchanges[raw.exchange]={
        label:raw.label,
        price_usd:isEligible?raw.price_usd:null,
        raw_price_usd:raw.price_usd,
        quote:raw.quote,
        fiat_quotes:[raw.quote],
        market_count:1,
        eligible_market_count:isEligible?1:0,
        volume_24h_btc:isEligible?raw.volume_24h_btc:0,
        raw_volume_24h_btc:raw.volume_24h_btc,
        high_24h:isEligible?raw.high_24h_usd:null,
        low_24h:isEligible?raw.low_24h_usd:null,
        index_eligible:isEligible,
        exclusion_reason:acceptedRow
          ? (isEligible?null:"registry_quarantine")
          : quarantined.find(r=>r.exchange===raw.exchange)?.exclusion_reason||"consensus_rejected",
        updated_at:raw.updated_at,
        mode:"browser-live-btc-fiat-sanity"
      };
      if(isEligible)pushHistory(raw.exchange,raw.price_usd,raw.volume_24h_btc);
    }

    const now=new Date().toISOString();
    const latest={
      schema:"zzx-bpi-browser-live-v3-sanity",updated_at:now,mode:"browser-live",
      price_usd:Number.isFinite(coreIndex.price)?coreIndex.price:globalIndex.price,
      bpi_usd:Number.isFinite(coreIndex.price)?coreIndex.price:globalIndex.price,
      volume_24h_btc:coreIndex.volume,
      high_24h:coreIndex.high,low_24h:coreIndex.low,
      bpi_exchange_count:(core.length||policyAllowed.length),
      quarantined_exchange_count:rows.length-policyAllowed.length,
      sanity:{
        consensus_price_usd:checked.center,
        median_absolute_deviation_pct:checked.madPct,
        price_band_pct:checked.bandPct,
        median_positive_volume_btc:checked.medianVolume,
        volume_limit_btc:checked.volumeLimit
      },
      global_bpi:{
        price_usd:globalIndex.price,
        volume_24h_btc:globalIndex.volume,
        high_24h:globalIndex.high,
        low_24h:globalIndex.low,
        market_count:policyAllowed.length,
        quarantined_market_count:rows.length-policyAllowed.length,
        method:"browser-live-consensus-gated-volume-weighted-btc-fiat"
      },
      global_bpi_usd:globalIndex.price,
      exchanges
    };
    pushHistory("bpi",latest.price_usd,latest.volume_24h_btc);
    pushHistory("global-bpi",globalIndex.price,globalIndex.volume);
    state.snapshot=latest;
    W.ZZXLiveBPISnapshot=latest;
    try{W.dispatchEvent(new CustomEvent("zzx:live-bpi",{detail:latest}))}catch(_){}
  }

  async function loadConfig(force=false){
    const now=Date.now();
    if(!force&&state.config&&now-state.configAt<CONFIG_TTL_MS)return state.config;
    const [providers,exchanges]=await Promise.all([
      fetchJSON("/bitcoin/bpi/api/provider_urls.json"),
      fetchJSON("/bitcoin/bpi/api/exchanges.json")
    ]);
    state.config={providers:providers?.providers||{},exchanges:exchanges||{}};
    state.configAt=now;
    return state.config;
  }

  async function loadFx(force=false){
    const now=Date.now();
    if(!force&&state.fxAt&&now-state.fxAt<FX_TTL_MS)return;
    const data=await fetchJSON("/bitcoin/bpi/api/exchange_rates.json");
    const fx={USD:1};
    for(const [code,v] of Object.entries(data?.rates||{})){const n=positive(v);if(Number.isFinite(n))fx[String(code).toUpperCase()]=n}
    state.fx=fx;state.fxAt=now;
  }

  async function pollOne(cfg){
    const started=performance.now();
    try{
      const payload=await fetchExternal(cfg.price_volume_url);
      const row=normalize(parse(cfg,payload));
      state.markets.set(cfg.id,row);
      state.health.set(cfg.id,{ok:true,elapsed_ms:performance.now()-started,updated_at:row.updated_at});
    }catch(error){
      state.health.set(cfg.id,{ok:false,error:String(error?.message||error),elapsed_ms:performance.now()-started,updated_at:new Date().toISOString()});
    }
  }

  async function cycle(){
    if(state.busy)return;
    state.busy=true;
    try{
      await Promise.all([loadConfig(false),loadFx(false)]);
      const now=Date.now();
      const due=[];
      for(const cfg of Object.values(state.config.providers||{})){
        if(!cfg?.enabled_poll||cfg?.browser_enabled===false||!cfg?.adapter||!cfg?.price_volume_url)continue;
        const next=state.due.get(cfg.id)||0;
        if(now<next)continue;
        state.due.set(cfg.id,now+Math.max(CYCLE_MS,Number(cfg.poll_interval_ms)||CYCLE_MS));
        due.push(pollOne(cfg));
      }
      await Promise.allSettled(due);
      publish();
    }finally{state.busy=false}
  }

  async function start(){
    if(state.running)return state.snapshot;
    state.running=true;
    await cycle();
    async function loop(){if(!state.running)return;await cycle();state.timer=W.setTimeout(loop,CYCLE_MS)}
    state.timer=W.setTimeout(loop,CYCLE_MS);
    return state.snapshot;
  }
  function stop(){state.running=false;if(state.timer)W.clearTimeout(state.timer);state.timer=null}
  function snapshot(){return state.snapshot}
  function history(source="global-bpi",from=null,to=null){
    let rows=[...(state.history.get(source)||[])];
    if(from!=null)rows=rows.filter(p=>p.t>=Number(from));
    if(to!=null)rows=rows.filter(p=>p.t<=Number(to));
    return rows;
  }
  function health(){return Object.fromEntries(state.health)}
  function markets(){return [...state.markets.values()].map(row=>({...row}))}

  W.ZZXLiveBPI=Object.freeze({__version:4,start,stop,cycle,snapshot,history,health,markets,sanity});
})();
