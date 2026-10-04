// __partials/widgets/_shared/zzx-price.js
// Canonical site-wide BTC/USD price contract.
//
// Exactly three presentation modes are supported:
//   off        -> Raw / unweighted BitAvg price
//   bpi        -> BPI weighted price
//   global-bpi -> Global BPI weighted price
//
// BitAvg publishes the authoritative three-price set.  Every widget should
// read the active quote from this module instead of independently choosing a
// price from latest.json.  A latest.json-derived fallback exists only for the
// short interval before BitAvg has published its first observation.
(function(){
  "use strict";

  const W=window;
  if(W.ZZXPrice?.__version>=1)return;

  const MODE_KEY="zzx.bpi.weighting.mode.v2";
  const MODES=new Set(["off","bpi","global-bpi"]);
  let authoritative=null;
  let current=null;

  const finite=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  };
  const positive=value=>{
    const n=finite(value);
    return n>0?n:NaN;
  };

  function mode(){
    const controlled=W.ZZXBPIWeightingController?.getMode?.();
    if(MODES.has(controlled))return controlled;

    const published=W.ZZXBPIWeighting?.mode;
    if(MODES.has(published))return published;

    try{
      const stored=W.localStorage.getItem(MODE_KEY);
      if(MODES.has(stored))return stored;
    }catch(_){}

    return "off";
  }

  function labelFor(value){
    if(value==="bpi")return "BPI Weighted";
    if(value==="global-bpi")return "Global BPI Weighted";
    return "Unweighted";
  }

  function nativeRegion(latest){
    const candidate=String(
      latest?.native_region ??
      latest?.bpi_country ??
      latest?.default_country ??
      "US"
    ).toUpperCase();
    return /^[A-Z]{2,8}$/.test(candidate)?candidate:"US";
  }

  function fromLatest(latest){
    if(!latest||typeof latest!=="object")return null;

    const region=nativeRegion(latest);
    const native=latest?.national_bpi?.[region]||{};
    const global=latest?.global_bpi||{};

    const raw=positive(
      global?.unweighted_price_usd ??
      latest?.weighted_average?.unweighted_price_usd ??
      latest?.unweighted_price_usd ??
      latest?.price_usd ??
      latest?.bpi_usd
    );
    const bpiWeighted=positive(
      native?.weighted_price_usd ??
      latest?.weighted_average?.price_usd ??
      latest?.weighted_average?.vwap_usd ??
      latest?.price_usd ??
      latest?.bpi_usd
    );
    const globalWeighted=positive(
      global?.weighted_price_usd ??
      global?.price_usd ??
      latest?.global_bpi_usd ??
      latest?.price_usd ??
      latest?.bpi_usd
    );

    if(![raw,bpiWeighted,globalWeighted].some(Number.isFinite))return null;

    return {
      raw_price_usd:raw,
      unweighted_price_usd:raw,
      bpi_weighted_price_usd:bpiWeighted,
      global_bpi_weighted_price_usd:globalWeighted,
      observed_at:
        latest?.observed_at ??
        latest?.updated_at ??
        latest?.generated_at ??
        null,
      source_updated_at:
        latest?.source_updated_at ??
        latest?.updated_at ??
        null,
      provider:"latest-fallback",
      authoritative:false,
      region
    };
  }

  function normalizeSet(input){
    if(!input||typeof input!=="object")return null;

    const raw=positive(
      input.raw_price_usd ??
      input.unweighted_price_usd ??
      input.rawUsd ??
      input.unweightedUsd
    );
    const bpiWeighted=positive(
      input.bpi_weighted_price_usd ??
      input.bpiWeightedUsd
    );
    const globalWeighted=positive(
      input.global_bpi_weighted_price_usd ??
      input.globalBpiWeightedUsd ??
      input.weighted_price_usd
    );

    if(![raw,bpiWeighted,globalWeighted].some(Number.isFinite))return null;

    return Object.freeze({
      raw_price_usd:raw,
      unweighted_price_usd:raw,
      bpi_weighted_price_usd:bpiWeighted,
      global_bpi_weighted_price_usd:globalWeighted,
      observed_at:input.observed_at??input.updated_at??null,
      source_updated_at:input.source_updated_at??null,
      provider:String(input.provider||"bitavg"),
      transport:String(input.transport||""),
      stale:!!input.stale,
      authoritative:input.authoritative!==false,
      region:String(input.region||input.native_region||"US").toUpperCase()
    });
  }

  function activate(set,selectedMode=mode()){
    if(!set)return null;
    const m=MODES.has(selectedMode)?selectedMode:"off";
    const raw=positive(set.raw_price_usd);
    const bpi=positive(set.bpi_weighted_price_usd);
    const global=positive(set.global_bpi_weighted_price_usd);

    let price=m==="bpi"?bpi:m==="global-bpi"?global:raw;
    if(!Number.isFinite(price)){
      price=[raw,bpi,global].find(Number.isFinite);
    }
    if(!Number.isFinite(price))return null;

    return Object.freeze({
      provider:String(set.provider||"bitavg"),
      mode:m,
      label:labelFor(m),
      price_usd:price,
      priceUsd:price,
      raw_price_usd:raw,
      unweighted_price_usd:raw,
      bpi_weighted_price_usd:bpi,
      global_bpi_weighted_price_usd:global,
      observed_at:set.observed_at||null,
      source_updated_at:set.source_updated_at||null,
      transport:String(set.transport||""),
      stale:!!set.stale,
      authoritative:set.authoritative!==false,
      region:String(set.region||"US").toUpperCase()
    });
  }

  function expose(active){
    if(!active)return null;
    current=active;
    W.ZZXCanonicalBitcoinPrice=active;
    W.ZZXBitAvgPrice=active;
    W.ZZXSelectedPriceUsd=Number(active.price_usd);

    try{
      W.dispatchEvent(new CustomEvent("zzx:canonical-bitcoin-price",{detail:active}));
    }catch(_){}
    try{
      W.dispatchEvent(new CustomEvent("zzx:bitavg-price",{detail:active}));
    }catch(_){}
    return active;
  }

  function setPriceSet(input){
    const normalized=normalizeSet(input);
    if(!normalized)return null;
    authoritative=normalized;
    return expose(activate(authoritative));
  }

  function currentQuote(latest){
    if(authoritative){
      const active=activate(authoritative);
      if(active){
        if(!current || current.mode!==active.mode || current.price_usd!==active.price_usd){
          expose(active);
        }
        return active;
      }
    }

    const globalCurrent=normalizeSet(W.ZZXCanonicalBitcoinPrice||W.ZZXBitAvgPrice);
    if(globalCurrent){
      const active=activate(globalCurrent);
      if(active)return active;
    }

    const selected=W.ZZXBPISelection||W.ZZXSelectedBPI;
    const selectedPrice=positive(selected?.priceUsd??selected?.price_usd??W.ZZXSelectedPriceUsd);
    if(Number.isFinite(selectedPrice)){
      const m=mode();
      return Object.freeze({
        provider:"ticker-selection",
        mode:m,
        label:labelFor(m),
        price_usd:selectedPrice,
        priceUsd:selectedPrice,
        raw_price_usd:m==="off"?selectedPrice:NaN,
        unweighted_price_usd:m==="off"?selectedPrice:NaN,
        bpi_weighted_price_usd:m==="bpi"?selectedPrice:NaN,
        global_bpi_weighted_price_usd:m==="global-bpi"?selectedPrice:NaN,
        observed_at:selected?.timestamp??selected?.observed_at??null,
        source_updated_at:selected?.sourceTimestamp??selected?.source_updated_at??null,
        transport:"selection",
        stale:false,
        authoritative:false,
        region:String(selected?.region||"US")
      });
    }

    return activate(fromLatest(latest));
  }

  function priceUsd(latest){
    return Number(currentQuote(latest)?.price_usd);
  }

  function priceSet(){
    return authoritative;
  }

  W.addEventListener("zzx:bpi-weighting",()=>{
    if(authoritative)expose(activate(authoritative));
  });

  W.ZZXPrice=Object.freeze({
    __version:1,
    mode,
    labelFor,
    fromLatest,
    setPriceSet,
    current:currentQuote,
    priceUsd,
    priceSet
  });
})();
