(function(){
  "use strict";
  const W=window;
  if(W.ZZXFX?.__version>=5)return;

  const cache={rates:null,currencies:null,latest:null,at:0};
  const TTL=30000;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const url=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;

  async function json(path){
    if(W.ZZXAPI?.jsonStrict)return await W.ZZXAPI.jsonStrict(url(path),{cacheBust:true,timeoutMs:8000,retries:1});
    const r=await fetch(url(path),{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function load(force=false){
    if(!force&&cache.rates&&Date.now()-cache.at<TTL)return cache;
    const [rates,currencies,latest]=await Promise.all([
      json("/bitcoin/bpi/api/exchange_rates.json"),
      json("/bitcoin/bpi/api/currencies.json"),
      json("/bitcoin/bpi/api/latest.json")
    ]);
    cache.rates=rates;cache.currencies=currencies;cache.latest=latest;cache.at=Date.now();
    return cache;
  }

  async function rate(code){
    const c=String(code||"USD").toUpperCase();
    const data=await load(false);
    const n=finite(data.rates?.rates?.[c]);
    if(!(n>0))throw new Error(`FX rate unavailable for ${c}`);
    return {rate:n,provider:"ZZX local FX mirror",updated_at:data.rates?.updated_at||null};
  }

  async function liveRate(code){return await rate(code)}

  async function convert(value,from,to){
    const n=finite(value);
    if(!Number.isFinite(n))return NaN;
    const a=await rate(from),b=await rate(to);
    return n/a.rate*b.rate;
  }

  async function catalog(){
    const data=await load(false);
    return data.currencies;
  }

  async function btcPriceUsd(){
    const data=await load(true);
    const p=finite(
      W.ZZXBPISelection?.priceUsd ??
      data.latest?.price_usd ??
      data.latest?.bpi_usd ??
      data.latest?.global_bpi?.price_usd
    );
    if(!(p>0))throw new Error("BTC/USD unavailable");
    return p;
  }

  W.ZZXFX=Object.freeze({__version:5,load,rate,liveRate,convert,catalog,btcPriceUsd});
})();
